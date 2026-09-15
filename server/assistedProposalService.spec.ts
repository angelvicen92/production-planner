import assert from "node:assert/strict";
import test from "node:test";
import type { AssistedPlanningResult, AssistedProblem } from "../engine/planner-next/assistedPlanning";
import { createSupportedEngineInputAdapterFixture } from "../engine/planner-next/integration/engineInputAdapter.fixture";
import type { IStorage } from "./storage";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";
import type {
  AssistedProposalRunAccess,
  AssistedProposalServiceDependencies,
} from "./assistedProposalService";

process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
const { AssistedProposalError, AssistedProposalService } = await import("./assistedProposalService");

const planId = 701;
const request = { selector: { kind: "TASK_IDS" as const, taskIds: [101] }, includePrerequisites: false,
  expectedDraftFingerprint: "a".repeat(64), expectedBaseStageId: 4 };
const input = createSupportedEngineInputAdapterFixture();
const baseSnapshot = buildAssistedPlanningSnapshotV1(input.tasks.map((task) => ({
  id: task.id,
  startPlanned: task.id === 105 ? "10:00" : null,
  endPlanned: task.id === 105 ? "10:30" : null,
  zoneId: task.zoneId ?? null,
  spaceId: task.spaceId ?? null,
})), [{blockId:"block:proposal-preserved",memberTaskIds:[101,102],scopeProvenance:{kind:"TASK_IDS"},spaceId:null,activityTemplateId:1,order:0}]);
const session = {
  id: 7, planId, status: "ACTIVE", activeStageId: 4, draftBaseStageId: 4, currentConfigRevisionId: 8,
  draftFingerprint: fingerprintAssistedPlanningSnapshotV1(baseSnapshot),
  draftSnapshotJson: buildAssistedPlanningSnapshotV1(input.tasks.map((task) => ({
    id: task.id, startPlanned: task.id === 103 ? "11:00" : null, endPlanned: task.id === 103 ? "11:30" : null,
  }))),
};
const stage = { id: 4, sessionId: 7, planId, snapshotFingerprint: session.draftFingerprint, snapshotJson: baseSnapshot };

function access(overrides: Partial<AssistedProposalRunAccess> = {}): AssistedProposalRunAccess {
  return {
    create: async () => ({data:{id:9},error:null}), find: async () => ({data:null,error:null}),
    fail: async () => ({error:null}), finish: async () => ({error:null}), apply: async () => ({error:null}), ...overrides,
  };
}

function storage(reads: Record<string, (...args: unknown[]) => Promise<unknown>>, writes: string[]): IStorage {
  return new Proxy({}, {
    get(_target, property: string) {
      if (reads[property]) return reads[property];
      return async () => { writes.push(property); throw new Error(`unexpected storage call: ${property}`); };
    },
  }) as IStorage;
}

function dependencies(fingerprint = "B"): AssistedProposalServiceDependencies {
  return {
    buildInput: async () => structuredClone(input),
    buildConfigRevision: ({planId: revisionPlanId}) => ({
      contractVersion: 1, planId: revisionPlanId, components: [], configurationFingerprint: fingerprint,
    }),
  };
}

const evidence = (proposal: boolean): AssistedPlanningResult["evidence"] => ({
  scopeTaskCount: 1, scopeTaskIds: ["task:101"], supportingTaskIds: ["task:102"],
  protectedPlacementCount: 1, protectedPlacementsPreserved: true, proposalCount: proposal ? 1 : 0,
  completeForScope: proposal, hardValid: proposal, requiredValid: proposal, fingerprint: proposal ? "engine" : null,
  work: {}, causalDiagnostic: null, reasonCodes: [proposal ? "ASSISTED_SCOPE_COMPLETE" : "ASSISTED_SCOPE_INCOMPLETE"],
});

function runRecord() {
  return { id: 9, assisted_session_id: 7, config_revision_id: 8, base_stage_id: 4,
    scope_json: { selector: request.selector }, scope_task_ids_json: [101], include_prerequisites: false };
}

