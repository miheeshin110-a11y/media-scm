import {sheetRows} from './sheet-mapping.ts';
import {financeSheetRows} from './finance-sheets.ts';
import {allSheetHeaders} from './sheet-setup.ts';
import type {SheetTable,SheetRow} from './sheet-merge.ts';
import type {Item} from './scm-model.ts';
import type {Finance} from './finance-model.ts';
export function broadcastTables(item:Item):SheetTable[]{
 return sheetRows(item,1).map(group=>{
  const title=group.range.split("'")[1];
  const parentColumn=['SCM_구성실적','SCM_PPL연결','SCM_사은품'].includes(title)?1:0;
  return {title,width:allSheetHeaders[title as keyof typeof allSheetHeaders].length,rows:group.values.filter(row=>row[0]!=='').map(row=>row.map(value=>{if(value===null||value===undefined)return '';if(['string','number','boolean'].includes(typeof value))return value as SheetRow[number];throw new Error('Google 전송 값의 형식을 확인해 주세요.');})),owns:row=>row[parentColumn]===item.id};
 });
}
export function financeTables(finance:Finance):SheetTable[]{
 const invoiceIds=new Set(finance.invoices.map(i=>i.id));
 return financeSheetRows(finance).map(group=>{
  const title=group.range.split("'")[1];
  return {title,width:allSheetHeaders[title as keyof typeof allSheetHeaders].length,rows:group.values.slice(1).filter(row=>row[0]!==''),owns:row=>title==='SCM_계산서연결'&&invoiceIds.has(String(row[0]))};
 });
}
