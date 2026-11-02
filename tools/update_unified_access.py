"""Apply the user's revised access policy to the unified Word, preserving formatting."""
from pathlib import Path
from shutil import copy2
from zipfile import ZipFile
from lxml import etree as E

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'SpecKit_Firma_Legal_Unificado_v2.docx'
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with ZipFile(path) as source:
    entries = [(info, source.read(info.filename)) for info in source.infolist()]
document = E.fromstring(dict((i.filename, b) for i, b in entries)['word/document.xml'])
paragraphs = document.findall('.//w:p', NS)
assert len(paragraphs) == 832
assert ''.join(paragraphs[302].itertext()) == 'R16 Autorización nominal por expediente'

changes = {
1: 'Versión 2 • 31 de octubre de 2026 • Revisión de permisos aprobada por el usuario',
3: 'La regla central de acceso distingue tres ámbitos: gerente y superadministrador pueden consultar todos los expedientes del estudio y gestionar sus accesos; abogados y asistentes solo consultan los expedientes que tienen asignados de forma vigente; clientes solo consultan el contenido que el estudio publica expresamente para ellos en su portal de solo lectura. El perfil determina las acciones permitidas. Cambiar de abogado o retirar a un asistente conserva el historial y la autoría del trabajo.',
38: 'La base funcional es SpecKit_Firma_Legal_v1.docx, incluidas sus observaciones. La especificación de expedientes aporta la separación entre asunto y expediente, la verificación de plazos, la cobertura de casillas y la migración. Por decisión posterior expresa del usuario, gerente y superadministrador tienen consulta global y gestión de accesos sobre todos los expedientes del estudio. Abogados y asistentes mantienen acceso por asignación vigente, y clientes solo al contenido publicado para ellos. Esta decisión prevalece sobre la restricción nominal anterior para los perfiles de dirección.',
43: 'Gerente y superadministrador pueden consultar todos los expedientes de su estudio y gestionar sus accesos, sin concesión individual por expediente. Incluye consulta y descarga de documentos operativos e historial operativo. Economía, edición profesional, publicación y baja documental mantienen sus controles específicos. No se concede acceso a otro estudio.',
63: 'C10 define consulta global y gestión de accesos para gerente y superadministrador, asignación vigente para abogados y asistentes y publicación expresa para clientes. La cobertura requisito–escenario–tarea y la verificación de integraciones se explicitan en C11 y C12.',
96: 'Dirección designa a las personas con perfil de gerente o superadministrador que gestionarán los accesos del estudio y a dos custodios para recuperación excepcional de cuentas o soporte. No se requiere nombrar un gestor distinto para habilitar la consulta de cada expediente.',
131: 'C10 Acceso por perfil, asignación y publicación. Gerente y superadministrador consultan todos los expedientes del estudio y gestionan sus accesos por su perfil vigente, sin asignación individual. Abogados y asistentes requieren asignación vigente por expediente. Clientes solo consultan contenido publicado expresamente para su cuenta y con acceso de portal habilitado. Altas, cambios y retiros conservan actor, fecha y motivo. La consulta global no concede permisos económicos ni otras acciones específicas.',
142: '1. El creador autorizado abre un expediente dentro de un proyecto al que puede acceder y selecciona abogado responsable, seguimiento y suplente. Gerente y superadministrador del estudio pueden consultarlo y gestionar sus accesos desde su creación, sin asignación nominal como gestores.',
143: '2. El servidor crea el expediente y las asignaciones y autorizaciones operativas iniciales en una sola transacción. La pantalla distingue el acceso global de gerente y superadministrador de los permisos individuales del equipo. Para abogados y asistentes, crear o trabajar en un expediente no concede acceso a otros del mismo proyecto.',
144: '3. Cualquier gerente o superadministrador activo del estudio entra en «Equipo y accesos», agrega una cuenta activa y elige permisos compatibles con su perfil. Puede fijar inicio y fin de las asignaciones individuales; el servidor impide otorgar permisos fuera de la matriz.',
145: '4. Antes de confirmar se muestran las personas asignadas y sus acciones, las publicaciones y audiencias cliente y el acceso global de gerente y superadministrador. Se registra el cambio y se envía un aviso genérico a la persona afectada.',
146: '5. Retirar o vencer la asignación de un abogado o asistente, o revocar el acceso de portal de un cliente, bloquea su siguiente solicitud. Los historiales, actuaciones y versiones permanecen con sus autores. El acceso global de gerente y superadministrador no se retira desde un expediente: depende de cuenta activa, perfil vigente y pertenencia al estudio.',
147: 'En la versión inicial, todos los gerentes y superadministradores activos del estudio pueden gestionar accesos en cualquiera de sus expedientes. Un abogado puede solicitar incorporar a un asistente o transferir el caso; gerente o superadministrador confirma la asignación. Ser responsable legal no permite concederse permisos económicos ni gestionar accesos por sí solo.',
148: 'La cobertura administrativa se mantiene mediante las cuentas activas de gerente y superadministrador del estudio, sin exigir una concesión individual de gestor por expediente. No se puede desactivar al último superadministrador sin reemplazo. La recuperación de cuentas y el soporte excepcional conservan dos aprobaciones de custodios, motivo, alcance y caducidad; no constituyen un perfil global adicional de soporte. La pérdida de una asignación individual de un gerente o superadministrador no revoca el acceso que deriva de su perfil vigente.',
150: 'El servidor comprueba cuenta activa, estudio, perfil, recurso y acción. Para consultar y descargar contenido operativo, consultar historial operativo y gestionar accesos de cualquier expediente, gerente y superadministrador tienen alcance global dentro del estudio. Abogados y asistentes requieren asignación vigente y permiso para la acción; clientes requieren acceso de portal y publicación expresa para su cuenta. Clasificación económica, publicación, verificación profesional y baja documental añaden sus controles específicos. La pertenencia a un cliente o proyecto no amplía por sí sola el acceso de abogados, asistentes ni clientes.',
176: 'Todos los expedientes del estudio',
177: 'Todos los expedientes del estudio',
178: 'Solo asignados vigentes',
179: 'Solo asignados vigentes',
180: 'Solo habilitados y contenido publicado para su cuenta',
206: 'Todos los expedientes del estudio, por perfil',
207: 'Todos los expedientes del estudio, por perfil',
230: 'Operativos de todos; económicos con permiso específico',
231: 'Operativos de todos; económicos con permiso específico',
236: 'Todos los expedientes del estudio',
237: 'Todos los expedientes del estudio',
242: 'La tabla define el alcance de cada perfil. Gerente y superadministrador reciben consulta global de expedientes, descarga operativa, historial operativo y gestión de accesos por su perfil activo dentro del estudio. Las demás acciones mantienen sus permisos específicos. Las cuentas tienen un perfil único en v1. La verificación de plazos corresponde a abogados autorizados distintos del registrador, comprobados por identidad de persona incluso si existen varias cuentas vinculadas a ella.',
250: 'El superadministrador invita usuarios, asigna uno de los cinco perfiles, revoca sesiones y activa o desactiva cuentas. Las invitaciones son de un solo uso y caducan. Se exige MFA al personal interno, recuperación verificada y cierre por inactividad. El cambio de perfil invalida permisos incompatibles y recalcula el alcance efectivo: pasar a gerente o superadministrador habilita consulta global y gestión de accesos; abandonar ambos perfiles retira ese alcance, dejando solo asignaciones y permisos compatibles vigentes. No crea concesiones económicas ni publicaciones de portal.',
251: 'No se puede desactivar ni degradar al último superadministrador activo sin nombrar un reemplazo en la misma operación. Una baja planificada ofrece reasignar responsabilidades; una suspensión urgente corta el acceso inmediatamente y abre incidencias de cobertura. El panel de administración muestra cuentas y salud del servicio; gerente y superadministrador pueden además consultar todos los expedientes por su perfil vigente, con separación de la información económica.',
254: 'Para crear un proyecto, el abogado accede a una búsqueda mínima de clientes expresamente habilitados para él; no explora la cartera general. La revisión de posibles conflictos compara identificadores y nombres de partes antes de activar el proyecto. Las coincidencias requieren resolución documentada por un gerente autorizado para esa revisión, quien puede consultar todos los expedientes del estudio. A abogados, asistentes o clientes sin acceso al expediente coincidente solo se les informa «requiere revisión», sin revelar nombres ni expedientes ajenos. Una ausencia de coincidencias no equivale a una conclusión jurídica automática.',
300: 'El proyecto registra código, cliente principal, nombre, descripción, materia general, estado, socio responsable y abogado líder. Para activarse requiere resolución de revisión de conflictos y funciones asignadas. Gerente y superadministrador consultan todos sus expedientes; abogados y asistentes solo los asignados, y clientes solo la ficha reducida y las publicaciones habilitadas. Las funciones de socio o líder no amplían por sí solas el acceso de los otros perfiles.',
302: 'R16 Acceso global de dirección y asignación por expediente',
303: 'Implementar el flujo de la sección 4. Gerente y superadministrador consultan todos los expedientes del estudio, descargan contenido operativo, consultan historial operativo y gestionan accesos por su perfil vigente, sin concesión nominal por expediente. Abogados y asistentes requieren asignación vigente y acciones compatibles con su perfil. Clientes solo consultan contenido publicado para su cuenta en expedientes habilitados. Editar ficha, registrar actuación, cargar, gestionar tareas, proponer o verificar plazos, publicar, operar economía y tramitar bajas mantienen sus permisos y requisitos específicos.',
304: 'Los controles cubren listas, búsquedas, calendarios, conteos, reportes, archivos, previews, API y trabajos en segundo plano. Al revocar asignaciones individuales, acceso de portal, permisos específicos o un perfil de dirección, se invalidan permisos calculados en caché y se revalida el alcance antes de entregar resultados. No se aceptan roles ni asignaciones enviados por el navegador como prueba de autorización. Los recursos ajenos al ámbito de abogados, asistentes o clientes no revelan su existencia; para gerente y superadministrador no se exige asignación individual dentro de su estudio.',
316: 'Si falta confirmación al cierre del horario se alerta al suplente y al supervisor de casilla. La supervisión de cobertura no concede por sí sola acceso a expedientes para abogados o asistentes. Gerente y superadministrador conservan su acceso global por perfil. Cada nueva notificación se incorpora mediante R18 con comprobación del acceso efectivo y de los permisos de registro.',
323: 'Entregar tableros de expedientes, tareas, plazos de los próximos 15 días, pendientes de verificación, notificaciones sin tratar, cobertura de casillas y cargas en revisión. Gerente y superadministrador ven la cartera y carga de trabajo de todo el estudio. Los indicadores de abogados y asistentes incluyen solo expedientes asignados; el portal solo muestra contenido publicado para su usuario. La información económica exige sus permisos específicos.',
350: 'Acceso global de gerente y superadministrador; asignaciones vigentes, permisos, periodo, motivo y solicitud de cambio del equipo; acceso de portal por publicación',
386: 'Se revisarán seis recorridos completos: alta de proyecto y expediente; incorporación y publicación documental; notificación hasta presentación; asignación de asistente y transferencia de abogado; costo hasta registro de cobro; consulta del cliente con acceso limitado. Se comprobará que gerente y superadministrador abren y gestionan accesos de cualquier expediente del estudio sin asignación individual; abogados y asistentes no abren expedientes ajenos; retirar una asignación o acceso de portal bloquea la consulta siguiente.',
408: 'Cuenta, expediente, acciones, inicio, fin, otorgante, motivo y versión de política; concesiones individuales de equipo y portal y permisos específicos. La consulta global y gestión de accesos de gerente y superadministrador se derivan del perfil activo y firm_id, sin fila CaseGrant obligatoria por expediente.',
452: 'Un expediente activo tiene responsable legal abogado, seguimiento y suplente distinto. La gestión de accesos corresponde a los gerentes y superadministradores activos del estudio sin concesión individual; se conserva al menos un superadministrador activo. Una suspensión urgente genera excepciones de cobertura visibles y alertadas, no permisos residuales.',
453: 'Las asignaciones y autorizaciones individuales del equipo cambian juntas. Una función de proyecto o equipo no amplía permisos más allá del perfil. Las fechas de una función exclusiva no se solapan. Cambiar a gerente o superadministrador habilita su alcance global; dejar ambos perfiles lo retira de inmediato, conservando únicamente concesiones compatibles vigentes y su historia.',
484: 'Centralizar la política de cuenta activa + estudio + perfil + acción + recurso + clasificación + publicación. La consulta operativa y gestión de accesos de gerente y superadministrador abarcan todos los expedientes de su estudio; abogados y asistentes se filtran por asignación vigente y clientes por acceso de portal y publicación. Economía y otras acciones específicas se validan separadamente. La política se aplica en rutas y servicios; la base refuerza integridad. Si se adopta RLS, debe contemplar explícitamente ambas formas de acceso y probar cuentas de servicio. No se presupone Supabase.',
504: 'Perfil y estado; recalcular alcance global de dirección al cambiar perfil, sin crear permisos económicos ni publicaciones',
510: 'Consulta global de dirección; metadatos habilitados para otros perfiles y revisión de conflictos restringida',
513: 'Consulta global de gerente/superadmin; asignación vigente para equipo; portal publicado; acción y transición válidas',
516: 'Gerente o superadmin activo del estudio, sin concesión individual; límites del perfil e historial',
534: 'Equipo vigente como destinatario; consulta global de dirección y permisos específicos para crear o modificar',
567: 'Conceder acceso recibe userId, actions, validFrom, validUntil opcional, reason y version. El servidor exige gerente o superadministrador activo del mismo estudio, sin requerir CaseGrant del otorgante en el expediente. Valida perfil del destinatario y acciones. Devuelve grantId, effectiveActions y fechas. No permite retirar el acceso global de dirección mediante una revocación por expediente; para ello se aplica la administración de cuenta o perfil y sus controles.',
572: 'Preparar datos ficticios con dos clientes, tres expedientes y dos proyectos de un estudio. G1 y G2 son gerentes y S1 superadministrador: todos consultan E1, E2 y E3 y gestionan sus accesos sin concesión individual. A1 y asistente T1 están asignados solo a E1; A2 a E2; E3 tiene equipo distinto. X1 solo tiene acceso de portal a E1 y recibe únicamente publicaciones para su cuenta. Usar además otro estudio sin acceso para ninguno de ellos y una segunda persona con permiso económico para aprobación independiente.',
579: 'A05 — R16. G1, G2 y S1, sin concesiones individuales, consultan E1, E2 y E3 por ID, lista, búsqueda, calendario, reporte y descarga operativa y pueden gestionar sus accesos. A1, T1 y X1 intentan abrir E2 sin asignación o habilitación: no reciben contenido, conteos ni pistas. Ningún perfil accede al otro estudio. La consulta global no evita los controles de economía, publicación ni otras acciones específicas.',
580: 'A06 — R16. G1 o S1 sin concesión individual en E1 agrega consulta y carga a T1. T1 puede realizar ambas acciones, pero no publicar, gestionar accesos ni consultar costos. Intentar agregar permisos incompatibles con su perfil se rechaza aunque se altere la petición. Una revocación por expediente no elimina el acceso global de otro gerente o superadministrador.',
582: 'A08 — R01 R16 R17. Cambiar a una cuenta activa al perfil de gerente o superadministrador habilita consulta global y gestión de accesos sin crear concesiones económicas. Al pasarla a abogado o asistente pierde ese alcance y conserva solo asignaciones compatibles vigentes; al suspenderla pierde todo acceso. Desactivar al último superadministrador sin reemplazo falla. Un acceso excepcional de soporte exige dos aprobaciones, motivo, acciones, expediente y caducidad; no concede alcance global por sí solo.',
609: 'A31 — R15 R21. Un proyecto tiene varios expedientes. Gerente y superadministrador ven su reporte operativo completo sin requerir asignaciones individuales. El abogado o asistente solo recibe los asignados; el reporte se identifica como parcial sin contar los ocultos. El portal mantiene contenido publicado. Exportar y descargar revalida alcance actual y separa eventos económicos.',
634: 'Política de acceso global de dirección, asignación de equipo, publicaciones de portal, proyecciones y gestión de accesos. T03.',
758: 'R16 Acceso global de dirección y asignación por expediente',
819: 'Especificación v1 – Sistema de gestión de expedientes (estudio jurídico).docx, del 31 de octubre de 2026, aporta cliente–asunto–expediente, seguimiento y suplencia, doble verificación, casillas y carga inicial. El alcance económico se conserva en la versión inicial completa. La decisión posterior del usuario fija consulta global y gestión de accesos para gerente y superadministrador; asignación para abogados y asistentes y publicación para clientes.',
823: 'Se adopta la decisión expresa del usuario: gerente y superadministrador consultan todos los expedientes del estudio y gestionan sus accesos; abogados y asistentes solo consultan los asignados; clientes solo reciben contenido publicado para ellos. Sustituye las restricciones nominales anteriores de los perfiles de dirección.',
831: 'Cambio de permisos aprobado por el usuario, registrado el 31 de octubre de 2026: alcance global operativo y gestión de accesos para gerente y superadministrador; asignación para abogados y asistentes; publicación expresa para clientes. Afecta introducción, decisiones, C10, matriz y flujo de autorización, R01, R15, R16, R21, CaseGrant, política técnica, contratos de cuentas/expedientes/accesos/reportes, A05, A06, A08, A31 y T04. Conserva controles económicos y demás acciones específicas. Toda modificación futura indicará motivo, aprobador y requisitos, datos, API, escenarios y tareas afectados.',
}

