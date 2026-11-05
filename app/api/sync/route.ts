import {queueLogisticsSheets} from '@/lib/logistics-sheet-job';
import {after} from 'next/server';
import {readSyncSnapshot} from '@/lib/sync-status';
import {authenticated,runtime,checkWrite} from '@/lib/runtime';
import {sheetsConfigured} from '@/lib/google-sync';
import {deferSheetSync} from '@/lib/sheet-sync-queue';
export const dynamic='force-dynamic';
export const maxDuration=300;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export const GET=authenticated(async()=>json({syncSnapshot:await readSyncSnapshot(runtime().DB)}));
export const POST=authenticated(async(request:Request)=>{
 const denied=checkWrite(request);if(denied)return denied;
 const env=runtime();
 if(!sheetsConfigured(env))return json({error:'앱용 Google 계정 연결 설정이 필요합니다.'},503);
 const automatic=new URL(request.url).searchParams.get('automatic')==='1';
 if(new URL(request.url).searchParams.get('scope')==='logistics')await queueLogisticsSheets(env.DB);
 if(!automatic){
  await Promise.all([
   env.DB.prepare("UPDATE scm_sheet_jobs SET state='pending',last_error=NULL WHERE state='failed' AND (lease_until IS NULL OR lease_until<?)").bind(Date.now()).run(),
   env.DB.prepare("UPDATE scm_outbox SET state='pending',last_error=NULL WHERE state='failed' AND (lease_until IS NULL OR lease_until<?)").bind(Date.now()).run(),
   env.DB.prepare("UPDATE scm_finance SET state='pending' WHERE state='failed' AND (lease_until IS NULL OR lease_until<?)").bind(Date.now()).run(),
  ]);
 }
 const syncSnapshot=await readSyncSnapshot(env.DB);
 // Failed work is retried explicitly; automatic continuation handles pending work.
 deferSheetSync(after,env);
 return json({accepted:true,syncSnapshot},202);
});
