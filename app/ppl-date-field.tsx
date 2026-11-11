'use client';

import {useState} from 'react';
import {format,isValid,parseISO} from 'date-fns';
import {ko} from 'date-fns/locale';
import {CalendarDays} from 'lucide-react';
import {Calendar} from '@/components/ui/calendar';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';

export function PplDateField({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){
 const [open,setOpen]=useState(false);
 const date=parseISO(value);
 const selected=isValid(date)?date:undefined;

 function choose(day:Date|undefined){
  onChange(day?format(day,'yyyy-MM-dd'):'');
  setOpen(false);
 }

 return <div className="input-field">
  <span className="field-label">{label}</span>
  <Popover open={open} onOpenChange={setOpen}>
   <PopoverTrigger type="button" className="form-control ppl-date-trigger" aria-label={label+' · '+(value||'날짜 선택')}>
    <span>{value||'날짜 선택'}</span><CalendarDays size={18} aria-hidden="true"/>
   </PopoverTrigger>
   <PopoverContent align="start" className="ppl-date-popover w-auto max-w-[calc(100vw-24px)]" aria-label={label+' 달력'}>
    <Calendar mode="single" required locale={ko} selected={selected} defaultMonth={selected} onSelect={choose} showOutsideDays={false}/>
    {value&&<button type="button" className="text-button" onClick={()=>choose(undefined)}>날짜 지우기</button>}
   </PopoverContent>
  </Popover>
 </div>;
}
