import type {Finance,Contract} from './finance-model.ts';
export type TaxInvoice={approvalNo:string;date:string;issuedDate:string;supplierNo:string;supplierName:string;customerNo:string;customerName:string;net:string;tax:string;total:string;kind:string;originalApprovalNo:string;sourceFile:string;sourceRow:number;importedAt?:string};
export const normalizeApproval=(v:string)=>v.trim().replace(/[-\s]/g,'').toUpperCase();
export const approvalValid=(v:string)=>/^\d{16}[A-Z0-9]{8}$/.test(normalizeApproval(v));
export const displayApproval=(v:string)=>approvalValid(v)?normalizeApproval(v).match(/.{8}/g)!.join('-'):v;
const dateValid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const signed=(s:string)=>/^-?\d+$/.test(s)&&Number.isSafeInteger(Number(s))&&Math.abs(Number(s))<=1e12;
export function validateTaxInvoice(value:unknown):TaxInvoice{
 const x=value as TaxInvoice;
 if(!x||typeof x!=='object'||['approvalNo','date','issuedDate','supplierNo','supplierName','customerNo','customerName','net','tax','total','kind','originalApprovalNo','sourceFile'].some(k=>typeof (x as unknown as Record<string,unknown>)[k]!=='string'||String((x as unknown as Record<string,unknown>)[k]).length>300))throw new Error('계산서 열 형식을 확인해 주세요.');
 if(!approvalValid(x.approvalNo)||!dateValid(x.date)||(x.issuedDate&&!dateValid(x.issuedDate))||!/^\d{10}$/.test(x.supplierNo)||!/^\d{10}$/.test(x.customerNo)||![x.net,x.tax,x.total].every(signed)||Number(x.net)+Number(x.tax)!==Number(x.total)||(x.originalApprovalNo&&!approvalValid(x.originalApprovalNo))||!Number.isSafeInteger(x.sourceRow)||x.sourceRow<1)throw new Error('승인번호·작성일·사업자번호·금액을 확인해 주세요. 숫자로 변환되어 손상된 승인번호는 원본 엑셀로 다시 올려 주세요.');
 return {approvalNo:normalizeApproval(x.approvalNo),date:x.date,issuedDate:x.issuedDate,supplierNo:x.supplierNo,supplierName:x.supplierName,customerNo:x.customerNo,customerName:x.customerName,net:String(Number(x.net)),tax:String(Number(x.tax)),total:String(Number(x.total)),kind:x.kind,originalApprovalNo:normalizeApproval(x.originalApprovalNo),sourceFile:x.sourceFile,sourceRow:x.sourceRow};
}
const facts=(x:TaxInvoice)=>JSON.stringify([x.date,x.issuedDate,x.supplierNo,x.customerNo,x.net,x.tax,x.total,x.kind,x.originalApprovalNo]);
export function mergeTaxInvoices(current:TaxInvoice[],incoming:unknown[],now=new Date().toISOString()){
 const map=new Map(current.map(x=>[x.approvalNo,x]));let added=0,duplicates=0;
 for(const value of incoming){const row=validateTaxInvoice(value),old=map.get(row.approvalNo);if(old){if(facts(old)!==facts(row))throw new Error(displayApproval(row.approvalNo)+': 같은 승인번호에 다른 내용이 있습니다. 원본을 확인해 주세요.');duplicates++;}else{map.set(row.approvalNo,{...row,importedAt:now});added++;}}
 if(map.size>2000)throw new Error('계산서 보관 한도 2,000건을 초과했습니다.');
 return {rows:[...map.values()],added,duplicates};
}
export function parseHometaxRows(rows:unknown[][],sourceFile:string):TaxInvoice[]{
 const clean=(v:unknown)=>String(v??'').trim();
 const header=rows.findIndex(r=>r.some(v=>clean(v).replace(/\s/g,'')==='승인번호')&&r.some(v=>clean(v).replace(/\s/g,'')==='공급가액'));
 if(header<0)throw new Error('홈택스 목록의 승인번호·공급가액 열을 찾지 못했습니다.');
 const h=rows[header].map(v=>clean(v).replace(/\s/g,'')),index=(...names:string[])=>h.findIndex(v=>names.includes(v));
 const a=index('승인번호'),d=index('작성일자','작성일'),issued=index('발급일자','발급일'),sn=index('공급자사업자등록번호'),cn=index('공급받는자사업자등록번호'),net=index('공급가액'),tax=index('세액','부가세'),total=index('합계금액');
 if([a,d,sn,cn,net,tax,total].some(i=>i<0))throw new Error('승인번호·작성일자·공급자/공급받는자 사업자번호·공급가액·세액·합계금액 열이 필요합니다.');
 const nameAfter=(start:number,end:number)=>h.findIndex((v,i)=>i>start&&i<end&&v==='상호');
 const supplierName=index('공급자상호')>=0?index('공급자상호'):nameAfter(sn,cn),customerName=index('공급받는자상호')>=0?index('공급받는자상호'):nameAfter(cn,h.length);
 const k=index('전자세금계산서분류','세금계산서분류'),n=index('비고');const result:TaxInvoice[]=[];
 const asDate=(v:unknown)=>clean(v).replace(/[./]/g,'-').replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/,(_,y,m,d)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
 const asMoney=(v:unknown)=>clean(v).replace(/[,\s원₩]/g,'').replace(/^\((\d+)\)$/,'-$1');
 for(let i=header+1;i<rows.length;i++){const r=rows[i];if(!clean(r[a])||clean(r[a])==='승인번호')continue;
  const note=clean(r[n]),original=note.match(/(?:당초|원본)\s*승인번호\s*[:(]?\s*(\d{8}-?\d{8}-?[a-zA-Z0-9]{8})/);
  try{result.push(validateTaxInvoice({approvalNo:clean(r[a]),date:asDate(r[d]),issuedDate:issued<0?'':asDate(r[issued]),supplierNo:clean(r[sn]).replace(/[-\s]/g,''),supplierName:clean(r[supplierName]),customerNo:clean(r[cn]).replace(/[-\s]/g,''),customerName:clean(r[customerName]),net:asMoney(r[net]),tax:asMoney(r[tax]),total:asMoney(r[total]),kind:clean(r[k]),originalApprovalNo:original?.[1]||'',sourceFile,sourceRow:i+1}));}catch(e){throw new Error(`${sourceFile} ${i+1}행: ${e instanceof Error?e.message:'형식 확인 필요'}`);}
 }
 if(!result.length)throw new Error('계산서 데이터가 없습니다.');return mergeTaxInvoices([],result).rows;
}
export function invoiceRefs(f:Finance,c:Contract):string[]{return c.invoiceApprovals??[...new Set(f.invoices.filter(i=>i.active&&i.links.some(l=>l.contractId===c.id)).map(i=>normalizeApproval(i.approvalNo)).filter(Boolean))];}
export function reconcileContract(f:Finance,c:Contract){
 const contracts=new Set([c.id]),refs=new Set(invoiceRefs(f,c));let changed=true;
 while(changed&&refs.size){changed=false;for(const other of f.contracts){const list=invoiceRefs(f,other);if(list.some(n=>refs.has(n))){if(!contracts.has(other.id)){contracts.add(other.id);changed=true;}for(const n of list)if(!refs.has(n)){refs.add(n);changed=true;}}}}
 const members=f.contracts.filter(x=>contracts.has(x.id)),found=(f.taxImports||[]).filter(x=>refs.has(x.approvalNo)),missing=[...refs].filter(n=>!found.some(x=>x.approvalNo===n));
 const expectedNet=members.reduce((n,x)=>n+Number(x.net),0),expectedTax=members.reduce((n,x)=>n+Number(x.tax),0),actualNet=found.reduce((n,x)=>n+Number(x.net),0),actualTax=found.reduce((n,x)=>n+Number(x.tax),0);
 const corrected=found.some(x=>Number(x.net)<0||Number(x.tax)<0||x.kind.includes('수정')||x.originalApprovalNo)||(f.taxImports||[]).some(x=>x.originalApprovalNo&&refs.has(x.originalApprovalNo));
 const wrongParty=found.some(x=>!members.some(m=>invoiceRefs(f,m).includes(x.approvalNo)&&[x.supplierNo,x.customerNo].includes(m.businessNo)))||members.some(m=>found.some(x=>invoiceRefs(f,m).includes(x.approvalNo)&&![x.supplierNo,x.customerNo].includes(m.businessNo)));
 const status=!refs.size?'번호 미등록':missing.length?'엑셀 확인 대기':corrected?'수정계산서 확인':wrongParty?'거래처 확인':actualNet!==expectedNet||actualTax!==expectedTax?'금액 차이':'대조 일치';
 return {status,refs:[...refs],found,missing,members,expectedNet,expectedTax,actualNet,actualTax,netGap:actualNet-expectedNet,taxGap:actualTax-expectedTax};
}
