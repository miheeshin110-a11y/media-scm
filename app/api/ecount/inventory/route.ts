import {after} from 'next/server';
import {authenticated,checkWrite,runtime,identity} from '@/lib/runtime';
import {bridgeStatus,requestBridgeJob,bridgeJobResult,readBridgePreview} from '@/lib/ecount-bridge';
import {EcountError} from '@/lib/ecount-client';
import {ecountHash} from '@/lib/ecount-cache';
import {ecountCatalogKey} from '@/lib/ecount-inventory';
import {emptyLogistics,LogisticsError} from '@/lib/logistics';
import {readFinance,saveFinance} from '@/lib/finance-store';
import {SaveConflict} from '@/lib/record-store';
import {seedRecords} from '@/lib/seed-records';
import {deferSheetSync} from '@/lib/sheet-sync-queue';
export const dynamic='force-dynamic';
export const maxDuration=60;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export const GET=authenticated(async()=>{const devices=await bridgeStatus(runtime().DB);return json({setup:{stage:devices.length?'ready':'configuration-required',checks:[{label:'물류팀 조회 PC 연결',configured:devices.length>0},{label:'PC 실행 중',configured:devices.some(d=>d.online)}],warehouses:[{code:'200',name:'샌드부스터'}],message:'물류팀 PC를 연결하고 조회 프로그램을 실행하세요. 이카운트는 회사 회선에서 조회합니다.'},devices});});
export const POST=authenticated(async(request:Request)=>{
 const denied=checkWrite(request);if(denied)return denied;
 try{
  const text=await request.text();if(text.length>1000)return json({error:'조회 요청을 확인하세요.'},400);
  const d=JSON.parse(text),env=runtime(),db=env.DB.withSession('first-primary'),finance=await readFinance(db),l=finance.logistics||emptyLogistics();
  if(d.op==='preview'||d.op==='poll'){
   if(d.op==='preview'&&d.warehouseCode!=='200')return json({error:'샌드부스터(200)를 선택하세요.'},400);
   const result=d.op==='preview'?await requestBridgeJob(db,l):await bridgeJobResult(db,d.jobId,l);
   if(result.status==='pending')return json(result);
   const {catalogKey:_,...preview}=result.preview;return json({...result,preview,financeVersion:finance.version});
  }
  if(d.op!=='apply'||d.confirmUnits!==true||d.confirmCurrentStock!==true||!Number.isSafeInteger(d.baseVersion))return json({error:'수량 단위와 현재고 기준을 확인하세요.'},400);
  const preview=await readBridgePreview(db,d.previewId);
  if(!preview||preview.id!==d.previewId||Date.parse(preview.fetchedAt)<Date.now()-600000||!preview.lines.length)throw new SaveConflict('조회 결과가 만료됐거나 반영할 품목이 없습니다. 다시 확인하세요.');
  if((preview.warehouseCode!=='200'||preview.warehouse!=='샌드부스터')||preview.catalogKey!==ecountCatalogKey(l))throw new SaveConflict('물류 자료·설정이 변경됐습니다. 최신 자료를 불러오고 다시 확인하세요.');
  const action={kind:'logistics' as const,data:{op:'inventory',warehouse:preview.warehouse,asOf:preview.asOf,basis:'before-plans',source:'이카운트 API · '+preview.warehouseCode+' · 기준일 '+preview.baseDate,lines:preview.lines.map(r=>({sku:r.sku,available:r.available}))}};
  const requestId='ecount-'+preview.id,hash=await ecountHash(JSON.stringify(action));
  const saved=await saveFinance(db,action,d.baseVersion,requestId,identity(request)!,hash,seedRecords);
  deferSheetSync(after,env);return json({finance:saved});
 }catch(e){
  if(e instanceof EcountError)return json({error:e.message},e.code==='cooldown'?429:e.code==='setup'?400:502);
  if(e instanceof SaveConflict)return json({error:e.message},409);
  if(e instanceof LogisticsError)return json({error:e.message},400);
  return json({error:'재고를 불러오거나 반영하지 못했습니다. 기존 재고와 방송 자료는 유지됩니다.'},500);
 }
});
