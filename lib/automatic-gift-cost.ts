import {costItems,selectCost,type CostMaster} from './cost-history.ts';
import {canonicalCostItem} from './cost-item-catalog.ts';
import type {Item} from './scm-model.ts';

const key=(s:string)=>(canonicalCostItem(s,'gift')||s).normalize('NFKC').replace(/\s/g,'').toLocaleLowerCase('ko');
// New rows/name selections opt in; saved, unchanged gifts never consult newer costs.
export function automaticGiftCost(next:Item,previous:Item|undefined,master:CostMaster):Item{
 if(!next.gifts)return next;
 const gifts=next.gifts.map(g=>{
  const old=previous?.gifts?.find(row=>row.id===g.id);
  const dateChanged=Boolean(previous&&!previous.id&&previous.date!==next.date);
  const wasAutomatic=Boolean(old?.costSnapshot&&key(old.costSnapshot.name)===key(old.item)&&old.costDate===previous?.date&&g.costItemId===old.costItemId&&g.costSnapshot?.id===old.costSnapshot.id);
  if(old&&old.item===g.item&&!(dateChanged&&wasAutomatic))return g;
  if(!(dateChanged&&wasAutomatic)&&(g.costItemId||g.unitCost!==''))return g;
  const matches=costItems(master,'gift').filter(row=>key(row.name)===key(g.item));
  if(matches.length===1)return {...g,...selectCost(master,'gift',matches[0].itemId,next.date)};
  return dateChanged&&wasAutomatic?{...g,unitCost:'',costDate:next.date,costItemId:undefined,costSnapshot:undefined}:g;
 });
 return {...next,gifts};
}
