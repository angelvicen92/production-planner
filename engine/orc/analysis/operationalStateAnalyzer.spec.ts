import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalState } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { analyzeOperationalState } from "./operationalStateAnalyzer";

const state = (overrides: Partial<OperationalState> = {}): OperationalState => ({
  id: "state:test", planId: 1, workDay: null, planning: [], tasks: [], resources: [],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {}, cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} }, source: "EngineInput", schemaVersion: "ORC-SPEC-01", ...overrides,
});

const task = (id: number, extra = {}) => ({ id, planId: 1, templateId: id, status: "pending" as const, ...extra });

test("OperationalAnalysis supports an empty OperationalState", () => {
  const analysis = analyzeOperationalState(state());
  assert.deepEqual(analysis, {
    resourcePressure: { totalResourceCount: 0, resourceIds: [], assignedResourceIds: [], overloadedResourceIds: [], plannedTaskIdsByResourceId: {} },
    continuity: { taskCount: 0, plannedTaskCount: 0, pendingTaskCount: 0, protectedTaskCount: 0, mainFlow: { configured: false, spaceOrZoneId: null, plannedTaskIds: [], firstStart: null, lastEnd: null, internalGapMinutes: 0, gapCount: 0 } },
    fragmentation: { spaceSwitchesByContestantId: {}, totalSpaceSwitches: 0 },
    dependencySummary: { dependencyCount: 0, lockCount: 0, lockedTaskIds: [], taskIdsWithDependencies: [] },
    operationalMargin: { contestantIds: [], stayByContestantId: {}, maxStayContestantId: null, maxStayMinutes: 0 },
    criticalBottleneckAnalysis: { bottlenecks: [] },
    resourceCriticalityAnalysis: { resources: [] },
  });
});

test("OperationalAnalysis supports a simple planned state", () => {
  const analysis = analyzeOperationalState(state({ tasks: [task(1, { contestantId: 10 })], planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResourceIds: [3], spaceId: 1 }] }));
  assert.equal(analysis.continuity.taskCount, 1);
  assert.equal(analysis.continuity.plannedTaskCount, 1);
  assert.equal(analysis.continuity.pendingTaskCount, 0);
  assert.deepEqual(analysis.resourcePressure.assignedResourceIds, [3]);
  assert.deepEqual(analysis.resourcePressure.plannedTaskIdsByResourceId, { 3: [1] });
  assert.equal(analysis.operationalMargin.maxStayMinutes, 10);
});

test("OperationalAnalysis summarizes multiple resources deterministically", () => {
  const analysis = analyzeOperationalState(state({
    tasks: [task(1, { contestantId: 1 }), task(2, { contestantId: 1 }), task(3, { contestantId: 2 })],
    resources: [{ id: 7, resourceItemId: 70, typeId: 1, name: "R7", isAvailable: true }, { id: 3, resourceItemId: 30, typeId: 1, name: "R3", isAvailable: true }],
    planning: [
      { taskId: 2, startPlanned: "09:15", endPlanned: "09:45", assignedResourceIds: [7, 3], spaceId: 2 },
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7], spaceId: 1 },
      { taskId: 3, startPlanned: "10:00", endPlanned: "10:15", assignedResourceIds: [3], spaceId: 1 },
    ],
  }));
  assert.deepEqual(analysis.resourcePressure.assignedResourceIds, [3, 7]);
  assert.deepEqual(analysis.resourcePressure.overloadedResourceIds, [7]);
  assert.deepEqual(analysis.resourcePressure.plannedTaskIdsByResourceId, { 3: [2, 3], 7: [1, 2] });
});

test("OperationalAnalysis is deterministic, structurally equal and serializable", () => {
  const input = state({ tasks: [task(1), task(2)], dependencies: [{ taskId: 2, dependsOnTaskIds: [1], dependsOnTemplateIds: [] }], locks: [{ id: 1, planId: 1, taskId: 1, lockType: "time" }], planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResourceIds: [], spaceId: null }] });
  const first = analyzeOperationalState(input);
  const second = analyzeOperationalState(input);
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify(first), stableStringify(JSON.parse(JSON.stringify(first))));
});

test("OperationalAnalysis does not mutate its input", () => {
  const input = state({ tasks: [task(1, { contestantId: 1 }), task(2, { contestantId: 1 })], planning: [{ taskId: 2, startPlanned: "09:30", endPlanned: "09:40", assignedResourceIds: [2], spaceId: 2 }, { taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResourceIds: [1], spaceId: 1 }] });
  const before = stableStringify(input);
  analyzeOperationalState(input);
  assert.equal(stableStringify(input), before);
});
