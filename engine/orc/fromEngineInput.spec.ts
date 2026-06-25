import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../types";
import { generatePlanV4 } from "../v4";
import { benchmarkScenarios } from "../v3/benchmarks/scenarios";
import { buildOperationalStateFromEngineInput } from "./adapters/fromEngineInput";
import { structuralEquals } from "./structuralEquality";

const minimalInput = (): EngineInput => ({
  planId: 1,
  workDay: { start: "09:00", end: "11:00" },
  meal: { start: "12:00", end: "13:00" },
  camerasAvailable: 2,
  tasks: [
    { id: 1, planId: 1, templateId: 10, status: "pending", dependsOnTaskIds: [2], startPlanned: "09:00", endPlanned: "09:15", assignedResourceIds: [7], spaceId: 100 },
    { id: 2, planId: 1, templateId: 11, status: "in_progress", startPlanned: "09:15", endPlanned: "09:30" },
    { id: 3, planId: 1, templateId: 12, status: "done" },
  ],
  locks: [{ id: 1, planId: 1, taskId: 2, lockType: "time", lockedStart: "09:15", lockedEnd: "09:30" }],
  zoneResourceAssignments: {}, spaceResourceAssignments: {}, zoneResourceTypeRequirements: {}, spaceResourceTypeRequirements: {}, planResourceItems: [{ id: 7, resourceItemId: 70, typeId: 1, name: "R7", isAvailable: true }], resourceItemComponents: {}, groupingZoneIds: [],
});

test("buildOperationalStateFromEngineInput converts minimal and incomplete input defensively", () => {
  const input = minimalInput();
  const original = JSON.stringify(input);
  const state = buildOperationalStateFromEngineInput(input);
  assert.equal(state.planId, 1);
  assert.deepEqual(state.planning.map((item) => item.taskId), [1, 2]);
  assert.deepEqual(state.tasks.map((task) => [task.id, task.status]), [[1, "pending"], [2, "in_progress"], [3, "done"]]);
  assert.equal(state.locks[0].taskId, 2);
  assert.equal(state.resources[0].id, 7);
  assert.deepEqual(state.dependencies, [{ taskId: 1, dependsOnTaskIds: [2], dependsOnTemplateIds: [] }]);
  assert.equal(JSON.stringify(input), original);
  assert.equal(Object.isFrozen(state.tasks[0]), true);
});

test("buildOperationalStateFromEngineInput is deterministic and copies safely", () => {
  const input = minimalInput();
  const first = buildOperationalStateFromEngineInput(input);
  const second = buildOperationalStateFromEngineInput(input);
  assert.equal(structuralEquals(first, second), true);
  input.tasks[0].status = "cancelled";
  assert.equal(first.tasks[0].status, "pending");
});

test("ORC adapter is not connected to V4 and generatePlanV4 output remains stable", () => {
  const scenario = benchmarkScenarios[0];
  const before = generatePlanV4(scenario.input as EngineInput, { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any).output;
  buildOperationalStateFromEngineInput(scenario.input as EngineInput);
  const after = generatePlanV4(scenario.input as EngineInput, { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any).output;
  assert.deepEqual({ feasible: after.feasible, complete: after.complete, hardFeasible: after.hardFeasible, plannedTasks: after.plannedTasks, unplanned: after.unplanned, warnings: after.warnings, reasons: after.reasons }, { feasible: before.feasible, complete: before.complete, hardFeasible: before.hardFeasible, plannedTasks: before.plannedTasks, unplanned: before.unplanned, warnings: before.warnings, reasons: before.reasons });
});
