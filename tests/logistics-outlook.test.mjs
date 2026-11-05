import test from 'node:test';
import assert from 'node:assert/strict';
import {logisticsOutlook,logisticsScenario} from '../lib/logistics-outlook.ts';
import {emptyLogistics,applyLogisticsAction,logisticsFingerprint,logisticsForecast} from '../lib/logistics.ts';
import {compositions,costPlan} from '../lib/workflow.ts';

let serial=0;
const apply=(l,d,items=[])=>applyLogisticsAction(l,d,items,'temporary-operator','2026-11-05T00:00:00Z',()=>`outlook-${++serial}`);
function master(){
 let l=emptyLogistics();l=apply(l,{op:'sku',code:'P',name:'본품'});l=apply(l,{op:'sku',code:'G',name:'사은품'});
 return apply(l,{op:'bom',compositionCode:'SET',lines:[{sku:'P',role:'product',quantity:9},{sku:'G',role:'gift',quantity:2}]});
}
function item(id='A',quantity='1000',rate='80'){
 const b={id,version:1,date:'2026-11-20',time:'10:00',status:'편성확정',item:'시험 상품',channel:'SK'};
 b.compositions=compositions(b);Object.assign(b.compositions.single,{sku:'SET',plannedQuantity:quantity,conversionRate:rate,unitCost:'777'});
 b.costPlan={...costPlan(b),quantityRounding:'floor'};return b;
}
function stock(l){return apply(l,{op:'inventory',warehouse:'센터',asOf:'2026-11-05T09:00',basis:'before-plans',source:'임시재고',lines:[{sku:'P',available:10000},{sku:'G',available:3000}]});}
function publish(l,b){return apply(l,{op:'publish',warehouse:'센터',broadcastId:b.id,fingerprint:logisticsFingerprint(b,l),note:'전체 구성 확인',confirmComposition:true},[b]);}

