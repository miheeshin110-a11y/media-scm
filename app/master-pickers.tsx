'use client';
import {useState} from 'react';
import type {Finance} from '@/lib/finance-model';
import type {Item} from '@/lib/scm-model';
import type {FinanceSave} from './finance-entry';
import {partyChoices,displayBusinessNo,dionBusinessNo,ownBusinessNo,type Party} from '@/lib/counterparties';
import {programChoices} from '@/lib/program-choices';

const NEW='__register_new__';
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="input-field"><span className="field-label">{label}</span>{children}</label>}

export function PartyPicker({finance,value,onChange,save}:{finance:Finance;value:string;onChange:(p:Party)=>void;save:FinanceSave}){
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[businessNo,setBusinessNo]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const choices=partyChoices(finance),selected=choices.find(p=>p.businessNo===value.replace(/[-\s]/g,''));
 const register=async()=>{
  const n=businessNo.replace(/[-\s]/g,''),title=name.trim();
  if(!title){setError('정식 상호를 입력하세요.');return;}
  if(!/^\d{10}$/.test(n)){setError('사업자등록번호는 숫자 10자리로 입력하세요.');return;}
  if(n===ownBusinessNo){setError('데이즈온은 자사입니다. 계약 거래처를 등록하세요.');return;}
  if(choices.some(p=>p.businessNo===n)){setError('이미 등록된 사업자등록번호입니다. 목록에서 기존 거래처를 선택하세요.');return;}
  setPending(true);setError('');
  try{const result=await save({kind:'party',data:{name:title,businessNo:n}});const created=result&&partyChoices(result).find(p=>p.businessNo===n);if(created){onChange(created);setOpen(false);setName('');setBusinessNo('');}else setError('거래처를 저장하지 못했습니다. 화면의 오류 안내를 확인한 뒤 다시 시도하세요.');}
  finally{setPending(false);}
 };
 return <><Field label="계약 거래처 선택"><select className="form-control" disabled={pending} value={open?NEW:selected?.id||''} onChange={e=>{setError('');if(e.target.value===NEW){setOpen(true);return;}setOpen(false);const p=choices.find(x=>x.id===e.target.value);if(p)onChange(p)}}><option value="" disabled>거래처를 선택하세요</option>{choices.map(p=><option value={p.id} key={p.id}>{p.name}{p.businessNo===dionBusinessNo?' · 인하우스 경유사':''}</option>)}<option value={NEW}>＋ 신규 거래처 등록</option></select></Field>
 <Field label="사업자등록번호 · 자동 입력"><input className="form-control" readOnly value={open?'':displayBusinessNo(selected?.businessNo||'')} placeholder={open?'신규 거래처 등록 후 표시':'거래처 선택 시 표시'}/></Field>
 {open&&<section className="master-register" aria-label="신규 거래처 등록"><h4>신규 거래처 등록</h4><p className="result-note">세금계산서에 기재된 정식 상호와 사업자등록번호를 입력하세요. 저장하면 공통 거래처 목록에 추가되고 바로 선택됩니다.</p><div className="result-grid"><Field label="정식 상호"><input autoFocus className="form-control" value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="신규 거래처 사업자등록번호"><input className="form-control" inputMode="numeric" placeholder="000-00-00000" value={businessNo} onChange={e=>setBusinessNo(e.target.value)}/></Field></div>{error&&<p role="alert">{error}</p>}<div className="finance-actions"><button type="button" className="primary-button" disabled={pending} onClick={register}>{pending?'등록 중…':'거래처 등록 후 선택'}</button><button type="button" className="secondary-button" disabled={pending} onClick={()=>{setOpen(false);setError('')}}>취소</button></div></section>}</>;
}

export function ProgramPicker({finance,items,channel,value,onChange,save}:{finance:Finance;items:Item[];channel:string;value:string;onChange:(name:string)=>void;save:FinanceSave}){
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const choices=programChoices(finance,items,channel,value);
 const register=async()=>{
  const title=name.trim(),key=(s:string)=>s.normalize('NFKC').replace(/\s/g,'').toLowerCase();
  if(!title){setError('프로그램명을 입력하세요.');return;}
  const existing=choices.find(p=>key(p)===key(title));
  if(existing){onChange(existing);setOpen(false);setError('');return;}
  setPending(true);setError('');
  try{if(await save({kind:'program',data:{channel,name:title}})){onChange(title);setOpen(false);setName('');}else setError('프로그램을 저장하지 못했습니다. 화면의 오류 안내를 확인한 뒤 다시 시도하세요.');}
  finally{setPending(false);}
 };
 return <><Field label="PPL 프로그램명"><select className="form-control" disabled={!channel||pending} value={open?NEW:value} onChange={e=>{setError('');if(e.target.value===NEW){setOpen(true);return;}setOpen(false);onChange(e.target.value)}}><option value="">{!channel?'방송 채널을 먼저 선택하세요':choices.length?'프로그램 선택':'등록된 프로그램 없음'}</option>{choices.map(p=><option key={p}>{p}</option>)}{channel&&<option value={NEW}>＋ 새 프로그램 등록</option>}</select>{channel&&!choices.length&&!open&&<small>{channel}의 프로그램이 아직 등록되지 않았습니다. 목록에서 ‘＋ 새 프로그램 등록’을 선택하세요.</small>}</Field>
 {open&&<section className="master-register" aria-label="신규 PPL 프로그램 등록"><h4>{channel} · 새 프로그램 등록</h4><p className="result-note">프로그램명만 한 번 등록하면 같은 채널의 공통 목록에서 계속 선택할 수 있습니다. 송출 날짜·시간은 다음 단계에서 입력합니다.</p><Field label="새 프로그램명"><input autoFocus className="form-control" value={name} onChange={e=>setName(e.target.value)}/></Field>{error&&<p role="alert">{error}</p>}<div className="finance-actions"><button type="button" className="primary-button" disabled={pending} onClick={register}>{pending?'등록 중…':'프로그램 등록 후 선택'}</button><button type="button" className="secondary-button" disabled={pending} onClick={()=>{setOpen(false);setError('')}}>취소</button></div></section>}</>;
}
