import type { EngineInput, TaskInput } from "../../../types";
import type { ProductionBenchmarkScenario } from "./index";

const PLAN_ID = 18400;
const MAIN_ZONE_ID = 1;

const SPACES = {
  holding: 1101,
  makeup: 1102,
  vocalA: 1103,
  vocalB: 1104,
  reality: 1105,
  pasillo: 1106,
  croma: 1107,
  recursos: 1108,
  totales: 1109,
  plato: 1110,
} as const;

const RESOURCE_TYPES = {
  camera: 1,
  coach: 10,
  presenter: 20,
  audio: 30,
  producer: 40,
  lighting: 50,
} as const;

const RESOURCES = {
  cameraA: 501,
  cameraB: 502,
  cameraC: 503,
  coachA: 901,
  coachB: 902,
  presenter: 930,
  audioMain: 940,
  floorManager: 950,
  realityProducer: 960,
  cromaOperator: 970,
  lightingMain: 980,
  productionRunner: 990,
} as const;

const TALENTS = [
  [18401, "Talent 01"], [18402, "Talent 02"], [18403, "Talent 03"], [18404, "Talent 04"], [18405, "Talent 05"],
  [18406, "Talent 06"], [18407, "Talent 07"], [18408, "Talent 08"], [18409, "Talent 09"], [18410, "Talent 10"],
  [18411, "Talent 11"], [18412, "Talent 12"], [18413, "Talent 13"], [18414, "Talent 14"], [18415, "Talent 15"],
  [18416, "Talent 16"], [18417, "Talent 17"], [18418, "Talent 18"], [18419, "Talent 19"],
] as const;

type Talent = typeof TALENTS[number];
type Step = { key: string; name: string; spaceId: number; duration: number; resources?: TaskInput["resourceRequirements"]; camera?: 0 | 1 | 2 };

const stepsFor = (index: number): Step[] => {
  const coach = index % 2 === 0 ? RESOURCES.coachA : RESOURCES.coachB;
  return [
    { key: "reality", name: "Reality previa", spaceId: SPACES.reality, duration: 12, resources: { byItem: { [RESOURCES.realityProducer]: 1 }, anyOf: [{ quantity: 1, resourceItemIds: [RESOURCES.cameraA, RESOURCES.cameraB] }] }, camera: 1 },
    { key: "vocal", name: "Vocal coach", spaceId: index % 2 === 0 ? SPACES.vocalA : SPACES.vocalB, duration: 18, resources: { byItem: { [coach]: 1 } } },
    { key: "totales", name: "Totales", spaceId: SPACES.totales, duration: 10, resources: { anyOf: [{ quantity: 1, resourceItemIds: [RESOURCES.cameraA, RESOURCES.cameraB, RESOURCES.cameraC] }] }, camera: 1 },
    { key: "pasillo", name: "Pasillo recursos", spaceId: index % 3 === 0 ? SPACES.croma : index % 3 === 1 ? SPACES.pasillo : SPACES.recursos, duration: 8, resources: { byItem: { [index % 3 === 0 ? RESOURCES.cromaOperator : RESOURCES.productionRunner]: 1 } } },
    { key: "plato", name: "Audición plató principal", spaceId: SPACES.plato, duration: 22, resources: { byItem: { [RESOURCES.presenter]: 1, [RESOURCES.audioMain]: 1, [RESOURCES.lightingMain]: 1 }, anyOf: [{ quantity: 2, resourceItemIds: [RESOURCES.cameraA, RESOURCES.cameraB, RESOURCES.cameraC] }] }, camera: 2 },
    { key: "pickups", name: "Pickups salida", spaceId: SPACES.holding, duration: 6, resources: { byItem: { [RESOURCES.floorManager]: 1 } } },
  ];
};

const taskId = (talentId: number, stepIndex: number): number => talentId * 10 + stepIndex;

