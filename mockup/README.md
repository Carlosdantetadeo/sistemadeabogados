# Mockup local · Spec Kit Unificado v2

Referencia: `../SpecKit_Firma_Legal_Unificado_v2.docx` (31 de octubre de 2026), especialmente secciones 4–6. El documento ya incorpora la decisión del usuario registrada en [decisiones.md](decisiones.md): gerente y superadministrador ven toda la cartera y gestionan accesos; abogados y asistentes solo los asignados; clientes solo el contenido publicado para ellos.

Ejecuta desde la raíz `python -m http.server 5500 --bind 127.0.0.1 --directory mockup` y abre http://localhost:5500. También se puede abrir `index.html` directamente. La tipografía externa es opcional. Para simular operaciones debe haber conexión según el estado del navegador.

El selector superior cambia entre los cinco perfiles para revisar sus recorridos. En móvil, el botón de menú abre todos los módulos, incluida economía y administración cuando corresponde. El selector «Revisar estado de pantalla» está aislado: solo aparece al abrir `http://localhost:5500/?review=1`; representa vacío, cargando, error, sin permiso y operación correcta. No aparece en la interfaz normal.

Los datos y cambios viven exclusivamente en memoria y se reinician al recargar. El navegador simula permisos nominales; no demuestra seguridad de servidor. No hay autenticación real, API, escaneo de malware, conversión DOCX, envío de correo, conectores, emisión fiscal, IA ni PWA implementada. Las cargas muestran metadatos de demostración y no incorporan documentos reales. Las descargas documentales son TXT ficticios; las exportaciones CSV sí contienen los registros ficticios del recorrido.

## Recorridos

Proyectos abre una lista resumida con búsqueda por código, nombre o cliente, filtros por cliente/abogado líder/estado, orden y 25 registros por página. «Abrir» lleva a la ficha independiente y sus expedientes autorizados; volver conserva filtros y página. Cambiar de perfil reinicia el contexto. Dirección ve todos; el equipo ve proyectos con expedientes asignados y sus borradores propios identificados. En móvil se muestran tarjetas compactas. El DOCX unificado ya incluye este comportamiento en R15, pantallas, modelo, contrato y A31. La paginación del prototipo ocurre en memoria; la aplicación real la ejecutará en servidor.

La búsqueda y Estado quedan visibles. El botón Filtros despliega Cliente y Abogado líder en escritorio y móvil, con contador de selecciones. Las selecciones se aplican inmediatamente y aparecen como etiquetas removibles, incluso con el panel cerrado. «Limpiar filtros» aparece solo con criterios activos y conserva el orden elegido. El orden se controla junto al encabezado del listado, separado de los filtros. Los cambios anuncian el número de resultados y vuelven a página 1. Expedientes también pagina a 25 con búsqueda, Estado y filtros secundarios por cliente, proyecto y abogado; volver desde su ficha conserva filtros y página, y cambiar de perfil reinicia el contexto.

1. Gerente → Nuevo proyecto → resolver conflictos → crear expediente con responsable, seguimiento, suplente y gestor. El abogado puede proponer un proyecto, pero no resolver la revisión de conflictos.
2. Asistente → Documentos → incorporar PDF/imagen → confirmar destino; Abogado → revisar → publicar versión. Cambiar a Cliente para ver únicamente la versión publicada. Una nueva versión sigue interna.

   OCR: en un documento PDF/JPG/PNG, «Extraer texto (OCR)» permite revisar una muestra ficticia de página, corregirla y confirmar. Conserva autoría y versión de la revisión; una versión nueva requiere su propio resultado. Solo usuarios internos con lectura+carga y clasificación autorizada ven el control. Cliente no ve OCR interno. No existe motor OCR conectado ni se procesa el archivo en este prototipo; D09 define su selección antes de documentos reales.
3. Asistente → Notificaciones y plazos → propuesta; Abogado → verificar → registrar presentación. La identidad que propone no puede autoverificar.
4. Gerente → Expediente → Equipo y accesos → agregar asistente, retirar acceso o transferir abogado. El antiguo responsable pierde acceso y se conserva la autoría.
5. Gerente → registrar costo; Superadministrador → aprobar el costo de otra persona → preparar borrador → registrar comprobante externo → registrar abono. Las monedas no se mezclan y no se admite exceder el saldo.
6. Cliente → portal reducido de EXP-2026-089. Revocar su acceso desde Equipo elimina ese expediente de su siguiente consulta. Las comprobaciones de acceso a expedientes ajenos se ejecutan con `tools/check_mockup.py`, sin controles de prueba en el recorrido de usuario.

La fecha operativa ficticia es 31/10/2026, America/Lima. Gerente y superadministrador ven los tres expedientes iniciales y cualquier expediente nuevo, y gestionan sus accesos. Abogada y asistente ven dos asignados cada una; el cliente ve uno con contenido publicado. Los permisos económicos específicos se conservan. Las fechas y resultados de alertas, casillas, servicios y respaldos son ejemplos, no mediciones reales.

## Verificación

`python tools/check_mockup.py` desde la raíz (requiere Playwright y Edge). Revisa navegación de cinco perfiles a 360/768/1440, aislamiento visual, verificación independiente, publicación por versión, economía y transferencia. No valida las garantías de backend del Spec Kit.

`python tools/check_project_list.py` comprueba búsqueda, filtros combinados, paginación con 32 proyectos ficticios de prueba, retorno desde ficha, cambio de perfil y revocación. Los datos extra se generan solo en la prueba; el mockup conserva sus dos proyectos iniciales.

`python tools/check_case_list.py` comprueba volumen de expedientes, filtros, paginación, regreso desde ficha, cambio de perfil, límites de acceso y aislamiento del selector de revisión. [Estado de construcción](../STATUS.md) detalla qué recorridos siguen siendo representaciones y qué falta en servidor.
