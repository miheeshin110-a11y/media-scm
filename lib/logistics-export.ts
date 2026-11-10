import {actualDateTime,type Item} from './scm-model.ts';
import {compositions,costPlan} from './workflow.ts';
import {compositionLabel} from './sales-compositions.ts';
import {latestBom,logisticsUnit,stockBomLines,type Logistics} from './logistics.ts';
import {latestSetContents} from './set-contents.ts';
import {logisticsOutlook} from './logistics-outlook.ts';
export type LogisticsExportRow={broadcastId:string;version:number;date:string;time:string;channel:string;item:string;composition:string;compositionCode:string;role:string;sku:string;name:string;unit:string;requested:number|null;perSet:number|null;rate:number|null;prepare:number|null;expected:number|null;note:string};
export type LogisticsExportIssue={broadcastId:string;version:number;date:string;item:string;composition:string;reason:string};
const held=(code:string,name:string)=>['DT00212','DT00213','V00100110'].includes(code)||(name.includes('홍화씨')&&name.includes('유기농'));
const sum=(a:number|null,b:number|null)=>a===null||b===null||!Number.isSafeInteger(a+b)||a+b>1e15?null:a+b;
export function logisticsExport(items:Item[],l:Logistics){
 const rows:LogisticsExportRow[]=[],issues:LogisticsExportIssue[]=[];
 for(const item of [...items].sort((a,b)=>(a.date+a.time+a.id).localeCompare(b.date+b.time+b.id))){
  const addIssue=(composition:string,reason:string)=>issues.push({broadcastId:item.id,version:item.version||0,date:item.date||'',item:item.item||'',composition,reason});
  if(item.status==='취소'){addIssue('전체','취소 방송 · 수량 전달에서 제외');continue;}
  if(held('',item.item||'')){addIssue('전체','유기농 홍화씨 보류 · 수량 전달에서 제외');continue;}
  if(!actualDateTime(item.date,item.time)){addIssue('전체','방송일·시간 확인 필요 · 수량 전달에서 제외');continue;}
  const cs=compositions(item);let enabled=false;
  for(const side of ['single','double'] as const){
   const c=cs[side];if(!c.enabled)continue;enabled=true;
   const name=(side==='single'?'메인':'서브')+' · '+compositionLabel(c);
   if(held(c.sku,compositionLabel(c))||held('',item.item||'')){addIssue(name,'유기농 홍화씨 보류 · 수량 전달에서 제외');continue;}
   const bom=latestBom(l,c.sku,item.date);
   if(!bom){addIssue(name,'상품·사은품 구성표 확인 필요 · 수량 산출 불가');continue;}
   const expanded=stockBomLines(l,bom,item.date),contents=bom.shipmentMode==='set'?latestSetContents(l,c.sku,item.date):undefined;
   if(expanded.lines.some(r=>held(r.sku,''))){addIssue(name,'유기농 홍화씨가 포함된 구성 보류 · 수량 전달에서 제외');continue;}
   if(!expanded.lines.length){addIssue(name,expanded.issues.join(' · ')||'구성수량 확인 필요');continue;}
   const scoped={...item,compositions:{single:{...cs.single,enabled:side==='single'},double:{...cs.double,enabled:side==='double'}}};
   const o=logisticsOutlook(scoped,l),line=o.lines[0],notes=[...new Set([...o.issues,...o.componentIssues])];
   for(const note of notes)addIssue(name,note);
   for(const component of expanded.lines){
    const quantity=o.requirements.find(r=>r.sku===component.sku&&r.role===component.role),detail=contents?.lines.find(r=>r.sku===component.sku&&r.role===component.role),master=l.skus.find(s=>s.code===component.sku);
    const prepare=expanded.issues.length?null:quantity?.prepare??null,expected=expanded.issues.length?null:quantity?.expected??null;
    const perSet=Number.isSafeInteger(component.quantity)?component.quantity:null;
    rows.push({broadcastId:item.id,version:item.version||0,date:item.date,time:item.time,channel:item.channel||'',item:item.item||'',composition:name,compositionCode:c.sku,role:component.role==='gift'?'사은품':'본품',sku:component.sku,name:detail?.name||master?.name||component.sku,unit:detail?.unit||logisticsUnit(l,component.sku),requested:line?.requested??null,perSet,rate:line?.rate??null,prepare,expected,note:[...notes,...(prepare===null?['준비수량 미확인']:[]),...(expected===null?['예상출고수량 미확인']:[])].filter((v,i,a)=>a.indexOf(v)===i).join(' · ')});
   }
  }
  if(!enabled)addIssue('전체','사용하는 판매구성 없음');
 }
 const totals=new Map<string,{sku:string;name:string;role:string;unit:string;prepare:number|null;expected:number|null;broadcasts:Set<string>;note:string}>();
 for(const r of rows){const key=JSON.stringify([r.sku,r.role,r.unit]),old=totals.get(key);
  if(old){old.prepare=sum(old.prepare,r.prepare);old.expected=sum(old.expected,r.expected);old.broadcasts.add(r.broadcastId);if(r.note)old.note='일부 방송 확인 필요';}
  else totals.set(key,{sku:r.sku,name:r.name,role:r.role,unit:r.unit,prepare:r.prepare,expected:r.expected,broadcasts:new Set([r.broadcastId]),note:r.note?'일부 방송 확인 필요':''});
 }
 return {rows,issues,totals:[...totals.values()].sort((a,b)=>(a.sku+a.role+a.unit).localeCompare(b.sku+b.role+b.unit)).map(t=>({...t,broadcasts:t.broadcasts.size,note:[t.note,...(t.prepare===null||t.expected===null?['미확인·한도 초과 수량은 합계를 확정하지 않음']:[]),...(issues.length?['확인 필요 시트의 제외·미확인 구성 확인']:[])].filter(Boolean).join(' · ')})),broadcastCount:new Set(rows.map(r=>r.broadcastId)).size,selectedCount:items.length,rounding:items.map(item=>({id:item.id,rounding:costPlan(item).quantityRounding}))};
}
