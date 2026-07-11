import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalState } from "../contracts";
import { buildBaselineRepairConflictClosure } from "./baselineOverlapRepairConflictClosure";

const state = (): OperationalState => ({
  id: "closure:test", planId: 1, workDay: { start: "09:00", end: "13:00" },
  planning: [
    { taskId: 1, startPlanned: "10:20", endPlanned: "10:35", assignedResourceIds: [1], spaceId: 7, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
    { taskId: 2, startPlanned: "10:05", endPlanned: "10:50", assignedResourceIds: [2], spaceId: 7, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
    { taskId: 3, startPlanned: "11:15", endPlanned: "11:45", assignedResourceIds: [3], spaceId: 8, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
  ],
  tasks: [
    { id: 1, contestantId: 100, templateId: 10, status: "pending", assignedResourceIds: [1], spaceId: 7 } as any,
    { id: 2, contestantId: 100, templateId: 20, status: "pending", assignedResourceIds: [2], spaceId: 7 } as any,
    { id: 3, contestantId: 100, templateId: 30, status: "pending", assignedResourceIds: [3], spaceId: 8 } as any,
  ],
  resources: [], spaces: { parentById: {}, nameById: { 7: "A", 8: "B" }, capacityById: { 7: 1, 8: 1 }, concurrencyById: { 7: 1, 8: 1 }, exclusiveById: { 7: true, 8: true }, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {}, cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} }, source: "EngineInput", schemaVersion: "ORC-SPEC-01",
});

test("builds a deterministic two-task closure from operational boundaries", () => {
  const result = buildBaselineRepairConflictClosure({ operationalState: state(), originalConflictTaskIds: [1,2], rootTaskId: 2, direction: "forward" });
  assert.ok(result.candidates.length > 0);
  const selected = result.candidates.find((c) => c.assignments.length === 2);
  assert.ok(selected);
  assert.deepEqual(selected.assignments.map((a) => a.taskId), [2, 3]);
  assert.deepEqual(selected.assignments.map((a) => [a.startPlanned, a.endPlanned]), [["10:50", "11:35"], ["11:35", "12:05"]]);
  assert.equal(selected.blockingReason, null);
  assert.equal(result.summary.version, "BASELINE-OVERLAP-REPAIR-CONFLICT-CLOSURE-V1");
  assert.equal(result.summary.deterministic, true);
});

test("blocks closure when a displaced task is protected", () => {
  const os = state();
  (os.tasks.find((t) => t.id === 3) as any).status = "done";
  const result = buildBaselineRepairConflictClosure({ operationalState: os, originalConflictTaskIds: [1,2], rootTaskId: 2, direction: "forward" });
  assert.ok((result.summary.rejectedReasonCounts.protected_task ?? 0) > 0);
  assert.equal(result.candidates.some((c) => c.movedTaskIds.includes(3)), false);
});

const multiConflictState = (): OperationalState => ({
  id: "closure:multi", planId: 1, workDay: { start: "09:00", end: "14:00" },
  planning: [
    { taskId: 10, startPlanned: "09:00", endPlanned: "10:00", assignedResourceIds: [10], spaceId: 1, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
    { taskId: 20, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [20], spaceId: 2, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
    { taskId: 30, startPlanned: "10:30", endPlanned: "11:00", assignedResourceIds: [30], spaceId: 3, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
    { taskId: 40, startPlanned: "11:00", endPlanned: "11:30", assignedResourceIds: [40], spaceId: 4, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
  ],
  tasks: [
    { id: 10, contestantId: 500, templateId: 10, status: "pending", assignedResourceIds: [10], spaceId: 1 } as any,
    { id: 20, contestantId: 500, templateId: 20, status: "pending", assignedResourceIds: [20], spaceId: 2 } as any,
    { id: 30, contestantId: 500, templateId: 30, status: "pending", assignedResourceIds: [30], spaceId: 3 } as any,
    { id: 40, contestantId: 500, templateId: 40, status: "pending", assignedResourceIds: [40], spaceId: 4 } as any,
  ],
  resources: [], spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {}, cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} }, source: "EngineInput", schemaVersion: "ORC-SPEC-01",
});

test("reaudits root after displacing the first sibling conflict", () => {
  const result = buildBaselineRepairConflictClosure({ operationalState: multiConflictState(), originalConflictTaskIds: [10,20], rootTaskId: 10, direction: "forward", limits: { maxClosureTasks: 2, maxClosureDepth: 2, maxGeneratedClosureCandidates: 1, maxBoundaryCandidatesPerRoot: 2 } });
  assert.equal(result.candidates.some((c) => c.conflictsRemaining.length === 0 && c.movedTaskIds.length === 2), false);
  assert.ok((result.summary.residualConflictReasonCounts.contestant_overlap ?? 0) > 0);
  assert.equal(result.summary.previewRejectedCandidateCount > 0, true);
});

test("invalid preview branches do not consume executable candidate budget", () => {
  const result = buildBaselineRepairConflictClosure({ operationalState: multiConflictState(), originalConflictTaskIds: [10,20], rootTaskId: 10, direction: "forward", limits: { maxClosureTasks: 4, maxClosureDepth: 4, maxGeneratedClosureCandidates: 1, maxBoundaryCandidatesPerRoot: 16 } });
  assert.ok(result.summary.boundaryCandidatesEvaluated > result.summary.executableCandidateCount);
  assert.equal(result.candidates.every((c) => c.residualConflictCount === 0 && c.conflictsRemaining.length === 0), true);
});
