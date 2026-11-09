import {emptyLogistics,latestBom,latestRelease,logisticsForecast,logisticsUnit} from './logistics.ts';
import {logisticsTask} from './logistics-tasks.ts';
import {logisticsOutlook,logisticsScenario} from './logistics-outlook.ts';
import {compositions,costPlan} from './workflow.ts';
import {salesCompositionChoices} from './sales-compositions.ts';
import type {Item} from './scm-model.ts';
import type {Finance} from './finance-model.ts';
import type {SheetTable,SheetRow} from './sheet-merge.ts';

export const logisticsSheetHeaders={
 SCM_물류방송:['동기화키','방송ID','방송 버전','물류 자료 버전','방송일','방송시간','방송채널','방송상품','요청수량(세트)','예상출고(세트)','물류상태','다음할일','준비기한','준비창고','SCM담당자','입력확인','준비요청ID','준비요청버전','SCM확인시각','처리상태','취소여부','변경확인필요','방송수정시각'],
 SCM_물류구성계획:['동기화키','방송ID','메인서브','판매구성코드','판매구성명','요청수량(세트)','예상전환율(%)','수량처리기준','예상출고(세트)','구성표ID','방송 버전','물류 자료 버전'],
 SCM_물류수량:['동기화키','방송ID','물류상품코드','품목명','구분','단위','재고준비수량','예상출고수량','방송일','방송 버전','물류 자료 버전'],
 SCM_물류상품:['동기화키','물류상품코드','품목명','단위','물류 자료 버전'],
 SCM_물류구성표:['동기화키','구성표ID','판매구성코드','판매구성명','물류상품코드','품목명','구분','세트당단품수','단위','등록시각','최신여부','물류 자료 버전','적용시작 방송일','출고방식','원본 구성ID'],
 SCM_물류재고:['동기화키','재고스냅샷ID','창고','재고기준시각(한국시간)','물류상품코드','품목명','가용재고','이번계획차감예약수량','예측기준재고','재고정의','단위','원본파일','등록시각','최신여부','물류 자료 버전'],
 SCM_물류입고:['동기화키','입고ID','입고참조번호','창고','물류상품코드','품목명','입고예정일','미입고잔량','단위','확정여부','물류 자료 버전'],
 SCM_물류요청:['동기화키','준비요청ID','방송ID','요청버전','방송일','방송시간','방송채널','방송상품','창고','준비기한','요청시각','요청자','요청메모','SCM확인시각','SCM확인자','처리상태','SCM담당자','처리내용','취소여부','최신여부','급편성','물류 자료 버전'],
 SCM_물류요청품목:['동기화키','준비요청ID','방송ID','요청버전','물류상품코드','품목명','구분','준비수량','단위','취소여부','최신여부','물류 자료 버전'],
 SCM_물류처리이력:['동기화키','이력ID','준비요청ID','방송ID','요청버전','처리시각','처리자','업무','내용','물류 자료 버전'],
 SCM_물류재고예측:['동기화키','예측기준','창고','방송ID','요청버전','방송일','물류상품코드','품목명','재고평가기준일','필요수량','예상잔여','누적부족','기한후입고','확인사항','단위','재고스냅샷ID','재고기준시각','물류 자료 버전'],
 '물류 종합':['동기화키','방송일','방송시간','채널','상품','다음 할 일','물류 상태','준비기한','준비 수량(세트)','예상 출고(세트)','준비 창고','SCM 담당자','입력 확인','준비 요청버전','방송ID','방송 버전','물류 자료 버전'],
} as const;
export const LOGISTICS_ROW_PREFIX='scm:logistics:';
const id=(...parts:(string|number)[])=>LOGISTICS_ROW_PREFIX+JSON.stringify(parts);
const value=(n:number|null)=>n===null?'':n;
export function logisticsTables(finance:Finance,items:Item[]):SheetTable[]{
 const l=finance.logistics||emptyLogistics(),v=finance.version,skuName=(sku:string)=>l.skus.find(s=>s.code===sku)?.name||'',compositionName=(code:string)=>salesCompositionChoices(finance).find(s=>s.code===code)?.name||'';
 const data=Object.fromEntries(Object.keys(logisticsSheetHeaders).map(title=>[title,[]])) as unknown as Record<keyof typeof logisticsSheetHeaders,SheetRow[]>;
 for(const item of items){
  const o=logisticsOutlook(item,l),t=logisticsTask(item,l),r=t.release,version=item.version||0,cs=compositions(item),rounding=costPlan(item).quantityRounding;
  const day=o.date||item.date,time=o.time||item.time;
  data.SCM_물류방송.push([id('broadcast',item.id),item.id,version,v,day,time,item.channel,item.item,value(o.requestedSets),value(o.expectedSets),t.status,t.action,o.dueDate,r?.warehouse||'',r?.owner||'',o.issues.join(' · '),r?.id||'',r?.revision??'',r?.acknowledgedAt||'',r?.state||'',o.cancelled?'취소':'유효',t.changes.length?'재확인 필요':'',item.updatedAt||'']);
  data['물류 종합'].push([id('view',item.id),day,time,item.channel,item.item,t.action,t.status,o.dueDate,value(o.requestedSets),value(o.expectedSets),r?.warehouse||'',r?.owner||'',o.issues.join(' · '),r?.revision??'',item.id,version,v]);
  for(const line of o.lines)data.SCM_물류구성계획.push([id('composition',item.id,line.side),item.id,line.side==='single'?'메인':'서브',line.sku,cs[line.side].compositionName||compositionName(line.sku),value(line.requested),value(line.rate),rounding,value(line.expected),latestBom(l,line.sku,o.date||item.date)?.id||'',version,v]);
  for(const row of o.requirements)data.SCM_물류수량.push([id('quantity',item.id,row.sku,row.role),item.id,row.sku,skuName(row.sku),row.role==='gift'?'사은품':'본품',logisticsUnit(l,row.sku),value(row.prepare),value(row.expected),day,version,v]);
 }
 for(const sku of l.skus)data.SCM_물류상품.push([id('sku',sku.code),sku.code,sku.name,sku.unit||'EA',v]);
 for(const bom of l.boms)for(const row of bom.lines)data.SCM_물류구성표.push([id('bom',bom.id,row.sku,row.role),bom.id,bom.compositionCode,compositionName(bom.compositionCode),row.sku,skuName(row.sku),row.role==='gift'?'사은품':'본품',row.quantity,logisticsUnit(l,row.sku),bom.createdAt,latestBom(l,bom.compositionCode)?.id===bom.id?'최신':'이전',v,bom.effectiveFrom||'',bom.shipmentMode==='set'?'완제품 세트':'개별 품목',bom.sourceConfigId||'']);
 for(const snapshot of l.snapshots)for(const row of snapshot.lines)data.SCM_물류재고.push([id('stock',snapshot.id,row.sku),snapshot.id,snapshot.warehouse,snapshot.asOf,row.sku,skuName(row.sku),row.available,row.reservedForPlans,row.available+row.reservedForPlans,snapshot.basis==='before-plans'?'이번 계획 예약 차감 전':'이번 계획 예약 차감 후',logisticsUnit(l,row.sku),snapshot.source,snapshot.createdAt,l.snapshots.filter(s=>s.warehouse===snapshot.warehouse).at(-1)?.id===snapshot.id?'최신':'이전',v]);
 for(const row of l.inbounds)data.SCM_물류입고.push([id('inbound',row.id),row.id,row.reference,row.warehouse,row.sku,skuName(row.sku),row.date,row.quantity,logisticsUnit(l,row.sku),row.confirmed?'확정':'미확정',v]);
 for(const r of l.releases){
  const latest=latestRelease(l,r.broadcastId)?.id===r.id?'최신':'이전';
  data.SCM_물류요청.push([id('release',r.id),r.id,r.broadcastId,r.revision,r.date,r.time,r.channel,r.item,r.warehouse,r.dueDate,r.createdAt,r.actor,r.note,r.acknowledgedAt||'',r.acknowledgedBy||'',r.state,r.owner,r.processingNote,r.cancelled?'취소':'유효',latest,r.urgent?'급편성':'',v]);
  for(const row of r.requirements)data.SCM_물류요청품목.push([id('release-item',r.id,row.sku,row.role),r.id,r.broadcastId,r.revision,row.sku,skuName(row.sku),row.role==='gift'?'사은품':'본품',row.quantity,logisticsUnit(l,row.sku),r.cancelled?'취소':'유효',latest,v]);
 }
 for(const e of l.events){const r=l.releases.find(r=>r.id===e.releaseId);data.SCM_물류처리이력.push([id('event',e.id),e.id,e.releaseId,r?.broadcastId||'',r?.revision??'',e.at,e.actor,e.type,e.note,v]);}
 for(const warehouse of [...new Set(l.snapshots.map(s=>s.warehouse))]){
  const snapshot=l.snapshots.filter(s=>s.warehouse===warehouse).at(-1)!;
  for(const mode of ['확정준비','예정준비','예상출고'] as const){
   const rows=mode==='확정준비'?logisticsForecast(l,warehouse):logisticsScenario(l,items,warehouse,mode==='예상출고'?'expected':'prepare',false).rows;
   for(const row of rows)data.SCM_물류재고예측.push([id('forecast',warehouse,mode,row.broadcastId,row.sku),mode,warehouse,row.broadcastId,row.revision||'',row.date,row.sku,skuName(row.sku),row.dueDate,value(row.quantity),value(row.remaining),value(row.shortage),row.lateInbound,row.notice,logisticsUnit(l,row.sku),snapshot.id,snapshot.asOf,v]);
  }
 }
 return Object.entries(logisticsSheetHeaders).map(([title,headers])=>({title,width:headers.length,rows:data[title as keyof typeof data],owns:row=>typeof row[0]==='string'&&row[0].startsWith(LOGISTICS_ROW_PREFIX)}));
}
