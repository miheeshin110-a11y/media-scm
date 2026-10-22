'use client';
import {useEffect,useRef,useState} from 'react';
import {amount,defaultVat,contractName,type Finance,type FinanceAction,type Contract,type Money} from '@/lib/finance-model';
import {partyChoices,partyId,displayBusinessNo,contractChannels,dionBusinessNo,type Party} from '@/lib/counterparties';
import {NumberInput} from './entry-fields';
import {registrationIssues,resolveAiring} from '@/lib/ppl-registration';
import {AgencyFields,PplScheduleFields} from './ppl-registration-fields';
import {PplAiringSelector} from './ppl-airing-selector';
import {airingSummary,pplAirings,matchesPpl} from '@/lib/ppl-airings';
import type {PplAiring} from '@/lib/ppl-airings';
import {masterProgram} from '@/lib/ppl-master';
import {linksOf} from '@/lib/workflow';
import {workspaceContract} from '@/lib/ppl-contracts';
import type {Item} from '@/lib/scm-model';
import {TaxWorkspace} from './tax-workspace';
import {contractFormIssues,allocationFormIssues} from '@/lib/finance-form';
export type FinanceSave=(action:FinanceAction)=>Promise<false|Finance>;
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
const won=(v:string|number)=>Number(v||0).toLocaleString('ko-KR')+'원';
const total=(m:Money)=>amount(m.net)+amount(m.tax);
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="input-field"><span className="field-label">{label}</span>{children}</label>}
function Input({label,value,onChange,type='text'}:{label:string;value:string;onChange:(v:string)=>void;type?:string}){return <Field label={label}>{type==='number'?<NumberInput integer value={value} onChange={onChange}/>:<input className="form-control" type={type} value={value} onChange={e=>onChange(e.target.value)}/>}</Field>}
function MoneyFields({value,onChange}:{value:Money;onChange:(k:'net'|'tax'|'taxMode',v:string)=>void}){
 const manual=value.taxMode==='manual'||(!value.taxMode&&value.tax!==''&&value.tax!==defaultVat(value.net));
 const tax=manual?value.tax:defaultVat(value.net);
 return <><Input label="PPL 총금액 · 대행료 포함, VAT 별도 (원)" type="number" value={value.net} onChange={v=>{onChange('net',v);if(!manual){onChange('tax',defaultVat(v));onChange('taxMode','auto')}}}/><div className="vat-field"><div className="result-value"><span>부가세 {manual?'조정':'자동 계산'}</span><strong>{tax===''?'—':won(tax)}</strong><small>기본 10% · 원 미만 버림</small></div><label className="vat-toggle"><input type="checkbox" checked={manual} onChange={e=>{onChange('taxMode',e.target.checked?'manual':'auto');if(!e.target.checked)onChange('tax',defaultVat(value.net))}}/>계산서 금액과 다를 때 조정</label>{manual&&<Input label="조정 부가세 (원)" type="number" value={value.tax} onChange={v=>onChange('tax',v)}/>}</div><div className="result-value"><span>부가세 포함 합계</span><strong>{value.net===''?'—':won(amount(value.net)+amount(tax))}</strong></div></>;
}

