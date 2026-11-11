'use client';

import {useId,useRef,useState} from 'react';
import type {Contract,Finance} from '@/lib/finance-model';
import type {Item} from '@/lib/scm-model';
import {airingLabel,pplAirings} from '@/lib/ppl-airings';
import {displayApproval,invoiceRefs,reconcileContract,type TaxInvoice} from '@/lib/tax-reconcile';

export type TaxReviewDraft = {rows:TaxInvoice[];matches:Matches};
type Matches = Record<number,string[]>;
const won=(value:string|number)=>Number(value).toLocaleString('ko-KR')+'원';
const company=(value:string)=>value.replace(/\D/g,'');
const contractTitle=(contract:Contract)=>contract.program||contract.name;

async function fingerprint(rows:TaxInvoice[]){
 const fields=rows.map(row=>[row.approvalNo,row.date,row.issuedDate,row.supplierNo,row.customerNo,row.net,row.tax,row.kind,row.originalApprovalNo]);
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(fields)));
 return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function TaxMatchPreview({finance,items,rows,onClose,onHandoff}:{finance:Finance;items:Item[];rows:TaxInvoice[];onClose:()=>void;onHandoff:(draft:TaxReviewDraft)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const titleId=useId();
 const [matches,setMatches]=useState<Matches>({});
 const [index,setIndex]=useState(0);
 const [query,setQuery]=useState('');
 const [message,setMessage]=useState('');
 const [working,setWorking]=useState(false);
 const invoice=rows[index];
 const selected=matches[index]||[];
 const linked=finance.contracts.filter(contract=>invoiceRefs(finance,contract).includes(invoice.approvalNo));
 const candidates=finance.contracts.map(contract=>{
  const supplier=company(contract.businessNo)===invoice.supplierNo;
  const amount=Number(contract.net)===Number(invoice.net)&&Number(contract.tax)===Number(invoice.tax);
  return {contract,supplier,amount};
 }).filter(({contract,supplier})=>selected.includes(contract.id)||(
  query.trim()
   ? [contract.code,contractTitle(contract),contract.party,contract.channel,...pplAirings(contract,items,finance.allocations).map(airingLabel)].join(' ').toLowerCase().includes(query.trim().toLowerCase())
   : supplier||linked.includes(contract)
 )).sort((a,b)=>Number(b.supplier&&b.amount)-Number(a.supplier&&a.amount));

 const count=Object.values(matches).filter(ids=>ids.length>0).length;

 function toggle(id:string){
  setMatches(old=>{
   const ids=old[index]||[];
   return {...old,[index]:ids.includes(id)?ids.filter(value=>value!==id):[...ids,id]};
  });
 }

 async function download(){
  setWorking(true);setMessage('');
  try{
   const data={version:1,source:await fingerprint(rows),matches:Object.entries(matches).filter(([,ids])=>ids.length)};
   const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
   const link=document.createElement('a');
   link.href=url;link.download='PPL-회계-검토용.json';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   setMessage('검토 파일을 받았습니다. 회계팀은 같은 원본 엑셀을 열고 검토 파일을 불러오면 됩니다.');
  }catch{setMessage('검토 파일을 만들지 못했습니다. 다시 시도해 주세요.');}
  finally{setWorking(false);}
 }

 return <>
  <section className="tax-match-launch" aria-label="계산서 매칭 미리보기">
   <div><strong>{invoice.supplierName||invoice.supplierNo}</strong><small>거래처 계산서 {rows.length}건 · 매칭 선택 {count}건</small></div>
   {message&&<p role="status">{message}</p>}
   <div className="finance-actions">
    <button className="text-button" onClick={onClose}>목록 닫기</button>
    <button className="primary-button" onClick={()=>dialog.current?.showModal()}>계산서 매칭 열기</button>
   </div>
  </section>
  <dialog ref={dialog} className="tax-match-dialog" aria-labelledby={titleId}>
   <header className="tax-match-header">
    <div><h2 id={titleId}>계산서 매칭</h2><small>{invoice.supplierName||invoice.supplierNo} · {rows.length}건</small></div>
    <button autoFocus className="text-button" onClick={()=>dialog.current?.close()}>닫기</button>
   </header>
   <div className="tax-match-body">
  <div className="tax-match-columns">
   <div>
    <h3>계산서 선택</h3>
    <ul className="tax-match-invoices">{rows.map((row,n)=><li key={row.approvalNo}>
     <button type="button" aria-pressed={n===index} onClick={()=>{setIndex(n);setQuery('');}}>
      <span><strong>{row.issuedDate||row.date}</strong><small>승인번호 끝 {row.approvalNo.slice(-8)}</small></span>
      <span><strong>{won(row.net)}</strong><small>{matches[n]?.length?'매칭 선택됨':'공급가액'}</small></span>
     </button>
    </li>)}</ul>
    <div className="sale-card">
     <h3>{invoice.supplierName||invoice.supplierNo}</h3>
     <p>작성일 {invoice.date}{invoice.issuedDate&&' · 발급일 '+invoice.issuedDate}</p>
     <p>공급가액 {won(invoice.net)} · 세액 {won(invoice.tax)}</p>
     <p>승인번호 {displayApproval(invoice.approvalNo)}</p>
     {!!linked.length&&<p>기존 승인번호 연결 · {linked.map(contract=>contract.code).join(', ')}</p>}
    </div>
   </div>
   <div>
    <h3>PPL 계약 후보</h3>
    <input className="form-control" aria-label="PPL 계약 검색" placeholder="계약번호, 프로그램, 거래처, 방송일 검색" value={query} onChange={event=>setQuery(event.target.value)}/>
    <p>{selected.length}개 계약 선택 · 합산 발행은 관련 계약을 함께 선택하세요.</p>
    {!candidates.length&&<p>같은 공급자 후보가 없습니다. 계약을 직접 검색할 수 있습니다.</p>}
    <div className="tax-match-candidates">{candidates.map(({contract,supplier,amount})=><label className="tax-match-candidate" key={contract.id}>
     <input type="checkbox" checked={selected.includes(contract.id)} onChange={()=>toggle(contract.id)}/>
     <span><strong>{contractTitle(contract)} · {contract.code}</strong><small>{contract.party} · {contract.channel} · {supplier&&amount?'거래처·금액 일치':supplier?'거래처 일치':'거래처 확인 필요'}</small>
     <small>{pplAirings(contract,items,finance.allocations).map(airingLabel).join(' / ')||'방송 일정 미등록'}</small></span>
     <span>{won(contract.net)}<small>세액 {won(contract.tax)}</small></span>
    </label>)}</div>
   </div>
  </div>
  {message&&<p role="status">{message}</p>}
   </div>
   <footer className="tax-match-footer">
    <span>{rows.length}건 중 {count}건 매칭 선택</span>
    <div className="finance-actions">
     <button className="secondary-button" disabled={!count||working} onClick={()=>void download()}>회계 전달 파일 내려받기</button>
     <button className="primary-button" disabled={!count} onClick={()=>{onHandoff({rows,matches});dialog.current?.close();setMessage('이 브라우저의 회계 검토 메뉴에 매칭 초안을 준비했습니다.');}}>매칭 완료 · 임시 전달</button>
    </div>
   </footer>
  </dialog>
 </>;
}


export function TaxAccountingReview({finance,items,draft}:{finance:Finance;items:Item[];draft:TaxReviewDraft|null}){
 const [workbook,setWorkbook]=useState<TaxInvoice[]>([]);
 const [imported,setImported]=useState<TaxReviewDraft|null>(null);
 const [message,setMessage]=useState('');
 const [working,setWorking]=useState(false);
 const {rows,matches}=imported||draft||{rows:[],matches:{}};

 async function openWorkbook(file:File|undefined){
  if(!file)return;
  setWorking(true);setMessage('');setWorkbook([]);setImported(null);
  try{
   const {readTaxWorkbook}=await import('@/lib/tax-workbook');
   setWorkbook(await readTaxWorkbook(await file.arrayBuffer(),file.name));
   setMessage('원본 엑셀을 읽었습니다. 회계 전달 파일을 선택하세요.');
  }catch{setMessage('원본 엑셀을 읽지 못했습니다.');}
  finally{setWorking(false);}
 }

 async function openReview(file:File|undefined){
  if(!file)return;
  setWorking(true);setMessage('');
  try{
   if(file.size>1024*1024)throw Error();
   const data=JSON.parse(await file.text());
   if(data.version!==1||!Array.isArray(data.matches)||!data.matches.length)throw Error();
   const ids=new Map(finance.contracts.map(contract=>[contract.id,contract]));
   let importedDraft:TaxReviewDraft|null=null;
   for(const supplier of new Set(workbook.map(row=>row.supplierNo))){
    const scoped=workbook.filter(row=>row.supplierNo===supplier);
    if(data.source!==await fingerprint(scoped))continue;
    const next:Matches={};
    for(const entry of data.matches){
     if(!Array.isArray(entry)||entry.length!==2)throw Error();
     const [index,contracts]=entry;
     if(!Number.isInteger(index)||index<0||index>=scoped.length||index in next||!Array.isArray(contracts)||!contracts.length||contracts.some(id=>company(ids.get(id)?.businessNo||'')!==supplier))throw Error();
     next[index]=[...new Set<string>(contracts)];
    }
    importedDraft={rows:scoped,matches:next};
    break;
   }
   if(!importedDraft)throw Error();
   setImported(importedDraft);
  }catch{setMessage('전달 파일을 읽지 못했습니다. 매칭에 사용한 원본 엑셀과 PPL 계약을 확인해 주세요.');}
  finally{setWorking(false);}
 }
 const approvals=new Map<string,string[]>();
 for(const [row,ids] of Object.entries(matches)){
  for(const id of ids)approvals.set(id,[...(approvals.get(id)||[]),rows[Number(row)].approvalNo]);
 }
 const preview={...finance,invoices:[],taxImports:rows,contracts:finance.contracts.map(contract=>({...contract,invoiceApprovals:approvals.get(contract.id)||[]}))};
 const reviewed=new Set<string>();
 const groups=preview.contracts.flatMap(contract=>{
  if(!approvals.has(contract.id)||reviewed.has(contract.id))return [];
  const group=reconcileContract(preview,contract);
  group.members.forEach(member=>reviewed.add(member.id));
  return [group];
 });

 return <section className="finance-card tax-workspace tax-match-review">
  <h2>PPL 세금계산서 검토</h2>
  <p>매칭 초안의 계약 금액과 계산서 금액, 방송월별 배분을 확인합니다. 검토 내용은 운영 데이터에 저장되지 않습니다.</p>
  <div className="finance-actions">
   <label className="secondary-button tax-file">원본 엑셀 열기<input type="file" accept=".xls,.xlsx" disabled={working} onChange={event=>{void openWorkbook(event.target.files?.[0]);event.target.value='';}}/></label>
   <label className="secondary-button tax-file">회계 전달 파일 열기<input type="file" accept=".json" disabled={working||!workbook.length} onChange={event=>{void openReview(event.target.files?.[0]);event.target.value='';}}/></label>
  </div>
  {message&&<p role="status">{message}</p>}
   {!groups.length&&<p>PPL팀이 전달한 초안이 없습니다. 원본 엑셀과 회계 전달 파일을 차례로 열어 주세요.</p>}
   {groups.map(group=>{
    const members=new Set(group.members.map(member=>member.id));
    const months=new Map<string,number>();
    for(const allocation of finance.allocations){
     if(!allocation.active||!members.has(allocation.contractId))continue;
     const broadcast=items.find(item=>item.id===allocation.broadcastId);
     const month=(broadcast?.result?.actualDate||broadcast?.date||'').slice(0,7)||'방송월 미등록';
     months.set(month,(months.get(month)||0)+Number(allocation.net));
    }
    return <article className="sale-card" key={group.members[0].id}>
     <h3>{group.members.map(member=>member.code+' · '+contractTitle(member)).join(' / ')}</h3>
     <p><strong>{group.status}</strong> · 계산서 {group.found.length}건</p>
     <p>공급가액 · 계약 {won(group.expectedNet)} / 계산서 {won(group.actualNet)} / 차이 {won(group.netGap)}</p>
     <p>세액 · 계약 {won(group.expectedTax)} / 계산서 {won(group.actualTax)} / 차이 {won(group.taxGap)}</p>
     {group.found.map(row=><p key={row.approvalNo}>{row.issuedDate||row.date} · {row.supplierName} · {displayApproval(row.approvalNo)}</p>)}
     <p><strong>방송월별 배분 공급가액</strong> · {months.size?[...months].sort(([a],[b])=>a.localeCompare(b)).map(([month,net])=>month+' '+won(net)).join(' / '):'등록된 방송 배분 없음'}</p>
    </article>;
   })}

 </section>;
}
