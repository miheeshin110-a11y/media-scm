export type SheetRow = (string | number | boolean | null)[];
export type SheetTable = {title:string; width:number; rows:SheetRow[]; owns:(row:SheetRow)=>boolean};
export function sheetKey(title:string,row:SheetRow){
  if(!row[0])return '';
  if(['SCM_PPL연결','SCM_사은품','SCM_구성실적'].includes(title))return JSON.stringify([row[1],row[0]]);
  return JSON.stringify(title==='SCM_구성계획'?[row[0],row[1]]:title==='SCM_계산서연결'?[row[0],row[2]]:[row[0]]);
}
export function sheetColumn(n:number){let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
// Sheet position is independent of a new database's row_id. Preserve foreign rows.
export function mergeSheetRows(table:SheetTable,existing:SheetRow[]){
  const positions=new Map<string,number>(),wanted=new Set<string>(),writes:{range:string;values:SheetRow[]}[]=[];
  const range=(row:number)=>`'${table.title}'!A${row}:${sheetColumn(table.width)}${row}`;
  existing.forEach((row,i)=>{const key=sheetKey(table.title,row);if(!key)return;if(positions.has(key))throw new Error('Google 시트에 중복 ID가 있습니다: '+table.title);positions.set(key,i+2);});
  let next=existing.length+2;
  for(const source of table.rows){
    const key=sheetKey(table.title,source);if(!key)continue;
    if(wanted.has(key))throw new Error('Google 전송 자료에 중복 ID가 있습니다: '+table.title);wanted.add(key);
    const row=positions.get(key)??next++;
    writes.push({range:range(row),values:[Array.from({length:table.width},(_,i)=>source[i]??'')]});
  }
  existing.forEach((row,i)=>{if(table.owns(row)&&!wanted.has(sheetKey(table.title,row)))writes.push({range:range(i+2),values:[Array(table.width).fill('')]});});
  return writes;
}
