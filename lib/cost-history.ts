import {actualDateTime,type Item} from './scm-model.ts';

export type CostKind='product'|'gift';
export type CostHistory={id:string;itemId:string;kind:CostKind;name:string;unit:string;effectiveFrom:string;unitCost:string;createdAt:string};
export type CostSnapshot=CostHistory&{basisDate:string};
export type CostFields={unitCost:string;costDate?:string;costItemId?:string;costSnapshot?:CostSnapshot};
export type CostMaster={costHistory?:CostHistory[]};
export class CostHistoryError extends Error{}
const key=(value:string)=>value.normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase('ko');
export const validCostDate=(value:string)=>Boolean(actualDateTime(value,'00:00'));

// Append-only records keep the exact costs used by earlier broadcasts available.
export function appendCostHistory(master:CostMaster,data:Record<string,unknown>,now:string,uuid:()=>string):CostHistory[]{
 const rows=master.costHistory||[];
 if(rows.length>=2000)throw new CostHistoryError('원가 이력은 2,000건까지 등록할 수 있습니다.');
 const text=(name:string,max:number)=>{const v=data[name];if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new CostHistoryError('품목명·단위·적용 시작일·단위원가를 확인해 주세요.');return v.trim().replace(/\s+/g,' ')};
 const kind=data.kind;if(kind!=='product'&&kind!=='gift')throw new CostHistoryError('상품 또는 사은품을 선택해 주세요.');
 const name=text('name',120),unit=text('unit',20),effectiveFrom=text('effectiveFrom',10),unitCost=text('unitCost',30);
 if(!validCostDate(effectiveFrom))throw new CostHistoryError('적용 시작일을 실제 날짜로 입력해 주세요.');
 if(!/^\d+(\.\d{1,2})?$/.test(unitCost)||Number(unitCost)>1e12)throw new CostHistoryError('단위원가는 0 이상, 소수 둘째 자리까지 입력하세요.');
 if(data.itemId!==undefined&&typeof data.itemId!=='string')throw new CostHistoryError('원가 품목을 다시 선택해 주세요.');
 const existing=data.itemId?rows.find(r=>r.itemId===data.itemId):rows.find(r=>r.kind===kind&&key(r.name)===key(name)&&key(r.unit)===key(unit));
 if(data.itemId&&!existing)throw new CostHistoryError('원가 품목을 다시 선택해 주세요.');
 if(existing&&(existing.kind!==kind||key(existing.name)!==key(name)||key(existing.unit)!==key(unit)))throw new CostHistoryError('기존 품목의 이름·구분·단위는 변경할 수 없습니다. 다른 품목으로 등록하세요.');
 const itemId=existing?.itemId||uuid();
 if(rows.some(r=>r.itemId===itemId&&r.effectiveFrom===effectiveFrom))throw new CostHistoryError('같은 품목과 적용 시작일의 원가 이력이 이미 있습니다.');
 return [...rows,{id:uuid(),itemId,kind,name:existing?.name||name,unit:existing?.unit||unit,effectiveFrom,unitCost:String(Number(unitCost)),createdAt:now}];
}
export function costItems(master:CostMaster,kind:CostKind){
 return [...new Map((master.costHistory||[]).filter(r=>r.kind===kind).map(r=>[r.itemId,r])).values()].sort((a,b)=>a.name.localeCompare(b.name,'ko'));
}
export function costAt(master:CostMaster,itemId:string,kind:CostKind,date:string){
 if(!validCostDate(date))return undefined;
 return (master.costHistory||[]).filter(r=>r.itemId===itemId&&r.kind===kind&&r.effectiveFrom<=date).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}
export function selectCost(master:CostMaster,kind:CostKind,itemId:string,date:string):CostFields{
 const row=costAt(master,itemId,kind,date);
 return {costItemId:itemId,costDate:date,unitCost:row?.unitCost||'',costSnapshot:row?{...row,basisDate:date}:undefined};
}
// Never consult today's master while calculating a saved broadcast.
export function appliedUnitCost(line:CostFields){
 if(!line.costItemId)return line.unitCost;
 const s=line.costSnapshot;
 return s&&s.itemId===line.costItemId&&s.basisDate===line.costDate&&s.effectiveFrom<=s.basisDate&&s.unitCost===line.unitCost?s.unitCost:'';
}
export function resolveBroadcastCosts(input:Item,previous:Item|undefined,master:CostMaster):Item{
 const resolve=<T extends CostFields>(line:T,old:CostFields|undefined,kind:CostKind):T=>{
  if(line.costItemId!==undefined&&typeof line.costItemId!=='string')throw new CostHistoryError('원가 품목을 확인해 주세요.');
  if(line.costDate!==undefined&&(typeof line.costDate!=='string'||(line.costDate&&!validCostDate(line.costDate))))throw new CostHistoryError('원가 기준일을 확인해 주세요.');
  if(!line.costItemId){const {costSnapshot:_snapshot,costItemId:_itemId,...manual}=line;return manual as T;}
  if(!(master.costHistory||[]).some(r=>r.itemId===line.costItemId&&r.kind===kind))throw new CostHistoryError('등록된 원가 품목을 선택해 주세요.');
  const date=line.costDate||'';
  // Keep an unchanged snapshot frozen, including after backdated master additions.
  if(old?.costItemId===line.costItemId&&old.costDate===date&&old.costSnapshot&&line.costSnapshot?.id===old.costSnapshot.id){
   return {...line,unitCost:old.unitCost,costSnapshot:structuredClone(old.costSnapshot)};
  }
  return {...line,...selectCost(master,kind,line.costItemId,date)};
 };
 const next={...input};
 if(input.compositions)next.compositions={single:resolve(input.compositions.single,previous?.compositions?.single,'product'),double:resolve(input.compositions.double,previous?.compositions?.double,'product')};
 if(input.gifts)next.gifts=input.gifts.map(g=>resolve(g,previous?.gifts?.find(old=>old.id===g.id),'gift'));
 return next;
}