type Shared={finance:Finance;items:Item[];save:FinanceSave;busy:boolean};
const freshContract=():Contract=>({taxMode:'auto',id:'',code:'',name:'',party:'',businessNo:'',channel:'',approvalNo:'',date:'',net:'',tax:'',notes:'',airings:[{id:'initial-airing',date:'',time:'',kind:'본방'}]});
export function FinanceWorkspace({finance,items,save,busy,reload,preferredContractId='',canWrite=true,canReconcile=canWrite,startNew=false,onReturn}:{finance:Finance;items:Item[];save:FinanceSave;busy:boolean;reload:()=>void;preferredContractId?:string;canWrite?:boolean;canReconcile?:boolean;startNew?:boolean;onReturn?:(id?:string)=>void}){
 const [selected,setSelected]=useState<string|null>(startNew?'':null),[tab,setTab]=useState('contract'),[query,setQuery]=useState('');
 const c=workspaceContract(finance,selected,preferredContractId);
 const filtered=finance.contracts.filter(x=>matchesPpl(x,items,query,finance));
 const choices=c&&!filtered.some(x=>x.id===c.id)?[c,...filtered]:filtered;
 return <><div className="input-toolbar finance-toolbar"><div className="finance-search"><input aria-label="PPL 날짜·시간·프로그램명 검색" className="form-control" placeholder="예: 10/22 09:30 세개의 시선" value={query} onChange={e=>setQuery(e.target.value)}/></div><div><button className="secondary-button" disabled={busy} onClick={reload}>최신 자료</button><button className="primary-button" disabled={busy||!canWrite} onClick={()=>{setSelected('');setTab('contract');setQuery('')}}>새 PPL 등록</button></div></div>
 {onReturn&&<button className="text-button" disabled={busy} onClick={()=>onReturn()}>← 작성 중인 홈쇼핑 방송으로 돌아가기</button>}<label className="record-picker finance-contract-picker"><span>등록된 PPL · {finance.contracts.length}건</span><select className="form-control" disabled={busy} value={c?.id||''} onChange={e=>setSelected(e.target.value)}><option value="">{canWrite?'새 PPL 등록':'PPL 선택'}</option>{choices.map(x=><option key={x.id} value={x.id}>{airingSummary(x,items)} · {x.code} · {x.name} · {won(total(x))}</option>)}</select></label>
 {query&&!filtered.length&&<p className="result-note">검색 결과가 없습니다. 검색어를 지우면 전체 계약을 볼 수 있습니다.</p>}
 <div className="input-layout finance-layout"><section className="form-panel"><div className="editor-heading"><h2>{tab==='invoice'?'계산서 승인번호·엑셀 대조':c?c.name:canWrite&&tab==='contract'?'① PPL 총금액 등록':'PPL 선택 필요'}</h2><small>{c?.code||'총금액 저장 → 홈쇼핑 방송 연결·배분'}</small></div>
 <div className="finance-tabs" aria-label="계약·정산 메뉴">{[['contract','① PPL 총금액'],['allocation','② 홈쇼핑 연결·배분'],['invoice','③ 계산서 번호·대조']].map(([k,label])=><button className={tab===k?'active':''} aria-pressed={tab===k} disabled={busy} key={k} onClick={()=>setTab(k)}>{label}</button>)}</div>
 <div className="drawer-body" key={tab}><p className="result-note">{tab==='invoice'?'계산서 금액을 다시 입력하지 않고, 승인번호로 홈택스 자료를 대조합니다.':c?'하나의 PPL 총금액 안에서 여러 홈쇼핑 방송에 비용을 나눕니다.':'먼저 PPL 총금액을 저장하세요. 홈쇼핑 방송은 다음 단계에서 연결합니다.'}{!canWrite?' 현재 조회 권한입니다. 등록된 실무자 계정으로 로그인하면 PPL을 등록·배분할 수 있습니다.':''}</p>
 {tab==='invoice'?<TaxWorkspace finance={finance} contract={c} save={save} busy={busy} canWrite={canReconcile}/>:!c&&(tab!=='contract'||!canWrite)?<div className="result-empty"><h3>{finance.contracts.length?'관리할 계약을 선택해 주세요.':'등록된 계약이 없습니다.'}</h3><p>{finance.contracts.length?'상단에서 등록된 PPL을 선택하면 연결된 방송과 배분금액을 확인할 수 있습니다.':'① PPL 총금액 탭에서 등록을 먼저 완료해 주세요.'}</p>{!!finance.contracts.length&&<button className="primary-button" onClick={()=>{setSelected(null);setQuery('')}}>최근 계약 열기</button>}{canWrite&&<button className="secondary-button" onClick={()=>setTab('contract')}>새 계약 등록</button>}</div>:<fieldset className="finance-fields" disabled={busy||!canWrite}>
 {tab==='contract'&&<ContractEditor items={items} key={c?.id||'new'} finance={finance} contract={c} save={save} saveLabel={startNew&&onReturn?'PPL 등록 후 작성하던 방송으로 돌아가기':undefined} onSaved={id=>{if(startNew&&onReturn){onReturn(id);return;}setSelected(id);setQuery('');setTab('allocation')}}/>}
 {tab==='allocation'&&c&&<AllocationEditor key={c.id+':'+finance.version} finance={finance} items={items} save={save} busy={busy} contractId={c.id}/>}
 </fieldset>}</div></section></div></>;
}
function PartyPicker({finance,value,onChange}:{finance:Finance;value:string;onChange:(p:Party)=>void}){
 const [query,setQuery]=useState('');const choices=partyChoices(finance);const selected=choices.find(p=>p.businessNo===value.replace(/[-\s]/g,''));
 return <><Field label="계약 거래처 선택"><div className="party-picker"><input className="form-control" aria-label="거래처 검색" placeholder="회사명 · 사업자번호 검색" value={query} onChange={e=>setQuery(e.target.value)}/><select className="form-control" value={selected?.id||''} onChange={e=>{const p=choices.find(x=>x.id===e.target.value);if(p)onChange(p)}}><option value="" disabled>거래처를 선택하세요</option>{choices.filter(p=>p.id===selected?.id||(p.name+p.businessNo).replace(/[-\s]/g,'').includes(query.replace(/[-\s]/g,''))).map(p=><option value={p.id} key={p.id}>{p.name}{p.businessNo===dionBusinessNo?' · 인하우스 경유사':''}</option>)}</select></div></Field><Field label="사업자등록번호 · 자동 입력"><input className="form-control" readOnly value={displayBusinessNo(selected?.businessNo||'')} placeholder="거래처 선택 시 표시"/></Field></>;
}
function RegisterParty({save,onRegistered}:{save:FinanceSave;onRegistered:(p:Party)=>void}){
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[businessNo,setBusinessNo]=useState('');
 return <div className="party-register"><button className="text-button" onClick={()=>setOpen(x=>!x)} aria-expanded={open}>{open?'거래처 등록 닫기':'+ 목록에 없는 거래처 등록'}</button>{open&&<><p className="result-note">세금계산서의 정식 상호와 사업자번호로 한 번만 등록하세요.</p><div className="result-grid"><Input label="정식 상호" value={name} onChange={setName}/><Input label="사업자등록번호" value={businessNo} onChange={setBusinessNo}/></div><div className="finance-actions"><button className="secondary-button" onClick={async()=>{const n=businessNo.replace(/[-\s]/g,'');if(await save({kind:'party',data:{name,businessNo}})){onRegistered({id:partyId(n),name:name.trim(),businessNo:n,source:'사용자 등록'});setOpen(false);setName('');setBusinessNo('')}}}>거래처 등록 후 선택</button></div></>}</div>;
}
function contractDraft(c:Contract,items:Item[],finance:Finance):Contract{
 const rows=pplAirings(c,items,finance.allocations);
 const used=new Set(rows.map(a=>a.id).filter(Boolean));
 const airings=rows.map((a,i)=>{if(a.id)return a;let id='imported-'+i;while(used.has(id))id+='-legacy';used.add(id);return {...a,id}});
 return {...c,program:masterProgram(c,items),airings:airings.length?airings:[{id:'initial-airing',date:'',time:'',kind:'본방'}]};
}
export function ContractEditor({finance,contract,save,onSaved,saveLabel="PPL 저장 후 홈쇼핑 연결",items=[]}:{finance:Finance;contract?:Contract;save:FinanceSave;onSaved:(id:string,contract?:Contract)=>void;saveLabel?:string;items?:Item[]}){
 const snapshot=contract?JSON.stringify(contractDraft(contract,items,finance)):'';
 const [d,setD]=useState<Contract>(()=>snapshot?JSON.parse(snapshot):freshContract());
 const [section,setSection]=useState('info'),[newProgram,setNewProgram]=useState(''),[attempted,setAttempted]=useState(false);
 const feedback=useRef<HTMLDivElement>(null);const put=(k:string,v:string)=>setD(x=>({...x,[k]:v}));
 const previous=contract?pplAirings(contract,items,finance.allocations):[];
 const issues=[...contractFormIssues(d),...registrationIssues(d,previous)];
 useEffect(()=>{setD(snapshot?JSON.parse(snapshot):freshContract());setAttempted(false)},[snapshot]);
 const choose=(p:Party)=>setD(x=>({...x,partyId:p.id,party:p.name,businessNo:p.businessNo}));
 const programs=[...new Set([...(finance.programs||[]).filter(p=>p.channel===d.channel).map(p=>p.name),...items.flatMap(linksOf).filter(l=>l.channel===d.channel).map(l=>l.program),...finance.contracts.filter(c=>c.channel===d.channel).map(c=>masterProgram(c,items)),d.program||''].filter(Boolean))];
 const submit=async()=>{setAttempted(true);if(issues.length){feedback.current?.focus();return;}const result=await save({kind:'contract',data:d});if(result){const saved=result.contracts.find(c=>d.id?c.id===d.id:!finance.contracts.some(old=>old.id===c.id));if(saved)onSaved(saved.id,saved)}};
 return <><div className="finance-tabs" aria-label="PPL 등록 순서">{[['info','1. 프로그램·총금액'],['schedule','2. 본방·재방 일정']].map(([key,label])=><button key={key} aria-pressed={section===key} className={section===key?'active':''} onClick={()=>setSection(key)}>{label}</button>)}</div>
 {section==='info'?<><div className="form-section-heading"><h3>프로그램·총금액 등록</h3><p>대행료를 포함한 전체 공급가액을 입력한 뒤 송출일정을 등록하세요.</p></div><div className="result-grid"><div className="contract-name-preview"><span>계약명 · 자동 생성</span><strong>{contractName(d)}</strong></div><PartyPicker finance={finance} value={d.businessNo} onChange={choose}/><Field label="방송 채널 · 종편사"><select className="form-control" value={d.channel} onChange={e=>setD(x=>({...x,channel:e.target.value,program:''}))}><option value="">채널 선택</option>{[...new Set([...contractChannels,...(contract?.channel?[contract.channel]:[])])].map(c=><option key={c}>{c}</option>)}</select></Field><Field label="PPL 프로그램명"><select className="form-control" disabled={!d.channel} value={d.program||''} onChange={e=>put('program',e.target.value)}><option value="">프로그램 선택</option>{programs.map(p=><option key={p}>{p}</option>)}</select></Field><MoneyFields value={d} onChange={put}/></div><AgencyFields value={d} onChange={setD}/>
 <details className="ppl-extra" open={!!d.channel&&!programs.length}><summary>+ 목록에 없는 PPL 프로그램 등록</summary><Input label="새 프로그램명" value={newProgram} onChange={setNewProgram}/><button className="secondary-button" disabled={!d.channel||!newProgram.trim()} onClick={async()=>{if(await save({kind:'program',data:{channel:d.channel,name:newProgram}})){put('program',newProgram.trim());setNewProgram('')}}}>프로그램 등록 후 선택</button></details><RegisterParty save={save} onRegistered={choose}/>
 <details className="ppl-extra"><summary>기안번호·계약 체결일·메모 · 선택 입력</summary><div className="result-grid"><Input label="기안번호" value={d.approvalNo} onChange={v=>put('approvalNo',v)}/><Input label="계약 체결일 · 송출일과 별도" type="date" value={d.date} onChange={v=>put('date',v)}/><Input label="메모" value={d.notes} onChange={v=>put('notes',v)}/></div></details>
 <div className="finance-actions"><button className="primary-button" onClick={()=>setSection('schedule')}>다음: 본방·재방 일정 입력</button><span>다음 단계에서 일정을 입력하고 함께 저장합니다.</span></div></>:<><PplScheduleFields contract={d} allocations={finance.allocations} onChange={airings=>setD(x=>({...x,airings}))}/><div className="finance-actions"><button className="secondary-button" onClick={()=>setSection('info')}>이전: 프로그램·총금액</button><button className="primary-button" onClick={submit}>{saveLabel}</button></div></>}
 <div className="finance-save-feedback" ref={feedback} tabIndex={-1} role={attempted&&issues.length?'alert':'status'}>{attempted&&issues.length?<><strong>저장 전 확인할 항목</strong><ul>{issues.map(issue=><li key={issue}>{issue}</li>)}</ul></>:<span>프로그램·총금액과 송출일정을 저장한 뒤 홈쇼핑 방송에 배분합니다.</span>}</div></>;
}
type AllocationDraft={id:string;key:string;broadcastId:string;month:string;net:string;airing:PplAiring};
export function AllocationEditor(props:Shared&{contractId?:string;broadcastId?:string}){
 const {finance,contractId='',broadcastId=''}=props;
 const linked=finance.allocations.filter(a=>a.active&&a.broadcastId===broadcastId);
 const [selected,setSelected]=useState(contractId||linked[0]?.contractId||'');
 if(broadcastId&&!props.items.some(x=>x.id===broadcastId))return <p className="result-note">방송 기본정보를 저장한 뒤 계약을 연결하세요.</p>;
 const c=finance.contracts.find(x=>x.id===(contractId||selected));
 return <>{!contractId&&<Field label="여러 방송에 나눌 계약 선택"><select className="form-control" disabled={props.busy} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">계약 선택</option>{finance.contracts.map(x=><option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></Field>}{c?<BatchAllocationEditor key={c.id} {...props} contract={c} preferredBroadcastId={broadcastId}/>:<p className="result-note">계약을 선택하면 연결된 방송과 배분금액을 한 번에 관리할 수 있습니다.</p>}</>;
}
function BatchAllocationEditor({finance,items,save,busy,contract:c,preferredBroadcastId=''}:Shared&{contract:Contract;preferredBroadcastId?:string}){
 const serial=useRef(0);
 const priorAiring=(broadcastId:string):PplAiring=>{const link=items.find(b=>b.id===broadcastId)?.pplLinks?.find(l=>l.contractRef===c.id);return link?{id:link.airingId,date:link.date,time:link.time,kind:link.kind,originalDate:link.originalDate||''}:c.airings?.length===1?{...c.airings[0]}:{date:'',time:'',kind:'',originalDate:''};};
 const blank=(broadcastId=''):AllocationDraft=>({id:'',key:'new-'+serial.current++,broadcastId,month:items.find(b=>b.id===broadcastId)?.date.slice(0,7)||c.date.slice(0,7)||today().slice(0,7),net:'',airing:priorAiring(broadcastId)});
 const [rows,setRows]=useState<AllocationDraft[]>(()=>{const existing=finance.allocations.filter(a=>a.active&&a.contractId===c.id).map(a=>({...a,key:a.id,airing:a.airing||priorAiring(a.broadcastId)}));if(preferredBroadcastId&&!existing.some(a=>a.broadcastId===preferredBroadcastId))return [...existing,blank(preferredBroadcastId)];return existing.length?existing:[blank()];});
 const put=(key:string,k:'broadcastId'|'month'|'net',v:string)=>setRows(old=>old.map(r=>r.key!==key?r:{...r,[k]:v,...(k==='broadcastId'?{month:items.find(b=>b.id===v)?.date.slice(0,7)||r.month,airing:priorAiring(v)}:{})}));
 const allocated=rows.reduce((n,r)=>n+amount(r.net),0),remaining=amount(c.net)-allocated;
 const [expanded,setExpanded]=useState(rows[0]?.key||'');
 const issues=[...allocationFormIssues(rows,c.net),...rows.flatMap((r,i)=>c.airings?.some(a=>a.id)&&!resolveAiring(c,r.airing)?[`${i+1}번 방송: 연결할 PPL 송출회차를 선택하세요.`]:[])];const [attempted,setAttempted]=useState(false);const feedback=useRef<HTMLDivElement>(null);
 return <><div className="form-section-heading"><h3>② 홈쇼핑 방송 연결·금액 배분</h3><p>홈쇼핑 방송을 추가해 금액을 나누세요. 수정할 방송만 펼쳐 입력합니다. 금액은 부가세 별도입니다.</p></div>
 <div className="allocation-summary"><div><span>PPL 총금액 · 부가세 별도</span><strong>{won(c.net)}</strong></div><div><span>배분합계 · {rows.length}개 방송</span><strong>{won(allocated)}</strong></div><div className={remaining<0?'allocation-error':''}><span>{remaining<0?'초과 금액':'남은 배분금액'}</span><strong>{won(Math.abs(remaining))}</strong></div></div>
 <div className="allocation-list">{rows.map((r,i)=>{const b=items.find(x=>x.id===r.broadcastId);return <section className="allocation-card" key={r.key}><header><button className="allocation-card-toggle" aria-expanded={expanded===r.key} onClick={()=>setExpanded(expanded===r.key?'':r.key)}><span><b>{i+1}. {b?`${b.date} ${b.time} · ${b.channel} ${b.item}`:'연결할 홈쇼핑 방송 선택'}</b><small>PPL {r.airing.date||'방송일 미입력'} {r.airing.time} · {r.airing.kind||'송출구분 미입력'} · 귀속 {r.month||'미정'}</small></span><strong>{r.net===''?'금액 입력':won(r.net)}</strong><em>{expanded===r.key?'접기':'수정'}</em></button><button aria-label={'방송 '+(i+1)+' 배분에서 제외'} className="text-button" onClick={()=>setRows(old=>old.filter(x=>x.key!==r.key))}>제외</button></header>{expanded===r.key&&<div className="allocation-card-fields"><div className="allocation-key-fields"><Field label="연결할 홈쇼핑 방송"><select className="form-control" value={r.broadcastId} onChange={e=>put(r.key,'broadcastId',e.target.value)}><option value="">방송 선택</option>{items.filter(b=>b.id===r.broadcastId||!rows.some(a=>a.broadcastId===b.id)).map(b=><option key={b.id} value={b.id}>{b.date} {b.time} · {b.channel} {b.item}</option>)}</select></Field><Input label="배분금액 · 부가세 별도 (원)" type="number" value={r.net} onChange={v=>put(r.key,'net',v)}/><Input label="비용 귀속월" type="month" value={r.month} onChange={v=>put(r.key,'month',v)}/></div><PplAiringSelector contract={c} value={r.airing} onChange={airing=>setRows(old=>old.map(x=>x.key===r.key?{...x,airing}:x))}/></div>}</section>})}</div>
 <div className="finance-actions"><button className="secondary-button" disabled={rows.length>=50||busy} onClick={()=>{const row=blank();setRows(old=>[...old,row]);setExpanded(row.key)}}>+ 홈쇼핑 방송 연결</button><button className="text-button" disabled={busy||!rows.length||rows.some(r=>!r.broadcastId)} onClick={()=>{const base=Math.floor(amount(c.net)/rows.length);setRows(old=>old.map((r,i)=>({...r,net:String(i===old.length-1?amount(c.net)-base*(old.length-1):base)})))}}>선택 방송에 균등 배분</button></div>
 <p className="result-note">부가세는 자동 배분됩니다. 방송결과에는 부가세를 제외한 배분금액이 반영됩니다.</p>
 <div className="finance-save-feedback" ref={feedback} tabIndex={-1} role={attempted&&issues.length?'alert':'status'}>{issues.length&&<><strong>배분 저장 전 확인할 항목</strong><ul>{issues.map(issue=><li key={issue}>{issue}</li>)}</ul></>}</div><div className="allocation-savebar"><output>{remaining<0?'계약금액을 초과했습니다.':remaining===0?'계약금액 전액 배분':'남은 금액 '+won(remaining)}{issues.length?' · 위 확인 항목을 입력하세요.':''}</output><button className="primary-button" disabled={busy} onClick={()=>{setAttempted(true);if(issues.length){feedback.current?.focus();return;}void save({kind:'allocations',data:{contractId:c.id,rows:rows.map(({id,broadcastId,month,net,airing})=>({id,broadcastId,month,net,airing}))}});}}>{rows.length?rows.length+'개 방송 일정·배분 저장':'전체 배분 해제 저장'}</button></div></>;
}
