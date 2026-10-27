import {actualDateTime,numberOrNull,unifiedResult,type Item} from './scm-model.ts';
import {compositions,costPlan,linksOf,sides,sideName} from './workflow.ts';

export const archiveGroups=['방송 정보','PPL 연결','판매조건','목표·수량','방송비용','방송결과'] as const;
export type ArchiveGroup=typeof archiveGroups[number];
export type MissingField={group:ArchiveGroup;label:string;step:number;result:boolean};
// Presence checks only: zero is entered, optional fields are excluded, approval state is irrelevant.
export function archiveMissing(item:Item,today:string):MissingField[]{
 const fields:MissingField[]=[];
 const add=(group:ArchiveGroup,label:string,value:unknown,step:number,result=false,numeric=false)=>{
  if(numeric?numberOrNull(value)===null:typeof value!=='string'||!value.trim())fields.push({group,label,step,result});
 };
 if(item.status==='취소'){add('방송 정보','취소 사유',item.cancelReason,0);return fields;}
 for(const [key,label] of [['item','표준 아이템'],['owner','담당자'],['channel','홈쇼핑 채널'],['date','방송일'],['time','방송시간']] as const)add('방송 정보',label,item[key],0);
 if(!item.ppl||item.ppl==='미정')fields.push({group:'PPL 연결',label:'PPL 여부',step:1,result:false});
 if(item.ppl==='있음'){
  const links=linksOf(item);
  if(!links.length)fields.push({group:'PPL 연결',label:'연결할 PPL',step:1,result:false});
  links.forEach((l,i)=>{
   for(const [key,label] of [['contractRef','계약'],['channel','채널'],['program','프로그램'],['agencyId','청약사'],['date','송출일'],['time','송출시간'],['kind','송출구분']] as const)add('PPL 연결',`PPL ${i+1} ${label}`,l[key],1);
   if(['재방','스페셜'].includes(l.kind))add('PPL 연결',`PPL ${i+1} 본방일`,l.originalDate,1);
  });
  if(!item.allocationManaged)fields.push({group:'PPL 연결',label:'계약·방송별 배분',step:1,result:false});
  else add('PPL 연결','방송 배분금액',item.allocation,1,false,true);
 }
 const cs=compositions(item),p=costPlan(item);
 if(!sides.some(s=>cs[s].enabled))fields.push({group:'판매조건',label:'사용할 구성',step:2,result:false});
 for(const side of sides)if(cs[side].enabled){
  const c=cs[side],prefix=sideName(side)+' ';
  add('판매조건',prefix+'판매 구성',c.sku,2);
  for(const [key,label] of [['units','구성수량'],['sellingPrice','판매가'],['commission','판매수수료율'],['unitCost','단위원가']] as const)add('판매조건',prefix+label,c[key],2,false,true);
  for(const [key,label] of [['plannedQuantity','계획 주문수량'],['conversionRate','예상 전환율']] as const)add('목표·수량',prefix+label,c[key],3,false,true);
 }
 for(const [key,label] of [['target','주문 목표'],['hsTarget','홈쇼핑 목표'],['businessProfitTarget','이익 목표']] as const)add('목표·수량',label,item[key],3,false,true);
 add('목표·수량','수량 소수점 처리',p.quantityRounding,3);
 for(const [key,label] of [['adCost','방송비·광고비'],['guestCost','게스트 비용'],['administrationCost','판관비'],['otherCost','기타 고정비용'],['shippingRate','배송단가']] as const)add('방송비용',label,p[key],4,false,true);
 add('방송비용','배송비 산정 기준',p.shippingBasis,4);
 add('방송비용','금액 원 단위 처리',p.moneyRounding,4);
 if(item.ppl==='있음')add('방송비용','PPL 비용처리월',p.pplProcessingMonth,4);
 // Results become due on the day after the actual broadcast date, or once result entry starts.
 const actual=actualDateTime(item.date,item.time);
 if(item.result||(actual&&actual.slice(0,10)<today)){
  const r=unifiedResult(item.result);
  for(const [key,label] of [['actualDate','실제 시작일'],['actualStart','실제 시작시간'],['actualEndDate','실제 종료일'],['actualEnd','실제 종료시간']] as const)add('방송결과',label,r[key],0,true);
  for(const side of sides)if(cs[side].enabled){
   add('방송결과',sideName(side)+' 주문수량',r[side].quantity,0,true,true);
   add('방송결과',sideName(side)+' 예상 전환율',r[side].conversionRate,1,true,true);
  }
  if(p.shippingBasis==='manual')add('방송결과','배송 건수',p.shippingCount,1,true,true);
  (item.gifts||[]).forEach((g,i)=>{add('방송결과',`사은품 ${i+1} 아이템`,g.item,2,true);add('방송결과',`사은품 ${i+1} 지급수량`,g.units,2,true,true);add('방송결과',`사은품 ${i+1} 단위원가`,g.unitCost,2,true,true);});
 }
 return fields;
}
export type ArchiveFilter={month:string;owner:string;query:string;group:ArchiveGroup|'';state:'all'|'missing'|'entered'|'cancelled'};
export function archiveRows(items:Item[],filter:ArchiveFilter,today:string){
 const words=filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 return items.map(item=>({item,missing:archiveMissing(item,today)})).filter(({item,missing})=>
  (!filter.month||item.date.startsWith(filter.month))&&(!filter.owner||item.owner===filter.owner)&&
  words.every(w=>`${item.date} ${item.time} ${item.channel} ${item.item} ${item.owner}`.toLowerCase().includes(w))&&
  (!filter.group||missing.some(m=>m.group===filter.group))&&
  (filter.state==='all'||filter.state==='cancelled'&&item.status==='취소'||filter.state==='missing'&&missing.length>0||filter.state==='entered'&&missing.length===0&&item.status!=='취소')
 ).sort((a,b)=>Number(b.missing.length>0)-Number(a.missing.length>0)||(b.item.date+b.item.time).localeCompare(a.item.date+a.item.time)||a.item.id.localeCompare(b.item.id));
}
