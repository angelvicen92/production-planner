import type { EngineV3Input } from "../types";
import type { BenchmarkScenario } from "./types";

const PLAN_ID = 8012;
const MAIN_ZONE_ID = 1;
const AUX_ZONE_ID = 2;

const SPACE = {
  mainStage: 1201,
  vocalA: 1202,
  vocalB: 1203,
  totals1: 1204,
  totals2: 1205,
  realityA: 1206,
  realityB: 1207,
  corridor: 1208,
  instrument: 1209,
  holding: 1210,
} as const;

const RESOURCE_TYPE = {
  coach: 10,
  camera: 12,
  sound: 13,
} as const;

const RESOURCE_ITEM = {
  coachA: 12001,
  coachB: 12002,
  camera1: 12101,
  camera2: 12102,
  camera3: 12103,
  camera4: 12104,
  camera5: 12105,
  sound1: 12201,
  sound2: 12202,
  sound3: 12203,
  sound4: 12204,
} as const;

const PLAN_RESOURCE = {
  coachA: 12501,
  coachB: 12502,
  camera1: 12511,
  camera2: 12512,
  camera3: 12513,
  camera4: 12514,
  camera5: 12515,
  sound1: 12521,
  sound2: 12522,
  sound3: 12523,
  sound4: 12524,
} as const;

const CAMERA_ITEMS = [
  RESOURCE_ITEM.camera1,
  RESOURCE_ITEM.camera2,
  RESOURCE_ITEM.camera3,
  RESOURCE_ITEM.camera4,
  RESOURCE_ITEM.camera5,
];
const SOUND_ITEMS = [RESOURCE_ITEM.sound1, RESOURCE_ITEM.sound2, RESOURCE_ITEM.sound3, RESOURCE_ITEM.sound4];
const SPECIAL_INSTRUMENT_TALENTS = new Set([4, 9, 14, 19]);

const pad = (value: number): string => String(value).padStart(2, "0");
const talentName = (talentId: number): string => `Talent ${pad(talentId)}`;

type TaskDraft = NonNullable<EngineV3Input["tasks"]>[number];

