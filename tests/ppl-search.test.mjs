import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesPpl,matchingPplAirings,pplCompanies} from '../lib/ppl-airings.ts';
const c={id:'ppl',code:'PPL-2026-0001',name:'2026-09 · 주식회사 센미디어 · TV조선',party:'주식회사 센미디어',businessNo:'1078672231',channel:'TV조선',program:'세개의 시선',date:'2026-09-17',airings:[{id:'a',date:'2026-10-22',time:'09:30',kind:'본방'},{id:'b',date:'2026-11-02',time:'10:00',kind:'재방'}]};
test('date time and program can be searched together with punctuation and one-digit hours',()=>{
 for(const q of ['10/22 09:30 세개의 시선','2026.10.22 9:30 세개의','10월22일 09시30분 세개의 시선'])assert.equal(matchesPpl(c,[],q),true,q);
 assert.equal(matchesPpl(c,[],'10/22 10:00 세개의 시선'),false);
 assert.equal(matchesPpl({...c,program:'',pplOrigin:{link:{program:'세개의 시선',date:'2026-10-22',time:'09:30',kind:'본방'}}},[],'10/22 09:30 세개의 시선'),true);
 for(const q of ['10/22 09:30 센미디어','2026-10-22 9:30 센미디어','10.22, 0930, 센미디어','10월22일 9시30분 센미디어','20261022 930 센미디어','센 미디어','TV조선 세개의 시선'])assert.equal(matchesPpl(c,[],q),true,q);
 assert.equal(matchesPpl(c,[],'10/2 센미디어'),false);
 assert.equal(matchesPpl(c,[],'2026-09-17'),false);
 assert.equal(matchesPpl(c,[],'10/22 10:00 센미디어'),false);
 assert.deepEqual(matchingPplAirings(c,[],'11/2 10:00 센미디어').map(a=>a.id),['b']);
});
test('search includes registered agency names on this contract, including custom and legacy allocation-only schedules',()=>{
 const contract={...c,party:'디온커뮤니케이션즈 주식회사',businessNo:'5758703517',name:'디온 계약',airings:[]};
 const items=[{ppl:'있음',pplLinks:[{contractRef:'ppl',agencyId:'PARTY-1078672231',date:'2026-10-22',time:'09:30',kind:'본방'}]},{ppl:'있음',pplLinks:[{contractRef:'other',agencyId:'other-party',date:'2026-11-05',time:'08:00',kind:'본방'}]}];
 assert.equal(matchesPpl(contract,items,'10/22 09:30 센미디어'),true);
 assert.equal(matchesPpl(contract,items,'11/5'),false);
 assert.deepEqual(pplCompanies(contract,items),['디온커뮤니케이션즈 주식회사','주식회사 센미디어']);
 const f={contracts:[contract],parties:[{id:'custom',name:'테스트청약사',businessNo:'1234567890',source:'test'}],allocations:[{contractId:'ppl',active:true,airing:{date:'2026-12-01',time:'07:00',kind:'본방'}}]};
 items[0].pplLinks[0].agencyId='custom';
 assert.equal(matchesPpl(contract,items,'12/1 7:00 테스트청약사',f),true);
 assert.equal(matchesPpl(contract,items,'센미디어',f),false);
});
test('a later matching rerun is returned even when it follows more than three schedules',()=>{
 const many={...c,airings:Array.from({length:5},(_,i)=>({id:String(i),date:`2026-10-${20+i}`,time:'09:30',kind:'재방'}))};
 assert.deepEqual(matchingPplAirings(many,[],'10/24 9:30 센미디어').map(a=>a.id),['4']);
 assert.equal(matchesPpl({...c,airings:[]},[],'센미디어'),true);
 assert.equal(matchesPpl({...c,airings:[]},[],'09:30 센미디어'),false);
});
