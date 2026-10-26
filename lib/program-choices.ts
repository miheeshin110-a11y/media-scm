import type {Finance} from './finance-model.ts';
import type {Item} from './scm-model.ts';
import {linksOf} from './workflow.ts';
import {masterProgram} from './ppl-master.ts';

export function programChoices(finance:Finance,items:Item[],channel:string,current=''):string[]{
 if(!channel)return [];
 const key=(s:string)=>s.normalize('NFKC').replace(/\s/g,'').toLowerCase();
 const same=(s:string)=>key(s)===key(channel);
 const names=[...(finance.programs||[]).filter(p=>same(p.channel)).map(p=>p.name),...finance.contracts.filter(c=>same(c.channel)).map(c=>masterProgram(c,items)),...items.flatMap(linksOf).filter(l=>same(l.channel)).map(l=>l.program),current];
 const unique=new Map<string,string>();
 for(const name of names){const text=name.trim();if(text&&!unique.has(key(text)))unique.set(key(text),text);}
 // Preserve the exact stored selection when old data uses different spacing.
 if(current.trim())unique.set(key(current),current);
 return [...unique.values()].sort((a,b)=>a.localeCompare(b,'ko'));
}
