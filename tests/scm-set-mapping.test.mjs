import test from 'node:test';
import assert from 'node:assert/strict';
import * as X from 'xlsx';
import {emptyFinance} from '../lib/finance-model.ts';
import {salesCompositionChoices} from '../lib/sales-compositions.ts';
import {applyScmSetMappings,reviewSetMappings} from '../lib/scm-set-mapping.ts';
import {readScmSetMappingFile} from '../lib/scm-set-mapping-file.ts';
import {latestBom,logisticsPlan,logisticsFingerprint,applyLogisticsAction} from '../lib/logistics.ts';
import {compositions} from '../lib/workflow.ts';
const f=emptyFinance(),choices=salesCompositionChoices(f),now='2026-11-09T00:00:00Z';let n=0;const uuid=()=>`mapping-${++n}`;
const row=(i=0,extra={})=>({configId:`CFG${i}`,salesCode:choices[i].code,salesName:choices[i].name,setSku:`V-${i}`,extraSkus:[],sourceRows:[7+i],sourceMode:'세트 SKU',use:'',review:'',note:'',...extra});
const apply=(finance,rows,extra={})=>applyScmSetMappings(finance,{rows,selectedIds:rows.map(r=>r.configId),effectiveFrom:'2026-11-16',confirmSet:true,...extra},[],'tester',now,uuid);
function broadcast(day){const b={id:'B',date:day,time:'10:00',item:'test',result:{profit:'1234'},gifts:[{item:'gift',units:'2',unitCost:'55'}]};b.compositions=compositions(b);Object.assign(b.compositions.single,{sku:choices[0].code,plannedQuantity:'10',unitCost:'777'});return b;}
test('finished sets do not separately deduct gifts or mutate financial/broadcast data; dates select the correct version',()=>{
 const before=structuredClone(f),b=broadcast('2026-11-20'),snapshot=structuredClone(b);
 let l=apply(f,[row()]);assert.equal(latestBom(l,choices[0].code,'2026-11-15'),undefined);
 assert.equal(logisticsPlan(b,l).requirements.length,1);assert.equal(logisticsPlan(b,l).requirements[0].quantity,10);
 const fp=logisticsFingerprint(b,l);l=apply({...f,logistics:l},[row(0,{setSku:'V-new'})],{effectiveFrom:'2026-12-01'});
 assert.equal(logisticsFingerprint(b,l),fp);assert.equal(latestBom(l,choices[0].code,'2026-12-01').lines[0].sku,'V-new');
 assert.deepEqual(f,before);assert.deepEqual(b,snapshot);assert.equal(l.skus[0].unit,'세트');
});
test('repeated finished-set codes require explicit shipment multiples; extra codes require inclusion confirmation',()=>{
 const rows=[row(0,{setSku:'V-shared'}),row(1,{setSku:'V-shared'})];assert.ok(reviewSetMappings(f,rows).every(r=>r.issues.length));
 rows[0].setQuantity='2';rows[1].setQuantity='1';const l=apply(f,rows);assert.equal(l.boms[0].lines[0].quantity,2);
 const r=row(0,{extraSkus:['V-gift']});assert.throws(()=>apply(f,[r]),/여러 개/);r.setSkuConfirmed=true;
 assert.equal(apply(f,[r]).boms[0].lines.length,1);
});
test('unknown organic codes, missing dates, invalid units and unresolved rows cannot be silently imported',()=>{
 assert.throws(()=>apply(f,[row(0,{salesCode:'NOT-REGISTERED'})]),/판매구성/);
 assert.throws(()=>apply(f,[row()],{effectiveFrom:''}),/시작 방송일/);
 const l=applyLogisticsAction(undefined,{op:'sku',code:'V-0',name:'existing'},[],'tester',now,uuid);
 assert.throws(()=>apply({...f,logistics:l},[row()]),/단위/);
 const before=structuredClone(f);assert.throws(()=>apply(f,[row(),row(1,{salesCode:'unknown'})]));assert.deepEqual(f,before);
});
function workbook(extraDetail=false,formula=false){const wb=X.utils.book_new(),a=Array.from({length:6},()=>[]);a[5]=['구성ID','출고 상품코드','방송용 판매구성명','기존 선택 코드 참고용','SCM 확정 세트 SKU 세트 출고 시 입력','출고 방식'];a.push(['CFG1','V-main',choices[0].name,choices[0].code,'','세트 SKU']);a.push(['','V-extra',choices[0].name,choices[0].code]);const sheet=X.utils.aoa_to_sheet(a);sheet.L7={t:'n',v:1,f:'1+0'};if(formula)sheet.B7={t:'s',v:'V-main',f:'"V-main"'};X.utils.book_append_sheet(wb,sheet,'판매구성 마스터');if(extraDetail){const d=Array.from({length:6},()=>[]);d.push(['CFG1','본품','V-main']);X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(d),'출고 SKU 상세');}X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([['EXAMPLE']]),'작성예시');return X.write(wb,{type:'buffer',bookType:'xlsx'});}
test('file parser groups continuation rows, ignores examples/check formulas, rejects input formulas and unhandled detail',()=>{
 const rows=readScmSetMappingFile(workbook());assert.equal(rows.length,1);assert.deepEqual(rows[0].extraSkus,['V-extra']);assert.equal(rows[0].setSku,choices[0].code);assert.equal(rows[0].mainComponentSku,'V-main');assert.equal(rows[0].setSkuConfirmed,true);assert.deepEqual(rows[0].sourceRows,[7,8]);
 assert.throws(()=>readScmSetMappingFile(workbook(true)),/상세/);assert.throws(()=>readScmSetMappingFile(workbook(false,true)),/수식/);
});

test('explicit D-column repair invalidates only the two mistaken B-code BOMs and preserves all financial fields',()=>{
 const pairs=[['CFG-0012','DT00156','V00100047'],['CFG-0014','DT00187','V00100096-1']];
 let l;
 for(const [configId,code,component]of pairs){l=applyLogisticsAction(l,{op:'sku',code:component,name:'완제품 세트 '+component,unit:'세트'},[],'tester',now,uuid);l=applyLogisticsAction(l,{op:'bom',compositionCode:code,shipmentMode:'set',effectiveFrom:'2026-11-09',sourceConfigId:configId,lines:[{sku:component,role:'product',quantity:1}]},[],'tester',now,uuid);}
 const finance={...f,logistics:l},before=structuredClone(finance);
 const rows=pairs.map(([configId,code,component])=>row(0,{configId,salesCode:code,salesName:choices.find(c=>c.code===code).name,setSku:code,mainComponentSku:component,setSkuConfirmed:true}));
 const repaired=apply(finance,rows,{effectiveFrom:'2026-11-09',correctMisclassifiedB:true});
 assert.deepEqual(finance,before);
 for(const [,code,component]of pairs){assert.equal(latestBom(repaired,code,'2026-11-09').lines[0].sku,code);assert.equal(repaired.skus.find(s=>s.code===component).unit,'EA');assert.equal(repaired.skus.find(s=>s.code===code).unit,'세트');}
 assert.equal(repaired.boms.filter(b=>b.correctedAt).length,2);
 const used=structuredClone(finance);used.logistics.snapshots.push({lines:[{sku:'V00100047'}]});assert.throws(()=>apply(used,rows,{correctMisclassifiedB:true}),/자동 정정/);
 assert.throws(()=>apply(finance,rows.slice(0,1),{correctMisclassifiedB:true}),/함께 선택/);
 assert.equal(reviewSetMappings(f,[row(0,{salesName:'홍화씨(유기농) 4박스'})])[0].issues.some(s=>s.includes('보류')),true);
});
