import {Pool} from 'pg';
export type Row=Record<string,any>;
export interface Sql {query<T extends Row=Row>(sql:string,params?:any[]):Promise<{rows:T[];rowCount?:number|null}>}
export interface Database extends Sql {transaction<T>(work:(sql:Sql)=>Promise<T>):Promise<T>;close():Promise<void>}
export class Postgres implements Database {
  private pool:Pool;
  constructor(){if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:Number(process.env.DATABASE_POOL_MAX||1),idleTimeoutMillis:10000,connectionTimeoutMillis:5000,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true,...(process.env.DATABASE_CA_CERT?{ca:process.env.DATABASE_CA_CERT.replace(/\\n/g,'\n')}:{})}:undefined});}
  query<T extends Row=Row>(sql:string,params:any[]=[]){return this.pool.query<T>(sql,params);}
  async transaction<T>(work:(sql:Sql)=>Promise<T>):Promise<T>{const c=await this.pool.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
  async close(){await this.pool.end();}
}
export async function one(sql:Sql,q:string,args:any[]=[]){return (await sql.query(q,args)).rows[0];}
