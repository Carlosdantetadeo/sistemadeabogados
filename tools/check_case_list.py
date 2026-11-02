"""Synthetic case volume, filters, back context, role isolation and review mode."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.route('https://fonts.googleapis.com/**',lambda r:r.abort())
    page.route('https://fonts.gstatic.com/**',lambda r:r.abort())
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    url=(root/'mockup/index.html').as_uri();page.goto(url)
    assert page.locator('.state-toolbar').count()==0
    page.evaluate('''() => {
      for(let n=1;n<=32;n++)db.cases.push({...db.cases[0],id:'VOL-'+String(n).padStart(3,'0'),name:'Expediente de volumen '+n,grants:n<=27?{lawyer:[...permissions.lawyer]}:{}});
      go('expedientes');
    }''')
    assert page.locator('#case-results .case-item').count()==25
    assert '35 expedientes encontrados' in page.locator('#case-result-count').inner_text()
    page.get_by_role('button',name='Siguiente',exact=True).click()
    assert page.locator('#case-results .case-item').count()==10
    assert page.get_by_role('button',name='Siguiente',exact=True).is_disabled()
    page.locator('#case-results .case-item').first.click()
    page.get_by_role('button',name='← Expedientes',exact=True).click()
    assert 'Página 2 de 2' in page.locator('#case-results .pagination').inner_text()
    page.locator('#case-q').fill('VOL-001')
    assert page.locator('#case-results .case-item').count()==1
    assert 'Página 1 de 1' in page.locator('#case-results .pagination').inner_text()
    page.locator('#case-filter-toggle').focus();page.keyboard.press('Enter')
    page.select_option('#case-status','Cerrado')
    assert page.locator('#case-results .case-item').count()==0
    page.get_by_role('button',name='Limpiar filtros',exact=True).click()
    assert page.locator('#case-q').input_value()==''
    page.select_option('#role-select','lawyer');page.evaluate("go('expedientes')")
    assert '29 expedientes encontrados' in page.locator('#case-result-count').inner_text()
    page.locator('#case-q').fill('VOL-032')
    assert page.locator('#case-results .case-item').count()==0
    page.select_option('#role-select','client');page.evaluate("go('expedientes')")
    assert page.locator('#case-results .case-item').count()==1
    assert 'VOL-' not in page.locator('#content').inner_text()
    page.select_option('#role-select','manager')
    for width in [360,768,1440]:
        page.set_viewport_size({'width':width,'height':1000})
        page.evaluate("go('expedientes')")
        page.locator('#case-filter-toggle').click()
        page.select_option('#case-project','PR-001')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        page.get_by_role('button',name='Limpiar filtros',exact=True).click()
        page.locator('#case-filter-toggle').click()
    page.goto(url+'?review=1')
    assert page.locator('.state-toolbar').is_visible()
    page.locator('.state-toolbar select').select_option('error')
    assert 'No se pudo cargar' in page.locator('#content').inner_text()
    page.goto(url)
    assert page.locator('.state-toolbar').count()==0
    assert not errors,errors
    browser.close()
print('PASS: cases paginate at 25; filters/back/role boundaries; 360/768/1440; review tools isolated; no browser errors.')
