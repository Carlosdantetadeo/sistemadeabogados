import {randomUUID} from 'node:crypto';
import {Sql,one,Row} from './db.js';
import {User,direction,caseAccess,caseScope,activeAccount,teamMember,maximum,audit,version,internal,admin,manage} from './policy.js';
import {ApiError,requireThat,missing} from './errors.js';
import {pagination} from './paging.js';
export function userView(u:Row){return {id:u.id,name:u.name,email:u.email,role:u.role,active:u.active,version:u.version};}
export function caseView(c:Row){return {id:c.id,projectId:c.project_id,code:c.code,title:c.title,type:c.type,stage:c.data.stage||'',status:c.status,responsibleId:c.responsible_id,followupId:c.followup_id,backupId:c.backup_id,nextAction:c.data.nextAction||'',version:c.version};}
export function projectView(p:Row){return {id:p.id,code:p.code,name:p.name,clientId:p.client_id,clientName:p.client_name,leadId:p.lead_id,leadName:p.lead_name,partnerId:p.partner_id,status:p.status,version:p.version};}
export function clientView(c:Row){return {id:c.id,name:c.name,type:c.type,archived:c.archived,version:c.version};}
export function grantView(g:Row){return {id:g.id,userId:g.user_id,caseId:g.case_id,effectiveActions:g.actions,validFrom:g.valid_from,validUntil:g.valid_until||undefined,version:g.version};}
export function assignmentView(a:Row){return {id:a.id,caseId:a.case_id,userId:a.user_id,function:a.function,validFrom:a.valid_from,validUntil:a.valid_until||undefined,grantedBy:a.granted_by,reason:a.reason,replacesId:a.replaces_id||undefined};}
export function projectScope(u:User,alias='p'){
  if(direction(u))return {clause:`${alias}.firm_id=$1`,values:[u.firm_id]};
  const scope=caseScope(u,'c');let clause=`${alias}.firm_id=$1 AND (EXISTS(SELECT 1 FROM cases c WHERE c.project_id=${alias}.id AND ${scope.clause})`;
  const values:any[]=[...scope.values];if(u.role!=='client'){values.push(u.id);clause+=` OR (${alias}.owner_id=$${values.length} AND ${alias}.status='draft')`;}
  clause+=')';if(u.role==='client')clause+=` AND EXISTS(SELECT 1 FROM client_memberships cm WHERE cm.client_id=${alias}.client_id AND cm.firm_id=${alias}.firm_id AND cm.user_id=$2)`;
  return {clause,values};
}
export async function projectAccess(sql:Sql,u:User,id:string,lock=false,creatingCase=false){
  const s=projectScope(u);if(creatingCase&&u.role==='lawyer'){s.values.push(u.id);s.clause=`(${s.clause} OR (p.firm_id=$1 AND p.owner_id=$${s.values.length}))`;}
  const p=await one(sql,`SELECT p.*,c.name client_name,l.name lead_name FROM projects p JOIN clients c ON c.id=p.client_id JOIN users l ON l.id=p.lead_id WHERE p.id=$${s.values.length+1} AND ${s.clause}${lock?' FOR UPDATE OF p':''}`,[...s.values,id]);if(!p)throw missing();return p;
}
export async function initialGrant(sql:Sql,u:User,caseId:string,userId:string,actions:string[],reason:string,roleName?:string){
  const id=randomUUID();await sql.query('INSERT INTO case_grants(id,firm_id,case_id,user_id,actions,valid_from,granted_by,reason) VALUES($1,$2,$3,$4,$5,now(),$6,$7)',[id,u.firm_id,caseId,userId,actions,u.id,reason]);
  if(roleName)await sql.query('INSERT INTO case_assignments(id,firm_id,case_id,user_id,function,granted_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),u.firm_id,caseId,userId,roleName,u.id,reason]);return id;
}
export class Core {
 async handle(op:string,sql:Sql,u:User,id:string,b:Row,q:Row):Promise<any>{
  if(op==='getMe')return {user:userView(u),firmId:u.firm_id,mfaRequired:u.role!=='client',globalOperationalAccess:direction(u)};
  if(op==='getCapabilities')return {privateOfflineData:false,aiEnabled:false,timezone:'America/Lima',currency:'PEN'};
  if(['setClientMembership','setClientCreationGrant','setProjectEconomicGrant'].includes(op)){
    manage(u);const target=await activeAccount(sql,u,b.userId,op==='setClientMembership'?['client']:op==='setClientCreationGrant'?['lawyer']:['manager','superadmin']);
    if(op==='setProjectEconomicGrant'){const p=await projectAccess(sql,u,id,true);version(p,b);await sql.query('INSERT INTO project_grants(id,firm_id,project_id,user_id,economic) VALUES($1,$2,$3,$4,$5) ON CONFLICT(project_id,user_id) DO UPDATE SET economic=EXCLUDED.economic',[randomUUID(),u.firm_id,id,target.id,b.enabled]);await sql.query('UPDATE projects SET version=version+1 WHERE id=$1 AND firm_id=$2',[id,u.firm_id]);}
    else{if(op==='setClientMembership')admin(u);const c=await one(sql,'SELECT * FROM clients WHERE id=$1 AND firm_id=$2 FOR UPDATE',[id,u.firm_id]);if(!c)throw missing();version(c,b);const table=op==='setClientMembership'?'client_memberships':'client_creation_grants';if(b.enabled)await sql.query(`INSERT INTO ${table}(user_id,client_id,firm_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[target.id,id,u.firm_id]);else await sql.query(`DELETE FROM ${table} WHERE user_id=$1 AND client_id=$2 AND firm_id=$3`,[target.id,id,u.firm_id]);await sql.query('UPDATE clients SET version=version+1 WHERE id=$1 AND firm_id=$2',[id,u.firm_id]);}
    await audit(sql,u,id,op,null,b.reason);return {ok:true};
  }
  if(op==='listCalendars'||op==='createCalendar'){
    manage(u);if(op==='listCalendars'){const p=pagination(q,u,op);return p.page((await sql.query('SELECT * FROM calendars WHERE firm_id=$1 ORDER BY id LIMIT $2 OFFSET $3',[u.firm_id,p.limit+1,p.offset])).rows.map(r=>({id:r.id,name:r.name,timezone:r.timezone,nonWorkingDates:r.non_working_dates.map((d:any)=>d instanceof Date?d.toISOString().slice(0,10):d),approved:r.approved,version:r.version})));}
    try{new Intl.DateTimeFormat('es',{timeZone:b.timezone}).format();}catch{requireThat(false,422,'INVALID_TIMEZONE','Zona no válida.');}const cid=randomUUID();await sql.query('INSERT INTO calendars(id,firm_id,name,timezone,non_working_dates,approved) VALUES($1,$2,$3,$4,$5,$6)',[cid,u.firm_id,b.name,b.timezone,b.nonWorkingDates,b.approved]);await audit(sql,u,cid,op);return {id:cid,...b,version:1};
  }
  if(op==='getHealth'){admin(u);const jobs=await one(sql,"SELECT count(*)::integer count FROM jobs WHERE firm_id=$1 AND status='failed'",[u.firm_id]);return {backupStatus:'requires_external_backup_monitor',restorationTestStatus:'not_certified',queueStatus:jobs.count?'failures':'available',mailStatus:process.env.SMTP_HOST?'configured_not_delivery_verified':'not_configured',scannerStatus:process.env.DOCUMENT_PROCESSOR_URL?'configured_not_verified':'not_configured'};}
  if(op==='listProjects'){
    const p=pagination(q,u,op),scope=projectScope(u),args:any[]=[...scope.values];let where=scope.clause;
    for(const [key,column] of [['clientId','p.client_id'],['leadId','p.lead_id'],['status','p.status']])if(q[key]){args.push(q[key]);where+=` AND ${column}=$${args.length}`;}
    if(q.q){args.push('%'+q.q+'%');where+=` AND (p.name ILIKE $${args.length} OR p.code ILIKE $${args.length} OR c.name ILIKE $${args.length})`;}
    const total=await one(sql,`SELECT count(*)::integer total FROM projects p JOIN clients c ON c.id=p.client_id WHERE ${where}`,args);
    const order=({code:'p.code',name:'p.name',status:'p.status'} as Row)[q.sort||'code'];
    const rows=(await sql.query(`SELECT p.*,c.name client_name,l.name lead_name FROM projects p JOIN clients c ON c.id=p.client_id JOIN users l ON l.id=p.lead_id WHERE ${where} ORDER BY ${order},p.id LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,p.limit+1,p.offset])).rows;
    const filterRows=(await sql.query(`SELECT DISTINCT c.id client_id,c.name client_name,l.id lead_id,l.name lead_name FROM projects p JOIN clients c ON c.id=p.client_id JOIN users l ON l.id=p.lead_id WHERE ${scope.clause}`,scope.values)).rows;
    const clients=Array.from(new Map(filterRows.map(v=>[v.client_id,{id:v.client_id,name:v.client_name}])).values()),leads=Array.from(new Map(filterRows.map(v=>[v.lead_id,{id:v.lead_id,name:v.lead_name}])).values());
    return p.page(rows.map(projectView),{totalAuthorized:total.total,allowedFilters:{clients,leads}});
  }
  if(op==='getProject')return projectView(await projectAccess(sql,u,id));
  if(op==='createProject'){
    internal(u);requireThat(direction(u)||u.role==='lawyer',403,'FORBIDDEN','No puedes crear proyectos.');
    if(!direction(u))requireThat(await one(sql,'SELECT 1 FROM client_creation_grants WHERE user_id=$1 AND firm_id=$2 AND client_id=$3',[u.id,u.firm_id,b.clientId]),403,'CLIENT_NOT_ENABLED','El cliente no está habilitado para crear un proyecto.');
    requireThat(await one(sql,'SELECT 1 FROM clients WHERE id=$1 AND firm_id=$2 AND NOT archived',[b.clientId,u.firm_id]),422,'INVALID_CLIENT','Cliente no disponible.');
    await activeAccount(sql,u,b.partnerId,['manager','superadmin']);await activeAccount(sql,u,b.leadId,['lawyer']);
    const pid=randomUUID(),code='PR-'+pid.slice(0,8).toUpperCase();await sql.query('INSERT INTO projects(id,firm_id,client_id,code,name,owner_id,partner_id,lead_id,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[pid,u.firm_id,b.clientId,code,b.name,u.id,b.partnerId,b.leadId,JSON.stringify(b)]);await audit(sql,u,pid,op);
    return projectView(await projectAccess(sql,u,pid));
  }
  if(op==='updateProject'){
    internal(u);const p=await projectAccess(sql,u,id,true);requireThat(direction(u)||p.owner_id===u.id||p.lead_id===u.id,403);version(p,b);
    if(b.status==='active')requireThat(p.conflict_status!=='pending',422,'CONFLICT_REVIEW_REQUIRED','Debe resolverse la revisión de conflictos.');
    if(b.status==='closed')requireThat(!await one(sql,"SELECT 1 FROM cases WHERE project_id=$1 AND firm_id=$2 AND status<>'closed'",[id,u.firm_id]),422,'OPEN_CASES','Quedan expedientes sin cerrar.');
    for(const k of ['partnerId','leadId'])if(b[k])await activeAccount(sql,u,b[k],k==='leadId'?['lawyer']:['manager','superadmin']);
    if(b.clientId&&b.clientId!==p.client_id)requireThat(!await one(sql,'SELECT 1 FROM cases WHERE project_id=$1 AND firm_id=$2',[id,u.firm_id]),422,'CLIENT_CHANGE_BLOCKED','No se cambia cliente de un proyecto con expedientes.');
    await sql.query('UPDATE projects SET name=$1,status=$2,client_id=$3,partner_id=$4,lead_id=$5,data=data||$6::jsonb,version=version+1 WHERE id=$7 AND firm_id=$8',[b.name??p.name,b.status??p.status,b.clientId??p.client_id,b.partnerId??p.partner_id,b.leadId??p.lead_id,JSON.stringify(b),id,u.firm_id]);await audit(sql,u,id,op,null,b.reason);return projectView(await projectAccess(sql,u,id));
  }
  if(op==='createConflictReview'){
    manage(u);const p=await projectAccess(sql,u,id,true);version(p,b);const rid=randomUUID();await sql.query('INSERT INTO conflict_reviews(id,firm_id,project_id,reviewer_id,result,reason) VALUES($1,$2,$3,$4,$5,$6)',[rid,u.firm_id,id,u.id,b.result,b.reason]);await sql.query('UPDATE projects SET conflict_status=$1,version=version+1 WHERE id=$2 AND firm_id=$3',[b.result,id,u.firm_id]);await audit(sql,u,id,op,null,b.reason);return {id:rid,projectId:id,result:b.result,reviewerId:u.id,reason:b.reason,createdAt:new Date().toISOString()};
  }
  if(op==='listCases'||op==='listProjectCases'){
    internal(u);if(op==='listProjectCases')await projectAccess(sql,u,id);const s=caseScope(u),args:any[]=[...s.values];let where=s.clause;const p=pagination(q,u,op+id);
    for(const [key,column] of [['projectId','c.project_id'],['lawyerId','c.responsible_id'],['status','c.status']]){const value=key==='projectId'&&op==='listProjectCases'?id:q[key];if(value){args.push(value);where+=` AND ${column}=$${args.length}`;}}
    if(q.clientId){args.push(q.clientId);where+=` AND EXISTS(SELECT 1 FROM projects p WHERE p.id=c.project_id AND p.client_id=$${args.length})`;}
    if(q.q){args.push('%'+q.q+'%');where+=` AND (c.code ILIKE $${args.length} OR c.title ILIKE $${args.length})`;}
    return p.page((await sql.query(`SELECT c.* FROM cases c WHERE ${where} ORDER BY c.code,c.id LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,p.limit+1,p.offset])).rows.map(caseView));
  }
  if(op==='createCase'){
    internal(u);requireThat(direction(u)||u.role==='lawyer',403);const p=await projectAccess(sql,u,b.projectId,true,true);requireThat(p.status==='active'&&p.conflict_status!=='pending',422,'PROJECT_NOT_ACTIVE','El proyecto requiere activación y revisión de conflictos.');
    await activeAccount(sql,u,b.responsibleId,['lawyer']);await activeAccount(sql,u,b.followupId,['lawyer','assistant']);await activeAccount(sql,u,b.backupId,['lawyer','assistant']);requireThat(b.followupId!==b.backupId,422,'INVALID_TEAM','Seguimiento y suplente deben ser distintos.');
    if(b.parentId)requireThat(await one(sql,'SELECT 1 FROM cases WHERE id=$1 AND firm_id=$2 AND project_id=$3',[b.parentId,u.firm_id,b.projectId]),422,'INVALID_PARENT','El padre debe pertenecer al mismo proyecto.');
    const cid=randomUUID();await sql.query('INSERT INTO cases(id,firm_id,project_id,code,title,type,responsible_id,followup_id,backup_id,parent_id,judicial_number,authority,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[cid,u.firm_id,b.projectId,'EXP-'+cid.slice(0,8).toUpperCase(),b.title,b.type,b.responsibleId,b.followupId,b.backupId,b.parentId||null,b.judicialNumber||null,b.authority||null,JSON.stringify(b)]);
    for(const [accountId,functionName] of [[b.responsibleId,'responsible'],[b.followupId,'followup'],[b.backupId,'backup']]){const a=await activeAccount(sql,u,accountId);await initialGrant(sql,u,cid,accountId,maximum[a.role].filter(x=>!['economic','manage_access','delete_document'].includes(x)),'Equipo inicial',functionName);}
    if(![b.responsibleId,b.followupId,b.backupId].includes(u.id))await initialGrant(sql,u,cid,u.id,maximum[u.role].filter(x=>!['economic','delete_document'].includes(x)),'Creador del expediente','creator');
    await audit(sql,u,cid,op,cid);return caseView(await caseAccess(sql,u,cid));
  }
  if(op==='getCase'){internal(u);return caseView(await caseAccess(sql,u,id));}
  if(op==='updateCase'){
    internal(u);const c=await caseAccess(sql,u,id,'edit',true);version(c,b);await sql.query('UPDATE cases SET title=$1,authority=$2,data=data||$3::jsonb,version=version+1 WHERE id=$4 AND firm_id=$5',[b.title??c.title,b.authority??c.authority,JSON.stringify(b),id,u.firm_id]);await audit(sql,u,id,op,id,b.reason,{title:c.title,stage:c.data.stage},b);return caseView(await caseAccess(sql,u,id));
  }
  if(op==='transitionCase'){
    internal(u);const c=await caseAccess(sql,u,id,'edit',true);version(c,b);
    const edges:Row={draft:['open'],open:['in_progress','suspended','closed'],in_progress:['suspended','closed'],suspended:['in_progress','closed'],closed:['in_progress']};requireThat(edges[c.status].includes(b.status),409,'INVALID_TRANSITION','Cambio de estado no permitido.');
    if(c.status==='closed')manage(u);
    if(b.status==='closed'){
      const pending=await one(sql,"SELECT 1 FROM tasks WHERE case_id=$1 AND firm_id=$2 AND status IN ('pending','in_progress') UNION ALL SELECT 1 FROM deadlines WHERE case_id=$1 AND firm_id=$2 AND status IN ('pending_verification','active','overdue_unfiled') LIMIT 1",[id,u.firm_id]);requireThat(!pending,422,'PENDING_WORK','Resuelve o transfiere los pendientes antes de cerrar.');
    }
    requireThat(!b.archived||b.status==='closed',422,'ARCHIVE_CLOSED_ONLY','Solo se archivan expedientes cerrados.');
    for(const uid of [c.responsible_id,c.followup_id,c.backup_id])await teamMember(sql,u,c,uid);
    await sql.query('UPDATE cases SET status=$1,archived=$2,version=version+1 WHERE id=$3 AND firm_id=$4',[b.status,!!b.archived,id,u.firm_id]);await audit(sql,u,id,op,id,b.reason,{status:c.status},{status:b.status});return caseView(await caseAccess(sql,u,id));
  }
  if(['listGrants','createGrant','revokeGrant','listAssignments','transferCase','createDelegation'].includes(op))return this.access(op,sql,u,id,b,q);
  if(op==='listClients'||op==='lookupClients'){
    internal(u);const p=pagination(q,u,op);const args:any[]=[u.firm_id];let where='cl.firm_id=$1';if(!direction(u)){args.push(u.id);const s=caseScope(u,'c', 'read',3);args.push(...s.values);where+=` AND (EXISTS(SELECT 1 FROM client_creation_grants g WHERE g.firm_id=cl.firm_id AND g.client_id=cl.id AND g.user_id=$2)${op==='listClients'?` OR EXISTS(SELECT 1 FROM projects p JOIN cases c ON c.project_id=p.id WHERE p.client_id=cl.id AND ${s.clause})`:''})`;if(op==='lookupClients')args.splice(2);}
    if(q.q){args.push('%'+q.q+'%');where+=` AND cl.name ILIKE $${args.length}`;}
    const rows=(await sql.query(`SELECT cl.* FROM clients cl WHERE ${where} ORDER BY cl.name,cl.id LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,p.limit+1,p.offset])).rows;return p.page(rows.map(c=>op==='lookupClients'?{id:c.id,name:c.name}:clientView(c)));
  }
  if(op==='createClient'){manage(u);const cid=randomUUID();await sql.query('INSERT INTO clients(id,firm_id,name,type,document_type,document_number,data) VALUES($1,$2,$3,$4,$5,$6,$7)',[cid,u.firm_id,b.name,b.type,b.documentType||null,b.documentNumber||null,JSON.stringify(b)]);await audit(sql,u,cid,op);return clientView(await one(sql,'SELECT * FROM clients WHERE id=$1',[cid]));}
  if(op==='updateClient'){manage(u);const c=await one(sql,'SELECT * FROM clients WHERE id=$1 AND firm_id=$2 FOR UPDATE',[id,u.firm_id]);if(!c)throw missing();version(c,b);await sql.query('UPDATE clients SET name=$1,type=$2,document_type=$3,document_number=$4,data=data||$5::jsonb,version=version+1 WHERE id=$6 AND firm_id=$7',[b.name??c.name,b.type??c.type,b.documentType??c.document_type,b.documentNumber??c.document_number,JSON.stringify(b),id,u.firm_id]);await audit(sql,u,id,op,null,b.reason);return clientView(await one(sql,'SELECT * FROM clients WHERE id=$1 AND firm_id=$2',[id,u.firm_id]));}
  return undefined;
 }
 private async access(op:string,sql:Sql,u:User,id:string,b:Row,q:Row){
  internal(u);
  if(op==='revokeGrant'){
    const g=await one(sql,'SELECT * FROM case_grants WHERE id=$1 AND firm_id=$2 FOR UPDATE',[id,u.firm_id]);if(!g)throw missing();await caseAccess(sql,u,g.case_id,'manage_access');version(g,b);await sql.query('UPDATE case_grants SET revoked_at=now(),version=version+1 WHERE case_id=$1 AND firm_id=$2 AND user_id=$3 AND revoked_at IS NULL',[g.case_id,u.firm_id,g.user_id]);await sql.query('UPDATE case_assignments SET valid_until=now() WHERE case_id=$1 AND firm_id=$2 AND user_id=$3 AND (valid_until IS NULL OR valid_until>now())',[g.case_id,u.firm_id,g.user_id]);await audit(sql,u,id,op,g.case_id,b.reason);return {ok:true};
  }
  const c=await caseAccess(sql,u,id,op==='listAssignments'?'read':'manage_access',op!=='listGrants'&&op!=='listAssignments');
  const p=pagination(q,u,op+id);
  if(op==='listGrants')return p.page((await sql.query('SELECT * FROM case_grants WHERE case_id=$1 AND firm_id=$2 AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) ORDER BY id LIMIT $3 OFFSET $4',[id,u.firm_id,p.limit+1,p.offset])).rows.map(grantView));
  if(op==='listAssignments')return p.page((await sql.query('SELECT * FROM case_assignments WHERE case_id=$1 AND firm_id=$2 ORDER BY valid_from,id LIMIT $3 OFFSET $4',[id,u.firm_id,p.limit+1,p.offset])).rows.map(assignmentView));
  version(c,b);
  if(op==='createGrant'||op==='createDelegation'){
    const a=await activeAccount(sql,u,b.userId);requireThat(b.actions.length>0&&b.actions.every((x:string)=>maximum[a.role].includes(x)),422,'INCOMPATIBLE_PERMISSIONS','Permisos incompatibles con el perfil.');
    requireThat(!b.validUntil||new Date(b.validUntil)>new Date(b.validFrom),422,'INVALID_PERIOD','Periodo no válido.');
    if(a.role==='client'){const p=await projectAccess(sql,u,c.project_id);requireThat(await one(sql,'SELECT 1 FROM client_memberships WHERE user_id=$1 AND client_id=$2 AND firm_id=$3',[a.id,p.client_id,u.firm_id]),422,'CLIENT_MEMBERSHIP_REQUIRED','Primero vincula la cuenta al cliente.');}
    // Close active grant periods rather than rewriting their history.
    await sql.query('UPDATE case_grants SET revoked_at=now(),version=version+1 WHERE case_id=$1 AND firm_id=$2 AND user_id=$3 AND revoked_at IS NULL',[id,u.firm_id,a.id]);
    const gid=randomUUID();await sql.query('INSERT INTO case_grants(id,firm_id,case_id,user_id,actions,valid_from,valid_until,granted_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[gid,u.firm_id,id,a.id,b.actions,b.validFrom,b.validUntil||null,u.id,b.reason]);
    const aid=randomUUID();await sql.query('UPDATE case_assignments SET valid_until=now() WHERE case_id=$1 AND firm_id=$2 AND user_id=$3 AND (valid_until IS NULL OR valid_until>now())',[id,u.firm_id,a.id]);await sql.query('INSERT INTO case_assignments(id,firm_id,case_id,user_id,function,valid_from,valid_until,granted_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[aid,u.firm_id,id,a.id,op==='createDelegation'?'delegate':'collaborator',b.validFrom,b.validUntil||null,u.id,b.reason]);await sql.query('UPDATE cases SET version=version+1 WHERE id=$1 AND firm_id=$2',[id,u.firm_id]);await audit(sql,u,gid,op,id,b.reason);
    return op==='createGrant'?grantView(await one(sql,'SELECT * FROM case_grants WHERE id=$1',[gid])):assignmentView(await one(sql,'SELECT * FROM case_assignments WHERE id=$1',[aid]));
  }
  if(op==='transferCase'){
    requireThat(b.newResponsibleId!==c.responsible_id,422,'SAME_RESPONSIBLE','Selecciona otra persona.');await activeAccount(sql,u,b.newResponsibleId,['lawyer']);await activeAccount(sql,u,b.followupId,['lawyer','assistant']);await activeAccount(sql,u,b.backupId,['lawyer','assistant']);requireThat(b.followupId!==b.backupId,422,'INVALID_TEAM','Seguimiento y suplente distintos.');
    const tasks=(await sql.query("SELECT id FROM tasks WHERE case_id=$1 AND firm_id=$2 AND status IN ('pending','in_progress')",[id,u.firm_id])).rows,deadlines=(await sql.query("SELECT id FROM deadlines WHERE case_id=$1 AND firm_id=$2 AND status IN ('pending_verification','active','overdue_unfiled')",[id,u.firm_id])).rows;
    const pending=[...tasks,...deadlines];requireThat(pending.every(p=>b.pendingAssignments.some((a:Row)=>a.resourceId===p.id)),422,'PENDING_ASSIGNMENT_REQUIRED','Revisa todos los pendientes.');
    await sql.query('UPDATE case_grants SET revoked_at=now(),version=version+1 WHERE case_id=$1 AND firm_id=$2 AND user_id=$3 AND revoked_at IS NULL',[id,u.firm_id,c.responsible_id]);await sql.query('UPDATE case_assignments SET valid_until=now() WHERE case_id=$1 AND firm_id=$2 AND function IN (\'responsible\',\'followup\',\'backup\') AND (valid_until IS NULL OR valid_until>now())',[id,u.firm_id]);
    for(const prior of [c.followup_id,c.backup_id])if(![b.newResponsibleId,b.followupId,b.backupId].includes(prior))await sql.query('UPDATE case_grants SET revoked_at=now(),version=version+1 WHERE case_id=$1 AND firm_id=$2 AND user_id=$3 AND revoked_at IS NULL',[id,u.firm_id,prior]);
    if(b.retainPriorAsCollaborator)await initialGrant(sql,u,id,c.responsible_id,maximum.lawyer.filter(a=>a!=='publish'),b.reason,'collaborator');
    for(const [uid,fn] of [[b.newResponsibleId,'responsible'],[b.followupId,'followup'],[b.backupId,'backup']]){const a=await activeAccount(sql,u,uid);await initialGrant(sql,u,id,uid,maximum[a.role].filter(x=>!['economic','manage_access','delete_document'].includes(x)),b.reason,fn);}
    for(const a of b.pendingAssignments){await activeAccount(sql,u,a.assigneeId,['lawyer','assistant']);const s=caseScope({...u,id:a.assigneeId,role:(await activeAccount(sql,u,a.assigneeId)).role});requireThat(await one(sql,`SELECT c.id FROM cases c WHERE c.id=$${s.values.length+1} AND ${s.clause}`,[...s.values,id]),422,'INVALID_TEAM','Destinatario sin autorización.');if(tasks.some(t=>t.id===a.resourceId))await sql.query('UPDATE tasks SET assignee_id=$1,version=version+1 WHERE id=$2 AND firm_id=$3',[a.assigneeId,a.resourceId,u.firm_id]);else if(deadlines.some(d=>d.id===a.resourceId))await sql.query('UPDATE deadlines SET responsible_id=$1,backup_id=$2,version=version+1 WHERE id=$3 AND firm_id=$4',[a.assigneeId,b.backupId,a.resourceId,u.firm_id]);else requireThat(false,422,'INVALID_PENDING','Pendiente no pertenece al expediente.');}
    await sql.query('UPDATE cases SET responsible_id=$1,followup_id=$2,backup_id=$3,version=version+1 WHERE id=$4 AND firm_id=$5',[b.newResponsibleId,b.followupId,b.backupId,id,u.firm_id]);await audit(sql,u,id,op,id,b.reason,{responsibleId:c.responsible_id},{responsibleId:b.newResponsibleId});return caseView(await caseAccess(sql,u,id));
  }
 }
}
