import type { OperationalState } from "../contracts";
import { analyzeCriticalBottlenecks, type CriticalBottleneckAnalysis } from "./criticalBottleneckAnalyzer";

export interface ResourcePressureSummary {
  readonly totalResourceCount: number;
  readonly assignedResourceIds: readonly number[];
  readonly overloadedResourceIds: readonly number[];
  readonly plannedTaskIdsByResourceId: Readonly<Record<number, readonly number[]>>;
}

export interface ContinuitySummary {
  readonly taskCount: number;
  readonly plannedTaskCount: number;
  readonly pendingTaskCount: number;
  readonly protectedTaskCount: number;
  readonly mainFlow: {
    readonly configured: boolean;
    readonly spaceOrZoneId: number | null;
    readonly plannedTaskIds: readonly number[];
    readonly firstStart: string | null;
    readonly lastEnd: string | null;
    readonly internalGapMinutes: number;
    readonly gapCount: number;
  };
}

export interface FragmentationSummary {
  readonly spaceSwitchesByContestantId: Readonly<Record<number, number>>;
  readonly totalSpaceSwitches: number;
}

export interface DependencySummary {
  readonly dependencyCount: number;
  readonly lockCount: number;
  readonly lockedTaskIds: readonly number[];
  readonly taskIdsWithDependencies: readonly number[];
}

export interface OperationalMarginSummary {
  readonly contestantIds: readonly number[];
  readonly stayByContestantId: Readonly<Record<number, number>>;
  readonly maxStayContestantId: number | null;
  readonly maxStayMinutes: number;
}

export interface OperationalAnalysis {
  readonly resourcePressure: ResourcePressureSummary;
  readonly continuity: ContinuitySummary;
  readonly fragmentation: FragmentationSummary;
  readonly dependencySummary: DependencySummary;
  readonly operationalMargin: OperationalMarginSummary;
  readonly criticalBottleneckAnalysis: CriticalBottleneckAnalysis;
}

const toMinutes = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

const byStartThenId = <T extends { taskId: number; startPlanned: string; endPlanned: string }>(a: T, b: T): number =>
  (toMinutes(a.startPlanned) ?? Number.MAX_SAFE_INTEGER) - (toMinutes(b.startPlanned) ?? Number.MAX_SAFE_INTEGER)
  || (toMinutes(a.endPlanned) ?? Number.MAX_SAFE_INTEGER) - (toMinutes(b.endPlanned) ?? Number.MAX_SAFE_INTEGER)
  || a.taskId - b.taskId;

const numberFromRecord = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const isProtectedStatus = (status: string | null | undefined): boolean => status === "in_progress" || status === "done";

