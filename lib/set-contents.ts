import {actualDateTime,type Item} from './scm-model.ts';
import {latestBom,LogisticsError,type Logistics} from './logistics.ts';
import {salesCompositionChoices} from './sales-compositions.ts';
import type {Finance} from './finance-model.ts';
export type SetComponent={sku:string;name:string;role:'product'|'gift';quantity:number;unit:string};
export type SetContents={id:string;compositionCode:string;effectiveFrom:string;lines:SetComponent[];createdAt:string;actor:string};
export type SetContentsInput={setCode:string;salesName:string;sku:string;name:string;role:string;quantity:string;unit:string;confirmed:string;note:string};
const text=(v:unknown,max=120)=>{if(typeof v!=='string'||v.length>max)throw new LogisticsError('구성수량 입력 형식을 확인하세요.');return v.trim();};
export function latestSetContents(l:Logistics,code:string,day:string){return (l.setContents||[]).filter(b=>b.compositionCode===code&&b.effectiveFrom<=day).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1);}
export function reviewSetContents(finance:Finance,raw:unknown){
 if(!Array.isArray(raw)||!raw.length||raw.length>1000)throw new LogisticsError('구성수량은 1~1,000행을 입력하세요.');
 const choices=salesCompositionChoices(finance),rows=raw.map(v=>{if(!v||typeof v!=='object')throw new LogisticsError('구성수량 행을 확인하세요.');const r=v as Record<string,unknown>;return Object.fromEntries(['setCode','salesName','sku','name','role','quantity','unit','confirmed','note'].map(k=>[k,text(r[k],k==='note'?500:120)])) as SetContentsInput;});
 return [...new Set(rows.map(r=>r.setCode))].map(code=>{
  const lines=rows.filter(r=>r.setCode===code),choice=choices.find(c=>c.code===code),issues:string[]=[];
  if(!choice||lines.some(r=>r.salesName!==choice.name))issues.push('앱 판매구성 코드·명칭 확인');
  if(lines.some(r=>r.salesName.includes('유기농')))issues.push('유기농 홍화씨 보류');
  if(new Set(lines.map(r=>r.sku+':'+r.role)).size!==lines.length)issues.push('같은 세트의 단품코드·구분 중복 · 한 행으로 합산');
  if(lines.some(r=>rows.some(other=>other.sku===r.sku&&other.unit&&r.unit&&other.unit!==r.unit)))issues.push('같은 단품코드는 세트별로 동일한 단위를 사용하세요.');
  if(lines.some(r=>!r.sku||r.sku===code))issues.push('단품코드 확인 · 세트코드를 단품에 입력할 수 없음');
  if(lines.some(r=>!r.name||!['본품','사은품'].includes(r.role)))issues.push('단품명·본품/사은품 구분 입력');
  if(lines.some(r=>!/^\d+$/.test(r.quantity)||Number(r.quantity)<1||Number(r.quantity)>1000000))issues.push('단품수량은 1~1,000,000 정수 입력');
  if(lines.some(r=>!['개','박스','병','포','EA'].includes(r.unit)))issues.push('단위 선택');
  if(lines.some(r=>r.confirmed!=='확정'))issues.push('모든 단품의 확인여부를 확정으로 선택');
  return {code,name:choice?.name||lines[0].salesName,lines,issues};
 });
}
export function applySetContents(finance:Finance,d:Record<string,unknown>,_items:Item[],actor:string,now:string,uuid:()=>string):Logistics{
 if(d.confirmComplete!==true)throw new LogisticsError('세트에 들어가는 본품·사은품 전체와 수량·단위를 확인하세요.');
 const day=text(d.effectiveFrom,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!actualDateTime(day,'00:00'))throw new LogisticsError('구성수량 적용 시작 방송일을 확인하세요.');
 const reviewed=reviewSetContents(finance,d.rows);
 if(!Array.isArray(d.selectedCodes)||!d.selectedCodes.length||new Set(d.selectedCodes).size!==d.selectedCodes.length)throw new LogisticsError('확인된 세트를 선택하세요.');
 const selected=d.selectedCodes.map(code=>{const g=reviewed.find(g=>g.code===code);if(!g||g.issues.length)throw new LogisticsError(g?.issues.join(' · ')||'세트코드 확인');return g;});
 const l=structuredClone(finance.logistics!);if(!l)throw new LogisticsError('D열 세트코드를 먼저 연결하세요.');
 for(const g of selected){if(latestBom(l,g.code,day)?.shipmentMode!=='set')throw new LogisticsError(g.name+': 방송일에 유효한 완제품 세트 연결이 필요합니다.');
  (l.setContents??=[]).push({id:uuid(),compositionCode:g.code,effectiveFrom:day,createdAt:now,actor,lines:g.lines.map(r=>({sku:r.sku,name:r.name,role:r.role==='본품'?'product':'gift',quantity:Number(r.quantity),unit:r.unit}))});
 }return l;
}
