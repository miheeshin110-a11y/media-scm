import test from 'node:test';
import assert from 'node:assert/strict';
import {contractBroadcasts,workspaceContract} from '../lib/ppl-contracts.ts';
import {pplAirings,airingSummary,matchesPpl} from '../lib/ppl-airings.ts';
import {masterLink} from '../lib/ppl-master.ts';

test('PPL picker uses only matching PPL airings, never the home-shopping or contract date',()=>{
 const c={id:'ppl',code:'PPL-1',name:'계약',channel:'TV조선',program:'세개의 시선',party:'미디어상생',date:'2026-09-17'};
 const rows=[{id:'home',date:'2026-10-01',ppl:'있음',pplLinks:[{contractRef:'other',date:'2026-09-01',time:'10:00',kind:'본방'}]}];
 assert.equal(airingSummary(c,rows),'방송일 미등록');
 rows[0].pplLinks.push({contractRef:'ppl',date:'2026-08-31',time:'24:30',kind:'재방',originalDate:'2026-07-24'});
 assert.equal(airingSummary(c,rows),'2026-08-31 24:30 · 재방');
 assert.equal(matchesPpl(c,rows,'08/31 TV조선'),true);assert.equal(matchesPpl(c,rows,'2026-10-01'),false);
 const link=masterLink(c,{id:'new'},rows);assert.equal(link.date,'2026-08-31');assert.equal(link.originalDate,'2026-07-24');
});

test('a PPL with multiple original and rerun dates is deduplicated and never assigned an arbitrary airing',()=>{
 const original={date:'2026-08-03',time:'10:00',kind:'본방'},rerun={date:'2026-09-01',time:'08:00',kind:'재방',originalDate:'2026-08-03'};
 const c={id:'ppl',airings:[rerun,original],channel:'TV조선',program:'세개의 시선',pplOrigin:{link:original}};
 const items=[{ppl:'있음',pplLinks:[{...original,contractRef:'ppl'}]},{ppl:'없음',pplLinks:[{date:'2026-01-01',time:'10:00',kind:'본방',contractRef:'ppl'}]}];
 assert.deepEqual(pplAirings(c,items).map(a=>a.date),['2026-08-03','2026-09-01']);
 assert.equal(masterLink(c,{id:'new'}).date,'');assert.equal(masterLink(c,{id:'new'}).kind,'');
});

test('finance entry selects a broadcast-created contract immediately or the latest loaded contract',()=>{
 const older={id:'older'},createdInBroadcast={id:'ppl-new'},latest={id:'latest'};
 assert.equal(workspaceContract({contracts:[]},null),undefined);
 const finance={contracts:[older,createdInBroadcast,latest]};
 assert.equal(workspaceContract(finance,null,'ppl-new'),createdInBroadcast);
 assert.equal(workspaceContract(finance,null),latest);
 assert.equal(workspaceContract(finance,null,'missing'),latest);
});

test('manual contract selection and explicit new draft are preserved when finance reloads',()=>{
 const older={id:'older'},latest={id:'latest'},finance={contracts:[older,latest]};
 assert.equal(workspaceContract(finance,'older','latest'),older);
 assert.equal(workspaceContract(finance,'','latest'),undefined);
 assert.equal(workspaceContract(finance,'deleted','latest'),latest);
});

test('contract overview deduplicates broadcasts, sums active allocations, and distinguishes unallocated from zero',()=>{
 const items=[
  {id:'first',ppl:'있음',pplLinks:[{id:'a',contractRef:'contract'},{id:'b',contractRef:'contract'}]},
  {id:'second',ppl:'있음',pplLinks:[{id:'c',contractRef:'contract'}]},
  {id:'removed',ppl:'없음',pplLinks:[{id:'d',contractRef:'contract'}]},
 ];
 const finance={allocations:[
  {broadcastId:'first',contractId:'contract',active:true,net:'60000000'},
  {broadcastId:'first',contractId:'contract',active:true,net:'10000000'},
  {broadcastId:'first',contractId:'contract',active:false,net:'90000000'},
  {broadcastId:'third',contractId:'contract',active:true,net:'0'},
  {broadcastId:'other',contractId:'other-contract',active:true,net:'123'},
 ]};
 const rows=contractBroadcasts(finance,items,'contract');
 assert.deepEqual(rows.map(({id,net})=>({id,net})),[{id:'first',net:70000000},{id:'second',net:null},{id:'third',net:0}]);
 assert.equal(rows[2].item,undefined);
 assert.deepEqual(contractBroadcasts(finance,items,'missing'),[]);
});
