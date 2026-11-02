// Cartera operativa paginada; datos ficticios en memoria, permisos antes del conteo.
const caseListState={role:null,q:'',status:'',project:'',lawyer:'',client:'',page:1,expanded:false};
function caseFilterOptions(label,id,values,value){return `<label>${label}<select id="${id}" onchange="changeCaseFilters()"><option value="">Todos</option>${values.map(v=>`<option ${v===value?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;}
function casesPage(){
  const s=caseListState,cs=visible();
  if(s.role!==role)Object.assign(s,{role,q:'',status:'',project:'',lawyer:'',client:'',page:1,expanded:false});
  return page(role==='client'?'Mis expedientes':'Expedientes',globalAccess()?'Cartera completa del estudio. Busca un expediente para consultar su ficha.':role==='client'?'Consulta los expedientes habilitados y las publicaciones para tu cuenta.':'Tu cartera de expedientes asignados.',`
    <section class="project-controls" aria-label="Buscar y filtrar expedientes"><div class="project-search-row"><label class="project-search">Buscar expedientes<input id="case-q" type="search" value="${esc(s.q)}" placeholder="Código, título o cliente…" oninput="changeCaseFilters()"></label>
    ${caseFilterOptions('Estado','case-status',['Borrador','Abierto','En trámite','Suspendido','Cerrado'],s.status)}
    <button class="button secondary filter-toggle" id="case-filter-toggle" aria-expanded="${s.expanded}" aria-controls="case-filter-panel" onclick="toggleCaseFilters()">Filtros</button></div>
    <div class="project-filter-panel" id="case-filter-panel" ${s.expanded?'':'hidden'}><div class="project-panel-heading"><b>Filtrar por</b><span>Los resultados se actualizan al seleccionar.</span></div><div class="project-panel-fields">
    ${caseFilterOptions('Cliente','case-client',[...new Set(cs.map(c=>c.client))].sort(),s.client)}${caseFilterOptions('Proyecto','case-project',[...new Set(cs.map(c=>c.project))].sort(),s.project)}${caseFilterOptions('Abogado','case-lawyer',[...new Set(cs.map(c=>c.lawyer))].sort(),s.lawyer)}</div></div>
    <div class="project-active-filters" id="case-active-filters" hidden></div></section><section class="card project-list" aria-label="Lista de expedientes"><div class="project-list-heading"><div><h2>Listado de expedientes</h2><span id="case-result-count" role="status"></span></div></div><div id="case-results">${caseResults()}</div></section>`,cs.some(c=>can(c,'create'))?btn('Nuevo expediente',"newCase()"): '');
}
let caseMatchCount=0;
function caseResults(){
  const s=caseListState,q=s.q.trim().toLocaleLowerCase('es');
  const cs=visible().filter(c=>(!s.status||s.status===c.status)&&(!s.project||s.project===c.project)&&(!s.lawyer||s.lawyer===c.lawyer)&&(!s.client||s.client===c.client)&&`${c.id} ${c.name} ${c.client}`.toLocaleLowerCase('es').includes(q)).sort((a,b)=>a.id.localeCompare(b.id,'es',{numeric:true}));
  caseMatchCount=cs.length;const pages=Math.max(1,Math.ceil(cs.length/25));s.page=Math.max(1,Math.min(s.page,pages));const start=(s.page-1)*25;
  return `<div class="case-page-rows">${caseList(cs.slice(start,start+25))}</div><div class="pagination"><span>${cs.length?start+1:0}–${Math.min(start+25,cs.length)} de ${cs.length} · 25 por página</span><div class="actions"><button class="button secondary" onclick="casePage(-1)" ${s.page===1?'disabled':''}>Anterior</button><span>Página ${s.page} de ${pages}</span><button class="button secondary" onclick="casePage(1)" ${s.page===pages?'disabled':''}>Siguiente</button></div></div>`;
}
function toggleCaseFilters(){caseListState.expanded=!caseListState.expanded;$('#case-filter-panel').hidden=!caseListState.expanded;$('#case-filter-toggle').setAttribute('aria-expanded',String(caseListState.expanded));}
function syncCaseFilters(){
  const s=caseListState,names={q:'Búsqueda',status:'Estado',client:'Cliente',project:'Proyecto',lawyer:'Abogado'},keys=Object.keys(names).filter(k=>s[k].trim());
  $('#case-active-filters').hidden=!keys.length;
  $('#case-active-filters').innerHTML=keys.map(k=>`<button class="filter-chip" aria-label="Quitar filtro ${names[k]}" onclick="removeCaseFilter('${k}')"><span>${names[k]}: <b>${esc(s[k])}</b></span><span aria-hidden="true">×</span></button>`).join('')+`<button class="filter-clear" onclick="clearCaseFilters()">Limpiar filtros</button>`;
  const count=['client','project','lawyer'].filter(k=>s[k]).length;$('#case-filter-toggle').textContent='Filtros'+(count?' ('+count+')':'');
  $('#case-result-count').textContent=`${caseMatchCount} ${caseMatchCount===1?'expediente encontrado':'expedientes encontrados'}`;
}
function changeCaseFilters(){const s=caseListState;for(const k of ['q','status','client','project','lawyer'])s[k]=$('#case-'+k).value;s.page=1;$('#case-results').innerHTML=caseResults();syncCaseFilters();}
function removeCaseFilter(k){$('#case-'+k).value='';changeCaseFilters();$('#case-q').focus();}
function clearCaseFilters(){for(const k of ['q','status','client','project','lawyer'])$('#case-'+k).value='';changeCaseFilters();$('#case-q').focus();}
function casePage(delta){caseListState.page+=delta;$('#case-results').innerHTML=caseResults();syncCaseFilters();$('#case-results').scrollIntoView({block:'start'});}
