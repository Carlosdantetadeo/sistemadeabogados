import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,api,seedCase} from './support.js';
test('money is exact; approval, reservations, idempotency, external invoice and reversible payments',async()=>{
 const x=await setup();try{
 const {caseId,project}=await seedCase(x,true);
 const body={description:'Tasa',category:'court_fees',date:'2026-10-31',currency:'PEN',quantity:'3',unitPrice:'10.25',reimbursable:false};
 const create=await api(x,'post',`/cases/${caseId}/costs`,'manager','create-cost-idempotent-001').send(body).expect(201);assert.equal(create.body.amount,'30.75');
 const repeat=await api(x,'post',`/cases/${caseId}/costs`,'manager','create-cost-idempotent-001').send({...body}).expect(201);assert.equal(create.body.id,repeat.body.id);
 await api(x,'post',`/cases/${caseId}/costs`,'manager','create-cost-idempotent-001').send({...body,quantity:'4'}).expect(409);
 const id=create.body.id;
 await api(x,'post',`/costs/${id}/approvals`,'manager','self-approval-rejected-001').send({decision:'approve',reason:'Revisado por el autor',version:1}).expect(403);
 await api(x,'post',`/costs/${id}/approvals`,'admin','independent-approval-001').send({decision:'approve',reason:'Revisión independiente',version:1}).expect(200);
 const attempts=await Promise.all(['reserve-first-000001','reserve-second-00001'].map(k=>api(x,'post',`/projects/${project}/billing-drafts`,'manager',k).send({costIds:[id],currency:'PEN'})));
 assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);const draft=attempts.find(r=>r.status===201)!.body;
 const invoice=await api(x,'post',`/billing-drafts/${draft.id}/confirm`,'manager','confirm-invoice-000001').send({documentType:'Factura',externalReference:'F001-TEST',issuedOn:'2026-10-31',dueOn:'2026-11-30',version:1}).expect(200);assert.ok(invoice.body.invoiceId);
 await api(x,'patch',`/costs/${id}`).send({...body,reason:'Intento de alterar facturado',version:4}).expect(409);
 await api(x,'post',`/invoices/${invoice.body.invoiceId}/payments`,'manager','overpayment-test-0001').send({amount:'31.00',currency:'PEN',date:'2026-10-31',reference:'OVER',version:1}).expect(422);
 const payment=await api(x,'post',`/invoices/${invoice.body.invoiceId}/payments`,'manager','valid-payment-000001').send({amount:'30.75',currency:'PEN',date:'2026-10-31',reference:'PAY',version:1}).expect(201);
 const reversed=await api(x,'post',`/payments/${payment.body.id}/reversals`,'manager','reverse-payment-00001').send({reason:'Abono aplicado por error',version:2}).expect(200);assert.equal(reversed.body.amount,'-30.75');
 const sum=await x.db.query('SELECT sum(amount)::text total,count(*)::integer count FROM payments WHERE invoice_id=$1',[invoice.body.invoiceId]);assert.equal(Number(sum.rows[0].total),0);assert.equal(sum.rows[0].count,2);
 for(const actor of ['lawyer','assistant','client'])await api(x,'get',`/cases/${caseId}/costs`,actor).expect(403);
 }finally{await x.close();}
});
test('global administrative visibility alone does not authorize project economics',async()=>{
 const x=await setup();try{const {caseId}=await seedCase(x,false);await api(x,'get',`/cases/${caseId}`,'admin').expect(200);await api(x,'get',`/cases/${caseId}/costs`,'admin').expect(403);}finally{await x.close();}
});
