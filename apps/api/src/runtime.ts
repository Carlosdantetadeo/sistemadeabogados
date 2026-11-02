import {createHash,randomUUID} from 'node:crypto';
import type {Request,Response} from 'express';
import {Database,Sql,one,Row} from './db.js';
import {Auth,safeEqual} from './auth.js';
import {Contract} from './contract.js';
import {Core} from './core.js';
import {Finance} from './finance.js';
import {Operations} from './operations.js';
import {Documents} from './documents.js';
import {PortalReports} from './portal-reports.js';
import {Imports} from './imports.js';
import {Worker} from './worker.js';
import {Storage} from './storage.js';
import {User,asUser,caseAccess,economic,manage,admin} from './policy.js';
import {projectAccess} from './core.js';
import {ApiError,requireThat,missing} from './errors.js';
export function canonical(value:any):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export class Runtime {
 readonly auth:Auth;readonly contract=new Contract();readonly core=new Core();readonly finance=new Finance();readonly operations=new Operations();readonly documents:Documents;readonly portal=new PortalReports();
 readonly imports:Imports;readonly worker:Worker;
 constructor(readonly db:Database,storage:Storage){this.auth=new Auth(db);this.documents=new Documents(storage);this.imports=new Imports(storage);this.worker=new Worker(db,storage);}
 async execute(req:Request,res:Response){
  const requestId=randomUUID();res.setHeader('X-Request-Id',requestId);res.setHeader('Cache-Control','no-store');
  try{
    if(req.path.startsWith('/auth/'))return await this.auth.handle(req,res);
    if(req.path==='/healthz'){res.json({status:'process_ready',version:'0.1.0'});return;}
    if(req.path==='/internal/jobs/run'){
      const secret=process.env.WORKER_SECRET;requireThat(secret&&secret.length>=32&&safeEqual(req.header('Authorization')||'','Bearer '+secret),403,'FORBIDDEN','Acceso no permitido.');
      requireThat(req.method==='GET'||req.method==='POST',405,'METHOD_NOT_ALLOWED','Método no permitido.');await this.worker.schedule();res.json(await this.worker.runOnce());return;
    }
    const path=req.path.replace(/^\/api\/v1/,'');const route=this.contract.match(req.method,path);if(!route)throw missing();
    const {op,params}=route;const actor=await this.auth.session(req,req.method!=='GET');this.contract.validate(op,params,req.query,req.body);await this.auth.rateLimit('user:'+actor.id);
    const body=req.body||{},id=params.id||'',query=req.query;
    const response=await this.db.transaction(async sql=>{
      const current=await one(sql,`SELECT * FROM users WHERE id=$1 AND firm_id=$2 AND active AND session_version=$3${req.method==='GET'?'':' FOR UPDATE'}`,[actor.id,actor.firm_id,actor.session_version]);requireThat(current,401,'UNAUTHENTICATED','La cuenta o sesión cambió.');const u=asUser(current);
      const idem=op.parameters.some(p=>p.name==='Idempotency-Key');let key:string|undefined,bodyHash:string|undefined;
      if(idem){key=req.header('Idempotency-Key');requireThat(key&&key.length>=16&&key.length<=128,400,'IDEMPOTENCY_REQUIRED','Usa una clave idempotente entre 16 y 128 caracteres.');bodyHash=createHash('sha256').update(canonical({path,body})).digest('hex');const cached=await one(sql,'SELECT * FROM idempotency_records WHERE actor_id=$1 AND operation=$2 AND key=$3 AND expires_at>now()',[u.id,req.method+' '+path,key]);if(cached){requireThat(cached.body_hash===bodyHash,409,'IDEMPOTENCY_CONFLICT','La clave ya fue utilizada con otro contenido.');await this.authorizeReplay(sql,u,op.operationId,id,cached.response,body);return cached.response;}}
      let result:any;
      for(const service of [this.core,this.finance,this.operations,this.documents,this.portal,this.imports]){result=await service.handle(op.operationId,sql,u,id,body,query,req.header('range'));if(result!==undefined)break;}
      requireThat(result!==undefined,503,'NOT_IMPLEMENTED','Esta capacidad todavía no está disponible.');
      if(!result.binary)result=this.contract.validateResponse(op,result);
      if(idem&&!result.binary){await sql.query('DELETE FROM idempotency_records WHERE actor_id=$1 AND operation=$2 AND key=$3 AND expires_at<=now()',[u.id,req.method+' '+path,key]);await sql.query('INSERT INTO idempotency_records(firm_id,actor_id,operation,key,body_hash,response) VALUES($1,$2,$3,$4,$5,$6)',[u.firm_id,u.id,req.method+' '+path,key,bodyHash,JSON.stringify(result)]);}
      return result;
    });
    if(response.binary){const buffer=response.binary as Buffer;requireThat(buffer.length<=3*1024*1024,413,'RESPONSE_TOO_LARGE','Reduce el tamaño de la descarga o usa rangos.');res.status(response.status||200);res.setHeader('Content-Type',response.mime);res.setHeader('Content-Disposition',`attachment; filename="${String(response.filename||'archivo').replace(/[^a-zA-Z0-9._-]/g,'_')}"`);for(const [k,v] of Object.entries(response.headers||{}))res.setHeader(k,String(v));res.send(buffer);return;}
    const status=Object.keys(op.responses).find(k=>k.startsWith('2'))||'200';res.status(Number(status)).json(response);
  }catch(error){this.respondError(error,res,requestId);}
 }
 private async authorizeReplay(sql:Sql,u:User,op:string,id:string,response:Row,b:Row){
   // Idempotent replies never bypass revocation or financial authorization.
   if(['createCost','createBillingDraft','approveCost','adjustCost','confirmBilling','cancelBilling','createPayment','reversePayment'].includes(op)){
     if(op==='createCost')await this.finance.cost(sql,u,response.id);
     else if(op==='approveCost'||op==='adjustCost')await this.finance.cost(sql,u,id);
     else if(op==='createPayment'||op==='reversePayment'){const p=await one(sql,'SELECT i.draft_id FROM payments p JOIN invoice_references i ON i.id=p.invoice_id WHERE p.id=$1 AND p.firm_id=$2',[response.id,u.firm_id]);if(!p)throw missing();await this.finance.billing(sql,u,p.draft_id);}
     else await this.finance.billing(sql,u,op==='createBillingDraft'?response.id:id);return;
   }
   if(op==='publishDocument'){const {c}=await this.documents.document(sql,u,id,'publish');requireThat(u.role!=='lawyer'||c.responsible_id===u.id,403);return;}
   if(['setClientMembership','setClientCreationGrant','setProjectEconomicGrant'].includes(op)){manage(u);if(op==='setClientMembership')admin(u);if(op==='setProjectEconomicGrant')await projectAccess(sql,u,id);else requireThat(await one(sql,'SELECT 1 FROM clients WHERE id=$1 AND firm_id=$2',[id,u.firm_id]),404);return;}
   if(op==='confirmImport'){requireThat(['manager','superadmin','lawyer'].includes(u.role),403);return;}
   if(op==='createOCRJob'){await this.documents.sourceVersion(sql,u,id,'upload');return;}
   if(op==='reviewOCRJob'){await this.documents.sourceVersion(sql,u,b.sourceVersionId,'upload');return;}
   if(['transferCase','createGrant','createDelegation'].includes(op)){await caseAccess(sql,u,id,'manage_access');return;}
   if(op==='transitionCase'){await caseAccess(sql,u,id,'edit');return;}
   const resources:Record<string,{table:string;action:string}>={revokeGrant:{table:'case_grants',action:'manage_access'},verifyDeadline:{table:'deadlines',action:'verify_deadline'},transitionDeadline:{table:'deadlines',action:'propose_deadline'},completeUpload:{table:'uploads',action:'upload'},confirmUpload:{table:'uploads',action:'upload'},publishActivity:{table:'activities',action:'publish'},revokePublication:{table:'publications',action:'publish'}};
   if(resources[op]){const r=resources[op];const row=await one(sql,`SELECT * FROM ${r.table} WHERE id=$1 AND firm_id=$2`,[id,u.firm_id]);if(!row)throw missing();const c=await caseAccess(sql,u,row.case_id,r.action);if(row.data?.classification==='financial')await economic(sql,u,c);if(['publishActivity','revokePublication'].includes(op))requireThat(u.role!=='lawyer'||c.responsible_id===u.id,403);return;}
   if(op==='executeDeletion'||op==='restoreDocument'){requireThat(u.role==='superadmin',403);let did=id;if(op==='executeDeletion'){const r=await one(sql,'SELECT document_id FROM deletion_requests WHERE id=$1 AND firm_id=$2',[id,u.firm_id]);if(!r)throw missing();did=r.document_id;}await this.documents.document(sql,u,did,'delete_document',true);return;}
   requireThat(u.role!=='client',403,'FORBIDDEN','Acción no permitida.');
 }
 private respondError(error:unknown,res:Response,requestId:string){
   if(res.headersSent){res.end();return;}
   let e=error instanceof ApiError?error:null;const code=(error as any)?.code;
   if(!e&&code==='23505')e=new ApiError(409,'DUPLICATE','El registro ya existe o fue reservado.');
   if(!e&&['23503','23514','22003','22007'].includes(code))e=new ApiError(422,'INVALID_RELATION','Revisa relaciones, fechas e importes.');
   if(!e){e=new ApiError(500,'INTERNAL_ERROR','No se pudo completar la operación.');console.error(JSON.stringify({requestId,code:'INTERNAL_ERROR',type:error instanceof Error?error.name:'Unknown'}));}
   res.status(e.status).json({code:e.code,message:e.message,requestId,...(e.fields?{fields:e.fields}:{})});
 }
}
