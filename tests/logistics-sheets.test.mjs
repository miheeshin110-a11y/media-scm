import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {store} from './postgres-fixture.mjs';
import {saveRecord,SaveConflict} from '../lib/record-store.ts';
import {saveFinance} from '../lib/finance-store.ts';
import {emptyFinance} from '../lib/finance-model.ts';
import {compositions} from '../lib/workflow.ts';
import {logisticsTables,logisticsSheetHeaders,LOGISTICS_ROW_PREFIX} from '../lib/logistics-sheets.ts';
import {validateLogisticsSummaryBlock,logisticsSummaryColumns,logisticsSummaryFormulas,logisticsSummaryMarker} from '../lib/logistics-sheet-view.ts';
import {queueLogisticsSheets} from '../lib/logistics-sheet-job.ts';
import {syncLogistics} from '../lib/google-sync.ts';
import {mergeSheetRows} from '../lib/sheet-merge.ts';
import {allSheetHeaders} from '../lib/sheet-setup.ts';
const item=()=>{const b={id:'log-sheet',date:'2026-11-20',time:'10:00',channel:'SK',item:'임시 상품',shortItem:'임시',owner:'검증',status:'편성확정',urgent:false,ppl:'없음',program:'',pplKind:'',price:'',target:'',rate:'',contractId:'',contractAmount:'',allocation:'',attribution:'',sync:'대기',result:{profit:'12345'}};b.compositions=compositions(b);Object.assign(b.compositions.single,{sku:'NO-BOM',plannedQuantity:'0',conversionRate:'10',unitCost:'777'});return b;};

test('logistics export preserves financial snapshots and distinguishes unknown EA from explicit zero sets',()=>{
 const b=item(),f=emptyFinance(),before=structuredClone({b,f}),tables=logisticsTables(f,[b]);
 assert.equal(tables.length,12);
 for(const table of tables){assert.equal(table.width,logisticsSheetHeaders[table.title].length);for(const row of table.rows){assert.equal(row.length,table.width);assert.ok(row[0].startsWith(LOGISTICS_ROW_PREFIX));}}
 const row=tables.find(t=>t.title==='SCM_물류방송').rows[0];assert.equal(row[8],0);assert.equal(row[9],0);
 b.compositions.single.plannedQuantity='';const blank=logisticsTables(f,[b]).find(t=>t.title==='SCM_물류방송').rows[0];assert.equal(blank[8],'');assert.equal(blank[9],'');
 b.compositions.single.plannedQuantity='0';assert.deepEqual({b,f},before);
 const t=tables[0],foreign=['external-id','other'],obsolete=[LOGISTICS_ROW_PREFIX+'obsolete'];
 const writes=mergeSheetRows(t,[foreign,obsolete]);assert.ok(!writes.some(w=>w.range.includes('A2:')));assert.ok(writes.some(w=>w.range.includes('A3:')&&w.values[0].every(v=>v==='')));
});
test('summary formulas join broadcast ID within owned rows; preexisting extension data blocks changes',()=>{
 assert.doesNotThrow(()=>validateLogisticsSummaryBlock([]));assert.throws(()=>validateLogisticsSummaryBlock([['기존 자료']]),/보존/);
 const formulas=logisticsSummaryFormulas();assert.equal(formulas.length,8);for(const formula of formulas){assert.match(formula,/XLOOKUP\(bid,ids,vals/);assert.match(formula,/COUNTIFS/);assert.ok(formula.includes(LOGISTICS_ROW_PREFIX));}
 assert.doesNotThrow(()=>validateLogisticsSummaryBlock([[logisticsSummaryMarker],logisticsSummaryColumns.map(c=>c[0]),formulas,['computed values']]));
});
test('record and logistics master saves queue atomically; replay/conflict and logistics writes preserve broadcast payload',async()=>{
 const db=await store();try{
 const b=item();await saveRecord(db,b,0,'log-sheet-save','actor','hash');const original=await db.prepare('SELECT payload FROM scm_records').first();
 const first=await db.prepare('SELECT generation FROM scm_sheet_jobs').first();assert.equal(first.generation,1);
 await saveRecord(db,b,0,'log-sheet-save','actor','hash');assert.equal((await db.prepare('SELECT generation FROM scm_sheet_jobs').first()).generation,1);
 await assert.rejects(saveRecord(db,b,0,'log-sheet-conflict','actor','hash'),SaveConflict);assert.equal((await db.prepare('SELECT generation FROM scm_sheet_jobs').first()).generation,1);
 await saveFinance(db,{kind:'logistics',data:{op:'sku',code:'TEST',name:'임시 상품'}},0,'log-sheet-master','actor','hash',[]);
 assert.equal((await db.prepare('SELECT generation FROM scm_sheet_jobs').first()).generation,2);assert.deepEqual(await db.prepare('SELECT payload FROM scm_records').first(),original);
 }finally{await db.close();}
});
const key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
test('logistics worker retries failed writes and never marks a newer generation sent',async()=>{
 const db=await store(),originalFetch=globalThis.fetch,writes=[];let fail=true,onWrite;
 try{
 await saveRecord(db,item(),0,'log-sheet-worker','actor','hash');const before=await db.prepare('SELECT payload FROM scm_records').first();
 let connection;const transaction=db.transaction;db.transaction=work=>transaction(async c=>{connection=c;try{return await work(c);}finally{connection=null;}});
 const env={DB:db,GOOGLE_SERVICE_ACCOUNT_EMAIL:'test@example.com',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:key};
 globalThis.fetch=async(input,options)=>{const url=String(input);
 if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'test-token'});
 if(url.includes('?fields='))return Response.json({sheets:Object.keys(allSheetHeaders).map((title,i)=>({properties:{sheetId:i,title,gridProperties:{rowCount:1000,columnCount:100}}}))});
 if(url.includes('values:batchGet'))return Response.json({valueRanges:new URL(url).searchParams.getAll('ranges').map(()=>({values:[]}))});
 if(url.includes('values:batchUpdate')){if(fail)return Response.json({},{status:503});writes.push(JSON.parse(options.body));if(onWrite){const f=onWrite;onWrite=null;await f();}return Response.json({});}
 if(url.endsWith(':batchUpdate'))return Response.json({});throw Error('Unexpected request');};
 assert.equal(await syncLogistics(env),'failed');assert.equal((await db.prepare('SELECT state FROM scm_sheet_jobs').first()).state,'failed');
 fail=false;onWrite=()=>connection.query("UPDATE scm_sheet_jobs SET generation=generation+1,state='pending'");assert.equal(await syncLogistics(env),'pending');assert.equal((await db.prepare('SELECT state FROM scm_sheet_jobs').first()).state,'pending');
 assert.equal(await syncLogistics(env),'sent');assert.equal((await db.prepare('SELECT state FROM scm_sheet_jobs').first()).state,'sent');
 assert.deepEqual(await db.prepare('SELECT payload FROM scm_records').first(),before);assert.equal((await db.prepare('SELECT state FROM scm_outbox').first()).state,'pending');assert.ok(writes.every(w=>w.data.every(r=>r.range.startsWith("'SCM_물류")||r.range.startsWith("'물류 종합'"))));
 }finally{globalThis.fetch=originalFetch;await db.close();}
});

