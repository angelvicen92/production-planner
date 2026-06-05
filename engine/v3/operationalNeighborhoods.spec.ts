import assert from "node:assert/strict";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { generatePlanV3 } from "./index";
import {
  generateOperationalNeighborhoodCandidates,
} from "./operationalNeighborhoods";
import {
  calculateCoachSwitchCount,
  calculateMainStageGaps,
  calculateRestrictiveTalentAverageStartOffset,
  countHardConstraintViolations,
} from "./metrics";

const PLAN_ID = 91010;
const COACH_A = 501;
const COACH_B = 502;

const baseInput = (tasks: any[], overrides: Partial<EngineV3Input> = {}): EngineV3Input => ({
  planId: PLAN_ID,
  workDay: { start: "09:00", end: "11:30" },
  meal: { start: "12:00", end: "12:30" },
  camerasAvailable: 2,
  contestantMealDurationMinutes: 30,
  contestantMealMaxSimultaneous: 4,
  tasks: tasks as any,
  locks: [],
  groupingZoneIds: [1],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [
    { id: COACH_A, resourceItemId: 9001, typeId: 10, name: "Coach A", isAvailable: true },
    { id: COACH_B, resourceItemId: 9002, typeId: 10, name: "Coach B", isAvailable: true },
  ],
  resourceItemComponents: {},
  optimizerMainZoneId: 1,
  optimizerPrioritizeMainZone: true,
  optimizerMainZoneOptKeepBusy: true,
  optimizerWeights: {},
  ...overrides,
});

const completeOutput = (plannedTasks: EngineOutput["plannedTasks"]): EngineOutput => ({
  feasible: true,
  complete: true,
  hardFeasible: true,
  plannedTasks,
  unplanned: [],
  warnings: [],
});

const byId = (output: EngineOutput) => new Map((output.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));

// 1. El generador no mueve done/in_progress/locks.
{
  const input = baseInput([
    { id: 1, planId: PLAN_ID, templateId: 1, zoneId: 1, spaceId: 101, contestantId: 1, status: "done", durationOverrideMin: 30, startPlanned: "09:00", endPlanned: "09:30" },
    { id: 2, planId: PLAN_ID, templateId: 2, zoneId: 1, spaceId: 101, contestantId: 2, status: "in_progress", durationOverrideMin: 30, startPlanned: "09:30", endPlanned: "10:00" },
    { id: 3, planId: PLAN_ID, templateId: 3, zoneId: 2, spaceId: 201, contestantId: 3, status: "pending", durationOverrideMin: 30, startPlanned: "10:00", endPlanned: "10:30" },
    { id: 4, planId: PLAN_ID, templateId: 4, zoneId: 2, spaceId: 202, contestantId: 4, status: "pending", durationOverrideMin: 30 },
    { id: 5, planId: PLAN_ID, templateId: 5, zoneId: 2, spaceId: 203, contestantId: 5, status: "pending", durationOverrideMin: 30 },
  ], {
    locks: [{ id: 1, planId: PLAN_ID, taskId: 3, lockType: "time", lockedStart: "10:00", lockedEnd: "10:30" }],
    contestantAvailabilityById: {
      1: { start: "09:00", end: "11:30" },
      2: { start: "09:00", end: "11:30" },
      3: { start: "09:00", end: "11:30" },
      4: { start: "09:00", end: "10:30" },
      5: { start: "09:00", end: "11:30" },
    },
  });
  const output = completeOutput([
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30" },
    { taskId: 2, startPlanned: "09:30", endPlanned: "10:00" },
    { taskId: 3, startPlanned: "10:00", endPlanned: "10:30" },
    { taskId: 5, startPlanned: "09:00", endPlanned: "09:30" },
    { taskId: 4, startPlanned: "09:30", endPlanned: "10:00" },
  ]);
  const candidates = generateOperationalNeighborhoodCandidates(input, output);
  assert.ok(candidates.length >= 1, "synthetic fixed-task case should produce at least one movable candidate");
  for (const candidate of candidates) {
    const planned = byId(candidate.output);
    assert.deepEqual(planned.get(1), byId(output).get(1), "done task must remain fixed");
    assert.deepEqual(planned.get(2), byId(output).get(2), "in_progress task must remain fixed");
    assert.deepEqual(planned.get(3), byId(output).get(3), "time-locked task must remain fixed");
  }
}

// 2. El generador no produce candidatos con hard violations.
{
  const input = baseInput([
    { id: 10, planId: PLAN_ID, templateId: 10, zoneId: 2, spaceId: 201, contestantId: 10, status: "pending", durationOverrideMin: 30 },
    { id: 11, planId: PLAN_ID, templateId: 11, zoneId: 2, spaceId: 202, contestantId: 11, status: "pending", durationOverrideMin: 30 },
    { id: 12, planId: PLAN_ID, templateId: 12, zoneId: 2, spaceId: 203, contestantId: 12, status: "pending", durationOverrideMin: 30 },
  ], {
    contestantAvailabilityById: {
      10: { start: "09:00", end: "11:30" },
      11: { start: "09:00", end: "10:00" },
      12: { start: "09:00", end: "11:30" },
    },
  });
  const output = completeOutput([
    { taskId: 10, startPlanned: "09:00", endPlanned: "09:30" },
    { taskId: 12, startPlanned: "09:30", endPlanned: "10:00" },
    { taskId: 11, startPlanned: "09:30", endPlanned: "10:00" },
  ]);
  for (const candidate of generateOperationalNeighborhoodCandidates(input, output)) {
    assert.equal(countHardConstraintViolations(input, candidate.output), 0, "neighborhood candidate must be hard-valid");
  }
}

