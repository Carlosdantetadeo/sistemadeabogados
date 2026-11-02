"""Explicit request/response schemas for the unified v2 implementation contract."""
import json
import re
from pathlib import Path

def obj(props,required=()):
    result={'type':'object','additionalProperties':False,'properties':props}
    if required:result['required']=list(required)
    return result
def ref(name):return {'$ref':'#/components/schemas/'+name}
S={'type':'string'};ID={'type':'string','format':'uuid'};DATE={'type':'string','format':'date'};TIME={'type':'string','format':'date-time'};BOOL={'type':'boolean'};VER={'type':'integer','minimum':1}
MONEY={'type':'string','pattern':r'^-?\d+\.\d{2}$','description':'Decimal exacto; moneda separada. No usar punto flotante para operaciones.'}
POS={'type':'string','pattern':r'^\d+(\.\d{1,4})?$','description':'Decimal positivo; servidor comprueba > 0.'}
def enum(*items):return {'type':'string','enum':list(items)}
def arr(schema):return {'type':'array','items':schema}
ROLES=enum('manager','superadmin','lawyer','assistant','client')
ACTIONS=enum('read','download','edit','activity','upload','tasks','propose_deadline','verify_deadline','publish','audit','manage_access','economic','delete_document','create')
SC={
 'Error':obj({'code':S,'message':S,'requestId':S,'fields':{'type':'object','additionalProperties':S}},['code','message','requestId']),
 'Ack':obj({'ok':BOOL},['ok']),
 'Reason':obj({'reason':{'type':'string','minLength':5},'version':VER},['reason','version']),
 'Version':obj({'version':VER},['version']),
 'UserInput':obj({'email':{'type':'string','format':'email'},'name':S,'role':ROLES},['email','name','role']),
 'UserUpdate':obj({'role':ROLES,'active':BOOL,'replacementId':ID,'reason':S,'version':VER},['reason','version']),
 'UserView':obj({'id':ID,'name':S,'email':S,'role':ROLES,'active':BOOL,'version':VER},['id','name','role','active','version']),
 'SessionView':obj({'user':ref('UserView'),'firmId':ID,'mfaRequired':BOOL,'globalOperationalAccess':BOOL},['user','firmId','mfaRequired','globalOperationalAccess']),
 'InvitationView':obj({'id':ID,'email':S,'expiresAt':TIME},['id','email','expiresAt']),
 'ClientInput':obj({'name':S,'type':enum('person','company'),'documentType':S,'documentNumber':S,'email':S,'phone':S},['name','type']),
 'ClientView':obj({'id':ID,'name':S,'type':enum('person','company'),'archived':BOOL,'version':VER},['id','name','type','archived','version']),
 'ClientLookupView':obj({'id':ID,'name':S},['id','name']),
 'ProjectInput':obj({'clientId':ID,'name':S,'description':S,'matter':S,'partnerId':ID,'leadId':ID},['clientId','name','partnerId','leadId']),
 'ProjectView':obj({'id':ID,'code':S,'name':S,'clientId':ID,'clientName':S,'leadId':ID,'leadName':S,'partnerId':ID,'status':enum('draft','active','suspended','closed'),'version':VER},['id','code','name','clientName','leadName','status','version']),
 'ConflictInput':obj({'result':enum('pending','clear','resolved'),'reason':S,'version':VER},['result','reason','version']),
 'ConflictView':obj({'id':ID,'projectId':ID,'result':S,'reviewerId':ID,'reason':S,'createdAt':TIME},['id','projectId','result','reviewerId','createdAt']),
 'CaseInput':obj({'projectId':ID,'title':S,'type':enum('judicial','extrajudicial'),'judicialNumber':S,'authority':S,'matter':S,'instance':S,'stage':S,'openedOn':DATE,'responsibleId':ID,'followupId':ID,'backupId':ID,'parentId':ID,'nextAction':S},['projectId','title','type','responsibleId','followupId','backupId','openedOn']),
 'CaseView':obj({'id':ID,'projectId':ID,'code':S,'title':S,'type':S,'stage':S,'status':enum('draft','open','in_progress','suspended','closed'),'responsibleId':ID,'followupId':ID,'backupId':ID,'nextAction':S,'version':VER},['id','projectId','code','title','status','version']),
 'CaseTransition':obj({'status':enum('open','in_progress','suspended','closed'),'archived':BOOL,'reason':S,'pendingDispositionIds':arr(ID),'version':VER},['status','reason','version']),
 'GrantInput':obj({'userId':ID,'actions':arr(ACTIONS),'validFrom':TIME,'validUntil':TIME,'reason':S,'version':VER},['userId','actions','validFrom','reason','version']),
 'GrantView':obj({'id':ID,'userId':ID,'caseId':ID,'effectiveActions':arr(ACTIONS),'validFrom':TIME,'validUntil':TIME,'version':VER},['id','userId','caseId','effectiveActions','validFrom','version']),
 'AssignmentView':obj({'id':ID,'caseId':ID,'userId':ID,'function':S,'validFrom':TIME,'validUntil':TIME,'grantedBy':ID,'reason':S,'replacesId':ID},['id','caseId','userId','function','validFrom','grantedBy','reason']),
 'TransferInput':obj({'newResponsibleId':ID,'followupId':ID,'backupId':ID,'pendingAssignments':arr(obj({'resourceId':ID,'assigneeId':ID},['resourceId','assigneeId'])),'retainPriorAsCollaborator':BOOL,'reason':S,'version':VER},['newResponsibleId','followupId','backupId','pendingAssignments','retainPriorAsCollaborator','reason','version']),
 'DelegationInput':obj({'userId':ID,'actions':arr(ACTIONS),'validFrom':TIME,'validUntil':TIME,'reason':S,'version':VER},['userId','actions','validFrom','validUntil','reason','version']),
 'ActivityInput':obj({'type':S,'title':S,'description':S,'occurredAt':TIME,'documentIds':arr(ID),'nextAction':S},['type','title','description','occurredAt']),
 'ActivityView':obj({'id':ID,'caseId':ID,'revisionId':ID,'title':S,'description':S,'occurredAt':TIME,'authorId':ID,'version':VER},['id','caseId','revisionId','title','description','occurredAt','authorId','version']),
 'PublicationInput':obj({'revisionId':ID,'documentVersionId':ID,'audienceUserIds':{'type':'array','items':ID,'minItems':1,'uniqueItems':True},'confirmed':{'type':'boolean','enum':[True]},'version':VER},['audienceUserIds','confirmed','version']),
 'PublicationView':obj({'id':ID,'revisionId':ID,'documentVersionId':ID,'audienceUserIds':arr(ID),'publishedAt':TIME,'revokedAt':TIME},['id','audienceUserIds','publishedAt']),
 'UploadInput':obj({'file':{'type':'string','format':'binary'},'title':S,'classification':enum('operational','financial'),'economicDeclaration':BOOL,'documentId':ID},['file','title','classification','economicDeclaration']),
 'UploadView':obj({'id':ID,'caseId':ID,'status':enum('quarantine','analyzing','preview_ready','rejected','incorporated'),'sha256':S,'previewAvailable':BOOL,'reason':S},['id','caseId','status','previewAvailable']),
 'UploadConfirmation':obj({'uploadId':ID,'sha256':S,'confirmedFileAndDestination':{'type':'boolean','enum':[True]},'version':VER},['uploadId','sha256','confirmedFileAndDestination','version']),
 'DocumentView':obj({'id':ID,'caseId':ID,'title':S,'classification':enum('operational','financial'),'status':S,'currentVersionId':ID,'version':VER},['id','caseId','title','classification','status','version']),
 'DocumentVersionView':obj({'id':ID,'documentId':ID,'sequence':VER,'authorId':ID,'createdAt':TIME,'sha256':S,'mime':S,'sizeBytes':{'type':'integer','minimum':0},'reviewStatus':enum('pending','reviewed')},['id','documentId','sequence','authorId','createdAt','sha256','mime','sizeBytes','reviewStatus']),
 'TaskInput':obj({'title':S,'assigneeId':ID,'dueOn':DATE,'dueAt':TIME,'timezone':S,'priority':enum('low','normal','high'),'remindAt':TIME},['title','assigneeId','priority']),
 'TaskView':obj({'id':ID,'caseId':ID,'title':S,'assigneeId':ID,'dueOn':DATE,'dueAt':TIME,'timezone':S,'status':enum('pending','in_progress','completed','cancelled'),'version':VER},['id','caseId','title','assigneeId','status','version']),
 'TaskUpdate':obj({'status':enum('pending','in_progress','completed','cancelled'),'reason':S,'version':VER},['status','version']),
 'HearingInput':obj({'title':S,'startsAt':TIME,'timezone':S},['title','startsAt','timezone']),
 'HearingView':obj({'id':ID,'caseId':ID,'title':S,'startsAt':TIME,'timezone':S,'version':VER},['id','caseId','title','startsAt','timezone','version']),
 'NoticeInput':obj({'source':S,'receivedAt':TIME,'supportVersionId':ID,'title':S},['source','receivedAt','supportVersionId','title']),
 'NoticeView':obj({'id':ID,'caseId':ID,'source':S,'receivedAt':TIME,'registeredAt':TIME,'registeredBy':ID,'supportVersionId':ID,'status':enum('untreated','treated'),'version':VER},['id','caseId','source','receivedAt','registeredAt','registeredBy','status','version']),
 'NoticeResolution':obj({'deadlineIds':arr(ID),'noDeadlineReason':S,'version':VER},['version']),
 'DeadlineInput':obj({'title':S,'dueOn':DATE,'cutoffTime':S,'timezone':S,'basis':S,'supportVersionId':ID,'supportPage':{'type':'integer','minimum':1},'responsibleId':ID,'backupId':ID},['title','dueOn','basis','supportVersionId','supportPage','responsibleId','backupId']),
 'DeadlineView':obj({'id':ID,'caseId':ID,'noticeId':ID,'revisionId':ID,'title':S,'dueOn':DATE,'registeredBy':ID,'verifiedBy':ID,'status':enum('pending_verification','active','filed','overdue_unfiled','cancelled'),'version':VER},['id','caseId','noticeId','revisionId','title','dueOn','registeredBy','status','version']),
 'DeadlineVerification':obj({'revisionId':ID,'decision':enum('verify','correct'),'reason':S,'version':VER},['revisionId','decision','reason','version']),
 'DeadlineTransition':obj({'status':enum('active','filed','overdue_unfiled','cancelled'),'filedAt':TIME,'receiptReference':S,'reason':S,'version':VER},['status','version']),
 'MailboxInput':obj({'alias':S,'holderId':ID,'responsibleId':ID,'backupId':ID,'supervisorId':ID,'calendarId':ID,'checkTime':S,'timezone':S},['alias','holderId','responsibleId','backupId','supervisorId','calendarId','checkTime','timezone']),
 'MailboxView':obj({'id':ID,'alias':S,'responsibleId':ID,'backupId':ID,'checkTime':S,'timezone':S,'version':VER},['id','alias','responsibleId','backupId','checkTime','timezone','version']),
 'DailyCheck':obj({'date':DATE,'noticeCount':{'type':'integer','minimum':0},'observation':S,'confirmed':{'type':'boolean','enum':[True]}},['date','noticeCount','confirmed']),
 'DeliveryView':obj({'id':ID,'eventId':ID,'status':enum('pending','accepted','failed'),'attempts':{'type':'integer','minimum':0},'lastAttemptAt':TIME},['id','eventId','status','attempts']),
 'ImportInput':obj({'file':{'type':'string','format':'binary'},'sourceType':enum('csv','xlsx'),'mapping':{'type':'object','additionalProperties':S}},['file','sourceType','mapping']),
 'ImportView':obj({'id':ID,'status':enum('uploaded','validated','confirmed','failed'),'validRows':{'type':'integer','minimum':0},'invalidRows':{'type':'integer','minimum':0},'errors':arr(obj({'row':{'type':'integer'},'code':S,'message':S},['row','code','message'])),'version':VER},['id','status','version']),
 'ImportConfirmation':obj({'projectGroupIds':arr(ID),'confirmed':{'type':'boolean','enum':[True]},'version':VER},['projectGroupIds','confirmed','version']),
 'CostInput':obj({'activityId':ID,'description':S,'category':enum('fees','court_fees','expenses','other'),'date':DATE,'currency':{'type':'string','pattern':'^[A-Z]{3}$'},'quantity':POS,'unitPrice':MONEY,'reimbursable':BOOL,'documentId':ID},['description','category','date','currency','quantity','unitPrice','reimbursable']),
 'CostView':obj({'id':ID,'caseId':ID,'description':S,'amount':MONEY,'currency':S,'registeredBy':ID,'approval':enum('registered','approved','rejected'),'billing':enum('pending','reserved','invoiced','cancelled'),'version':VER},['id','caseId','description','amount','currency','registeredBy','approval','billing','version']),
 'ApprovalInput':obj({'decision':enum('approve','reject'),'reason':S,'version':VER},['decision','reason','version']),
 'AdjustmentInput':obj({'amount':MONEY,'date':DATE,'reason':S,'version':VER},['amount','date','reason','version']),
 'BillingInput':obj({'costIds':{'type':'array','items':ID,'minItems':1,'uniqueItems':True},'currency':S},['costIds','currency']),
 'BillingView':obj({'id':ID,'projectId':ID,'currency':S,'status':enum('draft','cancelled','confirmed'),'lines':arr(obj({'costId':ID,'caseId':ID,'description':S,'quantity':POS,'unitPrice':MONEY,'amount':MONEY},['costId','caseId','description','quantity','unitPrice','amount'])),'version':VER},['id','projectId','currency','status','lines','version']),
 'BillingConfirmation':obj({'documentType':S,'externalReference':S,'issuedOn':DATE,'dueOn':DATE,'version':VER},['documentType','externalReference','issuedOn','dueOn','version']),
 'PaymentInput':obj({'amount':MONEY,'currency':S,'date':DATE,'reference':S,'version':VER},['amount','currency','date','reference','version']),
 'PaymentView':obj({'id':ID,'invoiceId':ID,'amount':MONEY,'currency':S,'date':DATE,'reference':S,'reversesId':ID},['id','invoiceId','amount','currency','date','reference']),
 'PortalCaseView':obj({'id':ID,'code':S,'publicTitle':S,'publicStatus':S,'contactName':S},['id','code','publicTitle','publicStatus','contactName']),
 'PortalPublicationView':obj({'id':ID,'title':S,'publicText':S,'publishedVersionId':ID,'versionSequence':VER,'downloadAllowed':BOOL,'publishedAt':TIME},['id','title','downloadAllowed','publishedAt']),
 'AuditView':obj({'id':ID,'actorId':ID,'personId':ID,'resourceId':ID,'action':S,'occurredAt':TIME,'result':S,'reason':S,'before':{'type':'object','additionalProperties':S},'after':{'type':'object','additionalProperties':S}},['id','actorId','personId','resourceId','action','occurredAt','result']),
 'ReportInput':obj({'format':enum('pdf','csv'),'from':DATE,'until':DATE,'personId':ID,'action':S},['format']),
 'ReportView':obj({'id':ID,'status':enum('pending','ready','failed','revoked'),'partial':BOOL,'expiresAt':TIME},['id','status','partial','expiresAt']),
 'DeletionView':obj({'id':ID,'documentId':ID,'status':enum('requested','removed','restored'),'reason':S,'version':VER},['id','documentId','status','reason','version']),
 'DeletionInput':obj({'reason':S,'affectedVersionIds':arr(ID),'confirmed':{'type':'boolean','enum':[True]},'version':VER},['reason','affectedVersionIds','confirmed','version']),
 'AIQuery':obj({'question':S,'purpose':S},['question','purpose']),
 'AIJobView':obj({'id':ID,'status':enum('disabled','queued','completed','denied'),'draft':BOOL,'answer':S,'sources':arr(obj({'documentId':ID,'versionId':ID,'page':{'type':'integer','minimum':1}},['documentId','versionId']))},['id','status','draft']),
 'AIConfig':obj({'enabled':BOOL,'provider':S,'model':S,'monthlyTokenLimit':{'type':'integer','minimum':0},'perUserTokenLimit':{'type':'integer','minimum':0},'version':VER},['enabled','version']),
 'HealthView':obj({'backupStatus':S,'restorationTestStatus':S,'queueStatus':S,'mailStatus':S,'scannerStatus':S},['backupStatus','restorationTestStatus','queueStatus','mailStatus','scannerStatus']),
 'AppCapabilities':obj({'privateOfflineData':{'type':'boolean','enum':[False]},'aiEnabled':BOOL,'timezone':S,'currency':S},['privateOfflineData','aiEnabled','timezone','currency']),
}
for name in ['Client','Project','Activity','Cost','Deadline']:
    SC[name+'Update']=obj({**SC[name+'Input']['properties'],'reason':S,'version':VER},['reason','version'])
