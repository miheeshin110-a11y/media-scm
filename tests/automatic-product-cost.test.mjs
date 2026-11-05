import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticProductCost} from '../lib/automatic-product-cost.ts';
import {resolveBroadcastCosts,selectCost} from '../lib/cost-history.ts';
import {compositions} from '../lib/workflow.ts';
const row=(id,date,cost,extra={})=>({id,itemId:'paradise',kind:'product',name:'파라다이스 그레인 버닝',unit:'개',effectiveFrom:date,unitCost:cost,createdAt:date,...extra});
const master={costHistory:[row('old','2026-01-01','3000'),row('new','2026-10-19','3200'),row('gift','2026-01-01','1',{kind:'gift',itemId:'gift'})]};
const blank=()=>({id:'',item:'',date:'2026-10-19'});
test('new product aliases select the dated product cost for both sizes, including effective day',()=>{
 const b=blank(),next=automaticProductCost({...b,item:'파라다이스'},b,master);
 assert.equal(next.compositions.single.unitCost,'3200');assert.equal(next.compositions.double.unitCost,'3200');
 assert.equal(next.compositions.single.costSnapshot.unit,'개');
 assert.equal(next.compositions.single.costDate,b.date);
 assert.equal(automaticProductCost({...b,item:'파라',date:'2026-10-18'},b,master).compositions.single.unitCost,'3000');
});
test('draft date changes refresh only automatic lines; unknown products and dates never mean zero',()=>{
 const b=blank(),first=automaticProductCost({...b,item:'파라'},b,master);
 const before=automaticProductCost({...first,date:'2026-09-01'},first,master);
 assert.equal(before.compositions.single.unitCost,'3000');
 const missing=automaticProductCost({...first,date:'2025-01-01'},first,master);
 assert.equal(missing.compositions.single.unitCost,'');assert.equal(missing.compositions.single.costSnapshot,undefined);
 const changed=automaticProductCost({...first,item:'이력 없는 상품'},first,master);
 assert.equal(changed.compositions.single.unitCost,'');
 assert.equal(automaticProductCost({...b,item:'파라',date:''},b,master).compositions.single.unitCost,'');
});
test('opening and editing saved broadcasts preserves manual or historical costs and profit',()=>{
 const b={...blank(),id:'saved',item:'파라',result:{profit:'123'},compositions:compositions(blank())};
 b.compositions.single.unitCost='777';
 const changed={...b,date:'2026-11-01',item:'파라다이스'};
 assert.strictEqual(automaticProductCost(changed,b,master),changed);
 assert.equal(changed.compositions.single.unitCost,'777');assert.equal(changed.result.profit,'123');
 const saved={...b,compositions:{...b.compositions,single:{...b.compositions.single,...selectCost(master,'product','paradise','2026-01-01')}}};
 assert.strictEqual(automaticProductCost({...saved,date:'2026-11-01'},saved,master).compositions,saved.compositions);
});
test('first server save covers quick creation, while manual zero and selected overrides are preserved',()=>{
 const b={...blank(),id:'new-server-id',item:'파라'};
 const first=resolveBroadcastCosts(automaticProductCost(b,undefined,master),undefined,master);
 assert.equal(first.compositions.single.unitCost,'3200');
 const explicit={...b,compositions:compositions(b)};explicit.compositions.single.unitCost='0';
 assert.equal(automaticProductCost(explicit,undefined,master).compositions.single.unitCost,'0');
 explicit.compositions.single={...explicit.compositions.single,...selectCost(master,'product','paradise','2026-01-01')};
 assert.equal(automaticProductCost(explicit,undefined,master).compositions.single.unitCost,'3000');
});
test('master refreshes do not silently reprice drafts and ambiguous units require explicit selection',()=>{
 const b=blank(),first=automaticProductCost({...b,item:'파라'},b,master);
 assert.strictEqual(automaticProductCost(first,first,{costHistory:[...master.costHistory,row('backdated','2026-10-18','1')]}),first);
 const ambiguous={costHistory:[...master.costHistory,row('box','2026-01-01','10000',{itemId:'box',unit:'박스'})]};
 assert.equal(automaticProductCost({...b,item:'파라'},b,ambiguous).compositions.single.costItemId,undefined);
});
