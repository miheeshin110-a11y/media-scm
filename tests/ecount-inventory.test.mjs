import test from 'node:test';
import assert from 'node:assert/strict';
import {ecountConfig,fetchEcountStock} from '../lib/ecount-client.ts';
import {ecountInventoryRows} from '../lib/ecount-inventory.ts';
import {loadEcountPreview,readEcountPreview,ecountCacheDDL} from '../lib/ecount-cache.ts';
import {emptyLogistics,applyLogisticsAction} from '../lib/logistics.ts';
import {emptyFinance} from '../lib/finance-model.ts';
import {saveFinance,readFinance} from '../lib/finance-store.ts';
import {saveRecord} from '../lib/record-store.ts';
import {store} from './postgres-fixture.mjs';
const env=()=>({ECOUNT_COMPANY_CODE:'123456',ECOUNT_USER_ID:'temporary-user',ECOUNT_API_CERT_KEY:'temporary-key-not-real',ECOUNT_WAREHOUSES:'[{"code":"200","name":"샌드부스터"}]'});
const now=Date.parse('2026-11-10T05:00:00Z');
const raw=()=>[{WH_CD:'200',PROD_CD:'V-main',BAL_QTY:'123.0000000000'},{WH_CD:'200',PROD_CD:'V-gift',BAL_QTY:'0.0000'},{WH_CD:'200',PROD_CD:'V00100110',BAL_QTY:'99'},{WH_CD:'200',PROD_CD:'DT-SET',BAL_QTY:'99'}];
function logistics(){const l=emptyLogistics();l.setContents=[{id:'contents',compositionCode:'DT-SET',effectiveFrom:'2026-11-09',createdAt:'2026-11-09',actor:'temporary',lines:[{sku:'V-main',name:'임시 본품',role:'product',quantity:18,unit:'개'},{sku:'V-gift',name:'임시 사은품',role:'gift',quantity:2,unit:'개'},{sku:'V-missing',name:'미조회',role:'gift',quantity:1,unit:'개'}]}];return l;}
function transport(rows=raw()){const calls=[];return {calls,async send(url,body){calls.push({url,body});if(url.endsWith('/Zone'))return {Status:'200',Data:{ZONE:'AD'}};if(url.endsWith('/OAPILogin'))return {Status:'200',Data:{Datas:{SESSION_ID:'temporary-session'}}};return {Status:'200',Data:{IsSuccess:true,TotalCnt:rows.length,Result:rows}};}};}
test('official zone/login/stock sequence uses production hosts, warehouse 200 and zero-stock inclusion without writes',async()=>{
 const mock=transport(),rows=await fetchEcountStock(ecountConfig(env()),'200','20261110',mock.send);
 assert.deepEqual(rows,raw());assert.equal(mock.calls.length,3);assert.equal(mock.calls[0].url,'https://oapi.ecount.com/OAPI/V2/Zone');
 assert.equal(mock.calls[1].url,'https://oapiad.ecount.com/OAPI/V2/OAPILogin');assert.equal(mock.calls[2].body.WH_CD,'200');assert.equal(mock.calls[2].body.ZERO_FLAG,'Y');
 assert.ok(!mock.calls.some(c=>/Save|Insert/.test(c.url)));
});
test('failed authentication stops before stock lookup and redacts upstream secrets and errors',async()=>{
 let calls=0;const secret='upstream-secret-session-and-key';
 await assert.rejects(fetchEcountStock(ecountConfig(env()),'200','20261110',async()=>{calls++;return {Status:'200',Error:{Code:205,Message:secret}};}),e=>!e.message.includes(secret)&&/IP/.test(e.message));assert.equal(calls,1);
 await assert.rejects(fetchEcountStock(ecountConfig(env()),'200','20261110',async()=>{throw Error(secret);}),e=>!String(e).includes(secret));
 let count=0;await assert.rejects(fetchEcountStock(ecountConfig(env()),'200','20261110',async()=>++count===1?{Status:200,Data:{ZONE:'evil.example/path'}}:{}));assert.equal(count,1);
});
test('missing, negative, fractional and held stock never become zero or rounded stock; wrong warehouse and duplicates reject',()=>{
 const l=logistics(),before=structuredClone(l),result=ecountInventoryRows([...raw(),{WH_CD:'200',PROD_CD:'V-missing',BAL_QTY:'-1.5'}],'200',l);
 assert.deepEqual(result.lines.map(r=>[r.sku,r.available]),[['V-main',123],['V-gift',0]]);assert.deepEqual(result.missing,['V-missing']);assert.equal(result.issues.length,1);assert.deepEqual(l,before);
 assert.throws(()=>ecountInventoryRows([{WH_CD:'201',PROD_CD:'V-main',BAL_QTY:'1'}],'200',l));assert.throws(()=>ecountInventoryRows([raw()[0],raw()[0]],'200',l));
});
test('shared cache prevents multiple users/instances from issuing duplicate ERP calls and expires after ten minutes',async()=>{
 const db=await store();try{const l=logistics(),mock=transport();const a=await loadEcountPreview(db,env(),'200',l,now,mock.send),b=await loadEcountPreview(db,env(),'200',l,now+100,mock.send);
 assert.equal(a.cached,false);assert.equal(b.cached,true);assert.equal(a.preview.id,b.preview.id);assert.equal(mock.calls.length,3);
 const c=await loadEcountPreview(db,env(),'200',l,now+600001,mock.send);assert.equal(c.cached,false);assert.equal(mock.calls.length,6);
 assert.ok(!JSON.stringify(await readEcountPreview(db)).includes('temporary-key-not-real'));
 }finally{await db.close();}
});
test('overlapping calls are claimed before authentication and failure keeps existing SCM stock untouched',async()=>{
 const db=await store();await db.prepare(ecountCacheDDL).run();let release;try{const l=logistics();l.snapshots=[{id:'previous',warehouse:'샌드부스터',asOf:'2026-11-09T10:00',basis:'before-plans',source:'기존재고',lines:[{sku:'V-main',available:55,reservedForPlans:0}],createdAt:'2026-11-09'}];const before=structuredClone(l);
 const wait=new Promise(r=>release=r),first=loadEcountPreview(db,env(),'200',l,now,async()=>{await wait;throw Error('private-error');});
 // Observe the durable claim without making an ERP call.
 for(let i=0;i<30;i++){const r=await db.prepare('SELECT owner FROM scm_ecount_cache WHERE id=1').first();if(r?.owner)break;await new Promise(r=>setTimeout(r,5));}
 let calls=0;await assert.rejects(loadEcountPreview(db,env(),'200',l,now+1,async()=>{calls++;return {};}),/중복 조회/);assert.equal(calls,0);release();await assert.rejects(first,/반복 호출/);
 await assert.rejects(loadEcountPreview(db,env(),'200',l,now+600001,async()=>{calls++;return {};}),/중복 조회/);assert.equal(calls,0);assert.deepEqual(l,before);
 }finally{release?.();await db.close();}
});
test('applying a preview updates only logistics inventory, preserving broadcasts, costs, profit, PPL and masters',async()=>{
 const db=await store();try{const b={id:'real-preserve',date:'2026-11-20',time:'10:00',item:'임시 검증 방송',status:'편성확정',compositions:{single:{unitCost:'777'}},result:{profit:'12345',productCost:'999'}};
 await saveRecord(db,b,0,'temporary-broadcast-request','tester','hash');const finance={...emptyFinance(),version:1,logistics:logistics(),costHistory:[{id:'preserve-cost'}]};await db.prepare("INSERT INTO scm_finance(id,payload,version,request_id,state) VALUES(1,?,1,'fixture','sent')").bind(JSON.stringify(finance)).run();
 const before=await db.prepare('SELECT payload,version FROM scm_records WHERE id=?').bind(b.id).first(),mock=transport(),{preview}=await loadEcountPreview(db,env(),'200',finance.logistics,now,mock.send);
 const saved=await saveFinance(db,{kind:'logistics',data:{op:'inventory',warehouse:preview.warehouse,asOf:preview.asOf,basis:'before-plans',source:'이카운트 API · 200',lines:preview.lines}},1,'ecount-'+preview.id,'tester','hash',[]);
 assert.deepEqual(await db.prepare('SELECT payload,version FROM scm_records WHERE id=?').bind(b.id).first(),before);
 assert.deepEqual(saved.costHistory,finance.costHistory);assert.deepEqual(saved.allocations,finance.allocations);assert.deepEqual(saved.logistics.setContents,finance.logistics.setContents);assert.equal(saved.logistics.snapshots.length,1);assert.equal((await readFinance(db)).version,2);
 }finally{await db.close();}
});
test('three authentication failures latch the shared breaker even after an hour, without leaking credentials',async()=>{
 const db=await store();try{let calls=0;const send=async()=>{calls++;return {Status:200,Error:{Code:201,Message:'temporary-key-not-real'}};};
 for(let i=0;i<3;i++)await assert.rejects(loadEcountPreview(db,env(),'200',logistics(),now+i*3600001,send),/인증/);
 await assert.rejects(loadEcountPreview(db,env(),'200',logistics(),now+4*3600001,send),/3회/);assert.equal(calls,3);
 const row=await db.prepare('SELECT last_error,preview,auth_failures FROM scm_ecount_cache WHERE id=1').first();assert.equal(row.auth_failures,3);assert.ok(!JSON.stringify(row).includes('temporary-key-not-real'));
 }finally{await db.close();}
});
test('truncated inventory responses reject before any SCM stock replacement',async()=>{
 const mock=transport();await assert.rejects(fetchEcountStock(ecountConfig(env()),'200','20261110',async(url,body)=>{const r=await mock.send(url,body);if(url.includes('/InventoryBalance/'))r.Data.TotalCnt=999;return r;}),/누락/);
});
