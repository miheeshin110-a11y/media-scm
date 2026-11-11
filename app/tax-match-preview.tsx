'use client';

import {useId,useRef,useState} from 'react';
import type {Contract,Finance} from '@/lib/finance-model';
import type {Item} from '@/lib/scm-model';
import {airingLabel,pplAirings} from '@/lib/ppl-airings';
import {displayApproval,invoiceRefs,pendingTaxInvoices,prepareTaxConfirmation,type TaxInvoice} from '@/lib/tax-reconcile';

import type {FinanceSave} from './finance-entry';

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
 const pending=pendingTaxInvoices(rows,finance.taxImports||[]);
 const skipped=rows.length-pending.length;
 return <>
  {skipped>0&&<p className="result-note" role="status">이미 확정된 계산서 {skipped}건을 승인번호로 확인해 제외했습니다.</p>}
  {pending.length>0&&<TaxMatchDialog key={JSON.stringify(pending.map(row=>row.approvalNo))} finance={finance} items={items} rows={pending} sourceRows={rows} onClose={onClose} onHandoff={onHandoff}/>}
 </>;
}

function TaxMatchDialog({finance,items,rows,sourceRows,onClose,onHandoff}:{finance:Finance;items:Item[];rows:TaxInvoice[];sourceRows:TaxInvoice[];onClose:()=>void;onHandoff:(draft:TaxReviewDraft)=>void}){
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
   const sourceIndexes=new Map(sourceRows.map((row,index)=>[row.approvalNo,index]));
   const selected=Object.entries(matches).filter(([,ids])=>ids.length)
    .map(([index,ids])=>[sourceIndexes.get(rows[Number(index)].approvalNo),ids]);
   const data={version:1,source:await fingerprint(sourceRows),matches:selected};
   const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
   const link=document.createElement('a');
   link.href=url;link.download='PPL-회계-검토용.json';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   setMessage('검토 파일을 받았습니다. 같은 원본 엑셀과 함께 다시 불러올 수 있습니다.');
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
     <button className="secondary-button" disabled={!count||working} onClick={()=>void download()}>매칭 파일 내려받기</button>
     <button className="primary-button" disabled={!count} onClick={()=>{dialog.current?.close();onHandoff({rows,matches});}}>매칭 확인으로 이동</button>
    </div>
   </footer>
  </dialog>
 </>;
}


