import test from 'node:test';
import assert from 'node:assert/strict';
import {store} from './postgres-fixture.mjs';
import {readFileSync} from 'node:fs';
import {actualDateTime,newResult,resultMetrics,validateItem,estimateShipment,unifiedResult} from '../lib/scm-model.ts';
import {saveRecord,SaveConflict} from '../lib/record-store.ts';
import {sheetRows} from '../lib/sheet-mapping.ts';

function item(){return {id:'TEST-0001',date:'2026-09-30',time:'25:00',channel:'SK',item:'테스트',shortItem:'테스트',owner:'검증',status:'계획',urgent:false,ppl:'없음',program:'',pplKind:'',price:'',target:'300000',rate:'',contractId:'',contractAmount:'',allocation:'',attribution:'',sync:'대기',hsTarget:'200000',businessProfitTarget:'10000'};}
test('24/25 hour scheduling preserves the scheduling day and rolls real date across month/year/leap day',()=>{
 assert.equal(actualDateTime('2026-09-30','25:00'),'2026-10-01 01:00');assert.equal(actualDateTime('2026-12-31','24:30'),'2027-01-01 00:30');assert.equal(actualDateTime('2028-02-28','25:00'),'2028-02-29 01:00');assert.equal(actualDateTime('2026-02-29','10:00'),'');assert.equal(actualDateTime('2026-09-30','25:'),'');assert.equal(actualDateTime('2026-09-30','48:00'),'');assert.equal(actualDateTime('2026-09-30','09:60'),'');
});
test('blank is unknown; explicit zero remains zero and never divides by zero',()=>{
 const r=newResult(),x={...item(),result:r};assert.equal(resultMetrics(x).orderTotal,null);r.single.quantity='0';r.double.quantity='0';r.orderAmount='0';assert.equal(resultMetrics(x).orderTotal,0);assert.equal(resultMetrics(x).achievement,0);x.hsTarget='0';assert.equal(resultMetrics(x).achievement,null);
});
test('conversion only estimates shipment; actual/confirmed quantities and plans remain unchanged',()=>{
 const x={...item(),result:newResult()};x.result.single.quantity='11';x.result.single.conversionRate='82';x.result.single.confirmedShipment='10';x.result.single.actualShipment='9';assert.equal(estimateShipment(x.result.single),9);assert.equal(x.result.single.confirmedShipment,'10');assert.equal(x.result.single.actualShipment,'9');assert.equal(x.target,'300000');
});
test('results save without manual status and accept signed profit and explicit zero',()=>{
 const x={...item(),result:newResult()};assert.deepEqual(validateItem(x),[]);assert.equal('status' in x.result,false);Object.assign(x.result,{actualDate:'2026-10-01',actualStart:'01:00',actualEndDate:'2026-10-01',actualEnd:'02:00',orderAmount:'0',asOfDate:'2026-10-02',sourceRef:'테스트 자료',profit:'-100'});x.result.single.quantity='0';x.result.double.quantity='0';assert.deepEqual(validateItem(x),[]);x.result.single.quantity='-1';assert.ok(validateItem(x).length);x.result.single.quantity='1.2';assert.ok(validateItem(x).length);x.result.single.quantity='0';x.result.single.conversionRate='101';assert.ok(validateItem(x).length);
});
test('first save, replay and another update preserve a single record and increment versions once',async()=>{
 const db=await store(),x=item();const first=await saveRecord(db,x,0,'request-00000001','actor-1','hash1');assert.equal(first.version,1);const replay=await saveRecord(db,x,0,'request-00000001','actor-1','hash1');assert.equal(replay.version,1);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM scm_records').bind().first()).n,1);await saveRecord(db,{...first,result:newResult()},1,'request-00000002','actor-1','hash2');await saveRecord(db,x,0,'request-00000001','actor-1','hash1');assert.equal((await db.prepare('SELECT version FROM scm_records').bind().first()).version,2);assert.equal((await db.prepare('SELECT version FROM scm_outbox').bind().first()).version,2);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM scm_revisions').bind().first()).n,2);await db.close();
});
test('concurrent edits reject the stale writer instead of overwriting a newer result',async()=>{
 const db=await store(),first=await saveRecord(db,item(),0,'request-00000001','actor-1','hash1');const results=await Promise.allSettled([saveRecord(db,{...first,target:'111'},1,'request-00000002','actor-1','hash2'),saveRecord(db,{...first,target:'222'},1,'request-00000003','actor-2','hash3')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected'&&x.reason instanceof SaveConflict).length,1);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM scm_revisions').bind().first()).n,2);await db.close();
});
test('request ID reuse with different contents or actor is rejected',async()=>{
 const db=await store(),x=item();await saveRecord(db,x,0,'request-00000001','actor-1','hash1');await assert.rejects(()=>saveRecord(db,x,0,'request-00000001','actor-2','hash1'),SaveConflict);await assert.rejects(()=>saveRecord(db,x,0,'request-00000001','actor-1','hash-other'),SaveConflict);await db.close();
});
test('audit failure rolls back the record mutation',async()=>{
 const db=await store();await assert.rejects(()=>saveRecord(db,item(),0,null,'actor-1','hash1'));assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM scm_records').bind().first()).n,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM scm_outbox').bind().first()).n,0);await db.close();
});
test('sheet exports use deterministic rows, two independent configurations, and keep unknown distinct from zero',()=>{
 const x={...item(),result:newResult(),version:1};x.result.single.quantity='0';x.result.double.quantity='5';x.result.profit='-123';const rows=sheetRows(x,2);assert.equal(rows[0].range,"'SCM_방송'!A3:N3");assert.equal(rows[2].range,"'SCM_구성실적'!A4:N5");assert.equal(rows[1].values[0][6],5);assert.equal(rows[2].values[0][4],0);assert.equal(rows[2].values[0][12],'');assert.equal(rows[1].values[0][9],-123);assert.deepEqual(sheetRows(x,2),rows);
});

