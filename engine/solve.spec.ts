import assert from "node:assert/strict";
import { computeMainZoneGaps, explainMainZoneGaps, generatePlan } from "./solve";
import type { EngineInput } from "./types";

const timeToMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map((v) => Number(v));
  return h * 60 + m;
};

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
    workDay: { start: "09:00", end: "13:00" },
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

{
  const input: EngineInput = {
    planId: 10,
    workDay: { start: "09:00", end: "13:00" },
    meal: { start: "12:00", end: "12:30" },
    camerasAvailable: 0,
    tasks: [
      { id: 1000, planId: 10, templateId: 99, templateName: "Prereq", zoneId: 7, spaceId: 72, contestantId: 2, status: "pending", durationOverrideMin: 60, priority: 200 },
      { id: 1001, planId: 10, templateId: 1, templateName: "Inner", zoneId: 7, spaceId: 71, contestantId: 1, status: "pending", durationOverrideMin: 60, dependsOnTaskIds: [1000], priority: 100 },
      { id: 1002, planId: 10, templateId: 2, templateName: "Wrap", zoneId: 7, spaceId: 71, contestantId: 1, itinerantTeamId: 9, status: "pending", durationOverrideMin: 30, priority: 10 },
    ],
    locks: [],
    groupingZoneIds: [],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
  };

  const run = generatePlan(input);
  const byTask = new Map(run.plannedTasks.map((p) => [Number(p.taskId), p]));
  assert.equal(byTask.get(1001)?.startPlanned, "10:00");
  assert.equal(byTask.get(1001)?.endPlanned, "11:00");
  assert.equal(byTask.get(1002)?.startPlanned, "09:45");
  assert.equal(byTask.get(1002)?.endPlanned, "11:15");
}

{
  const input: EngineInput = {
    planId: 11,
    workDay: { start: "09:00", end: "13:00" },
    meal: { start: "12:00", end: "12:30" },
    camerasAvailable: 0,
    tasks: [
      { id: 1100, planId: 11, templateId: 10, templateName: "Blocker", zoneId: 7, spaceId: 71, contestantId: 1, status: "done", startPlanned: "09:40", endPlanned: "09:50", durationOverrideMin: 10 },
      { id: 1101, planId: 11, templateId: 1, templateName: "Inner locked", zoneId: 7, spaceId: 71, contestantId: 1, status: "done", startPlanned: "10:00", endPlanned: "11:00", durationOverrideMin: 60 },
      { id: 1102, planId: 11, templateId: 2, templateName: "Wrap", zoneId: 7, spaceId: 71, contestantId: 1, itinerantTeamId: 9, status: "pending", durationOverrideMin: 30 },
    ],
    locks: [],
    groupingZoneIds: [],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
  };

  const run = generatePlan(input);
  const warn = run.warnings.find((w) => w.code === "ITINERANT_WRAP_NOT_FEASIBLE" && Number(w.taskId) === 1102);
  assert.ok(warn);
  assert.equal(String(warn?.details?.reason), "LOCKED");
}

{
  const input: EngineInput = {
    planId: 12,
    workDay: { start: "08:00", end: "13:00" },
    meal: { start: "12:00", end: "12:30" },
    camerasAvailable: 0,
    tasks: [
      { id: 1199, planId: 12, templateId: 99, templateName: "Prereq", zoneId: 7, spaceId: 72, contestantId: 2, status: "done", startPlanned: "09:00", endPlanned: "10:00", durationOverrideMin: 60 },
      { id: 1200, planId: 12, templateId: 10, templateName: "Team busy", zoneId: 7, spaceId: 72, contestantId: 2, itinerantTeamId: 9, status: "done", startPlanned: "10:50", endPlanned: "11:30", durationOverrideMin: 40 },
      { id: 1201, planId: 12, templateId: 1, templateName: "Inner", zoneId: 7, spaceId: 71, contestantId: 1, status: "pending", durationOverrideMin: 60, dependsOnTaskIds: [1199], priority: 100 },
      { id: 1202, planId: 12, templateId: 2, templateName: "Wrap", zoneId: 7, spaceId: 71, contestantId: 1, itinerantTeamId: 9, status: "pending", durationOverrideMin: 30, priority: 10 },
    ],
    locks: [],
    groupingZoneIds: [],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
  };

  const run = generatePlan(input);
  const warn = run.warnings.find((w) => w.code === "ITINERANT_WRAP_NOT_FEASIBLE" && Number(w.taskId) === 1202);
  assert.ok(warn);
  assert.equal(String(warn?.details?.reason), "ITINERANT_TEAM_BUSY");
}

