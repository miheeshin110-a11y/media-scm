import type {Contract} from './finance-model.ts';

const validMoney=(value:string)=>/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)<=1e12;

// Explain incomplete drafts without turning the save action into a silent dead end.
export function contractFormIssues(contract:Contract):string[]{
 const issues:string[]=[];
 if(!contract.businessNo||!contract.party)issues.push('계약 거래처를 선택하세요.');
 if(!contract.channel)issues.push('방송 채널을 선택하세요.');
 if(!contract.program?.trim())issues.push('PPL 프로그램을 선택하세요. 목록에 없으면 아래에서 새 프로그램을 등록하세요.');
 if(!validMoney(contract.net))issues.push('공급가액을 0 이상의 정수로 입력하세요.');
 if(contract.taxMode!=='auto'&&!validMoney(contract.tax))issues.push('부가세를 0 이상의 정수로 입력하세요.');
 return issues;
}

export function allocationFormIssues(rows:{broadcastId:string;month:string;net:string}[],budget:string):string[]{
 const issues:string[]=[],seen=new Set<string>();
 rows.forEach((row,index)=>{
  const prefix=`${index+1}번 방송: `;
  if(!row.broadcastId)issues.push(prefix+'연결할 홈쇼핑 방송을 선택하세요.');
  else if(seen.has(row.broadcastId))issues.push(prefix+'같은 홈쇼핑 방송이 중복 선택되어 있습니다.');
  seen.add(row.broadcastId);
  if(!validMoney(row.net))issues.push(prefix+'배분금액을 0 이상의 정수로 입력하세요.');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month))issues.push(prefix+'비용 귀속월을 선택하세요.');
 });
 if(rows.every(r=>validMoney(r.net))&&rows.reduce((sum,r)=>sum+Number(r.net),0)>Number(budget))issues.push('배분합계가 PPL 총금액을 초과합니다. 방송별 금액을 줄여 주세요.');
 return issues;
}