test('legacy duplicate amounts become one value without double counting',()=>{const old={...newResult(),profit:undefined,goodsCost:'100',manufacturingCost:'100',originalProfit:'-20',lookerProfit:'-20',status:'임시'};const r=unifiedResult(old);assert.equal(r.goodsCost,'100');assert.equal(r.profit,'-20');assert.equal('status' in r,false);assert.equal('manufacturingCost' in r,false);assert.equal('lookerProfit' in r,false);assert.equal(unifiedResult({...old,profit:'0'}).profit,'0');});

import {emptyFinance,applyFinanceAction,contractTotals,withFinance} from '../lib/finance-model.ts';
import {saveFinance,readFinance} from '../lib/finance-store.ts';
import {financeSheetRows} from '../lib/finance-sheets.ts';
const financeDB=store;
const contractData=(extra={})=>({name:'공동 PPL',party:'주식회사 미디어상생',businessNo:'7578802005',channel:'TV조선',approvalNo:'기안-001',date:'2026-09-17',net:'12000000',tax:'1200000',notes:'',...extra});
const action=(kind,data)=>({kind,data});

test('each home-shopping allocation saves its own PPL schedule and amount, with date-only changes queued',async()=>{
 const db=await financeDB(),a={...item(),id:'home-a',ppl:'미정',pplLinks:[]},b={...item(),id:'home-b',ppl:'미정',pplLinks:[]};
 let f=await saveFinance(db,action('contract',contractData({program:'세개의 시선'})),0,'allocation-master','actor','ha',[a,b]);const c=f.contracts[0];
 const first={date:'2026-08-01',time:'10:30',kind:'본방',originalDate:''},second={date:'2026-09-01',time:'24:30',kind:'재방',originalDate:'2026-08-01'};
 f=await saveFinance(db,action('allocations',{contractId:c.id,rows:[{broadcastId:a.id,net:'8000000',month:'2026-08',airing:first},{broadcastId:b.id,net:'4000000',month:'2026-09',airing:second}]}),f.version,'schedule-batch','actor','hb',[a,b]);
 assert.equal(f.contracts[0].airings,undefined);assert.equal(withFinance(a,f).pplLinks[0].date,first.date);assert.equal(withFinance(b,f).pplLinks[0].date,second.date);assert.equal(withFinance(b,f).allocation,'4000000');
 const rows=financeSheetRows(f)[1];assert.equal(rows.values[2][11],second.date);assert.equal(rows.values[2][12],'24:30');
 const old=JSON.stringify(f);
 await assert.rejects(()=>saveFinance(db,action('allocation',{...f.allocations[1],net:'5000000',airing:{...second,date:'2026-09-02'}}),f.version,'schedule-overflow','actor','hc',[a,b]),/초과/);
 assert.equal(JSON.stringify(await readFinance(db)),old);
 f=await saveFinance(db,action('allocation',{...f.allocations[1],airing:{...second,date:'2026-09-02'}}),f.version,'schedule-date-only','actor','hd',[a,b]);
 assert.equal((await db.prepare('SELECT version FROM scm_outbox WHERE record_id=?').bind(b.id).first()).version,2);
 assert.equal(withFinance(b,f).pplLinks[0].date,'2026-09-02');assert.equal(withFinance(a,f).pplLinks[0].date,first.date);
 const {airing:omitted,...legacy}=f.allocations[1];f=applyFinanceAction(f,action('allocation',{...legacy,net:'3000000'}),new Set([a.id,b.id]));assert.equal(f.allocations[1].airing.date,'2026-09-02');
 assert.throws(()=>applyFinanceAction(f,action('allocation',{...f.allocations[1],airing:{date:'2026-09-02',time:'50:00',kind:'본방'}}),new Set([b.id])),/PPL 방송일/);
 await db.close();
});

test('master PPL schedules persist separately from contract date and reject invalid times',()=>{
 const airings=[{date:'2026-08-31',time:'24:30',kind:'재방',originalDate:'2026-07-24'}];
 let f=applyFinanceAction(emptyFinance(),action('contract',contractData({airings})),new Set());
 assert.deepEqual(f.contracts[0].airings,airings);assert.equal(f.contracts[0].date,'2026-09-17');
 assert.match(financeSheetRows(f)[0].values[1][14],/2026-08-31 24:30/);
 const {airings:ignored,...legacyEdit}=f.contracts[0];
 f=applyFinanceAction(f,action('contract',legacyEdit),new Set());assert.deepEqual(f.contracts[0].airings,airings);
 assert.throws(()=>applyFinanceAction(f,action('contract',{...f.contracts[0],airings:[{date:'2026-08-31',time:'55:00',kind:'본방'}]}),new Set()),/PPL 방송일/);
});

