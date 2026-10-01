import {readFinance} from './finance-store';
import {withFinance} from './finance-model';
import {financeSheetRows} from './finance-sheets';
import type {ScmEnv} from './runtime';
import type {Item} from './scm-model';
import {sheetRows,TEST_SHEET_ID} from './sheet-mapping';
import {ensureSheetRanges} from './sheet-setup';
export function sheetsConfigured(env:ScmEnv){return Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);}
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const encode=(value:unknown)=>b64(new TextEncoder().encode(JSON.stringify(value)));
async function accessToken(env:ScmEnv){
  const now=Math.floor(Date.now()/1000),unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:env.GOOGLE_SERVICE_ACCOUNT_EMAIL,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const pem=env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g,'\n').replace(/-----[^-]+-----/g,'').replace(/\s/g,'');
  const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned));
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+b64(new Uint8Array(signature))}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Google 계정 인증 실패 ('+response.status+')');
  const data=await response.json() as {access_token?:string};if(!data.access_token)throw new Error('Google 인증 응답을 확인할 수 없습니다.');return data.access_token;
}
export async function syncRecord(env:ScmEnv,id:string):Promise<'sent'|'pending'|'not_configured'|'failed'>{
  if(!sheetsConfigured(env))return 'not_configured';
  const db=env.DB.withSession('first-primary'),lease=crypto.randomUUID(),now=Date.now();
  const acquired=await db.prepare("UPDATE scm_outbox SET lease_token=?,lease_until=? WHERE record_id=? AND state!='sent' AND (lease_until IS NULL OR lease_until<?)").bind(lease,now+120000,id,now).run();
  if(!acquired.meta.changes){const current=await db.prepare('SELECT state FROM scm_outbox WHERE record_id=?').bind(id).first<{state:string}>();return current?.state==='sent'?'sent':'pending';}
  try{
    const record=await db.prepare('SELECT row_id,payload,version FROM scm_records WHERE id=?').bind(id).first<{row_id:number;payload:string;version:number}>();
    if(!record)throw new Error('저장된 방송을 찾을 수 없습니다.');
    const token=await accessToken(env);
    const data=sheetRows(withFinance(JSON.parse(record.payload) as Item,await readFinance(db)),record.row_id),headers=await ensureSheetRanges(token,TEST_SHEET_ID,data);
    const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+TEST_SHEET_ID+'/values:batchUpdate',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'RAW',data:[...headers,...data]}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Google 시트 반영 실패 ('+response.status+')');
    const finished=await db.prepare("UPDATE scm_outbox SET state='sent',last_error=NULL,lease_token=NULL,lease_until=NULL WHERE record_id=? AND version=? AND lease_token=?").bind(id,record.version,lease).run();
    if(finished.meta.changes)return 'sent';
    await db.prepare('UPDATE scm_outbox SET lease_token=NULL,lease_until=NULL WHERE record_id=? AND lease_token=?').bind(id,lease).run();return 'pending';
  }catch(error){
    const known=error instanceof Error&&/^(Google|저장된)/.test(error.message)?error.message:'Google 연결을 확인한 뒤 다시 전송해 주세요.';
    await db.prepare("UPDATE scm_outbox SET state='failed',last_error=?,lease_token=NULL,lease_until=NULL WHERE record_id=? AND lease_token=?").bind(known,id,lease).run();return 'failed';
  }
}

export async function syncFinance(env:ScmEnv):Promise<'sent'|'pending'|'not_configured'|'failed'>{
 if(!sheetsConfigured(env))return 'not_configured';
 const db=env.DB.withSession('first-primary'),lease=crypto.randomUUID(),now=Date.now();
 const acquired=await db.prepare("UPDATE scm_finance SET lease_token=?,lease_until=? WHERE id=1 AND state!='sent' AND (lease_until IS NULL OR lease_until<?)").bind(lease,now+120000,now).run();
 if(!acquired.meta.changes)return 'pending';
 try{const row=await db.prepare('SELECT payload,version FROM scm_finance WHERE id=1').first<{payload:string;version:number}>();if(!row)throw new Error('No finance data');
 const token=await accessToken(env);const data=financeSheetRows(JSON.parse(row.payload));await ensureSheetRanges(token,TEST_SHEET_ID,data);const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+TEST_SHEET_ID+'/values:batchUpdate',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'RAW',data}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Google sync failed');
 const done=await db.prepare("UPDATE scm_finance SET state='sent',lease_token=NULL,lease_until=NULL WHERE id=1 AND version=? AND lease_token=?").bind(row.version,lease).run();
 if(done.meta.changes)return 'sent';await db.prepare('UPDATE scm_finance SET lease_token=NULL,lease_until=NULL WHERE id=1 AND lease_token=?').bind(lease).run();return 'pending';
 }catch{await db.prepare("UPDATE scm_finance SET state='failed',lease_token=NULL,lease_until=NULL WHERE id=1 AND lease_token=?").bind(lease).run();return 'failed';}
}
