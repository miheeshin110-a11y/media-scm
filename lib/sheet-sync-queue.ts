import type {ScmEnv} from './runtime';
import {sheetsConfigured,syncFinance,syncRecord,syncLogistics} from './google-sync.ts';

// Every business save commits its outbox entry in the same transaction.
// Interrupted workers resume from that durable queue, not an in-memory promise.
export async function flushPendingSheets(env:ScmEnv,retryFailed=false){
 if(!sheetsConfigured(env))return;
 const started=Date.now(),state=retryFailed?"state!='sent'":"state='pending'";
 const eligible=state+' AND (lease_until IS NULL OR lease_until<?)';
 const finance=await env.DB.prepare('SELECT id FROM scm_finance WHERE id=1 AND '+eligible).bind(Date.now()).first();
 if(finance)await syncFinance(env);
 const rows=await env.DB.prepare('SELECT record_id FROM scm_outbox WHERE '+eligible+' ORDER BY updated_at LIMIT 5').bind(Date.now()).all<{record_id:string}>();
 for(const row of rows.results){
  // Reserve time for one bounded Google request sequence and lease release.
  if(Date.now()-started>150000)break;
  await syncRecord(env,row.record_id);
 }
 if(Date.now()-started<=150000){
  const logistics=await env.DB.prepare("SELECT job_key FROM scm_sheet_jobs WHERE job_key='logistics' AND "+eligible).bind(Date.now()).first();
  if(logistics)await syncLogistics(env);
 }
}

export function deferSheetSync(after:(work:()=>Promise<void>)=>void,env:ScmEnv,retryFailed=false){
 if(!sheetsConfigured(env))return;
 after(async()=>{
  try{await flushPendingSheets(env,retryFailed);}
  catch{console.error('Sheet background sync interrupted; durable queue retained.');}
 });
}
