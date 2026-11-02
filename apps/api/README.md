# Backend de firma legal

Node.js 22, TypeScript, NestJS y PostgreSQL. El código está en `src`, las migraciones en `migrations` y el contrato aprobado se copia a `src/contract.json` para el despliegue. El mockup de `../../mockup` sigue separado: todavía no es un frontend conectado.

## Lo implementado

- Sesiones de servidor, CSRF, caducidad, revocación, cuentas activas y límite de solicitudes.
- Acceso con OIDC o intercambio de Supabase Auth: JWT verificado, consulta al servidor de identidad, correo verificado y MFA `aal2` para personal interno. Los perfiles proceden de la base local, nunca de metadatos editables del usuario.
- Clientes, habilitación para creación, proyectos, conflictos, expedientes y permisos por recurso.
- Asignaciones con periodos, revocación, transferencia e historial; actuaciones con revisiones y publicaciones por audiencia.
- Carga directa a cuarentena privada, análisis/preview mediante procesador configurable, incorporación, versiones, revisión, publicación y baja lógica sin purga física.
- Propuestas y verificación independiente de plazos, tareas, casillas, calendarios de avisos y trabajos durables con reintentos.
- Costos decimales, aprobación por otra persona, reservas, comprobantes externos, abonos y reversiones.
- Importación CSV/XLSX con mapa, validación por grupos, trazabilidad y borradores sin accesos automáticos.
- Portal reducido, reportes operativos CSV/PDF, extracción OCR por versión y revisión por página mediante motor configurable.
- IA desactivada. Los proveedores ausentes devuelven 503; no se devuelve un resultado ficticio.

Las pruebas usan PostgreSQL embebido (PGlite), HTTP y procesadores de prueba. No certifican todavía rendimiento, restauración, operación real de proveedores ni todas las aceptaciones A01–A38 en Supabase.

## Preparación local

Desde la raíz:

```sh
npm ci
npm run build
npm test
```

Copia `.env.example` a `.env` dentro de `apps/api` y configura las variables reales localmente o en el gestor de variables del hosting. No las envíes por chat ni las subas a Git.

```sh
npm run db:migrate
npm run db:bootstrap -- --email propietario@ejemplo.com --name Propietario --firm Estudio
npm run dev
```

El bootstrap solo funciona con una instalación vacía. No genera contraseñas predeterminadas. El propietario debe existir y tener correo verificado/MFA en el proveedor de identidad. `GET /healthz` comprueba el proceso; no certifica conexión a proveedores ni disponibilidad de respaldos.

## Supabase

