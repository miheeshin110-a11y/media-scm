import {logisticsSheetHeaders,LOGISTICS_ROW_PREFIX} from './logistics-sheets.ts';
import {sheetColumn} from './sheet-merge.ts';
export const logisticsSummaryColumns=[
 ['물류 다음 할 일','다음할일'],['물류 상태','물류상태'],['물류 요청수량(세트)','요청수량(세트)'],['물류 예상출고(세트)','예상출고(세트)'],['물류 준비기한','준비기한'],['물류 준비창고','준비창고'],['SCM 담당자','SCM담당자'],['물류 입력 확인','입력확인'],
] as const;
export const logisticsSummaryMarker='물류 업무 · 자동 연동';
export function logisticsSummaryFormulas(){
 const source="'SCM_물류방송'!",owned=`LEFT(${source}A2:A,${LOGISTICS_ROW_PREFIX.length})="${LOGISTICS_ROW_PREFIX}"`;
 return logisticsSummaryColumns.map(([,field])=>{
  const col=sheetColumn(logisticsSheetHeaders.SCM_물류방송.indexOf(field)+1);
  return `=IFNA(LET(ids,FILTER(${source}B2:B,${owned}),vals,FILTER(${source}${col}2:${col},${owned}),MAP(FILTER($A$5:$A,$A$5:$A<>""),LAMBDA(bid,IF(COUNTIFS(${source}B2:B,bid,${source}${col}2:${col},"<>",${source}A2:A,"${LOGISTICS_ROW_PREFIX}*")=0,"",XLOOKUP(bid,ids,vals,""))))),"")`;
 });
}
export function validateLogisticsSummaryBlock(rows:unknown[][]){
 const formulas=logisticsSummaryFormulas(),headers=logisticsSummaryColumns.map(c=>c[0]);
 const empty=rows.every(row=>row.every(v=>v===undefined||v===null||v===''));
 if(empty)return;
 const owned=rows[0]?.[0]===logisticsSummaryMarker&&headers.every((h,i)=>rows[1]?.[i]===h)&&formulas.every((f,i)=>rows[2]?.[i]===f);
 if(!owned)throw new Error('Google 방송 종합의 AQ:AX에 기존 자료가 있습니다. 해당 자료를 보존하기 위해 물류 열 추가를 보류했습니다.');
}
type SheetProperties={sheetId:number;title:string;gridProperties:{rowCount:number;columnCount:number}};
export async function ensureLogisticsDashboard(token:string,spreadsheetId:string){
 const url='https://sheets.googleapis.com/v4/spreadsheets/'+spreadsheetId,headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const meta=await fetch(url+'?fields=sheets.properties',{headers,signal:AbortSignal.timeout(15000)});if(!meta.ok)throw new Error('Google 물류 조회 구조 확인 실패 ('+meta.status+')');
 const sheets=(await meta.json() as {sheets:{properties:SheetProperties}[]}).sheets.map(s=>s.properties),summary=sheets.find(s=>s.title==='방송 종합'),view=sheets.find(s=>s.title==='물류 종합');
 const requests:unknown[]=[],formulas=logisticsSummaryFormulas(),columnHeaders=logisticsSummaryColumns.map(c=>c[0]);
 let install=false;
 if(summary){
  const end=Math.min(summary.gridProperties.columnCount,50),ranges=["'방송 종합'!A4:A5"];
  if(end>42)ranges.push(`'방송 종합'!AQ3:${sheetColumn(end)}${summary.gridProperties.rowCount}`);
  const query=new URLSearchParams({valueRenderOption:'FORMULA'});for(const range of ranges)query.append('ranges',range);
  const response=await fetch(url+'/values:batchGet?'+query,{headers,signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Google 방송 종합의 물류 영역 확인 실패 ('+response.status+')');
  const result=await response.json() as {valueRanges:{values?:unknown[][]}[]};
  if(result.valueRanges?.length!==ranges.length)throw new Error('Google 방송 종합의 물류 영역 응답을 확인해 주세요.');
  const source=result.valueRanges[0]?.values||[];
  if(source[0]?.[0]!=='방송 ID'||typeof source[1]?.[0]!=='string'||!String(source[1][0]).startsWith('='))throw new Error('Google 방송 종합의 방송ID 수식 구조가 변경됐습니다. 원본을 보존하기 위해 물류 열 추가를 보류했습니다.');
  validateLogisticsSummaryBlock(result.valueRanges[1]?.values||[]);
  install=true;
  if(summary.gridProperties.columnCount<50)requests.push({updateSheetProperties:{properties:{sheetId:summary.sheetId,gridProperties:{columnCount:50}},fields:'gridProperties.columnCount'}});
  requests.push(
   {repeatCell:{range:{sheetId:summary.sheetId,startRowIndex:2,endRowIndex:4,startColumnIndex:42,endColumnIndex:50},cell:{userEnteredFormat:{backgroundColor:{red:.94,green:.95,blue:.96},textFormat:{bold:true,fontSize:10},wrapStrategy:'WRAP',verticalAlignment:'MIDDLE'}},fields:'userEnteredFormat'}},
   {repeatCell:{range:{sheetId:summary.sheetId,startRowIndex:4,endRowIndex:summary.gridProperties.rowCount,startColumnIndex:44,endColumnIndex:46},cell:{userEnteredFormat:{numberFormat:{type:'NUMBER',pattern:'#,##0;[Red](#,##0);0'},horizontalAlignment:'RIGHT'}},fields:'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment'}},
   {updateDimensionProperties:{range:{sheetId:summary.sheetId,dimension:'COLUMNS',startIndex:42,endIndex:50},properties:{pixelSize:165},fields:'pixelSize'}},
   {updateDimensionProperties:{range:{sheetId:summary.sheetId,dimension:'COLUMNS',startIndex:49,endIndex:50},properties:{pixelSize:300},fields:'pixelSize'}},
  );
 }
 if(view)requests.push(
  {updateSheetProperties:{properties:{sheetId:view.sheetId,gridProperties:{frozenRowCount:1,frozenColumnCount:4,hideGridlines:true}},fields:'gridProperties.frozenRowCount,gridProperties.frozenColumnCount,gridProperties.hideGridlines'}},
  {updateDimensionProperties:{range:{sheetId:view.sheetId,dimension:'COLUMNS',startIndex:0,endIndex:1},properties:{hiddenByUser:true},fields:'hiddenByUser'}},
  {repeatCell:{range:{sheetId:view.sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:17},cell:{userEnteredFormat:{backgroundColor:{red:.94,green:.95,blue:.96},textFormat:{bold:true,fontSize:10},wrapStrategy:'WRAP'}},fields:'userEnteredFormat'}},
  {updateDimensionProperties:{range:{sheetId:view.sheetId,dimension:'COLUMNS',startIndex:1,endIndex:17},properties:{pixelSize:150},fields:'pixelSize'}},
  {updateDimensionProperties:{range:{sheetId:view.sheetId,dimension:'ROWS',startIndex:0,endIndex:1},properties:{pixelSize:46},fields:'pixelSize'}},
 );
 if(requests.length){const response=await fetch(url+':batchUpdate',{method:'POST',headers,body:JSON.stringify({requests}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Google 물류 조회 서식 반영 실패 ('+response.status+')');}
 if(install){const response=await fetch(url+'/values:batchUpdate',{method:'POST',headers,body:JSON.stringify({valueInputOption:'USER_ENTERED',data:[{range:"'방송 종합'!AQ3",values:[[logisticsSummaryMarker]]},{range:"'방송 종합'!AQ4:AX4",values:[columnHeaders]},{range:"'방송 종합'!AQ5:AX5",values:[formulas]}]}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Google 방송 종합의 물류 조회 연결 실패 ('+response.status+')');}
}
