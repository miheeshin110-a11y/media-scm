import {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const db=await pool.connect();
try {
 await db.query('BEGIN');
 await db.query('SELECT pg_advisory_xact_lock(736267, 1)');
 await db.query('CREATE TABLE IF NOT EXISTS scm_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
 for(const name of ['0001_initial.sql','0002_logistics_sheet_job.sql']){
  const sql=await readFile(new URL('../migrations/postgres/'+name,import.meta.url),'utf8');
  const checksum=createHash('sha256').update(sql).digest('hex');
  const found=await db.query('SELECT checksum FROM scm_migrations WHERE name=$1',[name]);
  if(found.rows.length){if(found.rows[0].checksum!==checksum)throw new Error('Migration checksum changed: '+name);continue;}
  await db.query(sql);
  await db.query('INSERT INTO scm_migrations(name,checksum) VALUES ($1,$2)',[name,checksum]);
 }
 await db.query('COMMIT');
 console.log('PostgreSQL schema is ready. Existing records were not replaced.');
}catch(error){await db.query('ROLLBACK');throw error;}
finally{db.release();await pool.end();}
