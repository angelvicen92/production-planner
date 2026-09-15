import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { IStorage } from "./storage";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";

process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
const { AssistedPlanningError, AssistedPlanningService } = await import("./assistedPlanningService");

const sql = await readFile(new URL("../supabase/migrations/078_assisted_planning_workflow.sql", import.meta.url), "utf8");
const schema = await readFile(new URL("../shared/schema.ts", import.meta.url), "utf8");
const serviceSource = await readFile(new URL("./assistedPlanningService.ts", import.meta.url), "utf8");
const routes = await readFile(new URL("./routes.ts", import.meta.url), "utf8");
const compactSql = sql.replace(/\s+/g, " ");

const draft = buildAssistedPlanningSnapshotV1([
  { id: 11, startPlanned: "09:00", endPlanned: "09:30", zoneId: 1, spaceId: 2, locationLabel: "A", durationOverride: 30, camerasOverride: 1 },
  { id: 12, startPlanned: "10:00", endPlanned: "10:45", zoneId: 3, spaceId: 4, locationLabel: "B", durationOverride: null, camerasOverride: 2 },
]);
const baseSession = {
  id: 7, planId: 5, status: "ACTIVE", activeStageId: 20, draftBaseStageId: 20,
  currentConfigRevisionId: 30, draftScopeJson: {}, draftSnapshotJson: draft,
  draftFingerprint: fingerprintAssistedPlanningSnapshotV1(draft), draftValidationId: 40,
  createdAt: new Date(0), updatedAt: new Date(0),
};
const activeStage = { id: 20, sessionId: 7, ordinal: 0 };
const validation = { id: 40, sessionId: 7, draftFingerprint: baseSession.draftFingerprint };
const history = [activeStage, { id: 21, sessionId: 7, ordinal: 1 }];

type RpcCall = { name: string; parameters: Record<string, unknown> };
function harness(options: { session?: any; rpcError?: unknown } = {}) {
  const calls: RpcCall[] = [];
  const storageWrites: string[] = [];
  const session = options.session === undefined ? baseSession : options.session;
  const reads: Record<string, (...args: any[]) => Promise<any>> = {
    getActiveAssistedPlanningSession: async () => session,
    getAssistedPlanningStage: async () => activeStage,
    listAssistedPlanningStages: async () => history,
    getPlanningStageValidation: async () => validation,
    getTasksForPlan: async () => draft.tasks.map(task => ({ id: task.taskId, status: "pending" })),
  };
  const storage = new Proxy({}, {
    get(_target, property: string) {
      if (reads[property]) return reads[property];
      return async () => { storageWrites.push(property); throw new Error(`unexpected storage call: ${property}`); };
    },
  }) as IStorage;
  const rpc = async (name: string, parameters: Record<string, unknown>) => {
    calls.push({ name, parameters });
    return { error: options.rpcError ?? null };
  };
  return { service: new AssistedPlanningService(storage, rpc), calls, storageWrites };
}

async function expectConflict(action: () => Promise<unknown>, code: string) {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof AssistedPlanningError);
    assert.equal(error.code, code);
    assert.equal(error.status, 409);
    return true;
  });
}

test("start is idempotent for an existing ACTIVE session and does not bootstrap again", async () => {
  const { service, calls, storageWrites } = harness();
  const first = await service.start(5, "user-1");
  const second = await service.start(5, "user-1");
  assert.equal(first.session, baseSession);
  assert.equal(second.session, baseSession);
  assert.deepEqual(calls, []);
  assert.deepEqual(storageWrites, []);
});

