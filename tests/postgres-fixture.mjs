import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {Database} from '../lib/database.ts';

// The real PostgreSQL engine executes the production SQL and transaction guards.
export async function store(){
 const pg=new PGlite();
 for(const name of ['0001_initial.sql','0002_logistics_sheet_job.sql'])await pg.exec(readFileSync(new URL('../migrations/postgres/'+name,import.meta.url),'utf8'));
 const executor=client=>({async query(sql,args=[]){const r=await client.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};}});
 const db=new Database(executor(pg),work=>pg.transaction(tx=>work(executor(tx))));
 db.close=()=>pg.close();
 return db;
}
