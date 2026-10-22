'use client';
import type {Item} from '@/lib/scm-model';
import {mainBreakEven} from '@/lib/break-even';
import {Value,show} from './entry-fields';
export function BreakEvenPanel({item}:{item:Item}){
 const b=mainBreakEven(item);
 return <section className="sale-card" aria-label="메인구성 100% BEP"><h3>손익분기점(BEP) · 메인구성 100%</h3><p className="result-note">메인 구성만 판매한다고 가정한 계획 기준입니다. 메인 계획 예상 전환율을 적용하며, 실제 주문실적과 계획수량은 변경하지 않습니다.</p>
 {b.status==='ready'?<><div className="result-grid"><Value label="필요 주문금액 · VAT 제외" value={show(b.net,'원')}/><Value label="필요 주문금액 · VAT 포함" value={show(b.gross,'원')}/><Value label="최소 주문수량 · 전환 전" value={show(b.orders,' 세트')}/><Value label="해당 예상 출고수량" value={show(b.shipments,' 세트')}/></div><p className="result-note">예상 전환율 {b.rate}% · 해당 수량의 예상 이익 {show(b.profit,'원')}. 선택한 수량·금액 처리 기준에서 이익이 0원 이상이 되는 최소 주문수량입니다.</p></>:<div className="finance-save-feedback"><strong>{b.status==='missing'?'계산에 필요한 항목':'BEP 산출 불가'}</strong><ul>{b.issues.map(s=><li key={s}>{s}</li>)}</ul></div>}
 <details className="ppl-extra"><summary>계산 기준 보기</summary><p className="result-note">출고 1세트당 남는 금액 = 수수료·부가세를 반영한 메인 공급단가 − 상품원가 − 배송비 − 메인/공통 사은품비. 이 금액으로 PPL 배분액·정액 방송비·게스트비·판관비·기타 고정비를 회수합니다. 서브 전용 사은품은 제외합니다.</p><p className="result-note">고정비 {show(b.fixed,'원')} · 출고 1세트당 남는 금액 {show(b.contribution,'원')} (원 단위 처리 전). 없는 비용은 0을 입력하세요.</p></details></section>;
}
