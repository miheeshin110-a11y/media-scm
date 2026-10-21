'use client';
import {useEffect,useRef,useState} from 'react';
import type {Item,PplLink} from '@/lib/scm-model';
import {linksOf} from '@/lib/workflow';
import {partyChoices,contractChannels} from '@/lib/counterparties';
import {amount,contractTotals,type Finance} from '@/lib/finance-model';
import {AllocationAiringFields} from './allocation-airing-fields';
import {PplPicker} from './ppl-picker';
import {pplAirings,airingLabel} from '@/lib/ppl-airings';
import {masterLink,masterProgram} from '@/lib/ppl-master';
import {duplicatePplErrors} from '@/lib/ppl-duplicates';
import type {FinanceSave} from './finance-entry';
import {Field,Value,NumberInput} from './entry-fields';

export type PplDraft={selected:string;net:string;month:string};
const won=(value:string|number)=>Number(value||0).toLocaleString('ko-KR')+'원';
export function PplEditor({form,onChange,items,finance,save,canManage,onSave,onOpenRegistry,preferredId='',draft,onCommit}:{form:Item;onChange:(item:Item)=>void;items:Item[];finance:Finance;save:FinanceSave;canManage:boolean;onSave:(item:Item)=>Promise<Item|false>;onOpenRegistry:(startNew:boolean,draft:PplDraft)=>void;preferredId?:string;draft?:PplDraft;onCommit:(fn:(()=>Promise<boolean>)|null)=>void}){
 const linked=finance.allocations.filter(a=>a.active&&a.broadcastId===form.id);
 const [selected,setSelected]=useState(preferredId||draft?.selected||linked[0]?.contractId||linksOf(form).find(l=>l.contractRef)?.contractRef||'');
 const [net,setNet]=useState(draft?.selected===selected?draft.net:linked.find(a=>a.contractId===selected)?.net||''),[month,setMonth]=useState(draft?.selected===selected?draft.month:linked.find(a=>a.contractId===selected)?.month||form.attribution||form.date.slice(0,7)),[notice,setNotice]=useState('');
 const c=finance.contracts.find(c=>c.id===selected),allocation=linked.find(a=>a.contractId===selected);
 const resetKey=JSON.stringify([selected,allocation?.net,allocation?.month,form.attribution,form.date]),lastKey=useRef(resetKey);
 useEffect(()=>{if(lastKey.current===resetKey)return;lastKey.current=resetKey;setNet(allocation?.net||'');setMonth(allocation?.month||form.attribution||form.date.slice(0,7));setNotice('');},[resetKey,allocation?.net,allocation?.month,form.attribution,form.date]);
 const links=linksOf(form),link=links.find(l=>l.contractRef===selected);
 const t=c?contractTotals(finance,c.id):null;
 const available=c&&t?amount(t.remaining.net)+amount(allocation?.net||''):0;
 const valid=!!c&&/^\d+$/.test(net)&&Number.isSafeInteger(Number(net))&&amount(net)<=available&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
 const candidate=():Item=>{
  if(!c)return form;
  const existing=links.find(l=>l.contractRef===c.id);
  const reusable=existing||links.find(l=>!l.contractRef&&l.channel===c.channel&&l.program===masterProgram(c,items));
  const next=reusable?links.map(l=>l.id===reusable.id?{...l,contractRef:c.id}:l):[...links.filter(l=>l.program||l.channel||l.date||l.time||l.contractRef),{...masterLink(c,form,items),id:crypto.randomUUID(),program:masterProgram(c,items)}];
  return {...form,ppl:'있음',pplLinks:next,program:next.map(l=>l.program).filter(Boolean).join(' / '),pplKind:next[0]?.kind||''};
 };
 const commit=async()=>{
  if(form.ppl!=='있음'||!c)return Boolean(await onSave(form));
  if(canManage&&!valid){setNotice('배분금액과 비용 귀속월을 입력하세요. 남은 금액을 초과할 수 없습니다.');return false;}
  const next=candidate(),errors=duplicatePplErrors(next);if(errors.length){setNotice(errors.join(' '));return false;}
  const airingLink=next.pplLinks?.find(l=>l.contractRef===c.id);
  const airing=airingLink?{date:airingLink.date,time:airingLink.time,kind:airingLink.kind,originalDate:airingLink.originalDate||''}:undefined;
  const saved=await onSave(next);if(!saved)return false;
  if(!canManage){setNotice('PPL 선택을 부분 저장했습니다. 금액 배분은 팀장이 진행합니다.');return true;}
  const result=await save({kind:'allocation',data:{id:allocation?.id||'',contractId:c.id,broadcastId:saved.id,month,net,airing,taxMode:'auto'}});
  setNotice(result?'이 방송의 PPL 연결과 배분금액을 저장했습니다.':'방송은 저장됐지만 금액 배분은 완료되지 않았습니다. 오류 안내를 확인한 뒤 다시 저장하세요.');
  return Boolean(result);
 };
 useEffect(()=>{onCommit(commit);return ()=>onCommit(null);});
 const put=(key:keyof PplLink,value:string)=>{const next=candidate();const target=next.pplLinks?.find(l=>l.contractRef===selected);if(target)onChange({...next,pplLinks:next.pplLinks!.map(l=>l.id===target.id?{...l,[key]:value}:l)});};
 const detail=link||(c?{...masterLink(c,form,items),program:masterProgram(c,items)}:null);
 return <div className="ppl-guided">
  <div className="ppl-presence"><strong>이 홈쇼핑 방송에 PPL을 연결하나요?</strong><div className="finance-actions">{['있음','없음','미정'].map(x=><button type="button" disabled={linked.length>0&&x!=='있음'} aria-pressed={form.ppl===x} className={form.ppl===x?'primary-button':'secondary-button'} key={x} onClick={()=>onChange({...form,ppl:x})}>PPL {x}</button>)}</div></div>
  {form.ppl!=='있음'?<p className="result-note">{form.ppl==='없음'?'PPL 연결 없이 다음 단계로 진행하세요.':'PPL이 정해지면 먼저 총금액을 등록한 뒤 이 방송에 연결합니다. 미정으로 부분 저장할 수 있습니다.'}</p>:<>
   <div className="section-tools"><p className="result-note"><strong>① PPL 총금액 등록 → ② 홈쇼핑 방송 연결·배분</strong><br/>등록된 PPL을 선택하고, 현재 홈쇼핑 방송에 연결할 PPL 방송일·시간과 배분금액을 함께 입력합니다.</p><button className="secondary-button" onClick={()=>onOpenRegistry(false,{selected,net,month})}>PPL 총금액 등록·관리</button></div>
   <PplPicker finance={finance} items={items} value={selected} onChange={setSelected} broadcastId={form.id} canCreate={canManage} onCreate={()=>onOpenRegistry(true,{selected,net,month})}/>
   {c&&!pplAirings(c,items).some(a=>a.date)&&<p className="result-note">이 PPL은 방송일이 미등록입니다. 아래 연결·배분 입력에서 PPL 방송일·시간을 금액과 함께 설정하세요.</p>}

   {c&&t&&<>
    {pplAirings(c,items).length>1&&<Field label="이 홈쇼핑 방송에 해당하는 PPL 송출회차" hint="같은 PPL에 본방·재방 등 여러 일정이 있습니다. 날짜를 확인해 선택하세요."><select className="form-control" value={String(pplAirings(c,items).findIndex(a=>a.date===detail?.date&&a.time===detail?.time&&a.kind===detail?.kind))} onChange={e=>{const a=pplAirings(c,items)[Number(e.target.value)];if(!a)return;const next=candidate();onChange({...next,pplLinks:next.pplLinks?.map(l=>l.contractRef===selected?{...l,...a,originalDate:a.originalDate||'',originalPplId:''}:l)});}}><option value="-1">송출회차 선택 · 직접 입력은 아래 연결·배분</option>{pplAirings(c,items).map((a,i)=><option key={i} value={i}>{airingLabel(a)}</option>)}</select></Field>}

    <div className="allocation-summary"><div><span>PPL 총금액 · 부가세 별도</span><strong>{won(c.net)}</strong></div><div><span>다른 방송에 배분한 금액</span><strong>{won(amount(t.allocated.net)-amount(allocation?.net||''))}</strong></div><div><span>현재 방송에 배분 가능한 금액</span><strong>{won(available)}</strong></div></div>
    <div className="result-grid"><Value label="현재 홈쇼핑 방송" value={`${form.date||'일정 미정'} ${form.time} · ${form.channel||'채널 미정'} ${form.item}`}/><Field label="이 방송의 배분금액 · 부가세 별도 (원)"><NumberInput integer value={net} onChange={setNet}/></Field><Field label="비용 귀속월" hint="방송일·계산서 발행월과 다르면 실제 비용 반영월을 선택하세요."><input className="form-control" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></Field></div>
    {detail&&<AllocationAiringFields value={detail} onChange={airing=>{const next=candidate();onChange({...next,pplLinks:next.pplLinks?.map(l=>l.contractRef===selected?{...l,...airing}:l)});}}/>}
    <div className="allocation-savebar"><output>{net!==''?amount(net)>available?'배분 가능한 금액을 초과했습니다.':`이 금액으로 저장하면 PPL 잔액 ${won(available-amount(net))}`:'현재 방송에 반영할 금액을 입력하세요.'}</output><button className="primary-button" onClick={commit}>{canManage?allocation?'일정·배분 수정 저장':'PPL 일정·배분 함께 저장':'PPL 선택 부분 저장'}</button></div>
    {!canManage&&<p className="result-note">PPL 선택은 부분 저장할 수 있습니다. 금액 배분은 팀장 권한으로 저장합니다.</p>}
    {detail&&<details className="ppl-extra"><summary>채널·프로그램·청약사 확인</summary><p className="result-note">PPL 방송일·시간은 위에서 배분금액과 함께 입력합니다.</p><div className="result-grid">
     <Value label="채널 · 프로그램" value={`${detail.channel} · ${detail.program||'PPL 등록 화면에서 프로그램 지정'}`}/>
     <Field label="청약사"><select className="form-control" value={detail.agencyId||''} onChange={e=>put('agencyId',e.target.value)}><option value="">청약사 선택</option>{contractChannels.map(x=><option key={x} value={'channel:'+x}>{x} · 채널사</option>)}{partyChoices(finance).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
    </div></details>}
   </>}
   {notice&&<output className="ppl-draft-notice">{notice}</output>}
   {!!linked.length&&<details className="ppl-extra"><summary>이 방송에 저장된 PPL 배분 · {linked.length}건</summary>{linked.map(a=>{const c=finance.contracts.find(c=>c.id===a.contractId);return <div className="section-tools" key={a.id}><span>{c?.code} · {c?masterProgram(c,items)||c.name:''} · {won(a.net)} · {a.month}</span><button className="text-button" onClick={()=>setSelected(a.contractId)}>배분 수정</button></div>;})}<p className="result-note">연결 제외는 ‘PPL 총금액 등록·관리 → 홈쇼핑 연결·배분’에서 처리합니다.</p></details>}
   {links.some(l=>!l.contractRef&&(l.program||l.channel))&&<p className="result-note">기존 송출 정보 중 총금액 등록과 연결되지 않은 항목이 있습니다. 위에서 해당 PPL을 선택해 연결하세요. 기존 송출 정보는 유지됩니다.</p>}
  </>}
 </div>;
}
