import assert from "node:assert/strict";
import test from "node:test";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { runMainStageCpSatPilot, selectMainStageCpSatSubproblem, type MainStageCpSatSolver } from "./mainStageCpSatPilot";
import { countContestantWindowViolations, countDependencyViolations } from "./metrics";

const input: EngineV3Input = {
  planId: 15,
  workDay: { start: "09:00", end: "12:00" },
  meal: { start: "12:00", end: "12:30" },
  camerasAvailable: 1,
  tasks: [
    { id: 1, planId: 15, templateId: 1, templateName: "Main open", zoneId: 1, spaceId: 101, contestantId: 1, status: "pending", durationOverrideMin: 30 },
    { id: 2, planId: 15, templateId: 2, templateName: "Feeder", zoneId: 2, spaceId: 201, contestantId: 2, status: "pending", durationOverrideMin: 20 },
    { id: 3, planId: 15, templateId: 3, templateName: "Main restrictive", zoneId: 1, spaceId: 101, contestantId: 2, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [2] },
    { id: 4, planId: 15, templateId: 4, templateName: "Main done", zoneId: 1, spaceId: 101, contestantId: 3, status: "done", durationOverrideMin: 30, startPlanned: "11:00", endPlanned: "11:30" },
    { id: 5, planId: 15, templateId: 5, templateName: "Feeder in progress", zoneId: 2, spaceId: 202, contestantId: 3, status: "in_progress", durationOverrideMin: 20, startPlanned: "09:00", endPlanned: "09:20" },
    { id: 6, planId: 15, templateId: 6, templateName: "Main locked", zoneId: 1, spaceId: 101, contestantId: 4, status: "pending", durationOverrideMin: 30, startPlanned: "10:30", endPlanned: "11:00", dependsOnTaskIds: [5] },
  ] as any,
  locks: [{ id: 1, planId: 15, taskId: 6, lockType: "time", lockedStart: "10:30", lockedEnd: "11:00" }],
  groupingZoneIds: [1],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [],
  resourceItemComponents: {},
  contestantAvailabilityById: {
    1: { start: "09:00", end: "12:00" },
    2: { start: "09:00", end: "10:30" },
    3: { start: "09:00", end: "12:00" },
    4: { start: "09:00", end: "12:00" },
  },
  optimizerMainZoneId: 1,
};

const warmStart: EngineOutput = {
  feasible: true,
  complete: true,
  hardFeasible: true,
  plannedTasks: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30" },
    { taskId: 2, startPlanned: "09:30", endPlanned: "09:50" },
    { taskId: 3, startPlanned: "10:00", endPlanned: "10:30" },
  ],
  unplanned: [],
};

test("selector Main Stage + feeders excludes done, in_progress and locked tasks", () => {
  const selected = selectMainStageCpSatSubproblem(input, warmStart);
  assert.equal(selected.eligible, true);
  assert.deepEqual(selected.taskIds, [1, 2, 3]);
  assert.ok(selected.excludedTaskIds.includes(4));
  assert.ok(selected.excludedTaskIds.includes(5));
  assert.ok(selected.excludedTaskIds.includes(6));
});

test("pilot candidate respects feeder dependency and restrictive availability", () => {
  const candidate: EngineOutput = {
    ...warmStart,
    plannedTasks: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:30" },
      { taskId: 2, startPlanned: "09:00", endPlanned: "09:20" },
      { taskId: 3, startPlanned: "09:30", endPlanned: "10:00" },
    ],
  };
  const solver: MainStageCpSatSolver = () => ({
    output: candidate,
    quality: { improved: true, baselineScore: 10, optimizedScore: 0, objectiveDelta: -10, mainZoneGapMinutesDelta: -10, spaceSwitchesDelta: 0 },
    degradations: [], message: "test seam", technicalDetails: [],
  });
  const result = runMainStageCpSatPilot(input, warmStart, solver);
  assert.equal(result.meta.cpSatPilotAccepted, true);
  assert.equal(countDependencyViolations(input, result.output), 0);
  assert.equal(countContestantWindowViolations(input, result.output), 0);
});

test("pilot rejects a candidate with hard violations", () => {
  const invalid: EngineOutput = {
    ...warmStart,
    plannedTasks: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:30" },
      { taskId: 2, startPlanned: "10:20", endPlanned: "10:40" },
      { taskId: 3, startPlanned: "09:30", endPlanned: "10:00" },
    ],
  };
  const solver: MainStageCpSatSolver = () => ({
    output: invalid,
    quality: { improved: true, baselineScore: 10, optimizedScore: 0, objectiveDelta: -10, mainZoneGapMinutesDelta: -10, spaceSwitchesDelta: 0 },
    degradations: [], message: "test seam", technicalDetails: [],
  });
  const result = runMainStageCpSatPilot(input, warmStart, solver);
  assert.equal(result.meta.cpSatPilotAccepted, false);
  assert.equal(result.meta.cpSatPilotReason, "candidate_validation_failed");
  assert.deepEqual(result.output.plannedTasks, warmStart.plannedTasks);
});