const hhmm = (totalMinutes: number): string => `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;

function talentTasks([talentId, talentName]: Talent, index: number): TaskInput[] {
  const prepStart = 8 * 60 + 30 + index * 5;
  return stepsFor(index).map((step, stepIndex) => {
    const id = taskId(talentId, stepIndex + 1);
    const previousId = stepIndex === 0 ? null : taskId(talentId, stepIndex);
    const lockedPlato = step.key === "plato" && (talentId === 18403 || talentId === 18414);
    const fixedPrepStart = prepStart + stepIndex * 15;
    const fixedContext = { status: "done" as const, startPlanned: hhmm(fixedPrepStart), endPlanned: hhmm(fixedPrepStart + step.duration) };
    return {
      id,
      planId: PLAN_ID,
      templateId: 184000 + stepIndex + 1,
      templateName: step.name,
      status: "pending",
      contestantId: talentId,
      contestantName: talentName,
      zoneId: MAIN_ZONE_ID,
      spaceId: step.spaceId,
      durationOverrideMin: step.duration,
      camerasOverride: step.camera ?? 0,
      resourceRequirements: step.resources ?? null,
      hasDependency: previousId !== null,
      dependsOnTaskIds: previousId === null ? [] : [previousId],
      ...fixedContext,
      ...(lockedPlato && talentId === 18403 ? { status: "pending" as const, startPlanned: "10:20", endPlanned: "10:42" } : {}),
      ...(lockedPlato && talentId === 18414 ? { status: "pending" as const, startPlanned: "15:10", endPlanned: "15:32" } : {}),
      // Presenter critical-resource reduced window: main-stage audition tasks are bounded to the real presenter block.
      ...(step.key === "plato" ? { fixedWindowStart: "10:00", fixedWindowEnd: "16:30" } : {}),
      // Totales room limited window: all Totales tasks model the artificial 09:45-15:45 availability block.
      ...(step.key === "totales" ? { fixedWindowStart: "09:45", fixedWindowEnd: "15:45" } : {}),
    };
  });
}

const tasks = TALENTS.flatMap((talent, index) => talentTasks(talent, index));

export const realVoiceAuditionDayScenario: ProductionBenchmarkScenario = {
  id: "real-voice-audition-day",
  name: "Real Voice Audition Day",
  category: "real-production-day",
  description: "Deterministic benchmark inspired by a real audition rehearsal day: 19 talents, vocal coaching, totales, reality, corridor resources, croma, presenter-led main-stage auditions and manual locks.",
  expectation: "OPQM, Operational Delta Benchmark, Improvement Opportunity Analyzer and Evidence Gate receive a realistic read-only production day without modifying ORC, V4 or official planning.",
  input: {
    planId: PLAN_ID,
    workDay: { start: "08:30", end: "18:30" },
    mealMode: "global_hard_break",
    meal: { start: "13:30", end: "14:15" },
    actualMeal: { id: "global-meal", label: "Comida global", kind: "meal", start: "13:30", end: "14:15" },
    globalHardBreaks: [{ start: "13:30", end: "14:15" }],
    camerasAvailable: 3,
    tasks,
    locks: [
      // Manual time lock copied as benchmark input only; it must not mutate official planning.
      { id: 184001, planId: PLAN_ID, taskId: taskId(18403, 5), lockType: "time", lockedStart: "10:20", lockedEnd: "10:42" },
      // Second manual time lock creates realistic afternoon presenter pressure.
      { id: 184002, planId: PLAN_ID, taskId: taskId(18414, 5), lockType: "time", lockedStart: "15:10", lockedEnd: "15:32" },
    ],
    // Artificial talent time restrictions: 2 early finishes and 2 late arrivals.
    contestantAvailabilityById: {
      18404: { start: "08:30", end: "12:45" },
      18409: { start: "08:30", end: "13:00" },
      18415: { start: "11:00", end: "18:30" },
      18418: { start: "11:30", end: "18:30" },
    },
    // Artificial space window: Croma is unavailable during setup/reset windows outside the usable block.
    protectedBreaks: [
      { id: "croma-setup", label: "Croma setup", kind: "protected", spaceId: SPACES.croma, start: "08:30", end: "10:00" },
      { id: "croma-reset", label: "Croma reset", kind: "protected", spaceId: SPACES.croma, start: "16:00", end: "18:30" },
    ],
    optimizerMainZoneId: MAIN_ZONE_ID,
    optimizerPrioritizeMainZone: true,
    optimizerGroupBySpaceAndTemplate: true,
    groupingZoneIds: [MAIN_ZONE_ID],
    zoneResourceAssignments: { [MAIN_ZONE_ID]: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: { [SPACES.plato]: { [RESOURCE_TYPES.presenter]: 1, [RESOURCE_TYPES.audio]: 1, [RESOURCE_TYPES.lighting]: 1 } },
    spaceCapacityById: { [SPACES.holding]: 4, [SPACES.makeup]: 2, [SPACES.vocalA]: 1, [SPACES.vocalB]: 1, [SPACES.reality]: 1, [SPACES.pasillo]: 1, [SPACES.croma]: 1, [SPACES.recursos]: 1, [SPACES.totales]: 1, [SPACES.plato]: 1 },
    spaceNameById: { [SPACES.holding]: "Holding", [SPACES.makeup]: "Maquillaje", [SPACES.vocalA]: "Vocal A", [SPACES.vocalB]: "Vocal B", [SPACES.reality]: "Reality", [SPACES.pasillo]: "Pasillo", [SPACES.croma]: "Croma", [SPACES.recursos]: "Recursos", [SPACES.totales]: "Totales", [SPACES.plato]: "Plató principal" },
    planResourceItems: [
      { id: 1, resourceItemId: RESOURCES.cameraA, typeId: RESOURCE_TYPES.camera, typeCode: "camera", name: "Camera A", isAvailable: true },
      { id: 2, resourceItemId: RESOURCES.cameraB, typeId: RESOURCE_TYPES.camera, typeCode: "camera", name: "Camera B", isAvailable: true },
      { id: 3, resourceItemId: RESOURCES.cameraC, typeId: RESOURCE_TYPES.camera, typeCode: "camera", name: "Camera C", isAvailable: true },
      { id: 4, resourceItemId: RESOURCES.coachA, typeId: RESOURCE_TYPES.coach, typeCode: "coach", name: "Vocal Coach A", isAvailable: true },
      { id: 5, resourceItemId: RESOURCES.coachB, typeId: RESOURCE_TYPES.coach, typeCode: "coach", name: "Vocal Coach B", isAvailable: true },
      { id: 6, resourceItemId: RESOURCES.presenter, typeId: RESOURCE_TYPES.presenter, typeCode: "presenter", name: "Presentadora", isAvailable: true },
      { id: 7, resourceItemId: RESOURCES.audioMain, typeId: RESOURCE_TYPES.audio, typeCode: "audio", name: "Audio Plató", isAvailable: true },
      { id: 8, resourceItemId: RESOURCES.floorManager, typeId: RESOURCE_TYPES.producer, typeCode: "floor", name: "Regidor", isAvailable: true },
      { id: 9, resourceItemId: RESOURCES.realityProducer, typeId: RESOURCE_TYPES.producer, typeCode: "reality", name: "Productor Reality", isAvailable: true },
      { id: 10, resourceItemId: RESOURCES.cromaOperator, typeId: RESOURCE_TYPES.producer, typeCode: "croma", name: "Operador Croma", isAvailable: true },
      { id: 11, resourceItemId: RESOURCES.lightingMain, typeId: RESOURCE_TYPES.lighting, typeCode: "lighting", name: "Iluminación Plató", isAvailable: true },
      { id: 12, resourceItemId: RESOURCES.productionRunner, typeId: RESOURCE_TYPES.producer, typeCode: "runner", name: "Auxiliar Recursos", isAvailable: true },
    ],
    coachResourceIds: [RESOURCES.coachA, RESOURCES.coachB],
    taskTemplateNameById: Object.fromEntries(stepsFor(0).map((step, index) => [184000 + index + 1, step.name])),
    resourceItemComponents: {},
  },
};
