import {costItems,selectCost,type CostMaster} from './cost-history.ts';
import {canonicalCostItem} from './cost-item-catalog.ts';
import {compositions} from './workflow.ts';
import type {Item} from './scm-model.ts';

const key=(s:string)=>(canonicalCostItem(s,'product')||s).normalize('NFKC').replace(/\s/g,'').toLocaleLowerCase('ko');
// Only new drafts/first saves opt in. Opening or editing saved broadcasts never reapplies costs.
export function automaticProductCost(next:Item,previous:Item|undefined,master:CostMaster):Item{
 if(previous?.id)return next;
 if(previous&&previous.item===next.item&&previous.date===next.date)return next;
 const matches=costItems(master,'product').filter(c=>key(c.name)===key(next.item));
 const selected=matches.length===1?matches[0]:undefined;
 const lines=compositions(next),old=previous?compositions(previous):undefined;
 const result={...lines};
 for(const side of ['single','double'] as const){
  const line=lines[side],prior=old?.[side];
  const wasAutomatic=Boolean(prior?.costSnapshot&&key(prior.costSnapshot.name)===key(previous!.item)&&prior.costDate===previous!.date&&line.costItemId===prior.costItemId&&line.costSnapshot?.id===prior.costSnapshot.id);
  // Explicitly selected histories and manually entered amounts remain intentional overrides.
  if(!wasAutomatic&&(line.costItemId||line.unitCost!==''))continue;
  if(selected)result[side]={...line,...selectCost(master,'product',selected.itemId,next.date)};
  else if(wasAutomatic)result[side]={...line,unitCost:'',costItemId:undefined,costSnapshot:undefined,costDate:next.date};
 }
 return {...next,compositions:result};
}
