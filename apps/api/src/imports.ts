import {randomUUID} from 'node:crypto';
import {Sql,Row,one} from './db.js';
import {User,internal,direction,audit,version,activeAccount} from './policy.js';
import {Storage} from './storage.js';
import {missing,requireThat} from './errors.js';
import {enqueue} from './jobs.js';
export function importView(r:Row,rows:Row[]=[]){
 return {id:r.id,status:r.status,version:r.version,failureCode:r.data.failureCode||undefined,validRows:rows.filter(v=>v.status==='valid'||v.status==='imported').length,invalidRows:rows.filter(v=>v.status==='invalid').length,groups:Array.from(new Map(rows.map(v=>[v.project_group,{id:v.project_group,projectCode:v.data.projectCode||'',status:rows.some(x=>x.project_group===v.project_group&&x.status==='invalid')?'invalid':'valid'}])).values()),errors:rows.filter(v=>v.error_code).map(v=>({row:v.row_number,code:v.error_code,message:'Revisa los datos, duplicados y cuentas del grupo.'}))};
}
export class Imports {
 constructor(private storage:Storage){}
 async handle(op:string,sql:Sql,u:User,id:string,b:Row):Promise<any>{
  if(!['createImport','getImport','validateImport','confirmImport'].includes(op))return undefined;
  internal(u);requireThat(direction(u)||u.role==='lawyer',403);
  if(op==='createImport'){
   requireThat(b.sizeBytes>0&&b.sizeBytes<=25*1024*1024&&/^[a-f\d]{64}$/.test(b.sha256),422,'INVALID_IMPORT','Revisa tamaño y hash de la planilla.');
   const prior=await one(sql,'SELECT * FROM imports WHERE firm_id=$1 AND source_hash=$2',[u.firm_id,b.sha256]);
   if(prior){requireThat(prior.requested_by===u.id||direction(u),404);return importView(prior,(await sql.query('SELECT * FROM import_rows WHERE import_id=$1 AND firm_id=$2',[prior.id,u.firm_id])).rows);}
   const iid=randomUUID(),key=`${u.firm_id}/imports/${iid}.${b.sourceType}`;
   const mime=b.sourceType==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
   const upload=await this.storage.uploadForm(key,mime,b.sizeBytes);
   await sql.query('INSERT INTO imports(id,firm_id,requested_by,source_hash,object_key,data) VALUES($1,$2,$3,$4,$5,$6)',[iid,u.firm_id,u.id,b.sha256,key,JSON.stringify(b)]);
   await audit(sql,u,iid,op);return {...importView(await one(sql,'SELECT * FROM imports WHERE id=$1',[iid])),upload};
  }
  const r=await one(sql,`SELECT * FROM imports WHERE id=$1 AND firm_id=$2${op==='getImport'?'':' FOR UPDATE'}`,[id,u.firm_id]);
  if(!r||r.requested_by!==u.id&&!direction(u))throw missing();
  const rows=(await sql.query('SELECT * FROM import_rows WHERE import_id=$1 AND firm_id=$2 ORDER BY row_number',[id,u.firm_id])).rows;
  if(op==='getImport')return importView(r,rows);version(r,b);
  if(op==='validateImport'){
   requireThat(r.status==='uploaded',409,'IMPORT_ALREADY_VALIDATED','El lote ya se procesó.');
   const head=await this.storage.head(r.object_key);requireThat(head.size===r.data.sizeBytes,422,'SIZE_MISMATCH','Tamaño de planilla no válido.');
   await enqueue(sql,u,'import_validate',id);await sql.query("UPDATE imports SET status='validating',version=version+1 WHERE id=$1 AND firm_id=$2",[id,u.firm_id]);return importView({...r,status:'validating',version:r.version+1});
  }
  requireThat(r.status==='validated',409,'IMPORT_NOT_READY','Primero valida la planilla.');
  requireThat(b.projectGroupIds.length>0,422,'GROUP_REQUIRED','Selecciona grupos válidos.');
  for(const groupId of b.projectGroupIds){
   const group=rows.filter(row=>row.project_group===groupId);
   requireThat(group.length&&group.every(row=>row.status==='valid'),422,'INVALID_GROUP','No se admite un grupo inválido o incompleto.');
   const first=group[0].data;
   requireThat(!await one(sql,'SELECT 1 FROM projects WHERE firm_id=$1 AND code=$2',[u.firm_id,first.projectCode]),409,'DUPLICATE_PROJECT','El proyecto ya existe; no se duplicó.');
   let client=await one(sql,'SELECT * FROM clients WHERE firm_id=$1 AND name=$2',[u.firm_id,first.clientName]);
   if(!client){requireThat(direction(u),403,'CLIENT_CREATION_REQUIRED','Un gerente debe habilitar el cliente.');const cid=randomUUID();await sql.query("INSERT INTO clients(id,firm_id,name,type) VALUES($1,$2,$3,'person')",[cid,u.firm_id,first.clientName]);client={id:cid};}
   else if(!direction(u))requireThat(await one(sql,'SELECT 1 FROM client_creation_grants WHERE firm_id=$1 AND client_id=$2 AND user_id=$3',[u.firm_id,client.id,u.id]),403,'CLIENT_NOT_ENABLED','Cliente no habilitado.');
   await activeAccount(sql,u,first.partnerId,['manager','superadmin']);await activeAccount(sql,u,first.leadId,['lawyer']);
   const pid=randomUUID();
   await sql.query("INSERT INTO projects(id,firm_id,client_id,code,name,status,owner_id,partner_id,lead_id,data) VALUES($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9)",[pid,u.firm_id,client.id,first.projectCode,first.projectName,u.id,first.partnerId,first.leadId,JSON.stringify({importId:id})]);
   for(const row of group){
    const d=row.data;
    await activeAccount(sql,u,d.responsibleId,['lawyer']);await activeAccount(sql,u,d.followupId,['lawyer','assistant']);await activeAccount(sql,u,d.backupId,['lawyer','assistant']);requireThat(d.followupId!==d.backupId,422,'INVALID_TEAM','Equipo no válido.');
    const caseId=randomUUID();
    await sql.query("INSERT INTO cases(id,firm_id,project_id,code,title,type,status,responsible_id,followup_id,backup_id,data) VALUES($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10)",[caseId,u.firm_id,pid,'EXP-'+caseId.slice(0,8).toUpperCase(),d.caseTitle,d.caseType||'judicial',d.responsibleId,d.followupId,d.backupId,JSON.stringify({importId:id,sourceRow:row.row_number})]);
    if(d.dueOn){
     const nid=randomUUID(),did=randomUUID(),rev=randomUUID();
     await sql.query('INSERT INTO notices(id,firm_id,case_id,registered_by,received_at,data) VALUES($1,$2,$3,$4,now(),$5)',[nid,u.firm_id,caseId,u.id,JSON.stringify({source:'import',title:d.deadlineTitle||'Plazo importado',importId:id,sourceRow:row.row_number})]);
     const proposal={title:d.deadlineTitle||'Plazo importado',dueOn:d.dueOn,basis:d.basis||'Planilla, fila '+row.row_number,sourceRow:row.row_number,importId:id,responsibleId:d.responsibleId,backupId:d.backupId};
     await sql.query('INSERT INTO deadlines(id,firm_id,case_id,notice_id,registered_by,revision_id,due_on,responsible_id,backup_id,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[did,u.firm_id,caseId,nid,u.id,rev,d.dueOn,d.responsibleId,d.backupId,JSON.stringify(proposal)]);
     await sql.query('INSERT INTO deadline_revisions(id,firm_id,deadline_id,author_id,data) VALUES($1,$2,$3,$4,$5)',[rev,u.firm_id,did,u.id,JSON.stringify(proposal)]);await enqueue(sql,u,'deadline_alert',did,caseId);
    }
    await sql.query("UPDATE import_rows SET status='imported',created_id=$1 WHERE id=$2 AND firm_id=$3",[caseId,row.id,u.firm_id]);
    await audit(sql,u,caseId,op,caseId,'Borrador importado: permisos y soporte de plazos pendientes de revisión expresa.');
   }
   await audit(sql,u,pid,op,null,'Grupo completo importado sin autorizar cuentas.');
  }
  await sql.query("UPDATE imports SET status='confirmed',version=version+1 WHERE id=$1 AND firm_id=$2",[id,u.firm_id]);
  return importView({...r,status:'confirmed',version:r.version+1},(await sql.query('SELECT * FROM import_rows WHERE import_id=$1 AND firm_id=$2',[id,u.firm_id])).rows);
 }
}
