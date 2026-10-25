import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { AssistedAutopilot, isAutopilotClean, type AutopilotApi, type AutopilotState, type AutopilotPlan, type AutopilotRun, type AutopilotProgress } from "./assistedAutopilot";
import type { AssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshotContracts";

const fp = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function harness(options: { ordinal?: number; placed?: number; before?: (operation: string) => Promise<void> | void } = {}) {
  const calls: Array<{ operation: string; body?: any }> = [];
  const updates: AutopilotProgress[] = [];
  const snapshot: AssistedPlanningSnapshotV1 = { contractVersion: 1, tasks: [1, 2, 3].map(taskId => ({ taskId,
    startPlanned: taskId <= (options.placed ?? 1) ? "09:00" : null, endPlanned: taskId <= (options.placed ?? 1) ? "09:15" : null,
    zoneId: 1, spaceId: 1, locationLabel: null, durationOverride: null, camerasOverride: null, assignedResourceIds: [] })) };
  let state: AutopilotState = { session: { id: 10, status: "ACTIVE" }, activeStage: { id: 20, ordinal: options.ordinal ?? 5, snapshotJson: snapshot, snapshotFingerprint: fp(snapshot) },
    draft: snapshot, draftFingerprint: fp(snapshot), draftBaseStageId: 20, currentConfigRevisionId: 30, history: [], acceptedExceptions: [], validation: null };
  state.history = [structuredClone(state.activeStage)];
  let plan: AutopilotPlan = { dailyTasks: snapshot.tasks.map(t => ({ ...t, id: t.taskId, status: "pending", assignedResources: [] })) };
  let run: AutopilotRun;
  let authorized = true, alerts = false, runPending = false;
  let resultEdit: (r: AutopilotRun) => void = () => {};
  const enter = async (operation: string, body?: unknown) => { calls.push({ operation, body }); await options.before?.(operation); };
  const check = (body: any) => { assert.equal(body.expectedDraftFingerprint, state.draftFingerprint); assert.equal(body.expectedBaseStageId, state.draftBaseStageId); };
  const api: AutopilotApi = {
    state: async () => { await enter("state"); return structuredClone(state); },
    plan: async () => { await enter("plan"); return structuredClone(plan); },
    nextScope: async () => { await enter("scope"); const id = state.draft.tasks.find(t => !t.startPlanned)?.taskId; return { selector: id ? { kind: "TASK_IDS", taskIds: [id] } : null, taskIds: id ? [id] : [], expectedDraftFingerprint: state.draftFingerprint, expectedBaseStageId: state.draftBaseStageId }; },
    propose: async body => {
      await enter("propose", body); check(body); assert.equal(body.includePrerequisites, false);
      const id = body.selector.kind === "TASK_IDS" ? body.selector.taskIds[0] : 2;
      const next = structuredClone({ ...state.draft, tasks: state.draft.tasks.map(t => t.taskId === id ? { ...t, startPlanned: "10:00", endPlanned: "10:15" } : t) });
      run = { id: 100 + state.activeStage.ordinal, status: "success", assisted_session_id: 10, base_stage_id: state.draftBaseStageId,
        config_revision_id: state.currentConfigRevisionId, source_draft_fingerprint: state.draftFingerprint,
        assisted_result_json: { contractVersion: 1, outcome: "PROPOSAL", selector: body.selector, scopeTaskIds: [id], includePrerequisites: false,
          proposal: [{ taskId: id, startPlanned: "10:00", endPlanned: "10:15", spaceId: 1, zoneId: 1 }], proposedDraftSnapshot: next, proposedDraftFingerprint: fp(next), reasonCodes: [],
          evidence: { proposalCount: 1, completeForScope: true, protectedPlacementsPreserved: true, hardValid: true, requiredValid: true,
            proposalEligible: true, globalMealGate: "PASS", newHardViolationCount: 0, newRequiredViolationCount: 0, inheritedAcceptedHardViolationCount: 0, inheritedAcceptedRequiredViolationCount: 0 } } };
      resultEdit(run); return { runId: run.id };
    },
    run: async () => { await enter("run"); return structuredClone({ ...run, status: runPending ? "running" : run.status }); },
    apply: async (_id, body) => { await enter("apply", body); check(body); state.draft = structuredClone(run.assisted_result_json!.proposedDraftSnapshot!); state.draftFingerprint = run.assisted_result_json!.proposedDraftFingerprint!; },
    validate: async body => { await enter("validate", body); check(body); state.validation = { id: 40, draftFingerprint: state.draftFingerprint, baseStageId: state.draftBaseStageId, configRevisionId: state.currentConfigRevisionId, hardCount: 0, requiredCount: 0, reportJson: { mode: "PROPOSAL_CERTIFIED_CLEAN_V1", proposalRunId: run.id } }; },
    accept: async body => {
      await enter("accept", body); check(body); assert.equal(body.confirmation, "NONE");
      state.activeStage = { id: state.activeStage.id + 1, ordinal: state.activeStage.ordinal + 1, parentStageId: state.activeStage.id, proposalRunId: run.id, snapshotJson: structuredClone(state.draft), snapshotFingerprint: state.draftFingerprint };
      state.history.push(structuredClone(state.activeStage)); state.draftBaseStageId = state.activeStage.id; state.validation = null;
      plan.dailyTasks = state.draft.tasks.map(t => ({ ...t, id: t.taskId, status: "pending", assignedResources: t.assignedResourceIds }));
    },
  };
  const controller = new AssistedAutopilot(99, api, { authorized: () => authorized, hasPendingAlerts: () => alerts,
    onProgress: p => { updates.push(structuredClone(p)); onProgress(p); }, wait: async () => { runPending = false; await onWait(); } });
  let onProgress = (_p: AutopilotProgress) => {};
  let onWait = async () => {};
  return { controller, api, calls, updates, get state() { return state; }, get plan() { return plan; },
    set authorized(v: boolean) { authorized = v; }, set alerts(v: boolean) { alerts = v; }, set runPending(v: boolean) { runPending = v; },
    set resultEdit(v: typeof resultEdit) { resultEdit = v; }, set onProgress(v: typeof onProgress) { onProgress = v; }, set onWait(v: typeof onWait) { onWait = v; } };
}

test("continues the active checkpoint through real operation order and retains run Evidence", async () => {
  const h = harness(); const before = structuredClone(h.state.activeStage);
  const result = await h.controller.start();
  assert.equal(result.phase, "COMPLETE"); assert.equal(result.stage, 7); assert.equal(result.completed, 3); assert.equal(result.total, 3); assert.ok(result.runId); assert.ok(result.result);
  assert.deepEqual(h.state.history[0], before);
  assert.deepEqual(h.calls.filter(c => ["scope", "propose", "run", "apply", "validate", "accept"].includes(c.operation)).map(c => c.operation), ["scope", "propose", "run", "apply", "validate", "accept", "scope", "propose", "run", "apply", "validate", "accept", "scope"]);
});
test("starts at S0 and confirms persisted completion, rather than exhaustion", async () => {
  const h = harness({ ordinal: 0, placed: 0 }); assert.equal((await h.controller.start()).phase, "COMPLETE"); assert.equal(h.calls.filter(c => c.operation === "accept").length, 3);
});
test('configuration read conflicts stop before proposing and explain the operational cause',async()=>{
 const h=harness({ordinal:0,placed:0});
 h.api.nextScope=async()=>{throw {status:500,code:'PLANNING_CONFIGURATION_CONFLICT',message:'private internals'};};
 const result=await h.controller.start();
 assert.equal(result.phase,'FAILED');assert.equal(result.code,'PLANNING_CONFIGURATION_CONFLICT');
 assert.match(result.message,/configuración del día requiere revisión/);
 assert.doesNotMatch(result.message,/private internals/);
 assert.equal(h.calls.filter(c=>c.operation==='propose').length,0);
});
test("a safe stop finishes only the current stage; a new delegation resumes the checkpoint", async () => {
  const h = harness(); h.onProgress = p => { if (p.phase === "GENERATING" && p.runId && !p.stopRequested) h.controller.requestStop(); };
  const result = await h.controller.start(); assert.equal(result.phase, "STOPPED"); assert.equal(result.stage, 6); assert.equal(h.calls.filter(c => c.operation === "accept").length, 1);
  const next = new AssistedAutopilot(99, h.api, { authorized: () => true, hasPendingAlerts: () => false, onProgress: () => {} });
  assert.equal((await next.start()).phase, "COMPLETE"); assert.equal(h.state.activeStage.ordinal, 7);
});
test("double click and another controller share one delegation and cannot duplicate accepts", async () => {
  let release!: () => void; const held = new Promise<void>(r => { release = r; }); let first = true;
  const h = harness({ before: async op => { if (op === "state" && first) { first = false; await held; } } });
  const started = h.controller.start(); await assert.rejects(() => h.controller.start(), /ALREADY_RUNNING/);
  const other = new AssistedAutopilot(99, h.api, { authorized: () => true, hasPendingAlerts: () => false, onProgress: () => {} });
  await assert.rejects(() => other.start(), /ALREADY_RUNNING/); release(); await started;
  assert.equal(h.calls.filter(c => c.operation === "accept").length, 2);
});
for (const phase of ["GENERATING", "APPLYING", "VALIDATING", "ACCEPTING"] as const) test(`disposal at ${phase} prevents all later mutations`, async () => {
  const h = harness(); h.onProgress = p => { if (p.phase === phase) h.controller.dispose(); };
  await h.controller.start(); assert.equal(h.calls.filter(c => c.operation === "accept").length, 0);
});
test("late acceptance after disposal is preserved once, without background continuation", async () => {
  const h = harness({ before: op => { if (op === "accept") h.controller.dispose(); } });
  await h.controller.start(); assert.equal(h.state.activeStage.ordinal, 6); assert.equal(h.calls.filter(c => c.operation === "accept").length, 1); assert.equal(h.calls.at(-1)?.operation, "accept");
});
for (const change of ["draft", "stage", "config", "live"] as const) test(`polling observes concurrent ${change} changes before applying`, async () => {
  const h = harness(); h.runPending = true; h.onWait = async () => {
    if (change === "draft") h.state.draftFingerprint = "changed";
    if (change === "stage") h.state.draftBaseStageId++;
    if (change === "config") h.state.currentConfigRevisionId++;
    if (change === "live") h.plan.dailyTasks[0].startPlanned = "11:00";
  };
  const result = await h.controller.start(); assert.equal(result.phase, "FAILED"); assert.equal(h.calls.filter(c => c.operation === "apply" || c.operation === "accept").length, 0);
});
for (const failure of ["run", "proposal", "certification", "hard", "required", "exception", "globalMeal", "protected", "scope", "identity"] as const) test(`rejects ${failure} failure without modifying Draft`, async () => {
  const h = harness(); const before = structuredClone(h.state);
  h.resultEdit = r => {
    const result = r.assisted_result_json!;
    if (failure === "run") r.status = "error";
    if (failure === "proposal") (result as any).outcome = "NO_PROPOSAL";
    if (failure === "certification") (result.evidence as any).completeForScope = false;
    if (failure === "hard") (result.evidence as any).hardValid = false;
    if (failure === "required") (result.evidence as any).newRequiredViolationCount = 1;
    if (failure === "exception") (result.evidence as any).inheritedAcceptedHardViolationCount = 1;
    if (failure === "globalMeal") (result.evidence as any).globalMealGate = "FAIL";
    if (failure === "protected") (result.proposedDraftSnapshot!.tasks[0] as any).assignedResourceIds = [9];
    if (failure === "scope") (result as any).scopeTaskIds = [3];
    if (failure === "identity") r.base_stage_id++;
  };
  assert.equal((await h.controller.start()).phase, "FAILED"); assert.deepEqual(h.state, before); assert.equal(h.calls.filter(c => c.operation === "apply").length, 0);
});
test("an unexpectedly empty recommendation is a failure while obligations remain", async () => {
  const h = harness(); h.api.nextScope = async () => ({ selector: null, taskIds: [], expectedDraftFingerprint: h.state.draftFingerprint, expectedBaseStageId: h.state.draftBaseStageId });
  const result = await h.controller.start(); assert.equal(result.code, "EMPTY_SCOPE"); assert.equal(result.phase, "FAILED"); assert.equal(h.calls.filter(c => c.operation === "propose").length, 0);
});
test("manual edits including resources/meals prevent initial delegation", async () => {
  for (const change of ["resource", "meal"]) {
    const h = harness(); h.state.draft = structuredClone(h.state.draft);
    if (change === "resource") (h.state.draft.tasks[0] as any).assignedResourceIds = [9];
    else (h.state.draft as any).operationalMeals = [{ policyId: "meal", startPlanned: "12:00", endPlanned: "12:30" }];
    assert.equal(isAutopilotClean(h.state), false); assert.equal((await h.controller.start()).code, "DIRTY_DRAFT"); assert.equal(h.calls.filter(c => c.operation === "propose").length, 0);
  }
});
test("permissions are checked initially and again before acceptance", async () => {
  const initial = harness(); initial.authorized = false; assert.equal((await initial.controller.start()).code, "UNAUTHORIZED"); assert.deepEqual(initial.calls, []);
  const h = harness(); h.onProgress = p => { if (p.phase === "ACCEPTING") h.authorized = false; };
  assert.equal((await h.controller.start()).code, "UNAUTHORIZED"); assert.equal(h.calls.filter(c => c.operation === "accept").length, 0);
});
for (const fault of ["hard", "required", "revision", "alerts", "mode"] as const) test(`unclean validation (${fault}) retains Draft and never accepts`, async () => {
  const h = harness(); h.onProgress = p => {
    if (p.phase === "VALIDATING" && fault === "alerts") h.alerts = true;
  };
  const validate = h.api.validate; h.api.validate = async body => {
    await validate(body);
    if (fault === "hard") h.state.validation!.hardCount = 1;
    if (fault === "required") h.state.validation!.requiredCount = 1;
    if (fault === "revision") h.state.validation!.configRevisionId++;
    if (fault === "mode") h.state.validation!.reportJson.mode = "MANUAL_STAGE_VALIDATION_V1";
  };
  assert.equal((await h.controller.start()).phase, "FAILED"); assert.equal(h.state.activeStage.ordinal, 5); assert.equal(h.calls.filter(c => c.operation === "accept").length, 0); assert.equal(isAutopilotClean(h.state), false);
});
test("HTTP failure after an accepted response is never retried", async () => {
  const h = harness(); const accept = h.api.accept; h.api.accept = async body => { await accept(body); throw Error("connection lost"); };
  assert.equal((await h.controller.start()).phase, "FAILED"); assert.equal(h.state.activeStage.ordinal, 6); assert.equal(h.calls.filter(c => c.operation === "accept").length, 1);
});
test("no persistent advance stops the loop rather than declaring success", async () => {
  const h = harness(); h.api.accept = async () => {};
  assert.equal((await h.controller.start()).code, "NO_PROGRESS"); assert.equal(h.calls.filter(c => c.operation === "propose").length, 1);
});
test("an aborted read while the real run computes resumes polling, without retrying any mutation", async () => {
  const h = harness(); const readRun = h.api.run; let observations = 0;
  h.api.run = async id => {
    observations++;
    if (observations === 1) return { ...await readRun(id), status: "running" };
    if (observations === 2) throw Object.assign(Error("read deadline"), { name: "AbortError" });
    return readRun(id);
  };
  assert.equal((await h.controller.start()).phase, "COMPLETE"); assert.ok(observations >= 4);
  assert.equal(h.calls.filter(c => c.operation === "propose").length, 2); assert.equal(h.calls.filter(c => c.operation === "accept").length, 2);
});
test("an authoritative polling error stops and retains the checkpoint", async () => {
  const h = harness(); h.api.run = async () => { throw Object.assign(Error("HTTP error"), { status: 500 }); };
  assert.equal((await h.controller.start()).phase, "FAILED"); assert.equal(h.state.activeStage.ordinal, 5); assert.equal(h.calls.filter(c => c.operation === "apply").length, 0);
});
test("polling uses the existing stale-run gate and never calls a stale run completed", async () => {
  const h = harness(); const readRun = h.api.run;
  h.api.run = async id => ({ ...await readRun(id), status: "running", updated_at: "2000-01-01T00:00:00Z" });
  const result = await h.controller.start(); assert.equal(result.phase, "FAILED"); assert.equal(result.code, "RUN_STALE"); assert.equal(h.calls.filter(c => c.operation === "apply").length, 0);
});

test('an admitted operational origin is clean while the historical checkpoint keeps its smaller universe',()=>{
 const h=harness();
 const state=h.state;
 const historical=structuredClone(state.activeStage);
 const expanded=structuredClone(state.draft);
 expanded.tasks.push({...expanded.tasks[1],taskId:4,startPlanned:null,endPlanned:null});
 const projected={...state,draft:expanded,draftFingerprint:fp(expanded),workingOrigin:{snapshot:expanded,fingerprint:fp(expanded)}};
 assert.equal(isAutopilotClean(projected),true);
 assert.deepEqual(state.activeStage,historical);
 assert.equal(isAutopilotClean({...projected,draftFingerprint:'stale'}),false);
});
