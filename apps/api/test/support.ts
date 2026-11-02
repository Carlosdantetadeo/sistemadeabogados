import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Database,Sql,Row} from '../src/db.js';
import {Storage} from '../src/storage.js';
import {User} from '../src/policy.js';
import {initialGrant} from '../src/core.js';
import {maximum} from '../src/policy.js';
import request from 'supertest';
import {Runtime} from '../src/runtime.js';
import {createApp} from '../src/app.js';
export class TestDb implements Database {
 readonly engine=new PGlite();
 async query<T extends Row=Row>(q:string,values:any[]=[]){const r=await this.engine.query<T>(q,values);return {rows:r.rows,rowCount:r.affectedRows};}
 transaction<T>(work:(sql:Sql)=>Promise<T>){return this.engine.transaction(async tx=>work({query:async(q:string,values:any[]=[])=>{const r=await tx.query<any>(q,values);return {rows:r.rows,rowCount:r.affectedRows};}}));}
 async close(){await this.engine.close();}
}
export class MemoryStorage implements Storage {
 readonly objects=new Map<string,{body:Buffer;mime:string}>();
 async uploadForm(key:string,mime:string,size:number){return {url:'https://storage.invalid/quarantine',fields:{key,'Content-Type':mime,size:String(size)},expiresAt:new Date(Date.now()+300000).toISOString()};}
 async head(key:string){const o=this.objects.get(key);if(!o)throw new Error('missing test object');return {size:o.body.length,mime:o.mime};}
 async read(key:string,range?:{start:number;end:number}){const o=this.objects.get(key);if(!o)throw new Error('missing test object');return range?o.body.subarray(range.start,range.end+1):o.body;}
 async put(key:string,body:Buffer,mime:string){this.objects.set(key,{body,mime});}
}
export async function setup(){
 process.env.APP_ORIGIN='http://localhost:3000';process.env.NODE_ENV='test';
 const db=new TestDb();await db.engine.exec(await readFile(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
 const firm=randomUUID();await db.query('INSERT INTO firms(id,name) VALUES($1,$2)',[firm,'Test firm']);
 const users:Record<string,User>={};
 for(const [name,role] of [['admin','superadmin'],['manager','manager'],['lawyer','lawyer'],['otherLawyer','lawyer'],['assistant','assistant'],['client','client']]){
  const id=randomUUID(),person=randomUUID();await db.query('INSERT INTO users(id,firm_id,person_id,email,name,role) VALUES($1,$2,$3,$4,$5,$6)',[id,firm,person,name+'@example.test',name,role]);users[name]=(await db.query('SELECT * FROM users WHERE id=$1',[id])).rows[0] as User;
 }
 const storage=new MemoryStorage(),runtime=new Runtime(db,storage),app=await createApp(runtime);await app.init();
 const sessions:Record<string,{cookie:string;csrf:string}>={};for(const [name,u] of Object.entries(users)){const s=await db.transaction(sql=>runtime.auth.createSession(sql,u,true));sessions[name]={cookie:`session=${s.session}; csrf=${s.csrf}`,csrf:s.csrf};}
 return {db,firm,users,storage,runtime,app,sessions,async close(){await app.close();await db.close();}};
}
export type Fixture=Awaited<ReturnType<typeof setup>>;
export function api(x:Fixture,method:'get'|'post'|'patch'|'put',path:string,actor='manager',key?:string){const r=request(x.app.getHttpServer())[method]('/api/v1'+path).set('Cookie',x.sessions[actor].cookie).set('Origin',process.env.APP_ORIGIN!).set('X-CSRF-Token',x.sessions[actor].csrf);if(key)r.set('Idempotency-Key',key);return r;}
export async function seedCase(x:Fixture,finance=false){
 const client=randomUUID(),project=randomUUID(),caseId=randomUUID();
 await x.db.query("INSERT INTO clients(id,firm_id,name,type) VALUES($1,$2,'Cliente prueba','person')",[client,x.firm]);
 await x.db.query("INSERT INTO projects(id,firm_id,client_id,code,name,status,owner_id,partner_id,lead_id,conflict_status) VALUES($1,$2,$3,$4,'Proyecto','active',$5,$6,$7,'clear')",[project,x.firm,client,'PR-'+project,x.users.admin.id,x.users.manager.id,x.users.lawyer.id]);
 await x.db.query("INSERT INTO cases(id,firm_id,project_id,code,title,type,responsible_id,followup_id,backup_id,data) VALUES($1,$2,$3,$4,'Caso prueba','judicial',$5,$6,$7,'{}')",[caseId,x.firm,project,'EXP-'+caseId,x.users.lawyer.id,x.users.assistant.id,x.users.otherLawyer.id]);
 for(const name of ['admin','manager','lawyer','otherLawyer','assistant','client']){const u=x.users[name];await initialGrant(x.db,x.users.admin,caseId,u.id,maximum[u.role].filter(p=>finance||p!=='economic'),'Asignación de prueba');}
 await x.db.query('INSERT INTO client_memberships(user_id,client_id,firm_id) VALUES($1,$2,$3)',[x.users.client.id,client,x.firm]);
 if(finance)for(const name of ['manager','admin'])await x.db.query('INSERT INTO project_grants(id,firm_id,project_id,user_id,economic) VALUES($1,$2,$3,$4,true)',[randomUUID(),x.firm,project,x.users[name].id]);
 return {client,project,caseId};
}
export async function seedDocument(x:Fixture,caseId:string,classification='operational'){
 const doc=randomUUID(),ver=randomUUID(),key='test/'+ver,body=Buffer.from('%PDF-1.4\nTest original');
 await x.storage.put(key,body,'application/pdf');
 await x.db.query('INSERT INTO documents(id,firm_id,case_id,title,classification,current_version_id) VALUES($1,$2,$3,$4,$5,$6)',[doc,x.firm,caseId,'Documento.pdf',classification,ver]);
 await x.db.query("INSERT INTO document_versions(id,firm_id,document_id,sequence,author_id,object_key,sha256,mime,size_bytes,review_status) VALUES($1,$2,$3,1,$4,$5,$6,'application/pdf',$7,'reviewed')",[ver,x.firm,doc,x.users.lawyer.id,key,'a'.repeat(64),body.length]);
 return {doc,ver,key,body};
}
