import assert from "node:assert/strict";
import test from "node:test";
import { persistPlanningRunUpdateBestEffort, queuePlanningRunUpdateBestEffort } from "./planning-run-progress";

test("missing progress columns fall back to legacy fields without rejecting generation", async () => {
  const attempts: Record<string, unknown>[] = [];
  const result = await persistPlanningRunUpdateBestEffort({
    planningRunId: 49,
    phase: "scoring_candidates",
    patch: { status: "running", phase: "scoring_candidates", message: "Scoring", phase_progress_pct: 92, progress_history: [] },
    attempt: async (patch) => {
      attempts.push(patch);
      return attempts.length === 1 ? { error: { message: "column progress_history does not exist", code: "42703" } } : { error: null };
    },
    warn: () => undefined,
  });

  assert.deepEqual(result, { ok: true, skipped: false, fallback: true });
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[1], { status: "running", phase: "scoring_candidates", message: "Scoring" });
});

test("a rejected progress chain is recovered before the next update", async () => {
  let updates = 0;
  const chain = queuePlanningRunUpdateBestEffort(
    Promise.reject(new Error("previous update failed")),
    async () => { updates += 1; },
    { planningRunId: 49, phase: "pipeline_builder" },
    () => undefined,
  );

  await assert.doesNotReject(chain);
  assert.equal(updates, 1);
});

test("final success update retries with the minimum legacy success payload", async () => {
  const attempts: Record<string, unknown>[] = [];
  const result = await persistPlanningRunUpdateBestEffort({
    planningRunId: 49,
    phase: "success",
    patch: {
      status: "success",
      planned_count: 12,
      phase: "success",
      phase_progress_pct: 100,
      finished_at: "2026-06-10T10:00:00.000Z",
      updated_at: "2026-06-10T10:00:00.000Z",
      message: null,
    },
    attempt: async (patch) => {
      attempts.push(patch);
      return attempts.length === 1 ? { error: { message: "unknown phase_progress_pct", code: "42703" } } : undefined;
    },
    warn: () => undefined,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(attempts[1], {
    status: "success",
    planned_count: 12,
    phase: "success",
    finished_at: "2026-06-10T10:00:00.000Z",
    updated_at: "2026-06-10T10:00:00.000Z",
    message: null,
  });
});

test("all progress update failures are reported as skipped instead of thrown", async () => {
  const result = await persistPlanningRunUpdateBestEffort({
    planningRunId: 49,
    phase: "persisting_result",
    patch: { status: "running", phase: "persisting_result", phase_progress_pct: 96 },
    attempt: async () => ({ error: { message: "Supabase unavailable", code: "PGRST000" } }),
    warn: () => undefined,
  });

  assert.deepEqual(result, { ok: false, skipped: true, reason: "Supabase unavailable" });
});
