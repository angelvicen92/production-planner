import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalState, SimulatedState } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { calculateOverallScore, evaluateCompaction, evaluateContinuity, evaluateFutureFreedom, evaluateMakespan, evaluateOperationalMetrics, evaluatePermanence, evaluateResourcePressure, evaluateRobustness, evaluateStability } from "./metrics";

const state = (): OperationalState => ({
  id: "operational-state:metrics",
  planId: 1,
  workDay: { start: "09:00", end: "17:00" },
  planning: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "10:00", assignedResourceIds: [1], spaceId: 1 },
    { taskId: 2, startPlanned: "11:00", endPlanned: "12:00", assignedResourceIds: [1], spaceId: 1 },
  ],
  tasks: [{ id: 1 } as any, { id: 2 } as any, { id: 3 } as any],
  resources: [{ id: 1 } as any],
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

const simulated = (): SimulatedState => ({
  id: "simulated-state:metrics",
  candidateStateId: "candidate-state:metrics",
  baseStateId: "operational-state:metrics",
  operationalStateSnapshot: state(),
  appliedTransformations: [],
  simulationMode: "READ_ONLY_BASELINE",
  readOnly: true,
  createdAt: null,
});

test("metric functions are deterministic, normalized and do not mutate SimulatedState", () => {
  const input = simulated();
  const before = stableStringify(input);
  const first = evaluateOperationalMetrics(input);
  const second = evaluateOperationalMetrics(input);
  assert.equal(structuralEquals(first, second), true);
  for (const evaluation of Object.values(first)) assert.equal(evaluation.score >= 0 && evaluation.score <= 1, true);
  assert.equal(stableStringify(input), before);
});

test("dimensions are independently calculated and overallScore is their unweighted mean", () => {
  const input = simulated();
  const breakdown = evaluateOperationalMetrics(input);
  assert.equal(breakdown.continuityScore.score, evaluateContinuity(input).score);
  assert.equal(breakdown.availabilityScore.score, evaluateMakespan(input).score);
  assert.equal(breakdown.replanningImpactScore.score, evaluatePermanence(input).score);
  assert.equal(breakdown.waitingTimeScore.score, evaluateCompaction(input).score);
  assert.equal(breakdown.criticalResourceScore.score, evaluateResourcePressure(input).score);
  assert.equal(breakdown.operationalFeasibilityScore.score, evaluateRobustness(input).score);
  const expected = Math.round((Object.values(breakdown).reduce((sum, item) => sum + item.score, 0) / Object.values(breakdown).length) * 1_000_000) / 1_000_000;
  assert.equal(calculateOverallScore(breakdown), expected);
});
