import {canonicalCostItem,costItemCatalog} from './cost-item-catalog.ts';
import {CostHistoryError,type CostHistory} from './cost-history.ts';
import type {Item,Gift} from './scm-model.ts';

export type GiftItem={id:string;name:string};
export type GiftMaster={giftItems?:GiftItem[];costHistory?:CostHistory[]};
export const giftNameKey=(name:string)=>name.normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase('ko');
export const isCatalogOnlyAction=(kind:string)=>['costHistory','costHistoryImport','giftItem','logistics'].includes(kind);
export function giftItemChoices(master:GiftMaster,items:Item[]=[]){
 const names=[...costItemCatalog.map(c=>c.name),...(master.giftItems||[]).map(g=>g.name),...(master.costHistory||[]).filter(h=>h.kind==='gift').map(h=>h.name),...items.map(i=>i.item),...items.flatMap(i=>(i.gifts||[]).map(g=>g.item))];
 const unique=new Map<string,string>();
 for(const name of names){if(!name.trim())continue;const canonical=canonicalCostItem(name,'gift')||name.trim().replace(/\s+/g,' ');if(!unique.has(giftNameKey(canonical)))unique.set(giftNameKey(canonical),canonical);}
 return [...unique.values()].sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}));
}
export function withGiftItem(gift:Gift,name:string):Gift{
 return name===gift.item?{...gift}:{...gift,item:name,unitCost:'',costDate:'',costItemId:undefined,costSnapshot:undefined};
}
export function registerGiftItem(master:GiftMaster,data:Record<string,unknown>,uuid:()=>string){
 if(typeof data.name!=='string'||!data.name.trim()||data.name.trim().length>120)throw new CostHistoryError('사은품명은 1~120자로 입력해 주세요.');
 const name=canonicalCostItem(data.name,'gift')||data.name.trim().replace(/\s+/g,' ');
 if(giftItemChoices(master).some(n=>giftNameKey(n)===giftNameKey(name)))return [...(master.giftItems||[])];
 if((master.giftItems?.length||0)>=2000)throw new CostHistoryError('사은품은 2,000개까지 등록할 수 있습니다.');
 return [...(master.giftItems||[]),{id:uuid(),name}];
}