test('dashboard refuses custom existing data before any write, preserving the original report',async()=>{
 const {ensureLogisticsDashboard}=await import('../lib/logistics-sheet-view.ts');const originalFetch=globalThis.fetch;let mutations=0;
 try{globalThis.fetch=async(input,options)=>{
 if(options?.method==='POST'){mutations++;throw Error('Must not write');}
 if(String(input).includes('?fields='))return Response.json({sheets:[{properties:{sheetId:1,title:'방송 종합',gridProperties:{rowCount:100,columnCount:45}}}]});
 return Response.json({valueRanges:[{values:[['방송 ID'],['=FILTER(source)']]},{values:[[],[],[],['기존 사용자 자료']]}]});};
 await assert.rejects(ensureLogisticsDashboard('mock-token','mock-sheet'),/보존/);assert.equal(mutations,0);
 }finally{globalThis.fetch=originalFetch;}
});
test('released quantities stay fixed while current demand changes; source cost/profit snapshots remain intact',async()=>{
 const {emptyLogistics,applyLogisticsAction,logisticsFingerprint}=await import('../lib/logistics.ts');let seq=0;const now='2026-11-05T00:00:00Z',apply=(l,data,items=[])=>applyLogisticsAction(l,data,items,'tester',now,()=>String(++seq));
 let l=apply(emptyLogistics(),{op:'sku',code:'P',name:'임시 본품'});l=apply(l,{op:'bom',compositionCode:'NO-BOM',lines:[{sku:'P',role:'product',quantity:9}]});
 const b=item();b.compositions.single.plannedQuantity='10';l=apply(l,{op:'publish',broadcastId:b.id,warehouse:'센터1',fingerprint:logisticsFingerprint(b,l),confirmComposition:true,note:'전체 구성 확인'},[b]);
 b.compositions.single.plannedQuantity='20';const f={...emptyFinance(),logistics:l},before=structuredClone({b,f}),tables=logisticsTables(f,[b]);
 assert.equal(tables.find(t=>t.title==='SCM_물류요청품목').rows[0][7],90);assert.equal(tables.find(t=>t.title==='SCM_물류수량').rows[0][6],180);assert.deepEqual({b,f},before);
});
