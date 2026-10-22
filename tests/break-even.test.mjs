import test from 'node:test';
import assert from 'node:assert/strict';
import {mainBreakEven} from '../lib/break-even.ts';
import {costCalculation,orderCalculation} from '../lib/workflow.ts';
import {newResult} from '../lib/scm-model.ts';
import {workflowRows,workflowHeaders} from '../lib/workflow-sheets.ts';
const main=()=>({enabled:true,sku:'main',units:'3',unitCost:'10000',sellingPrice:'100000',commission:'30',vatBasis:'별도',plannedQuantity:'500',conversionRate:'80',costDate:''});
const item=()=>({id:'bep',ppl:'있음',allocationManaged:true,allocation:'200000',compositions:{single:main(),double:{...main(),enabled:true,sku:'sub',sellingPrice:'999999',unitCost:'999999',conversionRate:'1',plannedQuantity:'999'}},costPlan:{adCost:'100000',guestCost:'50000',administrationCost:'0',otherCost:'0',shippingRate:'3800',shippingBasis:'sets',shippingCount:'',quantityRounding:'floor',moneyRounding:'round',pplProcessingMonth:''},gifts:[{id:'gift',side:'single',item:'사은품',units:'1',unitCost:'1200'},{id:'subgift',side:'double',item:'서브 사은품',units:'10',unitCost:'999999'}],result:{...newResult(),single:{...newResult().single,quantity:'999',conversionRate:'5'},profit:'12345'}});
function scenario(x,q){const r=newResult();r.single.quantity=String(q);r.single.conversionRate=x.compositions.single.conversionRate;r.pplCost=x.result?.pplCost||'';return {...x,compositions:{single:{...x.compositions.single,enabled:true},double:{...x.compositions.double,enabled:false}},gifts:x.gifts.filter(g=>g.side!=='double'),result:r};}

test('main-only BEP uses planned conversion, allocated PPL and eligible gifts, without modifying actuals or planned mix',()=>{
 const x=item(),before=structuredClone(x),b=mainBreakEven(x);
 assert.equal(b.status,'ready');assert.equal(b.contribution,35000);assert.equal(b.fixed,350000);
 assert.equal(b.orders,13);assert.equal(b.shipments,10);assert.equal(b.net,1300000);assert.equal(b.gross,1430000);assert.equal(b.profit,0);
 assert.ok(costCalculation(scenario(x,12)).profit<0);assert.deepEqual(x,before);
 x.compositions.double.sellingPrice='';x.compositions.double.conversionRate='';x.gifts[1].unitCost='';
 assert.deepEqual(mainBreakEven(x),b);
});
test('rounding at the order-to-shipment boundary changes minimum orders and final figures agree with existing calculation',()=>{
 const x=item();x.costPlan.quantityRounding='round';const b=mainBreakEven(x);
 assert.equal(b.orders,12);assert.equal(b.shipments,10);
 assert.ok(costCalculation(scenario(x,11)).profit<0);
 x.compositions.single.vatBasis='포함';x.compositions.single.sellingPrice='110000';
 const inc=mainBreakEven(x),s=scenario(x,inc.orders);
 assert.equal(inc.net,orderCalculation(s).net);assert.equal(inc.profit,costCalculation(s).profit);
});
test('missing or unsupported inputs remain unknown; zero costs and no PPL remain valid',()=>{
 const x=item();x.costPlan.adCost='';x.compositions.single.conversionRate='';
 const b=mainBreakEven(x);assert.equal(b.status,'missing');assert.equal(b.orders,null);assert.ok(b.issues.includes('홈쇼핑 정액 방송비'));assert.ok(b.issues.includes('메인 계획 예상 전환율'));
 const manual=item();manual.costPlan.shippingBasis='manual';manual.costPlan.shippingCount='10';assert.match(mainBreakEven(manual).issues.join(' '),/별도 입력/);
 const unknown=item();unknown.ppl='미정';assert.equal(mainBreakEven(unknown).status,'missing');
 const none=item();none.ppl='없음';none.costPlan.adCost='0';none.costPlan.guestCost='0';assert.equal(mainBreakEven(none).orders,0);assert.equal(mainBreakEven(none).profit,0);
});
test('zero conversion, nonpositive margin and out-of-range quantities never yield Infinity or misleading zero BEP',()=>{
 for(const [key,value] of [['conversionRate','0'],['commission','100'],['unitCost','999999']]){
  const x=item();x.compositions.single[key]=value;const b=mainBreakEven(x);assert.equal(b.status,'unreachable');assert.equal(b.orders,null);
 }
 const x=item();x.compositions.single.conversionRate='0.00000001';assert.equal(mainBreakEven(x).status,'limit');
});
test('BEP matches exhaustive first nonnegative profit across VAT, fees, gifts, rounding and conversion scenarios',()=>{
 for(const quantityRounding of ['floor','round'])for(const moneyRounding of ['floor','round'])for(const rate of [12.5,33.3,80,100])for(const vatBasis of ['포함','별도']){
  const x=item();Object.assign(x.compositions.single,{sellingPrice:'110.37',commission:'12.75',units:'1',unitCost:'17.83',conversionRate:String(rate),vatBasis});
  Object.assign(x.costPlan,{adCost:'17.35',guestCost:'0',shippingRate:'2.31',quantityRounding,moneyRounding});x.allocation='123.25';x.gifts=[{id:'g',side:'both',item:'공통',units:'2',unitCost:'0.37'}];
  const b=mainBreakEven(x);let first=null;
  for(let q=0;q<1000;q++)if(costCalculation(scenario(x,q)).profit>=0){first=q;break;}
  assert.equal(b.status,'ready');assert.equal(b.orders,first,JSON.stringify({quantityRounding,moneyRounding,rate,vatBasis}));
 }
});
test('rounding can create an earlier crossing even at a tiny positive margin',()=>{
 const x=item();Object.assign(x.compositions.single,{sellingPrice:'2.01',vatBasis:'별도',commission:'0',units:'1',unitCost:'1',conversionRate:'100'});
 Object.assign(x.costPlan,{adCost:'0',guestCost:'0',shippingRate:'1',moneyRounding:'round'});x.allocation='1';x.gifts=[];
 const b=mainBreakEven(x);let first=0;while(costCalculation(scenario(x,first)).profit<0)first++;
 assert.equal(b.orders,first);assert.ok(b.orders<100);
});
test('sheet export appends BEP to existing calculation rows and clears stale figures when inputs become incomplete',()=>{
 const x=item(),headers=workflowHeaders.SCM_계산기준;
 const row=workflowRows(x,1).find(r=>r.range.includes('SCM_계산기준'));
 assert.equal(row.values[0].length,headers.length);assert.equal(row.values[0][headers.indexOf('BEP 주문수량')],13);
 x.costPlan.shippingRate='';const blank=workflowRows(x,1).find(r=>r.range.includes('SCM_계산기준')).values[0];
 assert.equal(blank[headers.indexOf('BEP 주문수량')],'');assert.match(blank[headers.indexOf('BEP 상태')],/배송단가/);
});
