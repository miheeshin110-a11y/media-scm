import type {Item} from '@/lib/scm-model';
import {basicMissing} from '@/lib/broadcast-progress';
import {BroadcastBadges} from './broadcast-picker';
import {AlertCircle,CheckCircle2} from 'lucide-react';
export function BroadcastProgress({item,onBasics}:{item:Item;onBasics:()=>void}){
 const missing=basicMissing(item);
 return <div className="broadcast-progress" data-incomplete={Boolean(missing.length)}>
  <span className="broadcast-progress-status">{missing.length?<AlertCircle size={20}/>:<CheckCircle2 size={20}/>}<strong>{missing.length?'기본정보 보완 필요':'기본정보 입력됨'}</strong></span><BroadcastBadges item={item}/>
  {missing.length>0&&<span className="broadcast-missing-chips">{missing.map(label=><span key={label}>{label} 미입력</span>)}</span>}
  {missing.length>0&&<button type="button" className="text-button" onClick={onBasics}>방송정보 이어서 입력</button>}
 </div>;
}
