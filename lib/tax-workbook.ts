import {mergeTaxInvoices,parseHometaxRows,type TaxInvoice} from './tax-reconcile.ts';

export const taxWorkbookMaxBytes=5*1024*1024;

export async function readTaxWorkbook(bytes:ArrayBuffer,filename:string){
 if(bytes.byteLength>taxWorkbookMaxBytes)throw Error('5MB 이하의 홈택스 파일을 사용해 주세요.');
 const X=await import('xlsx');
 const book=X.read(bytes,{type:'array',cellDates:false,sheetRows:10002});
 const rows:TaxInvoice[]=[];
 for(const name of book.SheetNames){
  const matrix=X.utils.sheet_to_json<unknown[]>(book.Sheets[name],{header:1,raw:false,defval:''});
  if(!matrix.some(row=>row.some(value=>String(value).replace(/\s/g,'')==='승인번호')))continue;
  if(matrix.length>10000)throw Error('파일은 10,000행 이하로 나누어 주세요.');
  rows.push(...parseHometaxRows(matrix,filename+' / '+name));
 }
 if(!rows.length)throw Error('홈택스 세금계산서 목록을 찾지 못했습니다.');
 return mergeTaxInvoices([],rows).rows;
}
