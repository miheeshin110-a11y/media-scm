import type {Item} from './scm-model';
import type {Finance} from './finance-model';

export function pplConnectionTabs(item:Item,finance:Finance,draft?:{slot?:number;slots?:string[];selected:string},preferredId=''){
 const stored=[...new Set([
  ...finance.allocations.filter(a=>a.active&&a.broadcastId===item.id).map(a=>a.contractId),
  ...(item.pplLinks||[]).map(l=>l.contractRef||'').filter(Boolean),
 ])];
 const slots=draft?.slots?[...draft.slots]:[...stored];
 for(const id of stored)if(!slots.includes(id))slots.push(id);
 while(slots.length<2)slots.push('');
 let active=Math.min(Math.max(draft?.slot||0,0),slots.length-1);
 const selected=preferredId||draft?.selected;
 if(selected){const existing=slots.indexOf(selected);if(existing>=0)active=existing;else slots[active]=selected;}
 return {slots,active};
}
