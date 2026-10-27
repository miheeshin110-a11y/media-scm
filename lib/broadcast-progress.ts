import type {Item} from './scm-model';
export function basicMissing(item:Item):string[]{
 return ([['item','표준 아이템'],['owner','담당자'],['channel','홈쇼핑 채널'],['date','방송일'],['time','방송시간']] as const).filter(([key])=>!item[key]?.trim()).map(([,label])=>label);
}
export function registrationLabel(item:Item):string{
 if(item.registrationSource==='ppl')return 'PPL 간편등록';
 if(item.registrationSource==='broadcast')return '방송 직접등록';
 return item.ppl==='있음'||item.pplLinks?.length?'기존 등록 · PPL 연결':'기존 등록';
}
export function broadcastProgress(item:Item):string{
 return registrationLabel(item)+' · '+(basicMissing(item).length?'기본정보 보완 필요':'기본정보 입력됨');
}
