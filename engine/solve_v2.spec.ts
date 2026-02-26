import assert from "node:assert/strict";
import { generatePlanV2 } from "./solve_v2";
import type { EngineInput } from "./types";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const mainGapCount = (run: any, tasks: any[], mainZoneId: number) => {
  const byId = new Map(tasks.map((t) => [Number(t.id), t]));
  const ints = (run?.plannedTasks ?? [])
    .map((p: any) => {
      const t = byId.get(Number(p.taskId));
      if (Number(t?.zoneId) !== Number(mainZoneId)) return null;
      const s = toMin(String(p.startPlanned));
      const e = toMin(String(p.endPlanned));
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
      return { s, e };
    })
    .filter((x: any) => Boolean(x))
    .sort((a: any, b: any) => a.s - b.s);

  let gaps = 0;
  for (let i = 1; i < ints.length; i++) {
    if (ints[i].s - ints[i - 1].e >= 5) gaps += 1;
  }
  return gaps;
};

{
  const tasks = [
    { id: 1, planId: 1, templateId: 10, templateName: "Main A", zoneId: 7, spaceId: 71, contestantId: 1, status: "pending", durationOverrideMin: 30 },
    { id: 2, planId: 1, templateId: 11, templateName: "Main B", zoneId: 7, spaceId: 71, contestantId: 1, status: "pending", durationOverrideMin: 30 },
    { id: 3, planId: 1, templateId: 99, templateName: "Outside", zoneId: 5, spaceId: 50, contestantId: 1, status: "done", startPlanned: "09:30", endPlanned: "10:00", durationOverrideMin: 30 },
  ];

  const input: EngineInput = {
    planId: 1,
    workDay: { start: "09:00", end: "12:00" },
    meal: { start: "12:00", end: "12:30" },
    camerasAvailable: 0,
    tasks: tasks as any,
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

  const run = generatePlanV2(input);
  assert.equal(mainGapCount(run, tasks, 7), 0);
}

{
  const tasks: any[] = [];
  let id = 100;
  for (let i = 0; i < 6; i++) {
    tasks.push({ id: id++, planId: 2, templateId: 1, templateName: "A", zoneId: 8, spaceId: i % 2 === 0 ? 81 : 82, contestantId: 100 + i, status: "pending", durationOverrideMin: 15 });
  }
  for (let i = 0; i < 6; i++) {
    tasks.push({ id: id++, planId: 2, templateId: 2, templateName: "B", zoneId: 8, spaceId: i % 2 === 0 ? 81 : 82, contestantId: 200 + i, status: "pending", durationOverrideMin: 15 });
  }

  const input: EngineInput = {
    planId: 2,
    workDay: { start: "09:00", end: "13:00" },
    meal: { start: "12:00", end: "12:30" },
    camerasAvailable: 0,
    tasks,
    locks: [],
    groupingZoneIds: [8],
    maxTemplateChangesByZoneId: { 8: 4 },
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
  };

  const run = generatePlanV2(input);
  const byId = new Map(tasks.map((t) => [Number(t.id), t]));
  const seq = (run.plannedTasks ?? [])
    .filter((p) => Number(byId.get(Number(p.taskId))?.zoneId) === 8)
    .sort((a, b) => toMin(a.startPlanned) - toMin(b.startPlanned))
    .map((p) => Number(byId.get(Number(p.taskId))?.templateId));

  let switches = 0;
  let longestBlock = 1;
  let current = 1;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] !== seq[i - 1]) {
      switches += 1;
      current = 1;
    } else {
      current += 1;
      if (current > longestBlock) longestBlock = current;
    }
  }

  assert.ok(longestBlock >= 3);
  assert.ok(switches <= 4);
}
