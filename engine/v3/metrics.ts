import type { EngineOutput, TaskInput, TimeWindow } from "../types";
import type { EngineV3Input } from "./types";
import { validateHardConstraints } from "./hardValidation";
import { getCoachResourceIds } from "./coachDetection";

export interface PlannedTaskView {
  taskId: number;
  startPlanned: string;
  endPlanned: string;
  assignedResources: number[];
  task: TaskInput;
}

export const toMinutes = (hhmm: string | null | undefined): number | null => {
  if (!hhmm) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean => aStart < bEnd && bStart < aEnd;

export const getPlannedViews = (input: EngineV3Input, output: EngineOutput): PlannedTaskView[] => {
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  return (output.plannedTasks ?? [])
    .map((planned) => {
      const task = taskById.get(Number(planned.taskId));
      const start = toMinutes(planned.startPlanned);
      const end = toMinutes(planned.endPlanned);
      if (!task || start === null || end === null) return null;
      return {
        taskId: Number(planned.taskId),
        startPlanned: planned.startPlanned,
        endPlanned: planned.endPlanned,
        assignedResources: Array.isArray(planned.assignedResources)
          ? planned.assignedResources.map(Number).filter((id) => Number.isFinite(id) && id > 0)
          : [],
        task,
      } satisfies PlannedTaskView;
    })
    .filter((view): view is PlannedTaskView => view !== null);
};

const getWindowForTask = (input: EngineV3Input, task: TaskInput): TimeWindow | null => {
  const fixedStart = task.fixedWindowStart ?? null;
  const fixedEnd = task.fixedWindowEnd ?? null;
  if (fixedStart && fixedEnd) return { start: fixedStart, end: fixedEnd };
  const contestantId = Number(task.contestantId ?? NaN);
  if (Number.isFinite(contestantId) && input.contestantAvailabilityById?.[contestantId]) {
    return input.contestantAvailabilityById[contestantId];
  }
  return input.workDay;
};

export const countContestantWindowViolations = (input: EngineV3Input, output: EngineOutput): number => {
  let violations = 0;
  for (const view of getPlannedViews(input, output)) {
    const window = getWindowForTask(input, view.task);
    const start = toMinutes(view.startPlanned);
    const end = toMinutes(view.endPlanned);
    const windowStart = toMinutes(window?.start);
    const windowEnd = toMinutes(window?.end);
    if (start === null || end === null || windowStart === null || windowEnd === null) continue;
    if (start < windowStart || end > windowEnd) violations++;
  }
  return violations;
};

export const countLockedTaskMoved = (input: EngineV3Input, output: EngineOutput): number => {
  const plannedById = new Map((output.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));
  let moved = 0;
  for (const lock of input.locks ?? []) {
    if (lock.lockType !== "time" && lock.lockType !== "full") continue;
    if (!lock.lockedStart || !lock.lockedEnd) continue;
    const planned = plannedById.get(Number(lock.taskId));
    if (planned && (planned.startPlanned !== lock.lockedStart || planned.endPlanned !== lock.lockedEnd)) moved++;
  }
  return moved;
};

export const countExecutedTaskMoved = (input: EngineV3Input, output: EngineOutput): number => {
  const plannedById = new Map((output.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));
  let moved = 0;
  for (const task of input.tasks ?? []) {
    if (task.status !== "done" && task.status !== "in_progress") continue;
    const expectedStart = task.startPlanned ?? task.startReal ?? null;
    const expectedEnd = task.endPlanned ?? task.endReal ?? null;
    if (!expectedStart || !expectedEnd) continue;
    const planned = plannedById.get(Number(task.id));
    if (planned && (planned.startPlanned !== expectedStart || planned.endPlanned !== expectedEnd)) moved++;
  }
  return moved;
};

const countPairOverlaps = (views: PlannedTaskView[], key: (view: PlannedTaskView) => number | null): number => {
  const grouped = new Map<number, PlannedTaskView[]>();
  for (const view of views) {
    const id = key(view);
    if (id === null) continue;
    const bucket = grouped.get(id) ?? [];
    bucket.push(view);
    grouped.set(id, bucket);
  }

  let violations = 0;
  for (const bucket of grouped.values()) {
    const sorted = [...bucket].sort((a, b) => (toMinutes(a.startPlanned) ?? 0) - (toMinutes(b.startPlanned) ?? 0));
    for (let i = 1; i < sorted.length; i++) {
      const prevStart = toMinutes(sorted[i - 1].startPlanned);
      const prevEnd = toMinutes(sorted[i - 1].endPlanned);
      const currStart = toMinutes(sorted[i].startPlanned);
      const currEnd = toMinutes(sorted[i].endPlanned);
      if (prevStart === null || prevEnd === null || currStart === null || currEnd === null) continue;
      if (overlaps(prevStart, prevEnd, currStart, currEnd)) violations++;
    }
  }
  return violations;
};

export const countContestantOverlaps = (input: EngineV3Input, output: EngineOutput): number => countPairOverlaps(
  getPlannedViews(input, output),
  (view) => {
    const id = Number(view.task.contestantId ?? NaN);
    return Number.isFinite(id) && id > 0 ? id : null;
  },
);

export const countSpaceOverlaps = (input: EngineV3Input, output: EngineOutput): number => countPairOverlaps(
  getPlannedViews(input, output),
  (view) => {
    const id = Number(view.task.spaceId ?? NaN);
    return Number.isFinite(id) && id > 0 ? id : null;
  },
);

export const countExclusiveResourceOverlaps = (input: EngineV3Input, output: EngineOutput): number => countPairOverlaps(
  getPlannedViews(input, output).flatMap((view) => view.assignedResources.map((resourceId) => ({ ...view, resourceId }))),
  (view: PlannedTaskView & { resourceId?: number }) => view.resourceId ?? null,
);

export const countMealCrossings = (input: EngineV3Input, output: EngineOutput): number => (
  validateHardConstraints(input, output, Number.MAX_SAFE_INTEGER)
    .hardConstraintViolationDetails
    .filter((detail) => detail.code === "MEAL_CROSSING")
    .length
);

export const countDependencyViolations = (input: EngineV3Input, output: EngineOutput): number => {
  const plannedById = new Map((output.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));
  let violations = 0;
  for (const task of input.tasks ?? []) {
    const deps = [
      ...(Array.isArray(task.dependsOnTaskIds) ? task.dependsOnTaskIds : []),
      ...(task.dependsOnTaskId ? [task.dependsOnTaskId] : []),
    ].map(Number).filter((id) => Number.isFinite(id) && id > 0);
    if (!deps.length) continue;
    const planned = plannedById.get(Number(task.id));
    const start = toMinutes(planned?.startPlanned);
    if (!planned || start === null) continue;
    for (const depId of deps) {
      const dep = plannedById.get(depId);
      const depEnd = toMinutes(dep?.endPlanned);
      if (!dep || depEnd === null) continue;
      if (start < depEnd) violations++;
    }
  }
  return violations;
};

export const calculateMainStageGaps = (input: EngineV3Input, output: EngineOutput): { count: number; minutes: number } | null => {
  const mainZoneId = Number(input.optimizerMainZoneId ?? NaN);
  if (!Number.isFinite(mainZoneId) || mainZoneId <= 0) return null;
  const rows = getPlannedViews(input, output)
    .filter((view) => Number(view.task.zoneId ?? NaN) === mainZoneId)
    .sort((a, b) => (toMinutes(a.startPlanned) ?? 0) - (toMinutes(b.startPlanned) ?? 0));
  let count = 0;
  let minutes = 0;
  for (let i = 1; i < rows.length; i++) {
    const prevEnd = toMinutes(rows[i - 1].endPlanned);
    const nextStart = toMinutes(rows[i].startPlanned);
    if (prevEnd === null || nextStart === null) continue;
    const gap = nextStart - prevEnd;
    if (gap > 0) {
      count++;
      minutes += gap;
    }
  }
  return { count, minutes };
};

export { getCoachResourceIds };

export interface CoachSwitchMetrics {
  count: number | null;
  weightedPenalty: number;
}

export const calculateCoachSwitchMetrics = (input: EngineV3Input, output: EngineOutput): CoachSwitchMetrics => {
  const coachIds = getCoachResourceIds(input);
  if (!coachIds.size) return { count: null, weightedPenalty: 0 };
  const mainZoneId = Number(input.optimizerMainZoneId ?? NaN);
  const feederTaskIds = new Set<number>();
  if (Number.isFinite(mainZoneId) && mainZoneId > 0) {
    for (const task of input.tasks ?? []) {
      if (Number(task.zoneId ?? NaN) !== mainZoneId) continue;
      for (const dependencyId of [
        ...(Array.isArray(task.dependsOnTaskIds) ? task.dependsOnTaskIds : []),
        ...(task.dependsOnTaskId ? [task.dependsOnTaskId] : []),
      ].map(Number).filter((id) => Number.isFinite(id) && id > 0)) feederTaskIds.add(dependencyId);
    }
  }
  const rows = getPlannedViews(input, output)
    .map((view) => ({
      start: toMinutes(view.startPlanned) ?? 0,
      taskId: view.taskId,
      coachKey: view.assignedResources.filter((id) => coachIds.has(Number(id))).sort((a, b) => a - b).join(","),
      feedsMain: feederTaskIds.has(view.taskId),
    }))
    .filter((row) => row.coachKey)
    .sort((a, b) => a.start - b.start || a.taskId - b.taskId);
  if (!rows.length) return { count: null, weightedPenalty: 0 };

  let count = 0;
  let weightedPenalty = 0;
  let previous: string | null = null;
  let beforePrevious: string | null = null;
  for (const row of rows) {
    if (previous !== null && row.coachKey !== previous) {
      count += 1;
      weightedPenalty += 1;
      if (row.feedsMain) weightedPenalty += 1;
      if (beforePrevious !== null && row.coachKey === beforePrevious) weightedPenalty += 1;
    }
    beforePrevious = previous;
    previous = row.coachKey;
  }
  return { count, weightedPenalty };
};

export const calculateCoachSwitchCount = (input: EngineV3Input, output: EngineOutput): number | null => calculateCoachSwitchMetrics(input, output).count;

export const calculateMakespan = (input: EngineV3Input, output: EngineOutput): number | null => {
  const views = getPlannedViews(input, output);
  if (!views.length) return null;
  const starts = views.map((view) => toMinutes(view.startPlanned)).filter((value): value is number => value !== null);
  const ends = views.map((view) => toMinutes(view.endPlanned)).filter((value): value is number => value !== null);
  if (!starts.length || !ends.length) return null;
  return Math.max(...ends) - Math.min(...starts);
};


export const calculateRestrictiveTalentAverageStartOffset = (input: EngineV3Input, output: EngineOutput): number | null => {
  const dayStart = toMinutes(input.workDay?.start);
  const dayEnd = toMinutes(input.workDay?.end);
  if (dayStart === null || dayEnd === null) return null;
  const offsets: number[] = [];
  for (const view of getPlannedViews(input, output)) {
    const contestantId = Number(view.task.contestantId ?? NaN);
    const window = Number.isFinite(contestantId) ? input.contestantAvailabilityById?.[contestantId] : null;
    const windowStart = toMinutes(window?.start);
    const windowEnd = toMinutes(window?.end);
    const start = toMinutes(view.startPlanned);
    if (windowStart === null || windowEnd === null || start === null) continue;
    if (windowStart > dayStart || windowEnd < dayEnd) offsets.push(Math.max(0, start - windowStart));
  }
  if (!offsets.length) return null;
  return Math.round(offsets.reduce((sum, value) => sum + value, 0) / offsets.length);
};

export const calculateRestrictiveTalentLatestFinishSlack = (input: EngineV3Input, output: EngineOutput): number | null => {
  const dayStart = toMinutes(input.workDay?.start);
  const dayEnd = toMinutes(input.workDay?.end);
  if (dayStart === null || dayEnd === null) return null;
  let latestSlack: number | null = null;
  for (const view of getPlannedViews(input, output)) {
    const contestantId = Number(view.task.contestantId ?? NaN);
    const window = Number.isFinite(contestantId) ? input.contestantAvailabilityById?.[contestantId] : null;
    const windowStart = toMinutes(window?.start);
    const windowEnd = toMinutes(window?.end);
    const end = toMinutes(view.endPlanned);
    if (windowStart === null || windowEnd === null || end === null) continue;
    if (windowStart > dayStart || windowEnd < dayEnd) {
      const slack = windowEnd - end;
      latestSlack = latestSlack === null ? slack : Math.min(latestSlack, slack);
    }
  }
  return latestSlack;
};

export const calculateMainStageUtilizationPercent = (input: EngineV3Input, output: EngineOutput): number | null => {
  const mainZoneId = Number(input.optimizerMainZoneId ?? NaN);
  if (!Number.isFinite(mainZoneId) || mainZoneId <= 0) return null;
  const rows = getPlannedViews(input, output).filter((view) => Number(view.task.zoneId ?? NaN) === mainZoneId);
  if (!rows.length) return null;
  const starts = rows.map((view) => toMinutes(view.startPlanned)).filter((value): value is number => value !== null);
  const ends = rows.map((view) => toMinutes(view.endPlanned)).filter((value): value is number => value !== null);
  if (!starts.length || !ends.length) return null;
  const span = Math.max(...ends) - Math.min(...starts);
  if (span <= 0) return null;
  const occupied = rows.reduce((sum, view) => {
    const start = toMinutes(view.startPlanned);
    const end = toMinutes(view.endPlanned);
    return start === null || end === null ? sum : sum + Math.max(0, end - start);
  }, 0);
  return Math.round((occupied / span) * 100);
};

export const calculateTasksPerContestantMinMax = (input: EngineV3Input): { min: number; max: number } | null => {
  const counts = new Map<number, number>();
  for (const task of input.tasks ?? []) {
    const contestantId = Number(task.contestantId ?? NaN);
    if (!Number.isFinite(contestantId) || contestantId <= 0) continue;
    counts.set(contestantId, (counts.get(contestantId) ?? 0) + 1);
  }
  if (!counts.size) return null;
  const values = Array.from(counts.values());
  return { min: Math.min(...values), max: Math.max(...values) };
};

export const calculateResourceUtilizationSummary = (input: EngineV3Input, output: EngineOutput): string | null => {
  const minutesByResource = new Map<number, number>();
  for (const view of getPlannedViews(input, output)) {
    const start = toMinutes(view.startPlanned);
    const end = toMinutes(view.endPlanned);
    if (start === null || end === null || end <= start) continue;
    for (const resourceId of view.assignedResources) {
      minutesByResource.set(resourceId, (minutesByResource.get(resourceId) ?? 0) + (end - start));
    }
  }
  if (!minutesByResource.size) return null;
  return Array.from(minutesByResource.entries())
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([resourceId, minutes]) => `${resourceId}:${minutes}m`)
    .join(", ");
};

export const countHardConstraintViolations = (input: EngineV3Input, output: EngineOutput): number => (
  validateHardConstraints(input, output).hardConstraintViolations
);


export interface OperationalMetricsSnapshot {
  coachSwitchCount: number | null;
  coachSwitchPenalty: number;
  restrictiveTalentAverageStartOffset: number | null;
  mainStageGapMinutes: number | null;
  mainStageGapCount: number | null;
  makespan: number | null;
  hardConstraintViolations: number;
}

export const calculateOperationalMetrics = (input: EngineV3Input, output: EngineOutput): OperationalMetricsSnapshot => {
  const coachSwitches = calculateCoachSwitchMetrics(input, output);
  const mainStageGaps = calculateMainStageGaps(input, output);
  return {
    coachSwitchCount: coachSwitches.count,
    coachSwitchPenalty: coachSwitches.weightedPenalty,
    restrictiveTalentAverageStartOffset: calculateRestrictiveTalentAverageStartOffset(input, output),
    mainStageGapMinutes: mainStageGaps?.minutes ?? null,
    mainStageGapCount: mainStageGaps?.count ?? null,
    makespan: calculateMakespan(input, output),
    hardConstraintViolations: countHardConstraintViolations(input, output),
  };
};
