import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {setup,api,seedCase,seedDocument} from './support.js';
test('deadline proposals require independent identity, live source and filing evidence',async()=>{
 const x=await setup();try{
 const {caseId}=await seedCase(x),doc=await seedDocument(x,caseId);
 const notice=await api(x,'post',`/cases/${caseId}/notices`,'assistant').send({source:'Casilla revisada',receivedAt:'2026-10-31T10:00:00-05:00',supportVersionId:doc.ver,title:'Resolución'}).expect(201);
 const deadline=await api(x,'post',`/notices/${notice.body.id}/deadlines`,'assistant').send({title:'Subsanar',dueOn:'2026-11-05',basis:'Resolución de prueba',supportVersionId:doc.ver,supportPage:1,responsibleId:x.users.lawyer.id,backupId:x.users.otherLawyer.id}).expect(201);
 await api(x,'post',`/deadlines/${deadline.body.id}/verify`,'manager','manager-cannot-verify1').send({revisionId:deadline.body.revisionId,decision:'verify',reason:'Verificación inválida',version:1}).expect(403);
 const verified=await api(x,'post',`/deadlines/${deadline.body.id}/verify`,'lawyer','lawyer-verification-01').send({revisionId:deadline.body.revisionId,decision:'verify',reason:'Revisión independiente',version:1}).expect(200);assert.equal(verified.body.status,'active');
 await api(x,'post',`/deadlines/${deadline.body.id}/transitions`,'assistant','filing-no-evidence-01').send({status:'filed',version:2}).expect(422);
 await api(x,'post',`/deadlines/${deadline.body.id}/transitions`,'assistant','filing-with-evidence1').send({status:'filed',filedAt:'2026-11-04T15:00:00-05:00',receiptReference:'CARGO-TEST',version:2}).expect(200);
 const own=await api(x,'post',`/notices/${notice.body.id}/deadlines`,'lawyer').send({title:'Otro plazo',dueOn:'2026-11-06',basis:'Fuente de prueba',supportVersionId:doc.ver,supportPage:1,responsibleId:x.users.lawyer.id,backupId:x.users.otherLawyer.id}).expect(201);
 await api(x,'post',`/deadlines/${own.body.id}/verify`,'lawyer','self-verification-001').send({revisionId:own.body.revisionId,decision:'verify',reason:'Intento del registrador',version:1}).expect(403);
 }finally{await x.close();}
});
test('CSV import preserves complete draft groups and proposed deadlines without granting access',async()=>{
 const x=await setup();try{
 const header=['clientName','projectCode','projectName','partnerId','leadId','caseTitle','responsibleId','followupId','backupId','dueOn','deadlineTitle'];
 const values=['Cliente importado','IMPORT-001','Proyecto de planilla',x.users.manager.id,x.users.lawyer.id,'Caso importado',x.users.lawyer.id,x.users.assistant.id,x.users.otherLawyer.id,'2026-11-09','Plazo propuesto'];
 const file=Buffer.from(header.join(',')+'\n'+values.join(',')+'\n'),mapping=Object.fromEntries(header.map(k=>[k,k]));
 const upload=await api(x,'post','/imports').send({filename:'cartera.csv',sourceType:'csv',sizeBytes:file.length,sha256:createHash('sha256').update(file).digest('hex'),mapping}).expect(202);
 await x.storage.put(upload.body.upload.fields.key,file,'text/csv');
 await api(x,'post',`/imports/${upload.body.id}/validate`).send({version:1}).expect(200);assert.equal((await x.runtime.worker.runOnce()).status,'completed');
 const checked=await api(x,'get',`/imports/${upload.body.id}`).expect(200);assert.equal(checked.body.validRows,1);assert.equal(checked.body.invalidRows,0);
 await api(x,'post',`/imports/${upload.body.id}/confirm`,'manager','confirm-import-000001').send({projectGroupIds:checked.body.groups.map((g:any)=>g.id),confirmed:true,version:checked.body.version}).expect(200);
 const cases=await x.db.query("SELECT c.* FROM cases c JOIN projects p ON p.id=c.project_id WHERE p.code='IMPORT-001'");assert.equal(cases.rows.length,1);assert.equal(cases.rows[0].status,'draft');
 const grants=await x.db.query('SELECT * FROM case_grants WHERE case_id=$1',[cases.rows[0].id]);assert.equal(grants.rows.length,0);
 const deadlines=await x.db.query('SELECT * FROM deadlines WHERE case_id=$1',[cases.rows[0].id]);assert.equal(deadlines.rows[0].status,'pending_verification');assert.equal(deadlines.rows[0].verified_by,null);
 await api(x,'get',`/cases/${cases.rows[0].id}`,'lawyer').expect(404);
 const repeat=await api(x,'post','/imports').send({filename:'cartera.csv',sourceType:'csv',sizeBytes:file.length,sha256:createHash('sha256').update(file).digest('hex'),mapping}).expect(202);assert.equal(repeat.body.id,upload.body.id);
 }finally{await x.close();}
});
test('OCR worker stores immutable source text and separately reviewed page revisions',async()=>{
 const x=await setup(),fetchOriginal=globalThis.fetch;try{
 const {caseId}=await seedCase(x),doc=await seedDocument(x,caseId);
 process.env.OCR_PROCESSOR_URL='https://ocr.example.test';process.env.OCR_PROCESSOR_TOKEN='test-token';
 globalThis.fetch=async()=>new Response(JSON.stringify({engine:'test-engine',engineVersion:'1',pages:[{page:1,text:'Texto original OCR',confidence:.9},{page:2,text:'Segunda página'}]}),{status:200});
 const job=await api(x,'post',`/versions/${doc.ver}/ocr-jobs`,'assistant','create-ocr-job-000001').send({language:'es',confirmedSourceVersion:true}).expect(202);
 assert.equal((await x.runtime.worker.runOnce()).status,'completed');
 const result=await api(x,'get',`/ocr-jobs/${job.body.id}`,'assistant').expect(200);assert.equal(result.body.pages.length,2);
 const review=await api(x,'post',`/ocr-jobs/${job.body.id}/review`,'assistant','review-ocr-page-00001').send({sourceVersionId:doc.ver,revision:result.body.revision,pages:[{page:1,text:'Texto corregido'}],reason:'Comparado con la página',confirmedAgainstOriginal:true}).expect(200);assert.equal(review.body.status,'needs_review');assert.equal(review.body.pages[0].rawText,'Texto original OCR');assert.equal(review.body.pages[0].reviewedText,'Texto corregido');
 await api(x,'get',`/ocr-jobs/${job.body.id}`,'client').expect(403);
 const grant=await x.db.query('SELECT id,version FROM case_grants WHERE case_id=$1 AND user_id=$2',[caseId,x.users.assistant.id]);await api(x,'post',`/grants/${grant.rows[0].id}/revoke`,'manager','revoke-ocr-reader-001').send({version:grant.rows[0].version,reason:'Acceso finalizado'}).expect(200);
 await api(x,'get',`/ocr-jobs/${job.body.id}`,'assistant').expect(404);
 }finally{globalThis.fetch=fetchOriginal;delete process.env.OCR_PROCESSOR_URL;delete process.env.OCR_PROCESSOR_TOKEN;await x.close();}
});