SC['CaseUpdate']=obj({'title':S,'authority':S,'matter':S,'stage':S,'nextAction':S,'reason':S,'version':VER},['reason','version'])
SC['ProjectUpdate']['properties']['status']=enum('draft','active','suspended','closed')
SC['ActivityPublicationInput']=obj({k:v for k,v in SC['PublicationInput']['properties'].items() if k!='documentVersionId'},['revisionId','audienceUserIds','confirmed','version'])
SC['DocumentPublicationInput']=obj({k:v for k,v in SC['PublicationInput']['properties'].items() if k!='revisionId'},['documentVersionId','audienceUserIds','confirmed','version'])
SC['OCRInput']=obj({'language':enum('es'),'confirmedSourceVersion':{'type':'boolean','enum':[True]}},['language','confirmedSourceVersion'])
SC['OCRJobView']=obj({'id':ID,'sourceVersionId':ID,'status':enum('queued','processing','needs_review','reviewed','failed'),'engine':S,'engineVersion':S,'pages':arr(obj({'page':{'type':'integer','minimum':1},'rawText':S,'reviewedText':S,'confidence':{'type':'number','minimum':0,'maximum':1}},['page','rawText'])),'errorCode':S,'revision':VER},['id','sourceVersionId','status','revision'])
SC['OCRReview']=obj({'sourceVersionId':ID,'revision':VER,'pages':{'type':'array','minItems':1,'items':obj({'page':{'type':'integer','minimum':1},'text':S},['page','text'])},'reason':S,'confirmedAgainstOriginal':{'type':'boolean','enum':[True]}},['sourceVersionId','revision','pages','reason','confirmedAgainstOriginal'])
SC['PrivateUpload']=obj({'url':{'type':'string','format':'uri'},'method':enum('PUT'),'headers':{'type':'object','additionalProperties':S},'fields':{'type':'object','additionalProperties':S},'expiresAt':TIME},['url','fields','expiresAt'])
SC['UploadInput']=obj({'title':S,'filename':S,'mime':enum('application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document'),'sizeBytes':{'type':'integer','minimum':1,'maximum':104857600},'classification':enum('operational','financial'),'economicDeclaration':BOOL},['title','filename','mime','sizeBytes','classification','economicDeclaration'])
SC['UploadView']['properties'].update({'upload':ref('PrivateUpload'),'version':VER})
SC['UploadView']['required'].append('version')
SC['ImportInput']=obj({'filename':S,'sourceType':enum('csv','xlsx'),'sizeBytes':{'type':'integer','minimum':1,'maximum':26214400},'sha256':{'type':'string','pattern':'^[a-f0-9]{64}$'},'mapping':{'type':'object','additionalProperties':S}},['filename','sourceType','sizeBytes','sha256','mapping'])
SC['ImportView']['properties'].update({'upload':ref('PrivateUpload'),'failureCode':S,'groups':arr(obj({'id':ID,'projectCode':S,'status':enum('valid','invalid')},['id','projectCode','status']))})
SC['ImportView']['properties']['status']=enum('uploaded','validating','validated','confirmed','failed')
SC['BillingView']['properties']['invoiceId']=ID
SC['PublicationView']['properties']['version']=VER
SC['MemberInput']=obj({'userId':ID,'enabled':BOOL,'reason':S,'version':VER},['userId','enabled','reason','version'])
SC['CalendarInput']=obj({'name':S,'timezone':S,'nonWorkingDates':arr(DATE),'approved':BOOL},['name','timezone','nonWorkingDates','approved'])
SC['CalendarView']=obj({'id':ID,'name':S,'timezone':S,'nonWorkingDates':arr(DATE),'approved':BOOL,'version':VER},['id','name','timezone','nonWorkingDates','approved','version'])

