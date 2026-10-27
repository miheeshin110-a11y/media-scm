import test from 'node:test';
import assert from 'node:assert/strict';
import {basicMissing,broadcastProgress} from '../lib/broadcast-progress.ts';
import {saveRecord} from '../lib/record-store.ts';
import {store} from './postgres-fixture.mjs';
const partial={id:'quick',item:'파라다이스',owner:'',channel:'현대',date:'2026-10-10',time:'',ppl:'미정',registrationSource:'ppl',workflow:'작성 중'};
test('registration source stays separate from current basic input completeness',()=>{
 assert.deepEqual(basicMissing(partial),['담당자','방송시간']);
 assert.equal(broadcastProgress(partial),'PPL 간편등록 · 기본정보 보완 필요');
 const complete={...partial,owner:'조정묵',time:'10:00'};
 assert.equal(broadcastProgress(complete),'PPL 간편등록 · 기본정보 입력됨');
 assert.equal(broadcastProgress({...complete,registrationSource:'broadcast'}),'방송 직접등록 · 기본정보 입력됨');
 assert.equal(broadcastProgress({...partial,registrationSource:undefined,ppl:'있음'}),'기존 등록 · PPL 연결 · 기본정보 보완 필요');
});
test('editing a saved record cannot overwrite or erase its original registration source, or invent a legacy source',async()=>{
 const db=await store();try{
  const first=await saveRecord(db,partial,0,'first','actor','1');
  const edited=await saveRecord(db,{...first,owner:'조정묵',registrationSource:'broadcast'},1,'second','actor','2');
  assert.equal(edited.registrationSource,'ppl');
  const {registrationSource,...withoutSource}=edited;
  const third=await saveRecord(db,withoutSource,2,'third','actor','3');
  assert.equal(third.registrationSource,'ppl');
  const legacy=await saveRecord(db,{...partial,id:'legacy',registrationSource:undefined},0,'legacy1','actor','4');
  const legacyEdit=await saveRecord(db,{...legacy,registrationSource:'broadcast'},1,'legacy2','actor','5');
  assert.equal(legacyEdit.registrationSource,undefined);
 }finally{await db.close();}
});
