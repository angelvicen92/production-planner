import type { EngineInput, TaskInput, TimeWindow } from "../../types";

export type V4RiskScore = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface V4StrategicEntityPressure {
  id: number;
  name: string;
  pressureScore: number;
  taskCount: number;
  totalDurationMinutes: number;
  availabilityMinutes: number | null;
  reasons: string[];
}

export interface V4StrategicSpacePressure extends V4StrategicEntityPressure {
  capacity: number;
  estimatedOccupancy: number;
  priority: number;
  continuous: boolean;
}

export interface V4MainFlowCandidate {
  talentId: number;
  talentName: string;
  taskIds: number[];
  taskCount: number;
  totalDurationMinutes: number;
  effectiveAvailabilityMinutes: number | null;
  dependencyCount: number;
  criticalResourceCount: number;
  scarceResourceTaskCount: number;
  trajectoryComplexity: number;
  pressureScore: number;
}

export interface V4MainFlowSequenceItem {
  talentId: number;
  talentName: string;
  score: number;
  costOfDelay: number;
  reasons: string[];
}

export interface V4StrategicAnalysis {
  mainFlow: null | {
    id: number;
    name: string;
    priority: number;
    configuration: Record<string, unknown>;
  };
  continuousSpaces: Array<{
    id: number;
    name: string;
    priority: number;
    totalLoadMinutes: number;
    estimatedOccupancy: number;
  }>;
  criticalTalents: V4StrategicEntityPressure[];
  criticalResources: V4StrategicEntityPressure[];
  criticalSpaces: V4StrategicSpacePressure[];
  mainFlowCandidates: V4MainFlowCandidate[];
  mainFlowSequence: V4MainFlowSequenceItem[];
  topCriticalTalents: V4MainFlowSequenceItem[];
  costOfDelayRanking: V4MainFlowSequenceItem[];
  pressureScores: {
    talentPressureScore: number;
    resourcePressureScore: number;
    spacePressureScore: number;
  };
  riskScore: V4RiskScore;
  warnings: Array<{ code: string; severity: "info" | "warning"; message: string }>;
}

const TOP_N = 5;

export const V4_MAIN_FLOW_SEQUENCE_CONFIG = {
  topN: TOP_N,
  scoring: {
    availabilityTightness: 22,
    operationalPressure: 18,
    taskCount: 9,
    totalDuration: 10,
    dependencies: 10,
    criticalResources: 9,
    scarceResources: 8,
    trajectoryComplexity: 8,
    costOfDelay: 16,
  },
  costOfDelay: {
    availabilityTightness: 35,
    operationalPressure: 25,
    dependencies: 15,
    resourceRisk: 15,
    totalDuration: 10,
  },
  normalization: {
    taskCountReference: 6,
    durationReferenceMinutes: 240,
    dependencyReference: 5,
    criticalResourceReference: 4,
    scarceTaskReference: 3,
    trajectoryReference: 4,
  },
} as const;
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
const ratioScore = (value: number, reference: number) => clamp((value / Math.max(1, reference)) * 100);
const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : null;
const minutes = (window?: TimeWindow | null): number | null => {
  if (!window?.start || !window?.end) return null;
  const [sh, sm] = window.start.split(":").map(Number);
  const [eh, em] = window.end.split(":").map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return null;
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
};
const duration = (task: TaskInput) => Math.max(0, Number(task.durationOverrideMin ?? 30) || 30);
const nameFor = (id: number, map: Record<number, string> | undefined, fallback: string) => String(map?.[id] ?? `${fallback} ${id}`);
const schedulableTasks = (input: EngineInput) => (input.tasks ?? []).filter((task) => task.status === "pending");
const taskDependencies = (task: TaskInput) => [
  ...(Array.isArray(task.dependsOnTaskIds) ? task.dependsOnTaskIds : []),
  ...(Array.isArray(task.dependsOnTemplateIds) ? task.dependsOnTemplateIds : []),
  task.dependsOnTaskId,
  task.dependsOnTemplateId,
].filter((value) => Number.isFinite(Number(value))).length;

function usesScarceResource(task: TaskInput): boolean {
  return task.resourceRequirements?.anyOf?.some((group) => (group.resourceItemIds?.length ?? 0) <= Math.max(1, Number(group.quantity ?? 1))) === true;
}

function taskResourceIds(task: TaskInput): number[] {
  return [
    ...Object.keys(task.resourceRequirements?.byItem ?? {}).map(Number),
    ...(task.resourceRequirements?.anyOf ?? []).flatMap((group) => group.resourceItemIds ?? []).map(Number),
  ].filter(Number.isFinite);
}

