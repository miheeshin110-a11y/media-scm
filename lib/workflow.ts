import {duplicatePplErrors} from './ppl-duplicates.ts';
import {actualDateTime,numberOrNull,unifiedResult,type Item,type Composition,type CostPlan,type PplLink} from './scm-model.ts';
export const reviewStates=['작성 중','검토 요청','보완 요청','검토 완료'] as const;
export const sides=['single','double'] as const;
export const sideName=(side:'single'|'double')=>side==='single'?'메인 구성':'서브 구성';
export const displayChannel=(value:string)=>value||'편성예정(미편성)';
export function compositions(item:Item){
 const make=(side:'single'|'double'):Composition=>{const s=item.result?.[side];return {enabled:side==='single'||Boolean(s&&[s.quantity,s.sellingPrice,s.actualShipment].some(x=>x&&x!=='0')),sku:'',units:'',unitCost:'',costDate:'',sellingPrice:s?.sellingPrice||'',commission:s?.commissionType==='비율'?s.commission:'',vatBasis:s?.vatBasis==='별도'?'별도':'포함',plannedQuantity:side==='single'?item.plannedQuantity||'':'',conversionRate:item.rate||''};};
 return item.compositions||{single:make('single'),double:make('double')};
}
export function costPlan(item:Item):CostPlan{return item.costPlan||{adCost:item.result?.adCost||'',guestCost:item.result?.guestCost||'',administrationCost:item.result?.administrationCost||'0',otherCost:item.result?.otherCost||'',shippingRate:'',shippingBasis:'',shippingCount:'',quantityRounding:'',moneyRounding:'',pplProcessingMonth:''};}
export function editingItem(item:Item):Item{return {...item,workflow:item.workflow||'작성 중',status:item.status==='취소'?'취소':item.status==='편성확정'||item.status==='방송완료'?'편성확정':'',compositions:compositions(item),costPlan:costPlan(item),shortItem:item.item};}
export function linksOf(item:Item):PplLink[]{return item.pplLinks?.length?item.pplLinks:item.ppl==='있음'?[{id:'legacy-'+item.id,pplId:'',program:item.program,kind:item.pplKind,date:'',time:'',channel:''}]:[];}
export function rounded(value:number,mode:string):number|null{return mode==='floor'?Math.floor(value):mode==='round'?Math.round(value):null;}
export function supplyPrice(c:Composition):number|null{const p=numberOrNull(c.sellingPrice),fee=numberOrNull(c.commission);return p===null||fee===null||p<0||fee<0||fee>100?null:p/(c.vatBasis==='포함'?1.1:1)*(1-fee/100);}
export function estimated(q:string,rate:string,mode:string):number|null{const n=numberOrNull(q),r=numberOrNull(rate);return n===null||r===null||n<0||r<0||r>100?null:rounded(n*r/100,mode);}
const sumKnown=(values:(number|null)[])=>values.some(v=>v===null)?null:values.reduce<number>((a,v)=>a+v!,0);
// Order value uses the selling price before commission and shipment conversion.
// Preserve the existing reporting column's VAT-exclusive meaning.
export function orderCalculation(item:Item){
 const c=compositions(item),r=unifiedResult(item.result),rounding=costPlan(item).moneyRounding||'round';
 const lines=Object.fromEntries(sides.map(side=>{
  const price=numberOrNull(c[side].sellingPrice),quantity=numberOrNull(r[side].quantity);
  const amount=!c[side].enabled||quantity===0?0:quantity===null||quantity<0||!Number.isInteger(quantity)||price===null||price<0?null:quantity*price;
  const net=amount===null?null:c[side].vatBasis==='포함'?amount*10/11:amount;
  const gross=amount===null?null:c[side].vatBasis==='별도'?amount*11/10:amount;
  return [side,{amount,net,gross}];
 })) as Record<'single'|'double',{amount:number|null;net:number|null;gross:number|null}>;
 const total=(key:'net'|'gross')=>{const sum=sumKnown(sides.map(side=>lines[side][key]));return sum===null?null:rounded(sum,rounding);};
 return {lines,net:total('net'),gross:total('gross'),rounding};
}
export function costCalculation(item:Item){
 const c=compositions(item),p=costPlan(item),r=unifiedResult(item.result);
 const shipments=Object.fromEntries(sides.map(side=>[side,c[side].enabled?estimated(r[side].quantity,r[side].conversionRate,p.quantityRounding):0])) as Record<'single'|'double',number|null>;
 const grossGoods=sumKnown(sides.map(side=>{if(!c[side].enabled||shipments[side]===0)return 0;const unit=numberOrNull(c[side].unitCost),units=numberOrNull(c[side].units);return shipments[side]===null||unit===null||units===null?null:shipments[side]!*unit*units;}));
 const netSales=sumKnown(sides.map(side=>{if(!c[side].enabled||shipments[side]===0)return 0;const price=supplyPrice(c[side]);return shipments[side]===null||price===null?null:shipments[side]!*price;}));
 const shipmentTotal=sumKnown(Object.values(shipments));
 const shippingCount=p.shippingBasis==='sets'?shipmentTotal:p.shippingBasis==='manual'?numberOrNull(p.shippingCount):null;
 const shippingRate=numberOrNull(p.shippingRate);
 const grossShipping=shippingCount===0?0:shippingCount===null||shippingRate===null?null:shippingCount*shippingRate;
 const gifts=(item.gifts||[]).map(g=>{const q=g.side==='both'?shipmentTotal:shipments[g.side],units=numberOrNull(g.units),unit=numberOrNull(g.unitCost);return !g.item?null:q===0?0:q===null||q===undefined||units===null||unit===null?null:q*units*unit;});
 const round=(n:number|null)=>n===null?null:rounded(n,p.moneyRounding);
 const goodsCost=round(grossGoods),shippingCost=round(grossShipping),giftCost=round(sumKnown(gifts)),revenue=round(netSales);
 const pplCost=item.ppl==='없음'?0:numberOrNull(item.allocationManaged?item.allocation:r.pplCost||item.allocation);
 const totalCost=sumKnown([goodsCost,shippingCost,giftCost,pplCost,...[p.adCost,p.guestCost,p.administrationCost,p.otherCost].map(numberOrNull)]);
 return {shipments,shipmentTotal,shippingCount,goodsCost,shippingCost,giftCost,revenue,pplCost,totalCost,profit:revenue===null||totalCost===null?null:revenue-totalCost};
}
// Compute from input values on both server and client. Missing data never becomes a zero profit.
export function computedItem(item:Item):Item{
 if(item.result?.orderAmountMode==='auto'){
  const amount=orderCalculation(item).net,c=compositions(item),r={...item.result};
  for(const side of sides)r[side]={...r[side],sellingPrice:c[side].sellingPrice,vatBasis:c[side].vatBasis};
  item={...item,result:{...r,orderAmount:amount===null?'':String(amount)}};
 }
 if(item.calculationMode!=='auto'||!item.result)return item;
 const c=compositions(item),p=costPlan(item),m=costCalculation(item),r=unifiedResult(item.result),value=(n:number|null)=>n===null?'':String(n);
 for(const side of sides){const s=c[side];r[side]={...r[side],sellingPrice:s.sellingPrice,vatBasis:s.vatBasis,commission:s.commission,commissionType:'비율',supplyPrice:value(supplyPrice(s))};}
 return {...item,result:{...r,pplCost:value(m.pplCost),adCost:p.adCost,guestCost:p.guestCost,administrationCost:p.administrationCost,otherCost:value(sumKnown([numberOrNull(p.otherCost),m.giftCost])),shippingCost:value(m.shippingCost),goodsCost:value(m.goodsCost),profit:value(m.profit)}};
}
export function missingForReview(item:Item):string[]{
 if(item.status==='취소')return item.cancelReason?.trim()?[]:['취소 사유'];
 const missing:string[]=[];
 if(!item.owner.trim())missing.push('담당자');
 if(!item.channel)missing.push('홈쇼핑 채널');
 if(!actualDateTime(item.date,item.time))missing.push('편성일·시간');
 if(item.status!=='편성확정')missing.push('편성확정 여부');
 if(item.ppl==='미정')missing.push('PPL 여부');
 if(item.ppl==='있음'){
  const links=linksOf(item);if(!links.length)missing.push('PPL 연결');
  links.forEach((l,i)=>{for(const [key,label] of [['channel','채널'],['program','프로그램'],['agencyId','청약사'],['kind','송출구분']] as const)if(!l[key])missing.push(`PPL ${i+1} ${label}`);if(['재방','스페셜'].includes(l.kind)&&!l.originalDate)missing.push(`PPL ${i+1} 본방일`);});
  if(!item.allocationManaged)missing.push('계약·방송별 배분');
 }
 for(const key of ['target','hsTarget','businessProfitTarget'] as const)if(numberOrNull(item[key])===null)missing.push(({target:'주문 목표',hsTarget:'홈쇼핑 목표',businessProfitTarget:'이익 목표'})[key]);
 const c=compositions(item),p=costPlan(item);
 for(const side of sides)if(c[side].enabled){if(!c[side].sku||!c[side].units||!c[side].plannedQuantity||c[side].conversionRate==='')missing.push(sideName(side)+' SKU·구성·계획수량·전환율');if(supplyPrice(c[side])===null)missing.push(sideName(side)+' 판매가·수수료율');}
 if(!p.quantityRounding)missing.push('수량 소수점 처리');
 if(item.result&&item.calculationMode==='auto'&&costCalculation(item).profit===null)missing.push('방송결과 자동계산에 필요한 수량·비용');
 return missing;
}
export function validateWorkflow(item:Item):string[]{
 const errors:string[]=duplicatePplErrors(item);
 if(item.result?.orderAmountMode!==undefined&&item.result.orderAmountMode!=='auto')errors.push('주문금액 계산 방식을 확인해 주세요.');
 if(item.pplLinks&&item.pplLinks.length>20)errors.push('PPL 연결은 방송당 20개까지 등록 가능합니다.');
 if(item.calculationMode&&!['auto','legacy'].includes(item.calculationMode))errors.push('계산 방식을 확인해 주세요.');
 for(const key of ['reviewNote','cancelReason','replacesId','calendarMonth'] as const)if(item[key]!==undefined&&(typeof item[key]!=='string'||item[key]!.length>2000))errors.push('입력 내용의 길이와 형식을 확인해 주세요.');
 if(item.workflow&&!reviewStates.includes(item.workflow))errors.push('검토 상태를 확인해 주세요.');
 if(!['있음','없음','미정'].includes(item.ppl))errors.push('PPL 여부를 확인해 주세요.');
 if(item.workflow&&!['','편성확정','취소'].includes(item.status))errors.push('방송 상태를 확인해 주세요.');
 if(item.workflow&&item.status==='편성확정'&&(!item.channel||!actualDateTime(item.date,item.time)))errors.push('편성확정에는 채널·편성일·시간이 필요합니다. 미정이면 편성확정을 해제하세요.');
 if(item.status==='취소'&&!item.cancelReason?.trim())errors.push('취소 사유를 입력해 주세요.');
 if(item.replacesId===item.id)errors.push('자기 자신을 원래 방송으로 연결할 수 없습니다.');
 const numeric=(v:unknown,label:string,max=1e12,integer=false)=>{if(v===''||v===undefined)return;const n=numberOrNull(v);if(n===null||n<0||n>max||(integer&&!Number.isInteger(n)))errors.push(label+' 값을 확인해 주세요.');};
 for(const [key,label] of [['calendarMonth','캘린더 표시월']] as const)if(item[key]&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(item[key]!))errors.push(label+'을 확인해 주세요.');
 if(item.compositions){for(const side of sides){const c=item.compositions[side];if(!c||typeof c.enabled!=='boolean')return ['구성 정보를 확인해 주세요.'];for(const k of ['sku','units','unitCost','costDate','sellingPrice','commission','vatBasis','plannedQuantity','conversionRate'] as const)if(typeof c[k]!=='string')return ['구성 입력 형식을 확인해 주세요.'];if(!['포함','별도'].includes(c.vatBasis))errors.push('판매가 부가세 기준을 확인해 주세요.');for(const k of ['units','plannedQuantity'] as const)numeric(c[k],sideName(side),1e9,true);for(const k of ['unitCost','sellingPrice'] as const)numeric(c[k],sideName(side));for(const k of ['commission','conversionRate'] as const)numeric(c[k],sideName(side),100);if(c.costDate&&!actualDateTime(c.costDate,'00:00'))errors.push('원가 기준일을 확인해 주세요.');}}
 if(item.costPlan){const p=item.costPlan;for(const k of ['adCost','guestCost','administrationCost','otherCost','shippingRate','shippingCount'] as const)numeric(p[k],k);if(!['','sets','manual'].includes(p.shippingBasis)||!['','floor','round'].includes(p.quantityRounding)||!['','floor','round'].includes(p.moneyRounding))errors.push('계산 기준을 확인해 주세요.');if(p.pplProcessingMonth&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.pplProcessingMonth))errors.push('PPL 비용처리월을 확인해 주세요.');}
 if(item.gifts){if(!Array.isArray(item.gifts)||item.gifts.length>10)return ['사은품은 10개까지 등록 가능합니다.'];for(const g of item.gifts){if(!g||!['single','double','both'].includes(g.side)||typeof g.item!=='string'||typeof g.id!=='string')return ['사은품 입력을 확인해 주세요.'];numeric(g.units,'사은품 지급수량',1e9,true);numeric(g.unitCost,'사은품 원가');}}
 for(const link of item.pplLinks||[]){if(link.kind&&!['본방','재방','스페셜'].includes(link.kind))errors.push('PPL 송출 구분을 확인해 주세요.');if(link.date&&!actualDateTime(link.date,'00:00'))errors.push('PPL 송출일을 확인해 주세요.');if(link.time&&!actualDateTime(link.date||'2026-01-01',link.time))errors.push('PPL 송출시간을 확인해 주세요.');if(link.originalDate&&!actualDateTime(link.originalDate,'00:00'))errors.push('PPL 본방일을 확인해 주세요.');if(link.date&&link.originalDate&&link.originalDate>link.date)errors.push('본방일이 재방·스페셜 송출일보다 늦습니다.');}
 if(item.workflow==='검토 완료')errors.push(...missingForReview(item).map(x=>x+' 확인 후 검토를 완료해 주세요.'));
 return [...new Set(errors)];
}
