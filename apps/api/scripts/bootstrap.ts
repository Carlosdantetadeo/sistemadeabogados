import {parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';
import {Postgres} from '../src/db.js';
const {values}=parseArgs({options:{email:{type:'string'},name:{type:'string'},firm:{type:'string'}}});
if(!values.email||!values.name||!values.firm||!/^\S+@\S+\.\S+$/.test(values.email))throw new Error('Usage: npm run db:bootstrap -- --email owner@example.com --name Owner --firm Firma');
const db=new Postgres();
try{
 await db.transaction(async sql=>{
  await sql.query('SELECT pg_advisory_xact_lock(2036122)');
  if((await sql.query('SELECT 1 FROM firms LIMIT 1')).rows.length)throw new Error('Bootstrap only runs on an empty installation.');
  const firmId=randomUUID(),userId=randomUUID();
  await sql.query('INSERT INTO firms(id,name) VALUES($1,$2)',[firmId,values.firm]);
  await sql.query("INSERT INTO users(id,firm_id,person_id,email,name,role) VALUES($1,$2,$3,$4,$5,'superadmin')",[userId,firmId,randomUUID(),values.email!.toLowerCase(),values.name]);
  await sql.query('INSERT INTO calendars(id,firm_id,name) VALUES($1,$2,$3)',[randomUUID(),firmId,'Calendario del estudio: revisar feriados antes de alertas']);
  console.log('Bootstrap completed. Sign in with the configured OIDC provider and verified email + MFA. No password was created.');
 });
}finally{await db.close();}
