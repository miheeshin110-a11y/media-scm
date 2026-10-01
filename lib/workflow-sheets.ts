import type {Item} from './scm-model.ts';
import {compositions,costPlan,linksOf,costCalculation,estimated,supplyPrice,sideName,sides} from './workflow.ts';
export const workflowHeaders={
 'SCM_검토':['방송ID','버전','검토상태','검토메모','검토자','검토일시','취소사유','원래방송ID','캘린더표시월','계산방식'],
 'SCM_PPL연결':['연결ID','방송ID','PPL ID','채널','프로그램','청약사ID','송출구분','송출일','송출시간','원본본방일','원본PPL연결ID','계약내부ID'],
 'SCM_구성계획':['방송ID','구성','사용여부','SKU','세트당상품수량','상품단위원가','원가기준일','판매가','부가세기준','수수료율','공급단가','계획주문수량','예상전환율','계획예상출고'],
 'SCM_사은품':['사은품ID','방송ID','지급대상구성','아이템','세트당지급수량','단위원가'],
 'SCM_계산기준':['방송ID','광고비','게스트비','판관비','기타고정비','배송단가','배송기준','배송건수입력','수량소수점처리','금액소수점처리','PPL비용처리월','예상공급매출','예상배송건수','사은품비','총비용','예상이익금'],
} as const;
const n=(v:unknown)=>v===null||v===undefined||v===''?'':Number(v);
export function workflowRows(item:Item,rowId:number){
 const row=rowId+1,c=compositions(item),p=costPlan(item),m=costCalculation(item);
 const fixed=(name:keyof typeof workflowHeaders,start:number,rows:(string|number)[][],count=rows.length)=>{const width=workflowHeaders[name].length;while(rows.length<count)rows.push(Array(width).fill(''));return {range:`'${name}'!A${start}:${String.fromCharCode(64+width)}${start+count-1}`,values:rows};};
 return [
 fixed('SCM_검토',row,[[item.id,item.version||0,item.workflow||'작성 중',item.reviewNote||'',item.reviewedBy||'',item.reviewedAt||'',item.cancelReason||'',item.replacesId||'',item.calendarMonth||'',item.calculationMode||'legacy']]),
 fixed('SCM_PPL연결',(rowId-1)*20+2,(item.ppl==='있음'?linksOf(item):[]).map(l=>[l.id,item.id,l.pplId,l.channel,l.program,l.agencyId||'',l.kind,l.date,l.time,l.originalDate||'',l.originalPplId||'',l.contractRef||'']),20),
 fixed('SCM_구성계획',(rowId-1)*2+2,sides.map(s=>[item.id,sideName(s),c[s].enabled?'사용':'미사용',c[s].sku,n(c[s].units),n(c[s].unitCost),c[s].costDate,n(c[s].sellingPrice),c[s].vatBasis,n(c[s].commission),n(supplyPrice(c[s])),n(c[s].plannedQuantity),n(c[s].conversionRate),n(estimated(c[s].plannedQuantity,c[s].conversionRate,p.quantityRounding))])),
 fixed('SCM_사은품',(rowId-1)*10+2,(item.gifts||[]).map(g=>[g.id,item.id,g.side,g.item,n(g.units),n(g.unitCost)]),10),
 fixed('SCM_계산기준',row,[[item.id,n(p.adCost),n(p.guestCost),n(p.administrationCost),n(p.otherCost),n(p.shippingRate),p.shippingBasis,n(p.shippingCount),p.quantityRounding,p.moneyRounding,p.pplProcessingMonth,n(m.revenue),n(m.shippingCount),n(m.giftCost),n(m.totalCost),n(m.profit)]])
 ];
}
