import type {Finance} from './finance-model.ts';
import type {Item} from './scm-model.ts';
import {linksOf} from './workflow.ts';

// null means entering the workspace; an empty string is an explicit new draft.
export function workspaceContract(finance:Finance,selected:string|null,preferredId=''){
 if(selected==='')return undefined;
 return finance.contracts.find(c=>c.id===selected)||finance.contracts.find(c=>c.id===preferredId)||finance.contracts.at(-1);
}

// A broadcast may have several PPL links and cost months; list it only once.
export function contractBroadcasts(finance:Finance,items:Item[],contractId:string){
 const allocations=finance.allocations.filter(a=>a.active&&a.contractId===contractId);
 const ids=new Set(items.filter(item=>item.ppl==='있음'&&linksOf(item).some(link=>link.contractRef===contractId)).map(item=>item.id));
 allocations.forEach(a=>ids.add(a.broadcastId));
 return [...ids].map(id=>{const rows=allocations.filter(a=>a.broadcastId===id);return {id,item:items.find(item=>item.id===id),net:rows.length?rows.reduce((sum,a)=>sum+Number(a.net),0):null};});
}
