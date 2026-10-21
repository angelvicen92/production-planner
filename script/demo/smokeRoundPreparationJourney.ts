/** U06a: changes use real UI/HTTP; only the existing imported day supplies policies. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import type { Page } from "playwright";
import type { runA2BrowserJourney } from "./smokeA2Journey";
import { adaptEngineInputToPlannerNextProblem } from "../../engine/planner-next/integration/engineInputAdapter";
import { validatePlan } from "../../engine/planner-next/validate";
import { materializeScheduledItinerantUnitMeals } from "../../engine/planner-next/itinerantUnitMeals";

export async function runRoundPreparationJourney(options: Parameters<typeof runA2BrowserJourney>[0], page: Page) {
  const { appUrl, users, db, planId, directory, buildInput, pass } = options;
  assert.equal(new URL(appUrl).hostname, "127.0.0.1");
  const api = async (path: string, method = "GET", body?: unknown, role = "production") => {
    let response: Response;
    try { response = await fetch(`${appUrl}/api${path}`, { method, headers: { Authorization: `Bearer ${users[role].token}`, "Content-Type": "application/json", Connection: "close" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(180_000) }); }
    catch (error: any) { throw new Error(`${method} ${path}: ${error.message}; ${error.cause?.code ?? "no transport code"}`); }
    return { status: response.status, body: await response.json() as any };
  };
  const day = `/plans/${planId}/day-configuration`, assisted = `/plans/${planId}/assisted`;
  const view = async () => { const response = await api(`/plans/${planId}/effective-configuration`); assert.equal(response.status, 200); return response.body.roundPreparations; };
  const state = async () => (await api(assisted)).body;
  const guard = (s: any) => ({ expectedDraftFingerprint: s.draftFingerprint, expectedBaseStageId: Number(s.draftBaseStageId) });
  const protectedMaterial = async () => (await db.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM daily_tasks t WHERE plan_id=$1) tasks,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM assisted_planning_stages s WHERE plan_id=$1) stages,
    (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM locks l WHERE plan_id=$1) locks,
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM plans p WHERE id<>$1) other_days,
    (SELECT planner_next_configuration FROM plans WHERE id=$1) original`, [planId])).rows;
  const before = await protectedMaterial(), originalInput = await buildInput(), originalView = await view();
  assert.ok(originalView.lanes.length >= 2); assert.ok(originalView.lanes.every((lane: any) => lane.preparationMinutesBetweenRounds === 5));
  const policyId = originalView.lanes[0].policyId;
  const lanes = originalView.lanes.filter((lane: any) => lane.policyId === policyId);
  const target = (lane: any) => ({ policyId: lane.policyId, spaceId: lane.spaceId });
  const edit = async (lane: any, minutes: number, role = "production", revision?: number | null) => api(day, "PUT", { roundPreparation: { ...target(lane), preparationMinutesBetweenRounds: minutes }, expectedRevisionId: revision === undefined ? (await view()).revisionId : revision }, role);
  const proposal = async () => {
    const current = await state();
    const suggested = await api(`${assisted}/next-scope`); assert.equal(suggested.status, 200);
    const requested = await api(`${assisted}/proposals`, "POST", { ...guard(current), selector: suggested.body.selector, includePrerequisites: false });
    assert.equal(requested.status, 202, JSON.stringify(requested));
    const deadline = Date.now() + 420_000;
    while (Date.now() < deadline) {
      const run = (await api(`${assisted}/proposals/${requested.body.runId}`)).body;
      if (run.status === "success") { const result = run.assisted_result_json ?? run.assistedResultJson; assert.equal(result.outcome, "PROPOSAL", JSON.stringify(result)); return { runId: requested.body.runId, result }; }
      assert.ok(run.status !== "error" && run.status !== "failed", JSON.stringify(run));
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    throw Error("round proposal did not finish within the existing product limit");
  };
  const baselineProposal = await proposal();
  pass("U06a baseline proposal uses the original 5-minute daily policy");
  for (const role of ["viewer", "aux", "norole"]) assert.equal((await edit(lanes[0], 10, role)).status, 403);
  for (const minutes of [-1, 1.5, "10"]) assert.equal((await edit(lanes[0], minutes as number)).status, 400);
  assert.equal((await edit(lanes[0], 1)).status, 422);
  for (const lane of [{ ...lanes[0], policyId: "absent-policy" }, { ...lanes[0], spaceId: 2147483647 }]) assert.equal((await edit(lane, 10)).status, 409);
  assert.deepEqual(await protectedMaterial(), before);

  await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);
  const editor = page.getByTestId("round-preparation-editor"); await editor.waitFor();
  await editor.screenshot({ path: `${directory}/u06a-before.png` });
  for (const lane of lanes) {
    const card = page.locator(`[data-testid="round-preparation-lane"][data-space-id="${lane.spaceId}"]`);
    await card.getByRole("spinbutton").fill("10");
    const saved = page.waitForResponse(response => response.url().endsWith(`/api${day}`) && response.request().method() === "PUT");
    await card.getByRole("button", { name: "Guardar preparación", exact: true }).click(); assert.equal((await saved).status(), 200);
    await card.getByText("Preparación efectiva:", { exact: false }).filter({ hasText: "10 min" }).waitFor();
  }
  await page.reload(); await editor.waitFor();
  assert.ok((await view()).lanes.filter((lane: any) => lane.policyId === policyId).every((lane: any) => lane.preparationMinutesBetweenRounds === 10 && lane.source === "DAY_OVERRIDE" && lane.baselineMinutes === 5));
  await editor.screenshot({ path: `${directory}/u06a-after.png` });
  const editedInput = await buildInput(); const adapted = adaptEngineInputToPlannerNextProblem(editedInput);
  assert.equal(adapted.status, "SUPPORTED"); if (adapted.status !== "SUPPORTED") throw Error("unsupported persisted policy");
  const mappedPolicyId = adapted.identityMap.find(identity => identity.namespace === "round-synchronization" && identity.sourceId === policyId)!.canonicalId;
  assert.ok(adapted.problem.roundSynchronizations!.find(policy => policy.id === mappedPolicyId)!.lanes.every(lane => lane.preparationMinutesBetweenRounds === 10));
  const stale = await api(`${assisted}/proposals/${baselineProposal.runId}/apply`, "POST", guard(await state())); assert.equal(stale.status, 409);
  const staleEdit = await edit(lanes[0], 0, "production", originalView.revisionId); assert.equal(staleEdit.status, 409);
  const next = await proposal();
  const witness = next.result.evidence.futureStructuralWitnesses.find((value: any) => value.kind === "JOINT_COMPLETION"); assert.ok(witness);
  const validation = validatePlan(adapted.problem, witness.tasks, witness.preparations, witness.spaceMeals, witness.participantMeals, [], materializeScheduledItinerantUnitMeals(adapted.problem), witness.roundPreparations, witness.operationalMeals);
  assert.equal(validation.hardValid, true); assert.deepEqual(validation.violations, []);
  const changedPreparations = witness.roundPreparations.filter((value: any) => value.synchronizationId === mappedPolicyId);
  assert.ok(changedPreparations.length > 0); assert.ok(changedPreparations.every((value: any) => value.duration === 10));
  const applied = await api(`${assisted}/proposals/${next.runId}/apply`, "POST", guard(await state())); assert.equal(applied.status, 200, JSON.stringify(applied));
  const checked = await api(`${assisted}/validate`, "POST", guard(await state())); assert.equal(checked.status, 200, JSON.stringify(checked));
  assert.equal((await state()).validation.hardCount, 0); assert.equal((await state()).validation.requiredCount, 0);
  pass("U06a UI save/reload → revision → EngineInput/adapter → new proposal → independent validator → applied Draft and HTTP validation at 10 minutes; old proposal and edit rejected");

  // A corrupt candidate fails after attempting the overlay, and rolls back everything.
  const rev = (await db.query("SELECT r.* FROM plans p JOIN plan_config_revisions r ON r.id=p.current_config_revision_id WHERE p.id=$1", [planId])).rows[0];
  const durable = async () => (await db.query("SELECT to_jsonb(p) p,(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM plan_config_revisions r WHERE plan_id=$1) revisions,(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM assisted_planning_sessions s WHERE plan_id=$1) sessions FROM plans p WHERE id=$1", [planId])).rows;
  const beforeFailure = await durable();
  await db.query("BEGIN; SET LOCAL ROLE service_role");
  try { await assert.rejects(() => db.query("SELECT public.apply_day_config_operation_v4($1,$2,'EDIT',$3,$4,$5,$6,$5,$6,'{}')", [planId, users.production.id, { roundPreparation: { ...target(lanes[0]), preparationMinutesBetweenRounds: 0 }, expectedRevisionId: Number(rev.id) }, rev.id, rev.identity_json, rev.replay_snapshot_json]), /STALE_ROUND_PREPARATION_CANDIDATE/); }
  finally { await db.query("ROLLBACK"); }
  assert.deepEqual(await durable(), beforeFailure);
  await assert.rejects(() => db.query("UPDATE plans SET round_preparation_overrides='[]' WHERE id=$1", [planId]), /REQUIRES_VERSIONED_OPERATION/);
  await assert.rejects(() => db.query("UPDATE plans SET planner_next_configuration='{}' WHERE id=$1", [planId]), /IMMUTABLE/);

  for (const lane of lanes) assert.equal((await edit(lane, 0, "admin")).status, 200);
  assert.ok((await view()).lanes.filter((lane: any) => lane.policyId === policyId).every((lane: any) => lane.preparationMinutesBetweenRounds === 0));
  assert.equal((await state()).session.draftValidationId, null);
  assert.equal((await api(`${assisted}/accept-stage`, "POST", { ...guard(await state()), confirmation: "NONE" })).status, 409);
  await page.reload(); await editor.waitFor();
  for (const lane of lanes) {
    const card = page.locator(`[data-testid="round-preparation-lane"][data-space-id="${lane.spaceId}"]`);
    await card.getByRole("button", { name: "Restaurar original del día", exact: true }).click();
    const restored = page.waitForResponse(response => response.url().endsWith(`/api${day}/restore`) && response.request().method() === "POST");
    await page.getByRole("alertdialog").getByRole("button", { name: "Restaurar", exact: true }).click(); assert.equal((await restored).status(), 200);
    await card.getByText("Original del día", { exact: true }).waitFor();
  }
  assert.deepEqual(await buildInput(), originalInput);
  assert.deepEqual(await protectedMaterial(), before);
  // Return the owned rehearsal to its original S0 through the existing guarded
  // workflow; manual reset does not support all proposal-derived assignments.
  const reset = await api(`${assisted}/restart`, "POST", { ...guard(await state()), confirmation: "RESTART_BOOTSTRAP" }); assert.equal(reset.status, 200, JSON.stringify(reset));
  assert.ok((await state()).draft.tasks.every((task: any) => task.startPlanned === null && task.endPlanned === null));
  assert.deepEqual(await protectedMaterial(), before);
  const viewer = await page.context().browser()!.newPage();
  try {
    await viewer.goto(`${appUrl}/login`); await viewer.getByLabel("Email", { exact: true }).fill(users.viewer.email);
    await viewer.getByLabel("Contraseña (opcional para enlace)", { exact: true }).fill(users.viewer.password);
    await viewer.getByRole("button", { name: "Entrar con contraseña", exact: true }).click(); await viewer.waitForURL("**/dashboard");
    await viewer.goto(`${appUrl}/plans/${planId}?tab=configuration`); await viewer.getByTestId("round-preparation-editor").waitFor();
    assert.equal(await viewer.getByTestId("round-preparation-editor").getByRole("spinbutton").count(), 0);
  } finally { await viewer.close(); }
  const revisionRows = (await db.query("SELECT id,source,fingerprint,diff_json FROM plan_config_revisions WHERE plan_id=$1 ORDER BY id", [planId])).rows;
  const report = { status: "PASS", remoteWrites: 0, policyId, baselineMinutes: 5, editedMinutes: 10, zero: "EXPLICIT", lanes: lanes.length, revisionRows,
    baselineProposalRunId: baselineProposal.runId, editedProposalRunId: next.runId, staleProposal: stale.status, staleEdit: staleEdit.status,
    occupations: witness.roundPreparations, independentValidation: validation, restoredInputIdentical: true, protectedMaterialUnchanged: true, failedWriteAtomic: true };
  writeFileSync(`${directory}/round-preparation.json`, JSON.stringify(report, null, 2));
  pass("U06a admin/production/viewer, zero, failed save rollback, immutable baseline, per-lane UI restore, identical effective replay and historical/protected rows unchanged");
  await page.goto(`${appUrl}/plans/${planId}?tab=planning`); await page.getByTestId("assisted-workspace").waitFor();
  return report;
}
