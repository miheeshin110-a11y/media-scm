export type SheetState='sent'|'pending'|'failed';
export type SyncSnapshot={records:Record<string,{state:SheetState;version:number}>;finance:SheetState|null;logistics?:SheetState|null};
export function sheetState(raw:unknown):SheetState{return raw==='sent'?'sent':raw==='failed'?'failed':'pending';}
export function recordSheetState(snapshot:SyncSnapshot|null,item:{id:string;version?:number}):SheetState|'unknown'{
 const row=snapshot?.records[item.id];
 if(!row)return 'unknown';
 return row.version===(item.version||0)?row.state:'pending';
}
export function syncCounts(snapshot:SyncSnapshot|null){
 const counts={sent:0,pending:0,failed:0,remaining:0};
 if(!snapshot)return counts;
 for(const {state} of Object.values(snapshot.records))counts[state]++;
 if(snapshot.finance)counts[snapshot.finance]++;
 if(snapshot.logistics)counts[snapshot.logistics]++;
 counts.remaining=counts.pending+counts.failed;
 return counts;
}
export const sheetStateLabel=(state:SheetState|'unknown')=>({sent:'시트 반영 완료',pending:'시트 반영 대기',failed:'시트 반영 실패',unknown:'시트 상태 확인 필요'})[state];
export async function readSyncSnapshot(db:Pick<import('./database').Database,'prepare'>):Promise<SyncSnapshot>{
 const [rows,finance,logistics]=await Promise.all([
  db.prepare('SELECT r.id,r.version,o.state,o.version AS outbox_version FROM scm_records r LEFT JOIN scm_outbox o ON o.record_id=r.id').all<{id:string;version:number;state:string|null;outbox_version:number|null}>(),
  db.prepare('SELECT state FROM scm_finance WHERE id=1').first<{state:string}>(),
  db.prepare("SELECT state FROM scm_sheet_jobs WHERE job_key='logistics'").first<{state:string}>(),
 ]);
 return {records:Object.fromEntries(rows.results.map(r=>[r.id,{version:r.version,state:r.version===r.outbox_version?sheetState(r.state):'pending' as const}])),finance:finance?sheetState(finance.state):null,logistics:logistics?sheetState(logistics.state):null};
}
