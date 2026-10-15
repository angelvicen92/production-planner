/** Chromium on the real disposable product stack. No intercepted requests.
 * The accepted A2 snapshot is UI evidence, not a new solver certification. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import type { runA2BrowserJourney } from "./smokeA2Journey";
type Options = Parameters<typeof runA2BrowserJourney>[0] & { baselineUrl?: string };

export async function runCollapsibleSections(options: Options) {
  const { appUrl, baselineUrl, users, db, directory, pass } = options;
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(30_000);
  const report: any = { status: "RUNNING", screenshots: [], checks: [], remoteWrites: 0, snapshotReplay: true };
  const check = (name: string) => { report.checks.push(name); pass(name); };
  const api = async (planId: number, suffix = "", method = "GET", body?: unknown) => {
    const response = await fetch(`${appUrl}/api/plans/${planId}${suffix}`, { method, headers: { Authorization: `Bearer ${users.production.token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(response.status, 200); return await response.json() as any;
  };
  const material = async () => (await db.query(`SELECT table_name, row FROM (
    SELECT 'tasks' table_name,to_jsonb(x) row FROM daily_tasks x
    UNION ALL SELECT 'sessions',to_jsonb(x) FROM assisted_planning_sessions x
    UNION ALL SELECT 'stages',to_jsonb(x) FROM assisted_planning_stages x
    UNION ALL SELECT 'runs',to_jsonb(x) FROM planning_runs x
    UNION ALL SELECT 'locks',to_jsonb(x) FROM locks x
    UNION ALL SELECT 'validations',to_jsonb(x) FROM planning_stage_validations x
    UNION ALL SELECT 'config',to_jsonb(x) FROM plan_config_revisions x
    UNION ALL SELECT 'exceptions',to_jsonb(x) FROM planning_accepted_exceptions x
  ) material ORDER BY table_name,row::text`)).rows;
  const login = async (target: Page, url: string, role = "production") => {
    await target.goto(`${url}/login`);
    await target.getByLabel("Email", { exact: true }).fill(users[role].email);
    await target.getByLabel("Contraseña (opcional para enlace)", { exact: true }).fill(users[role].password);
    await target.getByRole("button", { name: "Entrar con contraseña", exact: true }).click();
    await target.waitForURL("**/dashboard");
  };
  const capture = async (name: string) => {
    await page.getByTestId("day-header").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200); // Let the chevron transition settle for reviewable captures.
    await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true }); report.screenshots.push(`${name}.png`);
  };
  const section = (id: string) => page.getByTestId(`section-${id}`);
  const trigger = (id: string) => section(id).locator("h3 button");
  const expanded = async (id: string, value: boolean) => assert.equal(await trigger(id).getAttribute("aria-expanded"), String(value));
  const setOpen = async (id: string, value: boolean) => { if (await trigger(id).getAttribute("aria-expanded") !== String(value)) await trigger(id).click(); await expanded(id, value); };
  const requests: Array<{ method: string; url: string }> = [];
  const observe = (request: any) => { if (request.url().includes("/api/")) requests.push({ method: request.method(), url: request.url() }); };
  try {
    assert.ok(baselineUrl, "before screenshots require the exact base runtime");
    await login(page, baselineUrl!);
    await page.goto(`${baselineUrl}/plans/27001?tab=planning`); await page.getByTestId("assisted-workspace").waitFor();
    await capture("before-assisted");
    await page.getByRole("tab", { name: "Concursantes", exact: true }).click(); await page.getByLabel("Buscar concursantes", { exact: true }).waitFor(); await capture("before-tasks");
    await login(page, appUrl);
    await page.goto(`${appUrl}/plans/27001?tab=planning`); await page.getByTestId("assisted-workspace").waitFor();
    assert.equal((await api(27001, "/assisted")).draft.tasks.length, 266);
    await expanded("assisted-scope", true);
    for (const id of ["editing", "maintenance", "history"]) await expanded(`assisted-${id}`, false);
    const before = await material();
    page.on("request", observe);
    await trigger("assisted-scope").focus(); await page.keyboard.press("Space"); await expanded("assisted-scope", false);
    await page.keyboard.press("Enter"); await expanded("assisted-scope", true);
    await setOpen("assisted-scope", false);
    await section("assisted-scope").getByRole("button", { name: "Espacios y zonas", exact: true }).click(); await expanded("assisted-scope", false);
    await setOpen("assisted-scope", true); assert.equal(await section("assisted-scope").getByRole("checkbox").count() > 0, true);
    for (const id of ["editing", "maintenance"]) { await setOpen(`assisted-${id}`, true); await setOpen(`assisted-${id}`, false); }
    report.visualToggleRequests = [...requests];
    const collapseRequests = requests.filter(request => !(request.method === "GET" && /^\/api\/plans\/27001(?:\/execution)?$/.test(new URL(request.url).pathname)));
    assert.deepEqual(collapseRequests, [], "visual toggles issue no extra API requests; the existing offline-Realtime fallback polling remains active");
    const timings = page.waitForResponse(r => r.url().endsWith("/history/timings") && r.status() === 200);
    await setOpen("assisted-history", true); await timings;
    await setOpen("assisted-history", false); await setOpen("assisted-history", true);
    assert.equal(requests.filter(r => r.url.endsWith("/history/timings")).length, 1);
    check("keyboard, sibling scope buttons, persistent mounting and lazy cached history");
    await setOpen("assisted-history", false);
    for (const name of ["Generar propuesta", "Validar borrador", "Aceptar etapa"]) assert.equal(await page.getByRole("button", { name, exact: true }).isVisible(), true);
    assert.equal(await page.getByRole("list", { name: "Progreso de etapas" }).isVisible(), true);
    assert.equal(await page.getByRole("button", { name: "Completar automáticamente", exact: true }).isVisible(), true);
    await setOpen("assisted-scope", false); await capture("after-assisted");
    await page.getByRole("tab", { name: "Concursantes", exact: true }).click();
    await page.getByLabel("Nombre del nuevo concursante", { exact: true }).fill("Formulario en curso");
    await setOpen("task-contestants", false); await setOpen("task-contestants", true);
    assert.equal(await page.getByLabel("Nombre del nuevo concursante", { exact: true }).inputValue(), "Formulario en curso");
    await setOpen("task-administration", true);
    assert.equal(await section("task-administration").locator("[data-day-task]").count(), 266);
    await section("task-administration").getByRole("button", { name: "Mostrar solo fijadas", exact: true }).click();
    await setOpen("task-administration", false); await setOpen("task-administration", true);
    assert.equal(await section("task-administration").getByRole("button", { name: "Mostrar todas", exact: true }).isVisible(), true);
    await section("task-administration").getByRole("button", { name: "Mostrar todas", exact: true }).click();
    await setOpen("task-contestants", false); await setOpen("task-administration", false); await capture("after-tasks");
    await page.getByRole("tab", { name: "Planning", exact: true }).click(); await expanded("assisted-scope", false);
    await page.getByRole("tab", { name: "Concursantes", exact: true }).click(); await setOpen("task-contestants", true);
    assert.equal(await page.getByLabel("Nombre del nuevo concursante", { exact: true }).inputValue(), "Formulario en curso");
    await setOpen("task-contestants", false); await page.reload(); await expanded("task-contestants", false);
    await page.getByRole("tab", { name: "Planning", exact: true }).click(); await expanded("assisted-scope", false);
    assert.deepEqual(await material(), before, "visual actions preserve every SQL authority across both days");
    report.authenticationReloadRequests = requests.filter(r => new URL(r.url).pathname === "/api/bootstrap-role").length;
    assert.deepEqual(requests.filter(r => !["GET", "OPTIONS"].includes(r.method) && new URL(r.url).pathname !== "/api/bootstrap-role"), [], "collapse/tab/reload actions never write product data; reload retains the existing auth bootstrap");
    check("266-task table controls, forms across collapse/tabs, reload persistence and literal SQL authorities");

    // Real browser storage events synchronize preferences across open tabs.
    const peer = await context.newPage(); await peer.goto(`${appUrl}/plans/27001?tab=planning`); await peer.getByTestId("assisted-workspace").waitFor();
    await setOpen("assisted-editing", true);
    await peer.getByRole("button", { name: "Herramientas de edición", exact: true }).waitFor();
    await peer.waitForFunction(() => document.querySelector('[data-testid="section-assisted-editing"] button')?.getAttribute("aria-expanded") === "true");
    await peer.close();

    // Give two pending tasks manual timings through the normal daily-task API
    // before Assisted bootstraps. Keep all 266 canonical identities; no solved seed.
    const pendingDay = await api(27002);
    const person = pendingDay.dailyTasks.find((task: any) => task.contestantId != null).contestantId;
    const manualTasks = pendingDay.dailyTasks.filter((task: any) => task.contestantId === person).slice(0, 2);
    const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    for (const [index, task] of manualTasks.entries()) {
      const start = 600 + index * 60;
      const duration = Number(task.durationOverride ?? task.template.defaultDuration);
      const response = await fetch(`${appUrl}/api/daily-tasks/${task.id}`, { method: "PATCH", headers: { Authorization: `Bearer ${users.production.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ plannedStart: clock(start), plannedEnd: clock(start + duration) }) });
      assert.equal(response.status, 200, await response.clone().text());
    }
    report.manualSetup = { planId: 27002, canonicalTasks: 266, manuallyTimedTasks: 2, automaticProposals: 0 };
    // Normal product UI now bootstraps a real S0/config revision for this day.
    await page.goto(`${appUrl}/plans/27002?tab=planning`); await page.getByTestId("assisted-workspace").waitFor();
    await expanded("assisted-scope", true); await expanded("assisted-editing", false);
    const scope = section("assisted-scope");
    await scope.getByRole("checkbox").first().check(); await scope.getByText("Incluir prerrequisitos", { exact: true }).click();
    const selectedCount = await page.getByTestId("assisted-scope-count").innerText();
    await setOpen("assisted-scope", false); await setOpen("assisted-scope", true);
    assert.equal(await page.getByTestId("assisted-scope-count").innerText(), selectedCount);
    assert.equal(await scope.getByRole("checkbox").first().isChecked(), true);
    assert.equal(await page.getByRole("button", { name: "Generar propuesta", exact: true }).isEnabled(), true);
    await setOpen("assisted-maintenance", true);
    const config = page.waitForResponse(r => r.url().endsWith("/config-refresh"));
    await page.getByRole("button", { name: "Actualizar desde configuración general", exact: true }).click(); assert.equal((await config).status(), 200);
    await page.getByTestId("assisted-config-refresh").getByRole("button", { name: "Cerrar", exact: true }).waitFor();
    const configText = await section("assisted-maintenance").innerText();
    await setOpen("assisted-maintenance", false); await setOpen("assisted-maintenance", true);
    assert.equal(await section("assisted-maintenance").innerText(), configText);
    assert.equal(await page.getByTestId("assisted-scope-count").innerText(), selectedCount);
    await setOpen("assisted-editing", true);
    const edit = page.waitForResponse(r => r.url().endsWith("/assisted/draft") && r.request().method() === "PATCH");
    await page.getByRole("button", { name: "Restaurar selección", exact: true }).click();
    const noOp = await edit;
    assert.equal(noOp.status(), 422); // An unchanged pending selection is rejected by the existing no-op guard.
    assert.equal((await noOp.json()).code, "VALIDATION_REQUIRED");
    check("day isolation, external storage synchronization, live scope/edit/config controls");

    // Move an already planned task, preserving duration and all block contracts.
    // Pending tasks cannot acquire their first placement through the manual writer.
    const live = await api(27002), state = await api(27002, "/assisted");
    const blocked = new Set((state.draft.planningBlocks ?? []).flatMap((block: any) => block.memberTaskIds));
    const task = live.dailyTasks.find((t: any) => t.contestantId != null && t.startPlanned && t.endPlanned && !blocked.has(Number(t.id)));
    assert.ok(task);
    const partner = live.dailyTasks.find((t: any) => t.contestantId === task.contestantId && Number(t.id) !== Number(task.id) && t.startPlanned && t.endPlanned);
    assert.ok(partner);
    const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    const end = minutes(partner.startPlanned) + minutes(task.endPlanned) - minutes(task.startPlanned);
    const endPlanned = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
    await api(27002, "/assisted/draft", "PATCH", { expectedDraftFingerprint: state.draftFingerprint, expectedBaseStageId: Number(state.draftBaseStageId), changes: [{ taskId: Number(task.id), startPlanned: partner.startPlanned.slice(0, 5), endPlanned }] });
    await page.goto(`${appUrl}/plans/27002?tab=planning`); await page.getByTestId("assisted-workspace").waitFor();
    const validated = page.waitForResponse(r => r.url().endsWith("/assisted/validate"));
    await page.getByRole("button", { name: "Validar borrador", exact: true }).click();
    const validationResponse = await validated;
    const validationBody = await validationResponse.json();
    report.manualValidation = { status: validationResponse.status(), code: validationBody.code ?? null };
    if (validationResponse.status() === 200) {
      await page.getByTestId("stage-validation-report").waitFor();
      assert.ok(Number((await api(27002, "/assisted")).validation.hardCount) > 0);
    } else {
      assert.equal(validationResponse.status(), 422);
      assert.equal(validationBody.code, "ASSISTED_DELTA_VALIDATION_UNSUPPORTED");
      await page.getByText("El borrador debe validarse de nuevo antes de continuar.", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Aceptar etapa", exact: true }).isDisabled(), true);
    }
    for (const id of ["scope", "editing", "maintenance", "history"]) await setOpen(`assisted-${id}`, false);
    if (validationResponse.status() === 200) assert.equal(await page.getByTestId("stage-validation-report").isVisible(), true);
    else assert.equal(await page.getByText("El borrador debe validarse de nuevo antes de continuar.", { exact: true }).isVisible(), true);
    for (const id of ["local-draft-warnings", "assisted-scope-count"]) assert.equal(await page.getByTestId(id).isVisible(), true);
    for (const name of ["Validar borrador", "Aceptar etapa"]) assert.equal(await page.getByRole("button", { name, exact: true }).isVisible(), true);
    await capture("after-critical-validation");
    check("real guarded Draft conflict, validation outcome and primary actions stay visible with every section closed");
    // An independent technical-task day exercises the real cross-section entry
    // without changing the 266-obligation identity of either A2 fixture.
    const create = async (path: string, body: unknown) => {
      const response = await fetch(`${appUrl}${path}`, { method: "POST", headers: { Authorization: `Bearer ${users.production.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      assert.equal(response.status, 201, await response.clone().text()); return await response.json() as any;
    };
    const technicalDay = await create("/api/plans", { date: "2026-11-02", configuration: { workday: { intent: "INHERIT" }, meal: { intent: "INHERIT" } } });
    const technicalTask = await create("/api/daily-tasks", { planId: Number(technicalDay.id), templateId: Number(task.templateId), contestantId: null });
    await page.goto(`${appUrl}/plans/${technicalDay.id}?tab=tasks`); await expanded("task-administration", false);
    await page.getByRole("region", { name: "Tareas sin concursante", exact: true }).getByRole("button", { name: "Revisar tarea", exact: true }).first().click();
    await expanded("task-administration", true);
    assert.equal(await section("task-administration").locator(`[data-day-task="${technicalTask.id}"]`).isVisible(), true);
    check("native technical-task creation and automatic administrative table expansion from another section");
    const preferences = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("optiplan:day-section:v1:"))));
    const other = await browser.newContext();
    await other.addInitScript(values => { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value); }, preferences);
    const otherPage = await other.newPage();
    await login(otherPage, appUrl, "viewer"); await otherPage.goto(`${appUrl}/plans/27001?tab=planning`); await otherPage.getByTestId("assisted-workspace").waitFor();
    assert.equal(await otherPage.getByRole("button", { name: "Herramientas de edición", exact: true }).getAttribute("aria-expanded"), "false");
    assert.equal(await otherPage.getByRole("button", { name: "Aceptar etapa", exact: true }).isDisabled(), true);
    await other.close();
    check("user isolation and viewer permission boundary");
    report.status = "PASS"; return report;
  } catch (error) {
    report.status = "FAIL";
    report.error = String(error);
    await page.screenshot({ path: `${directory}/failure.png`, timeout: 5_000 }).catch(() => {});
    throw error;
  } finally {
    page.off("request", observe); await browser.close();
    writeFileSync(`${directory}/collapsible-sections.json`, JSON.stringify(report, null, 2));
  }
}
