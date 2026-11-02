import {randomUUID} from 'node:crypto';
import {Sql,one,Row} from './db.js';
import {User,caseAccess,caseScope,audit,internal} from './policy.js';
import {requireThat,missing} from './errors.js';
import {projectAccess} from './core.js';
import {pagination} from './paging.js';
import {csv} from './finance.js';
import {enqueue} from './jobs.js';
import PDFDocument from 'pdfkit';
const portalCase=(c:Row)=>({id:c.id,code:c.code,publicTitle:c.data.publicTitle||c.title,publicStatus:c.status,contactName:c.contact_name});
export class PortalReports {
 async handle(op:string,sql:Sql,u:User,id:string,b:Row,q:Row):Promise<any>{
  if(op==='listPortalCases'||op==='getPortalCase'){
    requireThat(u.role==='client',403,'CLIENT_ONLY','Usa tu cartera operativa.');const s=caseScope(u),args:any[]=[...s.values];const p=pagination(q,u,op);let where=`${s.clause} AND EXISTS(SELECT 1 FROM projects p JOIN client_memberships m ON m.client_id=p.client_id AND m.firm_id=p.firm_id WHERE p.id=c.project_id AND m.user_id=$2)`;if(op==='getPortalCase'){args.push(id);where+=` AND c.id=$${args.length}`;}
    const rows=(await sql.query(`SELECT c.*,a.name contact_name FROM cases c JOIN users a ON a.id=c.responsible_id WHERE ${where} ORDER BY c.id LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,op==='getPortalCase'?1:p.limit+1,p.offset])).rows;if(op==='getPortalCase'){if(!rows[0])throw missing();return portalCase(rows[0]);}return p.page(rows.map(portalCase));
  }
  if(op==='getPortalPublication'){
    requireThat(u.role==='client',403);const p=await one(sql,'SELECT p.* FROM publications p JOIN publication_audiences a ON a.publication_id=p.id AND a.firm_id=p.firm_id WHERE p.id=$1 AND p.firm_id=$2 AND a.user_id=$3 AND p.revoked_at IS NULL',[id,u.firm_id,u.id]);if(!p)throw missing();await caseAccess(sql,u,p.case_id);
    if(p.activity_revision_id){const a=await one(sql,'SELECT * FROM activity_revisions WHERE id=$1 AND firm_id=$2',[p.activity_revision_id,u.firm_id]);return {id:p.id,title:a.data.title,publicText:a.data.description,downloadAllowed:false,publishedAt:p.published_at};}
    const d=await one(sql,"SELECT d.title,d.status,v.id,v.sequence FROM document_versions v JOIN documents d ON d.id=v.document_id AND d.firm_id=v.firm_id WHERE v.id=$1 AND v.firm_id=$2 AND d.classification='operational' AND d.status='available'",[p.document_version_id,u.firm_id]);if(!d)throw missing();let downloadAllowed=false;try{await caseAccess(sql,u,p.case_id,'download');downloadAllowed=true;}catch{}return {id:p.id,title:d.title,publishedVersionId:d.id,versionSequence:d.sequence,downloadAllowed,publishedAt:p.published_at};
  }
  if(op==='listHistory'){
    internal(u);await caseAccess(sql,u,id,'audit');const p=pagination(q,u,op+id);const rows=(await sql.query('SELECT * FROM audit_events WHERE case_id=$1 AND firm_id=$2 AND NOT economic ORDER BY occurred_at,id LIMIT $3 OFFSET $4',[id,u.firm_id,p.limit+1,p.offset])).rows;return p.page(rows.map(a=>({id:a.id,actorId:a.actor_id,personId:a.person_id,resourceId:a.resource_id,action:a.action,occurredAt:a.occurred_at,result:a.result,reason:a.reason||undefined}))); // Economic differences use dedicated financial projections, never operational history.
  }
  if(op==='createReport'){
    internal(u);await projectAccess(sql,u,id);const rid=randomUUID();const s=caseScope(u);const partial=u.role!=='manager'&&u.role!=='superadmin';await sql.query('INSERT INTO reports(id,firm_id,project_id,requested_by,partial,expires_at,data) VALUES($1,$2,$3,$4,$5,now()+interval \'15 minutes\',$6)',[rid,u.firm_id,id,u.id,partial,JSON.stringify(b)]);await enqueue(sql,u,'report',rid);await audit(sql,u,rid,op);return {id:rid,status:'pending',partial,expiresAt:new Date(Date.now()+900000).toISOString()};
  }
  if(op==='downloadReport'){
    internal(u);const r=await one(sql,'SELECT * FROM reports WHERE id=$1 AND firm_id=$2 AND requested_by=$3 AND expires_at>now()',[id,u.firm_id,u.id]);if(!r)throw missing();requireThat(r.status==='ready',409,'REPORT_NOT_READY','El reporte todavía no está disponible.');await projectAccess(sql,u,r.project_id);
    // Generate again under current permissions instead of serving a stale export object.
    const s=caseScope(u);const args:any[]=[...s.values,r.project_id];let where=`${s.clause} AND c.project_id=$${args.length} AND NOT a.economic`;
    for(const [key,column] of [['from','a.occurred_at >='],['until','a.occurred_at <='],['personId','a.person_id ='],['action','a.action =']])if(r.data[key]){args.push(r.data[key]);where+=` AND ${column} $${args.length}`;}
    const rows=(await sql.query(`SELECT a.* FROM audit_events a JOIN cases c ON c.id=a.case_id AND c.firm_id=a.firm_id WHERE ${where} ORDER BY a.occurred_at,a.id LIMIT 5001`,args)).rows;requireThat(rows.length<=5000,422,'NARROW_REPORT','Reduce el periodo del reporte para generar un archivo acotado.');
    await audit(sql,u,id,op);const data=[['Actor','Persona','Expediente','Acción','Fecha UTC'],...rows.map(a=>[a.actor_id,a.person_id,a.case_id,a.action,new Date(a.occurred_at).toISOString()])];
    if(r.data.format==='csv')return {binary:Buffer.from(csv(data)),mime:'text/csv; charset=utf-8',filename:`reporte-${id}.csv`};
    const pdf=new PDFDocument({size:'A4',margin:40}),chunks:Buffer[]=[];const ready=new Promise<Buffer>((resolve,reject)=>{pdf.on('data',c=>chunks.push(c));pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject);});pdf.fontSize(16).text('Historial operativo autorizado');pdf.fontSize(10).text(r.partial?'Reporte parcial: solo expedientes autorizados.':'Reporte operativo completo del proyecto.');for(const a of rows)pdf.moveDown(.5).fontSize(9).text(`${new Date(a.occurred_at).toISOString()} | ${a.actor_id}\n${a.action} | ${a.case_id}`);pdf.end();const binary=await ready;requireThat(binary.length<=3*1024*1024,422,'NARROW_REPORT','Reduce el periodo para este PDF.');return {binary,mime:'application/pdf',filename:`reporte-${id}.pdf`};
  }
  if(op==='queryAI'||op==='getAIJob'||op==='configureAI'){
    requireThat(false,503,'FEATURE_DISABLED','La IA permanece desactivada; requiere D07 y aceptación antes de procesar documentos.');
  }
  return undefined;
 }
}
