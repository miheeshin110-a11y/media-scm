import {appendCostHistory,CostHistoryError,type CostHistory,type CostMaster} from './cost-history.ts';
import {canonicalCostItem} from './cost-item-catalog.ts';
import type {GiftMaster} from './gift-items.ts';

export const costImportHeaders=['구분','품목명','단위','적용 시작일','단위원가(VAT 제외)'] as const;
export type CostImportRow={rowNumber:number;kind:string;name:string;unit:string;effectiveFrom:string;unitCost:string};
export type CostImportEntry={row:CostImportRow;status:'new'|'duplicate'|'error';message:string};
export type CostImportPreview={entries:CostImportEntry[];history:CostHistory[];added:number;duplicates:number;errors:number};
const normalized=(v:string)=>v.normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase('ko');
export const isCostHistoryAction=(kind:string)=>kind==='costHistory'||kind==='costHistoryImport';

// The same preview/validation runs in the browser and again inside the audited server save.
export function previewCostImport(master:CostMaster&GiftMaster,rows:unknown,now=new Date().toISOString(),uuid=()=>crypto.randomUUID()):CostImportPreview{
 if(!Array.isArray(rows)||rows.length<1||rows.length>1000)throw new CostHistoryError('한 번에 1~1,000행의 원가 이력을 올려 주세요.');
 let history=[...(master.costHistory||[])];
 const entries:CostImportEntry[]=[];
 for(const [index,input] of rows.entries()){
  const fallback={rowNumber:index+2,kind:'',name:'',unit:'',effectiveFrom:'',unitCost:''};
  if(!input||typeof input!=='object'||['kind','name','unit','effectiveFrom','unitCost'].some(k=>typeof input[k]!=='string'||input[k].length>200)||!Number.isSafeInteger(input.rowNumber)||input.rowNumber<2||input.rowNumber>1001){
   entries.push({row:fallback,status:'error',message:'입력 행의 형식을 확인해 주세요.'});continue;
  }
  const rawName=input.name.trim().replace(/\s+/g,' '),kind=input.kind.trim();
  const canonical=canonicalCostItem(rawName,kind);
  const known=(master.costHistory||[]).find(h=>h.kind===kind&&(normalized(h.name)===normalized(rawName)||(canonical&&canonicalCostItem(h.name,kind)===canonical)));
  const knownGift=kind==='gift'?(master.giftItems||[]).find(g=>normalized(g.name)===normalized(rawName)):undefined;
  const row:CostImportRow={rowNumber:input.rowNumber,kind,name:known?.name||knownGift?.name||canonical||rawName,unit:input.unit.trim().replace(/\s+/g,' '),effectiveFrom:input.effectiveFrom.trim(),unitCost:input.unitCost.trim()};
  try{
   if(!known&&!knownGift&&!canonical)throw new CostHistoryError('품목명을 양식의 드롭다운에서 선택해 주세요. 새 상품은 원가 이력에 먼저 등록하고 새 사은품은 사은품 목록에 먼저 등록하세요.');
   // Reuse single-row validation before duplicate comparison (blank cost is never 0).
   const sample=appendCostHistory({},row,now,uuid).at(-1)!;
   const existing=history.find(h=>h.kind===sample.kind&&normalized(h.name)===normalized(sample.name)&&normalized(h.unit)===normalized(sample.unit)&&h.effectiveFrom===sample.effectiveFrom);
   if(existing){
    if(existing.unitCost!==sample.unitCost)throw new CostHistoryError('동일 품목·단위·적용 시작일에 다른 원가가 있습니다. 기존 이력은 덮어쓰지 않습니다.');
    entries.push({row,status:'duplicate',message:'같은 원가가 이미 있어 건너뜁니다.'});continue;
   }
   history=appendCostHistory({costHistory:history},row,now,uuid);
   entries.push({row,status:'new',message:'새 이력으로 추가됩니다.'});
  }catch(error){entries.push({row,status:'error',message:error instanceof CostHistoryError?error.message:'원가 입력값을 확인해 주세요.'});}
 }
 return {entries,history,added:entries.filter(e=>e.status==='new').length,duplicates:entries.filter(e=>e.status==='duplicate').length,errors:entries.filter(e=>e.status==='error').length};
}

export function importCostHistory(master:CostMaster&GiftMaster,rows:unknown,now:string,uuid:()=>string){
 const preview=previewCostImport(master,rows,now,uuid);
 if(preview.errors){const first=preview.entries.find(e=>e.status==='error')!;throw new CostHistoryError(`${first.row.rowNumber}행: ${first.message} 오류 ${preview.errors}건을 수정한 후 다시 올려 주세요. 저장된 내역은 없습니다.`);}
 if(!preview.added)throw new CostHistoryError('모두 이미 등록된 원가입니다. 새로 추가할 이력이 없습니다.');
 return preview.history;
}
