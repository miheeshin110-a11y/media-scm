'use client';
import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {giftItemChoices,giftNameKey} from '@/lib/gift-items';
import {canonicalCostItem} from '@/lib/cost-item-catalog';
import type {Finance,FinanceAction} from '@/lib/finance-model';
import type {Item} from '@/lib/scm-model';
import {Field} from './entry-fields';

export function GiftItemSelect({value,finance,items,save,onSelect,disabled=false}:{value:string;finance:Finance;items:Item[];save:(action:FinanceAction)=>Promise<Finance|false>;onSelect:(name:string)=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const options=giftItemChoices(finance,items),canonical=canonicalCostItem(draft,'gift')||draft;
 const existing=options.find(name=>giftNameKey(name)===giftNameKey(canonical));
 const close=()=>{if(!busy){setOpen(false);setDraft('');setError('')}};
 const register=async()=>{
  if(busy||disabled)return;
  if(existing){onSelect(existing);close();return;}
  if(!draft.trim()){setError('사은품명을 입력해 주세요.');return;}
  setBusy(true);setError('');
  try{
   const next=await save({kind:'giftItem',data:{name:draft}});
   if(!next){setError('등록하지 못했습니다. 입력값을 유지했으니 저장 안내를 확인해 주세요.');return;}
   const saved=giftItemChoices(next).find(name=>giftNameKey(name)===giftNameKey(draft));
   if(saved){onSelect(saved);setOpen(false);setDraft('');}
   else setError('등록 내역을 확인하지 못했습니다. 최신 자료를 불러온 뒤 다시 선택해 주세요.');
  }catch{setError('등록하지 못했습니다. 입력값을 유지했으니 다시 시도해 주세요.');}
  finally{setBusy(false);}
 };
 return <>
  <Field label="사은품 아이템" hint={disabled?'원가 이력 품목을 사용 중입니다. 변경하려면 먼저 직접 입력 원가로 전환하세요.':undefined}><select className="form-control" value={value} disabled={disabled||busy} onChange={e=>{if(e.target.value==='__new__'){setOpen(true);setError('');}else onSelect(e.target.value)}}><option value="">선택</option><option value="__new__">＋ 신규 사은품 등록</option>{value&&!options.includes(value)&&<option value={value}>{value} · 기존 저장명</option>}{options.map(name=><option key={name}>{name}</option>)}</select></Field>
  <Dialog open={open} onOpenChange={next=>{if(!next)close()}}><DialogContent showCloseButton={!busy} className="sales-composition-dialog"><DialogTitle>신규 사은품 등록</DialogTitle><DialogDescription>등록한 사은품은 다른 방송에서도 선택할 수 있습니다. 단위원가는 별도로 입력하거나 원가 이력에서 적용해 주세요.</DialogDescription>
   <Field label="사은품명"><input autoFocus className="form-control" maxLength={120} value={draft} disabled={busy} placeholder="예: 신규 증정품 이름" onChange={e=>{setDraft(e.target.value);setError('')}} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();void register()}}}/></Field>
   {existing&&<p role="status">이미 등록된 이름입니다. 기존 사은품 ‘{existing}’을 선택합니다.</p>}{error&&<p role="alert">{error}</p>}
   <div className="sales-composition-actions"><button type="button" className="secondary-button" disabled={busy} onClick={close}>취소</button><button type="button" className="primary-button" disabled={busy||!draft.trim()} onClick={()=>void register()}>{busy?'등록 중…':existing?'기존 사은품 선택':'등록하고 선택'}</button></div>
  </DialogContent></Dialog>
 </>;
}
