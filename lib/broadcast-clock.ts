import type {Item} from './scm-model.ts';
export function usesActualClock(previous?:Item){return !previous||previous.dateConvention==='actual';}
export function broadcastClockIssues(record:Item,previous?:Item):string[]{
 if(!usesActualClock(previous))return [];
 const issues:string[]=[];
 if(record.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(record.time))issues.push('실제 방송시간을 00:00~23:59로 입력하세요. 예: 10/7 24:30 → 10/8 00:30');
 if(record.calendarMonth&&record.date&&record.calendarMonth!==record.date.slice(0,7))issues.push('신규 방송의 캘린더 표시월은 실제 방송일의 월과 같아야 합니다.');
 return issues;
}
