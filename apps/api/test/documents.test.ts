import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,api,seedCase,seedDocument} from './support.js';
test('private upload -> real worker protocol -> preview -> incorporation -> review -> exact-version publication',async()=>{
 const x=await setup(),originalFetch=globalThis.fetch;
 try{
 const {caseId}=await seedCase(x);const payload=Buffer.from('%PDF-1.4\nOriginal test file');
 const upload=await api(x,'post',`/cases/${caseId}/uploads`,'assistant').send({title:'Anexo.pdf',filename:'Anexo.pdf',mime:'application/pdf',sizeBytes:payload.length,classification:'operational',economicDeclaration:false}).expect(202);
 const uid=upload.body.id;assert.ok(upload.body.upload.url);await x.storage.put(upload.body.upload.fields.key,payload,'application/pdf');
 delete process.env.DOCUMENT_PROCESSOR_URL;
 await api(x,'post',`/uploads/${uid}/complete`,'assistant','scan-unconfigured-001').send({version:1}).expect(503);
 process.env.DOCUMENT_PROCESSOR_URL='https://processor.example.test';process.env.DOCUMENT_PROCESSOR_TOKEN='test-token';
 globalThis.fetch=async(_url:any,init:any)=>{const input=JSON.parse(init.body);return new Response(JSON.stringify({clean:true,activeContent:false,sha256:input.sha256,previewPdfBase64:Buffer.from('%PDF-1.4\nSafe preview').toString('base64')}),{status:200});};
 await api(x,'post',`/uploads/${uid}/complete`,'assistant','scan-configured-00001').send({version:1}).expect(200);
 assert.equal((await x.runtime.worker.runOnce()).status,'completed');
 const ready=await api(x,'get',`/uploads/${uid}`,'assistant').expect(200);assert.equal(ready.body.status,'preview_ready');
 const confirmed=await api(x,'post',`/uploads/${uid}/confirm`,'assistant','confirm-upload-000001').send({uploadId:uid,sha256:ready.body.sha256,confirmedFileAndDestination:true,version:ready.body.version}).expect(200);
 const doc=confirmed.body,vid=doc.currentVersionId;
 const publishedBody={documentVersionId:vid,audienceUserIds:[x.users.client.id],confirmed:true,version:doc.version};
 await api(x,'post',`/documents/${doc.id}/publications`,'lawyer','publish-unreviewed-01').send(publishedBody).expect(422);
 await api(x,'post',`/versions/${vid}/review`,'lawyer').send({reason:'Revisión del documento',version:1}).expect(200);
 const pub=await api(x,'post',`/documents/${doc.id}/publications`,'lawyer','publish-reviewed-0001').send(publishedBody).expect(200);
 await api(x,'get',`/portal/publications/${pub.body.id}`,'client').expect(200);
 const download=await api(x,'get',`/versions/${vid}/download`,'client').expect(200);assert.equal(download.headers['cache-control'],'no-store');
 await api(x,'post',`/publications/${pub.body.id}/revoke`,'lawyer','withdraw-publication1').send({reason:'Retiro solicitado por el estudio',version:1}).expect(200);
 await api(x,'get',`/versions/${vid}/download`,'client').expect(404);
 const stored=await x.db.query('SELECT object_key FROM document_versions WHERE id=$1',[vid]);assert.ok(stored.rows[0].object_key.includes('/validated/'));
 const original=await x.storage.read(stored.rows[0].object_key);assert.ok(original.equals(payload));
 }finally{globalThis.fetch=originalFetch;delete process.env.DOCUMENT_PROCESSOR_URL;delete process.env.DOCUMENT_PROCESSOR_TOKEN;await x.close();}
});
test('OCR is unavailable without a configured engine; financial and internal text is not exposed to clients',async()=>{
 const x=await setup();try{const {caseId}=await seedCase(x,true),doc=await seedDocument(x,caseId);delete process.env.OCR_PROCESSOR_URL;
 await api(x,'post',`/versions/${doc.ver}/ocr-jobs`,'assistant','ocr-no-provider-00001').send({language:'es',confirmedSourceVersion:true}).expect(503);
 const financial=await seedDocument(x,caseId,'financial');await api(x,'get',`/versions/${financial.ver}/download`,'client').expect(404);
 await api(x,'post',`/versions/${doc.ver}/ocr-jobs`,'client','ocr-client-denied-001').send({language:'es',confirmedSourceVersion:true}).expect(403);
 }finally{await x.close();}
});
