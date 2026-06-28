import type { EngineInput, TaskInput } from "../../types";

export const OPERATIONAL_PLANNING_QUALITY_METRICS_VERSION = "ORC-OPQM-V1";

export interface PlanningAssignment {
  taskId: number;
  startPlanned: string;
  endPlanned: string;
  assignedResources?: number[] | null;
}

export interface OperationalCompactnessConfig {
  idleTime?: boolean;
  fragmentation?: boolean;
  spread?: boolean;
}

export interface MainFlowContinuityQuality {
  gaps: number;
  averageContinuousChainLength: number;
  interruptions: number;
}

export interface CriticalResourceSpread {
  resourceIds: string[];
  thresholdUtilization: number;
  averageActiveSpan: number;
  averageIdleTime: number;
  averageFragmentation: number;
}

export interface OperationalPlanningQualityMetrics {
  version: typeof OPERATIONAL_PLANNING_QUALITY_METRICS_VERSION;
  resourceActiveSpan: Record<string, number>;
  resourceEffectiveWork: Record<string, number>;
  resourceIdleTime: Record<string, number>;
  resourceFragmentation: Record<string, number>;
  talentActiveSpan: Record<string, number>;
  talentEffectiveWork: Record<string, number>;
  talentIdleTime: Record<string, number>;
  talentFragmentation: Record<string, number>;
  operationalCompactness: number;
  operationalCompactnessConfig: Required<OperationalCompactnessConfig>;
  mainFlowContinuityQuality: MainFlowContinuityQuality;
  criticalResourceSpread: CriticalResourceSpread;
  explanations: string[];
  affectedResources: string[];
  worstCases: {
    resourceIdleTime: Array<{ id: string; value: number }>;
    resourceFragmentation: Array<{ id: string; value: number }>;
    talentIdleTime: Array<{ id: string; value: number }>;
    talentFragmentation: Array<{ id: string; value: number }>;
  };
}

type Window = { start: number; end: number };

const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const minutes = (value?: string | null): number | null => {
  const [hours, mins] = String(value ?? "").split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(mins) ? hours * 60 + mins : null;
};
const duration = (window: Window): number => Math.max(0, window.end - window.start);
const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const sortedEntries = (record: Record<string, number>): Array<{ id: string; value: number }> => Object.entries(record).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([id, value]) => ({ id, value }));
const worst = (record: Record<string, number>): Array<{ id: string; value: number }> => sortedEntries(record).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id, undefined, { numeric: true })).slice(0, 5);

function mergeWindows(windows: Window[]): Window[] {
  const sorted = [...windows].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Window[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (!last || window.start > last.end) merged.push({ ...window });
    else last.end = Math.max(last.end, window.end);
  }
  return merged;
}

function summarize(windowsById: Record<string, Window[]>) {
  const activeSpan: Record<string, number> = {};
  const effectiveWork: Record<string, number> = {};
  const idleTime: Record<string, number> = {};
  const fragmentation: Record<string, number> = {};
  for (const id of Object.keys(windowsById).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const windows = mergeWindows(windowsById[id] ?? []);
    if (windows.length === 0) continue;
    const span = Math.max(...windows.map((item) => item.end)) - Math.min(...windows.map((item) => item.start));
    const work = windows.reduce((sum, item) => sum + duration(item), 0);
    activeSpan[id] = round(span);
    effectiveWork[id] = round(work);
    idleTime[id] = round(Math.max(0, span - work));
    fragmentation[id] = windows.length;
  }
  return { activeSpan, effectiveWork, idleTime, fragmentation };
}

function continuity(windows: Window[]): MainFlowContinuityQuality {
  const merged = mergeWindows(windows);
  let gaps = 0;
  for (let i = 1; i < merged.length; i += 1) gaps += Math.max(0, merged[i].start - merged[i - 1].end);
  const totalChain = merged.reduce((sum, item) => sum + duration(item), 0);
  return { gaps: round(gaps), averageContinuousChainLength: merged.length === 0 ? 0 : round(totalChain / merged.length), interruptions: Math.max(0, merged.length - 1) };
}

