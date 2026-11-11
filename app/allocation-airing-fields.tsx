'use client';
import {PplDateField} from './ppl-date-field';
import {TimeInput} from './time-input';
import type {PplAiring} from '@/lib/ppl-airings';
import {Field} from './entry-fields';
export function AllocationAiringFields({value,onChange}:{value:PplAiring;onChange:(a:PplAiring)=>void}){
 const put=(key:keyof PplAiring,v:string)=>onChange({...value,[key]:v});
 return <div className="result-grid"><PplDateField label="연결할 PPL 방송일" value={value.date} onChange={date=>put('date',date)}/><Field label="PPL 방송시간" hint="00:00~23:59 · 자정은 00시 선택">{Number(value.time.split(':')[0])>=24?<input className="form-control" value={value.time} onChange={e=>put('time',e.target.value)}/>:<TimeInput label="PPL 방송시간" value={value.time} onChange={v=>put('time',v)}/>}</Field><Field label="송출 구분"><select className="form-control" value={value.kind} onChange={e=>put('kind',e.target.value)}><option value="">선택</option>{['본방','재방','스페셜'].map(k=><option key={k}>{k}</option>)}</select></Field>{['재방','스페셜'].includes(value.kind)&&<PplDateField label="원본 본방일" value={value.originalDate||''} onChange={date=>put('originalDate',date)}/>}</div>;
}
