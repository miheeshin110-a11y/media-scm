import {actualDateTime} from './scm-model.ts';
import * as X from 'xlsx';
import {LogisticsError} from './logistics.ts';
export type LogisticsImportKind='sku'|'bom'|'inventory'|'inbound';
export const logisticsHeaders={
 sku:['물류상품코드','품목명'],
 bom:['판매구성코드','물류상품코드','구분','세트당단품수'],
 inventory:['물류상품코드','가용재고','이번계획차감예약수량'],
 inbound:['물류상품코드','입고예정일','단품수량','확정여부','입고참조번호'],
} as const;
const text=(v:unknown)=>v===undefined||v===null?'':String(v).trim();
const number=(v:unknown,row:number)=>{const raw=text(v).replace(/,/g,'');if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>1e12)throw new LogisticsError(row+'행: 수량을 0 이상의 정수로 입력하세요.');return Number(raw);};
export function readLogisticsWorkbook(data:Uint8Array|ArrayBuffer,kind:LogisticsImportKind){
 const book=X.read(data,{type:'array',raw:true,sheetRows:1002}),sheet=book.Sheets[book.SheetNames[0]];
 if(!sheet)throw new LogisticsError('첫 번째 시트에 자료를 입력하세요.');
 const ref=X.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');if(ref.e.r>1000||ref.e.c>20)throw new LogisticsError('첫 시트는 1,000개 데이터 행과 양식 열만 사용하세요.');
 const matrix=X.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true,defval:'',blankrows:true}),headers=logisticsHeaders[kind];
 if(headers.some((h,i)=>text(matrix[0]?.[i]).replace(/\s/g,'')!==h)||matrix[0]?.slice(headers.length).some(v=>text(v)))throw new LogisticsError('첫 시트의 제목·열 순서를 다운로드 양식과 맞춰 주세요.');
 const rows:Record<string,unknown>[]=[],keys=new Set<string>();
 for(let i=1;i<matrix.length;i++){
  const row=matrix[i];if(row.every(v=>!text(v)))continue;
  if(row.slice(headers.length).some(v=>text(v)))throw new LogisticsError((i+1)+'행: 양식 외 열에 값이 있습니다.');
  for(let col=0;col<headers.length;col++)if(sheet[X.utils.encode_cell({r:i,c:col})]?.f)throw new LogisticsError((i+1)+'행: 수식 대신 확정된 값을 입력하세요.');
  const code=text(row[0]);if(!code)throw new LogisticsError((i+1)+'행: 코드가 없습니다.');
  let parsed:Record<string,unknown>,unique=code;
  if(kind==='sku'){if(!text(row[1]))throw new LogisticsError((i+1)+'행: 품목명이 없습니다.');parsed={code,name:text(row[1])};}
  else if(kind==='bom'){
   const role=text(row[2]);if(!text(row[1])||!['본품','사은품'].includes(role))throw new LogisticsError((i+1)+'행: 물류상품코드와 본품/사은품 구분을 확인하세요.');
   const quantity=number(row[3],i+1);if(!quantity||quantity>1e6)throw new LogisticsError((i+1)+'행: 세트당 단품수는 1~1,000,000이어야 합니다.');
   parsed={compositionCode:code,sku:text(row[1]),role:role==='본품'?'product':'gift',quantity};unique=JSON.stringify([code,row[1],role]);
  }else if(kind==='inventory'){
   parsed={sku:code,available:number(row[1],i+1),reservedForPlans:text(row[2])===''?'':number(row[2],i+1)};
  }else{
   const day=text(row[1]),confirmed=text(row[3]);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!actualDateTime(day,'00:00')||!['확정','미확정'].includes(confirmed)||!text(row[4]))throw new LogisticsError((i+1)+'행: 날짜(YYYY-MM-DD)·확정/미확정·입고참조번호를 확인하세요.');
   parsed={sku:code,date:day,quantity:number(row[2],i+1),confirmed:confirmed==='확정',reference:text(row[4])};unique=JSON.stringify([code,parsed.reference]);
  }
  if(keys.has(unique))throw new LogisticsError((i+1)+'행: 파일 내 중복 항목입니다.');keys.add(unique);rows.push(parsed);
 }
 if(!rows.length)throw new LogisticsError('입력된 자료가 없습니다.');return rows;
}
