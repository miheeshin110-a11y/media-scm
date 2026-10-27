import {readSyncSnapshot} from '@/lib/sync-status';
import {authenticated} from '@/lib/runtime';
import {runtime,checkWrite} from '@/lib/runtime';
import {sheetsConfigured,syncRecord,syncFinance} from '@/lib/google-sync';
async function handlePOST(request:Request){
  const denied=checkWrite(request);if(denied)return denied;
  const env=runtime();if(!sheetsConfigured(env))return Response.json({error:'앱용 Google 계정 연결 설정이 필요합니다.'},{status:503});
  const rows=await env.DB.prepare("SELECT record_id FROM scm_outbox WHERE state!='sent' ORDER BY updated_at LIMIT 5").all<{record_id:string}>();
  const results=[{id:'finance',state:await syncFinance(env)}];for(const row of rows.results)results.push({id:row.record_id,state:await syncRecord(env,row.record_id)});
  return Response.json({results,syncSnapshot:await readSyncSnapshot(env.DB)},{headers:{'Cache-Control':'no-store'}});
}

export const POST=authenticated(handlePOST);

