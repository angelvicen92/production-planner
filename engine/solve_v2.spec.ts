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

  assert.throws(() => generatePlanV2(input), /V2_EMPTY_AFTER_EXCLUSIONS|V2_NO_SELECTION_POSSIBLE/);
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

// No debe excluir tareas sin zoneId directo cuando la zona se puede derivar del espacio.
{
  const tasks: any[] = [
    {
      id: 401,
      planId: 40,
      templateId: 501,
      templateName: "Referencia espacio Transporte",
      zone_id: 9,
      space_id: 900,
      contestant_id: 41,
      status: "done",
      startPlanned: "08:00",
      endPlanned: "08:10",
      durationOverrideMin: 10,
    },
    {
      id: 402,
      planId: 40,
      templateId: 502,
      templateName: "IN Transporte",
      zoneId: null,
      spaceId: 900,
      contestantId: 42,
      status: "pending",
      durationOverrideMin: 20,
    },
  ];

  const input: EngineInput = {
    planId: 40,
    workDay: { start: "09:00", end: "11:00" },
    meal: { start: "10:00", end: "10:30" },
    camerasAvailable: 0,
    tasks,
    locks: [],
    groupingZoneIds: [9],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
  };

  const run = generatePlanV2(input);
  assert.ok((run.plannedTasks ?? []).length > 0);
  assert.ok((run.plannedTasks ?? []).some((p) => Number(p.taskId) === 402));
  const missingZoneWarning = (run.warnings ?? []).find(
    (w: any) => w?.code === "REQUIRES_CONFIGURATION" && String(w?.message ?? "").includes("no tiene plató/zona"),
  );
  assert.ok(!missingZoneWarning);
}

// IN/OUT en espacio Transporte: no debe generar falso warning de zona faltante si la zona viene del espacio.
{
  const tasks: any[] = [
    {
      id: 501,
      planId: 50,
      templateId: 601,
      templateName: "Semilla Transporte",
      zone: { id: 11 },
      space: { id: 1100 },
      contestantId: 77,
      status: "done",
      startPlanned: "08:00",
      endPlanned: "08:10",
      durationOverrideMin: 10,
    },
    {
      id: 502,
      planId: 50,
      templateId: 602,
      templateName: "IN",
      zoneId: null,
      spaceId: 1100,
      contestantId: 78,
      status: "pending",
      durationOverrideMin: 15,
    },
    {
      id: 503,
      planId: 50,
      templateId: 603,
      templateName: "OUT",
      zone_id: null,
      space_id: 1100,
      contestant_id: 79,
      status: "pending",
      durationOverrideMin: 15,
    },
  ];

  const input: EngineInput = {
    planId: 50,
    workDay: { start: "09:00", end: "12:00" },
    meal: { start: "10:30", end: "11:00" },
    camerasAvailable: 0,
    tasks,
    locks: [],
    groupingZoneIds: [],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
  };

  const run = generatePlanV2(input);
  const falseWarning = (run.warnings ?? []).find(
    (w: any) => w?.code === "REQUIRES_CONFIGURATION" && String(w?.message ?? "").includes("no tiene plató/zona"),
  );
  assert.ok(!falseWarning);
}

// Ventana de comida amplia + alta capacidad: no debe vaciar resultado ni reducir ventana a un único slot.
{
  const tasks: any[] = [];
  let id = 700;
  for (let i = 0; i < 9; i++) {
    const contestantId = 800 + i;
    tasks.push({
      id: id++,
      planId: 60,
      templateId: 1000,
      templateName: `Ensayo ${i + 1}`,
      zoneId: 21,
      spaceId: 2101,
      contestantId,
      status: "pending",
      durationOverrideMin: 30,
    });
    tasks.push({
      id: id++,
      planId: 60,
      templateId: 1999,
      templateName: "Comida",
      contestantId,
      status: "pending",
      durationOverrideMin: 40,
    });
  }

  const input: EngineInput = {
    planId: 60,
    workDay: { start: "09:00", end: "18:00" },
    meal: { start: "13:00", end: "16:30" },
    mealTaskTemplateName: "Comida",
    contestantMealDurationMinutes: 40,
    contestantMealMaxSimultaneous: 10,
    camerasAvailable: 0,
    tasks,
    locks: [],
    groupingZoneIds: [21],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
    optimizerMainZoneId: 21,
    optimizerMainZoneOptKeepBusy: true,
    optimizerWeights: { mainZoneKeepBusy: 10 },
  };

  const run = generatePlanV2(input);
  assert.equal(run.hardFeasible, true);
  assert.ok((run.plannedTasks ?? []).length > 0);
  assert.ok(!(run.warnings ?? []).some((w: any) => w?.code === "V2_EMPTY_RESULT"));
}

