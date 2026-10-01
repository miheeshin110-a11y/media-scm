import type {Contract,Finance} from './finance-model.ts';
import type {Item,PplLink} from './scm-model.ts';
import {pplAirings} from './ppl-airings.ts';
import {linksOf} from './workflow.ts';

export function masterProgram(c:Contract,items:Item[]=[]){return c.program||c.pplOrigin?.link.program||items.flatMap(linksOf).find(l=>l.contractRef===c.id&&l.program)?.program||'';}
export function masterLink(c:Contract,broadcast:Item,items:Item[]=[]):PplLink{
 const dates=pplAirings(c,items);const airing=dates.length===1?dates[0]:{date:'',time:'',kind:''};
 return {id:'allocation-'+c.id+'-'+broadcast.id,pplId:'',contractRef:c.id,channel:c.channel,program:masterProgram(c),agencyId:'',...airing};
}
// Allocations are the authoritative relationship. Keep entered airing details intact.
export function allocatedPpl(item:Item,f:Finance):Item{
 const contracts=f.contracts.filter(c=>f.allocations.some(a=>a.active&&a.broadcastId===item.id&&a.contractId===c.id));
 const active=new Set(contracts.map(c=>c.id));
 const links=linksOf(item).filter(l=>!l.id.startsWith('allocation-')||active.has(l.contractRef||'')).map(l=>{
  const c=contracts.find(c=>c.id===l.contractRef);
  return c&&l.id.startsWith('allocation-')?{...l,channel:c.channel,program:masterProgram(c)||l.program}:l;
 });
 for(const c of contracts)if(!links.some(l=>l.contractRef===c.id)){
  const placeholder=links.findIndex(l=>!l.contractRef&&!l.program&&!l.channel&&!l.date&&!l.time);
  if(placeholder>=0)links.splice(placeholder,1);
  links.push(masterLink(c,item));
 }
 for(const c of contracts){
  const a=f.allocations.find(a=>a.active&&a.broadcastId===item.id&&a.contractId===c.id);
  const i=links.findIndex(l=>l.contractRef===c.id);
  if(a?.airing&&i>=0)links[i]={...links[i],...a.airing,originalDate:a.airing.originalDate||'',originalPplId:''};
 }
 if(!contracts.length&&links.length===(item.pplLinks?.length||0))return item;
 return {...item,...(contracts.length?{ppl:'있음'}:{}),pplLinks:links,program:links.map(l=>l.program).filter(Boolean).join(' / '),pplKind:links[0]?.kind||''};
}
