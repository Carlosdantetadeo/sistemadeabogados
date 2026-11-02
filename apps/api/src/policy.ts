import {randomUUID} from 'node:crypto';
import {Sql,one,Row} from './db.js';
import {missing,requireThat} from './errors.js';
export type User={id:string;firm_id:string;person_id:string;role:string;active:boolean;name:string;email:string;version:number;session_version:number};
export const direction=(u:User)=>u.role==='manager'||u.role==='superadmin';
export const maximum:Record<string,string[]>={
  superadmin:['read','download','edit','activity','upload','tasks','propose_deadline','publish','audit','manage_access','economic','delete_document','create'],
  manager:['read','download','edit','activity','upload','tasks','propose_deadline','publish','audit','manage_access','economic','create'],
  lawyer:['read','download','edit','activity','upload','tasks','propose_deadline','verify_deadline','publish','audit','create'],
  assistant:['read','download','upload','tasks','propose_deadline','audit'],client:['read','download']};
export function caseScope(u:User,alias='c',action='read',start=1){
  const values:any[]=[u.firm_id];let clause=`${alias}.firm_id=$${start}`;
  if(!(direction(u)&&['read','download','audit','manage_access'].includes(action))){
    clause+=` AND EXISTS(SELECT 1 FROM case_grants g WHERE g.firm_id=${alias}.firm_id AND g.case_id=${alias}.id AND g.user_id=$${start+1} AND $${start+2}=ANY(g.actions) AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now()))`;
    values.push(u.id,action);
  }
  if(!maximum[u.role]?.includes(action))clause+=' AND false';
  return {clause,values};
}
export async function caseAccess(sql:Sql,u:User,id:string,action='read',lock=false){
  const scope=caseScope(u);const c=await one(sql,`SELECT c.* FROM cases c WHERE c.id=$${scope.values.length+1} AND ${scope.clause}${lock?' FOR UPDATE OF c':''}`,[...scope.values,id]);
  if(!c)throw missing();
  requireThat(maximum[u.role]?.includes(action),403,'FORBIDDEN','Tu perfil no permite esta acción.');
  if(action!=='read'){
    const own=caseScope(u,'c',action);requireThat(await one(sql,`SELECT c.id FROM cases c WHERE c.id=$${own.values.length+1} AND ${own.clause}`,[...own.values,id]),403,'FORBIDDEN','No tienes permiso para esta acción.');
  }
  if(u.role==='client'){
    const membership=await one(sql,'SELECT 1 FROM projects p JOIN client_memberships m ON m.client_id=p.client_id AND m.firm_id=p.firm_id WHERE p.id=$1 AND p.firm_id=$2 AND m.user_id=$3',[c.project_id,u.firm_id,u.id]);
    if(!membership)throw missing();
  }
  return c;
}
export async function economic(sql:Sql,u:User,c:Row){requireThat(direction(u),403,'FORBIDDEN','Acción no permitida.');await caseAccess(sql,u,c.id,'economic');requireThat(await one(sql,'SELECT 1 FROM project_grants WHERE project_id=$1 AND firm_id=$2 AND user_id=$3 AND economic AND (valid_until IS NULL OR valid_until>now())',[c.project_id,u.firm_id,u.id]),403,'FORBIDDEN','Falta autorización económica de proyecto.');}
export async function teamMember(sql:Sql,u:User,c:Row,id:string,roles=['lawyer','assistant']){
  const member=await one(sql,'SELECT * FROM users WHERE id=$1 AND firm_id=$2 AND active',[id,u.firm_id]);requireThat(member&&roles.includes(member.role),422,'INVALID_TEAM','La cuenta no es compatible con la función.');
  const scope=caseScope(member as User);requireThat(await one(sql,`SELECT c.id FROM cases c WHERE c.id=$${scope.values.length+1} AND ${scope.clause}`,[...scope.values,c.id]),422,'INVALID_TEAM','La cuenta no tiene acceso vigente.');return member;
}
export async function activeAccount(sql:Sql,u:User,id:string,roles?:string[]){const account=await one(sql,'SELECT * FROM users WHERE id=$1 AND firm_id=$2 AND active',[id,u.firm_id]);requireThat(account&&(!roles||roles.includes(account.role)),422,'INVALID_ACCOUNT','La cuenta no está activa o su perfil no es compatible.');return account;}
export async function audit(sql:Sql,u:User,resourceId:string,action:string,caseId:string|null=null,reason?:string,before?:unknown,after?:unknown,finance=false){await sql.query('INSERT INTO audit_events(id,firm_id,actor_id,person_id,case_id,resource_id,action,reason,before_data,after_data,economic) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[randomUUID(),u.firm_id,u.id,u.person_id,caseId,resourceId,action,reason||null,before?JSON.stringify(before):null,after?JSON.stringify(after):null,finance]);}
export function version(row:Row,body:Row){requireThat(row.version===body.version,409,'VERSION_CONFLICT','El recurso cambió; vuelve a consultarlo.');}
export function internal(u:User){requireThat(u.role!=='client',403,'FORBIDDEN','El portal es de solo lectura.');}
export function admin(u:User){requireThat(u.role==='superadmin',403,'FORBIDDEN','Solo superadministración.');}
export function manage(u:User){requireThat(direction(u),403,'FORBIDDEN','Solo gerencia o superadministración.');}
export function asUser(row:Row){return row as User;}