function runStorage(writes: string[], persistedFingerprint = "B"): IStorage {
  return storage({
    getActiveAssistedPlanningSession: async () => session,
    getPlanOptimizerSnapshot: async () => ({}),
    getPlanTaskTemplateSnapshots: async () => [],
    getPlanConfigRevision: async () => ({ planId, fingerprint: persistedFingerprint }),
    getAssistedPlanningStage: async () => stage,
  }, writes);
}

test("request requires an ACTIVE session before creating or scheduling a run", async () => {
  let created=0; let deferred=0;
  const runs=access({create:async()=>{created++;return {data:{id:9},error:null};}});
  const service=new AssistedProposalService(storage({getActiveAssistedPlanningSession:async()=>null},[]),()=>{deferred++;},runs);
  await assert.rejects(service.request(planId,request),(error:unknown)=>error instanceof AssistedProposalError&&error.code==="RUN_SESSION_MISMATCH");
  assert.equal(created,0); assert.equal(deferred,0);
});

test("request captures the exact assisted authorities, creates one run, and schedules one deferred job without product writes", async () => {
  const writes: string[] = []; const creates: Record<string, unknown>[] = []; const deferred: Array<() => void> = [];
  const active = { ...session, draftFingerprint: request.expectedDraftFingerprint };
  const cleanStage = { ...stage, snapshotFingerprint: request.expectedDraftFingerprint };
  const service = new AssistedProposalService(storage({
    getActiveAssistedPlanningSession: async () => active,
    getAssistedPlanningStage: async () => cleanStage,
  }, writes), (work) => deferred.push(work), access({
    create: async (values) => { creates.push(values); return { data: { id: 9 }, error: null }; },
  }), undefined, dependencies());

  assert.deepEqual(await service.request(planId, request), { runId: 9 });
  assert.equal(creates.length, 1); assert.equal(deferred.length, 1); assert.deepEqual(writes, []);
  assert.deepEqual(creates[0], {
    plan_id: planId, status: "running", engine: "planner-next", execution_kind: "ASSISTED_SCOPE",
    assisted_session_id: 7, base_stage_id: 4, config_revision_id: 8,
    scope_json: { selector: request.selector, metadata: {} },
    scope_task_ids_json: [101], include_prerequisites: false,
    source_draft_fingerprint: request.expectedDraftFingerprint,
  });
});

test("a deferred execution failure marks the returned run failed exactly once and makes no product write", async () => {
  const writes: string[] = []; const deferred: Array<() => void> = []; let failures = 0;
  let failed!: () => void; const failureObserved = new Promise<void>((resolve) => { failed = resolve; });
  const active = { ...session, draftFingerprint: request.expectedDraftFingerprint };
  const cleanStage = { ...stage, snapshotFingerprint: request.expectedDraftFingerprint };
  const runs = access({
    find: async () => { throw new Error("deferred boom"); },
    fail: async (_plan, runId, message) => { failures++; assert.equal(runId, 9); assert.equal(message, "deferred boom"); failed(); return {error:null}; },
  });
  const service = new AssistedProposalService(storage({
    getActiveAssistedPlanningSession: async () => active, getAssistedPlanningStage: async () => cleanStage,
  }, writes), (work) => deferred.push(work), runs, undefined, dependencies());

  assert.deepEqual(await service.request(planId, request), { runId: 9 });
  assert.equal(deferred.length, 1); deferred[0]!(); await failureObserved;
  assert.equal(failures, 1); assert.deepEqual(writes, []);
});

test("run fails closed on a stale effective config before invoking Planner Next or finish", async () => {
  const writes: string[] = []; let runnerCalls=0; let finishes=0;
  const service = new AssistedProposalService(runStorage(writes,"A"), queueMicrotask, access({
    find: async () => ({data:runRecord(),error:null}), finish: async()=>{finishes++;return {error:null};},
  }), (()=>{runnerCalls++;throw new Error("runner must not execute");}), dependencies("B"));
  await assert.rejects(service.run(planId,9),(error:unknown)=>error instanceof AssistedProposalError&&error.code==="STALE_CONFIG_REVISION");
  assert.deepEqual({runnerCalls,finishes,writes},{runnerCalls:0,finishes:0,writes:[]});
});

