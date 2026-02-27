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

  assert.throws(() => generatePlanV2(input), /V2_NO_SELECTION_POSSIBLE/);
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

// Lookahead depth=2: feeder A desbloquea 2 ensayos del template objetivo; feeder B desbloquea 1.
{
  const tasks = [
    { id: 1, planId: 3, templateId: 100, templateName: "Ensayo JM 1", zoneId: 7, spaceId: 71, contestantId: 3, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [10, 12] },
    { id: 2, planId: 3, templateId: 100, templateName: "Ensayo JM 2", zoneId: 7, spaceId: 71, contestantId: 4, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [10] },
    { id: 4, planId: 3, templateId: 100, templateName: "Ensayo JM ready", zoneId: 7, spaceId: 71, contestantId: 1, status: "pending", durationOverrideMin: 30 },
    { id: 10, planId: 3, templateId: 200, templateName: "PV JM A", zoneId: 5, spaceId: 51, contestantId: 3, status: "pending", durationOverrideMin: 15 },
    { id: 11, planId: 3, templateId: 201, templateName: "PV JM B", zoneId: 5, spaceId: 51, contestantId: 4, status: "pending", durationOverrideMin: 15 },
    { id: 12, planId: 3, templateId: 202, templateName: "Previo", zoneId: 6, spaceId: 61, contestantId: 3, status: "pending", durationOverrideMin: 15 },
    { id: 5, planId: 3, templateId: 100, templateName: "Ensayo JM 3", zoneId: 7, spaceId: 71, contestantId: 2, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [11] },
  ];

  const input: EngineInput = {
    planId: 3,
    workDay: { start: "09:00", end: "12:00" },
    meal: { start: "11:30", end: "12:00" },
    camerasAvailable: 0,
    tasks: tasks as any,
    locks: [],
    groupingZoneIds: [7],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
    optimizerMainZoneId: 7,
    optimizerMainZoneOptKeepBusy: true,
    optimizerMainZonePriorityLevel: 3,
    optimizerGroupingLevel: 3,
    optimizerWeights: { mainZoneKeepBusy: 10, groupBySpaceTemplateMatch: 10, groupBySpaceActive: 10 },
  };

  const run = generatePlanV2(input);
  const seq = (run.plannedTasks ?? []).slice().sort((a, b) => toMin(String(a.startPlanned)) - toMin(String(b.startPlanned))).map((p) => Number(p.taskId));
  assert.ok(seq.indexOf(10) >= 0 && seq.indexOf(11) >= 0 && seq.indexOf(10) < seq.indexOf(11));

  const lookaheadInsight = (run.insights ?? []).find((i: any) => i?.code === "V2_LOOKAHEAD");
  assert.ok(lookaheadInsight);
}

// Reset por comida: cambiar template justo tras comida no debe disparar penalización de switch.
{
  const tasks = [
    { id: 21, planId: 4, templateId: 100, templateName: "Main A", zoneId: 7, spaceId: 71, contestantId: 1, status: "pending", durationOverrideMin: 30 },
    { id: 22, planId: 4, templateId: 101, templateName: "Main B", zoneId: 7, spaceId: 71, contestantId: 2, status: "pending", durationOverrideMin: 30 },
    { id: 23, planId: 4, templateId: 999, templateName: "Comida plató", zoneId: 7, spaceId: 71, isMeal: true, status: "pending", durationOverrideMin: 15 },
    { id: 24, planId: 4, templateId: 200, templateName: "Feeder", zoneId: 5, spaceId: 51, contestantId: 3, status: "pending", durationOverrideMin: 15 },
  ];

  const input: EngineInput = {
    planId: 4,
    workDay: { start: "09:00", end: "11:00" },
    meal: { start: "09:30", end: "10:00" },
    camerasAvailable: 0,
    tasks: tasks as any,
    locks: [],
    groupingZoneIds: [7],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
    optimizerMainZoneId: 7,
    optimizerMainZoneOptKeepBusy: true,
    optimizerMainZonePriorityLevel: 3,
    optimizerGroupingLevel: 3,
    optimizerWeights: { mainZoneKeepBusy: 10, groupBySpaceTemplateMatch: 10, groupBySpaceActive: 10 },
  };

  const run = generatePlanV2(input);
  const byId = new Map(tasks.map((t: any) => [Number(t.id), t]));
  const mainSeq = (run.plannedTasks ?? [])
    .filter((p) => Number(byId.get(Number(p.taskId))?.zoneId) === 7)
    .sort((a, b) => toMin(String(a.startPlanned)) - toMin(String(b.startPlanned)))
    .map((p) => Number(p.taskId));
  assert.ok(mainSeq.includes(23));

  const switchInsight = (run.insights ?? []).find((i: any) => i?.code === "V2_MAIN_TEMPLATE_SWITCH");
  assert.ok(!switchInsight);
}

// Comida flexible: el solver evita colocar comida al inicio si produce más switches.
{
  const tasks = [
    { id: 31, planId: 5, templateId: 100, templateName: "Main A1", zoneId: 7, spaceId: 71, contestantId: 1, status: "pending", durationOverrideMin: 30 },
    { id: 32, planId: 5, templateId: 101, templateName: "Main B", zoneId: 7, spaceId: 71, contestantId: 2, status: "pending", durationOverrideMin: 30 },
    { id: 33, planId: 5, templateId: 100, templateName: "Main A2", zoneId: 7, spaceId: 71, contestantId: 3, status: "pending", durationOverrideMin: 30 },
    { id: 34, planId: 5, templateId: 999, templateName: "Comida plató", zoneId: 7, spaceId: 71, isMeal: true, status: "pending", durationOverrideMin: 30 },
  ];

  const input: EngineInput = {
    planId: 5,
    workDay: { start: "09:00", end: "12:00" },
    meal: { start: "09:00", end: "10:00" },
    camerasAvailable: 0,
    tasks: tasks as any,
    locks: [],
    groupingZoneIds: [7],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
    optimizerMainZoneId: 7,
    optimizerMainZoneOptKeepBusy: true,
    optimizerMainZonePriorityLevel: 3,
    optimizerGroupingLevel: 3,
    optimizerWeights: { mainZoneKeepBusy: 10, groupBySpaceTemplateMatch: 10, groupBySpaceActive: 10 },
  };

  const run = generatePlanV2(input);
  assert.equal(mainGapCount(run, tasks as any, 7), 0);

  const mealInsight = (run.insights ?? []).find((i: any) => i?.code === "V2_MEAL_CHOICE");
  assert.ok(mealInsight);
  assert.ok(Number(mealInsight?.details?.attemptsMeal ?? 0) > 1);
}
