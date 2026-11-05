import {readFinance} from './finance-store.ts';
import {withFinance,emptyFinance,type Finance} from './finance-model.ts';
import {logisticsTables} from './logistics-sheets.ts';
import {ensureLogisticsDashboard} from './logistics-sheet-view.ts';
import type {ScmEnv} from './runtime';
import type {Item} from './scm-model';
import {TEST_SHEET_ID} from './sheet-mapping.ts';
import {withSheetWriteLock,writeMergedSheets} from './sheet-writer.ts';
import {broadcastTables,financeTables} from './sheet-sync-tables.ts';
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

type SyncState='sent'|'pending'|'not_configured'|'failed';
export async function syncRecord(env:ScmEnv,id:string):Promise<SyncState>{
 if(!sheetsConfigured(env))return 'not_configured';
 const db=env.DB,lease=crypto.randomUUID(),now=Date.now();
 const acquired=await db.prepare("UPDATE scm_outbox SET lease_token=?,lease_until=? WHERE record_id=? AND state!='sent' AND (lease_until IS NULL OR lease_until<?)").bind(lease,now+120000,id,now).run();
 if(!acquired.meta.changes){const current=await db.prepare('SELECT state FROM scm_outbox WHERE record_id=?').bind(id).first<{state:string}>();return current?.state==='sent'?'sent':'pending';}
 try{
  return await withSheetWriteLock<SyncState>(db,async(locked)=>{
   const record=await locked.prepare('SELECT payload,version FROM scm_records WHERE id=?').bind(id).first<{payload:string;version:number}>();
   if(!record)throw new Error('저장된 방송을 찾을 수 없습니다.');
   const token=await accessToken(env);
   await writeMergedSheets(token,TEST_SHEET_ID,broadcastTables(withFinance(JSON.parse(record.payload) as Item,await readFinance(locked))));
   const finished=await locked.prepare("UPDATE scm_outbox SET state='sent',last_error=NULL WHERE record_id=? AND version=? AND lease_token=?").bind(id,record.version,lease).run();
   return finished.meta.changes?'sent':'pending';
  })??'pending';
 }catch(error){
  const known=error instanceof Error&&/^(Google|저장된)/.test(error.message)?error.message:'Google 연결을 확인한 뒤 다시 전송해 주세요.';
  await db.prepare("UPDATE scm_outbox SET state='failed',last_error=? WHERE record_id=? AND lease_token=?").bind(known,id,lease).run();return 'failed';
 }finally{await db.prepare('UPDATE scm_outbox SET lease_token=NULL,lease_until=NULL WHERE record_id=? AND lease_token=?').bind(id,lease).run();}
}
export async function syncFinance(env:ScmEnv):Promise<SyncState>{
 if(!sheetsConfigured(env))return 'not_configured';
 const db=env.DB,lease=crypto.randomUUID(),now=Date.now();
 const acquired=await db.prepare("UPDATE scm_finance SET lease_token=?,lease_until=? WHERE id=1 AND state!='sent' AND (lease_until IS NULL OR lease_until<?)").bind(lease,now+120000,now).run();
 if(!acquired.meta.changes){const current=await db.prepare('SELECT state FROM scm_finance WHERE id=1').first<{state:string}>();return current?.state==='sent'?'sent':'pending';}
 try{
  return await withSheetWriteLock<SyncState>(db,async(locked)=>{
   const row=await locked.prepare('SELECT payload,version FROM scm_finance WHERE id=1').first<{payload:string;version:number}>();
   if(!row)throw new Error('No finance data');
   await writeMergedSheets(await accessToken(env),TEST_SHEET_ID,financeTables(JSON.parse(row.payload)));
   const done=await locked.prepare("UPDATE scm_finance SET state='sent' WHERE id=1 AND version=? AND lease_token=?").bind(row.version,lease).run();return done.meta.changes?'sent':'pending';
  })??'pending';
 }catch{await db.prepare("UPDATE scm_finance SET state='failed' WHERE id=1 AND lease_token=?").bind(lease).run();return 'failed';}
 finally{await db.prepare('UPDATE scm_finance SET lease_token=NULL,lease_until=NULL WHERE id=1 AND lease_token=?').bind(lease).run();}
}

export async function syncLogistics(env:ScmEnv):Promise<SyncState>{
 if(!sheetsConfigured(env))return 'not_configured';
 const db=env.DB,lease=crypto.randomUUID(),now=Date.now();
 const acquired=await db.prepare("UPDATE scm_sheet_jobs SET lease_token=?,lease_until=? WHERE job_key='logistics' AND state!='sent' AND (lease_until IS NULL OR lease_until<?)").bind(lease,now+300000,now).run();
 if(!acquired.meta.changes){const row=await db.prepare("SELECT state FROM scm_sheet_jobs WHERE job_key='logistics'").first<{state:string}>();return row?.state==='sent'?'sent':'pending';}
 let generation:number|undefined;
 try{
  return await withSheetWriteLock<SyncState>(db,async locked=>{
   // One SQL snapshot binds source broadcasts, master data and queue generation together.
   const source=await locked.prepare("SELECT j.generation,f.payload,f.version AS finance_version,COALESCE((SELECT json_agg(json_build_object('payload',r.payload,'version',r.version)) FROM scm_records r),'[]'::json) AS records FROM scm_sheet_jobs j LEFT JOIN scm_finance f ON f.id=1 WHERE j.job_key='logistics' AND j.lease_token=?").bind(lease).first<{generation:number;payload:string|null;finance_version:number|null;records:{payload:string;version:number}[]}>();
   if(!source)throw new Error('Google 물류 전송 대기열을 확인해 주세요.');
   generation=source.generation;
   const finance:Finance=source.payload?{...JSON.parse(source.payload),version:source.finance_version??0}:emptyFinance();
   const records=source.records.map(r=>({...JSON.parse(r.payload),version:r.version} as Item));
   const token=await accessToken(env);
   await writeMergedSheets(token,TEST_SHEET_ID,logisticsTables(finance,records));
   await ensureLogisticsDashboard(token,TEST_SHEET_ID);
   const done=await locked.prepare("UPDATE scm_sheet_jobs SET state='sent',last_error=NULL WHERE job_key='logistics' AND generation=? AND lease_token=?").bind(generation,lease).run();
   return done.meta.changes?'sent':'pending';
  })??'pending';
 }catch(error){
  const message=error instanceof Error&&error.message.startsWith('Google ')?error.message:'물류 원데이터 전송에 실패했습니다. 자료를 확인한 뒤 다시 전송하세요.';
  if(generation!==undefined)await db.prepare("UPDATE scm_sheet_jobs SET state='failed',last_error=? WHERE job_key='logistics' AND generation=? AND lease_token=?").bind(message,generation,lease).run();
  return 'failed';
 }finally{await db.prepare("UPDATE scm_sheet_jobs SET lease_token=NULL,lease_until=NULL WHERE job_key='logistics' AND lease_token=?").bind(lease).run();}
}
