import {splitPplCost,type AgencyTerms} from './ppl-registration.ts';
import type {Allocation} from './finance-model.ts';
// Allocate integer fees cumulatively, so a fully split contract reconciles exactly.
export function broadcastCostParts(contract:{net:string}&AgencyTerms,nets:string[]){
 if(!/^\d+$/.test(contract.net)||nets.some(n=>!/^\d+$/.test(n)))return nets.map(()=>null);
 const split=splitPplCost(contract),base=BigInt(contract.net),fee=BigInt(split?.fee||0);
 let used=BigInt(0),previous=BigInt(0);
 return nets.map(net=>{used+=BigInt(net);const cumulative=base?used*fee/base:BigInt(0),part=cumulative-previous;previous=cumulative;return {fee:String(part),cost:String(BigInt(net)-part)};});
}
export function previewAllocationCosts(contract:{net:string}&AgencyTerms,saved:Allocation[],drafts:{id:string;key:string;net:string;broadcastId:string}[]){
 const ids=new Set(saved.map(a=>a.id)),ordered=[...saved.flatMap(a=>drafts.filter(d=>d.id===a.id)),...drafts.filter(d=>!ids.has(d.id))],parts=broadcastCostParts(contract,ordered.map(a=>a.net));
 return new Map(ordered.map((a,i)=>{const old=saved.find(s=>s.id===a.id),legacyUnchanged=old&&old.broadcastCost===undefined&&old.net===a.net&&old.broadcastId===a.broadcastId;return [a.key,legacyUnchanged?{cost:old.net,fee:'0'}:parts[i]];}));
}
