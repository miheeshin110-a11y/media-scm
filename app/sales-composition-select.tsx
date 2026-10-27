'use client';
import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import type {Finance,FinanceAction} from '@/lib/finance-model';
import {compositionKey,salesCompositionChoices,type SalesComposition} from '@/lib/sales-compositions';
import {Field} from './entry-fields';

type Props={value:string;name?:string;finance:Finance;save:(action:FinanceAction)=>Promise<Finance|false>;onSelect:(value:SalesComposition)=>void};
export function SalesCompositionSelect({value,name,finance,save,onSelect}:Props){
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const options=salesCompositionChoices(finance),existing=options.find(x=>compositionKey(x.name)===compositionKey(draft));
 const close=()=>{if(!busy){setOpen(false);setDraft('');setError('')}};
 const register=async()=>{
  if(busy)return;
  if(existing){onSelect(existing);close();return;}
  if(!draft.trim()){setError('상품명과 구성 수량을 입력해 주세요.');return;}
  setBusy(true);setError('');
  try{
   const next=await save({kind:'salesComposition',data:{name:draft}});
   if(!next){setError('등록하지 못했습니다. 화면의 저장 안내를 확인한 후 다시 시도해 주세요.');return;}
   const saved=salesCompositionChoices(next).find(x=>compositionKey(x.name)===compositionKey(draft));
   if(saved){onSelect(saved);setOpen(false);setDraft('');}
  }catch{setError('등록하지 못했습니다. 입력값은 유지됩니다. 다시 시도해 주세요.');}
  finally{setBusy(false);}
 };
 return <><Field label="판매 구성" hint="상품명·수량·사은품을 확인하고 선택하세요."><select className="form-control" value={value} onChange={e=>{
  if(e.target.value==='__new__'){setOpen(true);setError('');return;}
  onSelect(options.find(x=>x.code===e.target.value)||{code:'',name:''});
 }}><option value="">판매 구성을 선택하세요</option><option value="__new__">＋ 신규 판매 구성 등록</option>{value&&!options.some(x=>x.code===value)&&<option value={value}>{name||'기존 저장 구성 · 목록 확인 필요'}</option>}{options.map(x=><option key={x.code} value={x.code}>{x.name}</option>)}</select></Field>
 <Dialog open={open} onOpenChange={next=>{if(!next)close()}}><DialogContent showCloseButton={!busy} className="sales-composition-dialog"><DialogTitle>신규 판매 구성 등록</DialogTitle><DialogDescription>상품명·수량을 입력하고, 사은품이 있으면 함께 적어 주세요. 등록한 구성은 모든 방송에서 선택할 수 있습니다.</DialogDescription>
 <Field label="판매 구성명"><input autoFocus className="form-control" value={draft} maxLength={120} disabled={busy} placeholder="예: 파라다이스 그레인 버닝 9박스+젤리2" onChange={e=>{setDraft(e.target.value);setError('')}} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();void register()}}}/></Field>
 {existing&&<p role="status">이미 등록된 구성입니다: <strong>{existing.name}</strong><br/>기존 구성을 바로 선택할 수 있습니다.</p>}{error&&<p role="alert">{error}</p>}
 <div className="sales-composition-actions"><button type="button" className="secondary-button" disabled={busy} onClick={close}>취소</button><button type="button" className="primary-button" disabled={busy||!draft.trim()} onClick={()=>void register()}>{busy?'등록 중…':existing?'기존 구성 선택':'등록하고 선택'}</button></div>
 </DialogContent></Dialog></>;
}
