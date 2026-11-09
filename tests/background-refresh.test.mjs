import test from 'node:test';
import assert from 'node:assert/strict';
import {BackgroundRefresh} from '../lib/background-refresh.ts';
import {unchangedRecord} from '../lib/unchanged-record.ts';
test('menu refresh uses recent data and deduplicates reads without blocking writes',()=>{
 const gate=new BackgroundRefresh();gate.loaded(1000);
 assert.equal(gate.start(true,false,2000),false);
 assert.equal(gate.start(false,false,2000),true);
 assert.equal(gate.start(false,false,2001),false);
 assert.equal(gate.accept(0,1,false),false,'a write invalidates an older background response');
 assert.equal(gate.accept(1,1,true),false,'a read cannot replace data during a write');
 assert.equal(gate.accept(1,1,false),true);gate.loaded(2500);gate.finish();
 assert.equal(gate.start(true,false,17500),true);gate.finish();
 assert.equal(gate.start(false,true,18000),false);
});
test('unchanged saved records skip writes but financial, result, review and version edits still save',()=>{
 const old={id:'B',date:'2026-11-09',time:'10:00',version:2,workflow:'작성 중',item:'test',sync:'완료'};
 assert.equal(unchangedRecord({...old,sync:'대기'},old),true);
 for(const change of [{version:3},{workflow:'검토 요청'},{allocation:'7000000'},{result:{profit:'1'}},{item:'edited'}])assert.equal(unchangedRecord({...old,...change},old),false);
 assert.equal(unchangedRecord({...old,version:0},{...old,version:0}),false);
});
