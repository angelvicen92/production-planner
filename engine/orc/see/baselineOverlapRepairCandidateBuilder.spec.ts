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
  assert.equal(result.summary.generatedCandidateCount, 2);
  assert.equal(result.candidates[0].metadata.strategy, "BASELINE_SPACE_OVERLAP_REPAIR");
  assert.equal(result.candidates[0].metadata.executesTransformations, true);
  assert.deepEqual(result.candidates[0].assignments[0], { taskId: 10, startPlanned: "10:50", endPlanned: "11:05", spaceId: 7, resourceIds: [1] });
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
  assert.equal(buildBaselineOverlapRepairCandidates(done).summary.skippedReason, "protected_task_in_overlap");
  const inProgress = state({ tasks: [{ id: 10, status: "pending", assignedResourceIds: [1], spaceId: 7 } as any, { id: 20, status: "in_progress", assignedResourceIds: [2], spaceId: 7 } as any] });
  assert.equal(buildBaselineOverlapRepairCandidates(inProgress).summary.skippedReason, "protected_task_in_overlap");
});

test("respects obvious time/full locks", () => {
  assert.equal(buildBaselineOverlapRepairCandidates(state({ locks: [{ taskId: 10, lockType: "time" } as any] })).summary.skippedReason, "locked_task_in_overlap");
  assert.equal(buildBaselineOverlapRepairCandidates(state({ locks: [{ taskId: 10, lockType: "full" } as any, { taskId: 20, lockType: "time" } as any] })).summary.skippedReason, "locked_task_in_overlap");
});

test("does not treat transport arrivals as productive repair overlap", () => {
  const os = state({ planning: [
    { taskId: 10, startPlanned: "10:00", endPlanned: "10:10", assignedResourceIds: [], spaceId: 7, operationalRole: "transport_arrival", spaceOccupancyMode: "shared", allowsSpaceOverlap: true },
    { taskId: 20, startPlanned: "10:00", endPlanned: "10:10", assignedResourceIds: [], spaceId: 7, operationalRole: "transport_arrival", spaceOccupancyMode: "shared", allowsSpaceOverlap: true },
  ] as any });
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