const buildTasks = (): TaskDraft[] => {
  const tasks: TaskDraft[] = [];

  for (let talentId = 1; talentId <= 20; talentId++) {
    const base = 120000 + talentId * 10;
    const name = talentName(talentId);
    const usesCoachA = talentId % 2 === 1;
    const vocalId = base + 1;
    const totalsId = base + 2;
    const mainId = base + 3;
    const realityId = base + 4;
    const corridorId = base + 5;
    const instrumentId = base + 6;
    const totalsBeforeMain = talentId % 3 === 0;
    const realityBeforeMain = talentId % 5 === 0;
    const mainDependencies = [vocalId];

    if (totalsBeforeMain) mainDependencies.push(totalsId);
    if (realityBeforeMain) mainDependencies.push(realityId);
    if (SPECIAL_INSTRUMENT_TALENTS.has(talentId)) mainDependencies.push(instrumentId);

    tasks.push({
      id: vocalId,
      planId: PLAN_ID,
      templateId: 12101,
      templateName: `Vocal ${name}`,
      zoneId: AUX_ZONE_ID,
      spaceId: usesCoachA ? SPACE.vocalA : SPACE.vocalB,
      contestantId: talentId,
      contestantName: name,
      status: "pending",
      durationOverrideMin: talentId % 4 === 0 ? 25 : 20,
      resourceRequirements: {
        byItem: { [usesCoachA ? RESOURCE_ITEM.coachA : RESOURCE_ITEM.coachB]: 1 },
        anyOf: [{ quantity: 1, resourceItemIds: SOUND_ITEMS }],
      },
    });

    tasks.push({
      id: totalsId,
      planId: PLAN_ID,
      templateId: totalsBeforeMain ? 12102 : 12103,
      templateName: `${totalsBeforeMain ? "Totals pre" : "Totals post"} ${name}`,
      zoneId: AUX_ZONE_ID,
      spaceId: talentId % 2 === 1 ? SPACE.totals1 : SPACE.totals2,
      contestantId: talentId,
      contestantName: name,
      status: "pending",
      durationOverrideMin: talentId % 4 === 1 ? 15 : 12,
      dependsOnTaskIds: totalsBeforeMain ? [] : [mainId],
      resourceRequirements: {
        anyOf: [
          { quantity: 1, resourceItemIds: CAMERA_ITEMS },
          { quantity: 1, resourceItemIds: SOUND_ITEMS },
        ],
      },
    });

    tasks.push({
      id: mainId,
      planId: PLAN_ID,
      templateId: 12104,
      templateName: `Main Stage ${name}`,
      zoneId: MAIN_ZONE_ID,
      spaceId: SPACE.mainStage,
      contestantId: talentId,
      contestantName: name,
      status: "pending",
      durationOverrideMin: SPECIAL_INSTRUMENT_TALENTS.has(talentId) ? 30 : 25,
      dependsOnTaskIds: mainDependencies,
      resourceRequirements: {
        anyOf: [
          { quantity: 2, resourceItemIds: CAMERA_ITEMS },
          { quantity: 1, resourceItemIds: SOUND_ITEMS },
        ],
      },
    });

    tasks.push({
      id: realityId,
      planId: PLAN_ID,
      templateId: realityBeforeMain ? 12105 : 12106,
      templateName: `${realityBeforeMain ? "Reality pre" : "Reality post"} ${name}`,
      zoneId: AUX_ZONE_ID,
      spaceId: talentId % 2 === 1 ? SPACE.realityA : SPACE.realityB,
      contestantId: talentId,
      contestantName: name,
      status: "pending",
      durationOverrideMin: talentId % 3 === 0 ? 20 : 15,
      dependsOnTaskIds: realityBeforeMain ? [vocalId] : [mainId],
      resourceRequirements: {
        anyOf: [
          { quantity: 1, resourceItemIds: CAMERA_ITEMS },
          { quantity: 1, resourceItemIds: SOUND_ITEMS },
        ],
      },
    });

    tasks.push({
      id: corridorId,
      planId: PLAN_ID,
      templateId: 12107,
      templateName: `Corridor ${name}`,
      zoneId: AUX_ZONE_ID,
      spaceId: talentId % 4 === 0 ? SPACE.holding : SPACE.corridor,
      contestantId: talentId,
      contestantName: name,
      status: "pending",
      durationOverrideMin: 10,
      resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: CAMERA_ITEMS }] },
    });

    if (SPECIAL_INSTRUMENT_TALENTS.has(talentId)) {
      tasks.push({
        id: instrumentId,
        planId: PLAN_ID,
        templateId: 12108,
        templateName: `Instrument setup ${name}`,
        zoneId: AUX_ZONE_ID,
        spaceId: SPACE.instrument,
        contestantId: talentId,
        contestantName: name,
        status: "pending",
        durationOverrideMin: 20,
        resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: SOUND_ITEMS }] },
      });
    }
  }

  const byId = new Map(tasks.map((task) => [task.id, task]));
  Object.assign(byId.get(120015)!, { status: "done", startPlanned: "08:00", endPlanned: "08:10", assignedResourceIds: [PLAN_RESOURCE.camera1] });
  Object.assign(byId.get(120025)!, { status: "done", spaceId: SPACE.holding, startPlanned: "08:00", endPlanned: "08:10", assignedResourceIds: [PLAN_RESOURCE.camera2] });
  Object.assign(byId.get(120031)!, {
    status: "in_progress",
    startPlanned: "08:00",
    endPlanned: "08:20",
    assignedResourceIds: [PLAN_RESOURCE.coachA, PLAN_RESOURCE.sound1],
  });
  Object.assign(byId.get(120045)!, { startPlanned: "10:30", endPlanned: "10:40" });
  Object.assign(byId.get(120096)!, { startPlanned: "09:00", endPlanned: "09:20" });

  return tasks;
};

const contestantAvailabilityById: NonNullable<EngineV3Input["contestantAvailabilityById"]> = Object.fromEntries(
  Array.from({ length: 20 }, (_, index) => {
    const talentId = index + 1;
    const restrictive: Record<number, { start: string; end: string }> = {
      1: { start: "08:00", end: "11:30" },
      2: { start: "08:00", end: "12:00" },
      3: { start: "08:00", end: "12:30" },
      4: { start: "09:00", end: "13:00" },
      5: { start: "08:30", end: "13:00" },
    };
    return [talentId, restrictive[talentId] ?? { start: "08:00", end: "20:00" }];
  }),
);

