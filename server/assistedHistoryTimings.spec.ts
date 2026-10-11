import assert from "node:assert/strict";
import test from "node:test";
process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_ANON_KEY ??= "test-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service";
const { supabaseAdmin } = await import("./supabase");
const { SupabaseStorage } = await import("./storage");
const { AssistedPlanningService } = await import("./assistedPlanningService");

test("history timing read selects only metadata and scopes stages and linked runs to plan and active session", async () => {
  const calls: any[] = [];
  const original = supabaseAdmin.from;
  const results = [
    { data: { id: 42 }, error: null },
    { data: [{ id: 1, ordinal: 0, proposal_run_id: null, accepted_at: "2026-10-11T12:00:00Z" }, { id: 2, ordinal: 1, proposal_run_id: 8, accepted_at: "2026-10-11T12:01:00Z" }, { id: 3, ordinal: 2, proposal_run_id: 9, accepted_at: null }], error: null },
    { data: [{ id: 8, created_at: "2026-10-11T12:00:00Z", started_at: "2026-10-11T12:00:01Z", finished_at: "2026-10-11T12:00:05Z" }], error: null },
  ];
  (supabaseAdmin as any).from = (table: string) => {
    const call = { table, operations: [] as any[] }; calls.push(call);
    const result = results.shift();
    const query: any = { then: (resolve: any) => Promise.resolve(result).then(resolve) };
    for (const method of ["select", "eq", "order", "in", "maybeSingle"]) query[method] = (...args: any[]) => { call.operations.push([method, ...args]); return query; };
    return query;
  };
  try {
    const result = await new SupabaseStorage().getAssistedPlanningHistoryTimings(7);
    assert.deepEqual(calls.map(c => c.operations.find((op: any[]) => op[0] === "select")[1]), ["id", "id,ordinal,accepted_at,proposal_run_id", "id,created_at,started_at,finished_at"]);
    for (const call of calls) assert.ok(call.operations.some((op: any[]) => op[0] === "eq" && op[1] === "plan_id" && op[2] === 7));
    assert.ok(calls[1].operations.some((op: any[]) => op[1] === "session_id" && op[2] === 42));
    assert.ok(calls[2].operations.some((op: any[]) => op[1] === "assisted_session_id" && op[2] === 42));
    assert.deepEqual(calls[2].operations.find((op: any[]) => op[0] === "in"), ["in", "id", [8, 9]]);
    assert.equal(result![0].generation, null); assert.equal(result![1].generation?.durationMs, 4_000); assert.equal(result![1].requestToAcceptance?.durationMs, 60_000);
    assert.deepEqual(result![2], { stageId: 3, generation: null, requestToAcceptance: null }, "unavailable or cross-plan runs cannot produce times");
  } finally { supabaseAdmin.from = original; }
});

test("missing sessions return 404 through the existing service error; no state snapshots or writes are read", async () => {
  const service = new AssistedPlanningService({ getAssistedPlanningHistoryTimings: async () => null } as any);
  await assert.rejects(service.historyTimings(99), (error: any) => error.code === "SESSION_NOT_FOUND" && error.status === 404);
});

test("Stage zero alone skips the planning_runs query and database failures are propagated", async () => {
  const original = supabaseAdmin.from; const tables: string[] = [];
  let fail = false;
  (supabaseAdmin as any).from = (table: string) => {
    tables.push(table);
    const query: any = { then: (resolve: any) => Promise.resolve(fail ? { data: null, error: new Error("read failed") } : { data: table === "assisted_planning_sessions" ? { id: 1 } : [{ id: 1, ordinal: 0 }], error: null }).then(resolve) };
    for (const method of ["select", "eq", "order", "maybeSingle"]) query[method] = () => query;
    return query;
  };
  try {
    assert.deepEqual(await new SupabaseStorage().getAssistedPlanningHistoryTimings(7), [{ stageId: 1, generation: null, requestToAcceptance: null }]);
    assert.deepEqual(tables, ["assisted_planning_sessions", "assisted_planning_stages"]);
    fail = true; await assert.rejects(new SupabaseStorage().getAssistedPlanningHistoryTimings(7), /read failed/);
  } finally { supabaseAdmin.from = original; }
});