export function TaxAccountingReview({finance,items,draft,save,canConfirm,busy,onDraftChange}:{finance:Finance;items:Item[];draft:TaxReviewDraft|null;save:FinanceSave;canConfirm:boolean;busy:boolean;onDraftChange:(draft:TaxReviewDraft|null)=>void}){
 const [workbook,setWorkbook]=useState<TaxInvoice[]>([]);
 const [imported,setImported]=useState<TaxReviewDraft|null>(null);
 const [message,setMessage]=useState('');
 const [working,setWorking]=useState(false);
 const source=imported||draft;
 const {rows,matches}=source||{rows:[],matches:{}};
 const [checked,setChecked]=useState<{source:TaxReviewDraft|null;ids:Set<string>}>({source:null,ids:new Set()});
 const checkedIds=checked.source===source?checked.ids:new Set<string>();

 async function openWorkbook(file:File|undefined){
  if(!file)return;
  setWorking(true);setMessage('');setWorkbook([]);setImported(null);setConfirming(false);
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
   setConfirming(false);
  }catch{setMessage('전달 파일을 읽지 못했습니다. 매칭에 사용한 원본 엑셀과 PPL 계약을 확인해 주세요.');}
  finally{setWorking(false);}
 }
 const draftMatches=Object.entries(matches)
  .filter(([,contractIds])=>contractIds.length)
  .map(([index,contractIds])=>({invoice:rows[Number(index)],contractIds}));
 const unconfirmed=new Set(pendingTaxInvoices(draftMatches.map(match=>match.invoice),finance.taxImports||[]).map(row=>row.approvalNo));
 const selection=draftMatches.filter(match=>unconfirmed.has(match.invoice.approvalNo));
 const skipped=draftMatches.length-selection.length;
 let groups:ReturnType<typeof prepareTaxConfirmation>['groups']=[];
 let reviewError='';
 try{
  if(selection.length)groups=prepareTaxConfirmation(finance,selection).groups;
 }catch(error){
  reviewError=error instanceof Error?error.message:'계산서 매칭을 확인해 주세요.';
 }
 const eligible=groups.filter(group=>group.status==='대조 일치');
 const selectedApprovals=new Set(eligible.filter(group=>checkedIds.has(group.members[0].id)).flatMap(group=>group.refs));
 const selectedMatches=selection.filter(match=>selectedApprovals.has(match.invoice.approvalNo));
 const pendingCount=selection.length-selectedMatches.length;
 const ready=selectedMatches.length>0;
 const [confirming,setConfirming]=useState(false);

 function selectForConfirmation(ids:Set<string>){
  setChecked({source,ids});
  setConfirming(false);
 }

 async function confirm(){
  if(!canConfirm||!ready||working||busy)return;
  setWorking(true);
  try{
   if(!await save({kind:'taxConfirm',data:{matches:selectedMatches}}))return;
   const remainingMatches=Object.fromEntries(Object.entries(matches).filter(([index])=>unconfirmed.has(rows[Number(index)].approvalNo)&&!selectedApprovals.has(rows[Number(index)].approvalNo)));
   const remaining=pendingCount?{rows,matches:remainingMatches}:null;
   if(imported)setImported(remaining);
   else onDraftChange(remaining);
   setChecked({source:null,ids:new Set()});
   setConfirming(false);
   setMessage('계산서 '+selectedMatches.length+'건을 확정했습니다. 구글시트 전송 상태를 확인할 수 있습니다.');
  }finally{setWorking(false);}
 }

 return <section className="tax-workspace tax-match-review">
  <header className="tax-review-header">
   <div><h2>PPL 세금계산서 검토</h2><p>계약과 계산서의 금액 및 방송월별 배분을 확인하세요.</p></div>
   <div className="finance-actions">
   <label className="secondary-button tax-file">원본 엑셀 열기<input type="file" accept=".xls,.xlsx" disabled={working} onChange={event=>{void openWorkbook(event.target.files?.[0]);event.target.value='';}}/></label>
   <label className="secondary-button tax-file">기존 매칭 파일 열기<input type="file" accept=".json" disabled={working||!workbook.length} onChange={event=>{void openReview(event.target.files?.[0]);event.target.value='';}}/></label>
  </div>
  </header>
  {message&&<p role="status">{message}</p>}
  {reviewError&&<p role="alert">{reviewError}</p>}
  {skipped>0&&<p className="result-note" role="status">이미 확정된 계산서 {skipped}건을 승인번호로 확인해 제외했습니다.</p>}
   {!draftMatches.length&&<p>검토할 초안이 없습니다. PPL 등록·배분에서 계산서를 매칭하거나 기존 매칭 파일을 열어 주세요.</p>}
  {groups.length>0&&<AccountingReviewList groups={groups} allocations={finance.allocations} items={items} invoiceCount={selection.length} checkedIds={checkedIds}
   onToggle={canConfirm&&!working&&!busy?(id)=>{const next=new Set(checkedIds);if(next.has(id))next.delete(id);else next.add(id);selectForConfirmation(next);}:undefined}
   onSelectAll={canConfirm&&eligible.length>0&&!working&&!busy?()=>selectForConfirmation(new Set(eligible.map(group=>group.members[0].id))):undefined}/>}

  {selection.length>0&&<footer className="tax-review-save">
   <div><strong>{confirming?'선택한 계산서 '+selectedMatches.length+'건 저장 확인':'저장 대상 · 선택 '+selectedMatches.length+'건'}</strong>
    <small>{!canConfirm?'팀장 권한이 있는 계정에서 확정할 수 있습니다.':ready?'선택한 건은 구글시트에 반영됩니다. 검토 목록에 남는 계산서 '+pendingCount+'건':eligible.length?'대조가 일치한 계산서를 선택하세요.':'확정할 수 있는 대조 일치 건이 없습니다.'}</small>
   </div>
   {canConfirm&&(confirming?<div className="finance-actions">
    <button className="secondary-button" disabled={working} onClick={()=>setConfirming(false)}>취소</button>
    <button className="primary-button" disabled={!ready||working||busy} onClick={()=>void confirm()}>{working?'저장 중…':'확정 및 구글시트 반영'}</button>
   </div>:<button className="primary-button" disabled={!ready||working||busy} onClick={()=>setConfirming(true)}>계산서 확정</button>)}
  </footer>}

 </section>;
}


