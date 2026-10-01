import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {Database} from '../lib/database.ts';

// The real PostgreSQL engine executes the production SQL and transaction guards.
export async function store(){
 const pg=new PGlite();
 await pg.exec(readFileSync(new URL('../migrations/postgres/0001_initial.sql',import.meta.url),'utf8'));
 const executor=client=>({async query(sql,args=[]){const r=await client.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};}});
 const db=new Database(executor(pg),work=>pg.transaction(tx=>work(executor(tx))));
 db.close=()=>pg.close();
 return db;
}
