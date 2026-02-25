import assert from "node:assert/strict";
import { computeMainZoneGaps, explainMainZoneGaps, generatePlan } from "./solve";
import type { EngineInput } from "./types";

const taskById = new Map<number, any>([
  [1, { id: 1, zoneId: 7, contestantId: 10, templateName: "Main A", status: "pending" }],
  [2, { id: 2, zoneId: 7, contestantId: 10, templateName: "Main B", status: "pending", dependsOnTaskIds: [1] }],
  [3, { id: 3, zoneId: 5, contestantId: 10, templateName: "Fuera", status: "in_progress" }],
]);

const plannedTasks = [
  { taskId: 1, startPlanned: "10:00", endPlanned: "10:30", assignedResources: [] },
  { taskId: 3, startPlanned: "10:30", endPlanned: "11:00", assignedResources: [] },
  { taskId: 2, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [] },
];

const gaps = computeMainZoneGaps({
  zoneId: 7,
  plannedTasks,
  taskById,
  getZoneId: (task) => Number(task?.zoneId ?? 0) || null,
});
assert.equal(gaps.length, 1);
assert.equal(gaps[0].durationMin, 30);

const reasons = explainMainZoneGaps({
  gaps,
  plannedTasks,
  taskById,
  getContestantId: (task) => Number(task?.contestantId ?? 0) || null,
  getZoneId: (task) => Number(task?.zoneId ?? 0) || null,
  lockedTaskIds: new Set([3]),
});
assert.equal(reasons.length, 1);
assert.equal(reasons[0].type, "CONTESTANT_BUSY");
assert.match(reasons[0].humanMessage, /Hueco 10:30-11:00/);

const input: EngineInput = {
  planId: 1,
  workDay: { start: "10:00", end: "13:00" },
  meal: { start: "12:00", end: "12:30" },
  camerasAvailable: 0,
  tasks: [
    { id: 101, planId: 1, templateId: 1, templateName: "Main 1", zoneId: 7, spaceId: 70, contestantId: 1, status: "pending", durationOverrideMin: 30 },
    { id: 102, planId: 1, templateId: 2, templateName: "Main 2", zoneId: 7, spaceId: 70, contestantId: 2, status: "pending", durationOverrideMin: 30 },
  ],
  locks: [],
  groupingZoneIds: [],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [],
  resourceItemComponents: {},
  optimizerMainZoneId: 7,
  optimizerMainZoneOptKeepBusy: true,
  optimizerWeights: { mainZoneKeepBusy: 10 },
};

const run1 = generatePlan(input);
const run2 = generatePlan(input);
assert.deepEqual(run1.plannedTasks, run2.plannedTasks);

console.log("solve.spec.ts: ok");