type ReviewGroup=ReturnType<typeof prepareTaxConfirmation>['groups'][number];
const reviewPageSize=10;

function AccountingReviewList({groups,allocations,items,invoiceCount,checkedIds,onToggle,onSelectAll}:{groups:ReviewGroup[];allocations:Finance['allocations'];items:Item[];invoiceCount:number;checkedIds:Set<string>;onToggle?:(id:string)=>void;onSelectAll?:()=>void}){
 const [query,setQuery]=useState('');
 const [filter,setFilter]=useState<'all'|'check'|'matched'>('all');
 const [page,setPage]=useState(0);
 const [selected,setSelected]=useState<string|null>(null);
 const checkCount=groups.filter(group=>group.status!=='대조 일치').length;
 const search=query.trim().toLowerCase().replace(/[-\s]/g,'');
 const visible=groups.filter(group=>{
  const matched=group.status==='대조 일치';
  if((filter==='check'&&matched)||(filter==='matched'&&!matched))return false;
  if(!search)return true;
  const fields=[...group.members.flatMap(contract=>[contract.code,contractTitle(contract),contract.party]),...group.refs];
  return fields.some(field=>field.toLowerCase().replace(/[-\s]/g,'').includes(search));
 }).sort((a,b)=>Number(a.status==='대조 일치')-Number(b.status==='대조 일치')||a.members[0].code.localeCompare(b.members[0].code));
 const lastPage=Math.max(0,Math.ceil(visible.length/reviewPageSize)-1);
 const currentPage=Math.min(page,lastPage);
 const start=currentPage*reviewPageSize;
 const pageRows=visible.slice(start,start+reviewPageSize);
 const active=pageRows.find(group=>group.members[0].id===selected)||pageRows[0];

 return <section className="tax-review-list" aria-label="계산서 대조 목록">
  <div className="tax-review-toolbar">
   <div className="tax-review-totals">
    <span>계산서 <b>{invoiceCount}</b></span>
    <span data-tone="matched">대조 일치 <b>{groups.length-checkCount}</b></span>
    <span data-tone={checkCount?'check':undefined}>확인 필요 <b>{checkCount}</b></span>
   </div>
   {onSelectAll&&<button className="secondary-button" onClick={onSelectAll}>대조 일치 전체 선택</button>}
   <label><span>대조 상태</span><select className="form-control" value={filter} onChange={event=>{setFilter(event.target.value as typeof filter);setPage(0);setSelected(null);}}>
    <option value="all">전체</option><option value="check">확인 필요</option><option value="matched">대조 일치</option>
   </select></label>
   <label><span>검색</span><input className="form-control" placeholder="PPL명, 거래처, 승인번호" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);setSelected(null);}}/></label>
  </div>
  <div className="tax-review-layout"><div className="tax-review-queue">
  <div className="tax-table-wrap tax-review-table-wrap" role="region" aria-label="계약과 계산서 비교" tabIndex={0}>
   <table className="tax-table tax-review-table">
    <thead><tr><th scope="col">선택</th><th scope="col">PPL 계약 · 거래처</th><th scope="col">계산서</th><th scope="col">공급가액</th><th scope="col">대조 상태</th></tr></thead>
    <tbody>
     {pageRows.map(group=>{
      const first=group.members[0];
      const isActive=active===group;
      return <tr key={first.id} data-active={isActive}>
       <td><input type="checkbox" aria-label={contractTitle(first)+' 확정 대상 선택'} disabled={!onToggle||group.status!=='대조 일치'} checked={group.status==='대조 일치'&&checkedIds.has(first.id)} onChange={()=>onToggle?.(first.id)}/></td>
       <td><button className="tax-review-select" aria-pressed={isActive} onClick={()=>setSelected(first.id)}><strong>{contractTitle(first)}</strong>{group.members.length>1&&' 외 '+(group.members.length-1)+'건'}<small>{first.code} · {first.party}</small></button></td>
       <td>{group.found.length}건{group.missing.length>0&&<small>자료 없음 {group.missing.length}건</small>}</td>
       <td className="tax-review-amount">{won(group.actualNet)}</td>
       <td><span className="tax-review-status" data-tone={group.status==='대조 일치'?'matched':'check'}>{group.status}</span></td>
      </tr>;
     })}
     {!pageRows.length&&<tr><td colSpan={5}>검색 조건에 맞는 대조 대상이 없습니다.</td></tr>}
    </tbody>
   </table>
  </div>
  <div className="tax-review-pages">
   <span aria-live="polite">{visible.length?start+1:0}–{start+pageRows.length} / {visible.length}개 대조 대상</span>
   {lastPage>0&&<>
    <button className="secondary-button" disabled={currentPage===0} onClick={()=>{setPage(currentPage-1);setSelected(null);}}>이전</button>
    <button className="secondary-button" disabled={currentPage===lastPage} onClick={()=>{setPage(currentPage+1);setSelected(null);}}>다음</button>
   </>}
  </div>
  </div>
  {active&&<AccountingReviewDetails group={active} allocations={allocations} items={items}/>}
  </div>
 </section>;
}

