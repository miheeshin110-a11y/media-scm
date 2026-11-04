import test from 'node:test';
import assert from 'node:assert/strict';
import {planCalculation} from '../lib/plan-calculation.ts';
import {compositions,costCalculation,computedItem} from '../lib/workflow.ts';
import {newResult} from '../lib/scm-model.ts';
import {selectCost} from '../lib/cost-history.ts';

function fixture(){
 const item={id:'temporary-plan-only',date:'2026-11-04',time:'10:00',channel:'SK',item:'임시 상품',shortItem:'임시 상품',owner:'테스트',status:'편성확정',urgent:false,ppl:'있음',program:'',pplKind:'',price:'',target:'77777',hsTarget:'88888',businessProfitTarget:'99999',rate:'',contractId:'',contractAmount:'',allocation:'50',allocationManaged:true,attribution:'',sync:'대기',calculationMode:'legacy',result:newResult()};
 item.compositions=compositions(item);
 item.compositions.single={...item.compositions.single,enabled:true,plannedQuantity:'10',conversionRate:'80',sellingPrice:'110',commission:'10',vatBasis:'포함',units:'2',unitCost:'20'};
 item.compositions.double={...item.compositions.double,enabled:true,plannedQuantity:'5',conversionRate:'60',sellingPrice:'200',commission:'20',vatBasis:'별도',units:'1',unitCost:'30'};
 item.costPlan={quantityRounding:'floor',moneyRounding:'round',adCost:'100',guestCost:'20',administrationCost:'30',otherCost:'40',shippingRate:'10',shippingBasis:'sets',shippingCount:'999',pplProcessingMonth:''};
 item.gifts=[{id:'main',side:'single',item:'임시 주 사은품',units:'2',unitCost:'5'},{id:'sub',side:'double',item:'임시 부 사은품',units:'1',unitCost:'7'},{id:'both',side:'both',item:'임시 공통 사은품',units:'1',unitCost:'2'}];
 item.result.single.quantity='99999';item.result.single.conversionRate='1';item.result.double.quantity='88888';item.result.double.conversionRate='2';item.result.orderAmount='123456';item.result.profit='654321';item.result.pplCost='9000';item.result.adCost='100000';
 return item;
}

test('plan orders, VAT, shipment conversion, fees and all costs combine main and sub independently',()=>{
 const item=fixture(),p=planCalculation(item);
 assert.equal(p.orders.net,2000);assert.equal(p.orders.gross,2200);
 assert.deepEqual(p.costs.shipments,{single:8,double:3});assert.equal(p.costs.shipmentTotal,11);
 assert.equal(p.revenue,1200);assert.equal(p.costs.goodsCost,410);assert.equal(p.costs.giftCost,123);assert.equal(p.costs.shippingCost,110);
 assert.equal(p.costs.pplCost,50);assert.equal(p.costs.totalCost,883);assert.equal(p.costs.profit,317);assert.deepEqual(p.missing,[]);
});

test('changing plan quantities updates only derived plan amounts, preserving targets, actuals and stored profits',()=>{
 const item=fixture(),before=structuredClone(item),actual=computedItem(item);
 planCalculation(item);assert.deepEqual(item,before);
 const changed=structuredClone(item);changed.compositions.single.plannedQuantity='20';
 const p=planCalculation(changed);
 assert.equal(p.orders.gross,3300);assert.equal(p.orders.net,3000);assert.equal(p.revenue,1920);
 assert.deepEqual(changed.result,before.result);
 assert.equal(changed.target,before.target);assert.equal(changed.hsTarget,before.hsTarget);assert.equal(changed.businessProfitTarget,before.businessProfitTarget);
 assert.deepEqual(computedItem(changed).result,actual.result);
 assert.deepEqual(planCalculation({...item,result:undefined}),planCalculation(item));
});

test('missing product/gift costs or fixed expenses leave profit unknown while order/revenue remain visible',()=>{
 for(const change of [i=>i.compositions.single.unitCost='',i=>i.gifts[0].unitCost='',i=>i.costPlan.adCost='',i=>i.costPlan.guestCost='',i=>i.costPlan.administrationCost='',i=>i.costPlan.otherCost='']){
  const item=fixture();change(item);const p=planCalculation(item);
  assert.equal(p.orders.gross,2200);assert.equal(p.revenue,1200);assert.equal(p.costs.profit,null);assert.ok(p.missing.length>0);
 }
 const item=fixture();item.compositions.single.unitCost='0';
 assert.equal(planCalculation(item).costs.profit,637);
});