test('PPL total is registered before broadcasts, splits across months, and exports joined program and cost',()=>{
 let f=applyFinanceAction(emptyFinance(),action('contract',contractData({program:'세개의 시선',net:'90000000',taxMode:'auto'})),new Set());
 const c=f.contracts[0];assert.equal(f.allocations.length,0);assert.equal(c.program,'세개의 시선');
 f=applyFinanceAction(f,action('allocations',{contractId:c.id,rows:[{broadcastId:'A',month:'2026-08',net:'60000000'},{broadcastId:'B',month:'2026-09',net:'30000000'}]}),new Set(['A','B']));
 assert.equal(contractTotals(f,c.id).remaining.net,'0');assert.equal(f.contracts[0].net,'90000000');
 const projected=withFinance({...item(),id:'B',ppl:'미정',pplLinks:[],program:'',result:newResult()},f);
 assert.equal(projected.ppl,'있음');assert.equal(projected.pplLinks[0].contractRef,c.id);assert.equal(projected.program,'세개의 시선');
 assert.equal(projected.result.pplCost,'30000000');assert.equal(projected.attribution,'2026-09');
 assert.deepEqual(withFinance(projected,f),projected);
 const rows=financeSheetRows(f);assert.equal(rows[0].values[1][13],'세개의 시선');assert.equal(rows[0].values[1][8],'90000000');
 const exported=sheetRows(projected,1).find(r=>r.range.startsWith("'SCM_PPL연결'"));assert.equal(exported.values[0][11],c.id);assert.equal(exported.values[0][4],'세개의 시선');
 const b=f.allocations.find(a=>a.broadcastId==='B');
 f=applyFinanceAction(f,action('allocation',{...b,net:'20000000'}),new Set(['A','B']));
 assert.equal(f.allocations.find(a=>a.broadcastId==='A').net,'60000000');assert.equal(contractTotals(f,c.id).remaining.net,'10000000');
 assert.throws(()=>applyFinanceAction(f,action('allocation',{contractId:c.id,broadcastId:'B',month:'2026-09',net:'1'}),new Set(['B'])),/같은 계약과 방송/);
 f=applyFinanceAction(f,action('voidAllocation',{id:b.id}),new Set(['B']));
 assert.equal(withFinance(projected,f).pplLinks.length,0);assert.equal(withFinance(projected,f).result.pplCost,'0');
});

test('PPL allocation projection preserves existing airing details and contract edits queue linked broadcasts',async()=>{
 const db=await financeDB(),seed={...item(),id:'broadcast-master',ppl:'미정',pplLinks:[]};
 let f=await saveFinance(db,action('contract',contractData({program:'세개의 시선'})),0,'master-create','actor','master1',[seed]);
 const c=f.contracts[0];
 f=await saveFinance(db,action('allocation',{contractId:c.id,broadcastId:seed.id,month:'2026-08',net:'3000000'}),f.version,'master-connect','actor','master2',[seed]);
 const projected=withFinance(seed,f),airing={...projected,pplLinks:projected.pplLinks.map(l=>({...l,date:'2026-08-31',time:'10:00',kind:'재방',originalDate:'2026-07-24'}))};
 f=await saveFinance(db,action('contract',{...c,program:'수정 프로그램'}),f.version,'master-edit','actor','master3',[seed]);
 const updated=withFinance(airing,f);assert.equal(updated.pplLinks.length,1);assert.equal(updated.pplLinks[0].date,'2026-08-31');assert.equal(updated.pplLinks[0].originalDate,'2026-07-24');assert.equal(updated.pplLinks[0].program,'수정 프로그램');
 assert.equal((await db.prepare('SELECT version FROM scm_outbox').bind().first()).version,2);await db.close();
});
test('one contract splits across broadcasts with fixed IDs and separate VAT totals',()=>{
 let f=applyFinanceAction(emptyFinance(),action('contract',contractData()),new Set());
 const c=f.contracts[0],code=c.code,id=c.id;
 for(const [broadcastId,net]of [['A','5000000'],['B','4000000'],['C','3000000']])f=applyFinanceAction(f,action('allocation',{contractId:id,broadcastId,month:'2026-09',net,tax:String(Number(net)/10)}),new Set(['A','B','C']));
 assert.equal(f.allocations.length,3);assert.deepEqual(contractTotals(f,id).remaining,{net:'0',tax:'0'});
 assert.throws(()=>applyFinanceAction(f,action('allocation',{contractId:id,broadcastId:'D',month:'2026-09',net:'1',tax:'0'}),new Set(['D'])),/초과/);
 f=applyFinanceAction(f,action('contract',{...c,date:'2027-01-01',name:'변경 계약'}),new Set(['A','B','C']));assert.equal(f.contracts[0].id,id);assert.equal(f.contracts[0].code,code);
});
test('invoice may split across same-vendor contracts, but duplicate approvals and wrong vendors are blocked',()=>{
 let f=applyFinanceAction(emptyFinance(),action('contract',contractData()),new Set());f=applyFinanceAction(f,action('contract',contractData({name:'두 번째'})),new Set());
 const [a,b]=f.contracts;const inv={party:a.party,businessNo:a.businessNo,date:'2026-09-17',approvalNo:'TAX-001',net:'6000000',tax:'600000',notes:'',links:[{contractId:a.id,net:'4000000',tax:'400000'},{contractId:b.id,net:'2000000',tax:'200000'}]};
 f=applyFinanceAction(f,action('invoice',inv),new Set());assert.equal(contractTotals(f,a.id).invoiced.net,'4000000');assert.equal(contractTotals(f,b.id).invoiced.net,'2000000');
 assert.throws(()=>applyFinanceAction(f,action('invoice',inv),new Set()),/승인번호/);
 assert.throws(()=>applyFinanceAction(f,action('invoice',{...inv,approvalNo:'TAX-002',businessNo:'9999999999'}),new Set()),/사업자/);
 assert.throws(()=>applyFinanceAction(f,action('invoice',{...inv,approvalNo:'TAX-003',net:'1'}),new Set()),/초과/);
 const rows=financeSheetRows(f);assert.equal(rows[3].values[1][5],'400000');assert.equal(rows[0].values.length,1001);
});
test('allocation edit and removal atomically update result cost, audit and outbox without adding profit',async()=>{
 const db=await financeDB(),seed={...item(),result:{...newResult(),profit:'333'}};
 let f=await saveFinance(db,action('contract',contractData()),0,'finance-contract-0001','actor','hash-c',[seed]);
 const a=action('allocation',{contractId:f.contracts[0].id,broadcastId:seed.id,month:'2026-09',net:'5000000',tax:'500000'});
 f=await saveFinance(db,a,f.version,'finance-allocate-0001','actor','hash-a',[seed]);
 let saved=JSON.parse((await db.prepare('SELECT payload FROM scm_records').bind().first()).payload);assert.equal(saved.result.pplCost,'5000000');assert.equal(saved.result.profit,'333');assert.equal(saved.version,1);
 f=await saveFinance(db,action('allocation',{...f.allocations[0],net:'4000000',tax:'400000'}),f.version,'finance-allocate-0002','actor','hash-b',[seed]);
 saved=JSON.parse((await db.prepare('SELECT payload FROM scm_records').bind().first()).payload);assert.equal(saved.result.pplCost,'4000000');assert.equal(saved.version,2);
 f=await saveFinance(db,action('voidAllocation',{id:f.allocations[0].id}),f.version,'finance-allocate-0003','actor','hash-v',[seed]);
 saved=JSON.parse((await db.prepare('SELECT payload FROM scm_records').bind().first()).payload);assert.equal(saved.result.pplCost,'0');assert.equal(saved.allocation,'0');assert.equal(saved.version,3);assert.equal((await db.prepare('SELECT COUNT(*) n FROM scm_revisions').bind().first()).n,3);assert.equal((await db.prepare('SELECT version FROM scm_outbox').bind().first()).version,3);await db.close();
});
test('concurrent identical finance retries do not allocate twice or increment broadcast twice',async()=>{
 const db=await financeDB(),seed=item();let f=await saveFinance(db,action('contract',contractData()),0,'finance-contract-0001','actor','h-c',[seed]);
 const a=action('allocation',{contractId:f.contracts[0].id,broadcastId:seed.id,month:'2026-09',net:'100',tax:'10'});
 const r=await Promise.all([saveFinance(db,a,1,'finance-allocate-0001','actor','h-a',[seed]),saveFinance(db,a,1,'finance-allocate-0001','actor','h-a',[seed])]);
 assert.equal(r[0].allocations[0].id,r[1].allocations[0].id);assert.equal((await db.prepare('SELECT version FROM scm_records').bind().first()).version,1);assert.equal((await readFinance(db)).allocations.length,1);await db.close();
});
test('stale finance writers and stale broadcast projections cannot overwrite a later allocation',async()=>{
 const db=await financeDB(),seed=item();const f=await saveFinance(db,action('contract',contractData()),0,'finance-contract-0001','actor','h-c',[seed]);
 await assert.rejects(()=>saveFinance(db,action('contract',contractData()),0,'finance-contract-0002','actor','h-x',[seed]),SaveConflict);
 await assert.rejects(()=>saveRecord(db,{...seed,financeVersion:0},0,'broadcast-stale-0001','actor','hash',0),SaveConflict);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM scm_records').bind().first()).n,0);
 const projected=withFinance(seed,f);assert.equal(projected.financeVersion,1);await db.close();
});


