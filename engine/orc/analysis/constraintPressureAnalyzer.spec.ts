import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalState } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { analyzeOperationalState } from "./operationalStateAnalyzer";
import { analyzeConstraintPressure } from "./constraintPressureAnalyzer";

const state = (overrides: Partial<OperationalState> = {}): OperationalState => ({
  id: "state:test", planId: 1, workDay: null, planning: [], tasks: [], resources: [],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {}, cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} }, source: "EngineInput", schemaVersion: "ORC-SPEC-01", ...overrides,
});

const task = (id: number, extra = {}) => ({ id, planId: 1, templateId: id, status: "pending" as const, ...extra });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("Constraint Pressure Analyzer supports an empty analysis", () => {
  const analysis = analyzeOperationalState(state());
  assert.deepEqual(analyzeConstraintPressure(analysis), { constraints: [] });
  assert.deepEqual(analysis.constraintPressureAnalysis, { constraints: [] });
});

test("Constraint Pressure Analyzer explains a single lock constraint", () => {
  const analysis = analyzeOperationalState(state({ tasks: [task(1)], locks: [{ id: 10, planId: 1, taskId: 1, lockType: "time" }] }));
  assert.deepEqual(analysis.constraintPressureAnalysis.constraints, [{
    constraintId: "constraints:locks",
    pressureScore: 2,
    contributingFactors: ["lock-count:1", "locked-task-count:1"],
    explanation: "Constraint constraints:locks pressure is 2. Evidence: lockCount=1, lockedTaskIds=[1]. Factors: lock-count:1, locked-task-count:1.",
  }]);
});

test("Constraint Pressure Analyzer ranks multiple constraints deterministically", () => {
  const analysis = analyzeOperationalState(state({
    tasks: [task(1), task(2), task(3)],
    dependencies: [{ taskId: 3, dependsOnTaskIds: [1, 2], dependsOnTemplateIds: [] }],
    locks: [{ id: 2, planId: 1, taskId: 2, lockType: "time" }, { id: 1, planId: 1, taskId: 1, lockType: "resource" }],
    constraints: { optimizer: { mainZoneId: 5 } },
    planning: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [], spaceId: 5 },
      { taskId: 2, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [], spaceId: 5 },
    ],
  }));
  assert.deepEqual(analysis.constraintPressureAnalysis.constraints.map((item) => item.constraintId), ["constraints:locks", "constraints:dependencies", "constraints:main-flow:5"]);
  assert.deepEqual(analysis.constraintPressureAnalysis.constraints.map((item) => item.pressureScore), [4, 3, 2]);
});

test("Constraint Pressure Analyzer breaks ties by constraint id", () => {
  const analysis = analyzeOperationalState(state({
    tasks: [task(1), task(2)],
    dependencies: [{ taskId: 2, dependsOnTaskIds: [1], dependsOnTemplateIds: [] }],
    locks: [{ id: 1, planId: 1, taskId: 1, lockType: "time" }],
  }));
  assert.deepEqual(analysis.constraintPressureAnalysis.constraints.map((item) => item.constraintId), ["constraints:dependencies", "constraints:locks"]);
  assert.deepEqual(analysis.constraintPressureAnalysis.constraints.map((item) => item.pressureScore), [2, 2]);
});

test("Constraint Pressure Analyzer is deterministic, structurally equal and serializable", () => {
  const input = analyzeOperationalState(state({ tasks: [task(1), task(2)], dependencies: [{ taskId: 2, dependsOnTaskIds: [1], dependsOnTemplateIds: [] }] }));
  const first = analyzeConstraintPressure(input);
  const second = analyzeConstraintPressure(input);
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify(first), stableStringify(JSON.parse(JSON.stringify(first))));
});

test("Constraint Pressure Analyzer does not mutate its input", () => {
  const input = analyzeOperationalState(state({ tasks: [task(1)], locks: [{ id: 1, planId: 1, taskId: 1, lockType: "time" }] }));
  const before = clone(input);
  analyzeConstraintPressure(input);
  assert.deepEqual(input, before);
});
