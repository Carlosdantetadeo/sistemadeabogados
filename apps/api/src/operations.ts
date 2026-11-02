import {randomUUID} from 'node:crypto';
import {Sql,one,Row} from './db.js';
import {User,caseAccess,caseScope,teamMember,activeAccount,audit,version,internal,admin,manage,maximum,direction} from './policy.js';
import {missing,requireThat,unavailable} from './errors.js';
import {userView} from './core.js';
import {hash,token} from './auth.js';
import {pagination} from './paging.js';
import {enqueue,encryptSecret} from './jobs.js';
const activityView=(r:Row)=>({id:r.id,caseId:r.case_id,revisionId:r.revision_id,title:r.data.title,description:r.data.description,occurredAt:r.data.occurredAt,authorId:r.author_id,version:r.version});
const taskView=(r:Row)=>({id:r.id,caseId:r.case_id,title:r.data.title,assigneeId:r.assignee_id,dueOn:r.data.dueOn,dueAt:r.data.dueAt,timezone:r.data.timezone,status:r.status,version:r.version});
const hearingView=(r:Row)=>({id:r.id,caseId:r.case_id,...r.data,version:r.version});
const noticeView=(r:Row)=>({id:r.id,caseId:r.case_id,source:r.data.source,receivedAt:r.received_at,registeredAt:r.registered_at,registeredBy:r.registered_by,supportVersionId:r.support_version_id||undefined,status:r.status,version:r.version});
export const deadlineView=(r:Row)=>({id:r.id,caseId:r.case_id,noticeId:r.notice_id,revisionId:r.revision_id,title:r.data.title,dueOn:r.due_on instanceof Date?r.due_on.toISOString().slice(0,10):r.due_on,registeredBy:r.registered_by,verifiedBy:r.verified_by||undefined,status:r.status,version:r.version});
const mailboxView=(r:Row)=>({id:r.id,alias:r.data.alias,responsibleId:r.responsible_id,backupId:r.backup_id,checkTime:r.data.checkTime,timezone:r.data.timezone,version:r.version});
const tables:Record<string,{table:string;view:(r:Row)=>Row;action:string}>={Activity:{table:'activities',view:activityView,action:'activity'},Task:{table:'tasks',view:taskView,action:'tasks'},Hearing:{table:'hearings',view:hearingView,action:'tasks'},Notice:{table:'notices',view:noticeView,action:'propose_deadline'}};
export class Operations {
 async handle(op:string,sql:Sql,u:User,id:string,b:Row,q:Row):Promise<any>{
  if(['listUsers','createInvitation','updateUser','revokeSessions'].includes(op))return this.accounts(op,sql,u,id,b,q);
  for(const [name,config] of Object.entries(tables)){
    if(op==='list'+name||op==='create'+name){
      internal(u);const c=await caseAccess(sql,u,id,op.startsWith('create')?config.action:'read');const p=pagination(q,u,op+id);
      if(op.startsWith('list'))return p.page((await sql.query(`SELECT * FROM ${config.table} WHERE case_id=$1 AND firm_id=$2 ORDER BY id LIMIT $3 OFFSET $4`,[id,u.firm_id,p.limit+1,p.offset])).rows.map(config.view));
      const rid=randomUUID();
      if(name==='Activity'){
        const rev=randomUUID();await sql.query('INSERT INTO activities(id,firm_id,case_id,revision_id,author_id,data) VALUES($1,$2,$3,$4,$5,$6)',[rid,u.firm_id,id,rev,u.id,JSON.stringify(b)]);await sql.query('INSERT INTO activity_revisions(id,firm_id,activity_id,author_id,data) VALUES($1,$2,$3,$4,$5)',[rev,u.firm_id,rid,u.id,JSON.stringify(b)]);
      }else if(name==='Task'){
        await teamMember(sql,u,c,b.assigneeId);requireThat(b.dueOn||b.dueAt,422,'DUE_REQUIRED','Define un vencimiento.');if(b.dueAt)requireThat(b.timezone,422,'TIMEZONE_REQUIRED','Define la zona horaria.');await sql.query('INSERT INTO tasks(id,firm_id,case_id,assignee_id,data) VALUES($1,$2,$3,$4,$5)',[rid,u.firm_id,id,b.assigneeId,JSON.stringify(b)]);
      }else if(name==='Hearing'){
        try{new Intl.DateTimeFormat('es',{timeZone:b.timezone}).format();}catch{requireThat(false,422,'INVALID_TIMEZONE','Zona horaria no válida.');}await sql.query('INSERT INTO hearings(id,firm_id,case_id,data) VALUES($1,$2,$3,$4)',[rid,u.firm_id,id,JSON.stringify(b)]);
      }else{
        requireThat(await one(sql,"SELECT 1 FROM document_versions v JOIN documents d ON d.id=v.document_id WHERE v.id=$1 AND v.firm_id=$2 AND d.case_id=$3 AND d.classification='operational' AND d.status='available'",[b.supportVersionId,u.firm_id,id]),422,'INVALID_SUPPORT','Documento soporte no disponible.');await sql.query('INSERT INTO notices(id,firm_id,case_id,registered_by,support_version_id,received_at,data) VALUES($1,$2,$3,$4,$5,$6,$7)',[rid,u.firm_id,id,u.id,b.supportVersionId,b.receivedAt,JSON.stringify(b)]);
      }
      await audit(sql,u,rid,op,id);if(name==='Task')await enqueue(sql,u,'reminder',rid,id,{dueAt:b.remindAt||b.dueAt||b.dueOn});return config.view(await one(sql,`SELECT * FROM ${config.table} WHERE id=$1 AND firm_id=$2`,[rid,u.firm_id]));
    }
  }
  if(op==='updateActivity'){
    internal(u);const a=await one(sql,'SELECT * FROM activities WHERE id=$1 AND firm_id=$2 FOR UPDATE',[id,u.firm_id]);if(!a)throw missing();await caseAccess(sql,u,a.case_id,'activity');version(a,b);const rev=randomUUID(),data={...a.data,...b};await sql.query('INSERT INTO activity_revisions(id,firm_id,activity_id,author_id,data,reason) VALUES($1,$2,$3,$4,$5,$6)',[rev,u.firm_id,id,u.id,JSON.stringify(data),b.reason]);await sql.query('UPDATE activities SET revision_id=$1,data=$2,version=version+1 WHERE id=$3 AND firm_id=$4',[rev,JSON.stringify(data),id,u.firm_id]);await audit(sql,u,id,op,a.case_id,b.reason,a.data,data);return activityView(await one(sql,'SELECT * FROM activities WHERE id=$1 AND firm_id=$2',[id,u.firm_id]));
  }
  if(op==='updateTask'){
    internal(u);const t=await one(sql,'SELECT * FROM tasks WHERE id=$1 AND firm_id=$2 FOR UPDATE',[id,u.firm_id]);if(!t)throw missing();await caseAccess(sql,u,t.case_id,'tasks');version(t,b);requireThat(u.role!=='assistant'||t.assignee_id===u.id,403,'FORBIDDEN','Solo puedes actualizar tus tareas.');requireThat(b.status!=='cancelled'||b.reason,422,'REASON_REQUIRED','Indica el motivo de cancelación.');await sql.query('UPDATE tasks SET status=$1,version=version+1 WHERE id=$2 AND firm_id=$3',[b.status,id,u.firm_id]);await audit(sql,u,id,op,t.case_id,b.reason,{status:t.status},{status:b.status});return taskView(await one(sql,'SELECT * FROM tasks WHERE id=$1 AND firm_id=$2',[id,u.firm_id]));
  }
  if(op==='listDeadlines'){internal(u);await caseAccess(sql,u,id);const p=pagination(q,u,op+id);return p.page((await sql.query('SELECT * FROM deadlines WHERE case_id=$1 AND firm_id=$2 ORDER BY due_on,id LIMIT $3 OFFSET $4',[id,u.firm_id,p.limit+1,p.offset])).rows.map(deadlineView));}
  if(op==='createDeadline'){
    internal(u);const n=await one(sql,'SELECT * FROM notices WHERE id=$1 AND firm_id=$2 FOR UPDATE',[id,u.firm_id]);if(!n)throw missing();const c=await caseAccess(sql,u,n.case_id,'propose_deadline');await teamMember(sql,u,c,b.responsibleId);await teamMember(sql,u,c,b.backupId);requireThat(b.responsibleId!==b.backupId,422,'INVALID_TEAM','Responsable y suplente distintos.');requireThat(await one(sql,"SELECT 1 FROM document_versions v JOIN documents d ON d.id=v.document_id WHERE v.id=$1 AND v.firm_id=$2 AND d.case_id=$3 AND d.classification='operational' AND d.status='available'",[b.supportVersionId,u.firm_id,c.id]),422,'INVALID_SUPPORT','Revisa el soporte.');
    const did=randomUUID(),rev=randomUUID();await sql.query('INSERT INTO deadlines(id,firm_id,case_id,notice_id,registered_by,revision_id,due_on,responsible_id,backup_id,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[did,u.firm_id,c.id,id,u.id,rev,b.dueOn,b.responsibleId,b.backupId,JSON.stringify(b)]);await sql.query('INSERT INTO deadline_revisions(id,firm_id,deadline_id,author_id,data) VALUES($1,$2,$3,$4,$5)',[rev,u.firm_id,did,u.id,JSON.stringify(b)]);await sql.query("UPDATE notices SET status='untreated',version=version+1 WHERE id=$1 AND firm_id=$2",[id,u.firm_id]);await audit(sql,u,did,op,c.id);await enqueue(sql,u,'deadline_alert',did,c.id);return deadlineView(await one(sql,'SELECT * FROM deadlines WHERE id=$1 AND firm_id=$2',[did,u.firm_id]));
  }
  if(['updateDeadline','verifyDeadline','transitionDeadline'].includes(op)){
    internal(u);const d=await one(sql,'SELECT * FROM deadlines WHERE id=$1 AND firm_id=$2 FOR UPDATE',[id,u.firm_id]);if(!d)throw missing();const c=await caseAccess(sql,u,d.case_id,op==='verifyDeadline'?'verify_deadline':'propose_deadline');version(d,b);
    if(op==='verifyDeadline'){
      requireThat(d.data.supportVersionId&&await one(sql,"SELECT 1 FROM document_versions v JOIN documents x ON x.id=v.document_id WHERE v.id=$1 AND v.firm_id=$2 AND x.case_id=$3 AND x.classification='operational' AND x.status='available'",[d.data.supportVersionId,u.firm_id,c.id]),422,'SUPPORT_REQUIRED','Completa el soporte del plazo antes de verificarlo.');
      const registrar=await one(sql,'SELECT person_id FROM users WHERE id=$1',[d.registered_by]);requireThat(u.role==='lawyer'&&registrar.person_id!==u.person_id,403,'SELF_VERIFICATION','Requiere otro abogado por identidad de persona.');requireThat(b.revisionId===d.revision_id&&d.status==='pending_verification',409,'STALE_REVISION','Revisa la versión vigente.');requireThat(b.decision==='verify',422,'CORRECTION_REQUIRED','Registra primero la corrección y vuelve a verificar la nueva revisión.');await sql.query("UPDATE deadlines SET status='active',verified_by=$1,version=version+1 WHERE id=$2 AND firm_id=$3",[u.id,id,u.firm_id]);
    }else if(op==='updateDeadline'){
      requireThat(!['filed','cancelled'].includes(d.status),409,'IMMUTABLE_DEADLINE','El plazo ya está resuelto.');const data={...d.data,...b};await teamMember(sql,u,c,data.responsibleId);await teamMember(sql,u,c,data.backupId);requireThat(data.responsibleId!==data.backupId,422);requireThat(await one(sql,"SELECT 1 FROM document_versions v JOIN documents x ON x.id=v.document_id WHERE v.id=$1 AND v.firm_id=$2 AND x.case_id=$3 AND x.classification='operational' AND x.status='available'",[data.supportVersionId,u.firm_id,c.id]),422,'INVALID_SUPPORT','Soporte incompatible.');const rev=randomUUID();await sql.query('INSERT INTO deadline_revisions(id,firm_id,deadline_id,author_id,data,reason) VALUES($1,$2,$3,$4,$5,$6)',[rev,u.firm_id,id,u.id,JSON.stringify(data),b.reason]);await sql.query("UPDATE deadlines SET data=$1,due_on=$2,responsible_id=$3,backup_id=$4,revision_id=$5,registered_by=$6,verified_by=NULL,status='pending_verification',version=version+1 WHERE id=$7 AND firm_id=$8",[JSON.stringify(data),data.dueOn,data.responsibleId,data.backupId,rev,u.id,id,u.firm_id]);
    }else{
      requireThat(!['filed','cancelled'].includes(d.status),409,'IMMUTABLE_DEADLINE','El plazo ya está resuelto.');requireThat(b.status!=='active',422,'VERIFICATION_REQUIRED','Usa la verificación independiente para activar.');if(b.status==='filed')requireThat(b.filedAt&&b.receiptReference,422,'RECEIPT_REQUIRED','Indica fecha real y comprobante.');if(b.status==='cancelled')requireThat(b.reason,422,'REASON_REQUIRED','Indica motivo.');await sql.query('UPDATE deadlines SET status=$1,data=data||$2::jsonb,version=version+1 WHERE id=$3 AND firm_id=$4',[b.status,JSON.stringify(b),id,u.firm_id]);
    }
    await audit(sql,u,id,op,c.id,b.reason,{status:d.status,revisionId:d.revision_id},b);await enqueue(sql,u,'deadline_alert',id,c.id);return deadlineView(await one(sql,'SELECT * FROM deadlines WHERE id=$1 AND firm_id=$2',[id,u.firm_id]));
  }
  if(op==='resolveNotice'){
    internal(u);const n=await one(sql,'SELECT * FROM notices WHERE id=$1 AND firm_id=$2 FOR UPDATE',[id,u.firm_id]);if(!n)throw missing();await caseAccess(sql,u,n.case_id,'verify_deadline');version(n,b);requireThat(u.role==='lawyer',403);
    const deadlines=(await sql.query('SELECT * FROM deadlines WHERE notice_id=$1 AND firm_id=$2',[id,u.firm_id])).rows;
    if(deadlines.length)requireThat(deadlines.every(d=>d.status!=='pending_verification'&&b.deadlineIds?.includes(d.id)),422,'UNRESOLVED_DEADLINES','Revisa los plazos vinculados.');else requireThat(b.noDeadlineReason?.trim().length>=5,422,'JUSTIFICATION_REQUIRED','Justifica por qué no genera plazo.');
    await sql.query("UPDATE notices SET status='treated',data=data||$1::jsonb,version=version+1 WHERE id=$2 AND firm_id=$3",[JSON.stringify(b),id,u.firm_id]);await audit(sql,u,id,op,n.case_id,b.noDeadlineReason);return noticeView(await one(sql,'SELECT * FROM notices WHERE id=$1 AND firm_id=$2',[id,u.firm_id]));
  }
  if(['listMailboxes','createMailbox','createDailyCheck'].includes(op)){
    internal(u);
    if(op==='listMailboxes'){const p=pagination(q,u,op);return p.page((await sql.query(`SELECT * FROM mailboxes WHERE firm_id=$1${direction(u)?'':' AND $4 IN(responsible_id,backup_id,supervisor_id)'} ORDER BY id LIMIT $2 OFFSET $3`,direction(u)?[u.firm_id,p.limit+1,p.offset]:[u.firm_id,p.limit+1,p.offset,u.id])).rows.map(mailboxView));}
    if(op==='createMailbox'){
      manage(u);for(const uid of [b.holderId,b.responsibleId,b.backupId,b.supervisorId])await activeAccount(sql,u,uid,['lawyer','assistant','manager','superadmin']);requireThat(b.responsibleId!==b.backupId&&/^([01]\d|2[0-3]):[0-5]\d$/.test(b.checkTime),422,'INVALID_COVERAGE','Cobertura u hora no válida.');requireThat(await one(sql,'SELECT 1 FROM calendars WHERE id=$1 AND firm_id=$2',[b.calendarId,u.firm_id]),422,'CALENDAR_REQUIRED','Calendario no disponible.');const mid=randomUUID();await sql.query('INSERT INTO mailboxes(id,firm_id,responsible_id,backup_id,supervisor_id,calendar_id,data) VALUES($1,$2,$3,$4,$5,$6,$7)',[mid,u.firm_id,b.responsibleId,b.backupId,b.supervisorId,b.calendarId,JSON.stringify(b)]);await audit(sql,u,mid,op);return mailboxView(await one(sql,'SELECT * FROM mailboxes WHERE id=$1',[mid]));
    }
    const m=await one(sql,'SELECT * FROM mailboxes WHERE id=$1 AND firm_id=$2 FOR UPDATE',[id,u.firm_id]);if(!m)throw missing();requireThat(direction(u)||[m.responsible_id,m.backup_id].includes(u.id),403);await sql.query('INSERT INTO daily_checks(id,firm_id,mailbox_id,checked_by,date,notice_count,observation) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(mailbox_id,date) DO NOTHING',[randomUUID(),u.firm_id,id,u.id,b.date,b.noticeCount,b.observation||null]);await audit(sql,u,id,op,null,b.observation);return {ok:true};
  }
  if(op==='listDeliveries'){internal(u);const p=pagination(q,u,op);return p.page((await sql.query('SELECT id,event_key,status,attempts,last_attempt_at FROM deliveries WHERE firm_id=$1 AND user_id=$2 ORDER BY id LIMIT $3 OFFSET $4',[u.firm_id,u.id,p.limit+1,p.offset])).rows.map(r=>({id:r.id,eventId:r.id,status:r.status,attempts:r.attempts,lastAttemptAt:r.last_attempt_at||undefined})));}
  return undefined;
 }
 private async accounts(op:string,sql:Sql,u:User,id:string,b:Row,q:Row){
  admin(u);
  if(op==='listUsers'){const p=pagination(q,u,op);return p.page((await sql.query('SELECT * FROM users WHERE firm_id=$1 ORDER BY name,id LIMIT $2 OFFSET $3',[u.firm_id,p.limit+1,p.offset])).rows.map(userView));}
  if(op==='createInvitation'){
    if(!process.env.SMTP_HOST)throw unavailable('Correo');const value=token(),iid=randomUUID(),email=b.email.toLowerCase();const secret=encryptSecret((process.env.INVITATION_RETURN_URL||process.env.PUBLIC_API_ORIGIN+'/auth/start')+'?invitation='+value);
    requireThat(!await one(sql,'SELECT 1 FROM users WHERE email=$1 AND firm_id=$2',[email,u.firm_id]),409,'EMAIL_EXISTS','La cuenta ya existe.');await sql.query('INSERT INTO invitations(id,firm_id,token_hash,email,name,role,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,now()+interval \'2 days\',$7)',[iid,u.firm_id,hash(value),email,b.name,b.role,u.id]);await enqueue(sql,u,'invitation',iid,null,{email,encryptedUrl:secret});await audit(sql,u,iid,op);return {id:iid,email,expiresAt:new Date(Date.now()+2*86400000).toISOString()};
  }
  // Lock the firm's accounts to serialize last-superadmin checks and role changes.
  await sql.query('SELECT id FROM firms WHERE id=$1 FOR UPDATE',[u.firm_id]);const target=await one(sql,'SELECT * FROM users WHERE id=$1 AND firm_id=$2 FOR UPDATE',[id,u.firm_id]);if(!target)throw missing();
  if(op==='updateUser'){
    version(target,b);const isLast=target.role==='superadmin'&&target.active&&(b.active===false||b.role&&b.role!=='superadmin');if(isLast){const count=await one(sql,"SELECT count(*)::integer n FROM users WHERE firm_id=$1 AND active AND role='superadmin'",[u.firm_id]);requireThat(count.n>1,409,'LAST_SUPERADMIN','Primero habilita otro superadministrador.');}
    const role=b.role??target.role;await sql.query('UPDATE users SET role=$1,active=$2,session_version=session_version+1,version=version+1 WHERE id=$3 AND firm_id=$4',[role,b.active??target.active,id,u.firm_id]);
    if(b.role&&b.role!==target.role){const allowed=maximum[role];const grants=(await sql.query('SELECT * FROM case_grants WHERE user_id=$1 AND firm_id=$2 AND revoked_at IS NULL',[id,u.firm_id])).rows;for(const g of grants){await sql.query('UPDATE case_grants SET revoked_at=now(),version=version+1 WHERE id=$1',[g.id]);const actions=g.actions.filter((a:string)=>allowed.includes(a));if(actions.length)await sql.query('INSERT INTO case_grants(id,firm_id,case_id,user_id,actions,valid_from,valid_until,granted_by,reason) VALUES($1,$2,$3,$4,$5,now(),$6,$7,$8)',[randomUUID(),u.firm_id,g.case_id,id,actions,g.valid_until,u.id,b.reason]);}}
    // Suspension never waits for replacement; coverage remains visibly unresolved.
    if(b.active===false)await enqueue(sql,u,'coverage_alert',id,null,{});await audit(sql,u,id,op,null,b.reason,{role:target.role,active:target.active},{role,active:b.active??target.active});return userView(await one(sql,'SELECT * FROM users WHERE id=$1 AND firm_id=$2',[id,u.firm_id]));
  }
  await sql.query('UPDATE users SET session_version=session_version+1 WHERE id=$1 AND firm_id=$2',[id,u.firm_id]);await audit(sql,u,id,op,null,b.reason);return {ok:true};
 }
}
