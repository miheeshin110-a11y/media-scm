import test from 'node:test';
import assert from 'node:assert/strict';
import {costAt,selectCost,resolveBroadcastCosts,appliedUnitCost} from '../lib/cost-history.ts';
import {applyFinanceAction,emptyFinance,withFinance} from '../lib/finance-model.ts';
import {canSaveFinance} from '../lib/finance-access.ts';
import {readFinance,saveFinance} from '../lib/finance-store.ts';
import {saveRecord} from '../lib/record-store.ts';
import {compositions,costPlan,costCalculation,computedItem} from '../lib/workflow.ts';
import {mainBreakEven} from '../lib/break-even.ts';
import {newResult} from '../lib/scm-model.ts';
import {store} from './postgres-fixture.mjs';

const action=(data={})=>({kind:'costHistory',data:{kind:'product',itemId:'',name:'시험 상품',unit:'박스',effectiveFrom:'2026-10-01',unitCost:'1000',...data}});
const add=(f,data={})=>applyFinanceAction(f,action(data),new Set());
function master(){let f=add(emptyFinance());const id=f.costHistory[0].itemId;f=add(f,{itemId:id,effectiveFrom:'2026-11-01',unitCost:'2000'});return f;}
function broadcast(){
 const b={id:'temporary-cost-broadcast',date:'2026-10-15',time:'10:00',channel:'SK',item:'시험 상품',shortItem:'시험 상품',owner:'테스트',status:'편성확정',urgent:false,ppl:'없음',program:'',pplKind:'',price:'',target:'',rate:'',contractId:'',contractAmount:'',allocation:'',attribution:'',sync:'대기',calculationMode:'auto',result:newResult()};
 b.compositions=compositions(b);b.compositions.single={...b.compositions.single,enabled:true,units:'2',unitCost:'777',costDate:'2026-10-15',sellingPrice:'10000',commission:'0',vatBasis:'별도',conversionRate:'100'};b.compositions.double.enabled=false;
 b.costPlan={...costPlan(b),adCost:'0',guestCost:'0',administrationCost:'0',otherCost:'0',shippingRate:'0',shippingBasis:'sets',quantityRounding:'floor',moneyRounding:'floor'};
 b.result.single.quantity='10';b.result.single.conversionRate='100';return b;
}

test('dated history chooses the latest eligible record including its first day, never a future cost',()=>{
 const f=master(),id=f.costHistory[0].itemId;
 assert.equal(costAt(f,id,'product','2026-09-30'),undefined);
 assert.equal(costAt(f,id,'product','2026-10-01').unitCost,'1000');
 assert.equal(costAt(f,id,'product','2026-10-31').unitCost,'1000');
 assert.equal(costAt(f,id,'product','2026-11-01').unitCost,'2000');
 assert.equal(costAt(f,id,'product','2026-02-30'),undefined);
 assert.equal(costAt(f,id,'gift','2026-11-01'),undefined);
});

test('history is append-only, validates units/date/cost and rejects duplicate dates and unknown items',()=>{
 const f=master(),before=structuredClone(f),id=f.costHistory[0].itemId;
 for(const data of [{unitCost:''},{unitCost:'-1'},{unitCost:'NaN'},{unitCost:'1.234'},{unitCost:'1000000000001'},{effectiveFrom:'2026-02-30'},{name:''},{unit:''},{kind:'other'},{itemId:7},{itemId:'unknown'}])assert.throws(()=>add(f,data));
 assert.throws(()=>add(f,{itemId:id,effectiveFrom:'2026-10-01'}),/이미/);
 assert.throws(()=>add(f,{itemId:id,unit:'병',effectiveFrom:'2026-12-01'}),/단위/);
 const next=add(f,{itemId:id,effectiveFrom:'2026-12-01',unitCost:'0'});
 assert.deepEqual(f,before);assert.equal(next.costHistory.at(-1).unitCost,'0');
 assert.equal(next.costHistory.length,3);
 assert.equal(canSaveFinance('costHistory',false),false);assert.equal(canSaveFinance('costHistory',true),true);
});

