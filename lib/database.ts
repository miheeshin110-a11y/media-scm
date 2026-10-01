import {Pool} from 'pg';
import {attachDatabasePool} from '@vercel/functions';
type Value=string|number|boolean|null;
export type SqlResult={rows:Record<string,unknown>[];rowCount:number|null};
export type Executor={query:(sql:string,args?:Value[])=>Promise<SqlResult>};
export type Transaction=<T>(work:(connection:Executor)=>Promise<T>)=>Promise<T>;
export type QueryResult<T=Record<string,unknown>>={results:T[];meta:{changes:number;last_row_id:number}};
const result=<T>(r:SqlResult):QueryResult<T>=>({results:r.rows as T[],meta:{changes:r.rowCount??0,last_row_id:0}});
// Replace bound parameters only, retaining question marks inside SQL literals.
export function postgresParameters(sql:string){
  let n=0;
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?/g,token=>token==='?'?'$'+(++n):token);
}
export class Statement {
  readonly client:Executor; readonly sql:string; readonly args:Value[]; readonly conditional:boolean;
  constructor(client:Executor,sql:string,args:Value[]=[],conditional=false){this.client=client;this.sql=sql;this.args=args;this.conditional=conditional;}
  bind(...args:Value[]){return new Statement(this.client,this.sql,args,this.conditional);}
  whenPreviousChanged(){return new Statement(this.client,this.sql,this.args,true);}
  async first<T=Record<string,unknown>>():Promise<T|null>{return (await this.all<T>()).results[0]??null;}
  async all<T=Record<string,unknown>>(){if(this.conditional)throw new Error('CONDITIONAL_STATEMENT_REQUIRES_BATCH');return result<T>(await this.client.query(postgresParameters(this.sql),this.args));}
  async run(){return this.all();}
}
export class Database {
  readonly client:Executor; readonly transaction:Transaction;
  constructor(client:Executor,transaction:Transaction){this.client=client;this.transaction=transaction;}
  prepare(sql:string){return new Statement(this.client,sql);}
  async batch(statements:Statement[]){
    return this.transaction(async connection=>{
      // Cross-record finance/version guards share a short transaction lock.
      // No Sheets or network request runs while this lock is held.
      await connection.query('SELECT pg_advisory_xact_lock(736267, 1)');
      const results:QueryResult[]=[];
      for(const s of statements){
        if(s.conditional&&results.at(-1)?.meta.changes!==1){results.push(result({rows:[],rowCount:0}));continue;}
        results.push(result(await connection.query(postgresParameters(s.sql),s.args)));
      }
      return results;
    });
  }
  withSession(_constraint?:string){return this;}
}
let cached:Database|undefined;
export function database(){
  if(cached)return cached;
  const url=process.env.DATABASE_URL;
  if(!url)throw new Error('DATABASE_NOT_CONFIGURED');
  if(!/^postgres(ql)?:\/\//.test(url))throw new Error('POSTGRES_DATABASE_REQUIRED');
  const pool=new Pool({connectionString:url,max:5,idleTimeoutMillis:5000,connectionTimeoutMillis:10000});
  if(process.env.VERCEL)attachDatabasePool(pool);
  return cached=new Database(pool,async work=>{
    const connection=await pool.connect();
    try{await connection.query('BEGIN');const value=await work(connection);await connection.query('COMMIT');return value;}
    catch(error){await connection.query('ROLLBACK');throw error;}
    finally{connection.release();}
  });
}

