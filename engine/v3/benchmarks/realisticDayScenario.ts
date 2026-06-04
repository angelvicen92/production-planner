import type { EngineV3Input } from "../types";
import type { BenchmarkScenario } from "./types";

const PLAN_ID = 8008;
const MAIN_ZONE_ID = 1;
const MAIN_STAGE_SPACE_ID = 101;
const COACH_TYPE_ID = 10;
const AUX_TYPE_ID = 11;

const COACH_A_RESOURCE_ITEM_ID = 9001;
const COACH_B_RESOURCE_ITEM_ID = 9002;
const MIC_KIT_1_RESOURCE_ITEM_ID = 9101;
const MIC_KIT_2_RESOURCE_ITEM_ID = 9102;
const CAMERA_PACK_1_RESOURCE_ITEM_ID = 9201;
const CAMERA_PACK_2_RESOURCE_ITEM_ID = 9202;

const pad = (value: number): string => String(value).padStart(2, "0");
const talentName = (contestantId: number): string => `Talent ${pad(contestantId)}`;

type TaskDraft = NonNullable<EngineV3Input["tasks"]>[number];

const buildTasks = (): TaskDraft[] => {
  const tasks: TaskDraft[] = [];
  const push = (task: TaskDraft) => tasks.push(task);

  for (let contestantId = 1; contestantId <= 16; contestantId++) {
    const base = 90000 + contestantId * 10;
    const coachResourceItemId = contestantId % 2 === 0 ? COACH_B_RESOURCE_ITEM_ID : COACH_A_RESOURCE_ITEM_ID;
    const vocalSpaceId = contestantId % 2 === 0 ? 202 : 201;
    const name = talentName(contestantId);

    push({
      id: base + 1,
      planId: PLAN_ID,
      templateId: 8101,
      templateName: `Coach feeder ${name}`,
      zoneId: 2,
      spaceId: 203,
      contestantId,
      contestantName: name,
      status: "pending",
      durationOverrideMin: 20,
      resourceRequirements: { byItem: { [coachResourceItemId]: 1 } },
    });
    push({
      id: base + 2,
      planId: PLAN_ID,
      templateId: 8102,
      templateName: `Vocal feeder ${name}`,
      zoneId: 2,
      spaceId: vocalSpaceId,
      contestantId,
      contestantName: name,
      status: "pending",
      durationOverrideMin: 20,
      resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [MIC_KIT_1_RESOURCE_ITEM_ID, MIC_KIT_2_RESOURCE_ITEM_ID] }] },
    });
    push({
      id: base + 3,
      planId: PLAN_ID,
      templateId: 8103,
      templateName: `Main take ${name}`,
      zoneId: MAIN_ZONE_ID,
      spaceId: MAIN_STAGE_SPACE_ID,
      contestantId,
      contestantName: name,
      status: "pending",
      durationOverrideMin: 20,
      dependsOnTaskIds: [base + 1, base + 2],
      resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [CAMERA_PACK_1_RESOURCE_ITEM_ID, CAMERA_PACK_2_RESOURCE_ITEM_ID] }] },
    });
    push({
      id: base + 4,
      planId: PLAN_ID,
      templateId: 8104,
      templateName: `Totales ${name}`,
      zoneId: 2,
      spaceId: 204,
      contestantId,
      contestantName: name,
      status: "pending",
      durationOverrideMin: 20,
      dependsOnTaskIds: [base + 3],
    });
    push({
      id: base + 5,
      planId: PLAN_ID,
      templateId: 8105,
      templateName: `Pasillo flexible ${name}`,
      zoneId: 2,
      spaceId: 205,
      contestantId,
      contestantName: name,
      status: "pending",
      durationOverrideMin: 15,
    });
  }

  const byId = new Map(tasks.map((task) => [task.id, task]));
  Object.assign(byId.get(90015)!, {
    status: "done",
    startPlanned: "09:00",
    endPlanned: "09:15",
    assignedResourceIds: [],
  });
  Object.assign(byId.get(90022)!, {
    status: "in_progress",
    startPlanned: "09:15",
    endPlanned: "09:35",
    assignedResourceIds: [501],
  });
  Object.assign(byId.get(90045)!, {
    startPlanned: "11:00",
    endPlanned: "11:15",
  });

  return tasks;
};

