'use client';
/* oxlint-disable react/react-compiler */
/* oxlint-disable next/no-html-link-for-pages -- Platform sign-in requires a full document navigation. */

import { CalendarDays, Check, ChevronRight, Clock3, ClipboardCheck, Link2, Menu, Moon, Plus, Sheet, Sun, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {TestResetPanel} from './test-reset-panel';
import {BackgroundRefresh} from '@/lib/background-refresh';
import {unchangedRecord} from '@/lib/unchanged-record';

import {basicMissing} from '@/lib/broadcast-progress';
import {automaticProductCost} from '@/lib/automatic-product-cost';
import {automaticGiftCost} from '@/lib/automatic-gift-cost';
import {BroadcastPicker} from './broadcast-picker';
import {BroadcastProgress} from './broadcast-progress';
import {broadcastClockIssues,usesActualClock} from '@/lib/broadcast-clock';
import {resultSteps,validateItem,unifiedResult,type Item,type ReviewState} from '@/lib/scm-model';
import type {PplDraft} from './ppl-editor';
import {FinanceWorkspace,AllocationEditor} from './finance-entry';
import {TaxAccountingReview,type TaxReviewDraft} from './tax-match-preview';
import {emptyFinance,withFinance,type Finance,type FinanceAction} from '@/lib/finance-model';
import {ResultsEntry} from './results-entry';
import {CostHistoryWorkspace} from './cost-history-workspace';
import {LogisticsWorkspace} from './logistics-workspace';
import {editingItem,validateWorkflow,displayChannel} from '@/lib/workflow';
import {BroadcastEditor,PplEditor,SalesEditor,PlanEditor,CostEditor,ReviewEditor} from './broadcast-editor';
import {CalendarDetails} from './calendar-details';
import {BroadcastArchive} from './broadcast-archive';
import {archiveMissing} from '@/lib/broadcast-archive';
import {SheetSyncStatus} from './sheet-sync-status';
import {syncCounts,type SyncSnapshot} from '@/lib/sync-status';
import {canSaveFinance} from '@/lib/finance-access';
import {isCatalogOnlyAction} from '@/lib/gift-items';
type RecordsResponse={syncSnapshot:SyncSnapshot;readOnly?:boolean;canReview?:boolean;error?:string;items:Item[];sheetsConfigured:boolean;finance:Finance};
type SaveResponse={syncSnapshot:SyncSnapshot;error?:string;record:Item;sync:string};
type SyncResponse={syncSnapshot:SyncSnapshot;error?:string;accepted?:boolean};

const blank = (date=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})): Item => ({ registrationSource:'broadcast', id:'', date, time:'', channel:'', item:'', shortItem:'', owner:'', status:'', urgent:false, ppl:'미정', program:'', pplKind:'', price:'', target:'', rate:'', contractId:'', contractAmount:'', allocation:'', attribution:'', sync:'대기',workflow:'작성 중',calculationMode:'auto',costPlan:{adCost:'',guestCost:'',administrationCost:'0',otherCost:'',shippingRate:'',shippingBasis:'sets',shippingCount:'',quantityRounding:'',moneyRounding:'',pplProcessingMonth:''} });
const steps = ['방송 정보','PPL 연결','판매조건','목표·수량','방송비용','입력 현황'];
const weekdays = ['일','월','화','수','목','금','토'];
function calendarDays(month:string){const first=new Date(month+'-01T00:00:00Z'),offset=first.getUTCDay(),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();return Array.from({length:Math.ceil((offset+last)/7)*7},(_,i)=>{const day=new Date(first);day.setUTCDate(i-offset+1);const date=day.toISOString().slice(0,10);return {day:day.getUTCDate(),date,muted:!date.startsWith(month)}});}
const control = 'form-control';


