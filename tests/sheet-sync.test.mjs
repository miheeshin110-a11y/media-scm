import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSheetRows} from '../lib/sheet-merge.ts';
import {broadcastTables,financeTables} from '../lib/sheet-sync-tables.ts';
import {emptyFinance} from '../lib/finance-model.ts';
import {withSheetWriteLock} from '../lib/sheet-writer.ts';
import {store} from './postgres-fixture.mjs';
const apply=(existing,writes)=>{const result=structuredClone(existing);for(const w of writes){const index=Number(w.range.match(/!A(\d+)/)[1])-2;result[index]=w.values[0];}return result;};
test('new database IDs append without overwriting legacy rows; replays update once',()=>{
 const legacy=[['old-1','v1'],['old-2','v2']],table={title:'SCM_방송',width:2,rows:[['new-1','v1']],owns:r=>r[0]==='new-1'};
 const first=mergeSheetRows(table,legacy);assert.equal(first[0].range,"'SCM_방송'!A4:B4");
 const saved=apply(legacy,first),again=mergeSheetRows({...table,rows:[['new-1','v2']]},saved);
 assert.equal(again[0].range,"'SCM_방송'!A4:B4");assert.deepEqual(apply(saved,again),[...legacy,['new-1','v2']]);
});
test('removed PPL links clear only children of the selected broadcast',()=>{
 const existing=[['old-link','legacy-b'],['link-1','current-b'],['link-2','current-b']];
 const table={title:'SCM_PPL연결',width:2,rows:[['link-2','current-b']],owns:r=>r[1]==='current-b'};
 assert.deepEqual(apply(existing,mergeSheetRows(table,existing)),[['old-link','legacy-b'],['',''],['link-2','current-b']]);
});
test('main/sub and invoice/contract associations use composite keys',()=>{
 for(const [title,existing,rows] of [['SCM_구성계획',[['b','메인',10],['b','서브',20]],[['b','메인',30],['b','서브',40]]],['SCM_계산서연결',[['inv','code','c1'],['inv','code','c2']],[['inv','code','c2']]]]){
  const table={title,width:3,rows,owns:r=>r[0]===existing[0][0]};const result=apply(existing,mergeSheetRows(table,existing));
  if(title==='SCM_구성계획')assert.deepEqual(result,rows);else assert.deepEqual(result,[['','',''],rows[0]]);
 }
});
test('duplicate IDs stop writes; keyless non-empty historical rows are not reused',()=>{
 const table={title:'SCM_계약',width:2,rows:[['new','PPL-0001']],owns:()=>false};
 assert.throws(()=>mergeSheetRows(table,[['same'],['same']]),/중복 ID/);
 assert.equal(mergeSheetRows(table,[['','legacy note']])[0].range,"'SCM_계약'!A3:B3");
 const legacy=[['old','PPL-0001']];assert.equal(mergeSheetRows(table,legacy)[0].range,"'SCM_계약'!A3:B3");
});
test('finance exports never pad over old contracts; removed invoice links have bounded ownership',()=>{
 const f=emptyFinance();f.invoices=[{id:'i',links:[],active:true}];
 const tables=financeTables(f);assert.equal(tables[0].rows.length,0);assert.equal(tables[0].owns(['old']),false);
 assert.equal(tables[3].owns(['old']),false);assert.equal(tables[3].owns(['i']),true);
});
test('broadcast child padding is stripped and each table owns only its parent ID',()=>{
 const item={id:'b',date:'2026-10-01',time:'10:00',item:'테스트',channel:'SK',owner:'',status:'계획',ppl:'없음',target:'',hsTarget:'',attribution:''};
 const tables=broadcastTables(item),links=tables.find(t=>t.title==='SCM_PPL연결');assert.equal(links.rows.length,0);assert.equal(links.owns(['l','b']),true);assert.equal(links.owns(['l','other']),false);
});
test('database lock is released on failure; contended caller does no network work',async()=>{
 let called=false;
 const busy={transaction:work=>work({query:async()=>({rows:[{acquired:false}]})})};
 assert.equal(await withSheetWriteLock(busy,async()=>{called=true;}),undefined);assert.equal(called,false);
 const db=await store();try{await assert.rejects(withSheetWriteLock(db,async()=>{throw Error('network failure');}),/network failure/);assert.equal(await withSheetWriteLock(db,async()=>42),42);}finally{await db.close();}
});

import {generateKeyPairSync} from 'node:crypto';
import {saveRecord} from '../lib/record-store.ts';
import {syncRecord} from '../lib/google-sync.ts';
const credential=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
test('failed Google writes retain unsent outbox; retry uses IDs and marks the confirmed version',async()=>{
 const db=await store(),original=globalThis.fetch;let fail=true,posted;
 const item={id:'new-b',date:'2026-10-01',time:'10:00',item:'테스트',channel:'SK',owner:'',status:'계획',ppl:'없음',target:'',hsTarget:'',attribution:''};
 try{
  await saveRecord(db,item,0,'req-sheet','actor','hash');
  globalThis.fetch=async(input,options)=>{
   const url=String(input);
   if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'test-token'});
   if(url.includes('values:batchGet')){
    const ranges=new URL(url).searchParams.getAll('ranges');return Response.json({valueRanges:ranges.map(range=>({values:range.includes("'SCM_방송'")?[['legacy-b',1]]:[]}))});
   }
   if(url.includes('values:batchUpdate')){posted=JSON.parse(options.body);return Response.json({}, {status:fail?503:200});}
   if(url.includes('?fields='))return Response.json({sheets:broadcastTables(item).map((t,i)=>({properties:{sheetId:i,title:t.title,gridProperties:{rowCount:5000,columnCount:26}}}))});
   throw Error('Unexpected Google request');
  };
  const env={DB:db,GOOGLE_SERVICE_ACCOUNT_EMAIL:'test@example.com',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:credential};
  assert.equal(await syncRecord(env,item.id),'failed');let state=await db.prepare('SELECT * FROM scm_outbox').first();assert.equal(state.state,'failed');assert.equal(state.lease_token,null);
  fail=false;assert.equal(await syncRecord(env,item.id),'sent');state=await db.prepare('SELECT * FROM scm_outbox').first();assert.equal(state.state,'sent');assert.equal(state.lease_token,null);
  const row=posted.data.find(d=>d.values[0]?.[0]==='new-b'&&d.range.startsWith("'SCM_방송'"));assert.equal(row.range,"'SCM_방송'!A3:N3");
 }finally{globalThis.fetch=original;await db.close();}
});

test('legacy child IDs reused by different broadcasts remain independent',()=>{
 for(const title of ['SCM_PPL연결','SCM_사은품','SCM_구성실적']){
  const existing=[['legacy-','old-b','old'],['legacy-','current-b','before']];
  const table={title,width:3,rows:[['legacy-','current-b','after']],owns:r=>r[1]==='current-b'};
  assert.deepEqual(apply(existing,mergeSheetRows(table,existing)),[existing[0],['legacy-','current-b','after']]);
  const newTable={...table,rows:[['legacy-','new-b','new']],owns:r=>r[1]==='new-b'};
  assert.deepEqual(apply(existing,mergeSheetRows(newTable,existing)),[...existing,['legacy-','new-b','new']]);
 }
});
