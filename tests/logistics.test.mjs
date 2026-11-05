import test from 'node:test';
import assert from 'node:assert/strict';
import * as X from 'xlsx';
import {emptyLogistics,applyLogisticsAction,logisticsPlan,logisticsFingerprint,latestRelease,logisticsForecast,preparationDate} from '../lib/logistics.ts';
import {readLogisticsWorkbook,logisticsHeaders} from '../lib/logistics-import.ts';
import {compositions} from '../lib/workflow.ts';
import {newResult} from '../lib/scm-model.ts';
import {store} from './postgres-fixture.mjs';
import {saveFinance,readFinance} from '../lib/finance-store.ts';
import {saveRecord,SaveConflict} from '../lib/record-store.ts';
import {isCatalogOnlyAction} from '../lib/gift-items.ts';
import {canSaveFinance} from '../lib/finance-access.ts';

let seq=0;
const now='2026-11-05T00:00:00Z',uuid=()=>`logistics-${++seq}`;
function item(id='A',day='2026-11-20',sets='10'){
 const b={id,date:day,time:'10:00',channel:'SK',item:'시험 상품',shortItem:'시험 상품',owner:'물류검증',status:'편성확정',urgent:false,ppl:'없음',program:'',pplKind:'',price:'',target:'',rate:'',contractId:'',contractAmount:'',allocation:'',attribution:'',sync:'대기',version:1};
 b.compositions=compositions(b);Object.assign(b.compositions.single,{sku:'SET-A',plannedQuantity:sets,conversionRate:'10',unitCost:'777'});return b;
}
const apply=(l,d,items=[])=>applyLogisticsAction(l,d,items,'operator',now,uuid);
function master(){let l=emptyLogistics();for(const [code,name] of [['P','본품'],['G','사은품']])l=apply(l,{op:'sku',code,name});return apply(l,{op:'bom',compositionCode:'SET-A',lines:[{sku:'P',role:'product',quantity:9},{sku:'G',role:'gift',quantity:2}]});}
function publish(l,b,extra={}){return apply(l,{op:'publish',broadcastId:b.id,warehouse:'센터1',fingerprint:logisticsFingerprint(b,l),confirmComposition:true,note:'본품·사은품 전체 구성 확인',...extra},[b]);}
const inventory=(l,extra={})=>apply(l,{op:'inventory',warehouse:'센터1',asOf:'2026-11-05T09:00',basis:'before-plans',source:'임시 WMS 자료',lines:[{sku:'P',available:100},{sku:'G',available:100}],...extra});
const inbound=(l,date,quantity,extra={})=>apply(l,{op:'inbound',sku:'P',warehouse:'센터1',date,quantity,confirmed:true,reference:'IN-'+date,...extra});

