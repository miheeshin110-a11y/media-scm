'use client';
import {useEffect,useRef,useState} from 'react';
import {previewAllocationCosts} from '@/lib/ppl-broadcast-cost';
import type {Item,PplLink} from '@/lib/scm-model';
import {linksOf} from '@/lib/workflow';
import {partyChoices,contractChannels} from '@/lib/counterparties';
import {amount,contractTotals,type Finance} from '@/lib/finance-model';
import {PplAiringSelector} from './ppl-airing-selector';
import {linkAiring,resolveAiring} from '@/lib/ppl-registration';
import {PplPicker} from './ppl-picker';
import {pplAirings,airingLabel} from '@/lib/ppl-airings';
import {masterLink,masterProgram} from '@/lib/ppl-master';
import {pplConnectionTabs} from '@/lib/ppl-connection-tabs';
import {duplicatePplErrors} from '@/lib/ppl-duplicates';
import type {FinanceSave} from './finance-entry';
import {Field,Value,NumberInput} from './entry-fields';

export type PplDraft={applyAgencyCost?:boolean;selected:string;net:string;month:string;slot?:number;slots?:string[]};
const won=(value:string|number)=>Number(value||0).toLocaleString('ko-KR')+'원';
export function PplEditor({form,onChange,items,finance,save,canManage,onSave,onOpenRegistry,preferredId='',draft,onCommit,onNextLabel,onContinue}:{form:Item;onChange:(item:Item)=>void;items:Item[];finance:Finance;save:FinanceSave;canManage:boolean;onSave:(item:Item)=>Promise<Item|false>;onOpenRegistry:(startNew:boolean,draft:PplDraft)=>void;preferredId?:string;draft?:PplDraft;onCommit:(fn:(()=>Promise<boolean>)|null)=>void;onNextLabel:(label:string)=>void;onContinue:()=>void}){
 const linked=finance.allocations.filter(a=>a.active&&a.broadcastId===form.id);
 const [initial]=useState(()=>pplConnectionTabs(form,finance,draft,preferredId));
 const [slots,setSlots]=useState(initial.slots),[activeSlot,setActiveSlot]=useState(initial.active);
 const [selected,setSelected]=useState(initial.slots[initial.active]||'');
 const committing=useRef(false);
 const linkedIds=linked.map(a=>a.contractId).join('|');
 useEffect(()=>{setSlots(old=>{const missing=linkedIds.split('|').filter(id=>id&&!old.includes(id));return missing.length?[...old,...missing]:old;});},[linkedIds]);
 const registryDraft=():PplDraft=>({selected,net,month,slot:activeSlot,slots,applyAgencyCost});
 const [net,setNet]=useState(draft?.selected===selected?draft.net:linked.find(a=>a.contractId===selected)?.net||''),[month,setMonth]=useState(draft?.selected===selected?draft.month:linked.find(a=>a.contractId===selected)?.month||form.attribution||form.date.slice(0,7)),[notice,setNotice]=useState('');
 const c=finance.contracts.find(c=>c.id===selected),allocation=linked.find(a=>a.contractId===selected);
 const [applyAgencyCost,setApplyAgencyCost]=useState(draft?.selected===selected&&draft.applyAgencyCost===true);
 const resetKey=JSON.stringify([selected,allocation?.net,allocation?.month,allocation?.broadcastCost,form.attribution,form.date]),lastKey=useRef(resetKey);
 useEffect(()=>{if(lastKey.current===resetKey)return;lastKey.current=resetKey;setNet(allocation?.net||'');setMonth(allocation?.month||form.attribution||form.date.slice(0,7));setNotice('');setApplyAgencyCost(false);},[resetKey,allocation?.net,allocation?.month,allocation?.broadcastCost,form.attribution,form.date]);
 const links=linksOf(form),link=links.find(l=>l.contractRef===selected);
 const t=c?contractTotals(finance,c.id):null;
 const available=c&&t?amount(t.remaining.net)+amount(allocation?.net||''):0;
 const costPreview=c?previewAllocationCosts(c,finance.allocations.filter(a=>a.active&&a.contractId===c.id),[...finance.allocations.filter(a=>a.active&&a.contractId===c.id&&a.id!==allocation?.id).map(a=>({...a,key:a.id})),{id:allocation?.id||'',key:'current',net,broadcastId:form.id,applyAgencyCost}]).get('current'):null;
 const valid=!!c&&/^\d+$/.test(net)&&Number.isSafeInteger(Number(net))&&amount(net)<=available&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
 const candidate=():Item=>{
  if(!c)return form;
  const existing=links.find(l=>l.contractRef===c.id);
  const reusable=existing||links.find(l=>!l.contractRef&&l.channel===c.channel&&l.program===masterProgram(c,items));
  const next=reusable?links.map(l=>l.id===reusable.id?{...l,contractRef:c.id}:l):[...links.filter(l=>l.program||l.channel||l.date||l.time||l.contractRef),{...masterLink(c,form,items),id:crypto.randomUUID(),program:masterProgram(c,items)}];
  return {...form,ppl:'있음',pplLinks:next,program:next.map(l=>l.program).filter(Boolean).join(' / '),pplKind:next[0]?.kind||''};
 };
 const commit=async()=>{
  if(committing.current)return false;
  committing.current=true;
  try{
  if(activeSlot>0&&!selected)return true;
  if(form.ppl==='있음'&&!c){setNotice('연결할 PPL을 선택하세요. PPL이 없으면 위에서 PPL 없음을 선택하세요.');return false;}
  if(form.ppl!=='있음'||!c)return Boolean(await onSave(form));
  if(canManage&&!valid){setNotice('배분금액과 비용 귀속월을 입력하세요. 남은 금액을 초과할 수 없습니다.');return false;}
  const next=candidate(),errors=duplicatePplErrors(next);if(errors.length){setNotice(errors.join(' '));return false;}
  const airingLink=next.pplLinks?.find(l=>l.contractRef===c.id);
  const airing=airingLink?{id:airingLink.airingId,date:airingLink.date,time:airingLink.time,kind:airingLink.kind,originalDate:airingLink.originalDate||''}:undefined;
  if(c.airings?.some(a=>a.id)&&!resolveAiring(c,airing)){setNotice('연결할 PPL 송출회차를 선택하세요.');return false;}
  const saved=await onSave(next);if(!saved)return false;
  if(!canManage){setNotice('PPL 선택을 부분 저장했습니다. 금액 배분은 팀장이 진행합니다.');return true;}
  const result=await save({kind:'allocation',data:{id:allocation?.id||'',contractId:c.id,broadcastId:saved.id,month,net,airing,taxMode:'auto',applyAgencyCost}});
  if(result)setApplyAgencyCost(false);
  setNotice(result?'이 방송의 PPL 연결과 배분금액을 저장했습니다.':'방송은 저장됐지만 금액 배분은 완료되지 않았습니다. 오류 안내를 확인한 뒤 다시 저장하세요.');
  return Boolean(result);
  }finally{committing.current=false;}
 };
 const activate=(index:number)=>{
  const id=slots[index]||'',saved=linked.find(a=>a.contractId===id);
  setActiveSlot(index);setSelected(id);setNet(saved?.net||'');setMonth(saved?.month||form.attribution||form.date.slice(0,7));setNotice('');
 };
 const changeTab=async(index:number)=>{
  if(index<0||index===activeSlot||committing.current)return;
  // Save entered data before changing tabs so one connection cannot overwrite another.
  if(selected&&!await commit())return;
  if(!selected&&activeSlot===0){setNotice('먼저 PPL 연결 1을 선택하고 저장하세요.');return;}
  activate(index);
 };
 const choose=(id:string)=>{
  if(slots.some((x,i)=>i!==activeSlot&&x===id)){setNotice('다른 연결 탭에서 선택한 PPL입니다. 해당 탭에서 수정하세요.');return;}
  if(allocation&&id!==selected){setNotice('다른 PPL은 빈 연결 탭에서 추가하세요. 저장된 연결을 바꾸려면 PPL 등록·배분에서 기존 연결을 먼저 제외해 주세요.');return;}
  if(selected&&id!==selected){const remaining=links.filter(l=>l.contractRef!==selected);onChange({...form,pplLinks:remaining,program:remaining.map(l=>l.program).filter(Boolean).join(' / '),pplKind:remaining[0]?.kind||''});}
  setSlots(old=>old.map((x,i)=>i===activeSlot?id:x));setSelected(id);setNotice('');
 };
 const advance=async()=>{
  if(!await commit())return false;
  if(form.ppl==='있음'&&activeSlot<slots.length-1){activate(activeSlot+1);return false;}
  return true;
 };
 useEffect(()=>{onCommit(advance);return ()=>onCommit(null);});
 useEffect(()=>{onNextLabel(form.ppl!=='있음'?'다음':activeSlot<slots.length-1?`저장 후 PPL 연결 ${activeSlot+2}`:selected?'저장 후 판매조건':'PPL 없이 건너뛰기');},[form.ppl,activeSlot,slots.length,selected,onNextLabel]);
 const put=(key:keyof PplLink,value:string)=>{const next=candidate();const target=next.pplLinks?.find(l=>l.contractRef===selected);if(target)onChange({...next,pplLinks:next.pplLinks!.map(l=>l.id===target.id?{...l,[key]:value}:l)});};
 const detail=link||(c?{...masterLink(c,form,items),program:masterProgram(c,items)}:null);
 return <div className="ppl-guided">
  <div className="ppl-presence"><strong>이 홈쇼핑 방송에 PPL을 연결하나요?</strong><div className="finance-actions">{['있음','없음','미정'].map(x=><button type="button" disabled={linked.length>0&&x!=='있음'} aria-pressed={form.ppl===x} className={form.ppl===x?'primary-button':'secondary-button'} key={x} onClick={()=>onChange({...form,ppl:x})}>PPL {x}</button>)}</div></div>
  {form.ppl!=='있음'?<p className="result-note">{form.ppl==='없음'?'PPL 연결 없이 다음 단계로 진행하세요.':'PPL이 정해지면 먼저 총금액을 등록한 뒤 이 방송에 연결합니다. 미정으로 부분 저장할 수 있습니다.'}</p>:<>
   <div className="ppl-connection-tabs" role="tablist" aria-label="방송별 PPL 연결">{slots.map((id,index)=><button type="button" role="tab" id={'ppl-tab-'+index} aria-controls="ppl-connection-panel" aria-selected={activeSlot===index} key={index} onClick={()=>void changeTab(index)}><strong>PPL 연결 {index+1}</strong><span>{linked.some(a=>a.contractId===id)?'저장됨':id?'입력 중':index===0?'첫 번째 PPL':'선택사항'}</span></button>)}</div>
   <section id="ppl-connection-panel" role="tabpanel" aria-labelledby={'ppl-tab-'+activeSlot}>
   {activeSlot>0&&!selected&&<div className="ppl-optional-connection"><p>추가 PPL이 있으면 아래에서 선택해 금액을 배분하세요. 없으면 건너뛰세요.</p><button type="button" className="secondary-button" onClick={async()=>{if(await advance())onContinue()}}>PPL 연결 {activeSlot+1} 없음 · 건너뛰기</button></div>}
   <div className="section-tools"><p className="result-note"><strong>① PPL 총금액 등록 → ② 홈쇼핑 방송 연결·배분</strong><br/>등록된 PPL을 선택하고, 날짜·시간으로 송출회차를 선택한 뒤 현재 홈쇼핑 방송에 배분할 금액을 입력합니다.</p><button className="secondary-button" onClick={()=>onOpenRegistry(false,registryDraft())}>PPL 총금액 등록·관리</button></div>
   <PplPicker finance={finance} items={items} value={selected} onChange={choose} excludedIds={slots.filter((id,i)=>i!==activeSlot&&id!=='')} broadcastId={form.id} canCreate={canManage} onCreate={()=>onOpenRegistry(true,registryDraft())}/>
   {activeSlot>0&&selected&&!allocation&&<button type="button" className="text-button" onClick={async()=>{
    const remaining=links.filter(l=>l.contractRef!==selected);
    const cleaned={...form,pplLinks:remaining,program:remaining.map(l=>l.program).filter(Boolean).join(' / '),pplKind:remaining[0]?.kind||''};
    if(!await onSave(cleaned))return;
    setSlots(old=>old.map((id,i)=>i===activeSlot?'':id));setSelected('');setNet('');setNotice('');
   }}>PPL 연결 {activeSlot+1} 선택 취소</button>}
   {c&&!pplAirings(c,items).some(a=>a.date)&&<p className="result-note">이 PPL은 방송일이 미등록입니다. PPL 등록·관리에서 본방·재방 일정을 등록하면 날짜로 선택할 수 있습니다.</p>}

   {c&&t&&<>
    <div className="allocation-summary"><div><span>PPL 총금액 · 부가세 별도</span><strong>{won(c.net)}</strong></div><div><span>다른 방송에 배분한 금액</span><strong>{won(amount(t.allocated.net)-amount(allocation?.net||''))}</strong></div><div><span>현재 방송에 배분 가능한 금액</span><strong>{won(available)}</strong></div></div>
    <div className="result-grid"><Value label="현재 홈쇼핑 방송" value={`${form.date||'일정 미정'} ${form.time} · ${form.channel||'채널 미정'} ${form.item}`}/><Field label="이 방송의 원금액 배분 · 부가세 별도 (원)"><NumberInput integer value={net} onChange={setNet}/></Field><Field label="비용 귀속월" hint="방송일·계산서 발행월과 다르면 실제 비용 반영월을 선택하세요."><input className="form-control" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></Field></div>
    {detail&&<PplAiringSelector contract={c} value={{...detail,id:detail.airingId}} onChange={airing=>{const next=candidate();onChange({...next,pplLinks:next.pplLinks?.map(l=>l.contractRef===selected?{...l,...linkAiring(airing)}:l)});}}/>}
    {canManage&&allocation&&c.tradeType==='agency'&&<label className="vat-toggle"><input type="checkbox" checked={applyAgencyCost} onChange={e=>setApplyAgencyCost(e.target.checked)}/>대행료 차감 적용 · 같은 원금액으로 저장해도 방송 비용과 이익을 변경합니다.</label>}<div className="result-grid"><Value label="방송에 반영할 PPL 비용 · 대행료 차감 후 (원)" value={costPreview?won(costPreview.cost):'미산출'}/><Value label="이번 배분의 대행료 (원)" value={costPreview?won(costPreview.fee):'미산출'}/></div><p className="result-note">계약 원금액으로 배분합니다. 새 배분·배분금액 변경 시 대행료를 차감한 금액만 방송 비용에 반영합니다. 같은 금액의 기존 배분은 차감 적용을 선택한 경우에만 변경됩니다. 선택하지 않은 배분은 저장된 비용과 이익을 유지합니다.</p><div className="allocation-savebar"><output>{net!==''?amount(net)>available?'배분 가능한 금액을 초과했습니다.':`이 금액으로 저장하면 PPL 잔액 ${won(available-amount(net))}`:'현재 방송에 반영할 금액을 입력하세요.'}</output><button className="primary-button" onClick={commit}>{canManage?allocation?'일정·배분 수정 저장':'PPL 일정·배분 함께 저장':'PPL 선택 부분 저장'}</button></div>
    {!canManage&&<p className="result-note">PPL 선택은 부분 저장할 수 있습니다. 금액 배분은 팀장 권한으로 저장합니다.</p>}
    {detail&&<details className="ppl-extra"><summary>채널·프로그램·청약사 확인</summary><p className="result-note">PPL 방송일·시간은 등록된 송출회차를 선택해 연결합니다.</p><div className="result-grid">
     <Value label="채널 · 프로그램" value={`${detail.channel} · ${detail.program||'PPL 등록 화면에서 프로그램 지정'}`}/>
     <Field label="청약사"><select className="form-control" value={detail.agencyId||''} onChange={e=>put('agencyId',e.target.value)}><option value="">청약사 선택</option>{contractChannels.map(x=><option key={x} value={'channel:'+x}>{x} · 채널사</option>)}{partyChoices(finance).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
    </div></details>}
   </>}
   {notice&&<output className="ppl-draft-notice">{notice}</output>}
   </section>
   {!!linked.length&&<details className="ppl-extra"><summary>이 방송에 저장된 PPL 배분 · {linked.length}건 · 합계 {won(linked.reduce((sum,a)=>sum+amount(a.net),0))}</summary>{linked.map(a=>{const c=finance.contracts.find(c=>c.id===a.contractId);return <div className="section-tools" key={a.id}><span>{c?.code} · {c?masterProgram(c,items)||c.name:''} · {won(a.net)} · {a.month}</span><button className="text-button" onClick={()=>void changeTab(slots.indexOf(a.contractId))}>배분 수정</button></div>;})}<p className="result-note">연결 제외는 ‘PPL 총금액 등록·관리 → 홈쇼핑 연결·배분’에서 처리합니다.</p></details>}
   {links.some(l=>!l.contractRef&&(l.program||l.channel))&&<p className="result-note">기존 송출 정보 중 총금액 등록과 연결되지 않은 항목이 있습니다. 위에서 해당 PPL을 선택해 연결하세요. 기존 송출 정보는 유지됩니다.</p>}
  </>}
 </div>;
}
