import {actualDateTime,type Item} from './scm-model.ts';
import {compositions} from './workflow.ts';

export type LogisticsSku={code:string;name:string};
export type BomLine={sku:string;role:'product'|'gift';quantity:number};
export type LogisticsBom={id:string;compositionCode:string;lines:BomLine[];createdAt:string};
export type InventoryLine={sku:string;available:number;reservedForPlans:number};
export type InventorySnapshot={id:string;warehouse:string;asOf:string;basis:'before-plans'|'unreserved';lines:InventoryLine[];source:string;createdAt:string};
export type Inbound={id:string;sku:string;warehouse:string;date:string;quantity:number;confirmed:boolean;reference:string};
export type Requirement={sku:string;role:'product'|'gift';quantity:number};
export type LogisticsRelease={id:string;broadcastId:string;warehouse:string;revision:number;fingerprint:string;date:string;time:string;channel:string;item:string;urgent:boolean;dueDate:string;cancelled:boolean;requirements:Requirement[];bomIds:string[];createdAt:string;actor:string;note:string;acknowledgedAt?:string;acknowledgedBy?:string;state:'미확인'|'준비 중'|'부족 확인'|'준비 완료'|'취소';owner:string;processingNote:string};
export type LogisticsEvent={id:string;releaseId:string;at:string;actor:string;type:string;note:string};
export type Logistics={skus:LogisticsSku[];boms:LogisticsBom[];snapshots:InventorySnapshot[];inbounds:Inbound[];releases:LogisticsRelease[];events:LogisticsEvent[]};
export class LogisticsError extends Error{}
export const emptyLogistics=():Logistics=>({skus:[],boms:[],snapshots:[],inbounds:[],releases:[],events:[]});
const text=(v:unknown,label:string,max=120)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new LogisticsError(label+'을 확인해 주세요.');return v.trim();};
const qty=(v:unknown,label:string,zero=true)=>{if(!['string','number'].includes(typeof v)||!/^\d+$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)>(zero?1e12:1e6)||Number(v)<(zero?0:1))throw new LogisticsError(label+'은 '+(zero?'0 이상':'1 이상')+'의 정수로 입력하세요.');return Number(v);};
const date=(v:unknown)=>{const s=text(v,'날짜',10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!actualDateTime(s,'00:00'))throw new LogisticsError('날짜를 확인해 주세요.');return s;};
const total=(a:number,b:number)=>{const n=a+b;if(!Number.isSafeInteger(n)||n>1e15)throw new LogisticsError('단품 수량이 계산 한도를 초과했습니다.');return n;};
export function preparationDate(day:string){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-7);return d.toISOString().slice(0,10);}
export function latestBom(l:Logistics,code:string){return l.boms.filter(b=>b.compositionCode===code).at(-1);}
export function latestRelease(l:Logistics,broadcastId:string){return l.releases.filter(r=>r.broadcastId===broadcastId).at(-1);}
export function logisticsFingerprint(item:Item,l:Logistics){
 const c=compositions(item);
 return JSON.stringify({id:item.id,date:item.date,time:item.time,status:item.status,urgent:Boolean(item.urgent),channel:item.channel,item:item.item,compositions:(['single','double'] as const).map(side=>({side,enabled:c[side].enabled,sku:c[side].sku,quantity:c[side].plannedQuantity,bom:latestBom(l,c[side].sku)?.id||''})),gifts:(item.gifts||[]).map(g=>({id:g.id,item:g.item,units:g.units,side:g.side}))});
}
export function logisticsPlan(item:Item,l:Logistics){
 const issues:string[]=[],requirements:Requirement[]=[],bomIds:string[]=[];
 const real=actualDateTime(item.date,item.time);
 if(!item.id||!real)issues.push('저장된 방송의 날짜와 시간을 먼저 확정하세요.');
 const day=real.slice(0,10),cancelled=item.status==='취소';
 if(!cancelled){
  const cs=compositions(item);let enabled=0;
  for(const side of ['single','double'] as const){
   const c=cs[side];if(!c.enabled)continue;enabled++;
   const label=side==='single'?'메인':'서브';
   const bom=latestBom(l,c.sku);
   if(!c.sku||!bom){issues.push(label+' 판매구성의 물류 구성표를 등록하세요.');continue;}
   let n:number;try{n=qty(c.plannedQuantity,label+' 요청 세트수');}catch(e){issues.push((e as Error).message);continue;}
   bomIds.push(bom.id);
   for(const line of bom.lines){
    try{
     const quantity=total(0,n*line.quantity),old=requirements.find(r=>r.sku===line.sku&&r.role===line.role);
     if(old)old.quantity=total(old.quantity,quantity);else requirements.push({...line,quantity});
    }catch(e){issues.push((e as Error).message);}
   }
  }
  if(!enabled)issues.push('사용하는 판매구성이 없습니다.');
 }
 return {issues,requirements,bomIds,date:day,time:real.slice(11),dueDate:day?preparationDate(day):'',cancelled,fingerprint:logisticsFingerprint(item,l)};
}