test('party selection canonicalizes names, rejects unregistered IDs and duplicate business numbers',()=>{
 let f=emptyFinance();
 f=applyFinanceAction(f,action('contract',contractData({party:'미디어상생  (별칭)',businessNo:'757-88-02005'})),new Set());
 assert.equal(f.contracts[0].party,'주식회사 미디어상생');assert.equal(f.contracts[0].partyId,'PARTY-7578802005');
 assert.throws(()=>applyFinanceAction(f,action('contract',contractData({businessNo:'9999999999'})),new Set()),/목록/);
 assert.throws(()=>applyFinanceAction(f,action('contract',contractData({partyId:'PARTY-5758703517'})),new Set()),/목록/);
 assert.throws(()=>applyFinanceAction(f,action('contract',contractData({channel:'티비조선'})),new Set()),/채널/);
 assert.throws(()=>applyFinanceAction(f,action('party',{name:'다른 이름',businessNo:'757-88-02005'}),new Set()),/이미 등록/);
 assert.throws(()=>applyFinanceAction(f,action('party',{name:'자사',businessNo:'1148667134'}),new Set()),/자사/);
 f=applyFinanceAction(f,action('party',{name:'추가 거래처',businessNo:'123-45-67890'}),new Set());
 f=applyFinanceAction(f,action('contract',contractData({partyId:'PARTY-1234567890',businessNo:'1234567890',party:'임의 이름'})),new Set());
 assert.equal(f.contracts[1].party,'추가 거래처');assert.equal(f.parties.length,1);
 const c=f.contracts[0];f=applyFinanceAction(f,action('invoice',{party:'임의 별칭',partyId:c.partyId,businessNo:c.businessNo,date:'2026-09-17',approvalNo:'CANONICAL-001',net:'100',tax:'10',notes:'',links:[{contractId:c.id,net:'100',tax:'10'}]}),new Set());
 assert.equal(f.invoices[0].party,c.party);assert.equal(f.invoices[0].partyId,c.partyId);
});

test('new party survives storage and does not change broadcast costs',async()=>{
 const db=await financeDB();const f=await saveFinance(db,action('party',{name:'추가 거래처',businessNo:'1234567890'}),0,'master-party-0000001','actor','master-hash',[item()]);
 assert.equal((await readFinance(db)).parties[0].id,'PARTY-1234567890');assert.equal(f.contracts.length,0);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM scm_records').bind().first()).n,0);await db.close();
});


