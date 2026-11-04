import type {Allocation,Finance} from './finance-model.ts';

// Keep the existing immutable allocation identifier, including released rows.
// A global suffix prevents reuse when rows are removed or moved between contracts.
export function allocationTraceCode(finance:Finance,allocation:Allocation){
 const contract=finance.contracts.find(c=>c.id===allocation.contractId);
 if(!contract)return '';
 return `${contract.code}-${allocation.code.replace(/^ALLOC-/, '')}`;
}
