import assert from "node:assert/strict";
import test from "node:test";
import type { SearchSpace } from "../contracts";
import { createInitialCognitiveState, recordExhaustedSearchSpace, updateReasoningBudget } from "../cognitive/cognitiveState";
import { createReasoningBudget } from "../cognitive/reasoningBudget";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { buildCandidateStates } from "../transformation/transformationEngine";
import { simulateCandidateStates } from "../simulation/simulationEngine";
import { buildStrategyCandidates } from "./strategyCandidateBuilder";

const cognitive = (maxCandidates = 20) => updateReasoningBudget(createInitialCognitiveState(null), createReasoningBudget({ maxCandidates }));

const space = (id: string, overrides: Partial<SearchSpace> = {}): SearchSpace => ({
  id,
  description: `space ${id}`,
  taskIds: [1, 2, 3],
  candidates: [],
  evidenceIds: [],
  metadata: {
    readOnly: true,
    sourceOpportunityId: `op:${id}`,
    sourceOpportunityKind: "GENERIC",
    affectedRegion: "region-a",
    allowedTransformations: ["MOVE_CHAIN_POSSIBLE", "REORDER_REGION_POSSIBLE", "COMPACT_REGION_POSSIBLE"],
  },
  ...overrides,
});

test("buildStrategyCandidates handles empty SearchSpace input", () => {
  const result = buildStrategyCandidates([], cognitive());
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.summary, { generatedCandidates: 0, discardedEquivalentCandidates: 0, strategyTypes: 0, generatedVariants: 0, discardedVariants: 0 });
  assert.equal(result.evidence.at(-1)?.kind, "strategy-candidate-diversity");
});

test("buildStrategyCandidates creates base strategy candidates when variants cannot be materialized", () => {
  const result = buildStrategyCandidates([space("one")], cognitive());
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(result.candidates.map((candidate) => candidate.metadata.strategyFamily), ["continuity", "chain-advance", "compaction"]);
  assert.equal(result.candidates.every((candidate) => Array.isArray(candidate.metadata.transformations) && (candidate.metadata.transformations as unknown[]).length > 1), true);
  assert.equal(result.candidates.every((candidate) => candidate.metadata.strategyCandidate === true && candidate.metadata.executesTransformations === false), true);
  assert.equal(result.summary.strategyTypes, 3);
});


test("buildStrategyCandidates materializes several deterministic variants for one strategy", () => {
  const result = buildStrategyCandidates([space("variants", { taskIds: [1] })], cognitive(), { operationalState: operationalState() });
  assert.deepEqual(result.candidates.map((candidate) => candidate.metadata.variantId), ["base", "advance-15", "delay-15"]);
  assert.deepEqual(result.candidates.map((candidate) => candidate.metadata.parentStrategy), ["CLOSE_MAIN_FLOW_GAP", "CLOSE_MAIN_FLOW_GAP", "CLOSE_MAIN_FLOW_GAP"]);
  assert.equal(result.evidence.some((item) => item.kind === "strategy-variants-generated" && item.data.strategy === "CLOSE_MAIN_FLOW_GAP"), true);
  assert.equal(result.evidence.filter((item) => item.kind === "strategy-candidate-generated").length, 3);
});

test("buildStrategyCandidates serializes variant metadata and accepted evidence", () => {
  const result = buildStrategyCandidates([space("serial", { taskIds: [1] })], cognitive(), { operationalState: operationalState() });
  const serialized = JSON.parse(JSON.stringify(result));
  assert.equal(serialized.candidates[1].metadata.variantId, "advance-15");
  assert.equal(serialized.evidence.some((item: any) => item.data.acceptedVariant?.variantId === "advance-15"), true);
});

test("buildStrategyCandidates handles multiple SearchSpaces deterministically", () => {
  const spaces = [space("one"), space("two", { metadata: { ...space("two").metadata, affectedRegion: "region-b", allowedTransformations: ["RESOURCE_REASSIGNMENT_POSSIBLE"] } })];
  const first = buildStrategyCandidates(spaces, cognitive());
  const second = buildStrategyCandidates(spaces, cognitive());
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(first.candidates.map((candidate) => candidate.metadata.sourceOpportunityId), ["op:one", "op:one", "op:one", "op:two", "op:two"]);
});

test("buildStrategyCandidates discards equivalent candidates", () => {
  const duplicate = space("duplicate", { metadata: { ...space("duplicate").metadata, sourceOpportunityId: "op:one" } });
  const result = buildStrategyCandidates([space("one"), duplicate], cognitive());
  assert.equal(result.candidates.length, 3);
  assert.equal(result.summary.discardedEquivalentCandidates, 3);
  assert.equal(result.evidence.filter((item) => item.kind === "strategy-candidate-discarded" && item.data.reason === "equivalent-candidate").length, 3);
});

test("buildStrategyCandidates preserves diversity and respects candidate budget", () => {
  const result = buildStrategyCandidates([space("one"), space("two", { metadata: { ...space("two").metadata, affectedRegion: "region-b", allowedTransformations: ["RESOURCE_REASSIGNMENT_POSSIBLE", "LOCK_CONSTRAINED_EXPLORATION"] } })], cognitive(4));
  assert.equal(result.candidates.length, 4);
  assert.ok(result.summary.strategyTypes >= 3);
  assert.ok(result.evidence.some((item) => item.kind === "strategy-candidate-discarded" && item.data.reason === "insufficient-candidate-budget"));
});

test("buildStrategyCandidates uses structural equality and does not mutate inputs", () => {
  const spaces = [space("one")];
  const state = cognitive();
  const beforeSpaces = stableStringify(spaces);
  const beforeState = stableStringify(state);
  const first = buildStrategyCandidates(spaces, state);
  const second = buildStrategyCandidates(spaces, state);
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify(spaces), beforeSpaces);
  assert.equal(stableStringify(state), beforeState);
});

