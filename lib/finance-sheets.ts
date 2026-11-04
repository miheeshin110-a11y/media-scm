import {splitPplCost,splitPplGrossCost} from './ppl-registration.ts';
import {invoiceRefs,reconcileContract} from './tax-reconcile.ts';
import {airingSummary} from './ppl-airings.ts';
import {amount,type Finance} from './finance-model.ts';
import {allocationTraceCode} from './ppl-allocation-code.ts';
export const financeSheetHeaders={
 'SCM_계약':['계약 내부ID','계약ID','계약명','계약 거래처','사업자등록번호','방송 채널','기안번호','계약일','공급가액','부가세','합계금액','메모','버전','PPL 프로그램명','PPL 방송일정','계산서 승인번호','엑셀 대조상태','거래 방식','대행료율(%)','포함 대행료 · 부가세 제외','대행료 제외 금액 · 부가세 제외','밴더사 수수료 · 부가세 포함','수수료 제외 PPL 금액 · 부가세 포함'],
 'SCM_방송배분':['배분 내부ID','배분ID','계약 내부ID','계약ID','방송ID','귀속월','공급가액','부가세','합계금액','상태','버전','PPL 방송일','PPL 방송시간','송출구분','원본 본방일','원본 PPL별 배분코드'],
 'SCM_세금계산서':['계산서 내부ID','계산서ID','승인번호','거래처','사업자등록번호','발행일','공급가액','부가세','합계금액','상태','메모','버전','공급받는자','공급받는자 사업자번호','원본 승인번호','원본 파일'],
 'SCM_계산서연결':['계산서 내부ID','계산서ID','계약 내부ID','계약ID','연결 공급가액','연결 부가세','연결 합계금액','상태','버전'],
} as const;
export function financeSheetRows(f:Finance){
 const data:(string|number)[][][]=[
 f.contracts.map(c=>[c.id,c.code,c.name,c.party,c.businessNo,c.channel,c.approvalNo,c.date,c.net,c.tax,amount(c.net)+amount(c.tax),c.notes,f.version,c.program||c.pplOrigin?.link.program||'',airingSummary(c,[],f.allocations),invoiceRefs(f,c).join(', '),reconcileContract(f,c).status,c.tradeType==='direct'?'직거래':c.tradeType==='agency'?'대행':'',c.agencyRate||'',splitPplCost(c)?.fee??'',splitPplCost(c)?.media??'',splitPplGrossCost(c)?.fee??'',splitPplGrossCost(c)?.media??'']),
 f.allocations.map(a=>[a.id,a.code,a.contractId,f.contracts.find(c=>c.id===a.contractId)?.code||'',a.broadcastId,a.month,a.net,a.tax,amount(a.net)+amount(a.tax),a.active?'유효':'해제',f.version,a.airing?.date||'',a.airing?.time||'',a.airing?.kind||'',a.airing?.originalDate||'',allocationTraceCode(f,a)]),
 [...f.invoices.map(i=>[i.id,i.code,i.approvalNo,i.party,i.businessNo,i.date,i.net,i.tax,amount(i.net)+amount(i.tax),i.active?'기존 수기 등록':'등록취소',i.notes,f.version,'','','','']),...(f.taxImports||[]).map(i=>['TAX-'+i.approvalNo,'홈택스',i.approvalNo,i.supplierName,i.supplierNo,i.issuedDate||i.date,i.net,i.tax,i.total,i.kind,'승인번호로 대조 · 기존 수기 등록과 합산하지 않음',f.version,i.customerName,i.customerNo,i.originalApprovalNo,i.sourceFile])],
 f.invoices.flatMap(i=>i.links.map(l=>[i.id,i.code,l.contractId,f.contracts.find(c=>c.id===l.contractId)?.code||'',l.net,l.tax,amount(l.net)+amount(l.tax),i.active?'유효':'등록취소',f.version]))
 ];return Object.entries(financeSheetHeaders).map(([name,headers],i)=>{const rows=[Array.from(headers),...data[i]] as (string|number)[][];const end=Math.max(1001,rows.length);while(rows.length<end)rows.push(Array(headers.length).fill(''));return {range:"'"+name+"'!A1:"+String.fromCharCode(64+headers.length)+end,values:rows};});
}
