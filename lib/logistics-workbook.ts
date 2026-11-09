import {applyLogisticsAction,emptyLogistics,LogisticsError,type Logistics} from './logistics.ts';
import {salesCompositionChoices} from './sales-compositions.ts';
import type {Finance} from './finance-model.ts';
import type {Item} from './scm-model.ts';

export type SimpleComposition={sale:string;product:string;quantity:string;gift:string;giftQuantity:string};
export type SimpleStock={name:string;available:string;reserved:string;code:string};
export type SimpleLogisticsWorkbook={compositions:SimpleComposition[];inventory:null|{warehouse:string;asOf:string;basis:string;lines:SimpleStock[]}};
const name=(v:unknown,label:string,max=120)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new LogisticsError(label+'을 확인하세요.');return v.trim().normalize('NFKC');};
const optional=(v:unknown)=>typeof v==='string'?v.trim():'';
export function applyLogisticsWorkbook(finance:Finance,raw:unknown,items:Item[],actor:string,now:string,uuid:()=>string):Logistics{
 if(!raw||typeof raw!=='object')throw new LogisticsError('통합 양식 내용을 확인하세요.');
 const d=raw as SimpleLogisticsWorkbook;
 if(!Array.isArray(d.compositions)||d.compositions.length>1000)throw new LogisticsError('상품구성은 최대 1,000행입니다.');
 if(d.inventory!==null&&(!d.inventory||!Array.isArray(d.inventory.lines)||!d.inventory.lines.length||d.inventory.lines.length>1000))throw new LogisticsError('재고는 1~1,000행을 작성하세요.');
 let l=structuredClone(finance.logistics||emptyLogistics());
 const stock=d.inventory?.lines||[],names=new Map<string,string>(),codes=new Map<string,string>();
 const choices=salesCompositionChoices(finance);
 // Register the physical items first, in the same atomic finance transaction.
 // An optional WMS code is authoritative; a name must never silently join two items.
 const resolve=(rawName:unknown)=>{
  const n=name(rawName,'품목명');if(names.has(n))return names.get(n)!;
  const supplied=stock.filter(r=>r&&optional(r.name).normalize('NFKC')===n).map(r=>optional(r.code)).filter(Boolean);
  if(new Set(supplied).size>1)throw new LogisticsError(n+': 물류상품코드가 서로 다릅니다.');
  const byName=l.skus.filter(s=>s.name.normalize('NFKC')===n),given=supplied[0];
  let code:string;
  if(given){
   code=name(given,'물류상품코드',80);const found=l.skus.find(s=>s.code===code);
   if(found&&found.name.normalize('NFKC')!==n)throw new LogisticsError(code+': 기존 품목명과 다릅니다.');
   if(byName.length&& !byName.some(s=>s.code===code))throw new LogisticsError(n+': 기존 상품코드와 다릅니다. 기존 코드를 사용하세요.');
  }else{
   if(byName.length>1)throw new LogisticsError(n+': 같은 이름의 상품이 여러 개입니다. 재고 시트에 물류상품코드를 입력하세요.');
   code=byName[0]?.code||'SKU-'+uuid();
  }
  if(l.skus.find(s=>s.code===code)?.unit==='세트')throw new LogisticsError('완제품 세트는 EA 양식으로 입력할 수 없습니다. 등록 단위에 맞는 재고 입력을 사용하세요.');
  if(codes.has(code)&&codes.get(code)!==n)throw new LogisticsError('서로 다른 품목에 같은 코드를 사용할 수 없습니다.');
  if(!l.skus.some(s=>s.code===code))l=applyLogisticsAction(l,{op:'sku',code,name:n},items,actor,now,uuid);
  names.set(n,code);codes.set(code,n);return code;
 };
 const rows:{compositionCode:string;sku:string;role:string;quantity:string}[]=[];
 for(const [i,r]of d.compositions.entries()){
  if(!r||typeof r!=='object')throw new LogisticsError('상품구성 행을 확인하세요.');
  const sale=name(r.sale,`상품구성 ${i+2}행 판매구성`),matches=choices.filter(c=>c.name.normalize('NFKC')===sale);
  if(matches.length!==1)throw new LogisticsError(sale+': 앱 판매구성 목록에서 정확한 이름을 선택하세요. 이름이 중복되면 기준정보를 정리하세요.');
  if(optional(r.product)||optional(r.quantity))rows.push({compositionCode:matches[0].code,sku:resolve(r.product),role:'product',quantity:optional(r.quantity)});
  const gift=optional(r.gift);
  if(!gift)throw new LogisticsError(`상품구성 ${i+2}행: 사은품을 선택하거나 '없음'을 선택하세요.`);
  if(gift==='없음'){if(optional(r.giftQuantity))throw new LogisticsError(`상품구성 ${i+2}행: 사은품 없음이면 사은품 수량은 비워 주세요.`);}
  else rows.push({compositionCode:matches[0].code,sku:resolve(gift),role:'gift',quantity:optional(r.giftQuantity)});
  if(!rows.some(row=>row.compositionCode===matches[0].code&&row.role==='product'))throw new LogisticsError(`상품구성 ${i+2}행: 본품명과 본품 수량을 입력하세요.`);
 }
 if(rows.length)l=applyLogisticsAction(l,{op:'bomBatch',rows},items,actor,now,uuid);
 if(d.inventory){
  const seen=new Set<string>(),lines=stock.map(r=>{
   if(!r||typeof r!=='object')throw new LogisticsError('재고 행을 확인하세요.');
   const sku=resolve(r.name);if(seen.has(sku))throw new LogisticsError('재고 시트의 품목이 중복됐습니다: '+r.name);seen.add(sku);
   return {sku,available:r.available,reservedForPlans:r.reserved};
  });
  l=applyLogisticsAction(l,{op:'inventory',...d.inventory,lines,source:'물류 통합 입력양식'},items,actor,now,uuid);
 }
 if(!rows.length&&!d.inventory)throw new LogisticsError('입력된 구성이나 재고가 없습니다.');
 return l;
}
