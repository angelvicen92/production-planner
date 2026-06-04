import assert from "node:assert/strict";
import { generatePlanV3 } from "./index";
import { solve_v3_phaseA_attempt } from "./phaseAHeuristic";
import type { EngineV3Input } from "./types";
import {
  countContestantOverlaps,
  countContestantWindowViolations,
  countExecutedTaskMoved,
  countLockedTaskMoved,
  countMealCrossings,
  countSpaceOverlaps,
} from "./benchmarks/metrics";

const baseInput = (overrides: Partial<EngineV3Input> = {}): EngineV3Input => ({
  planId: 1,
  workDay: { start: "09:00", end: "11:00" },
  meal: { start: "12:00", end: "12:30" },
  camerasAvailable: 2,
  contestantMealDurationMinutes: 30,
  contestantMealMaxSimultaneous: 10,
  tasks: [],
  locks: [],
  groupingZoneIds: [],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [],
  resourceItemComponents: {},
  ...overrides,
});

const relevantSignature = (output: any) => ({
  solutionSource: output.v3Meta?.solutionSource ?? null,
  planned: [...(output.plannedTasks ?? [])]
    .map((task: any) => ({ taskId: Number(task.taskId), start: task.startPlanned, end: task.endPlanned }))
    .sort((a: any, b: any) => a.taskId - b.taskId),
});

// Test 1 — retry de candidato alternativo resuelve un falso negativo greedy reproducible a nivel Phase A.
{
  const input = baseInput({
    contestantAvailabilityById: { 2: { start: "09:00", end: "10:00" } },
    tasks: [
      { id: 1, planId: 1, templateId: 1, templateName: "Flexible blocker", zoneId: 1, spaceId: 11, contestantId: 1, status: "pending", durationOverrideMin: 60 },
      { id: 2, planId: 1, templateId: 2, templateName: "Restrictive", zoneId: 1, spaceId: 11, contestantId: 2, status: "pending", durationOverrideMin: 60 },
    ] as any,
  });

  const forcedBadGreedy = solve_v3_phaseA_attempt(input, { forcedTaskStarts: { 2: 10 * 60 }, maxIterations: 8000 } as any);
  assert.equal(forcedBadGreedy.complete, false, "the forced first branch should reproduce a blocked restrictive task");

  const retriedAlternative = solve_v3_phaseA_attempt(input, { forcedTaskStarts: { 1: 10 * 60 }, maxIterations: 8000 } as any);
  assert.equal(retriedAlternative.complete, true, "the deterministic alternative branch should recover the complete plan");
  const byId = new Map((retriedAlternative.plannedTasks ?? []).map((task: any) => [Number(task.taskId), task]));
  assert.equal((byId.get(2) as any)?.startPlanned, "09:00");
  assert.equal((byId.get(1) as any)?.startPlanned, "10:00");
}

// Test 2 — determinismo: mismo input, mismo output relevante y misma solutionSource.
{
  const input = baseInput({
    contestantAvailabilityById: { 2: { start: "09:00", end: "10:00" } },
    tasks: [
      { id: 11, planId: 1, templateId: 11, templateName: "Flexible", zoneId: 1, spaceId: 11, contestantId: 1, status: "pending", durationOverrideMin: 60 },
      { id: 12, planId: 1, templateId: 12, templateName: "Restrictive", zoneId: 1, spaceId: 11, contestantId: 2, status: "pending", durationOverrideMin: 60 },
    ] as any,
  });
  const outputs = Array.from({ length: 3 }, () => generatePlanV3(input, { timeLimitMs: 0 }));
  assert.deepEqual(outputs.map(relevantSignature), [relevantSignature(outputs[0]), relevantSignature(outputs[0]), relevantSignature(outputs[0])]);
}

// Test 3 — hard constraints se mantienen con backtracking habilitado.
{
  const input = baseInput({
    workDay: { start: "09:00", end: "13:00" },
    meal: { start: "12:00", end: "12:30" },
    contestantAvailabilityById: { 3: { start: "10:00", end: "12:00" } },
    locks: [{ id: 1, planId: 1, taskId: 22, lockType: "time", lockedStart: "09:30", lockedEnd: "10:00" }],
    tasks: [
      { id: 21, planId: 1, templateId: 21, templateName: "Done", zoneId: 1, spaceId: 11, contestantId: 1, status: "done", startPlanned: "09:00", endPlanned: "09:30", durationOverrideMin: 30 },
      { id: 22, planId: 1, templateId: 22, templateName: "Locked", zoneId: 1, spaceId: 11, contestantId: 2, status: "pending", startPlanned: "09:30", endPlanned: "10:00", durationOverrideMin: 30 },
      { id: 23, planId: 1, templateId: 23, templateName: "Available", zoneId: 1, spaceId: 11, contestantId: 3, status: "pending", durationOverrideMin: 30 },
      { id: 24, planId: 1, templateId: 24, templateName: "Other", zoneId: 1, spaceId: 12, contestantId: 4, status: "pending", durationOverrideMin: 30 },
    ] as any,
  });
  const output = generatePlanV3(input, { timeLimitMs: 0, enableLimitedBacktracking: true });
  assert.equal(output.hardFeasible, true);
  assert.equal(countExecutedTaskMoved(input, output), 0);
  assert.equal(countLockedTaskMoved(input, output), 0);
  if (output.complete) {
    assert.equal(countSpaceOverlaps(input, output), 0);
    assert.equal(countContestantOverlaps(input, output), 0);
    assert.equal(countContestantWindowViolations(input, output), 0);
    assert.equal(countMealCrossings(input, output), 0);
  }
}

// Test 4 — presupuesto bajo: no bucle, no excepción y metadata de fallback controlada.
{
  const input = baseInput({
    tasks: [
      { id: 31, planId: 1, templateId: 31, templateName: "Too long A", zoneId: 1, spaceId: 11, contestantId: 1, status: "pending", durationOverrideMin: 90 },
      { id: 32, planId: 1, templateId: 32, templateName: "Too long B", zoneId: 1, spaceId: 11, contestantId: 2, status: "pending", durationOverrideMin: 90 },
    ] as any,
  });
  const output = generatePlanV3(input, { timeLimitMs: 0, maxSearchMs: 0, maxBacktrackAttempts: 50 });
  assert.equal(typeof output.complete, "boolean");
  assert.ok(output.v3Meta?.backtrackingAttempted === false || output.v3Meta?.backtrackingFallbackReason || output.v3Meta?.solutionSource);
}

console.log("engine/v3/limitedBacktracking.spec.ts: OK");
