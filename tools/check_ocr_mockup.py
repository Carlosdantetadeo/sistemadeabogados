"""Check OCR demonstration UX boundaries; no OCR engine or real file processing."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.route('https://fonts.googleapis.com/**',lambda r:r.abort())
    page.route('https://fonts.gstatic.com/**',lambda r:r.abort())
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto((root/'mockup/index.html').as_uri())
    page.select_option('#role-select','assistant')
    page.evaluate("go('documentos');ocrDemo(1)")
    assert 'no se procesa' in page.locator('dialog').inner_text()
    page.locator('dialog input[type=checkbox]').check()
    page.locator('dialog button[type=submit]').click()
    page.locator('dialog textarea[name=text]').fill('Texto corregido de muestra')
    page.locator('dialog textarea[name=reason]').fill('Revisado contra ejemplo')
    page.locator('dialog input[type=checkbox]').check()
    page.locator('dialog button[type=submit]').click()
    assert page.evaluate('db.docs[0].ocr.version')==2
    assert page.evaluate('db.docs[0].ocr.reviewer')=='Paola Díaz'
    assert page.evaluate('db.docs[0].published')==1
    assert page.evaluate('db.docs[0].author')=='Lucía Torres'
    assert page.evaluate('db.deadlines.length')==1
    # Revisions remain internal and are not delivered in the client DOM.
    page.select_option('#role-select','client')
    page.evaluate("go('documentos')")
    assert page.get_by_role('button',name='Extraer texto (OCR)',exact=True).count()==0
    assert 'Texto corregido de muestra' not in page.locator('#content').inner_text()
    # An economic document cannot be processed by operational staff.
    page.select_option('#role-select','lawyer')
    assert page.evaluate("ocrAllowed({...db.docs[0],classification:'Económica'})") is False
    page.evaluate("ocrDemo(1)")
    page.locator('dialog input[type=checkbox]').check()
    page.locator('dialog button[type=submit]').click()
    page.locator('dialog textarea[name=reason]').fill('Prueba de cambio concurrente')
    page.locator('dialog input[type=checkbox]').check()
    page.evaluate('db.docs[0].version=3')
    page.locator('dialog button[type=submit]').click()
    assert 'cambió la versión' in page.locator('#form-error').inner_text()
    assert page.evaluate('db.docs[0].ocr.version')==2
    page.evaluate('closeModal();ocrDemo(1)')
    page.locator('dialog input[type=checkbox]').check()
    page.evaluate('delete db.cases[0].grants.lawyer')
    page.locator('dialog button[type=submit]').click()
    assert 'acceso cambió' in page.locator('#form-error').inner_text()
    page.evaluate('closeModal()')
    page.select_option('#role-select','manager')
    for width in [360,768,1440]:
        page.set_viewport_size({'width':width,'height':1000})
        page.evaluate('ocrDemo(1)')
        page.locator('dialog input[type=checkbox]').check()
        page.locator('dialog button[type=submit]').click()
        assert page.evaluate('document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth'),width
        page.evaluate('closeModal()')
    assert not errors,errors
    browser.close()
print('PASS: OCR demo review; client/economic boundaries; stale version and revocation rejection; responsive dialogs. No real OCR processed.')
