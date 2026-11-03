# Estado de construcción

## Base disponible

- Word unificado aprobado y Markdown sincronizados mediante `tools/sync_spec.py`.
- Contrato OpenAPI v2 de diseño con esquemas de solicitud/respuesta por dominio y proyección separada de portal.
- Mockup HTML/CSS/JavaScript con datos ficticios, cinco perfiles, proyectos y expedientes paginados y simulación de recorridos.
- Backend inicial NestJS/TypeScript/PostgreSQL en [apps/api](apps/api/README.md), con migraciones y configuración de Vercel.
- Adaptadores de Supabase Auth y Storage; sesiones propias, comprobación MFA y migración de bloqueo a roles públicos de Supabase.
- Proyecto Supabase vinculado: `dpdtgpruudcqhebzcypq`. Migraciones `001`–`003` aplicadas el 2026-11-02: 46 tablas de negocio y una tabla técnica de migraciones, todas con RLS y sin privilegios para `anon`/`authenticated`. Checksums y trigger de auditoría verificados en la base remota.
- Pruebas HTTP y PostgreSQL embebido, además de comprobaciones documentales y del mockup. No equivalen a aceptación de producción.

## Implementación y configuración pendiente

Los módulos siguientes ya tienen código de servidor, pero las tareas T01–T28 no se declaran completadas sin ejecutar sus escenarios en el entorno configurado. La estructura PostgreSQL ya está aplicada en Supabase. Falta configurar las conexiones de ejecución, Auth/MFA, Storage, proveedores y el despliegue de la API en Vercel.

| Área | Backend disponible | Lo que falta para operar |
|---|---|---|
| Identidad y cuentas | OIDC/Supabase JWT verificados, MFA, sesiones, CSRF, invitación, suspensión y revocación | Configurar y ensayar Supabase Auth/correo, recuperación y secretos reales |
| Clientes, proyectos y expedientes | SQL y migraciones aplicadas en Supabase; API de creación/consulta, revisión de conflictos, filtros y paginación | Conectar la API a la base, completar bootstrap y validar volumen/concurrencia nativos |
| Equipo y permisos | Política en servidor, concesiones, periodos, revocación y transferencia auditada | Ensayar todos los reemplazos/delegaciones/cobertura con equipo y cuentas reales de prueba |
| Actuaciones y documentos | Revisiones, cargas PUT privadas, análisis en cola, incorporación, versiones, publicación y baja lógica | Crear bucket privado y configurar procesador real de malware/contenido activo/preview; probar con muestras autorizadas |
| OCR de documentos | Cola, adaptador HTTP de motor, texto por página, revisión separada y permisos | Resolver D09 y conectar/evaluar un motor real; no hay escáner ni cálculo jurídico automático |
| Plazos y casillas | Propuesta, verificación por otra persona, presentación, casillas y calendario de avisos | Aprobar calendario, configurar scheduler/trabajador y SMTP; ensayar fallos y escalamiento |
| Economía | Decimales exactos, aprobación independiente, reservas, facturación externa, abonos/reversiones e idempotencia | Validar D05 y concurrencia multiinstancia contra PostgreSQL real |
| Portal y reportes | Proyección reducida, audiencia, descargas autenticadas por rangos, reportes CSV/PDF con caducidad | Conectar el frontend y verificar todas las revocaciones y exportaciones en despliegue |
| Importación | CSV/XLSX, mapa, validación por grupos, fuentes y borradores sin accesos automáticos | Ensayar datos autorizados, reversión operativa y volumen; completar soporte/revisión de plazos antes de activarlos |
| PWA y operación | Layout responsivo y aviso de desconexión | Manifiesto, instalación, caché pública, monitoreo, respaldos y restauración probada |
| IA y conectores | Desactivados | Solo implementar tras decisiones y aceptación habilitantes |

## Próximo orden de construcción

1. Configurar las conexiones privadas `DATABASE_URL`/`DIRECT_DATABASE_URL` y el bootstrap inicial del proyecto vinculado. La estructura ya está aplicada. Separar Preview y producción.
2. Configurar Auth/MFA, bucket privado, procesadores de documentos/OCR, SMTP y trabajador/scheduler. Resolver D01–D06, D08 y D09 según la operación.
3. Conectar o construir el frontend React/TypeScript; el mockup sigue siendo independiente y no almacena datos reales.
4. Ejecutar A01–A38 contra el entorno real de prueba, completar los comportamientos/limitaciones que revele el ensayo y medir p95, respaldos y restauración. Implementar PWA y operación pendiente.
5. Revisar y aprobar el despliegue de producción con evidencia. IA mantiene D07 y A39–A40 antes de activación.

No se fijan porcentajes de avance ni se presenta el backend como producción certificada por pasar pruebas locales. Ver [instrucciones y limitaciones](apps/api/README.md).
