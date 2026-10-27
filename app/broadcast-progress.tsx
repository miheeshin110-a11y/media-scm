import type {Item} from '@/lib/scm-model';
import {basicMissing,registrationLabel} from '@/lib/broadcast-progress';
export function BroadcastProgress({item,onBasics}:{item:Item;onBasics:()=>void}){
 const missing=basicMissing(item);
 return <div className="broadcast-progress" data-incomplete={Boolean(missing.length)}>
  <strong>{registrationLabel(item)}</strong><span>{missing.length?'기본정보 보완 필요: '+missing.join(' · '):'기본정보 입력됨 · 판매조건·목표·비용은 각 단계에서 확인하세요.'}</span>
  {missing.length>0&&<button type="button" className="text-button" onClick={onBasics}>방송정보 이어서 입력</button>}
  {!item.registrationSource&&<small>이전에 저장된 방송은 최초 등록 경로가 기록되어 있지 않습니다.</small>}
 </div>;
}
