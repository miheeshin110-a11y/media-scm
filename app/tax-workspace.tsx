'use client';
import {useEffect,useState} from 'react';
import type {Contract,Finance} from '@/lib/finance-model';
import type {Item} from '@/lib/scm-model';
import {approvalValid,displayApproval,invoiceRefs,mergeTaxInvoices,normalizeApproval,parseHometaxRows,type TaxInvoice} from '@/lib/tax-reconcile';
import {TaxMatchPreview,type TaxReviewDraft} from './tax-match-preview';
import type {FinanceSave} from './finance-entry';
const previewStorageKey='scm-tax-match-preview';
const won=(n:string|number)=>Number(n).toLocaleString('ko-KR')+'원';
type Props={finance:Finance;items:Item[];contract?:Contract;save:FinanceSave;busy:boolean;canWrite:boolean;onHandoff:(draft:TaxReviewDraft)=>void};
export function TaxWorkspace({finance,items,contract,save,busy,canWrite,onHandoff}:Props){
 const [pending,setPending]=useState<TaxInvoice[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false);
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
 return <div className="tax-workspace">
  <section className="tax-upload"><div><h3>계산서 매칭 미리보기</h3><p>엑셀을 열어 PPL 계약을 선택하고 회계 검토용으로 전달하세요. 목록을 임시 보관하면 같은 탭에서 새로고침해도 다시 열립니다. 매칭 초안은 회계팀 메뉴에서 검토합니다.</p></div><label className="secondary-button tax-file">{loading?'엑셀 읽는 중…':'엑셀 파일 선택'}<input type="file" accept=".xls,.xlsx" disabled={loading} onChange={e=>{void upload(e.target.files?.[0]);e.target.value=''}}/></label></section>
  {error&&<p role="alert" className="tax-error">{error}</p>}{notice&&<p role="status" className="result-note">{notice}</p>}
  {(pending.length>0||hasSavedPreview)&&<div className="finance-actions">
   {pending.length>0&&<button className="secondary-button" disabled={loading} onClick={keepPreview}>이 탭에 목록 임시 보관</button>}
   {hasSavedPreview&&<button className="text-button" disabled={loading} onClick={clearPreview}>임시 목록 지우기</button>}
  </div>}
  {pending.length>0&&(visibleRows.length>0
   ? <TaxMatchPreview key={supplierNo} finance={scopedFinance} items={items} rows={visibleRows} onHandoff={onHandoff} onClose={()=>{setPending([]);setNotice('')}}/>
   : <p className="result-note">{validSupplier?'선택한 계약의 공급자 사업자등록번호와 일치하는 계산서가 없습니다.':'사업자등록번호가 있는 PPL 계약을 상단에서 선택하세요.'}</p>)}
  <details className="tax-extra"><summary>승인번호로 직접 연결</summary>
  {contract?<InvoiceReferences key={contract.id+':'+JSON.stringify(invoiceRefs(finance,contract))} finance={finance} contract={contract} save={save} disabled={disabled}/>:<p className="result-note">승인번호를 등록하려면 상단에서 PPL 계약을 선택하세요.</p>}
  </details>
 </div>;
}
function InvoiceReferences({finance,contract,save,disabled}:{finance:Finance;contract:Contract;save:FinanceSave;disabled:boolean}){
 const [refs,setRefs]=useState<string[]>(invoiceRefs(finance,contract).length?invoiceRefs(finance,contract).map(displayApproval):['']),[error,setError]=useState('');
 return <section className="tax-refs"><div><h3>실무자 · 계산서 승인번호</h3><p>{contract.program||contract.name} · 공급가액 {won(contract.net)}. 금액은 다시 입력하지 않습니다.</p></div><div className="tax-ref-lines">{refs.map((n,i)=><div key={i}><input aria-label={'계산서 승인번호 '+(i+1)} className="form-control" disabled={disabled} maxLength={40} value={n} placeholder="승인번호 24자리 · 영문/숫자, 하이픈 포함 가능" onChange={e=>setRefs(old=>old.map((s,j)=>j===i?e.target.value:s))}/>{refs.length>1&&<button className="text-button" disabled={disabled} onClick={()=>setRefs(old=>old.filter((_,j)=>j!==i))}>제외</button>}</div>)}</div><div className="finance-actions"><button className="primary-button" disabled={disabled} onClick={async()=>{const values=refs.map(normalizeApproval).filter(Boolean);if(values.some(n=>!approvalValid(n))){setError('홈택스 승인번호 24자리를 입력해 주세요. 기안번호와 다릅니다.');return;}setError('');await save({kind:'invoiceRefs',data:{contractId:contract.id,approvals:values}})}}>승인번호 저장</button><button className="text-button" disabled={disabled||refs.length>=20} onClick={()=>setRefs(old=>[...old,''])}>분할 발행 · 번호 추가</button></div>{error&&<p role="alert" className="tax-error">{error}</p>}</section>;
}
