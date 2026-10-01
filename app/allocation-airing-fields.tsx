'use client';
import type {PplAiring} from '@/lib/ppl-airings';
import {Field} from './entry-fields';
export function AllocationAiringFields({value,onChange}:{value:PplAiring;onChange:(a:PplAiring)=>void}){
 const put=(key:keyof PplAiring,v:string)=>onChange({...value,[key]:v});
 return <div className="result-grid"><Field label="연결할 PPL 방송일"><input className="form-control" type="date" value={value.date} onChange={e=>put('date',e.target.value)}/></Field><Field label="PPL 방송시간" hint="24:30·25:00 입력 가능"><input className="form-control" value={value.time} placeholder="예: 10:30" onChange={e=>put('time',e.target.value)}/></Field><Field label="송출 구분"><select className="form-control" value={value.kind} onChange={e=>put('kind',e.target.value)}><option value="">선택</option>{['본방','재방','스페셜'].map(k=><option key={k}>{k}</option>)}</select></Field>{['재방','스페셜'].includes(value.kind)&&<Field label="원본 본방일"><input className="form-control" type="date" value={value.originalDate||''} onChange={e=>put('originalDate',e.target.value)}/></Field>}</div>;
}
