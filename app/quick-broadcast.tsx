'use client';
import {TimeInput} from './time-input';
import {useState} from 'react';
import type {Item} from '@/lib/scm-model';
import {Field} from './entry-fields';
export type QuickBroadcast=Pick<Item,'id'|'item'|'owner'|'channel'|'date'|'time'>;
export type CreateBroadcast=(draft:QuickBroadcast)=>Promise<false|Item>;
export function QuickBroadcastForm({items,create,onCreated,onCancel}:{items:Item[];create:CreateBroadcast;onCreated:(item:Item)=>void;onCancel:()=>void}){
 const [draft,setDraft]=useState<QuickBroadcast>(()=>({id:crypto.randomUUID(),item:'',owner:'',channel:'',date:'',time:''})),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const put=(k:keyof QuickBroadcast,v:string)=>setDraft(x=>({...x,[k]:v}));
 const choices=(base:string[],key:'item'|'owner'|'channel')=>[...new Set([...base,...items.map(i=>i[key])].filter(Boolean))];
 const submit=async()=>{if(!draft.item){setError('표준 아이템을 선택하세요. 나머지 정보는 나중에 보완할 수 있습니다.');return;}setPending(true);setError('');try{const saved=await create(draft);if(saved)onCreated(saved);else setError('방송을 저장하지 못했습니다. 오류 안내를 확인해 주세요. 입력 내용은 유지됩니다.');}finally{setPending(false)}};
 return <section className="master-register quick-broadcast" aria-label="홈쇼핑 방송 간편 등록"><h3>홈쇼핑 방송 간편 등록</h3><p className="result-note">표준 아이템만 선택해도 작성 중으로 저장됩니다. 저장 후 이 PPL 배분에 자동 선택되며, 금액·송출회차를 확인하고 배분을 저장하세요.</p><div className="result-grid">
 <Field label="표준 아이템 · 필수"><select autoFocus className="form-control" value={draft.item} onChange={e=>put('item',e.target.value)}><option value="">아이템 선택</option>{choices(['파라다이스','아세로라','프리바이오틱스','알파시클로덱스트린'],'item').map(x=><option key={x}>{x}</option>)}</select></Field>
 <Field label="홈쇼핑 채널"><select className="form-control" value={draft.channel} onChange={e=>put('channel',e.target.value)}><option value="">편성예정(미편성)</option>{choices(['SK','홈앤','현대','현대+','SSG','CJ','K','NS','롯데','롯데+','공영'],'channel').map(x=><option key={x}>{x}</option>)}</select></Field>
 <Field label="담당자"><select className="form-control" value={draft.owner} onChange={e=>put('owner',e.target.value)}><option value="">나중에 지정</option>{choices(['조정묵','김미정','김진희','임상민'],'owner').map(x=><option key={x}>{x}</option>)}</select></Field>
 <Field label="실제 방송일 · 미정이면 비워두세요"><input className="form-control" type="date" value={draft.date} onChange={e=>put('date',e.target.value)}/></Field>
 <Field label="실제 방송시간 · 미정이면 비워두세요"><TimeInput label="실제 방송시간" value={draft.time} onChange={v=>put('time',v)}/></Field>
 </div>{error&&<p role="alert">{error}</p>}<div className="finance-actions"><button type="button" className="primary-button" disabled={pending} onClick={submit}>{pending?'방송 저장 중…':'방송 등록 후 배분 계속'}</button><button type="button" className="secondary-button" disabled={pending} onClick={onCancel}>취소</button></div><small>판매조건·목표·수량·방송비용은 방송 입력 메뉴에서 이어서 작성할 수 있습니다.</small></section>;
}