test('unpublished saved broadcasts show expected shipment and full preparation quantities without side effects',()=>{
 const l=master(),b=item(),before=structuredClone({l,b}),o=logisticsOutlook(b,l);
 assert.equal(o.requestedSets,1000);assert.equal(o.expectedSets,800);
 assert.deepEqual(o.requirements.map(r=>[r.prepare,r.expected]),[[9000,7200],[2000,1600]]);
 assert.deepEqual({l,b},before);assert.equal(l.releases.length,0);
});
test('round each composition shipment set count before multiplying BOM units and combine both sizes',()=>{
 const l=master(),b=item('A','3','50');Object.assign(b.compositions.double,{enabled:true,sku:'SET',plannedQuantity:'3',conversionRate:'50'});
 const floor=logisticsOutlook(b,l);assert.equal(floor.requestedSets,6);assert.equal(floor.expectedSets,2);assert.equal(floor.requirements[0].expected,18);
 b.costPlan.quantityRounding='round';assert.equal(logisticsOutlook(b,l).expectedSets,4);assert.equal(logisticsOutlook(b,l).requirements[0].expected,36);
});
test('unknown rate/rounding does not reduce full preparation quantities; explicit zero remains known',()=>{
 const l=master();
 for(const rate of ['','101','-1','not-a-rate']){const o=logisticsOutlook(item('A','1000',rate),l);assert.equal(o.expectedSets,null);assert.equal(o.requirements[0].prepare,9000);assert.equal(o.requirements[0].expected,null);}
 const b=item();b.costPlan.quantityRounding='';assert.equal(logisticsOutlook(b,l).expectedSets,null);
 assert.equal(logisticsOutlook(item('Z','0',''),l).expectedSets,0);assert.equal(logisticsOutlook(item('R','1000','0'),l).expectedSets,0);
});
test('missing request quantity and unmapped BOM are not silently converted to zero or partial totals',()=>{
 const l=master(),b=item('A','','80');assert.equal(logisticsOutlook(b,l).requestedSets,null);assert.equal(logisticsOutlook(b,l).requirements[0].prepare,null);
 const unconfigured=logisticsOutlook(item(),emptyLogistics());assert.equal(unconfigured.requestedSets,1000);assert.equal(unconfigured.expectedSets,800);assert.ok(unconfigured.issues.some(s=>s.includes('구성표')));
 const mixed=item();Object.assign(mixed.compositions.double,{enabled:true,sku:'SET',plannedQuantity:'',conversionRate:'80'});assert.equal(logisticsOutlook(mixed,l).requestedSets,null);assert.equal(logisticsOutlook(mixed,l).requirements[0].prepare,null);
});
test('planned scenario includes unassigned broadcasts only with explicit warehouse assumption',()=>{
 const l=stock(master()),b=item();const before=structuredClone(l);
 assert.equal(logisticsScenario(l,[b],'센터','prepare',false).rows.length,0);
 const assumed=logisticsScenario(l,[b],'센터','prepare',true);assert.equal(assumed.unassigned,1);assert.equal(assumed.rows.find(r=>r.sku==='P').remaining,1000);
 assert.equal(logisticsScenario(l,[b],'센터','expected',true).rows.find(r=>r.sku==='P').remaining,2800);
 assert.deepEqual(l,before);assert.equal(logisticsForecast(l,'센터').length,0);
});
test('latest plan changes are shown immediately without altering previously released preparation quantities',()=>{
 let l=stock(master()),b=item();l=publish(l,b);const before=structuredClone(l),changed=item('A','2000','50');
 assert.equal(logisticsScenario(l,[changed],'센터','prepare',false).rows.find(r=>r.sku==='P').remaining,-8000);
 assert.equal(logisticsScenario(l,[changed],'센터','expected',false).rows.find(r=>r.sku==='P').remaining,1000);
 assert.equal(logisticsForecast(l,'센터').find(r=>r.sku==='P').remaining,1000);assert.deepEqual(l,before);
 const cancelled={...changed,status:'취소'};assert.equal(logisticsScenario(l,[cancelled],'센터','prepare',false).rows.length,0);assert.equal(logisticsForecast(l,'센터').length,2);
});
test('unknown demand propagates through later stock balances rather than understating shortages',()=>{
 const l=stock(master()),a=item('A','','80'),b={...item('B'),date:'2026-11-21'};
 const rows=logisticsScenario(l,[a,b],'센터','prepare',true).rows.filter(r=>r.sku==='P');assert.equal(rows.length,2);assert.equal(rows[0].quantity,null);assert.equal(rows[1].remaining,null);assert.equal(rows[1].shortage,null);
});
test('an unmapped future broadcast makes the scenario incomplete while preserving visible known requirements',()=>{
 const l=stock(master()),a=item(),b=item('B');b.compositions.single.sku='UNMAPPED';
 const result=logisticsScenario(l,[a,b],'센터','prepare',true);assert.ok(result.warnings.length);assert.equal(result.rows[0].quantity,9000);assert.equal(result.rows[0].remaining,null);
});
test('shipment scenario includes inbound by broadcast day; preparation scenario uses the seven-day deadline',()=>{
 let l=stock(master());l=apply(l,{op:'inbound',warehouse:'센터',sku:'P',date:'2026-11-18',quantity:5000,confirmed:true,reference:'IN-1'});
 assert.equal(logisticsScenario(l,[item()],'센터','prepare',true).rows.find(r=>r.sku==='P').remaining,1000);
 assert.equal(logisticsScenario(l,[item()],'센터','expected',true).rows.find(r=>r.sku==='P').remaining,7800);
});
test('other warehouse releases and past broadcasts are excluded without mixing confirmed/planned demands',()=>{
 let l=stock(master()),b=item();l=apply(l,{op:'publish',warehouse:'다른센터',broadcastId:b.id,fingerprint:logisticsFingerprint(b,l),note:'확인',confirmComposition:true},[b]);
 assert.equal(logisticsScenario(l,[b],'센터','prepare',true).rows.length,0);
 assert.equal(logisticsScenario(stock(master()),[{...item(),date:'2026-10-01',time:''}],'센터','prepare',true).warnings.length,0);
});
