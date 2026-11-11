'use client';
import {useMemo,useState} from 'react';
import type {Item} from '@/lib/scm-model';
import type {Logistics} from '@/lib/logistics';
import {logisticsExport} from '@/lib/logistics-export';
import {Field} from './entry-fields';
export function LogisticsQuantityExport({items,logistics,busy}:{items:Item[];logistics:Logistics;busy:boolean}){
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[selected,setSelected]=useState(''),[downloading,setDownloading]=useState(false),[error,setError]=useState('');
 const filtered=useMemo(()=>items.filter(b=>(!from||b.date>=from)&&(!to||Boolean(b.date)&&b.date<=to)),[items,from,to]);
 const chosen=useMemo(()=>selected?filtered.filter(b=>b.id===selected):filtered,[filtered,selected]);
 const output=useMemo(()=>logisticsExport(chosen,logistics),[chosen,logistics]);
 const download=async()=>{setDownloading(true);setError('');try{
  const {logisticsExportBytes}=await import('@/lib/logistics-export-file'),bytes=logisticsExportBytes(chosen,logistics),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download='물류팀_방송준비_예상출고_'+new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch{setError('엑셀을 만들지 못했습니다. 방송·구성수량을 확인한 뒤 다시 시도해 주세요.');}finally{setDownloading(false);}};
 return <section className="sale-card" aria-label="물류팀 전달 엑셀"><h3>물류팀에 방송 준비수량 전달</h3><p>본품·사은품별 준비수량과 예상출고수량을 한 엑셀로 내려받아 기존 재고관리 파일에서 계산하세요. 다운로드는 방송·원가·이익·재고를 변경하지 않습니다.</p><div className="result-grid"><Field label="방송일 시작"><input className="form-control" type="date" value={from} onChange={e=>{setFrom(e.target.value);setSelected('');}}/></Field><Field label="방송일 끝"><input className="form-control" type="date" value={to} onChange={e=>{setTo(e.target.value);setSelected('');}}/></Field><Field label="전달할 방송"><select className="form-control" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">기간 내 전체 방송 ({filtered.length}건)</option>{filtered.map(b=><option key={b.id} value={b.id}>{b.date||'일정 미정'} {b.time} · {b.channel} {b.item}</option>)}</select></Field></div><p>선택 {chosen.length}건 · 수량 산출 {output.broadcastCount}건 · 본품·사은품 {output.rows.length}행 · 확인·제외 {output.issues.length}건</p>{output.issues.length>0&&<p>미확인 수량은 0으로 바꾸지 않습니다. 유기농 홍화씨·취소·일정 미확정은 수량에서 제외하고 「확인 필요」 시트에 표시합니다.</p>}{(from||to)&&<p>기간을 설정하면 방송일이 없는 방송은 제외됩니다. 기간을 비우면 일정 미정 방송도 확인 목록에 포함됩니다.</p>}{from&&to&&from>to&&<p role="alert">종료일을 시작일 이후로 선택하세요.</p>}<button className="primary-button" disabled={busy||downloading||!chosen.length||Boolean(from&&to&&from>to)} onClick={()=>void download()}>{downloading?'엑셀 만드는 중…':'물류팀 전달 엑셀 다운로드'}</button>{error&&<p role="alert">{error}</p>}</section>;
}
