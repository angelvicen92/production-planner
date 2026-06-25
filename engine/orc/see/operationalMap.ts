import type { OperationalState } from "../contracts";

export interface OperationalMap {
  stateId: string;
  taskCount: number;
  plannedTaskCount: number;
  pendingTaskCount: number;
  protectedTaskCount: number;
  lockCount: number;
  mainFlow?: {
    configured: boolean;
    spaceOrZoneId: number | null;
    plannedTaskIds: number[];
    firstStart: string | null;
    lastEnd: string | null;
    internalGapMinutes: number;
    gapCount: number;
  };
  resources: {
    total: number;
    assignedResourceIds: number[];
    overloadedResourceIds: number[];
  };
  talents: {
    contestantIds: number[];
    stayByContestantId: Record<number, number>;
    maxStayContestantId: number | null;
    maxStayMinutes: number;
  };
  fragmentation: {
    spaceSwitchesByContestantId: Record<number, number>;
    totalSpaceSwitches: number;
  };
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

export function buildOperationalMap(state: OperationalState): OperationalMap {
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
  for (const resourceId of assignedResourceIds) {
    const intervals = planning
      .filter((item) => (item.assignedResourceIds ?? []).includes(resourceId))
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

  return {
    stateId: state.id,
    taskCount: state.tasks?.length ?? 0,
    plannedTaskCount: planning.length,
    pendingTaskCount,
    protectedTaskCount,
    lockCount: state.locks?.length ?? 0,
    mainFlow: { configured: mainZoneId != null, spaceOrZoneId: mainZoneId, plannedTaskIds: mainFlowTasks.map((item) => item.taskId), firstStart: mainFlowTasks[0]?.startPlanned ?? null, lastEnd: mainFlowTasks.at(-1)?.endPlanned ?? null, internalGapMinutes, gapCount },
    resources: { total: state.resources?.length ?? 0, assignedResourceIds, overloadedResourceIds: [...overloaded].sort((a, b) => a - b) },
    talents: { contestantIds, stayByContestantId, maxStayContestantId, maxStayMinutes },
    fragmentation: { spaceSwitchesByContestantId, totalSpaceSwitches },
  };
}
