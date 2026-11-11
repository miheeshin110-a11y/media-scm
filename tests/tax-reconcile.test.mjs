import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHometaxRows,mergeTaxInvoices,invoiceRefs,reconcileContract} from '../lib/tax-reconcile.ts';
import {applyFinanceAction,emptyFinance,allocationValues} from '../lib/finance-model.ts';
import {financeSheetRows} from '../lib/finance-sheets.ts';
const no='202609151026091672352960',no2='202609151026091672352961';
const headers=['작성일자','승인번호','발급일자','공급자사업자등록번호','상호','공급받는자사업자등록번호','상호','합계금액','공급가액','세액','전자세금계산서분류','비고'];
const row=['2026-09-15','20260915-10260916-72352960','2026-09-16','575-87-03517','테스트 공급자','114-86-67134','테스트 공급받는자','11,000','10,000','1,000','일반',''];
const sample=()=>parseHometaxRows([headers,row],'테스트.xls')[0];
const contract=(id,net='10000',tax='1000',numbers=[no])=>({id,code:id,name:id,party:'테스트 공급자',businessNo:'5758703517',channel:'TV조선',approvalNo:'',date:'',net,tax,notes:'',invoiceApprovals:numbers});
const finance=()=>({...emptyFinance(),contracts:[contract('A')],taxImports:[sample()]});
test('Hometax title rows, duplicate name columns, comma amounts and approval dashes parse reliably',()=>{
 const rows=parseHometaxRows([['홈택스 내려받기'],[],headers,row,row],'테스트.xls');assert.equal(rows.length,1);assert.equal(rows[0].approvalNo,no);assert.equal(rows[0].supplierName,'테스트 공급자');assert.equal(rows[0].customerName,'테스트 공급받는자');assert.equal(rows[0].net,'10000');assert.equal(rows[0].sourceRow,4);
 const alpha=row.map((v,i)=>i===1?'20260915-10260916-1jefsb2l':i===11?'당초 승인번호 (20260815-10260816-1jefsb2l)':v);const parsed=parseHometaxRows([headers,alpha],'영문번호.xls')[0];assert.equal(parsed.approvalNo,'20260915102609161JEFSB2L');assert.equal(parsed.originalApprovalNo,'20260815102608161JEFSB2L');
 assert.throws(()=>parseHometaxRows([headers,[...row.slice(0,1),2.0260915102609167e23,...row.slice(2)]],'손상.xls'),/승인번호/);
 assert.throws(()=>parseHometaxRows([headers,row.map((v,i)=>i===7?'12,000':v)],'잘못된금액.xls'),/금액/);
});
test('same invoice imported from purchase and sales exports is idempotent; conflicts never overwrite',()=>{
 const first=sample(),r=mergeTaxInvoices([first],[{...first,sourceFile:'다른파일.xls',sourceRow:20}]);assert.equal(r.rows.length,1);assert.equal(r.duplicates,1);
 assert.throws(()=>mergeTaxInvoices([first],[{...first,net:'11000',total:'12000'}]),/다른 내용/);assert.equal(first.net,'10000');
});
test('one invoice across multiple PPLs compares combined contracts, not repeated full invoices',()=>{
 const f=finance();f.contracts=[contract('A','6000','600'),contract('B','4000','400')];const r=reconcileContract(f,f.contracts[0]);assert.equal(r.status,'대조 일치');assert.equal(r.members.length,2);assert.equal(r.actualNet,10000);
 f.contracts[1].net='3000';assert.equal(reconcileContract(f,f.contracts[0]).status,'금액 차이');
});
test('split invoices, missing uploads, wrong business numbers, and amendments remain distinguishable',()=>{
 const f=finance();f.contracts[0].invoiceApprovals=[no,no2];assert.equal(reconcileContract(f,f.contracts[0]).status,'엑셀 확인 대기');
 f.taxImports=[{...sample(),net:'6000',tax:'600',total:'6600'},{...sample(),approvalNo:no2,net:'4000',tax:'400',total:'4400'}];assert.equal(reconcileContract(f,f.contracts[0]).status,'대조 일치');
 f.taxImports[1].supplierNo='1234567890';assert.equal(reconcileContract(f,f.contracts[0]).status,'거래처 확인');
 f.taxImports[1]={...sample(),approvalNo:no2,net:'-10000',tax:'-1000',total:'-11000',kind:'수정세금계산서',originalApprovalNo:no};f.contracts[0].invoiceApprovals=[no];assert.equal(reconcileContract(f,f.contracts[0]).status,'수정계산서 확인');
});
test('reference/import actions preserve costs, survive contract edits and export into existing sheets',()=>{
 let f=finance();delete f.contracts[0].invoiceApprovals;delete f.taxImports;const before=allocationValues(f,'broadcast');
 f=applyFinanceAction(f,{kind:'invoiceRefs',data:{contractId:'A',approvals:['20260915-10260916-72352960',no]}},new Set());assert.deepEqual(invoiceRefs(f,f.contracts[0]),[no]);
 f=applyFinanceAction(f,{kind:'taxImport',data:{rows:[sample()]}},new Set());assert.deepEqual(allocationValues(f,'broadcast'),before);assert.equal(f.invoices.length,0);
 f=applyFinanceAction(f,{kind:'contract',data:{...f.contracts[0],program:'테스트'}},new Set());assert.deepEqual(f.contracts[0].invoiceApprovals,[no]);
 const sheets=financeSheetRows(f);assert.equal(sheets.length,4);assert.equal(sheets[0].values[1][15],no);assert.equal(sheets[0].values[1][16],'대조 일치');assert.equal(sheets[2].values[1][2],no);
 assert.throws(()=>applyFinanceAction(f,{kind:'taxImport',data:{rows:[{...sample(),net:'3',total:'4'}]}},new Set()),/금액/);
});

