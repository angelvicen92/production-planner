/** UI-03B: independent Chromium journey on the existing disposable A2 fixture.
 * Uses real product HTTP, SQL and Auth; never intercepts requests or invokes a solver. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chromium, type Page, type Request } from "playwright";
import type { runA2BrowserJourney } from "./smokeA2Journey";
type Options = Parameters<typeof runA2BrowserJourney>[0] & { baselineUrl?: string };
const tabs = ["resources", "configuration", "staff", "execution"] as const;
const labels = { resources: "Recursos", configuration: "Configuración", staff: "Roles", execution: "Ejecución" };
const configSections = ["workday", "flow", "rules", "optimization", "complementary", "capabilities"].map(id => `configuration-${id}`);

export async function runRemainingDaySections({ appUrl, baselineUrl, users, db, directory, pass }: Options) {
  assert.ok(baselineUrl, "before captures require the authorized base runtime");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(30_000); page.setDefaultNavigationTimeout(120_000);
  const report: any = { status: "RUNNING", checks: [], screenshots: [], remoteWrites: 0, canonicalTasks: 266, solverRun: false };
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const check = (name: string) => { report.checks.push(name); pass(name); };
  const api = async (path: string, method = "GET", body?: unknown, role = "production") => {
    const response = await fetch(`${appUrl}/api${path}`, { method, headers: { Authorization: `Bearer ${users[role].token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.ok(response.ok, `${method} ${path}: ${response.status} ${response.ok ? "" : await response.text()}`);
    return await response.json() as any;
  };
  const material = async () => {
    const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const result: Record<string, unknown> = {};
    for (const { tablename } of tables) result[tablename] = (await db.query(`SELECT to_jsonb(x) row FROM public."${tablename}" x ORDER BY to_jsonb(x)::text`)).rows;
    return result;
  };
  const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const login = async (target: Page, url: string, role = "production") => {
    await target.goto(`${url}/login`);
    await target.getByLabel("Email", { exact: true }).fill(users[role].email);
    await target.getByLabel("Contraseña (opcional para enlace)", { exact: true }).fill(users[role].password);
    await target.getByRole("button", { name: "Entrar con contraseña", exact: true }).click(); await target.waitForURL("**/dashboard");
  };
  const tab = async (id: typeof tabs[number], target = page) => {
    await target.getByRole("tab", { name: labels[id], exact: true }).click();
    await target.getByRole("heading", { name: { resources: "Recursos del día", configuration: "Configuración del día", staff: "Responsables de la jornada", execution: "Ejecución del día" }[id], exact: true }).waitFor();
  };
  const section = (id: string, target = page) => target.getByTestId(`section-${id}`);
  const trigger = (id: string, target = page) => section(id, target).locator(":scope > div > h3 > button");
  const expanded = async (id: string, open: boolean, target = page) => assert.equal(await trigger(id, target).getAttribute("aria-expanded"), String(open), id);
  const setOpen = async (id: string, open: boolean, target = page) => { if (await trigger(id, target).getAttribute("aria-expanded") !== String(open)) await trigger(id, target).click(); await expanded(id, open, target); };
  const capture = async (name: string) => {
    await page.getByTestId("day-header").scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true }); report.screenshots.push(`${name}.png`);
  };
  const requests: Array<{ method: string; path: string }> = [];
  const observe = (request: Request) => { const url = new URL(request.url()); if (url.pathname.startsWith("/api/")) requests.push({ method: request.method(), path: url.pathname }); };
  try {
    // Setup only disposable operational data through the existing public writers.
    const added = await api("/plans/27001/resource-items", "POST", { typeId: (await api("/plans/27001/resource-items"))[0].typeId, name: "UI03B recurso temporal" });
    await api("/staff-people", "POST", { name: "UI03B responsable", roleType: "production", isActive: true }, "admin");
    const team = await api("/itinerant-teams", "POST", { code: "UI03B", name: "UI03B equipo Reality", orderIndex: 900 }, "admin");
    report.setup = { additionalResource: added.id, staffPerson: "UI03B responsable", realityTeamId: team.id, target: "disposable localhost only" };
    await login(page, baselineUrl!); await page.goto(`${baselineUrl}/plans/27001?tab=resources`);
    for (const id of tabs) { await tab(id); await capture(`before-${id}`); }
    await login(page, appUrl); await page.goto(`${appUrl}/plans/27001?tab=resources`);
    // Warm every tab before comparing SQL: configuration may bootstrap its existing revision.
    for (const id of tabs) await tab(id);
    assert.equal((await api("/plans/27001")).dailyTasks.length, 266);
    await page.getByTestId("day-execution-task-" + (await api("/plans/27001")).dailyTasks[0].id).waitFor();
    const before = await material(); page.on("request", observe);
    await tab("resources"); await expanded("resources-add", false); await setOpen("resources-add", true);
    const name = page.getByLabel("Nombre del recurso del día", { exact: true }); await name.fill("Borrador sin guardar");
    const type = page.getByLabel("Tipo de recurso del día", { exact: true }); await type.click(); await page.getByRole("option").first().click(); const selectedType = await type.innerText();
    await trigger("resources-add").focus(); await page.keyboard.press("Space"); await expanded("resources-add", false);
    const contentId = await trigger("resources-add").getAttribute("aria-controls"); assert.ok(contentId);
    assert.equal(await page.locator(`[id="${contentId}"]`).isVisible(), false);
    await page.keyboard.press("Tab"); assert.equal(await name.evaluate(el => el === document.activeElement), false, "hidden form excluded from keyboard order");
    await trigger("resources-add").focus(); await page.keyboard.press("Enter"); await expanded("resources-add", true);
    assert.equal(await name.inputValue(), "Borrador sin guardar"); assert.equal(await type.innerText(), selectedType);
    const zoneId = (await page.locator('[data-testid^="section-resources-zone-"]').first().getAttribute("data-testid"))!.replace("section-", "");
    const typeId = (await page.locator('[data-testid^="section-resources-type-"]').first().getAttribute("data-testid"))!.replace("section-", "");
    const rename = page.locator('[data-testid^="section-resources-type-"] input:not([type="checkbox"])').first();
    await rename.fill("Nombre pendiente");
    const renameSection = (await rename.locator('xpath=ancestor::*[starts-with(@data-testid,"section-resources-type-")]').getAttribute("data-testid"))!.replace("section-", "");
    await setOpen(renameSection, false); await setOpen(renameSection, true); assert.equal(await rename.inputValue(), "Nombre pendiente");
    // Focus a visual trigger so this independent visual phase never commits the blur writer.
    await trigger(renameSection).focus();
    await setOpen(zoneId, false);
    await section(zoneId).getByRole("button", { name: "Recursos", exact: true }).click(); await page.getByRole("dialog").waitFor();
    assert.ok(await page.getByRole("dialog").getByRole("checkbox").count()); await page.keyboard.press("Escape"); await expanded(zoneId, false);
    await setOpen(zoneId, true); await setOpen(zoneId, false); await setOpen(typeId, false);
    await setOpen("resources-add", false); await capture("after-resources");
    await tab("configuration");
    const start = page.getByLabel("Inicio de jornada", { exact: true }); await start.fill("08:45");
    const mode = page.getByLabel("Modo de bloques", { exact: true }); await mode.selectOption("SOFT");
    const margin = page.getByLabel("Margen del participante para este día", { exact: true }); await margin.fill("17");
    for (const id of configSections) { await setOpen(id, true); await setOpen(id, false); }
    assert.equal(await page.getByText(/Cada cambio crea una revisión/).isVisible(), true);
    assert.equal(await page.getByText(/Configuración disponible para revisión|La configuración necesita atención/, { exact: true }).isVisible(), true);
    assert.equal(await page.getByText(/^Revisión \d+/).first().isVisible(), true);
    await page.evaluate(() => { location.hash = "config-WORKDAY_WINDOW"; });
    await page.waitForFunction(() => document.querySelector('[data-testid="section-configuration-workday"] button')?.getAttribute("aria-expanded") === "true");
    await setOpen("configuration-workday", false);
    await page.waitForTimeout(100); await expanded("configuration-workday", false);
    await page.evaluate(() => history.replaceState(null, "", location.pathname + location.search));
    const readinessLink = page.locator('a[href^="#config-"]').first();
    const readinessAnchor = (await readinessLink.getAttribute("href"))!.slice(1);
    await readinessLink.click();
    const readinessOwner = (await page.locator(`[id="${readinessAnchor}"]`).evaluate(el => el.closest("[data-testid]")!.getAttribute("data-testid")))!.replace("section-", "");
    await expanded(readinessOwner, true); await setOpen(readinessOwner, false);
    await readinessLink.click(); await expanded(readinessOwner, true);
    await setOpen(readinessOwner, false);
    await page.evaluate(() => history.replaceState(null, "", location.pathname + location.search));
    await capture("after-configuration");
    await tab("staff");
    const staffZone = (await page.locator('[data-testid^="section-staff-zone-"]').filter({ hasText: /· [1-9]\d* espacios/ }).first().getAttribute("data-testid"))!.replace("section-", "");
    const staffSelector = section(staffZone).getByRole("combobox"); const previousMode = await staffSelector.innerText();
    await staffSelector.click(); await page.getByRole("option", { name: previousMode === "Plató" ? "Espacios" : "Plató", exact: true }).click(); const changedMode = await staffSelector.innerText();
    const picker = section(staffZone).getByRole("button", { name: "Editar", exact: true }).first(); await picker.click();
    await page.getByRole("dialog").getByLabel("UI03B responsable", { exact: true }).check(); await page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();
    await setOpen(staffZone, false); await setOpen(staffZone, true); assert.equal(await staffSelector.innerText(), changedMode);
    assert.equal(await section(staffZone).getByText("UI03B responsable", { exact: true }).isVisible(), true);
    await setOpen(staffZone, false); await setOpen("staff-zones", false);
    const realitySection = `staff-team-${team.id}`;
    await section(realitySection).getByRole("button", { name: "Editar", exact: true }).first().click();
    await page.getByRole("dialog").getByLabel("UI03B responsable", { exact: true }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();
    const teams = await page.locator('[data-testid^="section-staff-team-"]').all(); assert.ok(teams.length > 0);
    for (const team of teams) { const id = (await team.getAttribute("data-testid"))!.replace("section-", ""); await setOpen(id, false); await setOpen(id, true); }
    await setOpen("staff-reality", false); await setOpen("staff-reality", true);
    assert.equal(await section(realitySection).getByText("UI03B responsable", { exact: true }).isVisible(), true);
    await setOpen("staff-reality", false);
    assert.equal(await page.getByRole("button", { name: "Guardar", exact: true }).isEnabled(), true);
    assert.equal(await page.getByText("Los cambios locales requieren Guardar.", { exact: true }).isVisible(), true);
    await capture("after-staff");
    await tab("execution"); await expanded("execution-tasks", true); await expanded("execution-filters", false);
    assert.equal(await section("execution-tasks").locator("tbody tr").count(), 266);
    await setOpen("execution-filters", true); const filter = page.getByLabel("Filtrar ejecución por concursante", { exact: true });
    const option = await filter.locator("option").nth(1).getAttribute("value"); await filter.selectOption(option!);
    const filtered = await section("execution-tasks").locator("tbody tr").count(); assert.ok(filtered > 0 && filtered < 266);
    await setOpen("execution-filters", false); await setOpen("execution-tasks", false);
    assert.equal(await page.getByText(/\d+ de 266 tareas/).isVisible(), true);
    assert.equal(await page.getByRole("button", { name: /^Completada/ }).isVisible(), true);
    assert.equal(await page.getByText(/Las acciones disponibles corresponden/).isVisible(), true);
    await capture("after-execution");
    await context.setOffline(true); await page.getByText(/Sin conexión. Los registros se conservan/).waitFor();
    await capture("after-execution-offline"); await context.setOffline(false);
    await tab("resources"); await setOpen("resources-add", true); assert.equal(await name.inputValue(), "Borrador sin guardar"); await setOpen("resources-add", false);
    await tab("configuration"); await setOpen("configuration-workday", true); assert.equal(await start.inputValue(), "08:45");
    await setOpen("configuration-flow", true); assert.equal(await mode.inputValue(), "SOFT"); await setOpen("configuration-flow", false);
    await setOpen("configuration-rules", true); assert.equal(await margin.inputValue(), "17"); await setOpen("configuration-rules", false); await setOpen("configuration-workday", false);
    await tab("staff"); await setOpen("staff-zones", true); await setOpen(staffZone, true); assert.equal(await staffSelector.innerText(), changedMode); assert.equal(await section(staffZone).getByText("UI03B responsable", { exact: true }).isVisible(), true); await setOpen("staff-zones", false);
    await tab("execution"); await setOpen("execution-filters", true); assert.equal(await filter.inputValue(), option); await setOpen("execution-filters", false);
    await page.reload(); await expanded("execution-tasks", false); await expanded("execution-filters", false);
    await tab("resources"); await expanded("resources-add", false); await expanded(zoneId, false); await expanded(typeId, false);
    await tab("configuration"); for (const id of configSections) await expanded(id, false);
    await tab("staff"); await expanded("staff-zones", false); await expanded("staff-reality", false);
    const after = await material(); assert.deepEqual(after, before, "all public SQL tables remain literal across visual actions, tabs and reload");
    report.visualAuthorities = { before: digest(before), after: digest(after), tables: Object.keys(before), identical: true };
    report.visualRequests = [...requests];
    assert.deepEqual(requests.filter(r => !["GET", "OPTIONS"].includes(r.method) && r.path !== "/api/bootstrap-role"), [], "visual operations cannot invoke operational writers");
    check("keyboard/ARIA, selectors, pending resource/config/staff drafts, filters, reload, no operational HTTP writes and all SQL authorities identical");
    // Mobile and day/user isolation use actual browser preferences.
    await page.setViewportSize({ width: 390, height: 844 });
    for (const id of tabs) { await tab(id); await capture(`after-mobile-${id}`); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${id}: no document horizontal scroll when collapsed`); }
    await section("execution-tasks").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/after-mobile-execution-sections.png` }); report.screenshots.push("after-mobile-execution-sections.png");
    await page.goto(`${appUrl}/plans/27002?tab=execution`); await expanded("execution-tasks", true); await expanded("execution-filters", false);
    const preferences = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("optiplan:day-section:v1:"))));
    const viewerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await viewerContext.addInitScript(values => { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value); }, preferences);
    const viewer = await viewerContext.newPage();
    await login(viewer, appUrl, "viewer"); await viewer.goto(`${appUrl}/plans/27001?tab=resources`);
    await setOpen("resources-add", true, viewer); assert.equal(await viewer.getByLabel("Nombre del recurso del día", { exact: true }).isDisabled(), true);
    await tab("configuration", viewer); await setOpen("configuration-workday", true, viewer); assert.equal(await viewer.getByLabel("Inicio de jornada", { exact: true }).isDisabled(), true);
    for (const id of configSections) await setOpen(id, false, viewer);
    assert.equal(await viewer.getByText(/Tu perfil permite consultar. La edición corresponde/).isVisible(), true);
    await tab("staff", viewer); assert.equal(await viewer.getByRole("button", { name: "Guardar", exact: true }).isDisabled(), true);
    await tab("execution", viewer); await expanded("execution-tasks", true, viewer);
    assert.equal(await viewer.getByText("Tu perfil permite consultar la ejecución.", { exact: true }).isVisible(), true);
    assert.equal(await viewer.getByRole("button", { name: /^(Iniciar|Finalizar|Interrumpir|Resetear)$/ }).count(), 0);
    await viewerContext.close();
    const adminContext = await browser.newContext(); const admin = await adminContext.newPage();
    await login(admin, appUrl, "admin"); await admin.goto(`${appUrl}/plans/27001?tab=configuration`);
    await admin.getByLabel("Inicio de jornada", { exact: true }).waitFor(); assert.equal(await admin.getByLabel("Inicio de jornada", { exact: true }).isEnabled(), true);
    await tab("staff", admin); await admin.getByRole("button", { name: "Guardar", exact: true }).waitFor();
    await admin.waitForFunction(() => ![...document.querySelectorAll('button')].find(el => el.textContent?.trim() === 'Guardar')?.disabled);
    await adminContext.close(); check("mobile four tabs, day/user isolation with copied localStorage and admin/production/viewer permissions");
    report.visualRequests = [...requests];
    assert.deepEqual(requests.filter(r => !["GET", "OPTIONS"].includes(r.method) && r.path !== "/api/bootstrap-role"), []);
    page.off("request", observe);
    // Explicit configuration operations remain real, independently from the visual no-write phase.
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(`${appUrl}/plans/27002?tab=configuration`);
    await page.getByLabel("Margen del participante para este día", { exact: true }).fill("7");
    const edit = page.waitForResponse(r => r.url().endsWith("/day-configuration") && r.request().method() === "PUT");
    await page.getByRole("button", { name: "Guardar margen", exact: true }).click(); assert.equal((await edit).status(), 200);
    for (const id of configSections) await setOpen(id, false);
    assert.equal(await page.getByText(/Configuración guardada. Este cambio requiere volver a validar/).isVisible(), true);
    await setOpen("configuration-rules", true); page.once("dialog", dialog => void dialog.accept());
    const restore = page.waitForResponse(r => r.url().endsWith("/day-configuration/restore"));
    await section("configuration-rules").getByRole("button", { name: "Restaurar heredado", exact: true }).click(); assert.equal((await restore).status(), 200);
    page.once("dialog", dialog => void dialog.accept());
    const refresh = page.waitForResponse(r => r.url().endsWith("/day-configuration/refresh"));
    await section("configuration-rules").getByRole("button", { name: "Actualizar herencia desde configuración general", exact: true }).click(); const refreshResponse = await refresh;
    report.explicitConfiguration = { edit: 200, restore: 200, refresh: refreshResponse.status() };
    assert.equal(refreshResponse.status(), 200);
    // Force a genuine transport failure (no interception), then collapse the editor.
    await page.getByLabel("Margen del participante para este día", { exact: true }).fill("8");
    // CDP disconnects only the save endpoint, without changing navigator.onLine
    // or intercepting responses. Reads remain real and healthy; Query attempts the write.
    const network = await context.newCDPSession(page); await network.send("Network.enable");
    await network.send("Network.emulateNetworkConditionsByRule", { offline: true, matchedNetworkConditions: [{ urlPattern: `${appUrl}/api/plans/27002/day-configuration`, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }] });
    assert.equal(await page.evaluate(() => navigator.onLine), true);
    await page.getByRole("button", { name: "Guardar margen", exact: true }).click(); await page.getByText(/No se pudo guardar\./).waitFor();
    await setOpen("configuration-rules", false); assert.equal(await page.getByText(/No se pudo guardar\./).isVisible(), true); await capture("after-configuration-save-error");
    await network.send("Network.emulateNetworkConditionsByRule", { offline: false, matchedNetworkConditions: [] }); await network.detach();
    check("explicit EDIT/RESTORE/REFRESH and revalidation/save errors remain visible outside collapsed editors");
    assert.deepEqual(errors, []); report.status = "PASS"; return report;
  } catch (error) {
    report.status = "FAIL"; report.error = error instanceof Error ? error.stack : String(error);
    await page.screenshot({ path: `${directory}/failure.png`, fullPage: true }).catch(() => {}); throw error;
  } finally { report.pageErrors = errors; writeFileSync(`${directory}/remaining-day-sections.json`, JSON.stringify(report, null, 2)); await browser.close(); }
}
