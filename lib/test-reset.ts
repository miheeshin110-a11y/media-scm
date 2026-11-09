import type {Database,Executor} from './database.ts';
import {emptyFinance,type Finance} from './finance-model.ts';
import {SaveConflict} from './record-store.ts';
type Row=Record<string,unknown>;
type Snapshot={finance:Finance;records:Row[];outbox:Row[]};
async function snapshot(c:Executor):Promise<Snapshot>{
 const r=await c.query("SELECT (SELECT payload FROM scm_finance WHERE id=1) AS finance,COALESCE((SELECT json_agg(r ORDER BY row_id) FROM scm_records r),'[]'::json) AS records,COALESCE((SELECT json_agg(o ORDER BY record_id) FROM scm_outbox o),'[]'::json) AS outbox");
 return {finance:r.rows[0].finance?JSON.parse(String(r.rows[0].finance)):emptyFinance(),records:r.rows[0].records as Row[],outbox:r.rows[0].outbox as Row[]};
}
async function token(s:Snapshot){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(s)))),b=>b.toString(16).padStart(2,'0')).join('');}
export function resetFinance(f:Finance):Finance{return {...structuredClone(f),version:f.version+1,contracts:[],allocations:[],invoices:[],taxImports:[],next:{contract:1,allocation:1,invoice:1},...(f.logistics?{logistics:{...structuredClone(f.logistics),releases:[],events:[]}}:{})};}
export async function testResetPlan(db:Database){
 const s=await snapshot(db.client);return {token:await token(s),counts:{broadcasts:s.records.length,contracts:s.finance.contracts.length,allocations:s.finance.allocations.filter(a=>a.active).length,invoices:s.finance.invoices.length,costHistory:s.finance.costHistory?.length||0,sets:s.finance.logistics?.skus.filter(s=>s.unit==='세트').length||0,contents:s.finance.logistics?.setContents?.length||0},backups:(await db.prepare("SELECT request_id,created_at FROM scm_finance_revisions WHERE request_id LIKE 'test-reset-%' ORDER BY created_at DESC LIMIT 5").all()).results};
}
export async function resetTestTransactions(db:Database,expectedToken:string,actor:string){
 return db.transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(736267,1)');await c.query('SELECT pg_advisory_xact_lock(736267,2)');
  const before=await snapshot(c);if(await token(before)!==expectedToken)throw new SaveConflict('자료가 변경됐습니다. 정리 대상을 다시 확인하세요.');
  if(!before.records.length&&!before.finance.contracts.length&&!before.finance.allocations.length&&!before.finance.invoices.length)throw new SaveConflict('정리할 테스트 거래 내역이 없습니다.');
  const backupId='test-reset-'+crypto.randomUUID(),at=new Date().toISOString(),next=resetFinance(before.finance);
  await c.query('INSERT INTO scm_finance_revisions(request_id,hash,actor,before_payload,after_payload,created_at) VALUES($1,$2,$3,$4,$5,$6)',[backupId,expectedToken,actor,JSON.stringify({kind:'test-reset-backup',...before}),JSON.stringify(next),at]);
  await c.query('DELETE FROM scm_records');await c.query('DELETE FROM scm_outbox');
  await c.query("INSERT INTO scm_finance(id,payload,version,request_id,state) VALUES(1,$1,$2,$3,'pending') ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=excluded.version,request_id=excluded.request_id,state='pending',lease_token=NULL,lease_until=NULL",[JSON.stringify(next),next.version,backupId]);
  await c.query("INSERT INTO scm_sheet_jobs(job_key,generation,state,updated_at) VALUES('test-reset',1,'pending',$1) ON CONFLICT(job_key) DO UPDATE SET generation=scm_sheet_jobs.generation+1,state='pending',lease_token=NULL,lease_until=NULL,updated_at=excluded.updated_at",[at]);
  await c.query("INSERT INTO scm_sheet_jobs(job_key,generation,state,updated_at) VALUES('logistics',1,'pending',$1) ON CONFLICT(job_key) DO UPDATE SET generation=scm_sheet_jobs.generation+1,state='pending',lease_token=NULL,lease_until=NULL,updated_at=excluded.updated_at",[at]);
  return {backupId,removedBroadcasts:before.records.length,removedContracts:before.finance.contracts.length};
 });
}
export async function restoreTestBackup(db:Database,backupId:string,expectedToken:string,actor:string){
 return db.transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(736267,1)');await c.query('SELECT pg_advisory_xact_lock(736267,2)');
  const current=await snapshot(c);if(await token(current)!==expectedToken)throw new SaveConflict('최신 상태를 다시 확인하세요.');
  const found=await c.query('SELECT before_payload,after_payload FROM scm_finance_revisions WHERE request_id=$1',[backupId]);if(!found.rows.length)throw new SaveConflict('백업을 찾지 못했습니다.');
  const backup=JSON.parse(String(found.rows[0].before_payload)),reset=JSON.parse(String(found.rows[0].after_payload));
  if(backup.kind!=='test-reset-backup'||current.records.length||current.finance.contracts.length||current.finance.version!==reset.version)throw new SaveConflict('초기화 후 자료가 변경되었습니다. 덮어쓰기 없이 복구하려면 백업 자료를 대조해야 합니다.');
  const f:Finance={...backup.finance,version:current.finance.version+1},at=new Date().toISOString(),id='test-restore-'+crypto.randomUUID();
  for(const r of backup.records)await c.query('INSERT INTO scm_records(row_id,id,payload,version,updated_at,updated_by) VALUES($1,$2,$3,$4,$5,$6)',[r.row_id,r.id,r.payload,r.version,r.updated_at,r.updated_by]);
  for(const r of backup.records)await c.query("INSERT INTO scm_outbox(record_id,version,state,updated_at) VALUES($1,$2,'pending',$3)",[r.id,r.version,at]);
  await c.query("UPDATE scm_finance SET payload=$1,version=$2,request_id=$3,state='pending' WHERE id=1",[JSON.stringify(f),f.version,id]);
  await c.query('INSERT INTO scm_finance_revisions(request_id,hash,actor,before_payload,after_payload,created_at) VALUES($1,$2,$3,$4,$5,$6)',[id,expectedToken,actor,JSON.stringify(current.finance),JSON.stringify(f),at]);
  await c.query("UPDATE scm_sheet_jobs SET generation=generation+1,state='pending',updated_at=$1 WHERE job_key IN ('test-reset','logistics')",[at]);
  return {restored:backup.records.length};
 });
}
