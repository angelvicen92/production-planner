import assert from "node:assert/strict";
import test from "node:test";
import type { CandidateState, OperationalState } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { simulateCandidateStates } from "./simulationEngine";

const state = (): OperationalState => ({
  id: "state:sim", planId: 1, workDay: { start: "09:00", end: "18:00" }, planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7], spaceId: 10 }],
  tasks: [{ id: 1, planId: 1, templateId: 10, status: "pending", startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7], spaceId: 10 }],
  resources: [{ id: 7, resourceItemId: 70, typeId: 1, name: "Camera 1", isAvailable: true }],
  spaces: { parentById: { 10: null }, nameById: { 10: "Studio" }, capacityById: { 10: 1 }, concurrencyById: { 10: 1 }, exclusiveById: { 10: false }, priorityById: { 10: 0 } },
  availability: { workDay: { start: "09:00", end: "18:00" }, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {},
  cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
  source: "EngineInput", schemaVersion: "ORC-SPEC-01",
});

const candidateState = (id: string): CandidateState => ({
  id, candidateId: `candidate:${id}`, strategy: "COMPACT_REGION", originOpportunity: null,
  plannedTransformations: [{ kind: "COMPACT_REGION", reason: "fixture" }],
  estimatedImpact: null, estimatedCost: null, confidence: 0.5,
});

test("simulateCandidateStates handles empty CandidateState input", () => {
  const result = simulateCandidateStates(state(), [], { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.deepEqual(result.simulatedStates, []);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.summary, { candidateStateCount: 0, simulatedCount: 0, truncatedByBudget: false });
});

test("simulateCandidateStates creates one read-only baseline SimulatedState", () => {
  const base = state();
  const result = simulateCandidateStates(base, [candidateState("cs:1")], { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(result.simulatedStates.length, 1);
  assert.equal(result.simulatedStates[0].candidateStateId, "cs:1");
  assert.equal(result.simulatedStates[0].baseStateId, base.id);
  assert.deepEqual(result.simulatedStates[0].appliedTransformations, []);
  assert.equal(result.simulatedStates[0].simulationMode, "READ_ONLY_BASELINE");
  assert.equal(result.simulatedStates[0].readOnly, true);
  assert.equal(result.simulatedStates[0].createdAt, "2026-06-25T00:00:00.000Z");
});

test("simulateCandidateStates supports multiple CandidateStates and budget truncation", () => {
  const candidates = [candidateState("cs:1"), candidateState("cs:2"), candidateState("cs:3")];
  const result = simulateCandidateStates(state(), candidates, { maxSimulations: 2, createdAt: null });
  assert.deepEqual(result.simulatedStates.map((simulated) => simulated.candidateStateId), ["cs:1", "cs:2"]);
  assert.equal(result.summary.candidateStateCount, 3);
  assert.equal(result.summary.simulatedCount, 2);
  assert.equal(result.summary.truncatedByBudget, true);
  assert.equal(result.evidence.at(-1)?.kind, "simulated-state-budget-truncated");
});

test("simulateCandidateStates is deterministic for same input and createdAt", () => {
  const base = state();
  const candidates = [candidateState("cs:1"), candidateState("cs:2")];
  const first = simulateCandidateStates(base, candidates, { createdAt: "2026-06-25T00:00:00.000Z" });
  const second = simulateCandidateStates(base, candidates, { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(structuralEquals(first, second), true);
});

test("simulateCandidateStates does not mutate OperationalState and snapshots are structural copies", () => {
  const base = state();
  const before = stableStringify(base);
  const result = simulateCandidateStates(base, [candidateState("cs:1")], { createdAt: null });
  assert.equal(stableStringify(base), before);
  assert.notEqual(result.simulatedStates[0].operationalStateSnapshot, base);
  assert.equal(structuralEquals(result.simulatedStates[0].operationalStateSnapshot, base), true);
});

test("simulateCandidateStates returns immutable results and immutable snapshots", () => {
  const result = simulateCandidateStates(state(), [candidateState("cs:1")], { createdAt: null });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.simulatedStates[0]), true);
  assert.equal(Object.isFrozen(result.simulatedStates[0].operationalStateSnapshot), true);
  assert.equal(Object.isFrozen(result.simulatedStates[0].operationalStateSnapshot.planning[0].assignedResourceIds), true);
  assert.throws(() => ((result.simulatedStates[0].operationalStateSnapshot.planning[0].assignedResourceIds as number[])[0] = 99), TypeError);
});

test("simulateCandidateStates emits evidence for each generated simulation", () => {
  const result = simulateCandidateStates(state(), [candidateState("cs:1")], { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].source, "orc-simulation");
  assert.equal(result.evidence[0].kind, "simulated-state-generated");
  assert.equal(result.evidence[0].data.readOnly, true);
  assert.equal(result.evidence[0].data.executesTransformations, false);
  assert.equal(result.evidence[0].data.appliedTransformationCount, 0);
});
