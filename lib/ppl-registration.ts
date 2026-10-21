import type {Contract} from './finance-model.ts';
import type {PplAiring} from './ppl-airings.ts';
import {actualDateTime} from './scm-model.ts';

export type AgencyTerms={tradeType?:'direct'|'agency';agencyRate?:string};
export function splitPplCost(c:{net:string}&AgencyTerms){
 if(!/^\d+$/.test(c.net)||!Number.isSafeInteger(Number(c.net)))return null;
 if(c.tradeType==='direct')return {fee:0,media:Number(c.net),total:Number(c.net)};
 if(c.tradeType!=='agency'||!/^\d{1,3}(\.\d{1,2})?$/.test(c.agencyRate||'')||Number(c.agencyRate)>100)return null;
 const [whole,fraction='']=c.agencyRate!.split('.');
 const basis=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));
 const fee=Number(BigInt(c.net)*basis/BigInt(10000));
 return {fee,media:Number(c.net)-fee,total:Number(c.net)};
}
export const airingKey=(a:PplAiring)=>[a.date,a.time,a.kind].join('|');
export const sameAiring=(a:PplAiring,b:PplAiring)=>!!a.id&&!!b.id?a.id===b.id:airingKey(a)===airingKey(b);
export const linkAiring=(a:PplAiring)=>({date:a.date,time:a.time,kind:a.kind,originalDate:a.originalDate||'',airingId:a.id||''});

export function scheduleIssues(airings:PplAiring[],previous:PplAiring[]=[]){
 const errors:string[]=[],seen=new Set<string>(),ids=new Set<string>();
 if(!airings.length)errors.push('PPL 송출일정을 한 건 이상 등록하세요.');
 if(airings.length>20)errors.push('PPL 송출일정은 20건까지 등록할 수 있습니다.');
 airings.forEach((a,i)=>{
  const prefix=`송출 ${i+1}: `;
  if(!a.date||!actualDateTime(a.date,'00:00'))errors.push(prefix+'실제 방송일을 입력하세요.');
  const unchangedLegacy=previous.some(p=>airingKey(p)===airingKey(a)&&actualDateTime(a.date,a.time));
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time)&&!unchangedLegacy)errors.push(prefix+'실제 방송시간을 00:00~23:59로 입력하세요.');
  if(!['본방','재방','스페셜'].includes(a.kind))errors.push(prefix+'송출 구분을 선택하세요.');
  if(['재방','스페셜'].includes(a.kind)&&(!a.originalDate||!actualDateTime(a.originalDate,'00:00')||a.originalDate>a.date))errors.push(prefix+'송출일 이전 또는 같은 날의 원본 본방일을 입력하세요.');
  if(seen.has(airingKey(a)))errors.push(prefix+'같은 날짜·시간·송출 구분이 중복되어 있습니다.');
  seen.add(airingKey(a));
  if(a.id&&(ids.has(a.id)||!/^[a-zA-Z0-9-]{1,100}$/.test(a.id)))errors.push(prefix+'일정 ID가 중복되었거나 올바르지 않습니다.');
  if(a.id)ids.add(a.id);
 });
 return errors;
}
export function registrationIssues(c:Contract,previous:PplAiring[]=[]){
 const errors=scheduleIssues(c.airings||[],previous);
 if(!['direct','agency'].includes(c.tradeType||''))errors.push('거래 방식을 선택하세요.');
 else if(c.tradeType==='agency'&&!splitPplCost({...c,net:c.net||'0'}))errors.push('대행료율을 0~100% 범위, 소수 둘째 자리까지 입력하세요.');
 return errors;
}

// A registered airing is selected by ID. Ignore stale client date/time copies.
export function resolveAiring(c:Contract,a?:PplAiring){
 const rows=c.airings||[];
 if(!rows.some(x=>x.id))return a;
 return a?rows.find(x=>sameAiring(x,a)):undefined;
}
