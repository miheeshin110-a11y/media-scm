import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFinanceAction,emptyFinance} from '../lib/finance-model.ts';
import {salesCompositionChoices,compositionLabel} from '../lib/sales-compositions.ts';
import {canSaveFinance} from '../lib/finance-access.ts';
import {saveFinance,readFinance} from '../lib/finance-store.ts';
import {store} from './postgres-fixture.mjs';
import {workflowRows,workflowHeaders} from '../lib/workflow-sheets.ts';
import {compositions} from '../lib/workflow.ts';
const action=name=>({kind:'salesComposition',data:{name}});

test('operators can add named compositions without SKU; spaces and case cannot create duplicates',()=>{
 assert.equal(canSaveFinance('salesComposition',false),true);
 assert.equal(canSaveFinance('taxImport',false),false);
 let f=applyFinanceAction(emptyFinance(),action(' 신규 상품  6박스 + 보틀 '),new Set());
 assert.equal(f.salesCompositions[0].name,'신규 상품 6박스 + 보틀');
 assert.equal(salesCompositionChoices(f).length,26);
 const code=f.salesCompositions[0].code;
 f=applyFinanceAction(f,action('신규상품6박스+보틀'),new Set());
 assert.equal(f.salesCompositions.length,1);assert.equal(f.salesCompositions[0].code,code);
 f=applyFinanceAction(f,action('그린아세로라c16박스'),new Set());
 assert.equal(f.salesCompositions.length,1);
 f=applyFinanceAction(f,action('신규 상품 6박스 + 젤리2'),new Set());
 assert.equal(f.salesCompositions.length,2);
 for(const name of ['', '  ', null, 'x'.repeat(121)])assert.throws(()=>applyFinanceAction(f,action(name),new Set()),/구성명/);
});

test('shared catalog survives database reload and retry; stale writes cannot overwrite it',async()=>{
 const db=await store();
 try{
  const a=action('공용 구성 8박스');
  const saved=await saveFinance(db,a,0,'composition-request-001','operator','hash-one',[]);
  const reloaded=await readFinance(db);
  assert.deepEqual(reloaded.salesCompositions,saved.salesCompositions);
  assert.ok(salesCompositionChoices(reloaded).some(x=>x.name==='공용 구성 8박스'));
  assert.deepEqual(await saveFinance(db,a,0,'composition-request-001','operator','hash-one',[]),saved);
  await assert.rejects(()=>saveFinance(db,action('다른 구성'),0,'composition-request-002','other','hash-two',[]),/먼저 변경/);
  assert.equal((await readFinance(db)).salesCompositions.length,1);
 }finally{await db.close()}
});

test('export retains composition name without presenting internal references as SCM SKU',()=>{
 const item={id:'sample',date:'2026-11-01',time:'10:00',ppl:'없음',item:'상품'};
 item.compositions=compositions(item);
 item.compositions.single={...item.compositions.single,sku:'custom:example',compositionName:'신규 구성 6박스'};
 const table=workflowRows(item,1).find(x=>x.range.startsWith("'SCM_구성계획'"));
 assert.equal(table.values[0][3],'');
 assert.equal(table.values[0].at(-1),'신규 구성 6박스');
 assert.equal(table.values[0].length,workflowHeaders.SCM_구성계획.length);
 item.compositions.single={...item.compositions.single,sku:'DT00175',compositionName:undefined};
 assert.equal(compositionLabel(item.compositions.single),'그린 아세로라C 16박스');
 assert.equal(workflowRows(item,1).find(x=>x.range.startsWith("'SCM_구성계획'")).values[0][3],'DT00175');
});
