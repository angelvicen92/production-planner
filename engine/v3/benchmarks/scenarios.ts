import type { BenchmarkScenario } from "./types";
import type { EngineV3Input } from "../types";
import { realisticDayScenario } from "./realisticDayScenario";

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
  realisticDayScenario,
 ];

export const scenarioById = new Map(benchmarkScenarios.map((scenario) => [scenario.id, scenario]));
