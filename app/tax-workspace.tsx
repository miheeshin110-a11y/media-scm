'use client';
import {useEffect,useState} from 'react';
import type {Contract,Finance} from '@/lib/finance-model';
import type {Item} from '@/lib/scm-model';
import {approvalValid,displayApproval,invoiceRefs,mergeTaxInvoices,normalizeApproval,parseHometaxRows,reconcileContract,type TaxInvoice} from '@/lib/tax-reconcile';
import {TaxMatchPreview} from './tax-match-preview';
import type {FinanceSave} from './finance-entry';
const previewStorageKey='scm-tax-match-preview';
const won=(n:string|number)=>Number(n).toLocaleString('ko-KR')+'원';
type Props={finance:Finance;items:Item[];contract?:Contract;save:FinanceSave;busy:boolean;canWrite:boolean};
export function TaxWorkspace({finance,items,contract,save,busy,canWrite}:Props){
 const [pending,setPending]=useState<TaxInvoice[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false),[filter,setFilter]=useState('전체'),[search,setSearch]=useState('');
 const [hasSavedPreview,setHasSavedPreview]=useState(false);
 const disabled=busy||loading||!canWrite;
 useEffect(()=>{
  try{
   const saved=sessionStorage.getItem(previewStorageKey);
   if(!saved)return;
   const {rows}=mergeTaxInvoices([],JSON.parse(saved));
   setPending(rows);
   setHasSavedPreview(true);
  }catch{
   setError('임시 보관한 목록을 열지 못했습니다. 원본 엑셀을 다시 선택해 주세요.');
  }
 },[]);

 function keepPreview(){
  try{
   sessionStorage.setItem(previewStorageKey,JSON.stringify(pending));
   setHasSavedPreview(true);
   setError('');
   setNotice(`계산서 ${pending.length}건을 이 탭에 임시 보관했습니다.`);
  }catch{
   setError('이 브라우저 탭에 목록을 임시 보관하지 못했습니다.');
  }
 }

 function clearPreview(){
  try{
   sessionStorage.removeItem(previewStorageKey);
   setHasSavedPreview(false);
   setPending([]);
   setError('');
   setNotice('이 탭의 임시 목록을 지웠습니다.');
  }catch{
   setError('이 탭의 임시 목록을 지우지 못했습니다.');
  }
 }

 const upload=async(file:File|undefined)=>{if(!file)return;setError('');setNotice('');setPending([]);setLoading(true);try{
  if(!/\.(xls|xlsx)$/i.test(file.name)||file.size>5*1024*1024)throw new Error('5MB 이하의 홈택스 XLS 또는 XLSX 파일을 선택해 주세요.');
  const X=await import('xlsx'),book=X.read(await file.arrayBuffer(),{type:'array',cellDates:false,sheetRows:10002});let rows:TaxInvoice[]=[];
  for(const name of book.SheetNames){const matrix=X.utils.sheet_to_json<unknown[]>(book.Sheets[name],{header:1,raw:false,defval:''});if(!matrix.some(r=>r.some(v=>String(v).replace(/\s/g,'')==='승인번호')))continue;if(matrix.length>10000)throw new Error('파일은 10,000행 이하로 나누어 올려 주세요.');rows.push(...parseHometaxRows(matrix,file.name+' / '+name));}
  if(!rows.length)throw new Error('홈택스 세금계산서 목록을 찾지 못했습니다.');
  rows=mergeTaxInvoices([],rows).rows;setPending(rows);setNotice(`계산서 ${rows.length}건 읽음`);
 }catch(e){setError(e instanceof Error?e.message:'엑셀을 읽지 못했습니다.');}finally{setLoading(false)}};
 const supplierNo=contract?.businessNo.replace(/[-\s]/g,'')||'';
 const validSupplier=/^\d{10}$/.test(supplierNo);
 const visibleRows=validSupplier?pending.filter(row=>row.supplierNo===supplierNo):[];
 const scopedFinance={
  ...finance,
  contracts:validSupplier?finance.contracts.filter(row=>row.businessNo.replace(/[-\s]/g,'')===supplierNo):[],
  taxImports:validSupplier?(finance.taxImports||[]).filter(row=>row.supplierNo===supplierNo):[],
  invoices:validSupplier?finance.invoices.filter(row=>row.businessNo.replace(/[-\s]/g,'')===supplierNo):[],
 };
 const seen=new Set<string>();
 const groups=scopedFinance.contracts.map(c=>({c,r:reconcileContract(scopedFinance,c)})).filter(({r})=>{
  const key=r.members.map(x=>x.id).sort().join('|');
  if(seen.has(key))return false;
  seen.add(key);
  return true;
 });
 const shown=groups.filter(({c,r})=>(filter==='전체'||(filter==='확인 필요'?r.status!=='대조 일치':r.status===filter))&&[c.name,...r.members.map(m=>m.name),...r.refs].join(' ').replace(/[-\s]/g,'').includes(search.replace(/[-\s]/g,'')));
 const linked=new Set(scopedFinance.contracts.flatMap(c=>invoiceRefs(scopedFinance,c)));
 const unmatched=scopedFinance.taxImports.filter(row=>!linked.has(row.approvalNo));
 return <div className="tax-workspace">
  <section className="tax-upload"><div><h3>계산서 매칭 미리보기</h3><p>엑셀을 열어 PPL 계약을 선택하고 회계 검토용으로 전달하세요. 목록을 임시 보관하면 같은 탭에서 새로고침해도 다시 열립니다. 계약 선택은 회계 검토 파일로 내려받을 수 있습니다.</p></div><label className="secondary-button tax-file">{loading?'엑셀 읽는 중…':'엑셀 파일 선택'}<input type="file" accept=".xls,.xlsx" disabled={loading} onChange={e=>{void upload(e.target.files?.[0]);e.target.value=''}}/></label></section>
  {error&&<p role="alert" className="tax-error">{error}</p>}{notice&&<p role="status" className="result-note">{notice}</p>}
  {(pending.length>0||hasSavedPreview)&&<div className="finance-actions">
   {pending.length>0&&<button className="secondary-button" disabled={loading} onClick={keepPreview}>이 탭에 목록 임시 보관</button>}
   {hasSavedPreview&&<button className="text-button" disabled={loading} onClick={clearPreview}>임시 목록 지우기</button>}
  </div>}
  {pending.length>0&&(visibleRows.length>0
   ? <TaxMatchPreview key={supplierNo} finance={scopedFinance} items={items} rows={visibleRows} sourceRows={pending} onClose={()=>{setPending([]);setNotice('')}}/>
   : <p className="result-note">{validSupplier?'선택한 계약의 공급자 사업자등록번호와 일치하는 계산서가 없습니다.':'사업자등록번호가 있는 PPL 계약을 상단에서 선택하세요.'}</p>)}
  <details className="tax-extra"><summary>기존 승인번호 등록 및 저장된 대조 결과</summary>
  {contract?<InvoiceReferences key={contract.id+':'+JSON.stringify(invoiceRefs(finance,contract))} finance={finance} contract={contract} save={save} disabled={disabled}/>:<p className="result-note">승인번호를 등록하려면 상단에서 PPL 계약을 선택하세요.</p>}
  {visibleRows.length>0&&canWrite&&<button className="secondary-button" disabled={disabled} onClick={async()=>{
   const result=await save({kind:'taxImport',data:{rows:visibleRows}});
   if(result){setPending([]);setNotice('엑셀 내역을 저장했습니다.');}
  }}>이 거래처 계산서를 운영 목록에 저장</button>}
  <div className="tax-results-heading"><h3>대조 결과 <small>이 거래처 업로드 보관 {scopedFinance.taxImports.length}건</small></h3><select className="form-control" aria-label="대조 상태 필터" value={filter} onChange={e=>setFilter(e.target.value)}>{['전체','확인 필요','대조 일치','번호 미등록','엑셀 확인 대기','금액 차이','수정계산서 확인','거래처 확인'].map(x=><option key={x}>{x}</option>)}</select><input className="form-control" aria-label="계약 또는 승인번호 검색" placeholder="PPL명 · 승인번호 검색" value={search} onChange={e=>setSearch(e.target.value)}/></div>
  <div className="tax-table-wrap"><table className="tax-table"><thead><tr><th>PPL</th><th>계산서 승인번호</th><th>계약 공급가액</th><th>엑셀 공급가액</th><th>대조 상태</th></tr></thead><tbody>{shown.map(({c,r})=><tr key={c.id}><td>{r.members.map(m=><div key={m.id}>{m.program||m.name}<small>{m.code} · {m.party}</small></div>)}{r.members.length>1&&<small>동일 계산서 연결 PPL {r.members.length}건 합산</small>}</td><td>{r.refs.length?r.refs.map(n=><div key={n}>{displayApproval(n)}{r.missing.includes(n)&&<small>업로드 내역 없음</small>}</div>):'미등록'}</td><td>{won(r.expectedNet)}<small>세액 {won(r.expectedTax)}</small></td><td>{r.found.length?won(r.actualNet):'대기'}{r.found.length>0&&<small>세액 {won(r.actualTax)}</small>}</td><td><b className="tax-status" data-ok={r.status==='대조 일치'}>{r.status}</b>{r.status==='금액 차이'&&<small>공급가액 차이 {won(r.netGap)}<br/>세액 차이 {won(r.taxGap)}</small>}{r.status==='수정계산서 확인'&&<small>원본·수정 발행 내역 확인 필요</small>}{r.status==='거래처 확인'&&<small>계약 거래처와 계산서 사업자번호 확인</small>}</td></tr>)}</tbody></table>{!shown.length&&<p className="result-note">표시할 대조 대상이 없습니다.</p>}</div>
  <p className="result-note">‘대조 일치’는 승인번호·사업자번호·공급가액·세액이 맞는 상태입니다. 지급 완료를 뜻하지 않습니다. 여러 PPL이 같은 계산서를 쓰면 계약 총액을 합산해 비교합니다.</p>
  {unmatched.length>0&&<details className="tax-extra"><summary>PPL에 번호가 등록되지 않은 엑셀 내역 {unmatched.length}건</summary><p>같은 공급자의 계산서입니다. 해당 PPL에 필요한 승인번호를 연결하세요.</p><TaxRows rows={unmatched}/></details>}
  {scopedFinance.invoices.length>0&&<details className="tax-extra"><summary>기존 수기 계산서 내역 {scopedFinance.invoices.length}건</summary><p>기존 기록은 보관됩니다. 엑셀 대조는 승인번호를 기준으로 별도 확인합니다.</p>{scopedFinance.invoices.map(x=><p key={x.id}>{x.date} · {x.party} · {displayApproval(x.approvalNo)} · {won(x.net)} · {x.active?'기존 등록':'등록 취소'}</p>)}</details>}
  </details>
 </div>;
}
function InvoiceReferences({finance,contract,save,disabled}:{finance:Finance;contract:Contract;save:FinanceSave;disabled:boolean}){
 const [refs,setRefs]=useState<string[]>(invoiceRefs(finance,contract).length?invoiceRefs(finance,contract).map(displayApproval):['']),[error,setError]=useState('');
 return <section className="tax-refs"><div><h3>실무자 · 계산서 승인번호</h3><p>{contract.program||contract.name} · 공급가액 {won(contract.net)}. 금액은 다시 입력하지 않습니다.</p></div><div className="tax-ref-lines">{refs.map((n,i)=><div key={i}><input aria-label={'계산서 승인번호 '+(i+1)} className="form-control" disabled={disabled} maxLength={40} value={n} placeholder="승인번호 24자리 · 영문/숫자, 하이픈 포함 가능" onChange={e=>setRefs(old=>old.map((s,j)=>j===i?e.target.value:s))}/>{refs.length>1&&<button className="text-button" disabled={disabled} onClick={()=>setRefs(old=>old.filter((_,j)=>j!==i))}>제외</button>}</div>)}</div><div className="finance-actions"><button className="primary-button" disabled={disabled} onClick={async()=>{const values=refs.map(normalizeApproval).filter(Boolean);if(values.some(n=>!approvalValid(n))){setError('홈택스 승인번호 24자리를 입력해 주세요. 기안번호와 다릅니다.');return;}setError('');await save({kind:'invoiceRefs',data:{contractId:contract.id,approvals:values}})}}>승인번호 저장</button><button className="text-button" disabled={disabled||refs.length>=20} onClick={()=>setRefs(old=>[...old,''])}>분할 발행 · 번호 추가</button></div>{error&&<p role="alert" className="tax-error">{error}</p>}</section>;
}
function TaxRows({rows}:{rows:TaxInvoice[]}){const [limit,setLimit]=useState(30);return <><div className="tax-table-wrap"><table className="tax-table"><thead><tr><th>작성일 · 승인번호</th><th>공급자 → 공급받는자</th><th>공급가액 / 세액</th><th>분류</th></tr></thead><tbody>{rows.slice(0,limit).map(r=><tr key={r.approvalNo}><td>{r.date}<small>{displayApproval(r.approvalNo)}</small></td><td>{r.supplierName}<small>{r.supplierNo} → {r.customerName} ({r.customerNo})</small></td><td>{won(r.net)}<small>세액 {won(r.tax)}</small></td><td>{r.kind||'일반'}{r.originalApprovalNo&&<small>원본 {displayApproval(r.originalApprovalNo)}</small>}</td></tr>)}</tbody></table></div>{rows.length>limit&&<button className="secondary-button" onClick={()=>setLimit(n=>n+100)}>100건 더 보기 · 전체 {rows.length}건</button>}</>}
