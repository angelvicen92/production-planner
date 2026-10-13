/** Exercise the actual button and authenticated product services on the owned
 * disposable database. Checkpoints come only from previously accepted Stages. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import type { runA2BrowserJourney } from "./smokeA2Journey";
import { auditComplete } from "./probeA2StageOrder";
import { adaptEngineInputToPlannerNextProblem } from "../../engine/planner-next/integration/engineInputAdapter";

type Options = Parameters<typeof runA2BrowserJourney>[0];
type Baseline = Awaited<ReturnType<typeof runA2BrowserJourney>>;
export async function runA2AutopilotJourney(options: Options, baseline: Baseline) {
  const { appUrl, users, planId, db, directory, pass, buildInput, diagnostics } = options;
  const path = `/api/plans/${planId}/assisted`;
  const api = async (suffix = "", method = "GET", body?: unknown) => {
    const r = await fetch(`${appUrl}${path}${suffix}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${users.production.token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data: any = await r.json(); assert.equal(r.status, 200, JSON.stringify(data)); return data;
  };
  const originals = (await db.query("SELECT * FROM public.assisted_planning_stages WHERE plan_id=$1 ORDER BY id", [planId])).rows;
  const stageMaterial = (row: any) => { const { archived_at: _archived, ...material } = row; return material; };
  const preserveHistory = async () => {
    const rows = (await db.query("SELECT * FROM public.assisted_planning_stages WHERE plan_id=$1 ORDER BY id", [planId])).rows;
    for (const row of originals) assert.deepEqual(stageMaterial(rows.find(r => Number(r.id) === Number(row.id))), stageMaterial(row), "previously accepted tasks, structures and metadata stay literal");
  };
  const initial = await api();
  const lineage: any[] = []; let ancestor = initial.activeStage;
  while (ancestor) { lineage.unshift(ancestor); ancestor = initial.history.find((s: any) => Number(s.id) === Number(ancestor.parentStageId)); }
  assert.equal(lineage.length, baseline.stages.length+1); const s0 = lineage[0], s5 = lineage[5];
  const report: any = { status: "RUNNING", mechanism: "actual UI button → Auth → real planning_runs → native HTTP/RPC/SQL", remoteWrites: 0, baseline: baseline.stages.map(s => ({ scope: s.scope, completed: s.completed, fingerprint: s.fingerprint, hard: s.hardCount, required: s.requiredCount })), scenarios: [], requests: [], delegatedConfirmations: 0 };
  diagnostics.autopilot = report;
  const save = () => writeFileSync(`${directory}/autopilot.json`, JSON.stringify(report, null, 2));
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  let page: Page | undefined;
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(30_000);
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    let consent = false;
    page.on("dialog", dialog => {
      assert.match(dialog.message(), /^(Delegas la aceptación automática exclusivamente|Volverás al estado inicial)/);
      if (consent) { if(dialog.message().startsWith("Delegas")) report.delegatedConfirmations++; else report.restartConfirmations=(report.restartConfirmations??0)+1; void dialog.accept(); } else void dialog.dismiss();
    });
    page.on("request", request => {
      if (request.method() !== "POST" || !request.url().includes(path)) return;
      const suffix = request.url().slice(request.url().indexOf(path) + path.length), body = request.postDataJSON();
      if (suffix === "/proposals") assert.equal(body.includePrerequisites, false);
      if (suffix === "/accept-stage") assert.equal(body.confirmation, "NONE", "no exception decision is automated");
      report.requests.push({ suffix, body });
    });
    await page.goto(`${appUrl}/login`); await page.getByLabel("Email", { exact: true }).fill(users.production.email);
    await page.getByLabel("Contraseña (opcional para enlace)", { exact: true }).fill(users.production.password);
    await page.getByRole("button", { name: "Entrar con contraseña", exact: true }).click(); await page.waitForURL("**/dashboard");
    const reopen = async () => {
      await page!.goto(`${appUrl}/plans/${planId}?tab=planning`); await page!.getByTestId("assisted-workspace").waitFor();
      await page!.getByRole("button", { name: "Completar automáticamente", exact: true }).waitFor();
    };
    const waitTerminal = async (expected: "STOPPED" | "COMPLETE") => {
      await page!.waitForFunction(() => {
        const phase = document.querySelector('[data-testid="assisted-autopilot-progress"]')?.getAttribute("data-phase");
        return ["FAILED", "STOPPED", "COMPLETE"].includes(phase ?? "");
      }, undefined, { timeout: 600_000 });
      assert.equal(await page!.getByTestId("assisted-autopilot-progress").getAttribute("data-phase"), expected, await page!.getByTestId("assisted-autopilot-progress").innerText());
      await page!.getByRole("button", { name: "Completar automáticamente", exact: true }).waitFor({ state: "visible" });
      await page!.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent === "Completar automáticamente" && !b.disabled));
    };
    const start = async (doubleClick = false) => {
      const button = page!.getByRole("button", { name: "Completar automáticamente", exact: true });
      if (doubleClick) await button.evaluate((el: HTMLButtonElement) => { el.click(); el.click(); }); else await button.click();
    };
    const scenarioStarts = new Map<number, number>();
    const markStart = async () => {
      const start = report.requests.length;
      scenarioStarts.set(start, Number((await db.query("SELECT max(id) AS id FROM public.assisted_planning_stages WHERE plan_id=$1", [planId])).rows[0].id));
      return start;
    };
    const audit = async (label: string, checkpoint: any, requestStart: number) => {
      const after = await api(); assert.equal(after.draft.tasks.filter((t: any) => t.startPlanned && t.endPlanned).length, 266);
      assert.deepEqual(after.activeStage.snapshotJson, after.draft); assert.equal(after.activeStage.snapshotFingerprint, after.draftFingerprint);
      const stages = (await db.query("SELECT * FROM public.assisted_planning_stages WHERE plan_id=$1 ORDER BY id", [planId])).rows;
      const added = stages.filter(s => Number(s.id) > scenarioStarts.get(requestStart)! && report.requests.slice(requestStart).some((r: any) => r.suffix === "/accept-stage" && Number(r.body.expectedBaseStageId) === Number(s.parent_stage_id)));
      for (const stage of added) { assert.equal(stage.validation_summary_json.hardCount, 0); assert.equal(stage.validation_summary_json.requiredCount, 0); assert.equal(stage.accepted_by, users.production.id); }
      for (const task of checkpoint.snapshotJson.tasks.filter((t: any) => t.startPlanned && t.endPlanned)) assert.deepEqual(after.draft.tasks.find((t: any) => t.taskId === task.taskId), task);
      for (const field of ["planningBlocks", "operationalMeals", "setupPreparations", "roundPreparations"]) for (const item of checkpoint.snapshotJson[field] ?? []) assert.ok((after.draft[field] ?? []).some((candidate: any) => JSON.stringify(Object.entries(candidate).sort()) === JSON.stringify(Object.entries(item).sort())));
      await preserveHistory();
      assert.equal((await db.query("SELECT count(*) AS n FROM public.planning_accepted_exceptions WHERE plan_id=$1", [planId])).rows[0].n, "0");
      assert.deepEqual((await db.query("SELECT proposal_run_id,count(*) FROM public.assisted_planning_stages WHERE plan_id=$1 AND proposal_run_id IS NOT NULL GROUP BY proposal_run_id HAVING count(*)>1", [planId])).rows, []);
      const run = await api(`/proposals/${after.activeStage.proposalRunId}`), witness = run.assisted_result_json.evidence.futureStructuralWitnesses.find((w: any) => w.kind === "JOINT_COMPLETION");
      const adapted = adaptEngineInputToPlannerNextProblem(await buildInput()); assert.equal(adapted.status, "SUPPORTED"); if (adapted.status !== "SUPPORTED") throw Error("unsupported persisted input");
      const canonical = auditComplete(adapted, after.draft, witness); assert.equal(canonical.status, "PASS", JSON.stringify(canonical.validation));
      await page!.reload(); await page!.getByTestId("assisted-workspace").waitFor(); assert.deepEqual(await api(), after); await page!.getByRole("button", { name: "Completar automáticamente", exact: true }).waitFor();
      const value = { label, checkpointOrdinal: checkpoint.ordinal, checkpointId: checkpoint.id, finalOrdinal: after.activeStage.ordinal, completed: 266, accepted: added.length, fingerprint: after.draftFingerprint, canonical, noNewExceptions: true, protectedHistory: true, persistedAndReloaded: true, runIds: added.map(s => Number(s.proposal_run_id)) };
      report.scenarios.push(value); save(); pass(`Autopilot ${label}: canonical 266/266, clean authenticated accepts, literal protections and reload`); return value;
    };

    await api("/rollback", "POST", { targetStageId: Number(s5.id) }); await reopen();
    const frozen = await api(), requestsBefore = report.requests.length;
    await start(); assert.deepEqual(await api(), frozen); assert.equal(report.requests.length, requestsBefore); pass("Autopilot delegation dismissed: no run or mutation");
    consent = true;
    const requestStart = await markStart();
    // Request a stop while generating, via the actual operator button. No run is
    // intercepted, cancelled or replaced, and the current clean Stage finishes.
    let stopClick: Promise<void> | undefined;
    const stopDuringRun = (request: any) => {
      if (request.url().endsWith(`${path}/proposals`) && request.method() === "POST") {
        page!.off("request", stopDuringRun); stopClick = page!.getByRole("button", { name: "Detener al terminar la etapa", exact: true }).click();
      }
    };
    page.on("request", stopDuringRun); await start(true); await waitTerminal("STOPPED"); await stopClick;
    const stopped = await api(); assert.equal(Number(stopped.activeStage.parentStageId), Number(s5.id)); assert.deepEqual(stopped.activeStage.snapshotJson, stopped.draft);
    assert.equal(report.requests.slice(requestStart).filter((r: any) => r.suffix === "/accept-stage").length, 1); await preserveHistory();
    await page.reload(); await page.getByTestId("assisted-workspace").waitFor(); assert.deepEqual(await api(), stopped);
    pass("Autopilot from S5: safe stop after one Stage, double click yields one delegation, reload retains checkpoint");
    await start(); await waitTerminal("COMPLETE"); const resumed = await audit("S5 stop/reload/resume", s5, requestStart);
    // Stage ordinal counts all accepted branches; lineage position counts the
    // logical checkpoint after the acceptance-order experiments.
    assert.equal(resumed.accepted, baseline.stages.length-lineage.indexOf(s5));
    await api("/rollback", "POST", { targetStageId: Number(s5.id) }); await reopen(); const repeatStart = await markStart();
    await start(); await waitTerminal("COMPLETE"); const repeated = await audit("same S5 checkpoint repeated", s5, repeatStart);
    assert.equal(repeated.fingerprint, resumed.fingerprint, "identical accepted checkpoint and unchanged scopes produce deterministic completion");
    consent=false;
    const beforeRestart=await api(),beforeRestartRequests=report.requests.length;
    await page.getByRole("button",{name:"Reiniciar Asistida",exact:true}).click();
    assert.deepEqual(await api(),beforeRestart);assert.equal(report.requests.length,beforeRestartRequests);
    const denied=await fetch(`${appUrl}${path}/restart`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${users.viewer.token}`},body:JSON.stringify({expectedDraftFingerprint:beforeRestart.draftFingerprint,expectedBaseStageId:Number(beforeRestart.draftBaseStageId),confirmation:"RESTART_BOOTSTRAP"})});
    assert.equal(denied.status,403);assert.deepEqual(await api(),beforeRestart);
    consent=true;
    const restarted=page.waitForResponse(response=>response.url().endsWith(`${path}/restart`)&&response.status()===200);
    await page.getByRole("button",{name:"Reiniciar Asistida",exact:true}).click();await restarted;
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Reiniciar Asistida'&&!button.disabled));
    const clean=await api();assert.equal(clean.activeStage.ordinal,0);assert.deepEqual(clean.draft,s0.snapshotJson);
    assert.equal(clean.draft.tasks.filter((task:any)=>task.startPlanned&&task.endPlanned).length,0);
    assert.equal(clean.session.draftValidationId,null);assert.deepEqual(clean.session.draftScopeJson,{});
    assert.equal(clean.currentConfigRevisionId,beforeRestart.currentConfigRevisionId);await preserveHistory();
    assert.equal((await db.query("SELECT count(*) AS n FROM public.daily_tasks WHERE plan_id=$1 AND (start_planned IS NOT NULL OR end_planned IS NOT NULL)",[planId])).rows[0].n,"0");
    await reopen(); const fullStart = await markStart();
    await start(); await waitTerminal("COMPLETE"); const full = await audit("S0 uninterrupted", s0, fullStart); assert.equal(full.accepted, baseline.stages.length);
    const restartReport={status:"PASS",confirmationDismissedWithoutWrites:true,viewerDenied:403,fromCompleted:266,restoredCompleted:0,bootstrapFingerprint:clean.draftFingerprint,currentConfigurationPreserved:true,historyPreserved:true,replannedCompleted:full.completed,newAcceptedStages:full.accepted,canonical:full.canonical,finalFingerprint:full.fingerprint,remoteWrites:0};
    diagnostics.restart=restartReport;writeFileSync(`${directory}/restart.json`,JSON.stringify(restartReport,null,2));
    pass("confirmed UI restart from 266/266 to exact S0; audit retained; full Autopilot replans 266/266");
    assert.deepEqual(report.requests.slice(fullStart).filter((r: any) => r.suffix === "/proposals").map((r: any) => r.body.selector), baseline.stages.map(s => s.scope), "same unchanged recommender as current manual baseline");
    // Geometry may differ from a valid baseline. Canonical validity above is the
    // gate; the fingerprint comparison is Evidence, not a scheduling hardcode.
    report.baselineFingerprint = baseline.stages.at(-1)!.fingerprint; report.sameBaselineGeometry = full.fingerprint === report.baselineFingerprint;
    await page.getByTestId("assisted-autopilot").screenshot({ path: `${directory}/autopilot-real-ui.png` });
    assert.deepEqual(errors, []); report.status = "PASS"; return report;
  } catch (error) {
    report.status = "FAIL"; report.error = error instanceof Error ? error.message : String(error);
    report.failedRuns = (await db.query("SELECT id,status,message,assisted_result_json FROM public.planning_runs WHERE plan_id=$1 ORDER BY id", [planId])).rows;
    if (page) { report.workspace = await page.getByTestId("assisted-workspace").innerText().catch(() => null); await page.screenshot({ path: `${directory}/autopilot-failure-real-ui.png` }).catch(() => {}); }
    throw error;
  } finally { save(); await browser.close(); }
}
