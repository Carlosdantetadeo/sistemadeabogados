import {randomUUID} from 'node:crypto';
import {Decimal} from 'decimal.js';
import {Sql,Row,one} from './db.js';
import {User,caseAccess,economic,audit,version,internal} from './policy.js';
import {missing,requireThat} from './errors.js';
import {pagination} from './paging.js';
import {projectAccess} from './core.js';
export const costView=(c:Row)=>({id:c.id,caseId:c.case_id,description:c.description,amount:new Decimal(c.amount).toFixed(2),currency:c.currency,registeredBy:c.registered_by,approval:c.approval,billing:c.billing,version:c.version});
export const paymentView=(p:Row)=>({id:p.id,invoiceId:p.invoice_id,amount:new Decimal(p.amount).toFixed(2),currency:p.currency,date:p.date instanceof Date?p.date.toISOString().slice(0,10):p.date,reference:p.reference,reversesId:p.reverses_id||undefined});
export function csvCell(v:unknown){let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
export function csv(rows:unknown[][]){return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');}
export class Finance {
 async cost(sql:Sql,u:User,id:string,lock=false){const row=await one(sql,`SELECT * FROM costs WHERE id=$1 AND firm_id=$2${lock?' FOR UPDATE':''}`,[id,u.firm_id]);if(!row)throw missing();const c=await caseAccess(sql,u,row.case_id);await economic(sql,u,c);return row;}
 async billing(sql:Sql,u:User,id:string,lock=false){const draft=await one(sql,`SELECT * FROM billing_drafts WHERE id=$1 AND firm_id=$2${lock?' FOR UPDATE':''}`,[id,u.firm_id]);if(!draft)throw missing();const lines=(await sql.query('SELECT * FROM billing_lines WHERE draft_id=$1 AND firm_id=$2 ORDER BY id',[id,u.firm_id])).rows;for(const line of lines)await economic(sql,u,await caseAccess(sql,u,line.case_id));return {draft,lines};}
 async billingView(sql:Sql,draft:Row,lines:Row[]){const invoice=await one(sql,'SELECT id FROM invoice_references WHERE draft_id=$1 AND firm_id=$2',[draft.id,draft.firm_id]);return {id:draft.id,projectId:draft.project_id,currency:draft.currency,status:draft.status,version:draft.version,invoiceId:invoice?.id,lines:lines.map(l=>({costId:l.cost_id,caseId:l.case_id,description:l.description,quantity:l.quantity,unitPrice:new Decimal(l.unit_price).toFixed(2),amount:new Decimal(l.amount).toFixed(2)}))};}
 async handle(op:string,sql:Sql,u:User,id:string,b:Row,q:Row):Promise<any>{
  if(!['listCosts','createCost','updateCost','approveCost','adjustCost','createBillingDraft','confirmBilling','cancelBilling','exportBilling','createPayment','reversePayment'].includes(op))return undefined;
  internal(u);
  if(op==='listCosts'||op==='createCost'){
    const c=await caseAccess(sql,u,id);await economic(sql,u,c);
    if(op==='listCosts'){const p=pagination(q,u,op+id);return p.page((await sql.query('SELECT * FROM costs WHERE case_id=$1 AND firm_id=$2 ORDER BY id LIMIT $3 OFFSET $4',[id,u.firm_id,p.limit+1,p.offset])).rows.map(costView));}
    if(b.activityId)requireThat(await one(sql,'SELECT 1 FROM activities WHERE id=$1 AND case_id=$2 AND firm_id=$3',[b.activityId,id,u.firm_id]),422,'INVALID_ACTIVITY','Actuación incompatible.');
    if(b.documentId)requireThat(await one(sql,"SELECT 1 FROM documents WHERE id=$1 AND case_id=$2 AND firm_id=$3 AND classification='financial' AND status='available'",[b.documentId,id,u.firm_id]),422,'INVALID_DOCUMENT','Comprobante incompatible.');
    const quantity=new Decimal(b.quantity),price=new Decimal(b.unitPrice);requireThat(quantity.gt(0)&&price.gte(0)&&quantity.decimalPlaces()<=4&&quantity.lt('100000000000000')&&price.lt('100000000000000'),422,'INVALID_AMOUNT','Cantidad o precio no válido.');const amount=quantity.mul(price).toDecimalPlaces(2,Decimal.ROUND_HALF_UP);requireThat(amount.abs().lt('10000000000000000'),422,'INVALID_AMOUNT','Importe fuera de rango.');
    const costId=randomUUID();await sql.query('INSERT INTO costs(id,firm_id,case_id,activity_id,registered_by,description,currency,quantity,unit_price,amount,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[costId,u.firm_id,id,b.activityId||null,u.id,b.description,b.currency,quantity.toFixed(4),price.toFixed(4),amount.toFixed(2),JSON.stringify(b)]);await audit(sql,u,costId,op,id,undefined,undefined,{amount:amount.toFixed(2),currency:b.currency},true);return costView(await this.cost(sql,u,costId));
  }
  if(['updateCost','approveCost','adjustCost'].includes(op)){
    const c=await this.cost(sql,u,id,true);version(c,b);
    if(op==='approveCost'){
      requireThat(c.approval==='registered'&&c.billing==='pending',409,'COST_NOT_REVIEWABLE','El costo no está pendiente de aprobación.');const registrar=await one(sql,'SELECT person_id FROM users WHERE id=$1',[c.registered_by]);requireThat(registrar.person_id!==u.person_id,403,'SELF_APPROVAL','No puedes aprobar tu propio registro.');
      await sql.query('UPDATE costs SET approval=$1,approved_by=$2,data=data||$3::jsonb,version=version+1 WHERE id=$4 AND firm_id=$5',[b.decision==='approve'?'approved':'rejected',u.id,JSON.stringify({approvalReason:b.reason}),id,u.firm_id]);
    }else if(op==='adjustCost'){
      requireThat(c.billing==='invoiced',409,'COST_NOT_INVOICED','El ajuste requiere un costo facturado.');const amount=new Decimal(b.amount);requireThat(!amount.isZero(),422,'INVALID_AMOUNT','El ajuste no puede ser cero.');const aid=randomUUID();await sql.query('INSERT INTO costs(id,firm_id,case_id,registered_by,original_cost_id,description,currency,quantity,unit_price,amount,data) VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10)',[aid,u.firm_id,c.case_id,u.id,id,'Ajuste: '+c.description,c.currency,amount.toFixed(4),amount.toFixed(2),JSON.stringify(b)]);await audit(sql,u,aid,op,c.case_id,b.reason,undefined,{amount:amount.toFixed(2)},true);return costView(await this.cost(sql,u,aid));
    }else{
      requireThat(c.billing==='pending'&&!c.original_cost_id,409,'IMMUTABLE_COST','Costo reservado/facturado o ajuste no editable.');requireThat(!b.activityId||await one(sql,'SELECT 1 FROM activities WHERE id=$1 AND case_id=$2 AND firm_id=$3',[b.activityId,c.case_id,u.firm_id]),422,'INVALID_ACTIVITY','Actuación incompatible.');
      if(b.documentId)requireThat(await one(sql,"SELECT 1 FROM documents WHERE id=$1 AND case_id=$2 AND firm_id=$3 AND classification='financial'",[b.documentId,c.case_id,u.firm_id]),422,'INVALID_DOCUMENT','Comprobante incompatible.');
      const quantity=new Decimal(b.quantity??c.quantity),price=new Decimal(b.unitPrice??c.unit_price);requireThat(quantity.gt(0)&&price.gte(0),422,'INVALID_AMOUNT','Importe no válido.');const amount=quantity.mul(price).toDecimalPlaces(2,Decimal.ROUND_HALF_UP);
      await sql.query("UPDATE costs SET description=$1,currency=$2,quantity=$3,unit_price=$4,amount=$5,activity_id=$6,approval='registered',approved_by=NULL,registered_by=$7,data=data||$8::jsonb,version=version+1 WHERE id=$9 AND firm_id=$10",[b.description??c.description,b.currency??c.currency,quantity.toFixed(4),price.toFixed(4),amount.toFixed(2),b.activityId??c.activity_id,u.id,JSON.stringify(b),id,u.firm_id]);
    }
    await audit(sql,u,id,op,c.case_id,b.reason,{approval:c.approval,billing:c.billing},undefined,true);return costView(await this.cost(sql,u,id));
  }
  if(op==='createBillingDraft'){
    await projectAccess(sql,u,id,true);const ids=[...b.costIds].sort();const costs:Row[]=[];
    for(const cid of ids){const c=await this.cost(sql,u,cid,true);const cas=await caseAccess(sql,u,c.case_id);requireThat(cas.project_id===id&&c.currency===b.currency&&c.approval==='approved'&&c.billing==='pending',409,'INVALID_BILLING_LINES','Revisa proyecto, moneda y aprobación de los costos.');costs.push(c);}
    const draftId=randomUUID();await sql.query('INSERT INTO billing_drafts(id,firm_id,project_id,currency,created_by) VALUES($1,$2,$3,$4,$5)',[draftId,u.firm_id,id,b.currency,u.id]);
    for(const c of costs){await sql.query('INSERT INTO reservations(cost_id,firm_id,draft_id) VALUES($1,$2,$3)',[c.id,u.firm_id,draftId]);await sql.query('INSERT INTO billing_lines(id,firm_id,draft_id,cost_id,case_id,description,quantity,unit_price,amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),u.firm_id,draftId,c.id,c.case_id,c.description,c.quantity,c.unit_price,c.amount]);await sql.query("UPDATE costs SET billing='reserved',version=version+1 WHERE id=$1 AND firm_id=$2",[c.id,u.firm_id]);await audit(sql,u,draftId,op,c.case_id,undefined,undefined,{costId:c.id},true);}
    const result=await this.billing(sql,u,draftId);return this.billingView(sql,result.draft,result.lines);
  }
  if(['confirmBilling','cancelBilling','exportBilling'].includes(op)){
    const {draft,lines}=await this.billing(sql,u,id,op!=='exportBilling');if(op!=='exportBilling')version(draft,b);
    if(op==='exportBilling'){await audit(sql,u,id,op,lines[0]?.case_id,undefined,undefined,undefined,true);return {binary:Buffer.from(csv([['Expediente','Concepto','Cantidad','Precio','Importe','Moneda'],...lines.map(l=>[l.case_id,l.description,l.quantity,l.unit_price,l.amount,draft.currency])])),mime:'text/csv; charset=utf-8',filename:`borrador-${id}.csv`};}
    requireThat(draft.status==='draft',409,'IMMUTABLE_BILLING','El borrador ya no está abierto.');
    if(op==='confirmBilling'){
      requireThat(b.dueOn>=b.issuedOn,422,'INVALID_DATES','Vencimiento anterior a la emisión.');await sql.query('INSERT INTO invoice_references(id,firm_id,draft_id,data) VALUES($1,$2,$3,$4)',[randomUUID(),u.firm_id,id,JSON.stringify(b)]);
      await sql.query("UPDATE costs SET billing='invoiced',version=version+1 WHERE id IN(SELECT cost_id FROM reservations WHERE draft_id=$1 AND firm_id=$2) AND firm_id=$2",[id,u.firm_id]);
    }else{await sql.query("UPDATE costs SET billing='pending',version=version+1 WHERE id IN(SELECT cost_id FROM reservations WHERE draft_id=$1 AND firm_id=$2) AND firm_id=$2",[id,u.firm_id]);await sql.query('DELETE FROM reservations WHERE draft_id=$1 AND firm_id=$2',[id,u.firm_id]);}
    await sql.query('UPDATE billing_drafts SET status=$1,version=version+1 WHERE id=$2 AND firm_id=$3',[op==='confirmBilling'?'confirmed':'cancelled',id,u.firm_id]);for(const cid of new Set(lines.map(l=>l.case_id)))await audit(sql,u,id,op,cid,b.reason,undefined,undefined,true);const result=await this.billing(sql,u,id);return this.billingView(sql,result.draft,result.lines);
  }
  if(op==='createPayment'||op==='reversePayment'){
    let original:Row|undefined;if(op==='reversePayment'){original=await one(sql,'SELECT * FROM payments WHERE id=$1 AND firm_id=$2',[id,u.firm_id]);if(!original)throw missing();requireThat(!original.reverses_id,409,'INVALID_REVERSAL','No se revierte una reversión.');}
    const invoiceId=original?.invoice_id||id;const invoice=await one(sql,'SELECT * FROM invoice_references WHERE id=$1 AND firm_id=$2 FOR UPDATE',[invoiceId,u.firm_id]);if(!invoice)throw missing();version(invoice,b);const {draft,lines}=await this.billing(sql,u,invoice.draft_id);const total=lines.reduce<Decimal>((acc,l)=>acc.plus(l.amount),new Decimal(0));const paid=await one(sql,'SELECT coalesce(sum(amount),0)::text amount FROM payments WHERE invoice_id=$1 AND firm_id=$2',[invoiceId,u.firm_id]);
    let amount:Decimal;if(original){requireThat(!await one(sql,'SELECT 1 FROM payments WHERE reverses_id=$1 AND firm_id=$2',[original.id,u.firm_id]),409,'ALREADY_REVERSED','El abono ya fue revertido.');amount=new Decimal(original.amount).negated();}else{amount=new Decimal(b.amount);requireThat(amount.gt(0)&&b.currency===draft.currency&&new Decimal(paid.amount).plus(amount).lte(total),422,'PAYMENT_EXCEEDS_BALANCE','Revisa moneda e importe; no puede superar el saldo.');}
    const pid=randomUUID();await sql.query('INSERT INTO payments(id,firm_id,invoice_id,amount,currency,date,reference,reverses_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[pid,u.firm_id,invoiceId,amount.toFixed(2),draft.currency,original?new Date().toISOString().slice(0,10):b.date,original?'Reversión: '+b.reason:b.reference,original?.id||null,u.id]);await sql.query('UPDATE invoice_references SET version=version+1 WHERE id=$1 AND firm_id=$2',[invoiceId,u.firm_id]);for(const cid of new Set(lines.map(l=>l.case_id)))await audit(sql,u,pid,op,cid,b.reason,undefined,{amount:amount.toFixed(2)},true);return paymentView(await one(sql,'SELECT * FROM payments WHERE id=$1 AND firm_id=$2',[pid,u.firm_id]));
  }
 }
}
