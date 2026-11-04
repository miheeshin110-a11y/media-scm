import test from 'node:test';
import assert from 'node:assert/strict';
import {giftItemChoices,giftNameKey,withGiftItem,isCatalogOnlyAction} from '../lib/gift-items.ts';
import {applyFinanceAction,emptyFinance} from '../lib/finance-model.ts';
import {canSaveFinance} from '../lib/finance-access.ts';
import {saveFinance,readFinance} from '../lib/finance-store.ts';
import {saveRecord} from '../lib/record-store.ts';
import {previewCostImport} from '../lib/cost-history-import.ts';
import {store} from './postgres-fixture.mjs';

const action=name=>({kind:'giftItem',data:{name}});

test('gift choices combine standard, newly registered, dated cost and existing broadcast gift names',()=>{
 const master={giftItems:[{id:'one',name:'신규 텀블러'}],costHistory:[{kind:'gift',name:'원가 등록 사은품'},{kind:'product',name:'원가에만 있는 상품'}]};
 const items=[{item:'방송 아이템',gifts:[{item:'과거 사은품'},{item:'아세로라'}]}];
 const before=structuredClone({master,items}),names=giftItemChoices(master,items);
 for(const name of ['신규 텀블러','원가 등록 사은품','과거 사은품','방송 아이템','그린 아세로라C','젤리'])assert.ok(names.includes(name));
 assert.ok(!names.includes('원가에만 있는 상품'));assert.ok(!names.includes('아세로라'));
 assert.equal(new Set(names.map(giftNameKey)).size,names.length);assert.deepEqual({master,items},before);
});

test('registration preserves catalog entries and prevents whitespace, case and standard alias duplicates',()=>{
 const f=emptyFinance(),saved=applyFinanceAction(f,action(' 신규  Gift 텀블러 '),new Set());
 assert.equal(saved.giftItems[0].name,'신규 Gift 텀블러');assert.deepEqual(f,emptyFinance());
 const retry=applyFinanceAction(saved,action('신규gift텀블러'),new Set());
 assert.deepEqual(retry.giftItems,saved.giftItems);
 assert.equal(applyFinanceAction(saved,action('아세로라'),new Set()).giftItems.length,1);
 for(const name of ['', ' ', null, 123, '가'.repeat(121)])assert.throws(()=>applyFinanceAction(f,action(name),new Set()),/사은품명/);
});

test('operators can register gift names but cannot create cost histories; gift-name saves are catalog-only',()=>{
 assert.equal(canSaveFinance('giftItem',false),true);assert.equal(canSaveFinance('costHistory',false),false);
 assert.equal(isCatalogOnlyAction('giftItem'),true);assert.equal(isCatalogOnlyAction('costHistoryImport'),true);assert.equal(isCatalogOnlyAction('contract'),false);
});

test('changing a gift name clears the former cost while leaving the former broadcast and quantities intact',()=>{
 const gift={id:'g',item:'기존 사은품',units:'2',side:'single',unitCost:'777',costDate:'2026-10-01',costItemId:'old',costSnapshot:{id:'snapshot'}};
 const before=structuredClone(gift),changed=withGiftItem(gift,'새 사은품');
 assert.equal(changed.item,'새 사은품');assert.equal(changed.units,'2');assert.equal(changed.side,'single');assert.equal(changed.unitCost,'');
 assert.equal(changed.costSnapshot,undefined);assert.equal(changed.costItemId,undefined);assert.deepEqual(gift,before);
 assert.deepEqual(withGiftItem(gift,'기존 사은품'),gift);
});

test('approved new gift names can be matched during cost Excel import without allowing arbitrary product names',()=>{
 const f=applyFinanceAction(emptyFinance(),action('행사 텀블러 신형'),new Set());
 const row={rowNumber:2,kind:'gift',name:'행사텀블러신형',unit:'개',effectiveFrom:'2026-11-01',unitCost:'1000'};
 const preview=previewCostImport(f,[row]);assert.equal(preview.errors,0);assert.equal(preview.added,1);assert.equal(preview.entries[0].row.name,'행사 텀블러 신형');
 assert.equal(previewCostImport(f,[{...row,kind:'product'}]).errors,1);
});

test('PGlite gift registration persists for other broadcasts, is audited and leaves saved results/outbox unchanged',async()=>{
 const db=await store();
 try{
  const record={id:'temporary-gift-broadcast',result:{actualDate:'2026-10-01',actualStart:'09:30',profit:'12345'},gifts:[{id:'legacy',item:'기존 사은품',unitCost:'777'}]};
  await saveRecord(db,record,0,'temporary-gift-broadcast-save','operator','broadcast-hash');
  const rows=await db.prepare('SELECT * FROM scm_records').all(),revisions=await db.prepare('SELECT * FROM scm_revisions').all(),outbox=await db.prepare('SELECT * FROM scm_outbox').all();
  const saved=await saveFinance(db,action('신규 공통 사은품'),0,'temporary-gift-register-001','operator','gift-hash',[]);
  assert.ok(giftItemChoices(await readFinance(db)).includes('신규 공통 사은품'));
  assert.deepEqual(await saveFinance(db,action('신규 공통 사은품'),0,'temporary-gift-register-001','operator','gift-hash',[]),saved);
  await assert.rejects(()=>saveFinance(db,action('다른 사은품'),0,'temporary-gift-register-002','operator','stale-hash',[]),/먼저 변경/);
  assert.equal((await db.prepare('SELECT state FROM scm_finance').first()).state,'sent');
  assert.equal((await db.prepare('SELECT actor FROM scm_finance_revisions').first()).actor,'operator');
  assert.deepEqual(await db.prepare('SELECT * FROM scm_records').all(),rows);
  assert.deepEqual(await db.prepare('SELECT * FROM scm_revisions').all(),revisions);
  assert.deepEqual(await db.prepare('SELECT * FROM scm_outbox').all(),outbox);
 }finally{await db.close();}
});
