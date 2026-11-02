"""Document the project index/detail navigation approved by the user."""
from pathlib import Path
from shutil import copy2
from zipfile import ZipFile
from lxml import etree as E

root=Path(__file__).resolve().parents[1]
path=root/'SpecKit_Firma_Legal_Unificado_v2.docx'
with ZipFile(path) as z: parts=[(i,z.read(i.filename)) for i in z.infolist()]
xml=next(b for i,b in parts if i.filename=='word/document.xml')
doc=E.fromstring(xml);ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
ps=doc.findall('.//w:p',ns)
assert len(ps)==832
assert ''.join(ps[299].itertext())=='R15 Proyectos y encargos'
changes={
300:'El proyecto registra código, cliente principal, nombre, descripción, materia general, estado, socio responsable y abogado líder. Para activarse requiere resolución de revisión de conflictos y funciones asignadas. Proyectos abre un listado resumido, separado de la ficha de cada proyecto. Gerente y superadministrador ven todos los proyectos del estudio; abogados y asistentes ven los proyectos donde tienen al menos un expediente asignado vigente. Un borrador creado por el propio usuario puede mostrarse antes del primer expediente, identificado como borrador y sin ampliar acceso a otros asuntos. Clientes ven solo proyectos con expedientes habilitados para su portal. Ser socio o líder no concede por sí solo acceso a otros expedientes.',
301:'Estados: borrador, activo, suspendido y cerrado. Cerrar exige que todos sus expedientes estén cerrados o transferidos mediante una operación autorizada y auditada. El listado muestra código y nombre del proyecto, cliente, abogado líder, estado y acción «Abrir». Incluye búsqueda por código, nombre o cliente; filtros combinables por cliente, abogado líder y estado; orden por código, nombre o estado y opción de limpiar filtros. El orden siempre desempata por ID estable. Se presentan 25 proyectos por página con rango, total autorizado, página actual y controles Anterior/Siguiente deshabilitados en los extremos. No se despliegan expedientes dentro del listado ni se usa desplazamiento infinito. Filtrar reinicia a la primera página. Abrir lleva a la ficha y volver conserva filtros, orden y página de la sesión; cambiar de perfil reinicia la vista y recalcula permisos. La ficha muestra metadatos autorizados y solo expedientes permitidos, también paginados a 25. No revela conteos de expedientes ocultos. La configuración económica conserva honorarios fijo, hito, hora, cuota litis o iguala sin cálculo automático complejo; el registro detallado de horas sigue siendo posterior.',
304:''.join(ps[304].itertext())+' La consulta de proyectos filtra por acceso efectivo antes de búsqueda, filtros, orden, conteo y paginación. Las opciones de filtros proceden exclusivamente del ámbito autorizado; manipular filtros, cursor o projectId no amplía ese ámbito. Cada apertura de ficha y sus expedientes vuelve a verificar permisos.',
330:''.join(ps[330].itertext())+' En Proyectos se revisará listado compacto → ficha → expediente y regreso al listado con contexto conservado. La paginación se comprobará con más de 25 proyectos y con cero resultados, para cada perfil.',
341:'Listado autorizado de clientes y proyectos; búsqueda, filtros por cliente/abogado/estado, orden, 25 registros por página y acceso a ficha. Sin expedientes desplegados en la lista.',
344:'Ficha independiente con encargo, equipo y expedientes permitidos paginados. Volver conserva búsqueda, filtros, orden y página del listado; el reporte es parcial para equipo con acceso limitado y completo para dirección.',
400:'Cliente, código, descripción, estado, socio, líder; autorizaciones de metadatos y economía. El listado de proyectos se deriva del perfil de dirección o expedientes asignados vigentes; borradores propios tienen acceso explícito de creación. Índices para código, nombre, cliente, líder y estado según consulta medida; el total se calcula solo en el ámbito autorizado.',
496:''.join(ps[496].itertext())+' Para el listado de proyectos, la interfaz pagina a 25 usando cursores de servidor y conserva el recorrido de cursores en la sesión para volver atrás. La respuesta incluye totalAuthorized y filtros permitidos del ámbito actual; los ordenamientos tienen desempate estable. No descarga la cartera completa al navegador para paginarla en producción.',
509:'GET y POST /projects; GET y PATCH /projects/{id}; POST /projects/{id}/conflict-reviews. GET /projects admite q, clientId, leadId, status, sort, cursor y limit=25; GET /projects/{id}/cases pagina expedientes autorizados de la ficha.',
510:'Dirección: todos los proyectos del estudio. Equipo: proyectos con expedientes asignados vigentes y borradores propios. Portal: solo habilitados. Filtrar antes de ordenar, contar y paginar; validar filtros/cursor en servidor, sin revelar opciones ni expedientes ajenos.',
609:'A31 — R15 R16 R21. Con más de 25 proyectos, gerente y superadministrador ven todos los del estudio; abogado y asistente solo aquellos con expedientes asignados vigentes y sus borradores propios identificados. El cliente solo ve proyectos habilitados para su portal. El listado muestra columnas resumidas y acción Abrir, sin expedientes desplegados. Buscar por código/nombre/cliente y combinar filtros de cliente/abogado/estado produce solo resultados autorizados; las opciones no revelan cartera ajena. Ordenar es estable, se muestran 25 por página, el rango y total son autorizados y los controles se deshabilitan en extremos. Cambiar filtros vuelve a página 1; abrir ficha y volver conserva contexto; cambiar de perfil lo reinicia. Se comprueban lista vacía, más de una página, cursor o ID manipulado y revocación entre lista y ficha. La ficha pagina expedientes a 25 y no revela ocultos. El reporte operativo es completo para dirección y parcial para equipo sin contar los ocultos; economía mantiene permiso independiente. Exportar y descargar revalida alcance.',
637:'Clientes, partes, proyectos, revisión de conflictos y listado separado de ficha, búsqueda, filtros, orden y paginación autorizada a 25. T04.',
688:'Componentes responsivos, accesibilidad y flujos del mockup. Listado de proyectos con tabla en escritorio, tarjetas compactas en móvil, filtros etiquetados y controles de paginación accesibles. T01; acompaña cada módulo.',
831:''.join(ps[831].itertext())+' Mejora de navegación aprobada por el usuario: Proyectos pasa a listado compacto con búsqueda, filtros y paginación de 25, ficha independiente y retorno con contexto. Afecta R15, R16, R11, pantallas, consulta Project, contrato de proyectos, A31, T05 y T22. El mockup pagina datos ficticios en memoria; la aplicación real deberá filtrar y paginar en servidor.',
}
for i,text in changes.items():
    ts=ps[i].findall('.//w:t',ns);assert ts
    ts[0].text=text
    for t in ts[1:]:t.text=''
backup=root/'backups/SpecKit_Firma_Legal_Unificado_v2_antes_listado_proyectos.docx'
assert not backup.exists()
copy2(path,backup)
tmp=path.with_suffix('.updated.docx')
with ZipFile(tmp,'w') as z:
    for i,b in parts:z.writestr(i,E.tostring(doc,encoding='UTF-8',xml_declaration=True,standalone=True) if i.filename=='word/document.xml' else b)
with ZipFile(tmp) as z:
    assert z.testzip() is None
    final=E.fromstring(z.read('word/document.xml')).findall('.//w:p',ns)
    assert len(final)==832
    for i,text in changes.items():assert ''.join(final[i].itertext())==text
    for i,b in parts:
        if i.filename!='word/document.xml':assert z.read(i.filename)==b
tmp.replace(path)
print(f'Updated {len(changes)} paragraphs/cells; package and untouched formatting assets verified.')