test('product and gift dates feed profit and BEP from saved costs; empty history is unknown, not zero',()=>{
 let f=master(),b=broadcast();const id=f.costHistory[0].itemId;
 b.compositions.single={...b.compositions.single,...selectCost(f,'product',id,'2026-10-15')};
 b=resolveBroadcastCosts(b,undefined,f);
 assert.equal(costCalculation(b).profit,80000);
 f=add(f,{kind:'gift',name:'시험 사은품',unit:'개',effectiveFrom:'2026-10-01',unitCost:'500'});
 const gid=f.costHistory.at(-1).itemId;
 b.gifts=[{id:'gift-one',side:'single',item:'시험 사은품',units:'1',...selectCost(f,'gift',gid,'2026-10-15')}];
 assert.equal(computedItem(b).result.profit,'75000');
 b.compositions.single={...b.compositions.single,...selectCost(f,'product',id,'2026-11-01')};
 assert.equal(computedItem(b).result.profit,'55000');
 assert.equal(mainBreakEven(b).contribution,5500);
 b.compositions.single={...b.compositions.single,...selectCost(f,'product',id,'2026-09-30')};
 assert.equal(costCalculation(b).profit,null);assert.equal(computedItem(b).result.profit,'');
 assert.equal(mainBreakEven(b).status,'missing');
});

test('legacy broadcast costs and profits do not change when history is introduced',()=>{
 const f=master(),b=broadcast();b.calculationMode='legacy';b.result.profit='123456';
 b.gifts=[{id:'legacy-gift',side:'single',item:'기존 사은품',units:'1',unitCost:'333'}];
 const original=structuredClone(b),resolved=resolveBroadcastCosts(b,original,f);
 assert.deepEqual(resolved,original);
 assert.equal(withFinance(resolved,f).result.profit,'123456');
 assert.equal(resolved.compositions.single.unitCost,'777');assert.equal(resolved.gifts[0].unitCost,'333');
 const auto=broadcast(),profit=computedItem(auto).result.profit;
 assert.equal(computedItem(resolveBroadcastCosts(auto,auto,f)).result.profit,profit);
});

test('saved snapshots stay frozen after backdated additions; explicit reapply or changing date resolves anew',()=>{
 let f=master(),b=broadcast();const id=f.costHistory[0].itemId;
 b.compositions.single={...b.compositions.single,...selectCost(f,'product',id,'2026-10-15')};
 const old=computedItem(resolveBroadcastCosts(b,undefined,f));
 f=add(f,{itemId:id,effectiveFrom:'2026-10-10',unitCost:'1500'});
 const stable=resolveBroadcastCosts(structuredClone(old),old,f);
 assert.deepEqual(stable,old);assert.equal(computedItem(stable).result.profit,'80000');
 const forged=structuredClone(old);forged.compositions.single.unitCost='1';forged.compositions.single.costSnapshot.unitCost='1';
 assert.equal(resolveBroadcastCosts(forged,old,f).compositions.single.unitCost,'1000');
 const refreshed=structuredClone(old);Object.assign(refreshed.compositions.single,selectCost(f,'product',id,'2026-10-15'));
 assert.equal(computedItem(resolveBroadcastCosts(refreshed,old,f)).result.profit,'70000');
 const changed=structuredClone(old);changed.compositions.single.costDate='2026-11-01';
 assert.equal(appliedUnitCost(changed.compositions.single),'');
 assert.equal(computedItem(resolveBroadcastCosts(changed,old,f)).result.profit,'60000');
 const dateOnly=structuredClone(old);dateOnly.date='2026-12-01';
 assert.equal(resolveBroadcastCosts(dateOnly,old,f).compositions.single.unitCost,'1000');
});

test('server canonicalizes managed costs, rejects wrong categories, and supports independent gift dates',()=>{
 let f=master(),b=broadcast();const id=f.costHistory[0].itemId;
 b.compositions.single={...b.compositions.single,costItemId:id,costDate:'2026-11-01',unitCost:'1',costSnapshot:{id:'forged'}};
 assert.equal(resolveBroadcastCosts(b,undefined,f).compositions.single.unitCost,'2000');
 b.gifts=[{id:'bad',side:'single',item:'상품을 사은품으로 위장',units:'1',costItemId:id,costDate:'2026-11-01',unitCost:'1'}];
 assert.throws(()=>resolveBroadcastCosts(b,undefined,f),/품목/);
 f=add(f,{kind:'gift',name:'독립 기준일 사은품',unit:'개',effectiveFrom:'2026-10-01',unitCost:'100'});
 const gid=f.costHistory.at(-1).itemId;
 f=add(f,{kind:'gift',itemId:gid,name:'독립 기준일 사은품',unit:'개',effectiveFrom:'2026-11-01',unitCost:'200'});
 b.gifts=[{id:'gift',side:'single',item:'독립 기준일 사은품',units:'1',...selectCost(f,'gift',gid,'2026-10-15')}];
 const resolved=resolveBroadcastCosts(b,undefined,f);
 assert.equal(resolved.gifts[0].unitCost,'100');assert.equal(resolved.compositions.single.unitCost,'2000');
});

