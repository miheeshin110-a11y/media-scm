import {request as httpsRequest} from 'node:https';
export class EcountError extends Error{code:'setup'|'auth'|'upstream'|'format'|'cooldown';constructor(code:EcountError['code'],message:string){super(message);this.code=code;}}
export type EcountWarehouse={code:string;name:string};
export function ecountConfig(env:Record<string,string|undefined>){
 let warehouses:EcountWarehouse[]=[];
 try{const rows=JSON.parse(env.ECOUNT_WAREHOUSES||'null');if(!Array.isArray(rows)||!rows.length||rows.length>30)throw 0;
  warehouses=rows.map(r=>{if(!r||typeof r.code!=='string'||!/^\w{1,5}$/.test(r.code)||typeof r.name!=='string'||!r.name.trim()||r.name.length>80)throw 0;return {code:r.code,name:r.name.trim()};});
  if(new Set(warehouses.map(w=>w.code)).size!==warehouses.length||new Set(warehouses.map(w=>w.name)).size!==warehouses.length)throw 0;
 }catch{throw new EcountError('setup','ECOUNT_WAREHOUSES의 창고 설정을 확인하세요.');}
 const company=env.ECOUNT_COMPANY_CODE?.trim(),user=env.ECOUNT_USER_ID?.trim(),key=env.ECOUNT_API_CERT_KEY?.trim();
 if(!company||!/^\d{5,6}$/.test(company)||!user||user.length>30||!key||key.length>100)throw new EcountError('setup','이카운트 회사코드·API 사용자 ID·운영 인증키 설정을 확인하세요.');
 return {company,user,key,warehouses};
}
export type EcountTransport=(url:string,body:Record<string,string>)=>Promise<unknown>;
// Avoid Next fetch URL tracing: the official inventory URL contains a session token.
// Only sanitized errors cross this transport boundary; never log raw URLs or responses.
export const ecountTransport:EcountTransport=(url,body)=>new Promise((resolve,reject)=>{
 const payload=JSON.stringify(body);const fail=()=>reject(new EcountError('upstream','이카운트 응답을 확인하지 못했습니다. 기존 재고는 유지됩니다.'));
 const req=httpsRequest(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','Content-Length':Buffer.byteLength(payload)}},res=>{
  if(res.statusCode!==200){res.resume();fail();return;}let bytes=0;const chunks:Buffer[]=[];
  res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>2000000){req.destroy();fail();}else chunks.push(chunk);});res.on('error',fail);
  res.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{fail();}});
 });req.setTimeout(12000,()=>req.destroy());req.on('error',fail);req.end(payload);
});
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
function dataOf(raw:unknown,auth=false){const r=object(raw);if(String(r.Status)!=='200'||r.Error||(Array.isArray(r.Errors)?r.Errors.length>0:Boolean(r.Errors))||object(r.Data).IsSuccess===false){const code=object(r.Error).Code;
 throw new EcountError(auth?'auth':'upstream',auth?(String(code)==='205'?'이카운트 API 허용 IP 설정을 확인하세요. 인증 재시도는 중단했습니다.':'이카운트 회사코드·사용자 ID·운영 인증키와 접속 권한을 확인하세요. 인증 재시도는 중단했습니다.'):'이카운트 재고 조회에 실패했습니다. 기존 재고는 유지됩니다.');}return object(r.Data);}
export async function fetchEcountStock(config:ReturnType<typeof ecountConfig>,warehouse:string,baseDate:string,send:EcountTransport=ecountTransport){
 if(!config.warehouses.some(w=>w.code===warehouse)||!/^\d{8}$/.test(baseDate))throw new EcountError('setup','조회 창고·기준일을 확인하세요.');
 let zoneData:Record<string,unknown>,loginData:Record<string,unknown>;
 try{
  zoneData=dataOf(await send('https://oapi.ecount.com/OAPI/V2/Zone',{COM_CODE:config.company}),true);
  const zone=zoneData.ZONE;if(typeof zone!=='string'||! /^[a-zA-Z0-9]{1,6}$/.test(zone))throw new Error();
  loginData=dataOf(await send(`https://oapi${zone.toLowerCase()}.ecount.com/OAPI/V2/OAPILogin`,{COM_CODE:config.company,USER_ID:config.user,API_CERT_KEY:config.key,LAN_TYPE:'ko-KR',ZONE:zone}),true);
 }catch(e){if(e instanceof EcountError&&e.code==='auth')throw e;throw new EcountError('auth','이카운트 인증 응답을 확인하지 못했습니다. 반복 호출을 중단했습니다.');}
 // The official field table places SESSION_ID in Data; its example nests it in Datas.
 // Accept both documented layouts, but never search arbitrary response fields.
 const loginCode=loginData.Code;
 if(loginCode!==undefined&&String(loginCode)!=='00'){
  const reason=String(loginCode)==='205'?'이카운트 API 허용 IP 설정을 확인하세요.':'이카운트 API 사용자·운영 인증키·접속 권한을 확인하세요.';
  throw new EcountError('auth',reason+' 인증 재시도는 중단했습니다.');
 }
 const nested=object(loginData.Datas).SESSION_ID,direct=loginData.SESSION_ID;
 const validSession=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=8192&&!/[\r\n]/.test(v);
 const session=validSession(nested)?nested:validSession(direct)?direct:undefined;
 if(!session){
  // Fixed vocabulary only: do not echo values, server messages or dynamic response keys.
  const kind=(v:unknown)=>v===undefined?'없음':Array.isArray(v)?'배열':v===null?'null':typeof v;
  throw new EcountError('auth','이카운트 로그인 응답에서 세션을 확인하지 못했습니다. [L-S: 직접 '+kind(direct)+', 중첩 '+kind(nested)+', Datas '+kind(loginData.Datas)+'] 반복 호출을 중단했습니다.');
 }
 const zone=String(zoneData.ZONE).toLowerCase();let stock:Record<string,unknown>;
 try{stock=dataOf(await send(`https://oapi${zone}.ecount.com/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatusByLocation?SESSION_ID=${encodeURIComponent(session)}`,{SESSION_ID:session,BASE_DATE:baseDate,WH_CD:warehouse,PROD_CD:'',ZERO_FLAG:'Y',BAL_FLAG:'N',DEL_GUBUN:'N',DEL_LOCATION_YN:'N'}));}catch(e){if(e instanceof EcountError)throw e;throw new EcountError('upstream','이카운트 재고 조회에 실패했습니다. 기존 재고는 유지됩니다.');}
 if(!Array.isArray(stock.Result)||!Number.isInteger(Number(stock.TotalCnt))||Number(stock.TotalCnt)!==stock.Result.length)throw new EcountError('format','재고 응답이 누락되거나 형식이 다릅니다. 기존 재고는 유지됩니다.');
 return stock.Result as Record<string,unknown>[];
}
