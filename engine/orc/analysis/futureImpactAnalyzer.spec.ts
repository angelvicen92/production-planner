import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalState, SimulatedState } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { analyzeFutureImpact } from "./futureImpactAnalyzer";

const baseState = (planning: OperationalState["planning"]): OperationalState => ({
  id: "state:test",
  planId: 1,
  workDay: { start: "09:00", end: "18:00" },
  planning,
  tasks: [],
  resources: [],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: { start: "09:00", end: "18:00" }, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [],
  locks: [],
  constraints: {},
  operationalMetrics: {},
  cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
  source: "EngineInput",
  schemaVersion: "ORC-SPEC-01",
});

const simulated = (id: string, planning: OperationalState["planning"], extra: Partial<OperationalState> = {}): SimulatedState => ({
  id,
  candidateStateId: `candidate-state:${id}`,
  baseStateId: "state:test",
  operationalStateSnapshot: { ...baseState(planning), ...extra },
  appliedTransformations: [],
  simulationMode: "ASSIGNMENT_APPLICATION_SHADOW",
  readOnly: true,
  createdAt: "2026-06-28T00:00:00.000Z",
});

const compact = [
  { taskId: 1, startPlanned: "09:00", endPlanned: "12:00", assignedResourceIds: [1] },
  { taskId: 2, startPlanned: "12:00", endPlanned: "15:00", assignedResourceIds: [1] },
  { taskId: 3, startPlanned: "15:00", endPlanned: "18:00", assignedResourceIds: [1] },
];
const robust = [
  { taskId: 1, startPlanned: "09:00", endPlanned: "10:00", assignedResourceIds: [1] },
  { taskId: 2, startPlanned: "12:00", endPlanned: "13:00", assignedResourceIds: [2] },
  { taskId: 3, startPlanned: "16:00", endPlanned: "17:00", assignedResourceIds: [3] },
];

test("analyzeFutureImpact returns equal impacts for equivalent candidates", () => {
  const result = analyzeFutureImpact([simulated("a", robust), simulated("b", robust)]);
  assert.equal(result.impacts[0].impactScore, result.impacts[1].impactScore);
  assert.deepEqual(result.impacts[0].indicators, result.impacts[1].indicators);
});

test("analyzeFutureImpact detects candidate that reduces flexibility", () => {
  const result = analyzeFutureImpact([simulated("compact", compact)]);
  const impact = result.impacts[0];
  assert.ok(impact.indicators.criticalWindowConsumption >= 0.7);
  assert.ok(impact.indicators.temporalFlexibility < 0.1);
  assert.ok(impact.freedomDelta < 0);
});

test("analyzeFutureImpact rewards candidates that preserve delay absorption", () => {
  const result = analyzeFutureImpact([simulated("compact", compact), simulated("robust", robust)]);
  assert.ok(result.impacts[1].impactScore > result.impacts[0].impactScore);
  assert.ok(result.impacts[1].indicators.delayAbsorptionCapacity > result.impacts[0].indicators.delayAbsorptionCapacity);
});

test("analyzeFutureImpact is deterministic and structurally equal", () => {
  const input = [simulated("robust", robust)];
  const first = analyzeFutureImpact(input);
  const second = analyzeFutureImpact(input);
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify(first), stableStringify(second));
});

test("analyzeFutureImpact serializes evidence and impact data", () => {
  const result = analyzeFutureImpact([simulated("robust", robust)]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.impacts[0])), result.impacts[0]);
  assert.equal(result.evidence[0].data.commitsPlanning, false);
  assert.equal(result.evidence[0].data.mutatesOperationalState, false);
  assert.equal(Object.isFrozen(result.evidence[0]), true);
});

test("analyzeFutureImpact does not mutate input", () => {
  const input = [simulated("robust", robust)];
  const before = stableStringify(input);
  analyzeFutureImpact(input);
  assert.equal(stableStringify(input), before);
});
