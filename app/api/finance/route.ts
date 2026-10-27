import {readSyncSnapshot} from '@/lib/sync-status';
import {authenticated} from '@/lib/runtime';
import {syncFinance,syncRecord} from '@/lib/google-sync';
import {runtime,identity,checkWrite,readable,reviewer} from '@/lib/runtime';
import {readFinance,saveFinance} from '@/lib/finance-store';
import {FinanceError,type FinanceAction} from '@/lib/finance-model';
import {SaveConflict} from '@/lib/record-store';
import {seedRecords} from '@/lib/seed-records';
import {canSaveFinance} from '@/lib/finance-access';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function handleGET(request:Request){if(!readable(request))return json({error:'로그인이 필요합니다.'},401);return json({finance:await readFinance(runtime().DB.withSession('first-primary'))});}
async function handlePOST(request:Request){
 const denied=checkWrite(request);if(denied)return denied;
 try{const raw=await request.text();if(raw.length>1200000)return json({error:'입력 내용이 너무 큽니다.'},413);const {action,baseVersion,requestId}=JSON.parse(raw) as {action:FinanceAction;baseVersion:number;requestId:string};
 if(!action||!canSaveFinance(action.kind,reviewer(request)))return json({error:'세금계산서 대조·변경은 팀장 권한이 필요합니다.'},403);
 if(!Number.isSafeInteger(baseVersion)||baseVersion<0||typeof requestId!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(requestId))return json({error:'저장 요청을 확인해 주세요.'},400);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({action,baseVersion})))),b=>b.toString(16).padStart(2,'0')).join('');
 const finance=await saveFinance(runtime().DB.withSession('first-primary'),action,baseVersion,requestId,identity(request)!,hash,seedRecords);const rows=await runtime().DB.withSession('first-primary').prepare('SELECT after_payload FROM scm_revisions WHERE request_id LIKE ?').bind(requestId+':%').all<{after_payload:string}>();try{await syncFinance(runtime());for(const r of rows.results.slice(0,5))await syncRecord(runtime(),JSON.parse(r.after_payload).id);}catch{/* Server save remains durable. */}return json({syncSnapshot:await readSyncSnapshot(runtime().DB),finance,updatedRecords:rows.results.map(x=>JSON.parse(x.after_payload))});
 }catch(e){if(e instanceof SaveConflict)return json({error:e.message},409);if(e instanceof FinanceError||e instanceof TypeError||e instanceof SyntaxError)return json({error:e instanceof FinanceError?e.message:'입력 형식을 확인해 주세요.'},400);return json({error:'저장하지 못했습니다. 입력값을 유지한 상태에서 다시 시도해 주세요.'},500);}
}

export const GET=authenticated(handleGET);

export const POST=authenticated(handlePOST);

