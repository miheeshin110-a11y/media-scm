import type {Contract,Allocation,Finance} from './finance-model.ts';
import type {Item} from './scm-model.ts';
import {partyChoices} from './counterparties.ts';
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
const normalize=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[\s.,/:\-]/g,'');
const terms=(q:string)=>q.normalize('NFKC').trim().split(/[\s,]+/).filter(Boolean);
const scheduleTerm=(q:string)=>/^[\d./:\-년월일시분]+$/.test(q);
export function pplCompanies(c:Contract,items:Item[]=[],finance?:Finance):string[]{
 const parties=partyChoices(finance||{contracts:typeof c.businessNo==='string'?[c]:[]});
 const links=[...(c.pplOrigin?[c.pplOrigin.link]:[]),...items.filter(i=>i.ppl==='있음').flatMap(i=>(i.pplLinks||[]).filter(l=>l.contractRef===c.id))];
 return [...new Set([c.party,...links.map(l=>l.agencyId?.startsWith('channel:')?l.agencyId.slice(8):parties.find(p=>p.id===l.agencyId)?.name||'')].filter(Boolean))];
}
function matchesSchedule(a:PplAiring,q:string){
 const date=q.replace(/년|월/g,'/').replace(/일$/,'');
 const full=/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(date);
 if(full)return a.date===`${full[1]}-${full[2].padStart(2,'0')}-${full[3].padStart(2,'0')}`;
 const short=/^(\d{1,2})[-./](\d{1,2})$/.exec(date);
 if(short)return a.date.slice(5)===`${short[1].padStart(2,'0')}-${short[2].padStart(2,'0')}`;
 const time=/^(\d{1,2})(?::|시)(\d{2})분?$/.exec(q);
 if(time)return a.time===`${time[1].padStart(2,'0')}:${time[2]}`;
 const digits=normalize(q).replace(/[년월일시분]/g,'');
 return [a.date.replace(/-/g,''),a.date.slice(5).replace('-',''),a.time.replace(':',''),a.time.replace(':','').replace(/^0/,'')].filter(Boolean).some(v=>v===digits)||(digits.length===4&&a.date.slice(0,4)===digits);
}
export function matchingPplAirings(c:Contract,items:Item[],query:string,allocations:Allocation[]=[]){
 const filters=terms(query).filter(scheduleTerm);
 return pplAirings(c,items,allocations).filter(a=>filters.every(q=>matchesSchedule(a,q)));
}
export function matchesPpl(c:Contract,items:Item[],query:string,finance?:Finance){
 const filters=terms(query),words=filters.filter(q=>!scheduleTerm(q));
 const linkedPrograms=items.filter(i=>i.ppl==='있음').flatMap(i=>(i.pplLinks||[]).filter(l=>l.contractRef===c.id).map(l=>l.program));
 const source=[c.code,c.name,c.channel,c.program,c.pplOrigin?.link.program,...linkedPrograms,...pplCompanies(c,items,finance)].filter((s):s is string=>Boolean(s)).map(normalize);
 if(!words.every(q=>source.some(s=>s.includes(normalize(q)))))return false;
 return !filters.some(scheduleTerm)||matchingPplAirings(c,items,query,finance?.allocations).length>0;
}