export default function Home(){
  const [syncSnapshot,setSyncSnapshot]=useState<SyncSnapshot|null>(null);
  const [syncBusy,setSyncBusy]=useState(false);
  const syncRequest=useRef(false);
  const mutationEpoch=useRef(0);
  const writeBusy=useRef(false),backgroundRefresh=useRef(new BackgroundRefresh());
  const [items,setItems]=useState<Item[]>([]); const [selected,setSelected]=useState(new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}));
  const [view,setView]=useState<'input'|'calendar'|'results'|'finance'|'accounting'|'review'|'costHistory'|'logistics'>('input'); const [nav,setNav]=useState(false); const [step,setStep]=useState(0);
  const [needsBasics,setNeedsBasics]=useState(false);
  const [taxReviewDraft,setTaxReviewDraft]=useState<TaxReviewDraft|null>(null);
  const [reviewId,setReviewId]=useState('');const [reviewReturn,setReviewReturn]=useState(false);
  const [form,setForm]=useState<Item>(blank()); const [channel,setChannel]=useState('전체 채널'); const [toast,setToast]=useState('');
  const [largeText,setLargeText]=useState(false); const [dark,setDark]=useState(false); const [itemFilter,setItemFilter]=useState('전체 아이템');
  const [readOnly,setReadOnly]=useState(false);const [canReview,setCanReview]=useState(false);
  const [month,setMonth]=useState('2026-09');const [serverReady,setServerReady]=useState(false);const [saving,setSaving]=useState(false);const [sheetsReady,setSheetsReady]=useState(false);const [loadError,setLoadError]=useState('');
  const [editorKey,setEditorKey]=useState(0);const [pplNextLabel,setPplNextLabel]=useState('저장 후 PPL 연결 2');const pplCommit=useRef<(()=>Promise<boolean>)|null>(null);const [financeStartNew,setFinanceStartNew]=useState(false);const [financeReturn,setFinanceReturn]=useState(false);const [pplReturnDraft,setPplReturnDraft]=useState<PplDraft>();const [pplNewId,setPplNewId]=useState('');
  const [detailId,setDetailId]=useState<string|null>(null),[detailDay,setDetailDay]=useState<string|null>(null);
  const [finance,setFinance]=useState<Finance>(emptyFinance());const [financeContractId,setFinanceContractId]=useState('');const financeRequest=useRef<{body:string;id:string}|null>(null);
  const pendingRequest=useRef<{body:string;id:string}|null>(null);const draftId=useRef('');
  useEffect(()=>{let active=true;let legacy:Item[]=[];try{const appearance=JSON.parse(localStorage.getItem('scm-appearance')||'{}');setLargeText(Boolean(appearance.largeText));setDark(Boolean(appearance.dark));const cached=JSON.parse(localStorage.getItem('scm-records')||'[]');if(Array.isArray(cached))legacy=cached.filter(x=>x&&typeof x.id==='string'&&typeof x.date==='string');}catch{}
    fetch('/api/records').then(async response=>{const data=await response.json() as RecordsResponse;if(!response.ok)throw new Error(data.error||'방송 목록을 불러오지 못했습니다.');return data;}).then(data=>{if(!active)return;const received:Item[]=data.items;const ids=new Set(received.map(x=>x.id));const retained=(data.readOnly?[]:legacy).filter(x=>!ids.has(x.id)).map(x=>({...x,version:0,sync:'대기' as const,sourceRef:'이전 브라우저 임시자료 · 서버 저장 전'}));setSyncSnapshot(data.syncSnapshot);setReadOnly(Boolean(data.readOnly));setCanReview(Boolean(data.canReview));if(data.readOnly)setView('calendar');setFinance(data.finance);backgroundRefresh.current.loaded(Date.now());setItems([...received,...retained]);setSheetsReady(data.sheetsConfigured);setServerReady(true);const last=received.filter(x=>x.date).at(-1);if(last)setMonth(last.date.slice(0,7));}).catch(error=>{if(active)setLoadError(error.message);});return ()=>{active=false};
  },[]);
  const pendingSheets=syncCounts(syncSnapshot).pending;
  useEffect(()=>{
    if(!serverReady||!sheetsReady||readOnly||saving||!pendingSheets)return;
    let active=true;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try{
        if(!syncRequest.current){
          const epoch=mutationEpoch.current;
          const response=await fetch('/api/sync?automatic=1',{method:'POST',signal:controller.signal});
          if(response.ok){const data=await response.json() as SyncResponse;if(active&&epoch===mutationEpoch.current)setSyncSnapshot(data.syncSnapshot);}
        }
      }catch{/* A later poll resumes the durable queue; never replace the user's draft. */}
      finally{if(active)timer=setTimeout(poll,5000);}
    };
    timer=setTimeout(poll,5000);
    return ()=>{active=false;clearTimeout(timer);controller.abort();};
  },[serverReady,sheetsReady,readOnly,saving,pendingSheets]);
  useEffect(()=>{if(saving||!toast||!(/저장했습니다|불러왔습니다/.test(toast)))return;const timer=setTimeout(()=>setToast(''),5500);return ()=>clearTimeout(timer)},[toast,saving]);
  const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
  const detailItem=items.find(x=>x.id===detailId);
  const showDetails=(item:Item)=>{setSelected(item.date);setDetailDay(null);setDetailId(item.id)};
  const days=useMemo(()=>calendarDays(month),[month]);
  const channels=[...new Set(['SK','홈앤','현대','SSG','CJ','K','NS',...items.map(x=>x.channel)])];
  const itemNames=[...new Set(['파라다이스','아세로라','프리바이오틱스',...items.map(x=>x.item)])];
  const currentSteps=view==='results'?resultSteps:steps;
  const appearance=(large:boolean,night:boolean)=>{setLargeText(large);setDark(night);try{localStorage.setItem('scm-appearance',JSON.stringify({largeText:large,dark:night}));}catch{/* Settings still apply for this visit. */}};
  const visible=useMemo(()=>items.filter(x=>(x.calendarMonth||x.date.slice(0,7))===month&&(channel==='전체 채널'||x.channel===channel)&&(itemFilter==='전체 아이템'||x.item===itemFilter)),[items,channel,itemFilter,month]);
  const recordRows=items.filter(x=>(!needsBasics||basicMissing(x).length>0)&&(!x.date||x.date.startsWith(month))&&(channel==='전체 채널'||x.channel===channel));
  const changeForm=(next:Item)=>setForm({...automaticGiftCost(automaticProductCost(next,form,finance),form,finance),...(form.workflow==='검토 완료'?{workflow:'작성 중' as const,reviewedAt:undefined,reviewedBy:undefined}:{})});
  const put=<K extends keyof Item>(key:K,value:Item[K])=>changeForm({...form,[key]:value});
  const open=(date:string,item?:Item)=>{if(saving)return;setReviewReturn(false);setPplNewId('');setPplReturnDraft(undefined);setFinanceReturn(false);setEditorKey(k=>k+1);setSelected(date);setForm(item?editingItem(item):blank(date));draftId.current='';pendingRequest.current=null;setStep(0);if(!item)setView('input');else if(view!=='results')setView('input');setStep(0);setNav(false)};
  const save=async(reviewState?:ReviewState,candidate:Item=form)=>{if(readOnly){setToast('공개 데모입니다. 입력 내용을 확인할 수 있지만 실제 자료에는 저장되지 않습니다.');return false;}if(writeBusy.current||!serverReady)return false;const next={...withFinance(candidate,finance),...(candidate.result?{result:unifiedResult(candidate.result)}:{}),id:candidate.id||(draftId.current||=crypto.randomUUID()),sync:'대기' as const,workflow:reviewState||'작성 중'};const previous=items.find(x=>x.id===next.id);if(usesActualClock(previous))next.dateConvention='actual';const errors=[...broadcastClockIssues(next,previous),...validateItem(next),...validateWorkflow(next)];if(errors.length){setToast(errors.join(' '));return false;}if(unchangedRecord(next,previous)){setToast('변경된 내용이 없습니다. 저장된 자료로 계속 진행합니다.');return previous!;}const body=JSON.stringify({record:next,baseVersion:candidate.version||0});if(!pendingRequest.current||pendingRequest.current.body!==body)pendingRequest.current={body,id:crypto.randomUUID()};mutationEpoch.current++;writeBusy.current=true;setSaving(true);setToast('저장 중입니다.');try{const response=await fetch('/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...JSON.parse(body),requestId:pendingRequest.current.id})});const data=await response.json() as SaveResponse;if(!response.ok)throw new Error(data.error||'저장에 실패했습니다.');const saved:Item=data.record;backgroundRefresh.current.loaded(Date.now());setSyncSnapshot(data.syncSnapshot);setItems(previous=>previous.some(x=>x.id===saved.id)?previous.map(x=>x.id===saved.id?saved:x):[...previous,saved]);setForm(saved);if(saved.date)setMonth(saved.date.slice(0,7));pendingRequest.current=null;setToast(data.sync==='sent'?'서버와 테스트 구글시트에 저장했습니다.':data.sync==='not_configured'?'서버에 저장했습니다. 구글시트는 계정 연결 후 전송됩니다.':data.sync==='failed'?'서버 저장 완료 · 구글시트 반영 실패. 상단에서 다시 전송할 수 있습니다.':'저장했습니다. 구글시트는 자동 반영 중이며 계속 입력하셔도 됩니다.');return saved;}catch(error){setToast(error instanceof Error?error.message:'저장에 실패했습니다. 입력 내용은 유지됩니다.');return false;}finally{mutationEpoch.current++;writeBusy.current=false;setSaving(false)}};
  const refreshSync=async(retry=false,logistics=false)=>{
    if(readOnly||syncRequest.current)return;
    syncRequest.current=true;setSyncBusy(true);const epoch=mutationEpoch.current;
    try{
      const response=await fetch('/api/sync'+(logistics?'?scope=logistics':''),{method:retry?'POST':'GET'}),data=await response.json() as SyncResponse;
      if(!response.ok)throw new Error(data.error||'시트 상태를 확인하지 못했습니다.');
      if(epoch===mutationEpoch.current)setSyncSnapshot(data.syncSnapshot);
      if(retry)setToast('시트 자동 전송을 시작했습니다. 기다리지 않고 계속 입력하셔도 됩니다.');
    }catch(error){setToast(error instanceof Error?error.message:'시트 상태를 확인하지 못했습니다.');}
    finally{syncRequest.current=false;setSyncBusy(false);}
  };
  const retrySync=()=>refreshSync(true);

  const reloadFinance=useCallback(async(quiet=false)=>{
    const gate=backgroundRefresh.current;if(!gate.start(quiet,writeBusy.current,Date.now()))return;
    const epoch=mutationEpoch.current,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{const response=await fetch('/api/records',{signal:controller.signal});const data=await response.json() as RecordsResponse;
      if(!response.ok)throw new Error(data.error||'최신 자료를 불러오지 못했습니다.');
      if(!gate.accept(epoch,mutationEpoch.current,writeBusy.current))return;
      setFinance(data.finance);setSyncSnapshot(data.syncSnapshot);setItems(data.items);gate.loaded(Date.now());
      if(!quiet)setToast('최신 계약·배분 자료를 불러왔습니다.');
    }catch(e){if(!quiet)setToast(e instanceof Error?e.message:'불러오지 못했습니다.');}
    finally{clearTimeout(timeout);gate.finish();}
  },[]);
  const quietReloadFinance=useCallback(()=>{void reloadFinance(true)},[reloadFinance]);
  const saveFinance=async(action:FinanceAction)=>{if(readOnly||!canSaveFinance(action.kind,canReview)){setToast('원가 이력 등록·세금계산서 대조·변경은 팀장 권한이 필요합니다.');return false;}if(writeBusy.current||!serverReady)return false;const body=JSON.stringify({action,baseVersion:finance.version});if(financeRequest.current?.body!==body)financeRequest.current={body,id:crypto.randomUUID()};mutationEpoch.current++;writeBusy.current=true;setSaving(true);try{const response=await fetch('/api/finance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...JSON.parse(body),requestId:financeRequest.current.id})});const data=await response.json() as {syncSnapshot:SyncSnapshot;finance:Finance;updatedRecords:Item[];error?:string};if(!response.ok)throw new Error(data.error||'저장하지 못했습니다.');setFinance(data.finance);setSyncSnapshot(data.syncSnapshot);backgroundRefresh.current.loaded(Date.now());if(isCatalogOnlyAction(action.kind)){financeRequest.current=null;setToast(action.kind==='logistics'?(action.data.op==='status'&&action.data.state==='준비 완료'?'준비 완료로 기록했습니다. 다음 물류 업무를 확인하세요.':action.data.op==='ack'?'SCM 확인을 기록했습니다. 재고 준비를 이어가세요.':action.data.op==='publish'?'준비 요청을 전달했습니다. 다음은 재고·입고 확인입니다.':'물류 자료를 저장했습니다. 기존 방송 원가와 이익은 유지됩니다.'):action.kind==='giftItem'?'사은품을 등록했습니다. 방송 내용은 부분 저장으로 저장해 주세요.':'원가 이력을 등록했습니다. 기존 방송의 원가와 이익은 유지됩니다.');return data.finance;}if(action.kind==='contract'){const savedContract=data.finance.contracts.find(c=>action.data.id?c.id===action.data.id:!finance.contracts.some(old=>old.id===c.id));if(savedContract)setFinanceContractId(savedContract.id);}setItems(old=>old.map(x=>withFinance(data.updatedRecords.find(r=>r.id===x.id)||x,data.finance)));setForm(old=>{const r=data.updatedRecords.find(x=>x.id===old.id);const next=withFinance(old,data.finance);return r&&(old.version||0)===(r.version||0)-1?{...next,version:r.version,updatedAt:r.updatedAt,updatedBy:r.updatedBy,workflow:r.workflow,reviewedAt:r.reviewedAt,reviewedBy:r.reviewedBy}:next});financeRequest.current=null;setToast(action.kind==='salesComposition'?'판매 구성을 등록했습니다. 방송 내용은 부분 저장으로 저장해 주세요.':action.kind==='taxConfirm'?'계산서를 확정했습니다. 구글시트에 자동 반영됩니다.':action.kind==='invoiceRefs'?'계산서 승인번호를 저장했습니다.':action.kind==='taxImport'?'홈택스 계산서를 저장하고 승인번호로 대조했습니다.':'저장했습니다. 연결된 방송의 PPL 비용도 반영했습니다.');return data.finance;}catch(e){setToast(e instanceof Error?e.message:'저장하지 못했습니다.');return false;}finally{mutationEpoch.current++;writeBusy.current=false;setSaving(false)}};
  return <div className="app-shell" data-view={view} data-text-size={largeText?'large':'normal'} data-theme={dark?'dark':'light'}>
    <aside className={`side-nav ${nav?'is-open':''}`}>
      <div className="brand"><span className="brand-mark"><Sheet size={24}/></span><div><b>미디어 SCM</b><small>방송·PPL·물류 통합관리</small></div><button aria-label="메뉴 닫기" className="mobile-close" onClick={()=>setNav(false)}><X size={20}/></button></div>
      <nav className="nav-list team-nav" aria-label="팀별 업무 메뉴">
        <section className="nav-team" aria-labelledby="broadcast-team-nav">
          <h2 className="nav-label" id="broadcast-team-nav">방송팀</h2>
          <Nav icon={<Plus/>} label="새 방송 등록" onClick={()=>open(selected)}/>
          <Nav active={view==='input'} icon={<Sheet/>} label="방송 입력" onClick={()=>{setView('input');setNav(false)}}/>
          <Nav active={view==='results'} icon={<ClipboardCheck/>} label="방송결과" onClick={()=>{setView('results');setStep(0);setNav(false)}}/>
          <Nav active={view==='calendar'} icon={<CalendarDays/>} label="편성 캘린더" onClick={()=>{setView('calendar');setNav(false)}}/>
          <Nav active={view==='review'} icon={<ClipboardCheck/>} label="방송 보관함" badge={String(items.filter(x=>archiveMissing(x,today).length>0).length)} onClick={()=>{if(saving)return;setReviewId('');setView('review');setNav(false);void reloadFinance(true)}}/>
        </section>
        <section className="nav-team" aria-labelledby="ppl-team-nav">
          <h2 className="nav-label" id="ppl-team-nav">PPL팀</h2>
          <Nav active={view==='finance'} icon={<Link2/>} label="PPL 등록·배분" onClick={()=>{setFinanceStartNew(false);setFinanceReturn(false);setView('finance');setNav(false);void reloadFinance(true)}}/>
        </section>
        {!readOnly&&<section className="nav-team" aria-labelledby="accounting-team-nav">
          <h2 className="nav-label" id="accounting-team-nav">회계팀</h2>
          <Nav active={view==='accounting'} icon={<ClipboardCheck/>} label="PPL 계산서 검토" onClick={()=>{setView('accounting');setNav(false);void reloadFinance(true)}}/>
        </section>}
        <section className="nav-team" aria-labelledby="logistics-team-nav">
          <h2 className="nav-label" id="logistics-team-nav">물류팀</h2>
          <Nav active={view==='logistics'} icon={<Sheet/>} label="물류 SCM" onClick={()=>{setView('logistics');setNav(false);void reloadFinance(true)}}/>
        </section>
        <section className="nav-team" aria-labelledby="shared-nav">
          <h2 className="nav-label" id="shared-nav">공통 기준정보</h2>
          <Nav active={view==='costHistory'} icon={<Sheet/>} label="상품·사은품 원가 이력" onClick={()=>{setView('costHistory');setNav(false);void reloadFinance(true)}}/>
        </section>
      </nav>
      <div className="sidebar-bottom"><div className="sync-row"><span><i/>구글시트</span><em><Clock3 size={14}/>{sheetsReady?'전송 가능':'연결 대기'}</em></div><div className="profile"><span><Sheet size={20}/></span><div><b>실무 테스트</b><small>서버 저장 · 변경 이력</small></div></div></div>
    </aside>
    {nav&&<button aria-label="메뉴 배경 닫기" onClick={()=>setNav(false)} className="nav-scrim"/>}
    <main className="workspace-main">
      <header className="topbar"><button aria-label="메뉴 열기" className="mobile-menu" onClick={()=>setNav(true)}><Menu size={24}/></button><h1>{view==='logistics'?'물류 SCM':view==='costHistory'?'상품·사은품 원가 이력':view==='review'?'방송 보관함':view==='finance'?'PPL 등록·배분':view==='accounting'?'PPL 계산서 검토':view==='results'?'방송결과':view==='input'?'방송 입력':'편성 캘린더'}</h1><div className="top-actions"><span className="demo-label">{readOnly?'공개 데모':'실무 테스트'}</span><button className="reading-button" aria-label="큰 글씨" aria-pressed={largeText} onClick={()=>appearance(!largeText,dark)}><strong>가</strong><span>큰 글씨</span></button><button aria-label={dark?'밝은 화면으로 변경':'어두운 화면으로 변경'} aria-pressed={dark} className="icon-button" onClick={()=>appearance(largeText,!dark)}>{dark?<Sun size={22}/>:<Moon size={22}/>}</button></div></header>
      <div className="page-content"><div className="connection-strip"><span>{readOnly?'공개 데모 · 화면과 입력 흐름을 확인할 수 있습니다. 변경 내용은 저장되지 않습니다.':loadError||(!serverReady?'방송 자료를 불러오는 중입니다.':sheetsReady?'서버 저장 · 테스트 구글시트 연결됨':'서버 저장 가능 · 구글시트 계정 연결 대기')}</span>{readOnly&&<a href="/login" target="_top">실무자 로그인</a>}{!readOnly&&<a href="https://docs.google.com/spreadsheets/d/1CgPQJuFoZ0fb0xb_CzySTs2UR_VcYvznfntP46mUJJk/edit#gid=1996160006" target="_blank" rel="noreferrer">방송 종합시트</a>}</div>
        {!readOnly&&<SheetSyncStatus snapshot={syncSnapshot} configured={sheetsReady} busy={syncBusy||!serverReady} onRetry={retrySync} onLogistics={()=>refreshSync(true,true)} onRefresh={()=>refreshSync()}/>}
        {canReview&&!readOnly&&view==='costHistory'&&<TestResetPanel/>}
        {view==='accounting'?(!readOnly&&<TaxAccountingReview finance={finance} items={items} draft={taxReviewDraft} save={saveFinance} canConfirm={canReview} busy={saving||!serverReady} onClearDraft={()=>setTaxReviewDraft(null)}/>):view==='logistics'?<LogisticsWorkspace onEditBroadcast={(item,target)=>{open(item.date,item);setView('input');setStep(target)}} finance={finance} items={items} save={saveFinance} busy={saving||!serverReady} readOnly={readOnly} refresh={quietReloadFinance}/>:view==='costHistory'?<CostHistoryWorkspace finance={finance} save={saveFinance} busy={saving||!serverReady} canManage={canReview&&!readOnly} reload={()=>void reloadFinance()}/>:view==='review'?<BroadcastArchive syncSnapshot={syncSnapshot} items={items} selectedId={reviewId} onSelect={setReviewId} busy={saving||!serverReady} readOnly={readOnly} onRefresh={()=>reloadFinance(true)} onEdit={(item,target,result)=>{open(item.date,item);setReviewId(item.id);setView(result?'results':'input');setStep(target);setReviewReturn(true)}}/>:view==='finance'?<FinanceWorkspace onTaxHandoff={setTaxReviewDraft} createBroadcast={draft=>save(undefined,{...blank(draft.date),...draft,shortItem:draft.item,registrationSource:'ppl'})} startNew={financeStartNew} onReturn={financeReturn?(id)=>{setPplNewId(id||'');setView('input');setStep(1)}:undefined} finance={finance} items={items} save={saveFinance} busy={saving||!serverReady} canWrite={!readOnly} canReconcile={canReview&&!readOnly} preferredContractId={financeContractId||form.pplLinks?.find(x=>x.contractRef)?.contractRef||''} reload={()=>reloadFinance()}/>:view!=='calendar'?<>
          {reviewReturn&&<div className="review-return-bar"><span>보관함에서 선택한 방송을 입력하고 있습니다.</span><button className="text-button" disabled={saving} onClick={async()=>{if(!readOnly){const saved=await save();if(!saved)return;setReviewId(saved.id)}setView('review');setReviewReturn(false)}}>저장하고 보관함으로 돌아가기</button></div>}<div className="broadcast-toolbar"><label className="month-label">조회월<input type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value)}}/></label>
          <BroadcastPicker items={recordRows} current={form} disabled={saving||!serverReady} onSelect={record=>open(record.date||selected,record)} onNew={()=>open(selected)}/>
          <details className="broadcast-filters"><summary>필터{channel!=='전체 채널'||needsBasics?' · 적용 중':''}</summary><div className="filter-popover"><label><input type="checkbox" checked={needsBasics} disabled={saving} onChange={e=>setNeedsBasics(e.target.checked)}/>기본정보 보완 필요한 방송만</label><label>홈쇼핑 채널<select className="form-control" value={channel} disabled={saving} onChange={e=>setChannel(e.target.value)}><option>전체 채널</option>{channels.map(x=><option key={x}>{x}</option>)}</select></label><button className="text-button" onClick={()=>{setChannel('전체 채널');setNeedsBasics(false)}}>필터 초기화</button></div></details>
          <button disabled={saving} onClick={()=>open(selected)} className="primary-button"><Plus size={18}/>새 방송</button></div>
          <div className="input-layout">
            <section className="form-panel" aria-label={view==='results'?'방송결과 입력':'방송 단계별 입력'} aria-busy={saving}><fieldset className="editor-content" disabled={saving||!serverReady}>
              <div className="editor-heading entry-title"><h2>{form.id?`${form.channel} · ${form.item}`:'새 방송 등록'}</h2><span>{step+1} / {currentSteps.length} 단계</span></div>
              <div className="stepper" aria-label="입력 단계">{currentSteps.map((s,i)=><button key={s} onClick={()=>setStep(i)} aria-current={i===step?'step':undefined} className={i===step?'active':i<step?'done':''}><span>{i<step?<Check size={15}/>:i+1}</span><em>{s}</em></button>)}</div>
              <div className="drawer-body" key={view+'-'+step}>{view==='results'?(form.id?<ResultsEntry save={saveFinance} finance={finance} item={form} step={step} onChange={value=>put('result',value)} onItemChange={changeForm} items={items} onConditions={()=>{setView('input');setStep(2)}}/>:<div className="result-empty"><h3>결과를 입력할 방송을 선택해 주세요.</h3><p>방송 기본정보를 부분 저장한 뒤 결과를 입력할 수 있습니다.</p><button className="primary-button" onClick={()=>{setView('input');setStep(0)}}>편성 등록하기</button></div>):<>
                {form.id&&<BroadcastProgress item={form} onBasics={()=>setStep(0)}/>}
                {step===0&&<BroadcastEditor form={form} onChange={changeForm} items={items} finance={finance}/>}
                {step===1&&<PplEditor onNextLabel={setPplNextLabel} onContinue={()=>setStep(2)} key={editorKey} preferredId={pplNewId} draft={pplReturnDraft} onCommit={fn=>{pplCommit.current=fn}} onSave={next=>save(undefined,next)} onOpenRegistry={(startNew,draft)=>{setPplReturnDraft(draft);setPplNewId('');setFinanceStartNew(startNew);setFinanceReturn(true);setView('finance')}} form={form} onChange={changeForm} items={items} finance={finance} save={saveFinance} canManage={!readOnly}/>}
                {step===2&&<SalesEditor form={form} onChange={changeForm} finance={finance} save={saveFinance}/>}
                {step===3&&<PlanEditor form={form} onChange={changeForm}/>}
                {step===4&&<><CostEditor form={form} onChange={changeForm}/><details className="allocation-details"><summary>PPL 계약·방송별 배분</summary>{form.id?<AllocationEditor key={form.id+':'+finance.version} finance={finance} items={items} save={saveFinance} busy={saving||readOnly} broadcastId={form.id}/>:<p>부분 저장 후 계약을 연결할 수 있습니다.</p>}<button className="secondary-button" onClick={()=>{setView('finance');void reloadFinance(true)}}>PPL 등록·배분 열기</button></details></>}
                {step===5&&<><ReviewEditor form={form}/><div className="finance-actions"><button className="primary-button" onClick={async()=>{if(!readOnly){const saved=await save();if(!saved)return;setReviewId(saved.id)}else setReviewId(form.id);setView('review');setReviewReturn(false)}}>저장하고 방송 보관함에서 보기</button></div></>}
              </>}</div>
              <div className="drawer-foot"><span className="save-location">{form.id?'보관함에 저장됨':'작성 중'} · {form.version?'저장 v'+form.version:'저장 전'}</span><div><button onClick={()=>save()} disabled={saving||(view==='results'&&!form.id)} className="secondary-button">{saving?'저장 중':'부분 저장'}</button>{step>0&&<button onClick={()=>setStep(step-1)} className="secondary-button">이전</button>}{step<currentSteps.length-1?<button onClick={async()=>{if(view==='input'&&step===1&&form.ppl==='있음'){if(await pplCommit.current?.())setStep(2)}else setStep(step+1)}} className="primary-button">{view==='input'&&step===1?pplNextLabel:'다음'}<ChevronRight size={18}/></button>:view==='results'?<button onClick={()=>save()} disabled={saving||!form.id} className="primary-button">결과 저장</button>:null}</div></div>
            </fieldset></section>
          </div>
        </>:<>
          <section className="overview-strip" aria-label="편성 요약">
            <Stat label="등록 방송" value={String(visible.length)} note="현재 필터 기준"/><Stat label="PPL 연결" value={String(visible.filter(x=>x.ppl==='있음').length)} note="방송 기준"/><Stat label="확인 필요" value={String(visible.filter(x=>x.ppl==='미정'||x.status==='확인중').length)} note="편성·PPL 확인"/><Stat label="시트 반영 대기" value={String(visible.filter(x=>syncSnapshot?.records[x.id]?.state!=='sent'||syncSnapshot?.records[x.id]?.version!==(x.version||0)).length)} note="저장·전송 여부 확인"/>
          </section>
          {visible.some(x=>!x.date.startsWith(month))&&<section className="sale-card"><h3>이번 표시월에 포함된 다른 날짜의 방송</h3><div className="day-detail-list">{visible.filter(x=>!x.date.startsWith(month)).map(x=><button key={x.id} onClick={()=>showDetails(x)}><span>{x.date||'날짜 미정'} {x.time} · {displayChannel(x.channel)}</span><strong>{x.item}</strong></button>)}</div></section>}
          <section className="calendar-card">
            <div className="calendar-toolbar"><div className="month-control"><label className="month-label">조회월<input type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value)}}/></label></div><div className="calendar-filters"><select aria-label="채널 필터" value={channel} onChange={e=>setChannel(e.target.value)}><option>전체 채널</option>{channels.map(x=><option key={x}>{x}</option>)}</select><select aria-label="아이템 필터" value={itemFilter} onChange={e=>setItemFilter(e.target.value)}><option>전체 아이템</option>{itemNames.map(x=><option key={x}>{x}</option>)}</select><button onClick={()=>open(selected)} className="primary-button"><Plus size={20}/>방송 등록</button></div></div>
            <div className="weekday-row">{weekdays.map((d,i)=><div key={d} className={i===0?'sun':i===6?'sat':''}>{d}</div>)}</div>
            <div className="calendar-grid">{days.map(cell=>{const ev=visible.filter(x=>x.date===cell.date).sort((a,b)=>a.time.localeCompare(b.time)||a.channel.localeCompare(b.channel));return <div key={cell.date} className={`calendar-cell ${selected===cell.date?'is-selected':''} ${cell.muted?'is-muted':''}`}><div className="calendar-day-heading"><button disabled={cell.muted} onClick={()=>{setSelected(cell.date);setDetailId(null);setDetailDay(cell.date)}} aria-label={`${cell.date} 방송 ${ev.length}건 보기`} className={`date-button ${cell.date===today?'is-today':''}`}>{cell.day}</button>{!cell.muted&&ev.length>0&&<span>{ev.length}건</span>}</div><div className="event-stack">{ev.slice(0,3).map(x=><button key={x.id} onClick={()=>showDetails(x)} title={`${x.date} ${x.time} · ${x.channel} · ${x.item} · ${x.status}`} aria-label={`${x.date} ${x.time} ${x.channel} ${x.item} ${x.status} 상세보기`} className={`event-pill ${x.urgent?'is-urgent':x.status==='취소'?'is-cancelled':x.status==='편성확정'?'is-confirmed':'is-plan'}`}><span className="event-time">{x.time}</span><em>{x.item||x.shortItem}</em><b className="event-channel">{x.urgent?'급 · ':''}{x.channel}</b></button>)}</div>{ev.length>3&&<button className="calendar-more" onClick={()=>{setDetailId(null);setDetailDay(cell.date);setSelected(cell.date)}}>외 {ev.length-3}건 보기</button>}{!cell.muted&&!ev.length&&<button onClick={()=>open(cell.date)} className="empty-add" aria-label={`${cell.date} 일정 추가`}>+</button>}</div>})}</div>
          </section>
          <div className="calendar-foot"><div><Legend color="#1890ff" text="편성 확정"/><Legend color="#8c8c8c" text="계획·확인 중"/><Legend color="#ee8c23" text="급편성"/></div><p>방송을 클릭하면 저장된 내용을 볼 수 있습니다. 날짜를 누르면 당일 방송 전체가 표시됩니다.</p></div>
        </>}
      </div>
    </main>
    <CalendarDetails item={detailItem} day={detailDay} dayItems={visible.filter(x=>x.date===detailDay).sort((a,b)=>a.time.localeCompare(b.time)||a.channel.localeCompare(b.channel))} finance={finance} dark={dark} largeText={largeText} onClose={()=>{setDetailId(null);setDetailDay(null)}} onSelect={showDetails} onCreate={date=>{setDetailDay(null);open(date)}} onEdit={target=>{if(!detailItem)return;open(detailItem.date,detailItem);setView(target);setDetailId(null);setDetailDay(null)}}/>
    {toast&&<output className="toast" aria-live="polite">{toast}</output>}
  </div>;
}

function Nav({icon,label,active,badge,onClick}:{icon:React.ReactNode;label:string;active?:boolean;badge?:string;onClick?:()=>void}){return <button onClick={onClick} className={`nav-item ${active?'active':''}`}>{icon}<span>{label}</span>{badge&&<em>{badge}</em>}</button>}
function Stat({label,value,note}:{label:string;value:string;note:string}){return <div className="metric" title={note}><p>{label}</p><b>{value}</b></div>}
function Legend({color,text}:{color:string;text:string}){return <span className="legend"><i style={{background:color}}/>{text}</span>}


