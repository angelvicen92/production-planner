/** P8: only owned loopback services; real acceptance/restart/rollback/redo RPCs.
 * Presentation reads are compared against literal SQL material, including history.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { buildAssistedHistory } from "../../shared/assistedHistory";
import { observeAutopilotCheckpoints } from "../../client/src/lib/assisted-autopilot";
import { projectAutopilotProgress } from "../../client/src/lib/assisted-autopilot-progress";
import type { AutopilotApi, AutopilotProgress } from "../../shared/assistedAutopilot";
import type { runA2BrowserJourney } from "./smokeA2Journey";

type Options = Parameters<typeof runA2BrowserJourney>[0] & { baselineUrl?: string };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function runAssistedStageCycle({ appUrl, url, users, db, planId, directory, baselineUrl, pass }: Options) {
  assert.equal(db.host, "127.0.0.1"); assert.equal(new URL(url).hostname, "127.0.0.1");
  const path = `/api/plans/${planId}/assisted`;
  const request = async (route: string, method = "GET", body?: unknown) => {
    const response = await fetch(appUrl + route, { method, headers: { Authorization: `Bearer ${users.admin.token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json() as any;
    assert.equal(response.status, 200, `${method} ${route}: ${JSON.stringify(data)}`); return data;
  };
  const state = () => request(path);
  const guard = (s: any) => ({ expectedBaseStageId: s.draftBaseStageId, expectedDraftFingerprint: s.draftFingerprint });
  const accept = async () => {
    const s = await state();
    // Deliberately identical S0 snapshots isolate numbering from proposal/manual
    // validation (P9). Seed only validation metadata in the owned DB; acceptance,
    // restart and movement still run through the real authenticated HTTP/RPC path.
    const validation = (await db.query(`INSERT INTO planning_stage_validations
      (plan_id,session_id,base_stage_id,config_revision_id,draft_fingerprint,hard_count,required_count,preferred_count,report_json)
      VALUES($1,$2,$3,$4,$5,0,0,0,'{}') RETURNING id`,
      [planId,s.session.id,s.draftBaseStageId,s.currentConfigRevisionId,s.draftFingerprint])).rows[0];
    await db.query("UPDATE assisted_planning_sessions SET draft_validation_id=$1 WHERE id=$2", [validation.id,s.session.id]);
    return request(`${path}/accept-stage`, "POST", { ...guard(s), confirmation: "NONE" });
  };
  const restart = async () => request(`${path}/restart`, "POST", { ...guard(await state()), confirmation: "RESTART_BOOTSTRAP" });
  const material = async () => {
    const result: Record<string, unknown> = {};
    for (const table of ["plans", "daily_tasks", "assisted_planning_stages", "assisted_planning_sessions", "planning_stage_validations", "planning_runs", "plan_config_revisions", "planning_accepted_exceptions", "locks"])
      result[table] = (await db.query(`SELECT to_jsonb(t) row FROM public.${table} t ORDER BY id`)).rows;
    return result;
  };
  const snapshots = async () => (await db.query("SELECT id,ordinal,parent_stage_id,snapshot_json,snapshot_fingerprint FROM assisted_planning_stages WHERE plan_id=$1 ORDER BY id", [planId])).rows;
  const report: any = { remoteWrites: 0, source: "disposable A2 / native Auth, HTTP, SQL and Chromium", validation: "fixture metadata for identical bootstrap snapshots; no new validation or solver certification", checkpoints: [] };
  const record = async (name: string, local: number) => {
    const s = await state(), model = buildAssistedHistory(s.history, s.activeStage);
    assert.equal(model.lineageError, null); assert.equal(model.localNumber, local);
    assert.equal(s.draft.tasks.length, 266);
    report.checkpoints.push({ name, historicalOrdinal: s.activeStage.ordinal, localNumber: model.localNumber, activeIds: model.rows.map(r => r.stage.id), activeOrdinals: model.rows.map(r => r.stage.ordinal), visibleNumbers: model.rows.map(r => r.localNumber), otherIds: model.otherStages.map(r => r.id) });
    pass(name); return s;
  };
  await request(`${path}/session`, "POST", {});
  const s0 = await record("initial S0", 0);
  for (let i = 1; i <= 12; i++) { await accept(); if (i <= 2 || i === 12) await record(`initial S${i}`, i); }
  const originalSnapshots = await snapshots();
  await restart(); await record("restart from S12 returns S0", 0);
  await accept(); await record("first restart: historical 13 displays S1", 1);
  await restart(); await accept(); await record("second restart: historical 14 displays S1", 1);
  for (let i = 2; i <= 11; i++) await accept();
  const real = await record("real structural case [0,14..24] displays [0..11]", 11);
  assert.equal(real.history.length, 25); assert.equal(real.history.filter((s: any) => s.archivedAt).length, 13);
  assert.deepEqual((await snapshots()).slice(0, originalSnapshots.length), originalSnapshots, "restart keeps every old snapshot, ID, parent and fingerprint");

  // The checkpoint observer still compares historical ordinals. Only its verified
  // state is projected for display; no controller/API contract is changed.
  let checkpoint: any;
  const observer = observeAutopilotCheckpoints({ state, plan: () => request(`/api/plans/${planId}`) } as AutopilotApi, s => { checkpoint = s; });
  await observer.api.state(); await observer.api.plan();
  const progress = { phase: "VERIFYING", stage: 24, completed: 0, total: 266, scope: null, scopeTaskIds: [], runId: null, stopRequested: false, message: "verified" } as AutopilotProgress;
  observer.onProgress(progress); assert.equal(checkpoint.activeStage.id, real.activeStage.id);
  const projected = projectAutopilotProgress(progress, [], [], buildAssistedHistory(checkpoint.history, checkpoint.activeStage));
  assert.equal(projected.checkpointLabel, "Etapa S11"); assert.equal(progress.stage, 24);
  report.autopilot = { persistedStage: progress.stage, visible: projected.checkpointLabel, completed: projected.completed, total: projected.total };

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const errors: string[] = [];
  const open = async (base: string) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(60_000);
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/login`);
    await page.getByLabel("Email", { exact: true }).fill(users.admin.email);
    await page.getByLabel("Contraseña (opcional para enlace)", { exact: true }).fill(users.admin.password);
    await page.getByRole("button", { name: "Entrar con contraseña", exact: true }).click(); await page.waitForURL("**/dashboard");
    await page.goto(`${base}/plans/${planId}?tab=planning`);
    await page.getByTestId("assisted-workspace").waitFor(); return page;
  };
  const header = (page: Page) => page.getByText("Última etapa aceptada", { exact: true }).locator("..");
  try {
    const before = await material();
    if (baselineUrl) {
      const baseline = await open(baselineUrl);
      assert.match(await baseline.getByTestId("planning-stage-toolbar").innerText(), /Etapa 24/);
      report.before = { toolbar: await baseline.getByTestId("planning-stage-toolbar").innerText(), header: await header(baseline).innerText(), sqlHash: hash(before) };
      await baseline.screenshot({ path: `${directory}/p8-before.png` }); await baseline.close();
    }
    const page = await open(appUrl), workspace = page.getByTestId("assisted-workspace");
    assert.match(await workspace.getByTestId("planning-stage-toolbar").innerText(), /Etapa S11/);
    assert.match(await header(page).innerText(), /Etapa S11/);
    assert.deepEqual(await workspace.getByRole("list", { name: "Progreso de etapas" }).locator("strong").allTextContents(), Array.from({ length: 12 }, (_, i) => `S${i}`));
    await workspace.getByText("Historial", { exact: true }).click();
    const history = workspace.getByTestId("assisted-current-history");
    await history.getByTestId("active-history-stage").last().waitFor();
    assert.equal(await history.getByTestId("active-history-stage").count(), 12);
    const other = history.getByTestId("history-other-stages"); await other.locator(":scope > summary").click();
    assert.equal(await other.getByTestId("other-history-stage").count(), 13);
    assert.match(await other.innerText(), /Etapa histórica #1 · ID/); assert.doesNotMatch(await other.innerText(), /Etapa S1/);
    const taskIds = await workspace.locator("[data-planning-task-id]").evaluateAll(els => [...new Set(els.map(el => el.getAttribute("data-planning-task-id")))].sort());
    // Bootstrap obligations have no placements, so timeline cards are absent.
    // Check their actual persisted identities and the UI's full obligation count.
    const persistedIds = (await db.query("SELECT id FROM daily_tasks WHERE plan_id=$1 ORDER BY id", [planId])).rows.map(row => Number(row.id));
    assert.deepEqual(persistedIds, real.draft.tasks.map((task: any) => task.taskId).sort((a: number, b: number) => a - b));
    assert.equal(persistedIds.length, 266);
    assert.match(await workspace.getByTestId("planning-stage-toolbar").innerText(), /0\/266 con horario/);
    report.after = { toolbar: await workspace.getByTestId("planning-stage-toolbar").innerText(), header: await header(page).innerText(), progress: await workspace.getByRole("list", { name: "Progreso de etapas" }).locator("strong").allTextContents(), activeCards: 12, archivedCards: 13, obligations: persistedIds.length, renderedPlacementCards: taskIds.length, sqlHash: hash(await material()) };
    assert.deepEqual(await material(), before, "all tables remain literal across baseline/candidate presentation");
    // Capture the viewport containing S11 and the archived branch references;
    // element screenshots of the tall history are clipped by layout containment.
    await page.screenshot({ path: `${directory}/p8-after-history.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${directory}/p8-after.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${directory}/p8-after-mobile.png` });
    await page.close();
    pass("baseline Etapa 24 → candidate S11; history, progress, accepted summary and all SQL material preserved");
  } finally { await browser.close(); }
  const row4 = buildAssistedHistory(real.history, real.activeStage).rows[4].stage;
  await request(`${path}/rollback`, "POST", { targetStageId: row4.id }); await record("rollback to S4", 4);
  await request(`${path}/redo`, "POST", {}); await record("redo without divergence to S5", 5);
  await request(`${path}/rollback`, "POST", { targetStageId: row4.id });
  const prior = await snapshots(); await accept(); const branched = await record("new branch after S4 displays S5", 5);
  assert.equal(branched.activeStage.ordinal, 25); assert.equal(branched.history.length, 26);
  assert.deepEqual((await snapshots()).slice(0, prior.length), prior);
  assert.equal(s0.activeStage.id, buildAssistedHistory(branched.history, branched.activeStage).rows[0].stage.id);
  assert.deepEqual(errors, []); report.pageErrors = errors; report.status = "PASS";
  writeFileSync(`${directory}/stage-cycle.json`, JSON.stringify(report, null, 2));
  return report;
}
