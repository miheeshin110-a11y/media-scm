import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveMissing,archiveRows} from '../lib/broadcast-archive.ts';
import {newResult} from '../lib/scm-model.ts';
const today='2026-10-27';
function filled(){return {id:'one',date:'2026-11-01',time:'10:00',channel:'현대',item:'상품',owner:'매니저',status:'',ppl:'없음',workflow:'작성 중',compositions:{single:{enabled:true,sku:'A',units:'1',sellingPrice:'100',commission:'0',unitCost:'0',plannedQuantity:'0',conversionRate:'0',vatBasis:'포함',costDate:''},double:{enabled:false}},target:'0',hsTarget:'0',businessProfitTarget:'0',costPlan:{quantityRounding:'floor',moneyRounding:'floor',shippingBasis:'sets',shippingRate:'0',adCost:'0',guestCost:'0',administrationCost:'0',otherCost:'0',pplProcessingMonth:''}};}
const all={month:'',owner:'',query:'',group:'',state:'all'};
test('partial saves and legacy review states are all visible; completion comes only from values',()=>{
 const items=['작성 중','검토 요청','보완 요청','검토 완료'].map((workflow,i)=>({...filled(),id:String(i),workflow,owner:''}));
 assert.equal(archiveRows(items,all,today).length,4);
 assert.equal(archiveRows(items,{...all,state:'missing'},today).length,4);
 assert.ok(items.every(x=>archiveMissing(x,today).some(m=>m.label==='담당자')));
});
test('zero is entered, optional dates/notes and disabled sub composition are not missing',()=>{
 assert.deepEqual(archiveMissing(filled(),today),[]);
 const x=filled();x.costPlan.adCost='';
 assert.deepEqual(archiveMissing(x,today),[{group:'방송비용',label:'방송비·광고비',step:4,result:false}]);
});
test('past broadcast result fields link to editable stages; actual-date rollover is respected',()=>{
 const past={...filled(),date:'2026-10-25'};
 assert.ok(archiveMissing(past,today).some(x=>x.result&&x.label==='메인 구성 주문수량'&&x.step===0));
 assert.ok(archiveMissing(past,today).some(x=>x.result&&x.label==='메인 구성 예상 전환율'&&x.step===1));
 assert.equal(archiveMissing({...past,date:'2026-10-26',time:'24:30'},today).length,0);
 assert.equal(archiveMissing({...past,date:'',time:''},today).some(x=>x.result),false);
});
test('started results are checked even for future broadcasts; zero results are complete',()=>{
 const x=filled();x.result=newResult();
 assert.ok(archiveMissing(x,today).some(m=>m.result));
 Object.assign(x.result,{actualDate:x.date,actualStart:'10:00',actualEndDate:x.date,actualEnd:'11:00'});
 Object.assign(x.result.single,{quantity:'0',conversionRate:'0'});
 assert.deepEqual(archiveMissing(x,today),[]);
});
test('result entry no longer requires duplicate start fields but still requires the actual end',()=>{
 const x=filled();x.result=newResult();Object.assign(x.result.single,{quantity:'0',conversionRate:'0'});
 const labels=archiveMissing(x,today).map(m=>m.label);
 assert.ok(!labels.includes('실제 시작일'));assert.ok(!labels.includes('실제 시작시간'));
 assert.ok(labels.includes('실제 종료일'));assert.ok(labels.includes('실제 종료시간'));
 x.result.actualEndDate=x.date;x.result.actualEnd='11:00';assert.deepEqual(archiveMissing(x,today),[]);
});
test('cancelled broadcast requires only cancellation reason and is separate from entered',()=>{
 const x={...filled(),status:'취소',owner:'',cancelReason:''};
 assert.deepEqual(archiveMissing(x,today).map(m=>m.label),['취소 사유']);
 x.cancelReason='결방';assert.deepEqual(archiveMissing(x,today),[]);
 assert.equal(archiveRows([x],{...all,state:'entered'},today).length,0);
 assert.equal(archiveRows([x],{...all,state:'cancelled'},today).length,1);
});
test('PPL not applicable is excluded; unresolved and incomplete airing allocation is actionable',()=>{
 assert.equal(archiveMissing({...filled(),ppl:'미정'},today)[0].label,'PPL 여부');
 const x={...filled(),ppl:'있음',pplLinks:[{id:'p',contractRef:'c',channel:'JTBC',program:'프로그램',agencyId:'party',date:'2026-10-30',time:'',kind:'재방'}]};
 const labels=archiveMissing(x,today).map(m=>m.label);
 assert.ok(labels.includes('PPL 1 송출시간'));
 assert.ok(labels.includes('PPL 1 본방일'));
 assert.ok(labels.includes('계약·방송별 배분'));
});
test('55 records can be browsed without loss; month, owner, words and missing group combine',()=>{
 const items=Array.from({length:55},(_,i)=>({...filled(),id:String(i),date:'2026-11-'+String(i%28+1).padStart(2,'0'),owner:i%2?'다른매니저':'매니저',target:i%3?'0':''}));
 const rows=archiveRows(items,all,today);
 assert.equal(new Set(rows.map(x=>x.item.id)).size,55);
 assert.equal(Array.from({length:6},(_,i)=>rows.slice(i*10,(i+1)*10)).flat().length,55);
 const filtered=archiveRows(items,{...all,month:'2026-11',owner:'매니저',query:'현대 상품',group:'목표·수량',state:'missing'},today);
 assert.equal(filtered.length,10);
 assert.ok(filtered.every(x=>x.missing.some(m=>m.group==='목표·수량')));
});
