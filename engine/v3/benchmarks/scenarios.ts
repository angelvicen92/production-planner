import type { BenchmarkScenario } from "./types";
import type { EngineV3Input } from "../types";
import { realisticDayScenario } from "./realisticDayScenario";
import { realisticVoiceDayScenario } from "./realisticVoiceDayScenario";

const PLAN_ID = 4004;
const MAIN_ZONE_ID = 1;
const MAIN_STAGE_SPACE_ID = 101;
const COACH_TYPE_ID = 10;
const COACH_ALPHA_PLAN_RESOURCE_ID = 501;
const COACH_BETA_PLAN_RESOURCE_ID = 502;

const baseInput = (tasks: any[], overrides: Partial<EngineV3Input> = {}): EngineV3Input => ({
  planId: PLAN_ID,
  workDay: { start: "09:00", end: "13:00" },
  meal: { start: "12:00", end: "12:30" },
  camerasAvailable: 2,
  contestantMealDurationMinutes: 30,
  contestantMealMaxSimultaneous: 4,
  tasks: tasks as any,
  locks: [],
  groupingZoneIds: [MAIN_ZONE_ID],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [],
  resourceItemComponents: {},
  optimizerMainZoneId: MAIN_ZONE_ID,
  optimizerPrioritizeMainZone: true,
  optimizerMainZoneOptKeepBusy: true,
  optimizerMainZoneOptFinishEarly: true,
  optimizerMainZonePriorityLevel: 2,
  optimizerGroupingLevel: 1,
  optimizerContestantCompactLevel: 2,
  optimizerContestantStayInZoneLevel: 1,
  optimizerWeights: {
    mainZoneKeepBusy: 10,
    mainZoneFinishEarly: 6,
    contestantCompact: 4,
    groupBySpaceTemplateMatch: 3,
    contestantStayInZone: 2,
  },
  spaceNameById: {
    [MAIN_STAGE_SPACE_ID]: "Plató principal",
    102: "Plató auxiliar",
    201: "Sala coach",
    202: "Sala entrevista",
  },
  taskTemplateNameById: {},
  ...overrides,
});

const scenarioPTasks = Array.from({ length: 16 }, (_, index) => {
  const talentId = 201 + index;
  const feederId = 16000 + index * 2;
  const mainId = feederId + 1;
  return [
    { id: feederId, planId: PLAN_ID, templateId: 2600 + index * 2, templateName: `Feeder P ${index + 1}`, zoneId: 2, spaceId: 300 + index, contestantId: talentId, contestantName: `Talent P ${index + 1}`, status: "pending", durationOverrideMin: 20 },
    { id: mainId, planId: PLAN_ID, templateId: 2601 + index * 2, templateName: `Main Stage P ${index + 1}`, zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: talentId, contestantName: `Talent P ${index + 1}`, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [feederId] },
  ];
}).flat();

const scenarioPSeedTasks = Array.from({ length: 16 }, (_, index) => {
  const feederId = 16000 + index * 2;
  const mainId = feederId + 1;
  const feederStart = 8 * 60 + 30;
  const mainStart = 9 * 60 + index * 30 + (index === 15 ? 10 : 0);
  return [
    { taskId: feederId, startPlanned: `${String(Math.floor(feederStart / 60)).padStart(2, "0")}:${String(feederStart % 60).padStart(2, "0")}`, endPlanned: "08:50" },
    { taskId: mainId, startPlanned: `${String(Math.floor(mainStart / 60)).padStart(2, "0")}:${String(mainStart % 60).padStart(2, "0")}`, endPlanned: `${String(Math.floor((mainStart + 30) / 60)).padStart(2, "0")}:${String((mainStart + 30) % 60).padStart(2, "0")}` },
  ];
}).flat();