function buildMainFlowStrategy(input: EngineInput, mainFlow: V4StrategicAnalysis["mainFlow"], tasks: TaskInput[], talentPressures: V4StrategicEntityPressure[], resourcePressures: V4StrategicEntityPressure[]): Pick<V4StrategicAnalysis, "mainFlowCandidates" | "mainFlowSequence" | "topCriticalTalents" | "costOfDelayRanking"> {
  if (!mainFlow) return { mainFlowCandidates: [], mainFlowSequence: [], topCriticalTalents: [], costOfDelayRanking: [] };

  const mainFlowTasks = tasks.filter((task) => Number(task.spaceId ?? task.zoneId) === mainFlow.id || Number(task.zoneId) === mainFlow.id);
  const criticalResourceIds = new Set(resourcePressures.filter((resource) => resource.pressureScore >= 60).map((resource) => resource.id));
  const pressureByTalent = new Map(talentPressures.map((talent) => [talent.id, talent]));
  const byTalent = new Map<number, TaskInput[]>();
  for (const task of mainFlowTasks) {
    const talentId = Number(task.contestantId);
    if (!Number.isFinite(talentId)) continue;
    byTalent.set(talentId, [...(byTalent.get(talentId) ?? []), task]);
  }

  const cfg = V4_MAIN_FLOW_SEQUENCE_CONFIG;
  const weightTotal = Object.values(cfg.scoring).reduce((sum, weight) => sum + weight, 0);
  const candidates: V4MainFlowCandidate[] = [];
  const sequence: V4MainFlowSequenceItem[] = [];

  for (const [talentId, related] of byTalent.entries()) {
    const totalDurationMinutes = related.reduce((sum, task) => sum + duration(task), 0);
    const effectiveAvailabilityMinutes = minutes(input.contestantAvailabilityById?.[talentId]) ?? minutes(input.workDay);
    const dependencyCount = related.reduce((sum, task) => sum + taskDependencies(task), 0);
    const scarceResourceTaskCount = related.filter(usesScarceResource).length;
    const criticalResourceCount = related.reduce((sum, task) => sum + taskResourceIds(task).filter((id) => criticalResourceIds.has(id)).length, 0);
    const trajectoryComplexity = new Set(related.map((task) => Number(task.templateId)).filter(Number.isFinite)).size + new Set(related.map((task) => Number(task.spaceId ?? task.zoneId)).filter(Number.isFinite)).size - 1;
    const pressureScore = pressureByTalent.get(talentId)?.pressureScore ?? 0;
    const availabilityTightness = effectiveAvailabilityMinutes === null ? 0 : clamp((totalDurationMinutes / Math.max(1, effectiveAvailabilityMinutes)) * 100);
    const delayComponents = {
      availabilityTightness,
      operationalPressure: pressureScore,
      dependencies: ratioScore(dependencyCount, cfg.normalization.dependencyReference),
      resourceRisk: ratioScore(criticalResourceCount + scarceResourceTaskCount, cfg.normalization.criticalResourceReference + cfg.normalization.scarceTaskReference),
      totalDuration: ratioScore(totalDurationMinutes, cfg.normalization.durationReferenceMinutes),
    };
    const delayWeightTotal = Object.values(cfg.costOfDelay).reduce((sum, weight) => sum + weight, 0);
    const costOfDelay = clamp(Object.entries(cfg.costOfDelay).reduce((sum, [key, weight]) => sum + delayComponents[key as keyof typeof delayComponents] * weight, 0) / delayWeightTotal);
    const components = {
      availabilityTightness,
      operationalPressure: pressureScore,
      taskCount: ratioScore(related.length, cfg.normalization.taskCountReference),
      totalDuration: ratioScore(totalDurationMinutes, cfg.normalization.durationReferenceMinutes),
      dependencies: ratioScore(dependencyCount, cfg.normalization.dependencyReference),
      criticalResources: ratioScore(criticalResourceCount, cfg.normalization.criticalResourceReference),
      scarceResources: ratioScore(scarceResourceTaskCount, cfg.normalization.scarceTaskReference),
      trajectoryComplexity: ratioScore(Math.max(0, trajectoryComplexity), cfg.normalization.trajectoryReference),
      costOfDelay,
    };
    const scoreValue = Object.entries(cfg.scoring).reduce((sum, [key, weight]) => sum + components[key as keyof typeof components] * weight, 0) / weightTotal;
    const reasons = [
      `${related.length} tareas en flujo principal`,
      `${totalDurationMinutes} min en ${mainFlow.name}`,
      costOfDelay >= 75 ? "alto coste de demora" : costOfDelay >= 45 ? "coste de demora medio" : "coste de demora controlado",
      availabilityTightness >= 80 ? "disponibilidad ajustada" : "disponibilidad suficiente",
      dependencyCount ? `${dependencyCount} dependencias` : "sin dependencias directas",
      criticalResourceCount || scarceResourceTaskCount ? "intervienen recursos críticos/escasos" : "sin recursos críticos detectados",
    ];
    candidates.push({ talentId, talentName: related.find((task) => task.contestantName)?.contestantName ?? `Talento ${talentId}`, taskIds: related.map((task) => task.id), taskCount: related.length, totalDurationMinutes, effectiveAvailabilityMinutes, dependencyCount, criticalResourceCount, scarceResourceTaskCount, trajectoryComplexity: Math.max(0, trajectoryComplexity), pressureScore });
    sequence.push({ talentId, talentName: related.find((task) => task.contestantName)?.contestantName ?? `Talento ${talentId}`, score: clamp(scoreValue), costOfDelay, reasons });
  }

  sequence.sort((a, b) => b.score - a.score || b.costOfDelay - a.costOfDelay || a.talentId - b.talentId);
  candidates.sort((a, b) => (sequence.findIndex((item) => item.talentId === a.talentId)) - (sequence.findIndex((item) => item.talentId === b.talentId)));
  const costOfDelayRanking = [...sequence].sort((a, b) => b.costOfDelay - a.costOfDelay || b.score - a.score || a.talentId - b.talentId).slice(0, cfg.topN);
  return { mainFlowCandidates: candidates, mainFlowSequence: sequence, topCriticalTalents: sequence.slice(0, cfg.topN), costOfDelayRanking };
}

