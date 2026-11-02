"""Browser checks of the Unificado v2 mockup, using only fictitious data."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.route("https://fonts.googleapis.com/**", lambda route: route.abort())
    page.route("https://fonts.gstatic.com/**", lambda route: route.abort())
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto((root / "mockup/index.html").as_uri())
    page.wait_for_selector("h1")
    assert page.locator("h1").inner_text() == "Mi trabajo"
    # Every reachable screen for all five profiles, at the required widths.
    for role in ["manager", "superadmin", "lawyer", "assistant", "client"]:
        page.select_option("#role-select", role)
        destinations = page.locator("#navigation button").evaluate_all("els => els.map(e => e.getAttribute('onclick'))")
        for width in [360, 768, 1440]:
            page.set_viewport_size({"width": width, "height": 1000})
            for action in destinations:
                page.evaluate(action)
                assert page.locator("h1").count() == 1, (role, action)
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (role, width, action)
        if role == "client":
            page.evaluate("go('inicio')")
            assert page.locator(".case-item").count() == 1
            assert "Familia Rojas" not in page.locator("#content").inner_text()
            assert "Costos" not in page.locator("#navigation").inner_text()
    # The mobile menu must remain visible and open all modules.
    page.set_viewport_size({"width": 360, "height": 900})
    assert page.locator(".menu-toggle").is_visible()
    page.locator(".menu-toggle").click()
    assert page.locator("#navigation").is_visible()
    page.locator(".menu-toggle").click()
    page.set_viewport_size({"width": 1440, "height": 1000})
    # Project creation must send the following case to that new project.
    page.select_option("#role-select", "manager")
    page.evaluate("newProject()")
    page.locator("dialog input[name=name]").fill("Proyecto de prueba")
    page.locator("dialog select[name=conflict]").select_option(label="Resuelto sin coincidencias")
    page.locator("dialog textarea").fill("Revisión ficticia documentada")
    page.locator("dialog button[type=submit]").click()
    assert page.locator("dialog select[name=project]").input_value() == "PR-003"
    page.locator("dialog input[name=name]").fill("Expediente de prueba")
    page.locator("dialog input[type=checkbox]").check()
    page.locator("dialog button[type=submit]").click()
    assert page.evaluate("db.cases.at(-1).project") == "PR-003"
    # Assistant upload requires a second, explicit confirmation and review.
    page.select_option("#role-select", "assistant")
    page.evaluate("go('documentos');uploadDoc()")
    page.locator("dialog input[type=file]").set_input_files({"name": "anexo-demo.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4 demo"})
    page.locator("dialog input[type=checkbox]").check()
    page.locator("dialog button[type=submit]").click()
    assert "2 / 2" in page.locator("#modal-title").inner_text()
    page.locator("dialog input[type=checkbox]").check()
    page.locator("dialog button[type=submit]").click()
    assert page.evaluate("db.docs.at(-1).reviewed") is False
    assert page.evaluate("db.docs.at(-1).published") == 0
    # Both management profiles see all cases and manage access without grants.
    for management in ["manager", "superadmin"]:
        page.select_option("#role-select", management)
        assert page.evaluate("visible().length === db.cases.length")
        assert page.evaluate("db.cases.every(c => can(c,'access'))")
        page.evaluate("openCase('EXP-2026-076');tab='equipo';render()")
        assert page.get_by_role("button", name="Agregar asistente", exact=True).is_visible()
    # Unassigned lawyers remain blocked from direct access.
    page.select_option("#role-select", "lawyer")
    page.evaluate("openCase('EXP-2026-076')")
    assert page.locator("h1").inner_text() == "Contenido no disponible"
    page.select_option("#role-select", "assistant")
    page.evaluate("openCase('EXP-2026-090')")
    assert page.locator("h1").inner_text() == "Contenido no disponible"
    # A different lawyer verifies an assistant's proposal and records presentation.
    page.select_option("#role-select", "lawyer")
    page.evaluate("go('plazos');verifyDeadline(1)")
    page.locator("dialog input[type=checkbox]").check()
    page.locator("dialog button[type=submit]").click()
    assert page.evaluate("db.deadlines[0].status") == "Activo"
    page.evaluate("presentDeadline(1)")
    page.locator("dialog input[name=ref]").fill("CARGO-DEMO-001")
    page.locator("dialog button[type=submit]").click()
    assert page.evaluate("db.deadlines[0].status") == "Presentado"
    # The author may not verify their own proposal.
    page.evaluate("db.deadlines[0].status='Pendiente de verificación';db.deadlines[0].registrar=me();verifyDeadline(1)")
    assert "propio registro" in page.locator("#toast").inner_text()
    # Exact-version publication; an internal update stays out of the portal.
    page.evaluate("publishDoc(1)")
    page.locator("dialog input[type=checkbox]").check()
    page.locator("dialog button[type=submit]").click()
    page.evaluate("db.docs[0].version=3")
    page.select_option("#role-select", "client")
    assert "Versión publicada 2" in page.locator("#content").inner_text()
    # Independent approval, invoice preparation, external reference, full payment.
    page.select_option("#role-select", "manager")
    page.evaluate("go('finanzas');approveCost(1)")
    assert "propio costo" in page.locator("#toast").inner_text()
    page.select_option("#role-select", "superadmin")
    page.evaluate("go('finanzas');approveCost(1)")
    page.locator("dialog input[type=checkbox]").check()
    page.locator("dialog button[type=submit]").click()
    page.evaluate("newInvoice()")
    page.locator("dialog input[name=cost][value='1']").check()
    page.locator("dialog button[type=submit]").click()
    assert page.evaluate("db.costs[0].billing") == "Reservado"
    page.evaluate("confirmInvoice('BOR-1')")
    page.locator("dialog input[name=ref]").fill("F001-DEMO")
    page.locator("dialog button[type=submit]").click()
    page.evaluate("payment('BOR-1')")
    page.locator("dialog input[name=amount]").fill("1250.00")
    page.locator("dialog input[name=ref]").fill("ABONO-DEMO")
    page.locator("dialog button[type=submit]").click()
    assert page.evaluate("db.invoices[0].paid === db.invoices[0].total")
    # Global access lets superadministration revoke a client grant; history remains.
    page.evaluate("revoke('EXP-2026-089','client')")
    page.locator("dialog textarea[name=reason]").fill("Retiro de acceso de prueba")
    page.locator("dialog button[type=submit]").click()
    page.select_option("#role-select", "client")
    assert page.locator(".case-item").count() == 0
    # Transfer removes the old lawyer's access while preserving document authors.
    page.select_option("#role-select", "manager")
    page.evaluate("openCase('EXP-2026-089');transfer()")
    page.locator("dialog textarea[name=reason]").fill("Transferencia de prueba")
    page.locator("dialog input[type=checkbox]").check()
    page.locator("dialog button[type=submit]").click()
    assert page.evaluate("db.docs[0].author") == "Lucía Torres"
    page.select_option("#role-select", "lawyer")
    page.evaluate("openCase('EXP-2026-089')")
    assert page.locator("h1").inner_text() == "Contenido no disponible"
    assert not errors, errors
    page.reload()
    page.wait_for_selector("h1")
    page.screenshot(path=str(root / "mockup/preview-desktop.png"), full_page=True)
    page.set_viewport_size({"width": 360, "height": 900})
    page.screenshot(path=str(root / "mockup/preview-mobile.png"), full_page=True)
    browser.close()
print("PASS: 5 profiles; navigation at 360/768/1440; global management access; assigned staff access; independent verification; publication; economy; transfer; no browser errors.")
