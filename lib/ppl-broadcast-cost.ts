import {splitPplCost,type AgencyTerms} from './ppl-registration.ts';
import type {Allocation} from './finance-model.ts';
type CostDraft={id:string;net:string;broadcastId:string;applyAgencyCost?:boolean};
export function agencyCostChecked(saved:Allocation[],draft:CostDraft){return draft.applyAgencyCost??(Number(saved.find(a=>a.id===draft.id)?.agencyFee||0)>0);}
export function agencyCostChoice(saved:Allocation[],draft:CostDraft){
 const old=saved.find(a=>a.id===draft.id);
 if(draft.applyAgencyCost!==undefined)return draft.applyAgencyCost;
 if(old&&old.net===draft.net&&old.broadcastId===draft.broadcastId)return undefined;
 return agencyCostChecked(saved,draft);
}
// Allocate integer fees cumulatively, so a fully split contract reconciles exactly.
export function broadcastCostParts(contract:{net:string}&AgencyTerms,nets:string[]){
 if(!/^\d+$/.test(contract.net)||nets.some(n=>!/^\d+$/.test(n)))return nets.map(()=>null);
 const split=splitPplCost(contract),base=BigInt(contract.net),fee=BigInt(split?.fee||0);
 let used=BigInt(0),previous=BigInt(0);
 return nets.map(net=>{used+=BigInt(net);const cumulative=base?used*fee/base:BigInt(0),part=cumulative-previous;previous=cumulative;return {fee:String(part),cost:String(BigInt(net)-part)};});
}
export function previewAllocationCosts(contract:{net:string}&AgencyTerms,saved:Allocation[],drafts:{id:string;key:string;net:string;broadcastId:string;applyAgencyCost?:boolean}[]){
 const ids=new Set(saved.map(a=>a.id)),ordered=[...saved.flatMap(a=>drafts.filter(d=>d.id===a.id)),...drafts.filter(d=>!ids.has(d.id))],parts=broadcastCostParts(contract,ordered.map(a=>a.net));
 return new Map(ordered.map((a,i)=>{const old=saved.find(s=>s.id===a.id),choice=agencyCostChoice(saved,a),unchanged=old&&old.net===a.net&&old.broadcastId===a.broadcastId&&choice===undefined;return [a.key,unchanged?{cost:old.broadcastCost??old.net,fee:old.agencyFee??'0'}:contract.tradeType==='agency'&&choice===false?{cost:a.net,fee:'0'}:parts[i]];}));
}
