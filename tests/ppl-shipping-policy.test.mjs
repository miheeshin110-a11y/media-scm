import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFinanceAction,emptyFinance,allocationValues,withFinance,contractTotals} from '../lib/finance-model.ts';
import {broadcastCostParts,previewAllocationCosts} from '../lib/ppl-broadcast-cost.ts';
import {costCalculation,computedItem,compositions,costPlan,initializeShipping} from '../lib/workflow.ts';
import {newResult} from '../lib/scm-model.ts';
import {financeSheetRows} from '../lib/finance-sheets.ts';
import {store} from './postgres-fixture.mjs';
import {saveFinance} from '../lib/finance-store.ts';
import {saveRecord} from '../lib/record-store.ts';
const now='2026-11-09T00:00:00Z';let seq=0;const uuid=()=>`cost-policy-${++seq}`;
const contract=(net='60000000')=>({id:'C',code:'PPL-C',name:'임시 계약',party:'임시',businessNo:'',channel:'JTBC',approvalNo:'',date:'',notes:'',net,tax:String(Math.floor(Number(net)/10)),tradeType:'agency',agencyRate:'10'});
const finance=()=>({...emptyFinance(),contracts:[contract()]});
const apply=(f,rows)=>applyFinanceAction(f,{kind:'allocations',data:{contractId:'C',rows}},new Set(['A','B']),now,uuid);
const draft=(broadcastId,net,id='')=>({id,broadcastId,net,month:'2026-11'});
function item(id='A'){
 const b={id,date:'2026-11-09',time:'10:00',channel:'SK',item:'임시',shortItem:'임시',owner:'검증',status:'편성확정',urgent:false,ppl:'있음',program:'',pplKind:'',price:'',target:'',rate:'',contractId:'',contractAmount:'',allocation:'0',allocationManaged:true,attribution:'',sync:'대기',calculationMode:'auto',result:newResult()};
 b.compositions=compositions(b);Object.assign(b.compositions.single,{units:'2',unitCost:'10',sellingPrice:'100',commission:'0',vatBasis:'별도'});b.compositions.double.enabled=false;
 Object.assign(b.result.single,{quantity:'10',conversionRate:'100'});b.costPlan={...costPlan(b),adCost:'0',guestCost:'0',administrationCost:'0',otherCost:'0',shippingRate:'2',shippingBasis:'manual',shippingCount:'7',quantityRounding:'floor',moneyRounding:'floor'};return computedItem(b);
}
test('original 60m contract splits 40m/20m while broadcast costs are 36m/18m, preserving VAT and trace IDs',()=>{
 const f=apply(finance(),[draft('A','40000000'),draft('B','20000000')]);
 assert.deepEqual(f.allocations.map(a=>a.net),['40000000','20000000']);assert.deepEqual(f.allocations.map(a=>a.broadcastCost),['36000000','18000000']);assert.deepEqual(f.allocations.map(a=>a.agencyFee),['4000000','2000000']);
 assert.deepEqual(contractTotals(f,'C').remaining,{net:'0',tax:'0'});assert.equal(allocationValues(f,'A').net,'40000000');assert.equal(allocationValues(f,'A').costNet,'36000000');
 const b=withFinance(item(),f);assert.equal(b.allocation,'40000000');assert.equal(b.result.pplCost,'36000000');assert.equal(b.result.profit,String(1000-200-14-36000000));
 const rows=financeSheetRows(f).find(g=>g.range.startsWith("'SCM_방송배분'"));assert.deepEqual(rows.values[1].slice(-3),['36000000','4000000','대행료 차감 후']);
});
test('integer fees reconcile on uneven splits, edits and zero/100 percent; direct contracts have no fee',()=>{
 for(const rate of ['0','10','12.34','100']){const c={...contract('101'),agencyRate:rate};const parts=broadcastCostParts(c,['33','68']);assert.equal(parts.reduce((n,p)=>n+Number(p.cost)+Number(p.fee),0),101);assert.equal(parts.reduce((n,p)=>n+Number(p.fee),0),Math.floor(101*Number(rate)/100));}
 assert.deepEqual(broadcastCostParts({...contract(),tradeType:'direct'},['40000000']),[{fee:'0',cost:'40000000'}]);
 const base={...finance(),contracts:[contract('101')]},first=apply(base,[draft('A','33'),draft('B','68')]),edited=apply(first,[draft('A','34',first.allocations[0].id),draft('B','67',first.allocations[1].id)]);
 assert.equal(edited.allocations.reduce((n,a)=>n+Number(a.broadcastCost),0),91);assert.deepEqual(edited.allocations.map(a=>a.id),first.allocations.map(a=>a.id));
 const previews=previewAllocationCosts(edited.contracts[0],first.allocations,edited.allocations.map(a=>({...a,key:a.id})));assert.equal(previews.get(edited.allocations[1].id).cost,edited.allocations[1].broadcastCost);
 assert.deepEqual(broadcastCostParts(contract(),['']),[null]);
});
test('legacy allocations and existing manual delivery costs remain unchanged on reads and unchanged allocation saves',()=>{
 const f=finance();f.allocations=[{id:'old',code:'ALLOC-old',contractId:'C',broadcastId:'A',net:'40000000',tax:'4000000',month:'2026-11',active:true}];
 const original=withFinance(item(),f),before=structuredClone(original),next=apply(f,[draft('A','40000000','old')]);assert.equal(next.allocations[0].broadcastCost,undefined);
 assert.deepEqual(withFinance(original,next).result,before.result);assert.equal(initializeShipping(original,original),original);assert.equal(costCalculation(original).shippingCount,7);
 const alteredTerms={...f,contracts:[{...f.contracts[0],agencyRate:'20'}]};assert.deepEqual(withFinance(original,alteredTerms).result,before.result);
 const changed=apply(f,[draft('A','30000000','old')]);assert.equal(changed.allocations[0].broadcastCost,'27000000');
});
test('new delivery defaults to the sum of rounded shipment sets; blanks, zero and disabled sides are distinct',()=>{
 const b=item();b.costPlan.shippingBasis='';const n=initializeShipping(b);assert.equal(n.costPlan.shippingBasis,'sets');assert.equal(b.costPlan.shippingBasis,'');
 assert.equal(costCalculation(n).shippingCount,10);assert.equal(costCalculation(n).shippingCost,20);
 n.compositions.double={...n.compositions.single,enabled:true};n.result.single.quantity='11';n.result.single.conversionRate='72';n.result.double={...n.result.single,quantity:'3'};
 assert.equal(costCalculation(n).shippingCount,9);n.costPlan.quantityRounding='round';assert.equal(costCalculation(n).shippingCount,10);
 n.result.double.conversionRate='';assert.equal(costCalculation(n).shippingCount,null);assert.equal(costCalculation(n).shippingCost,null);
 n.compositions.double.enabled=false;assert.equal(costCalculation(n).shippingCount,8);n.result.single.quantity='0';assert.equal(costCalculation(n).shippingCount,0);assert.equal(costCalculation(n).shippingCost,0);
 n.result.single.quantity='';assert.equal(costCalculation(n).shippingCount,null);n.costPlan.shippingBasis='manual';n.costPlan.shippingCount='3';assert.equal(initializeShipping(n).costPlan.shippingBasis,'manual');assert.equal(costCalculation(n).shippingCount,3);
});
test('PostgreSQL new allocation stores separate broadcast cost without migrating unrelated historical cost or profit',async()=>{
 const db=await store();try{
 const f=finance();f.version=1;f.allocations=[{id:'legacy-B',code:'ALLOC-old',contractId:'C',broadcastId:'B',net:'20000000',tax:'2000000',month:'2026-11',active:true}];
 for(const id of ['A','B'])await saveRecord(db,withFinance(item(id),f),0,'seed-'+id,'actor','hash');
 await db.prepare("INSERT INTO scm_finance(id,payload,version,request_id,state) VALUES(1,?,1,'seed','sent')").bind(JSON.stringify(f)).run();
 const old=await db.prepare("SELECT payload FROM scm_records WHERE id='B'").first();
 const saved=await saveFinance(db,{kind:'allocation',data:{contractId:'C',broadcastId:'A',net:'40000000',month:'2026-11'}},1,'agency-new','actor','hash',[]);
 const row=JSON.parse((await db.prepare("SELECT payload FROM scm_records WHERE id='A'").first()).payload);assert.equal(row.allocation,'40000000');assert.equal(row.pplBroadcastCost,'36000000');assert.equal(row.result.pplCost,'36000000');
 assert.deepEqual(await db.prepare("SELECT payload FROM scm_records WHERE id='B'").first(),old);
 const replay=await saveFinance(db,{kind:'allocation',data:{contractId:'C',broadcastId:'A',net:'40000000',month:'2026-11'}},1,'agency-new','actor','hash',[]);assert.deepEqual(replay,saved);
 }finally{await db.close();}
});

