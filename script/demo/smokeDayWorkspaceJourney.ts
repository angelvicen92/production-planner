/** Real Chromium against the disposable product server after S0 → S11.
 * UI operations use existing HTTP writers. No intercepted requests or solved seed.
 */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import type { Page } from "playwright";
import type { runA2BrowserJourney } from "./smokeA2Journey";
type Options = Parameters<typeof runA2BrowserJourney>[0];
const views = ["contestants", "spaces", "resources"] as const;
const labels = { contestants: "Concursantes", spaces: "Platós y espacios", resources: "Recursos" };

export async function runDayWorkspaceJourney(options: Options, page: Page) {
  const { appUrl, planId, db, directory, pass, users } = options;
  const api = async (suffix: string, method = "GET", body?: unknown) => {
    const response = await fetch(`${appUrl}/api/plans/${planId}${suffix}`, { method, headers: { Authorization: `Bearer ${users.production.token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() as any };
  };
  const material = async () => Promise.all(["daily_tasks", "locks", "assisted_planning_sessions", "assisted_planning_stages", "planning_stage_validations", "planning_runs", "plan_config_revisions", "planning_accepted_exceptions"].map(async table => (await db.query(`SELECT to_jsonb(x) AS row FROM public.${table} x WHERE plan_id=$1 ORDER BY id`, [planId])).rows));
  const before = await material(); const initial = (await api("/assisted")).data;
  assert.equal(initial.draft.tasks.length, 266); assert.equal(initial.activeStage.ordinal, 11);
  const requests: Array<{ method: string; url: string }> = [];
  const observer = (request: any) => { if (request.url().includes("/api/")) requests.push({ method: request.method(), url: request.url() }); };
  page.on("request", observer);
  const report: any = { status: "RUNNING", remoteWrites: 0, baselineFingerprint: initial.draftFingerprint, combinations: [], screenshots: [], operations: [] };
  const capture = async (name: string, fullPage = false) => { await page.screenshot({ path: `${directory}/${name}.png`, fullPage }); report.screenshots.push(`${name}.png`); };
  const panel = (view: typeof views[number]) => page.getByTestId(`planning-panel-${view}`);
  const setViews = async (wanted: readonly typeof views[number][]) => {
    // Add before removing so the final-pane protection is exercised honestly.
    for (const view of wanted) { const button = page.getByRole("button", { name: `Mostrar ${labels[view]}`, exact: true }); if (await button.getAttribute("aria-pressed") !== "true") await button.click(); }
    for (const view of views.filter(view => !wanted.includes(view))) { const button = page.getByRole("button", { name: `Mostrar ${labels[view]}`, exact: true }); if (await button.getAttribute("aria-pressed") === "true") await button.click(); }
    for (const view of views) assert.equal(await panel(view).isVisible(), wanted.includes(view));
  };
  try {
    await page.goto(`${appUrl}/plans/${planId}?tab=planning`); await page.getByTestId("assisted-workspace").waitFor();
    await page.getByTestId("day-header").screenshot({ path: `${directory}/workspace-header-desktop.png` }); report.screenshots.push("workspace-header-desktop.png");
    assert.equal(await page.getByRole("tab").count(), 6);
    assert.equal(await page.getByRole("button", { name: "Generar V3", exact: true }).isVisible(), false);
    for (const wanted of [["contestants"], ["spaces"], ["resources"], ["contestants", "spaces"], ["contestants", "resources"], ["spaces", "resources"], views] as const) {
      const start = performance.now(); await setViews(wanted);
      for (const view of wanted) {
        const ids = await panel(view).locator("[data-planning-task-id]").evaluateAll(elements => [...new Set(elements.map(element => Number(element.getAttribute("data-planning-task-id"))))]);
        if (view !== "resources") assert.equal(ids.length, 266, `${view}: all canonical obligations`);
        else assert.ok(ids.length > 0, "resource agenda uses effective nominal assignments");
      }
      report.combinations.push({ views: wanted, renderAndInteractionMs: Math.round(performance.now() - start) });
      await page.getByTestId("planning-multiview").scrollIntoViewIfNeeded(); await capture(`workspace-${wanted.join("-")}`, true);
    }
    for (const layout of ["horizontal", "vertical", "rejilla"]) { await page.getByRole("button", { name: `Distribución ${layout}`, exact: true }).click(); assert.equal(await page.getByTestId("planning-multiview").locator("[data-layout]").getAttribute("data-layout"), layout === "rejilla" ? "grid" : layout); }
    const contestants = panel("contestants");
    for (const order of ["arrival", "first", "last", "task", "name"]) { await contestants.getByLabel("Ordenar concursantes", { exact: true }).selectOption(order); if (order === "task") { const select = contestants.getByLabel("Tipo de tarea para ordenar"); const value = await select.locator("option").nth(1).getAttribute("value"); await select.selectOption(value!); } }
    await contestants.getByRole("button", { name: "Ampliar zoom", exact: true }).click(); await contestants.getByRole("button", { name: "Maximizar", exact: true }).click();
    await capture("workspace-fullscreen"); await page.keyboard.press("Escape"); assert.equal(await contestants.getByRole("button", { name: "Maximizar", exact: true }).isVisible(), true);
    // Draft selection and panel state survive switching tabs without remounting.
    await page.getByRole("tab", { name: "Concursantes", exact: true }).click(); await page.getByLabel("Buscar concursantes", { exact: true }).fill("C01"); await capture("workspace-contestants-desktop");
    for (const [tab, testId, screenshot] of [["Recursos", "day-resources", "workspace-resources-desktop"], ["Roles", "day-staff", "workspace-roles-desktop"], ["Ejecución", "day-execution", "workspace-execution-desktop"]] as const) {
      await page.getByRole("tab", { name: tab, exact: true }).click(); await page.getByTestId(testId).waitFor(); await capture(screenshot);
    }
    await page.getByLabel("Buscar tareas de ejecución", { exact: true }).fill("C01"); assert.ok((await page.getByTestId("day-execution").locator("tbody tr").count()) < 266); await page.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
    await page.getByRole("tab", { name: "Configuración", exact: true }).click(); await page.getByTestId("day-editor-WORKDAY_WINDOW").waitFor(); await capture("workspace-configuration-desktop");
    await page.getByRole("tab", { name: "Planning", exact: true }).click(); assert.match(page.url(), /tab=planning/); assert.equal(await contestants.getByRole("button", { name: "110%", exact: true }).isVisible(), true);
    await page.getByRole("button", { name: "Etapa aceptada · consulta", exact: true }).click(); await page.getByText("Sólo consulta · sin arrastre de tareas", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Edición del borrador", exact: true }).click();
    await setViews(["contestants"]); await page.getByRole("button", { name: "Mostrar Concursantes", exact: true }).click(); assert.equal(await contestants.isVisible(), true, "last pane cannot disappear");
    const timings = page.waitForResponse(response => response.url().endsWith("/assisted/history/timings")); await page.getByText("Historial", { exact: true }).click(); assert.equal((await timings).status(), 200);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [tab, name] of [["Concursantes", "workspace-contestants-mobile"], ["Configuración", "workspace-configuration-mobile"], ["Recursos", "workspace-resources-mobile"], ["Roles", "workspace-roles-mobile"], ["Ejecución", "workspace-execution-mobile"], ["Planning", "workspace-planning-mobile"]] as const) { await page.getByRole("tab", { name: tab, exact: true }).click(); await capture(name); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${tab}: no viewport overflow`); }
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.deepEqual(requests.filter(request => !["GET", "OPTIONS"].includes(request.method)), [], "visual actions never write");
    assert.deepEqual(await material(), before, "visual actions preserve all product authorities");
    assert.deepEqual((await api("/assisted")).data, initial);
    pass("day workspace: six URL tabs, seven multiview combinations, independent controls, shared accepted/Draft authority, fullscreen/Esc, mobile, lazy history and zero writes");
    report.operations.push("Visual actions preserve all 266 tasks, Stage and Draft fingerprints");
    // Real schema-drift failure, confined to this disposable database and restored.
    await db.query("ALTER TABLE public.program_settings RENAME COLUMN main_before_meal_blocks TO day_workspace_missing_column");
    try {
      await page.goto(`${appUrl}/plans/${planId}?tab=configuration`); await page.getByText("No se pudo consultar la configuración del día", { exact: true }).waitFor(); await capture("workspace-configuration-real-http-error");
      assert.equal((await api("/effective-configuration")).status, 500);
    } finally { await db.query("ALTER TABLE public.program_settings RENAME COLUMN day_workspace_missing_column TO main_before_meal_blocks"); }
    await page.getByRole("button", { name: "Reintentar configuración", exact: true }).click(); await page.getByTestId("day-editor-WORKDAY_WINDOW").waitFor();
    report.operations.push("Real HTTP 500 from schema drift is explained; retry recovers after authority restoration");
    // Versioned day writer: edit, reload and restore, no changes to other days.
    const current = (await api("/effective-configuration")).data; const workday = current.values.find((value: any) => value.capabilityId === "WORKDAY_WINDOW");
    const original = workday.value; const start = original.start === "09:00" ? "08:55" : "08:50";
    await page.getByLabel("Inicio de jornada", { exact: true }).fill(start);
    const saved = page.waitForResponse(response => response.url().endsWith(`/plans/${planId}/day-configuration`) && response.request().method() === "PUT"); await page.getByRole("button", { name: "Guardar horario", exact: true }).click(); assert.equal((await saved).status(), 200);
    await page.reload(); await page.getByTestId("day-editor-WORKDAY_WINDOW").waitFor(); assert.equal(await page.getByLabel("Inicio de jornada", { exact: true }).inputValue(), start);
    const restored = await api("/day-configuration/restore", "POST", { capability: "WORKDAY_WINDOW" }); assert.equal(restored.status, 200);
    const finalConfig = (await api("/effective-configuration")).data; assert.deepEqual(finalConfig.values.find((value: any) => value.capabilityId === "WORKDAY_WINDOW").value, workday.baseline);
    assert.equal((await api("/assisted")).data.activeStage.snapshotFingerprint, initial.activeStage.snapshotFingerprint);
    report.operations.push("Workday UI save/reload + versioned inherited restore; accepted Stage unchanged");
    report.status = "PASS"; pass("day workspace: real effective-configuration failure/retry and UI versioned workday save/reload/restore");
    return report;
  } catch (error) { report.status = "FAIL"; report.error = error instanceof Error ? error.stack : String(error); await capture("workspace-failure").catch(() => {}); throw error; }
  finally { page.off("request", observer); writeFileSync(`${directory}/day-workspace.json`, JSON.stringify(report, null, 2)); }
}
