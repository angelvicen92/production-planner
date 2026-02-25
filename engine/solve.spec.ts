import assert from "node:assert/strict";
import { computeMainZoneGaps, explainMainZoneGaps, generatePlan } from "./solve";
import type { EngineInput } from "./types";

const getZoneId = (task: any) => Number(task?.zoneId ?? 0) || null;
const getSpaceId = (task: any) => Number(task?.spaceId ?? 0) || null;
const getContestantId = (task: any) => Number(task?.contestantId ?? 0) || null;
const getZoneIdForSpace = (spaceId: number | null | undefined) => {
  const n = Number(spaceId ?? 0);
  if (n === 71 || n === 72) return 7;
  if (n === 50) return 5;
  return null;
};

{
  const taskById = new Map<number, any>([
    [1, { id: 1, zoneId: 7, spaceId: 71, contestantId: 10, templateName: "A1", status: "pending" }],
    [2, { id: 2, zoneId: 7, spaceId: 72, contestantId: 20, templateName: "B1", status: "pending" }],
    [3, { id: 3, zoneId: 7, spaceId: 71, contestantId: 30, templateName: "A2", status: "pending" }],
    [4, { id: 4, zoneId: 7, spaceId: 72, contestantId: 40, templateName: "B2", status: "pending" }],
  ]);

  const plannedTasks = [
    { taskId: 1, startPlanned: "10:00", endPlanned: "10:30", assignedSpace: 71, assignedResources: [] },
    { taskId: 2, startPlanned: "10:30", endPlanned: "11:00", assignedSpace: 72, assignedResources: [] },
    { taskId: 3, startPlanned: "11:00", endPlanned: "11:30", assignedSpace: 71, assignedResources: [] },
    { taskId: 4, startPlanned: "11:30", endPlanned: "12:00", assignedSpace: 72, assignedResources: [] },
  ];

  const gaps = computeMainZoneGaps({
    zoneId: 7,
    plannedTasks,
    taskById,
    getSpaceId,
    getZoneId,
    getZoneIdForSpace,
  });

  assert.equal(gaps.length, 2);
  assert.deepEqual(
    gaps.map((g) => ({ spaceId: g.spaceId, start: g.start, end: g.end, prevTaskId: g.prevTaskId, nextTaskId: g.nextTaskId })),
    [
      { spaceId: 71, start: 630, end: 660, prevTaskId: 1, nextTaskId: 3 },
      { spaceId: 72, start: 660, end: 690, prevTaskId: 2, nextTaskId: 4 },
    ],
  );
}

{
  const taskById = new Map<number, any>([
    [10, { id: 10, zoneId: 7, spaceId: 71, contestantId: 1, templateName: "Main next", status: "pending" }],
    [20, { id: 20, zoneId: 5, spaceId: 50, contestantId: 1, contestantName: "Ana", templateName: "Fuera", status: "in_progress" }],
  ]);
  const reasons = explainMainZoneGaps({
    gaps: [{ zoneId: 7, spaceId: 71, start: 630, end: 660, durationMin: 30, prevTaskId: 9, nextTaskId: 10 }],
    plannedTasks: [
      { taskId: 20, startPlanned: "10:35", endPlanned: "10:55", assignedResources: [] },
      { taskId: 10, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [] },
    ],
    taskById,
    getContestantId,
    getSpaceId,
    lockedTaskIds: new Set([20]),
  });

  assert.equal(reasons.length, 1);
  assert.equal(reasons[0].type, "CONTESTANT_BUSY");
  assert.equal(reasons[0].blockingTaskId, 20);
  assert.match(reasons[0].humanMessage, /Hueco 10:30-11:00/);
}

{
  const taskById = new Map<number, any>([
    [11, { id: 11, zoneId: 7, spaceId: 71, contestantId: 2, templateName: "Locked", status: "pending" }],
    [12, { id: 12, zoneId: 7, spaceId: 71, contestantId: 3, templateName: "Progress", status: "in_progress" }],
  ]);

  const lockedReason = explainMainZoneGaps({
    gaps: [{ zoneId: 7, spaceId: 71, start: 600, end: 630, durationMin: 30, prevTaskId: 1, nextTaskId: 11 }],
    plannedTasks: [{ taskId: 11, startPlanned: "10:30", endPlanned: "11:00", assignedResources: [] }],
    taskById,
    getContestantId,
    getSpaceId,
    lockedTaskIds: new Set([11]),
  });
  assert.equal(lockedReason[0].type, "LOCKED_TASK");

  const progressReason = explainMainZoneGaps({
    gaps: [{ zoneId: 7, spaceId: 71, start: 600, end: 630, durationMin: 30, prevTaskId: 1, nextTaskId: 12 }],
    plannedTasks: [{ taskId: 12, startPlanned: "10:30", endPlanned: "11:00", assignedResources: [] }],
    taskById,
    getContestantId,
    getSpaceId,
    lockedTaskIds: new Set(),
  });
  assert.equal(progressReason[0].type, "IN_PROGRESS_OR_DONE");
}

