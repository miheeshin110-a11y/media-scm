import {appliedUnitCost} from './cost-history.ts';
import {newResult,numberOrNull,type Item} from './scm-model.ts';
import {compositions,costPlan,costCalculation,orderCalculation,sides,sideName,supplyPrice} from './workflow.ts';

// A disposable planning scenario: actual orders, conversion rates and result costs
// must never be substituted for missing plan inputs or written back to the item.
export function planCalculation(item:Item){
 const planOnly={...item,result:undefined};
 const c=compositions(planOnly),p=costPlan(planOnly),result=newResult();
 for(const side of sides){
  const quantity=numberOrNull(c[side].plannedQuantity),rate=numberOrNull(c[side].conversionRate);
  result[side]={...result[side],quantity:quantity!==null&&quantity>=0&&quantity<=1e9&&Number.isInteger(quantity)?c[side].plannedQuantity:'',conversionRate:rate!==null&&rate>=0&&rate<=100?c[side].conversionRate:''};
 }
 const scenario:Item={...item,compositions:c,costPlan:p,result,...(item.ppl==='미정'?{allocation:''}:{})};
 const orders=orderCalculation(scenario),costs=costCalculation(scenario);
 // Order value already defaults to round. Supply revenue remains visible without
 // a cost rounding policy, but profit still requires the explicit cost policy.
 let revenue=costCalculation({...scenario,costPlan:{...p,moneyRounding:orders.rounding}}).revenue;
 const missing:string[]=[];
 const need=(value:string|undefined,label:string)=>{if(numberOrNull(value)===null)missing.push(label)};
 for(const side of sides){
  const line=c[side],prefix=sideName(side)+' ';
  if(!line.enabled)continue;
  if(!result[side].quantity)missing.push(prefix+'계획 주문수량');
  if(!result[side].conversionRate)missing.push(prefix+'예상 전환율');
  if(costs.shipments[side]!==0){
   if(supplyPrice(line)===null)missing.push(prefix+'판매가·수수료율');
   need(appliedUnitCost(line),prefix+'단위원가');need(line.units,prefix+'세트당 상품 수량');
  }
 }
 if(!p.quantityRounding)missing.push('수량 소수점 처리');
 if(!p.moneyRounding)missing.push('금액 원 단위 처리');
 if(!p.shippingBasis)missing.push('배송비 산정 기준');
 if(p.shippingBasis==='manual')need(p.shippingCount,'배송 건수');
 if(costs.shippingCount!==0)need(p.shippingRate,'배송단가');
 for(const [field,label] of [['adCost','홈쇼핑 정액 방송비·광고비'],['guestCost','게스트 비용'],['administrationCost','판관비'],['otherCost','기타 고정비용']] as const)need(p[field],label);
 for(const [index,gift] of (item.gifts||[]).entries()){
  const count=gift.side==='both'?costs.shipmentTotal:costs.shipments[gift.side];
  if(!gift.item.trim())missing.push(`사은품 ${index+1} 아이템`);
  if(count!==0){need(gift.units,`사은품 ${index+1} 지급수량`);need(appliedUnitCost(gift),`사은품 ${index+1} 단위원가`);}
 }
 if(item.ppl==='미정')missing.push('PPL 여부');
 else if(item.ppl==='있음')need(item.allocation,'PPL 배분금액');
 const safe=(value:number|null)=>value===null||!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER?null:value;
 const monetaryKeys=['goodsCost','shippingCost','giftCost','revenue','pplCost','totalCost','profit'] as const;
 const overflow=[orders.net,orders.gross,revenue,...monetaryKeys.map(k=>costs[k])].some(v=>v!==null&&safe(v)===null);
 if(overflow){
  orders.net=safe(orders.net);orders.gross=safe(orders.gross);revenue=safe(revenue);
  for(const side of sides)for(const key of ['amount','net','gross'] as const)orders.lines[side][key]=safe(orders.lines[side][key]);
  for(const key of monetaryKeys)costs[key]=safe(costs[key]);
  costs.totalCost=null;costs.profit=null;missing.push('계획 금액이 계산 가능한 범위를 초과했습니다. 수량·판매가·비용을 확인하세요.');
 }
 return {orders,revenue,costs,missing:[...new Set(missing)]};
}
