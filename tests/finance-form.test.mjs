import test from 'node:test';
import assert from 'node:assert/strict';
import {contractFormIssues,allocationFormIssues} from '../lib/finance-form.ts';
import {canSaveFinance} from '../lib/finance-access.ts';

test('registered inputters can register and allocate PPL without gaining accounting permissions',()=>{
 for(const kind of ['contract','program','party','allocation','allocations','voidAllocation'])assert.equal(canSaveFinance(kind,false),true);
 for(const kind of ['taxImport','invoiceRefs','invoice','voidInvoice','unknown'])assert.equal(canSaveFinance(kind,false),false);
 assert.equal(canSaveFinance('taxImport',true),true);
});

test('new PPL explains missing party and program instead of silently disabling save',()=>{
 const draft={party:'',businessNo:'',channel:'JTBC',program:'',net:'10000000',tax:'',taxMode:'auto'};
 const issues=contractFormIssues(draft);
 assert.equal(issues.length,2);
 assert.match(issues[0],/거래처/);
 assert.match(issues[1],/새 프로그램/);
 assert.deepEqual(contractFormIssues({...draft,party:'거래처',businessNo:'1234567890',program:'신규 프로그램'}),[]);
});

test('allocation feedback identifies incomplete rows, duplicate broadcasts and over-allocation',()=>{
 const valid={broadcastId:'broadcast-1',net:'5000000',month:'2026-10'};
 assert.deepEqual(allocationFormIssues([valid,{...valid,broadcastId:'broadcast-2'}],'10000000'),[]);
 assert.match(allocationFormIssues([valid,{broadcastId:'',net:'',month:''}],'10000000').join(' '),/2번 방송:.*귀속월/);
 assert.match(allocationFormIssues([valid,valid],'10000000').join(' '),/중복/);
 assert.match(allocationFormIssues([valid],'4000000').join(' '),/초과/);
 assert.deepEqual(allocationFormIssues([],'10000000'),[]);
 assert.deepEqual(allocationFormIssues([{...valid,net:'0'}],'0'),[]);
 assert.match(allocationFormIssues([{...valid,net:'1.5'}],'10000000').join(' '),/정수/);
});
