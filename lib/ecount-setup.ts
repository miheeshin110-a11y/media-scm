// Server-only configuration inspection: return status labels, never credential values.
// Detailed ECOUNT response semantics and warehouse selection must be verified before live reads.
export type EcountSetup={stage:'configuration-required'|'ready';checks:{label:string;configured:boolean}[];message:string;warehouses:{code:string;name:string}[]};
export function ecountSetup(env:Record<string,string|undefined>):EcountSetup{
 const present=(key:string)=>Boolean(env[key]?.trim());
 let warehouses=false,choices:{code:string;name:string}[]=[];
 try{
  const raw=JSON.parse(env.ECOUNT_WAREHOUSES||'null');
  warehouses=Array.isArray(raw)&&raw.length>0&&raw.length<=30&&raw.every(r=>r&&typeof r==='object'&&typeof r.code==='string'&&r.code.trim()&&typeof r.name==='string'&&r.name.trim())&&new Set(raw.map(r=>r.code.trim())).size===raw.length&&new Set(raw.map(r=>r.name.trim())).size===raw.length;
  if(warehouses)choices=raw.map((r:{code:string;name:string})=>({code:r.code,name:r.name}));
 }catch{/* Invalid configuration is reported without echoing its contents. */}
 const checks=[
  {label:'이카운트 회사코드',configured:present('ECOUNT_COMPANY_CODE')},
  {label:'API 사용자 ID',configured:present('ECOUNT_USER_ID')},
  {label:'API 인증키',configured:present('ECOUNT_API_CERT_KEY')},
  {label:'조회할 창고코드와 SCM 창고명 연결',configured:warehouses},
 ];
 const configured=checks.every(c=>c.configured);
 return {stage:configured?'ready':'configuration-required',checks,warehouses:choices,message:configured?'조회 준비가 됐습니다. ZONE은 자동 조회합니다. 지정 창고의 재고를 조회하고 수량 단위를 확인한 뒤 반영하세요.':'이카운트 연결 설정이 필요합니다. 창고를 확정하고 담당자와 아래 항목을 준비해 주세요.'};
}
