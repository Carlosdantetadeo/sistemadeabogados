"""One-time addition of reviewed text extraction to R05 in the approved Word."""
from copy import deepcopy
from pathlib import Path
from shutil import copy2
from zipfile import ZipFile
from lxml import etree as E

root=Path(__file__).resolve().parents[1];path=root/'SpecKit_Firma_Legal_Unificado_v2.docx'
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with ZipFile(path) as z:parts=[(i,z.read(i.filename)) for i in z.infolist()]
doc=E.fromstring(next(b for i,b in parts if i.filename=='word/document.xml'))
ps=doc.findall('.//w:p',ns)
def text(p):return ''.join(p.xpath('.//w:t/text()',namespaces=ns))
assert not any('OCR de texto revisado' in text(p) for p in ps), 'Already applied'
def replace(p,s):
    ts=p.findall('.//w:t',ns);assert ts
    ts[0].text=s
    for t in ts[1:]:t.text=''
def append(index,s):replace(ps[index],text(ps[index])+' '+s)
append(4,'Se incorpora OCR de texto revisado a R05 en la versión inicial: extracción por página de PDF escaneados e imágenes, conservando el original; no incluye extracción automática de campos jurídicos ni cálculo de plazos.')
append(263,'OCR de texto revisado: una vez incorporada y validada una versión PDF, JPG o PNG, un usuario interno con lectura y carga puede solicitar extracción de texto. El resultado se vincula a esa versión y a sus páginas y mantiene la clasificación del documento. Si el PDF ya contiene texto aprovechable, se extrae sin repetir OCR sobre esas páginas. El escaneo físico o captura multipágina sigue siendo un paso previo, no un escáner integrado en esta entrega.')
append(265,'OCRJob registra solicitante, versión fuente, estado, motor/modelo y versión, idioma, inicio, fin y fallo recuperable. TextExtraction conserva resultado original y revisiones de texto por página, revisor, fecha y motivo de corrección; no reemplaza el PDF ni cambia su hash. Estados: en cola, procesando, pendiente de revisión, revisado o fallido. El texto es borrador hasta revisar contra la imagen; se muestra confianza solo si el motor la proporciona. No se garantiza exactitud de manuscritos, firmas, sellos ni imágenes borrosas.')
append(267,'La extracción requiere lectura y carga vigentes en el expediente; texto y búsquedas heredan clasificación y permisos. El contenido económico exige permiso económico. Procesar, revisar o reintentar no publica nada al portal ni crea datos estructurados, actuaciones o plazos. Cada trabajo revalida permisos antes de procesar y entregar; no se entrega texto tras una revocación. Las revisiones conservan el resultado anterior, y una nueva versión requiere su propio resultado OCR. El cliente no accede al OCR interno. La selección del motor, tratamiento y límites se resuelve en D09 antes de documentos reales; el prototipo solo muestra ejemplos ficticios.')
replace(ps[321],'El PDF completo de un expediente puede cargarse mediante R05, incluido OCR para obtener texto revisable por página. Extraer automáticamente estructura, campos, responsables o plazos jurídicos sigue siendo una ampliación posterior distinta del OCR de texto. La importación CSV/XLSX no depende de OCR ni IA.')
append(414,'OCRJob: versión fuente, solicitante, motor y versión, idioma, estados, intentos y errores. TextExtraction: trabajo, página, texto original, revisiones corregidas, autor y fecha de revisión. Ambas entidades heredan estudio, expediente, clasificación, permisos, baja y conservación del documento fuente; no generan URLs públicas ni índices sin filtrar.')
append(477,'OCR de texto por página, separado de IA generativa y ejecutado en cola con revalidación de permisos. Reintentos idempotentes no crean resultados duplicados; fallos no bloquean la incorporación del original.')
append(527,' POST /versions/{id}/ocr-jobs; GET /ocr-jobs/{id}; POST /ocr-jobs/{id}/review.')
append(528,'OCR interno: lectura+carga y clasificación vigente, revisión por página con control de concurrencia; sin publicación automática. Motor no configurado devuelve capacidad no disponible; una revocación corta entrega e índice.')
append(588,'Con PDF escaneado, JPG/PNG y PDF con texto de muestra, obtener texto por página vinculado a la versión. Revisar/corregir conserva resultado original y revisiones; el original no cambia de hash. Un archivo ilegible devuelve error recuperable o resultado pendiente sin inventar contenido. Reintentar no duplica resultado. Cambiar versión impide guardar revisión contra otra versión; revocar acceso durante el trabajo impide entregar texto. Abogado/asistente sin permiso económico y cliente no reciben OCR económico o interno. Ningún OCR crea plazos ni publica contenido.')
append(649,'Incluir OCR de texto por página, adaptador de motor, estados en cola, revisión con original, revisiones, idempotencia y autorización de resultados. Resolver D09 antes de usar documentos reales.')
append(811,'Antes de OCR con documentos reales debe resolverse D09: motor, tratamiento, límites, costo y evaluación con muestras autorizadas.')
append(831,'Decisión del usuario: incorporar OCR de texto revisado en R05, sin ampliar extracción de campos ni cálculo jurídico automático. Afecta D09, R05, R20, modelo de documentos/OCRJob/TextExtraction, trabajadores, contrato de versiones/OCR, A13 y T09. Se añade una demostración de revisión en el mockup; no se declara motor operativo.')
# Add D09 to the existing decisions table without rebuilding document layout.
row=ps[117]
while row.tag!=f'{{{ns["w"]}}}tr':row=row.getparent()
new=deepcopy(row)
for cell,value in zip(new.findall('w:tc',ns),['D09','Responsable técnico y dirección seleccionan motor OCR, ejecución local o proveedor, tratamiento, límites de páginas/tamaño y costo; evalúan muestras autorizadas en español y calidad de imágenes. No se envían documentos a terceros sin autorización.','Antes de OCR con documentos reales']):
    paras=cell.findall('w:p',ns);replace(paras[0],value)
    for p in paras[1:]:cell.remove(p)
row.addnext(new)
backup=root/'backups/SpecKit_Firma_Legal_Unificado_v2_antes_ocr.docx';assert not backup.exists();copy2(path,backup)
tmp=path.with_suffix('.updated.docx')
with ZipFile(tmp,'w') as z:
    for i,b in parts:z.writestr(i,E.tostring(doc,encoding='UTF-8',xml_declaration=True,standalone=True) if i.filename=='word/document.xml' else b)
with ZipFile(tmp) as z:assert z.testzip() is None
tmp.replace(path)
print('OCR scope incorporated into R05, D09, model, API, A13 and T09. Original Word backed up.')
