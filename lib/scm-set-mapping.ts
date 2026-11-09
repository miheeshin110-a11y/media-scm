import {applyLogisticsAction,emptyLogistics,LogisticsError,logisticsUnit,type Logistics} from './logistics.ts';
import {salesCompositionChoices} from './sales-compositions.ts';
import type {Finance} from './finance-model.ts';
import type {Item} from './scm-model.ts';
export type ScmSetMappingRow={configId:string;salesCode:string;salesName:string;setSku:string;setQuantity?:string;setSkuConfirmed?:boolean;extraSkus:string[];sourceRows:number[];sourceMode:string;use:string;review:string;note:string};
const str=(v:unknown,max=120)=>{if(typeof v!=='string'||v.length>max)throw new LogisticsError('매핑 파일의 텍스트 항목을 확인하세요.');return v.trim();};
export function reviewSetMappings(finance:Finance,raw:unknown){
 if(!Array.isArray(raw)||!raw.length||raw.length>1000)throw new LogisticsError('매핑 자료는 1~1,000개 구성으로 입력하세요.');
 const choices=salesCompositionChoices(finance),seen=new Set<string>();
 const rows=raw.map(value=>{
  if(!value||typeof value!=='object')throw new LogisticsError('매핑 행을 확인하세요.');
  const r=value as ScmSetMappingRow;
  const row={configId:str(r.configId,80),salesCode:str(r.salesCode,80),salesName:str(r.salesName),setSku:str(r.setSku,80),sourceMode:str(r.sourceMode,30),use:str(r.use,30),review:str(r.review,30),note:str(r.note,500),extraSkus:[] as string[],sourceRows:[] as number[]};
  if(!row.configId||seen.has(row.configId))throw new LogisticsError('구성ID 누락 또는 중복입니다.');seen.add(row.configId);
  if(!Array.isArray(r.extraSkus)||r.extraSkus.length>30||!Array.isArray(r.sourceRows)||!r.sourceRows.length||r.sourceRows.length>31||r.sourceRows.some(n=>!Number.isInteger(n)||n<7||n>1006))throw new LogisticsError('추가 출고코드와 원본 행을 확인하세요.');
  row.extraSkus=r.extraSkus.map(s=>str(s,80));row.sourceRows=r.sourceRows;
  const setQuantity=r.setQuantity===undefined?'':str(r.setQuantity,12);
  if(r.setSkuConfirmed!==undefined&&typeof r.setSkuConfirmed!=='boolean')throw new LogisticsError('세트 코드 확인 선택을 확인하세요.');
  const option=choices.find(c=>c.code===row.salesCode),issues:string[]=[];
  if(!option||option.name.normalize('NFKC')!==row.salesName.normalize('NFKC'))issues.push('앱 판매구성 코드·명칭 확인 필요');
  if(!row.setSku)issues.push('완제품 세트 코드 미입력');
  if(row.extraSkus.length&&r.setSkuConfirmed!==true)issues.push('출고코드 여러 개 · 완제품 세트 코드 한 개로 확정 필요');
  if(setQuantity&&!/^[1-9]\d{0,5}$/.test(setQuantity))issues.push('세트 출고수량은 1~999,999 정수');
  if(row.sourceMode!=='세트 SKU')issues.push('세트 SKU 출고 방식 확인 필요');
  if(row.use==='사용중지'||row.use==='미사용')issues.push('사용중지 구성');
  const sku=finance.logistics?.skus.find(s=>s.code===row.setSku);
  if(sku&&logisticsUnit(finance.logistics!,sku.code)!=='세트')issues.push('기존 물류코드의 단위와 불일치');
  return {...row,setQuantity,setSkuConfirmed:r.setSkuConfirmed===true,issues};
 });
 for(const row of rows){
  if(!row.setQuantity&&rows.some(other=>other.configId!==row.configId&&other.setSku===row.setSku&&other.salesCode!==row.salesCode))row.issues.push('같은 출고코드가 다른 판매구성에 반복 · 출고 배수 직접 확인 필요');
  if(rows.some(other=>other.configId!==row.configId&&other.salesCode===row.salesCode))row.issues.push('같은 판매구성의 구성ID 중복');
 }
 return rows;
}
export function applyScmSetMappings(finance:Finance,data:Record<string,unknown>,items:Item[],actor:string,now:string,uuid:()=>string):Logistics{
 if(data.confirmSet!==true)throw new LogisticsError('본품·사은품 포함 완제품 세트 SKU와 주문당 출고 세트수를 확인하세요.');
 if(typeof data.effectiveFrom!=='string'||!data.effectiveFrom)throw new LogisticsError('적용 시작 방송일이 확정된 구성만 연결하세요.');
 const reviewed=reviewSetMappings(finance,data.rows);
 if(!Array.isArray(data.selectedIds)||!data.selectedIds.length||data.selectedIds.length>1000||new Set(data.selectedIds).size!==data.selectedIds.length)throw new LogisticsError('연결할 구성을 선택하세요.');
 const selected=data.selectedIds.map(id=>{const row=reviewed.find(r=>r.configId===id);if(!row||row.issues.length)throw new LogisticsError((row?.salesName||'선택한 구성')+': '+(row?.issues.join(' · ')||'구성ID 확인 필요'));return row;});
 let l=structuredClone(finance.logistics||emptyLogistics());
 for(const row of selected){
  if(!l.skus.some(s=>s.code===row.setSku))l=applyLogisticsAction(l,{op:'sku',code:row.setSku,name:'완제품 세트 '+row.setSku,unit:'세트'},items,actor,now,uuid);
  l=applyLogisticsAction(l,{op:'bom',compositionCode:row.salesCode,lines:[{sku:row.setSku,role:'product',quantity:Number(row.setQuantity||1)}],shipmentMode:'set',effectiveFrom:data.effectiveFrom,sourceConfigId:row.configId},items,actor,now,uuid);
 }
 return l;
}
