'use client';
import {useId,useState} from 'react';
import type {Item} from '@/lib/scm-model';
import {contractTotals,type Finance} from '@/lib/finance-model';
import {masterProgram} from '@/lib/ppl-master';
import {pplAirings,airingLabel,airingSummary,matchesPpl,pplCompanies,matchingPplAirings} from '@/lib/ppl-airings';

const won=(v:string)=>Number(v||0).toLocaleString('ko-KR')+'원';
export function PplPicker({finance,items,value,onChange,broadcastId,onCreate,canCreate=true,excludedIds=[]}:{finance:Finance;items:Item[];value:string;onChange:(id:string)=>void;broadcastId:string;onCreate:()=>void;canCreate?:boolean;excludedIds?:string[]}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');const id=useId();
 const selected=finance.contracts.find(c=>c.id===value);
 const results=finance.contracts.filter(c=>matchesPpl(c,items,query,finance)).sort((a,b)=>{
  const date=(c:typeof a)=>pplAirings(c,items,finance.allocations).filter(a=>a.date).at(-1)?.date||'';
  return date(b).localeCompare(date(a))||a.code.localeCompare(b.code);
 });
 return <section className="ppl-picker" aria-label="날짜·시간·프로그램명으로 PPL 찾기">
  <span className="field-label">연결할 PPL · 날짜·시간·프로그램명을 확인하세요</span>
  <button type="button" className="ppl-picker-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>
   <span><strong>{selected?`${airingSummary(selected,items,finance.allocations)} · ${masterProgram(selected,items)||selected.name}`:'날짜·시간·프로그램명으로 PPL 찾기'}</strong><small>{selected?`${selected.channel} · ${pplCompanies(selected,items,finance).join(' / ')}`:'총금액이 등록된 PPL 중에서 선택합니다.'}</small>{selected&&<small>{selected.code} · {selected.party}</small>}</span><b>{open?'닫기':'선택·변경 ▾'}</b>
  </button>
  {open&&<div id={id} className="ppl-picker-panel" onKeyDown={e=>{if(e.key==='Escape')setOpen(false)}}>
   <label className="ppl-picker-search">PPL 검색<input autoFocus className="form-control" placeholder="예: 10/22 09:30 세개의 시선" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <p className="result-note">{results.length}건 · 날짜·시간·프로그램명 함께 검색 가능</p>
   <div className="ppl-picker-results">{results.map(c=>{
    const dates=matchingPplAirings(c,items,query,finance.allocations),companies=pplCompanies(c,items,finance),linked=finance.allocations.some(a=>a.active&&a.contractId===c.id&&a.broadcastId===broadcastId);
    return <button type="button" key={c.id} disabled={excludedIds.includes(c.id)} className={value===c.id?'selected':''} aria-pressed={value===c.id} onClick={()=>{onChange(c.id);setOpen(false);setQuery('')}}>
     <strong>{dates.length?`${dates[0].date||'방송일 미등록'} ${dates[0].time||'시간 미등록'}`:'송출일정 미등록'} · {masterProgram(c,items)||c.name}<em>{excludedIds.includes(c.id)?'다른 PPL 연결 탭에서 선택됨':value===c.id?'선택됨':linked?'이 방송에 연결됨':''}</em></strong>
     <span className="ppl-picker-dates">{dates.length?dates.slice(0,3).map(a=><span key={[a.date,a.time,a.kind].join('|')}>{airingLabel(a)}</span>):<span>방송일 미등록</span>}{dates.length>3&&<span>외 {dates.length-3}개 일정 · 선택 후 전체 확인</span>}</span>
     <small>{c.channel} · {companies.join(' / ')} · {c.code} · 총 {won(c.net)} · 잔액 {won(contractTotals(finance,c.id).remaining.net)} (부가세 별도)</small>
    </button>;
   })}</div>
   {!results.length&&<p className="result-note">{finance.contracts.length?'검색 결과가 없습니다. 날짜·시간·프로그램명으로 다시 검색하세요.':'등록된 PPL이 없습니다. 아래에서 새 PPL을 등록한 뒤 이 방송으로 돌아올 수 있습니다.'}</p>}
   <div className="finance-actions"><span>연결할 PPL이 없나요?</span><button type="button" className="primary-button" disabled={!canCreate} onClick={onCreate}>+ 새 PPL 등록 후 돌아오기</button>{!canCreate&&<small>등록 권한이 있는 계정으로 로그인하세요.</small>}</div>
  </div>}
 </section>;
}
