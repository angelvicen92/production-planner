import assert from "node:assert/strict";
import test from "node:test";
import {
  PlanningCancelledError,
  assertPlanningRunStateActive,
  buildPlanningCancellationPatch,
  commitPlanningResultSafely,
} from "./planning-run-commit";

test("cancelled planning runs cannot become active for commit", () => {
  assert.throws(
    () => assertPlanningRunStateActive({ id: 7, planId: 3, status: "cancelled" }, 7, 3, "before_success"),
    PlanningCancelledError,
  );
  assert.throws(
    () => assertPlanningRunStateActive({ id: 7, planId: 3, status: "running", cancelRequestedAt: "2026-06-10T10:00:00Z" }, 7, 3, "before_commit"),
    PlanningCancelledError,
  );
});

test("late cancellation prevents writes before commit starts", async () => {
  let writes = 0;
  await assert.rejects(
    commitPlanningResultSafely({
      planningRunId: 7,
      planId: 3,
      assertActive: async () => { throw new PlanningCancelledError(7, "before_commit"); },
      takeSnapshot: async () => [],
      operations: [{ key: "task:1", apply: async () => { writes += 1; } }],
      restoreSnapshot: async () => undefined,
      markSuccess: async () => true,
    }),
    PlanningCancelledError,
  );
  assert.equal(writes, 0);
});

test("cancellation during commit restores the complete snapshot", async () => {
  const values = new Map([[1, "old-1"], [2, "old-2"]]);
  let checks = 0;
  await assert.rejects(
    commitPlanningResultSafely({
      planningRunId: 8,
      planId: 3,
      assertActive: async (phase) => {
        checks += 1;
        if (phase === "before_write:task:2") throw new PlanningCancelledError(8, phase);
      },
      takeSnapshot: async () => new Map(values),
      operations: [
        { key: "task:1", apply: async () => { values.set(1, "new-1"); } },
        { key: "task:2", apply: async () => { values.set(2, "new-2"); } },
      ],
      restoreSnapshot: async (snapshot) => {
        values.clear();
        for (const [key, value] of snapshot as Map<number, string>) values.set(key, value);
      },
      markSuccess: async () => true,
    }),
    PlanningCancelledError,
  );
  assert.ok(checks >= 3);
  assert.deepEqual([...values.entries()], [[1, "old-1"], [2, "old-2"]]);
});

test("failed conditional success update rolls back all applied writes", async () => {
  const values = new Map([[1, "old"]]);
  await assert.rejects(commitPlanningResultSafely({
    planningRunId: 9,
    planId: 3,
    assertActive: async () => undefined,
    takeSnapshot: async () => new Map(values),
    operations: [{ key: "task:1", apply: async () => { values.set(1, "new"); } }],
    restoreSnapshot: async (snapshot) => {
      values.clear();
      for (const [key, value] of snapshot as Map<number, string>) values.set(key, value);
    },
    markSuccess: async () => false,
  }), PlanningCancelledError);
  assert.equal(values.get(1), "old");
});

test("commits for the same plan are serialized so rollback cannot race a retry", async () => {
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const base = (planningRunId: number, operation: () => Promise<void>) => commitPlanningResultSafely({
    planningRunId,
    planId: 55,
    assertActive: async () => undefined,
    takeSnapshot: async () => [],
    operations: [{ key: `task:${planningRunId}`, apply: operation }],
    restoreSnapshot: async () => undefined,
    markSuccess: async () => true,
  });

  const first = base(1, async () => {
    events.push("first:start");
    await firstGate;
    events.push("first:end");
  });
  const second = base(2, async () => { events.push("second"); });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(events, ["first:start"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first:start", "first:end", "second"]);
});


test("running cancellation patch records a complete terminal cancellation", () => {
  const at = "2026-06-10T14:00:00.000Z";
  assert.deepEqual(buildPlanningCancellationPatch(at), {
    status: "cancelled",
    phase: "cancelled",
    message: "Cancelado por el usuario",
    cancel_requested_at: at,
    cancelled_at: at,
    cancel_reason: "user_cancelled",
    finished_at: at,
    last_progress_at: at,
    updated_at: at,
  });
});

test("cancelling a previously empty plan restores null planned values", async () => {
  const state = { start: null as string | null, end: null as string | null };
  await assert.rejects(commitPlanningResultSafely({
    planningRunId: 10,
    planId: 77,
    assertActive: async (phase) => { if (phase === "before_success") throw new PlanningCancelledError(10, phase); },
    takeSnapshot: async () => ({ ...state }),
    operations: [{ key: "task:1", apply: async () => { state.start = "10:00"; state.end = "10:30"; } }],
    restoreSnapshot: async (snapshot) => { Object.assign(state, snapshot); },
    markSuccess: async () => true,
  }), PlanningCancelledError);
  assert.deepEqual(state, { start: null, end: null });
});
