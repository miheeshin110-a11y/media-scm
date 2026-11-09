'use client';
import {useMemo,useState} from 'react';
import type {Finance} from '@/lib/finance-model';
import {reviewSetContents,type SetContentsInput} from '@/lib/set-contents';
export function SetContentsUpload({finance,busy,submit}:{finance:Finance;busy:boolean;submit:(d:Record<string,unknown>)=>Promise<boolean>}){
 const [rows,setRows]=useState<SetContentsInput[]>([]),[selected,setSelected]=useState<string[]>([]),[date,setDate]=useState(''),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const groups=useMemo(()=>{try{return rows.length?reviewSetContents(finance,rows):[];}catch{return [];}},[rows,finance]);
 return <div className="sale-card"><h3>세트 안의 상품·사은품 수량 연결</h3><p>물류팀이 확인한 단품명·구분·수량·단위가 모두 채워진 세트부터 연결합니다. 예상출고 세트수에 구성수량을 곱해 표시하며, 완제품 재고와 단품을 중복 차감하지 않습니다.</p>
 <p>물류팀에 전달한 「세트구성수량」 엑셀 파일을 작성해 선택하세요. 미확인 세트는 선택할 수 없습니다.</p>
 <label className="secondary-button tax-file">작성한 구성수량 파일 선택<input type="file" accept=".xlsx" disabled={busy||loading} onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;setRows([]);setSelected([]);setConfirmed(false);setError('');setLoading(true);try{if(!/\.xlsx$/i.test(f.name)||f.size>5*1024*1024)throw new Error('5MB 이하 XLSX 파일을 선택하세요.');const {readSetContentsFile}=await import('@/lib/set-contents-file');const r=readSetContentsFile(await f.arrayBuffer());reviewSetContents(finance,r);setRows(r);}catch(e){setError(e instanceof Error?e.message:'입력파일을 확인하세요.');}finally{setLoading(false);}}}/></label>
 {error&&<p role="alert">{error}</p>}{groups.length>0&&<><p>세트 {groups.length}건 · 연결 가능 {groups.filter(g=>!g.issues.length).length}건</p><div className="logistics-table"><table><thead><tr><th>선택</th><th>세트</th><th>구성</th><th>확인사항</th></tr></thead><tbody>{groups.map(g=><tr key={g.code}><td><input aria-label={g.name+' 구성수량 연결'} type="checkbox" disabled={busy||Boolean(g.issues.length)} checked={selected.includes(g.code)} onChange={e=>{setConfirmed(false);setSelected(old=>e.target.checked?[...old,g.code]:old.filter(c=>c!==g.code));}}/></td><td>{g.code} · {g.name}</td><td>{g.lines.map(r=>`${r.sku} ${r.role||'구분 미입력'} × ${r.quantity||'?'}${r.unit}`).join(' / ')}</td><td>{g.issues.join(' · ')||'확인 완료 · 등록 전'}</td></tr>)}</tbody></table></div>
 <label>구성수량 적용 시작 방송일<input className="form-control" type="date" disabled={busy} value={date} onChange={e=>{setConfirmed(false);setDate(e.target.value);}}/></label><label><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>선택한 세트의 본품·사은품 전체를 빠짐없이 입력했고 수량·단위를 확인했습니다.</label>
 <button className="primary-button" disabled={busy||!date||!confirmed||!selected.length||selected.some(code=>!groups.some(g=>g.code===code&&!g.issues.length))} onClick={async()=>{if(await submit({op:'setContents',rows,selectedCodes:selected,effectiveFrom:date,confirmComplete:true})){setRows([]);setSelected([]);setConfirmed(false);}}}>확인된 {selected.length}개 세트 구성수량 연결</button></>}
 {(finance.logistics?.setContents||[]).length>0&&<p>등록된 구성수량 이력 {(finance.logistics?.setContents||[]).length}건 · 방송일에 유효한 최신 구성을 적용합니다.</p>}
 </div>;
}
