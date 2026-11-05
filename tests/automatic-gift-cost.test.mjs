import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticGiftCost} from '../lib/automatic-gift-cost.ts';
import {withGiftItem} from '../lib/gift-items.ts';
import {resolveBroadcastCosts,selectCost} from '../lib/cost-history.ts';
const history=(id,date,cost,extra={})=>({id,itemId:'alpha',kind:'gift',name:'알파시클로덱스트린',unit:'개',effectiveFrom:date,unitCost:cost,createdAt:date,...extra});
const master={costHistory:[history('old','2026-01-01','1400'),history('new','2026-11-01','1500'),history('product','2026-01-01','99',{kind:'product',itemId:'product'})]};
const gift=(id='gift')=>({id,side:'single',item:'',units:'2',unitCost:''});
const broadcast=()=>({id:'saved',item:'파라다이스',date:'2026-11-01',gifts:[]});
test('selecting a gift applies only gift history effective on broadcast day, preserving quantity and target',()=>{
 const before={...broadcast(),gifts:[gift()]};
 const next=automaticGiftCost({...before,gifts:[withGiftItem(before.gifts[0],'알파')]},before,master);
 assert.equal(next.gifts[0].unitCost,'1500');assert.equal(next.gifts[0].costDate,'2026-11-01');
 assert.equal(next.gifts[0].costSnapshot.unit,'개');assert.equal(next.gifts[0].units,'2');assert.equal(next.gifts[0].side,'single');
 const earlier=automaticGiftCost({...broadcast(),date:'2026-10-31',gifts:[{...gift(),item:'알파'}]},broadcast(),master);
 assert.equal(earlier.gifts[0].unitCost,'1400');
});
test('first save and a newly added gift on a saved broadcast use the same canonical server selection',()=>{
 const next={...broadcast(),gifts:[{...gift(),item:'알파시클로덱스트린'}]};
 const a=automaticGiftCost(next,broadcast(),master);
 const b=resolveBroadcastCosts(automaticGiftCost(next,undefined,master),undefined,master);
 assert.equal(a.gifts[0].unitCost,'1500');assert.equal(b.gifts[0].unitCost,'1500');
});
test('existing gift costs, snapshots and profit never change just because newer history exists or dates change',()=>{
 const g={...gift(),item:'알파',unitCost:'777'},b={...broadcast(),gifts:[g],result:{profit:'123'}};
 const next=automaticGiftCost({...b,date:'2026-12-01'},b,master);
 assert.strictEqual(next.gifts[0],g);assert.equal(next.result.profit,'123');
 const frozen={...g,...selectCost(master,'gift','alpha','2026-01-01')};
 const old={...b,gifts:[frozen]};
 assert.strictEqual(automaticGiftCost({...old,date:'2026-12-01'},old,master).gifts[0],frozen);
 assert.equal(automaticGiftCost({...b,gifts:[{...g,units:'3'}]},b,master).gifts[0].unitCost,'777');
});
test('manual zero, explicit date/cost selection and unrelated gifts are preserved',()=>{
 const before=broadcast(),zero={...gift(),item:'알파',unitCost:'0'};
 assert.equal(automaticGiftCost({...before,gifts:[zero]},before,master).gifts[0].unitCost,'0');
 const manual={...gift(),item:'알파',...selectCost(master,'gift','alpha','2026-01-01')};
 assert.equal(automaticGiftCost({...before,gifts:[manual]},before,master).gifts[0].unitCost,'1400');
});
test('unregistered/future/ambiguous costs stay unknown rather than becoming zero or product costs',()=>{
 const before=broadcast();
 for(const [name,date,m] of [['알파','2025-01-01',master],['알파','',master],['없는 사은품','2026-11-01',master],['알파','2026-11-01',{costHistory:[...master.costHistory,history('box','2026-01-01','10000',{itemId:'box',unit:'박스'})]}]]){
  const next=automaticGiftCost({...before,date,gifts:[{...gift(),item:name}]},before,m);
  assert.equal(next.gifts[0].unitCost,'');assert.equal(next.gifts[0].costSnapshot,undefined);
 }
});
test('explicit name changes clear stale costs and new unsaved draft date changes refresh automatic costs',()=>{
 const before={...broadcast(),id:'',date:'2026-10-31',gifts:[{...gift(),item:'알파'}]};
 const first=automaticGiftCost(before,undefined,master);
 const later=automaticGiftCost({...first,date:'2026-11-01'},first,master);
 assert.equal(later.gifts[0].unitCost,'1500');
 const renamed={...later,gifts:[withGiftItem(later.gifts[0],'새 사은품')]};
 assert.equal(automaticGiftCost(renamed,later,master).gifts[0].unitCost,'');
});
