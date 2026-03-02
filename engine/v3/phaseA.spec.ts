import assert from "node:assert/strict";
import { generatePlanV3 } from "./index";
import type { EngineV3Input } from "./types";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const baseInput = (tasks: any[]): EngineV3Input => ({
  planId: 1,
  workDay: { start: "09:00", end: "13:00" },
  meal: { start: "12:00", end: "12:30" },
  camerasAvailable: 2,
  contestantMealDurationMinutes: 30,
  contestantMealMaxSimultaneous: 10,
  tasks,
  locks: [],
  groupingZoneIds: [1],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [],
  resourceItemComponents: {},
  optimizerMainZoneId: 1,
  optimizerWeights: {
    mainZoneKeepBusy: 10,
    groupBySpaceTemplateMatch: 8,
    contestantStayInZone: 7,
    contestantCompact: 7,
  },
});

// Caso simple: plan completo.
{
  const tasks = [
    { id: 1, planId: 1, templateId: 101, templateName: "A1", zoneId: 1, spaceId: 11, contestantId: 1, status: "pending", durationOverrideMin: 30 },
    { id: 2, planId: 1, templateId: 102, templateName: "A2", zoneId: 1, spaceId: 11, contestantId: 2, status: "pending", durationOverrideMin: 30 },
    { id: 3, planId: 1, templateId: 103, templateName: "A3", zoneId: 1, spaceId: 12, contestantId: 3, status: "pending", durationOverrideMin: 30 },
    { id: 4, planId: 1, templateId: 104, templateName: "A4", zoneId: 1, spaceId: 12, contestantId: 4, status: "pending", durationOverrideMin: 30 },
    { id: 5, planId: 1, templateId: 105, templateName: "A5", zoneId: 1, spaceId: 11, contestantId: 5, status: "pending", durationOverrideMin: 30 },
  ];
  const out = generatePlanV3(baseInput(tasks));
  assert.equal(out.complete, true);
  assert.equal(out.hardFeasible, true);
  assert.equal((out.plannedTasks ?? []).length, 5);
}

// Dependencia faltante: se ignora (no crashea, no bloquea por ese id inexistente).
{
  const tasks = [
    { id: 11, planId: 1, templateId: 201, templateName: "Dep Missing", zoneId: 1, spaceId: 11, contestantId: 1, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [999999] },
    { id: 12, planId: 1, templateId: 202, templateName: "Other", zoneId: 1, spaceId: 12, contestantId: 2, status: "pending", durationOverrideMin: 30 },
  ];
  const out = generatePlanV3(baseInput(tasks));
  assert.equal(out.complete, true);
  assert.equal((out.plannedTasks ?? []).length, 2);
}

// Wrap itinerante: envuelve inner con 15+15.
{
  const tasks = [
    { id: 20, planId: 1, templateId: 300, templateName: "Prereq", zoneId: 1, spaceId: 19, contestantId: 9, status: "done", startPlanned: "09:00", endPlanned: "09:15", durationOverrideMin: 15 },
    { id: 21, planId: 1, templateId: 301, templateName: "Base", zoneId: 1, spaceId: 11, contestantId: 9, status: "pending", durationOverrideMin: 15, dependsOnTaskIds: [20] },
    { id: 22, planId: 1, templateId: 302, templateName: "Wrap Itinerante", zoneId: 1, spaceId: 11, contestantId: 9, itinerantTeamRequirement: "any", status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [21] },
    { id: 23, planId: 1, templateId: 303, templateName: "Other", zoneId: 1, spaceId: 11, contestantId: 3, status: "pending", durationOverrideMin: 30 },
  ];
  const out = generatePlanV3(baseInput(tasks));
  assert.equal(out.complete, true);
  const byId = new Map((out.plannedTasks ?? []).map((p) => [Number(p.taskId), p]));
  const inner = byId.get(21)!;
  const wrap = byId.get(22)!;
  assert.ok(inner && wrap);
  assert.equal(toMin(wrap.startPlanned), toMin(inner.startPlanned) - 15);
  assert.equal(toMin(wrap.endPlanned), toMin(inner.endPlanned) + 15);
}

// Imposible sin overtime: devuelve diagnóstico + needs_user_approval (overtime).
{
  const tasks = [
    { id: 31, planId: 1, templateId: 401, templateName: "Long1", zoneId: 1, spaceId: 11, contestantId: 1, status: "pending", durationOverrideMin: 120 },
    { id: 32, planId: 1, templateId: 402, templateName: "Long2", zoneId: 1, spaceId: 11, contestantId: 2, status: "pending", durationOverrideMin: 120 },
    { id: 33, planId: 1, templateId: 403, templateName: "Long3", zoneId: 1, spaceId: 11, contestantId: 3, status: "pending", durationOverrideMin: 120 },
  ];
  const out = generatePlanV3(baseInput(tasks));
  assert.equal(out.complete, false);
  const approval = (out.reasons ?? []).find((r: any) => String(r?.code) === "NEEDS_USER_APPROVAL") as any;
  assert.ok(approval);
  assert.ok(Number(approval?.details?.overtime_min_required ?? 0) > 0);
}


