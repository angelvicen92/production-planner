import assert from "node:assert/strict";
import test from "node:test";
import type { CandidateState, OperationalState, SimulatedState } from "../contracts";
import { deepFreeze } from "../immutability";
import { simulateCandidateStates } from "../simulation/simulationEngine";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { validateSimulatedStates } from "./validationEngine";

const state = (): OperationalState => ({
  id: "state:validation", planId: 1, workDay: { start: "09:00", end: "18:00" }, planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7], spaceId: 10 }],
  tasks: [{ id: 1, planId: 1, templateId: 10, status: "pending", startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7], spaceId: 10 }],
  resources: [{ id: 7, resourceItemId: 70, typeId: 1, name: "Camera 1", isAvailable: true }],
  spaces: { parentById: { 10: null }, nameById: { 10: "Studio" }, capacityById: { 10: 1 }, concurrencyById: { 10: 1 }, exclusiveById: { 10: false }, priorityById: { 10: 0 } },
  availability: { workDay: { start: "09:00", end: "18:00" }, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {},
  cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
  source: "EngineInput", schemaVersion: "ORC-SPEC-01",
});

const candidateState = (): CandidateState => ({
  id: "cs:validation", candidateId: "candidate:validation", strategy: "COMPACT_REGION", originOpportunity: null,
  plannedTransformations: [{ kind: "COMPACT_REGION", reason: "fixture" }],
  estimatedImpact: null, estimatedCost: null, confidence: 0.5,
});

const validSimulatedState = (): SimulatedState => simulateCandidateStates(state(), [candidateState()], { createdAt: "2026-06-25T00:00:00.000Z" }).simulatedStates[0];

test("validateSimulatedStates handles empty SimulatedState input", () => {
  const result = validateSimulatedStates([], { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.deepEqual(result.validationResults, []);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.summary, { simulatedStateCount: 0, validCount: 0, invalidCount: 0 });
});

test("validateSimulatedStates marks a structurally valid SimulatedState as VALID", () => {
  const result = validateSimulatedStates([validSimulatedState()], { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(result.validationResults.length, 1);
  assert.equal(result.validationResults[0].simulatedStateId, "orc-simulation:simulated-state:cs:validation");
  assert.equal(result.validationResults[0].result, "VALID");
  assert.deepEqual(result.validationResults[0].violatedConstraints, []);
  assert.equal(result.validationResults[0].validatedAt, "2026-06-25T00:00:00.000Z");
  assert.deepEqual(result.summary, { simulatedStateCount: 1, validCount: 1, invalidCount: 0 });
});

test("validateSimulatedStates marks missing snapshot as INVALID", () => {
  const simulated = { ...validSimulatedState(), operationalStateSnapshot: null } as unknown as SimulatedState;
  const result = validateSimulatedStates([simulated], { createdAt: null });
  assert.equal(result.validationResults[0].result, "INVALID");
  assert.deepEqual(result.validationResults[0].violatedConstraints, ["MISSING_OPERATIONAL_STATE_SNAPSHOT"]);
  assert.equal(result.summary.invalidCount, 1);
});

test("validateSimulatedStates marks missing CandidateState association as INVALID", () => {
  const simulated = { ...validSimulatedState(), candidateStateId: "" } as SimulatedState;
  const result = validateSimulatedStates([simulated], { createdAt: null });
  assert.equal(result.validationResults[0].result, "INVALID");
  assert.ok(result.validationResults[0].violatedConstraints.includes("MISSING_CANDIDATE_STATE_ID"));
});

test("validateSimulatedStates is deterministic and structurally equal for the same input", () => {
  const simulated = validSimulatedState();
  const first = validateSimulatedStates([simulated], { createdAt: "2026-06-25T00:00:00.000Z" });
  const second = validateSimulatedStates([simulated], { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(structuralEquals(first, second), true);
});

test("validateSimulatedStates does not mutate SimulatedState or OperationalState snapshot", () => {
  const simulated = validSimulatedState();
  const before = stableStringify(simulated);
  const snapshotBefore = stableStringify(simulated.operationalStateSnapshot);
  validateSimulatedStates([simulated], { createdAt: null });
  assert.equal(stableStringify(simulated), before);
  assert.equal(stableStringify(simulated.operationalStateSnapshot), snapshotBefore);
});

test("validateSimulatedStates rejects mutable snapshots", () => {
  const simulated = { ...validSimulatedState(), operationalStateSnapshot: state() } as SimulatedState;
  const result = validateSimulatedStates([simulated], { createdAt: null });
  assert.equal(result.validationResults[0].result, "INVALID");
  assert.ok(result.validationResults[0].violatedConstraints.includes("MUTABLE_OPERATIONAL_STATE_SNAPSHOT"));
});

test("validateSimulatedStates emits immutable validation evidence", () => {
  const result = validateSimulatedStates([validSimulatedState()], { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].source, "orc-validation");
  assert.equal(result.evidence[0].kind, "simulated-state-validated");
  assert.equal(result.evidence[0].data.result, "VALID");
  assert.equal(result.evidence[0].data.evaluatesCandidate, false);
  assert.equal(result.evidence[0].data.mutatesOperationalState, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.validationResults[0]), true);
  assert.equal(Object.isFrozen(result.evidence[0]), true);
});
