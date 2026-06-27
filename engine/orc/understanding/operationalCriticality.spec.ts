import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalState } from "../contracts";
import { createInitialCognitiveState } from "../cognitive/cognitiveState";
import { buildSearchAndExplorationUnderstanding } from "../search/searchAndExplorationEngine";
import { buildOperationalCriticality, understandOperationalCriticality } from "./operationalCriticality";

const state = (overrides: Partial<OperationalState> = {}): OperationalState => ({
  id: "state:1",
  planId: 1,
  workDay: { start: "09:00", end: "12:00" },
  planning: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [1], spaceId: 10 },
    { taskId: 2, startPlanned: "09:30", endPlanned: "10:00", assignedResourceIds: [1], spaceId: 10 },
  ],
  tasks: [
    { id: 1, planId: 1, templateId: 1, contestantId: 100, status: "pending" },
    { id: 2, planId: 1, templateId: 2, contestantId: 100, status: "pending" },
  ],
  resources: [{ id: 1, resourceItemId: 1, typeId: 1, name: "Camera A", isAvailable: true }],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [],
  locks: [],
  constraints: {},
  operationalMetrics: {},
  cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
  source: "EngineInput",
  schemaVersion: "ORC-SPEC-01",
  ...overrides,
});

test("builds a deterministic model for a simple day", () => {
  const model = buildOperationalCriticality(state());
  assert.equal(model.criticalResources[0]?.resourceId, 1);
  assert.equal(model.criticalTalents[0]?.contestantId, 100);
  assert.equal(model.criticalSpaces[0]?.spaceId, 10);
  assert.equal(model.futureFreedom.workDayMinutes, 180);
});

test("identifies complex day pressure across multiple resources, dependencies and spaces", () => {
  const model = buildOperationalCriticality(state({
    planning: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "10:00", assignedResourceIds: [1], spaceId: 10 },
      { taskId: 2, startPlanned: "09:30", endPlanned: "10:30", assignedResourceIds: [1], spaceId: 10 },
      { taskId: 3, startPlanned: "10:30", endPlanned: "11:00", assignedResourceIds: [2], spaceId: 11 },
    ],
    tasks: [
      { id: 1, planId: 1, templateId: 1, contestantId: 100, status: "pending" },
      { id: 2, planId: 1, templateId: 2, contestantId: 100, status: "pending" },
      { id: 3, planId: 1, templateId: 3, contestantId: 200, status: "pending" },
      { id: 4, planId: 1, templateId: 4, contestantId: 200, status: "pending" },
    ],
    resources: [
      { id: 1, resourceItemId: 1, typeId: 1, name: "Camera A", isAvailable: true },
      { id: 2, resourceItemId: 2, typeId: 1, name: "Camera B", isAvailable: true },
    ],
    dependencies: [
      { taskId: 2, dependsOnTaskIds: [1], dependsOnTemplateIds: [] },
      { taskId: 3, dependsOnTaskIds: [2], dependsOnTemplateIds: [] },
    ],
    locks: [{ id: 1, planId: 1, taskId: 1, lockType: "resource", lockedResourceId: 1 }],
  }));
  assert.equal(model.criticalResources[0]?.resourceId, 1);
  assert.deepEqual(model.criticalChains[0]?.taskIds, [1, 2, 3]);
  assert.equal(model.futureFreedom.pendingTaskCount, 1);
  assert.equal(model.futureFreedom.conflictPropagationZones.length > 0, true);
});

test("reports absence of resource, talent, space and chain criticality without planned work", () => {
  const model = buildOperationalCriticality(state({ planning: [], dependencies: [], tasks: [] }));
  assert.deepEqual(model.criticalResources, []);
  assert.deepEqual(model.criticalTalents, []);
  assert.deepEqual(model.criticalSpaces, []);
  assert.deepEqual(model.criticalChains, []);
});

test("is structurally equal, serializable and immutable", () => {
  const original = state();
  const before = JSON.stringify(original);
  const first = buildOperationalCriticality(original);
  const second = buildOperationalCriticality(original);
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.criticalResources), true);
  assert.equal(JSON.stringify(original), before);
});

test("creates reconstructable evidence and stores the model in CognitiveState for SEE consultation", () => {
  const result = understandOperationalCriticality(state(), createInitialCognitiveState(null), "t");
  assert.equal(result.evidence[0]?.kind, "operational-criticality");
  assert.deepEqual(result.cognitiveState?.operationalCriticality, result.operationalCriticality);
  const see = buildSearchAndExplorationUnderstanding(state(), createInitialCognitiveState(null), "t");
  assert.equal(see.informationalOnly, true);
  assert.deepEqual(see.operationalCriticality, result.operationalCriticality);
});