export function applyLogisticsAction(current:Logistics|undefined,d:Record<string,unknown>,items:Item[],actor:string,now:string,uuid:()=>string):Logistics{
 const l=structuredClone(current||emptyLogistics()),op=d.op;
 if(op==='skuBatch'||op==='bomBatch'||op==='inboundBatch'){
  if(!Array.isArray(d.rows)||!d.rows.length||d.rows.length>1000)throw new LogisticsError('한 번에 1~1,000행을 등록하세요.');
  let next=l;
  if(op==='bomBatch'){
   const groups=new Map<string,BomLine[]>();
   for(const raw of d.rows){const r=raw as Record<string,unknown>;if(!r||typeof r!=='object')throw new LogisticsError('구성표를 확인하세요.');const code=text(r.compositionCode,'판매구성 코드',80);const rows=groups.get(code)||[];rows.push({sku:r.sku as string,role:r.role as BomLine['role'],quantity:r.quantity as number});groups.set(code,rows);}
   for(const [compositionCode,lines] of groups)next=applyLogisticsAction(next,{op:'bom',compositionCode,lines},items,actor,now,uuid);
  }else for(const raw of d.rows){
   const r=raw as Record<string,unknown>;if(!r||typeof r!=='object')throw new LogisticsError('입력 행을 확인하세요.');
   if(op==='skuBatch'){
    const found=next.skus.find(s=>s.code===r.code);if(found&&found.name===r.name)continue;
    next=applyLogisticsAction(next,{...r,op:'sku'},items,actor,now,uuid);
   }else{
    const found=next.inbounds.find(i=>i.warehouse===d.warehouse&&i.sku===r.sku&&i.reference===r.reference);
    next=applyLogisticsAction(next,{...r,id:found?.id,warehouse:d.warehouse,op:'inbound'},items,actor,now,uuid);
   }
  }
  return next;
 }
 const known=(code:unknown)=>{const s=text(code,'물류 상품코드',80);if(!l.skus.some(row=>row.code===s))throw new LogisticsError('먼저 물류 상품코드를 등록하세요: '+s);return s;};
 if(op==='sku'){
  const code=text(d.code,'물류 상품코드',80),name=text(d.name,'품목명');
  if(l.skus.some(s=>s.code===code))throw new LogisticsError('이미 등록된 물류 상품코드입니다.');
  l.skus.push({code,name});
 }else if(op==='bom'){
  const compositionCode=text(d.compositionCode,'판매구성 코드',80);
  if(!Array.isArray(d.lines)||!d.lines.length||d.lines.length>30)throw new LogisticsError('구성표는 1~30개 품목을 입력하세요.');
  const seen=new Set<string>();
  const lines:BomLine[]=d.lines.map(raw=>{const row=raw as Record<string,unknown>;if(!row||typeof row!=='object')throw new LogisticsError('구성표를 확인하세요.');const sku=known(row.sku),role=row.role;if(role!=='product'&&role!=='gift')throw new LogisticsError('본품/사은품 구분을 확인하세요.');const key=sku+':'+role;if(seen.has(key))throw new LogisticsError('구성표에 중복 품목이 있습니다.');seen.add(key);return {sku,role,quantity:qty(row.quantity,'세트당 단품수',false)};});
  l.boms.push({id:uuid(),compositionCode,lines,createdAt:now});
 }else if(op==='inventory'){
  const warehouse=text(d.warehouse,'창고',80),asOf=text(d.asOf,'재고 기준시각',16),basis=d.basis;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(asOf)||!actualDateTime(asOf.slice(0,10),asOf.slice(11)))throw new LogisticsError('재고 기준시각을 한국시간으로 입력하세요.');
  if(basis!=='before-plans'&&basis!=='unreserved')throw new LogisticsError('WMS 가용재고 정의를 확인하세요.');
  if(!Array.isArray(d.lines)||!d.lines.length||d.lines.length>1000)throw new LogisticsError('재고는 1~1,000행을 입력하세요.');
  const seen=new Set<string>();
  const lines=d.lines.map(raw=>{const r=raw as Record<string,unknown>;if(!r||typeof r!=='object')throw new LogisticsError('재고 행을 확인하세요.');const sku=known(r.sku);if(seen.has(sku))throw new LogisticsError('재고 파일에 중복 상품코드가 있습니다.');seen.add(sku);const available=qty(r.available,'가용재고'),reservedForPlans=basis==='unreserved'?qty(r.reservedForPlans,'이번 계획에 대해 이미 차감된 예약수량'):0;total(available,reservedForPlans);return {sku,available,reservedForPlans};});
  // A snapshot is a full replacement for a warehouse, not an additive stock movement.
  const previous=l.snapshots.filter(s=>s.warehouse===warehouse).at(-1);
  if(previous&&asOf<previous.asOf)throw new LogisticsError('현재 재고보다 이전 기준시각입니다. 재고 자료를 확인하세요.');
  if(previous&&asOf===previous.asOf)throw new LogisticsError('같은 창고·기준시각의 재고가 이미 등록됐습니다.');
  l.snapshots.push({id:uuid(),warehouse,asOf,basis,lines,source:text(d.source,'자료명',150),createdAt:now});
 }else if(op==='inbound'){
  const id=typeof d.id==='string'?d.id:'',old=l.inbounds.find(r=>r.id===id);
  if(id&&!old)throw new LogisticsError('입고 내역을 다시 선택하세요.');
  const row:Inbound={id:old?.id||uuid(),sku:known(d.sku),warehouse:text(d.warehouse,'창고',80),date:date(d.date),quantity:qty(d.quantity,'입고예정 단품수'),confirmed:d.confirmed===true,reference:text(d.reference,'입고 참조번호',100)};
  if(l.inbounds.some(r=>r.id!==row.id&&r.warehouse===row.warehouse&&r.reference===row.reference&&r.sku===row.sku))throw new LogisticsError('같은 창고·입고번호·상품 내역이 이미 있습니다. 기존 행을 수정하세요.');
  if(old)l.inbounds[l.inbounds.indexOf(old)]=row;else l.inbounds.push(row);
 }else if(op==='publish'){
  const item=items.find(i=>i.id===d.broadcastId);if(!item)throw new LogisticsError('저장된 방송을 선택하세요.');
  const plan=logisticsPlan(item,l);if(plan.issues.length)throw new LogisticsError(plan.issues.join(' '));
  if(d.fingerprint!==plan.fingerprint)throw new LogisticsError('방송 또는 구성표가 변경됐습니다. 최신 자료에서 다시 확인하세요.');
  if(d.confirmComposition!==true)throw new LogisticsError('본품·사은품 전체 구성과 요청수량을 확인하세요.');
  const warehouse=text(d.warehouse,'준비 창고',80);
  const old=latestRelease(l,item.id);if(old?.fingerprint===plan.fingerprint&&old.warehouse===warehouse)throw new LogisticsError('이미 전달한 계획입니다.');
  const note=text(d.note,'변경·전달 메모',500);
  const release:LogisticsRelease={id:uuid(),broadcastId:item.id,warehouse,revision:(old?.revision||0)+1,fingerprint:plan.fingerprint,date:plan.date,time:plan.time,channel:item.channel,item:item.item,urgent:Boolean(item.urgent),dueDate:plan.dueDate,cancelled:plan.cancelled,requirements:plan.requirements,bomIds:plan.bomIds,createdAt:now,actor,note,state:plan.cancelled?'취소':'미확인',owner:'',processingNote:''};
  l.releases.push(release);l.events.push({id:uuid(),releaseId:release.id,at:now,actor,type:plan.cancelled?'취소 전달':'물류 전달',note});
 }else if(op==='ack'||op==='status'){
  const release=l.releases.find(r=>r.id===d.releaseId),item=items.find(i=>i.id===d.broadcastId);
  if(!release||!item||release.broadcastId!==item.id||latestRelease(l,item.id)?.id!==release.id)throw new LogisticsError('최신 전달 계획을 선택하세요.');
  if(release.fingerprint!==logisticsFingerprint(item,l))throw new LogisticsError('미전달 변경사항이 있습니다. 새 계획을 전달한 뒤 확인하세요.');
  const note=text(d.note,'처리 메모',500),owner=text(d.owner,'SCM 담당자',80);
  if(op==='ack'){
   if(release.acknowledgedAt)throw new LogisticsError('이미 확인한 버전입니다.');
   release.acknowledgedAt=now;release.acknowledgedBy=actor;release.owner=owner;release.processingNote=note;if(!release.cancelled)release.state='준비 중';
  }else{
   if(!release.acknowledgedAt||release.cancelled)throw new LogisticsError('먼저 SCM 확인을 완료하세요.');
   if(!['준비 중','부족 확인','준비 완료'].includes(String(d.state)))throw new LogisticsError('준비 상태를 확인하세요.');
   release.state=d.state as LogisticsRelease['state'];release.owner=owner;release.processingNote=note;
  }
  l.events.push({id:uuid(),releaseId:release.id,at:now,actor,type:op==='ack'?'SCM 확인':release.state,note});
 }else throw new LogisticsError('지원하지 않는 물류 작업입니다.');
 if(l.skus.length>1000||l.boms.length>1000||l.snapshots.length>100||l.inbounds.length>1000||l.releases.length>1000||l.events.length>3000||JSON.stringify(l).length>800000)throw new LogisticsError('물류 저장 한도를 초과했습니다. 자료 분리·보관이 필요합니다.');
 return l;
}