1. Usar un proyecto destinado a esta aplicación. Revisar las migraciones antes de aplicarlas; no se han ejecutado en ningún proyecto remoto.
2. Configurar `DATABASE_URL` con la conexión **Transaction pooler** para Vercel, `DATABASE_POOL_MAX=1` y `DATABASE_SSL=true`. Node `pg` usa consultas sin nombre y no mantiene prepared statements con nombre. Copiar host/usuario/puerto desde Connect, no construirlos por suposición.
3. Configurar `DIRECT_DATABASE_URL` para migraciones con conexión directa o Session pooler. Si tu certificado requiere CA, colocarla en `DATABASE_CA_CERT`; no desactivar la verificación TLS.
4. La migración `002_supabase_hardening.sql` habilita RLS y retira permisos de `anon`/`authenticated` sobre las tablas de negocio. No hay políticas para acceder directamente desde el navegador. La API usa una conexión de servidor privilegiada y aplica la política por expediente. No exponer `DATABASE_URL`, credenciales S3 ni claves secretas al frontend.
5. Crear un bucket **privado** y configurar S3 de Supabase: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, credenciales de servidor y `S3_FORCE_PATH_STYLE=true`. No habilitar acceso público ni políticas de lectura a navegador para el bucket. La aplicación conserva sus propias versiones porque Supabase S3 no ofrece versionado S3.
6. Configurar `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. Usar claves JWT asimétricas con JWKS; solo para proyectos con firma heredada HS256, configurar `SUPABASE_JWT_SECRET` exclusivamente en servidor. La clave pública no es una `service_role`.
7. El futuro frontend inicia sesión y completa MFA mediante Supabase Auth, y envía su access token a `POST /auth/supabase/exchange` desde `APP_ORIGIN`. La API crea cookies de sesión propias. Para altas, el estudio debe emitir una invitación y el intercambio incluye `invitationToken`; el registro libre en Supabase no concede acceso al estudio. Configurar `INVITATION_RETURN_URL` con la pantalla de invitación del frontend Supabase; `/auth/start` corresponde a la alternativa OIDC y no sustituye esa pantalla.

Ejemplo desde el frontend, después de completar MFA en Supabase:

```js
await fetch('/auth/supabase/exchange', {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ accessToken: session.access_token })
});
// GET /auth/csrf devuelve el token para X-CSRF-Token en mutaciones.
```

Para producción, servir el frontend y la API bajo un mismo sitio/origen mediante un proxy o reescritura; `APP_ORIGIN` es el origen del frontend y `PUBLIC_API_ORIGIN` el del callback de la API. No depender de cookies de terceros entre dos dominios distintos de Vercel. OIDC genérico sigue disponible como alternativa mediante `/auth/start` y `/auth/callback`.

## Archivos y OCR

`POST /api/v1/cases/{id}/uploads` recibe **metadatos JSON**, no el PDF: título, nombre, MIME, tamaño, clasificación y declaración económica. Devuelve una URL PUT de cuarentena válida cinco minutos. El cliente debe enviar el archivo binario como cuerpo PUT usando los headers devueltos; no usar FormData ni cambiar Content-Type/tamaño.

Después se llama `/uploads/{id}/complete`. El trabajador verifica bytes, firma, hash y respuesta del escáner, genera una copia privada validada y la preview. `/uploads/{id}/confirm` solo incorpora cuando el análisis y la vista previa están listos. El original validado ya no comparte la clave que podía modificar el formulario de cuarentena.

Las descargas pasan siempre por la API. Para más de 1 MiB, el cliente solicita rangos `Range: bytes=inicio-fin` de hasta 1 MiB y ensambla las partes localmente; cada parte comprueba autorización y publicación actuales. No se entregan URLs permanentes de descarga.

Los procesadores son servicios HTTPS configurados, no motores incluidos:

- `DOCUMENT_PROCESSOR_URL` y token: recibe `{fileBase64,mime,sha256,requireMalwareScan,requireActiveContentCheck}`. Debe analizar el archivo real, rechazar malware/macros/contenido activo y devolver `{clean:true,activeContent:false,sha256,previewPdfBase64}` con PDF seguro. Sin esta validación el documento no se incorpora.
- `OCR_PROCESSOR_URL` y token: recibe `{fileBase64,mime,language,extractEmbeddedTextFirst,sourceSha256}`. Devuelve `{engine,engineVersion,pages:[{page,text,confidence?}]}`. El backend conserva texto original y revisiones separadas. OCR interno no se publica ni crea plazos. La consulta pagina diez páginas y la revisión admite hasta diez por solicitud.

Configurar y comprobar D03/D09 antes de enviar documentos reales. La aplicación no certifica un motor OCR ni un escáner por el hecho de configurar una URL.

## Trabajos y avisos

No arrancar un bucle permanente dentro de una función de Vercel. Hay dos modos:

- Trabajador persistente externo: `npm run worker -w apps/api`. Comparte PostgreSQL y almacenamiento; obtiene leases durables y revalida permisos.
- Ejecutor acotado: un scheduler autorizado llama `GET` o `POST /internal/jobs/run` con `Authorization: Bearer WORKER_SECRET`. El secreto debe tener al menos 32 caracteres. Cada llamada programa avisos pendientes y procesa un trabajo. La frecuencia del scheduler debe ajustarse al volumen/horarios y a los límites del plan; no viene contratado ni configurado.

`JOB_ENCRYPTION_KEY` es una clave aleatoria de 32 bytes codificada base64 para cifrar enlaces de invitación en la cola. SMTP requiere TLS. Los avisos son genéricos y registran intentos; «aceptado» no significa leído. Configurar calendario aprobado y responsables/suplentes antes de usar plazos en operación. No se guardan contraseñas de SINOE.

## Despliegue en Vercel

1. Importar el repositorio y seleccionar **Root Directory: `apps/api`**, framework NestJS y Node 22. El build usa el contrato incluido; si está disponible la raíz del monorepo, lo vuelve a copiar desde `contracts`.
2. Configurar las variables de `.env.example` necesarias. Preview y producción deben usar proyectos/buckets y credenciales separados.
3. Ejecutar migraciones y bootstrap desde un entorno autorizado; no se ejecutan automáticamente al recibir tráfico ni en cada build.
4. Desplegar primero en Preview, verificar `/healthz`, login/MFA, aislamiento, subida, publicación y revocación contra servicios reales. Configurar worker/scheduler, correo, respaldos y restauración.
5. Publicar producción solo después de completar los controles operativos del Spec Kit. Esta carpeta contiene configuración de despliegue; todavía no hay un despliegue remoto vinculado o verificado.

Referencias: [NestJS en Vercel](https://vercel.com/docs/frameworks/backend/nestjs), [límites de funciones](https://vercel.com/docs/functions/limitations), [conexión PostgreSQL de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [compatibilidad S3](https://supabase.com/docs/guides/storage/s3/compatibility).