def build():
    schemas=dict(SC)
    api={'openapi':'3.0.3','info':{'title':'Firma legal — Spec Kit Unificado v2','version':'2.0.0','description':'Contrato de diseño para implementación; no hay servidor operativo. spec.md y contratos funcionales son obligatorios. Gerencia y superadministración tienen alcance operativo global dentro de su estudio; economía y otras acciones requieren permisos específicos. Nunca confiar rol/firm_id del navegador. IA desactivada inicialmente.'},'servers':[{'url':'/api/v1'}],'security':[{'session':[]}],'paths':{},'components':{'securitySchemes':{'session':{'type':'apiKey','in':'cookie','name':'session'}},'schemas':schemas}}
    def endpoint(path,method,name,summary,reqs,policy,body=None,out='Ack',page=False,idem=False,binary=False):
        params=[{'name':k,'in':'path','required':True,'schema':ID} for k in re.findall(r'\{([^}]+)\}',path)]
        if method!='get':params.append({'name':'X-CSRF-Token','in':'header','required':True,'schema':S})
        if idem:params.append({'name':'Idempotency-Key','in':'header','required':True,'schema':{'type':'string','minLength':16,'maxLength':128}})
        if page:
            params.extend([{'name':'cursor','in':'query','schema':S},{'name':'limit','in':'query','schema':{'type':'integer','minimum':1,'maximum':100,'default':25}}])
            target=out+'Page';schemas[target]=obj({'items':arr(ref(out)),'nextCursor':{'type':'string','nullable':True}},['items','nextCursor']);out=target
        responses={}
        status='202' if name in ['createUpload','uploadVersion','createImport','createReport','queryAI'] else '201' if method=='post' and name.startswith('create') else '200'
        responses[status]={'description':'Resultado autorizado. Revalidar perfil, asignación/publicación y clasificación antes de entregar.','content':{'application/octet-stream':{'schema':{'type':'string','format':'binary'}}} if binary else {'application/json':{'schema':ref(out)}}}
        for code,label in [('400','Solicitud inválida'),('401','Sin sesión'),('403','Acción no permitida'),('404','Recurso inexistente o fuera del ámbito'),('409','Conflicto de versión o estado'),('413','Tamaño excedido'),('422','Regla de negocio incumplida'),('429','Límite excedido'),('503','Capacidad deshabilitada o servicio no disponible')]:
            responses[code]={'description':label,'content':{'application/json':{'schema':ref('Error')}}}
        op={'operationId':name,'summary':summary,'description':policy,'x-requirements':sorted(set(reqs.split()+['R13'])),'parameters':params,'responses':responses}
        if binary:op['responses'][status]['headers']={'Cache-Control':{'schema':S,'description':'no-store'}}
        if name=='publishActivity':body='ActivityPublicationInput'
        if name=='publishDocument':body='DocumentPublicationInput'
        if body:op['requestBody']={'required':True,'content':{'application/json':{'schema':ref(body)}}}
        api['paths'].setdefault(path,{})[method]=op
        return op
    global_policy='Dirección: todos los expedientes de su estudio; equipo: asignación vigente y permiso de acción. Clasificación económica se valida aparte. Portal solo mediante proyección publicada.'
    manage='Solo gerente/superadministrador activo del mismo estudio; no exige CaseGrant por expediente. No permite quitar el alcance global por una revocación individual.'
    finance='Solo gerente/superadministrador con permiso económico y acceso económico explícito al proyecto y expedientes; no basta consulta global. Decimales exactos y monedas separadas.'
    endpoint('/me','get','getMe','Sesión verificada','R01',global_policy,out='SessionView')
    endpoint('/app/capabilities','get','getCapabilities','Capacidades de la web/PWA','R11 R12','No devuelve datos privados para trabajar sin conexión.',out='AppCapabilities')
    endpoint('/admin/health','get','getHealth','Estado de servicios y restauración','R01 R14','Solo superadmin; sin contenido de expedientes, credenciales ni importes.',out='HealthView')
    endpoint('/users','get','listUsers','Cuentas del estudio','R01','Solo superadmin.',out='UserView',page=True)
    endpoint('/users/invitations','post','createInvitation','Invitar una cuenta','R01','Solo superadmin; invitación de un uso, con caducidad, sin accesos a expedientes.',body='UserInput',out='InvitationView')
    endpoint('/users/{id}','patch','updateUser','Perfil y actividad','R01 R16 R17','Solo superadmin. Proteger último superadmin; cambio de perfil recalcula alcance, invalida sesiones y permisos incompatibles. Suspensión inmediata abre incidencias de cobertura.',body='UserUpdate',out='UserView')
    endpoint('/users/{id}/revoke-sessions','post','revokeSessions','Revocar sesiones','R01','Solo superadmin.',body='Reason')
    endpoint('/clients','get','listClients','Clientes autorizados','R02',global_policy,out='ClientView',page=True)
    endpoint('/clients','post','createClient','Crear cliente','R02','Solo dirección; identificación única por tipo; archivar en lugar de eliminar si tiene proyectos.',body='ClientInput',out='ClientView')
    endpoint('/clients/lookup','get','lookupClients','Búsqueda mínima','R02','Abogado: solo clientes habilitados. No revelar cartera ni datos financieros.',out='ClientLookupView',page=True)
    endpoint('/clients/{id}','patch','updateClient','Actualizar cliente','R02','Solo dirección.',body='ClientUpdate',out='ClientView')
    op=endpoint('/projects','get','listProjects','Lista de proyectos','R15 R16 R21',global_policy+' Filtrar antes de contar, ordenar y paginar; borradores propios identificados. Orden con desempate por ID; no revelar opciones ajenas.',out='ProjectView',page=True)
    for key in ['q','clientId','leadId','status','sort']:op['parameters'].append({'name':key,'in':'query','schema':ID if key.endswith('Id') else enum('code','name','status') if key=='sort' else S})
    schemas['ProjectViewPage']['properties'].update({'totalAuthorized':{'type':'integer','minimum':0},'allowedFilters':obj({'clients':arr(ref('ClientLookupView')),'leads':arr(obj({'id':ID,'name':S},['id','name']))},['clients','leads'])});schemas['ProjectViewPage']['required']+=['totalAuthorized','allowedFilters']
    endpoint('/projects','post','createProject','Crear proyecto','R15 R02',global_policy+' Permiso de creación. Inicia borrador hasta revisión y funciones completas.',body='ProjectInput',out='ProjectView')
    endpoint('/projects/{id}','get','getProject','Ficha del proyecto','R15 R16',global_policy,out='ProjectView')
    endpoint('/projects/{id}','patch','updateProject','Editar proyecto','R15',global_policy+' Cerrar exige expedientes cerrados o transferidos.',body='ProjectUpdate',out='ProjectView')
    endpoint('/projects/{id}/conflict-reviews','post','createConflictReview','Resolver conflictos','R02 R15','Gerente autorizado para revisión; a otros solo requiere revisión, sin contenido ajeno.',body='ConflictInput',out='ConflictView')
    endpoint('/projects/{id}/cases','get','listProjectCases','Expedientes autorizados del proyecto','R15 R16',global_policy,out='CaseView',page=True)
    op=endpoint('/cases','get','listCases','Cartera de expedientes','R03 R16',global_policy+' Filtrar antes de contar y paginar.',out='CaseView',page=True)
    for key in ['q','clientId','projectId','lawyerId','status']:op['parameters'].append({'name':key,'in':'query','schema':ID if key.endswith('Id') else S})
    endpoint('/cases','post','createCase','Crear expediente y asignaciones','R03 R16 R17',global_policy+' Requiere creación, equipo, seguimiento y suplente distintos. Transacción con accesos iniciales; duplicados número/órgano revisados.',body='CaseInput',out='CaseView')
    endpoint('/cases/{id}','get','getCase','Ficha operativa','R03 R16',global_policy+' Clientes usan /portal/cases, nunca esta proyección interna.',out='CaseView')
    endpoint('/cases/{id}','patch','updateCase','Editar ficha','R03',global_policy+' Requiere permiso de edición; no cambiar estado por esta ruta.',body='CaseUpdate',out='CaseView')
    endpoint('/cases/{id}/transitions','post','transitionCase','Cambiar estado','R03',global_policy+' Cierre resuelve pendientes, reapertura solo dirección con motivo y cobertura.',body='CaseTransition',out='CaseView',idem=True)
    endpoint('/cases/{id}/grants','get','listGrants','Permisos vigentes','R16',manage,out='GrantView',page=True)
    endpoint('/cases/{id}/grants','post','createGrant','Otorgar acceso individual','R16',manage+' Acciones compatibles con perfil; portal exige vínculo al cliente.',body='GrantInput',out='GrantView',idem=True)
    endpoint('/grants/{id}/revoke','post','revokeGrant','Revocar acceso individual','R16 R17',manage+' Siguiente solicitud y trabajos pendientes revalidan. Historial conservado.',body='Reason',idem=True)
    endpoint('/cases/{id}/assignments','get','listAssignments','Periodos del equipo','R17',global_policy,out='AssignmentView',page=True)
    endpoint('/cases/{id}/transfers','post','transferCase','Transferir responsable','R17',manage+' Reasignar pendientes de forma atómica; no cambiar autores; anterior pierde acceso salvo concesión expresa.',body='TransferInput',out='CaseView',idem=True)
    endpoint('/cases/{id}/delegations','post','createDelegation','Delegación temporal','R17',manage+' Inicio/fin, titular y cobertura comprobados; no dejar cuenta desactivada vigente.',body='DelegationInput',out='AssignmentView',idem=True)
    for resource,model,req in [('activities','Activity','R04'),('tasks','Task','R06'),('hearings','Hearing','R06'),('notices','Notice','R18')]:
        endpoint('/cases/{id}/'+resource,'get','list'+model,'Listar '+resource,req+' R16',global_policy,out=model+'View',page=True)
        endpoint('/cases/{id}/'+resource,'post','create'+model,'Registrar '+resource,req,global_policy+' Permiso de acción; destinatarios vigentes. Asistente registra notificación, no actuación profesional.',body=model+'Input',out=model+'View')
    endpoint('/activities/{id}','patch','updateActivity','Corregir actuación','R04',global_policy+' Conserva revisión, fecha y motivo; no modifica publicación existente.',body='ActivityUpdate',out='ActivityView')
    endpoint('/activities/{id}/publications','post','publishActivity','Publicar revisión','R04 R09',global_policy+' Publicador con permiso; preview y confirmación; revisionId obligatorio, audiencia cliente autorizada.',body='PublicationInput',out='PublicationView',idem=True)
    endpoint('/tasks/{id}','patch','updateTask','Actualizar tarea','R06',global_policy+' Asistente solo estado de su tarea; cancelar exige motivo; no altera plazo procesal.',body='TaskUpdate',out='TaskView')
    endpoint('/cases/{id}/uploads','post','createUpload','Carga en cuarentena','R05',global_policy+' Permiso de carga. PDF 100 MiB; JPG/PNG/DOCX 25 MiB. Validar MIME real, malware y contenido activo antes de preview. Económico requiere permiso.',body='UploadInput',out='UploadView')
    endpoint('/uploads/{id}','get','getUpload','Estado de análisis','R05',global_policy,out='UploadView')
    endpoint('/uploads/{id}/preview','get','previewUpload','Vista previa segura','R05',global_policy+' No servir contenido activo; DOCX convertido en entorno aislado, si falla no incorpora.',binary=True)
    endpoint('/uploads/{id}/confirm','post','confirmUpload','Confirmar incorporación','R05',global_policy+' Mismo hash y preview, confirmación de destino. Carga de asistente requiere revisión.',body='UploadConfirmation',out='DocumentView',idem=True)
    endpoint('/cases/{id}/documents','get','listDocuments','Biblioteca operativa','R05 R16',global_policy+' Clasificación filtrada antes de listar.',out='DocumentView',page=True)
    endpoint('/documents/{id}/versions','get','listVersions','Versiones inmutables','R05',global_policy,out='DocumentVersionView',page=True)
    endpoint('/documents/{id}/versions','post','uploadVersion','Nueva versión interna','R05',global_policy+' Conserva original/clasificación y autorías; no publica automáticamente.',body='UploadInput',out='UploadView')
    endpoint('/versions/{id}/review','post','reviewVersion','Revisión profesional','R05',global_policy+' Revisor autorizado; versión disponible antes de publicar.',body='Reason',out='DocumentVersionView')
    endpoint('/versions/{id}/download','get','downloadVersion','Descarga autorizada','R05 R09 R16',global_policy+' Revalidar descarga, clasificación y para clientes publicación concreta vigente. Sin enlaces permanentes de almacenamiento.',binary=True)
    endpoint('/documents/{id}/publications','post','publishDocument','Publicar versión y audiencia','R05 R09',global_policy+' documentVersionId obligatorio; operativa disponible/revisada, audiencia habilitada; confirmación expresa.',body='PublicationInput',out='PublicationView',idem=True)
    endpoint('/publications/{id}/revoke','post','revokePublication','Retirar publicación','R04 R09',global_policy+' Permiso específico. No elimina copias descargadas ni auditoría.',body='Reason',idem=True)
    endpoint('/cases/{id}/deadlines','get','listDeadlines','Plazos del expediente','R18 R16',global_policy,out='DeadlineView',page=True)
    endpoint('/notices/{id}/deadlines','post','createDeadline','Propuesta manual','R18',global_policy+' Sin cálculo jurídico automático; fundamento, página, responsable y suplente. Pendientes siguen alertando.',body='DeadlineInput',out='DeadlineView')
    endpoint('/notices/{id}/resolve','post','resolveNotice','Tratar notificación','R18',global_policy+' Cero plazos requiere justificación revisada; soporte cargado no basta.',body='NoticeResolution',out='NoticeView')
    endpoint('/deadlines/{id}','patch','updateDeadline','Corregir propuesta','R18',global_policy+' Cambiar fecha/fundamento/soporte crea revisión e invalida verificación, no elimina alertas.',body='DeadlineUpdate',out='DeadlineView')
    endpoint('/deadlines/{id}/verify','post','verifyDeadline','Verificación independiente','R18','Solo abogado autorizado con persona distinta al registrador; comprobar revisionId y concurrencia.',body='DeadlineVerification',out='DeadlineView',idem=True)
    endpoint('/deadlines/{id}/transitions','post','transitionDeadline','Presentar o anular','R18',global_policy+' Presentado requiere fecha real y comprobante/referencia; anular exige motivo. En preparación no suspende avisos.',body='DeadlineTransition',out='DeadlineView',idem=True)
    endpoint('/mailboxes','get','listMailboxes','Cobertura de casillas','R19','Permiso de cobertura; no amplía acceso de equipo a expedientes.',out='MailboxView',page=True)
    endpoint('/mailboxes','post','createMailbox','Configurar casilla','R19','Dirección con permiso. No almacenar contraseñas judiciales ni conectar SINOE automáticamente.',body='MailboxInput',out='MailboxView')
    endpoint('/mailboxes/{id}/daily-checks','post','createDailyCheck','Confirmar revisión diaria','R19','Responsable/suplente autorizado; incluso cero novedades. Falta al horario escala; revisión por fecha idempotente.',body='DailyCheck',idem=True)
    endpoint('/notifications','get','listDeliveries','Centro de alertas','R18 R19 R14','Solo destinatario o supervisor autorizado. Fallos, reintentos, aceptación no implica lectura; avisos genéricos.',out='DeliveryView',page=True)
    endpoint('/imports','post','createImport','Subir plantilla','R20',global_policy+' CSV/XLSX sin macros; archivo fuente y mapa; sin OCR/IA.',body='ImportInput',out='ImportView')
    endpoint('/imports/{id}','get','getImport','Errores y preview de lote','R20',global_policy+' Proyección de filas autorizadas.',out='ImportView')
    endpoint('/imports/{id}/validate','post','validateImport','Validar duplicados y filas','R20',global_policy,body='Version',out='ImportView')
    endpoint('/imports/{id}/confirm','post','confirmImport','Confirmar grupos completos','R20',global_policy+' Atomicidad por proyecto y dependientes, identidad durable de lote; sin accesos automáticos; plazos sin verificar.',body='ImportConfirmation',out='ImportView',idem=True)
    endpoint('/cases/{id}/costs','get','listCosts','Costos autorizados','R07 R16',finance,out='CostView',page=True)
    endpoint('/cases/{id}/costs','post','createCost','Registrar costo','R07',finance+' Cantidad >0, precio >=0, redondear línea a 2 decimales.',body='CostInput',out='CostView',idem=True)
    endpoint('/costs/{id}','patch','updateCost','Corregir costo pendiente','R07',finance+' Reservado/facturado no editable; corrección aprobado vuelve a revisión.',body='CostUpdate',out='CostView')
    endpoint('/costs/{id}/approvals','post','approveCost','Aprobar o rechazar','R07',finance+' Persona revisora distinta de quien registra, también para ajustes.',body='ApprovalInput',out='CostView',idem=True)
    endpoint('/costs/{id}/adjustments','post','adjustCost','Ajuste separado','R07',finance+' Referencia al original, importe firmado y motivo; aprobación independiente.',body='AdjustmentInput',out='CostView',idem=True)
    endpoint('/projects/{id}/billing-drafts','post','createBillingDraft','Preparar borrador','R08 R15',finance+' Costos aprobados de mismo proyecto/moneda; reservar una sola vez y congelar líneas.',body='BillingInput',out='BillingView',idem=True)
    endpoint('/billing-drafts/{id}/confirm','post','confirmBilling','Comprobante externo','R08',finance+' Referencia, tipo, emisión y vencimiento. Confirmación y estados atómicos; no emisión fiscal ni impuestos automáticos.',body='BillingConfirmation',out='BillingView',idem=True)
    endpoint('/billing-drafts/{id}/cancel','post','cancelBilling','Liberar reservas','R08',finance,body='Reason',out='BillingView',idem=True)
    endpoint('/billing-drafts/{id}/export','get','exportBilling','CSV protegido','R08',finance+' Neutralizar prefijos de fórmulas, revalidar acceso y expiración.',binary=True)
    endpoint('/invoices/{id}/payments','post','createPayment','Registrar abono','R08',finance+' Misma moneda, no exceder saldo; registro no es conciliación bancaria.',body='PaymentInput',out='PaymentView',idem=True)
    endpoint('/payments/{id}/reversals','post','reversePayment','Revertir abono','R08',finance+' Conservar original.',body='Reason',out='PaymentView',idem=True)
    endpoint('/portal/cases','get','listPortalCases','Portal de solo lectura','R09 R16','Solo cliente con vínculo y concesión individual; ninguna tarea interna, economía ni IA.',out='PortalCaseView',page=True)
    endpoint('/portal/cases/{id}','get','getPortalCase','Ficha reducida','R09 R16','Solo expediente habilitado para su cuenta.',out='PortalCaseView')
    endpoint('/portal/publications/{id}','get','getPortalPublication','Revisión publicada','R09','Solo audiencia actual, versión concreta publicada; nuevas versiones internas no se entregan.',out='PortalPublicationView')
    endpoint('/cases/{id}/history','get','listHistory','Historial autorizado','R10 R21',global_policy+' Operativo no incluye eventos económicos; no permite edición/borrado.',out='AuditView',page=True)
    endpoint('/projects/{id}/reports','post','createReport','Reporte parcial/completo','R21 R10',global_policy+' Parcial no cuenta ocultos; fecha, persona, acción. Exportación vuelve a comprobar permisos.',body='ReportInput',out='ReportView')
    endpoint('/reports/{id}/download','get','downloadReport','Exportación con caducidad','R21',global_policy+' Revalidar al entregar y caducidad; sin URLs permanentes.',binary=True)
    endpoint('/documents/{id}/deletion-requests','post','createDeletionRequest','Solicitar baja','R22',global_policy+' Abogado/asistente/gerente puede solicitar; no ejecutar.',body='Reason',out='DeletionView')
    endpoint('/deletion-requests/{id}/execute','post','executeDeletion','Baja lógica','R22','Solo superadmin con permiso específico del expediente, preview de versiones y reconfirmación; conserva originales e historial.',body='DeletionInput',out='DeletionView',idem=True)
    endpoint('/documents/{id}/restore','post','restoreDocument','Recuperar como interno','R22','Mismo permiso de baja; no restaura publicaciones. Purga física separada, deshabilitada sin política/plazo/bloqueos resueltos.',body='DeletionInput',out='DocumentView',idem=True)
    endpoint('/cases/{id}/ai/queries','post','queryAI','IA posterior con fuentes','R12',global_policy+' Inicialmente 503 FEATURE_DISABLED y sin envío a proveedor; no disponible en portal. Al activar, cuotas y fuentes filtradas, borrador, sin ejecutar acciones.',body='AIQuery',out='AIJobView',idem=True)
    endpoint('/ai/jobs/{id}','get','getAIJob','Resultado IA posterior','R12',global_policy+' Revalidar antes de entregar. Fuentes documento/versión/página; sin evidencia, no inventar.',out='AIJobView')
    endpoint('/admin/ai/config','put','configureAI','Configuración IA condicionada','R12','Solo superadmin; secretos solo en servidor. Activación exige D07, T28 y A39/A40; cuotas, contratos, aislamiento y exactitud.',body='AIConfig')
    ocr_policy='Solo usuario interno con lectura y carga vigentes sobre la versión fuente; clasificación económica exige permiso económico. Cliente sin OCR interno. Revalidar antes de procesar, indexar y entregar. D09 pendiente: sin motor autorizado responder 503 y no enviar archivos. Nunca crea campos jurídicos, plazos ni publicaciones.'
    endpoint('/versions/{id}/ocr-jobs','post','createOCRJob','Extraer texto de versión validada','R05 R16',ocr_policy+' Trabajo idempotente, texto por página; extraer texto embebido si existe. Original y hash inmutables.',body='OCRInput',out='OCRJobView',idem=True)
    api['paths']['/versions/{id}/ocr-jobs']['post']['responses']['202']=api['paths']['/versions/{id}/ocr-jobs']['post']['responses'].pop('201')
    ocr_get=endpoint('/ocr-jobs/{id}','get','getOCRJob','Estado y texto autorizado','R05 R16',ocr_policy+' Confianza solo si el motor la proporciona; no inventar texto ilegible. Páginas en lotes de diez; revisar puede guardar un subconjunto de páginas.',out='OCRJobView')
    ocr_get['parameters'].append({'name':'page','in':'query','schema':{'type':'integer','minimum':1,'default':1}})
    schemas['OCRJobView']['properties']['nextPage']={'type':'integer','minimum':1}
    endpoint('/ocr-jobs/{id}/review','post','reviewOCRJob','Guardar revisión del texto','R05 R16',ocr_policy+' Comprobar versión y revisión; conservar texto original y todas las correcciones. El texto queda interno.',body='OCRReview',out='OCRJobView',idem=True)
    endpoint('/uploads/{id}/complete','post','completeUpload','Enviar carga privada a análisis','R05',global_policy+' Tras carga directa a cuarentena: verifica tamaño y encola análisis real; sin procesador devuelve 503. Incorporar sigue exigiendo preview y confirmación.',body='Version',out='UploadView',idem=True)
    endpoint('/clients/{id}/memberships','post','setClientMembership','Vincular cuenta cliente','R02 R09','Solo superadmin; no concede expedientes ni publicaciones.',body='MemberInput',idem=True)
    endpoint('/clients/{id}/creation-grants','post','setClientCreationGrant','Habilitar cliente para creación','R02 R15','Dirección habilita búsqueda mínima para abogado, sin cartera ajena.',body='MemberInput',idem=True)
    endpoint('/projects/{id}/economic-grants','post','setProjectEconomicGrant','Ámbito económico de proyecto','R07 R16','Solo dirección; destinatario gerente/superadmin. Requiere además permiso económico de cada expediente.',body='MemberInput',idem=True)
    endpoint('/calendars','get','listCalendars','Calendarios de avisos','R18 R19','Dirección; calendario versionado de avisos, no cálculo jurídico.',out='CalendarView',page=True)
    endpoint('/calendars','post','createCalendar','Configurar calendario revisado','R18 R19','Dirección confirma zona, excepciones y aprobación antes de avisos programados.',body='CalendarInput',out='CalendarView')
    for path,methods in api['paths'].items():
        for method,operation in methods.items():
            if method=='get' and (path.endswith('/download') or path.endswith('/preview')):
                operation['parameters'].append({'name':'Range','in':'header','schema':S,'description':'bytes=inicio-fin; máximo 1 MiB. Obligatorio para archivos mayores de 1 MiB. Revalidar cada solicitud.'})
                operation['responses']['206']=operation['responses']['200']
                operation['responses']['416']={'description':'Rango requerido, inválido o demasiado grande','content':{'application/json':{'schema':ref('Error')}}}
    target=Path(__file__).with_name('openapi.yaml');target.write_text(json.dumps(api,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Generated OpenAPI v2: {len(api["paths"])} paths, {sum(len(v) for v in api["paths"].values())} operations, {len(schemas)} schemas.')

if __name__=='__main__':build()