test('request quantities use full sets and complete BOM, independent of financial conversion and gift cost',()=>{
 const l=master(),b=item();b.gifts=[{id:'manual-gift',item:'사은품',side:'single',units:'2',unitCost:'5'}];
 const before=structuredClone(b),plan=logisticsPlan(b,l);
 assert.deepEqual(plan.issues,[]);assert.deepEqual(plan.requirements.map(r=>r.quantity),[90,20]);assert.deepEqual(b,before);
 assert.equal(plan.dueDate,'2026-11-13');assert.equal(plan.requirements.length,2,'gift result input is not added twice');
});
test('blank quantity/BOM/date block publication; explicit zero is distinct from unknown',()=>{
 const l=master();for(const b of [item('A','2026-11-20',''),{...item(),time:''},{...item(),compositions:{...item().compositions,single:{...item().compositions.single,sku:'unknown'}}}])assert.ok(logisticsPlan(b,l).issues.length);
 assert.deepEqual(logisticsPlan(item('Z','2026-11-20','0'),l).requirements.map(r=>r.quantity),[0,0]);
 const b=item();assert.throws(()=>publish(l,b,{confirmComposition:false}),/전체 구성/);assert.throws(()=>publish(l,b,{fingerprint:'stale'}),/변경/);
});
test('24/25-hour legacy broadcasts use real date and a seven-day preparation deadline',()=>{
 const b={...item('L','2026-12-31'),time:'25:00'},p=logisticsPlan(b,master());
 assert.equal(p.date,'2027-01-01');assert.equal(p.time,'01:00');assert.equal(p.dueDate,'2026-12-25');assert.equal(preparationDate('2026-01-03'),'2025-12-27');
});
test('changed plan/BOM requires a new release and acknowledgement, retaining the previous confirmed quantities',()=>{
 let l=master(),b=item();l=publish(l,b);const first=structuredClone(latestRelease(l,b.id));
 l=apply(l,{op:'ack',broadcastId:b.id,releaseId:first.id,owner:'SCM',note:'WMS 확인'},[b]);
 assert.equal(latestRelease(l,b.id).state,'준비 중');
 const changed=item('A','2026-11-20','20');assert.notEqual(logisticsFingerprint(changed,l),first.fingerprint);
 assert.throws(()=>apply(l,{op:'status',broadcastId:'A',releaseId:first.id,owner:'SCM',note:'완료',state:'준비 완료'},[changed]),/미전달/);
 l=publish(l,changed);assert.equal(latestRelease(l,'A').revision,2);assert.equal(latestRelease(l,'A').acknowledgedAt,undefined);
 assert.deepEqual(l.releases[0].requirements,first.requirements);assert.equal(l.events.length,3);
 l=apply(l,{op:'bom',compositionCode:'SET-A',lines:[{sku:'P',role:'product',quantity:10}]});
 assert.notEqual(logisticsFingerprint(changed,l),latestRelease(l,'A').fingerprint);
});
test('financial cost and profit edits do not change the logistics plan fingerprint',()=>{
 const l=master(),b=item(),next=structuredClone(b);next.compositions.single.unitCost='999';next.result={profit:'100'};next.financeVersion=999;
 assert.equal(logisticsFingerprint(b,l),logisticsFingerprint(next,l));
});
test('same physical stock is shared by product/gift roles and broadcasts, with cumulative shortages',()=>{
 let l=master();l=apply(l,{op:'bom',compositionCode:'SET-A',lines:[{sku:'P',role:'product',quantity:9},{sku:'P',role:'gift',quantity:2}]});
 l=inventory(l);l=publish(l,item('A','2026-11-20','10'));l=publish(l,item('B','2026-11-21','5'));
 const rows=logisticsForecast(l,'센터1');assert.deepEqual(rows.map(r=>r.quantity),[110,55]);assert.deepEqual(rows.map(r=>r.remaining),[-10,-65]);assert.deepEqual(rows.map(r=>r.shortage),[10,65]);
});
test('missing stock remains unknown, warehouse inventory is isolated and snapshots replace rather than add',()=>{
 let l=inventory(master(),{lines:[{sku:'P',available:100}]});l=publish(l,item());
 assert.equal(logisticsForecast(l,'센터1').find(r=>r.sku==='G').remaining,null);
 l=inventory(l,{warehouse:'센터2',lines:[{sku:'P',available:999}]});assert.equal(logisticsForecast(l,'센터2').length,0);
 l=inventory(l,{asOf:'2026-11-06T09:00',lines:[{sku:'P',available:20}]});assert.equal(logisticsForecast(l,'센터1').find(r=>r.sku==='P').remaining,-70);
 assert.throws(()=>inventory(l,{asOf:'2026-11-04T09:00'}),/이전 기준시각/);
 assert.throws(()=>inventory(l,{asOf:'2026-11-06T09:00'}),/이미 등록/);
});
test('only confirmed inbound arriving by preparation deadline is counted once across broadcasts',()=>{
 let l=inventory(master(),{lines:[{sku:'P',available:0},{sku:'G',available:100}]});
 l=inbound(l,'2026-11-13',100);l=inbound(l,'2026-11-15',500);l=inbound(l,'2026-11-12',999,{confirmed:false});
 l=publish(l,item('A','2026-11-20','10'));l=publish(l,item('B','2026-11-21','10'));
 const rows=logisticsForecast(l,'센터1').filter(r=>r.sku==='P');assert.deepEqual(rows.map(r=>r.remaining),[10,-80]);assert.equal(rows[0].lateInbound,500);
});
test('reserved-stock restoration prevents counting the same plan reservation twice and requires explicit values',()=>{
 let l=inventory(master(),{basis:'unreserved',lines:[{sku:'P',available:10,reservedForPlans:90},{sku:'G',available:80,reservedForPlans:20}]});l=publish(l,item());
 assert.equal(logisticsForecast(l,'센터1').find(r=>r.sku==='P').remaining,10);
 assert.throws(()=>inventory(master(),{basis:'unreserved',lines:[{sku:'P',available:10}]}),/정수/);
});
test('cancellation must be transmitted before forecast reservations are removed',()=>{
 let l=inventory(master());const b=item();l=publish(l,b);const cancelled={...b,status:'취소'};
 assert.equal(logisticsForecast(l,'센터1').find(r=>r.sku==='P').quantity,90);
 l=publish(l,cancelled);assert.equal(logisticsForecast(l,'센터1').length,0);assert.equal(l.releases[0].cancelled,false);assert.equal(latestRelease(l,'A').cancelled,true);
});
test('bulk mapping validation is atomic, rejects duplicate BOM lines and rejects unknown physical codes',()=>{
 const l=master(),before=structuredClone(l);
 assert.throws(()=>apply(l,{op:'bomBatch',rows:[{compositionCode:'OK',sku:'P',role:'product',quantity:1},{compositionCode:'BAD',sku:'X',role:'gift',quantity:1}]}),/상품코드/);assert.deepEqual(l,before);
 assert.throws(()=>apply(l,{op:'bom',compositionCode:'SET',lines:[{sku:'P',role:'product',quantity:1},{sku:'P',role:'product',quantity:2}]}),/중복/);
});
test('workbook imports preserve code strings, reject formulas/duplicates and distinguish blank reservation values',()=>{
 const buffer=(kind,rows)=>{const book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([logisticsHeaders[kind],...rows]),'입력');return X.write(book,{type:'buffer',bookType:'xlsx'});};
 assert.equal(readLogisticsWorkbook(buffer('sku',[['001','테스트']]),'sku')[0].code,'001');
 assert.equal(readLogisticsWorkbook(buffer('inventory',[['P',100,'']]),'inventory')[0].reservedForPlans,'');
 assert.throws(()=>readLogisticsWorkbook(buffer('sku',[['001','테스트'],['001','중복']]),'sku'),/중복/);
 const book=X.read(buffer('inventory',[['P',100,0]]));book.Sheets['입력'].B2.f='SUM(1,2)';assert.throws(()=>readLogisticsWorkbook(X.write(book,{type:'buffer',bookType:'xlsx'}),'inventory'),/수식/);
});
test('logistics saves reuse finance audit/idempotency and never change broadcast costs/profit/revisions or sheet queue',async()=>{
 const db=await store();try{
  const baseline=item();baseline.result=newResult();baseline.result.profit='12345';
  const b=await saveRecord(db,baseline,0,'logistics-record-0001','actor','hash-record');
  await db.prepare("UPDATE scm_outbox SET state='sent' WHERE record_id=?").bind(b.id).run();
  const before=await db.prepare('SELECT payload,version FROM scm_records').all();
  const outbox=await db.prepare('SELECT * FROM scm_outbox').all();
  let f=await saveFinance(db,{kind:'logistics',data:{op:'sku',code:'P',name:'본품'}},0,'logistics-sku-000001','actor','hash-sku',[]);
  assert.equal(f.version,1);assert.equal(isCatalogOnlyAction('logistics'),true);assert.equal(canSaveFinance('logistics',false),true);
  const replay=await saveFinance(db,{kind:'logistics',data:{op:'sku',code:'P',name:'본품'}},0,'logistics-sku-000001','actor','hash-sku',[]);assert.deepEqual(replay,f);
  f=await saveFinance(db,{kind:'logistics',data:{op:'bom',compositionCode:'SET-A',lines:[{sku:'P',role:'product',quantity:9}]}},f.version,'logistics-bom-000001','actor','hash-bom',[]);
  const plan=logisticsPlan(b,f.logistics);
  f=await saveFinance(db,{kind:'logistics',data:{op:'publish',broadcastId:b.id,warehouse:'센터1',fingerprint:plan.fingerprint,confirmComposition:true,note:'확인'}},f.version,'logistics-pub-000001','actor','hash-pub',[]);
  assert.equal(f.logistics.releases.length,1);assert.deepEqual(await db.prepare('SELECT payload,version FROM scm_records').all(),before);assert.deepEqual(await db.prepare('SELECT * FROM scm_outbox').all(),outbox);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM scm_revisions').first()).n,1);
  assert.equal((await db.prepare('SELECT state FROM scm_finance').first()).state,'sent');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM scm_finance_revisions').first()).n,3);
 }finally{await db.close();}
});
test('a broadcast version race rejects logistics publication rather than recording a stale plan',async()=>{
 const db=await store();try{
  const b=await saveRecord(db,item(),0,'logistics-race-rec01','actor','h');
  let f=await saveFinance(db,{kind:'logistics',data:{op:'sku',code:'P',name:'본품'}},0,'logistics-race-sku01','actor','s',[]);
  f=await saveFinance(db,{kind:'logistics',data:{op:'bom',compositionCode:'SET-A',lines:[{sku:'P',role:'product',quantity:1}]}},f.version,'logistics-race-bom01','actor','b',[]);
  const wrapped={prepare:db.prepare.bind(db),async batch(statements){await db.prepare('UPDATE scm_records SET version=version+1 WHERE id=?').bind(b.id).run();return db.batch(statements);}};
  await assert.rejects(()=>saveFinance(wrapped,{kind:'logistics',data:{op:'publish',broadcastId:b.id,warehouse:'센터1',fingerprint:logisticsFingerprint(b,f.logistics),confirmComposition:true,note:'확인'}},f.version,'logistics-race-pub01','actor','p',[]),SaveConflict);
  assert.equal((await readFinance(db)).logistics.releases.length,0);
 }finally{await db.close();}
});