test('a multi-broadcast save is atomic, supports redistribution, preserves IDs and updates all results',async()=>{
 const db=await financeDB(),seeds=['A','B','C'].map(id=>({...item(),id,result:{...newResult(),profit:'777'}}));
 let f=await saveFinance(db,action('contract',contractData()),0,'bulk-contract-000001','actor','bc',seeds);const c=f.contracts[0];
 const rows=seeds.map((b,i)=>({id:'',broadcastId:b.id,month:'2026-09',net:['5000000','4000000','3000000'][i]}));
 const first=action('allocations',{contractId:c.id,rows});
 f=await saveFinance(db,first,f.version,'bulk-allocations-0001','actor','ba',seeds);
 assert.equal(f.version,2);assert.equal(f.allocations.length,3);const ids=f.allocations.map(a=>a.id);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM scm_records').bind().first()).n,3);
 for(const r of (await db.prepare('SELECT payload FROM scm_records').all()).results){const b=JSON.parse(r.payload);assert.equal(b.result.profit,'777');assert.equal(b.result.pplCost,rows.find(x=>x.broadcastId===b.id).net);assert.equal(b.version,1);}
 const replay=await saveFinance(db,first,1,'bulk-allocations-0001','actor','ba',seeds);assert.deepEqual(replay.allocations.map(a=>a.id),ids);
 const before=await readFinance(db);
 await assert.rejects(()=>saveFinance(db,action('allocations',{contractId:c.id,rows:[...rows.slice(0,2),{...rows[2],net:'99999999'}]}),f.version,'bulk-invalid-0000001','actor','bad',seeds),/초과/);
 assert.deepEqual(await readFinance(db),before);
 f=await saveFinance(db,action('allocations',{contractId:c.id,rows:f.allocations.map((a,i)=>({...a,net:['3000000','6000000','3000000'][i]}))}),f.version,'bulk-reallocate-0001','actor','br',seeds);
 assert.deepEqual(f.allocations.map(a=>a.id),ids);assert.equal(contractTotals(f,c.id).remaining.net,'0');
 const version=f.version;
 assert.throws(()=>applyFinanceAction(f,action('allocations',{contractId:c.id,rows:[f.allocations[0],{...f.allocations[1],broadcastId:'A'}]}),new Set(['A','B','C'])),/중복/);
 f=await saveFinance(db,action('allocations',{contractId:c.id,rows:[]}),version,'bulk-removeall-00001','actor','remove',seeds);
 assert.equal(f.allocations.filter(a=>a.active).length,0);for(const r of (await db.prepare('SELECT payload FROM scm_records').all()).results)assert.equal(JSON.parse(r.payload).result.pplCost,'0');await db.close();
});

test('contract names are generated and auto VAT is authoritative with exact allocation rounding',()=>{
 let f=applyFinanceAction(emptyFinance(),action('contract',contractData({name:'임의 입력',net:'101',tax:'999',taxMode:'auto'})),new Set(),'2026-09-17');
 const c=f.contracts[0];assert.equal(c.name,'2026-09 · 주식회사 미디어상생 · TV조선 · '+c.code);assert.equal(c.tax,'10');
 f=applyFinanceAction(f,action('allocations',{contractId:c.id,rows:['33','33','35'].map((net,i)=>({broadcastId:['A','B','C'][i],month:'2026-09',net,tax:'999'}))}),new Set(['A','B','C']));
 assert.deepEqual(f.allocations.map(a=>a.tax),['3','3','4']);assert.equal(contractTotals(f,c.id).remaining.tax,'0');
 f=applyFinanceAction(f,action('contract',{...c,date:'2026-10-01',net:'101',tax:'9',taxMode:'manual'}),new Set(['A','B','C']));
 assert.equal(f.contracts[0].id,c.id);assert.equal(f.contracts[0].code,c.code);assert.ok(f.contracts[0].name.startsWith('2026-10 ·'));
 assert.deepEqual(f.allocations.map(a=>a.tax),['2','3','4']);assert.equal(contractTotals(f,c.id).remaining.tax,'0');
});

test('invoice VAT auto calculation and manual correction both distribute exact linked VAT',()=>{
 let f=emptyFinance();for(let i=0;i<2;i++)f=applyFinanceAction(f,action('contract',contractData({net:'101',tax:'10'})),new Set());
 const [a,b]=f.contracts;const invoice={party:a.party,businessNo:a.businessNo,date:'2026-09-17',approvalNo:'AUTO-VAT',notes:'',net:'101',tax:'999',taxMode:'auto',linkTaxMode:'auto',links:[{contractId:a.id,net:'50'},{contractId:b.id,net:'51'}]};
 f=applyFinanceAction(f,action('invoice',invoice),new Set());assert.equal(f.invoices[0].tax,'10');assert.deepEqual(f.invoices[0].links.map(l=>l.tax),['4','6']);
 f=applyFinanceAction(f,action('invoice',{...f.invoices[0],taxMode:'manual',tax:'9'}),new Set());assert.deepEqual(f.invoices[0].links.map(l=>l.tax),['4','5']);
});


import {canRead,canEdit} from '../lib/access.ts';
test('public demo can be read anonymously but only configured editors may write',()=>{
 const config={SCM_PUBLIC_DEMO:'1',SCM_EDITOR_IDENTITIES:JSON.stringify(['owner-id','email:owner@example.test'])};
 const request=(headers={})=>new Request('https://example.test/api/records',{headers});
 assert.equal(canRead(request(),config),true);assert.equal(canEdit(request(),config),false);
 assert.equal(canEdit(request({'oai-authenticated-user-id':'other-user'}),config),false);
 assert.equal(canEdit(request({'oai-authenticated-user-id':'owner-id'}),config),true);
 assert.equal(canEdit(request({'oai-authenticated-user-email':'OWNER@example.test'}),config),true);
 assert.equal(canEdit(request({'oai-authenticated-user-id':'owner-id'}),{SCM_PUBLIC_DEMO:'1',SCM_EDITOR_IDENTITIES:'malformed'}),false);
 assert.equal(canEdit(request({'authorization':'Bearer owner-id','cookie':'user=owner-id'}),config),false);
 assert.equal(canRead(request(),{}),false);assert.equal(canEdit(request(),{}),false);
});


