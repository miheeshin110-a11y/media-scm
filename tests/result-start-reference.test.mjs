import test from 'node:test';
import assert from 'node:assert/strict';
import {broadcastResultStart,newResult,validateItem} from '../lib/scm-model.ts';
import {sheetRows} from '../lib/sheet-mapping.ts';

const fixture=()=>({id:'temporary-start',date:'2026-11-01',time:'25:00',channel:'SK',item:'상품',shortItem:'상품',owner:'테스트',status:'편성확정',urgent:false,ppl:'없음',program:'',pplKind:'',price:'',target:'',rate:'',contractId:'',contractAmount:'',allocation:'',attribution:'',sync:'대기',result:newResult()});
test('new results reference the broadcast date/time with midnight rollover and still reject an earlier end',()=>{
 const item=fixture();assert.equal(broadcastResultStart(item),'2026-11-02 01:00');
 item.result.actualEndDate='2026-11-02';item.result.actualEnd='02:00';assert.deepEqual(validateItem(item),[]);
 item.result.actualEnd='00:59';assert.ok(validateItem(item).some(e=>e.includes('시작 일시보다')));
 assert.equal(item.result.actualDate,'');assert.equal(item.result.actualStart,'');
});
test('historical actual start values are preserved and take precedence over schedule references',()=>{
 const item=fixture();item.result.actualDate='2026-11-02';item.result.actualStart='01:30';item.result.actualEndDate='2026-11-02';item.result.actualEnd='01:15';
 const before=structuredClone(item);assert.equal(broadcastResultStart(item),'2026-11-02 01:30');assert.ok(validateItem(item).some(e=>e.includes('시작 일시보다')));
 assert.deepEqual(item,before);
 const exported=sheetRows(item,1).find(row=>row.range.startsWith("'SCM_방송결과'"));
 assert.equal(exported.values[0][2],'2026-11-02');assert.equal(exported.values[0][3],'01:30');assert.deepEqual(item,before);
});
test('sheet output falls back to broadcast start for new results, without filling or deleting stored fields',()=>{
 const item=fixture(),before=structuredClone(item);
 const result=sheetRows(item,1).find(row=>row.range.startsWith("'SCM_방송결과'"));
 assert.deepEqual(result.values[0].slice(2,4),['2026-11-02','01:00']);assert.deepEqual(item,before);
 delete item.result;const noResult=sheetRows(item,1).find(row=>row.range.startsWith("'SCM_방송결과'"));
 assert.deepEqual(noResult.values[0].slice(2,4),['','']);
});
