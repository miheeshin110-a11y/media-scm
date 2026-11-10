import test from 'node:test';
import assert from 'node:assert/strict';
import * as X from 'xlsx';
import {compositions,costPlan} from '../lib/workflow.ts';
import {emptyLogistics,applyLogisticsAction} from '../lib/logistics.ts';
import {logisticsExport} from '../lib/logistics-export.ts';
import {logisticsExportWorkbook} from '../lib/logistics-export-file.ts';
const now='2026-11-10T00:00:00Z';let seq=0;
const apply=(l,d)=>applyLogisticsAction(l,d,[],'temporary',now,()=>`export-${++seq}`);
function master(){let l=apply(emptyLogistics(),{op:'sku',code:'DT-1',name:'완제품',unit:'세트'});l=apply(l,{op:'bom',compositionCode:'DT-1',shipmentMode:'set',effectiveFrom:'2026-11-01',lines:[{sku:'DT-1',role:'product',quantity:1}]});l.setContents=[{id:'contents',compositionCode:'DT-1',effectiveFrom:'2026-11-01',createdAt:now,actor:'tester',lines:[{sku:'V-main',name:'시험 본품',role:'product',quantity:18,unit:'개'},{sku:'V-gift',name:'시험 젤리',role:'gift',quantity:2,unit:'개'}]}];return l;}
function item(id='B'){const b={id,version:7,date:'2026-11-20',time:'10:00',channel:'시험채널',item:'시험 방송',status:'편성확정',result:{productCost:'999',profit:'12345'},gifts:[{item:'시험 젤리',unitCost:'555',units:'2'}]};b.compositions=compositions(b);Object.assign(b.compositions.single,{sku:'DT-1',compositionName:'본품18 + 젤리2',plannedQuantity:'100',conversionRate:'80',unitCost:'777'});b.costPlan={...costPlan(b),quantityRounding:'floor'};return b;}
test('export distinguishes full preparation and expected shipment for product and gift without financial changes',()=>{
 const l=master(),b=item(),before=structuredClone({l,b}),out=logisticsExport([b],l);
 assert.deepEqual(out.rows.map(r=>[r.role,r.sku,r.prepare,r.expected,r.unit]),[['본품','V-main',1800,1440,'개'],['사은품','V-gift',200,160,'개']]);assert.equal(out.issues.length,0);assert.deepEqual({l,b},before);assert.ok(out.rows.every(r=>!('unitCost' in r)&&!('profit' in r)));
});
test('main/sub rounding occurs per composition before unit multiplication and totals do not double-count gifts',()=>{
 const l=master(),b=item();b.compositions.single.plannedQuantity='3';b.compositions.single.conversionRate='50';Object.assign(b.compositions.double,{enabled:true,sku:'DT-1',plannedQuantity:'3',conversionRate:'50'});
 const out=logisticsExport([b],l);assert.equal(out.rows.length,4);assert.deepEqual(out.totals.map(r=>[r.sku,r.prepare,r.expected,r.broadcasts]),[['V-gift',12,4,1],['V-main',108,36,1]]);
});
test('missing rates and quantities remain blank while explicit zero is preserved',()=>{
 const l=master(),b=item();b.compositions.single.conversionRate='';let out=logisticsExport([b],l);assert.equal(out.rows[0].prepare,1800);assert.equal(out.rows[0].expected,null);assert.equal(out.totals.find(r=>r.sku==='V-main').expected,null);assert.ok(out.issues.length);
 b.compositions.single.plannedQuantity='';out=logisticsExport([b],l);assert.equal(out.rows[0].prepare,null);
 b.compositions.single.plannedQuantity='0';out=logisticsExport([b],l);assert.equal(out.rows[0].prepare,0);assert.equal(out.rows[0].expected,0);
});
test('organic safflower, cancellations and undated broadcasts are excluded with explicit reasons, never quantities',()=>{
 const l=master(),held=item('H'),cancelled={...item('C'),status:'취소'},undated={...item('U'),time:''};held.compositions.single.sku='DT00212';held.item='유기농 홍화씨';const out=logisticsExport([held,cancelled,undated],l);assert.equal(out.rows.length,0);assert.equal(out.issues.length,3);assert.match(out.issues.map(r=>r.reason).join(' '),/보류/);assert.match(out.issues.map(r=>r.reason).join(' '),/취소/);assert.match(out.issues.map(r=>r.reason).join(' '),/방송일/);
 const mixed=master();mixed.setContents[0].lines.push({sku:'V00100110',name:'홍화씨',role:'gift',quantity:1,unit:'개'});assert.equal(logisticsExport([item()],mixed).rows.length,0);
});
test('broadcast date selects historical contents and missing mapping is recorded instead of silently zeroed',()=>{
 const l=master();l.setContents.push({...l.setContents[0],id:'future',effectiveFrom:'2026-12-01',lines:l.setContents[0].lines.map(r=>({...r,quantity:r.quantity/2}))});const b=item();assert.equal(logisticsExport([b],l).rows[0].prepare,1800);b.date='2026-12-05';assert.equal(logisticsExport([b],l).rows[0].prepare,900);
 const missing=logisticsExport([item()],emptyLogistics());assert.equal(missing.rows.length,0);assert.match(missing.issues[0].reason,/構成|구성표/);
});
test('export workbook round-trips as one file, with numeric quantities, code text, warnings and no financial fields/formulas',()=>{
 const l=master(),b=item();b.item='=HYPERLINK("unsafe")';const wb=logisticsExportWorkbook([b],l,now),roundTrip=X.read(X.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
 assert.deepEqual(roundTrip.SheetNames,['방송별 수량','품목별 합계','확인 필요','전달 안내']);const s=roundTrip.Sheets['방송별 수량'];assert.equal(s.D2.t,'s');assert.equal(s.D2.f,undefined);assert.equal(s.G2.v,'V-main');assert.equal(s.J2.t,'n');assert.equal(s.J2.v,1800);assert.equal(s.K2.v,1440);assert.ok(s['!autofilter']);
 const text=JSON.stringify(X.utils.sheet_to_json(s,{header:1}));for(const secret of ['unitCost','profit','productCost','12345'])assert.ok(!text.includes(secret));
 b.compositions.single.conversionRate='';const missing=logisticsExportWorkbook([b],l,now);assert.equal(missing.Sheets['방송별 수량'].K2,undefined);assert.ok(missing.Sheets['확인 필요']['!ref']!=='A1:F1');
});
test('retired ECOUNT routes reject imports and pairing, and tell old PC agents to stop',async()=>{
 const inventory=await import('../app/api/ecount/inventory/route.ts'),bridge=await import('../app/api/ecount/bridge/route.ts'),worker=await import('../app/api/ecount/bridge/worker/route.ts');
 for(const handler of [inventory.GET,inventory.POST,bridge.GET,bridge.POST]){const response=await handler();assert.equal(response.status,410);assert.equal((await response.json()).disabled,true);}
 assert.equal((await worker.POST()).status,401);
});
