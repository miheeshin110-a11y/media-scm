'use client';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogClose} from '@/components/ui/dialog';
import {X} from 'lucide-react';
import {compositionLabel} from '@/lib/sales-compositions';
import {partyChoices} from '@/lib/counterparties';
import {compositions,costPlan,sides,sideName,estimated as estimate,displayChannel} from '@/lib/workflow';
import {actualDateTime,numberOrNull,unifiedResult,resultMetrics,type Item,type SaleResult} from '@/lib/scm-model';
import {withFinance,type Finance} from '@/lib/finance-model';
const money=(v:string|undefined)=>format(v,'원');
function format(v:string|undefined,unit=''){const n=numberOrNull(v);return n===null?'미입력':n.toLocaleString('ko-KR')+unit;}
const text=(v:string|undefined)=>v||'미입력';
function Facts({rows}:{rows:[string,string][]}){return <dl className="detail-facts">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
function Section({title,children,wide=false}:{title:string;children:React.ReactNode;wide?:boolean}){return <section className={'detail-section'+(wide?' detail-wide':'')}><h3>{title}</h3>{children}</section>}
type Props={item?:Item;day:string|null;dayItems:Item[];finance:Finance;dark:boolean;largeText:boolean;onClose:()=>void;onSelect:(item:Item)=>void;onCreate:(date:string)=>void;onEdit:(target:'input'|'results')=>void};
export function CalendarDetails({item,day,dayItems,finance,dark,largeText,onClose,onSelect,onCreate,onEdit}:Props){
 const record=item?withFinance(item,finance):undefined;
 const cs=record?compositions(record):null,cp=record?costPlan(record):null;
 const r=unifiedResult(record?.result),metrics=record?resultMetrics({...record,result:r}):null;
 const allocations=record?finance.allocations.filter(a=>a.active&&a.broadcastId===record.id):[];
 const sales:[string,(s:SaleResult)=>string][]=[['주문수량',s=>format(s.quantity,'세트')],['판매가',s=>money(s.sellingPrice)],['판매가 부가세',s=>s.vatBasis],['공급가',s=>money(s.supplyPrice)],['수수료',s=>s.commissionType==='미확인'?'기준 미확인':format(s.commission,s.commissionType==='비율'?'%':'원')],['전환율',s=>format(s.conversionRate,'%')],['예상출고',s=>numberOrNull(s.quantity)===null||numberOrNull(s.conversionRate)===null?'미입력':format((record?.calculationMode==='auto'?estimate(s.quantity,s.conversionRate,cp!.quantityRounding):Math.floor(Number(s.quantity)*Number(s.conversionRate)/100))?.toString(),'세트')],['확정출고',s=>format(s.confirmedShipment,'세트')],['실출고',s=>format(s.actualShipment,'세트')]];
 return <Dialog open={Boolean(record||day)} onOpenChange={open=>{if(!open)onClose()}}><DialogContent showCloseButton={false} className="app-shell broadcast-detail" data-theme={dark?'dark':'light'} data-text-size={largeText?'large':'normal'}>
 <header className="detail-header"><div><span className="detail-eyebrow">{record?'저장된 방송 상세':'날짜별 방송 목록'}</span><DialogTitle className="detail-title">{record?`${record.item} · ${displayChannel(record.channel)}`:`${day} 방송`}</DialogTitle><DialogDescription className="detail-description">{record?`${record.date} ${record.time} 편성 · ${record.status}${record.urgent?' · 급편성':''}`:`현재 필터에 해당하는 방송 ${dayItems.length}건`}</DialogDescription></div><DialogClose className="icon-button" aria-label="상세보기 닫기"><X size={22}/></DialogClose></header>
 <div className="detail-scroll">
 {record?<><div className="detail-highlights">{[['주문 실적',money(r.orderAmount)],['이익금',money(r.profit)],['방송 배분 PPL 비용',money(record.allocationManaged?record.allocation:r.pplCost||record.allocation)],['PPL 연결',record.pplLinks?.length?record.pplLinks.length+'건':record.ppl]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
 <div className="detail-sections"><Section title="편성 정보"><Facts rows={[
 ['편성 기준일·시간',record.date+' '+record.time],['편성시간 환산',actualDateTime(record.date,record.time)||'확인 필요'],['담당자',text(record.owner)],['방송 상태',text(record.status)],['급편성',record.urgent?'예':'아니오'],['검토 상태',record.workflow||'작성 중'],['검토 메모',text(record.reviewNote)],['캘린더 표시월',record.calendarMonth||record.date.slice(0,7)],['취소 사유',text(record.cancelReason)],['원래 방송ID',text(record.replacesId)]
 ]}/></Section>
 <Section title="PPL 연결">{record.pplLinks?.length?<ul className="detail-links">{record.pplLinks.map(link=><li key={link.id}><strong>{link.program} · {link.kind}</strong><span>{link.date} {link.time} · {link.channel}</span><small>청약사 {partyChoices(finance).find(p=>p.id===link.agencyId)?.name||link.agencyId?.replace('channel:','')||'미입력'}{link.originalDate?' · 원본 본방일 '+link.originalDate:''}</small><small>연결ID {link.pplId}</small></li>)}</ul>:<Facts rows={record.ppl==='있음'?[['PPL 여부',record.ppl],['프로그램',text(record.program)],['송출 구분',text(record.pplKind)]]:[['PPL 여부',text(record.ppl)]]}/>}</Section>
 <Section title="방송 전 목표·수량"><Facts rows={[
 ['주문 목표',money(record.target)],['홈쇼핑 목표',money(record.hsTarget)],['사업계획 이익목표',money(record.businessProfitTarget)],...sides.filter(side=>cs![side].enabled).flatMap(side=>[[sideName(side)+' 판매 구성',compositionLabel(cs![side])],[sideName(side)+' 계획 주문',format(cs![side].plannedQuantity,'세트')],[sideName(side)+' 전환율',format(cs![side].conversionRate,'%')],[sideName(side)+' 계획 예상출고',format(estimate(cs![side].plannedQuantity,cs![side].conversionRate,cp!.quantityRounding)?.toString(),'세트')]] as [string,string][]),...(record.price?[['등록 단가',money(record.price)] as [string,string]]:[])
 ]}/></Section>
 <Section title="계약·비용 배분">{allocations.length?<ul className="detail-links">{allocations.map(a=>{const c=finance.contracts.find(x=>x.id===a.contractId);return <li key={a.id}><strong>{c?.name||a.contractId}</strong><span>{c?.code} · {c?.party}</span><Facts rows={[["배분 공급가액",money(a.net)],["배분 부가세",money(a.tax)],["비용 귀속월",a.month]]}/></li>})}</ul>:record.contractId||record.allocation?<Facts rows={[["등록 계약번호",text(record.contractId)],["등록 계약 공급가액",money(record.contractAmount)],["등록 배분금액",money(record.allocation)],["비용 귀속월",text(record.attribution)]]}/>:<p className="detail-empty">연결된 계약·배분이 없습니다.</p>}</Section>
 <Section title="방송결과" wide>{record.result?<><Facts rows={[
 ['기록된 실제 시작',r.actualDate&&r.actualStart?r.actualDate+' '+r.actualStart:'미입력'],['기록된 실제 종료',r.actualEndDate&&r.actualEnd?r.actualEndDate+' '+r.actualEnd:'미입력'],['실적 기준일',text(r.asOfDate)],['주문 실적',money(r.orderAmount)],['이익금',money(r.profit)],['홈쇼핑 목표 달성률',metrics?.achievement==null?'산출 전':metrics.achievement.toFixed(1)+'%']
 ]}/><div className="detail-table-wrap"><table className="detail-table"><caption>메인·서브 판매 및 출고 실적</caption><thead><tr><th scope="col">항목</th><th scope="col">메인 구성</th><th scope="col">서브 구성</th></tr></thead><tbody>{sales.map(([label,value])=><tr key={label}><th scope="row">{label}</th><td>{cs!.single.enabled?value(r.single):'미사용'}</td><td>{cs!.double.enabled?value(r.double):'미사용'}</td></tr>)}</tbody></table></div><h4>방송 비용</h4><Facts rows={[
 ['PPL 비용',money(r.pplCost)],['광고비',money(r.adCost)],['배송비',money(r.shippingCost)],['상품원가',money(r.goodsCost)],['출연료',money(r.guestCost)],['관리비',money(r.administrationCost)],['기타 비용',money(r.otherCost)]
 ]}/>{r.sourceRef&&<p className="detail-note"><b>결과 근거</b> {r.sourceRef}</p>}{r.notes&&<p className="detail-note"><b>메모</b> {r.notes}</p>}</>:<p className="detail-empty">방송결과가 아직 입력되지 않았습니다.</p>}</Section>
 </div><footer className="detail-provenance"><span>방송ID {record.id}</span>{record.sourceRef&&<span>자료 출처 {record.sourceRef}</span>}{record.updatedAt&&<span>최근 저장 {record.updatedAt}</span>}</footer></>:<div className="day-detail-list">{dayItems.length?dayItems.map(x=><button key={x.id} onClick={()=>onSelect(x)}><span>{x.time} · {x.channel}</span><strong>{x.item}</strong><small>{x.status}{x.urgent?' · 급편성':''}</small></button>):<p className="detail-empty">현재 필터에 해당하는 방송이 없습니다.</p>}</div>}
 </div>
 <div className="detail-actions"><DialogClose className="secondary-button">닫기</DialogClose>{record?<><button className="secondary-button" onClick={()=>onEdit('input')}>방송정보 수정</button><button className="primary-button" onClick={()=>onEdit('results')}>방송결과 입력·수정</button></>:day&&<button className="primary-button" onClick={()=>onCreate(day)}>이 날짜에 방송 등록</button>}</div>
 </DialogContent></Dialog>;
}
