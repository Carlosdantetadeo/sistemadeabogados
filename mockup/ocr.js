// UX demonstration only. No file or page is sent to an OCR engine.
function ocrAllowed(d){const c=d&&lookup(d.caseId);return !!d&&!d.removed&&role!=='client'&&can(c,'read')&&can(c,'upload')&&(d.classification!=='Económica'||econ(c))&&/\.(pdf|jpg|jpeg|png)$/i.test(d.name);}
function ocrDemo(id){
  const d=db.docs.find(d=>d.id===id);if(!ocrAllowed(d))return toast('No tienes permiso vigente para extraer texto.');
  const version=d.version;
  modal('Extraer texto del documento',note('Demostración de OCR: no se procesa el archivo ni se envía a un proveedor.')+`<div class="preview-paper"><h3>${esc(d.name)}</h3><p>${d.caseId} · Versión ${version}</p><p>Se obtendrá texto por página para revisarlo contra el original.</p></div>`+check('Confirmo la versión y el expediente. El texto quedará interno y no creará plazos.'),()=>{if(!ocrAllowed(d)||d.version!==version)return fail('La versión o el acceso cambió. Abre la versión actual.');closeModal();reviewOcrDemo(id,version);});
}
function reviewOcrDemo(id,version){
  const d=db.docs.find(d=>d.id===id);if(!ocrAllowed(d)||d.version!==version)return toast('Texto no disponible para esta versión o acceso.');
  const previous=d.ocr?.version===version?d.ocr:null;
  modal('Revisar texto extraído · página 1',note('Resultado ficticio para revisar el flujo. El motor OCR aún no está implementado.')+`<div class="preview-paper"><small>ORIGINAL DE REFERENCIA · EJEMPLO FICTICIO</small><h3>${esc(d.name)} · v${version}</h3><p>Resolución de ejemplo. Se requiere revisar la documentación presentada.</p></div><label>Texto de la página 1<textarea name="text" rows="5" required>${esc(previous?.text||'Resolución de ejemplo. Se requiere revisar la documentación presentada.')}</textarea></label>`+reason()+check('Comparé el texto con el original. Confirmo esta revisión interna.'),f=>{if(!ocrAllowed(d)||d.version!==version)return fail('No se puede guardar: cambió la versión o el acceso.');const result={version,text:f.get('text'),reviewer:me(),reason:f.get('reason'),date:new Date().toISOString()};d.ocrHistory??=[];if(previous)d.ocrHistory.push({...previous});d.ocr=result;log('Revisó texto OCR de demostración · versión '+version,d.caseId,d.classification==='Económica');done('Texto de demostración revisado; original conservado y sin publicar');});
}
