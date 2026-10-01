'use client';
import {useState} from 'react';
import type {Item,ReviewState} from '@/lib/scm-model';
import {numberOrNull,actualDateTime} from '@/lib/scm-model';
import {compositions,costPlan,displayChannel,linksOf,missingForReview,sides,sideName,supplyPrice} from '@/lib/workflow';
import type {Finance} from '@/lib/finance-model';
import {partyChoices} from '@/lib/counterparties';

type Props={items:Item[];finance:Finance;selectedId:string;onSelect:(id:string)=>void;busy:boolean;canReview:boolean;readOnly:boolean;onRefresh:()=>void;onEdit:(item:Item,step:number,result?:boolean)=>void;onReview:(item:Item,state:ReviewState)=>Promise<Item|false>};
const stateOf=(x:Item)=>x.workflow||'작성 중';
const text=(v:string|undefined)=>v||'미입력';
const money=(v:string|number|undefined|null)=>{const n=numberOrNull(v==null?'':String(v));return n===null?'미입력':n.toLocaleString('ko-KR',{maximumFractionDigits:2})+'원';};
function Facts({rows}:{rows:[string,string][]}){return <dl className="review-facts">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
export function ReviewWorkspace(props:Props){
 const {items,selectedId,onSelect,busy,onRefresh}=props;
 const [filter,setFilter]=useState<ReviewState|'전체'>('검토 요청'),[query,setQuery]=useState('');
 const selected=items.find(x=>x.id===selectedId);
 const rows=items.filter(x=>(filter==='전체'||stateOf(x)===filter)&&`${x.date} ${x.time} ${x.channel} ${x.item} ${x.owner}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
 return <section className="review-workspace" aria-label="팀장 검토함" aria-busy={busy}>
  <header className="review-toolbar"><div><h2>{selected?'방송 검토':'검토 요청 목록'}</h2><p>전체 월의 요청을 모아 봅니다. 방송을 열어 입력 내용 확인 → 보완 요청 또는 검토 완료.</p></div><button className="secondary-button" disabled={busy} onClick={onRefresh}>최신 요청 불러오기</button></header>
  {selected?<ReviewDetail key={selected.id+':'+selected.version} {...props} item={selected}/>:<>
   <div className="review-controls"><div className="review-tabs" aria-label="검토 상태">{(['검토 요청','보완 요청','검토 완료','전체'] as const).map(s=><button key={s} disabled={busy} aria-pressed={filter===s} className={filter===s?'active':''} onClick={()=>setFilter(s)}>{s==='검토 요청'?'검토 대기':s} <b>{items.filter(x=>s==='전체'||stateOf(x)===s).length}</b></button>)}</div><input className="form-control" aria-label="검토 방송 검색" placeholder="방송일 · 채널 · 아이템 · 담당자 검색" value={query} onChange={e=>setQuery(e.target.value)}/></div>
   <div className="review-scroll"><table className="review-table"><thead><tr><th>편성일·시간</th><th>채널 · 아이템</th><th>입력 담당자</th><th>검토 상태</th><th>누락 항목</th><th>확인</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td>{x.date||'날짜 미정'}<small>{x.time||'시간 미정'}</small></td><td><strong>{displayChannel(x.channel)} · {text(x.item)}</strong>{x.reviewNote&&<small className="review-note-preview" title={x.reviewNote}>메모: {x.reviewNote}</small>}</td><td>{text(x.owner)}</td><td><span className="review-state" data-state={stateOf(x)}>{stateOf(x)}</span></td><td>{missingForReview(x).length?`${missingForReview(x).length}개 확인`:'기본항목 입력됨'}</td><td><button className="secondary-button" disabled={busy} onClick={()=>onSelect(x.id)}>내용 보기</button></td></tr>)}</tbody></table>{!rows.length&&<div className="review-empty"><h3>{filter==='검토 요청'?'검토 대기 중인 방송이 없습니다.':'해당 방송이 없습니다.'}</h3><p>담당자가 방송 입력의 마지막 단계에서 ‘팀장 검토 요청’을 누르면 이곳에 표시됩니다.</p></div>}</div>
  </>}
 </section>;
}
function ReviewDetail({item,finance,busy,canReview,readOnly,onSelect,onEdit,onReview}:Props&{item:Item}){
 const [note,setNote]=useState(item.reviewNote||''),[error,setError]=useState('');
 const cs=compositions(item),p=costPlan(item),missing=missingForReview(item),allocations=finance.allocations.filter(a=>a.active&&a.broadcastId===item.id);
 const writable=canReview&&!readOnly;
 const finish=async(state:ReviewState)=>{if(state==='보완 요청'&&!note.trim()){setError('담당자가 수정할 내용을 보완 메모에 적어 주세요.');return;}setError('');await onReview({...item,reviewNote:note},state);};
 const card=(title:string,step:number,children:React.ReactNode,result=false)=><section className="review-card"><header><h3>{title}</h3><button className="text-button" disabled={busy||note!==(item.reviewNote||'')} onClick={()=>onEdit(item,step,result)}>{readOnly?'입력 화면 보기':'입력 확인·수정'}</button></header>{children}</section>;
 return <><div className="review-detail-heading"><button className="secondary-button" disabled={busy} onClick={()=>{if(note===(item.reviewNote||'')||window.confirm('저장하지 않은 검토 메모를 닫을까요?'))onSelect('')}}>← 목록으로</button><strong>{item.date||'날짜 미정'} {item.time} · {displayChannel(item.channel)} · {text(item.item)}</strong><span className="review-state" data-state={stateOf(item)}>{stateOf(item)}</span></div>
  <div className="review-scroll review-detail-body">
   <div className="review-guidance"><b>팀장이 확인할 내용</b><span>방송 일정·PPL 배분 → 판매조건 → 목표·수량 → 방송비용 순서로 확인하세요. 누락 항목은 아래 ‘입력 확인·수정’에서 보완할 수 있습니다.</span></div>
   {missing.length?<details className="review-missing-details" open><summary>검토 완료 전에 확인할 누락 항목 {missing.length}개</summary><ul>{missing.map(m=><li key={m}>{m}</li>)}</ul></details>:<p className="result-note">기본 필수항목이 입력되었습니다. 금액과 적용 기준이 맞는지 확인한 뒤 검토를 완료하세요.</p>}
   <div className="review-summary-grid">
    {card('1. 방송 정보',0,<Facts rows={[["입력 담당자",text(item.owner)],["실제 방송일시",actualDateTime(item.date,item.time)||'미정'],["방송 상태",text(item.status)],["캘린더 표시월",item.calendarMonth||item.date.slice(0,7)],["취소 사유",item.status==='취소'?text(item.cancelReason):'해당 없음']]}/>)}
    {card('2. PPL 연결·배분',1,<><Facts rows={[["PPL 여부",item.ppl],["방송 배분금액",item.ppl==='없음'?'해당 없음':money(item.allocation)]]}/>{linksOf(item).map((l,i)=><p className="review-summary-line" key={l.id}><b>{i+1}. {text(l.channel)} · {text(l.program)}</b><span>{l.date||'송출일 미입력'} {l.time} · {l.kind||'송출구분 미입력'}{l.originalDate?' · 본방 '+l.originalDate:''}</span><span>청약사: {partyChoices(finance).find(x=>x.id===l.agencyId)?.name||l.agencyId||'미입력'}</span></p>)}{allocations.map(a=><p className="review-summary-line" key={a.id}><b>{finance.contracts.find(c=>c.id===a.contractId)?.name||a.contractId}</b><span>{money(a.net)} · 귀속월 {a.month}</span></p>)}</>)}
    {card('3. 판매조건',2,<>{sides.filter(s=>cs[s].enabled).map(s=><div key={s}><h4>{sideName(s)}</h4><Facts rows={[["SKU · 구성",`${text(cs[s].sku)} · ${text(cs[s].units)}개`],["판매가",money(cs[s].sellingPrice)+` (VAT ${cs[s].vatBasis})`],["수수료율",text(cs[s].commission)+'%'],["공급단가",money(supplyPrice(cs[s]))]]}/></div>)}</>)}
    {card('4. 목표·수량',3,<><Facts rows={[["주문 목표",money(item.target)],["홈쇼핑 목표",money(item.hsTarget)],["사업계획 이익목표",money(item.businessProfitTarget)]]}/>{sides.filter(s=>cs[s].enabled).map(s=><p className="review-summary-line" key={s}><b>{sideName(s)}</b><span>계획 주문 {text(cs[s].plannedQuantity)}세트 · 예상 전환율 {text(cs[s].conversionRate)}%</span></p>)}</>)}
    {card('5. 방송비용',4,<Facts rows={[["홈쇼핑 방송비·광고비",money(p.adCost)],["게스트 비용",money(p.guestCost)],["판관비",money(p.administrationCost)],["기타 고정비용",money(p.otherCost)],["배송단가",money(p.shippingRate)],["PPL 비용처리월",text(p.pplProcessingMonth)]]}/>)}
    {item.result&&card('방송결과 · 입력된 경우',0,<Facts rows={[["주문금액",money(item.result.orderAmount)],["이익금",money(item.result.profit)]]}/>,true)}
   </div>
   {item.reviewedAt&&<p className="result-note">검토 완료: {new Date(item.reviewedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p>}
  </div>
  <footer className="review-decision"><label>팀장 검토·보완 메모{writable?<textarea className="form-control" rows={2} disabled={busy} value={note} onChange={e=>setNote(e.target.value)} placeholder="예: PPL 청약사 선택, 메인 구성 주문목표 확인 후 다시 검토 요청해 주세요."/>:<p className="review-read-note">{item.reviewNote||'등록된 검토 메모가 없습니다.'}</p>}</label><div><p>{error||(!writable?'검토 처리는 팀장 권한으로 로그인해야 가능합니다.':missing.length?`누락 ${missing.length}개를 보완해야 검토 완료할 수 있습니다.`:'내용 확인 후 검토를 완료하세요.')}</p>{writable&&<div className="finance-actions"><button className="secondary-button" disabled={busy} onClick={()=>finish('보완 요청')}>보완 요청</button><button className="primary-button" disabled={busy||missing.length>0} onClick={()=>finish('검토 완료')}>검토 완료</button></div>}{note!==(item.reviewNote||'')&&<small>메모는 보완 요청 또는 검토 완료 시 함께 저장됩니다.</small>}</div></footer>
 </>;
}
