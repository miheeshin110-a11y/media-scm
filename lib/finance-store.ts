import {existingPplContracts} from './ppl-duplicates.ts';
import {isCatalogOnlyAction} from './gift-items.ts';
import type {PplLink} from './scm-model.ts';
import {FinanceError,emptyFinance,applyFinanceAction,allocationValues,type Finance,type FinanceAction} from './finance-model.ts';
import {SaveConflict} from './record-store.ts';
import type {Item} from './scm-model.ts';
type DB=Pick<import('./database').Database,'prepare'|'batch'>;
export async function readFinance(db:DB):Promise<Finance>{const row=await db.prepare('SELECT payload FROM scm_finance WHERE id=1').first<{payload:string}>();return row?JSON.parse(row.payload):emptyFinance();}
export async function saveFinance(db:DB,action:FinanceAction,baseVersion:number,requestId:string,actor:string,hash:string,seeds:Item[]){
  const prior=await db.prepare('SELECT hash,actor,after_payload FROM scm_finance_revisions WHERE request_id=?').bind(requestId).first<{hash:string;actor:string;after_payload:string}>();
  if(prior){if(prior.hash!==hash||prior.actor!==actor)throw new SaveConflict('같은 요청 번호에 다른 내용이 있습니다.');return JSON.parse(prior.after_payload) as Finance;}
  const current=await readFinance(db);if(current.version!==baseVersion)throw new SaveConflict('계약·배분 정보가 먼저 변경됐습니다. 최신 자료를 불러온 후 다시 저장해 주세요.');
  let origin:{broadcastId:string;link:PplLink}|undefined;
  let recordGuard='',recordGuardArgs:(string|number)[]=[];
  if(action.kind==='contract'&&!action.data.id&&action.data.pplContext!==undefined){
    const ctx=action.data.pplContext as {broadcastId:string;linkId:string;version:number};
    if(!ctx||typeof ctx.broadcastId!=='string'||typeof ctx.linkId!=='string'||!Number.isSafeInteger(ctx.version)||ctx.version<1)throw new FinanceError('방송과 PPL 정보를 먼저 부분 저장한 뒤 계약을 등록해 주세요.');
    const row=await db.prepare('SELECT payload,version FROM scm_records WHERE id=?').bind(ctx.broadcastId).first<{payload:string;version:number}>();
    if(!row||row.version!==ctx.version)throw new SaveConflict('방송 내용이 변경됐습니다. 최신 내용을 불러오고 PPL 정보를 부분 저장한 뒤 다시 시도해 주세요.');
    const broadcast=JSON.parse(row.payload) as Item,link=broadcast.pplLinks?.find(l=>l.id===ctx.linkId);
    if(broadcast.ppl!=='있음'||!link?.channel||!link.program)throw new FinanceError('PPL 채널과 프로그램을 먼저 입력하고 부분 저장해 주세요.');
    const existing=existingPplContracts(current,broadcast,link);
    if(existing.length)throw new FinanceError('이미 같은 방송의 PPL에 등록된 계약이 있습니다: '+existing.map(c=>c.code+' · '+c.name).join(', ')+'. 기존 계약을 선택해 주세요.');
    origin={broadcastId:ctx.broadcastId,link};
    recordGuard=' AND EXISTS(SELECT 1 FROM scm_records WHERE id=? AND version=?)';recordGuardArgs=[ctx.broadcastId,ctx.version];
  }
  const saved=await db.prepare('SELECT id FROM scm_records').all<{id:string}>();
  const next=applyFinanceAction(current,action,new Set([...seeds.map(x=>x.id),...saved.results.map(x=>x.id)])),now=new Date().toISOString();
  if(origin)next.contracts[next.contracts.length-1].pplOrigin=origin;
  const attempt=crypto.randomUUID();
  const guard='EXISTS(SELECT 1 FROM scm_finance WHERE id=1 AND request_id=?)';
  const initialState=isCatalogOnlyAction(action.kind)?'sent':'pending';
  const batch=[db.prepare("INSERT INTO scm_finance(id,payload,version,request_id,state) SELECT 1,?,?,?,'"+initialState+"' WHERE ?=0"+recordGuard+" ON CONFLICT(id) DO NOTHING").bind(JSON.stringify(next),next.version,attempt,baseVersion,...recordGuardArgs)];
  if(baseVersion>0)batch[0]=db.prepare("UPDATE scm_finance SET payload=?,version=?,request_id=?"+(isCatalogOnlyAction(action.kind)?'':",state='pending'")+" WHERE id=1 AND version=?"+recordGuard).bind(JSON.stringify(next),next.version,attempt,baseVersion,...recordGuardArgs);
  batch.push(db.prepare('INSERT INTO scm_finance_revisions(request_id,hash,actor,before_payload,after_payload,created_at) SELECT ?,?,?,?,?,?').bind(requestId,hash,actor,JSON.stringify(current),JSON.stringify(next),now).whenPreviousChanged());
  const ids=[...new Set([...current.allocations,...next.allocations].map(x=>x.broadcastId))];
  for(const id of ids){
    const old=allocationValues(current,id),a=allocationValues(next,id);
    const masterChanged=action.kind==='contract'&&next.allocations.some(a=>a.active&&a.broadcastId===id&&a.contractId===action.data.id);
    if(JSON.stringify(old)===JSON.stringify(a)&&!masterChanged)continue;
    const seed=seeds.find(x=>x.id===id);
    if(seed)batch.push(db.prepare('INSERT INTO scm_records(id,payload,version,updated_at,updated_by) SELECT ?,?,0,?,? WHERE '+guard+' ON CONFLICT(id) DO NOTHING').bind(id,JSON.stringify(seed),now,actor,attempt));
    // SQL derives from the latest row inside the transaction, preserving concurrent edits.
    const patch="(payload::jsonb || jsonb_build_object('version',version+1,'updatedAt',?::text,'updatedBy',?::text,'sync','대기','workflow',CASE WHEN payload::jsonb->>'workflow'='검토 완료' THEN '검토 요청' ELSE COALESCE(payload::jsonb->>'workflow','작성 중') END,'reviewedAt',NULL,'reviewedBy',NULL,'financeVersion',?::integer,'allocationManaged',true,'allocation',?::text,'contractId',?::text,'contractAmount',?::text,'attribution',?::text))";
    const result="(CASE WHEN jsonb_typeof(payload::jsonb->'result')='object' THEN jsonb_set("+patch+",'{result,pplCost}',to_jsonb(?::text)) ELSE "+patch+" END)::text";
    const args=[now,actor,next.version,a.net,a.codes,a.contractNet,a.month];
    batch.push(db.prepare('INSERT INTO scm_revisions(request_id,record_id,version,actor,request_hash,before_payload,after_payload,created_at) SELECT ?,id,version+1,?,?,payload,'+result+',? FROM scm_records WHERE id=? AND '+guard).bind(requestId+':'+id,actor,hash,...args,a.net,...args,now,id,attempt));
    batch.push(db.prepare('UPDATE scm_records SET payload=(SELECT after_payload FROM scm_revisions WHERE request_id=?),version=version+1,updated_at=?,updated_by=? WHERE id=? AND '+guard).bind(requestId+':'+id,now,actor,id,attempt));
    batch.push(db.prepare("INSERT INTO scm_outbox(record_id,version,state,updated_at) SELECT id,version,'pending',? FROM scm_records WHERE id=? AND "+guard+" ON CONFLICT(record_id) DO UPDATE SET version=excluded.version,state='pending',last_error=NULL,updated_at=excluded.updated_at").bind(now,id,attempt));
  }
  await db.batch(batch);
  const receipt=await db.prepare('SELECT hash,actor,after_payload FROM scm_finance_revisions WHERE request_id=?').bind(requestId).first<{hash:string;actor:string;after_payload:string}>();
  if(!receipt||receipt.hash!==hash||receipt.actor!==actor)throw new SaveConflict('다른 변경이 먼저 저장됐습니다. 최신 자료를 불러와 주세요.');
  return JSON.parse(receipt.after_payload) as Finance;
}

