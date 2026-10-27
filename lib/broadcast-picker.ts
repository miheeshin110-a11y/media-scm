import type {Item} from './scm-model';
import {basicMissing} from './broadcast-progress.ts';
export type BroadcastFilter='all'|'missing'|'ppl'|'broadcast';
export function broadcastPage(items:Item[],query:string,filter:BroadcastFilter,page:number,size=10){
 const tokens=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 const matches=items.filter(x=>{const text=`${x.date} ${x.time} ${x.channel} ${x.item} ${x.owner}`.toLowerCase();return tokens.every(t=>text.includes(t));});
 const counts={all:matches.length,missing:matches.filter(x=>basicMissing(x).length).length,ppl:matches.filter(x=>x.registrationSource==='ppl').length,broadcast:matches.filter(x=>x.registrationSource==='broadcast').length};
 const rows=matches.filter(x=>filter==='all'||(filter==='missing'?basicMissing(x).length>0:x.registrationSource===filter)).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
 const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.max(0,Math.min(page,pages-1));
 return {rows:rows.slice(current*size,(current+1)*size),total:rows.length,pages,page:current,counts,start:rows.length?current*size+1:0,end:Math.min((current+1)*size,rows.length)};
}
