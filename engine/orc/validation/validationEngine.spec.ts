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

const simulatedWithSnapshot = (snapshot: OperationalState, mode: SimulatedState["simulationMode"] = "ASSIGNMENT_APPLICATION_SHADOW"): SimulatedState => deepFreeze({
  id: `sim:${mode}`,
  candidateStateId: "cs:validation",
  baseStateId: snapshot.id,
  operationalStateSnapshot: deepFreeze(snapshot),
  appliedTransformations: [],
  simulationMode: mode,
  readOnly: true,
  createdAt: null,
}) as SimulatedState;

const cloneState = (patch: Partial<OperationalState> = {}): OperationalState => ({ ...state(), ...patch });
const expectInvalid = (snapshot: OperationalState, code: string) => {
  const result = validateSimulatedStates([simulatedWithSnapshot(snapshot)], { createdAt: null });
  assert.equal(result.validationResults[0].result, "INVALID");
  assert.ok(result.validationResults[0].violatedConstraints.includes(code), `${code} not found in ${result.validationResults[0].violatedConstraints.join(",")}`);
};

test("validateSimulatedStates accepts READ_ONLY_BASELINE and ASSIGNMENT_APPLICATION_SHADOW modes", () => {
  assert.equal(validateSimulatedStates([simulatedWithSnapshot(state(), "READ_ONLY_BASELINE")]).validationResults[0].result, "VALID");
  assert.equal(validateSimulatedStates([simulatedWithSnapshot(state(), "ASSIGNMENT_APPLICATION_SHADOW")]).validationResults[0].result, "VALID");
});

test("validateSimulatedStates rejects unknown simulation modes", () => {
  const result = validateSimulatedStates([{ ...simulatedWithSnapshot(state()), simulationMode: "UNKNOWN" } as unknown as SimulatedState]);
  assert.equal(result.validationResults[0].result, "INVALID");
  assert.ok(result.validationResults[0].violatedConstraints.includes("INVALID_SIMULATION_MODE"));
});

test("validateSimulatedStates invalidates resource, contestant and space overlaps", () => {
  const tasks = [...state().tasks, { ...state().tasks[0], id: 2, contestantId: 2 }];
  expectInvalid(cloneState({ tasks, planning: [state().planning[0], { taskId: 2, startPlanned: "09:10", endPlanned: "09:40", assignedResourceIds: [7], spaceId: 11 }] }), "RESOURCE_OVERLAP");
  expectInvalid(cloneState({ tasks: tasks.map((t) => ({ ...t, assignedResourceIds: [t.id + 10], contestantId: 1 })), planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [11], spaceId: 10 }, { taskId: 2, startPlanned: "09:10", endPlanned: "09:40", assignedResourceIds: [12], spaceId: 11 }] }), "CONTESTANT_OVERLAP");
  expectInvalid(cloneState({ tasks, planning: [state().planning[0], { taskId: 2, startPlanned: "09:10", endPlanned: "09:40", assignedResourceIds: [8], spaceId: 10 }] }), "SPACE_OVERLAP");
});

test("validateSimulatedStates allows overlapping space when configured capacity permits it", () => {
  const tasks = [...state().tasks, { ...state().tasks[0], id: 2, assignedResourceIds: [8] }];
  const snapshot = cloneState({ tasks, spaces: { ...state().spaces, capacityById: { 10: 2 }, concurrencyById: { 10: 2 } }, planning: [state().planning[0], { taskId: 2, startPlanned: "09:10", endPlanned: "09:40", assignedResourceIds: [8], spaceId: 10 }] });
  assert.equal(validateSimulatedStates([simulatedWithSnapshot(snapshot)]).validationResults[0].result, "VALID");
});

test("validateSimulatedStates invalidates protected task mutations", () => {
  expectInvalid(cloneState({ tasks: [{ ...state().tasks[0], status: "done" }], planning: [{ ...state().planning[0], startPlanned: "09:10", endPlanned: "09:40" }] }), "PROTECTED_TASK_TIME_CHANGED:done");
  expectInvalid(cloneState({ tasks: [{ ...state().tasks[0], status: "in_progress" }], planning: [{ ...state().planning[0], assignedResourceIds: [8] }] }), "PROTECTED_TASK_RESOURCES_CHANGED:in_progress");
});

test("validateSimulatedStates invalidates broken locks", () => {
  expectInvalid(cloneState({ locks: [{ id: 1, planId: 1, taskId: 1, lockType: "time", lockedStart: "09:00", lockedEnd: "09:30" }], planning: [{ ...state().planning[0], startPlanned: "09:15", endPlanned: "09:45" }] }), "TIME_LOCK_BROKEN");
  expectInvalid(cloneState({ locks: [{ id: 1, planId: 1, taskId: 1, lockType: "resource", lockedResourceId: 7 }], planning: [{ ...state().planning[0], assignedResourceIds: [8] }] }), "RESOURCE_LOCK_BROKEN");
});

test("validateSimulatedStates invalidates dependencies, workDay and hard meal breaks", () => {
  const base = state();
  const tasks = [base.tasks[0], { ...base.tasks[0], id: 2, dependsOnTaskIds: [1], assignedResourceIds: [8], spaceId: 11 }];
  expectInvalid(cloneState({ tasks, planning: [base.planning[0], { taskId: 2, startPlanned: "09:10", endPlanned: "09:40", assignedResourceIds: [8], spaceId: 11 }] }), "DIRECT_DEPENDENCY_BROKEN");
  expectInvalid(cloneState({ planning: [{ ...base.planning[0], startPlanned: "08:00", endPlanned: "08:30" }] }), "PLANNING_OUTSIDE_WORK_DAY");
  expectInvalid(cloneState({ availability: { ...base.availability, meal: { start: "09:15", end: "09:45" } } }), "PLANNING_CROSSES_HARD_MEAL_BREAK");
});

test("validateSimulatedStates validation evidence is read-only and has no scoring", () => {
  const result = validateSimulatedStates([simulatedWithSnapshot(state())]);
  assert.equal(result.evidence[0].data.validationScope, "hard-constraints-v1");
  assert.equal(result.evidence[0].data.readOnly, true);
  assert.equal(result.evidence[0].data.mutatesOperationalState, false);
  assert.equal(result.evidence[0].data.commitsPlanning, false);
  assert.equal("overallScore" in result.evidence[0].data, false);
});
