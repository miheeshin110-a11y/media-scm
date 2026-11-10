'use client';
import {useId,useState} from 'react';
import type {Logistics} from '@/lib/logistics';
import type {EcountSetup} from '@/lib/ecount-setup';
import type {EcountPreview} from '@/lib/ecount-cache';
type Preview=Omit<EcountPreview,'catalogKey'>;
export function EcountInventory({logistics,busy,readOnly,refresh}:{logistics:Logistics;busy:boolean;readOnly:boolean;refresh:()=>void}){
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[setup,setSetup]=useState<EcountSetup|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [warehouse,setWarehouse]=useState('200'),[preview,setPreview]=useState<Preview|null>(null),[version,setVersion]=useState(0),[cached,setCached]=useState(false),[units,setUnits]=useState(false),[stock,setStock]=useState(false);
 const panelId=useId(),latest=logistics.snapshots.filter(s=>s.source.startsWith('이카운트 API')).at(-1);
 const call=async(body:Record<string,unknown>)=>{
  const response=await fetch('/api/ecount/inventory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();
  if(!response.ok)throw new Error(data.error||'재고 처리에 실패했습니다. 기존 자료를 확인해 주세요.');return data;
 };
 const load=async(code:string)=>{
  setPreview(null);setUnits(false);setStock(false);
  const data=await call({op:'preview',warehouseCode:code});setPreview(data.preview);setVersion(data.financeVersion);setCached(data.cached);
 };
 const inspect=async()=>{
  setOpen(true);setLoading(true);setError('');setMessage('');setPreview(null);setUnits(false);setStock(false);
  try{
   const response=await fetch('/api/ecount/inventory',{cache:'no-store'});
   if(!response.ok)throw new Error(response.status===401?'로그인이 만료됐습니다. 다시 로그인해 주세요.':'연결 상태를 확인하지 못했습니다. 기존 재고는 유지됩니다.');
   const body=await response.json();if(!body.setup||!Array.isArray(body.setup.checks))throw new Error('연결 상태를 확인하지 못했습니다.');
   const config:EcountSetup=body.setup;setSetup(config);
   if(config.stage==='ready'){
    const selected=config.warehouses.find(w=>w.code===warehouse)||config.warehouses[0];
    if(config.warehouses.length===1){setWarehouse(selected.code);await load(selected.code);}
   }
  }catch(e){setError(e instanceof Error?e.message:'조회에 실패했습니다. 기존 재고는 유지됩니다.');}finally{setLoading(false);}
 };
 const apply=async()=>{
  if(!preview||!units||!stock)return;setLoading(true);setError('');
  try{await call({op:'apply',previewId:preview.id,baseVersion:version,confirmUnits:units,confirmCurrentStock:stock});setMessage(preview.warehouse+' 재고 '+preview.lines.length+'품목을 반영했습니다. 방송 수량·원가·이익은 변경하지 않았습니다.');setPreview(null);setUnits(false);setStock(false);refresh();}
  catch(e){setError(e instanceof Error?e.message:'반영 결과를 확인하지 못했습니다. 새로고침으로 최신 재고를 확인해 주세요.');}finally{setLoading(false);}
 };
 return <section className="sale-card" aria-label="이카운트 재고 연결">
  <div className="finance-actions"><div><h3>방송물량 준비 전, 이카운트 재고 확인</h3><p>샌드부스터(200)의 현재고를 V코드 본품·사은품별로 조회합니다. 방송 수량과 이카운트 전표는 변경하지 않습니다.</p></div><button className="primary-button" disabled={busy||readOnly||loading} aria-expanded={open} aria-controls={panelId} onClick={()=>void inspect()}>{loading?'이카운트 처리 중…':'이카운트 재고 불러오기'}</button></div>
  <p>최근 조회 자료는 10분 동안 공유합니다. 미조회 품목은 0으로 간주하지 않으며 유기농 홍화씨는 제외합니다.</p>
  {latest&&<p>SCM에 반영된 최근 재고: {latest.warehouse} · 조회시각 {latest.asOf.replace('T',' ')} · {latest.source}</p>}
  {message&&<p role="status">{message}</p>}
  {open&&<div id={panelId}>
   {error&&<p role="alert">{error}</p>}
   {setup?.stage==='configuration-required'&&<><h4>연결 설정 필요</h4><p>{setup.message}</p><ul>{setup.checks.map(c=><li key={c.label}>{c.label}: {c.configured?'등록됨':'미설정 또는 형식 확인 필요'}</li>)}</ul><p>기존 Vercel 프로젝트에 서버 설정을 등록하세요. 인증키는 채팅·엑셀에 적지 마세요. ZONE은 자동 조회합니다.</p></>}
   {setup?.stage==='ready'&&setup.warehouses.length>1&&<div className="finance-actions"><select aria-label="이카운트 조회 창고" className="form-control" value={warehouse} disabled={loading} onChange={e=>{setWarehouse(e.target.value);setPreview(null);setUnits(false);setStock(false);}}>{setup.warehouses.map(w=><option key={w.code} value={w.code}>{w.name} ({w.code})</option>)}</select><button disabled={busy||readOnly||loading} className="secondary-button" onClick={async()=>{setLoading(true);setError('');try{await load(warehouse);}catch(e){setError(e instanceof Error?e.message:'조회 실패');}finally{setLoading(false);}}}>선택 창고 조회</button></div>}
   {preview&&<><h4>{preview.warehouse} ({preview.warehouseCode}) · 재고 반영 전 확인</h4><p>조회 기준일 {preview.baseDate} · 조회시각 {new Date(preview.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}{cached?' · 저장된 조회 결과':''}</p><p>다음 새 조회 가능 시각: {new Date(Date.parse(preview.fetchedAt)+600000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p><p>현재 보유수량 기준입니다. 예약·출고대기를 별도로 차감하지 않습니다. 수량은 이카운트에 등록된 단위이며 아래 SCM 구성수량 단위와 같은지 확인하세요.</p>
    <div className="logistics-table"><table><thead><tr><th>V코드</th><th>품목명</th><th>현재고</th><th>SCM 수량 단위</th></tr></thead><tbody>{preview.lines.map(r=><tr key={r.sku}><td>{r.sku}</td><td>{r.name}</td><td>{r.available.toLocaleString('ko-KR')}</td><td>{r.unit}</td></tr>)}</tbody></table></div>
    {preview.missing.length>0&&<p role="status">미확인 {preview.missing.length}품목: {preview.missing.join(', ')}. 반영 시 이 품목들은 재고 미확인으로 표시됩니다.</p>}
    {preview.issues.map(issue=><p key={issue} role="alert">{issue}</p>)}
    <p>반영하면 이 창고의 이전 SCM 재고를 이번 조회 자료로 교체합니다. 입고예정을 중복 계산하지 않도록 이미 입고된 예정 잔량도 확인하세요.</p>
    <fieldset disabled={loading||busy||readOnly}><label><input type="checkbox" checked={units} onChange={e=>setUnits(e.target.checked)}/>이카운트와 SCM의 품목별 수량 단위가 같음을 확인했습니다.</label><label><input type="checkbox" checked={stock} onChange={e=>setStock(e.target.checked)}/>현재고 기준과 조회 품목·미확인 품목을 확인했습니다.</label><button className="primary-button" disabled={!units||!stock||!preview.lines.length} onClick={()=>void apply()}>확인한 재고만 SCM에 반영</button></fieldset>
   </>}
   <button className="text-button" disabled={loading} onClick={()=>setOpen(false)}>닫기</button>
  </div>}
 </section>;
}
