import test from 'node:test';
import assert from 'node:assert/strict';
import {store} from './postgres-fixture.mjs';
import {emptyLogistics} from '../lib/logistics.ts';
import {emptyFinance} from '../lib/finance-model.ts';
import {saveFinance} from '../lib/finance-store.ts';
import {saveRecord} from '../lib/record-store.ts';
import {ensureBridge,bridgeStatus,createBridgePair,redeemBridgePair,bridgeDevice,revokeBridge,bridgeHeartbeat,completeBridgeJob,requestBridgeJob,bridgeJobResult,readBridgePreview} from '../lib/ecount-bridge.ts';
const now=Date.parse('2026-11-10T08:00:00Z');
function logistics(){const l=emptyLogistics();l.setContents=[{id:'temporary',compositionCode:'DT-1',effectiveFrom:'2026-11-09',createdAt:'2026-11-09',actor:'tester',lines:[{sku:'V-main',name:'본품',role:'product',quantity:18,unit:'개'},{sku:'V-gift',name:'사은품',role:'gift',quantity:2,unit:'개'}]}];return l;}
async function paired(db){const p=await createBridgePair(db,'임시 물류PC','tester',now),secret=await redeemBridgePair(db,p.code,now);return {...secret,device:await bridgeDevice(db,secret.token,now)};}
test('pair codes are single use, expire, store only hashes and issue warehouse-scoped device identities',async()=>{
 const db=await store();try{const p=await createBridgePair(db,'물류 PC','tester',now),d=await redeemBridgePair(db,p.code,now);
 await assert.rejects(redeemBridgePair(db,p.code,now),/이미 사용/);assert.equal((await bridgeDevice(db,d.token,now)).id,d.deviceId);
 const pairRows=await db.prepare('SELECT * FROM scm_ecount_bridge_pairs').all(),devices=await db.prepare('SELECT * FROM scm_ecount_bridge_devices').all();
 for(const value of [p.code,d.token])assert.ok(!JSON.stringify({pairRows,devices}).includes(value));
 const exp=await createBridgePair(db,'만료 PC','tester',now);await assert.rejects(redeemBridgePair(db,exp.code,now+600001),/만료/);
 await revokeBridge(db,d.deviceId);await assert.rejects(bridgeDevice(db,d.token,now),/해제/);
 }finally{await db.close();}
});
test('offline, sleeping and unconfigured PCs never create jobs or alter stock',async()=>{
 const db=await store();try{const l=logistics(),before=structuredClone(l);await assert.rejects(requestBridgeJob(db,l,now),/PC가 연결되지/);
 const p=await paired(db);await bridgeHeartbeat(db,p.deviceId,false,now);await assert.rejects(requestBridgeJob(db,l,now),/PC가 연결되지/);
 await bridgeHeartbeat(db,p.deviceId,true,now);assert.equal((await bridgeStatus(db,now))[0].online,true);assert.equal((await bridgeStatus(db,now+90001))[0].online,false);await assert.rejects(requestBridgeJob(db,l,now+90001),/PC가 연결되지/);assert.deepEqual(l,before);
 }finally{await db.close();}
});
test('requests deduplicate, one PC claims a job, and results remain previews until explicit inventory apply',async()=>{
 const db=await store();try{const l=logistics(),before=structuredClone(l),a=await paired(db),b=await paired(db);await bridgeHeartbeat(db,a.deviceId,true,now);await bridgeHeartbeat(db,b.deviceId,true,now);
 const request=await requestBridgeJob(db,l,now),again=await requestBridgeJob(db,l,now+1);assert.equal(request.jobId,again.jobId);
 const job=await bridgeHeartbeat(db,a.deviceId,true,now+2);assert.equal(job.id,request.jobId);assert.equal(await bridgeHeartbeat(db,b.deviceId,true,now+3),null);
 await assert.rejects(completeBridgeJob(db,b.device,job.id,{rows:[]},l,now+4),/다른 PC/);
 await completeBridgeJob(db,a.device,job.id,{rows:[{WH_CD:'200',PROD_CD:'V-main',BAL_QTY:'1800.0000'},{WH_CD:'200',PROD_CD:'V-gift',BAL_QTY:'0'},{WH_CD:'200',PROD_CD:'V00100110',BAL_QTY:'100'}]},l,now+4);
 const result=await bridgeJobResult(db,job.id,l,now+5);assert.equal(result.status,'ready');assert.deepEqual(result.preview.lines.map(r=>[r.sku,r.available]),[['V-main',1800],['V-gift',0]]);assert.deepEqual(l,before);
 assert.equal((await requestBridgeJob(db,l,now+6)).cached,true);assert.equal(await readBridgePreview(db,job.id,now+600005),null);
 }finally{await db.close();}
});
test('worker cannot replay completed jobs and stale responses cannot replace fresh data',async()=>{
 const db=await store();try{const l=logistics(),a=await paired(db);await bridgeHeartbeat(db,a.deviceId,true,now);const r=await requestBridgeJob(db,l,now),job=await bridgeHeartbeat(db,a.deviceId,true,now+1);
 await assert.rejects(completeBridgeJob(db,a.device,job.id,{rows:[{WH_CD:'201',PROD_CD:'V-main',BAL_QTY:'1'}]},l,now+2),/다른 재고/);
 await completeBridgeJob(db,a.device,job.id,{rows:[]},l,now+3);await assert.rejects(completeBridgeJob(db,a.device,job.id,{rows:[]},l,now+4),/만료/);await assert.rejects(bridgeJobResult(db,r.jobId,{...l,setContents:[]},now+5),/구성이 변경/);
 }finally{await db.close();}
});
test('authentication failures use sanitized messages and enforce shared cooldown across all PCs',async()=>{
 const db=await store();try{const l=logistics(),a=await paired(db);await bridgeHeartbeat(db,a.deviceId,true,now);await requestBridgeJob(db,l,now);const job=await bridgeHeartbeat(db,a.deviceId,true,now+1);
 await completeBridgeJob(db,a.device,job.id,{errorCode:'auth_ip',error:'secret-must-not-be-stored'},l,now+2);await assert.rejects(bridgeJobResult(db,job.id,l,now+3),/IP/);
 await assert.rejects(requestBridgeJob(db,l,now+4),/대기/);assert.ok(!JSON.stringify(await db.prepare('SELECT * FROM scm_ecount_bridge_jobs').all()).includes('secret-must-not-be-stored'));
 }finally{await db.close();}
});
test('PC preview and subsequent stock apply preserve all broadcast cost/profit and existing finance masters',async()=>{
 const db=await store();try{const b={id:'B',date:'2026-11-20',time:'10:00',item:'시험',status:'편성확정',result:{profit:'12345',productCost:'999'}};await saveRecord(db,b,0,'bridge-temporary-broadcast','tester','hash');const l=logistics(),f={...emptyFinance(),version:1,logistics:l,costHistory:[{id:'cost-preserve'}]};await db.prepare("INSERT INTO scm_finance(id,payload,version,request_id,state) VALUES(1,?,1,'fixture','sent')").bind(JSON.stringify(f)).run();
 const before=await db.prepare('SELECT payload,version FROM scm_records').all(),a=await paired(db);await bridgeHeartbeat(db,a.deviceId,true,now);const r=await requestBridgeJob(db,l,now),job=await bridgeHeartbeat(db,a.deviceId,true,now+1);await completeBridgeJob(db,a.device,job.id,{rows:[{WH_CD:'200',PROD_CD:'V-main',BAL_QTY:'9'}]},l,now+2);
 assert.deepEqual(await db.prepare('SELECT payload FROM scm_finance').first(),{payload:JSON.stringify(f)});const {preview}=await bridgeJobResult(db,r.jobId,l,now+3);
 const saved=await saveFinance(db,{kind:'logistics',data:{op:'inventory',warehouse:preview.warehouse,asOf:preview.asOf,basis:'before-plans',source:'이카운트 API · PC',lines:preview.lines}},1,'bridge-inventory-request','tester','hash',[]);
 assert.deepEqual(await db.prepare('SELECT payload,version FROM scm_records').all(),before);assert.deepEqual(saved.costHistory,f.costHistory);assert.deepEqual(saved.allocations,f.allocations);assert.deepEqual(saved.logistics.setContents,l.setContents);
 }finally{await db.close();}
});