test('PGlite history persistence is audited and idempotent without touching broadcast costs, profit, revisions or outbox',async()=>{
 const db=await store();
 try{
  const record=broadcast();record.result.profit='98765';record.calculationMode='legacy';
  await saveRecord(db,record,0,'temporary-broadcast-request','tester','test-hash');
  const before=await db.prepare('SELECT payload,version FROM scm_records').all();
  const revisions=await db.prepare('SELECT * FROM scm_revisions').all();
  const outbox=await db.prepare('SELECT * FROM scm_outbox').all();
  const f=await saveFinance(db,action(),0,'temporary-cost-request-001','reviewer','cost-hash',[]);
  assert.deepEqual(await readFinance(db),f);
  assert.deepEqual(await saveFinance(db,action(),0,'temporary-cost-request-001','reviewer','cost-hash',[]),f);
  assert.equal((await db.prepare('SELECT state FROM scm_finance').first()).state,'sent');
  const snap=broadcast();snap.compositions.single={...snap.compositions.single,...selectCost(f,'product',f.costHistory[0].itemId,'2026-10-15')};
  const saved=await saveRecord(db,computedItem(resolveBroadcastCosts({...snap,id:'snapshot-broadcast'},undefined,f)),0,'temporary-snapshot-request','tester','snapshot-hash',f.version);
  assert.deepEqual((JSON.parse((await db.prepare('SELECT payload FROM scm_records WHERE id=?').bind(saved.id).first()).payload)).compositions.single.costSnapshot,saved.compositions.single.costSnapshot);
  await assert.rejects(()=>saveFinance(db,action({effectiveFrom:'2026-12-01'}),0,'temporary-cost-request-002','reviewer','stale-hash',[]),/먼저 변경/);
  assert.deepEqual((await db.prepare('SELECT payload,version FROM scm_records WHERE id=?').bind(record.id).all()).results,before.results);
  assert.deepEqual((await db.prepare('SELECT * FROM scm_revisions WHERE record_id=?').bind(record.id).all()).results,revisions.results);
  assert.deepEqual((await db.prepare('SELECT * FROM scm_outbox WHERE record_id=?').bind(record.id).all()).results,outbox.results);
  assert.equal((await db.prepare('SELECT actor FROM scm_finance_revisions').first()).actor,'reviewer');
  // Existing PPL allocations must not cause a master-only save to rewrite a broadcast.
  const existing={...f,contracts:[{id:'ppl-contract',code:'PPL-TEST',name:'기존 계약',party:'거래처',businessNo:'1234567890',channel:'SK',approvalNo:'',date:'2026-10-01',notes:'',net:'100',tax:'10'}],allocations:[{id:'allocation',code:'ALLOC-TEST',contractId:'ppl-contract',broadcastId:record.id,month:'2026-10',active:true,net:'100',tax:'10'}]};
  await db.prepare("UPDATE scm_finance SET payload=?,state='pending' WHERE id=1").bind(JSON.stringify(existing)).run();
  const updated=await saveFinance(db,action({itemId:f.costHistory[0].itemId,effectiveFrom:'2026-11-01',unitCost:'2000'}),f.version,'temporary-cost-request-003','reviewer','next-cost-hash',[]);
  assert.equal(updated.costHistory.length,2);
  assert.equal((await db.prepare('SELECT state FROM scm_finance').first()).state,'pending');
  assert.deepEqual((await db.prepare('SELECT payload,version FROM scm_records WHERE id=?').bind(record.id).all()).results,before.results);
  assert.deepEqual((await db.prepare('SELECT * FROM scm_revisions WHERE record_id=?').bind(record.id).all()).results,revisions.results);
  assert.deepEqual((await db.prepare('SELECT * FROM scm_outbox WHERE record_id=?').bind(record.id).all()).results,outbox.results);
 }finally{await db.close();}
});