export const realisticVoiceDayScenario: BenchmarkScenario = {
  id: "L",
  name: "Jornada audiovisual anonimizada tipo La Voz",
  description: "Jornada determinista y anonimizada con 20 talents, 104 tareas, dos vocal coaches, feeders, dos salas de totales, dos sets reality, plató principal y recursos exclusivos de cámara/sonido.",
  input: {
    planId: PLAN_ID,
    workDay: { start: "08:00", end: "20:00" },
    meal: { start: "19:00", end: "19:45" },
    camerasAvailable: 5,
    contestantMealDurationMinutes: 45,
    contestantMealMaxSimultaneous: 8,
    tasks: buildTasks(),
    locks: [
      { id: 12801, planId: PLAN_ID, taskId: 120045, lockType: "time", lockedStart: "10:30", lockedEnd: "10:40" },
      { id: 12802, planId: PLAN_ID, taskId: 120096, lockType: "time", lockedStart: "09:00", lockedEnd: "09:20" },
    ],
    groupingZoneIds: [MAIN_ZONE_ID],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [
      { id: PLAN_RESOURCE.coachA, resourceItemId: RESOURCE_ITEM.coachA, typeId: RESOURCE_TYPE.coach, name: "Coach A", isAvailable: true },
      { id: PLAN_RESOURCE.coachB, resourceItemId: RESOURCE_ITEM.coachB, typeId: RESOURCE_TYPE.coach, name: "Coach B", isAvailable: true },
      ...CAMERA_ITEMS.map((resourceItemId, index) => ({ id: PLAN_RESOURCE.camera1 + index, resourceItemId, typeId: RESOURCE_TYPE.camera, name: `Camera ${index + 1}`, isAvailable: true })),
      ...SOUND_ITEMS.map((resourceItemId, index) => ({ id: PLAN_RESOURCE.sound1 + index, resourceItemId, typeId: RESOURCE_TYPE.sound, name: `Sound ${index + 1}`, isAvailable: true })),
    ],
    resourceItemComponents: {},
    contestantAvailabilityById,
    optimizerMainZoneId: MAIN_ZONE_ID,
    optimizerPrioritizeMainZone: true,
    optimizerMainZoneOptKeepBusy: true,
    optimizerMainZoneOptFinishEarly: true,
    optimizerMainZonePriorityLevel: 3,
    optimizerGroupingLevel: 2,
    optimizerContestantCompactLevel: 2,
    optimizerContestantStayInZoneLevel: 1,
    optimizerWeights: {
      mainZoneKeepBusy: 12,
      mainZoneFinishEarly: 8,
      contestantCompact: 5,
      groupBySpaceTemplateMatch: 3,
      contestantStayInZone: 2,
    },
    spaceNameById: {
      [SPACE.mainStage]: "Main Stage",
      [SPACE.vocalA]: "Vocal Room A",
      [SPACE.vocalB]: "Vocal Room B",
      [SPACE.totals1]: "Totals Room 1",
      [SPACE.totals2]: "Totals Room 2",
      [SPACE.realityA]: "Reality Set A",
      [SPACE.realityB]: "Reality Set B",
      [SPACE.corridor]: "Corridor",
      [SPACE.instrument]: "Instrument Prep",
      [SPACE.holding]: "Holding Area",
    },
    taskTemplateNameById: {
      12101: "Vocal",
      12102: "Totals pre",
      12103: "Totals post",
      12104: "Main Stage",
      12105: "Reality pre",
      12106: "Reality post",
      12107: "Corridor",
      12108: "Instrument setup",
    },
  },
  operationalExpectation: "Complete o partial son aceptables, pero nunca con violaciones hard ocultas ni movimientos de tareas ejecutadas o locks; el benchmark debe medir compacidad de Main Stage, prioridad de cinco talents restrictivos y continuidad de coaches.",
  riskNotes: [
    "Cinco talents con salida temprana compiten por feeders, cámaras y sonido",
    "Cuatro talents requieren preparación instrumental antes de Main Stage",
    "Totals y Reality alternan feeders pre y tareas post según talent",
    "Dos done, un in_progress y dos locks manuales conviven con la planificación",
    "Comida global hard 19:00-19:45",
  ],
  knownRisk: "El modelo de cámara/sonido usa pools anyOf exclusivos; todavía no representa setups, cambios de configuración ni equipos técnicos compuestos de una producción real.",
};
