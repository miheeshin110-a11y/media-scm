'use client';
import {useState} from 'react';
import {logisticsHeaders,type LogisticsImportKind} from '@/lib/logistics-import';
import type {Logistics} from '@/lib/logistics';

export function LogisticsUpload({kind,logistics,busy,submit}:{kind:LogisticsImportKind;logistics:Logistics;busy:boolean;submit:(rows:Record<string,unknown>[],source:string)=>Promise<boolean>}){
 const [rows,setRows]=useState<Record<string,unknown>[]>([]),[source,setSource]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const missing=kind==='sku'?[]:[...new Set(rows.map(r=>String(r.sku)))].filter(code=>!logistics.skus.some(s=>s.code===code));
 const select=async(file:File|undefined)=>{
  if(!file)return;setRows([]);setError('');setLoading(true);
  try{
   if(!/\.(xlsx|csv)$/i.test(file.name)||file.size>5*1024*1024)throw new Error('5MB 이하 XLSX 또는 CSV 파일을 선택하세요.');
   const {readLogisticsWorkbook}=await import('@/lib/logistics-import');
   const parsed=readLogisticsWorkbook(await file.arrayBuffer(),kind);setRows(parsed);setSource(file.name);
  }catch(e){setError(e instanceof Error?e.message:'파일을 읽지 못했습니다.');}finally{setLoading(false);}
 };
 const headers=logisticsHeaders[kind];
 return <div className="logistics-upload">
  <p>첫 시트에 양식 제목 그대로 입력하세요. 수량은 등록된 상품 단위(EA 또는 세트) 기준이며, 물류 상품코드는 문자 형식으로 보관하세요.</p>
  <div className="finance-actions"><a className="secondary-button" download={'물류_'+kind+'_양식.csv'} href={'data:text/csv;charset=utf-8,'+encodeURIComponent('\ufeff'+headers.join(',')+'\r\n')}>입력 양식 다운로드</a><label className="secondary-button tax-file">{loading?'읽는 중…':'XLSX·CSV 선택'}<input type="file" accept=".xlsx,.csv" disabled={busy||loading} onChange={e=>{void select(e.target.files?.[0]);e.target.value=''}}/></label></div>
  {error&&<p role="alert">{error}</p>}
  {missing.length>0&&<p role="alert">미등록 물류 상품코드: {missing.slice(0,10).join(', ')}. 품목 기준정보를 먼저 등록하세요.</p>}
  {rows.length>0&&<><p>{source} · {rows.length}행 · 저장 전 확인 · 처음 30행 표시</p><div className="logistics-table"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.slice(0,30).map((r,i)=><tr key={i}>{Object.values(r).map((v,j)=><td key={j}>{v==='product'?'본품':v==='gift'?'사은품':typeof v==='boolean'?(v?'확정':'미확정'):String(v)}</td>)}</tr>)}</tbody></table></div><button className="primary-button" disabled={busy||loading||missing.length>0} onClick={async()=>{if(await submit(rows,source)){setRows([]);setSource('')}}}>확인한 {rows.length}행 등록</button></>}
 </div>;
}
