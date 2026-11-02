import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Postgres,type Database} from '../src/db.js';
export async function migrate(db:Database){
 await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 const directory=new URL('../migrations/',import.meta.url);
 for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')).sort()){
  const source=await readFile(new URL(name,directory),'utf8'),digest=createHash('sha256').update(source).digest('hex');
  await db.transaction(async sql=>{
   await sql.query('SELECT pg_advisory_xact_lock(2036121)');
   const prior=(await sql.query('SELECT sha256 FROM schema_migrations WHERE name=$1',[name])).rows[0];
   if(prior){if(prior.sha256!==digest)throw new Error('Applied migration changed: '+name);return;}
   await sql.query(source);await sql.query('INSERT INTO schema_migrations(name,sha256) VALUES($1,$2)',[name,digest]);
  });
 }
}
if(process.argv[1]?.endsWith('migrate.ts')){if(process.env.DIRECT_DATABASE_URL)process.env.DATABASE_URL=process.env.DIRECT_DATABASE_URL;const db=new Postgres();migrate(db).then(()=>console.log('Migrations applied.')).finally(()=>db.close());}
