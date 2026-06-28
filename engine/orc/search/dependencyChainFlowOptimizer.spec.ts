import assert from "node:assert/strict";
import test from "node:test";
import type { CognitiveArtifacts, OperationalState } from "../contracts";
import { stableStringify } from "../structuralEquality";
import { applyDependencyChainFlowToReasoningBudgets, optimizeDependencyChainFlow } from "./dependencyChainFlowOptimizer";

const cognitive = (overrides: Partial<CognitiveArtifacts> = {}): CognitiveArtifacts => ({ opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {}, ...overrides });
const task = (id: number) => ({ id, planId: 1, templateId: id * 10, status: "pending" as const, durationOverrideMin: 20 });
const state = (overrides: Partial<OperationalState> = {}): OperationalState => ({
  id: "state:chain", planId: 1, workDay: { start: "09:00", end: "12:00" },
  planning: [1, 2, 3, 4, 5].map((id, index) => ({ taskId: id, startPlanned: `09:${String(index * 20).padStart(2, "0")}`, endPlanned: `09:${String(index * 20 + 15).padStart(2, "0")}`, assignedResourceIds: [1], spaceId: 1 })),
  tasks: [1, 2, 3, 4, 5].map(task), resources: [],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {}, cognitive: cognitive(), source: "EngineInput", schemaVersion: "ORC-SPEC-01", ...overrides,
});

test("detects a simple dependency chain and calculates flow metrics", () => {
  const result = optimizeDependencyChainFlow(state({ dependencies: [{ taskId: 2, dependsOnTaskIds: [1], dependsOnTemplateIds: [] }, { taskId: 3, dependsOnTaskIds: [2], dependsOnTemplateIds: [] }] }));
  assert.equal(result.chains.length, 1);
  assert.deepEqual(result.chains[0].taskIds, [1, 2, 3]);
  assert.equal(result.chains[0].metrics.length, 3);
  assert.equal(result.chains[0].metrics.accumulatedSlackMinutes, 10);
  assert.equal(result.evidence[0].kind, "dependency-chain-flow-analysis");
});

test("detects multiple independent chains in deterministic order", () => {
  const result = optimizeDependencyChainFlow(state({ dependencies: [{ taskId: 2, dependsOnTaskIds: [1], dependsOnTemplateIds: [] }, { taskId: 5, dependsOnTaskIds: [4], dependsOnTemplateIds: [] }] }));
  assert.deepEqual(result.chains.map((chain) => chain.taskIds), [[1, 2], [4, 5]]);
});

test("expands convergent chains without hardcoded chain definitions", () => {
  const result = optimizeDependencyChainFlow(state({ dependencies: [{ taskId: 3, dependsOnTaskIds: [1, 2], dependsOnTemplateIds: [] }, { taskId: 4, dependsOnTaskIds: [3], dependsOnTemplateIds: [] }] }));
  assert.deepEqual(result.chains.map((chain) => chain.taskIds), [[1, 3, 4], [2, 3, 4]]);
  assert.ok(result.chains.every((chain) => chain.metrics.structuralCriticality > 0));
});

test("links opportunity influence to touched independent chains", () => {
  const opportunities = [{ id: "op:flow", kind: "LOCK_PRESSURE", taskIds: [4], searchSpaceIds: [], evidenceIds: [], metadata: {} }];
  const result = optimizeDependencyChainFlow(state({ dependencies: [{ taskId: 2, dependsOnTaskIds: [1], dependsOnTemplateIds: [] }, { taskId: 5, dependsOnTaskIds: [4], dependsOnTemplateIds: [] }], cognitive: cognitive({ opportunities }) }), opportunities);
  assert.equal(result.opportunityInfluences[0].opportunityId, "op:flow");
  assert.deepEqual(result.opportunityInfluences[0].touchedChainIds, ["dependency-chain:4->5"]);
  assert.ok(result.opportunityInfluences[0].influenceScore > 0);
});

test("same input produces same chains, metrics and exploration order inputs", () => {
  const input = state({ dependencies: [{ taskId: 2, dependsOnTaskIds: [1], dependsOnTemplateIds: [] }, { taskId: 3, dependsOnTaskIds: [2], dependsOnTemplateIds: [] }] });
  assert.equal(stableStringify(optimizeDependencyChainFlow(input)), stableStringify(optimizeDependencyChainFlow(input)));
});

test("serializes as JSON evidence", () => {
  const result = optimizeDependencyChainFlow(state({ dependencies: [{ taskId: 2, dependsOnTaskIds: [1], dependsOnTemplateIds: [] }] }), [], "2026-06-28T00:00:00.000Z");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("does not mutate the operational state", () => {
  const input = state({ dependencies: [{ taskId: 2, dependsOnTaskIds: [1], dependsOnTemplateIds: [] }] });
  const before = stableStringify(input);
  optimizeDependencyChainFlow(input);
  assert.equal(stableStringify(input), before);
});

test("adjusts reasoning budgets only as an orientation signal", () => {
  const result = optimizeDependencyChainFlow(state({ dependencies: [{ taskId: 2, dependsOnTaskIds: [1], dependsOnTemplateIds: [] }] }), [{ id: "op:1", kind: "k", taskIds: [1], searchSpaceIds: [], evidenceIds: [], metadata: {} }]);
  const [profile] = applyDependencyChainFlowToReasoningBudgets([{ opportunityId: "op:1", criticalityLevel: 1, explorationBudget: 1, maxCandidates: 1, maxDepth: 1, maxSearchSpaceSize: 1, simulationBudget: 1, reason: "base" }], result.opportunityInfluences);
  assert.ok(profile.explorationBudget >= 1);
  assert.match(profile.reason, /Dependency-chain flow/);
});
