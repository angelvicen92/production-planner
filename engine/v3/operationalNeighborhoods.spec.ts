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
  countDependencyViolations,
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

// 7. Main-stage gap fill descarta movimientos que romperían dependencias.
{
  const input = baseInput([
    { id: 60, planId: PLAN_ID, templateId: 60, zoneId: 1, spaceId: 101, contestantId: 60, status: "pending", durationOverrideMin: 30 },
    { id: 61, planId: PLAN_ID, templateId: 61, zoneId: 2, spaceId: 201, contestantId: 61, status: "pending", durationOverrideMin: 20 },
    { id: 62, planId: PLAN_ID, templateId: 62, zoneId: 1, spaceId: 101, contestantId: 61, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [61] },
    { id: 63, planId: PLAN_ID, templateId: 63, zoneId: 1, spaceId: 101, contestantId: 63, status: "pending", durationOverrideMin: 20 },
  ]);
  const output = completeOutput([
    { taskId: 60, startPlanned: "09:00", endPlanned: "09:30" },
    { taskId: 61, startPlanned: "09:30", endPlanned: "09:50" },
    { taskId: 62, startPlanned: "09:50", endPlanned: "10:20" },
    { taskId: 63, startPlanned: "10:20", endPlanned: "10:40" },
  ]);
  const candidates = generateOperationalNeighborhoodCandidates(input, output).filter((item) => item.reason === "main_stage_gap_fill");
  assert.ok(candidates.length > 0, "an independent main-stage task should fill the small gap");
  for (const candidate of candidates) assert.equal(countDependencyViolations(input, candidate.output), 0, "gap fill must preserve dependencies");
}

// 8. Feeder advance nunca adelanta fuera de disponibilidad.
{
  const input = baseInput([
    { id: 70, planId: PLAN_ID, templateId: 70, zoneId: 2, spaceId: 201, contestantId: 70, status: "pending", durationOverrideMin: 20 },
    { id: 71, planId: PLAN_ID, templateId: 71, zoneId: 1, spaceId: 101, contestantId: 70, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [70] },
    { id: 72, planId: PLAN_ID, templateId: 72, zoneId: 2, spaceId: 202, contestantId: 72, status: "pending", durationOverrideMin: 30 },
  ], { contestantAvailabilityById: { 70: { start: "09:30", end: "11:30" }, 72: { start: "09:00", end: "11:30" } } });
  const output = completeOutput([
    { taskId: 72, startPlanned: "09:00", endPlanned: "09:30" },
    { taskId: 70, startPlanned: "10:00", endPlanned: "10:20" },
    { taskId: 71, startPlanned: "10:20", endPlanned: "10:50" },
  ]);
  const candidates = generateOperationalNeighborhoodCandidates(input, output).filter((item) => item.reason === "feeder_advance");
  assert.ok(candidates.length > 0, "feeder should have a valid availability-aligned earlier slot");
  for (const candidate of candidates) assert.ok((byId(candidate.output).get(70)?.startPlanned ?? "00:00") >= "09:30", "feeder must stay inside availability");
}

// 9. Coach block no mueve tareas done/in_progress/locked.
{
  const input = baseInput([
    { id: 80, planId: PLAN_ID, templateId: 80, zoneId: 2, spaceId: 201, contestantId: 80, status: "done", durationOverrideMin: 30, startPlanned: "09:00", endPlanned: "09:30" },
    { id: 81, planId: PLAN_ID, templateId: 81, zoneId: 2, spaceId: 202, contestantId: 81, status: "in_progress", durationOverrideMin: 30, startPlanned: "09:30", endPlanned: "10:00" },
    { id: 82, planId: PLAN_ID, templateId: 82, zoneId: 2, spaceId: 203, contestantId: 82, status: "pending", durationOverrideMin: 30 },
    { id: 83, planId: PLAN_ID, templateId: 83, zoneId: 2, spaceId: 204, contestantId: 83, status: "pending", durationOverrideMin: 30 },
  ], { locks: [{ id: 82, planId: PLAN_ID, taskId: 82, lockType: "time", lockedStart: "10:00", lockedEnd: "10:30" }] });
  const output = completeOutput([
    { taskId: 80, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 81, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [COACH_B] },
    { taskId: 82, startPlanned: "10:00", endPlanned: "10:30", assignedResources: [COACH_A] },
    { taskId: 83, startPlanned: "10:30", endPlanned: "11:00", assignedResources: [COACH_B] },
  ]);
  for (const candidate of generateOperationalNeighborhoodCandidates(input, output)) {
    assert.deepEqual(byId(candidate.output).get(80), byId(output).get(80));
    assert.deepEqual(byId(candidate.output).get(81), byId(output).get(81));
    assert.deepEqual(byId(candidate.output).get(82), byId(output).get(82));
  }
}

// 10. Restrictive talent bundle mantiene el orden de su cadena feeder.
{
  const input = baseInput([
    { id: 90, planId: PLAN_ID, templateId: 90, zoneId: 2, spaceId: 201, contestantId: 90, status: "pending", durationOverrideMin: 20 },
    { id: 91, planId: PLAN_ID, templateId: 91, zoneId: 2, spaceId: 202, contestantId: 90, status: "pending", durationOverrideMin: 20, dependsOnTaskIds: [90] },
    { id: 92, planId: PLAN_ID, templateId: 92, zoneId: 1, spaceId: 101, contestantId: 90, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [90, 91] },
  ], { contestantAvailabilityById: { 90: { start: "09:00", end: "11:00" } } });
  const output = completeOutput([
    { taskId: 90, startPlanned: "09:30", endPlanned: "09:50" },
    { taskId: 91, startPlanned: "09:50", endPlanned: "10:10" },
    { taskId: 92, startPlanned: "10:10", endPlanned: "10:40" },
  ]);
  const candidate = generateOperationalNeighborhoodCandidates(input, output).find((item) => item.reason === "restrictive_talent_bundle");
  assert.ok(candidate, "a two-feeder restrictive bundle should be generated");
  assert.equal(countDependencyViolations(input, candidate.output), 0, "bundle must preserve dependency order");
}

console.log("engine/v3/operationalNeighborhoods.spec.ts: OK");
