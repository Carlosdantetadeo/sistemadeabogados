import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {parse,serialize} from 'cookie';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import type {Request,Response} from 'express';
import {Database,Sql,one} from './db.js';
import {ApiError,requireThat,unavailable} from './errors.js';
import {User,asUser} from './policy.js';
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export const token=()=>randomBytes(32).toString('base64url');
export function safeEqual(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);}
export class Auth {
  constructor(private db:Database){}
  private cookies(req:Request){try{return parse(req.headers.cookie||'');}catch{return {};}}
  async session(req:Request,mutation=false){
    const cookies=this.cookies(req);requireThat(cookies.session,401,'UNAUTHENTICATED','Debes iniciar sesión.');
    const result=await this.db.transaction(async sql=>{
      const row=await one(sql,`SELECT u.*,s.csrf_hash,s.mfa FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND u.active AND u.session_version=s.session_version AND s.expires_at>now() AND s.last_seen>now()-($2::integer*interval '1 minute')`,[hash(cookies.session!),Number(process.env.SESSION_IDLE_MINUTES||30)]);
      requireThat(row,401,'UNAUTHENTICATED','La sesión terminó.');
      requireThat(row.role==='client'||row.mfa,403,'MFA_REQUIRED','El acceso interno requiere MFA.');
      if(mutation){requireThat(req.headers.origin===process.env.APP_ORIGIN,403,'INVALID_ORIGIN','Origen no permitido.');const csrf=req.header('X-CSRF-Token');requireThat(csrf&&safeEqual(hash(csrf),row.csrf_hash),403,'CSRF_INVALID','Token CSRF no válido.');}
      await sql.query('UPDATE sessions SET last_seen=now() WHERE token_hash=$1',[hash(cookies.session!)]);
      return asUser(row);
    });return result;
  }
  async createSession(sql:Sql,u:User,mfa:boolean){const session=token(),csrf=token();await sql.query('INSERT INTO sessions(token_hash,user_id,session_version,csrf_hash,mfa,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval \'8 hours\')',[hash(session),u.id,u.session_version,hash(csrf),mfa]);return {session,csrf};}
  private cookie(res:Response,name:string,value:string,httpOnly=true,maxAge=8*3600){res.append('Set-Cookie',serialize(name,value,{httpOnly,secure:process.env.NODE_ENV==='production',sameSite:name==='csrf'?'strict':'lax',path:'/',maxAge}));}
  async rateLimit(bucket:string,maximum=120){const result=await this.db.query(`INSERT INTO rate_limits(bucket,window_start,hits) VALUES($1,date_trunc('minute',now()),1) ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN rate_limits.window_start<date_trunc('minute',now()) THEN 1 ELSE rate_limits.hits+1 END,window_start=date_trunc('minute',now()) RETURNING hits`,[hash(bucket)]);requireThat(result.rows[0].hits<=maximum,429,'RATE_LIMIT','Demasiadas solicitudes. Inténtalo más tarde.');}
  async handle(req:Request,res:Response){
    res.setHeader('Cache-Control','no-store');
    if(req.path==='/auth/supabase/exchange'&&req.method==='POST'){
      requireThat(req.headers.origin===process.env.APP_ORIGIN,403,'INVALID_ORIGIN','Origen no permitido.');await this.rateLimit('supabase-login:'+req.ip,20);
      const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
      requireThat(base&&key&&new URL(base).protocol==='https:',503,'SUPABASE_NOT_CONFIGURED','Supabase Auth no está configurado.');
      const accessToken=req.body?.accessToken;requireThat(typeof accessToken==='string'&&accessToken.length<20000,400,'TOKEN_REQUIRED','Envía un token de acceso de Supabase.');
      const issuer=base.replace(/\/$/,'')+'/auth/v1';let claims:any;
      try{claims=(await jwtVerify(accessToken,process.env.SUPABASE_JWT_SECRET?Buffer.from(process.env.SUPABASE_JWT_SECRET):createRemoteJWKSet(new URL(issuer+'/.well-known/jwks.json')),{issuer,audience:'authenticated',algorithms:process.env.SUPABASE_JWT_SECRET?['HS256']:['RS256','ES256']})).payload;}catch{throw new ApiError(401,'SUPABASE_TOKEN_INVALID','La identidad de Supabase no pudo verificarse.');}
      const verified=await fetch(issuer+'/user',{signal:AbortSignal.timeout(10000),headers:{apikey:key,Authorization:'Bearer '+accessToken}});requireThat(verified.ok,401,'SUPABASE_TOKEN_INVALID','La cuenta de Supabase no está disponible.');const profile=await verified.json() as any;
      requireThat(profile.id===claims.sub&&profile.email_confirmed_at&&typeof profile.email==='string',401,'EMAIL_NOT_VERIFIED','La cuenta requiere correo verificado.');
      const email=profile.email.toLowerCase(),subject=issuer+'|'+profile.id;
      const credentials=await this.db.transaction(async sql=>{
        let u=await one(sql,'SELECT * FROM users WHERE subject=$1 FOR UPDATE',[subject]);
        if(!u&&typeof req.body.invitationToken==='string'){
          const invite=await one(sql,'SELECT * FROM invitations WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE',[hash(req.body.invitationToken)]);requireThat(invite&&invite.email.toLowerCase()===email,403,'INVITATION_INVALID','Invitación no válida.');const id=randomUUID();await sql.query('INSERT INTO users(id,firm_id,person_id,subject,email,name,role) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,invite.firm_id,randomUUID(),subject,email,invite.name,invite.role]);await sql.query('UPDATE invitations SET consumed_at=now() WHERE id=$1',[invite.id]);u=await one(sql,'SELECT * FROM users WHERE id=$1',[id]);
        }
        if(!u){const approved=(await sql.query('SELECT * FROM users WHERE email=$1 AND subject IS NULL AND active FOR UPDATE',[email])).rows;requireThat(approved.length===1,403,'ACCOUNT_NOT_APPROVED','La cuenta no está habilitada por el estudio.');u=approved[0];await sql.query('UPDATE users SET subject=$1 WHERE id=$2',[subject,u.id]);}
        requireThat(u.active,403,'ACCOUNT_DISABLED','La cuenta no está habilitada.');requireThat(u.role==='client'||claims.aal==='aal2',403,'MFA_REQUIRED','Completa MFA en Supabase antes de entrar al estudio.');
        return this.createSession(sql,asUser(u),claims.aal==='aal2');
      });this.cookie(res,'session',credentials.session);this.cookie(res,'csrf',credentials.csrf,false);res.json({ok:true});return;
    }
    if(req.path==='/auth/logout'&&req.method==='POST'){await this.session(req,true);await this.db.query('DELETE FROM sessions WHERE token_hash=$1',[hash(this.cookies(req).session!)]);this.cookie(res,'session','',true,0);this.cookie(res,'csrf','',false,0);res.json({ok:true});return;}
    if(req.path==='/auth/csrf'&&req.method==='GET'){await this.session(req);res.json({csrfToken:this.cookies(req).csrf});return;}
    if(req.path==='/auth/start'&&req.method==='GET'){
      await this.rateLimit('login:'+req.ip,20);const meta=await this.discovery();const state=token(),verifier=token(),nonce=token();
      const invite=typeof req.query.invitation==='string'?hash(req.query.invitation):null;
      await this.db.query('INSERT INTO login_states(state_hash,verifier,nonce,invitation_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval \'10 minutes\')',[hash(state),verifier,nonce,invite]);this.cookie(res,'oidc_state',state,true,600);
      const url=new URL(meta.authorization_endpoint);url.search=new URLSearchParams({client_id:process.env.OIDC_CLIENT_ID!,response_type:'code',scope:'openid email profile',redirect_uri:(process.env.PUBLIC_API_ORIGIN||process.env.APP_ORIGIN)+'/auth/callback',state,nonce,code_challenge:Buffer.from(createHash('sha256').update(verifier).digest()).toString('base64url'),code_challenge_method:'S256',...(process.env.OIDC_MFA_ACR?{acr_values:process.env.OIDC_MFA_ACR}:{})}).toString();res.redirect(url.toString());return;
    }
    if(req.path==='/auth/callback'&&req.method==='GET'){
      await this.rateLimit('callback:'+req.ip,30);const state=req.query.state,code=req.query.code;
      requireThat(typeof state==='string'&&typeof code==='string'&&safeEqual(this.cookies(req).oidc_state||'',state),400,'OIDC_INVALID','Respuesta de identidad no válida.');
      const login=(await this.db.query('DELETE FROM login_states WHERE state_hash=$1 AND expires_at>now() RETURNING *',[hash(state)])).rows[0];requireThat(login,400,'OIDC_EXPIRED','El acceso caducó. Vuelve a iniciarlo.');this.cookie(res,'oidc_state','',true,0);
      const meta=await this.discovery();const response=await fetch(meta.token_endpoint,{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:process.env.OIDC_CLIENT_ID!,client_secret:process.env.OIDC_CLIENT_SECRET!,redirect_uri:(process.env.PUBLIC_API_ORIGIN||process.env.APP_ORIGIN)+'/auth/callback',code_verifier:login.verifier})});
      requireThat(response.ok,401,'OIDC_FAILED','No se pudo verificar la identidad.');const tokens=await response.json() as any;requireThat(typeof tokens.id_token==='string',401,'OIDC_FAILED','Identidad no verificada.');
      let claims:any;try{claims=(await jwtVerify(tokens.id_token,createRemoteJWKSet(new URL(meta.jwks_uri)),{issuer:process.env.OIDC_ISSUER,audience:process.env.OIDC_CLIENT_ID,algorithms:['RS256','ES256'],maxTokenAge:'10m'})).payload;}catch{throw new ApiError(401,'OIDC_FAILED','Identidad no verificada.');}
      requireThat(claims.nonce===login.nonce&&claims.email_verified===true&&typeof claims.email==='string'&&typeof claims.sub==='string'&&claims.sub.length>0,401,'OIDC_FAILED','Identidad no verificada.');
      const email=claims.email.toLowerCase();const mfa=Array.isArray(claims.amr)&&(claims.amr.includes('mfa')||claims.amr.includes('pwd')&&claims.amr.includes('otp'))||!!process.env.OIDC_MFA_ACR&&claims.acr===process.env.OIDC_MFA_ACR;
      const credentials=await this.db.transaction(async sql=>{
        let u=await one(sql,'SELECT * FROM users WHERE subject=$1 FOR UPDATE',[claims.sub]);
        if(!u&&login.invitation_hash){const invitation=await one(sql,'SELECT * FROM invitations WHERE token_hash=$1 AND expires_at>now() AND consumed_at IS NULL FOR UPDATE',[login.invitation_hash]);requireThat(invitation&&invitation.email.toLowerCase()===email,403,'INVITATION_INVALID','Invitación no válida.');const id=randomUUID();await sql.query('INSERT INTO users(id,firm_id,person_id,subject,email,name,role) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,invitation.firm_id,randomUUID(),claims.sub,email,invitation.name,invitation.role]);await sql.query('UPDATE invitations SET consumed_at=now() WHERE id=$1',[invitation.id]);u=await one(sql,'SELECT * FROM users WHERE id=$1',[id]);}
        // Bootstrap binds a pre-approved email only after verification by the configured issuer.
        if(!u){u=await one(sql,'SELECT * FROM users WHERE email=$1 AND subject IS NULL AND active FOR UPDATE',[email]);if(u){await sql.query('UPDATE users SET subject=$1 WHERE id=$2',[claims.sub,u.id]);}}
        requireThat(u&&u.active,403,'ACCOUNT_DISABLED','La cuenta no está habilitada.');requireThat(u.role==='client'||mfa,403,'MFA_REQUIRED','Completa MFA con el proveedor de identidad.');return this.createSession(sql,asUser(u),!!mfa);
      });this.cookie(res,'session',credentials.session);this.cookie(res,'csrf',credentials.csrf,false);res.redirect(process.env.APP_ORIGIN!);return;
    }
    throw new ApiError(404,'NOT_FOUND','Ruta no disponible.');
  }
  private async discovery(){
    const issuer=process.env.OIDC_ISSUER;requireThat(issuer&&process.env.OIDC_CLIENT_ID&&process.env.OIDC_CLIENT_SECRET,503,'IDENTITY_NOT_CONFIGURED','El proveedor de identidad no está configurado.');
    const url=new URL(issuer);requireThat(url.protocol==='https:',503,'IDENTITY_NOT_CONFIGURED','El proveedor de identidad requiere HTTPS.');
    let meta:any;try{const r=await fetch(issuer.replace(/\/$/,'')+'/.well-known/openid-configuration',{signal:AbortSignal.timeout(10000)});requireThat(r.ok,503);meta=await r.json();}catch{throw unavailable('Identidad');}
    requireThat(meta.issuer===issuer&&['authorization_endpoint','token_endpoint','jwks_uri'].every(k=>typeof meta[k]==='string'&&new URL(meta[k]).protocol==='https:'),503,'IDENTITY_NOT_CONFIGURED','Configuración OIDC no válida.');return meta;
  }
}
