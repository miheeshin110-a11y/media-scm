import {after} from 'next/server';
import {deferSheetSync} from '@/lib/sheet-sync-queue';
import {salesCompositionChoices} from '@/lib/sales-compositions';
import {resolveBroadcastCosts,CostHistoryError} from '@/lib/cost-history';
import {automaticProductCost} from '@/lib/automatic-product-cost';
import {automaticGiftCost} from '@/lib/automatic-gift-cost';
import {readSyncSnapshot} from '@/lib/sync-status';
import {broadcastClockIssues,usesActualClock} from '@/lib/broadcast-clock';
import {authenticated} from '@/lib/runtime';
import {runtime,identity,checkWrite,readable,editable,reviewer} from '@/lib/runtime';
import {validateWorkflow,computedItem,initializeShipping} from '@/lib/workflow';
import {saveRecord,SaveConflict} from '@/lib/record-store';
import {seedRecords} from '@/lib/seed-records';
import {validateItem,unifiedResult,type Item} from '@/lib/scm-model';
import {sheetsConfigured} from '@/lib/google-sync';
import {readFinance} from '@/lib/finance-store';
import {withFinance} from '@/lib/finance-model';
export const dynamic='force-dynamic';
export const maxDuration=300;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function handleGET(request:Request){
  if(!readable(request))return json({error:'로그인이 필요합니다.'},401);
  const env=runtime(),db=env.DB.withSession('first-primary');
  const historyId=new URL(request.url).searchParams.get('history');
  if(historyId){if(!editable(request))return json({error:'관리자만 변경 이력을 볼 수 있습니다.'},403);const history=await db.prepare('SELECT version,actor,created_at,before_payload,after_payload FROM scm_revisions WHERE record_id=? ORDER BY version DESC LIMIT 20').bind(historyId).all();return json({history:history.results});}
  const [saved,finance,syncSnapshot,resetState]=await Promise.all([
    db.prepare('SELECT r.payload,o.state FROM scm_records r LEFT JOIN scm_outbox o ON o.record_id=r.id ORDER BY r.row_id LIMIT 2000').all<{payload:string;state:string}>(),
    readFinance(db),readSyncSnapshot(db),db.prepare("SELECT request_id FROM scm_finance_revisions WHERE request_id LIKE 'test-reset-%' LIMIT 1").first(),
  ]);
  const merged=new Map((resetState?[]:seedRecords).map(item=>[item.id,item]));for(const row of saved.results){const item=JSON.parse(row.payload) as Item;item.sync=row.state==='sent'?'완료':'대기';merged.set(item.id,item);}
  const readOnly=!editable(request);
  return json({syncSnapshot,finance,readOnly,canReview:reviewer(request),items:[...merged.values()].map(x=>{const row=withFinance(x,finance);if(readOnly){delete row.updatedBy;delete row.reviewedBy;}return row;}).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)),sheetsConfigured:sheetsConfigured(env),storage:'server',actor:identity(request)});
}
async function handlePOST(request:Request){
  const denied=checkWrite(request);if(denied)return denied;
  try{
    const raw=await request.text();if(raw.length>60000)return json({error:'입력 내용이 너무 큽니다.'},413);
    const {record:inputRecord,baseVersion,requestId}=JSON.parse(raw) as {record:Item;baseVersion:number;requestId:string};
    let record=inputRecord;
    if(!Number.isSafeInteger(baseVersion)||baseVersion<0||typeof requestId!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(requestId))return json({error:'저장 요청 형식이 올바르지 않습니다.'},400);
    const db=runtime().DB.withSession('first-primary');
    const currentFinance=await readFinance(db);
    if(record?.financeVersion!==currentFinance.version)return json({error:'계약·배분 정보가 변경됐습니다. 최신 자료를 불러온 후 저장해 주세요.'},409);
    const original=JSON.stringify({record,baseVersion});
    const previous=await db.prepare('SELECT payload FROM scm_records WHERE id=?').bind(record.id).first<{payload:string}>();
    const old:Item|undefined=previous?JSON.parse(previous.payload):seedRecords.find(x=>x.id===record.id);
    record=initializeShipping(record,old);
    const clockErrors=broadcastClockIssues(record,old);if(clockErrors.length)return json({error:clockErrors.join(' ')},400);
    if(usesActualClock(old))record={...record,dateConvention:'actual'};
    if(!reviewer(request)){
      if(record.workflow==='검토 완료'&&old?.workflow!=='검토 완료')return json({error:'팀장만 검토를 완료할 수 있습니다.'},403);
      if(record.workflow==='보완 요청'&&old?.workflow!=='보완 요청')return json({error:'팀장만 보완을 요청할 수 있습니다.'},403);
      if(record.reviewNote!==old?.reviewNote&&record.reviewNote)return json({error:'검토 메모는 팀장이 작성합니다.'},403);
      record.reviewNote=old?.reviewNote;
      if(old?.workflow==='검토 완료')record.workflow='작성 중';
    }
    record={...record,shortItem:record.item,reviewedBy:old?.reviewedBy,reviewedAt:old?.reviewedAt};
    if(record.workflow==='검토 완료'){record.reviewedBy=identity(request)!;record.reviewedAt=new Date().toISOString();}
    else {delete record.reviewedBy;delete record.reviewedAt;}
    if(record.replacesId){const replaced=await db.prepare('SELECT payload FROM scm_records WHERE id=?').bind(record.replacesId).first<{payload:string}>();const target:Item|undefined=replaced?JSON.parse(replaced.payload):seedRecords.find(x=>x.id===record.replacesId);if(!target||target.status!=='취소')return json({error:'취소된 원래 방송을 선택해 주세요.'},400);}
    record=resolveBroadcastCosts(automaticGiftCost(automaticProductCost(record,old,currentFinance),old,currentFinance),old,currentFinance);
    record=withFinance(record,currentFinance);
    if(record?.result)record.result=unifiedResult(record.result);
    const errors=[...validateItem(record),...validateWorkflow(record)];if(errors.length)return json({error:errors.join(' ')},400);
    if(record.compositions){
      const options=salesCompositionChoices(currentFinance);
      for(const side of ['single','double'] as const){
        const c=record.compositions[side],option=options.find(x=>x.code===c.sku);
        if(c.sku.startsWith('custom:')&&!option)return json({error:'판매 구성을 목록에서 다시 선택해 주세요.'},400);
        record.compositions[side]={...c,compositionName:option?.name||''};
      }
    }
    record=computedItem(record);
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(original));
    const hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    const env=runtime(),saved=await saveRecord(env.DB.withSession('first-primary'),record,baseVersion,requestId,identity(request)!,hash,currentFinance.version);
    const syncSnapshot=await readSyncSnapshot(env.DB);
    const sync=!sheetsConfigured(env)?'not_configured':syncSnapshot.records[saved.id]?.state||'pending';
    deferSheetSync(after,env);
    return json({record:{...saved,sync:sync==='sent'?'완료':'대기'},sync,syncSnapshot});
  }catch(error){if(error instanceof SaveConflict)return json({error:error.message},409);if(error instanceof CostHistoryError)return json({error:error.message},400);if(error instanceof SyntaxError||error instanceof TypeError)return json({error:'입력 형식이 올바르지 않습니다.'},400);return json({error:'저장하지 못했습니다. 입력 내용은 화면에 유지됩니다. 다시 시도해 주세요.'},500);}
}

export const GET=authenticated(handleGET);

export const POST=authenticated(handlePOST);