for index, text in changes.items():
    nodes = paragraphs[index].findall('.//w:t', NS)
    assert nodes, index
    nodes[0].text = text
    for node in nodes[1:]:
        node.text = ''

backup = ROOT / 'backups' / 'SpecKit_Firma_Legal_Unificado_v2_antes_cambio_accesos.docx'
backup.parent.mkdir(exist_ok=True)
assert not backup.exists(), 'Backup exists; do not overwrite the prior version.'
copy2(path, backup)
temporary = path.with_suffix('.updated.docx')
xml = E.tostring(document, xml_declaration=True, encoding='UTF-8', standalone=True)
with ZipFile(temporary, 'w') as output:
    for info, data in entries:
        output.writestr(info, xml if info.filename == 'word/document.xml' else data)

# Verify package integrity and untouched assets, styles, headers and layout.
with ZipFile(temporary) as result:
    assert result.testzip() is None
    final = E.fromstring(result.read('word/document.xml'))
    final_ps = final.findall('.//w:p', NS)
    assert len(final_ps) == len(paragraphs)
    for index, text in changes.items():
        assert ''.join(final_ps[index].itertext()) == text, index
    for info, data in entries:
        if info.filename != 'word/document.xml':
            assert result.read(info.filename) == data, info.filename
    assert len(final.findall('.//w:tbl', NS)) == len(document.findall('.//w:tbl', NS))
temporary.replace(path)
print(f'Updated {len(changes)} paragraphs/cells. DOCX integrity verified. Backup: {backup.name}')
