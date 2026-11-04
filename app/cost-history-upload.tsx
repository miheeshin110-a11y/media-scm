'use client';
import {useRef,useState} from 'react';
import {previewCostImport,type CostImportRow} from '@/lib/cost-history-import';
import type {Finance,FinanceAction} from '@/lib/finance-model';

export function CostHistoryUpload({finance,save,busy,canManage}:{finance:Finance;save:(action:FinanceAction)=>Promise<Finance|false>;busy:boolean;canManage:boolean}){
 const [pending,setPending]=useState<CostImportRow[]>([]),[filename,setFilename]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false),[limit,setLimit]=useState(30);
 const selection=useRef(0);
 const disabled=busy||loading||!canManage;
 let previewId=0;
 const preview=pending.length?previewCostImport(finance,pending,'preview',()=> 'preview-'+(++previewId)):null;
 const clear=()=>{selection.current++;setPending([]);setFilename('');setError('');setNotice('');setLimit(30)};
 const upload=async(file:File|undefined)=>{
  if(!file)return;
  const current=++selection.current;setPending([]);setError('');setNotice('');setLoading(true);setLimit(30);
  try{
   if(!/\.xlsx$/i.test(file.name)||file.size>5*1024*1024)throw new Error('5MB 이하의 XLSX 양식 파일을 선택해 주세요.');
   const {readCostWorkbook}=await import('@/lib/cost-history-xlsx');
   const rows=readCostWorkbook(await file.arrayBuffer());
   previewCostImport(finance,rows);
   if(selection.current===current){setPending(rows);setFilename(file.name);}
  }catch(e){if(selection.current===current)setError(e instanceof Error?e.message:'엑셀을 읽지 못했습니다.');}
  finally{if(selection.current===current)setLoading(false);}
 };
 const register=async()=>{
  if(!preview||disabled||preview.errors||!preview.added)return;
  const result=await save({kind:'costHistoryImport',data:{rows:pending}});
  if(result){setPending([]);setNotice(`신규 원가 ${preview.added}건을 등록하고 중복 ${preview.duplicates}건은 건너뛰었습니다. 기존 방송의 원가·이익은 유지됩니다.`);}
 };
 return <section className="sale-card cost-upload" aria-label="원가 이력 엑셀 일괄 등록">
  <h3>엑셀로 원가 일괄 등록</h3>
  <p className="result-note">담당부서에 양식을 전달해 「원가입력」 시트에 작성해 주세요. 파일 선택 후 내용을 확인하고 등록합니다. 상품·사은품을 함께 올릴 수 있습니다.</p>
  <div className="finance-actions"><a className="secondary-button" href="/templates/cost-history-template.xlsx" download="원가이력_입력양식.xlsx">엑셀 양식 다운로드</a><label className="secondary-button tax-file">{loading?'엑셀 읽는 중…':'엑셀 파일 선택'}<input type="file" accept=".xlsx" disabled={disabled} onChange={e=>{void upload(e.target.files?.[0]);e.target.value=''}}/></label></div>
  {!canManage&&<p className="result-note">팀장 계정으로 일괄 등록할 수 있습니다. 양식은 누구나 다운로드할 수 있습니다.</p>}
  {error&&<p role="alert" className="tax-error">{error}</p>}{notice&&<p role="status" className="result-note">{notice}</p>}
  {preview&&<div className="cost-upload-preview">
   <p><strong>{filename}</strong> · 저장 전 확인</p>
   <p role="status">신규 {preview.added}건 · 중복 건너뛰기 {preview.duplicates}건 · 오류 {preview.errors}건</p>
   {preview.errors>0&&<p role="alert" className="tax-error">오류가 있어 전체 등록을 보류합니다. 표시된 행을 수정한 파일을 다시 선택하세요.</p>}
   <div className="cost-history-table"><table><caption>업로드 원가 확인</caption><thead><tr>{['엑셀 행','구분','품목명','단위','적용 시작일','단위원가','확인 결과'].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{preview.entries.slice(0,limit).map((entry,i)=><tr key={i} data-error={entry.status==='error'}><td>{entry.row.rowNumber}</td><td>{entry.row.kind==='product'?'상품':entry.row.kind==='gift'?'사은품':entry.row.kind}</td><td>{entry.row.name}</td><td>{entry.row.unit}</td><td>{entry.row.effectiveFrom}</td><td>{entry.row.unitCost}</td><td>{entry.message}</td></tr>)}</tbody></table></div>
   {preview.entries.length>limit&&<button className="text-button" type="button" onClick={()=>setLimit(n=>n+100)}>100행 더 보기</button>}
   <div className="finance-actions"><button type="button" className="secondary-button" disabled={busy} onClick={clear}>취소</button><button type="button" className="primary-button" disabled={disabled||preview.errors>0||preview.added===0} onClick={()=>void register()}>확인한 신규 {preview.added}건 일괄 등록</button></div>
  </div>}
 </section>;
}
