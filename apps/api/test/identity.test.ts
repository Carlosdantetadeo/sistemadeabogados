import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {setup} from './support.js';
test('OIDC code flow validates state, nonce, issuer, signature, verified email and internal MFA',async()=>{
 const x=await setup(),prior=globalThis.fetch;
 try{
 process.env.OIDC_ISSUER='https://identity.example.test';process.env.OIDC_CLIENT_ID='legal-test';process.env.OIDC_CLIENT_SECRET='test-client-secret';delete process.env.OIDC_MFA_ACR;
 const {publicKey,privateKey}=await generateKeyPair('ES256'),publicJwk=await exportJWK(publicKey);let nonce='',amr=['mfa'];
 globalThis.fetch=async(input:any)=>{
  const url=String(input);
  if(url.endsWith('/.well-known/openid-configuration'))return new Response(JSON.stringify({issuer:process.env.OIDC_ISSUER,authorization_endpoint:'https://identity.example.test/authorize',token_endpoint:'https://identity.example.test/token',jwks_uri:'https://identity.example.test/keys'}));
  if(url.endsWith('/keys'))return new Response(JSON.stringify({keys:[{...publicJwk,kid:'test-key',alg:'ES256',use:'sig'}]}));
  if(url.endsWith('/token'))return new Response(JSON.stringify({id_token:await new SignJWT({nonce,email:'admin@example.test',email_verified:true,amr}).setProtectedHeader({alg:'ES256',kid:'test-key'}).setIssuer(process.env.OIDC_ISSUER!).setAudience('legal-test').setSubject('verified-admin').setIssuedAt().setExpirationTime('5m').sign(privateKey)}));
  throw new Error('Unexpected network request');
 };
 const server=x.app.getHttpServer();
 const start=await request(server).get('/auth/start').expect(302),url=new URL(start.headers.location);nonce=url.searchParams.get('nonce')!;
 const cookie=start.headers['set-cookie'][0].split(';')[0];
 await request(server).get('/auth/callback?state=forged&code=x').set('Cookie',cookie).expect(400);
 const login=await request(server).get('/auth/callback').query({state:url.searchParams.get('state'),code:'verified-code'}).set('Cookie',cookie).expect(302);assert.ok(login.headers['set-cookie'].some((v:string)=>v.startsWith('session=')));
 await request(server).get('/auth/callback').query({state:url.searchParams.get('state'),code:'reuse'}).set('Cookie',cookie).expect(400);
 const second=await request(server).get('/auth/start').expect(302),secondUrl=new URL(second.headers.location);nonce=secondUrl.searchParams.get('nonce')!;amr=['pwd'];
 await request(server).get('/auth/callback').query({state:secondUrl.searchParams.get('state'),code:'no-mfa'}).set('Cookie',second.headers['set-cookie'][0].split(';')[0]).expect(403);
 }finally{globalThis.fetch=prior;delete process.env.OIDC_ISSUER;delete process.env.OIDC_CLIENT_ID;delete process.env.OIDC_CLIENT_SECRET;await x.close();}
});
