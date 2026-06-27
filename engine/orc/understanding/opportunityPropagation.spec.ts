import assert from "node:assert/strict";
import test from "node:test";
import type { CognitiveArtifacts, OperationalState, Opportunity } from "../contracts";
import { createInitialCognitiveState } from "../cognitive/cognitiveState";
import { buildSearchAndExplorationUnderstanding } from "../search/searchAndExplorationEngine";
import { structuralEquals } from "../structuralEquality";
import { analyzeOpportunityPropagation, understandOpportunityPropagation } from "./opportunityPropagation";

const cognitive = (opportunities: Opportunity[] = []): CognitiveArtifacts => ({ opportunities, searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} });
const op = (id: string, taskIds: number[]): Opportunity => ({ id, kind: "SPEC", description: null, taskIds, searchSpaceIds: [], evidenceIds: [], metadata: {} });
const state = (overrides: Partial<OperationalState> = {}): OperationalState => ({
  id: "state:opa", planId: 1, workDay: { start: "09:00", end: "13:00" },
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
  resources: [{ id: 1, resourceItemId: 1, typeId: 1, name: "Camera A", isAvailable: true }, { id: 2, resourceItemId: 2, typeId: 1, name: "Camera B", isAvailable: true }],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [{ taskId: 2, dependsOnTaskIds: [1], dependsOnTemplateIds: [] }, { taskId: 3, dependsOnTaskIds: [2], dependsOnTemplateIds: [] }, { taskId: 4, dependsOnTaskIds: [3], dependsOnTemplateIds: [] }],
  locks: [{ id: 1, planId: 1, taskId: 1, lockType: "resource", lockedResourceId: 1 }], constraints: {}, operationalMetrics: {}, cognitive: cognitive(), source: "EngineInput", schemaVersion: "ORC-SPEC-01", ...overrides,
});

test("handles an isolated opportunity with limited propagation", () => {
  const result = analyzeOpportunityPropagation(state({ cognitive: cognitive([op("op:isolated", [4])]) }));
  assert.equal(result[0].opportunityId, "op:isolated");
  assert.deepEqual(result[0].affectedChains, ["chain:1->2->3->4"]);
  assert.ok(result[0].propagationScore < 0.6);
});

test("detects multiple dependencies and elevated propagation", () => {
  const result = analyzeOpportunityPropagation(state({ cognitive: cognitive([op("op:root", [1])]) }))[0];
  assert.deepEqual(result.affectedResources, ["resource:1", "resource:2"]);
  assert.ok(result.propagationScore > 0.5);
  assert.ok(result.estimatedConflictReduction > 0);
  assert.ok(result.estimatedFreedomGain > 0);
});

test("reports null propagation for an unknown task", () => {
  const result = analyzeOpportunityPropagation(state({ cognitive: cognitive([op("op:none", [99])]) }))[0];
  assert.equal(result.propagationScore, 0);
  assert.deepEqual(result.affectedResources, []);
  assert.deepEqual(result.affectedChains, []);
});

test("is deterministic, structurally equal, serializable and immutable without mutating inputs", () => {
  const original = state({ cognitive: cognitive([op("op:root", [1]), op("op:none", [99])]) });
  const before = JSON.stringify(original);
  const first = analyzeOpportunityPropagation(original);
  const second = analyzeOpportunityPropagation(original);
  assert.deepEqual(first, second);
  assert.equal(structuralEquals(first, JSON.parse(JSON.stringify(first))), true);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first[0].affectedResources), true);
  assert.equal(JSON.stringify(original), before);
});

test("creates reconstructable evidence and records knowledge in CognitiveState for SEE consultation", () => {
  const operationalState = state({ cognitive: cognitive([op("op:root", [1])]) });
  const result = understandOpportunityPropagation(operationalState, operationalState.cognitive.opportunities, createInitialCognitiveState(null), "t");
  assert.equal(result.evidence[0].kind, "opportunity-propagation");
  assert.equal(result.evidence[0].data.propagationScore, result.opportunityPropagation[0].propagationScore);
  assert.deepEqual(result.cognitiveState?.opportunityPropagation, result.opportunityPropagation);
  const see = buildSearchAndExplorationUnderstanding(operationalState, createInitialCognitiveState(null), "t");
  assert.deepEqual(see.opportunityPropagation, result.opportunityPropagation);
  assert.ok(see.evidence.some((item) => item.kind === "opportunity-propagation"));
});