import {editingItem,compositions,costPlan,costCalculation,orderCalculation,computedItem,validateWorkflow,missingForReview} from '../lib/workflow.ts';

test('review handoff identifies only missing PPL fields and permits an incomplete request',()=>{
 const x={...editingItem(item()),workflow:'검토 요청',ppl:'있음',pplLinks:[{id:'review-link',pplId:'',channel:'TV조선',program:'세개의 시선',agencyId:'',kind:'',date:'2026-09-30',time:'10:00'}]};
 const gaps=missingForReview(x).filter(v=>v.startsWith('PPL 1'));
 assert.deepEqual(gaps,['PPL 1 청약사','PPL 1 송출구분']);
 assert.deepEqual(validateWorkflow(x),[]);
 assert.ok(validateWorkflow({...x,workflow:'검토 완료'}).some(v=>v.includes('청약사')));
});

test('request, correction note and resubmission persist on one broadcast and export to review sheet',async()=>{
 const db=await store(),x={...editingItem(item()),workflow:'검토 요청'};
 const requested=await saveRecord(db,x,0,'handoff-request-0001','manager','r1');
 const correction=await saveRecord(db,{...requested,workflow:'보완 요청',reviewNote:'청약사 선택 후 다시 요청해 주세요.'},1,'handoff-correction-0001','reviewer','r2');
 const row=JSON.parse((await db.prepare('SELECT payload FROM scm_records WHERE id=?').bind(x.id).first()).payload);
 assert.equal(row.workflow,'보완 요청');assert.equal(row.reviewNote,correction.reviewNote);
 const resent=await saveRecord(db,{...correction,workflow:'검토 요청'},2,'handoff-request-0002','manager','r3');
 assert.equal(resent.id,requested.id);assert.equal(resent.reviewNote,correction.reviewNote);
 const review=sheetRows(resent,2).find(r=>r.range.includes('SCM_검토'));
 assert.ok(review.values[0].includes('검토 요청'));assert.ok(review.values[0].includes(correction.reviewNote));
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM scm_records').bind().first()).n,1);await db.close();
});
import {canReview} from '../lib/access.ts';
function calculated(){
 const x={...editingItem(item()),status:'편성확정',calculationMode:'auto',result:newResult()};
 x.compositions.single={...x.compositions.single,sku:'DT00157',enabled:true,units:'3',unitCost:'1000',sellingPrice:'248000',commission:'15',vatBasis:'포함',plannedQuantity:'100',conversionRate:'80'};
 x.compositions.double.enabled=false;
 x.costPlan={...x.costPlan,adCost:'100000',guestCost:'0',administrationCost:'0',otherCost:'0',shippingRate:'3800',shippingBasis:'sets',quantityRounding:'floor',moneyRounding:'round'};
 x.result.single={...x.result.single,quantity:'100',conversionRate:'80',actualShipment:'77'};
 x.gifts=[{id:'gift1',side:'single',item:'젤리',units:'2',unitCost:'500'}];
 return x;
}

test('orders use main and sub selling prices before fees and conversion, normalize VAT, and retain legacy profit',()=>{
 const x=calculated();x.calculationMode='legacy';x.result.profit='12345';x.result.orderAmount='1';x.result.orderAmountMode='auto';
 x.compositions.single.sellingPrice='55000';x.result.single.quantity='10';
 x.compositions.double={...x.compositions.single,enabled:true,sellingPrice:'30000',vatBasis:'별도'};x.result.double.quantity='2';
 const m=orderCalculation(x);assert.equal(m.lines.single.amount,550000);assert.equal(m.lines.double.amount,60000);
 assert.equal(m.gross,616000);assert.equal(m.net,560000);
 const saved=computedItem(x);assert.equal(saved.result.orderAmount,'560000');assert.equal(saved.result.profit,'12345');
 assert.equal(saved.result.single.sellingPrice,'55000');assert.equal(saved.result.double.vatBasis,'별도');
 const rows=sheetRows(x,1);assert.equal(rows.find(row=>row.range.startsWith("'SCM_방송결과'")).values[0][7],560000);
 assert.equal(rows.find(row=>row.range.startsWith("'SCM_구성실적'")).values[0][5],55000);
 assert.equal(x.result.orderAmount,'1');assert.equal(computedItem(saved).result.orderAmount,'560000');
 x.compositions.single.sellingPrice='66000';assert.equal(computedItem(x).result.orderAmount,'660000');
 x.compositions.double.enabled=false;assert.equal(computedItem(x).result.orderAmount,'600000');
});

