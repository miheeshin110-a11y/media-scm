import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {ecountConfig,fetchEcountStock,EcountError} from '../lib/ecount-client.ts';
const port=3112,origin='http://127.0.0.1:'+port,endpoint='https://project-hgxy5.vercel.app/api/ecount/bridge/worker';
const dir=process.platform==='win32'?join(process.env.LOCALAPPDATA||process.cwd(),'MediaSCMBridge'):new URL('../work/ecount-pc/',import.meta.url).pathname;
const secretFile=join(dir,'credentials.dpapi'),stateFile=join(dir,'limits.json');
let credentials=null,token='',timer,inFlight=false,remoteStopped=false;
let limits={nextAt:0,authFailures:0},status='연결 설정 대기',lastSeen=0,lastResult='';
function dpapi(input,decrypt=false){
 if(process.platform!=='win32')throw Error('Windows 계정 암호화 저장은 Windows에서만 가능합니다.');
 const command=`Add-Type -AssemblyName System.Security;$v=[Console]::In.ReadToEnd();`+(decrypt?`$b=[Convert]::FromBase64String($v);$o=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($o));`:`$b=[Text.Encoding]::UTF8.GetBytes($v);$o=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($o));`);
 const r=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{input,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:32000});
 if(r.status!==0||!r.stdout)throw Error('Windows 암호화 저장소를 확인하지 못했습니다.');return r.stdout.trim();
}
const saveLimits=async()=>{await mkdir(dir,{recursive:true});await writeFile(stateFile,JSON.stringify(limits),{mode:0o600});};
async function remote(body){
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'Authorization':'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(response.status===401){remoteStopped=true;throw Error('PC 연결 인증이 만료되거나 해제됐습니다. SCM에서 다시 연결하세요.');}
 if(!response.ok)throw Error('SCM 연결에 실패했습니다. 네트워크와 연결 설정을 확인하세요.');
 return response.json();
}
const schedule=()=>{clearTimeout(timer);if(credentials&&token&&!remoteStopped)timer=setTimeout(()=>void poll(),20000);};
async function poll(){
 if(inFlight||!credentials||!token||remoteStopped)return;inFlight=true;
 try{
  const ready=limits.authFailures<3&&(limits.authFailures===0||Date.now()>=limits.nextAt);
  const {job}=await remote({op:'poll',ready});lastSeen=Date.now();status=ready?'SCM 연결됨 · 샌드부스터 조회 요청 대기':'SCM 연결됨 · 재조회 대기 또는 인증 설정 확인 필요';
  if(job){
   if(job.warehouseCode!=='200'||typeof job.id!=='string')throw Error('지정 창고 이외의 요청을 거부했습니다.');
   if(!ready||Date.now()<limits.nextAt)throw Error('재시도 제한 중입니다.');
   limits.nextAt=Date.now()+600000;await saveLimits();status='샌드부스터 재고 조회 중';let outcome;
   try{
    const day=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}).replaceAll('-',''),raw=await fetchEcountStock(credentials,'200',day);
    if(raw.some(r=>String(r.WH_CD)!=='200'))throw new EcountError('format','다른 창고 응답');
    outcome={baseDate:day,rows:raw.filter(r=>typeof r.PROD_CD==='string'&&/^V/i.test(r.PROD_CD)&&r.PROD_CD!=='V00100110').map(r=>({WH_CD:'200',PROD_CD:r.PROD_CD,BAL_QTY:String(r.BAL_QTY??'')}))};
    limits.authFailures=0;lastResult='재고 조회 성공 · SCM 확인 화면으로 전달';
   }catch(e){
    const auth=e instanceof EcountError&&e.code==='auth';if(auth){limits.authFailures++;limits.nextAt=Date.now()+3600000;}
    outcome={errorCode:auth?(e.message.includes('IP')?'auth_ip':'auth'):(e instanceof EcountError&&e.code==='format'?'format':'upstream')};lastResult='재고 조회 실패 · 자동 재시도 없음';
   }
   await saveLimits();
   try{await remote({op:'finish',jobId:job.id,outcome});}catch(e){status='조회 결과 전달 실패 · 이카운트 재호출 없음';throw e;}
   status=lastResult;
  }
 }catch(e){status=e instanceof Error&&e.message.startsWith('PC 연결 인증')?e.message:'SCM 응답을 확인하지 못했습니다. PC·인터넷·프로그램 실행 상태를 확인하세요.';}
 finally{inFlight=false;schedule();}
}
try{const saved=JSON.parse(await readFile(stateFile,'utf8'));if(Number.isFinite(saved.nextAt)&&Number.isInteger(saved.authFailures))limits=saved;}catch{}
try{const saved=JSON.parse(dpapi(await readFile(secretFile,'utf8'),true));credentials=ecountConfig(saved.env);if(!/^[a-f0-9]{64}$/.test(saved.token))throw Error();token=saved.token;status='암호화 설정 불러옴';}catch{credentials=null;token='';}
const json=(res,value,statusCode=200)=>{res.writeHead(statusCode,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
const server=createServer(async(req,res)=>{
 if(req.headers.host!==`127.0.0.1:${port}`){json(res,{error:'허용되지 않은 접속'},403);return;}
 if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(await readFile(new URL('./ecount-pc.html',import.meta.url),'utf8'));return;}
 if(req.method==='GET'&&req.url==='/status'){json(res,{status,lastSeen,lastResult,connected:Boolean(token&&credentials)&&!remoteStopped,nextAt:limits.nextAt,inFlight});return;}
 if(req.method!=='POST'||!['/connect','/forget'].includes(req.url)||req.headers.origin!==origin||req.headers['x-local-inventory']!=='1'){json(res,{error:'로컬 설정 화면에서 요청하세요.'},403);return;}
 if(inFlight){json(res,{error:'조회 처리가 끝난 뒤 설정하세요.'},409);return;}
 let text='',data;
 try{
  for await(const chunk of req){text+=chunk;if(text.length>8000)throw Error();}data=JSON.parse(text);text='';
  if(req.url==='/forget'){clearTimeout(timer);credentials=null;token='';remoteStopped=true;await unlink(secretFile).catch(()=>{});status='PC 저장 설정 삭제 · SCM에서 PC 연결도 해제해 주세요.';json(res,{ok:true});return;}
  const env={ECOUNT_COMPANY_CODE:data.company,ECOUNT_USER_ID:data.user,ECOUNT_API_CERT_KEY:data.key,ECOUNT_WAREHOUSES:'[{"code":"200","name":"샌드부스터"}]'},config=ecountConfig(env);
  if(data.code){const pair=await remote({op:'connect',code:data.code});if(typeof pair.token!=='string'||! /^[a-f0-9]{64}$/.test(pair.token))throw Error();token=pair.token;}
  if(!token)throw Error('SCM의 물류팀 PC 연결코드를 입력하세요.');
  credentials=config;remoteStopped=false;
  if(data.remember===true){const encrypted=dpapi(JSON.stringify({env,token}));await mkdir(dir,{recursive:true});await writeFile(secretFile,encrypted,{mode:0o600});}else await unlink(secretFile).catch(()=>{});
  data=null;status='PC 연결 설정 완료 · SCM 접속 확인 중';json(res,{ok:true});void poll();
 }catch(e){data=null;text='';json(res,{error:e instanceof Error&&['Windows','SCM의','이카운트'].some(prefix=>e.message.startsWith(prefix))?e.message:'PC 연결 설정을 확인하지 못했습니다. 연결코드 만료 여부와 입력 형식을 확인하세요.'},400);}
});
server.on('error',()=>{console.error('PC 조회 프로그램을 시작하지 못했습니다. 이미 실행 중이면 로컬 화면을 사용하세요.');process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{console.log('물류팀 PC 연결 화면: '+origin+' (인증 값 출력 없음)');if(credentials&&token)void poll();});
