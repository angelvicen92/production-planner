import assert from "node:assert/strict";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { generatePlanV3, runOperationalNeighborhoodSelection } from "./index";
import {
  generateOperationalNeighborhoodCandidates,
  generateOperationalNeighborhoodSearchCandidates,
} from "./operationalNeighborhoods";
import { calculateEngineOperationalCompactionMetrics } from "./operationalQuality";
import { compareCandidateSolutions } from "./solutionScoring";
import {
  calculateCoachSwitchCount,
  calculateMainStageGaps,
  calculateRestrictiveTalentAverageStartOffset,
  countDependencyViolations,
  countExecutedTaskMoved,
  countHardConstraintViolations,
  countLockedTaskMoved,
  countContestantWindowViolations,
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


// 11. Depth 2 encadena feeder_advance -> main_stage_gap_fill sin mover fijos ni romper hard constraints.
{
  const input = baseInput([
    { id: 100, planId: PLAN_ID, templateId: 100, zoneId: 1, spaceId: 101, contestantId: 100, status: "pending", durationOverrideMin: 30 },
    { id: 101, planId: PLAN_ID, templateId: 101, zoneId: 2, spaceId: 201, contestantId: 101, status: "pending", durationOverrideMin: 20 },
    { id: 102, planId: PLAN_ID, templateId: 102, zoneId: 1, spaceId: 101, contestantId: 101, status: "done", durationOverrideMin: 30, startPlanned: "11:00", endPlanned: "11:30", dependsOnTaskIds: [101] },
    { id: 103, planId: PLAN_ID, templateId: 103, zoneId: 2, spaceId: 201, contestantId: 103, status: "pending", durationOverrideMin: 20 },
    { id: 104, planId: PLAN_ID, templateId: 104, zoneId: 1, spaceId: 101, contestantId: 103, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [103] },
    { id: 105, planId: PLAN_ID, templateId: 105, zoneId: 2, spaceId: 205, contestantId: 105, status: "in_progress", durationOverrideMin: 20, startPlanned: "10:30", endPlanned: "10:50" },
    { id: 106, planId: PLAN_ID, templateId: 106, zoneId: 2, spaceId: 206, contestantId: 106, status: "pending", durationOverrideMin: 20 },
  ], {
    locks: [{ id: 106, planId: PLAN_ID, taskId: 106, lockType: "time", lockedStart: "10:50", lockedEnd: "11:10" }],
    contestantAvailabilityById: {
      100: { start: "09:00", end: "11:30" },
      101: { start: "09:00", end: "11:30" },
      103: { start: "09:00", end: "10:30" },
      105: { start: "09:00", end: "11:30" },
      106: { start: "09:00", end: "11:30" },
    },
  });
  const output = completeOutput([
    { taskId: 100, startPlanned: "09:00", endPlanned: "09:30" },
    { taskId: 101, startPlanned: "09:00", endPlanned: "09:20" },
    { taskId: 103, startPlanned: "09:20", endPlanned: "09:40" },
    { taskId: 104, startPlanned: "09:40", endPlanned: "10:10" },
    { taskId: 105, startPlanned: "10:30", endPlanned: "10:50" },
    { taskId: 106, startPlanned: "10:50", endPlanned: "11:10" },
  ]);
  const search = generateOperationalNeighborhoodSearchCandidates(input, output);
  const chained = search.candidates.find((candidate) => candidate.depth === 2 && candidate.chain?.join(" -> ") === "feeder_advance -> main_stage_gap_fill");
  assert.ok(chained, "depth 2 feeder/main-stage chain should be generated");
  assert.ok(search.depth1Candidates <= 10);
  assert.ok(search.depth2Candidates <= 20);
  assert.ok(search.candidates.length <= 30);
  assert.deepEqual(byId(chained.output).get(105), byId(output).get(105), "in_progress task must remain fixed at depth 2");
  assert.deepEqual(byId(chained.output).get(106), byId(output).get(106), "locked task must remain fixed at depth 2");
  assert.equal(countExecutedTaskMoved(input, chained.output), 0);
  assert.equal(countLockedTaskMoved(input, chained.output), 0);
  assert.equal(countDependencyViolations(input, chained.output), 0);
  assert.equal(countContestantWindowViolations(input, chained.output), 0);
  assert.equal(countHardConstraintViolations(input, chained.output), 0);
  assert.ok((calculateMainStageGaps(input, chained.output)?.minutes ?? 999) < (calculateMainStageGaps(input, output)?.minutes ?? 0));
  for (const candidate of search.candidates) {
    assert.equal(countHardConstraintViolations(input, candidate.output), 0, "depth 1/2 candidates with hard violations must be rejected");
  }
}


// ID 031 — la compactación no mueve estados ejecutados/locks y nunca aumenta huecos de plató.
{
  const input = baseInput([
    { id: 101, planId: PLAN_ID, templateId: 101, zoneId: 2, spaceId: 201, contestantId: 11, status: "done", durationOverrideMin: 30, startPlanned: "09:00", endPlanned: "09:30" },
    { id: 102, planId: PLAN_ID, templateId: 102, zoneId: 2, spaceId: 201, contestantId: 12, status: "pending", durationOverrideMin: 30 },
    { id: 103, planId: PLAN_ID, templateId: 103, zoneId: 1, spaceId: 101, contestantId: 13, status: "pending", durationOverrideMin: 30 },
    { id: 104, planId: PLAN_ID, templateId: 104, zoneId: 1, spaceId: 101, contestantId: 14, status: "pending", durationOverrideMin: 30 },
  ], { workDay: { start: "09:00", end: "14:00" } });
  const seed = completeOutput([
    { taskId: 101, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 102, startPlanned: "12:00", endPlanned: "12:30", assignedResources: [COACH_A] },
    { taskId: 103, startPlanned: "10:00", endPlanned: "10:30" },
    { taskId: 104, startPlanned: "10:30", endPlanned: "11:00" },
  ]);
  const candidates = generateOperationalNeighborhoodCandidates(input, seed, { allowedReasons: ["coach_gap_compaction", "late_block_pull_forward", "early_block_push_later"] });
  assert.ok(candidates.length > 0);
  for (const candidate of candidates) {
    assert.deepEqual(byId(candidate.output).get(101), byId(seed).get(101));
    assert.ok((calculateMainStageGaps(input, candidate.output)?.minutes ?? 0) <= (calculateMainStageGaps(input, seed)?.minutes ?? 0));
    assert.equal(countHardConstraintViolations(input, candidate.output), 0);
  }
}

// ID 031 — si el caso real-like está fragmentado pero todo está fijo, la metadata explica por qué se conserva.
{
  const input = baseInput([
    { id: 201, planId: PLAN_ID, templateId: 201, zoneId: 2, spaceId: 201, contestantId: 21, status: "pending", durationOverrideMin: 30 },
    { id: 202, planId: PLAN_ID, templateId: 202, zoneId: 2, spaceId: 201, contestantId: 22, status: "pending", durationOverrideMin: 30 },
  ], {
    workDay: { start: "09:00", end: "14:00" },
    locks: [
      { id: 201, planId: PLAN_ID, taskId: 201, lockType: "time", lockedStart: "09:00", lockedEnd: "09:30" },
      { id: 202, planId: PLAN_ID, taskId: 202, lockType: "time", lockedStart: "12:00", lockedEnd: "12:30" },
    ],
  });
  const seed = completeOutput([
    { taskId: 201, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 202, startPlanned: "12:00", endPlanned: "12:30", assignedResources: [COACH_A] },
  ]);
  const selected = runOperationalNeighborhoodSelection(input, seed, "phaseA_greedy");
  assert.equal(selected.meta.operationalCompactionAttempted, true);
  assert.equal(selected.meta.operationalCompactionAccepted, false);
  assert.match(String(selected.meta.operationalCompactionReason), /no candidate improved operational span/);
}

// ID 032: un coach con hueco reducible genera candidato dirigido y conserva hard/main stage.
{
  const coachId = 777;
  const input = baseInput([
    { id: 7001, planId: PLAN_ID, templateId: 70, zoneId: 2, spaceId: 201, contestantId: 701, status: "pending", durationOverrideMin: 30 },
    { id: 7002, planId: PLAN_ID, templateId: 70, zoneId: 2, spaceId: 201, contestantId: 702, status: "pending", durationOverrideMin: 30 },
  ], {
    workDay: { start: "09:00", end: "13:00" },
    optimizerMainZoneId: 1,
    coachResourceIds: [coachId],
    planResourceItems: [{ id: coachId, resourceItemId: 9701, typeId: 71, typeName: "Vocal coach", name: "Persona sintética", isAvailable: true }],
  });
  const output = completeOutput([
    { taskId: 7001, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [coachId] },
    { taskId: 7002, startPlanned: "11:30", endPlanned: "12:00", assignedResources: [coachId] },
  ]);
  const diagnostics = { attemptedTypes: [], generatedTypes: [], rejectedReasons: {} } as any;
  const candidates = generateOperationalNeighborhoodCandidates(input, output, {
    allowedReasons: ["coach_gap_compaction"],
    diagnostics,
  });
  assert.ok(candidates.some((candidate) => candidate.reason === "coach_gap_compaction"));
  for (const candidate of candidates) {
    assert.equal(countHardConstraintViolations(input, candidate.output), 0);
    assert.ok((calculateMainStageGaps(input, candidate.output)?.minutes ?? 0) <= (calculateMainStageGaps(input, output)?.minutes ?? 0));
  }
}

// ID 032: si las tareas del coach son fijas, el diagnóstico explica que no son movibles.
{
  const coachId = 778;
  const input = baseInput([
    { id: 7011, planId: PLAN_ID, templateId: 71, zoneId: 2, spaceId: 201, contestantId: 711, status: "done", durationOverrideMin: 30, startPlanned: "09:00", endPlanned: "09:30" },
    { id: 7012, planId: PLAN_ID, templateId: 71, zoneId: 2, spaceId: 201, contestantId: 712, status: "done", durationOverrideMin: 30, startPlanned: "11:30", endPlanned: "12:00" },
  ], {
    workDay: { start: "09:00", end: "13:00" },
    coachResourceIds: [coachId],
    planResourceItems: [{ id: coachId, resourceItemId: 9702, typeId: 72, category: "coach", name: "Persona fija", isAvailable: true }],
  });
  const output = completeOutput([
    { taskId: 7011, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [coachId] },
    { taskId: 7012, startPlanned: "11:30", endPlanned: "12:00", assignedResources: [coachId] },
  ]);
  const diagnostics = { attemptedTypes: [], generatedTypes: [], rejectedReasons: {} } as any;
  const candidates = generateOperationalNeighborhoodCandidates(input, output, {
    allowedReasons: ["coach_gap_compaction"],
    diagnostics,
  });
  assert.equal(candidates.length, 0);
  assert.ok((diagnostics.rejectedReasons.no_movable_tasks ?? 0) > 0, JSON.stringify(diagnostics));
}

// ID 035. Coach compaction metadata is total and pull-forward reduces a 260-minute coach gap.
{
  const input = baseInput([
    { id: 200, planId: PLAN_ID, templateId: 200, zoneId: 2, spaceId: 201, contestantId: 200, status: "pending", durationOverrideMin: 30 },
    { id: 201, planId: PLAN_ID, templateId: 201, zoneId: 2, spaceId: 201, contestantId: 201, status: "pending", durationOverrideMin: 30 },
  ], { workDay: { start: "09:00", end: "15:00" }, optimizerMainZoneId: null });
  const seed = completeOutput([
    { taskId: 200, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 201, startPlanned: "13:50", endPlanned: "14:20", assignedResources: [COACH_A] },
  ]);
  const selected = runOperationalNeighborhoodSelection(input, seed, "phaseA_greedy");
  assert.equal(selected.meta.coachCompactionAttempted, true);
  assert.equal(typeof selected.meta.coachCompactionCandidatesGenerated, "number");
  assert.ok((selected.meta.coachCompactionCandidatesGenerated ?? 0) > 0);
  assert.deepEqual(selected.meta.coachCompactionTargetedCoaches, [{
    coachId: COACH_A,
    coachName: "Coach A",
    maxGapMinutes: 260,
    spanMinutes: 320,
    idleMinutes: 260,
  }]);
  assert.equal(selected.meta.coachCompactionBestBefore?.maxCoachGapMinutes, 260);
  assert.ok((selected.meta.coachCompactionBestAfter?.maxCoachGapMinutes ?? 999) < 260);
  assert.notEqual(selected.meta.coachCompactionBestBefore, null);
  assert.notEqual(selected.meta.coachCompactionBestAfter, null);
  assert.match(selected.meta.candidateSelectionReason ?? "", /lower coach split\/gap|lower coach max gap|lower coach idle|lower coach operational span/);
  assert.equal(countHardConstraintViolations(input, selected.output), 0);
}

// ID 034. No coaches and coaches without a >=90 minute gap return explicit reasons, never null.
{
  const withoutCoach = baseInput([
    { id: 210, planId: PLAN_ID, templateId: 210, zoneId: 2, spaceId: 201, contestantId: 210, status: "pending", durationOverrideMin: 30 },
  ], { planResourceItems: [], optimizerMainZoneId: null });
  const noCoach = runOperationalNeighborhoodSelection(withoutCoach, completeOutput([
    { taskId: 210, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [] },
  ]), "phaseA_greedy");
  assert.equal(noCoach.meta.coachCompactionAttempted, false);
  assert.deepEqual(noCoach.meta.coachCompactionRejectedReasons, ["no_coaches_detected"]);

  const compactCoach = baseInput([
    { id: 211, planId: PLAN_ID, templateId: 211, zoneId: 2, spaceId: 201, contestantId: 211, status: "pending", durationOverrideMin: 30 },
    { id: 212, planId: PLAN_ID, templateId: 212, zoneId: 2, spaceId: 202, contestantId: 212, status: "pending", durationOverrideMin: 30 },
  ], { optimizerMainZoneId: null });
  const noGap = runOperationalNeighborhoodSelection(compactCoach, completeOutput([
    { taskId: 211, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 212, startPlanned: "10:00", endPlanned: "10:30", assignedResources: [COACH_A] },
  ]), "phaseA_greedy");
  assert.equal(noGap.meta.coachCompactionAttempted, false);
  assert.deepEqual(noGap.meta.coachCompactionRejectedReasons, ["no_large_coach_gap"]);
}

// ID 034. A locked early block is not moved and the rejection trace is structured.
{
  const input = baseInput([
    { id: 220, planId: PLAN_ID, templateId: 220, zoneId: 2, spaceId: 201, contestantId: 220, status: "done", durationOverrideMin: 30, startPlanned: "09:00", endPlanned: "09:30" },
    { id: 221, planId: PLAN_ID, templateId: 221, zoneId: 2, spaceId: 201, contestantId: 221, status: "in_progress", durationOverrideMin: 30, startPlanned: "13:00", endPlanned: "13:30" },
  ], { workDay: { start: "09:00", end: "15:00" }, optimizerMainZoneId: null });
  const seed = completeOutput([
    { taskId: 220, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 221, startPlanned: "13:00", endPlanned: "13:30", assignedResources: [COACH_A] },
  ]);
  const selected = runOperationalNeighborhoodSelection(input, seed, "phaseA_greedy");
  assert.equal(selected.meta.coachCompactionAttempted, true);
  assert.equal(selected.meta.coachCompactionCandidatesGenerated, 0);
  assert.ok(selected.meta.coachCompactionRejectedReasons?.includes("no_movable_tasks"));
  assert.deepEqual(byId(selected.output).get(220), byId(seed).get(220));
  assert.deepEqual(byId(selected.output).get(221), byId(seed).get(221));
}

// ID 034. Availability rejection is attributed instead of collapsing into a generic hard failure.
{
  const input = baseInput([
    { id: 230, planId: PLAN_ID, templateId: 230, zoneId: 2, spaceId: 201, contestantId: 230, status: "pending", durationOverrideMin: 30 },
    { id: 231, planId: PLAN_ID, templateId: 231, zoneId: 2, spaceId: 202, contestantId: 231, status: "pending", durationOverrideMin: 30 },
    { id: 232, planId: PLAN_ID, templateId: 232, zoneId: 2, spaceId: 201, contestantId: 232, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [231] },
  ], {
    workDay: { start: "09:00", end: "15:00" },
    optimizerMainZoneId: null,
    contestantAvailabilityById: { 230: { start: "09:00", end: "09:30" } },
  });
  const seed = completeOutput([
    { taskId: 230, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 231, startPlanned: "12:00", endPlanned: "12:30" },
    { taskId: 232, startPlanned: "13:00", endPlanned: "13:30", assignedResources: [COACH_A] },
  ]);
  const diagnostics = { attemptedTypes: [], generatedTypes: [], rejectedReasons: {} } as any;
  generateOperationalNeighborhoodCandidates(input, seed, { allowedReasons: ["coach_gap_compaction"], diagnostics });
  assert.ok((diagnostics.rejectedReasons.blocked_by_availability ?? 0) > 0, JSON.stringify(diagnostics));
}

// ID 034. If pull-forward is unavailable, push-later compacts the isolated first block.
{
  const input = baseInput([
    { id: 240, planId: PLAN_ID, templateId: 240, zoneId: 2, spaceId: 201, contestantId: 240, status: "pending", durationOverrideMin: 30 },
    { id: 241, planId: PLAN_ID, templateId: 241, zoneId: 2, spaceId: 202, contestantId: 241, status: "pending", durationOverrideMin: 30 },
  ], {
    workDay: { start: "09:00", end: "15:00" },
    optimizerMainZoneId: null,
    contestantAvailabilityById: { 240: { start: "09:00", end: "15:00" }, 241: { start: "13:00", end: "15:00" } },
  });
  const seed = completeOutput([
    { taskId: 240, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 241, startPlanned: "13:00", endPlanned: "13:30", assignedResources: [COACH_A] },
  ]);
  const candidate = generateOperationalNeighborhoodCandidates(input, seed, { allowedReasons: ["coach_gap_compaction"] })[0];
  assert.ok(candidate);
  assert.equal(byId(candidate.output).get(240)?.startPlanned, "12:30");
  assert.equal(byId(candidate.output).get(241)?.startPlanned, "13:00");
  assert.equal(countHardConstraintViolations(input, candidate.output), 0);
}

// ID 036. The concrete coach generator moves the isolated early block next to the later block.
{
  const input = baseInput([
    { id: 300, planId: PLAN_ID, templateId: 300, zoneId: 2, spaceId: 201, contestantId: 300, status: "pending", durationOverrideMin: 30 },
    { id: 301, planId: PLAN_ID, templateId: 301, zoneId: 2, spaceId: 202, contestantId: 301, status: "pending", durationOverrideMin: 30 },
    { id: 302, planId: PLAN_ID, templateId: 302, zoneId: 2, spaceId: 203, contestantId: 302, status: "pending", durationOverrideMin: 30 },
  ], { workDay: { start: "09:00", end: "15:00" }, optimizerMainZoneId: null });
  const seed = completeOutput([
    { taskId: 300, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 301, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [COACH_A] },
    { taskId: 302, startPlanned: "13:00", endPlanned: "13:30", assignedResources: [COACH_A] },
  ]);
  const before = calculateEngineOperationalCompactionMetrics(input, seed);
  const candidates = generateOperationalNeighborhoodCandidates(input, seed, { allowedReasons: ["coach_gap_compaction"] });
  assert.ok(candidates.length > 0);
  assert.ok(candidates.length <= 5);
  assert.ok(candidates.some((candidate) => {
    const after = calculateEngineOperationalCompactionMetrics(input, candidate.output);
    return after.maxCoachGapMinutes < before.maxCoachGapMinutes;
  }));
  for (const candidate of candidates) assert.equal(countHardConstraintViolations(input, candidate.output), 0);
}

// ID 036. Shifts that would create space/resource hard violations are not emitted.
{
  const input = baseInput([
    { id: 310, planId: PLAN_ID, templateId: 310, zoneId: 2, spaceId: 201, contestantId: 310, status: "pending", durationOverrideMin: 30 },
    { id: 311, planId: PLAN_ID, templateId: 311, zoneId: 2, spaceId: 202, contestantId: 311, status: "pending", durationOverrideMin: 30 },
    { id: 312, planId: PLAN_ID, templateId: 312, zoneId: 2, spaceId: 201, contestantId: 312, status: "pending", durationOverrideMin: 30 },
    { id: 313, planId: PLAN_ID, templateId: 313, zoneId: 2, spaceId: 202, contestantId: 313, status: "pending", durationOverrideMin: 30 },
  ], { workDay: { start: "09:00", end: "15:00" }, optimizerMainZoneId: null });
  const seed = completeOutput([
    { taskId: 310, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 313, startPlanned: "09:30", endPlanned: "10:00" },
    { taskId: 312, startPlanned: "12:30", endPlanned: "13:00" },
    { taskId: 311, startPlanned: "13:00", endPlanned: "13:30", assignedResources: [COACH_A] },
  ]);
  const diagnostics = { attemptedTypes: [], generatedTypes: [], rejectedReasons: {} } as any;
  const candidates = generateOperationalNeighborhoodCandidates(input, seed, {
    allowedReasons: ["coach_gap_compaction"],
    diagnostics,
  });
  assert.ok(candidates.every((candidate) => countHardConstraintViolations(input, candidate.output) === 0));
  assert.ok((diagnostics.rejectedReasons.blocked_by_space_conflict ?? 0) > 0, JSON.stringify(diagnostics));
}

// ID 037. When both directions fall outside availability, the trace reports the concrete availability reason.
{
  const input = baseInput([
    { id: 320, planId: PLAN_ID, templateId: 320, zoneId: 2, spaceId: 201, contestantId: 320, status: "pending", durationOverrideMin: 30 },
    { id: 321, planId: PLAN_ID, templateId: 321, zoneId: 2, spaceId: 202, contestantId: 321, status: "pending", durationOverrideMin: 30 },
  ], {
    workDay: { start: "09:00", end: "15:00" },
    optimizerMainZoneId: null,
    contestantAvailabilityById: {
      320: { start: "09:00", end: "09:30" },
      321: { start: "13:00", end: "13:30" },
    },
  });
  const seed = completeOutput([
    { taskId: 320, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 321, startPlanned: "13:00", endPlanned: "13:30", assignedResources: [COACH_A] },
  ]);
  const diagnostics = { attemptedTypes: [], generatedTypes: [], rejectedReasons: {} } as any;
  const candidates = generateOperationalNeighborhoodCandidates(input, seed, {
    allowedReasons: ["coach_gap_compaction"],
    diagnostics,
  });
  assert.equal(candidates.length, 0);
  assert.ok((diagnostics.rejectedReasons.blocked_by_availability ?? 0) > 0, JSON.stringify(diagnostics));
}

// ID 037. A two-task coach bundle preserves relative offsets while reducing the largest gap.
{
  const input = baseInput([
    { id: 400, planId: PLAN_ID, templateId: 400, zoneId: 2, spaceId: 201, contestantId: 400, status: "pending", durationOverrideMin: 30 },
    { id: 401, planId: PLAN_ID, templateId: 401, zoneId: 2, spaceId: 202, contestantId: 401, status: "pending", durationOverrideMin: 30 },
    { id: 402, planId: PLAN_ID, templateId: 402, zoneId: 2, spaceId: 203, contestantId: 402, status: "pending", durationOverrideMin: 30 },
  ], { workDay: { start: "09:00", end: "15:00" }, optimizerMainZoneId: null });
  const seed = completeOutput([
    { taskId: 400, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 401, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [COACH_A] },
    { taskId: 402, startPlanned: "13:00", endPlanned: "13:30", assignedResources: [COACH_A] },
  ]);
  const before = calculateEngineOperationalCompactionMetrics(input, seed);
  const candidate = generateOperationalNeighborhoodCandidates(input, seed, { allowedReasons: ["coach_gap_compaction"] })
    .find((item) => byId(item.output).get(400)?.startPlanned !== "09:00" && byId(item.output).get(401)?.startPlanned !== "09:30");
  assert.ok(candidate, "expected a genuine two-task bundle candidate");
  const planned = byId(candidate.output);
  const firstStart = Number(planned.get(400)?.startPlanned.slice(0, 2)) * 60 + Number(planned.get(400)?.startPlanned.slice(3));
  const secondStart = Number(planned.get(401)?.startPlanned.slice(0, 2)) * 60 + Number(planned.get(401)?.startPlanned.slice(3));
  assert.equal(secondStart - firstStart, 30, "bundle must preserve relative offsets");
  assert.ok(calculateEngineOperationalCompactionMetrics(input, candidate.output).maxCoachGapMinutes < before.maxCoachGapMinutes);
}

// ID 037. A direct movable predecessor from the same contestant joins the shifted bundle.
{
  const input = baseInput([
    { id: 410, planId: PLAN_ID, templateId: 410, zoneId: 2, spaceId: 201, contestantId: 99, status: "done", durationOverrideMin: 30, startPlanned: "09:00", endPlanned: "09:30" },
    { id: 411, planId: PLAN_ID, templateId: 411, zoneId: 2, spaceId: 202, contestantId: 42, status: "pending", durationOverrideMin: 30 },
    { id: 412, planId: PLAN_ID, templateId: 412, zoneId: 2, spaceId: 203, contestantId: 42, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [411] },
  ], { workDay: { start: "09:00", end: "15:00" }, optimizerMainZoneId: null });
  const seed = completeOutput([
    { taskId: 410, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 411, startPlanned: "12:30", endPlanned: "13:00" },
    { taskId: 412, startPlanned: "13:00", endPlanned: "13:30", assignedResources: [COACH_A] },
  ]);
  const candidate = generateOperationalNeighborhoodCandidates(input, seed, { allowedReasons: ["coach_gap_compaction"] })[0];
  assert.ok(candidate);
  const planned = byId(candidate.output);
  assert.notEqual(planned.get(411)?.startPlanned, "12:30", "direct predecessor should move with coach task");
  assert.notEqual(planned.get(412)?.startPlanned, "13:00");
  assert.equal(countDependencyViolations(input, candidate.output), 0);
}

// ID 037. A fixed direct predecessor blocks the coach bundle with a concrete dependency-chain reason.
{
  const input = baseInput([
    { id: 420, planId: PLAN_ID, templateId: 420, zoneId: 2, spaceId: 201, contestantId: 99, status: "done", durationOverrideMin: 30, startPlanned: "09:00", endPlanned: "09:30" },
    { id: 421, planId: PLAN_ID, templateId: 421, zoneId: 2, spaceId: 202, contestantId: 42, status: "done", durationOverrideMin: 30, startPlanned: "12:30", endPlanned: "13:00" },
    { id: 422, planId: PLAN_ID, templateId: 422, zoneId: 2, spaceId: 203, contestantId: 42, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [421] },
  ], { workDay: { start: "09:00", end: "15:00" }, optimizerMainZoneId: null });
  const seed = completeOutput([
    { taskId: 420, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 421, startPlanned: "12:30", endPlanned: "13:00" },
    { taskId: 422, startPlanned: "13:00", endPlanned: "13:30", assignedResources: [COACH_A] },
  ]);
  const diagnostics = { attemptedTypes: [], generatedTypes: [], rejectedReasons: {} } as any;
  const candidates = generateOperationalNeighborhoodCandidates(input, seed, { allowedReasons: ["coach_gap_compaction"], diagnostics });
  assert.equal(candidates.length, 0);
  assert.ok((diagnostics.rejectedReasons.blocked_by_dependency_chain ?? 0) > 0, JSON.stringify(diagnostics));
}

// ID 037. Coach compaction is rejected when moving the bundle would increase Main Stage gaps.
{
  const input = baseInput([
    { id: 430, planId: PLAN_ID, templateId: 430, zoneId: 1, spaceId: 101, contestantId: 430, status: "pending", durationOverrideMin: 30 },
    { id: 431, planId: PLAN_ID, templateId: 431, zoneId: 1, spaceId: 102, contestantId: 431, status: "pending", durationOverrideMin: 30 },
    { id: 432, planId: PLAN_ID, templateId: 432, zoneId: 1, spaceId: 103, contestantId: 432, status: "pending", durationOverrideMin: 30 },
    { id: 433, planId: PLAN_ID, templateId: 433, zoneId: 2, spaceId: 201, contestantId: 433, status: "done", durationOverrideMin: 30, startPlanned: "13:00", endPlanned: "13:30" },
  ], { workDay: { start: "09:00", end: "15:00" } });
  const seed = completeOutput([
    { taskId: 430, startPlanned: "09:00", endPlanned: "09:30" },
    { taskId: 431, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [COACH_A] },
    { taskId: 432, startPlanned: "10:00", endPlanned: "10:30" },
    { taskId: 433, startPlanned: "13:00", endPlanned: "13:30", assignedResources: [COACH_A] },
  ]);
  const diagnostics = { attemptedTypes: [], generatedTypes: [], rejectedReasons: {} } as any;
  const candidates = generateOperationalNeighborhoodCandidates(input, seed, { allowedReasons: ["coach_gap_compaction"], diagnostics });
  assert.equal(candidates.length, 0);
  assert.ok((diagnostics.rejectedReasons.blocked_by_main_stage_continuity ?? 0) > 0, JSON.stringify(diagnostics));
}

// ID 038 — coach waves agrupan coaches alternados, mantienen Plató continuo y respetan tareas fijas.
{
  const waveTasks = [
    { id: 600, planId: PLAN_ID, templateId: 600, zoneId: 2, spaceId: 200, contestantId: 1, status: "pending", durationOverrideMin: 30 },
    { id: 601, planId: PLAN_ID, templateId: 601, zoneId: 1, spaceId: 100, contestantId: 1, status: "pending", durationOverrideMin: 30, dependencyIds: [600] },
    { id: 610, planId: PLAN_ID, templateId: 600, zoneId: 2, spaceId: 200, contestantId: 2, status: "pending", durationOverrideMin: 30 },
    { id: 611, planId: PLAN_ID, templateId: 601, zoneId: 1, spaceId: 100, contestantId: 2, status: "pending", durationOverrideMin: 30, dependencyIds: [610] },
    { id: 620, planId: PLAN_ID, templateId: 600, zoneId: 2, spaceId: 200, contestantId: 3, status: "pending", durationOverrideMin: 30 },
    { id: 621, planId: PLAN_ID, templateId: 601, zoneId: 1, spaceId: 100, contestantId: 3, status: "pending", durationOverrideMin: 30, dependencyIds: [620] },
    { id: 630, planId: PLAN_ID, templateId: 600, zoneId: 2, spaceId: 200, contestantId: 4, status: "pending", durationOverrideMin: 30 },
    { id: 631, planId: PLAN_ID, templateId: 601, zoneId: 1, spaceId: 100, contestantId: 4, status: "pending", durationOverrideMin: 30, dependencyIds: [630] },
    { id: 699, planId: PLAN_ID, templateId: 699, zoneId: 3, spaceId: 300, status: "done", durationOverrideMin: 30, startPlanned: "09:00", endPlanned: "09:30" },
  ];
  const input = baseInput(waveTasks, {
    workDay: { start: "09:00", end: "16:00" },
    taskTemplateNameById: { 600: "Vocal coach", 601: "Plató 7", 699: "Bloque fijo" },
  });
  const base = completeOutput([
    { taskId: 600, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [COACH_A] },
    { taskId: 610, startPlanned: "10:00", endPlanned: "10:30", assignedResources: [COACH_B] },
    { taskId: 620, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [COACH_A] },
    { taskId: 630, startPlanned: "12:00", endPlanned: "12:30", assignedResources: [COACH_B] },
    { taskId: 601, startPlanned: "13:00", endPlanned: "13:30" },
    { taskId: 611, startPlanned: "13:30", endPlanned: "14:00" },
    { taskId: 621, startPlanned: "14:00", endPlanned: "14:30" },
    { taskId: 631, startPlanned: "14:30", endPlanned: "15:00" },
    { taskId: 699, startPlanned: "09:00", endPlanned: "09:30" },
  ]);
  const waveCandidates = generateOperationalNeighborhoodCandidates(input, base, {
    allowedReasons: ["coach_wave_order"],
  }).filter((candidate) => candidate.reason === "coach_wave_order");
  assert.ok(waveCandidates.length > 0, "alternating coaches should generate coach_wave_order");
  const wave = waveCandidates[0].output;
  const before = calculateEngineOperationalCompactionMetrics(input, base);
  const after = calculateEngineOperationalCompactionMetrics(input, wave);
  assert.ok(after.maxCoachGapMinutes < before.maxCoachGapMinutes || after.coachSplitDayPenalty < before.coachSplitDayPenalty);
  assert.equal(countHardConstraintViolations(input, wave), 0);
  assert.ok((calculateMainStageGaps(input, wave)?.minutes ?? 0) <= (calculateMainStageGaps(input, base)?.minutes ?? 0));
  assert.deepEqual(byId(wave).get(699), byId(base).get(699), "done task must stay fixed during wave ordering");

  const minorTalentIdle = completeOutput((base.plannedTasks ?? []).map((planned) => (
    Number(planned.taskId) === 699 ? { ...planned, startPlanned: "09:05", endPlanned: "09:35" } : { ...planned }
  )));
  assert.ok(compareCandidateSolutions(input, wave, minorTalentIdle) > 0, "coach wave improvement should beat a minor non-coach timing change");

  const selected = runOperationalNeighborhoodSelection(input, base, "phaseA_greedy");
  assert.equal(selected.meta.coachWaveOrderingAttempted, true);
  assert.ok((selected.meta.coachWaveCandidatesGenerated ?? 0) > 0);
  assert.equal(selected.meta.coachWaveAccepted, true);
  assert.match(selected.meta.coachWaveReason ?? "", /coach wave ordering|lower coach split\/gap/);
}

console.log("engine/v3/operationalNeighborhoods.spec.ts: OK");