export type ForecastRow={warehouse:string;sku:string;broadcastId:string;revision:number;date:string;dueDate:string;quantity:number;remaining:number|null;shortage:number|null;lateInbound:number;notice:string};
export function logisticsForecast(l:Logistics,warehouse:string):ForecastRow[]{
 const snapshot=l.snapshots.filter(s=>s.warehouse===warehouse).at(-1);if(!snapshot)return [];
 const releases=[...new Map(l.releases.map(r=>[r.broadcastId,r])).values()].filter(r=>r.warehouse===warehouse&&!r.cancelled&&(r.date+'T'+r.time)>=snapshot.asOf).sort((a,b)=>(a.date+a.time+a.broadcastId).localeCompare(b.date+b.time+b.broadcastId));
 const balances=new Map(snapshot.lines.map(r=>[r.sku,r.available+r.reservedForPlans])),used=new Set<string>(),out:ForecastRow[]=[];
 for(const release of releases){
  // Preparation deadlines are seven days before broadcast; overdue plans need stock now.
  const cutoff=release.dueDate<snapshot.asOf.slice(0,10)?snapshot.asOf.slice(0,10):release.dueDate;
  const needs=new Map<string,number>();for(const r of release.requirements)needs.set(r.sku,total(needs.get(r.sku)||0,r.quantity));
  for(const [sku,quantity] of needs){
   const incoming=l.inbounds.filter(i=>i.warehouse===warehouse&&i.sku===sku&&i.confirmed&&i.date>snapshot.asOf.slice(0,10));
   let balance=balances.get(sku);
   for(const i of incoming.filter(i=>i.date<=cutoff&&!used.has(i.id))){if(balance!==undefined)balance=total(balance,i.quantity);used.add(i.id);}
   const lateInbound=incoming.filter(i=>i.date>cutoff&&i.date<=release.date).reduce((n,i)=>total(n,i.quantity),0);
   const remaining=balance===undefined?null:balance-quantity;if(remaining!==null)balances.set(sku,remaining);
   out.push({warehouse,sku,broadcastId:release.broadcastId,revision:release.revision,date:release.date,dueDate:release.dueDate,quantity,remaining,shortage:remaining===null?null:Math.max(0,-remaining),lateInbound,notice:remaining===null?'재고 미등록':release.dueDate<snapshot.asOf.slice(0,10)?'준비기한 경과 · 실제 준비 확인 필요':''});
  }
 }
 return out;
}
