import test from 'node:test';
import assert from 'node:assert/strict';
import {splitPplCost,scheduleIssues} from '../lib/ppl-registration.ts';
import {applyFinanceAction,emptyFinance,contractTotals,withFinance} from '../lib/finance-model.ts';
import {masterLink} from '../lib/ppl-master.ts';
import {pplAirings} from '../lib/ppl-airings.ts';
import {broadcastClockIssues,usesActualClock} from '../lib/broadcast-clock.ts';
import {financeSheetRows} from '../lib/finance-sheets.ts';
import {store} from './postgres-fixture.mjs';
import {saveFinance} from '../lib/finance-store.ts';
const original={id:'original',date:'2026-10-31',time:'23:30',kind:'본방'};
const rerun={id:'rerun',date:'2026-11-01',time:'00:30',kind:'재방',originalDate:'2026-10-31'};
const data=()=>({party:'주식회사 미디어상생',businessNo:'7578802005',channel:'TV조선',program:'세개의 시선',approvalNo:'',date:'',net:'10000000',tax:'1000000',notes:'',tradeType:'agency',agencyRate:'10',airings:[original,rerun]});
const ids=new Set(['home-1','home-2']);
const apply=(f,kind,data)=>applyFinanceAction(f,{kind,data},ids);
const create=()=>apply(emptyFinance(),'contract',data());
const allocate=(f,broadcastId,airing,net='6000000')=>apply(f,'allocation',{contractId:f.contracts[0].id,broadcastId,airing,net,month:'2026-11',taxMode:'auto'});

