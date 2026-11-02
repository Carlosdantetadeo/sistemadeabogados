# Cambio de permisos solicitado por el usuario

Esta decisión se incorporó al documento `SpecKit_Firma_Legal_Unificado_v2.docx`, incluidas su matriz de permisos, R16, modelo de datos, contratos, escenarios y tareas. Sustituye la restricción nominal anterior de los perfiles de dirección.

- Gerente y superadministrador consultan todos los expedientes del estudio, descargan documentos operativos, consultan su historial y gestionan los accesos, sin asignación individual.
- Abogados y asistentes consultan únicamente expedientes con asignación vigente. Retirar o vencer una asignación bloquea su siguiente consulta y conserva historial y autoría.
- Clientes consultan únicamente expedientes habilitados para ellos y contenido expresamente publicado para su cuenta. El portal sigue siendo de solo lectura.

La visibilidad global no cambia los permisos de acciones profesionales, verificación independiente, aprobación económica, baja documental ni administración de cuentas. Los permisos económicos específicos se conservan.

El DOCX unificado ya refleja esta decisión. La versión anterior está conservada en `../backups/SpecKit_Firma_Legal_Unificado_v2_antes_cambio_accesos.docx`. Los Markdown se sincronizan desde el Word con `tools/sync_spec.py` y OpenAPI v2 desarrolla su catálogo funcional. Este mockup simula el comportamiento en el navegador; el contrato y los documentos no acreditan una API operativa.
