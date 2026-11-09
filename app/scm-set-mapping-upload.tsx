'use client';
import {useMemo,useState} from 'react';
import type {Finance} from '@/lib/finance-model';
import {reviewSetMappings,type ScmSetMappingRow} from '@/lib/scm-set-mapping';

export function ScmSetMappingUpload({finance,busy,submit}:{finance:Finance;busy:boolean;submit:(data:Record<string,unknown>)=>Promise<boolean>}){
 const [rows,setRows]=useState<ScmSetMappingRow[]>([]),[selected,setSelected]=useState<string[]>([]),[effectiveFrom,setEffectiveFrom]=useState(''),[confirmed,setConfirmed]=useState(false),[source,setSource]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const review=useMemo(()=>{try{return {rows:rows.length?reviewSetMappings(finance,rows):[],error:''};}catch(e){return {rows:[],error:e instanceof Error?e.message:'자료를 확인하세요.'};}},[rows,finance]);
 const ready=review.rows.filter(r=>!r.issues.length),picked=review.rows.filter(r=>selected.includes(r.configId));
 const select=async(file:File|undefined)=>{
  if(!file)return;setRows([]);setSelected([]);setConfirmed(false);setError('');setLoading(true);
  try{
   if(!/\.xls[mx]$/i.test(file.name)||file.size>5*1024*1024)throw new Error('5MB 이하 XLSX·XLSM 매핑파일을 선택하세요.');
   const {readScmSetMappingFile}=await import('@/lib/scm-set-mapping-file');setRows(readScmSetMappingFile(await file.arrayBuffer()));setSource(file.name);
  }catch(e){setError(e instanceof Error?e.message:'파일을 확인하세요.');}finally{setLoading(false);}
 };
 return <div className="sale-card"><h3>물류팀 SKU 매핑파일 연결</h3><p>완제품 세트 SKU는 주문 1세트당 확인한 세트 수량으로 연결합니다. 출고코드가 다른 판매구성에도 반복되면 배수를 직접 확인해 입력하세요. 포함된 본품·사은품은 다시 차감하지 않습니다. 매크로는 실행하지 않습니다.</p>
  <label className="secondary-button tax-file">{loading?'확인 중…':'SCM SKU 매핑파일 선택'}<input type="file" accept=".xlsx,.xlsm" disabled={busy||loading} onChange={e=>{void select(e.target.files?.[0]);e.target.value='';}}/></label>
  {(error||review.error)&&<p role="alert">{error||review.error}</p>}
  {!!rows.length&&<><p>{source} · 판매구성 {review.rows.length}개 · 연결 후보 {ready.length}개 · 확인 대기 {review.rows.length-ready.length}개</p><p>추가 구성품은 같은 구성 아래 함께 표시합니다. 코드가 여러 개거나 다른 판매구성과 같은 세트 코드를 쓰는 행은 코드·출고배수를 확인해야 선택할 수 있습니다. 유기농의 코드·적용일이 미정이면 선택하지 마세요.</p>
   <div className="logistics-table"><table><thead><tr><th>선택</th><th>판매구성</th><th>완제품 세트 코드</th><th>주문 1세트당 출고 세트수</th><th>추가 입력 코드</th><th>확인사항</th></tr></thead><tbody>{review.rows.map(r=><tr key={r.configId}><td><input aria-label={r.salesName+' 연결'} type="checkbox" disabled={busy||Boolean(r.issues.length)} checked={selected.includes(r.configId)} onChange={e=>setSelected(old=>e.target.checked?[...old,r.configId]:old.filter(id=>id!==r.configId))}/></td><td>{r.salesName}<small>{r.configId} · 원본 {r.sourceRows.join(', ')}행</small></td><td><input aria-label={r.salesName+' 완제품 세트 코드'} className="form-control" value={r.setSku} disabled={busy} onChange={e=>{setConfirmed(false);setRows(old=>old.map(row=>row.configId===r.configId?{...row,setSku:e.target.value,setSkuConfirmed:false}:row));}}/>{r.extraSkus.length>0&&<label><input type="checkbox" disabled={busy} checked={r.setSkuConfirmed===true} onChange={e=>setRows(old=>old.map(row=>row.configId===r.configId?{...row,setSkuConfirmed:e.target.checked}:row))}/>이 코드에 사은품까지 포함 · 추가 코드는 별도 차감하지 않음</label>}</td><td><input aria-label={r.salesName+' 출고 세트수'} className="form-control" type="number" min="1" step="1" placeholder="고유 코드 기본 1" disabled={busy} value={r.setQuantity||''} onChange={e=>{setConfirmed(false);setRows(old=>old.map(row=>row.configId===r.configId?{...row,setQuantity:e.target.value}:row));}}/></td><td>{r.extraSkus.join(' / ')||'없음'}</td><td>{r.issues.join(' · ')||'완제품 '+(r.setQuantity||'1')+'세트 출고 · 등록 전 담당자 확인'}</td></tr>)}</tbody></table></div>
   <label>적용 시작 방송일<input className="form-control" type="date" disabled={busy} value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)}/></label><p>이 날짜 이후 방송부터 적용합니다. 기존 준비요청의 확정수량과 방송 원가·이익은 유지됩니다. 홍화씨 유기농은 적용일이 정해진 뒤 새 코드로 별도 등록하세요.</p>
   <label><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>선택한 코드에 본품·사은품이 모두 포함되어 있고 판매구성별 출고 세트수와 적용일을 확인했습니다.</label>
   <button className="primary-button" disabled={busy||loading||!selected.length||!effectiveFrom||!confirmed||Boolean(review.error)||picked.length!==selected.length||picked.some(r=>r.issues.length)} onClick={async()=>{if(await submit({op:'scmSetMapping',rows,selectedIds:selected,effectiveFrom,confirmSet:true})){setRows([]);setSelected([]);setConfirmed(false);}}}>선택한 {selected.length}개 세트 구성 연결</button>
  </>}
 </div>;
}
