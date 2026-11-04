'use client';
import {useState} from 'react';
import {appendCostHistory,costItems,type CostKind} from '@/lib/cost-history';
import type {Finance,FinanceAction} from '@/lib/finance-model';
import {Field,NumberInput,Section} from './entry-fields';
import {CostHistoryUpload} from './cost-history-upload';

export function CostHistoryWorkspace({finance,save,busy,canManage,reload}:{finance:Finance;save:(action:FinanceAction)=>Promise<Finance|false>;busy:boolean;canManage:boolean;reload:()=>void}){
 const [kind,setKind]=useState<CostKind>('product'),[itemId,setItemId]=useState(''),[name,setName]=useState(''),[unit,setUnit]=useState('박스');
 const [effectiveFrom,setEffectiveFrom]=useState(''),[unitCost,setUnitCost]=useState(''),[query,setQuery]=useState(''),[message,setMessage]=useState('');
 const choices=costItems(finance,kind),selected=choices.find(c=>c.itemId===itemId);
 const rows=(finance.costHistory||[]).filter(r=>r.kind===kind&&(!itemId||r.itemId===itemId)&&r.name.toLocaleLowerCase('ko').includes(query.toLocaleLowerCase('ko'))).sort((a,b)=>a.name.localeCompare(b.name,'ko')||b.effectiveFrom.localeCompare(a.effectiveFrom));
 const register=async()=>{
  const data={kind,itemId,name:selected?.name||name,unit:selected?.unit||unit,effectiveFrom,unitCost};
  try{appendCostHistory(finance,data,new Date().toISOString(),()=>crypto.randomUUID());}
  catch(error){setMessage(error instanceof Error?error.message:'입력 내용을 확인해 주세요.');return;}
  const next=await save({kind:'costHistory',data});
  if(next){const added=next.costHistory?.at(-1);if(added)setItemId(added.itemId);setUnitCost('');setEffectiveFrom('');setMessage('원가 이력을 등록했습니다. 기존 방송의 원가·이익은 그대로 유지됩니다.');}
 };
 return <section className="cost-history-workspace">
  <Section title="상품·사은품 원가 이력" note="원가가 바뀌면 적용 시작일을 지정해 새 이력을 추가하세요. 기존 이력은 덮어쓰지 않으며 과거 방송의 원가·이익은 자동으로 바뀌지 않습니다."/>
  <CostHistoryUpload finance={finance} save={save} busy={busy} canManage={canManage}/>
  <div className="cost-kind-tabs" role="tablist" aria-label="원가 구분">
   {(['product','gift'] as const).map(k=><button type="button" role="tab" key={k} aria-selected={kind===k} className={kind===k?'primary-button':'secondary-button'} onClick={()=>{setKind(k);setItemId('');setName('');setMessage('')}}>{k==='product'?'상품 원가':'사은품 원가'}</button>)}
   <button type="button" className="text-button" disabled={busy} onClick={reload}>최신 이력 불러오기</button>
  </div>
  <form className="sale-card" onSubmit={e=>{e.preventDefault();void register()}}>
   <h3>원가 이력 추가</h3>
   {!canManage&&<p className="result-note">등록은 팀장 권한이 필요합니다. 원가 이력은 조회할 수 있습니다.</p>}
   <fieldset disabled={busy||!canManage} className="cost-history-form"><div className="result-grid">
    <Field label="원가 품목"><select className="form-control" value={itemId} onChange={e=>{setItemId(e.target.value);setMessage('')}}><option value="">＋ 새 품목 등록</option>{choices.map(c=><option key={c.itemId} value={c.itemId}>{c.name} · {c.unit}</option>)}</select></Field>
    <Field label="품목명"><input className="form-control" required maxLength={120} value={selected?.name||name} readOnly={Boolean(selected)} onChange={e=>setName(e.target.value)}/></Field>
    <Field label="단위" hint="방송의 세트당 수량과 같은 단위를 사용하세요."><input className="form-control" required maxLength={20} value={selected?.unit||unit} readOnly={Boolean(selected)} onChange={e=>setUnit(e.target.value)} placeholder="박스, 개, 병 등"/></Field>
    <Field label="적용 시작일"><input className="form-control" type="date" required value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)}/></Field>
    <Field label="단위원가 (원, VAT 제외)" hint="0원도 등록할 수 있습니다. 소수 둘째 자리까지 입력하세요."><NumberInput value={unitCost} onChange={setUnitCost}/></Field>
   </div><button type="submit" className="primary-button">{busy?'저장 중…':'원가 이력 추가'}</button></fieldset>
   {message&&<p role="status" className="result-note">{message}</p>}
  </form>
  <Field label="이력 검색"><input className="form-control" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="품목명으로 검색"/></Field>
  <div className="cost-history-table"><table><caption>{kind==='product'?'상품':'사은품'} 원가 이력 · {rows.length}건</caption><thead><tr><th scope="col">품목명</th><th scope="col">단위</th><th scope="col">적용 시작일</th><th scope="col">단위원가 · VAT 제외</th></tr></thead><tbody>{rows.length?rows.map(r=><tr key={r.id}><td>{r.name}</td><td>1{r.unit}</td><td>{r.effectiveFrom}</td><td>{Number(r.unitCost).toLocaleString('ko-KR')}원</td></tr>):<tr><td colSpan={4}>등록된 원가 이력이 없습니다.</td></tr>}</tbody></table></div>
 </section>;
}
