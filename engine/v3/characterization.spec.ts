import assert from "node:assert/strict";
import { generatePlanV3 } from "./index";
import type { EngineV3Input } from "./types";

const toMin = (hhmm: string) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};

const baseInput = (tasks: any[], overrides: Partial<EngineV3Input> = {}): EngineV3Input => ({
  planId: 3003,
  workDay: { start: "09:00", end: "12:00" },
  meal: { start: "13:00", end: "13:30" },
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
  optimizerMainZoneOptKeepBusy: true,
  optimizerWeights: {
    mainZoneKeepBusy: 10,
    mainZoneFinishEarly: 6,
    groupBySpaceTemplateMatch: 4,
    contestantCompact: 4,
  },
  ...overrides,
});

const plannedById = (output: any) => new Map((output.plannedTasks ?? []).map((p: any) => [Number(p.taskId), p]));

// Caso 1 — Talent con salida temprana: el motor respeta la ventana y expone el bonus de prioridad por ventana.
{
  const tasks = [
    { id: 1, planId: 3003, templateId: 100, templateName: "Flexible A", zoneId: 2, spaceId: 21, contestantId: 2, contestantName: "Flexible", status: "pending", durationOverrideMin: 30 },
    { id: 2, planId: 3003, templateId: 101, templateName: "Early Exit", zoneId: 1, spaceId: 11, contestantId: 1, contestantName: "Early", status: "pending", durationOverrideMin: 30 },
    { id: 3, planId: 3003, templateId: 102, templateName: "Flexible B", zoneId: 1, spaceId: 11, contestantId: 3, contestantName: "Flexible B", status: "pending", durationOverrideMin: 30 },
  ];
  const out = generatePlanV3(baseInput(tasks, {
    contestantAvailabilityById: {
      1: { start: "09:00", end: "10:00" },
      2: { start: "09:00", end: "12:00" },
      3: { start: "09:00", end: "12:00" },
    },
  }), { timeLimitMs: 0 });

  assert.equal(out.complete, true);
  const early = plannedById(out).get(2) as any;
  assert.ok(early, "early-exit task should be planned");
  assert.ok(toMin(String(early.startPlanned)) >= toMin("09:00"));
  assert.ok(toMin(String(early.endPlanned)) <= toMin("10:00"));

  const flexibleSameSpace = plannedById(out).get(3) as any;
  assert.ok(
    toMin(String(early.startPlanned)) <= toMin(String(flexibleSameSpace.startPlanned)),
    "current behavior places the restrictive main-space contestant no later than the flexible main-space task",
  );
}

// Caso 2 — Orden greedy potencialmente peligroso: caracterizamos que el scoring actual evita el bloqueo simple por ventana corta.
{
  const tasks = [
    { id: 10, planId: 3003, templateId: 200, templateName: "Flexible first by id", zoneId: 1, spaceId: 11, contestantId: 20, status: "pending", durationOverrideMin: 30 },
    { id: 11, planId: 3003, templateId: 201, templateName: "Restrictive second by id", zoneId: 1, spaceId: 11, contestantId: 21, status: "pending", durationOverrideMin: 30 },
  ];
  const out = generatePlanV3(baseInput(tasks, {
    workDay: { start: "09:00", end: "10:00" },
    contestantAvailabilityById: {
      20: { start: "09:00", end: "10:00" },
      21: { start: "09:00", end: "09:30" },
    },
  }), { timeLimitMs: 0 });

  assert.equal(out.complete, true);
  const restrictive = plannedById(out).get(11) as any;
  assert.ok(restrictive, "restrictive task should be planned in the current characterization");
  assert.equal(restrictive.startPlanned, "09:00");
  assert.equal(restrictive.endPlanned, "09:30");
}

// Caso 3 — Continuidad de plató principal: los huecos se informan como insight/warning, no como hard constraint.
{
  const tasks = [
    { id: 20, planId: 3003, templateId: 300, templateName: "Main early", zoneId: 1, spaceId: 11, contestantId: 30, status: "pending", durationOverrideMin: 30 },
    { id: 21, planId: 3003, templateId: 301, templateName: "Main windowed", zoneId: 1, spaceId: 11, contestantId: 31, status: "pending", durationOverrideMin: 30 },
  ];
  const out = generatePlanV3(baseInput(tasks, {
    contestantAvailabilityById: {
      30: { start: "09:00", end: "09:30" },
      31: { start: "10:00", end: "11:00" },
    },
  }), { timeLimitMs: 0 });

  assert.equal(out.complete, true);
  const gapStats = (out.insights ?? []).find((insight: any) => insight.code === "MAIN_ZONE_GAP_STATS") as any;
  assert.ok(gapStats, "main-zone gap stats should be emitted");
  assert.ok(Number(gapStats.details?.totalGaps ?? 0) >= 1, "the characterization scenario should expose a main-zone gap");
  assert.equal(out.hardFeasible, true, "main-zone continuity gaps are not hard failures in the current engine");
}

// Caso 4 — CP-SAT execution metadata: con presupuesto >0 se intenta Fase B y se anota el resultado sin cambiar contrato funcional.
{
  const tasks = [
    { id: 30, planId: 3003, templateId: 400, templateName: "A", zoneId: 1, spaceId: 11, contestantId: 40, status: "pending", durationOverrideMin: 30 },
    { id: 31, planId: 3003, templateId: 401, templateName: "B", zoneId: 1, spaceId: 11, contestantId: 41, status: "pending", durationOverrideMin: 30 },
  ];
  const out = generatePlanV3(baseInput(tasks), { timeLimitMs: 1000 });

  assert.equal(out.complete, true);
  assert.equal(out.v3Meta?.prevalidationRun, true);
  assert.equal(out.v3Meta?.phaseAUsed, true);
  assert.equal(out.v3Meta?.phaseAFoundSolution, true);
  assert.equal(out.v3Meta?.cpSatAttempted, true);
  assert.equal(typeof out.v3Meta?.cpSatReason, "string");
  const quality = (out.insights ?? []).find((insight: any) => insight.code === "V3_PHASE_B_QUALITY") as any;
  assert.ok(quality, "phase-B quality insight should still be present");
}

console.log("engine/v3/characterization.spec.ts: OK");
