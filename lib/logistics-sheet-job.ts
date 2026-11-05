import type {Database} from './database.ts';
export function logisticsQueueStatement(db:Pick<Database,'prepare'>,guard:string,args:(string|number)[],now=new Date().toISOString()){
 return db.prepare("INSERT INTO scm_sheet_jobs(job_key,generation,state,updated_at) SELECT 'logistics',1,'pending',? WHERE "+guard+" ON CONFLICT(job_key) DO UPDATE SET generation=scm_sheet_jobs.generation+1,state='pending',last_error=NULL,updated_at=excluded.updated_at").bind(now,...args);
}
export async function queueLogisticsSheets(db:Pick<Database,'prepare'|'batch'>){await db.batch([logisticsQueueStatement(db,'1=1',[])]);}
