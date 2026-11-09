import test from 'node:test';
import assert from 'node:assert/strict';
import {logisticsTask,logisticsChanges,logisticsSteps} from '../lib/logistics-tasks.ts';
import {emptyLogistics,applyLogisticsAction,logisticsFingerprint,latestRelease} from '../lib/logistics.ts';
import {compositions,costPlan} from '../lib/workflow.ts';
let serial=0;
const apply=(l,data,items=[])=>applyLogisticsAction(l,data,items,'temporary-scm','2026-11-05T09:00:00Z',()=>`task-${++serial}`);
function item(){const b={id:'A',version:1,date:'2026-11-20',time:'10:00',item:'시험상품',channel:'SK',status:'편성확정',result:{profit:'12345'}};b.compositions=compositions(b);Object.assign(b.compositions.single,{sku:'SET',plannedQuantity:'10',conversionRate:'80',unitCost:'777'});b.costPlan={...costPlan(b),quantityRounding:'floor'};return b;}
function master(){let l=apply(emptyLogistics(),{op:'sku',code:'P',name:'본품'});l=apply(l,{op:'sku',code:'G',name:'사은품'});return apply(l,{op:'bom',compositionCode:'SET',lines:[{sku:'P',role:'product',quantity:9},{sku:'G',role:'gift',quantity:2}]});}
function publish(l,b){return apply(l,{op:'publish',broadcastId:b.id,warehouse:'센터',fingerprint:logisticsFingerprint(b,l),confirmComposition:true,note:'수량확인'},[b]);}
function stock(l,available=100,asOf='2026-11-05T09:00'){return apply(l,{op:'inventory',warehouse:'센터',asOf,basis:'before-plans',source:'임시재고',lines:[{sku:'P',available},{sku:'G',available:100}]});}
function ack(l,b){return apply(l,{op:'ack',broadcastId:b.id,releaseId:latestRelease(l,b.id).id,owner:'물류담당',note:'WMS확인'},[b]);}

