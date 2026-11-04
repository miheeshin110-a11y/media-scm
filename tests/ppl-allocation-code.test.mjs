import test from 'node:test';
import assert from 'node:assert/strict';
import {allocationTraceCode} from '../lib/ppl-allocation-code.ts';
import {applyFinanceAction,emptyFinance,contractTotals} from '../lib/finance-model.ts';
import {financeSheetRows} from '../lib/finance-sheets.ts';

test('one contract retains its full payment amount while each broadcast exports a traceable split',()=>{
 let serial=0;
 const save=(f,kind,data)=>applyFinanceAction(f,{kind,data},new Set(['A','B','C']),'2026-11-04T00:00:00Z',()=>`test-${++serial}`);
 let f=save(emptyFinance(),'contract',{party:'테스트',businessNo:'7578802005',channel:'TV조선',program:'',approvalNo:'',date:'2026-11-04',net:'60000000',taxMode:'auto',notes:''});
 const contract=f.contracts[0];
 f=save(f,'allocations',{contractId:contract.id,rows:[{broadcastId:'A',month:'2026-11',net:'40000000'},{broadcastId:'B',month:'2026-12',net:'20000000'}]});
 const original=structuredClone(f),codes=f.allocations.map(a=>allocationTraceCode(f,a));
 assert.equal(new Set(codes).size,2);
 assert.ok(codes.every(code=>code.startsWith(contract.code+'-')));
 assert.equal(f.contracts[0].net,'60000000');
 assert.equal(contractTotals(f,contract.id).remaining.net,'0');
 const exports=financeSheetRows(f),rows=exports[1].values;
 assert.equal(exports[0].values[1][8],'60000000');
 assert.deepEqual(rows.slice(1,3).map(r=>[r[3],r[6],r[15]]),[[contract.code,'40000000',codes[0]],[contract.code,'20000000',codes[1]]]);
 assert.deepEqual(f,original,'export does not mutate finance');
 f=save(f,'allocations',{contractId:contract.id,rows:[{...f.allocations[1],net:'20000000'},{...f.allocations[0],net:'30000000'}]});
 assert.deepEqual(f.allocations.map(a=>allocationTraceCode(f,a)),codes,'editing and input order preserve codes');
 f=save(f,'voidAllocation',{id:f.allocations[0].id});
 f=save(f,'allocation',{contractId:contract.id,broadcastId:'C',month:'2026-12',net:'40000000'});
 assert.equal(allocationTraceCode(f,f.allocations[0]),codes[0],'released allocation retains its code');
 assert.ok(!codes.includes(allocationTraceCode(f,f.allocations[2])),'released suffix is never reused');
 assert.equal(f.contracts[0].net,'60000000');
});
