import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { applyLocalScheduleMove } from "./applyLocalScheduleMove";

const baseInput = (): EngineInput => ({
  planId: 1,
  workDay: { start: "09:00", end: "12:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 1,
  tasks: [
    { id: 1, planId: 1, templateId: 1, status: "done", durationOverrideMin: 30, spaceId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [10], contestantId: 1 },
    { id: 2, planId: 1, templateId: 2, status: "pending", durationOverrideMin: 30, spaceId: 2, assignedResourceIds: [10], contestantId: 2 },
    { id: 3, planId: 1, templateId: 3, status: "pending", durationOverrideMin: 30, spaceId: 1, assignedResourceIds: [11], contestantId: 1 },
  ],
  locks: [],
  zoneResourceAssignments: {},
  spaceResourceAssignments: { 1: [10, 11], 2: [10] },
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [
    { id: 10, resourceItemId: 10, typeId: 1, name: "R10", isAvailable: true },
    { id: 11, resourceItemId: 11, typeId: 1, name: "R11", isAvailable: true },
  ],
  resourceItemComponents: {},
  groupingZoneIds: [],
});

const planning = [
  { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [10] },
  { taskId: 2, startPlanned: "10:00", endPlanned: "10:30", assignedResources: [10] },
  { taskId: 3, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [11] },
];

test("applies one deterministic local resource-gap compaction move", () => {
  const first = applyLocalScheduleMove(baseInput(), planning);
  const second = applyLocalScheduleMove(baseInput(), planning);
  assert.equal(first.diagnostics.accepted, 1);
  assert.equal(first.diagnostics.acceptedMoves[0].taskId, 2);
  assert.equal(first.planning.find((item) => item.taskId === 2)?.startPlanned, "09:30");
  assert.equal(first.planning.length, planning.length);
  assert.deepEqual(first, second);
  assert.doesNotThrow(() => JSON.stringify(first.diagnostics));
});

test("preserves baseline when the move would touch a locked task", () => {
  const input = baseInput();
  input.locks = [{ id: 1, planId: 1, taskId: 2, lockType: "time", lockedStart: "10:00", lockedEnd: "10:30" }];
  const result = applyLocalScheduleMove(input, planning);
  assert.equal(result.diagnostics.accepted, 0);
  assert.deepEqual(result.planning, planning.sort((a, b) => a.taskId - b.taskId));
});

test("does not modify done or in_progress tasks", () => {
  const input = baseInput();
  input.tasks[1].status = "in_progress";
  input.tasks[1].startPlanned = "10:00";
  input.tasks[1].endPlanned = "10:30";
  const result = applyLocalScheduleMove(input, planning);
  assert.equal(result.diagnostics.accepted, 0);
  assert.equal(result.planning.find((item) => item.taskId === 2)?.startPlanned, "10:00");
});