// 3. Advance restrictive talent mejora timing en caso sintético.
{
  const input = baseInput([
    { id: 20, planId: PLAN_ID, templateId: 20, zoneId: 2, spaceId: 201, contestantId: 20, status: "pending", durationOverrideMin: 30 },
    { id: 21, planId: PLAN_ID, templateId: 21, zoneId: 2, spaceId: 202, contestantId: 21, status: "pending", durationOverrideMin: 30 },
  ], {
    contestantAvailabilityById: {
      20: { start: "09:00", end: "11:30" },
      21: { start: "09:00", end: "10:00" },
    },
  });
  const output = completeOutput([
    { taskId: 20, startPlanned: "09:00", endPlanned: "09:30" },
    { taskId: 21, startPlanned: "09:30", endPlanned: "10:00" },
  ]);
  const candidate = generateOperationalNeighborhoodCandidates(input, output).find((item) => item.reason === "advance_restrictive_talent");
  assert.ok(candidate, "advance restrictive candidate should be generated");
  assert.ok((calculateRestrictiveTalentAverageStartOffset(input, candidate.output) ?? 999) < (calculateRestrictiveTalentAverageStartOffset(input, output) ?? 999));
}

// 4. Coach block compaction reduce switches en caso sintético.
{
  const input = baseInput([
    { id: 30, planId: PLAN_ID, templateId: 30, zoneId: 2, spaceId: 201, contestantId: 30, status: "pending", durationOverrideMin: 30 },
    { id: 31, planId: PLAN_ID, templateId: 31, zoneId: 2, spaceId: 202, contestantId: 31, status: "pending", durationOverrideMin: 30 },
    { id: 32, planId: PLAN_ID, templateId: 32, zoneId: 2, spaceId: 203, contestantId: 32, status: "pending", durationOverrideMin: 30 },
  ]);
  const output = completeOutput([
    { taskId: 30, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 31, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [COACH_B] },
    { taskId: 32, startPlanned: "10:00", endPlanned: "10:30", assignedResources: [COACH_A] },
  ]);
  const candidate = generateOperationalNeighborhoodCandidates(input, output).find((item) => item.reason === "coach_block_compaction");
  assert.ok(candidate, "coach compaction candidate should be generated");
  assert.ok((calculateCoachSwitchCount(input, candidate.output) ?? 999) < (calculateCoachSwitchCount(input, output) ?? 0));
}

// 5. Candidate selection rechaza candidato si aumenta huecos de plató principal.
{
  const input = baseInput([
    { id: 40, planId: PLAN_ID, templateId: 40, zoneId: 1, spaceId: 101, contestantId: 40, status: "pending", durationOverrideMin: 30 },
    { id: 41, planId: PLAN_ID, templateId: 41, zoneId: 1, spaceId: 101, contestantId: 41, status: "pending", durationOverrideMin: 30 },
    { id: 42, planId: PLAN_ID, templateId: 42, zoneId: 2, spaceId: 202, contestantId: 42, status: "pending", durationOverrideMin: 30 },
  ]);
  const output = completeOutput([
    { taskId: 40, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 41, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [COACH_B] },
    { taskId: 42, startPlanned: "10:00", endPlanned: "10:30", assignedResources: [COACH_A] },
  ]);
  assert.equal(calculateMainStageGaps(input, output)?.minutes ?? 0, 0);
  assert.equal(generateOperationalNeighborhoodCandidates(input, output).filter((item) => item.reason === "coach_block_compaction").length, 0);
}

// 6. Integración: generatePlanV3 puede aceptar un vecindario en plan completo sin hard violations.
{
  const input = baseInput([
    { id: 50, planId: PLAN_ID, templateId: 50, zoneId: 2, spaceId: 201, contestantId: 50, status: "pending", durationOverrideMin: 30 },
    { id: 51, planId: PLAN_ID, templateId: 51, zoneId: 2, spaceId: 202, contestantId: 51, status: "pending", durationOverrideMin: 30 },
  ], {
    contestantAvailabilityById: {
      50: { start: "09:00", end: "11:30" },
      51: { start: "09:00", end: "10:00" },
    },
    v3GreedyProbeForcedTaskStarts: { 51: 9 * 60 + 30 } as any,
  } as any);
  const output = generatePlanV3(input, { timeLimitMs: 0, enableLimitedBacktracking: false });
  assert.equal(output.complete, true);
  assert.equal(countHardConstraintViolations(input, output), 0);
  assert.equal(output.v3Meta?.neighborhoodSearchAttempted, true);
  assert.equal(output.v3Meta?.neighborhoodCandidateAccepted, true);
  assert.equal(output.v3Meta?.solutionSource, "operational_neighborhood");
}

console.log("engine/v3/operationalNeighborhoods.spec.ts: OK");
