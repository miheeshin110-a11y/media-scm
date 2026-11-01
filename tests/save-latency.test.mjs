import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {generateKeyPairSync} from 'node:crypto';
import ts from 'typescript';
import {store} from './postgres-fixture.mjs';
import {saveRecord} from '../lib/record-store.ts';
import {flushPendingSheets} from '../lib/sheet-sync-queue.ts';
import {allSheetHeaders} from '../lib/sheet-setup.ts';

const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const item=(id='latency-1')=>({id,date:'2026-11-01',time:'10:00',channel:'SK',item:'테스트',shortItem:'테스트',owner:'검증',status:'',urgent:false,ppl:'없음',program:'',pplKind:'',price:'',target:'300000',rate:'',contractId:'',contractAmount:'',allocation:'',attribution:'',sync:'대기',workflow:'작성 중',financeVersion:0});

// Execute the real route with real PostgreSQL and domain code. Only authentication
// and Next's post-response lifecycle are supplied by the harness.
async function route(name,db,callbacks,configured=true){
 const source=readFileSync(new URL(`../app/api/${name}/route.ts`,import.meta.url),'utf8');
 const env={DB:db,...(configured?{GOOGLE_SERVICE_ACCOUNT_EMAIL:'test@example.com',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:privateKey}:{})};
 const modules={'next/server':{after:fn=>callbacks.push(fn)},'@/lib/runtime':{runtime:()=>env,authenticated:fn=>fn,checkWrite:()=>null,readable:()=>true,editable:()=>true,reviewer:()=>true,identity:()=> 'test-actor'}};
 for(const [,name] of source.matchAll(/from '(@\/lib\/[^']+)'/g))if(!modules[name])modules[name]=await import(new URL('../'+name.slice(2)+'.ts',import.meta.url));
 const exports={};
 runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>{assert.ok(modules[name],name);return modules[name];},Response,Request,URL,crypto,TextEncoder,console});
 return {api:exports,env};
}
const request=(body,url='records')=>new Request('https://test.local/api/'+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function googleMock({fail=false,writes=[]}={}){
 return async(input,options)=>{
  const url=String(input);
  if(fail)return Response.json({},{status:503});
  if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'test-token'});
  if(url.includes('?fields='))return Response.json({sheets:Object.keys(allSheetHeaders).map((title,i)=>({properties:{sheetId:i,title,gridProperties:{rowCount:10000,columnCount:100}}}))});
  if(url.includes('values:batchGet'))return Response.json({valueRanges:new URL(url).searchParams.getAll('ranges').map(()=>({values:[]}))});
  if(url.includes('values:batchUpdate')){writes.push(JSON.parse(options.body));return Response.json({});}
  throw Error('Unexpected Google call');
 };
}

test('consecutive broadcast saves return before Google work and the worker exports the latest version',async()=>{
 const db=await store(),callbacks=[],original=globalThis.fetch,writes=[];let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;throw Error('Google must not run before response');};
  const {api}=await route('records',db,callbacks);
  let response=await api.POST(request({record:item(),baseVersion:0,requestId:'save-latency-request-001'}));
  assert.equal(response.status,200,await response.clone().text());let body=await response.json();assert.equal(body.record.version,1);assert.equal(body.sync,'pending');assert.equal(calls,0);
  response=await api.POST(request({record:{...body.record,target:'500000'},baseVersion:1,requestId:'save-latency-request-002'}));
  assert.equal(response.status,200,await response.clone().text());body=await response.json();assert.equal(body.record.version,2);assert.equal(calls,0);assert.equal(callbacks.length,2);
  globalThis.fetch=googleMock({writes});for(const work of callbacks)await work();
  const outbox=await db.prepare('SELECT state,version FROM scm_outbox').first();assert.deepEqual(outbox,{state:'sent',version:2});
  assert.equal(writes.length,1,'older callbacks coalesce to one current-version write');
  assert.equal(JSON.parse((await db.prepare('SELECT payload FROM scm_records').first()).payload).target,'500000');
 }finally{globalThis.fetch=original;await db.close();}
});

