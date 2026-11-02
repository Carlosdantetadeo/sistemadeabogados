import {createHash,randomUUID} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {parse} from 'csv-parse/sync';
import {readSheet} from 'read-excel-file/node';
import nodemailer from 'nodemailer';
import {Database,Sql,Row,one} from './db.js';
import {Storage} from './storage.js';
import {User,asUser,caseAccess,activeAccount,direction} from './policy.js';
import {Documents} from './documents.js';
import {ApiError,requireThat,unavailable} from './errors.js';
import {decryptSecret} from './jobs.js';
export class Worker {
 constructor(private db:Database,private storage:Storage){}
 async schedule(){
  const calendars=(await this.db.query('SELECT * FROM calendars WHERE approved ORDER BY firm_id,id')).rows;
  const firms=new Set<string>();let count=0;
  for(const cal of calendars){
   if(firms.has(cal.firm_id))continue;firms.add(cal.firm_id);
   const actor=await one(this.db,"SELECT * FROM users WHERE firm_id=$1 AND active AND role IN ('superadmin','manager') ORDER BY id LIMIT 1",[cal.firm_id]);if(!actor)continue;
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:cal.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const holidays=new Set((cal.non_working_dates||[]).map((v:any)=>v instanceof Date?v.toISOString().slice(0,10):String(v)));
   const business=(day:string)=>{const week=new Date(day+'T12:00:00Z').getUTCDay();return week!==0&&week!==6&&!holidays.has(day);};
   const distance=(from:string,to:string)=>{if(to<from)return -1;let n=0,d=new Date(from+'T12:00:00Z');for(let guard=0;d.toISOString().slice(0,10)<to&&guard<3660;guard++){d.setUTCDate(d.getUTCDate()+1);if(business(d.toISOString().slice(0,10)))n++;}return n;};
   const insert=async(kind:string,resource:string,caseId:string|null,key:string,data:Row={})=>{const r=await this.db.query('INSERT INTO jobs(id,firm_id,requested_by,case_id,kind,resource_id,dedupe_key,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id',[randomUUID(),cal.firm_id,actor.id,caseId,kind,resource,key,JSON.stringify(data)]);count+=r.rows.length;};
   const deadlines=(await this.db.query("SELECT d.*,n.registered_at FROM deadlines d JOIN notices n ON n.id=d.notice_id WHERE d.firm_id=$1 AND d.status IN ('pending_verification','active','overdue_unfiled')",[cal.firm_id])).rows;
   for(const d of deadlines){const due=d.due_on instanceof Date?d.due_on.toISOString().slice(0,10):String(d.due_on),days=distance(today,due),registered=new Intl.DateTimeFormat('en-CA',{timeZone:cal.timezone}).format(new Date(d.registered_at));
    if(days<=0||business(today)&&[1,2,5].includes(days)||d.status==='pending_verification'&&business(today)&&distance(registered,today)>=1)await insert('deadline_alert',d.id,d.case_id,`deadline:${d.id}:${d.revision_id}:${today}`);
   }
   const mailboxes=(await this.db.query('SELECT * FROM mailboxes WHERE firm_id=$1',[cal.firm_id])).rows;
   for(const m of mailboxes){const time=new Intl.DateTimeFormat('en-GB',{timeZone:m.data.timezone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());if(business(today)&&time>=m.data.checkTime&&!await one(this.db,'SELECT 1 FROM daily_checks WHERE mailbox_id=$1 AND date=$2',[m.id,today]))await insert('coverage_alert',m.id,null,`mailbox:${m.id}:${today}`,{recipientIds:[m.backup_id,m.supervisor_id]});}
  }return {scheduled:count};
 }
 async runOnce(){
  const lease=randomUUID();const job:Row|null=await this.db.transaction<Row|null>(async sql=>{
   const found=await one(sql,"SELECT * FROM jobs WHERE available_at<=now() AND (status='queued' OR status='processing' AND leased_until<now()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1");if(!found)return null;
   await sql.query("UPDATE jobs SET status='processing',attempts=attempts+1,leased_until=now()+interval '3 minutes',lease_token=$1 WHERE id=$2",[lease,found.id]);return {...found,attempts:found.attempts+1,lease_token:lease};
  });if(!job)return {processed:0};
  try{
   const user=await one(this.db,'SELECT * FROM users WHERE id=$1 AND firm_id=$2 AND active',[job.requested_by,job.firm_id]);requireThat(user,403,'ACTOR_REVOKED','La cuenta solicitante ya no está activa.');const u=asUser(user);
   if(job.case_id)await caseAccess(this.db,u,job.case_id);
   if(job.kind==='scan')await this.scan(job,u);
   else if(job.kind==='ocr')await this.ocr(job,u);
   else if(job.kind==='import_validate')await this.importValidate(job,u);
   else if(job.kind==='invitation')await this.invitation(job,u);
   else if(job.kind==='report')await this.finish(job,u,sql=>sql.query("UPDATE reports SET status='ready' WHERE id=$1 AND firm_id=$2",[job.resource_id,u.firm_id]));
   else if(['deadline_alert','reminder','coverage_alert','access_alert'].includes(job.kind))await this.notification(job,u);
   else requireThat(false,422,'UNSUPPORTED_JOB','Trabajo no permitido.');
   return {processed:1,status:'completed'};
  }catch(error){
   const code=error instanceof ApiError?error.code:'PROCESSOR_FAILED',retry=job.attempts<5&&!(error instanceof ApiError&&[403,404,422].includes(error.status));
   await this.db.transaction(async sql=>{
    const owned=await one(sql,"SELECT id FROM jobs WHERE id=$1 AND lease_token=$2 AND status='processing' FOR UPDATE",[job.id,lease]);if(!owned)return;
    await sql.query('UPDATE jobs SET status=$1,error_code=$2,available_at=now()+interval \'1 minute\',leased_until=NULL WHERE id=$3',[retry?'queued':'failed',code,job.id]);
    const table=job.kind==='scan'?'uploads':job.kind==='ocr'?'ocr_jobs':job.kind==='import_validate'?'imports':job.kind==='report'?'reports':null;
    if(table&&!retry){await sql.query(`UPDATE ${table} SET status=$1${table==='uploads'||table==='ocr_jobs'?',error_code=$4':''} WHERE id=$2 AND firm_id=$3`,[job.kind==='scan'?'rejected':'failed',job.resource_id,job.firm_id,...(table==='uploads'||table==='ocr_jobs'?[code]:[])]);if(table==='imports')await sql.query('UPDATE imports SET data=data||$1::jsonb WHERE id=$2 AND firm_id=$3',[JSON.stringify({failureCode:code}),job.resource_id,job.firm_id]);}
   });return {processed:1,status:retry?'retry_pending':'failed',code};
  }
 }
 private async finish(job:Row,u:User,work:(sql:Sql)=>Promise<unknown>){return this.db.transaction(async sql=>{
  const owned=await one(sql,"SELECT id FROM jobs WHERE id=$1 AND lease_token=$2 AND status='processing' AND leased_until>now() FOR UPDATE",[job.id,job.lease_token]);requireThat(owned,409,'LEASE_EXPIRED','El trabajo cambió de ejecutor.');
  const active=await one(sql,'SELECT * FROM users WHERE id=$1 AND firm_id=$2 AND active',[u.id,u.firm_id]);requireThat(active&&active.session_version===u.session_version,403,'ACTOR_REVOKED','La cuenta o perfil cambió durante el trabajo.');if(job.case_id)await caseAccess(sql,asUser(active),job.case_id);
  await work(sql);await sql.query("UPDATE jobs SET status='completed',leased_until=NULL WHERE id=$1 AND lease_token=$2",[job.id,job.lease_token]);
 });}
 private async processor(kind:'DOCUMENT'|'OCR',payload:Row){
  const url=process.env[kind+'_PROCESSOR_URL'],secret=process.env[kind+'_PROCESSOR_TOKEN'];if(!url||!secret)throw unavailable(kind==='OCR'?'Motor OCR':'Análisis documental');requireThat(new URL(url).protocol==='https:'||process.env.NODE_ENV==='test',503,'INVALID_PROCESSOR','El procesador requiere HTTPS.');
  const r=await fetch(url,{method:'POST',signal:AbortSignal.timeout(25000),headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(payload)});requireThat(r.ok,503,'PROCESSOR_UNAVAILABLE','El procesador no pudo completar el trabajo.');const raw=await r.text();requireThat(raw.length<=3*1024*1024,422,'PROCESSOR_RESPONSE_TOO_LARGE','Reduce el lote de páginas.');return JSON.parse(raw);
 }
 private async scan(job:Row,u:User){
  const r=await one(this.db,'SELECT * FROM uploads WHERE id=$1 AND firm_id=$2',[job.resource_id,u.firm_id]);requireThat(r&&r.status==='analyzing',409,'UPLOAD_NOT_ANALYZING','Carga no disponible.');await caseAccess(this.db,u,r.case_id,'upload');
  const head=await this.storage.head(r.object_key);requireThat(head.size===r.data.sizeBytes&&head.size<=100*1024*1024,422,'SIZE_MISMATCH','Tamaño real no válido.');const data=await this.storage.read(r.object_key);const mime=r.data.mime;
  const matches=mime==='application/pdf'?data.subarray(0,5).toString()==='%PDF-':mime==='image/png'?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?data[0]===255&&data[1]===216&&data[2]===255:data[0]===80&&data[1]===75;
  requireThat(matches,422,'MIME_MISMATCH','El contenido no corresponde al formato declarado.');const sha=createHash('sha256').update(data).digest('hex');
  const result=await this.processor('DOCUMENT',{fileBase64:data.toString('base64'),mime,sha256:sha,requireMalwareScan:true,requireActiveContentCheck:true});
  requireThat(result.clean===true&&result.activeContent===false&&result.sha256===sha&&typeof result.previewPdfBase64==='string',422,'DOCUMENT_REJECTED','Análisis no satisfactorio o sin vista previa segura.');const preview=Buffer.from(result.previewPdfBase64,'base64');requireThat(preview.subarray(0,5).toString()==='%PDF-'&&preview.length<=100*1024*1024,422,'PREVIEW_INVALID','Vista previa no válida.');
  // The upload URL can only overwrite quarantine. Validated objects get new private keys.
  const key=`${u.firm_id}/validated/${r.id}/original`,previewKey=`${u.firm_id}/validated/${r.id}/preview.pdf`;await this.storage.put(key,data,mime);await this.storage.put(previewKey,preview,'application/pdf');
  await this.finish(job,u,async sql=>{await caseAccess(sql,u,r.case_id,'upload');await sql.query("UPDATE uploads SET status='preview_ready',object_key=$1,preview_key=$2,sha256=$3,version=version+1 WHERE id=$4 AND firm_id=$5",[key,previewKey,sha,r.id,u.firm_id]);});
 }
 private async ocr(job:Row,u:User){
  const o=await one(this.db,'SELECT * FROM ocr_jobs WHERE id=$1 AND firm_id=$2',[job.resource_id,u.firm_id]);requireThat(o,404);const docs=new Documents(this.storage),source=await docs.sourceVersion(this.db,u,o.source_version_id,'upload');
  requireThat(['application/pdf','image/jpeg','image/png'].includes(source.v.mime),422,'OCR_FORMAT_UNSUPPORTED','OCR solo admite PDF e imágenes.');const bytes=await this.storage.read(source.v.object_key);const result=await this.processor('OCR',{fileBase64:bytes.toString('base64'),mime:source.v.mime,language:'es',extractEmbeddedTextFirst:true,sourceSha256:source.v.sha256});
  requireThat(Array.isArray(result.pages)&&result.pages.length>0&&result.pages.length<=500&&typeof result.engine==='string'&&typeof result.engineVersion==='string',422,'OCR_RESULT_INVALID','Resultado OCR no válido.');const used=new Set<number>();
  for(const p of result.pages){requireThat(Number.isSafeInteger(p.page)&&p.page>0&&!used.has(p.page)&&typeof p.text==='string'&&p.text.length<=50000,422,'OCR_RESULT_INVALID','Página OCR no válida.');if(p.confidence!==undefined)requireThat(typeof p.confidence==='number'&&p.confidence>=0&&p.confidence<=1,422,'OCR_RESULT_INVALID','Confianza no válida.');used.add(p.page);}
  await this.finish(job,u,async sql=>{
   await docs.sourceVersion(sql,u,o.source_version_id,'upload');await sql.query('DELETE FROM ocr_pages WHERE job_id=$1 AND firm_id=$2',[o.id,u.firm_id]);for(const p of result.pages)await sql.query('INSERT INTO ocr_pages(id,firm_id,job_id,page,raw_text,confidence) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),u.firm_id,o.id,p.page,p.text,p.confidence??null]);await sql.query("UPDATE ocr_jobs SET status='needs_review',engine=$1,engine_version=$2,revision=revision+1 WHERE id=$3 AND firm_id=$4",[result.engine,result.engineVersion,o.id,u.firm_id]);
  });
 }
 private async importValidate(job:Row,u:User){
  const r=await one(this.db,'SELECT * FROM imports WHERE id=$1 AND firm_id=$2',[job.resource_id,u.firm_id]);requireThat(r&&r.status==='validating',409,'IMPORT_NOT_VALIDATING','Lote no disponible.');requireThat(r.requested_by===u.id||direction(u),403);
  const file=await this.storage.read(r.object_key);requireThat(file.length<=25*1024*1024&&createHash('sha256').update(file).digest('hex')===r.source_hash,422,'SOURCE_HASH_MISMATCH','La planilla cambió.');
  let raw:unknown[][];
  if(r.data.sourceType==='csv')raw=parse(file,{bom:true,skip_empty_lines:true,max_record_size:100000,relax_column_count:false}) as unknown[][];
  else{await this.safeZip(file);raw=await readSheet(file);}
  requireThat(raw.length>1&&raw.length<=5001&&raw[0].length<=50,422,'IMPORT_LIMIT','La plantilla debe tener entre 1 y 5000 filas y hasta 50 columnas.');
  const headers=raw[0].map(String);requireThat(new Set(headers).size===headers.length&&!headers.some(h=>['__proto__','prototype','constructor'].includes(h)),422,'INVALID_COLUMNS','Columnas no válidas.');
  const groups=new Map<string,string>(),seen=new Set<string>(),prepared:Row[]=[];
  const required=['clientName','projectCode','projectName','partnerId','leadId','caseTitle','responsibleId','followupId','backupId'];
  for(let index=1;index<raw.length;index++){
   const data:Row={};for(const [field,column] of Object.entries(r.data.mapping as Row)){requireThat(!['__proto__','prototype','constructor'].includes(field),422,'INVALID_MAPPING','Mapa no válido.');const at=headers.indexOf(String(column));if(at>=0)data[field]=raw[index][at] instanceof Date?(raw[index][at] as Date).toISOString().slice(0,10):String(raw[index][at]??'').trim();}
   const group=groups.get(data.projectCode)||randomUUID();groups.set(data.projectCode,group);let error:string|null=null;
   if(required.some(k=>!data[k]))error='MISSING_FIELDS';
   else if(data.dueOn&&(!/^\d{4}-\d{2}-\d{2}$/.test(data.dueOn)||!Number.isFinite(Date.parse(data.dueOn))||new Date(data.dueOn).toISOString().slice(0,10)!==data.dueOn))error='INVALID_DATE';
   else if(data.caseType&&!['judicial','extrajudicial'].includes(data.caseType))error='INVALID_TYPE';
   else if(data.followupId===data.backupId)error='INVALID_TEAM';
   const duplicate=data.projectCode+'|'+data.caseTitle;if(seen.has(duplicate))error='DUPLICATE_ROW';seen.add(duplicate);
   if(!error){try{await activeAccount(this.db,u,data.partnerId,['manager','superadmin']);await activeAccount(this.db,u,data.leadId,['lawyer']);await activeAccount(this.db,u,data.responsibleId,['lawyer']);await activeAccount(this.db,u,data.followupId,['lawyer','assistant']);await activeAccount(this.db,u,data.backupId,['lawyer','assistant']);}catch{error='INVALID_ACCOUNT';}}
   if(await one(this.db,'SELECT 1 FROM projects WHERE firm_id=$1 AND code=$2',[u.firm_id,data.projectCode||'']))error='DUPLICATE_PROJECT';
   prepared.push({data,group,error,row:index+1});
  }
  // A project group cannot have conflicting parent data or a partially valid outcome.
  for(const group of groups.values()){const rows=prepared.filter(p=>p.group===group),first=rows[0].data;const incompatible=rows.some(p=>['clientName','projectName','partnerId','leadId'].some(k=>p.data[k]!==first[k]));if(incompatible||rows.some(p=>p.error))for(const row of rows)row.error||=incompatible?'GROUP_CONFLICT':'GROUP_INVALID';}
  await this.finish(job,u,async sql=>{await sql.query('DELETE FROM import_rows WHERE import_id=$1 AND firm_id=$2',[r.id,u.firm_id]);for(const p of prepared)await sql.query('INSERT INTO import_rows(id,firm_id,import_id,row_number,project_group,status,data,error_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),u.firm_id,r.id,p.row,p.group,p.error?'invalid':'valid',JSON.stringify(p.data),p.error]);await sql.query("UPDATE imports SET status='validated',version=version+1 WHERE id=$1 AND firm_id=$2",[r.id,u.firm_id]);});
 }
 private async safeZip(file:Buffer){
  // Inspect the central directory before inflating untrusted spreadsheet XML.
  const end=file.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));requireThat(end>=0&&end+22<=file.length,422,'INVALID_XLSX','Archivo XLSX no válido.');const entries=file.readUInt16LE(end+10);let at=file.readUInt32LE(end+16),total=0;requireThat(entries<=2000,422,'XLSX_LIMIT','Demasiadas entradas en XLSX.');
  for(let n=0;n<entries;n++){
   requireThat(at+46<=file.length&&file.readUInt32LE(at)===0x02014b50,422,'INVALID_XLSX','Directorio XLSX no válido.');
   const size=file.readUInt32LE(at+24),packed=file.readUInt32LE(at+20),method=file.readUInt16LE(at+10),nameLength=file.readUInt16LE(at+28),extra=file.readUInt16LE(at+30),comment=file.readUInt16LE(at+32),flags=file.readUInt16LE(at+8),local=file.readUInt32LE(at+42);total+=size;
   const name=file.subarray(at+46,at+46+nameLength).toString();
   requireThat(!(flags&1)&&[0,8].includes(method)&&size<=20*1024*1024&&total<=100*1024*1024&&!/\.bin$|\.\.|^\//i.test(name)&&local+30<=file.length&&file.readUInt32LE(local)===0x04034b50,422,'UNSAFE_XLSX','XLSX cifrado, activo o demasiado grande.');
   const start=local+30+file.readUInt16LE(local+26)+file.readUInt16LE(local+28);requireThat(start+packed<=file.length,422,'INVALID_XLSX','Contenido XLSX truncado.');
   let decoded:Buffer;try{decoded=method===0?file.subarray(start,start+packed):inflateRawSync(file.subarray(start,start+packed),{maxOutputLength:Math.max(size,1)});}catch{throw new ApiError(422,'UNSAFE_XLSX','La expansión real supera sus límites.');}
   requireThat(decoded.length===size,422,'UNSAFE_XLSX','La expansión no coincide con el directorio.');
   if(/\.(xml|rels)$/i.test(name))requireThat(!decoded.includes(0)&&!/<!(DOCTYPE|ENTITY)/i.test(decoded.toString('utf8')),422,'UNSAFE_XLSX','XML activo o codificación no permitida.');
   at+=46+nameLength+extra+comment;
  }
 }
 private async invitation(job:Row,u:User){
  const invitation=await one(this.db,'SELECT * FROM invitations WHERE id=$1 AND firm_id=$2 AND consumed_at IS NULL AND expires_at>now()',[job.resource_id,u.firm_id]);requireThat(invitation,422,'INVITATION_EXPIRED','Invitación caducada.');await this.mail(invitation.email,'Invitación al estudio','Accede para aceptar la invitación: '+decryptSecret(job.data.encryptedUrl));await this.finish(job,u,async()=>{});
 }
 private async mail(to:string,subject:string,text:string){
  if(!process.env.SMTP_HOST||!process.env.MAIL_FROM)throw unavailable('Correo');const port=Number(process.env.SMTP_PORT||587),transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,requireTLS:port!==465,auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined,disableFileAccess:true,disableUrlAccess:true});
  await transport.sendMail({from:process.env.MAIL_FROM,to,subject,text});transport.close();
 }
 private async notification(job:Row,u:User){
  let recipients:string[]=[];
  if(job.kind==='deadline_alert'){const d=await one(this.db,"SELECT * FROM deadlines WHERE id=$1 AND firm_id=$2 AND status IN ('pending_verification','active','overdue_unfiled')",[job.resource_id,u.firm_id]);if(!d){await this.finish(job,u,async()=>{});return;}recipients=[d.responsible_id,d.backup_id];const managers=(await this.db.query("SELECT id FROM users WHERE firm_id=$1 AND active AND role IN ('manager','superadmin')",[u.firm_id])).rows;recipients.push(...managers.map(m=>m.id));}
  else if(job.kind==='reminder'){const t=await one(this.db,"SELECT * FROM tasks WHERE id=$1 AND firm_id=$2 AND status IN ('pending','in_progress')",[job.resource_id,u.firm_id]);if(t)recipients=[t.assignee_id];}
  else recipients=job.data.recipientIds||(await this.db.query("SELECT id FROM users WHERE firm_id=$1 AND active AND role IN ('manager','superadmin')",[u.firm_id])).rows.map(r=>r.id);
  for(const recipient of new Set(recipients)){
   const person=await one(this.db,'SELECT * FROM users WHERE id=$1 AND firm_id=$2 AND active',[recipient,u.firm_id]);if(!person)continue;if(job.case_id){try{await caseAccess(this.db,asUser(person),job.case_id);}catch{continue;}}
   const eventKey=job.id+':'+recipient;await this.db.query('INSERT INTO deliveries(id,firm_id,user_id,event_key,case_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_key) DO NOTHING',[randomUUID(),u.firm_id,recipient,eventKey,job.case_id]);const delivery=await one(this.db,'SELECT * FROM deliveries WHERE event_key=$1',[eventKey]);if(delivery.status==='accepted')continue;
   try{await this.mail(person.email,'Novedad en el estudio','Hay una novedad que requiere revisión. Inicia sesión en el sistema del estudio.');await this.db.query("UPDATE deliveries SET status='accepted',attempts=attempts+1,last_attempt_at=now() WHERE id=$1",[delivery.id]);}catch(e){await this.db.query("UPDATE deliveries SET status='failed',attempts=attempts+1,last_attempt_at=now() WHERE id=$1",[delivery.id]);throw e;}
  }
  await this.finish(job,u,async()=>{});
 }
}
