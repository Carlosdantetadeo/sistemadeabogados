"""Exercise project pagination and permission boundaries with synthetic volume."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.route('https://fonts.googleapis.com/**',lambda r:r.abort())
    page.route('https://fonts.gstatic.com/**',lambda r:r.abort())
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto((root/'mockup/index.html').as_uri())
    page.evaluate('''() => {
      for(let n=3;n<=32;n++){
        const id='PR-'+String(n).padStart(3,'0');
        db.projects.push({id,name:'Proyecto de volumen '+n,client:n<=28?'Cliente visible':'Cliente reservado',status:n%2?'Activo':'Suspendido',partner:'María Cárdenas',lead:n<=28?'Lucía Torres':'Diego Paredes',conflict:'Resuelto'});
        db.cases.push({id:'VOLUMEN-'+n,project:id,name:'Expediente de volumen '+n,client:'Cliente visible',stage:'Inicio',type:'Judicial',status:'Abierto',lawyer:'Lucía Torres',follow:'Paola Díaz',backup:'Diego Paredes',grants:n<=28?{lawyer:[...permissions.lawyer]}:{}});
      }
      go('proyectos');
    }''')
    assert page.locator('.project-table tbody tr').count()==25
    assert page.locator('#content .case-item').count()==0
    # Secondary filters are disclosed by keyboard; selections stay visible when closed.
    assert page.locator('#project-filter-panel').is_hidden()
    assert page.get_by_role('button',name='Limpiar filtros',exact=True).is_hidden()
    page.locator('#project-filter-toggle').focus()
    page.keyboard.press('Enter')
    assert page.locator('#project-filter-panel').is_visible()
    page.select_option('#project-client','Cliente visible')
    assert page.locator('.filter-count').inner_text()=='1'
    assert page.locator('.filter-chip').count()==1
    page.locator('#project-filter-toggle').click()
    assert page.locator('#project-filter-panel').is_hidden()
    assert page.locator('.filter-chip').is_visible()
    page.locator('.filter-chip').click()
    assert page.locator('#project-client').input_value()==''
    assert page.locator('#project-active-filters').is_hidden()
    assert page.locator('#project-query').evaluate('(el)=>el===document.activeElement')
    page.select_option('#project-sort','name')
    page.locator('#project-query').fill('volumen')
    page.get_by_role('button',name='Limpiar filtros',exact=True).click()
    assert page.locator('#project-sort').input_value()=='name'
    page.select_option('#project-sort','code')
    assert page.get_by_role('button',name='Anterior',exact=True).is_disabled()
    page.get_by_role('button',name='Siguiente',exact=True).click()
    assert page.locator('.project-table tbody tr').count()==7
    assert '26–32 de 32' in page.locator('.pagination').inner_text()
    page.get_by_role('button',name='Abrir proyecto Proyecto de volumen 26',exact=True).click()
    assert page.locator('h1').inner_text()=='Proyecto de volumen 26'
    page.get_by_role('button',name='← Volver a proyectos',exact=True).click()
    assert 'Página 2 de 2' in page.locator('.pagination').inner_text()
    page.locator('#project-query').fill('volumen 3')
    assert page.locator('.project-table tbody tr').count()==4
    assert 'Página 1 de 1' in page.locator('.pagination').inner_text()
    page.locator('#project-status').select_option('Activo')
    assert page.locator('.project-table tbody tr').count()==2
    page.locator('#project-query').fill('sin coincidencias')
    assert page.locator('.project-empty').is_visible()
    assert '0–0 de 0' in page.locator('.pagination').inner_text()
    page.select_option('#role-select','lawyer')
    page.evaluate("go('proyectos')")
    assert page.locator('#project-query').input_value()==''
    assert '27 proyectos encontrados' in page.locator('#project-result-count').inner_text()
    assert 'Cliente reservado' not in page.locator('#project-client').inner_text()
    page.evaluate("openProject('PR-032')")
    assert page.locator('h1').inner_text()=='Contenido no disponible'
    page.evaluate("openProject('PR-001')")
    assert page.locator('.case-item').count()==2
    page.evaluate("delete db.cases[0].grants.lawyer;render()")
    assert page.locator('.case-item').count()==1
    page.select_option('#role-select','client')
    page.evaluate("go('proyectos')")
    assert page.locator('.project-table tbody tr').count()==1
    page.evaluate("openProject('PR-001')")
    assert page.locator('.case-item').count()==1
    # Verify layout at all target widths, including populated second page and detail.
    page.select_option('#role-select','manager')
    for width in [360,768,1440]:
        page.set_viewport_size({'width':width,'height':1000})
        for action in ["go('proyectos')","projectPage(1)","openProject('PR-001')"]:
            page.evaluate(action)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,action)
        page.evaluate("go('proyectos')")
        page.locator('#project-filter-toggle').click()
        page.select_option('#project-client','Cliente visible')
        page.select_option('#project-lawyer','Lucía Torres')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        page.get_by_role('button',name='Limpiar filtros',exact=True).click()
        page.locator('#project-filter-toggle').click()
    assert not errors,errors
    page.reload()
    page.evaluate("go('proyectos')")
    page.screenshot(path=str(root/'mockup/projects-desktop.png'),full_page=True)
    page.set_viewport_size({'width':360,'height':900})
    page.screenshot(path=str(root/'mockup/projects-mobile.png'),full_page=True)
    browser.close()
print('PASS: project search, combined filters, 25-row pagination, detail/back context, role reset, access checks, responsive layout and browser errors.')
