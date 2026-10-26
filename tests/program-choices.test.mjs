import test from 'node:test';
import assert from 'node:assert/strict';
import {programChoices} from '../lib/program-choices.ts';
import {applyFinanceAction,emptyFinance} from '../lib/finance-model.ts';
import {partyChoices} from '../lib/counterparties.ts';

test('program master collects registered and historical names for the selected channel only',()=>{
 const f={...emptyFinance(),programs:[{channel:'TV조선',name:'세개의 시선'}],contracts:[{channel:'TV 조선',program:'세개의시선'},{channel:'MBN',program:'다른 방송'}]};
 const items=[{pplLinks:[{channel:' TV조선 ',program:' 기존 프로그램 '},{channel:'JTBC',program:'다른 채널'}]}];
 assert.deepEqual(programChoices(f,items,'TV조선'),['기존 프로그램','세개의 시선']);
 assert.deepEqual(programChoices(f,items,''),[]);
 assert.deepEqual(programChoices(emptyFinance(),[],'TV조선'),[]);
 assert.deepEqual(programChoices(f,[],'TV조선','세개의시선'),['세개의시선']);
});

test('new program is saved to the shared master and is available on the next read',()=>{
 const f=applyFinanceAction(emptyFinance(),{kind:'program',data:{channel:'TV조선',name:'  신규 프로그램  '}},new Set());
 const reloaded=JSON.parse(JSON.stringify(f));
 assert.deepEqual(programChoices(reloaded,[],'TV조선'),['신규 프로그램']);
 assert.deepEqual(programChoices(reloaded,[],'MBN'),[]);
 assert.throws(()=>applyFinanceAction(reloaded,{kind:'program',data:{channel:'TV조선',name:'신규프로그램'}},new Set()),/이미 등록/);
});

test('new party persists with normalized business number and prevents duplicate registration',()=>{
 const f=applyFinanceAction(emptyFinance(),{kind:'party',data:{name:'테스트 업체',businessNo:'123-45-67890'}},new Set());
 assert.equal(partyChoices(JSON.parse(JSON.stringify(f))).find(p=>p.businessNo==='1234567890')?.name,'테스트 업체');
 assert.throws(()=>applyFinanceAction(f,{kind:'party',data:{name:'다른 상호',businessNo:'1234567890'}},new Set()),/이미 등록/);
});
