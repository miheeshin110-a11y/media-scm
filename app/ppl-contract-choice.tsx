'use client';
import {useState} from 'react';
import {contractTotals,type Contract,type Finance} from '@/lib/finance-model';
import {existingPplContracts,pplSignature} from '@/lib/ppl-duplicates';
import {contractBroadcasts} from '@/lib/ppl-contracts';
import type {Item,PplLink} from '@/lib/scm-model';
import {ContractEditor,type FinanceSave} from './finance-entry';
import {Field} from './entry-fields';

const won=(n:string|number)=>Number(n).toLocaleString('ko-KR')+'원';
type Mode='new'|'existing'|'later';
export function PplContractChoice({contractId,finance,items,broadcastId,broadcastVersion,link,canManage,save,onSelect}:{contractId:string;finance:Finance;items:Item[];broadcastId:string;broadcastVersion:number;link:PplLink;canManage:boolean;save:FinanceSave;onSelect:(id:string,channel?:string)=>void}){
 const [mode,setMode]=useState<Mode|null>(contractId?'existing':null),[query,setQuery]=useState('');
 const broadcast=items.find(item=>item.id===broadcastId);
 const savedLink=broadcast?.pplLinks?.find(old=>old.id===link.id);
 const existing=existingPplContracts(finance,broadcast,link);
 const ready=Boolean(broadcastVersion&&broadcast?.version===broadcastVersion&&savedLink&&pplSignature(link)&&pplSignature(savedLink)===pplSignature(link)&&savedLink.contractRef===link.contractRef);
 const saveContract:FinanceSave=action=>save(action.kind==='contract'&&!action.data.id?{...action,data:{...action.data,pplContext:{broadcastId,linkId:link.id,version:broadcastVersion}}}:action);
 const selected=finance.contracts.find(c=>c.id===contractId);
 const choose=(next:Mode)=>{setMode(next);if(next==='later')onSelect('');};
 const selectContract=(id:string,c?:Contract)=>{onSelect(id,c?.channel);setMode('existing');setQuery('');};
 const totals=selected?contractTotals(finance,selected.id):null;
 const connected=selected?contractBroadcasts(finance,items,selected.id):[];
 const filtered=finance.contracts.filter(c=>c.id===contractId||[c.name,c.code,c.party].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 return <div className="ppl-contract-choice">
  
  <fieldset className="contract-paths" aria-label="PPL 계약 연결 방식">
   {([['existing','등록된 계약 선택','같은 계약에 방송을 추가할 때'],['new','새 계약 만들기','계약 목록에 없는 새 계약일 때'],['later','계약 미정','계약 확인은 팀장에게 요청']] as const).map(([value,title,note])=><button type="button" key={value} aria-pressed={mode===value} className={mode===value?'selected':''} onClick={()=>choose(value)}><strong>{title}</strong><span>{note}</span></button>)}
  </fieldset>
  {mode==='later'&&<p className="result-note">계약 없이 PPL 정보를 부분 저장할 수 있습니다. 팀장이 검토할 때 계약을 연결하세요. 이미 저장된 비용 배분은 그대로 유지됩니다.</p>}
  {mode==='new'&&<div className="new-ppl-contract">
   {existing.length?<div className="ppl-duplicate-alert" role="alert"><strong>이미 이 방송의 PPL에 등록된 계약이 있습니다.</strong><ul>{existing.map(c=><li key={c.id}>{c.code} · {c.name}</li>)}</ul><p>중복 계약은 저장할 수 없습니다. 기존 계약을 확인해 주세요.</p><button className="secondary-button" onClick={()=>selectContract(existing[0].id,existing[0])}>기존 계약 확인</button></div>
    :!ready?<p className="result-note">‘프로그램·일정’에서 채널·프로그램을 입력한 뒤 하단의 ‘저장하고 계약 선택’을 눌러 주세요. 송출일시가 정해졌다면 함께 저장하세요.</p>
    :canManage?<><p className="result-note">같은 계약은 한 번만 등록하세요. 저장할 때 기존 연결을 다시 확인합니다.</p><details className="ppl-extra"><summary>새 계약 등록창 열기</summary><ContractEditor finance={finance} save={saveContract} onSaved={selectContract} saveLabel="중복 확인 후 계약 등록"/></details></>
    :<p className="result-note">새 계약 등록은 팀장 권한이 필요합니다. ‘계약 미정’을 선택하고 PPL 정보를 먼저 저장하세요.</p>}
  </div>}
  {mode==='existing'&&<>
   <div className="contract-select-row"><Field label="계약 검색"><input className="form-control" placeholder="계약명 · 거래처 · 계약번호" value={query} onChange={e=>setQuery(e.target.value)}/></Field><Field label="PPL 계약 선택"><select className="form-control" value={contractId} onChange={e=>{const c=finance.contracts.find(c=>c.id===e.target.value);selectContract(e.target.value,c)}}><option value="">계약을 선택하세요</option>{contractId&&!selected&&<option value={contractId}>현재 연결 계약 · 목록 확인 필요</option>}{filtered.map(c=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field></div>
   {!finance.contracts.length&&<p className="result-note">등록된 계약이 없습니다. ‘새 계약 만들기’ 또는 ‘계약 미정’을 선택하세요.</p>}
   {!!finance.contracts.length&&!filtered.length&&<p className="result-note">검색 결과가 없습니다. 계약명이나 거래처를 다시 확인하세요.</p>}
   {selected&&totals&&<div className="ppl-contract-overview"><p><strong>{selected.code}</strong> · {selected.party}</p><div className="allocation-summary"><div><span>계약 공급가액 · 부가세 별도</span><strong>{won(selected.net)}</strong><small>부가세 포함 {won(Number(selected.net)+Number(selected.tax))}</small></div><div><span>배분한 공급가액</span><strong>{won(totals.allocated.net)}</strong></div><div><span>남은 배분금액 · 공급가액</span><strong>{won(totals.remaining.net)}</strong></div></div>
    <details><summary>이미 연결된 방송 {connected.length}건 · 저장 기준</summary>{connected.length?<ul className="contract-broadcasts">{connected.map(row=><li key={row.id}><span>{row.item?`${row.item.date||'일정 미정'} ${row.item.time} · ${row.item.channel||'미편성'} ${row.item.item}`:'방송 정보 확인 필요'}{row.id===broadcastId?' · 현재 방송':''}</span><strong>{row.net===null?'배분 전':won(row.net)}</strong></li>)}</ul>:<p className="result-note">이 계약에 연결된 방송이 아직 없습니다. 현재 방송이 첫 연결입니다.</p>}</details>
   </div>}
   {selected&&<p className="result-note">계약 선택만으로 저장되지는 않습니다. 하단의 ‘연결 내용 확인’을 거쳐 연결을 저장해 주세요.</p>}
  </>}
 </div>;
}
