import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as X from 'xlsx';
import {emptyFinance,applyFinanceAction} from '../lib/finance-model.ts';
import {emptyLogistics,applyLogisticsAction,logisticsFingerprint,logisticsPlan,logisticsForecast,logisticsStockSkus} from '../lib/logistics.ts';
import {applySetContents,reviewSetContents,latestSetContents} from '../lib/set-contents.ts';
import {readSetContentsFile,setContentsHeaders} from '../lib/set-contents-file.ts';
import {logisticsTask} from '../lib/logistics-tasks.ts';
import {logisticsOutlook} from '../lib/logistics-outlook.ts';
import {logisticsTables} from '../lib/logistics-sheets.ts';
import {compositions,costPlan} from '../lib/workflow.ts';
import {store} from './postgres-fixture.mjs';
import {saveFinance} from '../lib/finance-store.ts';
import {saveRecord} from '../lib/record-store.ts';
let seq=0;const uuid=()=>`contents-${++seq}`,now='2026-11-09T00:00:00Z',code='DT00059',name='알파시클로덱스트린 18박스';
function finance(){let l=applyLogisticsAction(emptyLogistics(),{op:'sku',code,name,unit:'세트'},[],'tester',now,uuid);l=applyLogisticsAction(l,{op:'bom',compositionCode:code,shipmentMode:'set',effectiveFrom:'2026-11-09',lines:[{sku:code,quantity:1,role:'product'}]},[],'tester',now,uuid);return {...emptyFinance(),logistics:l};}
function item(){const b={id:'B',date:'2026-11-20',time:'10:00',status:'편성확정',item:name,result:{profit:'12345'},gifts:[{item:'젤리',units:'2',unitCost:'555'}]};b.compositions=compositions(b);Object.assign(b.compositions.single,{sku:code,plannedQuantity:'100',conversionRate:'80',unitCost:'777'});b.costPlan={...costPlan(b),quantityRounding:'floor'};return b;}
const input=(extra={})=>({setCode:code,salesName:name,sku:'V-main',name:'시험 본품',role:'본품',quantity:'18',unit:'박스',confirmed:'확정',note:'',...extra});
const inputs=()=>[input(),input({sku:'V-gift',name:'시험 젤리',role:'사은품',quantity:'2',unit:'개'})];
const save=(f,rows=inputs(),extra={})=>applySetContents(f,{rows,selectedCodes:[code],effectiveFrom:'2026-11-09',confirmComplete:true,...extra},[],'tester',now,uuid);
test('confirmed contents calculate product/gift preparation and expected quantities without double stock deduction or financial changes',()=>{
 const f=finance(),b=item(),before=structuredClone({f,b}),physical=logisticsPlan(b,f.logistics),fp=logisticsFingerprint(b,f.logistics),l=save(f),o=logisticsOutlook(b,l);
 assert.deepEqual(o.componentRequirements.map(r=>[r.role,r.prepare,r.expected,r.unit]),[['product',1800,1440,'박스'],['gift',200,160,'개']]);assert.deepEqual(o.componentIssues,[]);
 assert.equal(physical.requirements.length,0);assert.deepEqual(logisticsPlan(b,l).requirements.map(r=>[r.sku,r.quantity]),[['V-main',1800],['V-gift',200]]);assert.notEqual(logisticsFingerprint(b,l),fp);assert.deepEqual({f,b},before);
 const raw=logisticsTables({...f,logistics:l},[b]);assert.equal(raw.find(t=>t.title==='SCM_물류단품예상').rows.length,2);assert.equal(raw.find(t=>t.title==='SCM_물류수량').rows.length,2);
});
test('unconfirmed, blank, zero, invalid units, organic rows and partial selected sets cannot be stored',()=>{
 for(const field of [{quantity:''},{quantity:'0'},{quantity:'1.5'},{confirmed:'확인중'},{role:''},{unit:''},{sku:code},{salesName:'홍화씨(유기농) 12박스'}])assert.throws(()=>save(finance(),[input(field)]));
 const f=finance(),before=structuredClone(f);assert.throws(()=>save(f,inputs(),{confirmComplete:false}));assert.throws(()=>save(f,inputs(),{effectiveFrom:'2026-02-30'}));assert.deepEqual(f,before);
 assert.equal(logisticsOutlook(item(),f.logistics).componentRequirements.length,0);assert.match(logisticsOutlook(item(),f.logistics).componentIssues[0],/확인 필요/);
 assert.ok(reviewSetContents(f,[input(),input({sku:'V-main',role:'사은품',unit:'개'})])[0].issues.some(s=>s.includes('동일한 단위')));
});
test('effective broadcast dates select correct contents; missing rates stay unknown; explicit zero stays zero',()=>{
 const f=finance(),first=save(f),next=save({...f,logistics:first},[input({quantity:'9'})],{effectiveFrom:'2026-12-01'});
 assert.equal(latestSetContents(next,code,'2026-11-20').lines[0].quantity,18);assert.equal(latestSetContents(next,code,'2026-12-01').lines[0].quantity,9);
 const b=item();b.compositions.single.conversionRate='';assert.equal(logisticsOutlook(b,next).componentRequirements[0].expected,null);
 b.compositions.single.plannedQuantity='0';assert.equal(logisticsOutlook(b,next).componentRequirements[0].expected,0);
});
test('finance action only extends logistics contents and file parser rejects formulas',()=>{
 const f=finance(),before=structuredClone(f);const next=applyFinanceAction(f,{kind:'logistics',data:{op:'setContents',rows:inputs(),selectedCodes:[code],effectiveFrom:'2026-11-09',confirmComplete:true}},new Set(),now,uuid,{items:[item()],actor:'tester'});
 const {logistics,version,...same}=next;const {logistics:old,version:v,...original}=f;assert.deepEqual(same,original);assert.deepEqual(f,before);assert.equal(logistics.setContents.length,1);
 const wb=X.utils.book_new(),s=X.utils.aoa_to_sheet([setContentsHeaders,[code,name,'V-main','시험','본품',18,'박스','확정','']]);X.utils.book_append_sheet(wb,s,'세트구성수량');assert.equal(readSetContentsFile(X.write(wb,{type:'buffer',bookType:'xlsx'}))[0].quantity,'18');s.F2={t:'n',v:18,f:'9*2'};assert.throws(()=>readSetContentsFile(X.write(wb,{type:'buffer',bookType:'xlsx'})),/수식/);
});
test('real finance save preserves existing broadcast payload, profit, record versions and outbox',async()=>{
 const db=await store();try{
  await saveRecord(db,item(),0,'contents-financial-record','tester','hash');
  const f={...finance(),version:1};await db.prepare("INSERT INTO scm_finance(id,payload,version,request_id,state) VALUES (1,?,1,'contents-seed','sent')").bind(JSON.stringify(f)).run();
  const before=await db.prepare('SELECT payload,version FROM scm_records').all(),outbox=await db.prepare('SELECT * FROM scm_outbox').all();
  const result=await saveFinance(db,{kind:'logistics',data:{op:'setContents',rows:inputs(),selectedCodes:[code],effectiveFrom:'2026-11-09',confirmComplete:true}},1,'contents-financial-save','tester','hash-contents',[]);
  assert.equal(result.logistics.setContents.length,1);assert.deepEqual(await db.prepare('SELECT payload,version FROM scm_records').all(),before);assert.deepEqual(await db.prepare('SELECT * FROM scm_outbox').all(),outbox);
  assert.equal((await db.prepare("SELECT state FROM scm_sheet_jobs WHERE job_key='logistics'").first()).state,'pending');
 }finally{await db.close();}
});


