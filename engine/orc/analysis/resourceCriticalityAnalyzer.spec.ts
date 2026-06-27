import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalState } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { analyzeOperationalState } from "./operationalStateAnalyzer";
import { analyzeResourceCriticality } from "./resourceCriticalityAnalyzer";

const state = (overrides: Partial<OperationalState> = {}): OperationalState => ({
  id: "state:test", planId: 1, workDay: null, planning: [], tasks: [], resources: [],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {}, cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} }, source: "EngineInput", schemaVersion: "ORC-SPEC-01", ...overrides,
});

const task = (id: number, extra = {}) => ({ id, planId: 1, templateId: id, status: "pending" as const, ...extra });
const resource = (id: number) => ({ id, resourceItemId: id * 10, typeId: 1, name: `R${id}`, isAvailable: true });

test("Resource Criticality Analyzer supports an empty analysis", () => {
  const analysis = analyzeOperationalState(state());
  assert.deepEqual(analyzeResourceCriticality(analysis), { resources: [] });
});

test("Resource Criticality Analyzer explains a single resource", () => {
  const analysis = analyzeOperationalState(state({ resources: [resource(1)], tasks: [task(1)], planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResourceIds: [1], spaceId: 1 }] }));
  assert.deepEqual(analysis.resourceCriticalityAnalysis.resources, [{ resourceId: "1", criticalityScore: 2, contributingFactors: ["planned-task-count:1", "relative-scarcity:single-resource-pool"], explanation: "Resource 1 criticality is 2. Evidence: plannedTaskIds=[1], overloaded=false, totalResourceCount=1, assignedResourceCount=1, dependencyLinkedTaskCount=0." }]);
});

test("Resource Criticality Analyzer ranks multiple resources deterministically", () => {
  const analysis = analyzeOperationalState(state({
    resources: [resource(3), resource(1), resource(2)],
    tasks: [task(1), task(2), task(3)],
    dependencies: [{ taskId: 2, dependsOnTaskIds: [1], dependsOnTemplateIds: [] }],
    planning: [
      { taskId: 2, startPlanned: "09:05", endPlanned: "09:20", assignedResourceIds: [2], spaceId: 1 },
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [1], spaceId: 1 },
      { taskId: 3, startPlanned: "09:10", endPlanned: "09:40", assignedResourceIds: [1], spaceId: 1 },
    ],
  }));
  assert.deepEqual(analysis.resourceCriticalityAnalysis.resources.map((item) => item.resourceId), ["1", "2", "3"]);
  assert.deepEqual(analysis.resourceCriticalityAnalysis.resources.map((item) => item.criticalityScore), [7, 2, 0]);
});

test("Resource Criticality Analyzer breaks ties by resource id", () => {
  const analysis = analyzeOperationalState(state({ resources: [resource(8), resource(4)], tasks: [task(1), task(2)], planning: [
    { taskId: 2, startPlanned: "10:00", endPlanned: "10:10", assignedResourceIds: [8], spaceId: 1 },
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResourceIds: [4], spaceId: 1 },
  ] }));
  assert.deepEqual(analysis.resourceCriticalityAnalysis.resources.map((item) => item.resourceId), ["4", "8"]);
});

test("Resource Criticality Analyzer is deterministic, structurally equal and serializable", () => {
  const input = analyzeOperationalState(state({ resources: [resource(1)], tasks: [task(1)], planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResourceIds: [1], spaceId: 1 }] }));
  const first = analyzeResourceCriticality(input);
  const second = analyzeResourceCriticality(input);
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify(first), stableStringify(JSON.parse(JSON.stringify(first))));
});

test("Resource Criticality Analyzer does not mutate its input", () => {
  const input = analyzeOperationalState(state({ resources: [resource(1)], tasks: [task(1)], planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResourceIds: [1], spaceId: 1 }] }));
  const before = stableStringify(input);
  analyzeResourceCriticality(input);
  assert.equal(stableStringify(input), before);
});
