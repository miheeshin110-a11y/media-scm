import * as X from 'xlsx';
import {LogisticsError} from './logistics.ts';
import type {SetContentsInput} from './set-contents.ts';
export const setContentsHeaders=['세트코드','판매구성명','단품코드','단품명','구분','세트당단품수량','단위','확인여부','메모'];
export function readSetContentsFile(data:ArrayBuffer|Uint8Array):SetContentsInput[]{
 const wb=X.read(data,{type:'array',raw:true,sheetRows:1002}),s=wb.Sheets['세트구성수량'];if(!s)throw new LogisticsError('세트구성수량 시트가 있는 입력파일을 선택하세요.');
 const b=X.utils.decode_range(s['!fullref']||s['!ref']||'A1');if(b.e.r>1000||b.e.c>8)throw new LogisticsError('양식의 9개 열과 최대 1,000행만 사용하세요.');
 const matrix=X.utils.sheet_to_json<unknown[]>(s,{header:1,raw:true,defval:'',blankrows:true});
 if(setContentsHeaders.some((h,i)=>matrix[0]?.[i]!==h))throw new LogisticsError('세트구성수량 첫 행의 제목·순서를 유지하세요.');
 const keys=['setCode','salesName','sku','name','role','quantity','unit','confirmed','note'];
 return matrix.slice(1).flatMap((r,i)=>{if(!r.some(v=>String(v).trim()))return [];for(let c=0;c<9;c++)if(s[X.utils.encode_cell({r:i+1,c})]?.f)throw new LogisticsError(`${i+2}행: 수식 대신 확정 값을 입력하세요.`);return [Object.fromEntries(keys.map((k,c)=>[k,String(r[c]??'').trim()])) as SetContentsInput];});
}