export function analyzeOperationalState(state: OperationalState): OperationalAnalysis {
  const taskById = new Map((state.tasks ?? []).map((task) => [Number(task.id), task]));
  const planning = [...(state.planning ?? [])].filter((item) => item && Number.isFinite(Number(item.taskId))).sort(byStartThenId);
  const plannedTaskIds = new Set(planning.map((item) => Number(item.taskId)));
  const pendingTaskCount = (state.tasks ?? []).filter((task) => task?.status === "pending" && !plannedTaskIds.has(Number(task.id))).length;
  const protectedTaskCount = (state.tasks ?? []).filter((task) => isProtectedStatus(task?.status)).length;

  const mainZoneId = numberFromRecord((state.constraints?.optimizer as Record<string, unknown> | undefined)?.mainZoneId);
  const mainFlowTasks = mainZoneId == null ? [] : planning.filter((item) => {
    const task = taskById.get(Number(item.taskId));
    return item.spaceId === mainZoneId || task?.zoneId === mainZoneId || task?.spaceId === mainZoneId;
  });
  let internalGapMinutes = 0;
  let gapCount = 0;
  for (let index = 1; index < mainFlowTasks.length; index += 1) {
    const previousEnd = toMinutes(mainFlowTasks[index - 1]?.endPlanned);
    const currentStart = toMinutes(mainFlowTasks[index]?.startPlanned);
    if (previousEnd != null && currentStart != null && currentStart > previousEnd) {
      internalGapMinutes += currentStart - previousEnd;
      gapCount += 1;
    }
  }

  const assignedResourceIds = [...new Set(planning.flatMap((item) => item.assignedResourceIds ?? []).filter((id) => Number.isFinite(Number(id))).map(Number))].sort((a, b) => a - b);
  const overloaded = new Set<number>();
  const plannedTaskIdsByResourceId: Record<number, number[]> = {};
  for (const resourceId of assignedResourceIds) {
    const items = planning.filter((item) => (item.assignedResourceIds ?? []).includes(resourceId));
    plannedTaskIdsByResourceId[resourceId] = items.map((item) => Number(item.taskId)).sort((a, b) => a - b);
    const intervals = items
      .map((item) => ({ start: toMinutes(item.startPlanned), end: toMinutes(item.endPlanned) }))
      .filter((item): item is { start: number; end: number } => item.start != null && item.end != null)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 1; i < intervals.length; i += 1) if (intervals[i].start < intervals[i - 1].end) overloaded.add(resourceId);
  }

  const byContestant = new Map<number, typeof planning>();
  for (const item of planning) {
    const contestantId = taskById.get(Number(item.taskId))?.contestantId;
    if (contestantId == null) continue;
    byContestant.set(contestantId, [...(byContestant.get(contestantId) ?? []), item]);
  }
  const contestantIds = [...byContestant.keys()].sort((a, b) => a - b);
  const stayByContestantId: Record<number, number> = {};
  const spaceSwitchesByContestantId: Record<number, number> = {};
  let maxStayContestantId: number | null = null;
  let maxStayMinutes = 0;
  let totalSpaceSwitches = 0;
  for (const contestantId of contestantIds) {
    const items = [...(byContestant.get(contestantId) ?? [])].sort(byStartThenId);
    const starts = items.map((item) => toMinutes(item.startPlanned)).filter((value): value is number => value != null);
    const ends = items.map((item) => toMinutes(item.endPlanned)).filter((value): value is number => value != null);
    const stay = starts.length && ends.length ? Math.max(...ends) - Math.min(...starts) : 0;
    stayByContestantId[contestantId] = stay;
    if (stay > maxStayMinutes || (stay === maxStayMinutes && (maxStayContestantId == null || contestantId < maxStayContestantId))) {
      maxStayMinutes = stay; maxStayContestantId = contestantId;
    }
    let switches = 0;
    for (let i = 1; i < items.length; i += 1) if ((items[i - 1].spaceId ?? null) !== (items[i].spaceId ?? null)) switches += 1;
    spaceSwitchesByContestantId[contestantId] = switches;
    totalSpaceSwitches += switches;
  }

  const analysisWithoutBottlenecks = {
    resourcePressure: { totalResourceCount: state.resources?.length ?? 0, assignedResourceIds, overloadedResourceIds: [...overloaded].sort((a, b) => a - b), plannedTaskIdsByResourceId },
    continuity: { taskCount: state.tasks?.length ?? 0, plannedTaskCount: planning.length, pendingTaskCount, protectedTaskCount, mainFlow: { configured: mainZoneId != null, spaceOrZoneId: mainZoneId, plannedTaskIds: mainFlowTasks.map((item) => item.taskId), firstStart: mainFlowTasks[0]?.startPlanned ?? null, lastEnd: mainFlowTasks.at(-1)?.endPlanned ?? null, internalGapMinutes, gapCount } },
    fragmentation: { spaceSwitchesByContestantId, totalSpaceSwitches },
    dependencySummary: { dependencyCount: (state.dependencies ?? []).reduce((sum, dependency) => sum + (dependency.dependsOnTaskIds?.length ?? 0) + (dependency.dependsOnTemplateIds?.length ?? 0), 0), lockCount: state.locks?.length ?? 0, lockedTaskIds: [...new Set((state.locks ?? []).map((lock) => Number(lock.taskId)).filter(Number.isFinite))].sort((a, b) => a - b), taskIdsWithDependencies: [...new Set((state.dependencies ?? []).filter((dependency) => (dependency.dependsOnTaskIds?.length ?? 0) > 0 || (dependency.dependsOnTemplateIds?.length ?? 0) > 0).map((dependency) => Number(dependency.taskId)).filter(Number.isFinite))].sort((a, b) => a - b) },
    operationalMargin: { contestantIds, stayByContestantId, maxStayContestantId, maxStayMinutes },
  };

  return {
    ...analysisWithoutBottlenecks,
    criticalBottleneckAnalysis: analyzeCriticalBottlenecks(analysisWithoutBottlenecks),
  };
}
