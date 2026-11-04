import * as X from 'xlsx';
import {costImportHeaders,type CostImportRow} from './cost-history-import.ts';
import {CostHistoryError,validCostDate} from './cost-history.ts';

const text=(value:unknown)=>value===undefined||value===null?'':String(value).trim();
function dateValue(value:unknown,date1904:boolean){
 if(typeof value==='number'){
  if(!Number.isInteger(value)||value<1)return text(value);
  const d=X.SSF.parse_date_code(value,{date1904});
  return d?`${String(d.y).padStart(4,'0')}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:text(value);
 }
 const raw=text(value),m=raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
 return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:raw;
}
export function readCostWorkbook(data:ArrayBuffer|Uint8Array):CostImportRow[]{
 const book=X.read(data,{type:'array',cellDates:false,sheetRows:1002});
 const sheet=book.Sheets['원가입력'];
 if(!sheet)throw new CostHistoryError('양식의 「원가입력」 시트를 찾을 수 없습니다. 원가 엑셀 양식을 사용해 주세요.');
 if(X.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1').e.r>1000)throw new CostHistoryError('한 번에 1,000행까지 올릴 수 있습니다. 파일을 나누어 주세요.');
 const matrix=X.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true,defval:'',blankrows:true});
 const header=matrix[0]||[];
 if(costImportHeaders.some((h,i)=>text(header[i]).replace(/\s/g,'')!==h.replace(/\s/g,''))||header.slice(5).some(v=>text(v)!==''))throw new CostHistoryError('원가입력 시트의 첫 행 제목과 열 순서를 양식 그대로 유지해 주세요.');
 if(matrix.length>1001)throw new CostHistoryError('한 번에 1,000행까지 올릴 수 있습니다. 파일을 나누어 주세요.');
 const rows:CostImportRow[]=[];
 const date1904=Boolean(book.Workbook?.WBProps?.date1904);
 for(let index=1;index<matrix.length;index++){
  const cells=matrix[index];
  for(let col=0;col<5;col++)if(sheet[X.utils.encode_cell({r:index,c:col})]?.f)throw new CostHistoryError(`${index+1}행: 수식 대신 확정된 값을 입력해 주세요.`);
  if(cells.every(v=>text(v)===''))continue;
  if(cells.slice(5).some(v=>text(v)!==''))throw new CostHistoryError(`${index+1}행: 양식의 5개 열 외에 입력된 값이 있습니다.`);
  const kind=text(cells[0]),rawCost=text(cells[4]);
  const effectiveFrom=dateValue(cells[3],date1904);
  rows.push({rowNumber:index+1,kind:kind==='상품'?'product':kind==='사은품'?'gift':kind,name:text(cells[1]),unit:text(cells[2]),effectiveFrom:validCostDate(effectiveFrom)?effectiveFrom:text(cells[3]),unitCost:/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(rawCost)?rawCost.replace(/,/g,''):rawCost});
 }
 if(!rows.length)throw new CostHistoryError('원가입력 시트에 작성된 내역이 없습니다. 2행부터 입력해 주세요.');
 return rows;
}
