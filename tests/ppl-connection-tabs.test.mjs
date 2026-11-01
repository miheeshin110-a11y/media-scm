import test from 'node:test';
import assert from 'node:assert/strict';
import {pplConnectionTabs} from '../lib/ppl-connection-tabs.ts';
import {unifiedResult} from '../lib/scm-model.ts';
import {emptyFinance,withFinance} from '../lib/finance-model.ts';
import {saveFinance} from '../lib/finance-store.ts';
import {store} from './postgres-fixture.mjs';
import {broadcastTables} from '../lib/sheet-sync-tables.ts';

test('zero or one PPL always has an optional empty second tab and creates no blank allocation',()=>{
 const f=emptyFinance(),item={id:'b',pplLinks:[]};
 assert.deepEqual(pplConnectionTabs(item,f),{slots:['',''],active:0});
 f.allocations=[{active:true,broadcastId:'b',contractId:'one'}];
 assert.deepEqual(pplConnectionTabs(item,f),{slots:['one',''],active:0});
 assert.equal(f.allocations.length,1);
});

test('returning from new PPL registration selects the second tab and preserves the first',()=>{
 const f=emptyFinance();f.allocations=[{active:true,broadcastId:'b',contractId:'one'}];
 const draft={selected:'',slot:1,slots:['one',''],net:'',month:'2026-11'};
 assert.deepEqual(pplConnectionTabs({id:'b'},f,draft,'two'),{slots:['one','two'],active:1});
 assert.deepEqual(pplConnectionTabs({id:'b'},f,draft,'one'),{slots:['one',''],active:0});
 assert.deepEqual(draft.slots,['one','']);
});

test('existing links are deduplicated and existing third connections stay reachable',()=>{
 const f=emptyFinance();f.allocations=[{active:true,broadcastId:'b',contractId:'one'},{active:true,broadcastId:'b',contractId:'two'},{active:false,broadcastId:'b',contractId:'removed'},{active:true,broadcastId:'other',contractId:'other'}];
 assert.deepEqual(pplConnectionTabs({id:'b',pplLinks:[{contractRef:'one'},{contractRef:'three'}]},f),{slots:['one','two','three'],active:0});
});

test('two PPL allocations survive reload, sum costs, export both rows and edit independently',async()=>{
 const db=await store();
 try{
  const seed={id:'b',date:'2026-11-01',time:'10:00',item:'테스트',channel:'SK',ppl:'없음',pplLinks:[],allocation:'',result:{...unifiedResult(),pplCost:'0'}};
  const contract=(program,date)=>({party:'주식회사 미디어상생',businessNo:'7578802005',channel:'TV조선',program,date:'',approvalNo:'',net:'10000000',tax:'1000000',notes:'',tradeType:'direct',agencyRate:'0',airings:[{id:'airing-'+date,date,time:'00:30',kind:'본방'}]});
  let f=await saveFinance(db,{kind:'contract',data:contract('프로그램1','2026-10-30')},0,'tab-contract-1','actor','h1',[seed]);
  f=await saveFinance(db,{kind:'contract',data:contract('프로그램2','2026-10-31')},f.version,'tab-contract-2','actor','h2',[seed]);
  for(const [index,net] of ['3000000','2000000'].entries()){
   const c=f.contracts[index];
   f=await saveFinance(db,{kind:'allocation',data:{contractId:c.id,broadcastId:'b',net,month:'2026-11',airing:c.airings[0],taxMode:'auto'}},f.version,'tab-allocate-'+index,'actor','alloc'+index,[seed]);
  }
  let record=withFinance(JSON.parse((await db.prepare('SELECT payload FROM scm_records WHERE id=?').bind('b').first()).payload),f);
  assert.equal(record.pplLinks.length,2);assert.equal(record.allocation,'5000000');assert.equal(record.result.pplCost,'5000000');
  assert.deepEqual(pplConnectionTabs(record,f).slots,f.contracts.map(c=>c.id));
  assert.equal(broadcastTables(record).find(t=>t.title==='SCM_PPL연결').rows.length,2);
  const second=f.allocations[1];
  f=await saveFinance(db,{kind:'allocation',data:{...second,net:'4000000'}},f.version,'tab-edit-2','actor','edit',[seed]);
  record=withFinance(JSON.parse((await db.prepare('SELECT payload FROM scm_records WHERE id=?').bind('b').first()).payload),f);
  assert.equal(f.allocations[0].net,'3000000');assert.equal(record.allocation,'7000000');assert.equal(record.pplLinks.length,2);
  await assert.rejects(saveFinance(db,{kind:'allocation',data:{...second,id:'',net:'1'}},f.version,'duplicate-tab','actor','dup',[seed]),/같은 계약과 방송/);
 }finally{await db.close();}
});
