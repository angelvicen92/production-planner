import assert from "node:assert/strict";
import test from "node:test";
import type { CandidateState, OperationalState } from "../contracts";
import { stableStringify } from "../structuralEquality";
import { materializeSimulatedPlanning } from "./materializeSimulatedPlanning";

const candidateState = (sourceAssignments: CandidateState["sourceAssignments"] = []): CandidateState => ({
  id: "candidate-state:test", candidateId: "candidate:test", strategy: "COMPACT_REGION", originOpportunity: null,
  plannedTransformations: [], estimatedImpact: null, estimatedCost: null, confidence: 1, sourceAssignments,
});

const state = (count = 3): OperationalState => ({
  id: "state:test", planId: 1, workDay: { start: "09:00", end: "18:00" },
  planning: Array.from({ length: count }, (_, index) => ({ taskId: index + 1, startPlanned: `09:${String(index).padStart(2, "0")}`, endPlanned: `10:${String(index).padStart(2, "0")}`, assignedResourceIds: [7 + index], spaceId: 10 + index })),
  tasks: Array.from({ length: count }, (_, index) => ({ id: index + 1, planId: 1, templateId: 100 + index, status: "pending" as const, startPlanned: `09:${String(index).padStart(2, "0")}`, endPlanned: `10:${String(index).padStart(2, "0")}`, assignedResourceIds: [7 + index], spaceId: 10 + index })),
  resources: [], spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: { start: "09:00", end: "18:00" }, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {},
  cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
  source: "EngineInput", schemaVersion: "ORC-SPEC-01",
});

test("materializeSimulatedPlanning preserves a complete baseline seed", () => {
  const base = state(219);
  const result = materializeSimulatedPlanning(candidateState(), base);
  assert.equal(result.diagnostics.source, "baseline_seed_preserved");
  assert.equal(result.diagnostics.plannedTaskCount, 219);
  assert.equal(result.diagnostics.changedTaskCount, 0);
  assert.equal(result.planning.length, 219);
});

test("materializeSimulatedPlanning emits only planning-shaped entries and aliases", () => {
  const result = materializeSimulatedPlanning(candidateState(), state(1));
  assert.deepEqual(Object.keys(result.planning[0]).sort(), ["assignedResourceIds", "assignedResources", "assignedSpace", "endPlanned", "spaceId", "startPlanned", "taskId"]);
  assert.equal((result.planning[0] as any).status, undefined);
  assert.equal(result.planning[0].assignedSpace, 10);
  assert.deepEqual(result.planning[0].assignedResources, [7]);
});

test("materializeSimulatedPlanning applies deterministic candidate changes without mutating baseline", () => {
  const base = state(2);
  const before = stableStringify(base);
  const result = materializeSimulatedPlanning(candidateState([{ taskId: 2, startPlanned: "12:00", endPlanned: "12:30", spaceId: 99, resourceIds: [3, 2] }]), base);
  assert.equal(result.diagnostics.source, "candidate_transformations");
  assert.equal(result.diagnostics.changedTaskCount, 1);
  assert.equal(result.planning.find((entry) => entry.taskId === 2)?.startPlanned, "12:00");
  assert.deepEqual(result.planning.find((entry) => entry.taskId === 2)?.assignedResources, [2, 3]);
  assert.equal(stableStringify(base), before);
  assert.equal(stableStringify(result), stableStringify(materializeSimulatedPlanning(candidateState([{ taskId: 2, startPlanned: "12:00", endPlanned: "12:30", spaceId: 99, resourceIds: [3, 2] }]), base)));
});

test("materializeSimulatedPlanning does not modify done or in_progress tasks", () => {
  for (const status of ["done", "in_progress"] as const) {
    const base = state(1);
    base.tasks[0].status = status;
    const result = materializeSimulatedPlanning(candidateState([{ taskId: 1, startPlanned: "12:00", endPlanned: "12:30", spaceId: 99, resourceIds: [2] }]), base);
    assert.equal(result.diagnostics.source, "baseline_seed_preserved");
    assert.equal(result.planning[0].startPlanned, "09:00");
    assert.ok(result.diagnostics.warnings.some((warning) => warning.includes(`task-status-protected:${status}`)));
  }
});

test("materializeSimulatedPlanning reports none for empty planning", () => {
  const base = state(0);
  const result = materializeSimulatedPlanning(candidateState(), base);
  assert.equal(result.diagnostics.source, "none");
  assert.equal(result.diagnostics.plannedTaskCount, 0);
  assert.equal(result.diagnostics.changedTaskCount, 0);
  assert.equal(result.diagnostics.assignedSpaceContractValid, true);
  assert.equal(result.diagnostics.missingAssignedSpaceFieldCount, 0);
  assert.deepEqual(result.planning, []);
  assert.doesNotThrow(() => JSON.stringify(result.diagnostics));
});