test('order calculation distinguishes unknown, zero, disabled composition, and rounds after summing',()=>{
 const x=calculated();x.result.orderAmountMode='auto';x.compositions.single.sellingPrice='1000';x.result.single.quantity='1';
 x.compositions.double={...x.compositions.single,enabled:true};x.result.double.quantity='1';
 assert.equal(orderCalculation(x).net,1818);x.costPlan.moneyRounding='floor';assert.equal(orderCalculation(x).net,1818);
 x.result.double.quantity='';assert.equal(computedItem(x).result.orderAmount,'');
 x.result.double.quantity='0';assert.equal(orderCalculation(x).net,909);
 x.result.single.quantity='';assert.equal(orderCalculation(x).net,null);
 x.result.single.quantity='0';x.compositions.single.sellingPrice='';assert.equal(orderCalculation(x).net,0);
 x.result.single.quantity='1';assert.equal(orderCalculation(x).net,null);
 x.compositions.single.sellingPrice='1001';x.costPlan.moneyRounding='';assert.equal(orderCalculation(x).net,910);
 x.compositions.single.sellingPrice='1006';assert.equal(orderCalculation(x).net,915);x.costPlan.moneyRounding='floor';assert.equal(orderCalculation(x).net,914);
 delete x.result.orderAmountMode;x.result.orderAmount='777';assert.equal(computedItem(x).result.orderAmount,'777');
});
test('partial draft accepts unknown scheduling and owner but rejects invalid dates and cancellation without reason',()=>{
 const x={...editingItem(item()),date:'',time:'',channel:'',owner:'',status:''};
 assert.deepEqual(validateItem(x),[]);assert.deepEqual(validateWorkflow(x),[]);
 assert.ok(validateItem({...x,date:'2026-02-30'}).length);
 assert.ok(validateWorkflow({...x,status:'취소'}).some(v=>v.includes('취소 사유')));
 assert.deepEqual(validateWorkflow({...x,status:'취소',cancelReason:'결방',workflow:'검토 완료'}),[]);
 assert.ok(validateWorkflow({...x,status:'편성확정'}).length);
});
test('calculation uses selected rounding and shipment estimates without overwriting actual shipment',()=>{
 const x=calculated(),m=costCalculation(x);
 assert.equal(m.shipments.single,80);assert.equal(m.shipments.double,0);
 assert.equal(m.revenue,15330909);assert.equal(m.goodsCost,240000);assert.equal(m.shippingCost,304000);assert.equal(m.giftCost,80000);assert.equal(m.profit,14606909);
 const y=computedItem(x);assert.equal(y.result.profit,'14606909');assert.equal(y.result.actualShipment,undefined);assert.equal(y.result.single.actualShipment,'77');assert.equal(resultMetrics(y).orderTotal,100);
 x.costPlan.quantityRounding='round';x.result.single.quantity='11';x.result.single.conversionRate='86';assert.equal(costCalculation(x).shipments.single,9);
 x.result.single.conversionRate='89';assert.equal(costCalculation(x).shipments.single,10);x.costPlan.quantityRounding='floor';assert.equal(costCalculation(x).shipments.single,9);
});
test('missing cost stays unknown; legacy profits are not recalculated until auto mode is enabled',()=>{
 const x=calculated();x.compositions.single.unitCost='';assert.equal(costCalculation(x).profit,null);assert.equal(computedItem(x).result.profit,'');
 x.calculationMode='legacy';x.result.profit='12345';assert.equal(computedItem(x).result.profit,'12345');
 x.compositions.single.unitCost='0';assert.notEqual(costCalculation(x).profit,null);
 x.costPlan.shippingBasis='';assert.equal(costCalculation(x).shippingCost,null);
});
test('main and sub compositions and their gifts calculate separately',()=>{
 const x=calculated();x.compositions.double={...x.compositions.single,enabled:true,units:'6',sellingPrice:'110000',commission:'0'};
 x.result.double={...x.result.double,quantity:'20',conversionRate:'50'};x.gifts.push({id:'gift2',side:'double',item:'젤리',units:'1',unitCost:'500'});
 const m=costCalculation(x);assert.equal(m.shipmentTotal,90);assert.equal(m.goodsCost,300000);assert.equal(m.giftCost,85000);assert.equal(m.shippingCost,342000);assert.equal(m.revenue,16330909);
});
test('rerun original date is required for review completion but can be deferred in a draft',()=>{
 const x=calculated();x.ppl='있음';x.pplLinks=[{id:'link1',pplId:'ppl1',program:'세개의 시선',channel:'TV조선',agencyId:'channel:TV조선',kind:'재방',date:'2026-09-20',time:'10:00'}];
 assert.deepEqual(validateWorkflow(x),[]);assert.ok(missingForReview(x).includes('PPL 1 본방일'));
 x.pplLinks[0].originalDate='2026-10-01';assert.ok(validateWorkflow(x).some(v=>v.includes('늦습니다')));
});
test('sheet exports clear removed links and gifts and preserve distinct calendar and cost months',()=>{
 const x=calculated();x.calendarMonth='2026-10';x.costPlan.pplProcessingMonth='2026-07';x.replacesId='CANCELLED';
 const rows=sheetRows(x,3),review=rows.find(r=>r.range.includes('SCM_검토')),gifts=rows.find(r=>r.range.includes('SCM_사은품')),links=rows.find(r=>r.range.includes('SCM_PPL연결'));
 assert.equal(review.values[0][7],'CANCELLED');assert.equal(review.values[0][8],'2026-10');assert.equal(gifts.values.length,10);assert.equal(links.values.length,20);
 assert.equal(gifts.values[0][4],2);x.gifts=[];assert.ok(sheetRows(x,3).find(r=>r.range.includes('SCM_사은품')).values.flat().every(v=>v===''));
});
test('manager can save while only reviewer and owner can complete review',()=>{
 const config={SCM_PUBLIC_DEMO:'1',SCM_INPUTTER_IDENTITIES:'["email:manager@example.test"]',SCM_REVIEWER_IDENTITIES:'["email:lead@example.test"]'};
 const req=email=>new Request('https://example.test',{headers:{'oai-authenticated-user-email':email}});
 assert.equal(canEdit(req('manager@example.test'),config),true);assert.equal(canReview(req('manager@example.test'),config),false);assert.equal(canReview(req('lead@example.test'),config),true);assert.equal(canReview(req('visitor@example.test'),config),false);
});
test('allocation change invalidates review and recalculates automatic profit without duplicate PPL cost',async()=>{
 const db=await financeDB(),x=calculated();x.workflow='검토 완료';x.ppl='있음';x.result.pplCost='2000000';x.reviewedAt='2026-09-29';
 await saveRecord(db,x,0,'review-broadcast-0001','actor','save');
 let f=await saveFinance(db,action('contract',contractData()),0,'review-contract-0001','actor','contract',[x]);
 f=await saveFinance(db,action('allocation',{contractId:f.contracts[0].id,broadcastId:x.id,month:'2026-08',net:'3000000',tax:'300000'}),f.version,'review-allocation-0001','actor','allocation',[x]);
 const row=JSON.parse((await db.prepare('SELECT payload FROM scm_records WHERE id=?').bind(x.id).first()).payload);
 assert.equal(row.workflow,'검토 요청');assert.equal(row.reviewedAt,null);assert.equal(withFinance(row,f).result.profit,'11606909');assert.equal(withFinance(withFinance(row,f),f).result.profit,'11606909');await db.close();
});
test('contract date can remain unknown and program names are registered once per channel',()=>{
 let f=applyFinanceAction(emptyFinance(),action('contract',contractData({date:''})),new Set());assert.equal(f.contracts[0].date,'');assert.ok(f.contracts[0].name.startsWith('계약일 미정'));
 f=applyFinanceAction(f,action('program',{channel:'TV조선',name:'세개의 시선'}),new Set());
 assert.throws(()=>applyFinanceAction(f,action('program',{channel:'TV조선',name:'세개의시선'}),new Set()),/등록|중복/);
});

