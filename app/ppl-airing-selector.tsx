'use client';
import type {Contract} from '@/lib/finance-model';
import type {PplAiring} from '@/lib/ppl-airings';
import {airingLabel} from '@/lib/ppl-airings';
import {sameAiring} from '@/lib/ppl-registration';
import {Field} from './entry-fields';
import {AllocationAiringFields} from './allocation-airing-fields';
export function PplAiringSelector({contract,value,onChange}:{contract:Contract;value:PplAiring;onChange:(a:PplAiring)=>void}){
 const rows=contract.airings||[];
 if(!rows.length)return <><p className="result-note">기존 PPL의 송출일정이 아직 등록되지 않았습니다. 현재 연결의 일정을 입력하거나 PPL 등록·관리에서 본방·재방 일정을 먼저 등록하세요.</p><AllocationAiringFields value={value} onChange={onChange}/></>;
 return <Field label="연결할 PPL 송출회차" hint="날짜·시간·채널을 확인하세요. 새로운 일정은 PPL 등록·관리에서 추가합니다."><select className="form-control" value={String(rows.findIndex(a=>sameAiring(a,value)))} onChange={e=>{const a=rows[Number(e.target.value)];if(a)onChange({...a})}}><option value="-1">송출회차 선택</option>{rows.map((a,i)=><option value={i} key={a.id||i}>{airingLabel(a)} · {contract.channel} · {contract.program}</option>)}</select></Field>;
}
