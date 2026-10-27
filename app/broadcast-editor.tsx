'use client';
import {archiveMissing} from '@/lib/broadcast-archive';
import {usesActualClock} from '@/lib/broadcast-clock';
import {BreakEvenPanel} from './break-even-panel';
import {SalesCompositionSelect} from './sales-composition-select';
import type {Finance,FinanceAction} from '@/lib/finance-model';
import {actualDateTime,type Item,type Composition} from '@/lib/scm-model';
import {compositions,costPlan,supplyPrice,estimated,sides,sideName,displayChannel} from '@/lib/workflow';
export {PplEditor} from './ppl-editor';
import {Field,NumberInput,Value,Section,show} from './entry-fields';
type Props={form:Item;onChange:(item:Item)=>void;items:Item[]};
export function BroadcastEditor({form,onChange,items}:Props){
 const put=(k:keyof Item,v:unknown)=>onChange({...form,[k]:v});
 const actual=usesActualClock(items.find(x=>x.id===form.id));
 const channels=[...new Set(['SK','홈앤','현대','현대+','SSG','CJ','K','NS','롯데','롯데+','공영',...items.map(x=>x.channel)].filter(Boolean))];
 return <><Section title="방송 기본정보" note="아는 내용부터 입력하고 부분 저장하세요. 홈쇼핑 미편성 상태에서도 등록할 수 있습니다."/><div className="result-grid">
 <Field label="표준 아이템"><select className="form-control" value={form.item} onChange={e=>onChange({...form,item:e.target.value,shortItem:e.target.value})}><option value="">선택</option>{[...new Set(['파라다이스','아세로라','프리바이오틱스','알파시클로덱스트린',...items.map(x=>x.item),form.item].filter(Boolean))].map(x=><option key={x}>{x}</option>)}</select></Field>
 <Field label="담당자"><select className="form-control" value={form.owner} onChange={e=>put('owner',e.target.value)}><option value="">선택</option>{[...new Set(['조정묵','김미정','김진희','임상민',...items.map(x=>x.owner),form.owner].filter(Boolean))].map(x=><option key={x}>{x}</option>)}</select></Field>
 <Field label="홈쇼핑 채널"><select className="form-control" value={form.channel} onChange={e=>onChange({...form,channel:e.target.value,status:e.target.value?form.status:''})}><option value="">편성예정(미편성)</option>{channels.map(x=><option key={x}>{x}</option>)}</select></Field>
 <Field label="방송 상태"><select className="form-control" value={form.status} onChange={e=>put('status',e.target.value)}><option value="">아직 확정 전</option><option disabled={!form.channel}>편성확정</option><option>취소</option></select></Field>
 <Field label={actual?"실제 방송일":"편성 기준일 · 기존 표기"}><input className="form-control" type="date" value={form.date} onChange={e=>put('date',e.target.value)}/></Field>
 <Field label={actual?"실제 방송시간":"편성 표기시간 · 기존 표기"} hint={actual?"00:00~23:59 입력 · 미정이면 빈칸으로 저장":"기존 24:30·25:00 표기 유지"}><input className="form-control" type={actual?"time":"text"} value={form.time} onChange={e=>put('time',e.target.value)} placeholder="예: 24:30"/></Field>
 <Value label={actual?"캘린더에 표시할 실제 방송일시":"실제 방송일시 · 편성시간 환산"} value={actualDateTime(form.date,form.time)||'편성일·시간 미정'}/>
 {actual?<Value label="캘린더 표시월 · 실제 날짜 기준" value={form.date.slice(0,7)||'날짜 미정'}/>:<Field label="캘린더 표시월" hint="미입력 시 편성일의 월에 표시. 비용 귀속월과 별도"><input className="form-control" type="month" value={form.calendarMonth||''} onChange={e=>put('calendarMonth',e.target.value)}/></Field>}
 <Field label="원래 방송 · 변경/보상편성 연결"><select className="form-control" value={form.replacesId||''} onChange={e=>put('replacesId',e.target.value)}><option value="">해당 없음</option>{items.filter(x=>x.id!==form.id&&x.status==='취소').map(x=><option key={x.id} value={x.id}>{x.date} {x.time} {x.channel} {x.item}</option>)}</select></Field>
 <Field label="급편성"><input type="checkbox" checked={form.urgent} onChange={e=>put('urgent',e.target.checked)}/></Field>
 {form.status==='취소'&&<Field label="취소 사유 · 필수" hint="예: 결방, 편성일 변경. 기존 기록과 비용 연결은 보존됩니다."><textarea className="form-control" value={form.cancelReason||''} onChange={e=>put('cancelReason',e.target.value)}/></Field>}
 </div></>;
}
export function SalesEditor({form,onChange,finance,save}:{form:Item;onChange:(item:Item)=>void;finance:Finance;save:(action:FinanceAction)=>Promise<Finance|false>}){
 const cs=compositions(form);const put=(side:'single'|'double',key:keyof Composition,value:string|boolean)=>onChange({...form,compositions:{...cs,[side]:{...cs[side],[key]:value}}});
 return <><Section title="구성별 판매조건" note="판매가와 수수료율로 공급단가를 계산합니다. 구성 수량과 단위원가는 당시 적용값으로 보관합니다."/><div className="result-lines">{sides.map(side=><section className="sale-card" key={side}><h3>{sideName(side)}</h3><label className="vat-toggle"><input type="checkbox" checked={cs[side].enabled} onChange={e=>put(side,'enabled',e.target.checked)}/>이 구성 사용</label>{cs[side].enabled&&<div className="sale-fields">
 <SalesCompositionSelect value={cs[side].sku} name={cs[side].compositionName} finance={finance} save={save} onSelect={option=>onChange({...form,compositions:{...cs,[side]:{...cs[side],sku:option.code,compositionName:option.name}}})}/>
 <Field label="세트당 상품 수량 (박스/개)" hint="단위원가와 같은 단위 사용"><NumberInput integer value={cs[side].units} onChange={v=>put(side,'units',v)}/></Field>
 <Field label="판매가 (원)"><NumberInput value={cs[side].sellingPrice} onChange={v=>put(side,'sellingPrice',v)}/></Field>
 <Field label="판매가 부가세 기준"><select className="form-control" value={cs[side].vatBasis} onChange={e=>put(side,'vatBasis',e.target.value)}><option>포함</option><option>별도</option></select></Field>
 <Field label="판매수수료율 (%)"><NumberInput value={cs[side].commission} onChange={v=>put(side,'commission',v)}/></Field>
 <Value label="공급단가 · 자동 (원)" value={show(supplyPrice(cs[side]))}/>
 <Field label="상품 단위원가 (원, VAT 제외)"><NumberInput value={cs[side].unitCost} onChange={v=>put(side,'unitCost',v)}/></Field>
 <Field label="원가 기준일"><input className="form-control" type="date" value={cs[side].costDate} onChange={e=>put(side,'costDate',e.target.value)}/></Field>
 </div>}</section>)}</div></>;
}
export function PlanEditor({form,onChange}:{form:Item;onChange:(item:Item)=>void}){
 const cs=compositions(form),p=costPlan(form);return <><Section title="목표·구성별 수량계획" note="주문수량은 전환율 적용 전 수량입니다. 메인·서브 구성을 각각 계산합니다."/><div className="result-grid">{([['target','주문 목표금액'],['hsTarget','홈쇼핑 목표금액'],['businessProfitTarget','사업계획 이익목표']] as const).map(([k,label])=><Field key={k} label={label+' (원, VAT 제외)'}><NumberInput signed={k==='businessProfitTarget'} value={form[k]||''} onChange={v=>onChange({...form,[k]:v})}/></Field>)}<Field label="수량 소수점 처리"><select className="form-control" value={p.quantityRounding} onChange={e=>onChange({...form,costPlan:{...p,quantityRounding:e.target.value as typeof p.quantityRounding}})}><option value="">기준 확인 후 선택</option><option value="floor">세트 단위 내림</option><option value="round">세트 단위 반올림</option></select></Field></div>
 <div className="result-lines">{sides.filter(s=>cs[s].enabled).map(side=><section className="sale-card" key={side}><h3>{sideName(side)}</h3><div className="sale-fields"><Field label="계획 주문수량 (세트)"><NumberInput integer value={cs[side].plannedQuantity} onChange={v=>onChange({...form,compositions:{...cs,[side]:{...cs[side],plannedQuantity:v}}})}/></Field><Field label="예상 전환율 (%)"><NumberInput value={cs[side].conversionRate} onChange={v=>onChange({...form,compositions:{...cs,[side]:{...cs[side],conversionRate:v}}})}/></Field><Value label="계획 예상출고" value={show(estimated(cs[side].plannedQuantity,cs[side].conversionRate,p.quantityRounding),' 세트')}/></div></section>)}</div></>;
}
export function CostEditor({form,onChange}:{form:Item;onChange:(item:Item)=>void}){
 const p=costPlan(form);return <><Section title="방송 전 비용·계산 기준" note="발생하지 않는 비용은 0으로 입력하세요. 빈칸은 미확인으로 남기며 이익금을 확정하지 않습니다."/><div className="result-grid">{([['adCost','홈쇼핑 정액 방송비·광고비'],['guestCost','게스트 비용'],['administrationCost','판관비'],['otherCost','기타 고정비용 · 사은품 제외'],['shippingRate','배송단가']] as const).map(([key,label])=><Field key={key} label={label+' (원, VAT 제외)'} hint={key==='shippingRate'?'회의 예시 3,800원. 해당 방송의 적용 단가를 확인해 입력':undefined}><NumberInput value={p[key]} onChange={v=>onChange({...form,costPlan:{...p,[key]:v}})}/></Field>)}
 <Field label="배송비 산정 기준"><select className="form-control" value={p.shippingBasis} onChange={e=>onChange({...form,costPlan:{...p,shippingBasis:e.target.value as typeof p.shippingBasis}})}><option value="">기준 확인 후 선택</option><option value="sets">예상출고 1세트 = 배송 1건</option><option value="manual">배송 건수 별도 입력</option></select></Field>
 <Field label="계산 금액 원 단위 처리"><select className="form-control" value={p.moneyRounding} onChange={e=>onChange({...form,costPlan:{...p,moneyRounding:e.target.value as typeof p.moneyRounding}})}><option value="">기준 확인 후 선택</option><option value="floor">항목별 원 미만 버림</option><option value="round">항목별 원 단위 반올림</option></select></Field>
 <Field label="PPL 비용처리월" hint="방송별 비용 귀속월과 별도로 기록"><input className="form-control" type="month" value={p.pplProcessingMonth} onChange={e=>onChange({...form,costPlan:{...p,pplProcessingMonth:e.target.value}})}/></Field>
 </div><p className="result-note">배송비·상품원가·사은품비는 방송결과의 예상 출고수량으로 계산됩니다.</p><BreakEvenPanel item={form}/></>;
}
export function ReviewEditor({form}:{form:Item}){const missing=archiveMissing(form,new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}));return <><Section title="입력 현황 확인·저장" note="아는 내용부터 부분 저장하세요. 저장한 방송은 팀장·다른 매니저가 방송 보관함에서 이어서 입력할 수 있습니다."/><div className="result-grid"><Value label="방송" value={`${form.date||'날짜 미정'} ${form.time} · ${displayChannel(form.channel)} · ${form.item}`}/><Value label="확인 대상 미입력" value={`${missing.length}개`}/></div>{missing.length?<details className="review-missing-details" open><summary>남은 입력 항목 {missing.length}개</summary><ul>{missing.map(x=><li key={x.group+x.label}>{x.group} · {x.label}</li>)}</ul></details>:<p className="result-note">확인 대상 미입력 항목이 없습니다. 입력된 금액과 기준의 정확성은 별도로 확인해 주세요.</p>}<p className="result-note">검토 요청 없이 저장만 하면 보관함에 표시됩니다. 저장 후 미입력 현황이 자동으로 갱신됩니다.</p></>}
