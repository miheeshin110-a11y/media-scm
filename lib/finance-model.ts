import {applyLogisticsAction,type Logistics} from './logistics.ts';
import {applyLogisticsWorkbook} from './logistics-workbook.ts';
import {applyScmSetMappings} from './scm-set-mapping.ts';
import {applySetContents} from './set-contents.ts';
import {salesCompositionChoices,compositionKey,type SalesComposition} from './sales-compositions.ts';
import {appendCostHistory,type CostHistory} from './cost-history.ts';
import {importCostHistory} from './cost-history-import.ts';
import {registerGiftItem,type GiftItem} from './gift-items.ts';
import {registrationIssues,resolveAiring,splitPplCost} from './ppl-registration.ts';
import type {AgencyTerms} from './ppl-registration.ts';
import type {PplLink} from './scm-model.ts';
import type {Item} from './scm-model.ts';
import {actualDateTime} from './scm-model.ts';
import {pplAirings} from './ppl-airings.ts';
import type {PplAiring} from './ppl-airings.ts';
import {allocatedPpl} from './ppl-master.ts';
import {computedItem} from './workflow.ts';
import {broadcastCostParts} from './ppl-broadcast-cost.ts';
import {partyChoices,partyId,contractChannels,ownBusinessNo,type Party} from './counterparties.ts';
import {normalizeApproval,approvalValid,mergeTaxInvoices,type TaxInvoice} from './tax-reconcile.ts';
export type Money={net:string;tax:string;taxMode?:'auto'|'manual'};
export const defaultVat=(net:string)=>/^\d+$/.test(net)?String(Math.floor(Number(net)/10)):'';
export function contractName(c:{date:string;party:string;channel:string;code:string;program?:string}){return [c.party||'거래처 선택',c.channel||'채널 미정',...(c.program?[c.program]:[]),c.code||'저장 시 계약번호'].join(' · ');}
// Cumulative integer rounding preserves the exact contract VAT when fully allocated.
export function proportionalTaxes(total:Money,nets:string[]):string[]{
 if(!/^\d+$/.test(total.net)||!/^\d+$/.test(total.tax)||nets.some(n=>!/^\d+$/.test(n)))return nets.map(()=>'');
 const base=BigInt(total.net),tax=BigInt(total.tax);let used=BigInt(0),previous=BigInt(0);
 return nets.map(n=>{used+=BigInt(n);const next=base===BigInt(0)?BigInt(0):used*tax/base;const part=next-previous;previous=next;return String(part)});
}
export type Contract=Money&AgencyTerms&{invoiceApprovals?:string[];airings?:PplAiring[];program?:string;pplOrigin?:{broadcastId:string;link:PplLink};id:string;code:string;name:string;party:string;businessNo:string;partyId?:string;channel:string;approvalNo:string;date:string;notes:string};
export type Allocation=Money&{broadcastCost?:string;agencyFee?:string;airing?:PplAiring;id:string;code:string;contractId:string;broadcastId:string;month:string;active:boolean};
export type InvoiceLink=Money&{contractId:string};
export type Invoice=Money&{id:string;code:string;party:string;businessNo:string;partyId?:string;date:string;approvalNo:string;notes:string;active:boolean;links:InvoiceLink[];linkTaxMode?:'auto'};
export type Finance={version:number;logistics?:Logistics;giftItems?:GiftItem[];costHistory?:CostHistory[];salesCompositions?:SalesComposition[];taxImports?:TaxInvoice[];programs?:{id:string;channel:string;name:string}[];parties?:Party[];contracts:Contract[];allocations:Allocation[];invoices:Invoice[];next:{contract:number;allocation:number;invoice:number}};
export type FinanceAction={kind:'logistics'|'giftItem'|'costHistoryImport'|'costHistory'|'salesComposition'|'invoiceRefs'|'taxImport'|'program'|'party'|'contract'|'allocation'|'allocations'|'invoice'|'voidAllocation'|'voidInvoice';data:Record<string,unknown>};
export const emptyFinance=():Finance=>({version:0,contracts:[],allocations:[],invoices:[],next:{contract:1,allocation:1,invoice:1}});
export class FinanceError extends Error{}
export const amount=(v:string)=>Number(v||0);
export function sumMoney(rows:Money[]):Money{return {net:String(rows.reduce((n,r)=>n+amount(r.net),0)),tax:String(rows.reduce((n,r)=>n+amount(r.tax),0))};}
export function contractTotals(f:Finance,id:string){const c=f.contracts.find(x=>x.id===id)!;const allocated=sumMoney(f.allocations.filter(x=>x.active&&x.contractId===id));const invoiced=sumMoney(f.invoices.filter(x=>x.active).flatMap(x=>x.links.filter(l=>l.contractId===id)));return {allocated,invoiced,remaining:{net:String(amount(c.net)-amount(allocated.net)),tax:String(amount(c.tax)-amount(allocated.tax))},invoiceGap:{net:String(amount(c.net)-amount(invoiced.net)),tax:String(amount(c.tax)-amount(invoiced.tax))}};}
const str=(d:Record<string,unknown>,k:string,required=false)=>{const v=d[k];if(typeof v!=='string'||v.length>1000||(required&&!v.trim()))throw new FinanceError(({name:'계약명',party:'거래처명',businessNo:'사업자등록번호',net:'공급가액',tax:'부가세',date:'날짜',contractId:'계약',broadcastId:'방송',month:'귀속월'} as Record<string,string>)[k]+' 항목을 확인해 주세요.');return v.trim();};
const money=(d:Record<string,unknown>):Money=>{const net=str(d,'net',true);const out:Money={net,tax:d.taxMode==='auto'?defaultVat(net):str(d,'tax',true),...(d.taxMode==='auto'||d.taxMode==='manual'?{taxMode:d.taxMode}:{})};for(const v of [out.net,out.tax])if(!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)>1e12)throw new FinanceError('금액은 0 이상의 정수로 입력해 주세요.');return out;};
const date=(v:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new FinanceError('날짜를 확인해 주세요.');return v;};
const business=(v:string)=>{const n=v.replace(/[-\s]/g,'');if(n&&!/^\d{10}$/.test(n))throw new FinanceError('사업자등록번호는 숫자 10자리로 입력해 주세요.');return n;};
function allocationAiring(d:Record<string,unknown>,old?:Allocation):{airing?:PplAiring}{
 if(d.airing===undefined)return old?.airing?{airing:old.airing}:{};
 const a=d.airing as Record<string,unknown>;
 if(!a||typeof a!=='object'||['date','time','kind'].some(k=>typeof a[k]!=='string')||(a.originalDate!==undefined&&typeof a.originalDate!=='string'))throw new FinanceError('PPL 방송일정을 확인해 주세요.');
 const date=String(a.date).trim(),time=String(a.time).trim(),kind=String(a.kind).trim(),originalDate=String(a.originalDate||'').trim();
 if((date&&!actualDateTime(date,'00:00'))||(time&&!actualDateTime(date||'2026-01-01',time))||(kind&&!['본방','재방','스페셜'].includes(kind))||(originalDate&&!actualDateTime(originalDate,'00:00'))||(date&&originalDate&&originalDate>date))throw new FinanceError('PPL 방송일·시간·송출구분과 원본 본방일을 확인해 주세요.');
 return {airing:{...(typeof a.id==='string'?{id:a.id}:{}),date,time,kind,originalDate}};
}
export function applyFinanceAction(current:Finance,action:FinanceAction,broadcastIds:Set<string>,now=new Date().toISOString(),uuid=()=>crypto.randomUUID(),context?:{items:Item[];actor:string}):Finance{
  const f:Finance=structuredClone(current),d=action.data;if(!d||typeof d!=='object')throw new FinanceError('입력 내용을 확인해 주세요.');
  const id=typeof d.id==='string'?d.id:'';
  const agencyCostSelections=new Set<string>();
  const selectAgencyCost=(value:unknown,allocation:Allocation)=>{
    if(value!==undefined&&typeof value!=='boolean')throw new FinanceError('대행료 차감 적용 선택을 확인해 주세요.');
    if(value===true){
      const c=f.contracts.find(c=>c.id===allocation.contractId);
      if(c?.tradeType!=='agency')throw new FinanceError('대행 거래의 배분에만 대행료 차감을 적용할 수 있습니다.');
      if(!splitPplCost(c))throw new FinanceError('계약의 대행료율을 확인한 뒤 적용하세요.');
      agencyCostSelections.add(allocation.id);
    }
  };
  const identity=(kind:'contract'|'allocation'|'invoice',existing?:{id:string;code:string})=>existing?{id:existing.id,code:existing.code}:{id:uuid(),code:(kind==='contract'?'PPL-'+now.slice(0,4):kind==='invoice'?'INV-'+now.slice(0,4):'ALLOC')+'-'+String(f.next[kind]++).padStart(kind==='allocation'?6:4,'0')};
  const selectedParty=()=>{const n=business(str(d,'businessNo',true));const p=partyChoices(f).find(x=>x.id===(d.partyId||partyId(n)));if(!p||p.businessNo!==n)throw new FinanceError('사업자등록번호가 확인된 거래처를 목록에서 선택해 주세요.');return {partyId:p.id,party:p.name,businessNo:p.businessNo};};
  if(action.kind==='logistics'){
    f.logistics=d.op==='setContents'?applySetContents(f,d,context?.items||[],context?.actor||'unknown',now,uuid):d.op==='scmSetMapping'?applyScmSetMappings(f,d,context?.items||[],context?.actor||'unknown',now,uuid):d.op==='workbook'?applyLogisticsWorkbook(f,d.workbook,context?.items||[],context?.actor||'unknown',now,uuid):applyLogisticsAction(f.logistics,d,context?.items||[],context?.actor||'unknown',now,uuid);
  }else if(action.kind==='giftItem'){
    f.giftItems=registerGiftItem(f,d,uuid);
  }else if(action.kind==='costHistoryImport'){
    f.costHistory=importCostHistory(f,d.rows,now,uuid);
  }else if(action.kind==='costHistory'){
    f.costHistory=appendCostHistory(f,d,now,uuid);
  }else if(action.kind==='salesComposition'){
    if(typeof d.name!=='string'||!d.name.trim()||d.name.trim().length>120)throw new FinanceError('판매 구성명은 1~120자로 입력해 주세요.');
    const name=d.name.trim().replace(/\s+/g,' ');
    if(!salesCompositionChoices(f).some(x=>compositionKey(x.name)===compositionKey(name))){
      if((f.salesCompositions?.length||0)>=2000)throw new FinanceError('판매 구성 등록 한도를 초과했습니다.');
      (f.salesCompositions??=[]).push({code:'custom:'+uuid(),name});
    }
  }else if(action.kind==='invoiceRefs'){
    const c=f.contracts.find(c=>c.id===d.contractId);
    if(!c||!Array.isArray(d.approvals)||d.approvals.length>20||d.approvals.some(n=>typeof n!=='string'||!approvalValid(n)))throw new FinanceError('계약을 선택하고 홈택스 승인번호 24자리를 입력해 주세요.');
    c.invoiceApprovals=[...new Set((d.approvals as string[]).map(normalizeApproval))];
  }else if(action.kind==='taxImport'){
    if(!Array.isArray(d.rows)||!d.rows.length||d.rows.length>2000)throw new FinanceError('업로드할 계산서는 1~2,000건이어야 합니다.');
    try{f.taxImports=mergeTaxInvoices(f.taxImports||[],d.rows,now).rows;}catch(e){throw new FinanceError(e instanceof Error?e.message:'계산서 내용을 확인해 주세요.');}
  }else if(action.kind==='program'){
    const channel=str(d,'channel',true),name=str(d,'name',true);
    if(!contractChannels.includes(channel))throw new FinanceError('채널을 목록에서 선택해 주세요.');
    if((f.programs||[]).some(p=>p.channel===channel&&p.name.replace(/\s/g,'')===name.replace(/\s/g,'')))throw new FinanceError('이미 등록된 프로그램입니다.');
    if((f.programs?.length||0)>=500)throw new FinanceError('프로그램 등록 한도를 초과했습니다.');
    (f.programs??=[]).push({id:uuid(),channel,name});
  }else if(action.kind==='party'){
    const n=business(str(d,'businessNo',true)),name=str(d,'name',true);
    if(n===ownBusinessNo)throw new FinanceError('데이즈온은 자사입니다. 계약 거래처를 등록해 주세요.');
    if(partyChoices(f).some(p=>p.businessNo===n))throw new FinanceError('이미 등록된 사업자등록번호입니다. 기존 거래처를 선택해 주세요.');
    if((f.parties?.length||0)>=500)throw new FinanceError('거래처 등록 한도를 초과했습니다.');
    (f.parties??=[]).push({id:partyId(n),name,businessNo:n,source:'사용자 등록'});
  }else if(action.kind==='contract'){
    const old=f.contracts.find(x=>x.id===id);if(id&&!old)throw new FinanceError('계약을 다시 선택해 주세요.');
    const channel=str(d,'channel');if(channel&&!contractChannels.includes(channel)&&channel!==old?.channel)throw new FinanceError('방송 채널을 목록에서 선택해 주세요.');
    const contractDate=str(d,'date');
    const row:Contract={...(old?.invoiceApprovals!==undefined?{invoiceApprovals:old.invoiceApprovals}:{}),...(old?.pplOrigin?{pplOrigin:old.pplOrigin}:{}),...identity('contract',old),...money(d),...selectedParty(),name:'',channel,program:d.program===undefined?old?.program||'':str(d,'program'),approvalNo:str(d,'approvalNo'),date:contractDate?date(contractDate):'',notes:str(d,'notes')};
    if(d.airings!==undefined){
      if(!Array.isArray(d.airings)||d.airings.length>20)throw new FinanceError('PPL 방송일정은 20개까지 등록할 수 있습니다.');
      row.airings=d.airings.map(value=>{
        if(!value||typeof value!=='object')throw new FinanceError('PPL 방송일정을 확인해 주세요.');
        const a=value as Record<string,unknown>;
        if(['date','time','kind'].some(k=>typeof a[k]!=='string')||(a.originalDate!==undefined&&typeof a.originalDate!=='string'))throw new FinanceError('PPL 방송일정을 확인해 주세요.');
        const dateValue=String(a.date).trim(),time=String(a.time).trim(),kind=String(a.kind).trim(),originalDate=String(a.originalDate||'').trim();
        if((dateValue&&!actualDateTime(dateValue,'00:00'))||(time&&!actualDateTime(dateValue||'2026-01-01',time))||(kind&&!['본방','재방','스페셜'].includes(kind))||(originalDate&&!actualDateTime(originalDate,'00:00'))||(dateValue&&originalDate&&originalDate>dateValue))throw new FinanceError('PPL 방송일·시간·송출구분과 원본 본방일을 확인해 주세요.');
        return {...(typeof a.id==='string'?{id:a.id}:{}),date:dateValue,time,kind,originalDate};
      }).filter(a=>a.date||a.time||a.kind||a.originalDate);
    }else if(old?.airings)row.airings=old.airings;
    if(d.tradeType!==undefined){
      if(!['direct','agency'].includes(String(d.tradeType)))throw new FinanceError('거래 방식을 선택해 주세요.');
      row.tradeType=d.tradeType as 'direct'|'agency';row.agencyRate=row.tradeType==='direct'?'0':str(d,'agencyRate',true);
      if(row.tradeType==='agency'&&(!/^\d{1,3}(\.\d{1,2})?$/.test(row.agencyRate)||Number(row.agencyRate)>100))throw new FinanceError('대행료율을 0~100% 범위, 소수 둘째 자리까지 입력하세요.');
    }else if(old?.tradeType){row.tradeType=old.tradeType;row.agencyRate=old.agencyRate;}
    if(row.airings?.some(a=>a.id)){
      if(row.airings.some(a=>!a.id))throw new FinanceError('모든 송출일정의 ID를 확인해 주세요.');
      const errors=registrationIssues(row,old?pplAirings(old,[],f.allocations):[]);if(errors.length)throw new FinanceError(errors.join(' '));
      for(const allocation of f.allocations.filter(a=>a.active&&a.contractId===row.id&&a.airing)){
        const resolved=resolveAiring(row,allocation.airing);
        if(!resolved)throw new FinanceError('홈쇼핑 방송에 연결된 송출일정은 삭제할 수 없습니다. 연결·배분에서 다른 일정을 선택하거나 연결을 해제하세요.');
        allocation.airing={...resolved};
      }
    }else if(old?.airings?.some(a=>a.id))throw new FinanceError('등록된 송출일정을 모두 삭제할 수 없습니다.');
    row.name=contractName(row);if(old)f.contracts[f.contracts.indexOf(old)]=row;else f.contracts.push(row);
  }else if(action.kind==='allocations'){
    const contractId=str(d,'contractId',true),c=f.contracts.find(x=>x.id===contractId);
    if(!c||!Array.isArray(d.rows)||d.rows.length>50)throw new FinanceError('계약과 방송 배분목록을 확인해 주세요. 한 번에 50개까지 저장할 수 있습니다.');
    const submitted=new Set<string>(),broadcasts=new Set<string>();
    const rows:Allocation[]=d.rows.map(value=>{
      if(!value||typeof value!=='object')throw new FinanceError('방송 배분 내용을 확인해 주세요.');
      const r=value as Record<string,unknown>,rowId=typeof r.id==='string'?r.id:'',old=f.allocations.find(a=>a.id===rowId);
      if(rowId&&(!old||!old.active||old.contractId!==contractId||submitted.has(rowId)))throw new FinanceError('배분 내역을 다시 불러와 주세요.');
      const broadcastId=str(r,'broadcastId',true),month=str(r,'month',true);
      if(!broadcastIds.has(broadcastId)||broadcasts.has(broadcastId))throw new FinanceError('방송을 선택하고 같은 방송의 중복 선택을 해제해 주세요.');
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new FinanceError('귀속월을 확인해 주세요.');
      submitted.add(rowId);broadcasts.add(broadcastId);
      const row:Allocation={...identity('allocation',old),...allocationAiring(r,old),...money({...r,taxMode:'auto'}),contractId,broadcastId,month,active:true};
      selectAgencyCost(r.applyAgencyCost,row);return row;
    });
    for(const old of f.allocations.filter(a=>a.active&&a.contractId===contractId))if(!rows.some(r=>r.id===old.id))old.active=false;
    for(const row of rows){const i=f.allocations.findIndex(a=>a.id===row.id);if(i<0)f.allocations.push(row);else f.allocations[i]=row;}
  }else if(action.kind==='allocation'){
    const old=f.allocations.find(x=>x.id===id);if(id&&(!old||!old.active))throw new FinanceError('배분 내역을 다시 선택해 주세요.');
    const contractId=str(d,'contractId',true),broadcastId=str(d,'broadcastId',true),month=str(d,'month',true);
    if(!f.contracts.some(x=>x.id===contractId)||!broadcastIds.has(broadcastId))throw new FinanceError('등록된 계약과 방송을 선택해 주세요.');
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new FinanceError('귀속월을 확인해 주세요.');
    if(f.allocations.some(x=>x.active&&x.id!==id&&x.contractId===contractId&&x.broadcastId===broadcastId))throw new FinanceError('같은 계약과 방송의 배분이 있습니다. 기존 내역을 수정해 주세요.');
    const row:Allocation={...identity('allocation',old),...allocationAiring(d,old),...money({...d,taxMode:'auto'}),contractId,broadcastId,month,active:true};selectAgencyCost(d.applyAgencyCost,row);if(old)f.allocations[f.allocations.indexOf(old)]=row;else f.allocations.push(row);
  }else if(action.kind==='invoice'){
    const old=f.invoices.find(x=>x.id===id);if(id&&(!old||!old.active))throw new FinanceError('계산서를 다시 선택해 주세요.');
    if(!Array.isArray(d.links)||!d.links.length)throw new FinanceError('계약별 연결금액을 한 개 이상 입력해 주세요.');
    const links:InvoiceLink[]=d.links.map(l=>{if(!l||typeof l!=='object')throw new FinanceError('연결금액을 확인해 주세요.');return {contractId:str(l,'contractId',true),...money(d.linkTaxMode==='auto'?{...l,taxMode:'auto'}:l)};});
    if(new Set(links.map(x=>x.contractId)).size!==links.length)throw new FinanceError('계산서 안에 같은 계약을 중복 연결할 수 없습니다.');
    const row:Invoice={...identity('invoice',old),...money(d),...selectedParty(),date:date(str(d,'date',true)),approvalNo:str(d,'approvalNo'),notes:str(d,'notes'),active:true,links,...(d.linkTaxMode==='auto'?{linkTaxMode:'auto' as const}:{})};
    if(d.linkTaxMode==='auto'){const taxes=proportionalTaxes(row,links.map(l=>l.net));links.forEach((l,i)=>l.tax=taxes[i]);}
    if(row.approvalNo&&f.invoices.some(x=>x.id!==id&&x.approvalNo===row.approvalNo))throw new FinanceError('이미 등록된 세금계산서 승인번호입니다.');
    const linked=sumMoney(links);if(amount(linked.net)>amount(row.net)||amount(linked.tax)>amount(row.tax))throw new FinanceError('계약 연결금액이 계산서 공급가액 또는 부가세를 초과합니다.');
    if(old)f.invoices[f.invoices.indexOf(old)]=row;else f.invoices.push(row);
  }else if(action.kind==='voidAllocation'||action.kind==='voidInvoice'){
    const row=(action.kind==='voidAllocation'?f.allocations:f.invoices).find(x=>x.id===id);if(!row||!row.active)throw new FinanceError('이미 해제됐거나 없는 내역입니다.');row.active=false;
  }else throw new FinanceError('지원하지 않는 저장 요청입니다.');
  if(action.kind==='allocation'||action.kind==='allocations'){
    const c=f.contracts.find(c=>c.id===d.contractId);
    if(c?.airings?.some(a=>a.id))for(const allocation of f.allocations.filter(a=>a.active&&a.contractId===c.id)){
      const resolved=resolveAiring(c,allocation.airing);
      if(!resolved)throw new FinanceError('PPL 등록 화면에 저장된 송출일정을 선택해 주세요.');
      allocation.airing={...resolved};
    }
  }
  const changedContracts=action.kind==='contract'?[f.contracts.find(c=>c.id===id)?.id||f.contracts[f.contracts.length-1]?.id]:action.kind==='allocations'?[String(d.contractId)]:action.kind==='allocation'?[String(d.contractId),current.allocations.find(a=>a.id===id)?.contractId]:action.kind==='voidAllocation'?[current.allocations.find(a=>a.id===id)?.contractId]:[];
  // No backfill: unchanged existing allocations retain their saved cost basis.
  if(action.kind==='allocation'||action.kind==='allocations')for(const contractId of new Set(changedContracts)){
    const c=f.contracts.find(c=>c.id===contractId);if(!c)continue;
    const rows=f.allocations.filter(a=>a.active&&a.contractId===contractId),parts=broadcastCostParts(c,rows.map(a=>a.net));
    rows.forEach((a,i)=>{const old=current.allocations.find(x=>x.id===a.id);
      const changed=!old||old.net!==a.net||old.contractId!==a.contractId||old.broadcastId!==a.broadcastId;
      if((changed||agencyCostSelections.has(a.id))&&parts[i]){a.broadcastCost=parts[i]!.cost;a.agencyFee=parts[i]!.fee;}
      else if(old?.broadcastCost!==undefined){a.broadcastCost=old.broadcastCost;a.agencyFee=old.agencyFee;}
      else {delete a.broadcastCost;delete a.agencyFee;}
    });
  }
  for(const contractId of new Set(changedContracts)){const c=f.contracts.find(x=>x.id===contractId);if(!c)continue;const rows=f.allocations.filter(a=>a.active&&a.contractId===c.id),taxes=proportionalTaxes(c,rows.map(a=>a.net));rows.forEach((a,i)=>{a.tax=taxes[i];a.taxMode='auto'});}
  for(const inv of f.invoices.filter(x=>x.active))for(const link of inv.links){const c=f.contracts.find(x=>x.id===link.contractId);if(!c||!c.businessNo||c.businessNo!==inv.businessNo)throw new FinanceError('세금계산서와 계약 거래처의 사업자등록번호가 같아야 합니다.');}
  for(const c of f.contracts){const t=contractTotals(f,c.id);if(amount(t.remaining.net)<0||amount(t.remaining.tax)<0)throw new FinanceError(c.code+': 방송 배분금액이 계약의 공급가액 또는 부가세를 초과합니다.');if(amount(t.invoiceGap.net)<0||amount(t.invoiceGap.tax)<0)throw new FinanceError(c.code+': 계산서 연결금액이 계약의 공급가액 또는 부가세를 초과합니다.');}
  if(f.contracts.length>500||f.allocations.length>500||f.invoices.length>500||f.invoices.reduce((n,x)=>n+x.links.length,0)>900)throw new FinanceError('테스트 저장 용량을 초과했습니다. 운영 용량 확장이 필요합니다.');
  for(const broadcastId of new Set(f.allocations.filter(a=>a.active).map(a=>a.broadcastId)))if(f.allocations.filter(a=>a.active&&a.broadcastId===broadcastId).length>20)throw new FinanceError('한 방송에는 PPL을 20건까지 연결할 수 있습니다.');
  f.version++;return f;
}
export function allocationValues(f:Finance,id:string){const rows=f.allocations.filter(x=>x.active&&x.broadcastId===id),contracts=f.contracts.filter(c=>rows.some(a=>a.contractId===c.id));return {airings:rows.map(r=>({id:r.id,contractId:r.contractId,airing:r.airing})),net:sumMoney(rows).net,costNet:String(rows.reduce((sum,a)=>sum+amount(a.broadcastCost??a.net),0)),tax:sumMoney(rows).tax,codes:contracts.map(c=>c.code).join(', '),contractNet:sumMoney(contracts).net,month:new Set(rows.map(x=>x.month)).size===1?rows[0].month:'',managed:f.allocations.some(x=>x.broadcastId===id)};}
export function withFinance(item:Item,f:Finance):Item{item=allocatedPpl(item,f);const a=allocationValues(f,item.id);if(!a.managed)return computedItem({...item,financeVersion:f.version});return computedItem({...item,financeVersion:f.version,allocationManaged:true,allocation:a.net,pplBroadcastCost:a.costNet,contractId:a.codes,contractAmount:a.contractNet,attribution:a.month,...(item.result?{result:{...item.result,pplCost:a.costNet}}:{})});}
