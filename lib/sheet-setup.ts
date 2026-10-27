import {sheetHeaders} from './sheet-mapping.ts';
import {workflowHeaders} from './workflow-sheets.ts';
import {financeSheetHeaders} from './finance-sheets.ts';
type Range={range:string;values:unknown[][]};
type Metadata={sheets:{properties:{sheetId:number;title:string;gridProperties:{rowCount:number;columnCount:number}}}[]};
export const allSheetHeaders={...sheetHeaders,...workflowHeaders,...financeSheetHeaders};
export function headerRows(names:string[]){return [...new Set(names)].map(name=>({range:`'${name}'!A1`,values:[Array.from(allSheetHeaders[name as keyof typeof allSheetHeaders])]}));}
// Only app-owned tabs are prepared. Existing source/test worksheets are not modified.
export async function ensureSheetRanges(token:string,sheetId:string,ranges:Range[]){
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'},url='https://sheets.googleapis.com/v4/spreadsheets/'+sheetId;
 const response=await fetch(url+'?fields=sheets.properties',{headers,signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Google 시트 구조 확인 실패 ('+response.status+')');
 const metadata=await response.json() as Metadata,requests:unknown[]=[];
 const combined=new Map<string,Range>();
 for(const data of ranges){const match=data.range.match(/^'([^']+)'!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);if(!match||!(match[1] in allSheetHeaders))throw new Error('Google 출력 범위를 확인해 주세요.');
 const previous=combined.get(match[1]);if(!previous||Number(match[5]||match[3])>Number(previous.range.match(/\d+$/)![0]))combined.set(match[1],data);
 }
 for(const data of combined.values()){const match=data.range.match(/^'([^']+)'!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/)!;
 const title=match[1],rows=Number(match[5]||match[3]),columns=Array.from(match[4]||match[2]).reduce((n,c)=>n*26+c.charCodeAt(0)-64,0),existing=metadata.sheets.find(s=>s.properties.title===title)?.properties;
 if(!existing)requests.push({addSheet:{properties:{title,gridProperties:{rowCount:Math.max(1001,rows),columnCount:Math.max(26,columns)}}}});
 else if(existing.gridProperties.rowCount<rows||existing.gridProperties.columnCount<columns)requests.push({updateSheetProperties:{properties:{sheetId:existing.sheetId,gridProperties:{rowCount:Math.max(rows,existing.gridProperties.rowCount),columnCount:Math.max(columns,existing.gridProperties.columnCount)}},fields:'gridProperties.rowCount,gridProperties.columnCount'}});
 }
 if(requests.length){const update=await fetch(url+':batchUpdate',{method:'POST',headers,body:JSON.stringify({requests}),signal:AbortSignal.timeout(15000)});if(!update.ok)throw new Error('Google 시트 준비 실패 ('+update.status+'). 대기 건을 다시 전송해 주세요.');}
 return headerRows(ranges.map(r=>r.range.split("'")[1]));
}