// Wrap itinerante con requirement=any (teamId null) debe envolver inner y no bloquear espacio a otro concursante.
{
  const input: EngineInput = {
    planId: 61,
    workDay: { start: "11:00", end: "12:00" },
    meal: { start: "12:30", end: "13:00" },
    camerasAvailable: 0,
    tasks: [
      { id: 6103, planId: 61, templateId: 50, templateName: "Prereq A", zoneId: 7, spaceId: 80, contestantId: 1, status: "done", startPlanned: "11:00", endPlanned: "11:15", durationOverrideMin: 15 },
      { id: 6101, planId: 61, templateId: 51, templateName: "Inner", zoneId: 7, spaceId: 71, contestantId: 1, status: "pending", durationOverrideMin: 15, dependsOnTaskIds: [6103] },
      {
        id: 6102,
        planId: 61,
        templateId: 52,
        templateName: "Wrap itinerante any",
        zoneId: 7,
        spaceId: 71,
        contestantId: 1,
        status: "pending",
        durationOverrideMin: 30,
        itinerantTeamId: null,
        itinerantTeamRequirement: "any",
        dependsOnTaskIds: [6101],
      },
      { id: 6104, planId: 61, templateId: 53, templateName: "Otro concursante mismo espacio", zoneId: 7, spaceId: 71, contestantId: 2, status: "pending", durationOverrideMin: 30 },
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

  const run = generatePlanV2(input);
  const byTask = new Map((run.plannedTasks ?? []).map((p: any) => [Number(p.taskId), p]));

  const inner = byTask.get(6101);
  const wrap = byTask.get(6102);
  const other = byTask.get(6104);

  assert.ok(inner);
  assert.ok(wrap);
  assert.ok(other);

  const innerStart = toMin(String(inner.startPlanned));
  const innerEnd = toMin(String(inner.endPlanned));
  const wrapStart = toMin(String(wrap.startPlanned));
  const wrapEnd = toMin(String(wrap.endPlanned));

  assert.equal(wrapStart, innerStart - 15);
  assert.equal(wrapEnd, innerEnd + 15);

  const otherStart = toMin(String(other.startPlanned));
  const otherEnd = toMin(String(other.endPlanned));
  assert.ok(otherStart < wrapEnd && otherEnd > wrapStart);
}

// Si no existen candidatos en pools (espacio/zona/global) para byItem, debe fallar inmediato con RESOURCE_POOL_EMPTY.
{
  const input: EngineInput = {
    planId: 62,
    workDay: { start: "09:00", end: "12:00" },
    meal: { start: "12:30", end: "13:00" },
    camerasAvailable: 0,
    tasks: [
      {
        id: 6201,
        planId: 62,
        templateId: 700,
        templateName: "Reality",
        zoneId: 7,
        spaceId: 71,
        contestantId: 1,
        status: "pending",
        durationOverrideMin: 30,
        resourceRequirements: { byItem: { 9999: 1 } },
      },
      {
        id: 6202,
        planId: 62,
        templateId: 701,
        templateName: "Tarea base",
        zoneId: 7,
        spaceId: 72,
        contestantId: 2,
        status: "pending",
        durationOverrideMin: 30,
      },
    ] as any,
    locks: [],
    groupingZoneIds: [],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
  };

  const run = generatePlanV2(input);
  const reason = (run.unplannedTasks ?? [])[0]?.reason;
  assert.equal(reason?.code, "RESOURCE_POOL_EMPTY");
  assert.equal(reason?.details?.requirementKind, "byItem");
}

// Si tarea itinerante any/specific no tiene allowedItinerantTeamIds, debe fallar con RESOURCE_POOL_EMPTY (config).
{
  const input: EngineInput = {
    planId: 64,
    workDay: { start: "09:00", end: "12:00" },
    meal: { start: "12:30", end: "13:00" },
    camerasAvailable: 0,
    tasks: [
      {
        id: 6401,
        planId: 64,
        templateId: 800,
        templateName: "Reality",
        zoneId: 7,
        spaceId: 71,
        contestantId: 1,
        status: "pending",
        durationOverrideMin: 30,
        itinerantTeamRequirement: "any",
        allowedItinerantTeamIds: [],
      },
    ] as any,
    locks: [],
    groupingZoneIds: [],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
  };

  const run = generatePlanV2(input);
  const reason = (run.unplannedTasks ?? [])[0]?.reason;
  assert.equal(reason?.code, "RESOURCE_POOL_EMPTY");
  assert.equal(reason?.details?.requirementKind, "anyOf");
  assert.deepEqual(reason?.details?.allowedItinerantTeamIds, []);
}

// Si allowedItinerantTeamIds existe pero el plan no tiene items para ellos, debe fallar con RESOURCE_POOL_EMPTY específico.
{
  const input: EngineInput = {
    planId: 65,
    workDay: { start: "09:00", end: "12:00" },
    meal: { start: "12:30", end: "13:00" },
    camerasAvailable: 0,
    tasks: [
      {
        id: 6501,
        planId: 65,
        templateId: 801,
        templateName: "Reality",
        zoneId: 7,
        spaceId: 71,
        contestantId: 1,
        status: "pending",
        durationOverrideMin: 30,
        itinerantTeamRequirement: "specific",
        allowedItinerantTeamIds: [9001, 9002],
      },
    ] as any,
    locks: [],
    groupingZoneIds: [],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [
      { id: 1, resourceItemId: 9100, typeId: 77, name: "Otro recurso", isAvailable: true },
    ],
    resourceItemComponents: {},
  };

  const run = generatePlanV2(input);
  const reason = (run.unplannedTasks ?? [])[0]?.reason;
  assert.equal(reason?.code, "RESOURCE_POOL_EMPTY");
  assert.equal(reason?.details?.reason, "NO_PLAN_RESOURCE_ITEMS_MATCH");
}

// Si el start se desplaza por espacio y al final supera maxEndAllowed, debe devolver SPACE_BUSY (no CONTESTANT_NOT_AVAILABLE).
{
  const input: EngineInput = {
    planId: 63,
    workDay: { start: "09:00", end: "11:00" },
    meal: { start: "12:30", end: "13:00" },
    camerasAvailable: 0,
    contestantAvailabilityById: {
      10: { start: "09:00", end: "10:00" },
    } as any,
    tasks: [
      {
        id: 6300,
        planId: 63,
        templateId: 800,
        templateName: "Bloqueo espacio",
        zoneId: 7,
        spaceId: 71,
        contestantId: 99,
        status: "done",
        startPlanned: "09:00",
        endPlanned: "10:00",
        durationOverrideMin: 60,
      },
      {
        id: 6301,
        planId: 63,
        templateId: 801,
        templateName: "Reality",
        zoneId: 7,
        spaceId: 71,
        contestantId: 10,
        contestantName: "Ana",
        status: "pending",
        durationOverrideMin: 30,
      },
      {
        id: 6302,
        planId: 63,
        templateId: 802,
        templateName: "Tarea base",
        zoneId: 7,
        spaceId: 72,
        contestantId: 11,
        status: "pending",
        durationOverrideMin: 30,
      },
    ] as any,
    locks: [],
    groupingZoneIds: [],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
  };

  const run = generatePlanV2(input);
  const reason = (run.unplannedTasks ?? []).find((t: any) => Number(t?.taskId) === 6301)?.reason;
  assert.equal(reason?.code, "SPACE_BUSY");
  assert.ok(String(reason?.message ?? "").includes("Espacio ocupado"));
  assert.equal(reason?.details?.lastBumpDetails?.spaceId, 71);
}
