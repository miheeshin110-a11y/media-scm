import test from 'node:test';
import assert from 'node:assert/strict';
import {readSyncSnapshot,recordSheetState,syncCounts,sheetStateLabel} from '../lib/sync-status.ts';
test('pending and failed are separate; PPL bundle is counted once and no finance row adds nothing',()=>{
 const s={records:{a:{state:'sent',version:1},b:{state:'pending',version:2},c:{state:'failed',version:3}},finance:'failed'};
 assert.deepEqual(syncCounts(s),{sent:1,pending:1,failed:2,remaining:3});
 assert.deepEqual(syncCounts({...s,finance:null}),{sent:1,pending:1,failed:1,remaining:2});
 assert.equal(sheetStateLabel(recordSheetState(s,{id:'c',version:3})),'시트 반영 실패');
});
test('unknown state never claims completion and a newer unsent version remains pending',()=>{
 const s={records:{a:{state:'sent',version:1}},finance:null};
 assert.equal(recordSheetState(s,{id:'a',version:2}),'pending');
 assert.equal(recordSheetState(s,{id:'a',version:1}),'sent');
 assert.equal(recordSheetState(s,{id:'unloaded',version:1}),'unknown');
 assert.equal(recordSheetState(null,{id:'a',version:1}),'unknown');
});
test('authoritative DB snapshot preserves failure and detects an older sent outbox version',async()=>{
 const db={prepare(sql){return {async all(){assert.match(sql,/LEFT JOIN scm_outbox/);return {results:[{id:'a',version:2,outbox_version:1,state:'sent'},{id:'b',version:3,outbox_version:3,state:'failed'},{id:'c',version:1,outbox_version:1,state:'sent'}]};},async first(){if(sql.includes("scm_sheet_jobs"))return null;assert.match(sql,/scm_finance/);return {state:'pending'};}};}};
 const s=await readSyncSnapshot(db);
 assert.deepEqual(s,{records:{a:{version:2,state:'pending'},b:{version:3,state:'failed'},c:{version:1,state:'sent'}},finance:'pending',logistics:null});
 assert.equal(syncCounts(s).remaining,3);
 // Successful retry clears the queue; no always-active retransmit button is needed.
 for(const r of Object.values(s.records))r.state='sent';s.finance='sent';
 assert.equal(syncCounts(s).remaining,0);
});