// Imposible incluso con overtime máximo: devuelve INCOMPLETE_PLAN.
{
  const tasks = [
    { id: 41, planId: 1, templateId: 501, templateName: "TooLong", zoneId: 1, spaceId: 11, contestantId: 1, status: "pending", durationOverrideMin: 500 },
  ];
  const out = generatePlanV3(baseInput(tasks));
  assert.equal(out.complete, false);
  const incomplete = (out.reasons ?? []).find((r: any) => String(r?.code) === "INCOMPLETE_PLAN") as any;
  assert.ok(incomplete);
}

console.log("engine/v3/phaseA.spec.ts: OK");

const countMainZoneSwitches = (planned: any[], taskById: Map<number, any>, mainZoneId: number) => {
  const rows = planned
    .map((p) => ({ ...p, task: taskById.get(Number(p.taskId)) }))
    .filter((row) => Number(row?.task?.zoneId) === Number(mainZoneId))
    .sort((a, b) => toMin(String(a.startPlanned)) - toMin(String(b.startPlanned)));
  let switches = 0;
  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i - 1]?.task?.templateId) !== Number(rows[i]?.task?.templateId)) switches++;
  }
  return { switches, rows };
};

const countUnnecessaryGaps = (rows: any[]) => {
  let gaps = 0;
  for (let i = 1; i < rows.length; i++) {
    const prevEnd = toMin(String(rows[i - 1].endPlanned));
    const nextStart = toMin(String(rows[i].startPlanned));
    if (nextStart > prevEnd) gaps++;
  }
  return gaps;
};

// Robustez: cambio de ventana de concursante (19:00 -> 16:00) no debe causar caos global.
{
  const tasks = [
    { id: 101, planId: 1, templateId: 9001, templateName: "IN", zoneId: 1, spaceId: 11, contestantId: 1, status: "pending", durationOverrideMin: 20 },
    { id: 102, planId: 1, templateId: 9001, templateName: "IN", zoneId: 1, spaceId: 11, contestantId: 2, status: "pending", durationOverrideMin: 20 },
    { id: 103, planId: 1, templateId: 9002, templateName: "PLATO", zoneId: 1, spaceId: 11, contestantId: 1, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [101] },
    { id: 104, planId: 1, templateId: 9002, templateName: "PLATO", zoneId: 1, spaceId: 11, contestantId: 2, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [102] },
    { id: 105, planId: 1, templateId: 9003, templateName: "OUT", zoneId: 1, spaceId: 11, contestantId: 1, status: "pending", durationOverrideMin: 20, dependsOnTaskIds: [103] },
    { id: 106, planId: 1, templateId: 9003, templateName: "OUT", zoneId: 1, spaceId: 11, contestantId: 2, status: "pending", durationOverrideMin: 20, dependsOnTaskIds: [104] },
  ];

  const input1900 = {
    ...baseInput(tasks),
    workDay: { start: "09:00", end: "19:00" },
    contestantAvailabilityById: {
      1: { start: "09:00", end: "19:00" },
      2: { start: "09:00", end: "19:00" },
    },
  } as EngineV3Input;

  const input1600 = {
    ...baseInput(tasks),
    workDay: { start: "09:00", end: "19:00" },
    contestantAvailabilityById: {
      1: { start: "09:00", end: "16:00" },
      2: { start: "09:00", end: "19:00" },
    },
  } as EngineV3Input;

  const out1900 = generatePlanV3(input1900, { timeLimitMs: 0 });
  const out1600 = generatePlanV3(input1600, { timeLimitMs: 0 });
  assert.equal(out1900.hardFeasible, true);
  assert.equal(out1600.hardFeasible, true);

  const byId = new Map(tasks.map((t) => [Number(t.id), t]));
  const m1900 = countMainZoneSwitches(out1900.plannedTasks ?? [], byId, 1);
  const m1600 = countMainZoneSwitches(out1600.plannedTasks ?? [], byId, 1);
  assert.ok(m1600.switches <= m1900.switches + 2, `Switches se dispararon: base=${m1900.switches} variant=${m1600.switches}`);

  const gaps1900 = countUnnecessaryGaps(m1900.rows);
  const gaps1600 = countUnnecessaryGaps(m1600.rows);
  assert.ok(gaps1600 <= gaps1900 + 1, `Gaps innecesarios crecieron demasiado: base=${gaps1900} variant=${gaps1600}`);

  const inOutTemplateIds = new Set([9001, 9003]);
  const inOut1900 = (out1900.plannedTasks ?? []).filter((p: any) => inOutTemplateIds.has(Number(byId.get(Number(p.taskId))?.templateId))).length;
  const inOut1600 = (out1600.plannedTasks ?? []).filter((p: any) => inOutTemplateIds.has(Number(byId.get(Number(p.taskId))?.templateId))).length;
  assert.ok(inOut1600 >= inOut1900 - 1, `Batching IN/OUT degradado: base=${inOut1900} variant=${inOut1600}`);
}