function detectMainFlow(input: EngineInput, warnings: V4StrategicAnalysis["warnings"]): V4StrategicAnalysis["mainFlow"] {
  const mainZoneId = num(input.optimizerMainZoneId);
  const configured = mainZoneId && mainZoneId > 0 && (input.optimizerPrioritizeMainZone || Number(input.optimizerMainZonePriorityLevel ?? 0) >= 3);
  if (!configured) {
    warnings.push({ code: "V4_MAIN_FLOW_NOT_CONFIGURED", severity: "warning", message: "No hay flujo principal configurado con prioridad máxima; V4 continúa en modo diagnóstico." });
    return null;
  }
  return {
    id: mainZoneId,
    name: nameFor(mainZoneId, input.spaceNameById, "Flujo"),
    priority: Number(input.optimizerMainZonePriorityLevel ?? 3),
    configuration: {
      optimizerPrioritizeMainZone: input.optimizerPrioritizeMainZone === true,
      optimizerMainZoneOptKeepBusy: input.optimizerMainZoneOptKeepBusy === true,
      optimizerMainZoneOptFinishEarly: input.optimizerMainZoneOptFinishEarly === true,
      optimizerMainZonePriorityLevel: input.optimizerMainZonePriorityLevel ?? null,
    },
  };
}

