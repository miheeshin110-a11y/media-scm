'use client';

const hours=Array.from({length:24},(_,i)=>String(i).padStart(2,'0'));
const minutes=Array.from({length:60},(_,i)=>String(i).padStart(2,'0'));

// Native time inputs can render midnight as 오전 12시 depending on the browser.
// Keep the saved HH:mm value, but make the selectable 24-hour clock explicit.
export function TimeInput({value,onChange,label}:{value:string;onChange:(time:string)=>void;label:string}){
 const [hour='',minute='']=value.split(':');
 return <span className="time-input" role="group" aria-label={label+' · 24시간'}>
  <select className="form-control" aria-label={label+' 시'} value={hour} onChange={e=>onChange(e.target.value?e.target.value+':'+(minute||'00'):'')}>
   <option value="">시간 미정</option>
   {hours.map(h=><option key={h} value={h}>{h}시{h==='00'?' (자정)':h==='12'?' (정오)':''}</option>)}
  </select>
  <span aria-hidden="true">:</span>
  <select className="form-control" aria-label={label+' 분'} value={minute} onChange={e=>onChange(e.target.value?(hour||'00')+':'+e.target.value:'')}>
   <option value="">분 선택</option>
   {minutes.map(m=><option key={m} value={m}>{m}분</option>)}
  </select>
 </span>;
}
