import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalState } from "../contracts";
import { buildBaselineOverlapRepairCandidates } from "./baselineOverlapRepairCandidateBuilder";

const state = (overrides: Partial<OperationalState> = {}): OperationalState => ({
  id: "state:test", planId: 1, workDay: { start: "09:00", end: "12:00" },
  planning: [
    { taskId: 10, startPlanned: "10:20", endPlanned: "10:35", assignedResourceIds: [1], spaceId: 7, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
    { taskId: 20, startPlanned: "10:05", endPlanned: "10:50", assignedResourceIds: [2], spaceId: 7, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
  ],
  tasks: [
    { id: 10, templateId: 100, startPlanned: "10:20", endPlanned: "10:35", assignedResourceIds: [1], spaceId: 7, status: "pending" } as any,
    { id: 20, templateId: 200, startPlanned: "10:05", endPlanned: "10:50", assignedResourceIds: [2], spaceId: 7, status: "pending" } as any,
  ],
  resources: [], spaces: { parentById: {}, nameById: { 7: "Any studio" }, capacityById: { 7: 1 }, concurrencyById: { 7: 1 }, exclusiveById: { 7: true }, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {}, cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} }, source: "EngineInput", schemaVersion: "ORC-SPEC-01", ...overrides,
});

test("generates repair candidates for a simple productive overlap without mutating state", () => {
  const os = state(); const before = JSON.stringify(os);
  const result = buildBaselineOverlapRepairCandidates(os, { createdAt: "2026-07-01T00:00:00.000Z" });
  assert.equal(result.summary.generatedCandidateCount, 4);
  assert.equal(result.candidates[0].metadata.strategy, "BASELINE_SPACE_OVERLAP_REPAIR");
  assert.equal(result.candidates[0].metadata.executesTransformations, true);
  assert.equal(result.candidates.filter((c) => c.metadata.movedTaskId === 10).length, 2);
  assert.equal(result.candidates.filter((c) => c.metadata.movedTaskId === 20).length, 2);
  assert.deepEqual(result.candidates[0].metadata.conflictingTaskIds, [10, 20]);
  assert.equal(result.evidence[0].kind, "baseline-overlap-repair-candidate-generated");
  assert.equal(JSON.stringify(os), before);
});

test("generates earlier variant when there is room before the fixed task", () => {
  const result = buildBaselineOverlapRepairCandidates(state());
  assert.deepEqual(result.candidates[1].assignments[0], { taskId: 10, startPlanned: "09:50", endPlanned: "10:05", spaceId: 7, resourceIds: [1] });
});

test("does not move done or in_progress tasks", () => {
  const done = state({ tasks: [{ id: 10, status: "done", assignedResourceIds: [1], spaceId: 7 } as any, { id: 20, status: "pending", assignedResourceIds: [2], spaceId: 7 } as any] });
  { const r = buildBaselineOverlapRepairCandidates(done); assert.equal(r.candidates.every((c) => c.metadata.movedTaskId !== 10), true); assert.equal(r.summary.generatedCandidateCount, 2); }
  const inProgress = state({ tasks: [{ id: 10, status: "pending", assignedResourceIds: [1], spaceId: 7 } as any, { id: 20, status: "in_progress", assignedResourceIds: [2], spaceId: 7 } as any] });
  { const r = buildBaselineOverlapRepairCandidates(inProgress); assert.equal(r.candidates.every((c) => c.metadata.movedTaskId !== 20), true); assert.equal(r.summary.generatedCandidateCount, 2); }
});

test("respects obvious time/full locks", () => {
  { const r = buildBaselineOverlapRepairCandidates(state({ locks: [{ taskId: 10, lockType: "time" } as any] })); assert.equal(r.candidates.every((c) => c.metadata.movedTaskId !== 10), true); assert.equal(r.summary.generatedCandidateCount, 2); }
  assert.equal(buildBaselineOverlapRepairCandidates(state({ locks: [{ taskId: 10, lockType: "full" } as any, { taskId: 20, lockType: "time" } as any] })).summary.skippedReason, "locked_task_in_overlap");
});

test("does not treat transport arrivals as productive repair overlap", () => {
  const os = state({ planning: [
    { taskId: 10, startPlanned: "10:00", endPlanned: "10:10", assignedResourceIds: [], spaceId: 7, operationalRole: "transport_arrival", spaceOccupancyMode: "shared", allowsSpaceOverlap: true },
    { taskId: 20, startPlanned: "10:00", endPlanned: "10:10", assignedResourceIds: [], spaceId: 7, operationalRole: "transport_arrival", spaceOccupancyMode: "shared", allowsSpaceOverlap: true },
  ] as any, constraints: { transportContract: { configured: true, arrivalTemplateId: null, departureTemplateId: null, arrivalTemplateName: null, departureTemplateName: null, vehicleCapacity: 6, source: "test", readOnly: true } } as any });
  assert.equal(buildBaselineOverlapRepairCandidates(os).summary.generatedCandidateCount, 0);
});

test("is deterministic and does not hardcode ids or spaces", () => {
  const os = state({ planning: [
    { taskId: 101, startPlanned: "09:30", endPlanned: "09:50", assignedResourceIds: [], spaceId: 99, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
    { taskId: 102, startPlanned: "09:40", endPlanned: "10:20", assignedResourceIds: [8], spaceId: 99, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
  ] as any, tasks: [{ id: 101, status: "pending", spaceId: 99, assignedResourceIds: [] } as any, { id: 102, status: "pending", spaceId: 99, assignedResourceIds: [8] } as any], spaces: { parentById: {}, nameById: { 99: "Other" }, capacityById: { 99: 1 }, concurrencyById: { 99: 1 }, exclusiveById: { 99: true }, priorityById: {} } });
  const a = buildBaselineOverlapRepairCandidates(os); const b = buildBaselineOverlapRepairCandidates(os);
  assert.deepEqual(a.candidates.map((c) => [c.id, c.assignments]), b.candidates.map((c) => [c.id, c.assignments]));
  assert.equal(a.candidates[0].assignments[0].taskId, 101);
});


test("uses baseline hard feasibility spaceOverlapGroups as source of truth and ignores concurrent valid transport", () => {
  const os = state({
    planning: [
      ...state().planning,
      ...[1,2,3,4,5,6].map((i) => ({ taskId: 300 + i, startPlanned: "10:20", endPlanned: "10:35", assignedResourceIds: [], spaceId: 49, operationalRole: "transport_arrival", spaceOccupancyMode: "shared", allowsSpaceOverlap: true } as any)),
    ],
    tasks: [
      ...state().tasks,
      ...[1,2,3,4,5,6].map((i) => ({ id: 300 + i, templateId: 900, status: "pending", spaceId: 49 } as any)),
    ],
    constraints: { transportContract: { configured: true, arrivalTemplateId: 900, departureTemplateId: null, arrivalTemplateName: null, departureTemplateName: null, vehicleCapacity: 6, source: "test", readOnly: true } } as any,
  });
  const audit = { hardFeasible: false, spaceOverlapGroups: [{ spaceId: 7, timeWindow: { start: "10:20", end: "10:35" }, taskIds: [10, 20], taskCount: 2, roleLabels: ["productive_task", "productive_task"], occupancyModes: ["exclusive", "exclusive"] }] } as any;
  const result = buildBaselineOverlapRepairCandidates(os, { baselineSeedHardFeasibility: audit });
  assert.equal(result.summary.sourceOfTruth, "baseline-hard-feasibility-audit");
  assert.equal(result.summary.auditSpaceOverlapGroupCount, 1);
  assert.equal(result.summary.auditRepairableGroupCount, 1);
  assert.deepEqual(result.summary.conflictingTaskIds, [10, 20]);
  assert.equal(result.summary.skippedReason, null);
  assert.ok(result.summary.generatedCandidateCount > 0);
});

test("records unsupported groups without blocking a supported audit group", () => {
  const audit = { hardFeasible: false, spaceOverlapGroups: [
    { spaceId: 7, timeWindow: { start: "10:00", end: "10:10" }, taskIds: [1, 2, 3], taskCount: 3, roleLabels: ["productive_task", "productive_task", "productive_task"], occupancyModes: ["exclusive", "exclusive", "exclusive"] },
    { spaceId: 7, timeWindow: { start: "10:20", end: "10:35" }, taskIds: [10, 20], taskCount: 2, roleLabels: ["productive_task", "productive_task"], occupancyModes: ["exclusive", "exclusive"] },
  ] } as any;
  const result = buildBaselineOverlapRepairCandidates(state(), { baselineSeedHardFeasibility: audit });
  assert.deepEqual(result.summary.conflictingTaskIds, [10, 20]);
  assert.equal(result.summary.unsupportedGroupCount, 1);
  assert.equal(result.summary.unsupportedGroupsSample[0].skippedReason, "unsupported_overlap_cardinality");
});

test("limits multiple repairable audit groups to the deterministic first group", () => {
  const os = state({ planning: [
    ...state().planning,
    { taskId: 30, startPlanned: "09:10", endPlanned: "09:30", assignedResourceIds: [], spaceId: 8, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
    { taskId: 40, startPlanned: "09:15", endPlanned: "09:35", assignedResourceIds: [], spaceId: 8, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
  ] as any, tasks: [...state().tasks, { id: 30, status: "pending", spaceId: 8 } as any, { id: 40, status: "pending", spaceId: 8 } as any] });
  const g = (taskIds: number[], start: string, spaceId: number) => ({ spaceId, timeWindow: { start, end: "09:30" }, taskIds, taskCount: 2, roleLabels: ["productive_task", "productive_task"], occupancyModes: ["exclusive", "exclusive"] });
  const result = buildBaselineOverlapRepairCandidates(os, { baselineSeedHardFeasibility: { hardFeasible: false, spaceOverlapGroups: [g([10,20], "10:20", 7), g([30,40], "09:15", 8)] } as any });
  assert.deepEqual(result.summary.conflictingTaskIds, [30, 40]);
  assert.equal(result.summary.repairableGroupSelection?.selectionReason, "multiple_repairable_groups_limited_to_first");
});
