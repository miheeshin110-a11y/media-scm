import {runtime} from '@/lib/runtime';
import {bridgeDevice,redeemBridgePair,bridgeHeartbeat,completeBridgeJob} from '@/lib/ecount-bridge';
import {readFinance} from '@/lib/finance-store';
import {emptyLogistics} from '@/lib/logistics';
import {EcountError} from '@/lib/ecount-client';
export const dynamic='force-dynamic';
export const maxDuration=30;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
// Device token is warehouse-job scoped. It cannot access records, finance or apply inventory.
export async function POST(request:Request){
 if(request.headers.get('origin'))return json({error:'PC 조회 프로그램에서 요청하세요.'},403);
 try{const raw=await request.text();if(raw.length>2000000)return json({error:'결과 크기를 확인하세요.'},413);const d=JSON.parse(raw),db=runtime().DB;
  if(d.op==='connect')return json(await redeemBridgePair(db,d.code));
  const token=request.headers.get('authorization')?.replace(/^Bearer /,''),device=await bridgeDevice(db,token);
  if(d.op==='poll')return json({job:await bridgeHeartbeat(db,device.id,d.ready===true)});
  if(d.op==='finish'){const f=await readFinance(db);await completeBridgeJob(db,device,d.jobId,d.outcome,f.logistics||emptyLogistics());return json({ok:true});}
  return json({error:'지원하지 않는 PC 요청입니다.'},400);
 }catch(e){return json({error:e instanceof EcountError?e.message:'PC 조회 요청을 처리하지 못했습니다.'},e instanceof EcountError&&e.code==='auth'?401:400);}
}
