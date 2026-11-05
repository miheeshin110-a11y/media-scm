import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as X from 'xlsx';
import {readSimpleLogisticsWorkbook} from '../lib/logistics-workbook-file.ts';
import {applyLogisticsWorkbook} from '../lib/logistics-workbook.ts';
import {emptyFinance} from '../lib/finance-model.ts';
import {store} from './postgres-fixture.mjs';
import {saveRecord} from '../lib/record-store.ts';
import {saveFinance,readFinance} from '../lib/finance-store.ts';
const now='2026-11-05T00:00:00Z';let seq=0;const uuid=()=>`unified-${++seq}`;
const f=()=>({...emptyFinance(),salesCompositions:[{code:'TEST-9',name:'임시 9개 세트'}]});
const data=()=>({compositions:[{sale:'임시 9개 세트',product:'임시 본품',quantity:'9',gift:'임시 사은품',giftQuantity:'2'}],inventory:{warehouse:'센터1',asOf:'2026-11-05T09:00',basis:'before-plans',lines:[{name:'임시 본품',available:'1000',reserved:'',code:'000001'},{name:'임시 사은품',available:'0',reserved:'',code:''}]}});
const apply=(finance,d)=>applyLogisticsWorkbook(finance,d,[],'actor',now,uuid);

test('one workbook atomically creates named items, full composition and inventory; reimports reuse physical codes',()=>{
 const finance=f(),input=data(),before=structuredClone({finance,input}),l=apply(finance,input);
 assert.equal(l.skus.length,2);assert.equal(l.boms.length,1);assert.deepEqual(l.boms[0].lines.map(r=>r.quantity),[9,2]);assert.equal(l.skus[0].code,'000001');assert.equal(l.snapshots[0].lines[1].available,0);assert.deepEqual({finance,input},before);
 const next=data();next.inventory.asOf='2026-11-06T09:00';const l2=apply({...finance,logistics:l},next);assert.equal(l2.skus.length,2);assert.equal(l2.boms.length,2);assert.equal(l2.snapshots.length,2);assert.equal(l2.boms[1].lines[1].sku,l.boms[0].lines[1].sku);
});
test('missing gifts, unknown sales names, duplicate items and inconsistent WMS codes are rejected without partial mutation',()=>{
 for(const change of [d=>d.compositions[0].gift='',d=>d.compositions[0].sale='비슷한 이름',d=>d.inventory.lines[1].code='000001',d=>d.inventory.lines[1].available='',d=>d.compositions[0].quantity='0',d=>d.inventory.lines.push({...d.inventory.lines[0]})]){
  const finance=f(),d=data(),before=structuredClone(finance);change(d);assert.throws(()=>apply(finance,d));assert.deepEqual(finance,before);
 }
 const finance=f();finance.logistics={...apply(finance,data()),skus:[{code:'A',name:'임시 본품'},{code:'B',name:'임시 본품'}]};const d=data();d.inventory=null;assert.throws(()=>apply(finance,d),/여러 개/);
});
test('explicit no gift, multiple gifts, composition-only and inventory-only retain clear meanings',()=>{
 const d=data();d.inventory=null;d.compositions[0].gift='없음';d.compositions[0].giftQuantity='';assert.equal(apply(f(),d).boms[0].lines.length,1);
 d.compositions.push({sale:'임시 9개 세트',product:'',quantity:'',gift:'추가 사은품',giftQuantity:'1'});assert.equal(apply(f(),d).boms[0].lines.length,2);
 const stock=data();stock.compositions=[];assert.equal(apply(f(),stock).boms.length,0);
 stock.inventory.basis='unreserved';assert.throws(()=>apply(f(),stock),/예약수량/);for(const line of stock.inventory.lines)line.reserved='0';assert.equal(apply(f(),stock).snapshots[0].lines[0].reservedForPlans,0);
});
test('actual delivered workbook uses names, parses filled cells and rejects incomplete inventory and formulas',()=>{
 const bytes=fs.readFileSync(new URL('../public/templates/logistics-unified.xlsx',import.meta.url));
 const wb=X.read(bytes,{type:'buffer'});assert.deepEqual(wb.SheetNames,['상품구성','재고','작성방법']);
 const draft=readSimpleLogisticsWorkbook(bytes);assert.equal(draft.inventory,null);assert.equal(draft.compositions.length,2);assert.throws(()=>apply(f(),draft));
 for(const row of [2,3])X.utils.sheet_add_aoa(wb.Sheets['상품구성'],[[row===2?3:9,'없음','']],{origin:'C'+row});
 const filled=readSimpleLogisticsWorkbook(X.write(wb,{type:'buffer',bookType:'xlsx'}));assert.equal(filled.compositions[1].quantity,'9');
 assert.equal(apply(emptyFinance(),{...filled,compositions:filled.compositions.slice(0,1)}).boms[0].lines[0].quantity,3);
 X.utils.sheet_add_aoa(wb.Sheets['재고'],[['센터1']],{origin:'B1'});assert.throws(()=>readSimpleLogisticsWorkbook(X.write(wb,{type:'buffer',bookType:'xlsx'})),/모든 품목/);
 wb.Sheets['상품구성'].C2={t:'n',f:'1+2',v:3};assert.throws(()=>readSimpleLogisticsWorkbook(X.write(wb,{type:'buffer',bookType:'xlsx'})),/수식/);
});
test('real store saves the combined import once and preserves existing broadcast cost/profit snapshots',async()=>{
 const db=await store();try{
 const b={id:'unified-broadcast',date:'2026-11-05',time:'10:00',channel:'SK',item:'임시',unitCost:'3200',result:{goodsCost:'12345',profit:'54321'}};
 await saveRecord(db,b,0,'unified-seed','actor','hash');const before=await db.prepare('SELECT payload,version FROM scm_records').first();
 await saveFinance(db,{kind:'salesComposition',data:{name:'임시 9개 세트'}},0,'unified-sales','actor','hash',[]);const finance=await readFinance(db);
 const action={kind:'logistics',data:{op:'workbook',workbook:data()}};
 const saved=await saveFinance(db,action,finance.version,'unified-import','actor','hash',[]);assert.equal(saved.logistics.skus.length,2);assert.equal(saved.logistics.snapshots.length,1);
 assert.deepEqual(await db.prepare('SELECT payload,version FROM scm_records').first(),before);
 const replay=await saveFinance(db,action,finance.version,'unified-import','actor','hash',[]);assert.deepEqual(replay,saved);
 const invalid=data();invalid.inventory.asOf='2026-11-05T09:00';await assert.rejects(saveFinance(db,{kind:'logistics',data:{op:'workbook',workbook:invalid}},saved.version,'unified-invalid','actor','hash',[]));assert.deepEqual(await readFinance(db),saved);
 }finally{await db.close();}
});
