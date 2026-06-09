import assert from "node:assert/strict";
import test from "node:test";
import {
  getFrontendStaleAfterMs,
  getPlanningRunCancellationDecision,
  getPlanningRunUiState,
  shouldCancelPlanningRunOnDismiss,
} from "./planning-run-state";

const now = Date.parse("2026-06-07T18:00:00.000Z");

function run(overrides: Record<string, unknown> = {}) {
  return {
    status: "running",
    updatedAt: "2026-06-07T17:59:50.000Z",
    startedAt: "2026-06-07T17:59:00.000Z",
    totalPending: 193,
    plannedCount: 0,
    requestedTimeLimitMs: 30_000,
    ...overrides,
  };
}

test("queued runs remain recoverable and continue polling", () => {
  assert.equal(getPlanningRunUiState(run({ status: "queued" }), now), "active");
});

test("a running run with zero pending work does not keep the UI active", () => {
  assert.equal(getPlanningRunUiState(run({ totalPending: 0 }), now), "no_work");
});

test("success and processed totals finish the modal", () => {
  assert.equal(getPlanningRunUiState(run({ status: "success", plannedCount: 193 }), now), "success");
  assert.equal(getPlanningRunUiState(run({ plannedCount: 193 }), now), "success");
});

test("infeasible, failed, stale and cancelled runs unblock the active state", () => {
  assert.equal(getPlanningRunUiState(run({ status: "infeasible" }), now), "failed");
  assert.equal(getPlanningRunUiState(run({ status: "failed" }), now), "failed");
  assert.equal(getPlanningRunUiState(run({ status: "stale" }), now), "stale");
  assert.equal(getPlanningRunUiState(run({ status: "cancelled" }), now), "cancelled");
});

test("frontend stale timeout uses twice the limit plus margin, capped at five minutes", () => {
  assert.equal(getFrontendStaleAfterMs(30_000), 90_000);
  assert.equal(getFrontendStaleAfterMs(300_000), 300_000);
  assert.equal(getPlanningRunUiState(run({ updatedAt: "2026-06-07T17:58:00.000Z" }), now), "stale");
});

test("dismiss requests cancellation only for active or stale runs", () => {
  assert.equal(shouldCancelPlanningRunOnDismiss(run(), now), true);
  assert.equal(shouldCancelPlanningRunOnDismiss(run({ status: "stale" }), now), true);
  assert.equal(shouldCancelPlanningRunOnDismiss(run({ status: "success" }), now), false);
});

test("backend cancellation is idempotent and never cancels completed or persisting runs", () => {
  assert.equal(getPlanningRunCancellationDecision("running", "optimizing"), "cancel");
  assert.equal(getPlanningRunCancellationDecision("success", "done"), "no_active_run");
  assert.equal(getPlanningRunCancellationDecision("cancelled", "cancelled"), "no_active_run");
  assert.equal(getPlanningRunCancellationDecision("running", "persisting"), "already_finalizing");
});
