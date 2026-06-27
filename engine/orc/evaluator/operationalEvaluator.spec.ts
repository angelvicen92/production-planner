import assert from "node:assert/strict";
import test from "node:test";
import type { CandidateState, OperationalState, SimulatedState, ValidationResult } from "../contracts";
import { simulateCandidateStates } from "../simulation/simulationEngine";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { validateSimulatedStates } from "../validation/validationEngine";
import { evaluateSimulatedStates } from "./operationalEvaluator";

const state = (): OperationalState => ({
  id: "operational-state:test",
  planId: 1,
  workDay: { start: "09:00", end: "18:00" },
  planning: [],
  tasks: [],
  resources: [],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [],
  locks: [],
  constraints: {},
  operationalMetrics: {},
  cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
  source: "EngineInput",
  schemaVersion: "ORC-SPEC-01",
});

const candidateState = (id = "candidate-state:test"): CandidateState => ({
  id,
  candidateId: id.replace("candidate-state", "candidate"),
  strategy: "READ_ONLY_BASELINE",
  originOpportunity: null,
  plannedTransformations: [],
  estimatedImpact: {},
  estimatedCost: {},
  confidence: 0,
});

const validSimulatedState = (id = "candidate-state:test"): SimulatedState => simulateCandidateStates(state(), [candidateState(id)], { createdAt: "2026-06-25T00:00:00.000Z" }).simulatedStates[0];
const validate = (simulatedStates: SimulatedState[]) => validateSimulatedStates(simulatedStates, { createdAt: "2026-06-25T00:00:00.000Z" }).validationResults;

test("evaluateSimulatedStates handles empty SimulatedState input", () => {
  const result = evaluateSimulatedStates([], [], { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.deepEqual(result.operationalValues, []);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.summary, { evaluatedCount: 0, skippedInvalid: 0 });
});

test("evaluateSimulatedStates skips INVALID ValidationResult", () => {
  const simulated = { ...validSimulatedState(), candidateStateId: "" } as SimulatedState;
  const validationResults = validateSimulatedStates([simulated], { createdAt: null }).validationResults;
  const result = evaluateSimulatedStates([simulated], validationResults, { createdAt: null });
  assert.deepEqual(result.operationalValues, []);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.summary, { evaluatedCount: 0, skippedInvalid: 1 });
});

test("evaluateSimulatedStates creates a structural OperationalValue for a VALID ValidationResult", () => {
  const simulated = validSimulatedState();
  const result = evaluateSimulatedStates([simulated], validate([simulated]), { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(result.operationalValues.length, 1);
  assert.equal(result.operationalValues[0].simulatedStateId, simulated.id);
  assert.deepEqual(result.operationalValues[0].productionObjectiveScore, {
    overallScore: 1,
    continuityScore: 1,
    availabilityScore: 1,
    criticalResourceScore: 1,
    waitingTimeScore: 1,
    replanningImpactScore: 1,
    operationalFeasibilityScore: 1,
  });
  assert.equal(result.operationalValues[0].overallScore, 1);
  assert.equal(typeof result.operationalValues[0].breakdown.continuityScore, "object");
  assert.equal(result.operationalValues[0].evaluatedAt, "2026-06-25T00:00:00.000Z");
  assert.equal(result.summary.evaluatedCount, 1);
  assert.equal(result.summary.skippedInvalid, 0);
});

test("evaluateSimulatedStates handles multiple states deterministically and structurally equally", () => {
  const simulatedStates = [validSimulatedState("candidate-state:1"), validSimulatedState("candidate-state:2")];
  const validations = validate(simulatedStates);
  const first = evaluateSimulatedStates(simulatedStates, validations, { createdAt: "2026-06-25T00:00:00.000Z" });
  const second = evaluateSimulatedStates(simulatedStates, validations, { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(first.operationalValues.length, 2);
  assert.equal(structuralEquals(first, second), true);
});

test("evaluateSimulatedStates does not mutate SimulatedState or ValidationResult", () => {
  const simulated = validSimulatedState();
  const validationResults = validate([simulated]);
  const beforeSimulated = stableStringify(simulated);
  const beforeValidation = stableStringify(validationResults);
  evaluateSimulatedStates([simulated], validationResults, { createdAt: null });
  assert.equal(stableStringify(simulated), beforeSimulated);
  assert.equal(stableStringify(validationResults), beforeValidation);
});

test("evaluateSimulatedStates emits explanatory immutable evidence", () => {
  const simulated = validSimulatedState();
  const validationResults = validate([simulated]);
  const result = evaluateSimulatedStates([simulated], validationResults, { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].subjectId, simulated.id);
  assert.equal(result.evidence[0].data.simulatedStateId, simulated.id);
  assert.equal(result.evidence[0].data.validationResultId, validationResults[0].id);
  assert.equal(result.evidence[0].data.validationResult, "VALID");
  assert.equal(result.evidence[0].data.mutatesOperationalState, false);
  assert.equal(result.evidence[0].data.overallScore, result.operationalValues[0].overallScore);
  assert.deepEqual(result.evidence[0].data.productionObjectiveScore, result.operationalValues[0].productionObjectiveScore);
  assert.deepEqual(JSON.parse(JSON.stringify(result.operationalValues[0].productionObjectiveScore)), result.operationalValues[0].productionObjectiveScore);
  assert.equal(Object.isFrozen(result.evidence[0]), true);
});

test("evaluateSimulatedStates treats missing ValidationResult as skipped invalid", () => {
  const simulated = validSimulatedState();
  const unrelated = { ...validate([simulated])[0], simulatedStateId: "other" } as ValidationResult;
  const result = evaluateSimulatedStates([simulated], [unrelated], { createdAt: null });
  assert.deepEqual(result.operationalValues, []);
  assert.equal(result.summary.skippedInvalid, 1);
});
