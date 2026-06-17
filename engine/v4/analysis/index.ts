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
  pressureScores: {
    talentPressureScore: number;
    resourcePressureScore: number;
    spacePressureScore: number;
  };
  riskScore: V4RiskScore;
  warnings: Array<{ code: string; severity: "info" | "warning"; message: string }>;
}

const TOP_N = 5;
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
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

  const continuousSpaces = spacePressures.filter((s) => s.continuous).map((s) => ({ id: s.id, name: s.name, priority: s.priority, totalLoadMinutes: s.totalDurationMinutes, estimatedOccupancy: s.estimatedOccupancy }));
  const maxPressure = Math.max(0, talentPressures[0]?.pressureScore ?? 0, resourcePressures[0]?.pressureScore ?? 0, spacePressures[0]?.pressureScore ?? 0);
  const riskScore: V4RiskScore = maxPressure >= 95 || warnings.some((w) => w.code === "V4_MAIN_FLOW_NOT_CONFIGURED") && maxPressure >= 80 ? "CRITICAL" : maxPressure >= 75 ? "HIGH" : maxPressure >= 45 ? "MEDIUM" : "LOW";

  return { mainFlow, continuousSpaces, criticalTalents: talentPressures.slice(0, TOP_N), criticalResources: resourcePressures.slice(0, TOP_N), criticalSpaces: spacePressures.slice(0, TOP_N), pressureScores: { talentPressureScore: talentPressures[0]?.pressureScore ?? 0, resourcePressureScore: resourcePressures[0]?.pressureScore ?? 0, spacePressureScore: spacePressures[0]?.pressureScore ?? 0 }, riskScore, warnings };
}
