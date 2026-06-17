import assert from "node:assert/strict";
import test from "node:test";
import { buildV4GuidedInput } from "./guidedInput";
import type { EngineInput, TaskInput } from "../types";
import type { V4StrategicAnalysis } from "./analysis";

const task = (id: number, status: TaskInput["status"], contestantId: number, templateId: number, extra: Partial<TaskInput> = {}): TaskInput => ({
  id,
  planId: 1,
  templateId,
  contestantId,
  status,
  durationOverrideMin: 30,
  ...extra,
});

const baseInput = (tasks: TaskInput[]): EngineInput => ({
  planId: 1,
  workDay: { start: "09:00", end: "18:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 2,
  tasks,
  locks: [{ id: 1, planId: 1, taskId: 99, lockType: "full", lockedStart: "09:00", lockedEnd: "10:00" }],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [],
});

const analysis = (partial: Partial<V4StrategicAnalysis>): V4StrategicAnalysis => ({
  mainFlow: null,
  continuousSpaces: [],
  criticalTalents: [],
  criticalResources: [],
  criticalSpaces: [],
  mainFlowCandidates: [],
  mainFlowSequence: [],
  topCriticalTalents: [],
  costOfDelayRanking: [],
  pressureScores: { talentPressureScore: 0, resourcePressureScore: 0, spacePressureScore: 0 },
  riskScore: "LOW",
  warnings: [],
  ...partial,
});

test("buildV4GuidedInput reorders only pending task slots and preserves task objects and locks", () => {
  const feeder = task(1, "pending", 10, 100);
  const stable = task(2, "pending", 20, 200);
  const fixed = task(3, "in_progress", 10, 300);
  const mainFlow = task(4, "pending", 10, 400, { dependsOnTaskIds: [1] });
  const input = baseInput([stable, feeder, fixed, mainFlow]);

  const result = buildV4GuidedInput(input, analysis({
    mainFlowSequence: [{ talentId: 10, talentName: "Talent 10", score: 90, costOfDelay: 80, reasons: [] }],
  }));

  assert.deepEqual(result.input.tasks.map((item) => item.id), [1, 4, 3, 2]);
  assert.equal(result.input.tasks[2], fixed);
  assert.equal(result.input.locks, input.locks);
  assert.deepEqual(input.tasks.map((item) => item.id), [2, 1, 3, 4]);
  assert.equal(result.guidedOrdering.applied, true);
  assert.equal(result.guidedOrdering.reorderedTaskCount, 3);
  assert.deepEqual(result.guidedOrdering.topOrderedTasks, [1, 4, 2]);
});

test("buildV4GuidedInput falls back safely without mainFlowSequence", () => {
  const input = baseInput([
    task(1, "pending", 10, 100),
    task(2, "pending", 20, 200, { resourceRequirements: { byItem: { 7: 1 } } }),
  ]);

  const result = buildV4GuidedInput(input, analysis({
    criticalResources: [{ id: 7, name: "Resource 7", pressureScore: 88, taskCount: 1, totalDurationMinutes: 30, availabilityMinutes: 60, reasons: [] }],
  }));

  assert.deepEqual(result.input.tasks.map((item) => item.id), [2, 1]);
  assert.match(result.guidedOrdering.reason, /without mainFlowSequence/);
});
