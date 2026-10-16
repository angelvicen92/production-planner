/** UI-05: real product HTTP/Auth/PostgREST/PostgreSQL and Chromium.
 * Replays recorded S22, never writes to the connected source project. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import type pg from "pg";

type Options = { appUrl: string; baselineUrl?: string; db: pg.Client; users: Record<string, { email: string; password: string; token: string }>; directory: string; planId: number; pass: (s: string) => void };
export async function runOperationalMealJourney({ appUrl, baselineUrl, db, users, directory, planId, pass }: Options) {
  assert.equal(new URL(appUrl).hostname, "127.0.0.1");
  assert.ok(baselineUrl, "UI05_BASELINE_ROOT must contain the verified base");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const report: any = { status: "RUNNING", source: "read-only A2 27002 S22 replay", remoteWrites: 0, visualWrites: [], checks: [], screenshots: [], sql: [], redoOrdinals: [] };
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const api = async () => {
    const r = await fetch(`${appUrl}/api/plans/${planId}/assisted`, { headers: { Authorization: `Bearer ${users.production.token}` } });
    assert.equal(r.status, 200); return r.json() as Promise<any>;
  };
  const tables = ["plans", "daily_tasks", "plan_breaks", "locks", "assisted_planning_sessions", "assisted_planning_stages", "planning_stage_validations", "planning_runs", "plan_config_revisions", "planning_accepted_exceptions"];
  const material = async () => {
    const rows: any = {};
    for (const table of tables) rows[table] = (await db.query(`SELECT to_jsonb(t) row,xmin::text version FROM ${table} t WHERE ${table === "plans" ? "id" : "plan_id"}=$1 ORDER BY id`, [planId])).rows;
    return JSON.stringify(rows);
  };
  const digest = (s: string) => createHash("sha256").update(s).digest("hex");
  const record = (name: string) => { report.checks.push(name); pass(`UI-05 ${name}`); };
  const panel = (view: string, target = page) => target.getByTestId(`planning-panel-${view}`);
  const mealCards = (target = page) => target.locator("[data-operational-meal-policy-id]");
  const totals = (target = page) => panel("spaces", target).locator('[data-operational-meal-policy-id="break:totales-operations"]');
  const login = async (target: Page, origin: string) => {
    target.setDefaultTimeout(30_000); target.setDefaultNavigationTimeout(120_000);
    await target.goto(`${origin}/login`);
    await target.getByLabel("Email", { exact: true }).fill(users.production.email);
    await target.getByLabel("Contraseña (opcional para enlace)", { exact: true }).fill(users.production.password);
    await target.getByRole("button", { name: "Entrar con contraseña", exact: true }).click();
    await target.waitForURL("**/dashboard");
    await target.goto(`${origin}/plans/${planId}?tab=planning`);
    await target.getByTestId("planning-multiview").waitFor();
    await target.getByRole("button", { name: "Mostrar Platós y espacios", exact: true }).click();
    await panel("spaces", target).waitFor();
  };
  const audit = (request: any) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method()) && path !== "/api/bootstrap-role") report.visualWrites.push(`${request.method()} ${path}`);
  };
  const visual = async (name: string, work: () => Promise<void>) => {
    const before = await material(), offset = report.visualWrites.length;
    page.on("request", audit);
    try { await work(); } finally { page.off("request", audit); }
    const after = await material(); assert.equal(after, before, `${name}: rows AND xmin unchanged`);
    assert.deepEqual(report.visualWrites.slice(offset), []);
    report.sql.push({ scenario: name, before: digest(before), after: digest(after), equalIncludingXmin: true }); record(name);
  };
  const check = async (authority: "draft" | "accepted" = "draft") => {
    const state = await api();
    const snapshot = authority === "accepted" ? state.activeStage.snapshotJson : state.draft;
    const expected = new Map<string, any>((snapshot.operationalMeals ?? []).map((m: any) => [m.policyId, m]));
    await page.waitForFunction(({ authority, count }) => {
      const cards = [...document.querySelectorAll('[data-testid="planning-panel-spaces"] [data-operational-meal-policy-id]')];
      return (count === 0 ? cards.length === 0 : cards.length > 0) && cards.every(c => c.getAttribute("data-operational-meal-authority") === authority);
    }, { authority, count: expected.size });
    for (const card of await mealCards().all()) {
      const policyId = (await card.getAttribute("data-operational-meal-policy-id"))!;
      const interval = expected.get(policyId); assert.ok(interval, `unexpected meal ${policyId}`);
      assert.equal(await card.getAttribute("data-planning-start"), interval.startPlanned);
      assert.equal(await card.getAttribute("data-planning-end"), interval.endPlanned);
      assert.match((await card.getAttribute("title"))!, authority === "draft" ? /borrador/ : /aceptada/);
      assert.equal(await card.evaluate(el => el.tagName), "DIV");
      assert.equal(await card.getAttribute("data-planning-task-id"), null);
    }
    return state;
  };
  const capture = async (name: string, target = page) => { await target.screenshot({ path: `${directory}/${name}.png` }); report.screenshots.push(`${name}.png`); };
  const acceptedStages = await db.query("SELECT id,snapshot_json,snapshot_fingerprint FROM assisted_planning_stages WHERE plan_id=$1 ORDER BY id", [planId]);
  const taskIds = (await db.query("SELECT id FROM daily_tasks WHERE plan_id=$1 ORDER BY id", [planId])).rows.map(r => Number(r.id)); assert.equal(taskIds.length, 266);
  try {
    await login(page, appUrl);
    await visual("S22 draft, accepted and reload: all eight actual policy intervals", async () => {
      const initial = await check(); assert.equal(initial.activeStage.ordinal, 22);
      assert.equal(initial.draft.operationalMeals.length, 8);
      assert.equal(await totals().count(), 2);
      assert.deepEqual((await totals().evaluateAll(cards => cards.map(c => Number(c.getAttribute("data-operational-meal-space-id"))))).sort(), [33, 34]);
      assert.ok((await totals().allTextContents()).every(t => t.includes("13:40–14:55")));
      assert.equal(await panel("spaces").getByText("Descanso comida", { exact: true }).count(), 0);
      await panel("spaces").getByRole("button", { name: "Maximizar", exact: true }).click();
      await panel("spaces").getByRole("button", { name: "Ajustar", exact: true }).click();
      await capture("meals-after-draft-desktop"); await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Planning aceptado · ejecución", exact: true }).click(); await check("accepted");
      await page.reload(); await panel("spaces").waitFor(); await check();
    });
    await visual("Timeline/List, zoom, maximize, empty lanes and explicit space filter", async () => {
      await panel("spaces").getByRole("button", { name: "Lista", exact: true }).click(); await check();
      await panel("spaces").getByRole("button", { name: "Timeline", exact: true }).click();
      await panel("spaces").getByRole("button", { name: "Ampliar zoom", exact: true }).click();
      await panel("spaces").getByRole("button", { name: "Filtros", exact: true }).click();
      await panel("spaces").getByText("Ocultar vacíos", { exact: true }).click(); await check();
      await panel("spaces").getByLabel("Buscar en Platós y espacios", { exact: true }).fill("Totales");
      for (const name of ["Sala Totales / Sala Totales Coreo", "Sala Totales / Sala Totales 1"])
        await panel("spaces").locator("label").filter({ hasText: name }).getByRole("checkbox").click();
      await panel("spaces").getByRole("button", { name: /^Filtros/ }).click();
      await check(); assert.equal(await totals().count(), 2);
      await panel("spaces").getByRole("button", { name: "Maximizar", exact: true }).click();
      await panel("spaces").getByRole("button", { name: "Ajustar", exact: true }).click();
      await capture("meals-after-totales"); await page.keyboard.press("Escape");
      await panel("spaces").getByRole("button", { name: /^Filtros/ }).click();
      await panel("spaces").getByRole("button", { name: "Mostrar todos", exact: true }).click();
      await panel("spaces").getByRole("button", { name: /^Filtros/ }).click();
      await panel("spaces").getByRole("button", { name: "Restaurar zoom al 100%", exact: true }).click();
    });
    await visual("Resources and recomposed teams use explicit policy memberships; meals have no actions or drag", async () => {
      await page.getByRole("button", { name: "Mostrar Recursos", exact: true }).click(); await panel("resources").waitFor();
      await check();
      const expectedPolicies = (await api()).draft.operationalMeals.map((m: any) => m.policyId).sort();
      assert.deepEqual(await mealCards().evaluateAll(cards => [...new Set(cards.map(c => c.getAttribute("data-operational-meal-policy-id")))].sort()), expectedPolicies);
      const resourceCards = panel("resources").locator('[data-operational-meal-scope="resource"]'); assert.equal(await resourceCards.count(), 6);
      assert.equal(await panel("resources").locator('[data-operational-meal-policy-id="break:totales-operations"]').count(), 0);
      const card = totals().first(); await card.scrollIntoViewIfNeeded();
      await card.click(); assert.equal(await page.locator('[data-radix-popper-content-wrapper]').count(), 0);
      const box = await card.boundingBox(); assert.ok(box);
      await page.mouse.move(box.x + box.width / 2, box.y + 10); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + 50); await page.mouse.up();
      assert.match(await page.getByTestId("planning-multiview").innerText(), /0 movimientos pendientes/);
      await check();
    });
    // Baseline and candidate read the same owned SQL; no routed/altered responses.
    const baseline = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      const before = await material(); await login(baseline, baselineUrl!);
      await panel("spaces", baseline).getByRole("button", { name: "Filtros", exact: true }).click();
      await panel("spaces", baseline).getByLabel("Buscar en Platós y espacios", { exact: true }).fill("Totales");
      for (const name of ["Sala Totales / Sala Totales Coreo", "Sala Totales / Sala Totales 1"])
        await panel("spaces", baseline).locator("label").filter({ hasText: name }).getByRole("checkbox").click();
      await panel("spaces", baseline).getByRole("button", { name: /^Filtros/ }).click();
      await panel("spaces", baseline).getByRole("button", { name: "Maximizar", exact: true }).click();
      await panel("spaces", baseline).getByRole("button", { name: "Ajustar", exact: true }).click();
      assert.ok((await panel("spaces", baseline).innerText()).includes("13:00–14:15"));
      await capture("meals-before-totales", baseline); assert.equal(await material(), before);
      record("verified base reproduces the legacy 13:00–14:15 placeholder on the same SQL");
    } finally { await baseline.close(); }
    const history = page.getByTestId("section-assisted-history");
    const openHistory = async () => {
      if (!await history.getByRole("button", { name: "Rehacer", exact: true }).isVisible())
        await page.getByRole("button", { name: "Historial", exact: true }).click();
    };
    await openHistory();
    const clickAction = async (button: any, suffix: string) => {
      const [result] = await Promise.all([
        page.waitForResponse(r => r.url().endsWith(`/assisted/${suffix}`) && r.request().method() === "POST"),
        button.click(),
      ]);
      assert.equal(result.status(), 200, await result.text());
    };
    const s12 = (await db.query("SELECT id FROM assisted_planning_stages WHERE plan_id=$1 AND ordinal=12", [planId])).rows[0].id;
    await clickAction(history.locator(`[data-testid="active-history-stage"][data-stage-id="${s12}"]`).getByRole("button", { name: "Restaurar", exact: true }), "rollback");
    await visual("restored S12 suppresses unmaterialized meals and legacy placeholders", async () => {
      await check(); assert.equal(await totals().count(), 0);
      assert.ok(await panel("spaces").getByTestId("operational-meals-pending").isVisible());
      await page.getByRole("button", { name: "Planning aceptado · ejecución", exact: true }).click(); await check("accepted");
      await page.reload(); await panel("spaces").waitFor(); await check();
    });
    // Redo returns through the real accepted lineage, without changing snapshots.
    await openHistory();
    for (let ordinal = 13; ordinal <= 22; ordinal++) {
      await clickAction(history.getByRole("button", { name: "Rehacer", exact: true }), "redo");
      assert.equal((await api()).activeStage.ordinal, ordinal);
      report.redoOrdinals.push(ordinal);
    }
    await visual("redo S22 restores actual Totales interval", async () => { await check(); assert.equal(await totals().count(), 2); });
    page.on("dialog", d => { void d.accept(); });
    await page.getByRole("button", { name: "Configuración y mantenimiento de la sesión", exact: true }).click();
    await clickAction(page.getByRole("button", { name: "Reiniciar Asistida", exact: true }), "restart");
    await visual("restart S0 has pending meals, never legacy intervals", async () => {
      assert.equal((await api()).activeStage.ordinal, 0); await check(); assert.equal(await mealCards().count(), 0);
      assert.ok(await panel("spaces").getByTestId("operational-meals-pending").isVisible());
      await page.reload(); await panel("spaces").waitFor(); await check();
    });
    assert.deepEqual((await db.query("SELECT id,snapshot_json,snapshot_fingerprint FROM assisted_planning_stages WHERE plan_id=$1 ORDER BY id", [planId])).rows, acceptedStages.rows);
    assert.deepEqual((await db.query("SELECT id FROM daily_tasks WHERE plan_id=$1 ORDER BY id", [planId])).rows.map(r => Number(r.id)), taskIds);
    report.acceptedSnapshotsPreserved = true; report.taskIdentities = taskIds.length;
    await page.goto(`${appUrl}/plans/27003?tab=planning`); await page.getByTestId("planning-multiview").waitFor();
    await page.getByRole("button", { name: "Mostrar Platós y espacios", exact: true }).click(); await panel("spaces").waitFor();
    await panel("spaces").getByText("Descanso comida", { exact: true }).first().waitFor();
    assert.equal(await mealCards().count(), 0);
    const legacyBreak = (await db.query("SELECT planned_start,planned_end FROM plan_breaks WHERE id=990001 AND plan_id=27003")).rows[0];
    const legacyCard = panel("spaces").locator('[data-planning-task-id="-990001"]');
    await legacyCard.scrollIntoViewIfNeeded();
    assert.equal(await legacyCard.getAttribute("data-planning-start"), legacyBreak.planned_start);
    assert.ok((await legacyCard.getAttribute("title"))?.includes(`${legacyBreak.planned_start}–${legacyBreak.planned_end}`));
    const legacyBefore = JSON.stringify((await db.query("SELECT to_jsonb(b) row,xmin::text version FROM plan_breaks b WHERE plan_id=27003 ORDER BY id")).rows);
    await panel("spaces").getByRole("button", { name: "Lista", exact: true }).click();
    await legacyCard.scrollIntoViewIfNeeded();
    assert.ok((await legacyCard.getAttribute("title"))?.includes(`${legacyBreak.planned_start}–${legacyBreak.planned_end}`));
    assert.equal(JSON.stringify((await db.query("SELECT to_jsonb(b) row,xmin::text version FROM plan_breaks b WHERE plan_id=27003 ORDER BY id")).rows), legacyBefore);
    record("legacy day without structured configuration retains its materialized plan_breaks in Timeline/List");
    assert.deepEqual(errors, []); report.status = "PASS";
    return report;
  } finally {
    if (report.status !== "PASS") { report.status = "FAIL"; await capture("meals-failure").catch(() => {}); }
    report.pageErrors = errors; writeFileSync(`${directory}/operational-meals.json`, JSON.stringify(report, null, 2)); await browser.close();
  }
}
