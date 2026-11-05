import {actualDateTime,type Item} from './scm-model.ts';
import {compositions,costPlan,estimated} from './workflow.ts';
import {latestBom,latestRelease,logisticsForecast,preparationDate,type Logistics,type ForecastPlan,type Requirement} from './logistics.ts';

export type OutlookRequirement=Omit<Requirement,'quantity'>&{prepare:number|null;expected:number|null};
const count=(s:string)=>/^\d+$/.test(s)&&Number.isSafeInteger(Number(s))&&Number(s)<=1e12?Number(s):null;
const add=(a:number|null,b:number|null)=>a===null||b===null||!Number.isSafeInteger(a+b)||a+b>1e15?null:a+b;
const multiply=(a:number|null,b:number)=>a===null||!Number.isSafeInteger(a*b)||a*b>1e15?null:a*b;
export function logisticsOutlook(item:Item,l:Logistics){
 const c=compositions(item),rounding=costPlan(item).quantityRounding,issues:string[]=[],requirements:OutlookRequirement[]=[];
 const real=actualDateTime(item.date,item.time),cancelled=item.status==='취소';
 if(!real)issues.push('방송 일정 미확정');
 const lines=(['single','double'] as const).filter(side=>c[side].enabled&&!cancelled).map(side=>{
  const line=c[side],label=side==='single'?'메인':'서브',requested=count(line.plannedQuantity),rawRate=String(line.conversionRate||'').trim();
  const rate=rawRate!==''&&/^\d+(\.\d+)?$/.test(rawRate)&&Number(rawRate)<=100?Number(rawRate):null;
  const expected=requested===0?0:requested!==null&&rate===0?0:requested!==null&&rate!==null?estimated(line.plannedQuantity,rawRate,rounding):null;
  const safeExpected=expected!==null&&Number.isSafeInteger(expected)&&expected<=1e12?expected:null;
  const bom=latestBom(l,line.sku);
  if(requested===null)issues.push(label+' 요청 세트수 미입력');
  if(rate===null&&requested!==0)issues.push(label+' 예상 전환율 미입력');
  if(!rounding&&requested!==0&&rate!==0)issues.push(label+' 수량 소수점 처리 미선택');
  if(!bom)issues.push(label+' 물류 구성표 미등록');
  for(const component of bom?.lines||[]){
   const prepare=multiply(requested,component.quantity),expected=multiply(safeExpected,component.quantity),old=requirements.find(r=>r.sku===component.sku&&r.role===component.role);
   if(old){old.prepare=add(old.prepare,prepare);old.expected=add(old.expected,expected);}else requirements.push({sku:component.sku,role:component.role,prepare,expected});
  }
  return {side,sku:line.sku,requested,rate,expected:safeExpected,mapped:Boolean(bom)};
 });
 if(!lines.length&&!cancelled)issues.push('사용하는 판매구성 없음');
 const requestedSets=lines.reduce<number|null>((n,line)=>add(n,line.requested),0),expectedSets=lines.reduce<number|null>((n,line)=>add(n,line.expected),0);
 return {lines,requirements,requestedSets:!lines.length&&!cancelled?null:requestedSets,expectedSets:!lines.length&&!cancelled?null:expectedSets,issues,date:real.slice(0,10),time:real.slice(11),dueDate:real?preparationDate(real.slice(0,10)):'',cancelled};
}

// A read-only scenario. Never inserts releases, confirms a plan or reserves WMS stock.
export function logisticsScenario(l:Logistics,items:Item[],warehouse:string,mode:'prepare'|'expected',includeUnassigned:boolean){
 const snapshot=l.snapshots.filter(s=>s.warehouse===warehouse).at(-1),plans:ForecastPlan[]=[],warnings:string[]=[];
 let missingComposition=false,unassigned=0;
 for(const item of items){
  const release=latestRelease(l,item.id),outlook=logisticsOutlook(item,l);
  if(outlook.cancelled)continue;
  if(release&&release.warehouse!==warehouse)continue;
  if(!release&&!includeUnassigned)continue;
  if(snapshot&&!outlook.date&&actualDateTime(item.date,'00:00')&&item.date<snapshot.asOf.slice(0,10))continue;
  if(!outlook.date){warnings.push(item.item+' · 방송 일정 미확정');missingComposition=true;continue;}
  if(snapshot&&outlook.date+'T'+outlook.time<snapshot.asOf)continue;
  if(!release)unassigned++;
  if(outlook.lines.some(line=>!line.mapped)||!outlook.lines.length){warnings.push(outlook.date+' '+item.item+' · 물류 구성표 미등록');missingComposition=true;}
  plans.push({broadcastId:item.id,warehouse,revision:release?.revision||0,date:outlook.date,time:outlook.time,dueDate:mode==='expected'?outlook.date:outlook.dueDate,cancelled:false,requirements:outlook.requirements.map(r=>({sku:r.sku,role:r.role,quantity:mode==='prepare'?r.prepare:r.expected}))});
 }
 const rows=logisticsForecast(l,warehouse,plans);
 return {rows:missingComposition?rows.map(row=>({...row,remaining:null,shortage:null,notice:[row.notice,'미매핑·일정미확정 방송 포함 · 예측 미확정'].filter(Boolean).join(' · ')})):rows,warnings,unassigned};
}
