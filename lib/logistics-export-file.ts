import * as X from 'xlsx';
import {logisticsExport} from './logistics-export.ts';
import type {Logistics} from './logistics.ts';
import type {Item} from './scm-model.ts';
export function logisticsExportWorkbook(items:Item[],l:Logistics,exportedAt=new Date().toISOString()){
 const data=logisticsExport(items,l),wb=X.utils.book_new();
 const table=(name:string,values:(string|number|null)[][],widths:number[],numeric:number[])=>{
  const sheet=X.utils.aoa_to_sheet(values);sheet['!cols']=widths.map(wch=>({wch}));sheet['!autofilter']={ref:X.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(0,values.length-1),c:values[0].length-1}})};
  for(let r=1;r<values.length;r++)for(const c of numeric){const cell=sheet[X.utils.encode_cell({r,c})];if(cell?.t==='n')cell.z=c===15?'0.##':'#,##0';}
  X.utils.book_append_sheet(wb,sheet,name);
 };
 table('방송별 수량',[
  ['방송일','방송시간','채널','방송상품','판매구성','구분','V코드','품목명','단위','준비수량','예상출고수량','확인사항','판매구성코드','요청세트수','세트당단품수량','전환율(%)','방송ID','방송버전'],
  ...data.rows.map(r=>[r.date,r.time,r.channel,r.item,r.composition,r.role,r.sku,r.name,r.unit,r.prepare,r.expected,r.note,r.compositionCode,r.requested,r.perSet,r.rate,r.broadcastId,r.version])
 ],[13,10,12,24,36,10,18,30,10,16,18,55,20,15,18,15,38,12],[9,10,13,14,15,17]);
 table('품목별 합계',[
  ['V코드','품목명','구분','단위','준비수량 합계','예상출고수량 합계','방송 건수','확인사항'],
  ...data.totals.map(r=>[r.sku,r.name,r.role,r.unit,r.prepare,r.expected,r.broadcasts,r.note])
 ],[18,32,10,10,20,23,12,65],[4,5,6]);
 table('확인 필요',[
  ['방송일','방송상품','판매구성','확인·제외 사유','방송ID','방송버전'],
  ...data.issues.map(r=>[r.date,r.item,r.composition,r.reason,r.broadcastId,r.version])
 ],[13,26,36,65,38,12],[5]);
 const guide=X.utils.aoa_to_sheet([
  ['항목','설명'],['다운로드 시각(KST)',new Date(exportedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})],['선택 방송 수',data.selectedCount],['수량을 산출한 방송 수',data.broadcastCount],['파일 사용','물류팀 기존 재고관리 시트의 방송 출고·준비 계산에 사용합니다. 동일 파일을 반복해서 누적 반영하지 마세요.'],['방송별 수량','방송·메인/서브 판매구성·본품/사은품·V코드·단위별 한 행입니다. 같은 방송에서 같은 V코드가 여러 구성에 있으면 각 행을 합산합니다.'],['준비수량','방송 요청 세트수 × 주문 1세트당 확인된 단품수량. 전환율을 차감하지 않습니다.'],['예상출고수량','판매구성별 요청 세트수에 전환율과 방송의 수량 처리기준을 적용한 후 단품수량을 곱합니다.'],['수량 처리기준',data.rounding.map(r=>r.id+': '+(r.rounding||'미선택')).join(' / ')],['미확인 수량','빈칸은 미확인이며 0이 아닙니다. 명시적인 0만 0으로 표시합니다. 확인 필요 시트를 먼저 확인하세요.'],['합계 주의','같은 V코드라도 구분·단위가 다르면 별도 합계입니다. 미확인 수량을 포함한 합계는 빈칸입니다. 제외·미매핑 구성은 합계에 포함되지 않습니다.'],['단위','구성수량표의 확인된 단위를 그대로 사용합니다. 개·박스·병 등을 임의 환산하지 않습니다.'],['유기농 홍화씨','보류 구성은 수량을 내보내지 않고 확인 필요 시트에 보류 사유만 표시합니다.'],['방송 취소·일정 미확정','수량 전달에서 제외하고 확인 필요 시트에 표시합니다.'],['기준','현재 화면에 불러온 저장 방송 및 방송일에 유효한 구성수량 기준입니다. 다운로드 후 변경된 방송은 새 파일로 교체하세요.'],['방송ID·버전','같은 방송의 변경본을 확인하는 식별값입니다. 재전달 시 이전 버전을 대체합니다.'],['데이터 보존','다운로드만으로 방송·원가·이익·재고·구글시트·물류 준비 상태를 저장하거나 변경하지 않습니다.']
 ]);guide['!cols']=[{wch:25},{wch:110}];X.utils.book_append_sheet(wb,guide,'전달 안내');return wb;
}
export function logisticsExportBytes(items:Item[],l:Logistics){return X.write(logisticsExportWorkbook(items,l),{type:'array',bookType:'xlsx',compression:true}) as ArrayBuffer;}
