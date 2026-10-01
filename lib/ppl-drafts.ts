import type {PplLink} from './scm-model.ts';

export const unfinishedPpl=(links:PplLink[])=>links.find(link=>!link.channel.trim()||!link.program.trim());

// Adding another row must never multiply empty drafts or discard partially entered data.
export function nextPplDraft(links:PplLink[],id:()=>string){
 const unfinished=unfinishedPpl(links);
 if(unfinished)return {links,activeId:unfinished.id,reused:true};
 if(links.length>=20)return null;
 const next:PplLink={id:id(),pplId:id(),channel:'',program:'',date:'',time:'',kind:''};
 return {links:[...links,next],activeId:next.id,reused:false};
}