{
  const input: EngineInput = {
    planId: 13,
    workDay: { start: "09:00", end: "13:00" },
    meal: { start: "12:00", end: "12:30" },
    camerasAvailable: 0,
    tasks: [
      { id: 1301, planId: 13, templateId: 1, templateName: "Prereq", zoneId: 7, spaceId: 72, contestantId: 2, status: "pending", durationOverrideMin: 60, priority: 200 },
      { id: 1302, planId: 13, templateId: 2, templateName: "Inner", zoneId: 7, spaceId: 71, contestantId: 1, status: "pending", durationOverrideMin: 60, dependsOnTaskIds: [1301], priority: 100 },
      { id: 1303, planId: 13, templateId: 3, templateName: "Wrap", zoneId: 7, spaceId: 71, contestantId: 1, itinerantTeamId: 77, status: "pending", durationOverrideMin: 30, priority: 10 },
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
  const inner = byTask.get(1302);
  const wrap = byTask.get(1303);
  assert.ok(inner && wrap);
  const innerStart = timeToMinutes(inner!.startPlanned);
  const innerEnd = timeToMinutes(inner!.endPlanned);
  const wrapStart = timeToMinutes(wrap!.startPlanned);
  const wrapEnd = timeToMinutes(wrap!.endPlanned);
  assert.equal(wrapStart, innerStart - 15);
  assert.equal(wrapEnd, innerEnd + 15);
}


{
  const input: EngineInput = {
    planId: 14,
    workDay: { start: "09:00", end: "12:00" },
    meal: { start: "12:30", end: "13:00" },
    camerasAvailable: 0,
    tasks: [
      { id: 1401, planId: 14, templateId: 101, templateName: "Main early", zoneId: 7, spaceId: 71, contestantId: 1, status: "pending", durationOverrideMin: 30, priority: 500 },
      { id: 1402, planId: 14, templateId: 102, templateName: "Main gated", zoneId: 7, spaceId: 71, contestantId: 2, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [1404], priority: 450 },
      { id: 1403, planId: 14, templateId: 201, templateName: "Other zone ready 1", zoneId: 5, spaceId: 50, contestantId: 9, status: "pending", durationOverrideMin: 30, priority: 400 },
      { id: 1404, planId: 14, templateId: 202, templateName: "Other zone ready 2", zoneId: 5, spaceId: 50, contestantId: 10, status: "pending", durationOverrideMin: 30, priority: 350 },
    ],
    locks: [],
    groupingZoneIds: [7],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
    optimizerMainZoneId: 7,
    optimizerMainZonePriorityLevel: 3,
    optimizerMainZoneOptKeepBusy: true,
    optimizerMainZoneOptFinishEarly: true,
    optimizerWeights: { mainZoneKeepBusy: 10, mainZoneFinishEarly: 0 },
  };

  const run = generatePlan(input);
  const byTask = new Map(run.plannedTasks.map((row) => [Number(row.taskId), row]));
  assert.equal(byTask.get(1403)?.startPlanned, "09:00");
  assert.equal(byTask.get(1404)?.startPlanned, "09:30");
  assert.equal(byTask.get(1401)?.startPlanned, "09:30");
  assert.equal(byTask.get(1402)?.startPlanned, "10:00");
}

{
  const input: EngineInput = {
    planId: 15,
    workDay: { start: "09:00", end: "13:00" },
    meal: { start: "13:30", end: "14:00" },
    camerasAvailable: 0,
    tasks: [
      { id: 1501, planId: 15, templateId: 700, templateName: "A1", zoneId: 7, spaceId: 71, contestantId: 1, status: "pending", durationOverrideMin: 30, priority: 100 },
      { id: 1502, planId: 15, templateId: 700, templateName: "A2", zoneId: 7, spaceId: 71, contestantId: 2, status: "pending", durationOverrideMin: 30, priority: 95 },
      { id: 1503, planId: 15, templateId: 701, templateName: "B", zoneId: 7, spaceId: 71, contestantId: 3, status: "pending", durationOverrideMin: 30, priority: 90 },
      { id: 1504, planId: 15, templateId: 800, templateName: "Off-zone", zoneId: 5, spaceId: 50, contestantId: 4, status: "pending", durationOverrideMin: 30, priority: 85 },
    ],
    locks: [],
    groupingZoneIds: [7],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
    optimizerWeights: { groupBySpaceTemplateMatch: 10, groupBySpaceActive: 10 },
  };

  const run = generatePlan(input);
  const ordered = run.plannedTasks
    .filter((row) => Number(row.assignedSpace) === 71)
    .sort((a, b) => timeToMinutes(a.startPlanned) - timeToMinutes(b.startPlanned))
    .map((row) => Number(input.tasks.find((t) => Number(t.id) === Number(row.taskId))?.templateId ?? -1));

  assert.deepEqual(ordered.slice(0, 2), [700, 700]);
}



{
  const input: EngineInput = {
    planId: 17,
    workDay: { start: "09:00", end: "12:00" },
    meal: { start: "12:30", end: "13:00" },
    camerasAvailable: 0,
    tasks: [
      { id: 1701, planId: 17, templateId: 1, templateName: "Main block A", zoneId: 7, spaceId: 71, contestantId: 11, status: "pending", durationOverrideMin: 30, priority: 300 },
      { id: 1702, planId: 17, templateId: 2, templateName: "Main block B", zoneId: 7, spaceId: 71, contestantId: 22, status: "pending", durationOverrideMin: 30, priority: 290 },
      { id: 1703, planId: 17, templateId: 3, templateName: "Main locked next", zoneId: 7, spaceId: 71, contestantId: 33, status: "done", startPlanned: "10:30", endPlanned: "11:00", durationOverrideMin: 30, priority: 280 },
      { id: 1704, planId: 17, templateId: 4, templateName: "Contestant B busy", zoneId: 5, spaceId: 50, contestantId: 22, status: "done", startPlanned: "10:00", endPlanned: "10:30", durationOverrideMin: 30, priority: 270 },
      { id: 1705, planId: 17, templateId: 5, templateName: "Main follower", zoneId: 7, spaceId: 71, contestantId: 44, status: "pending", durationOverrideMin: 30, priority: 260 },
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
    optimizerWeights: { mainZoneKeepBusy: 10, mainZoneFinishEarly: 0 },
  };

  const run = generatePlan(input);
  const byTask = new Map(run.plannedTasks.map((row) => [Number(row.taskId), row]));

  assert.equal(byTask.get(1701)?.startPlanned, "09:00");
  assert.equal(byTask.get(1702)?.startPlanned, "09:30");
  assert.equal(byTask.get(1705)?.startPlanned, "10:00");
}

{
  const input: EngineInput = {
    planId: 16,
    workDay: { start: "09:00", end: "12:00" },
    meal: { start: "12:30", end: "13:00" },
    camerasAvailable: 0,
    tasks: [
      { id: 1601, planId: 16, templateId: 1, templateName: "Block A", zoneId: 7, spaceId: 71, contestantId: 11, status: "pending", durationOverrideMin: 30, priority: 120 },
      { id: 1602, planId: 16, templateId: 2, templateName: "Block B", zoneId: 7, spaceId: 71, contestantId: 22, status: "pending", durationOverrideMin: 30, priority: 110 },
      { id: 1603, planId: 16, templateId: 3, templateName: "Gated lock", zoneId: 7, spaceId: 71, contestantId: 33, status: "done", startPlanned: "10:30", endPlanned: "11:00", durationOverrideMin: 30, priority: 100 },
      { id: 1604, planId: 16, templateId: 4, templateName: "Contestant B busy", zoneId: 5, spaceId: 50, contestantId: 22, status: "done", startPlanned: "10:00", endPlanned: "10:30", durationOverrideMin: 30, priority: 90 },
      { id: 1605, planId: 16, templateId: 5, templateName: "Follower", zoneId: 7, spaceId: 71, contestantId: 44, status: "pending", durationOverrideMin: 30, priority: 80 },
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
  const byTask = new Map(run.plannedTasks.map((row) => [Number(row.taskId), row]));

  assert.equal(byTask.get(1601)?.startPlanned, "09:00");
  assert.equal(byTask.get(1601)?.endPlanned, "09:30");
  assert.equal(byTask.get(1602)?.startPlanned, "09:30");
  assert.equal(byTask.get(1602)?.endPlanned, "10:00");
  assert.equal(byTask.get(1605)?.startPlanned, "10:00");
  assert.equal(byTask.get(1605)?.endPlanned, "10:30");
}

console.log("solve.spec.ts: ok");
