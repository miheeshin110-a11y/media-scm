import type {CostSnapshot} from './cost-history.ts';
export type SaleResult = {
  quantity: string; sellingPrice: string; vatBasis: '미확인'|'포함'|'별도';
  supplyPrice: string; commissionType: '미확인'|'비율'|'금액'; commission: string;
  conversionRate: string; confirmedShipment: string; actualShipment: string;
};
export type BroadcastResult = {
  actualDate: string; actualStart: string; actualEndDate: string; actualEnd: string;
  single: SaleResult; double: SaleResult; orderAmount: string; asOfDate: string; sourceRef: string;
  orderAmountMode?: 'auto';
  pplCost: string; adCost: string; shippingCost: string; goodsCost: string; otherCost: string;
  guestCost: string; administrationCost: string; profit: string; notes: string;
  /** Legacy values are read for compatibility, never added together. */
  status?: '임시'|'입력완료'; manufacturingCost?: string; originalProfit?: string; lookerProfit?: string;
};
export type PplLink = {id:string; pplId:string; program:string; kind:string; date:string; time:string; channel:string; agencyId?:string; originalDate?:string; originalPplId?:string; contractRef?:string;airingId?:string};
export type ReviewState='작성 중'|'검토 요청'|'보완 요청'|'검토 완료';
export type Composition={enabled:boolean;sku:string;compositionName?:string;units:string;unitCost:string;costDate:string;costItemId?:string;costSnapshot?:CostSnapshot;sellingPrice:string;commission:string;vatBasis:'포함'|'별도';plannedQuantity:string;conversionRate:string};
export type Gift={id:string;side:'single'|'double'|'both';item:string;units:string;unitCost:string;costDate?:string;costItemId?:string;costSnapshot?:CostSnapshot};
export type CostPlan={adCost:string;guestCost:string;administrationCost:string;otherCost:string;shippingRate:string;shippingBasis:''|'sets'|'manual';shippingCount:string;quantityRounding:''|'floor'|'round';moneyRounding:''|'floor'|'round';pplProcessingMonth:string};
export type Item = {
  registrationSource?:'ppl'|'broadcast';
  id:string; date:string; time:string; dateConvention?:'actual'; channel:string; item:string; shortItem:string; owner:string;
  status:string; urgent:boolean; ppl:string; program:string; pplKind:string; price:string; target:string;
  rate:string; contractId:string; contractAmount:string; allocation:string; attribution:string;
  sync:'완료'|'대기'; hsTarget?:string; businessProfitTarget?:string; plannedQuantity?:string;
  result?:BroadcastResult; pplLinks?:PplLink[]; version?:number; updatedAt?:string; updatedBy?:string;
  sourceRef?:string; financeVersion?:number; allocationManaged?:boolean;
  workflow?:ReviewState;reviewNote?:string;reviewedBy?:string;reviewedAt?:string;cancelReason?:string;replacesId?:string;calendarMonth?:string;
  compositions?:{single:Composition;double:Composition};costPlan?:CostPlan;gifts?:Gift[];calculationMode?:'auto'|'legacy';
};
export const resultSteps=['주문 실적','예상 출고','사은품','손익·검토'];
export function saleResult():SaleResult {return {quantity:'',sellingPrice:'',vatBasis:'미확인',supplyPrice:'',commissionType:'미확인',commission:'',conversionRate:'',confirmedShipment:'',actualShipment:''};}
export function newResult():BroadcastResult {return {actualDate:'',actualStart:'',actualEndDate:'',actualEnd:'',single:saleResult(),double:saleResult(),orderAmount:'',asOfDate:'',sourceRef:'',pplCost:'',adCost:'',shippingCost:'',goodsCost:'',otherCost:'',guestCost:'',administrationCost:'',profit:'',notes:''};}
export function unifiedResult(value?:BroadcastResult):BroadcastResult {
  if(!value)return newResult();
  const {status:_status,manufacturingCost,originalProfit,lookerProfit,...rest}=value;
  return {...rest,goodsCost:rest.goodsCost||manufacturingCost||'',profit:rest.profit??(originalProfit||lookerProfit||'')};
}
export function numberOrNull(value:unknown):number|null {if(typeof value!=='string'||value.trim()==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
export function actualDateTime(date:string,time:string):string {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return '';
  const [h,m]=time.split(':').map(Number);if(h>47||m>59)return '';
  const day=new Date(date+'T00:00:00Z');if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==date)return '';
  day.setUTCDate(day.getUTCDate()+Math.floor(h/24));return day.toISOString().slice(0,10)+' '+String(h%24).padStart(2,'0')+':'+String(m).padStart(2,'0');
}
export function broadcastResultStart(item:Item){
 const r=item.result;
 return (r?.actualDate&&r.actualStart?actualDateTime(r.actualDate,r.actualStart):'')||actualDateTime(item.date,item.time);
}
export function estimateShipment(line:SaleResult):number|null {const q=numberOrNull(line.quantity),r=numberOrNull(line.conversionRate);return q===null||r===null||q<0||r<0||r>100?null:Math.floor(q*r/100);}
export function resultMetrics(item:Item) {
  const r=unifiedResult(item.result),a=item.compositions?.single.enabled===false?0:numberOrNull(r.single.quantity),b=item.compositions?.double.enabled===false?0:numberOrNull(r.double.quantity);
  const amount=numberOrNull(r.orderAmount),target=numberOrNull(item.hsTarget),profit=numberOrNull(r.profit),profitTarget=numberOrNull(item.businessProfitTarget);
  return {orderTotal:a===null||b===null?null:a+b,estimatedSingle:estimateShipment(r.single),estimatedDouble:estimateShipment(r.double),achievement:amount===null||target===null||target<=0?null:amount/target*100,businessAchievement:profit===null||profitTarget===null||profitTarget<=0?null:profit/profitTarget*100,businessGap:profit===null||profitTarget===null?null:profit-profitTarget};
}
export function validateItem(item:Item):string[] {
  const errors:string[]=[];
  if(!item||typeof item!=='object')return ['입력 내용이 올바르지 않습니다.'];
  for(const key of ['date','time','channel','item','shortItem','owner','status','ppl','program','pplKind','price','target','rate','contractId','contractAmount','allocation','attribution'] as const)if(typeof item[key]!=='string')return ['입력 필드 형식을 확인해 주세요.'];
  if(typeof item.urgent!=='boolean')return ['급편성 여부를 확인해 주세요.'];
  if(item.registrationSource!==undefined&&!['ppl','broadcast'].includes(item.registrationSource))errors.push('등록 경로 형식을 확인해 주세요.');
  if(item.pplLinks&&(!Array.isArray(item.pplLinks)||item.pplLinks.some(link=>!link||['id','pplId','program','kind','date','time','channel'].some(key=>typeof link[key as keyof PplLink]!=='string'))))return ['PPL 연결 형식을 확인해 주세요.'];
  if(!item.id||typeof item.id!=='string'||item.id.length>100)errors.push('방송 ID를 확인해 주세요.');
  if(item.workflow){
    if(!item.item.trim())errors.push('부분 저장에는 표준 아이템을 선택해 주세요.');
    if(item.date&&!actualDateTime(item.date,'00:00'))errors.push('편성일을 확인해 주세요.');
    if(item.time&&!actualDateTime(item.date||'2026-01-01',item.time))errors.push('편성시간은 00:00~47:59 형식입니다.');
  }else{
    if(!actualDateTime(item.date||'',item.time||''))errors.push('편성일과 시간을 확인해 주세요. 시간은 00:00~47:59 형식입니다.');
    for(const key of ['channel','item','owner'] as const)if(typeof item[key]!=='string'||!item[key].trim()||item[key].length>100)errors.push('채널·아이템·담당자를 확인해 주세요.');
  }
  const numeric=(value:unknown,label:string,{signed=false,integer=false,max=1e14}={})=>{if(value===''||value===undefined)return;const n=numberOrNull(value);if(n===null||(!signed&&n<0)||Math.abs(n)>max||(integer&&!Number.isInteger(n)))errors.push(label+' 값을 확인해 주세요.');};
  for(const key of ['price','target','hsTarget','contractAmount','allocation'] as const)numeric(item[key],key);
  numeric(item.businessProfitTarget,'사업계획 이익목표',{signed:true});
  numeric(item.plannedQuantity,'계획 세트수',{integer:true});numeric(item.rate,'계획 전환율',{max:100});
  const r=item.result;if(!r)return errors;
  if(typeof r!=='object'||Object.keys(newResult()).some(key=>key!=='single'&&key!=='double'&&typeof r[key as keyof BroadcastResult]!=='string'))return [...errors,'결과 입력 필드 형식을 확인해 주세요.'];
  if(!r.single||!r.double)return [...errors,'결과 데이터 형식을 확인해 주세요.'];
  for(const [name,line] of [['메인 구성',r.single],['서브 구성',r.double]] as const){
    if(typeof line!=='object'||Object.keys(saleResult()).some(key=>typeof line[key as keyof SaleResult]!=='string'))return [...errors,name+' 입력 필드 형식을 확인해 주세요.'];
    for(const key of ['quantity','confirmedShipment','actualShipment'] as const)numeric(line[key],name+' 수량',{integer:true});
    for(const key of ['sellingPrice','supplyPrice','commission'] as const)numeric(line[key],name+' 금액');
    numeric(line.conversionRate,name+' 전환율',{max:100});
    if(!['미확인','포함','별도'].includes(line.vatBasis)||!['미확인','비율','금액'].includes(line.commissionType))errors.push(name+' 판매 조건을 확인해 주세요.');
    if(line.commissionType==='비율')numeric(line.commission,name+' 수수료율',{max:100});
  }
  for(const key of ['orderAmount','pplCost','adCost','shippingCost','goodsCost','otherCost','guestCost','administrationCost'] as const)numeric(r[key],key);
  numeric(r.profit,'이익금',{signed:true});
  for(const key of ['actualDate','actualEndDate','asOfDate'] as const)if(r[key]&&!actualDateTime(r[key],'00:00'))errors.push('결과 날짜 형식을 확인해 주세요.');
  for(const key of ['actualStart','actualEnd'] as const)if(r[key]&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(r[key]))errors.push('실제 방송 시간은 00:00~23:59로 입력해 주세요.');
  const start=broadcastResultStart(item);
  if(start&&r.actualEndDate&&r.actualEnd&&`${r.actualEndDate} ${r.actualEnd}`<start)errors.push('방송 종료 일시가 시작 일시보다 빠릅니다.');
  return [...new Set(errors)];
}
