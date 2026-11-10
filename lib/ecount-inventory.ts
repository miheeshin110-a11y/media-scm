import {logisticsStockSkus,type Logistics} from './logistics.ts';
import {EcountError} from './ecount-client.ts';
export const ECOUNT_HELD='V00100110';
export function ecountInventoryRows(raw:Record<string,unknown>[],warehouse:string,l:Logistics){
 const catalog=logisticsStockSkus(l).filter(s=>/^V/i.test(s.code)&&s.code!==ECOUNT_HELD),seen=new Set<string>(),lines:{sku:string;name:string;unit:string;available:number}[]=[],issues:string[]=[];
 for(const r of raw){
  if(String(r.WH_CD)!==warehouse)throw new EcountError('format','지정 창고와 다른 재고가 포함되어 반영하지 않았습니다.');
  const sku=typeof r.PROD_CD==='string'?r.PROD_CD:'';const item=catalog.find(s=>s.code===sku);if(!item)continue;
  if(seen.has(sku))throw new EcountError('format','같은 품목의 중복 재고가 있어 반영하지 않았습니다.');seen.add(sku);
  const value=String(r.BAL_QTY??'');
  if(!/^\d+(?:\.0+)?$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>1e12){issues.push(sku+' · 음수·소수 또는 수량 형식 확인 필요');continue;}
  lines.push({sku,name:item.name,unit:item.unit,available:Number(value)});
 }
 const missing=catalog.filter(s=>!lines.some(r=>r.sku===s.code)).map(s=>s.code);
 return {lines,missing,issues};
}
export const ecountCatalogKey=(l:Logistics)=>JSON.stringify(logisticsStockSkus(l).filter(s=>/^V/i.test(s.code)&&s.code!==ECOUNT_HELD).map(s=>[s.code,s.unit]).sort());
