"""Record the backend implementation and Vercel/Supabase transport decisions in Word."""
from pathlib import Path
from zipfile import ZipFile
from shutil import copy2
from lxml import etree as E

root=Path(__file__).resolve().parents[1];path=root/'SpecKit_Firma_Legal_Unificado_v2.docx'
with ZipFile(path) as z:parts=[(i,z.read(i.filename)) for i in z.infolist()]
doc=E.fromstring(next(b for i,b in parts if i.filename=='word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
ps=doc.findall('.//w:p',ns)
def text(p):return ''.join(p.xpath('.//w:t/text()',namespaces=ns))
def settext(p,value):
    ts=p.findall('.//w:t',ns);assert ts
    ts[0].text=value
    for t in ts[1:]:t.text=''
changes={
'Este es un documento maestro organizado': 'Este documento maestro define la referencia funcional. El repositorio contiene sus exportaciones Markdown, contrato OpenAPI, mockup y backend inicial en apps/api. Las piezas se sincronizan desde el Word con tools/sync_spec.py; disponer de código o pasar pruebas locales no certifica despliegue ni aceptación de producción.',
'Se conserva la propuesta del Spec Kit: React': 'Arquitectura de construcción: Node.js 22 y TypeScript, NestJS para la API modular desplegable en Vercel y PostgreSQL alojable en Supabase. React/TypeScript y PWA continúan como frontend pendiente de conexión. El backend usa node-pg, consultas parametrizadas y migraciones SQL; el lockfile fija las dependencias. Supabase Auth y Storage se integran mediante adaptadores de servidor; no se confían perfiles ni permisos enviados por el cliente. Los proveedores deben configurarse y probarse antes de operar con datos reales.',
'Dirección debe haber designado gestores': 'Dirección debe designar gestores y custodios, aprobar región y proveedores, tratamiento y retención, incidentes y responsables de operación. API en Vercel y PostgreSQL/Auth/Storage en Supabase son los destinos de preparación; no prueban cuentas creadas, servicios contratados ni despliegue realizado. Resolver D09 antes de OCR real y confirmar identidad/MFA, bucket privado, análisis documental, scheduler/trabajador, correo, respaldos y restauración. Las condiciones legales se validan con el asesor del estudio.',
'Cargar por streaming a cuarentena': 'Por los límites de Vercel, las cargas de PDF de hasta 100 MiB no atraviesan el cuerpo de la función. El cliente solicita metadatos autorizados a la API y recibe PUT firmado a una clave de cuarentena privada por cinco minutos, con tamaño y tipo vinculados. complete envía a análisis; el trabajador comprueba bytes, firma, hash, malware y contenido activo mediante procesador configurado, produce preview segura y copia el original validado a otra clave privada que el PUT de cuarentena no puede sobrescribir. Incorporar sigue exigiendo confirmación del mismo hash y destino. Preview/descargas pasan por la API con permisos actuales y no-store; se solicitan rangos de hasta 1 MiB para archivos grandes, sin URL permanente de lectura.',
'Centralizar la política de cuenta activa': 'Centralizar cuenta activa, estudio, perfil, acción, recurso, clasificación y publicación. Dirección consulta todos los expedientes y gestiona accesos; equipo requiere asignación vigente y clientes habilitación y publicación. Economía se verifica aparte. La API NestJS usa SQL privilegiado exclusivamente desde servidor; la migración 002 habilita RLS y retira permisos de anon/authenticated de las tablas de aplicación en Supabase, sin políticas para consultar desde el navegador. No exponer conexión SQL, credenciales S3 ni claves secretas. El perfil procede de users local; Supabase user_metadata no concede privilegios.',
'Usar proveedor de identidad con invitaciones': 'Identidad implementada mediante OIDC o intercambio Supabase Auth. Supabase: validar firma, issuer, audience y vigencia del access token, consultar getUser al servidor de identidad y exigir correo confirmado y aal2 al personal interno. La cuenta debe estar aprobada o aceptar invitación de un uso; no hay alta libre al estudio. La API emite sesión propia con cookie HttpOnly/Secure/SameSite, CSRF y Origin en mutaciones, inactividad y versión de sesión. APP_ORIGIN define frontend y PUBLIC_API_ORIGIN el callback de API; en producción servir ambos bajo un mismo sitio mediante proxy/rewrite. OIDC verifica state, PKCE, nonce, firma y MFA. Desactivar la cuenta local o cambiar perfil invalida sesiones y permisos incompatibles.',
'Las operaciones de transferencia, publicación, reserva': 'Transferencias, publicaciones, reservas, confirmación económica y auditoría usan transacciones PostgreSQL. Los trabajos se guardan en jobs dentro de la transacción y se obtienen con leases y SKIP LOCKED, con reintentos acotados e identidad idempotente; claves de invitación en cola cifradas. La API serverless no inicia bucles perpetuos. Un trabajador externo o llamadas autorizadas y acotadas a /internal/jobs/run procesan análisis, OCR, importación, reportes y avisos. Redis/BullMQ no son dependencias obligatorias de esta primera implementación; la cola durable inicial usa PostgreSQL. El scheduler y los procesadores requieren configuración y prueba real.',
'Confirmar carga recibe uploadId': 'La carga recibe metadatos JSON (title, filename, mime, sizeBytes, classification, economicDeclaration) y devuelve PUT privado temporal; no admite multipart grande a través de Vercel. complete requiere version y encola análisis; confirm recibe uploadId, sha256, confirmedFileAndDestination y version, y solo incorpora tras análisis y preview del mismo contenido. Publicar recibe revisionId o documentVersionId, audiencia y confirmación; se rechaza audiencia sin habilitación individual. Las importaciones CSV/XLSX también usan carga privada de metadatos, hash y mapa, con validación en trabajador y confirmación de grupos completos en borrador; no crean accesos automáticamente y sus plazos quedan sin verificar, pendientes de soporte cuando corresponda.',
'2. Fijar versiones de runtime': '2. El backend está en apps/api con scripts npm run build, npm test, npm run db:migrate y npm run db:bootstrap. Configurar el entorno desde apps/api/.env.example y consultar apps/api/README.md para Vercel/Supabase. El mockup sigue aislado y el frontend React/PWA está pendiente; no se presenta como aplicación conectada.',
'3. Configurar identidad de prueba': '3. Configurar Supabase de prueba (PostgreSQL/Auth/Storage privado) u OIDC/S3 equivalentes, SMTP, calendario aprobado, trabajador/scheduler y procesadores de análisis/OCR. La API usa Transaction pooler con pool pequeño y TLS; migraciones mediante conexión directa o Session pooler. Usar servicios y datos separados para Preview y producción.',
'6. Documentar comandos reales': '6. Mantener comandos y variables en apps/api/README.md, el contrato generado y las pruebas con cada módulo. Las pruebas locales con PostgreSQL embebido y procesadores de prueba no acreditan infraestructura Supabase real, rendimiento p95, recuperación ni entrega de proveedores. Ejecutar aceptación contra el entorno configurado antes de producción.',
}
found=set()
for p in ps:
    current=text(p)
    for prefix,value in changes.items():
        if current.startswith(prefix):settext(p,value);found.add(prefix);break
    if current.startswith('Cambio de permisos aprobado por el usuario'):
        settext(p,text(p)+' Construcción del backend: NestJS/TypeScript/PostgreSQL con destino Vercel y adaptadores Supabase; cargas PUT privadas y descargas por rangos por límites serverless; cola PostgreSQL durable. Afecta D06, plan técnico, transporte de R05/R20, contrato y preparación. Código y pruebas locales disponibles; conexión y aceptación de proveedores reales pendientes.')
assert found==set(changes),set(changes)-found
backup=root/'backups/SpecKit_Firma_Legal_Unificado_v2_antes_backend_vercel.docx';assert not backup.exists();copy2(path,backup)
tmp=path.with_suffix('.updated.docx')
with ZipFile(tmp,'w') as z:
    for i,b in parts:z.writestr(i,E.tostring(doc,encoding='UTF-8',xml_declaration=True,standalone=True) if i.filename=='word/document.xml' else b)
with ZipFile(tmp) as z:assert z.testzip() is None
tmp.replace(path);print('Backend architecture and transport decisions recorded; previous Word backed up.')
