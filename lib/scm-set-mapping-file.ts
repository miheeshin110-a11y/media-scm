import * as X from 'xlsx';
import {LogisticsError} from './logistics.ts';
import type {ScmSetMappingRow} from './scm-set-mapping.ts';
const text=(v:unknown)=>v===null||v===undefined?'':String(v).trim();
export function readScmSetMappingFile(data:Uint8Array|ArrayBuffer):ScmSetMappingRow[]{
 const wb=X.read(data,{type:'array',raw:true,sheetRows:1007}),s=wb.Sheets['판매구성 마스터'];
 if(!s)throw new LogisticsError('「판매구성 마스터」 시트가 있는 SCM SKU 매핑파일을 선택하세요.');
 const bounds=X.utils.decode_range(s['!fullref']||s['!ref']||'A1');if(bounds.e.r>1006||bounds.e.c>11)throw new LogisticsError('매핑파일은 원본 12개 열, 1,000개 데이터 행만 사용하세요.');
 const rows=X.utils.sheet_to_json<unknown[]>(s,{header:1,raw:true,defval:'',blankrows:true,range:0});
 const expected=['구성ID','출고 상품코드','방송용 판매구성명','기존 선택 코드참고용','SCM 확정 세트 SKU세트 출고 시 입력','출고 방식'];
 if(expected.some((h,i)=>text(rows[5]?.[i]).replace(/\s/g,'')!==h.replace(/\s/g,'')))throw new LogisticsError('마스터 6행의 제목·열 순서를 확인하세요.');
 const detail=wb.Sheets['출고 SKU 상세'];
 if(detail){const values=X.utils.sheet_to_json<unknown[]>(detail,{header:1,raw:true,defval:'',range:6});if(values.some(r=>r.slice(0,7).some(v=>text(v))))throw new LogisticsError('출고 SKU 상세에 입력된 파일은 이 세트 전용 가져오기에서 처리할 수 없습니다. 완제품 세트 확정 자료만 선택하세요.');}
 const out:ScmSetMappingRow[]=[];let parent:ScmSetMappingRow|undefined;
 for(let i=6;i<rows.length;i++){
  const r=rows[i];if(!r?.slice(0,11).some(v=>text(v)))continue;
  // Formula outputs and VBA are never executed or used as mapping inputs.
  for(let c=0;c<11;c++)if(s[X.utils.encode_cell({r:i,c})]?.f)throw new LogisticsError(`${i+1}행: 자동 점검 열 외에는 수식 대신 확정 값을 입력하세요.`);
  const [configId,code,salesName,salesCode]=r.map(text);
  if(!configId){
   if(!parent||salesCode!==parent.salesCode||salesName!==parent.salesName||!code)throw new LogisticsError(`${i+1}행: 추가 단품은 바로 위와 같은 판매구성명·D열 세트코드를 입력하세요.`);
   parent.extraSkus.push(code);parent.sourceRows.push(i+1);continue;
  }
  // User-confirmed semantics: D is the finished set; B contains component codes.
  parent={configId,salesCode,salesName,setSku:salesCode,setSkuConfirmed:true,mainComponentSku:code,extraSkus:[],sourceRows:[i+1],sourceMode:text(r[5]),use:text(r[6]),review:text(r[7]),note:text(r[10])};out.push(parent);
 }
 if(!out.length)throw new LogisticsError('입력된 판매구성이 없습니다.');return out;
}