export function analyzeStrategicScenario(input: EngineInput): V4StrategicAnalysis {
  const warnings: V4StrategicAnalysis["warnings"] = [];
  const tasks = schedulableTasks(input);
  const workMinutes = minutes(input.workDay) ?? 1;
  const mainFlow = detectMainFlow(input, warnings);
  const spacePriorityById = ((input as any).spacePriorityById ?? {}) as Record<number, number>;
  const spaceIds = new Set<number>([...Object.keys(input.spaceNameById ?? {}).map(Number), ...tasks.map((t) => Number(t.spaceId)).filter(Number.isFinite)]);

  const continuousIds = new Set<number>();
  if (mainFlow && input.optimizerMainZoneOptKeepBusy) continuousIds.add(mainFlow.id);
  for (const [spaceId, grouping] of Object.entries(input.groupingBySpaceId ?? {})) if (Number(grouping?.level ?? 0) >= 8) continuousIds.add(Number(spaceId));

  const spacePressures = [...spaceIds].map((id) => {
    const related = tasks.filter((task) => Number(task.spaceId ?? task.zoneId) === id || Number(task.zoneId) === id);
    const total = related.reduce((sum, task) => sum + duration(task), 0);
    const capacity = Math.max(1, Number(input.spaceCapacityById?.[id] ?? input.spaceConcurrencyById?.[id] ?? 1) || 1);
    const priority = Number(spacePriorityById[id] ?? (id === mainFlow?.id ? mainFlow.priority : 1));
    const continuous = continuousIds.has(id);
    const occupancy = clamp((total / Math.max(1, workMinutes * capacity)) * 100);
    const pressureScore = clamp(occupancy + Math.max(0, priority - 1) * 8 + (continuous ? 12 : 0));
    return { id, name: nameFor(id, input.spaceNameById, "Espacio"), pressureScore, taskCount: related.length, totalDurationMinutes: total, availabilityMinutes: workMinutes * capacity, capacity, estimatedOccupancy: occupancy, priority, continuous, reasons: [occupancy >= 80 ? "alta ocupación" : "ocupación moderada", continuous ? "continuidad configurada" : "sin continuidad estricta", priority > 1 ? "prioridad elevada" : "prioridad normal"] };
  }).sort((a, b) => b.pressureScore - a.pressureScore);

  const talentMap = new Map<number, TaskInput[]>();
  for (const task of tasks) if (Number.isFinite(Number(task.contestantId))) talentMap.set(Number(task.contestantId), [...(talentMap.get(Number(task.contestantId)) ?? []), task]);
  const talentPressures = [...talentMap.entries()].map(([id, related]) => {
    const total = related.reduce((sum, task) => sum + duration(task), 0);
    const avail = minutes(input.contestantAvailabilityById?.[id]) ?? workMinutes;
    const deps = related.reduce((sum, task) => sum + taskDependencies(task), 0);
    const scarce = related.filter((task) => (task.resourceRequirements?.anyOf?.some((g) => (g.resourceItemIds?.length ?? 0) <= Math.max(1, g.quantity)) || false)).length;
    const pressureScore = clamp((total / Math.max(1, avail)) * 70 + related.length * 3 + deps * 4 + scarce * 6);
    return { id, name: related.find((t) => t.contestantName)?.contestantName ?? `Talento ${id}`, pressureScore, taskCount: related.length, totalDurationMinutes: total, availabilityMinutes: avail, reasons: [`${related.length} tareas`, `${total} min demandados`, deps ? `${deps} dependencias` : "sin dependencias", scarce ? "requiere recursos escasos" : "sin recursos escasos detectados"] };
  }).sort((a, b) => b.pressureScore - a.pressureScore);

  const resourceMap = new Map<number, TaskInput[]>();
  for (const task of tasks) for (const rid of Object.keys(task.resourceRequirements?.byItem ?? {}).map(Number)) resourceMap.set(rid, [...(resourceMap.get(rid) ?? []), task]);
  for (const task of tasks) for (const group of task.resourceRequirements?.anyOf ?? []) for (const rid of group.resourceItemIds ?? []) resourceMap.set(Number(rid), [...(resourceMap.get(Number(rid)) ?? []), task]);
  const resourceById = new Map((input.planResourceItems ?? []).map((r) => [Number(r.id), r]));
  const resourcePressures = [...resourceMap.entries()].map(([id, related]) => {
    const item = resourceById.get(id);
    const total = related.reduce((sum, task) => sum + duration(task), 0);
    const avail = item?.isAvailable === false ? 0 : workMinutes;
    const pressureScore = clamp((total / Math.max(1, avail || 1)) * 75 + related.length * 4 + (avail === 0 ? 30 : 0));
    return { id, name: item?.name ?? `Recurso ${id}`, pressureScore, taskCount: related.length, totalDurationMinutes: total, availabilityMinutes: avail, reasons: [item?.isAvailable === false ? "no disponible" : "disponible", `${related.length} tareas asociadas`, `${total} min demandados`] };
  }).sort((a, b) => b.pressureScore - a.pressureScore);

  const mainFlowStrategy = buildMainFlowStrategy(input, mainFlow, tasks, talentPressures, resourcePressures);
  const continuousSpaces = spacePressures.filter((s) => s.continuous).map((s) => ({ id: s.id, name: s.name, priority: s.priority, totalLoadMinutes: s.totalDurationMinutes, estimatedOccupancy: s.estimatedOccupancy }));
  const maxPressure = Math.max(0, talentPressures[0]?.pressureScore ?? 0, resourcePressures[0]?.pressureScore ?? 0, spacePressures[0]?.pressureScore ?? 0);
  const riskScore: V4RiskScore = maxPressure >= 95 || warnings.some((w) => w.code === "V4_MAIN_FLOW_NOT_CONFIGURED") && maxPressure >= 80 ? "CRITICAL" : maxPressure >= 75 ? "HIGH" : maxPressure >= 45 ? "MEDIUM" : "LOW";

  return { mainFlow, continuousSpaces, criticalTalents: talentPressures.slice(0, TOP_N), criticalResources: resourcePressures.slice(0, TOP_N), criticalSpaces: spacePressures.slice(0, TOP_N), ...mainFlowStrategy, pressureScores: { talentPressureScore: talentPressures[0]?.pressureScore ?? 0, resourcePressureScore: resourcePressures[0]?.pressureScore ?? 0, spacePressureScore: spacePressures[0]?.pressureScore ?? 0 }, riskScore, warnings };
}