import {duplicatePplErrors,existingPplContracts} from '../lib/ppl-duplicates.ts';
const pplLink=(extra={})=>({id:'ppl-link-1',pplId:'ppl-id-1',channel:'TV조선',program:'세 개의 시선',date:'2026-09-30',time:'24:30',kind:'본방',...extra});

test('duplicate PPL checks use normalized channel/program/actual air time and allow different airings',()=>{
 const original=pplLink();const duplicate=pplLink({id:'other',pplId:'other-ppl',program:'세개의시선',date:'2026-10-01',time:'00:30',kind:'재방'});
 assert.equal(duplicatePplErrors({...item(),ppl:'있음',pplLinks:[original,duplicate]}).length,1);
 assert.equal(duplicatePplErrors({...item(),ppl:'있음',pplLinks:[original,{...duplicate,time:'01:30'}]}).length,0);
 assert.equal(duplicatePplErrors({...item(),ppl:'있음',pplLinks:[original,{...duplicate,channel:'MBN'}]}).length,0);
 assert.equal(duplicatePplErrors({...item(),ppl:'없음',pplLinks:[original,duplicate]}).length,0);
 assert.equal(existingPplContracts(emptyFinance(),undefined,original).length,0);
});

test('server rejects duplicate broadcast PPL rows without writing record, audit or outbox',async()=>{
 const db=await financeDB(),link=pplLink();
 const record={...item(),ppl:'있음',pplLinks:[link,{...link,id:'second',pplId:'second'}]};
 await assert.rejects(()=>saveRecord(db,record,0,'duplicate-record-request','actor','hash'),/중복/);
 for(const table of ['scm_records','scm_revisions','scm_outbox'])assert.equal((await db.prepare('SELECT COUNT(*) n FROM '+table).bind().first()).n,0);
 await db.close();
});

test('PPL contract origin blocks a second contract before broadcast linking and survives edits and retries',async()=>{
 const db=await financeDB(),link=pplLink(),record={...item(),ppl:'있음',pplLinks:[link]};
 await saveRecord(db,record,0,'initial-record-request','actor','hash');
 const create=action('contract',contractData({pplContext:{broadcastId:record.id,linkId:link.id,version:1}}));
 let f=await saveFinance(db,create,0,'ppl-contract-create-1','actor','h1',[]);
 const replay=await saveFinance(db,create,0,'ppl-contract-create-1','actor','h1',[]);assert.equal(replay.contracts[0].id,f.contracts[0].id);
 await assert.rejects(()=>saveFinance(db,create,1,'ppl-contract-create-2','actor','h2',[]),/이미 같은 방송/);
 assert.equal((await readFinance(db)).contracts.length,1);
 f=await saveFinance(db,action('contract',{...f.contracts[0],notes:'수정'}),1,'ppl-contract-edit-1','actor','h3',[]);
 assert.equal(f.contracts[0].pplOrigin.broadcastId,record.id);
 const other={...record,id:'OTHER-BROADCAST'};await saveRecord(db,other,0,'other-record-request','actor','h4');
 const otherContext=action('contract',contractData({pplContext:{broadcastId:other.id,linkId:link.id,version:1}}));
 f=await saveFinance(db,otherContext,2,'other-contract-create','actor','h5',[]);assert.equal(f.contracts.length,2);
 // Existing connections from versions predating origin tracking also block creation.
 const linked={...record,id:'OLD-LINK',pplLinks:[{...link,contractRef:f.contracts[0].id}]};
 await saveRecord(db,linked,0,'old-link-record-save','actor','h6');
 await assert.rejects(()=>saveFinance(db,action('contract',contractData({pplContext:{broadcastId:linked.id,linkId:link.id,version:1}})),3,'old-link-duplicate-contract','actor','h7',[]),/이미 같은 방송/);
 await db.close();
});

test('PPL contract creation refuses unsaved and concurrently changed broadcasts atomically',async()=>{
 const db=await financeDB(),link=pplLink(),record={...item(),ppl:'있음',pplLinks:[link]};
 const create=action('contract',contractData({pplContext:{broadcastId:record.id,linkId:link.id,version:1}}));
 await assert.rejects(()=>saveFinance(db,create,0,'unsaved-contract-create','actor','h1',[]),/방송 내용/);
 await saveRecord(db,record,0,'initial-record-request','actor','hash');
 const racing={prepare:db.prepare.bind(db),batch:async statements=>{await db.prepare('UPDATE scm_records SET version=version+1 WHERE id=?').bind(record.id).run();return db.batch(statements)}};
 await assert.rejects(()=>saveFinance(racing,create,0,'racing-contract-create','actor','h2',[]),SaveConflict);
 assert.equal((await readFinance(db)).contracts.length,0);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM scm_finance_revisions').bind().first()).n,0);await db.close();
});
