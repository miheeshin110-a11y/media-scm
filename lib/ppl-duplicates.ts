import {actualDateTime,type Item,type PplLink} from './scm-model.ts';
import type {Finance} from './finance-model.ts';
const text=(value:string)=>value.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
export function pplSignature(link:PplLink){
 if(!link.channel?.trim()||!link.program?.trim()||!link.date||!link.time)return '';
 const instant=actualDateTime(link.date,link.time)||`${link.date||''} ${link.time||''}`;
 return JSON.stringify([text(link.channel),text(link.program),instant]);
}
export function samePpl(a:PplLink,b:PplLink){return Boolean((a.id&&a.id===b.id)||(a.pplId&&a.pplId===b.pplId)||(pplSignature(a)&&pplSignature(a)===pplSignature(b)));}
export function duplicatePplErrors(item:Item){
 if(item.ppl!=='있음')return [];
 const links=item.pplLinks||[],errors:string[]=[];
 links.forEach((link,i)=>{const previous=links.slice(0,i).findIndex(other=>samePpl(link,other));if(previous>=0)errors.push(`PPL ${i+1}은 PPL ${previous+1}과 중복됩니다 (${link.channel} · ${link.program} · ${link.date||'송출일 미정'} ${link.time}). 기존 연결을 수정하거나 중복 항목을 제외해 주세요.`);});
 return errors;
}
export function existingPplContracts(finance:Finance,broadcast:Item|undefined,link:PplLink){
 const refs=new Set<string>(link.contractRef?[link.contractRef]:[]);
 if(broadcast?.ppl==='있음')for(const old of broadcast.pplLinks||[])if(samePpl(old,link)&&old.contractRef)refs.add(old.contractRef);
 for(const c of finance.contracts)if(c.pplOrigin&&broadcast&&c.pplOrigin.broadcastId===broadcast.id&&samePpl(c.pplOrigin.link,link))refs.add(c.id);
 return finance.contracts.filter(c=>refs.has(c.id));
}