test("buildStrategyCandidates skips exhausted SearchSpaces", () => {
  const exhausted = recordExhaustedSearchSpace(cognitive(), "space:done");
  const result = buildStrategyCandidates([space("space:done")], exhausted);
  assert.equal(result.candidates.length, 0);
  assert.ok(result.evidence.some((item) => item.kind === "strategy-candidate-discarded" && item.data.reason === "exhausted-region"));
});

const operationalState = (overrides: Partial<import("../contracts").OperationalState> = {}): import("../contracts").OperationalState => ({
  id: "state:strategy", planId: 1, workDay: { start: "09:00", end: "18:00" },
  planning: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7], spaceId: 10 },
    { taskId: 2, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [7], spaceId: 10 },
    { taskId: 3, startPlanned: "11:00", endPlanned: "11:30", assignedResourceIds: [7], spaceId: 10 },
  ],
  tasks: [
    { id: 1, planId: 1, templateId: 1, status: "pending", startPlanned: "09:15", endPlanned: "09:45", assignedResourceIds: [8], spaceId: 11 },
    { id: 2, planId: 1, templateId: 2, status: "pending", startPlanned: "10:15", endPlanned: "10:45", assignedResourceIds: [8], spaceId: 11 },
    { id: 3, planId: 1, templateId: 3, status: "pending", startPlanned: "11:15", endPlanned: "11:45", assignedResourceIds: [8], spaceId: 11 },
  ],
  resources: [{ id: 7, resourceItemId: 70, typeId: 1, name: "R7", isAvailable: true }, { id: 8, resourceItemId: 80, typeId: 1, name: "R8", isAvailable: true }],
  spaces: { parentById: { 10: null, 11: null }, nameById: { 10: "A", 11: "B" }, capacityById: { 10: 1, 11: 1 }, concurrencyById: { 10: 1, 11: 1 }, exclusiveById: { 10: false, 11: false }, priorityById: { 10: 0, 11: 0 } },
  availability: { workDay: { start: "09:00", end: "18:00" }, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {},
  cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
  source: "EngineInput", schemaVersion: "ORC-SPEC-01", ...overrides,
});

test("buildStrategyCandidates keeps strategies abstract when assignments cannot be synthesized", () => {
  const result = buildStrategyCandidates([space("abstract")], cognitive());
  assert.equal(result.candidates[0].assignments.length, 0);
  assert.equal(result.candidates[0].metadata.abstract, true);
  assert.equal((result.candidates[0].metadata.assignmentSynthesis as any).discardedTasks[0].reason, "operational-state-unavailable");
});

test("buildStrategyCandidates synthesizes one executable assignment", () => {
  const result = buildStrategyCandidates([space("one-task", { taskIds: [1] })], cognitive(), { operationalState: operationalState() });
  assert.equal(result.candidates[0].assignments.length, 1);
  assert.equal(result.candidates[0].metadata.abstract, false);
  assert.equal(result.candidates[0].metadata.executesTransformations, true);
  assert.equal((result.evidence.find((item) => item.kind === "strategy-candidate-generated")?.data.assignmentSynthesis as any).generatedAssignmentCount, 1);
});

test("buildStrategyCandidates synthesizes coordinated multiple assignments", () => {
  const result = buildStrategyCandidates([space("multi")], cognitive(), { operationalState: operationalState() });
  assert.deepEqual(result.candidates[0].assignments.map((assignment) => assignment.taskId), [1, 2, 3]);
});

test("buildStrategyCandidates excludes done and in_progress tasks", () => {
  const state = operationalState({ tasks: [
    { id: 1, planId: 1, templateId: 1, status: "done", startPlanned: "09:15", endPlanned: "09:45", assignedResourceIds: [8], spaceId: 11 },
    { id: 2, planId: 1, templateId: 2, status: "in_progress", startPlanned: "10:15", endPlanned: "10:45", assignedResourceIds: [8], spaceId: 11 },
  ] as any });
  const result = buildStrategyCandidates([space("protected", { taskIds: [1, 2] })], cognitive(), { operationalState: state });
  assert.equal(result.candidates[0].assignments.length, 0);
  assert.deepEqual((result.candidates[0].metadata.assignmentSynthesis as any).discardedTasks.map((item: any) => item.reason), ["task-status-protected:done", "task-status-protected:in_progress"]);
});

test("buildStrategyCandidates respects full and field locks", () => {
  const state = operationalState({ locks: [{ id: 1, planId: 1, taskId: 1, lockType: "time" }, { id: 2, planId: 1, taskId: 2, lockType: "full" }] });
  const result = buildStrategyCandidates([space("locks", { taskIds: [1, 2, 3] })], cognitive(), { operationalState: state });
  assert.deepEqual(result.candidates[0].assignments.map((assignment) => assignment.taskId), [3]);
  assert.deepEqual((result.candidates[0].metadata.assignmentSynthesis as any).discardedTasks.map((item: any) => item.reason), ["lock-protected:time", "lock-protected:full"]);
});


test("buildStrategyCandidates produces a distinct SimulatedState when synthesized assignment is applicable", () => {
  const base = operationalState();
  const candidates = buildStrategyCandidates([space("sim", { taskIds: [1] })], cognitive(), { operationalState: base }).candidates;
  const candidateStates = buildCandidateStates(base, candidates).candidateStates;
  const result = simulateCandidateStates(base, candidateStates, { createdAt: null });
  assert.equal(result.simulatedStates[0].simulationMode, "ASSIGNMENT_APPLICATION_SHADOW");
  assert.notEqual(result.simulatedStates[0].operationalStateSnapshot.planning[0].startPlanned, base.planning[0].startPlanned);
});