test("run derives protected placements only from the base stage and preserves their exact identity and interval", async () => {
  const writes: string[] = []; let captured: AssistedProblem | undefined; let finished: AssistedPlanningResult | undefined;
  const runner = (problem: AssistedProblem): AssistedPlanningResult => {
    captured = problem;
    const task = problem.problem.tasks.find(({id})=>id==="task:101")!;
    return { proposal: [{...task,start:660,end:690}], evidence:evidence(true) };
  };
  const service = new AssistedProposalService(runStorage(writes),queueMicrotask,access({
    find:async()=>({data:runRecord(),error:null}),finish:async(_plan,_run,result)=>{finished=result as unknown as AssistedPlanningResult;return {error:null};},
  }),runner,dependencies());
  const result=await service.run(planId,9);
  assert.deepEqual(captured?.protectedPlacements.map(({id,start,end})=>({id,start,end})),[{id:"task:105",start:600,end:630}]);
  assert.equal(captured?.protectedPlacements.some(({id})=>id==="task:103"),false);
  assert.equal(result.outcome,"PROPOSAL"); assert.ok(result.proposedDraftFingerprint); assert.ok(finished); assert.deepEqual(writes,[]);
  assert.deepEqual(result.proposedDraftSnapshot?.planningBlocks,baseSnapshot.planningBlocks);
});

test("NO_PROPOSAL and UNSUPPORTED each persist one causal result without product writes", async () => {
  for (const outcome of ["NO_PROPOSAL", "UNSUPPORTED"] as const) {
    const writes: string[]=[]; let finishes=0; let runnerCalls=0;
    const defaults=dependencies();
    const deps: AssistedProposalServiceDependencies = outcome === "UNSUPPORTED" ? { ...defaults,
      buildInput:async()=>{const unsupported=structuredClone(input);delete unsupported.plannerNext;return unsupported;} } : defaults;
    const runner=(_problem:AssistedProblem):AssistedPlanningResult=>{runnerCalls++;return {proposal:null,evidence:evidence(false)};};
    const service=new AssistedProposalService(runStorage(writes),queueMicrotask,access({
      find:async()=>({data:runRecord(),error:null}),finish:async(_plan,_run,result)=>{finishes++;assert.equal(result.outcome,outcome);assert.equal(result.proposal,null);return {error:null};},
    }),runner,deps);
    assert.equal((await service.run(planId,9)).outcome,outcome);
    assert.equal(finishes,1); assert.equal(runnerCalls,outcome==="NO_PROPOSAL"?1:0); assert.deepEqual(writes,[]);
  }
});

test("apply performs one RPC, sends only optimistic guards, and propagates stale without lateral writes", async () => {
  let applies=0; let creates=0; let failures=0; let finishes=0;
  const runs=access({
    create:async()=>{creates++;return {data:{id:1},error:null};}, fail:async()=>{failures++;return {error:null};},
    finish:async()=>{finishes++;return {error:null};},
    apply:async parameters=>{applies++;assert.deepEqual(parameters,{p_plan_id:planId,p_run_id:9,p_expected_fingerprint:"a".repeat(64),p_expected_base:4});return {error:{message:"STALE_DRAFT"}};},
  });
  const service=new AssistedProposalService(storage({},[]),queueMicrotask,runs);
  await assert.rejects(service.apply(planId,9,"a".repeat(64),4),(error:unknown)=>error instanceof AssistedProposalError&&error.code==="STALE_DRAFT");
  assert.deepEqual({applies,creates,failures,finishes},{applies:1,creates:0,failures:0,finishes:0});
});

test("get rejects a run belonging to another plan or execution kind as RUN_NOT_FOUND", async () => {
  const service=new AssistedProposalService(storage({},[]),queueMicrotask,access({find:async()=>({data:null,error:null})}));
  await assert.rejects(service.get(702,9),(error:unknown)=>error instanceof AssistedProposalError&&error.code==="RUN_NOT_FOUND");
});
