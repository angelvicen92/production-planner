import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalState } from "../contracts";
import { stableStringify } from "../structuralEquality";
import { buildMainFlowGapClosureCandidates } from "./mainFlowGapCandidateBuilder";

const baseState = (overrides: Partial<OperationalState> = {}): OperationalState => ({
  id: "state:main-flow-gap", planId: 1, workDay: { start: "09:00", end: "18:00" },
  planning: [
    { taskId: 1, startPlanned: "10:20", endPlanned: "10:35", assignedResourceIds: [10], spaceId: 7 },
    { taskId: 2, startPlanned: "13:25", endPlanned: "13:40", assignedResourceIds: [11], spaceId: 7 },
    { taskId: 3, startPlanned: "13:40", endPlanned: "13:55", assignedResourceIds: [12], spaceId: 7 },
  ],
  tasks: [
    { id: 1, status: "pending", spaceId: 7 } as any,
    { id: 2, status: "pending", spaceId: 7 } as any,
    { id: 3, status: "pending", spaceId: 7 } as any,
  ],
  resources: [{ id: 10 } as any, { id: 11 } as any, { id: 12 } as any],
  spaces: { parentById: {}, nameById: { 7: "Estudio 7" }, capacityById: { 7: 1 }, concurrencyById: { 7: 1 }, exclusiveById: { 7: true }, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: { optimizer: { mainZoneId: 7 } }, operationalMetrics: {},
  cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
  source: "EngineInput", schemaVersion: "ORC-SPEC-01", ...overrides,
});

test("genera candidato ejecutable para gap inicial del flujo principal sin mutar estado", () => {
  const state = baseState();
  const before = stableStringify(state);
  const first = buildMainFlowGapClosureCandidates(state, [], "2026-06-30T00:00:00.000Z");
  const second = buildMainFlowGapClosureCandidates(state, [], "2026-06-30T00:00:00.000Z");
  assert.deepEqual(first, second);
  assert.equal(stableStringify(state), before);
  assert.equal(first.candidates.length, 1);
  assert.deepEqual(first.candidates[0].assignments, [{ taskId: 1, startPlanned: "13:10", endPlanned: "13:25", spaceId: 7, resourceIds: [10] }]);
  assert.equal(first.candidates[0].metadata.executesTransformations, true);
  assert.equal(first.evidence[0].kind, "main-flow-gap-closure-candidate-generated");
  assert.deepEqual(first.evidence[0].data.originalWindows, [{ taskId: 1, startPlanned: "10:20", endPlanned: "10:35" }]);
  assert.deepEqual(first.evidence[0].data.proposedWindows, [{ taskId: 1, startPlanned: "13:10", endPlanned: "13:25" }]);
});

test("mueve bloque temprano completo conservando orden, gaps y duraciones", () => {
  const state = baseState({ planning: [
    { taskId: 1, startPlanned: "10:00", endPlanned: "10:10", assignedResourceIds: [10], spaceId: 7 },
    { taskId: 4, startPlanned: "10:13", endPlanned: "10:25", assignedResourceIds: [13], spaceId: 7 },
    { taskId: 2, startPlanned: "13:25", endPlanned: "13:40", assignedResourceIds: [11], spaceId: 7 },
  ], tasks: [{ id: 1, status: "pending", spaceId: 7 } as any, { id: 4, status: "pending", spaceId: 7 } as any, { id: 2, status: "pending", spaceId: 7 } as any] });
  const result = buildMainFlowGapClosureCandidates(state);
  assert.deepEqual(result.candidates[0].assignments.map((a) => [a.taskId, a.startPlanned, a.endPlanned]), [[1, "13:00", "13:10"], [4, "13:13", "13:25"]]);
});

test("no mueve tareas protegidas ni locks obvios", () => {
  for (const status of ["done", "in_progress"]) assert.equal(buildMainFlowGapClosureCandidates(baseState({ tasks: [{ id: 1, status, spaceId: 7 } as any, { id: 2, status: "pending", spaceId: 7 } as any] })).candidates.length, 0);
  for (const lockType of ["full", "time", "space", "resource"] as const) assert.equal(buildMainFlowGapClosureCandidates(baseState({ locks: [{ id: `lock:${lockType}`, taskId: 1, lockType } as any] })).candidates.length, 0);
});

test("usa optimizer.mainZoneId y no hardcodea nombres del espacio", () => {
  const result = buildMainFlowGapClosureCandidates(baseState({ spaces: { parentById: {}, nameById: { 7: "Sala Configurada" }, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} } }));
  assert.equal(result.candidates.length, 1);
});

test("respeta presupuesto de candidatos y tareas movidas", () => {
  assert.equal(buildMainFlowGapClosureCandidates(baseState(), [], null, { maxCandidates: 0 }).candidates.length, 0);
  const state = baseState({ planning: [
    { taskId: 1, startPlanned: "10:00", endPlanned: "10:10", assignedResourceIds: [10], spaceId: 7 },
    { taskId: 4, startPlanned: "10:10", endPlanned: "10:20", assignedResourceIds: [13], spaceId: 7 },
    { taskId: 2, startPlanned: "13:25", endPlanned: "13:40", assignedResourceIds: [11], spaceId: 7 },
  ], tasks: [{ id: 1, status: "pending", spaceId: 7 } as any, { id: 4, status: "pending", spaceId: 7 } as any, { id: 2, status: "pending", spaceId: 7 } as any] });
  assert.equal(buildMainFlowGapClosureCandidates(state, [], null, { maxMovedTasksPerCandidate: 1 }).candidates[0].assignments.length, 1);
});
