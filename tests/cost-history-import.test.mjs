import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as X from 'xlsx';
import {readCostWorkbook} from '../lib/cost-history-xlsx.ts';
import {costImportHeaders,previewCostImport,importCostHistory,isCostHistoryAction} from '../lib/cost-history-import.ts';
import {applyFinanceAction,emptyFinance} from '../lib/finance-model.ts';
import {saveFinance,readFinance} from '../lib/finance-store.ts';
import {saveRecord} from '../lib/record-store.ts';
import {canSaveFinance} from '../lib/finance-access.ts';
import {canonicalCostItem,costItemCatalog} from '../lib/cost-item-catalog.ts';
import {store} from './postgres-fixture.mjs';

const template=()=>readFileSync(new URL('../public/templates/cost-history-template.xlsx',import.meta.url));
const serial=date=>(Date.parse(date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;
const row=(overrides={})=>({rowNumber:2,kind:'product',name:'파라다이스 그레인 버닝',unit:'박스',effectiveFrom:'2026-10-01',unitCost:'3000',...overrides});
function workbook(rows,change=()=>{}){
 const book=X.read(template(),{type:'buffer'}),sheet=book.Sheets['원가입력'];
 X.utils.sheet_add_aoa(sheet,[costImportHeaders,...rows],{origin:'A1'});
 change(book,sheet);
 return X.write(book,{bookType:'xlsx',type:'array'});
}
const action=rows=>({kind:'costHistoryImport',data:{rows}});

test('delivered blank template has required sheets and validation; guide examples cannot be imported',()=>{
 const book=X.read(template(),{type:'buffer'});
 assert.deepEqual(book.SheetNames,['원가입력','작성안내','품목목록']);
 assert.deepEqual(X.utils.sheet_to_json(book.Sheets['원가입력'],{header:1})[0],costImportHeaders);
 assert.throws(()=>readCostWorkbook(template()),/작성된 내역/);
 assert.ok(X.utils.sheet_to_json(book.Sheets['작성안내'],{header:1}).some(r=>r.includes('파라다이스 그레인 버닝')));
});

test('xlsx import reads mixed product/gift rows, numeric dates, date strings, commas, decimals and zero',()=>{
 const bytes=workbook([
  ['상품','파라다이스 그레인 버닝','박스',serial('2026-10-01'),3000],
  ['상품','파라다이스 그레인 버닝','박스','2026/11/1','3,300.25'],
  [],
  ['사은품','알파시클로덱스트린','개','2026-10-01',0]
 ]);
 const rows=readCostWorkbook(bytes);
 assert.equal(rows.length,3);assert.equal(rows[0].effectiveFrom,'2026-10-01');
 assert.equal(rows[1].effectiveFrom,'2026-11-01');assert.equal(rows[1].unitCost,'3300.25');
 assert.equal(rows[2].kind,'gift');assert.equal(rows[2].unitCost,'0');assert.equal(rows[2].rowNumber,5);
 const preview=previewCostImport({},rows);
 assert.equal(preview.errors,0);assert.equal(preview.added,3);
 assert.equal(preview.history[0].itemId,preview.history[1].itemId);
 assert.notEqual(preview.history[0].itemId,preview.history[2].itemId);
});

test('parser rejects changed headers, extra columns, formula cells and oversized files without truncation',()=>{
 assert.throws(()=>readCostWorkbook(workbook([['상품','A','개','2026-10-01',100]],(_b,s)=>{s.A1.v='다른 제목'})),/제목/);
 assert.throws(()=>readCostWorkbook(workbook([['상품','A','개','2026-10-01',100,'잘못된 열']])),/5개 열/);
 assert.throws(()=>readCostWorkbook(workbook([['상품','A','개','2026-10-01',100]],(_b,s)=>{s.E2={t:'n',f:'10*10',v:100}})),/수식/);
 assert.throws(()=>readCostWorkbook(workbook([],(_b,s)=>{X.utils.sheet_add_aoa(s,[['상품','too far','개','2026-10-01',100]],{origin:'A1002'})})),/1,000행/);
 assert.throws(()=>readCostWorkbook(workbook([],b=>{delete b.Sheets['원가입력'];b.SheetNames=['작성안내']})),/원가입력/);
});

test('preview reports row errors, retains missing cost as invalid, and skips only exact duplicates',()=>{
 const master=applyFinanceAction(emptyFinance(),{kind:'costHistory',data:{...row(),itemId:''}},new Set());
 const rows=[row(),row({rowNumber:3,name:' 파라다이스  그레인 버닝 ',unitCost:'3000.00'}),row({rowNumber:4,unitCost:'4000'}),row({rowNumber:5,name:'빈 원가',unitCost:''}),row({rowNumber:6,name:'불가 날짜',effectiveFrom:'2026-02-30'}),row({rowNumber:7,name:'그린 아세로라C',unitCost:'0'}),row({rowNumber:8,name:'소수 초과',unitCost:'1.234'})];
 const snapshot=structuredClone(master),preview=previewCostImport(master,rows);
 assert.equal(preview.duplicates,2);assert.equal(preview.errors,4);assert.equal(preview.added,1);
 assert.deepEqual(master,snapshot);
 assert.throws(()=>importCostHistory(master,rows,'now',()=>crypto.randomUUID()),/4행/);
 assert.throws(()=>importCostHistory(master,[row()],'now',()=>crypto.randomUUID()),/모두 이미/);
 const internal=previewCostImport({},[row(),row({rowNumber:3}),row({rowNumber:4,unitCost:'1'})]);
 assert.equal(internal.added,1);assert.equal(internal.duplicates,1);assert.equal(internal.errors,1);
 for(const bad of [[],Array(1001).fill(row()),[null],[row({rowNumber:1})],[row({unitCost:100})]])assert.throws(()=>importCostHistory({},bad,'now',()=>crypto.randomUUID()));
});

test('batch import uses reviewer-only permissions and the same master-only action category',()=>{
 assert.equal(canSaveFinance('costHistoryImport',false),false);
 assert.equal(canSaveFinance('costHistoryImport',true),true);
 assert.equal(isCostHistoryAction('costHistoryImport'),true);assert.equal(isCostHistoryAction('costHistory'),true);assert.equal(isCostHistoryAction('contract'),false);
});

test('raw aliases normalize to standard product names; unknown names and sales bundles are blocked',()=>{
 assert.equal(canonicalCostItem('파라','product'),'파라다이스 그레인 버닝');
 assert.equal(canonicalCostItem('아세로라','gift'),'그린 아세로라C');
 assert.equal(canonicalCostItem('올포[지관]','product'),'올인원 프리바이오틱스(지관)');
 assert.notEqual(canonicalCostItem('알파','product'),canonicalCostItem('알파프로','product'));
 assert.equal(canonicalCostItem('젤리','product'),undefined);
 const p=previewCostImport({},[row({name:'파라'}),row({name:'파라다이스 그레인 버닝',rowNumber:3}),row({name:'마음대로 이름',rowNumber:4}),row({name:'파라다이스 그레인 버닝 9박스',rowNumber:5})]);
 assert.equal(p.added,1);assert.equal(p.duplicates,1);assert.equal(p.errors,2);
 assert.equal(p.entries[0].row.name,'파라다이스 그레인 버닝');
 const f=applyFinanceAction(emptyFinance(),{kind:'costHistory',data:{...row({name:'새 품목 승인명'}),itemId:''}},new Set());
 assert.equal(previewCostImport(f,[row({name:'새 품목 승인명',effectiveFrom:'2026-11-01'})]).added,1);
 assert.equal(new Set(costItemCatalog.map(c=>c.name)).size,costItemCatalog.length);
 const legacy=applyFinanceAction(emptyFinance(),{kind:'costHistory',data:{...row({name:'파라'}),itemId:''}},new Set());
 assert.equal(previewCostImport(legacy,[row()]).duplicates,1);
});

test('PGlite batch import is atomic, audited, idempotent and leaves existing broadcast data/outbox intact',async()=>{
 const db=await store();
 try{
  const original={id:'existing-import-broadcast',date:'2026-10-01',time:'10:00',item:'기존 방송',calculationMode:'legacy',compositions:{single:{unitCost:'777',costDate:'2026-09-01'}},result:{profit:'98765'}};
  await saveRecord(db,original,0,'existing-import-broadcast-save','operator','original-hash');
  const before=await db.prepare('SELECT payload,version FROM scm_records').all();
  const revisions=await db.prepare('SELECT * FROM scm_revisions').all(),outbox=await db.prepare('SELECT * FROM scm_outbox').all();
  await assert.rejects(()=>saveFinance(db,action([row(),row({rowNumber:3,name:'틀린 행',unitCost:''})]),0,'invalid-batch-import-request','reviewer','bad-hash',[]),/3행/);
  assert.deepEqual(await readFinance(db),emptyFinance());
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM scm_finance_revisions').first()).count,0);
  const rows=[row(),row({rowNumber:3,kind:'gift',name:'젤리',unit:'개',unitCost:'500'}),row({rowNumber:4,effectiveFrom:'2026-11-01',unitCost:'3300'})];
  const saved=await saveFinance(db,action(rows),0,'valid-batch-import-request','reviewer','valid-hash',[]);
  assert.equal(saved.costHistory.length,3);assert.deepEqual(await readFinance(db),saved);
  assert.deepEqual(await saveFinance(db,action(rows),0,'valid-batch-import-request','reviewer','valid-hash',[]),saved);
  assert.equal((await db.prepare('SELECT state FROM scm_finance').first()).state,'sent');
  const more=[...rows,row({rowNumber:5,name:'블루베리 파우더 30g',unitCost:'12.50'})];
  const next=await saveFinance(db,action(more),saved.version,'second-batch-import-request','reviewer','next-hash',[]);
  assert.equal(next.costHistory.length,4);
  await assert.rejects(()=>saveFinance(db,action([row({name:'낡은 자료'})]),saved.version,'stale-batch-import-request','reviewer','stale-hash',[]),/먼저 변경/);
  assert.deepEqual(await db.prepare('SELECT payload,version FROM scm_records').all(),before);
  assert.deepEqual(await db.prepare('SELECT * FROM scm_revisions').all(),revisions);
  assert.deepEqual(await db.prepare('SELECT * FROM scm_outbox').all(),outbox);
 }finally{await db.close();}
});
