import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalState } from "../contracts";
import { structuralEquals, stableStringify } from "../structuralEquality";
import { buildOperationalMap } from "./operationalMap";

const state = (overrides: Partial<OperationalState> = {}): OperationalState => ({
  id: "state:test", planId: 1, workDay: null, planning: [], tasks: [], resources: [],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {}, cognitive: { opportunities: [], searchSpaces: [], candidates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} }, source: "EngineInput", schemaVersion: "ORC-SPEC-01", ...overrides,
});

const task = (id: number, extra = {}) => ({ id, planId: 1, templateId: id, status: "pending" as const, ...extra });

test("OperationalMap supports an empty OperationalState", () => {
  const map = buildOperationalMap(state());
  assert.equal(map.taskCount, 0);
  assert.equal(map.plannedTaskCount, 0);
  assert.equal(map.mainFlow?.configured, false);
  assert.deepEqual(map.resources.assignedResourceIds, []);
});

test("OperationalMap supports a single task and incomplete relations", () => {
  const input = state({ tasks: [task(1)], planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResourceIds: [], spaceId: null }] });
  const before = stableStringify(input);
  const map = buildOperationalMap(input);
  assert.equal(map.taskCount, 1);
  assert.equal(map.plannedTaskCount, 1);
  assert.equal(map.pendingTaskCount, 0);
  assert.equal(stableStringify(input), before);
});

test("OperationalMap summarizes configured main flow gaps deterministically", () => {
  const input = state({
    constraints: { optimizer: { mainZoneId: 10 } },
    tasks: [task(1, { zoneId: 10, contestantId: 1 }), task(2, { zoneId: 10, contestantId: 1 }), task(3, { zoneId: 20 })],
    planning: [
      { taskId: 2, startPlanned: "09:30", endPlanned: "09:45", assignedResourceIds: [3], spaceId: 10 },
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResourceIds: [3], spaceId: 10 },
      { taskId: 3, startPlanned: "09:10", endPlanned: "09:20", assignedResourceIds: [], spaceId: 20 },
    ],
  });
  const first = buildOperationalMap(input);
  const second = buildOperationalMap(input);
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(first.mainFlow?.plannedTaskIds, [1, 2]);
  assert.equal(first.mainFlow?.gapCount, 1);
  assert.equal(first.mainFlow?.internalGapMinutes, 20);
});

test("OperationalMap calculates talent stay, fragmentation and resource overloads", () => {
  const map = buildOperationalMap(state({
    tasks: [task(1, { contestantId: 1 }), task(2, { contestantId: 1 }), task(3, { contestantId: 1 })],
    resources: [{ id: 7, resourceItemId: 70, typeId: 1, name: "R", isAvailable: true }],
    planning: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7], spaceId: 1 },
      { taskId: 2, startPlanned: "09:15", endPlanned: "09:45", assignedResourceIds: [7], spaceId: 2 },
      { taskId: 3, startPlanned: "13:30", endPlanned: "13:45", assignedResourceIds: [], spaceId: 3 },
    ],
  }));
  assert.deepEqual(map.resources.overloadedResourceIds, [7]);
  assert.equal(map.talents.maxStayContestantId, 1);
  assert.equal(map.talents.maxStayMinutes, 285);
  assert.equal(map.fragmentation.totalSpaceSwitches, 2);
});