const contestantAvailabilityById: NonNullable<EngineV3Input["contestantAvailabilityById"]> = Object.fromEntries(
  Array.from({ length: 16 }, (_, index) => {
    const contestantId = index + 1;
    const defaultWindow = { start: "09:00", end: "18:00" };
    const restrictive: Record<number, { start: string; end: string }> = {
      1: { start: "09:00", end: "11:00" },
      2: { start: "09:15", end: "12:00" },
    };
    return [contestantId, restrictive[contestantId] ?? defaultWindow];
  }),
);

export const realisticDayScenario: BenchmarkScenario = {
  id: "I",
  name: "Jornada sintética realista",
  description: "Jornada audiovisual determinista de escala intermedia con 16 talents, 80 tareas, coaches, feeders, plató principal, comida, locks y ejecución en curso.",
  input: {
    planId: PLAN_ID,
    workDay: { start: "09:00", end: "18:00" },
    meal: { start: "17:00", end: "17:30" },
    camerasAvailable: 2,
    contestantMealDurationMinutes: 30,
    contestantMealMaxSimultaneous: 6,
    tasks: buildTasks(),
    locks: [{ id: 98001, planId: PLAN_ID, taskId: 90045, lockType: "time", lockedStart: "11:00", lockedEnd: "11:15" }],
    groupingZoneIds: [MAIN_ZONE_ID],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [
      { id: 501, resourceItemId: COACH_A_RESOURCE_ITEM_ID, typeId: COACH_TYPE_ID, name: "Coach A", isAvailable: true },
      { id: 502, resourceItemId: COACH_B_RESOURCE_ITEM_ID, typeId: COACH_TYPE_ID, name: "Coach B", isAvailable: true },
      { id: 503, resourceItemId: MIC_KIT_1_RESOURCE_ITEM_ID, typeId: AUX_TYPE_ID, name: "Mic Kit 1", isAvailable: true },
      { id: 504, resourceItemId: MIC_KIT_2_RESOURCE_ITEM_ID, typeId: AUX_TYPE_ID, name: "Mic Kit 2", isAvailable: true },
      { id: 505, resourceItemId: CAMERA_PACK_1_RESOURCE_ITEM_ID, typeId: AUX_TYPE_ID, name: "Camera Pack 1", isAvailable: true },
      { id: 506, resourceItemId: CAMERA_PACK_2_RESOURCE_ITEM_ID, typeId: AUX_TYPE_ID, name: "Camera Pack 2", isAvailable: true },
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
      [MAIN_STAGE_SPACE_ID]: "Plató Principal",
      201: "Sala Vocal A",
      202: "Sala Vocal B",
      203: "Sala Coaching",
      204: "Sala Totales",
      205: "Pasillo",
    },
    taskTemplateNameById: {
      8101: "Coach feeder",
      8102: "Vocal feeder",
      8103: "Main take",
      8104: "Totales",
      8105: "Pasillo flexible",
    },
  },
  operationalExpectation: "Medir escala intermedia sin exigir optimización perfecta: complete o partial son aceptables si no hay violaciones hard ni movimientos de locks/ejecución.",
  riskNotes: [
    "Talents restrictivos con salida temprana o llegada tardía",
    "Feeders con coach y vocal antes del plató principal",
    "Tareas flexibles de pasillo pueden competir con tareas restrictivas",
    "Locks, done e in_progress conviven con planificación pendiente",
    "Comida global hard 17:00-17:30",
  ],
  knownRisk: "Escenario de stress: si queda partial, documenta límite operativo actual antes de CP-SAT global.",
};