test("patch starts from the complete draft, changes only requested tasks, fingerprints it, and uses one RPC", async () => {
  const { service, calls, storageWrites } = harness();
  await service.patchDraft(5, baseSession.draftFingerprint, 20, [{ taskId: 11, startPlanned: "09:15", endPlanned: "09:45" }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "assisted_patch_draft");
  const parameters = calls[0].parameters;
  const snapshot = parameters.p_snapshot as typeof draft;
  assert.deepEqual(snapshot.tasks[0], { ...draft.tasks[0], startPlanned: "09:15", endPlanned: "09:45" });
  assert.deepEqual(snapshot.tasks[1], draft.tasks[1]);
  assert.equal(parameters.p_fingerprint, fingerprintAssistedPlanningSnapshotV1(snapshot));
  assert.deepEqual(parameters, {
    p_plan_id: 5, p_expected_fingerprint: baseSession.draftFingerprint, p_expected_base: 20,
    p_snapshot: snapshot, p_fingerprint: fingerprintAssistedPlanningSnapshotV1(snapshot),
  });
  assert.deepEqual(storageWrites, []);
});

test("unknown and duplicate patch task IDs fail deterministically without RPC", async () => {
  for (const changes of [[{ taskId: 999 }], [{ taskId: 11 }, { taskId: 11 }]]) {
    const { service, calls } = harness();
    await expectConflict(() => service.patchDraft(5, baseSession.draftFingerprint, 20, changes), "TASK_SET_MISMATCH");
    assert.deepEqual(calls, []);
  }
});

test("STALE_DRAFT and STALE_BASE_STAGE RPC failures map to HTTP conflict", async () => {
  for (const code of ["STALE_DRAFT", "STALE_BASE_STAGE"] as const) {
    const { service, calls } = harness({ rpcError: { message: `Postgres: ${code}` } });
    await expectConflict(() => service.patchDraft(5, baseSession.draftFingerprint, 20, [{ taskId: 11, startPlanned:"09:15", endPlanned:"09:45" }]), code);
    assert.equal(calls.length, 1);
  }
});

test("accept passes only the expected plan/fingerprint/base/user to its single atomic RPC", async () => {
  const { service, calls, storageWrites } = harness();
  await service.accept(5, "user-1", "a".repeat(64), 20);
  assert.deepEqual(calls, [{ name: "assisted_accept_stage", parameters: {
    p_plan_id: 5, p_user_id: "user-1", p_expected_fingerprint: "a".repeat(64), p_expected_base: 20,
  } }]);
  assert.deepEqual(storageWrites, []);
});

test("rollback and redo delegate only to assisted_move_stage with unambiguous direction", async () => {
  const rollback = harness();
  await rollback.service.rollback(5, 19);
  assert.deepEqual(rollback.calls, [{ name: "assisted_move_stage", parameters: { p_plan_id: 5, p_target: 19, p_redo: false } }]);
  assert.deepEqual(rollback.storageWrites, []);
  const redo = harness();
  await redo.service.redo(5);
  assert.deepEqual(redo.calls, [{ name: "assisted_move_stage", parameters: { p_plan_id: 5, p_target: null, p_redo: true } }]);
  assert.deepEqual(redo.storageWrites, []);
});

test("state coherently projects the session's active stage, config, draft, validation, and history", async () => {
  const { service } = harness();
  assert.deepEqual(await service.state(5), {
    session: baseSession, activeStage, draft, draftBaseStageId: 20,
    draftFingerprint: baseSession.draftFingerprint, currentConfigRevisionId: 30,
    validation, history,
  });
});

test("accept locks the ACTIVE session and checks base, fingerprint, and validation before snapshot mutation", () => {
  const accept = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.assisted_accept_stage"), sql.indexOf("CREATE OR REPLACE FUNCTION public.assisted_move_stage"));
  assert.match(accept, /status='ACTIVE' FOR UPDATE/);
  for (const gate of ["STALE_BASE_STAGE", "STALE_DRAFT", "VALIDATION_REQUIRED", "STALE_VALIDATION", "VALIDATION_NOT_ACCEPTABLE"])
    assert.ok(accept.indexOf(gate) > 0 && accept.indexOf(gate) < accept.indexOf("PERFORM assisted_apply_snapshot"), gate);
  assert.match(accept, /EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'CONCURRENT_ACCEPT'/);
});

test("snapshot application fails closed on task-set mismatch and owns only assisted columns", () => {
  const apply = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.assisted_apply_snapshot"), sql.indexOf("CREATE OR REPLACE FUNCTION public.assisted_bootstrap_session"));
  assert.match(apply, /expected_ids IS DISTINCT FROM actual_ids[\s\S]*TASK_SET_MISMATCH/);
  for (const column of ["start_planned", "end_planned", "zone_id", "space_id", "location_label", "duration_override", "cameras_override"])
    assert.ok(apply.includes(column), column);
  for (const forbidden of ["status=", "start_real", "end_real", "comment", "pause"])
    assert.equal(apply.includes(forbidden), false, forbidden);
});

test("rollback/redo preserve config, redo follows one live child, and divergence recursively archives rather than deletes", () => {
  const move = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.assisted_move_stage"), sql.indexOf("REVOKE ALL ON FUNCTION"));
  assert.doesNotMatch(move, /current_config_revision_id\s*=/);
  assert.match(move, /parent_stage_id=s\.active_stage_id AND archived_at IS NULL/);
  assert.match(sql, /WITH RECURSIVE obsolete[\s\S]*UPDATE assisted_planning_stages SET archived_at=now\(\)/);
  assert.doesNotMatch(sql, /DELETE FROM assisted_planning_stages/);
});

test("one-live-child constraint has identical migration and Drizzle semantics", () => {
  assert.match(compactSql, /CREATE UNIQUE INDEX assisted_planning_stages_one_live_child ON public\.assisted_planning_stages\(session_id, parent_stage_id\) WHERE archived_at IS NULL AND parent_stage_id IS NOT NULL/);
  assert.match(schema.replace(/\s+/g, " "), /uniqueIndex\("assisted_planning_stages_one_live_child"\)\.on\(table\.sessionId, table\.parentStageId\)\.where\(sql`\$\{table\.archivedAt\} IS NULL AND \$\{table\.parentStageId\} IS NOT NULL`\)/);
});

test("ACL denies direct helper execution and exposes only the four workflow entries to service_role", () => {
  const serviceRoleRevoke = compactSql.match(/REVOKE ALL ON FUNCTION ([^;]+) FROM service_role;/)?.[1] ?? "";
  const serviceRoleGrant = compactSql.match(/GRANT EXECUTE ON FUNCTION ([^;]+) TO service_role;/)?.[1] ?? "";
  for (const fn of ["assisted_apply_snapshot", "assisted_bootstrap_session", "assisted_patch_draft", "assisted_accept_stage", "assisted_move_stage"])
    assert.ok(serviceRoleRevoke.includes(fn), `revoke ${fn}`);
  assert.equal(serviceRoleGrant.includes("assisted_apply_snapshot"), false);
  for (const fn of ["assisted_bootstrap_session", "assisted_patch_draft", "assisted_accept_stage", "assisted_move_stage"])
    assert.ok(serviceRoleGrant.includes(fn), `grant ${fn}`);
  assert.match(compactSql, /REVOKE ALL ON FUNCTION [^;]+ FROM PUBLIC,anon,authenticated;/);
});

test("API remains globally authenticated/authorized and exposes no proposal operation", () => {
  for (const suffix of ["assisted\"", "assisted/session", "assisted/draft", "assisted/accept-stage", "assisted/rollback", "assisted/redo", "assisted/history"])
    assert.ok(routes.includes(suffix), suffix);
  assert.doesNotMatch(serviceSource, /planning_runs/i);
  assert.match(routes, /app\.use\("\/api"[\s\S]*requireAuth/);
  assert.match(routes, /writePlansPrefixes = \["\/plans", "\/locks"\]/);
});
