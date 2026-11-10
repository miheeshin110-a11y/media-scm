import type {Database} from './database.ts';
import type {Logistics} from './logistics.ts';
import type {EcountPreview} from './ecount-cache.ts';
import {ecountHash} from './ecount-cache.ts';
import {ecountCatalogKey,ecountInventoryRows} from './ecount-inventory.ts';
import {EcountError} from './ecount-client.ts';
type DB=Pick<Database,'prepare'|'batch'>;
const warehouse='200',warehouseName='샌드부스터';
export const bridgeDDL=[
 `CREATE TABLE IF NOT EXISTS scm_ecount_bridge_devices(id TEXT PRIMARY KEY,label TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,created_at BIGINT NOT NULL,expires_at BIGINT NOT NULL,revoked BOOLEAN NOT NULL DEFAULT FALSE,last_seen BIGINT NOT NULL DEFAULT 0,ready BOOLEAN NOT NULL DEFAULT FALSE)`,
 `CREATE TABLE IF NOT EXISTS scm_ecount_bridge_pairs(code_hash TEXT PRIMARY KEY,label TEXT NOT NULL,expires_at BIGINT NOT NULL,claim TEXT NOT NULL DEFAULT '',actor TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS scm_ecount_bridge_jobs(id TEXT PRIMARY KEY,warehouse TEXT NOT NULL,catalog_key TEXT NOT NULL,created_at BIGINT NOT NULL,expires_at BIGINT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',device_id TEXT,result TEXT,error TEXT NOT NULL DEFAULT '')`,
 `CREATE TABLE IF NOT EXISTS scm_ecount_bridge_control(id INTEGER PRIMARY KEY CHECK(id=1),next_at BIGINT NOT NULL DEFAULT 0,auth_failures INTEGER NOT NULL DEFAULT 0)`
];
const initialized=new WeakMap<DB,Promise<void>>();
export async function ensureBridge(db:DB){let ready=initialized.get(db);if(!ready){ready=(async()=>{await db.batch(bridgeDDL.map(sql=>db.prepare(sql)));await db.prepare('INSERT INTO scm_ecount_bridge_control(id) VALUES(1) ON CONFLICT(id) DO NOTHING').run();})();initialized.set(db,ready);ready.catch(()=>initialized.delete(db));}await ready;}
const secret=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
export async function bridgeStatus(db:DB,now=Date.now()){
 await ensureBridge(db);const rows=await db.prepare('SELECT id,label,last_seen,ready,expires_at FROM scm_ecount_bridge_devices WHERE revoked=FALSE AND expires_at>? ORDER BY created_at').bind(now).all<{id:string;label:string;last_seen:number;ready:boolean;expires_at:number}>();
 return rows.results.map(d=>({id:d.id,label:d.label,online:Number(d.last_seen)>now-90000&&d.ready,lastSeen:Number(d.last_seen),expiresAt:Number(d.expires_at)}));
}
export async function createBridgePair(db:DB,label:unknown,actor:string,now=Date.now()){
 if(typeof label!=='string'||!label.trim()||label.length>60)throw new EcountError('setup','물류팀 PC 이름을 1~60자로 입력하세요.');
 await ensureBridge(db);const code=secret();await db.prepare('INSERT INTO scm_ecount_bridge_pairs(code_hash,label,expires_at,actor) VALUES(?,?,?,?)').bind(await ecountHash(code),label.trim(),now+600000,actor).run();return {code,expiresAt:now+600000};
}
export async function redeemBridgePair(db:DB,code:unknown,now=Date.now()){
 if(typeof code!=='string'||! /^[a-f0-9]{64}$/.test(code))throw new EcountError('auth','연결코드를 확인하세요.');
 await ensureBridge(db);const hash=await ecountHash(code),claim=crypto.randomUUID(),id=crypto.randomUUID(),token=secret(),tokenHash=await ecountHash(token);
 const rows=await db.batch([
  db.prepare("UPDATE scm_ecount_bridge_pairs SET claim=? WHERE code_hash=? AND expires_at>? AND claim='' ").bind(claim,hash,now),
  db.prepare('INSERT INTO scm_ecount_bridge_devices(id,label,token_hash,created_at,expires_at) SELECT ?,label,?,?,? FROM scm_ecount_bridge_pairs WHERE code_hash=? AND claim=?').bind(id,tokenHash,now,now+180*86400000,hash,claim).whenPreviousChanged()
 ]);
 if(rows[1].meta.changes!==1)throw new EcountError('auth','연결코드가 만료됐거나 이미 사용됐습니다. SCM에서 새 연결코드를 준비하세요.');return {deviceId:id,token};
}
export async function bridgeDevice(db:DB,token:unknown,now=Date.now()){
 if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))throw new EcountError('auth','PC 연결 인증을 확인하세요.');
 await ensureBridge(db);const d=await db.prepare('SELECT id,label FROM scm_ecount_bridge_devices WHERE token_hash=? AND revoked=FALSE AND expires_at>?').bind(await ecountHash(token),now).first<{id:string;label:string}>();
 if(!d)throw new EcountError('auth','PC 연결이 해제되거나 만료됐습니다. SCM에서 다시 연결하세요.');return d;
}
export async function revokeBridge(db:DB,id:unknown){if(typeof id!=='string')throw new EcountError('setup','PC를 선택하세요.');await ensureBridge(db);await db.prepare('UPDATE scm_ecount_bridge_devices SET revoked=TRUE,ready=FALSE WHERE id=?').bind(id).run();}
export async function bridgeHeartbeat(db:DB,id:string,ready:boolean,now=Date.now()){
 await db.prepare('UPDATE scm_ecount_bridge_devices SET last_seen=?,ready=? WHERE id=? AND revoked=FALSE').bind(now,ready,id).run();
 if(!ready)return null;
 const job=await db.prepare("UPDATE scm_ecount_bridge_jobs SET state='running',device_id=? WHERE id=(SELECT id FROM scm_ecount_bridge_jobs WHERE state='pending' AND expires_at>? AND warehouse=? ORDER BY created_at LIMIT 1) AND state='pending' RETURNING id,warehouse,expires_at").bind(id,now,warehouse).first<{id:string;warehouse:string;expires_at:number}>();
 return job?{id:job.id,warehouseCode:job.warehouse,expiresAt:Number(job.expires_at)}:null;
}
const safeErrors={auth_ip:'이카운트 API 허용 IP를 확인하세요. PC 조회를 중단했습니다.',auth:'물류팀 PC의 이카운트 사용자·운영 인증키와 접속 권한을 확인하세요.',upstream:'이카운트 재고 조회에 실패했습니다. 기존 SCM 재고는 유지됩니다.',format:'재고 응답을 확인하지 못했습니다. 기존 SCM 재고는 유지됩니다.'};
export async function completeBridgeJob(db:DB,device:{id:string;label:string},jobId:unknown,outcome:unknown,l:Logistics,now=Date.now()){
 if(typeof jobId!=='string'||!outcome||typeof outcome!=='object')throw new EcountError('format','조회 결과를 확인하세요.');
 const job=await db.prepare("SELECT id,created_at FROM scm_ecount_bridge_jobs WHERE id=? AND device_id=? AND state='running' AND expires_at>?").bind(jobId,device.id,now).first<{id:string;created_at:number}>();
 if(!job)throw new EcountError('format','조회 요청이 만료됐거나 다른 PC의 요청입니다.');
 const o=outcome as Record<string,unknown>;
 if(o.errorCode!==undefined){
  const code=typeof o.errorCode==='string'&&Object.hasOwn(safeErrors,o.errorCode)?o.errorCode as keyof typeof safeErrors:'upstream';
  await db.batch([db.prepare("UPDATE scm_ecount_bridge_jobs SET state='failed',error=? WHERE id=? AND state='running' AND device_id=?").bind(safeErrors[code],job.id,device.id),db.prepare('UPDATE scm_ecount_bridge_control SET next_at=?,auth_failures=auth_failures+? WHERE id=1').bind(now+((code==='auth'||code==='auth_ip')?3600000:600000),(code==='auth'||code==='auth_ip')?1:0).whenPreviousChanged()]);return;
 }
 if(!Array.isArray(o.rows)||o.rows.length>15000)throw new EcountError('format','재고 결과 형식을 확인하세요.');
 const normalized=ecountInventoryRows(o.rows as Record<string,unknown>[],warehouse,l),local=new Date(now).toLocaleString('sv-SE',{timeZone:'Asia/Seoul'});
 const today=local.slice(0,10).replaceAll('-',''),createdDay=new Date(Number(job.created_at)).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}).replaceAll('-','');
 const baseDate=o.baseDate===undefined?today:o.baseDate;if(typeof baseDate!=='string'||!/^\d{8}$/.test(baseDate)||baseDate<createdDay||baseDate>today)throw new EcountError('format','조회 기준일을 확인하세요.');
 const preview:EcountPreview={id:job.id,warehouse:warehouseName,warehouseCode:warehouse,baseDate,fetchedAt:new Date(now).toISOString(),asOf:local.slice(0,16).replace(' ','T'),catalogKey:ecountCatalogKey(l),...normalized};
 await db.batch([db.prepare("UPDATE scm_ecount_bridge_jobs SET state='done',result=? WHERE id=? AND state='running' AND device_id=?").bind(JSON.stringify(preview),job.id,device.id),db.prepare('UPDATE scm_ecount_bridge_control SET auth_failures=0 WHERE id=1').whenPreviousChanged()]);
}
export async function readBridgePreview(db:DB,id:unknown,now=Date.now()){
 await ensureBridge(db);if(typeof id!=='string')return null;
 const row=await db.prepare("SELECT result FROM scm_ecount_bridge_jobs WHERE id=? AND state='done'").bind(id).first<{result:string}>();const p=row?JSON.parse(row.result) as EcountPreview:null;return p&&Date.parse(p.fetchedAt)>now-600000?p:null;
}
export async function bridgeJobResult(db:DB,id:unknown,l:Logistics,now=Date.now()){
 if(typeof id!=='string')throw new EcountError('setup','조회 요청을 선택하세요.');
 const j=await db.prepare('SELECT state,error,result,expires_at FROM scm_ecount_bridge_jobs WHERE id=?').bind(id).first<{state:string;error:string;result:string|null;expires_at:number}>();
 if(!j)throw new EcountError('setup','조회 요청을 찾지 못했습니다.');
 if(j.state==='failed')throw new EcountError('upstream',j.error);
 if(j.state==='done'){
  const preview=await readBridgePreview(db,id,now);if(!preview||preview.catalogKey!==ecountCatalogKey(l))throw new EcountError('format','조회 결과가 만료됐거나 구성이 변경됐습니다. 재확인하세요.');
  return {status:'ready' as const,preview,cached:false};
 }
 if(Number(j.expires_at)<=now)throw new EcountError('upstream','물류팀 PC 응답이 없습니다. PC와 조회 프로그램 실행 상태를 확인하세요.');return {status:'pending' as const,jobId:id};
}
export async function requestBridgeJob(db:DB,l:Logistics,now=Date.now()){
 await ensureBridge(db);const catalogKey=ecountCatalogKey(l);
 if(JSON.parse(catalogKey).length===0)throw new EcountError('setup','V코드 구성수량을 먼저 연결하세요.');
 const old=await db.prepare("SELECT id FROM scm_ecount_bridge_jobs WHERE warehouse=? AND state='done' ORDER BY created_at DESC LIMIT 1").bind(warehouse).first<{id:string}>();
 if(old){const p=await readBridgePreview(db,old.id,now);if(p?.catalogKey===catalogKey)return {status:'ready' as const,preview:p,cached:true};}
 const pending=await db.prepare("SELECT id FROM scm_ecount_bridge_jobs WHERE state IN ('pending','running') AND expires_at>? AND warehouse=? ORDER BY created_at DESC LIMIT 1").bind(now,warehouse).first<{id:string}>();if(pending)return {status:'pending' as const,jobId:pending.id};
 if(!(await bridgeStatus(db,now)).some(d=>d.online))throw new EcountError('setup','물류팀 조회 PC가 연결되지 않았습니다. PC와 조회 프로그램을 켜 주세요. 기존 재고는 유지됩니다.');
 const id=crypto.randomUUID();const rows=await db.batch([
  db.prepare('UPDATE scm_ecount_bridge_control SET next_at=? WHERE id=1 AND next_at<=? AND auth_failures<3').bind(now+600000,now),
  db.prepare('INSERT INTO scm_ecount_bridge_jobs(id,warehouse,catalog_key,created_at,expires_at) VALUES(?,?,?,?,?)').bind(id,warehouse,catalogKey,now,now+180000).whenPreviousChanged()
 ]);
 if(rows[1].meta.changes!==1)throw new EcountError('cooldown','중복 조회·오류 후 대기 중입니다. 인증 실패 후에는 1시간 대기하며 3회 실패 시 관리자 확인이 필요합니다.');return {status:'pending' as const,jobId:id};
}