test('PPL save responds without Sheets and commits allocation plus affected broadcast before response',async()=>{
 const db=await store(),callbacks=[],original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>{throw Error('No inline Google work');};
  await saveRecord(db,item(),0,'seed','actor','hash');
  const {api}=await route('finance',db,callbacks);
  let response=await api.POST(request({action:{kind:'contract',data:{name:'속도 테스트',date:'',approvalNo:'',party:'주식회사 미디어상생',businessNo:'7578802005',channel:'TV조선',net:'12000000',tax:'1200000',notes:''}},baseVersion:0,requestId:'finance-latency-request-001'},'finance'));
  assert.equal(response.status,200,await response.clone().text());const f=(await response.json()).finance;
  response=await api.POST(request({action:{kind:'allocation',data:{contractId:f.contracts[0].id,broadcastId:item().id,month:'2026-11',net:'5000000',tax:'500000'}},baseVersion:f.version,requestId:'finance-latency-request-002'},'finance'));
  assert.equal(response.status,200,await response.clone().text());const data=await response.json();assert.equal(data.finance.allocations.length,1);assert.equal(data.updatedRecords[0].allocation,'5000000');assert.equal(data.syncSnapshot.records[item().id].state,'pending');assert.equal(callbacks.length,2);
  globalThis.fetch=googleMock();for(const work of callbacks)await work();
  assert.equal((await db.prepare('SELECT state FROM scm_finance').first()).state,'sent');assert.equal((await db.prepare('SELECT state FROM scm_outbox').first()).state,'sent');
 }finally{globalThis.fetch=original;await db.close();}
});

test('Google failure does not undo a save; explicit retry returns immediately and preserves edited data',async()=>{
 const db=await store(),callbacks=[],original=globalThis.fetch;
 try{
  const {api}=await route('records',db,callbacks);
  const response=await api.POST(request({record:item(),baseVersion:0,requestId:'failure-latency-request'}));assert.equal(response.status,200,await response.clone().text());
  globalThis.fetch=googleMock({fail:true});await callbacks.shift()();
  assert.equal((await db.prepare('SELECT state FROM scm_outbox').first()).state,'failed');
  const {api:sync}=await route('sync',db,callbacks);
  let status=await sync.GET();assert.equal((await status.json()).syncSnapshot.records[item().id].state,'failed');
  status=await sync.POST(request({},'sync'));assert.equal(status.status,202);assert.equal((await status.json()).syncSnapshot.records[item().id].state,'pending');
  globalThis.fetch=googleMock();await callbacks.shift()();
  assert.equal((await db.prepare('SELECT state FROM scm_outbox').first()).state,'sent');assert.equal((await db.prepare('SELECT version FROM scm_records').first()).version,1);
 }finally{globalThis.fetch=original;await db.close();}
});

test('automatic continuation drains more than five records and leaves failures and active leases untouched',async()=>{
 const db=await store(),callbacks=[],original=globalThis.fetch;
 try{
  for(let i=0;i<8;i++)await saveRecord(db,item('b'+i),0,'seed-'+i,'actor','hash');
  await db.prepare("UPDATE scm_outbox SET state='failed' WHERE record_id='b6'").run();
  await db.prepare("UPDATE scm_outbox SET lease_token='busy',lease_until=? WHERE record_id='b7'").bind(Date.now()+120000).run();
  const {api,env}=await route('sync',db,callbacks);globalThis.fetch=googleMock();
  await flushPendingSheets(env);assert.equal((await db.prepare("SELECT COUNT(*) n FROM scm_outbox WHERE state='sent'").first()).n,5);
  assert.equal((await api.POST(request({},'sync?automatic=1'))).status,202);await callbacks.shift()();
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM scm_outbox WHERE state='sent'").first()).n,6);
  assert.equal((await db.prepare("SELECT state FROM scm_outbox WHERE record_id='b6'").first()).state,'failed');
  assert.equal((await db.prepare("SELECT lease_token FROM scm_outbox WHERE record_id='b7'").first()).lease_token,'busy');
 }finally{globalThis.fetch=original;await db.close();}
});

test('unconfigured Sheets never delays saving or registers a worker; conflict never queues a new write',async()=>{
 const db=await store(),callbacks=[];
 try{
  const {api}=await route('records',db,callbacks,false);
  let response=await api.POST(request({record:item(),baseVersion:0,requestId:'no-sheets-save-0001'}));assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).sync,'not_configured');assert.equal(callbacks.length,0);
  response=await api.POST(request({record:item(),baseVersion:0,requestId:'no-sheets-save-0002'}));assert.equal(response.status,409);assert.equal(callbacks.length,0);
 }finally{await db.close();}
});