test('new saved broadcasts have a concrete review action without technical configuration controls',()=>{
 const t=logisticsTask(item(),master());assert.equal(t.stage,1);assert.equal(t.completedThrough,0);assert.equal(t.kind,'review');assert.equal(t.status,'새 방송 확인 필요');assert.equal(t.outlook.requestedSets,10);assert.equal(t.outlook.expectedSets,8);assert.equal(logisticsSteps.length,5);
});
test('missing date, sales composition and request quantities each point to the right broadcast input step',()=>{
 const l=master(),b=item();assert.equal(logisticsTask({...b,time:''},l).editStep,0);
 const noSku=structuredClone(b);noSku.compositions.single.sku='';assert.equal(logisticsTask(noSku,l).editStep,2);
 const noQty=structuredClone(b);noQty.compositions.single.plannedQuantity='';assert.equal(logisticsTask(noQty,l).editStep,3);assert.equal(logisticsTask(noQty,l).kind,'broadcast');
});
test('unmapped compositions get a plain-language one-time mapping task and do not pretend quantities are known',()=>{
 const t=logisticsTask(item(),emptyLogistics());assert.equal(t.stage,2);assert.equal(t.completedThrough,0);assert.equal(t.kind,'mapping');assert.match(t.reason,/본품·사은품/);assert.equal(t.outlook.requirements.length,0);
});
test('confirmation advances from stock review to preparation, with explicit completion staying separate from prediction',()=>{
 const b=item();let l=publish(stock(master()),b);assert.equal(logisticsTask(b,l).stage,3);assert.equal(logisticsTask(b,l).completedThrough,2);assert.equal(logisticsTask(b,l).status,'재고 확인 필요');
 l=ack(l,b);assert.equal(logisticsTask(b,l).kind,'prepare');assert.equal(logisticsTask(b,l).completedThrough,3);assert.equal(logisticsTask(b,l).stage,4);
 l=apply(l,{op:'status',broadcastId:b.id,releaseId:latestRelease(l,b.id).id,owner:'물류담당',note:'실물준비완료',state:'준비 완료',confirmPreparation:true},[b]);assert.equal(logisticsTask(b,l).stage,5);assert.equal(logisticsTask(b,l).kind,'done');
});
test('known shortage shows a shortage action only after SCM has reviewed the request',()=>{
 const b=item();let l=publish(stock(master(),10),b);assert.equal(logisticsTask(b,l).stage,3);
 l=ack(l,b);const t=logisticsTask(b,l);assert.equal(t.kind,'shortage');assert.equal(t.shortage[0].shortage,80);
});
test('missing stock and historical reference mismatch do not become stock sufficient or auto-complete',()=>{
 const b=item();let l=ack(publish(master(),b),b);assert.equal(logisticsTask(b,l).kind,'inventory');
 l=stock(l);const past={...b,date:'2026-10-01'};l=publish(l,past);l=ack(l,past);assert.equal(logisticsTask(past,l).kind,'inventory');assert.match(logisticsTask(past,l).reason,/기준시각/);
});
test('a completed request with changed quantities reopens review and explains exact changes',()=>{
 const b=item();let l=ack(publish(stock(master()),b),b);l=apply(l,{op:'status',broadcastId:b.id,releaseId:latestRelease(l,b.id).id,owner:'SCM',note:'완료',state:'준비 완료',confirmPreparation:true},[b]);
 const changed=structuredClone(b);changed.date='2026-11-21';changed.compositions.single.plannedQuantity='20';const t=logisticsTask(changed,l);
 assert.equal(t.kind,'review');assert.equal(t.stage,1);assert.match(t.changes.join(' '),/10 → 20세트/);assert.match(t.changes.join(' '),/방송일/);
});
test('cancellation is an actionable request until confirmed; cancelled broadcasts without requests need no preparation',()=>{
 const b=item(),cancelled={...b,status:'취소'};assert.equal(logisticsTask(cancelled,master()).kind,'done');
 let l=publish(master(),b);assert.equal(logisticsTask(cancelled,l).kind,'review');l=publish(l,cancelled);assert.equal(logisticsTask(cancelled,l).kind,'inventory');l=ack(l,cancelled);assert.equal(logisticsTask(cancelled,l).status,'취소 확인 완료');
});
test('task calculation and change summaries leave all broadcast costs, profit and logistics audit data unchanged',()=>{
 const b=item(),l=stock(publish(master(),b)),before=structuredClone({b,l});logisticsTask(b,l);logisticsChanges(b,l);assert.deepEqual({b,l},before);
 const financial=structuredClone(b);financial.result.profit='999';financial.compositions.single.unitCost='888';assert.deepEqual(logisticsChanges(financial,l),[]);
});

test('completion requires physical preparation confirmation even with sufficient stock',()=>{
 const b=item(),l=ack(publish(stock(master()),b),b),before=structuredClone({b,l});
 assert.throws(()=>apply(l,{op:'status',broadcastId:b.id,releaseId:latestRelease(l,b.id).id,owner:'SCM',note:'확인',state:'준비 완료'},[b]),/실제 준비 완료/);
 assert.deepEqual({b,l},before);
});
test('unknown and insufficient inventory require separate actual stock evidence before completion',()=>{
 for(const initial of [master(),stock(master(),10)]){
  const b=item(),l=ack(publish(initial,b),b),before=structuredClone(b);
  const action={op:'status',broadcastId:b.id,releaseId:latestRelease(l,b.id).id,owner:'SCM',note:'창고 실물 확보 확인',state:'준비 완료',confirmPreparation:true};
  assert.throws(()=>apply(l,action,[b]),/별도로 확인/);
  const saved=apply(l,{...action,externalStockConfirmed:true},[b]);
  assert.equal(latestRelease(saved,b.id).state,'준비 완료');
  assert.equal(latestRelease(saved,b.id).completion.externalStockConfirmed,true);
  assert.deepEqual(b,before);
 }
});
test('inventory replacement keeps omitted stock unknown and later stock resolves shortages without changing broadcast finance',()=>{
 const b=item(),before=structuredClone(b);let l=ack(publish(stock(master(),10),b),b);
 assert.equal(logisticsTask(b,l).kind,'shortage');
 l=stock(l,100,'2026-11-05T10:00');assert.equal(logisticsTask(b,l).kind,'prepare');
 l=apply(l,{op:'inventory',warehouse:'센터',asOf:'2026-11-05T11:00',basis:'before-plans',source:'임시재고',lines:[{sku:'G',available:100}]});
 assert.equal(logisticsTask(b,l).kind,'inventory');
 assert.deepEqual(b,before);
});
