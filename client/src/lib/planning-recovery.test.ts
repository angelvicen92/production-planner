import assert from "node:assert/strict";
import test from "node:test";
import {
  isAbortLikeError,
  normalizeRecoverablePlanningStatus,
  persistActivePlanningRunId,
  persistCancelledPlanningRunId,
  readActivePlanningRunId,
  readCancelledPlanningRunId,
  shouldRecoverPlanningRun,
  shouldShowFinalPlanLoadError,
} from "./planning-recovery";

test("AbortError during load is recoverable rather than a final plan error", () => {
  assert.equal(isAbortLikeError(new DOMException("The operation was aborted.", "AbortError")), true);
  assert.equal(isAbortLikeError(new Error("signal is aborted without reason")), true);
  assert.equal(shouldShowFinalPlanLoadError(new Error("signal is aborted without reason"), false), false);
});

test("an active run is persisted and recovered on remount", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  persistActivePlanningRunId(189, 45, storage);
  assert.equal(readActivePlanningRunId(189, storage), 45);
  persistActivePlanningRunId(189, null, storage);
  assert.equal(readActivePlanningRunId(189, storage), null);
});

test("running and success runs recover to operational states while backend failure stays final", () => {
  assert.equal(normalizeRecoverablePlanningStatus("running"), "running");
  assert.equal(normalizeRecoverablePlanningStatus("success"), "success");
  assert.equal(normalizeRecoverablePlanningStatus("failed"), "failed");
  assert.equal(shouldShowFinalPlanLoadError(new Error("backend failed"), false), true);
});


test("cancelled runs clear recovery and are never reattached", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  persistCancelledPlanningRunId(189, 45, storage);
  assert.equal(readCancelledPlanningRunId(189, storage), 45);
  assert.equal(shouldRecoverPlanningRun({ id: 45, status: "running" }, 45), false);
  assert.equal(shouldRecoverPlanningRun({ id: 46, status: "cancelled" }, 45), false);
  assert.equal(shouldRecoverPlanningRun({ id: 47, status: "running", cancelRequestedAt: "2026-06-10T10:00:00Z" }, 45), false);
  assert.equal(shouldRecoverPlanningRun({ id: 48, status: "running" }, 45), true);
});
