import {numberOrNull,newResult,type Item} from './scm-model.ts';
import {appliedUnitCost} from './cost-history.ts';
import {compositions,costPlan,costCalculation,estimated,orderCalculation,supplyPrice} from './workflow.ts';

export type BreakEven={status:'ready'|'missing'|'unreachable'|'limit';issues:string[];orders:number|null;shipments:number|null;net:number|null;gross:number|null;profit:number|null;contribution:number|null;fixed:number|null;rate:number|null};
const maxOrders=1e9;
// Planning scenario only: never change the recorded main/sub mix or actual results.
export function mainBreakEven(item:Item):BreakEven{
 const c=compositions(item),main=c.single,p=costPlan(item),issues:string[]=[];
 const out:BreakEven={status:'missing',issues,orders:null,shipments:null,net:null,gross:null,profit:null,contribution:null,fixed:null,rate:null};
 const read=(value:string|undefined,label:string,max=1e12)=>{const n=numberOrNull(value);if(n===null||n<0||n>max){issues.push(label);return 0;}return n;};
 if(!main.enabled)issues.push('메인 구성 사용');
 const price=read(main.sellingPrice,'메인 판매가');if(price===0&&!issues.includes('메인 판매가'))issues.push('0원보다 큰 메인 판매가');
 read(main.commission,'메인 수수료율',100);
 if(!['포함','별도'].includes(main.vatBasis))issues.push('메인 판매가 부가세 기준');
 const units=read(main.units,'메인 세트당 상품수량',1e9);if(units===0||!Number.isInteger(units))issues.push('메인 세트당 상품수량은 1 이상의 정수');
 const unitCost=read(appliedUnitCost(main),'메인 상품 단위원가');
 const rate=read(main.conversionRate,'메인 계획 예상 전환율',100);
 const shipping=read(p.shippingRate,'배송단가');
 if(p.shippingBasis!=='sets')issues.push('BEP 배송 기준: 예상출고 1세트 = 배송 1건 (별도 입력 배송 건수로는 주문 증가에 따른 배송비 계산 불가)');
 if(!['floor','round'].includes(p.quantityRounding))issues.push('수량 소수점 처리 기준');
 if(!['floor','round'].includes(p.moneyRounding))issues.push('금액 원 단위 처리 기준');
 let fixed=0;
 for(const [k,label] of [['adCost','홈쇼핑 정액 방송비'],['guestCost','게스트 비용'],['administrationCost','판관비'],['otherCost','기타 고정비']] as const)fixed+=read(p[k],label);
 let ppl=0;
 if(item.ppl==='있음')ppl=read(item.allocationManaged?item.allocation:item.result?.pplCost||item.allocation,'방송에 배분된 PPL 비용');
 else if(item.ppl!=='없음')issues.push('PPL 여부·배분금액 확정');
 fixed+=ppl;
 const gifts=(item.gifts||[]).filter(g=>g.side==='single'||g.side==='both');
 let giftPerSet=0;
 for(const [i,g] of gifts.entries()){
  if(!g.item.trim())issues.push(`메인 사은품 ${i+1} 아이템`);
  const count=read(g.units,`메인 사은품 ${i+1} 지급수량`,1e9);
  if(!Number.isInteger(count))issues.push(`메인 사은품 ${i+1} 지급수량은 정수`);
  giftPerSet+=count*read(appliedUnitCost(g),`메인 사은품 ${i+1} 단위원가`);
 }
 if(issues.length)return {...out,issues:[...new Set(issues)]};
 const supply=supplyPrice(main)!,contribution=supply-unitCost*units-shipping-giftPerSet;
 const base={...out,contribution,fixed,rate};
 const scenario:Item={...item,compositions:{single:{...main,enabled:true},double:{...c.double,enabled:false}},costPlan:p,gifts,result:{...newResult(),pplCost:String(ppl)}};
 const shipments=(q:number)=>estimated(String(q),String(rate),p.quantityRounding)!;
 const evaluate=(q:number)=>{
  scenario.result!.single={...scenario.result!.single,quantity:String(q),conversionRate:String(rate)};
  return costCalculation(scenario);
 };
 const answer=(q:number):BreakEven=>{const calc=evaluate(q),order=orderCalculation(scenario);return {...base,status:'ready',orders:q,shipments:calc.shipmentTotal,profit:calc.profit,net:order.net,gross:order.gross};};
 if(fixed===0)return answer(0);
 if(rate===0||contribution<=0)return {...base,status:'unreachable',issues:[rate===0?'예상 전환율이 0%여서 고정비를 회수할 수 없습니다.':'메인 1세트를 출고할 때 남는 금액이 0원 이하입니다. 판매조건·변동비를 확인하세요.']};
 // Separate rounding of revenue and three variable costs can move profit by <4 won.
 // Start below that boundary and examine attainable shipment counts, not every order.
 const maxShipments=shipments(maxOrders);
 const probeShipments=Math.min(maxShipments,Math.ceil((fixed+4)/contribution)+2);
 const scale=fixed+Math.max(1,supply,unitCost*units,shipping,giftPerSet)*probeShipments;
 if(!Number.isFinite(scale)||scale>Number.MAX_SAFE_INTEGER)return {...base,status:'limit',issues:['입력 금액이 계산 가능한 범위를 초과했습니다.']};
 const tolerance=4+Number.EPSILON*scale*8;
 const lower=Math.max(0,Math.ceil((fixed-tolerance)/contribution));
 const firstOrder=(target:number)=>{
  if(target>maxShipments)return null;
  let lo=0,hi=maxOrders;
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(shipments(mid)>=target)hi=mid;else lo=mid+1;}
  return lo;
 };
 let q=firstOrder(lower);
 for(let tries=0;q!==null&&tries<10000;tries++){
  const calc=evaluate(q);
  if(calc.profit!==null&&calc.profit>=0){const result=answer(q);if([result.net,result.gross,calc.totalCost,calc.revenue].some(v=>v===null||!Number.isFinite(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER))break;return result;}
  q=firstOrder(shipments(q)+1);
 }
 return {...base,status:'limit',issues:['계산 범위 내에서 BEP를 확정하지 못했습니다. 매우 낮은 전환율·마진 또는 큰 금액을 확인하세요.']};
}
