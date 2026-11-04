'use client';
import type {Item} from '@/lib/scm-model';
import {planCalculation} from '@/lib/plan-calculation';
import {Value,show} from './entry-fields';

export function PlanSummary({item}:{item:Item}){
 const plan=planCalculation(item),money=(value:number|null)=>value===null?'미산출':show(value,'원');
 return <section className="sale-card" aria-label="수량 기준 계획 금액" aria-live="polite">
  <h3>수량 기준 계획 금액 · 자동계산</h3>
  <p className="result-note">메인·서브 계획 수량을 합산합니다. 아래 계획값은 직접 입력한 목표금액과 방송결과를 변경하지 않습니다.</p>
  <div className="result-grid">
   <Value label="계획 주문금액 · VAT 포함" value={money(plan.orders.gross)}/>
   <Value label="계획 주문금액 · VAT 제외" value={money(plan.orders.net)}/>
   <Value label="계획 예상출고" value={plan.costs.shipmentTotal===null?'미산출':show(plan.costs.shipmentTotal,' 세트')}/>
   <Value label="계획 예상 공급매출 · VAT 제외" value={money(plan.revenue)}/>
   <Value label="계획 총비용 · VAT 제외" value={money(plan.costs.totalCost)}/>
   <Value label="계획 예상이익 · VAT 제외" value={money(plan.costs.profit)}/>
  </div>
  <p className="result-note">주문금액 = 계획 주문수량 × 판매가. 공급매출 = 계획 예상출고 × 수수료 반영 공급단가. 이익 = 공급매출 − 상품·사은품·배송·PPL·방송비용 등.</p>
  {!item.costPlan?.moneyRounding&&<p className="result-note">주문금액·공급매출은 기본 반올림으로 표시합니다. 이익 산출에는 방송비용의 금액 원 단위 처리 기준도 필요합니다.</p>}
  {plan.costs.profit===null&&<div className="finance-save-feedback"><strong>계획 예상이익 미산출</strong><p>원가·비용과 계산 기준이 모두 입력되면 표시됩니다. 발생하지 않는 비용은 0을 입력하세요.</p><details><summary>확인할 항목 {plan.missing.length}개</summary><ul>{plan.missing.map(label=><li key={label}>{label}</li>)}</ul></details></div>}
  <details className="ppl-extra"><summary>계획 비용 내역</summary><div className="result-grid">{([['상품원가',plan.costs.goodsCost],['사은품비',plan.costs.giftCost],['배송비',plan.costs.shippingCost],['PPL 배분금액',plan.costs.pplCost]] as const).map(([label,value])=><Value key={label} label={label+' · VAT 제외'} value={money(value)}/>)}</div><p className="result-note">방송에 저장한 적용 원가와 방송비용 기준을 사용합니다. 배송 건수를 별도로 입력하는 경우 방송비용에 저장된 배송 건수를 사용합니다. 방송결과의 주문·전환율·원가 입력값을 대신 사용하지 않습니다.</p></details>
 </section>;
}
