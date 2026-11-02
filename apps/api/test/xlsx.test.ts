import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setup,api} from './support.js';
async function validateXlsx(x:Awaited<ReturnType<typeof setup>>,file:Buffer){
 const r=await api(x,'post','/imports').send({filename:'test.xlsx',sourceType:'xlsx',sizeBytes:file.length,sha256:createHash('sha256').update(file).digest('hex'),mapping:{clientName:'clientName'}}).expect(202);
 await x.storage.put(r.body.upload.fields.key,file,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 await api(x,'post',`/imports/${r.body.id}/validate`).send({version:1}).expect(200);
 const job=await x.runtime.worker.runOnce();const result=await api(x,'get',`/imports/${r.body.id}`).expect(200);return {job,result:result.body};
}
test('real XLSX parsing returns row errors instead of activating incomplete groups',async()=>{
 const x=await setup();try{const file=await readFile(new URL('fixtures/minimal.xlsx',import.meta.url));const {job,result}=await validateXlsx(x,file);assert.equal(job.status,'completed');assert.equal(result.status,'validated');assert.equal(result.invalidRows,1);assert.equal(result.errors[0].code,'MISSING_FIELDS');}finally{await x.close();}
});
test('XLSX actual decompression cannot exceed the declared per-entry limit',async()=>{
 const x=await setup();try{const file=Buffer.from(await readFile(new URL('fixtures/minimal.xlsx',import.meta.url)));const at=file.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));file.writeUInt32LE(1,at+24);const {job,result}=await validateXlsx(x,file);assert.equal(job.status,'failed');assert.equal(job.code,'UNSAFE_XLSX');assert.equal(result.status,'failed');assert.equal(result.failureCode,'UNSAFE_XLSX');}finally{await x.close();}
});
