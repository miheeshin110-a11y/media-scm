import test from 'node:test';
import assert from 'node:assert/strict';
import {store} from './postgres-fixture.mjs';
import {emptyFinance} from '../lib/finance-model.ts';
import {emptyLogistics} from '../lib/logistics.ts';
import {testResetPlan,resetTestTransactions,restoreTestBackup} from '../lib/test-reset.ts';
test('test cleanup archives transactions, preserves every master and can restore without overwriting new work',async()=>{
 const db=await store();try{
  const f={...emptyFinance(),version:1,contracts:[{id:'C'}],allocations:[{id:'A',active:true}],invoices:[{id:'I'}],taxImports:[{id:'T'}],costHistory:[{id:'COST'}],salesCompositions:[{code:'DT',name:'actual'}],giftItems:[{id:'G'}],programs:[{id:'P'}],parties:[{id:'PARTY'}],logistics:{...emptyLogistics(),skus:[{code:'DT',name:'set',unit:'세트'}],boms:[{id:'BOM'}],setContents:[{id:'CONTENTS'}],snapshots:[{id:'STOCK'}],inbounds:[{id:'IN'}],releases:[{id:'TEST-REQ'}],events:[{id:'TEST-EVENT'}]}};
  await db.prepare("INSERT INTO scm_finance(id,payload,version,request_id,state) VALUES(1,?,1,'seed','sent')").bind(JSON.stringify(f)).run();
  await db.prepare("INSERT INTO scm_records(id,payload,version,updated_at,updated_by) VALUES('B',?,2,'now','tester')").bind(JSON.stringify({id:'B',result:{profit:'7000000'}})).run();
  await db.prepare("INSERT INTO scm_outbox(record_id,version,state,updated_at) VALUES('B',2,'sent','now')").run();
  const before=(await db.prepare('SELECT * FROM scm_records').all()).results;
  const plan=await testResetPlan(db);assert.equal(plan.counts.broadcasts,1);assert.equal(plan.counts.sets,1);
  await assert.rejects(()=>resetTestTransactions(db,'wrong','tester'));assert.deepEqual((await db.prepare('SELECT * FROM scm_records').all()).results,before);
  const reset=await resetTestTransactions(db,plan.token,'tester');assert.equal(reset.removedBroadcasts,1);
  const cleaned=JSON.parse((await db.prepare('SELECT payload FROM scm_finance').first()).payload);
  for(const key of ['contracts','allocations','invoices','taxImports'])assert.deepEqual(cleaned[key],[]);
  for(const key of ['costHistory','salesCompositions','giftItems','programs','parties'])assert.deepEqual(cleaned[key],f[key]);
  for(const key of ['skus','boms','setContents','snapshots','inbounds'])assert.deepEqual(cleaned.logistics[key],f.logistics[key]);
  assert.deepEqual(cleaned.logistics.releases,[]);assert.deepEqual(cleaned.logistics.events,[]);
  assert.equal((await testResetPlan(db)).counts.broadcasts,0);
  const backed=JSON.parse((await db.prepare('SELECT before_payload FROM scm_finance_revisions WHERE request_id=?').bind(reset.backupId).first()).before_payload);assert.deepEqual(backed.records,before);assert.deepEqual(backed.finance,f);
  await restoreTestBackup(db,reset.backupId,(await testResetPlan(db)).token,'tester');assert.deepEqual((await db.prepare('SELECT * FROM scm_records').all()).results,before);
  const restored=JSON.parse((await db.prepare('SELECT payload FROM scm_finance').first()).payload);assert.equal(restored.version,3);assert.deepEqual(restored.logistics,f.logistics);
  const occupiedPlan=await testResetPlan(db);await assert.rejects(()=>restoreTestBackup(db,reset.backupId,occupiedPlan.token,'tester'));
 }finally{await db.close();}
});
