/** UI-04 gate on the real disposable A2 product stack; no routed responses or SQL writes. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import http from "node:http";
import { resolve } from "node:path";
import type { Page } from "playwright";
import { buildAssistedHistory } from "../../shared/assistedHistory";
import { historyDuration } from "../../client/src/components/planning/stage-history-timing";

export async function runAssistedActiveHistory(options: any, page: Page) {
  const { appUrl, url, anon, users, db, planId, directory, pass } = options;
  const path = `/api/plans/${planId}/assisted`;
  const report: any = { status: "RUNNING", remoteWrites: 0, scenarios: [], screenshots: [], visualWrites: [] };
  const api = async (suffix = "") => {
    const response = await fetch(`${appUrl}${path}${suffix}`, { headers: { Authorization: `Bearer ${users.production.token}` } });
    assert.equal(response.status, 200); return response.json() as Promise<any>;
  };
  const material = async () => {
    const result: any = {};
    for (const table of ["daily_tasks", "assisted_planning_sessions", "assisted_planning_stages", "planning_stage_validations", "planning_runs", "plan_config_revisions", "planning_accepted_exceptions", "locks"]) {
      result[table] = (await db.query(`SELECT to_jsonb(t) AS row, xmin::text AS version FROM public.${table} t WHERE plan_id=$1 ORDER BY id`, [planId])).rows;
    }
    return JSON.stringify(result);
  };
  const persistedStages = async () => (await db.query("SELECT id,parent_stage_id,snapshot_fingerprint,snapshot_json,proposal_run_id,accepted_at FROM assisted_planning_stages WHERE plan_id=$1 ORDER BY id", [planId])).rows;
  const taskIds = async () => (await db.query("SELECT id FROM daily_tasks WHERE plan_id=$1 ORDER BY id", [planId])).rows.map((r: any) => Number(r.id));
  const initialTasks = await taskIds(); assert.equal(initialTasks.length, 266);
  const originalStages = await persistedStages();
  const observe = (request: any) => {
    const route = new URL(request.url()).pathname;
    if (route.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method()) && route !== "/api/bootstrap-role") report.visualWrites.push(`${request.method()} ${route}`);
  };
  const history = () => page.getByTestId("section-assisted-history");
  const activeCards = () => history().getByTestId("active-history-stage");
  const open = async () => {
    await page.getByTestId("assisted-workspace").waitFor();
    if (!await history().getByTestId("history-planning-summary").isVisible()) await page.getByText("Historial", { exact: true }).click();
    await history().getByTestId("history-planning-summary").waitFor();
  };
  const reload = async () => { await page.reload(); await open(); };
  const clickAction = async (button: any, suffix: string) => {
    const response = page.waitForResponse(r => r.url().endsWith(path + suffix) && r.request().method() === "POST");
    await button.click(); const result = await response; assert.equal(result.status(), 200, await result.text());
    return result.json();
  };
  const check = async (name: string) => {
    const state = await api(), timings = await api("/history/timings");
    const model = buildAssistedHistory(state.history, state.activeStage, timings);
    assert.equal(model.lineageError, null);
    const expected = model.rows.map(row => row.stage.id);
    await page.waitForFunction(ids => JSON.stringify([...document.querySelectorAll('[data-testid="active-history-stage"]')].map(el => Number(el.getAttribute("data-stage-id")))) === JSON.stringify(ids), expected);
    for (const [id, total] of [["history-generation-total", model.generationTotal], ["history-process-total", model.processTotal]] as const) {
      const expectedText = total.durationMs === null ? "No disponible" : historyDuration(total.durationMs);
      await page.waitForFunction(({ id, expectedText }) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.includes(expectedText), { id, expectedText });
      const text = await history().getByTestId(id).innerText();
      assert.ok(text.includes(total.durationMs === null ? "No disponible" : historyDuration(total.durationMs)), text);
      if (total.knownStages < total.totalStages && total.durationMs !== null) assert.match(text, /Cobertura parcial/);
    }
    const intervals = model.rows.slice(1).map(row => row.timing);
    // Compare to actual SQL metadata independently of the UI helper.
    const sql = (await db.query("SELECT s.id,s.ordinal,s.accepted_at,r.created_at,r.started_at,r.finished_at FROM assisted_planning_stages s LEFT JOIN planning_runs r ON r.id=s.proposal_run_id WHERE s.id=ANY($1::int[])", [expected])).rows.filter((row: any) => row.ordinal !== 0);
    if (sql.length && sql.every((row: any) => row.started_at && row.finished_at)) assert.equal(model.generationTotal.durationMs, sql.reduce((sum: number, row: any) => sum + row.finished_at.getTime() - row.started_at.getTime(), 0));
    if (sql.length && sql.every((row: any) => row.created_at && row.accepted_at)) assert.equal(model.processTotal.durationMs, sql.reduce((sum: number, row: any) => sum + row.accepted_at.getTime() - row.created_at.getTime(), 0));
    if (intervals.length && intervals.every(row => row.requestToAcceptance)) {
      const first = sql.find((row: any) => Number(row.id) === expected[1]), last = sql.find((row: any) => Number(row.id) === expected.at(-1));
      assert.equal(model.elapsed!.durationMs, last.accepted_at.getTime() - first.created_at.getTime());
    }
    report.scenarios.push({ name, activeStageId: state.activeStage.id, stageIds: expected, persistedStages: state.history.length, generation: model.generationTotal, process: model.processTotal, elapsed: model.elapsed });
    pass(`UI-04 ${name}`);
    return { state, model };
  };
  const screenshot = async (name: string) => {
    await history().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${directory}/${name}.png`, fullPage: false }); report.screenshots.push(`${name}.png`);
  };
  const readOnly = async (work: () => Promise<void>) => {
    const before = await material(); const offset = report.visualWrites.length;
    page.on("request", observe);
    try { await work(); } finally { page.off("request", observe); }
    assert.deepEqual(report.visualWrites.slice(offset), []); assert.equal(await material(), before, "history reads must preserve SQL values AND xmin versions");
  };
  const captureBaseline = async () => {
    const root = process.env.UI04_BASELINE_ROOT; assert.ok(root, "UI04_BASELINE_ROOT must contain the verified base for real before screenshots");
    const server = net.createServer(); await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as net.AddressInfo).port; await new Promise<void>(r => server.close(() => r()));
    const baselineUrl = `http://127.0.0.1:${port}`;
    // A real local transport proxy gives the baseline origin its own CORS
    // response; every Auth/REST operation still reaches the disposable stack.
    const target = new URL(url); assert.equal(target.hostname, "127.0.0.1");
    const gateway = http.createServer((request, response) => {
      const upstream = http.request({ hostname: target.hostname, port: target.port, path: request.url, method: request.method, headers: { ...request.headers, host: target.host } }, received => {
        response.writeHead(received.statusCode ?? 502, { ...received.headers, "access-control-allow-origin": baselineUrl }); received.pipe(response);
      });
      upstream.on("error", () => { response.writeHead(502); response.end(); }); request.pipe(upstream);
    });
    await new Promise<void>(r => gateway.listen(0, "127.0.0.1", r));
    const baselineAuthUrl = `http://127.0.0.1:${(gateway.address() as net.AddressInfo).port}`;
    const log = createWriteStream(`${directory}/ui04-baseline-private.log`, { mode: 0o600 });
    const params = db.connectionParameters;
    assert.equal(params.host, "127.0.0.1", "baseline must use the disposable database");
    const databaseUrl = new URL(`postgres://127.0.0.1:${params.port}/${params.database}`);
    databaseUrl.username = params.user; databaseUrl.password = params.password;
    const baselineEnv = { ...process.env, SUPABASE_URL: url, VITE_SUPABASE_URL: baselineAuthUrl, SUPABASE_ANON_KEY: anon, VITE_SUPABASE_ANON_KEY: anon, DATABASE_URL: databaseUrl.toString(), PORT: String(port), NODE_ENV: "development" };
    delete (baselineEnv as Record<string, unknown>).REPL_ID;
    const child = spawn(process.execPath, ["--import", "tsx", resolve(root, "server/index.ts")], {
      cwd: root, env: baselineEnv, stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout!.pipe(log); child.stderr!.pipe(log);
    const baseline = await page.context().browser()!.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      const end = Date.now() + 60_000;
      while (true) {
        assert.equal(child.exitCode, null, "baseline server exited");
        try { const ready = await fetch(`${baselineUrl}/api/plans/${planId}`, { headers: { Authorization: `Bearer ${users.production.token}` } }); if (ready.ok) break; } catch {}
        assert.ok(Date.now() < end, "baseline server startup timeout"); await new Promise(r => setTimeout(r, 250));
      }
      await baseline.goto(`${baselineUrl}/login`);
      await baseline.getByLabel("Email", { exact: true }).fill(users.production.email);
      await baseline.getByLabel("Contraseña (opcional para enlace)", { exact: true }).fill(users.production.password);
      await baseline.getByRole("button", { name: "Entrar con contraseña", exact: true }).click(); await baseline.waitForURL("**/dashboard");
      await baseline.goto(`${baselineUrl}/plans/${planId}?tab=planning`); await baseline.getByTestId("assisted-workspace").waitFor();
      const loaded = baseline.waitForResponse(response => response.url().endsWith("/history/timings") && response.status() === 200);
      await baseline.getByText("Historial", { exact: true }).click(); await loaded;
      await baseline.getByText("Cargando tiempos…", { exact: true }).waitFor({ state: "hidden" });
      await baseline.getByTestId("section-assisted-history").getByText("Solicitud a aceptación", { exact: true }).first().waitFor();
      await baseline.getByTestId("section-assisted-history").scrollIntoViewIfNeeded();
      await baseline.screenshot({ path: `${directory}/history-before-desktop.png` }); report.screenshots.push("history-before-desktop.png");
      report.baselineSourceHash = createHash("sha256").update(readFileSync(resolve(root, "client/src/components/planning/assisted-planning-workspace.tsx"))).digest("hex");
    } finally {
      await baseline.close(); child.kill("SIGTERM");
      gateway.closeAllConnections(); await new Promise<void>(r => gateway.close(() => r()));
      await new Promise<void>(r => { if (child.exitCode !== null) r(); else { child.once("exit", () => r()); setTimeout(() => { child.kill("SIGKILL"); r(); }, 3000).unref(); } });
    }
  };
  try {
    await open();
    await readOnly(async () => {
      const initial = await check("S0 → S1 → S2"); assert.equal(initial.model.rows.length, 3);
      assert.notEqual(initial.model.generationTotal.durationMs, initial.model.processTotal.durationMs);
      await screenshot("history-current-s2-desktop");
      await reload(); await check("browser reload");
    });
    // Restore/redo through the same guarded buttons used in production.
    const s1 = originalStages.find((stage: any) => Number(stage.id) !== Number(originalStages[0].id));
    await clickAction(history().locator(`[data-testid="active-history-stage"][data-stage-id="${s1.id}"]`).getByRole("button", { name: "Restaurar" }), "/rollback");
    await check("restore S1");
    await clickAction(history().getByRole("button", { name: "Rehacer", exact: true }), "/redo"); await check("redo S2");
    // Restart is explicitly confirmed by a real browser dialog.
    page.removeAllListeners("dialog"); page.on("dialog", dialog => { void dialog.accept(); });
    await page.getByRole("button", { name: "Configuración y mantenimiento de la sesión", exact: true }).click();
    await clickAction(page.getByRole("button", { name: "Reiniciar Asistida", exact: true }), "/restart");
    const reset = await check("restart to S0"); assert.equal(reset.model.rows.length, 1); assert.equal(reset.model.processTotal.durationMs, null);
    const request = page.waitForResponse(r => r.url().endsWith(path + "/next-scope"));
    await page.getByRole("button", { name: "Sugerir siguiente alcance", exact: true }).click(); assert.equal((await request).status(), 200);
    const generation = page.waitForResponse(r => r.url().endsWith(path + "/proposals") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Generar propuesta", exact: true }).click(); const generated = await generation; assert.equal(generated.status(), 202); const { runId } = await generated.json();
    await page.getByRole("button", { name: "Aplicar al borrador", exact: true }).waitFor({ timeout: 420_000 });
    await clickAction(page.getByRole("button", { name: "Aplicar al borrador", exact: true }), `/proposals/${runId}/apply`);
    await clickAction(page.getByRole("button", { name: "Validar borrador", exact: true }), "/validate");
    await clickAction(page.getByRole("button", { name: "Aceptar etapa", exact: true }), "/accept-stage");
    const branch = await check("new accepted branch after restart"); assert.equal(branch.model.rows.length, 2); assert.equal(branch.model.otherStages.length, 2);
    await readOnly(async () => {
      await captureBaseline(); await screenshot("history-after-desktop");
      const secondary = history().getByTestId("history-other-stages"); assert.equal(await secondary.getAttribute("open"), null);
      await secondary.locator(":scope > summary").click(); assert.equal(await secondary.getByTestId("other-history-stage").count(), 2);
      for (const button of await secondary.getByRole("button", { name: "Restaurar" }).all()) assert.equal(await button.isDisabled(), true);
      await secondary.locator(":scope > summary").click();
      const timestamps = activeCards().last().locator("details"); assert.equal(await timestamps.getAttribute("open"), null);
      await timestamps.locator("summary").click(); assert.ok(await timestamps.locator("time").count() >= 4);
      await timestamps.locator("summary").focus(); await page.keyboard.press("Enter"); assert.equal(await timestamps.getAttribute("open"), null);
      await page.setViewportSize({ width: 390, height: 844 }); await screenshot("history-after-mobile");
      const box = await history().boundingBox(); assert.ok(box && box.width <= 390);
      assert.ok(await history().evaluate(el => el.scrollWidth <= el.clientWidth + 1), "history fits mobile width");
      await reload(); await check("new branch persists after mobile reload");
      await page.setViewportSize({ width: 1440, height: 1000 });
    });
    const persisted = await persistedStages();
    assert.deepEqual(persisted.filter((stage: any) => originalStages.some((old: any) => old.id === stage.id)), originalStages, "all original accepted snapshots, links and timestamps preserved");
    assert.deepEqual(await taskIds(), initialTasks); assert.equal(persisted.length, originalStages.length + 1);
    report.stagesPreserved = originalStages.length; report.obligationsPreserved = 266;
    report.runtimeHashes = Object.fromEntries(["shared/assistedHistory.ts", "shared/assistedStageLineage.ts", "client/src/components/planning/assisted-stage-history.tsx", "script/demo/smokeAssistedActiveHistory.ts"].map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
    report.status = "PASS"; pass("UI-04 actual lineage/totals, restore/redo/restart/new acceptance/reload, desktop/mobile, timestamps and zero visual SQL writes with 266 identities and original Stages preserved");
    return report;
  } catch (error) {
    report.status = "FAIL"; report.error = error instanceof Error ? error.stack : String(error);
    await page.screenshot({ path: `${directory}/history-ui04-failure.png` }).catch(() => {}); throw error;
  } finally { writeFileSync(`${directory}/history-ui04.json`, JSON.stringify(report, null, 2)); }
}
