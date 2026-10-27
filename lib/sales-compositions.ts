import {skuOptions} from './sku-options.ts';
import type {Composition} from './scm-model.ts';

export type SalesComposition={code:string;name:string};
export const compositionKey=(name:string)=>name.normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase('ko');
export function salesCompositionChoices(master:{salesCompositions?:SalesComposition[]}){
 return [...skuOptions,...(master.salesCompositions||[])].sort((a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true}));
}
export function compositionLabel(c:Pick<Composition,'sku'|'compositionName'>){
 return c.compositionName||skuOptions.find(x=>x.code===c.sku)?.name||(c.sku?'기존 저장 구성 · 목록 확인 필요':'미입력');
}
