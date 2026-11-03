# Gestión de firma legal · Spec Kit Unificado v2

La referencia aprobada es el [Spec Kit Unificado](SpecKit_Firma_Legal_Unificado_v2.docx). Contiene R01–R22, A01–A40 y T01–T28. Los documentos Markdown son una exportación de ese Word; el contrato OpenAPI detalla su catálogo funcional para implementación.

## Estado real

Ver el [estado de construcción](STATUS.md) para distinguir prototipo, contrato e implementación pendiente.

- Especificación y mockup interactivo con datos ficticios disponibles.
- Proyectos y expedientes con búsqueda, filtros, paginación y fichas según permisos simulados.
- Backend inicial implementado en [apps/api](apps/api/README.md): NestJS/TypeScript, migraciones PostgreSQL, sesiones, permisos, módulos de negocio y adaptadores de archivos/OCR. El [estado de construcción](STATUS.md) registra la conexión Supabase, las migraciones aplicadas y el despliegue Vercel. La aceptación de producción y el frontend React/PWA siguen pendientes; el mockup no está conectado a la API.
- La versión inicial incluye proyectos, asignaciones, documentos con OCR de texto revisado, plazos verificados, casillas, importación, portal, economía y reportes. OCR real requiere resolver D09; el mockup solo demuestra la revisión con texto ficticio. IA y conectores externos permanecen condicionados y desactivados.

## Permisos acordados

Gerente y superadministrador consultan todos los expedientes del estudio y gestionan accesos. Abogados y asistentes solo consultan sus asignados. Clientes solo reciben publicaciones para su cuenta. Economía y acciones profesionales conservan controles independientes.

## Documentos

1. [Especificación y pantallas](spec.md)
2. [Decisiones y pendientes](clarifications.md)
3. [Constitución](constitution.md)
4. [Modelo de datos](data-model.md)
5. [Arquitectura](plan.md)
6. [Contrato funcional](contracts/README.md) y [OpenAPI](contracts/openapi.yaml)
7. [Aceptación](acceptance.md)
8. [Tareas y trazabilidad](tasks.md)
9. [Preparación y entregas](quickstart.md)
10. [Antecedentes y cambios](research.md)

## Mockup

[Abrir mockup](mockup/index.html) · [Instrucciones](mockup/README.md).

Desde la raíz: `python -m http.server 5500 --bind 127.0.0.1 --directory mockup` y abrir http://localhost:5500. Los datos se reinician al recargar. El modo de revisión de estados está aislado en `?review=1`.

## Backend

Desde la raíz: `npm ci`, `npm run build` y `npm test`. Configuración, migraciones, bootstrap, Supabase y despliegue en [apps/api/README.md](apps/api/README.md). No aplicar migraciones en proyectos existentes sin revisar su destino; no publicar secretos. La selección del proyecto y las credenciales se configuran fuera del repositorio.

## Sincronización y comprobación

1. Modificar el Word aprobado y registrar la decisión en su control de cambios.
2. `python tools/sync_spec.py` exporta los Markdown sin sobrescribir el Word.
3. `python contracts/build_contract.py` regenera OpenAPI desde sus definiciones v2; los cambios de contrato se editan en ese generador.
4. `python tools/check_and_export.py` verifica enlaces, sincronización, cobertura y estructura de OpenAPI. Su nombre se conserva por compatibilidad; ya no genera documentos de la versión 1.
5. `python tools/validate_contract.py` ejecuta el validador completo OpenAPI (requiere `openapi-spec-validator`).
6. `python tools/check_mockup.py`, `python tools/check_project_list.py` y `python tools/check_case_list.py` prueban los recorridos y listas en Edge con Playwright.
7. `python tools/check_ocr_mockup.py` comprueba la revisión OCR ficticia, permisos, revocación y versión de origen. No evalúa exactitud de un motor OCR real.

Los ensayos usan datos ficticios. Las tareas de la aplicación siguen pendientes hasta implementarse y aprobarse sus escenarios, no se completan por existir una pantalla.

Dependencias de herramientas: `python -m pip install -r tools/requirements.txt` en un entorno virtual. Para las pruebas de navegador se necesita Edge instalado; no se descarga un navegador desde los scripts. Alternativamente, el validador admite dependencias locales en `.tool-deps`, ignoradas por Git.

## Reglas de trabajo

[CURSOR.md](CURSOR.md) enlaza la [habilidad Karpathy](skills/karpathy-guidelines/SKILL.md): cambios mínimos, sin funciones especulativas y con criterios verificables. No ejecutar los scripts históricos `tools/update_unified_access.py`, `tools/update_unified_project_list.py`, `tools/add_ocr_spec.py` y `tools/record_backend_architecture.py` como generadores: documentan migraciones únicas ya aplicadas y sus copias están en `backups`.
