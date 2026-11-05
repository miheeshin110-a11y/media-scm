import * as X from 'xlsx';
import {LogisticsError} from './logistics.ts';
import type {SimpleLogisticsWorkbook,SimpleComposition} from './logistics-workbook.ts';
const text=(v:unknown)=>v===undefined||v===null?'':String(v).trim();
export function readSimpleLogisticsWorkbook(data:Uint8Array|ArrayBuffer):SimpleLogisticsWorkbook{
 const book=X.read(data,{type:'array',raw:true,sheetRows:1010});
 const read=(title:string,headerRow:number,headers:string[])=>{
  const sheet=book.Sheets[title];if(!sheet)throw new LogisticsError('「'+title+'」 시트가 없습니다. 통합 양식을 사용하세요.');
  const ref=X.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
  if(ref.e.r>headerRow+1000||ref.e.c>=headers.length)throw new LogisticsError(title+': 최대 1,000행과 양식 열만 사용하세요.');
  const rows=X.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true,defval:'',blankrows:true});
  if(headers.some((h,i)=>text(rows[headerRow]?.[i])!==h))throw new LogisticsError(title+': 제목과 열 순서를 유지하세요.');
  for(const [cell,value]of Object.entries(sheet))if(!cell.startsWith('!')&&value?.f)throw new LogisticsError(title+': 수식 대신 확정 값을 입력하세요.');
  return rows;
 };
 const rows=read('상품구성',0,['판매구성명','본품명','본품수량(EA)','사은품명','사은품수량(EA)']);
 const compositions:SimpleComposition[]=rows.slice(1).filter(r=>r.some(v=>text(v))).map(r=>({sale:text(r[0]),product:text(r[1]),quantity:text(r[2]),gift:text(r[3]),giftQuantity:text(r[4])}));
 const stock=read('재고',4,['품목명','가용재고(EA)','예약차감수량(EA)','물류상품코드(선택)']);
 const lines=stock.slice(5).filter(r=>r.some(v=>text(v))).map(r=>({name:text(r[0]),available:text(r[1]),reserved:text(r[2]),code:text(r[3])}));
 const warehouse=text(stock[0]?.[1]),asOf=text(stock[1]?.[1]).replace(' ','T'),basis=text(stock[2]?.[1]);
 const hasStock=Boolean(warehouse||asOf||basis||lines.some(r=>r.available||r.reserved||r.code));
 if(hasStock&&lines.some(r=>!r.available))throw new LogisticsError('재고: 모든 품목의 가용재고를 입력하세요. 실제 0이면 숫자 0을 입력하세요.');
 if(stock[0]?.[0]!=='창고명'||stock[1]?.[0]!=='재고 기준시각'||stock[2]?.[0]!=='재고 기준')throw new LogisticsError('재고 시트 상단 항목을 바꾸지 마세요.');
 return {compositions,inventory:hasStock?{warehouse,asOf,basis:basis==='예약 차감 전'?'before-plans':basis==='예약 차감 후'?'unreserved':'',lines}:null};
}
