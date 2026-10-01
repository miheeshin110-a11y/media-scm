import test from 'node:test';
import assert from 'node:assert/strict';
import {nextPplDraft} from '../lib/ppl-drafts.ts';
const link=(id,extra={})=>({id,pplId:id,channel:'',program:'',date:'',time:'',kind:'',...extra});

test('repeated add reuses an unfinished PPL without losing its dates or other rows',()=>{
 const rows=[link('named',{channel:'TV조선',program:'세개의 시선'}),link('draft',{channel:'TV조선',date:'2026-09-30'}),link('another')];
 const id=()=>{throw new Error('no new IDs should be allocated');};
 const first=nextPplDraft(rows,id),second=nextPplDraft(first.links,id);
 assert.equal(first.activeId,'draft');assert.equal(first.reused,true);assert.equal(first.links,rows);
 assert.equal(first.links[1].date,'2026-09-30');assert.equal(second.links.length,3);assert.equal(second.activeId,'draft');
});
test('a named PPL allows one additional draft; more clicks reuse it, including at the limit',()=>{
 const rows=[link('named',{channel:'TV조선',program:'세개의 시선'})];let serial=0;
 const next=nextPplDraft(rows,()=>String(++serial));
 assert.equal(next.links.length,2);assert.equal(rows.length,1);assert.equal(next.reused,false);
 assert.notEqual(next.links[1].id,next.links[1].pplId);
 assert.equal(nextPplDraft(next.links,()=>String(++serial)).links,next.links);assert.equal(serial,2);
 const full=Array.from({length:20},(_,i)=>link(String(i),{channel:'채널',program:'프로그램'}));
 assert.equal(nextPplDraft(full,()=>String(++serial)),null);
 full[19].program='  ';assert.equal(nextPplDraft(full,()=>String(++serial)).activeId,'19');
});
