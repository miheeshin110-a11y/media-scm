import {ensureSheetRanges} from './sheet-setup.ts';
import {mergeSheetRows,sheetColumn,type SheetTable,type SheetRow} from './sheet-merge.ts';
import {Database} from './database.ts';

// A separate transaction lock serializes read/merge/write across server instances.
// It never blocks normal business saves, which use advisory lock (736267, 1).
export async function withSheetWriteLock<T>(db:Database,work:(session:Database)=>Promise<T>):Promise<T|undefined>{
  return db.transaction(async connection=>{
    const lock=await connection.query('SELECT pg_try_advisory_xact_lock(736267, 2) AS acquired');
    if(!lock.rows[0]?.acquired)return undefined;
    return work(new Database(connection,callback=>callback(connection)));
  });
}

export async function writeMergedSheets(token:string,sheetId:string,tables:SheetTable[]){
  const url='https://sheets.googleapis.com/v4/spreadsheets/'+sheetId,headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const skeleton=tables.map(t=>({range:`'${t.title}'!A1:${sheetColumn(t.width)}2`,values:[]}));
  const headerRows=await ensureSheetRanges(token,sheetId,skeleton);
  const query=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE'});
  // These are application-owned data columns; all legacy row IDs are read before planning writes.
  for(const t of tables)query.append('ranges',`'${t.title}'!A2:${sheetColumn(t.width)}`);
  const read=await fetch(url+'/values:batchGet?'+query,{headers,signal:AbortSignal.timeout(15000)});
  if(!read.ok)throw new Error('Google 시트 기존 자료 확인 실패 ('+read.status+')');
  const snapshot=await read.json() as {valueRanges:{values?:SheetRow[]}[]};
  if(snapshot.valueRanges?.length!==tables.length)throw new Error('Google 시트 읽기 범위를 확인해 주세요.');
  const data=tables.flatMap((t,i)=>mergeSheetRows(t,snapshot.valueRanges[i].values||[]));
  if(data.length)await ensureSheetRanges(token,sheetId,data);
  const result=await fetch(url+'/values:batchUpdate',{method:'POST',headers,body:JSON.stringify({valueInputOption:'RAW',data:[...headerRows,...data]}),signal:AbortSignal.timeout(15000)});
  if(!result.ok)throw new Error('Google 시트 반영 실패 ('+result.status+')');
}
