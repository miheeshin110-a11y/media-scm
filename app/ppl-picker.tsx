'use client';
import {useId,useState} from 'react';
import type {Item} from '@/lib/scm-model';
import {contractTotals,type Finance} from '@/lib/finance-model';
import {masterProgram} from '@/lib/ppl-master';
import {pplAirings,airingLabel,airingSummary,matchesPpl} from '@/lib/ppl-airings';

const won=(v:string)=>Number(v||0).toLocaleString('ko-KR')+'원';
export function PplPicker({finance,items,value,onChange,broadcastId,onCreate,canCreate=true}:{finance:Finance;items:Item[];value:string;onChange:(id:string)=>void;broadcastId:string;onCreate:()=>void;canCreate?:boolean}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');const id=useId();
 const selected=finance.contracts.find(c=>c.id===value);
 const results=finance.contracts.filter(c=>matchesPpl(c,items,query)).sort((a,b)=>{
  const date=(c:typeof a)=>pplAirings(c,items).filter(a=>a.date).at(-1)?.date||'';
  return date(b).localeCompare(date(a))||a.code.localeCompare(b.code);
 });
 return <section className="ppl-picker" aria-label="방송일로 PPL 찾기">
  <span className="field-label">연결할 PPL · 방송일과 프로그램을 확인하세요</span>
  <button type="button" className="ppl-picker-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>
   <span><strong>{selected?`${selected.channel} · ${masterProgram(selected,items)||selected.name}`:'방송일·프로그램으로 PPL 찾기'}</strong><small>{selected?airingSummary(selected,items):'총금액이 등록된 PPL 중에서 선택합니다.'}</small>{selected&&<small>{selected.code} · {selected.party}</small>}</span><b>{open?'닫기':'선택·변경 ▾'}</b>
  </button>
  {open&&<div id={id} className="ppl-picker-panel" onKeyDown={e=>{if(e.key==='Escape')setOpen(false)}}>
   <label className="ppl-picker-search">PPL 검색<input autoFocus className="form-control" placeholder="예: 2026-09-17, 세개의 시선, TV조선" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <p className="result-note">{results.length}건 · PPL 방송일 기준 · 최근 날짜순</p>
   <div className="ppl-picker-results">{results.map(c=>{
    const dates=pplAirings(c,items),linked=finance.allocations.some(a=>a.active&&a.contractId===c.id&&a.broadcastId===broadcastId);
    return <button type="button" key={c.id} className={value===c.id?'selected':''} aria-pressed={value===c.id} onClick={()=>{onChange(c.id);setOpen(false);setQuery('')}}>
     <strong>{c.channel} · {masterProgram(c,items)||c.name}<em>{value===c.id?'선택됨':linked?'이 방송에 연결됨':''}</em></strong>
     <span className="ppl-picker-dates">{dates.length?dates.slice(0,3).map(a=><span key={[a.date,a.time,a.kind].join('|')}>{airingLabel(a)}</span>):<span>방송일 미등록</span>}{dates.length>3&&<span>외 {dates.length-3}개 일정 · 선택 후 전체 확인</span>}</span>
     <small>{c.code} · {c.party} · 총 {won(c.net)} · 잔액 {won(contractTotals(finance,c.id).remaining.net)} (부가세 별도)</small>
    </button>;
   })}</div>
   {!results.length&&<p className="result-note">{finance.contracts.length?'검색 결과가 없습니다. 날짜나 프로그램명으로 다시 검색하세요.':'등록된 PPL이 없습니다. 아래에서 새 PPL을 등록한 뒤 이 방송으로 돌아올 수 있습니다.'}</p>}
   <div className="finance-actions"><span>연결할 PPL이 없나요?</span><button type="button" className="primary-button" disabled={!canCreate} onClick={onCreate}>+ 새 PPL 등록 후 돌아오기</button>{!canCreate&&<small>새 PPL 등록은 팀장 권한이 필요합니다.</small>}</div>
  </div>}
 </section>;
}
