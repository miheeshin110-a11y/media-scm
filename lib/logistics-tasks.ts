import type {Item} from './scm-model.ts';
import {logisticsOutlook} from './logistics-outlook.ts';
import {latestRelease,logisticsFingerprint,logisticsForecast,type Logistics} from './logistics.ts';

export const logisticsSteps=['방송 확인','준비수량 확인','재고·입고 확인','재고 준비·부족분 조치','준비 완료'];
export type LogisticsTaskKind='broadcast'|'mapping'|'review'|'inventory'|'shortage'|'prepare'|'done';
export function logisticsChanges(item:Item,l:Logistics){
 const release=latestRelease(l,item.id);if(!release||release.fingerprint===logisticsFingerprint(item,l))return [];
 try{
  const before=JSON.parse(release.fingerprint),after=JSON.parse(logisticsFingerprint(item,l)),changes:string[]=[];
  for(const [field,label] of [['date','방송일'],['time','방송시간'],['channel','방송 채널'],['item','상품'],['status','방송 상태']] as const)if(before[field]!==after[field])changes.push(`${label}: ${before[field]||'미정'} → ${after[field]||'미정'}`);
  if(before.urgent!==after.urgent)changes.push('급편성 여부 변경');
  for(const line of after.compositions||[]){
   const old=before.compositions?.find((c:{side:string})=>c.side===line.side),name=line.side==='single'?'메인':'서브';
   if(old?.enabled!==line.enabled)changes.push(name+' 구성 사용 여부 변경');
   if(old?.sku!==line.sku||old?.bom!==line.bom)changes.push(name+' 본품·사은품 구성 변경');
   if(old?.quantity!==line.quantity)changes.push(`${name} 요청수량: ${old?.quantity||'미입력'} → ${line.quantity||'미입력'}세트`);
  }
  if(JSON.stringify(before.gifts)!==JSON.stringify(after.gifts))changes.push('방송 사은품 입력 변경 · 전체 구성 재확인');
  return changes.length?changes:['전달 후 방송 계획이 변경됐습니다.'];
 }catch{return ['전달 후 방송 계획이 변경됐습니다.'];}
}
export function logisticsTask(item:Item,l:Logistics){
 const outlook=logisticsOutlook(item,l),release=latestRelease(l,item.id),changes=logisticsChanges(item,l);
 const snapshot=release?l.snapshots.filter(s=>s.warehouse===release.warehouse).at(-1):undefined;
 const stock=release?logisticsForecast(l,release.warehouse).filter(r=>r.broadcastId===item.id):[];
 const shortage=stock.filter(r=>r.shortage!==null&&r.shortage>0),unknownStock=!snapshot||release?.requirements.some(r=>!snapshot.lines.some(s=>s.sku===r.sku))||stock.some(r=>r.remaining===null)||Boolean(release&&!release.cancelled&&!stock.length);
 const completedThrough=changes.length?0:release?.acknowledgedAt?(release.cancelled||release.state==='준비 완료'?5:3):release?2:0;
 const task=(stage:number,status:string,kind:LogisticsTaskKind,action:string,reason:string,editStep=3)=>({item,outlook,release,snapshot,stock,shortage,changes,completedThrough,stage,status,kind,action,reason,editStep});
 if(outlook.cancelled){
  if(!release)return task(5,'취소','done','취소 내역 보기','방송이 취소됐으며 전달된 준비 요청이 없습니다.');
  if(changes.length)return task(1,'취소 확인 필요','review','취소 내용 확인','준비 중인 물량을 조정할 수 있도록 취소 내용을 전달하세요.');
  if(!release.acknowledgedAt)return task(3,'취소 확인 필요','inventory','취소 접수 확인','창고에 취소 내용을 전달하고 준비 물량 조정 내용을 남겨주세요.');
  return task(5,'취소 확인 완료','done','처리 내역 보기','취소 확인과 준비 물량 조정 내역이 기록됐습니다.');
 }
 if(changes.length)return task(1,'변경 확인 필요','review','변경 내용 확인','이전에 확인한 방송에서 변경됐습니다. 바뀐 내용을 확인하고 준비 요청을 갱신하세요.');
 if(!outlook.date)return task(1,'방송정보 확인 필요','broadcast','방송정보 확인','방송팀 입력에서 방송일과 시간을 확인해주세요.',0);
 if(!outlook.lines.length||outlook.lines.some(r=>!r.sku))return task(2,'판매구성 확인 필요','broadcast','판매구성 확인','방송팀 입력에서 사용할 판매구성을 선택해주세요.',2);
 if(outlook.lines.some(r=>r.requested===null))return task(2,'요청수량 확인 필요','broadcast','요청수량 확인','방송팀의 목표·수량 입력을 확인해주세요. 빈칸을 0으로 계산하지 않습니다.',3);
 if(outlook.lines.some(r=>!r.mapped))return task(2,'상품 구성 확인 필요','mapping','준비할 상품 확인','이 판매구성에 들어가는 본품·사은품과 단품 수량을 한 번 연결해주세요.');
 if(outlook.componentIssues.length)return task(2,'구성수량 확인 필요','mapping','상품·사은품 수량 연결','세트에 포함된 상품·사은품 수량을 물류팀에서 확인하고 구성수량 파일로 연결해주세요.');
 if(!release)return task(1,'새 방송 확인 필요','review','방송 확인·준비 요청','방송팀이 입력한 일정과 준비수량을 확인하고 준비할 창고를 지정해주세요.');
 if(release.state==='준비 완료')return task(5,'준비 완료','done','준비 내역 보기','담당자가 실제 준비 완료를 기록했습니다.');
 if(!snapshot)return task(3,'재고 확인 필요','inventory','재고 자료 확인','이 창고의 최근 재고 자료를 확인해주세요.');
 if(unknownStock)return task(3,'재고 확인 필요','inventory','재고·준비 내역 확인','재고가 미등록이거나 기준시각과 방송일을 대조해야 합니다. 미확인을 재고 충분으로 표시하지 않습니다.');
 if(!release.acknowledgedAt)return task(3,'재고 확인 필요','inventory','재고 확인·접수','필요수량과 재고·입고 내용을 확인하고 SCM 담당자를 기록해주세요.');
 if(shortage.length||release.state==='부족 확인')return task(4,'부족분 조치 중','shortage','부족분 조치 확인',shortage.length?'부족한 품목의 입고·추가 준비를 확인하고 처리 내용을 남겨주세요.':'기록된 부족분 조치 내용을 확인하고 준비 상태를 갱신해주세요.');
 return task(4,'재고 준비 중','prepare','준비 완료 처리','본품·사은품을 실제로 준비한 뒤 완료 처리해주세요. 재고예측만으로 자동 완료되지 않습니다.');
}
