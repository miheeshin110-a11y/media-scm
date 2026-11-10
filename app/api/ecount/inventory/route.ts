import {after} from 'next/server';
import {authenticated,checkWrite,runtime,identity} from '@/lib/runtime';
import {ecountSetup} from '@/lib/ecount-setup';
import {ecountConfig,EcountError} from '@/lib/ecount-client';
import {loadEcountPreview,readEcountPreview,ecountHash} from '@/lib/ecount-cache';
import {ecountCatalogKey} from '@/lib/ecount-inventory';
import {emptyLogistics,LogisticsError} from '@/lib/logistics';
import {readFinance,saveFinance} from '@/lib/finance-store';
import {SaveConflict} from '@/lib/record-store';
import {seedRecords} from '@/lib/seed-records';
import {deferSheetSync} from '@/lib/sheet-sync-queue';
export const dynamic='force-dynamic';
export const maxDuration=60;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export const GET=authenticated(async()=>json({setup:ecountSetup(process.env)}));
export const POST=authenticated(async(request:Request)=>{
 const denied=checkWrite(request);if(denied)return denied;
 try{
  const text=await request.text();if(text.length>1000)return json({error:'조회 요청을 확인하세요.'},400);
  const d=JSON.parse(text),env=runtime(),db=env.DB.withSession('first-primary'),finance=await readFinance(db),l=finance.logistics||emptyLogistics();
  if(d.op==='preview'){
   const result=await loadEcountPreview(db,process.env,String(d.warehouseCode||''),l);
   const {catalogKey:_,...preview}=result.preview;return json({...result,preview,financeVersion:finance.version});
  }
  if(d.op!=='apply'||d.confirmUnits!==true||d.confirmCurrentStock!==true||!Number.isSafeInteger(d.baseVersion))return json({error:'수량 단위와 현재고 기준을 확인하세요.'},400);
  const config=ecountConfig(process.env),preview=await readEcountPreview(db,await ecountHash(JSON.stringify(config)));
  if(!preview||preview.id!==d.previewId||Date.parse(preview.fetchedAt)<Date.now()-600000||!preview.lines.length)throw new SaveConflict('조회 결과가 만료됐거나 반영할 품목이 없습니다. 다시 확인하세요.');
  if(!config.warehouses.some(w=>w.code===preview.warehouseCode&&w.name===preview.warehouse)||preview.catalogKey!==ecountCatalogKey(l))throw new SaveConflict('물류 자료·설정이 변경됐습니다. 최신 자료를 불러오고 다시 확인하세요.');
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
