import test from 'node:test';
import assert from 'node:assert/strict';
import {broadcastPage} from '../lib/broadcast-picker.ts';
const items=Array.from({length:55},(_,i)=>({id:String(i).padStart(3,'0'),date:`2026-10-${String(i%28+1).padStart(2,'0')}`,time:'10:00',channel:i%2?'현대':'홈앤',item:'파라다이스',owner:i%3?'조정묵':'',registrationSource:i%2?'ppl':'broadcast'}));
test('55 broadcasts are accessible without duplicates across six pages of at most ten rows',()=>{
 const seen=[];for(let page=0;page<6;page++){const r=broadcastPage(items,'','all',page);assert.ok(r.rows.length<=10);assert.equal(r.pages,6);seen.push(...r.rows.map(x=>x.id));}
 assert.equal(seen.length,55);assert.equal(new Set(seen).size,55);
 const last=broadcastPage(items,'','all',99);assert.equal(last.page,5);assert.equal(last.start,51);assert.equal(last.end,55);
});
test('search, source and missing-information filters keep counts and page bounds consistent',()=>{
 const r=broadcastPage(items,'현대 파라다이스','ppl',0);assert.equal(r.total,27);assert.equal(r.counts.broadcast,0);
 const missing=broadcastPage(items,'','missing',99);assert.equal(missing.total,19);assert.equal(missing.page,1);assert.ok(missing.rows.every(x=>!x.owner));
 const empty=broadcastPage(items,'없는방송','all',5);assert.equal(empty.page,0);assert.equal(empty.start,0);assert.equal(empty.end,0);assert.equal(empty.pages,1);
});