test('accounting confirmation saves selected invoices and references together, preserving prior records',()=>{
 const selected=sample();
 const previous={...selected,approvalNo:no2,net:'2000',tax:'200',total:'2200'};
 const f={...emptyFinance(),contracts:[contract('A','6000','600',[]),contract('B','4000','400',[]),contract('C','2000','200',[no2])],taxImports:[previous],allocations:[
  {id:'allocation',code:'ALLOC-1',contractId:'A',broadcastId:'broadcast',month:'2026-11',active:true,net:'3000',tax:'300',broadcastCost:'2800',agencyFee:'200'},
 ]};
 const before=structuredClone(f);
 const action={kind:'taxConfirm',data:{matches:[{invoice:selected,contractIds:['A','B']}]}};
 const next=applyFinanceAction(f,action,new Set(['broadcast']));
 assert.deepEqual(f,before);
 assert.deepEqual(next.allocations,before.allocations);
 assert.deepEqual(next.contracts,[{...before.contracts[0],invoiceApprovals:[no]},{...before.contracts[1],invoiceApprovals:[no]},before.contracts[2]]);
 assert.deepEqual(next.taxImports.map(invoice=>invoice.approvalNo),[no2,no]);
 const sheets=financeSheetRows(next);
 assert.equal(sheets[0].values[1][15],no);
 assert.equal(sheets[0].values[2][16],'대조 일치');
 assert.equal(sheets[2].values.filter(row=>row[2]===no).length,1);
 assert.equal(applyFinanceAction(next,action,new Set(['broadcast'])).taxImports.length,2);
 assert.throws(()=>applyFinanceAction(f,{...action,data:{matches:[{invoice:selected,contractIds:['A']}]}},new Set()),/금액 차이/);
 assert.throws(()=>applyFinanceAction(f,{...action,data:{matches:[{invoice:{...selected,supplierNo:'1234567890'},contractIds:['A','B']}]}},new Set()),/사업자등록번호/);
 assert.deepEqual(f,before);
});

test('accounting confirmation retains already linked approval numbers when completing a split invoice',()=>{
 const first={...sample(),net:'6000',tax:'600',total:'6600'};
 const second={...sample(),approvalNo:no2,net:'4000',tax:'400',total:'4400'};
 const f={...emptyFinance(),contracts:[contract('A')],taxImports:[first]};
 const next=applyFinanceAction(f,{kind:'taxConfirm',data:{matches:[{invoice:second,contractIds:['A']}]}},new Set());
 assert.deepEqual(next.contracts[0].invoiceApprovals,[no,no2]);
 assert.equal(reconcileContract(next,next.contracts[0]).status,'대조 일치');
});

test('overlapping date exports skip confirmed approval numbers and retain new or conflicting rows',async()=>{
 const {pendingTaxInvoices}=await import('../lib/tax-reconcile.ts');
 const saved=sample();
 const duplicate={...saved,approvalNo:'20260915-10260916-72352960',sourceFile:'누적조회.xls',sourceRow:12};
 const newInvoice={...saved,approvalNo:no2,date:'2026-09-20'};
 assert.deepEqual(pendingTaxInvoices([duplicate,newInvoice],[saved]),[newInvoice]);
 const conflict={...duplicate,net:'10001',total:'11001'};
 assert.deepEqual(pendingTaxInvoices([conflict],[saved]),[conflict]);
 assert.throws(()=>mergeTaxInvoices([saved],[conflict]),/다른 내용/);
});
