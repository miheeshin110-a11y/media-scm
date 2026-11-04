'use client';
import {costAt,costItems,selectCost,type CostFields,type CostKind} from '@/lib/cost-history';
import type {Finance} from '@/lib/finance-model';
import {Field,NumberInput,Value} from './entry-fields';

export function CostHistoryFields({value,finance,kind,referenceDate,onChange}:{value:CostFields;finance:Finance;kind:CostKind;referenceDate:string;onChange:(patch:CostFields)=>void}){
 const choices=costItems(finance,kind),selected=value.costItemId||'',date=value.costDate||'';
 const candidate=costAt(finance,selected,kind,date),snapshot=value.costSnapshot;
 const manual=()=>onChange({...value,costItemId:undefined,costSnapshot:undefined});
 return <>
  <Field label={kind==='product'?'상품 원가 품목':'사은품 원가 품목'} hint="이력 품목 선택·기준일 변경 시 이 방송의 적용 원가가 변경됩니다.">
   <select className="form-control" value={selected} onChange={e=>e.target.value?onChange(selectCost(finance,kind,e.target.value,date||referenceDate)):manual()}>
    <option value="">직접 입력 · 기존 원가 유지</option>
    {selected&&!choices.some(c=>c.itemId===selected)&&<option value={selected}>{snapshot?.name||'기존 적용 품목'}</option>}
    {choices.map(c=><option key={c.itemId} value={c.itemId}>{c.name} · 1{c.unit} 기준</option>)}
   </select>
  </Field>
  <Field label="원가 기준일" hint={selected?'이 날짜 이전 또는 당일에 시작하는 가장 최근 원가를 적용합니다.':undefined}>
   <input type="date" className="form-control" value={date} onChange={e=>onChange(selected?selectCost(finance,kind,selected,e.target.value):{...value,costDate:e.target.value})}/>
  </Field>
  {selected?<>
   <Value label={`적용 단위원가 · VAT 제외${snapshot?' / 1'+snapshot.unit:''}`} value={snapshot?Number(value.unitCost).toLocaleString('ko-KR')+'원':'원가 미등록 · 이익 미산출'}/>
   <div className="cost-source-note" role="status">
    {snapshot?<p>적용 시작일 {snapshot.effectiveFrom} · 기준일 {snapshot.basisDate}. 저장된 원가는 새 이력을 등록해도 유지됩니다.</p>:<p>해당 기준일에 적용할 원가가 없습니다. 원가 이력을 등록하거나 기준일을 확인하세요.</p>}
    {candidate&&candidate.id!==snapshot?.id&&<><p>현재 기준일의 최신 이력: {candidate.effectiveFrom}부터 {Number(candidate.unitCost).toLocaleString('ko-KR')}원. 다시 적용하면 이 방송의 원가와 자동계산 이익이 변경됩니다.</p><button type="button" className="secondary-button" onClick={()=>onChange(selectCost(finance,kind,selected,date))}>기준일 원가 다시 적용</button></>}
   </div>
  </>:<Field label={kind==='product'?'상품 단위원가 (원, VAT 제외)':'사은품 단위원가 (원, VAT 제외)'}><NumberInput value={value.unitCost} onChange={unitCost=>onChange({...value,unitCost,costSnapshot:undefined})}/></Field>}
 </>;
}
