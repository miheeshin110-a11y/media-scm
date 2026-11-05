import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {store} from './postgres-fixture.mjs';
import {Database} from '../lib/database.ts';
import {roleForEmail} from '../lib/google-access.ts';
import {saveRecord,SaveConflict} from '../lib/record-store.ts';
import {saveFinance} from '../lib/finance-store.ts';
const config={SCM_REVIEWER_EMAILS:'["mihee@days-on.kr"]',SCM_INPUTTER_EMAILS:'["jeognmuk@days-on.kr"]'};
test('verified Google identities are explicitly allowlisted and roles remain separate',()=>{
 assert.equal(roleForEmail('MIHEE@days-on.kr',true,config),'reviewer');
 assert.equal(roleForEmail('jeognmuk@days-on.kr',true,config),'inputter');
 assert.equal(roleForEmail('mihee@days-on.kr',false,config),null);
 assert.equal(roleForEmail('stranger@days-on.kr',true,config),null);
 assert.equal(roleForEmail('mihee@days-on.kr',true,{}),null);
 assert.equal(roleForEmail('mihee@days-on.kr',true,{SCM_REVIEWER_EMAILS:'broken'}),null);
 const expanded={...config,SCM_ADDITIONAL_REVIEWER_EMAILS:'["mijung@days-on.kr"]'};
 assert.equal(roleForEmail('mijung@days-on.kr',true,expanded),'reviewer');
 assert.equal(roleForEmail('MIJUNG@days-on.kr',true,expanded),'reviewer');
 assert.equal(roleForEmail('mihee@days-on.kr',true,expanded),'reviewer');
 assert.equal(roleForEmail('mijung@days-on.kr',false,expanded),null);
 assert.equal(roleForEmail('stranger@days-on.kr',true,expanded),null);
 assert.equal(roleForEmail('mijung@days-on.kr',true,{...config,SCM_ADDITIONAL_REVIEWER_EMAILS:'broken'}),null);
});
const item=()=>({id:'TEST-0001',date:'2026-09-30',time:'25:00',channel:'SK',item:'테스트',shortItem:'테스트',owner:'검증',status:'계획',urgent:false,ppl:'없음',program:'',pplKind:'',price:'',target:'300000',rate:'',contractId:'',contractAmount:'',allocation:'',attribution:'',sync:'대기',hsTarget:'200000',businessProfitTarget:'10000'});
test('PostgreSQL transaction preserves CAS, request replay, outbox and rollback',async()=>{
 const db=await store();try{
  const first=await saveRecord(db,item(),0,'req-1','actor','hash');
  assert.equal(first.version,1);
  assert.equal((await saveRecord(db,item(),0,'req-1','actor','hash')).version,1);
  const outcomes=await Promise.allSettled([saveRecord(db,{...first,target:'1'},1,'req-2','actor','hash2'),saveRecord(db,{...first,target:'2'},1,'req-3','actor','hash3')]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(r=>r.status==='rejected'&&r.reason instanceof SaveConflict).length,1);
  assert.equal((await db.prepare('SELECT version FROM scm_outbox').first()).version,2);
  await assert.rejects(db.batch([db.prepare("UPDATE scm_records SET version=99"),db.prepare('INSERT INTO missing_table VALUES (1)')]));
  assert.equal((await db.prepare('SELECT version FROM scm_records').first()).version,2);
 }finally{await db.close();}
});
test('PostgreSQL contract allocation and removal update costs, review state, audit and outbox',async()=>{
 const db=await store();try{
  const seed={...item(),workflow:'검토 완료',reviewedBy:'lead',result:{profit:'333',pplCost:'0'}};
  const contract={name:'공동 PPL',party:'주식회사 미디어상생',businessNo:'7578802005',channel:'TV조선',approvalNo:'기안-001',date:'2026-09-17',net:'12000000',tax:'1200000',notes:''};
  let f=await saveFinance(db,{kind:'contract',data:contract},0,'finance-c','actor','hc',[seed]);
  f=await saveFinance(db,{kind:'allocation',data:{contractId:f.contracts[0].id,broadcastId:seed.id,month:'2026-09',net:'5000000',tax:'500000'}},f.version,'finance-a','actor','ha',[seed]);
  let row=JSON.parse((await db.prepare('SELECT payload FROM scm_records').first()).payload);
  assert.equal(row.workflow,'검토 요청');assert.equal(row.allocationManaged,true);assert.equal(row.result.pplCost,'5000000');assert.equal(row.result.profit,'333');
  f=await saveFinance(db,{kind:'voidAllocation',data:{id:f.allocations[0].id}},f.version,'finance-v','actor','hv',[seed]);
  row=JSON.parse((await db.prepare('SELECT payload FROM scm_records').first()).payload);
  assert.equal(row.result.pplCost,'0');assert.equal(row.version,2);
  assert.equal((await db.prepare('SELECT version FROM scm_outbox').first()).version,2);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM scm_revisions').first()).n,2);
 }finally{await db.close();}
});