{
  const taskById = new Map<number, any>([
    [30, { id: 30, zoneId: 7, spaceId: 71, contestantId: 9, templateName: "Next", status: "pending" }],
    [31, { id: 31, zoneId: 5, spaceId: 50, contestantId: 99, templateName: "Bloquea recurso", status: "pending" }],
  ]);

  const reasons = explainMainZoneGaps({
    gaps: [{ zoneId: 7, spaceId: 71, start: 600, end: 630, durationMin: 30, prevTaskId: 1, nextTaskId: 30 }],
    plannedTasks: [
      { taskId: 31, startPlanned: "10:05", endPlanned: "10:25", assignedResources: [700] },
      { taskId: 30, startPlanned: "10:30", endPlanned: "11:00", assignedResources: [700] },
    ],
    taskById,
    getContestantId,
    getSpaceId,
    lockedTaskIds: new Set(),
  });

  assert.equal(reasons[0].type, "RESOURCE_BUSY");
  assert.equal(reasons[0].entity?.id, 700);
}

{
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
  assert.deepEqual(run1, run2);
}

{
  const input: EngineInput = {
    planId: 2,
    workDay: { start: "10:00", end: "13:00" },
    meal: { start: "12:00", end: "12:30" },
    camerasAvailable: 0,
    tasks: [
      { id: 201, planId: 2, templateId: 1, templateName: "Main A", zoneId: 7, spaceId: 71, contestantId: 1, contestantName: "Lucía", status: "pending", durationOverrideMin: 30, priority: 1 },
      { id: 203, planId: 2, templateId: 2, templateName: "Externa X", zoneId: 5, spaceId: 50, contestantId: 1, contestantName: "Lucía", status: "pending", durationOverrideMin: 30, priority: 20 },
      { id: 202, planId: 2, templateId: 3, templateName: "Main B", zoneId: 7, spaceId: 71, contestantId: 1, contestantName: "Lucía", status: "pending", durationOverrideMin: 30 },
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

  const run = generatePlan(input);
  const byTask = new Map(run.plannedTasks.map((p) => [Number(p.taskId), p]));
  assert.equal(byTask.get(202)?.startPlanned, "10:30");
  assert.equal(byTask.get(203)?.startPlanned, "11:00");
}

{
  const taskById = new Map<number, any>([
    [301, { id: 301, zoneId: 7, spaceId: 71, contestantId: 1, contestantName: "Lucía", templateName: "Main A", status: "pending" }],
    [302, { id: 302, zoneId: 7, spaceId: 71, contestantId: 1, contestantName: "Lucía", templateName: "Main B", status: "pending" }],
    [303, { id: 303, zoneId: 5, spaceId: 50, contestantId: 1, contestantName: "Lucía", templateName: "Externa X", status: "pending", earliestStart: "10:30", latestEnd: "11:00" }],
  ]);

  const reasons = explainMainZoneGaps({
    gaps: [{ zoneId: 7, spaceId: 71, start: 630, end: 660, durationMin: 30, prevTaskId: 301, nextTaskId: 302 }],
    plannedTasks: [
      { taskId: 301, startPlanned: "10:00", endPlanned: "10:30", assignedResources: [] },
      { taskId: 303, startPlanned: "10:30", endPlanned: "11:00", assignedResources: [] },
      { taskId: 302, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [] },
    ],
    taskById,
    getContestantId,
    getSpaceId,
    lockedTaskIds: new Set(),
    relocationAttemptsByTaskId: new Map([[303, { attempted: true, succeeded: false }]]),
  });

  assert.equal(reasons.length, 1);
  assert.equal(reasons[0].type, "CONTESTANT_BUSY");
  assert.ok(reasons[0].humanMessage.includes("La tarea bloqueadora era replanificable, pero no se encontró recolocación sin romper HARD"));
}

console.log("solve.spec.ts: ok");