export const benchmarkScenarios: BenchmarkScenario[] = [
  {
    id: "A",
    name: "Talent con salida temprana",
    description: "Tres concursantes compiten por plató principal y espacios auxiliares; uno solo está disponible hasta las 10:00.",
    input: baseInput([
      { id: 1001, planId: PLAN_ID, templateId: 1101, templateName: "Ensayo flexible main", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 1, contestantName: "Talent flexible 1", status: "pending", durationOverrideMin: 30 },
      { id: 1002, planId: PLAN_ID, templateId: 1102, templateName: "Grabación crítica salida temprana", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 2, contestantName: "Talent salida temprana", status: "pending", durationOverrideMin: 30 },
      { id: 1003, planId: PLAN_ID, templateId: 1103, templateName: "Coach salida temprana", zoneId: 2, spaceId: 201, contestantId: 2, contestantName: "Talent salida temprana", status: "pending", durationOverrideMin: 30 },
      { id: 1004, planId: PLAN_ID, templateId: 1104, templateName: "Entrevista flexible", zoneId: 2, spaceId: 202, contestantId: 3, contestantName: "Talent flexible 2", status: "pending", durationOverrideMin: 45 },
    ], {
      contestantAvailabilityById: {
        1: { start: "09:00", end: "13:00" },
        2: { start: "09:00", end: "10:00" },
        3: { start: "09:00", end: "13:00" },
      },
    }),
    operationalExpectation: "Si el motor encuentra solución, las tareas del talent con salida temprana deben quedar dentro de 09:00-10:00 y medirse su colocación temprana sin exigir hora exacta.",
    riskNotes: ["Disponibilidad restrictiva de concursante", "Competencia entre plató principal y sala auxiliar"],
  },
  {
    id: "B",
    name: "Falso negativo greedy potencial",
    description: "Una tarea flexible de mismo espacio puede ocupar el primer hueco y bloquear una tarea más restrictiva si el orden greedy no prioriza correctamente.",
    input: baseInput([
      { id: 2001, planId: PLAN_ID, templateId: 1201, templateName: "Flexible largo", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 11, contestantName: "Talent flexible", status: "pending", durationOverrideMin: 30 },
      { id: 2002, planId: PLAN_ID, templateId: 1202, templateName: "Restrictivo corto", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 12, contestantName: "Talent restrictivo", status: "pending", durationOverrideMin: 30 },
      { id: 2003, planId: PLAN_ID, templateId: 1203, templateName: "Feeder flexible", zoneId: 2, spaceId: 202, contestantId: 13, contestantName: "Talent feeder", status: "pending", durationOverrideMin: 30 },
    ], {
      workDay: { start: "09:00", end: "10:30" },
      contestantAvailabilityById: {
        11: { start: "09:00", end: "10:30" },
        12: { start: "09:00", end: "09:30" },
        13: { start: "09:00", end: "10:30" },
      },
    }),
    operationalExpectation: "Caracterizar si el motor actual encuentra la solución alternativa; si no, reportarlo como riesgo conocido sin romper CI.",
    riskNotes: ["Phase A es greedy y no hace backtracking exhaustivo", "CP-SAT parcial depende de la solución previa o parcial"],
    knownRisk: "Puede registrar falso negativo operativo en variantes más compuestas aunque este microescenario pueda estar mitigado por scoring de ventanas.",
  },
  {
    id: "C",
    name: "Plató principal sin huecos",
    description: "Cadena de feeders y tareas candidatas a plató principal con una ventana restrictiva para medir huecos, no para convertirlos en hard.",
    input: baseInput([
      { id: 3001, planId: PLAN_ID, templateId: 1301, templateName: "Feeder T1", zoneId: 2, spaceId: 202, contestantId: 21, contestantName: "T1", status: "pending", durationOverrideMin: 20 },
      { id: 3002, planId: PLAN_ID, templateId: 1302, templateName: "Main T1", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 21, contestantName: "T1", status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [3001] },
      { id: 3003, planId: PLAN_ID, templateId: 1302, templateName: "Main T2 ventana", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 22, contestantName: "T2", status: "pending", durationOverrideMin: 30 },
      { id: 3004, planId: PLAN_ID, templateId: 1303, templateName: "Main T3", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 23, contestantName: "T3", status: "pending", durationOverrideMin: 30 },
      { id: 3005, planId: PLAN_ID, templateId: 1304, templateName: "Feeder T3", zoneId: 2, spaceId: 201, contestantId: 23, contestantName: "T3", status: "pending", durationOverrideMin: 20, dependsOnTaskIds: [3004] },
    ], {
      contestantAvailabilityById: {
        21: { start: "09:00", end: "13:00" },
        22: { start: "09:30", end: "10:30" },
        23: { start: "09:00", end: "13:00" },
      },
    }),
    operationalExpectation: "Medir número de huecos y minutos sin exigir continuidad global matemática.",
    riskNotes: ["Continuidad de plató principal tratada como heurística", "Dependencias pueden crear huecos inevitables o reparables"],
  },
  {
    id: "D",
    name: "Coaches encadenados",
    description: "Dos coaches exclusivos atienden a varios talentos y se encadenan con tareas de plató principal.",
    input: baseInput([
      { id: 4001, planId: PLAN_ID, templateId: 1401, templateName: "Coach Alpha restrictivo", zoneId: 2, spaceId: 201, contestantId: 31, contestantName: "Talent restrictivo coach", status: "pending", durationOverrideMin: 30, resourceRequirements: { byItem: { 9001: 1 } } },
      { id: 4002, planId: PLAN_ID, templateId: 1402, templateName: "Main restrictivo", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 31, contestantName: "Talent restrictivo coach", status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [4001] },
      { id: 4003, planId: PLAN_ID, templateId: 1401, templateName: "Coach Beta", zoneId: 2, spaceId: 201, contestantId: 32, contestantName: "Talent beta", status: "pending", durationOverrideMin: 30, resourceRequirements: { byItem: { 9002: 1 } } },
      { id: 4004, planId: PLAN_ID, templateId: 1402, templateName: "Main beta", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 32, contestantName: "Talent beta", status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [4003] },
      { id: 4005, planId: PLAN_ID, templateId: 1403, templateName: "Coach Alpha flexible", zoneId: 2, spaceId: 202, contestantId: 33, contestantName: "Talent alpha flexible", status: "pending", durationOverrideMin: 30, resourceRequirements: { byItem: { 9001: 1 } } },
    ], {
      planResourceItems: [
        { id: COACH_ALPHA_PLAN_RESOURCE_ID, resourceItemId: 9001, typeId: COACH_TYPE_ID, name: "Coach Alpha", isAvailable: true },
        { id: COACH_BETA_PLAN_RESOURCE_ID, resourceItemId: 9002, typeId: COACH_TYPE_ID, name: "Coach Beta", isAvailable: true },
      ],
      contestantAvailabilityById: {
        31: { start: "09:00", end: "10:30" },
        32: { start: "09:00", end: "13:00" },
        33: { start: "09:00", end: "13:00" },
      },
    }),
    operationalExpectation: "Medir cambios de coach y si el coach del talent restrictivo se activa pronto, sin imponer optimización perfecta.",
    riskNotes: ["Recursos exclusivos tipo coach", "La activación temprana depende de scoring heurístico"],
  },
  {
    id: "E",
    name: "Locks y ejecución intocable",
    description: "Combina una tarea done, una in_progress, un lock manual de tiempo y pendientes que pueden moverse alrededor.",
    input: baseInput([
      { id: 5001, planId: PLAN_ID, templateId: 1501, templateName: "Ya emitida", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 41, contestantName: "Done", status: "done", durationOverrideMin: 30, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [] },
      { id: 5002, planId: PLAN_ID, templateId: 1502, templateName: "En curso", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 42, contestantName: "In progress", status: "in_progress", durationOverrideMin: 30, startPlanned: "09:30", endPlanned: "10:00", assignedResourceIds: [] },
      { id: 5003, planId: PLAN_ID, templateId: 1503, templateName: "Lock manual", zoneId: 2, spaceId: 202, contestantId: 43, contestantName: "Locked", status: "pending", durationOverrideMin: 30, startPlanned: "10:00", endPlanned: "10:30" },
      { id: 5004, planId: PLAN_ID, templateId: 1504, templateName: "Pending main", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 44, contestantName: "Pending 1", status: "pending", durationOverrideMin: 30 },
      { id: 5005, planId: PLAN_ID, templateId: 1505, templateName: "Pending aux", zoneId: 2, spaceId: 202, contestantId: 45, contestantName: "Pending 2", status: "pending", durationOverrideMin: 30 },
    ], {
      locks: [{ id: 9501, planId: PLAN_ID, taskId: 5003, lockType: "time", lockedStart: "10:00", lockedEnd: "10:30" }],
    }),
    operationalExpectation: "done e in_progress no cambian, el lock se respeta y solo las pending no bloqueadas pueden planificarse alrededor.",
    riskNotes: ["Locks y ejecución son invariantes hard de producto"],
  },
  {
    id: "F",
    name: "Comida / bloque global",
    description: "Tareas antes y después de una comida global 10:30-11:00 con disponibilidad restrictiva de concursante.",
    input: baseInput([
      { id: 6001, planId: PLAN_ID, templateId: 1601, templateName: "Main antes comida", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 51, contestantName: "Pre comida", status: "pending", durationOverrideMin: 60 },
      { id: 6002, planId: PLAN_ID, templateId: 1602, templateName: "Aux restrictivo", zoneId: 2, spaceId: 202, contestantId: 52, contestantName: "Restrictivo comida", status: "pending", durationOverrideMin: 30 },
      { id: 6003, planId: PLAN_ID, templateId: 1603, templateName: "Main después comida", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 53, contestantName: "Post comida", status: "pending", durationOverrideMin: 45 },
    ], {
      workDay: { start: "09:00", end: "12:30" },
      meal: { start: "10:30", end: "11:00" },
      contestantAvailabilityById: {
        51: { start: "09:00", end: "10:30" },
        52: { start: "09:00", end: "10:30" },
        53: { start: "11:00", end: "12:30" },
      },
    }),
    operationalExpectation: "Ninguna tarea debe cruzar comida si el modelo actual la trata como hard; el benchmark lo reporta como bloque global del input.",
    riskNotes: ["La comida global se modela mediante input.meal y el motor debe evitar cruces"],
  },
  {
    id: "G",
    name: "Backtracking activa y recupera solución",
    description: "Una decisión greedy temprana ocupa el plató principal con una tarea flexible y deja fuera a un talent con salida temprana; el backtracking retrasa el blocker flexible.",
    input: baseInput([
      { id: 7001, planId: PLAN_ID, templateId: 1701, templateName: "Rehearsal flexible main", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 61, contestantName: "Talent flexible", status: "pending", durationOverrideMin: 60 },
      { id: 7002, planId: PLAN_ID, templateId: 1702, templateName: "Main restrictivo salida temprana", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 62, contestantName: "Talent salida temprana", status: "pending", durationOverrideMin: 60 },
    ], {
      workDay: { start: "09:00", end: "11:00" },
      contestantAvailabilityById: {
        61: { start: "09:00", end: "11:00" },
        62: { start: "09:00", end: "10:00" },
      },
      // Probe determinista del falso negativo greedy: fuerza la primera pasada a tomar
      // primero la tarea flexible; el backtracking debe derivar el blocker estructurado
      // y recuperar la solución operativa sin relajar hard constraints.
      v3GreedyProbeForcedTaskStarts: { 7002: 10 * 60 } as any,
    } as any),
    operationalExpectation: "El greedy inicial deja fuera la tarea restrictiva, el backtracking retrasa el rehearsal flexible a las 10:00 y completa el plan.",
    riskNotes: ["Backtracking limitado", "Disponibilidad restrictiva de talent", "Espacio principal bloqueado por tarea flexible"],
  },

  {
    id: "H",
    name: "Elegir mejor entre dos soluciones válidas",
    description: "El greedy forzado entrega un plan válido pero con hueco evitable en plató principal; la búsqueda comparativa evalúa una alternativa compacta y la selecciona.",
    input: baseInput([
      { id: 8001, planId: PLAN_ID, templateId: 1801, templateName: "Main apertura", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 71, contestantName: "Talent apertura", status: "pending", durationOverrideMin: 30 },
      { id: 8002, planId: PLAN_ID, templateId: 1802, templateName: "Main compactable", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 72, contestantName: "Talent compactable", status: "pending", durationOverrideMin: 30 },
      { id: 8003, planId: PLAN_ID, templateId: 1803, templateName: "Aux paralelo", zoneId: 2, spaceId: 202, contestantId: 73, contestantName: "Talent aux", status: "pending", durationOverrideMin: 30 },
    ], {
      workDay: { start: "09:00", end: "11:00" },
      contestantAvailabilityById: {
        71: { start: "09:00", end: "11:00" },
        72: { start: "09:00", end: "11:00" },
        73: { start: "09:00", end: "11:00" },
      },
      optimizerWeights: {},
      v3GreedyProbeForcedTaskStarts: { 8002: 10 * 60 } as any,
    } as any),
    operationalExpectation: "Greedy es completo, pero la alternativa backtracking reduce el hueco del plató principal sin violar hard constraints.",
    riskNotes: ["Selección comparativa entre ramas válidas", "Compacidad de plató principal como criterio operativo no hard"],
  },

  {
    id: "J",
    name: "Talent restrictivo y continuidad de coach",
    description: "Escenario compacto con cinco talents, dos coaches, feeders previos al plató principal y una salida temprana que debe priorizarse sin convertir preferencias en hard.",
    input: baseInput([
      { id: 9001, planId: PLAN_ID, templateId: 1901, templateName: "Coach Alpha restrictivo", zoneId: 2, spaceId: 201, contestantId: 81, contestantName: "Talent salida temprana", status: "pending", durationOverrideMin: 25, resourceRequirements: { byItem: { 9001: 1 } } },
      { id: 9002, planId: PLAN_ID, templateId: 1902, templateName: "Main restrictivo", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 81, contestantName: "Talent salida temprana", status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [9001] },
      { id: 9003, planId: PLAN_ID, templateId: 1901, templateName: "Coach Alpha feeder 2", zoneId: 2, spaceId: 201, contestantId: 82, contestantName: "Talent Alpha 2", status: "pending", durationOverrideMin: 25, resourceRequirements: { byItem: { 9001: 1 } } },
      { id: 9004, planId: PLAN_ID, templateId: 1902, templateName: "Main Alpha 2", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 82, contestantName: "Talent Alpha 2", status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [9003] },
      { id: 9005, planId: PLAN_ID, templateId: 1903, templateName: "Coach Beta feeder", zoneId: 2, spaceId: 202, contestantId: 83, contestantName: "Talent Beta", status: "pending", durationOverrideMin: 25, resourceRequirements: { byItem: { 9002: 1 } } },
      { id: 9006, planId: PLAN_ID, templateId: 1902, templateName: "Main Beta", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 83, contestantName: "Talent Beta", status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [9005] },
      { id: 9007, planId: PLAN_ID, templateId: 1901, templateName: "Coach Alpha feeder 3", zoneId: 2, spaceId: 201, contestantId: 84, contestantName: "Talent Alpha 3", status: "pending", durationOverrideMin: 25, resourceRequirements: { byItem: { 9001: 1 } } },
      { id: 9008, planId: PLAN_ID, templateId: 1902, templateName: "Main Alpha 3", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 84, contestantName: "Talent Alpha 3", status: "pending", durationOverrideMin: 30 },
      { id: 9009, planId: PLAN_ID, templateId: 1904, templateName: "Flexible entrevista", zoneId: 2, spaceId: 202, contestantId: 85, contestantName: "Talent flexible", status: "pending", durationOverrideMin: 30 },
    ], {
      workDay: { start: "09:00", end: "12:00" },
      meal: { start: "12:30", end: "13:00" },
      planResourceItems: [
        { id: COACH_ALPHA_PLAN_RESOURCE_ID, resourceItemId: 9001, typeId: COACH_TYPE_ID, name: "Coach Alpha", isAvailable: true },
        { id: COACH_BETA_PLAN_RESOURCE_ID, resourceItemId: 9002, typeId: COACH_TYPE_ID, name: "Coach Beta", isAvailable: true },
      ],
      contestantAvailabilityById: {
        81: { start: "09:00", end: "10:05" },
        82: { start: "09:00", end: "12:00" },
        83: { start: "09:00", end: "12:00" },
        84: { start: "09:00", end: "12:00" },
        85: { start: "09:00", end: "12:00" },
      },
      optimizerWeights: {
        mainZoneKeepBusy: 8,
        mainZoneFinishEarly: 4,
        contestantCompact: 3,
        groupBySpaceTemplateMatch: 2,
        contestantStayInZone: 1,
      },
    }),
    operationalExpectation: "El feeder y main del talent con salida temprana deben completarse dentro de su ventana; los feeders de Coach Alpha ofrecen una oportunidad de continuidad medible frente a alternancias A/B/A.",
    riskNotes: ["Urgencia restrictiva soft", "Continuidad de coach/feeders soft", "Dependencias hacia plató principal detectables por dependsOnTaskIds"],
  },

  {
    id: "K",
    name: "Vecindario mejora plan completo",
    description: "Greedy completo pero forzado a dejar tarde a un talent restrictivo; el vecindario operativo intercambia slots compatibles y mejora el timing sin aumentar huecos de plató ni violar hard constraints.",
    input: baseInput([
      { id: 10001, planId: PLAN_ID, templateId: 2001, templateName: "Aux flexible temprano", zoneId: 2, spaceId: 201, contestantId: 91, contestantName: "Talent flexible", status: "pending", durationOverrideMin: 30 },
      { id: 10002, planId: PLAN_ID, templateId: 2002, templateName: "Aux restrictivo compactable", zoneId: 2, spaceId: 202, contestantId: 92, contestantName: "Talent salida temprana", status: "pending", durationOverrideMin: 30 },
      { id: 10003, planId: PLAN_ID, templateId: 2003, templateName: "Main continuo 1", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 93, contestantName: "Talent main 1", status: "pending", durationOverrideMin: 30 },
      { id: 10004, planId: PLAN_ID, templateId: 2004, templateName: "Main continuo 2", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 94, contestantName: "Talent main 2", status: "pending", durationOverrideMin: 30 },
    ], {
      workDay: { start: "09:00", end: "11:00" },
      contestantAvailabilityById: {
        91: { start: "09:00", end: "11:00" },
        92: { start: "09:00", end: "10:00" },
        93: { start: "09:00", end: "11:00" },
        94: { start: "09:00", end: "11:00" },
      },
      enableLimitedBacktracking: false,
      v3GreedyProbeForcedTaskStarts: { 10002: 9 * 60 + 30 } as any,
    } as any),
    operationalExpectation: "El vecindario advance_restrictive_talent debe adelantar el talent de salida temprana, mantener mainStageGapMinutes en 0 y conservar hardConstraintViolations en 0.",
    riskNotes: ["Vecindario determinista acotado", "No reemplaza solver global", "Backtracking desactivado en el escenario para aislar la mejora del vecindario"],
  },
  {
    id: "M",
    name: "Feeder-aware neighborhood improves Main Stage",
    description: "Microescenario con un hueco pequeño en Main Stage y un feeder tardío de un talent semi-restrictivo que puede adelantarse de forma segura.",
    input: baseInput([
      { id: 13001, planId: PLAN_ID, templateId: 2301, templateName: "Main Stage apertura", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 131, contestantName: "Talent apertura", status: "pending", durationOverrideMin: 30 },
      { id: 13002, planId: PLAN_ID, templateId: 2302, templateName: "Vocal feeder restrictivo", zoneId: 2, spaceId: 201, contestantId: 132, contestantName: "Talent semi-restrictivo", status: "pending", durationOverrideMin: 20 },
      { id: 13003, planId: PLAN_ID, templateId: 2303, templateName: "Main Stage restrictivo", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 132, contestantName: "Talent semi-restrictivo", status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [13002] },
    ], {
      workDay: { start: "09:00", end: "11:30" },
      meal: { start: "12:00", end: "12:30" },
      contestantAvailabilityById: {
        131: { start: "09:00", end: "11:30" },
        132: { start: "09:00", end: "10:45" },
      },
      enableLimitedBacktracking: false,
      v3GreedyProbeForcedTaskStarts: { 13001: 9 * 60, 13002: 9 * 60 + 30 } as any,
    } as any),
    operationalExpectation: "La búsqueda feeder-aware debe generar alternativas válidas y aceptar una que reduzca el hueco de Main Stage o adelante al talent semi-restrictivo, sin violaciones hard.",
    riskNotes: ["Caso determinista aislado", "Demuestra mejora feeder-aware aceptada", "No exige búsqueda global ni combinación exhaustiva de movimientos"],
  },
  {
    id: "N",
    name: "Feeder advance + Main Stage gap fill encadenado",
    description: "Microescenario aislado con un feeder tardío que bloquea el inicio del Main Stage hasta que se encadenan dos vecindarios.",
    input: baseInput([
      { id: 14001, planId: PLAN_ID, templateId: 2401, templateName: "Main Stage apertura", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 141, contestantName: "Talent apertura N", status: "pending", durationOverrideMin: 30 },
      { id: 14002, planId: PLAN_ID, templateId: 2402, templateName: "Feeder auxiliar temprano", zoneId: 2, spaceId: 201, contestantId: 142, contestantName: "Talent auxiliar N", status: "pending", durationOverrideMin: 20 },
      { id: 14003, planId: PLAN_ID, templateId: 2403, templateName: "Main Stage auxiliar ejecutado", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 142, contestantName: "Talent auxiliar N", status: "done", durationOverrideMin: 30, startPlanned: "11:00", endPlanned: "11:30", dependsOnTaskIds: [14002] },
      { id: 14004, planId: PLAN_ID, templateId: 2404, templateName: "Feeder objetivo tardío", zoneId: 2, spaceId: 201, contestantId: 143, contestantName: "Talent objetivo N", status: "pending", durationOverrideMin: 20 },
      { id: 14005, planId: PLAN_ID, templateId: 2405, templateName: "Main Stage objetivo", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 143, contestantName: "Talent objetivo N", status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [14004] },
    ], {
      workDay: { start: "09:00", end: "12:00" },
      meal: { start: "12:00", end: "12:30" },
      contestantAvailabilityById: {
        141: { start: "09:00", end: "12:00" },
        142: { start: "09:00", end: "12:00" },
        143: { start: "09:00", end: "11:00" },
      },
      enableLimitedBacktracking: false,
    } as any),
    neighborhoodSeedOutput: {
      feasible: true,
      complete: true,
      hardFeasible: true,
      plannedTasks: [
        { taskId: 14001, startPlanned: "09:00", endPlanned: "09:30" },
        { taskId: 14002, startPlanned: "09:00", endPlanned: "09:20" },
        { taskId: 14004, startPlanned: "09:20", endPlanned: "09:40" },
        { taskId: 14005, startPlanned: "09:40", endPlanned: "10:10" },
      ],
      unplanned: [],
      warnings: [],
    },
    operationalExpectation: "Feeder advance aislado mantiene el hueco; la cadena feeder_advance -> main_stage_gap_fill lo elimina sin hard violations.",
    riskNotes: ["Seed completo y determinista para aislar la búsqueda local depth 2", "No sustituye el benchmark end-to-end de L", "Sin aleatoriedad ni búsqueda global"],
  },
  {
    id: "O",
    name: "CP-SAT pilot mejora Main Stage + feeders",
    description: "Subproblema acotado con tres actuaciones, dos feeders directos, un talent restrictivo y dos coaches; el warm start es válido pero deja un hueco evitable.",
    input: baseInput([
      { id: 15001, planId: PLAN_ID, templateId: 2501, templateName: "Main Stage apertura O", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 151, contestantName: "Talent apertura O", status: "pending", durationOverrideMin: 30 },
      { id: 15002, planId: PLAN_ID, templateId: 2502, templateName: "Feeder Coach Alpha O", zoneId: 2, spaceId: 201, contestantId: 152, contestantName: "Talent restrictivo O", status: "pending", durationOverrideMin: 20 },
      { id: 15003, planId: PLAN_ID, templateId: 2503, templateName: "Main Stage restrictivo O", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 152, contestantName: "Talent restrictivo O", status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [15002] },
      { id: 15004, planId: PLAN_ID, templateId: 2504, templateName: "Feeder Coach Beta O", zoneId: 2, spaceId: 202, contestantId: 153, contestantName: "Talent cierre O", status: "pending", durationOverrideMin: 20 },
      { id: 15005, planId: PLAN_ID, templateId: 2505, templateName: "Main Stage cierre O", zoneId: MAIN_ZONE_ID, spaceId: MAIN_STAGE_SPACE_ID, contestantId: 153, contestantName: "Talent cierre O", status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [15004] },
    ], {
      workDay: { start: "09:00", end: "11:30" },
      meal: { start: "12:00", end: "12:30" },
      contestantAvailabilityById: {
        151: { start: "09:00", end: "11:30" },
        152: { start: "09:00", end: "10:30" },
        153: { start: "09:00", end: "11:30" },
      },
      planResourceItems: [
        { id: COACH_ALPHA_PLAN_RESOURCE_ID, resourceItemId: 9001, typeId: COACH_TYPE_ID, name: "Coach Alpha", isAvailable: true },
        { id: COACH_BETA_PLAN_RESOURCE_ID, resourceItemId: 9002, typeId: COACH_TYPE_ID, name: "Coach Beta", isAvailable: true },
      ],
      enableLimitedBacktracking: false,
      enableOperationalNeighborhoods: false,
    } as any),
    cpSatPilotSeedOutput: {
      feasible: true,
      complete: true,
      hardFeasible: true,
      plannedTasks: [
        { taskId: 15001, startPlanned: "09:00", endPlanned: "09:30" },
        { taskId: 15002, startPlanned: "09:20", endPlanned: "09:40", assignedResources: [COACH_ALPHA_PLAN_RESOURCE_ID] },
        { taskId: 15003, startPlanned: "09:50", endPlanned: "10:20" },
        { taskId: 15004, startPlanned: "09:00", endPlanned: "09:20", assignedResources: [COACH_BETA_PLAN_RESOURCE_ID] },
        { taskId: 15005, startPlanned: "10:20", endPlanned: "10:50" },
      ],
      unplanned: [],
      warnings: [],
    },
    operationalExpectation: "El piloto CP-SAT debe compactar Main Stage, conservar feeders antes de sus actuaciones y ser seleccionado por el comparador común sin violaciones hard.",
    riskNotes: ["Piloto limitado a cinco tareas", "Dos coaches modelados como recursos exclusivos", "Warm start válido deliberadamente subóptimo"],
  },
  {
    id: "P",
    name: "CP-SAT segment mejora hueco local en Main Stage",
    description: "El scope completo Main Stage + feeders contiene 32 tareas y excede el piloto global, pero un segmento local de hueco permanece por debajo de 18 y puede compactarse.",
    input: baseInput(scenarioPTasks, {
      workDay: { start: "08:30", end: "18:00" },
      meal: { start: "18:00", end: "18:30" },
      contestantAvailabilityById: Object.fromEntries(Array.from({ length: 16 }, (_, index) => [201 + index, { start: "08:30", end: index === 15 ? "17:30" : "18:00" }])),
      enableLimitedBacktracking: false,
      enableOperationalNeighborhoods: false,
      spaceNameById: { [MAIN_STAGE_SPACE_ID]: "Plató principal P", ...Object.fromEntries(Array.from({ length: 16 }, (_, index) => [300 + index, `Feeder P ${index + 1}`])) },
    } as any),
    cpSatPilotSeedOutput: { feasible: true, complete: true, hardFeasible: true, plannedTasks: scenarioPSeedTasks, unplanned: [], warnings: [] },
    operationalExpectation: "La selección global queda fuera de límite, se intenta al menos un gap segment y el candidato aceptado elimina el hueco local sin violaciones hard.",
    riskNotes: ["Scope global simulado con 32 tareas", "Segmentos limitados a 18 tareas", "Warm start determinista con hueco local de 10 minutos"],
  },
  {
    id: "Q",
    name: "Diagnóstico de recurso compuesto",
    description: "Dos combinaciones cámara/sonido recurrentes y una alternancia cruzada concurrente permiten diagnosticar bundles operativos sin convertirlos en constraints.",
    input: baseInput([
      { id: 17001, planId: PLAN_ID, templateId: 2701, templateName: "Reality bundle A1", zoneId: 2, spaceId: 401, contestantId: 301, status: "pending", durationOverrideMin: 20, resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [17101, 17102] }, { quantity: 1, resourceItemIds: [17201, 17202] }] } },
      { id: 17002, planId: PLAN_ID, templateId: 2701, templateName: "Reality bundle B1", zoneId: 2, spaceId: 402, contestantId: 302, status: "pending", durationOverrideMin: 20, resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [17101, 17102] }, { quantity: 1, resourceItemIds: [17201, 17202] }] } },
      { id: 17003, planId: PLAN_ID, templateId: 2701, templateName: "Reality bundle A2", zoneId: 2, spaceId: 401, contestantId: 303, status: "pending", durationOverrideMin: 20, resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [17101, 17102] }, { quantity: 1, resourceItemIds: [17201, 17202] }] } },
      { id: 17004, planId: PLAN_ID, templateId: 2701, templateName: "Reality bundle B2", zoneId: 2, spaceId: 402, contestantId: 304, status: "pending", durationOverrideMin: 20, resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [17101, 17102] }, { quantity: 1, resourceItemIds: [17201, 17202] }] } },
      { id: 17005, planId: PLAN_ID, templateId: 2702, templateName: "Reality combinación sospechosa A", zoneId: 2, spaceId: 401, contestantId: 305, status: "pending", durationOverrideMin: 20, resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [17101, 17102] }, { quantity: 1, resourceItemIds: [17201, 17202] }] } },
      { id: 17006, planId: PLAN_ID, templateId: 2702, templateName: "Reality combinación sospechosa B", zoneId: 2, spaceId: 402, contestantId: 306, status: "pending", durationOverrideMin: 20, resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [17101, 17102] }, { quantity: 1, resourceItemIds: [17201, 17202] }] } },
    ], {
      workDay: { start: "09:00", end: "10:30" },
      meal: { start: "12:00", end: "12:30" },
      optimizerMainZoneId: null,
      optimizerPrioritizeMainZone: false,
      spaceNameById: { 401: "Reality Set A", 402: "Reality Set B" },
      planResourceItems: [
        { id: 17511, resourceItemId: 17101, typeId: 12, name: "Camera 1", isAvailable: true },
        { id: 17512, resourceItemId: 17102, typeId: 12, name: "Camera 2", isAvailable: true },
        { id: 17521, resourceItemId: 17201, typeId: 13, name: "Sound 1", isAvailable: true },
        { id: 17522, resourceItemId: 17202, typeId: 13, name: "Sound 2", isAvailable: true },
      ],
      enableLimitedBacktracking: false,
      enableOperationalNeighborhoods: false,
    } as any),
    neighborhoodSeedOutput: {
      feasible: true,
      complete: true,
      hardFeasible: true,
      plannedTasks: [
        { taskId: 17001, startPlanned: "09:00", endPlanned: "09:20", assignedResources: [17511, 17521] },
        { taskId: 17002, startPlanned: "09:00", endPlanned: "09:20", assignedResources: [17512, 17522] },
        { taskId: 17003, startPlanned: "09:20", endPlanned: "09:40", assignedResources: [17511, 17521] },
        { taskId: 17004, startPlanned: "09:20", endPlanned: "09:40", assignedResources: [17512, 17522] },
        { taskId: 17005, startPlanned: "09:40", endPlanned: "10:00", assignedResources: [17511, 17522] },
        { taskId: 17006, startPlanned: "09:40", endPlanned: "10:00", assignedResources: [17512, 17521] },
      ],
      unplanned: [],
      warnings: [],
    },
    operationalExpectation: "El plan permanece completo y hard-válido; el benchmark identifica candidatos recurrentes, presión anyOf, switches y al menos una advertencia informativa por el cruce de bundles.",
    riskNotes: ["Seed determinista dedicado al diagnóstico", "Las advertencias no bloquean ni cambian el plan", "Dos bundles recurrentes y un cruce concurrente deliberado"],
  },
  {
    id: "R",
    name: "Resource bundles soft scoring",
    description: "Dos candidatos hard-válidos empatan en criterios críticos; la selección soft favorece continuidad y afinidad del bundle declarado.",
    input: baseInput([
      { id: 18001, planId: PLAN_ID, templateId: 2801, templateName: "Set bundle toma 1", zoneId: 2, spaceId: 501, contestantId: 401, status: "pending", durationOverrideMin: 20, resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [18101, 18102] }, { quantity: 1, resourceItemIds: [18201, 18202] }] } },
      { id: 18002, planId: PLAN_ID, templateId: 2801, templateName: "Set bundle toma 2", zoneId: 2, spaceId: 501, contestantId: 402, status: "pending", durationOverrideMin: 20, resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [18101, 18102] }, { quantity: 1, resourceItemIds: [18201, 18202] }] } },
    ], {
      workDay: { start: "09:00", end: "10:00" },
      meal: { start: "12:00", end: "12:30" },
      optimizerMainZoneId: 2, optimizerPrioritizeMainZone: false,
      spaceNameById: { 501: "Bundle Stage", 502: "Alternate Stage" },
      planResourceItems: [
        { id: 18511, resourceItemId: 18101, typeId: 12, name: "Camera A", isAvailable: true },
        { id: 18512, resourceItemId: 18102, typeId: 12, name: "Camera B", isAvailable: true },
        { id: 18521, resourceItemId: 18201, typeId: 13, name: "Sound A", isAvailable: true },
        { id: 18522, resourceItemId: 18202, typeId: 13, name: "Sound B", isAvailable: true },
      ],
      resourceBundles: [
        { id: "bundle-a", name: "Camera A + Sound A", isActive: true },
        { id: "bundle-b", name: "Camera B + Sound B", isActive: true },
      ],
      resourceBundleComponents: [
        { bundleId: "bundle-a", resourceItemId: 18101, componentRole: "camera", quantity: 1, isRequired: true },
        { bundleId: "bundle-a", resourceItemId: 18201, componentRole: "sound", quantity: 1, isRequired: true },
        { bundleId: "bundle-b", resourceItemId: 18102, componentRole: "camera", quantity: 1, isRequired: true },
        { bundleId: "bundle-b", resourceItemId: 18202, componentRole: "sound", quantity: 1, isRequired: true },
      ],
      resourceBundleSpaceAffinities: [
        { bundleId: "bundle-a", spaceId: 501, affinityScore: 5 },
        { bundleId: "bundle-b", spaceId: 502, affinityScore: 5 },
      ],
      enableLimitedBacktracking: false, enableOperationalNeighborhoods: false,
    } as any),
    benchmarkCandidateOutputs: [
      { feasible: true, complete: true, hardFeasible: true, plannedTasks: [
        { taskId: 18001, startPlanned: "09:00", endPlanned: "09:20", assignedResources: [18511, 18521] },
        { taskId: 18002, startPlanned: "09:20", endPlanned: "09:40", assignedResources: [18511, 18521] },
      ], unplanned: [], warnings: [] },
      { feasible: true, complete: true, hardFeasible: true, plannedTasks: [
        { taskId: 18001, startPlanned: "09:00", endPlanned: "09:20", assignedResources: [18511, 18521] },
        { taskId: 18002, startPlanned: "09:20", endPlanned: "09:40", assignedResources: [18512, 18522] },
      ], unplanned: [], warnings: [] },
    ],
    operationalExpectation: "La solución coherente mantiene bundle A en su espacio afín y se selecciona solo después de empatar hard constraints y métricas críticas.",
    riskNotes: ["Bundles siguen siendo soft", "Afinidad no bloqueante", "Comparación determinista de dos candidatos válidos"],
  },
  {
    id: "S",
    name: "Partially invalid resource bundle catalog",
    description: "Catálogo mixto con bundles válidos, un bundle vacío, duplicados y referencias desconocidas; solo la parte validada participa en scoring soft.",
    input: baseInput([
      { id: 19001, planId: PLAN_ID, templateId: 2901, templateName: "Validated bundle take 1", zoneId: 2, spaceId: 601, contestantId: 501, status: "pending", durationOverrideMin: 20 },
      { id: 19002, planId: PLAN_ID, templateId: 2901, templateName: "Validated bundle take 2", zoneId: 2, spaceId: 601, contestantId: 502, status: "pending", durationOverrideMin: 20 },
    ], {
      workDay: { start: "09:00", end: "10:00" },
      meal: { start: "12:00", end: "12:30" },
      optimizerMainZoneId: 2, optimizerPrioritizeMainZone: false,
      spaceNameById: { 601: "Validated Bundle Stage" },
      planResourceItems: [
        { id: 19511, resourceItemId: 19101, typeId: 12, name: "Camera S1", isAvailable: true },
        { id: 19512, resourceItemId: 19102, typeId: 12, name: "Camera S2", isAvailable: true },
        { id: 19521, resourceItemId: 19201, typeId: 13, name: "Sound S1", isAvailable: true },
        { id: 19522, resourceItemId: 19202, typeId: 13, name: "Sound S2", isAvailable: true },
      ],
      resourceBundles: [
        { id: "bundle-s1", name: "Camera S1 + Sound S1", isActive: true },
        { id: "bundle-s2", name: "Camera S2 + Sound S2", isActive: true },
        { id: "bundle-empty", name: "Empty active bundle", isActive: true },
      ],
      resourceBundleComponents: [
        { id: "s1-camera", bundleId: "bundle-s1", resourceItemId: 19101, componentRole: "camera", quantity: 1, isRequired: true },
        { id: "s1-camera-duplicate", bundleId: "bundle-s1", resourceItemId: 19101, componentRole: "camera", quantity: 1, isRequired: true },
        { id: "s1-sound", bundleId: "bundle-s1", resourceItemId: 19201, componentRole: "sound", quantity: 1, isRequired: true },
        { id: "s2-camera", bundleId: "bundle-s2", resourceItemId: 19102, componentRole: "camera", quantity: 1, isRequired: true },
        { id: "s2-sound", bundleId: "bundle-s2", resourceItemId: 19202, componentRole: "sound", quantity: 1, isRequired: true },
        { id: "s2-unknown", bundleId: "bundle-s2", resourceItemId: 19999, componentRole: "monitor", quantity: 1, isRequired: false },
      ],
      resourceBundleSpaceAffinities: [
        { id: "s1-stage", bundleId: "bundle-s1", spaceId: 601, affinityScore: 5 },
        { id: "s2-unknown-space", bundleId: "bundle-s2", spaceId: 699, affinityScore: 5 },
      ],
      enableLimitedBacktracking: false, enableOperationalNeighborhoods: false,
    } as any),
    benchmarkCandidateOutputs: [
      { feasible: true, complete: true, hardFeasible: true, plannedTasks: [
        { taskId: 19001, startPlanned: "09:00", endPlanned: "09:20", assignedSpace: 601, assignedResources: [19511, 19521] },
        { taskId: 19002, startPlanned: "09:20", endPlanned: "09:40", assignedSpace: 601, assignedResources: [19511, 19521] },
      ], unplanned: [], warnings: [] },
      { feasible: true, complete: true, hardFeasible: true, plannedTasks: [
        { taskId: 19001, startPlanned: "09:00", endPlanned: "09:20", assignedSpace: 601, assignedResources: [19511, 19521] },
        { taskId: 19002, startPlanned: "09:20", endPlanned: "09:40", assignedSpace: 601, assignedResources: [19512, 19522] },
      ], unplanned: [], warnings: [] },
    ],
    operationalExpectation: "El plan queda complete y hard-válido; el diagnóstico alerta del catálogo parcial y el scoring ignora todas las filas inválidas.",
    riskNotes: ["Validación solo para scoring soft", "Bundle activo vacío excluido", "Duplicados y referencias desconocidas no alteran factibilidad"],
  },
  realisticDayScenario,
  realisticVoiceDayScenario,
 ];

export const scenarioById = new Map(benchmarkScenarios.map((scenario) => [scenario.id, scenario]));