export function calculateOperationalPlanningQualityMetrics(input: EngineInput, assignments: PlanningAssignment[], config: OperationalCompactnessConfig = {}): OperationalPlanningQualityMetrics {
  const compactnessConfig = { idleTime: config.idleTime ?? true, fragmentation: config.fragmentation ?? true, spread: config.spread ?? true };
  const byTask = new Map<number, TaskInput>((input.tasks ?? []).map((task) => [task.id, task]));
  const resourceWindows: Record<string, Window[]> = {};
  const talentWindows: Record<string, Window[]> = {};
  const allWindows: Window[] = [];

  for (const item of assignments) {
    const start = minutes(item.startPlanned);
    const end = minutes(item.endPlanned);
    if (start === null || end === null || end <= start) continue;
    const window = { start, end };
    allWindows.push(window);
    for (const resourceId of uniqueSorted((item.assignedResources ?? byTask.get(item.taskId)?.assignedResourceIds ?? []).map(String))) {
      (resourceWindows[resourceId] ??= []).push(window);
    }
    const task = byTask.get(item.taskId);
    const talentId = task?.contestantId != null ? `contestant:${task.contestantId}` : task?.itinerantTeamId != null ? `itinerant:${task.itinerantTeamId}` : null;
    if (talentId) (talentWindows[talentId] ??= []).push(window);
  }

  const resource = summarize(resourceWindows);
  const talent = summarize(talentWindows);
  const mainFlowContinuityQuality = continuity(allWindows);

  const totalResourceIdle = Object.values(resource.idleTime).reduce((sum, item) => sum + item, 0);
  const totalTalentIdle = Object.values(talent.idleTime).reduce((sum, item) => sum + item, 0);
  const totalActive = Object.values(resource.activeSpan).reduce((sum, item) => sum + item, 0) + Object.values(talent.activeSpan).reduce((sum, item) => sum + item, 0);
  const avgFragmentation = [...Object.values(resource.fragmentation), ...Object.values(talent.fragmentation)].reduce((sum, item) => sum + item, 0) / Math.max(1, Object.keys(resource.fragmentation).length + Object.keys(talent.fragmentation).length);
  const spread = mainFlowContinuityQuality.gaps;
  const components = [
    compactnessConfig.idleTime ? 1 - ((totalResourceIdle + totalTalentIdle) / Math.max(1, totalActive)) : null,
    compactnessConfig.fragmentation ? 1 / Math.max(1, avgFragmentation) : null,
    compactnessConfig.spread ? 1 / (1 + spread / 60) : null,
  ].filter((item): item is number => item !== null);
  const operationalCompactness = round(Math.max(0, Math.min(1, components.reduce((sum, item) => sum + item, 0) / Math.max(1, components.length))));

  const utilization = Object.fromEntries(Object.keys(resource.effectiveWork).map((id) => [id, resource.activeSpan[id] === 0 ? 0 : resource.effectiveWork[id] / resource.activeSpan[id]]));
  const values = Object.values(utilization);
  const threshold = values.length === 0 ? 0 : round(values.reduce((sum, item) => sum + item, 0) / values.length);
  const criticalIds = Object.keys(utilization).filter((id) => utilization[id] >= threshold).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const avg = (record: Record<string, number>) => criticalIds.length === 0 ? 0 : round(criticalIds.reduce((sum, id) => sum + (record[id] ?? 0), 0) / criticalIds.length);

  return {
    version: OPERATIONAL_PLANNING_QUALITY_METRICS_VERSION,
    resourceActiveSpan: resource.activeSpan,
    resourceEffectiveWork: resource.effectiveWork,
    resourceIdleTime: resource.idleTime,
    resourceFragmentation: resource.fragmentation,
    talentActiveSpan: talent.activeSpan,
    talentEffectiveWork: talent.effectiveWork,
    talentIdleTime: talent.idleTime,
    talentFragmentation: talent.fragmentation,
    operationalCompactness,
    operationalCompactnessConfig: compactnessConfig,
    mainFlowContinuityQuality,
    criticalResourceSpread: { resourceIds: criticalIds, thresholdUtilization: threshold, averageActiveSpan: avg(resource.activeSpan), averageIdleTime: avg(resource.idleTime), averageFragmentation: avg(resource.fragmentation) },
    explanations: [
      "Resource and talent active spans measure first planned task to last planned task without discounting gaps.",
      "Idle time is active span minus effective work; fragmentation counts merged continuous work blocks.",
      "Operational compactness is the configurable mean of enabled normalized idle-time, fragmentation, and spread components.",
      "Critical resource spread is calculated from dynamically high-utilization resources, not fixed categories.",
    ],
    affectedResources: uniqueSorted([...Object.keys(resource.idleTime), ...Object.keys(resource.fragmentation)]),
    worstCases: { resourceIdleTime: worst(resource.idleTime), resourceFragmentation: worst(resource.fragmentation), talentIdleTime: worst(talent.idleTime), talentFragmentation: worst(talent.fragmentation) },
  };
}