test('same principal opts in per allocation, preserving all unselected legacy and previously calculated costs',()=>{
 const f=finance();f.allocations=[{id:'old-A',code:'A',contractId:'C',broadcastId:'A',net:'40000000',tax:'4000000',month:'2026-11',active:true},{id:'old-B',code:'B',contractId:'C',broadcastId:'B',net:'20000000',tax:'2000000',month:'2026-11',active:true,broadcastCost:'18500000',agencyFee:'1500000'}];
 const before=structuredClone(f),rows=[{...draft('A','40000000','old-A'),applyAgencyCost:true},draft('B','20000000','old-B')];
 const next=apply(f,rows);assert.deepEqual(f,before);
 assert.equal(next.allocations[0].net,'40000000');assert.equal(next.allocations[0].broadcastCost,'36000000');assert.equal(next.allocations[0].agencyFee,'4000000');assert.equal(next.allocations[1].broadcastCost,'18500000');assert.equal(next.allocations[1].agencyFee,'1500000');
 assert.equal(next.allocations[0].applyAgencyCost,undefined);assert.deepEqual(contractTotals(next,'C').remaining,{net:'0',tax:'0'});
 const repeated=apply(next,rows);assert.equal(repeated.allocations[0].broadcastCost,'36000000','always deduct from principal, never deduct twice');
 const unchecked=apply(f,rows.map(r=>({...r,applyAgencyCost:false})));assert.equal(unchecked.allocations[0].broadcastCost,undefined);assert.equal(unchecked.allocations[1].broadcastCost,'18500000');
 const previews=previewAllocationCosts(f.contracts[0],f.allocations,rows.map(r=>({...r,key:r.id})));assert.equal(previews.get('old-A').cost,'36000000');assert.equal(previews.get('old-B').cost,'18500000');
});
test('same-amount single save and preview agree; bad opt-in types and inapplicable contracts are rejected',()=>{
 const f=finance();f.allocations=[{id:'old-A',code:'A',contractId:'C',broadcastId:'A',net:'20000000',tax:'2000000',month:'2026-11',active:true}];
 const action={kind:'allocation',data:{...draft('A','20000000','old-A'),contractId:'C',applyAgencyCost:true}};
 const next=applyFinanceAction(f,action,new Set(['A']),now,uuid);assert.equal(next.allocations[0].broadcastCost,'18000000');
 const unselected=applyFinanceAction(f,{...action,data:{...action.data,applyAgencyCost:false}},new Set(['A']),now,uuid);assert.equal(unselected.allocations[0].broadcastCost,undefined);
 for(const value of ['true','false',1,null])assert.throws(()=>applyFinanceAction(f,{...action,data:{...action.data,applyAgencyCost:value}},new Set(['A']),now,uuid),/選択|선택/);
 assert.throws(()=>applyFinanceAction({...f,contracts:[{...f.contracts[0],tradeType:'direct'}]},action,new Set(['A']),now,uuid),/대행 거래/);
 assert.throws(()=>applyFinanceAction({...f,contracts:[{...f.contracts[0],agencyRate:''}]},action,new Set(['A']),now,uuid),/대행료율/);
});
test('PostgreSQL explicit same-amount application audits only the selected broadcast and preserves its goods costs',async()=>{
 const db=await store();try{
 const f=finance();f.version=1;f.allocations=[{id:'old-A',code:'A',contractId:'C',broadcastId:'A',net:'40000000',tax:'4000000',month:'2026-11',active:true},{id:'old-B',code:'B',contractId:'C',broadcastId:'B',net:'20000000',tax:'2000000',month:'2026-11',active:true}];
 for(const id of ['A','B'])await saveRecord(db,withFinance(item(id),f),0,'opt-seed-'+id,'actor','hash');
 await db.prepare("INSERT INTO scm_finance(id,payload,version,request_id,state) VALUES(1,?,1,'seed','sent')").bind(JSON.stringify(f)).run();
 const beforeA=JSON.parse((await db.prepare("SELECT payload FROM scm_records WHERE id='A'").first()).payload),beforeB=await db.prepare("SELECT payload,version FROM scm_records WHERE id='B'").first();
 const action={kind:'allocations',data:{contractId:'C',rows:[{...draft('A','40000000','old-A'),applyAgencyCost:true},{...draft('B','20000000','old-B'),applyAgencyCost:false}]}};
 const saved=await saveFinance(db,action,1,'opt-apply','actor','hash',[]);
 const afterA=JSON.parse((await db.prepare("SELECT payload FROM scm_records WHERE id='A'").first()).payload);
 assert.equal(afterA.result.goodsCost,beforeA.result.goodsCost);assert.deepEqual(afterA.compositions,beforeA.compositions);assert.deepEqual(afterA.costPlan,beforeA.costPlan);assert.equal(afterA.result.pplCost,'36000000');assert.equal(Number(withFinance(afterA,saved).result.profit)-Number(beforeA.result.profit),4000000);
 assert.deepEqual(await db.prepare("SELECT payload,version FROM scm_records WHERE id='B'").first(),beforeB);
 assert.equal((await db.prepare("SELECT count(*)::int AS n FROM scm_revisions WHERE record_id='B'").first()).n,1);
 const replay=await saveFinance(db,action,1,'opt-apply','actor','hash',[]);assert.deepEqual(replay,saved);assert.equal((await db.prepare("SELECT count(*)::int AS n FROM scm_revisions WHERE record_id='A'").first()).n,2);
 }finally{await db.close();}
});