function AccountingReviewDetails({group,allocations,items}:{group:ReviewGroup;allocations:Finance['allocations'];items:Item[]}){
 const memberIds=new Set(group.members.map(member=>member.id));
 const months=new Map<string,number>();
 for(const allocation of allocations){
  if(!allocation.active||!memberIds.has(allocation.contractId))continue;
  const broadcast=items.find(item=>item.id===allocation.broadcastId);
  const month=(broadcast?.result?.actualDate||broadcast?.date||'').slice(0,7)||'방송월 미등록';
  months.set(month,(months.get(month)||0)+Number(allocation.net));
 }
 const first=group.members[0];
 return <section className="tax-review-detail" aria-label="선택한 계약 대조 상세">
  <header><div><h3>{contractTitle(first)}{group.members.length>1&&' 외 '+(group.members.length-1)+'건'}</h3><p>{first.code} · {first.party}</p></div>
   <span className="tax-review-status" data-tone={group.status==='대조 일치'?'matched':'check'}>{group.status}</span>
  </header>
  <table className="tax-review-comparison">
   <thead><tr><th scope="col">금액 대조</th><th scope="col">공급가액</th><th scope="col">세액</th></tr></thead>
   <tbody>
    <tr><th scope="row">PPL 계약</th><td>{won(group.expectedNet)}</td><td>{won(group.expectedTax)}</td></tr>
    <tr><th scope="row">계산서</th><td>{won(group.actualNet)}</td><td>{won(group.actualTax)}</td></tr>
    <tr><th scope="row">차이</th><td data-difference={group.netGap!==0}>{won(group.netGap)}</td><td data-difference={group.taxGap!==0}>{won(group.taxGap)}</td></tr>
   </tbody>
  </table>
  <div className="tax-review-evidence">
   <div><h4>계산서 발행일 · 승인번호</h4>
    {group.found.map(row=><p key={row.approvalNo}>{row.issuedDate||row.date}<small>{displayApproval(row.approvalNo)}</small></p>)}
    {group.missing.map(number=><p key={number}>{displayApproval(number)} · 자료 없음</p>)}
   </div>
   <div><h4>방송월별 배분 공급가액</h4>
    {months.size?[...months].sort(([a],[b])=>a.localeCompare(b)).map(([month,net])=><p key={month}>{month} · {won(net)}</p>):<p>등록된 방송 배분 없음</p>}
   </div>
   {group.members.length>1&&<div><h4>함께 연결된 계약</h4>{group.members.map(member=><p key={member.id}>{member.code} · {contractTitle(member)}</p>)}</div>}
  </div>
 </section>;
}
