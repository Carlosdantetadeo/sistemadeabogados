"""Read-only checks of synchronized documents, links and API coverage."""
import json
from pathlib import Path
import re
from zipfile import ZipFile
from sync_spec import ROOT, sync

def check():
    count=sync(check=True)
    files=list(ROOT.glob('*.md'))+list((ROOT/'contracts').glob('*.md'))+list((ROOT/'mockup').glob('*.md'))
    for path in files:
        for link in re.findall(r'\]\(([^)]+)\)',path.read_text(encoding='utf-8')):
            if '://' in link or link.startswith('#'):continue
            assert (path.parent/link.split('#')[0]).exists(),f'{path.name}: broken link {link}'
    api=json.loads((ROOT/'contracts/openapi.yaml').read_text(encoding='utf-8'))
    assert api['info']['version']=='2.0.0'
    snapshot=ROOT/'apps/api/src/contract.json'
    if snapshot.exists():assert json.loads(snapshot.read_text(encoding='utf-8'))==api, 'Backend contract snapshot is stale; run npm run build.'
    seen=set();requirements=set()
    for route,methods in api['paths'].items():
        for method,op in methods.items():
            assert op['operationId'] not in seen
            seen.add(op['operationId']);requirements.update(op['x-requirements'])
            assert set(re.findall(r'\{([^}]+)\}',route))=={p['name'] for p in op['parameters'] if p['in']=='path'}
            assert any(k.startswith('2') for k in op['responses'])
            if method!='get':assert any(p['name']=='X-CSRF-Token' and p['required'] for p in op['parameters'])
    assert requirements=={f'R{i:02}' for i in range(1,23)}
    def walk(value):
        if isinstance(value,dict):
            if '$ref' in value:
                assert value['$ref'].startswith('#/')
                current=api
                for part in value['$ref'][2:].split('/'):current=current[part]
            for v in value.values():walk(v)
        elif isinstance(value,list):
            for v in value:walk(v)
    walk(api)
    for domain in ['projects','cases','mailboxes','imports','portal/cases','admin/health']:
        assert '/'+domain in api['paths']
    for i in range(1,23):
        token=f'R{i:02}'
        for name in ['spec.md','tasks.md','acceptance.md']:assert token in (ROOT/name).read_text(encoding='utf-8'),(name,token)
    accept=(ROOT/'acceptance.md').read_text(encoding='utf-8');tasks=(ROOT/'tasks.md').read_text(encoding='utf-8')
    for i in range(1,41):assert f'A{i:02}' in accept
    for i in range(1,29):assert f'T{i:02}' in tasks
    schemas=api['components']['schemas']
    portal=schemas['PortalCaseView']['properties']
    assert not {'costs','amount','grants','nextAction','internalNotes','responsibleId'}&set(portal)
    assert 'projectId' in schemas['BillingView']['properties'] and 'caseId' not in schemas['BillingView']['properties']
    assert 'approval' in schemas['CostView']['properties'] and 'billing' in schemas['CostView']['properties']
    assert not any(m!='get' for path,ms in api['paths'].items() if path.startswith('/portal/') for m in ms)
    with ZipFile(ROOT/'SpecKit_Firma_Legal_Unificado_v2.docx') as z:assert z.testzip() is None
    print(f'PASS: {count} synchronized documents; local links; {len(seen)} operations; resolved references; R01–R22, A01–A40, T01–T28; portal/economy projections; DOCX integrity.')
    print('Structural design validation; not evidence of a working API or production security.')

if __name__=='__main__':check()
