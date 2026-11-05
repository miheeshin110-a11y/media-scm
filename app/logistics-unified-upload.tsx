'use client';
import {useMemo,useState} from 'react';
import type {Finance} from '@/lib/finance-model';
import {applyLogisticsWorkbook,type SimpleLogisticsWorkbook} from '@/lib/logistics-workbook';

export function LogisticsUnifiedUpload({finance,busy,submit}:{finance:Finance;busy:boolean;submit:(data:Record<string,unknown>)=>Promise<boolean>}){
 const [data,setData]=useState<SimpleLogisticsWorkbook|null>(null),[source,setSource]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false),[confirmed,setConfirmed]=useState(false);
 const validation=useMemo(()=>{
  if(!data)return '';
  try{let seq=0;applyLogisticsWorkbook(finance,data,[],'미리보기',new Date().toISOString(),()=>`preview-${++seq}`);return '';}
  catch(e){return e instanceof Error?e.message:'입력 내용을 확인하세요.';}
 },[data,finance]);
 const select=async(file:File|undefined)=>{
  if(!file)return;setData(null);setError('');setConfirmed(false);setLoading(true);
  try{
   if(!/\.xlsx$/i.test(file.name)||file.size>5*1024*1024)throw new Error('5MB 이하의 통합 XLSX 파일을 선택하세요.');
   const {readSimpleLogisticsWorkbook}=await import('@/lib/logistics-workbook-file');
   setData(readSimpleLogisticsWorkbook(await file.arrayBuffer()));setSource(file.name);
  }catch(e){setError(e instanceof Error?e.message:'파일을 확인하세요.');}finally{setLoading(false);}
 };
 return <div className="sale-card"><h3>엑셀 한 파일로 구성·재고 등록</h3><p>① 상품구성 시트: 판매구성명과 본품·사은품 수량을 작성합니다. ② 재고 시트: 창고와 기준시각, 품목별 재고를 작성합니다. 상품코드는 기존 품목명으로 연결하고 새 품목은 자동 등록합니다.</p>
  <div className="finance-actions"><a className="secondary-button" href="/templates/logistics-unified.xlsx" download="물류_구성재고_통합양식.xlsx">통합 엑셀양식 다운로드</a><label className="secondary-button tax-file">{loading?'확인 중…':'작성한 엑셀 한 파일 선택'}<input type="file" accept=".xlsx" disabled={busy||loading} onChange={e=>{void select(e.target.files?.[0]);e.target.value='';}}/></label></div>
  {(error||validation)&&<p role="alert">{error||validation}</p>}
  {data&&<><p>{source} · 상품구성 {data.compositions.length}행 · {data.inventory?`${data.inventory.warehouse} 재고 ${data.inventory.lines.length}품목 · ${data.inventory.asOf.replace('T',' ')} 기준`:'재고 미입력: 상품구성만 등록합니다.'}</p>
   {data.compositions.length>0&&<div className="logistics-table"><table><thead><tr>{['판매구성','본품','수량(EA)','사은품','수량(EA)'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{data.compositions.slice(0,30).map((r,i)=><tr key={i}><td>{r.sale}</td><td>{r.product}</td><td>{r.quantity}</td><td>{r.gift}</td><td>{r.giftQuantity}</td></tr>)}</tbody></table></div>}
   {data.inventory&&<><p>{data.inventory.basis==='before-plans'?'이번 계획 예약 차감 전 가용재고':'이번 계획 예약 차감 후 가용재고'} · 아래 재고가 해당 창고의 최신 재고 전체를 대체합니다.</p><div className="logistics-table"><table><thead><tr><th>품목명</th><th>가용재고(EA)</th><th>예약차감수량(EA)</th></tr></thead><tbody>{data.inventory.lines.slice(0,30).map((r,i)=><tr key={i}><td>{r.name}</td><td>{r.available}</td><td>{r.reserved}</td></tr>)}</tbody></table></div></>}
   <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> 본품·사은품 전체 구성{data.inventory?'과 이 창고의 전체 재고':''}를 확인했습니다.</label><p>등록된 구성은 새 버전으로 보관됩니다. 기존 방송 원가·이익과 이미 전달된 준비요청 수량은 유지됩니다.</p>
   <button className="primary-button" disabled={busy||loading||Boolean(validation)||!confirmed} onClick={async()=>{if(await submit({op:'workbook',workbook:data})){setData(null);setConfirmed(false);}}}>구성·재고 한 번에 등록</button>
  </>}
 </div>;
}
