'use client';
import {useLayoutEffect,useRef} from 'react';
export function Field({label,children,hint}:{label:string;children:React.ReactNode;hint?:string}){return <label className="input-field"><span className="field-label">{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
export function NumberInput({value,onChange,signed=false,integer=false,placeholder='미입력'}:{value:string;onChange:(v:string)=>void;signed?:boolean;integer?:boolean;placeholder?:string}){
 const ref=useRef<HTMLInputElement>(null),caret=useRef<number|null>(null);
 const [whole,...fraction]=value.split('.');const display=whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction.length?'.'+fraction.join(''):'');
 useLayoutEffect(()=>{if(caret.current===null||!ref.current)return;let count=0,pos=0;while(pos<display.length&&count<caret.current){if(display[pos]!==',')count++;pos++;}ref.current.setSelectionRange(pos,pos);caret.current=null;},[display]);
 return <input ref={ref} className="form-control numeric-input" type="text" inputMode={integer?'numeric':'decimal'} placeholder={placeholder} value={display} onChange={e=>{const raw=e.target.value.replace(/,/g,'');const pattern=integer?(signed?/^-?\d*$/:/^\d*$/):(signed?/^-?\d*(\.\d*)?$/:/^\d*(\.\d*)?$/);if(pattern.test(raw)){caret.current=e.target.value.slice(0,e.target.selectionStart??0).replace(/,/g,'').length;onChange(raw)}}}/>;
}
export function Value({label,value}:{label:string;value:string}){return <div className="result-value"><span>{label}</span><strong>{value}</strong></div>}
export function Section({title,note}:{title:string;note?:string}){return <div className="form-section-heading"><h3>{title}</h3>{note&&<p>{note}</p>}</div>}
export const show=(value:number|null,unit='')=>value===null?'입력·기준 확인 필요':value.toLocaleString('ko-KR',{maximumFractionDigits:2})+unit;
