import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {ecountConfig,fetchEcountStock,EcountError} from '../lib/ecount-client.ts';
const host='127.0.0.1',port=3111,origin=`http://${host}:${port}`;
const stateFile=new URL('../work/ecount-local-state.json',import.meta.url);
let state={nextAt:0,authFailures:0,status:'ready',count:0,error:''},inFlight=false;
try{const old=JSON.parse(await readFile(stateFile,'utf8'));if(Number.isFinite(old.nextAt)&&Number.isInteger(old.authFailures))state={...state,nextAt:old.nextAt,authFailures:old.authFailures};}catch{}
const persist=async()=>{await mkdir(new URL('../work/',import.meta.url),{recursive:true});await writeFile(stateFile,JSON.stringify({nextAt:state.nextAt,authFailures:state.authFailures}),{mode:0o600});};
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
const server=createServer(async(req,res)=>{
 if(req.headers.host!==`${host}:${port}`){json(res,{error:'허용되지 않은 접속입니다.'},403);return;}
 if(req.method==='GET'&&req.url==='/'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'Referrer-Policy':'no-referrer'});
  res.end(await readFile(new URL('./ecount-local.html',import.meta.url),'utf8'));return;
 }
 if(req.method==='GET'&&req.url==='/status'){json(res,{status:state.status,count:state.count,error:state.error,nextAt:state.nextAt,inFlight});return;}
 if(req.method!=='POST'||req.url!=='/query'){json(res,{error:'조회 전용 화면입니다.'},404);return;}
 if(req.headers.origin!==origin||req.headers['x-local-inventory']!=='1'||!String(req.headers['content-type']).startsWith('application/json')){json(res,{error:'로컬 화면에서 요청하세요.'},403);return;}
 if(inFlight||Date.now()<state.nextAt||state.authFailures>=3){json(res,{error:'중복 조회 또는 인증 재시도가 제한 중입니다. 반복 클릭하지 마세요.'},429);return;}
 let config,body='';
 try{
  for await(const chunk of req){body+=chunk;if(body.length>4000)throw Error();}
  const input=JSON.parse(body);body='';
  config=ecountConfig({ECOUNT_COMPANY_CODE:input.company,ECOUNT_USER_ID:input.user,ECOUNT_API_CERT_KEY:input.key,ECOUNT_WAREHOUSES:'[{"code":"200","name":"샌드부스터"}]'});
  input.company='';input.user='';input.key='';
 }catch{body='';json(res,{error:'회사코드·API 사용자 ID·운영용 인증키 입력 형식을 확인하세요. 값은 저장하지 않았습니다.'},400);return;}
 inFlight=true;state={...state,nextAt:Date.now()+600000,status:'loading',count:0,error:''};
 try{
  await persist();
  const queriedAt=new Date().toISOString(),day=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}).replaceAll('-','');
  const raw=await fetchEcountStock(config,'200',day);config=null;
  if(raw.some(r=>String(r.WH_CD)!=='200'))throw new EcountError('format','다른 창고의 응답이 포함돼 표시하지 않았습니다.');
  const rows=raw.filter(r=>typeof r.PROD_CD==='string'&&/^V/i.test(r.PROD_CD)&&r.PROD_CD!=='V00100110').map(r=>({code:r.PROD_CD,name:String(r.PROD_DES||''),quantity:String(r.BAL_QTY??'')}));
  if(new Set(rows.map(r=>r.code)).size!==rows.length)throw new EcountError('format','중복 품목이 있어 표시하지 않았습니다.');
  state={...state,status:'success',count:rows.length,authFailures:0,error:''};await persist();json(res,{warehouse:'샌드부스터',warehouseCode:'200',day,queriedAt,rows,nextAt:state.nextAt});
 }catch(e){
  config=null;const message=e instanceof EcountError?e.message:'조회에 실패했습니다. 원본 오류와 인증 정보는 출력하지 않습니다.';
  state={...state,status:'error',error:message,...(e instanceof EcountError&&e.code==='auth'?{authFailures:state.authFailures+1,nextAt:Date.now()+3600000}:{})};
  try{await persist();}catch{}
  json(res,{error:message},502);
 }finally{config=null;inFlight=false;}
});
server.on('error',()=>{console.error('로컬 조회 서버를 시작하지 못했습니다. 3111 포트 사용 여부를 확인하세요.');process.exitCode=1;});
server.listen(port,host,()=>console.log('샌드부스터 조회 전용: '+origin+' (인증정보 저장·SCM 반영 없음)'));
