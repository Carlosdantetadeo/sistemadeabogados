import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SignJWT} from 'jose';
import request from 'supertest';
import {readFile} from 'node:fs/promises';
import {setup} from './support.js';
import {S3Storage} from '../src/storage.js';
test('Supabase exchange verifies JWT and server user; local profile and aal2 govern access',async()=>{
 const x=await setup(),prior=globalThis.fetch;
 try{
  process.env.SUPABASE_URL='https://legal-test.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='test-public-key';process.env.SUPABASE_JWT_SECRET='test-only-not-a-production-secret-32bytes';
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'supabase-manager',email:'manager@example.test',email_confirmed_at:new Date().toISOString(),user_metadata:{role:'superadmin'}}));
  const sign=(aal:string)=>new SignJWT({aal,email:'manager@example.test',role:'authenticated'}).setProtectedHeader({alg:'HS256'}).setIssuer(process.env.SUPABASE_URL+'/auth/v1').setAudience('authenticated').setSubject('supabase-manager').setIssuedAt().setExpirationTime('1h').sign(Buffer.from(process.env.SUPABASE_JWT_SECRET!));
  const server=x.app.getHttpServer();
  await request(server).post('/auth/supabase/exchange').set('Origin',process.env.APP_ORIGIN!).send({accessToken:await sign('aal1')}).expect(403);
  const success=await request(server).post('/auth/supabase/exchange').set('Origin',process.env.APP_ORIGIN!).send({accessToken:await sign('aal2')}).expect(200);
  const cookies=success.headers['set-cookie'].map((c:string)=>c.split(';')[0]).join('; ');
  const me=await request(server).get('/api/v1/me').set('Cookie',cookies).expect(200);assert.equal(me.body.user.role,'manager');assert.equal(me.body.globalOperationalAccess,true);
  await request(server).post('/auth/supabase/exchange').set('Origin','https://untrusted.example').send({accessToken:await sign('aal2')}).expect(403);
  await request(server).post('/auth/supabase/exchange').set('Origin',process.env.APP_ORIGIN!).send({accessToken:'forged.jwt.token'}).expect(401);
 }finally{globalThis.fetch=prior;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_PUBLISHABLE_KEY;delete process.env.SUPABASE_JWT_SECRET;await x.close();}
});
test('Supabase browser roles cannot query backend tables through the Data API',async()=>{
 const x=await setup();try{
  await x.db.engine.exec('CREATE TABLE schema_migrations(name text PRIMARY KEY, sha256 text NOT NULL);');
  await x.db.engine.exec('CREATE ROLE anon; CREATE ROLE authenticated; GRANT USAGE ON SCHEMA public TO anon, authenticated; GRANT SELECT ON costs TO authenticated; GRANT ALL ON schema_migrations TO PUBLIC, anon, authenticated;');
  await x.db.engine.exec(await readFile(new URL('../migrations/002_supabase_hardening.sql',import.meta.url),'utf8'));
  await x.db.engine.exec(await readFile(new URL('../migrations/003_migration_metadata_security.sql',import.meta.url),'utf8'));
  const enabled=await x.db.query("SELECT relrowsecurity FROM pg_class WHERE relname='costs'");assert.equal(enabled.rows[0].relrowsecurity,true);
  const metadata=await x.db.query("SELECT relrowsecurity FROM pg_class WHERE relname='schema_migrations'");assert.equal(metadata.rows[0].relrowsecurity,true);
  for(const role of ['anon','authenticated']){
   for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']){
    const permission=await x.db.query('SELECT has_table_privilege($1,$2,$3) AS allowed',[role,'schema_migrations',privilege]);assert.equal(permission.rows[0].allowed,false);
   }
   await x.db.engine.exec('SET ROLE '+role);
   await assert.rejects(x.db.query('SELECT * FROM schema_migrations'),/permission denied/);
   await assert.rejects(x.db.query('DELETE FROM schema_migrations'),/permission denied/);
   await x.db.engine.exec('RESET ROLE');
  }
  await x.db.engine.exec('SET ROLE authenticated');
  await assert.rejects(x.db.query('SELECT * FROM costs'),/permission denied/);
  await x.db.engine.exec('RESET ROLE');
 }finally{await x.close();}
});
test('Supabase-compatible storage uses short-lived signed PUT, without public download URLs',async()=>{
 const keys=['S3_ENDPOINT','S3_REGION','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','S3_FORCE_PATH_STYLE'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  Object.assign(process.env,{S3_ENDPOINT:'https://project.storage.supabase.co/storage/v1/s3',S3_REGION:'us-east-1',S3_BUCKET:'legal-private',S3_ACCESS_KEY_ID:'test-access-key',S3_SECRET_ACCESS_KEY:'test-secret-key-not-real',S3_FORCE_PATH_STYLE:'true'});
  const result=await new S3Storage().uploadForm('firm/quarantine/file.pdf','application/pdf',120);
  const url=new URL(result.url);assert.equal(result.method,'PUT');assert.equal(result.headers['Content-Type'],'application/pdf');assert.equal(url.searchParams.get('X-Amz-Expires'),'300');assert.ok(url.pathname.includes('/legal-private/firm/quarantine/file.pdf'));assert.ok(url.searchParams.get('X-Amz-SignedHeaders')!.includes('content-length'));assert.equal(url.searchParams.get('x-amz-checksum-crc32'),null);assert.deepEqual(result.fields,{});
 }finally{for(const k of keys)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
});