test('V-code stock compares product and gift needs, shares stock across sets and never deducts D-code set stock',()=>{
 const f=finance(),b=item(),other={...structuredClone(b),id:'SECOND',date:'2026-11-21'},before=structuredClone({f,b,other});let l=save(f);
 const act=(data,items=[])=>applyLogisticsAction(l,data,items,'tester',now,uuid);
 l=act({op:'inventory',warehouse:'센터',asOf:'2026-11-09T09:00',basis:'before-plans',source:'임시',lines:[{sku:'V-main',available:2000},{sku:'V-gift',available:150}]});
 for(const i of [b,other])l=act({op:'publish',broadcastId:i.id,warehouse:'센터',fingerprint:logisticsFingerprint(i,l),confirmComposition:true,note:'단품 구성 확인'},[i]);
 const rows=logisticsForecast(l,'센터');assert.deepEqual(rows.map(r=>[r.sku,r.quantity,r.remaining,r.shortage]),[['V-main',1800,200,0],['V-gift',200,-50,50],['V-main',1800,-1600,1600],['V-gift',200,-250,250]]);
 assert.ok(rows.every(r=>r.sku!==code));assert.equal(logisticsStockSkus(l).find(s=>s.code==='V-main').unit,'박스');assert.ok(!logisticsStockSkus(l).some(s=>s.code===code));
 assert.throws(()=>act({op:'inventory',warehouse:'센터',asOf:'2026-11-09T10:00',basis:'before-plans',source:'임시',lines:[{sku:code,available:999}]}),/등록/);
 assert.deepEqual({f,b,other},before);
});
test('missing gift stock is unknown and changed contents reopen review without changing released demands',()=>{
 const f=finance(),b=item();let l=save(f);
 l=applyLogisticsAction(l,{op:'inventory',warehouse:'센터',asOf:'2026-11-09T09:00',basis:'before-plans',source:'임시',lines:[{sku:'V-main',available:2000}]},[],'tester',now,uuid);
 l=applyLogisticsAction(l,{op:'publish',broadcastId:b.id,warehouse:'센터',fingerprint:logisticsFingerprint(b,l),confirmComposition:true,note:'단품'},[b],'tester',now,uuid);
 assert.equal(logisticsForecast(l,'센터').find(r=>r.sku==='V-gift').shortage,null);
 const release=structuredClone(l.releases[0]);const changed=save({...f,logistics:l},[input({quantity:'9'}),inputs()[1]]);
 assert.equal(logisticsTask(b,changed).kind,'review');assert.deepEqual(changed.releases[0],release);assert.equal(logisticsPlan(b,changed).requirements[0].quantity,900);
});
test('component unit changes never reinterpret existing stock quantities',()=>{
 const f=finance(),b=item();let l=save(f);
 l=applyLogisticsAction(l,{op:'inventory',warehouse:'센터',asOf:'2026-11-09T09:00',basis:'before-plans',source:'임시',lines:[{sku:'V-main',available:2000},{sku:'V-gift',available:1000}]},[],'tester',now,uuid);
 const changed=save({...f,logistics:l},[input({unit:'개'}),inputs()[1]]);
 const published=applyLogisticsAction(changed,{op:'publish',broadcastId:b.id,warehouse:'센터',fingerprint:logisticsFingerprint(b,changed),confirmComposition:true,note:'단위변경'},[b],'tester',now,uuid);
 assert.equal(logisticsForecast(published,'센터').find(r=>r.sku==='V-main').remaining,null);
});
