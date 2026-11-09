import {after} from 'next/server';
import {authenticated,checkWrite,reviewer,runtime,identity} from '@/lib/runtime';
import {testResetPlan,resetTestTransactions,restoreTestBackup} from '@/lib/test-reset';
import {deferSheetSync} from '@/lib/sheet-sync-queue';
import {SaveConflict} from '@/lib/record-store';
export const dynamic='force-dynamic';export const maxDuration=300;
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export const GET=authenticated(async request=>{if(!reviewer(request))return json({error:'관리자 권한이 필요합니다.'},403);return json(await testResetPlan(runtime().DB));});
export const POST=authenticated(async request=>{
 const denied=checkWrite(request);if(denied)return denied;if(!reviewer(request))return json({error:'관리자 권한이 필요합니다.'},403);
 try{const raw=await request.text();if(raw.length>2000)return json({error:'요청 형식 확인'},400);const d=JSON.parse(raw);
  if(typeof d.token!=='string'||!/^[a-f0-9]{64}$/.test(d.token))return json({error:'정리 대상을 먼저 확인하세요.'},400);
  const env=runtime();let result;
  if(d.op==='reset'&&d.confirm==='기준정보 유지 테스트 초기화')result=await resetTestTransactions(env.DB,d.token,identity(request)!);
  else if(d.op==='restore'&&typeof d.backupId==='string'&&/^test-reset-[a-f0-9-]{36}$/.test(d.backupId))result=await restoreTestBackup(env.DB,d.backupId,d.token,identity(request)!);
  else return json({error:'실행 내용을 확인하세요.'},400);
  deferSheetSync(after,env,true);return json(result);
 }catch(e){return json({error:e instanceof SaveConflict?e.message:'처리하지 못했습니다. 정리 상태를 다시 확인하세요.'},e instanceof SaveConflict?409:500);}
});
