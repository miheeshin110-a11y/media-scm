'use client';
import {defaultVat,type Contract,type Allocation} from '@/lib/finance-model';
import {splitPplGrossCost,sameAiring} from '@/lib/ppl-registration';
import type {PplAiring} from '@/lib/ppl-airings';
import {airingLabel} from '@/lib/ppl-airings';
import {Field,NumberInput} from './entry-fields';
const won=(n:number|undefined)=>n===undefined?'미입력':n.toLocaleString('ko-KR')+'원';
export function AgencyFields({value:c,onChange}:{value:Contract;onChange:(c:Contract)=>void}){
 const manual=c.taxMode==='manual'||(!c.taxMode&&c.tax!==''&&c.tax!==defaultVat(c.net));
 const parts=splitPplGrossCost({...c,tax:manual?c.tax:defaultVat(c.net)});
 return <section className="contract-section agency-section" aria-label="밴더사 수수료"><h3>3. 밴더사 수수료</h3><div className="contract-identity-grid"><Field label="거래 방식"><select className="form-control" value={c.tradeType||''} onChange={e=>onChange({...c,tradeType:e.target.value as Contract['tradeType'],agencyRate:e.target.value==='direct'?'0':''})}><option value="">선택</option><option value="direct">직거래 · 수수료 없음</option><option value="agency">밴더사 경유 · 수수료 포함</option></select></Field><Field label="수수료율 · 부가세 포함 총금액 기준 (%)">{c.tradeType==='agency'?<NumberInput value={c.agencyRate||''} onChange={agencyRate=>onChange({...c,agencyRate})}/>:<input className="form-control numeric-input" readOnly value={c.tradeType==='direct'?'0':''} placeholder="거래 방식 선택"/>}</Field></div><div className="agency-amounts"><div className="result-value"><span>밴더사 수수료 · 부가세 포함</span><strong>{won(parts?.fee)}</strong>{parts&&<small>공급가액 {won(parts.feeNet)} + 부가세 {won(parts.feeTax)}</small>}</div><div className="result-value"><span>수수료 제외 PPL 금액 · 부가세 포함</span><strong>{won(parts?.media)}</strong>{parts&&<small>공급가액 {won(parts.mediaNet)} + 부가세 {won(parts.mediaTax)}</small>}</div></div><p className="result-note">수수료는 위 PPL 총금액에 포함됩니다. 총금액 3,300만원 × 10% = 수수료 330만원(부가세 포함). 방송 비용에는 공급가액을 반영하며, 원 미만은 버립니다.</p></section>;
}
export function PplScheduleFields({contract,allocations,onChange}:{contract:Contract;allocations:Allocation[];onChange:(airings:PplAiring[])=>void}){
 const rows=contract.airings||[];
 const put=(index:number,key:keyof PplAiring,value:string)=>onChange(rows.map((a,i)=>i===index?{...a,[key]:value}:a));
 return <><p className="result-note">실제 송출일과 00:00~23:59 시간을 입력하세요. 같은 계약의 재방·스페셜은 아래에 일정을 추가합니다.</p><div className="allocation-list">{rows.map((a,i)=>{
 const used=allocations.some(x=>x.active&&x.contractId===contract.id&&x.airing&&sameAiring(x.airing,a));
 return <section className="allocation-card" key={a.id}><header><strong>{i+1}. {airingLabel(a)}</strong><button className="text-button" disabled={used||rows.length===1} onClick={()=>onChange(rows.filter((_,index)=>index!==i))}>{used?'방송에 연결됨':'일정 삭제'}</button></header><div className="allocation-card-fields result-grid"><Field label="PPL 실제 방송일"><input className="form-control" type="date" value={a.date} onChange={e=>put(i,'date',e.target.value)}/></Field><Field label="PPL 방송시간" hint={Number(a.time.split(':')[0])>=24?'기존 심야 표기 유지 · 변경 시 실제 날짜와 시간으로 입력':undefined}><input className="form-control" type={Number(a.time.split(':')[0])>=24?'text':'time'} value={a.time} onChange={e=>put(i,'time',e.target.value)}/></Field><Field label="송출 구분"><select className="form-control" value={a.kind} onChange={e=>put(i,'kind',e.target.value)}>{['본방','재방','스페셜'].map(k=><option key={k}>{k}</option>)}</select></Field>{a.kind!=='본방'&&<Field label="원본 본방일"><input className="form-control" type="date" value={a.originalDate||''} onChange={e=>put(i,'originalDate',e.target.value)}/></Field>}</div></section>;
 })}</div><button className="secondary-button" disabled={rows.length>=20} onClick={()=>onChange([...rows,{id:crypto.randomUUID(),date:'',time:'',kind:'재방',originalDate:rows.find(a=>a.kind==='본방')?.date||''}])}>+ 재방·스페셜 일정 추가</button><p className="result-note">연결된 일정의 날짜·시간을 수정하면 해당 홈쇼핑 방송에도 반영됩니다. 배분금액은 유지됩니다.</p></>;
}
