import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {setup} from './support.js';
test('real database + HTTP: sessions, CSRF, global direction access and assigned staff only',async()=>{
 const x=await setup();try{
 const server=x.app.getHttpServer();
 await request(server).get('/api/v1/me').expect(401);
 const s=x.sessions.manager;
 const api=(method:'get'|'post',path:string,actor='manager')=>request(server)[method]('/api/v1'+path).set('Cookie',x.sessions[actor].cookie).set('Origin',process.env.APP_ORIGIN!).set('X-CSRF-Token',x.sessions[actor].csrf);
 await request(server).post('/api/v1/clients').set('Cookie',s.cookie).send({name:'Test',type:'person'}).expect(403);
 const client=(await api('post','/clients').send({name:'Cliente prueba',type:'person'}).expect(201)).body;
 const project=(await api('post','/projects').send({clientId:client.id,name:'Proyecto prueba',partnerId:x.users.manager.id,leadId:x.users.lawyer.id}).expect(201)).body;
 const reviewed=(await api('post',`/projects/${project.id}/conflict-reviews`).send({result:'clear',reason:'Revisión de prueba',version:1}).expect(201)).body;
 const activated=await request(server).patch('/api/v1/projects/'+project.id).set('Cookie',s.cookie).set('Origin',process.env.APP_ORIGIN!).set('X-CSRF-Token',s.csrf).send({status:'active',reason:'Activación revisada',version:2}).expect(200);
 const c=(await api('post','/cases').send({projectId:project.id,title:'Expediente prueba',type:'judicial',responsibleId:x.users.lawyer.id,followupId:x.users.assistant.id,backupId:x.users.otherLawyer.id,openedOn:'2026-10-31'}).expect(201)).body;
 await api('get','/cases/'+c.id,'admin').expect(200);
 await api('get','/cases/'+c.id,'lawyer').expect(200);
 await api('get','/cases/'+c.id,'assistant').expect(200);
 await api('get','/cases/'+c.id,'client').expect(403);
 const strangers=await x.db.query('SELECT id FROM case_grants WHERE case_id=$1 AND user_id=$2',[c.id,x.users.otherLawyer.id]);await x.db.query('UPDATE case_grants SET revoked_at=now() WHERE id=$1',[strangers.rows[0].id]);
 await api('get','/cases/'+c.id,'otherLawyer').expect(404);
 const list=await api('get','/projects','lawyer').expect(200);assert.equal(list.body.totalAuthorized,1);assert.equal(list.body.items[0].id,project.id);
 await x.db.query('UPDATE users SET active=false,session_version=session_version+1 WHERE id=$1',[x.users.lawyer.id]);await api('get','/me','lawyer').expect(401);
 await assert.rejects(x.db.query('UPDATE audit_events SET action=$1',['tamper']),/immutable/);
 }finally{await x.close();}
});
