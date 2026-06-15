import assert from "node:assert/strict";
import test from "node:test";
import { countRenderedPlanningTasks, derivePlanningReadinessExpectation, evaluatePlanningReadyGate, isTransportOutTask } from "./planning-ready-gate";

const readyInput = {
  currentRunId: 206, latestSuccessRunId: 206, diagnosticsRunId: 206,
  expectedPlannedTasks: 193, expectedUnplannedTasks: 0, expectedTransportOutCount: 19,
  visibleScheduledTasksCount: 193, visibleTransportOutCount: 19, pendingUnplannedCount: 0,
  taskDatasetVersion: "206:193", renderedTaskDatasetVersion: "206:193", exportReady: true,
};

test("delayed OUT tasks keep planning hydration blocked", () => {
  const gate = evaluatePlanningReadyGate({ ...readyInput, visibleScheduledTasksCount: 174, visibleTransportOutCount: 0, pendingUnplannedCount: 19 });
  assert.equal(gate.planningReady, false);
  assert.equal(gate.isWaitingForTransportOutTasks, true);
  assert.equal(gate.missingTransportOutCount, 19);
});

test("expected OUT comes from stable diagnostics, never from the incomplete visual dataset", () => {
  const expectation = derivePlanningReadinessExpectation({
    id: 206,
    plannedTasks: 193,
    unplannedTasks: 0,
    operationalQuality: { counts: { scheduledTasksAnalyzed: 193, transportOutTasksAnalyzed: 19 } },
  }, 206);
  assert.equal(expectation.transportOutTasks, 19);
  assert.equal(expectation.scheduledVisibleTasks, 193);
  assert.equal(countRenderedPlanningTasks(Array.from({ length: 174 }, () => ({ startPlanned: "10:00", endPlanned: "10:05" }))).visibleTransportOutCount, 0);
});

test("complete tasks with stale diagnostics and ready diagnostics with incomplete tasks stay blocked", () => {
  assert.equal(evaluatePlanningReadyGate({ ...readyInput, diagnosticsRunId: 205 }).planningReady, false);
  assert.equal(evaluatePlanningReadyGate({ ...readyInput, visibleScheduledTasksCount: 174, visibleTransportOutCount: 0 }).planningReady, false);
});

test("hydration timeout remains a recoverable gate failure", () => {
  const timedOut = evaluatePlanningReadyGate({ ...readyInput, visibleScheduledTasksCount: 174, visibleTransportOutCount: 0, pendingUnplannedCount: 19 });
  assert.equal(timedOut.planningReady, false);
  assert.equal(timedOut.missingScheduledTasks, 19);
});

test("planning closes only after complete dataset was rendered", () => {
  assert.equal(evaluatePlanningReadyGate(readyInput).planningReady, true);
  assert.equal(evaluatePlanningReadyGate({ ...readyInput, renderedTaskDatasetVersion: "206:174" }).planningReady, false);
});

test("stale diagnostics and unavailable export keep the gate closed", () => {
  assert.equal(evaluatePlanningReadyGate({ ...readyInput, diagnosticsRunId: 205 }).planningReady, false);
  assert.equal(evaluatePlanningReadyGate({ ...readyInput, exportReady: false }).planningReady, false);
});

test("OUT detection prefers structured direction and has a defensive name fallback", () => {
  assert.equal(isTransportOutTask({ transportDirection: "OUT" }), true);
  assert.equal(isTransportOutTask({ template: { name: "Transporte salida" } }), true);
  assert.equal(isTransportOutTask({ template: { name: "Transporte llegada" } }), false);
  assert.deepEqual(countRenderedPlanningTasks([
    { status: "pending", startPlanned: "10:00", endPlanned: "10:30", transportDirection: "out" },
    { status: "pending", startPlanned: null, endPlanned: null },
  ]), { visibleScheduledTasksCount: 1, visibleTransportOutCount: 1, pendingUnplannedCount: 1 });
});
