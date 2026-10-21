import type {Contract,Allocation} from './finance-model.ts';
import type {Item} from './scm-model.ts';
export type PplAiring={id?:string;date:string;time:string;kind:string;originalDate?:string};
export function pplAirings(c:Contract,items:Item[]=[],allocations:Allocation[]=[]):PplAiring[]{
 const fromLink=(l:NonNullable<Item['pplLinks']>[number]):PplAiring=>({date:l.date,time:l.time,kind:l.kind,originalDate:l.originalDate,...(l.airingId?{id:l.airingId}:{})});
 const rows:PplAiring[]=[...(c.airings||[]),...allocations.filter(a=>a.active&&a.contractId===c.id&&a.airing).map(a=>a.airing!),...(c.pplOrigin?[fromLink(c.pplOrigin.link)]:[]),...items.filter(i=>i.ppl==='있음').flatMap(i=>(i.pplLinks||[]).filter(l=>l.contractRef===c.id).map(fromLink))];
 const result:PplAiring[]=[];
 for(const row of rows){
  if(!row.date&&!row.time&&!row.kind)continue;
  const key=(a:PplAiring)=>[a.date,a.time,a.kind].join('|');
  if(!result.some(a=>(a.id&&row.id&&a.id===row.id)||key(a)===key(row)))result.push({...row});
 }
 return result.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.time.localeCompare(b.time)||a.kind.localeCompare(b.kind));
}
export function airingLabel(a:PplAiring){return `${a.date||'방송일 미등록'} ${a.time||'시간 미등록'} · ${a.kind||'송출구분 미등록'}`;}
export function airingSummary(c:Contract,items:Item[]=[],allocations:Allocation[]=[]){const rows=pplAirings(c,items,allocations);return rows.length?rows.map(airingLabel).join(' / '):'방송일 미등록';}
export function matchesPpl(c:Contract,items:Item[],query:string){
 const normalize=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[\s./:\-]/g,'');
 const source=normalize([c.code,c.name,c.channel,c.program,c.party,airingSummary(c,items)].join(' '));
 return query.trim().split(/\s+/).every(q=>source.includes(normalize(q)));
}
