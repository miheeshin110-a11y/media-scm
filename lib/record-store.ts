import {logisticsQueueStatement} from './logistics-sheet-job.ts';
import {duplicatePplErrors} from './ppl-duplicates.ts';
import type {Item} from './scm-model';
export class SaveConflict extends Error {}
type DB=Pick<import('./database').Database,'prepare'|'batch'>;
export async function saveRecord(db:DB,record:Item,baseVersion:number,requestId:string,actor:string,requestHash:string,financeVersion?:number){
  const receipt=await db.prepare('SELECT request_hash, actor, after_payload FROM scm_revisions WHERE request_id=?').bind(requestId).first<{request_hash:string;actor:string;after_payload:string}>();
  if(receipt){if(receipt.request_hash!==requestHash||receipt.actor!==actor)throw new SaveConflict('요청 ID가 다른 저장 내용에 사용됐습니다.');return JSON.parse(receipt.after_payload) as Item;}
  const duplicates=duplicatePplErrors(record);if(duplicates.length)throw new SaveConflict(duplicates.join(' '));
  const existing=await db.prepare('SELECT payload,version FROM scm_records WHERE id=?').bind(record.id).first<{payload:string;version:number}>();
  if((existing?.version||0)!==baseVersion)throw new SaveConflict('다른 변경 내용이 먼저 저장됐습니다. 새로 불러온 뒤 수정해 주세요.');
  const now=new Date().toISOString(),version=baseVersion+1;
  const previous:Item|undefined=existing?JSON.parse(existing.payload):undefined;
  const registrationSource=previous?previous.registrationSource:record.registrationSource;
  const next={...record,registrationSource,version,updatedAt:now,updatedBy:actor,sync:'대기' as const},payload=JSON.stringify(next);
  const financeGuard=financeVersion===undefined?'':' AND COALESCE((SELECT version FROM scm_finance WHERE id=1),0)=?';
  const guardArgs=financeVersion===undefined?[]:[financeVersion];
  const mutation=baseVersion===0
    ? db.prepare('INSERT INTO scm_records(id,payload,version,updated_at,updated_by) SELECT ?,?,?,?,? WHERE 1=1'+financeGuard+' ON CONFLICT(id) DO NOTHING').bind(record.id,payload,version,now,actor,...guardArgs)
    : db.prepare('UPDATE scm_records SET payload=?,version=?,updated_at=?,updated_by=? WHERE id=? AND version=?'+financeGuard).bind(payload,version,now,actor,record.id,baseVersion,...guardArgs);
  await db.batch([
    mutation,
    db.prepare('INSERT INTO scm_revisions(request_id,record_id,version,actor,request_hash,before_payload,after_payload,created_at) SELECT ?,?,?,?,?,?,?,?').bind(requestId,record.id,version,actor,requestHash,existing?.payload||null,payload,now).whenPreviousChanged(),
    db.prepare("INSERT INTO scm_outbox(record_id,version,state,updated_at) SELECT record_id,version,'pending',created_at FROM scm_revisions WHERE request_id=? ON CONFLICT(record_id) DO UPDATE SET version=excluded.version,state='pending',last_error=NULL,updated_at=excluded.updated_at WHERE scm_outbox.version<excluded.version").bind(requestId),
    logisticsQueueStatement(db,'EXISTS(SELECT 1 FROM scm_revisions WHERE request_id=?)',[requestId],now).whenPreviousChanged(),
  ]);
  const saved=await db.prepare('SELECT request_hash,actor,after_payload FROM scm_revisions WHERE request_id=?').bind(requestId).first<{request_hash:string;actor:string;after_payload:string}>();
  if(!saved||saved.request_hash!==requestHash||saved.actor!==actor)throw new SaveConflict('저장 충돌이 발생했습니다. 최신 내용을 불러와 주세요.');
  return JSON.parse(saved.after_payload) as Item;
}

