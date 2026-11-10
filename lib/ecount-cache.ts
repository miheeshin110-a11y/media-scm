import type {Database} from './database.ts';
import type {Logistics} from './logistics.ts';
import {ecountCatalogKey,ecountInventoryRows} from './ecount-inventory.ts';
import {ecountConfig,fetchEcountStock,EcountError,type EcountTransport} from './ecount-client.ts';
type DB=Pick<Database,'prepare'>;
export type EcountPreview={id:string;warehouse:string;warehouseCode:string;baseDate:string;fetchedAt:string;asOf:string;catalogKey:string;lines:{sku:string;name:string;unit:string;available:number}[];missing:string[];issues:string[]};
// Idempotent infrastructure creation; no SCM records, finance or stock are changed here.
export const ecountCacheDDL=`CREATE TABLE IF NOT EXISTS scm_ecount_cache (id INTEGER PRIMARY KEY CHECK(id=1), next_at BIGINT NOT NULL DEFAULT 0, lease_until BIGINT NOT NULL DEFAULT 0, owner TEXT NOT NULL DEFAULT '', auth_failures INTEGER NOT NULL DEFAULT 0, auth_hash TEXT NOT NULL DEFAULT '', config_hash TEXT NOT NULL DEFAULT '', preview TEXT, last_error TEXT NOT NULL DEFAULT '')`;
export const ecountHash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export async function readEcountPreview(db:DB,configHash?:string){await db.prepare(ecountCacheDDL).run();const row=await db.prepare('SELECT preview,config_hash FROM scm_ecount_cache WHERE id=1').first<{preview:string|null;config_hash:string}>();return row?.preview&&(!configHash||row.config_hash===configHash)?JSON.parse(row.preview) as EcountPreview:null;}
export async function loadEcountPreview(db:DB,env:Record<string,string|undefined>,warehouseCode:string,l:Logistics,now=Date.now(),send?:EcountTransport){
 const config=ecountConfig(env),warehouse=config.warehouses.find(w=>w.code===warehouseCode);
 if(!warehouse)throw new EcountError('setup','등록된 조회 창고를 선택하세요.');
 const configHash=await ecountHash(JSON.stringify(config)),authHash=await ecountHash(JSON.stringify([config.company,config.user,config.key])),catalogKey=ecountCatalogKey(l);
 if(JSON.parse(catalogKey).length===0)throw new EcountError('setup','조회할 V코드 본품·사은품 구성을 먼저 연결하세요.');
 await db.prepare(ecountCacheDDL).run();await db.prepare('INSERT INTO scm_ecount_cache(id) VALUES(1) ON CONFLICT(id) DO NOTHING').run();
 const cached=await db.prepare('SELECT config_hash,preview FROM scm_ecount_cache WHERE id=1').first<{config_hash:string;preview:string|null}>();
 if(cached?.preview&&cached.config_hash===configHash){const p=JSON.parse(cached.preview) as EcountPreview;
  if(p.warehouseCode===warehouseCode&&p.catalogKey===catalogKey&&Date.parse(p.fetchedAt)>now-600000)return {preview:p,cached:true};}
 const owner=crypto.randomUUID();
 // Claim is atomic across instances and users, before any ERP authentication request.
 const claimed=await db.prepare('UPDATE scm_ecount_cache SET owner=?,lease_until=?,next_at=? WHERE id=1 AND lease_until<=? AND next_at<=? AND (auth_failures<3 OR auth_hash<>?) RETURNING id').bind(owner,now+90000,now+600000,now,now,authHash).all();
 if(claimed.meta.changes!==1)throw new EcountError('cooldown','중복 조회 또는 오류 후 재시도가 제한 중입니다. 최근 자료를 이용하고 잠시 후 다시 확인하세요. 인증 오류 후에는 1시간 대기하며 3회 반복 실패 시 인증 설정을 수정해야 합니다.');
 try{
  const fetchedAt=new Date(now).toISOString(),local=new Date(now).toLocaleString('sv-SE',{timeZone:'Asia/Seoul'}),baseDate=local.slice(0,10).replaceAll('-','');
  const raw=await fetchEcountStock(config,warehouseCode,baseDate,send),rows=ecountInventoryRows(raw,warehouseCode,l);
  const preview:EcountPreview={id:crypto.randomUUID(),warehouse:warehouse.name,warehouseCode,baseDate,fetchedAt,asOf:local.slice(0,16).replace(' ','T'),catalogKey,...rows};
  const result=await db.prepare("UPDATE scm_ecount_cache SET preview=?,config_hash=?,lease_until=0,owner='',last_error='',auth_failures=0,auth_hash='' WHERE id=1 AND owner=?").bind(JSON.stringify(preview),configHash,owner).run();
  if(result.meta.changes!==1)throw new EcountError('upstream','조회 결과가 만료됐습니다. 기존 재고는 유지됩니다.');
  return {preview,cached:false};
 }catch(error){
  const safe=error instanceof EcountError?error:new EcountError('upstream','재고 조회에 실패했습니다. 기존 재고는 유지됩니다.');
  await db.prepare("UPDATE scm_ecount_cache SET lease_until=0,owner='',next_at=?,last_error=?,auth_failures=CASE WHEN ? THEN CASE WHEN auth_hash=? THEN auth_failures+1 ELSE 1 END ELSE auth_failures END,auth_hash=CASE WHEN ? THEN ? ELSE auth_hash END WHERE id=1 AND owner=?").bind(now+(safe.code==='auth'?3600000:600000),safe.message,safe.code==='auth',authHash,safe.code==='auth',authHash,owner).run();throw safe;
 }
}