test('missing rate or rounding does not block orders; missing fees does not block orders or shipments',()=>{
 const rate=fixture();rate.compositions.single.conversionRate='';
 assert.equal(planCalculation(rate).orders.gross,2200);assert.equal(planCalculation(rate).revenue,null);assert.equal(planCalculation(rate).costs.profit,null);
 const quantityPolicy=fixture();quantityPolicy.costPlan.quantityRounding='';
 assert.equal(planCalculation(quantityPolicy).orders.net,2000);assert.equal(planCalculation(quantityPolicy).costs.shipmentTotal,null);
 const fee=fixture();fee.compositions.single.commission='';
 assert.equal(planCalculation(fee).orders.gross,2200);assert.equal(planCalculation(fee).costs.shipmentTotal,11);assert.equal(planCalculation(fee).revenue,null);
 const moneyPolicy=fixture();moneyPolicy.costPlan.moneyRounding='';
 assert.equal(planCalculation(moneyPolicy).orders.net,2000);assert.equal(planCalculation(moneyPolicy).revenue,1200);assert.equal(planCalculation(moneyPolicy).costs.profit,null);assert.ok(planCalculation(moneyPolicy).missing.includes('금액 원 단위 처리'));
});

test('disabled sides are excluded, zero quantities are valid, and blank/invalid quantities are never actuals',()=>{
 const disabled=fixture();disabled.compositions.double.enabled=false;disabled.compositions.double.plannedQuantity='';
 assert.equal(planCalculation(disabled).orders.gross,1100);assert.equal(planCalculation(disabled).costs.shipments.double,0);
 const zero=fixture();zero.compositions.single.plannedQuantity='0';zero.compositions.double.plannedQuantity='0';zero.compositions.single.unitCost='';zero.compositions.double.unitCost='';
 assert.equal(planCalculation(zero).orders.gross,0);assert.equal(planCalculation(zero).revenue,0);assert.equal(planCalculation(zero).costs.profit,-240);
 for(const q of ['', '-1','1.5','NaN','1000000001']){const bad=fixture();bad.compositions.single.plannedQuantity=q;const p=planCalculation(bad);assert.equal(p.orders.net,null);assert.equal(p.revenue,null);assert.equal(p.costs.profit,null);}
 const legacy=fixture();delete legacy.compositions;delete legacy.costPlan;
 assert.equal(planCalculation(legacy).orders.net,null);assert.equal(planCalculation(legacy).costs.profit,null);
});

test('quantity and money rounding follow the selected rules and match the existing shared cost engine',()=>{
 const item=fixture();item.compositions.single.plannedQuantity='3';item.compositions.single.conversionRate='50';item.compositions.double.enabled=false;item.costPlan.quantityRounding='round';
 assert.equal(planCalculation(item).costs.shipments.single,2);
 item.costPlan.quantityRounding='floor';assert.equal(planCalculation(item).costs.shipments.single,1);
 item.costPlan.moneyRounding='floor';const p=planCalculation(item);
 const scenario=structuredClone(item);scenario.result=newResult();
 for(const side of ['single','double'])Object.assign(scenario.result[side],{quantity:item.compositions[side].plannedQuantity,conversionRate:item.compositions[side].conversionRate});
 assert.deepEqual(p.costs,costCalculation(scenario));
});

test('plans use only saved dated cost snapshots and never switch to current master costs',()=>{
 const item=fixture();const master={costHistory:[{id:'old-cost',itemId:'p1',kind:'product',name:'상품',unit:'개',effectiveFrom:'2026-10-01',unitCost:'20',createdAt:'2026-10-01'}]};
 Object.assign(item.compositions.single,selectCost(master,'product','p1','2026-11-04'));
 const before=planCalculation(item).costs.profit;
 master.costHistory.push({...master.costHistory[0],id:'new-cost',effectiveFrom:'2026-11-01',unitCost:'99'});
 assert.equal(planCalculation(item).costs.profit,before);
 item.compositions.single.costDate='2026-11-05';assert.equal(planCalculation(item).costs.profit,null);
});

test('unknown PPL stays unknown and actual PPL costs never replace an absent planned allocation',()=>{
 const unknown=fixture();unknown.ppl='미정';unknown.allocation='0';assert.equal(planCalculation(unknown).costs.profit,null);assert.ok(planCalculation(unknown).missing.includes('PPL 여부'));
 const absent=fixture();absent.allocationManaged=false;absent.allocation='';absent.result.pplCost='0';assert.equal(planCalculation(absent).costs.pplCost,null);
 const none=fixture();none.ppl='없음';assert.equal(planCalculation(none).costs.profit,367);
 const manual=fixture();manual.costPlan.shippingBasis='manual';manual.costPlan.shippingCount='2';assert.equal(planCalculation(manual).costs.shippingCost,20);assert.equal(planCalculation(manual).costs.profit,407);
});

test('oversized monetary calculations are exposed as unavailable rather than imprecise profit',()=>{
 const item=fixture();item.compositions.single.plannedQuantity='1000000000';item.compositions.single.sellingPrice='1000000000000';
 const p=planCalculation(item);assert.equal(p.orders.net,null);assert.equal(p.revenue,null);assert.equal(p.costs.profit,null);
 assert.ok(p.missing.some(s=>s.includes('범위를 초과')));
});
