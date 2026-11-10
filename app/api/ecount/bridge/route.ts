import {authenticated,checkWrite,reviewer,runtime,identity} from '@/lib/runtime';
import {bridgeStatus,createBridgePair,revokeBridge} from '@/lib/ecount-bridge';
import {EcountError} from '@/lib/ecount-client';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export const GET=authenticated(async request=>json({devices:await bridgeStatus(runtime().DB),canManage:reviewer(request)}));
export const POST=authenticated(async request=>{
 const denied=checkWrite(request);if(denied)return denied;if(!reviewer(request))return json({error:'PC 연결·해제는 관리자 권한이 필요합니다.'},403);
 try{const raw=await request.text();if(raw.length>1000)return json({error:'요청을 확인하세요.'},400);const d=JSON.parse(raw),db=runtime().DB;
  if(d.op==='pair')return json(await createBridgePair(db,d.label,identity(request)!));
  if(d.op==='revoke'){await revokeBridge(db,d.id);return json({ok:true});}
  return json({error:'지원하지 않는 작업입니다.'},400);
 }catch(e){return json({error:e instanceof EcountError?e.message:'PC 연결 설정을 처리하지 못했습니다.'},400);}
});