test('agency fee is included in the total, with exact won rounding and zero for direct trade',()=>{
 assert.deepEqual(splitPplCost(data()),{fee:1000000,media:9000000,total:10000000});
 assert.deepEqual(splitPplCost({...data(),tradeType:'direct',agencyRate:'10'}),{fee:0,media:10000000,total:10000000});
 assert.equal(splitPplCost({...data(),agencyRate:'5'}).fee,500000);
 assert.equal(splitPplCost({...data(),net:'999',agencyRate:'5.25'}).fee,52);
 assert.equal(splitPplCost({...data(),agencyRate:'100.01'}),null);
 assert.equal(splitPplCost({...data(),agencyRate:'0.001'}),null);
 assert.equal(splitPplCost({net:'10000000'}),null);
});
test('registered original and rerun are selected by stable ID and cannot be replaced by stale client dates',()=>{
 let f=create();
 f=allocate(f,'home-1',{...original,date:'2026-09-01'});
 f=allocate(f,'home-2',rerun,'4000000');
 assert.equal(f.allocations[0].airing.date,original.date);
 assert.equal(f.allocations[1].airing.id,'rerun');
 assert.equal(contractTotals(f,f.contracts[0].id).remaining.net,'0');
 assert.throws(()=>allocate(create(),'home-1',{...original,id:'missing'}),/송출일정/);
 assert.throws(()=>allocate(create(),'home-1',undefined),/송출일정/);
 assert.throws(()=>allocate(f,'home-1',original),/같은 계약과 방송/);
});
test('schedule edits update linked dates without changing allocation or link identity; linked schedules cannot be deleted',()=>{
 let f=allocate(create(),'home-1',original);
 const c=f.contracts[0];const net=f.allocations[0].net;
 f=apply(f,'contract',{...c,airings:[{...original,date:'2026-10-30'},rerun]});
 assert.equal(f.allocations[0].airing.date,'2026-10-30');assert.equal(f.allocations[0].net,net);
 const broadcast={id:'home-1',ppl:'있음',pplLinks:[{...masterLink(c,{id:'home-1'}),id:'existing-link'}]};
 const projected=withFinance(broadcast,f);
 assert.equal(projected.pplLinks[0].id,'existing-link');assert.equal(projected.pplLinks[0].airingId,'original');
 assert.equal(projected.pplLinks[0].date,'2026-10-30');
 assert.throws(()=>apply(f,'contract',{...f.contracts[0],airings:[rerun]}),/삭제할 수 없습니다/);
 assert.equal(f.allocations[0].airing.date,'2026-10-30');
});
test('new schedules reject duplicate identities, invalid clocks and missing original dates, while old 24-hour schedules survive',()=>{
 assert.deepEqual(scheduleIssues([original,rerun]),[]);
 assert.match(scheduleIssues([original,{...rerun,id:original.id}]).join(' '),/ID/);
 assert.match(scheduleIssues([original,{...original,id:'other'}]).join(' '),/중복/);
 assert.match(scheduleIssues([{...original,time:'24:30'}]).join(' '),/23:59/);
 assert.match(scheduleIssues([{...rerun,originalDate:''}]).join(' '),/원본 본방일/);
 const legacy={...original,time:'24:30'};
 assert.deepEqual(scheduleIssues([legacy],[legacy]),[]);
 const linked={...original,id:'broadcast-link',airingId:'schedule-id',contractRef:'contract'};
 assert.equal(pplAirings({id:'contract'},[{ppl:'있음',pplLinks:[linked]}])[0].id,'schedule-id');
 delete linked.airingId;
 assert.equal(pplAirings({id:'contract'},[{ppl:'있음',pplLinks:[linked]}])[0].id,undefined);
 assert.deepEqual(pplAirings({id:'contract',airings:[original]},[],[{active:true,contractId:'contract',airing:{...original,date:'2026-09-30'}}]),[original]);
});
test('legacy allocation schedules can be registered without losing their split or interpreting the contract date as an airing',()=>{
 const legacyData=data();delete legacyData.airings;delete legacyData.tradeType;delete legacyData.agencyRate;
 let f=apply(emptyFinance(),'contract',legacyData);
 f=allocate(f,'home-1',{...original,id:undefined,time:'24:30'});
 f=apply(f,'contract',{...f.contracts[0],tradeType:'direct',airings:[{...original,id:'imported-0',time:'24:30'}]});
 assert.equal(f.allocations[0].airing.id,'imported-0');assert.equal(f.allocations[0].net,'6000000');
});
test('new broadcasts use actual midnight dates and retain the rule after saving, while legacy broadcasts remain unchanged',()=>{
 const b={date:'2026-11-01',time:'00:30'};
 assert.equal(usesActualClock(),true);assert.deepEqual(broadcastClockIssues(b),[]);
 assert.match(broadcastClockIssues({...b,time:'24:30'}).join(' '),/23:59/);
 assert.match(broadcastClockIssues({...b,calendarMonth:'2026-10'}).join(' '),/表示月|표시월/);
 assert.deepEqual(broadcastClockIssues({...b,time:''}),[]);
 assert.deepEqual(broadcastClockIssues({...b,time:'25:00'},{date:'2026-10-31',time:'25:00'}),[]);
 assert.match(broadcastClockIssues({...b,time:'25:00'},{...b,dateConvention:'actual'}).join(' '),/23:59/);
});
test('Google export exposes included agency amounts without adding them to the contract total',()=>{
 const tables=financeSheetRows(create());const table=tables.find(t=>t.range.startsWith("'SCM_계약'!"));
 assert.ok(table);
 const headers=table.values[0],row=table.values[1];
 assert.equal(row[headers.indexOf('포함 대행료')],1000000);
 assert.equal(row[headers.indexOf('대행료 제외 금액')],9000000);
});
test('PostgreSQL schedule edits atomically queue linked broadcasts and preserve allocated amounts',async()=>{
 const db=await store();try{
  const seed={id:'home-1',date:'2026-11-01',time:'00:30',channel:'SK',item:'테스트',ppl:'없음',pplLinks:[],allocation:''};
  let f=await saveFinance(db,{kind:'contract',data:data()},0,'reg-contract','actor','h1',[seed]);
  f=await saveFinance(db,{kind:'allocation',data:{contractId:f.contracts[0].id,broadcastId:seed.id,airing:original,net:'6000000',month:'2026-11',taxMode:'auto'}},f.version,'reg-allocation','actor','h2',[seed]);
  const before=JSON.parse((await db.prepare('SELECT payload FROM scm_records').first()).payload);
  f=await saveFinance(db,{kind:'contract',data:{...f.contracts[0],airings:[{...original,time:'22:30'},rerun]}},f.version,'reg-edit','actor','h3',[seed]);
  const after=JSON.parse((await db.prepare('SELECT payload FROM scm_records').first()).payload);
  assert.equal(after.version,before.version+1);
  assert.equal(withFinance(after,f).pplLinks[0].time,'22:30');assert.equal(after.allocation,'6000000');
  assert.equal((await db.prepare('SELECT version FROM scm_outbox').first()).version,after.version);
 }finally{await db.close();}
});
