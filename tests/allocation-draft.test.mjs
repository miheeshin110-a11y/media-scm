import test from 'node:test';
import assert from 'node:assert/strict';
import {addCreatedBroadcast} from '../lib/allocation-draft.ts';
import {store} from './postgres-fixture.mjs';
import {saveFinance} from '../lib/finance-store.ts';
import {saveRecord} from '../lib/record-store.ts';
import {validateItem} from '../lib/scm-model.ts';
import {validateWorkflow} from '../lib/workflow.ts';
const row=(id,key=id)=>({id:'',key,broadcastId:id,month:'2026-10',net:'',airing:{date:'2026-10-27',time:'09:00',kind:'본방'}});
test('PPL-first allocation starts with the newly registered broadcast and no duplicate',()=>{
 const fresh=row('new-home');
 const first=addCreatedBroadcast([],fresh);
 assert.deepEqual(first,[fresh]);
 assert.deepEqual(addCreatedBroadcast(first,fresh),first);
});
test('creating a missing broadcast preserves previously entered amount, month and airing',()=>{
 const saved={...row('existing'),id:'allocation-1',net:'1000000'};
 const unfinished={...row('','draft-1'),net:'2000000',month:'2026-11',airing:{id:'rerun',date:'2026-11-01',time:'10:00',kind:'재방'}};
 const next=addCreatedBroadcast([saved,unfinished],row('new-home'));
 assert.deepEqual(next[0],saved);
 assert.deepEqual(next[1],{...unfinished,broadcastId:'new-home'});
 assert.equal(unfinished.broadcastId,'');
});
test('PPL can be persisted before any home-shopping broadcast, then allocated to a partial broadcast',async()=>{
 const db=await store();try{
  const airing={id:'first',date:'2026-10-27',time:'09:00',kind:'본방'};
  let f=await saveFinance(db,{kind:'contract',data:{party:'주식회사 미디어상생',businessNo:'7578802005',channel:'TV조선',program:'테스트 프로그램',approvalNo:'',date:'',net:'40000000',tax:'4000000',notes:'',tradeType:'direct',airings:[airing]}},0,'ppl-first','actor','first',[]);
  assert.equal(f.contracts.length,1);assert.equal(f.allocations.length,0);
  const draft={id:'quick-home',date:'',time:'',channel:'',item:'파라다이스',shortItem:'파라다이스',owner:'',status:'',urgent:false,ppl:'미정',program:'',pplKind:'',price:'',target:'',rate:'',contractId:'',contractAmount:'',allocation:'',attribution:'',sync:'대기',workflow:'작성 중',calculationMode:'auto',dateConvention:'actual'};
  assert.deepEqual(validateItem(draft),[]);assert.deepEqual(validateWorkflow(draft),[]);
  const saved=await saveRecord(db,draft,0,'quick-create','actor','quick',f.version);
  assert.equal(saved.workflow,'작성 중');assert.equal(saved.date,'');
  f=await saveFinance(db,{kind:'allocations',data:{contractId:f.contracts[0].id,rows:[{id:'',broadcastId:saved.id,month:'2026-10',net:'10000000',airing}]}},f.version,'quick-allocate','actor','alloc',[]);
  assert.equal(f.allocations.filter(a=>a.active).length,1);
  assert.equal(f.allocations[0].broadcastId,saved.id);assert.equal(f.allocations[0].net,'10000000');
  assert.equal(f.contracts[0].net,'40000000');
 }finally{await db.close();}
});
