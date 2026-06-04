import type { EngineOutput, TaskInput, TimeWindow } from "../../types";
import type { EngineV3Input } from "../types";
import type { EngineBenchmarkMetrics, PlannedTaskView } from "./types";
import { summarizeStructuredBlockers } from "../blockers";

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

export const countMealCrossings = (input: EngineV3Input, output: EngineOutput): number => {
  const mealStart = toMinutes(input.meal?.start);
  const mealEnd = toMinutes(input.meal?.end);
  if (mealStart === null || mealEnd === null || mealEnd <= mealStart) return 0;
  let crossings = 0;
  for (const view of getPlannedViews(input, output)) {
    if (view.task.breakKind === "space_meal" || view.task.breakKind === "itinerant_meal") continue;
    const start = toMinutes(view.startPlanned);
    const end = toMinutes(view.endPlanned);
    if (start === null || end === null) continue;
    if (start < mealEnd && end > mealStart) crossings++;
  }
  return crossings;
};

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

export const calculateCoachSwitchCount = (input: EngineV3Input, output: EngineOutput): number | null => {
  const rows = getPlannedViews(input, output)
    .filter((view) => view.assignedResources.length > 0)
    .sort((a, b) => (toMinutes(a.startPlanned) ?? 0) - (toMinutes(b.startPlanned) ?? 0));
  if (!rows.length) return null;
  let switches = 0;
  let previous = rows[0].assignedResources.join(",");
  for (const row of rows.slice(1)) {
    const current = row.assignedResources.join(",");
    if (current && previous && current !== previous) switches++;
    previous = current;
  }
  return switches;
};

export const calculateMakespan = (input: EngineV3Input, output: EngineOutput): number | null => {
  const views = getPlannedViews(input, output);
  if (!views.length) return null;
  const starts = views.map((view) => toMinutes(view.startPlanned)).filter((value): value is number => value !== null);
  const ends = views.map((view) => toMinutes(view.endPlanned)).filter((value): value is number => value !== null);
  if (!starts.length || !ends.length) return null;
  return Math.max(...ends) - Math.min(...starts);
};

export const countHardConstraintViolations = (input: EngineV3Input, output: EngineOutput): number => (
  countContestantWindowViolations(input, output) +
  countLockedTaskMoved(input, output) +
  countExecutedTaskMoved(input, output) +
  countContestantOverlaps(input, output) +
  countSpaceOverlaps(input, output) +
  countExclusiveResourceOverlaps(input, output) +
  countMealCrossings(input, output) +
  countDependencyViolations(input, output)
);

export const calculateMetrics = (input: EngineV3Input, output: EngineOutput, runtimeMs: number): EngineBenchmarkMetrics => {
  const mainGaps = calculateMainStageGaps(input, output);
  const blockerSummary = summarizeStructuredBlockers(output);
  return {
    totalTasks: input.tasks.length,
    plannedTasks: output.plannedTasks?.length ?? 0,
    unplannedTasks: output.unplanned?.length ?? Math.max(0, input.tasks.length - (output.plannedTasks?.length ?? 0)),
    makespan: calculateMakespan(input, output),
    runtimeMs,
    mainStageGapMinutes: mainGaps?.minutes ?? null,
    mainStageGapCount: mainGaps?.count ?? null,
    contestantWindowViolations: countContestantWindowViolations(input, output),
    hardConstraintViolations: countHardConstraintViolations(input, output),
    lockedTaskMovedCount: countLockedTaskMoved(input, output),
    executedTaskMovedCount: countExecutedTaskMoved(input, output),
    coachSwitchCount: calculateCoachSwitchCount(input, output),
    cpSatAttempted: output.v3Meta?.cpSatAttempted ?? null,
    cpSatAccepted: output.v3Meta?.cpSatAccepted ?? null,
    phaseAUsed: output.v3Meta?.phaseAUsed ?? null,
    backtrackingAttempted: output.v3Meta?.backtrackingAttempted ?? null,
    backtrackingAccepted: output.v3Meta?.backtrackingAccepted ?? null,
    backtrackingAttempts: output.v3Meta?.backtrackingAttempts ?? null,
    backtrackingBranchesExplored: output.v3Meta?.backtrackingBranchesExplored ?? null,
    candidateSolutionsEvaluated: output.v3Meta?.candidateSolutionsEvaluated ?? null,
    bestCandidateSource: output.v3Meta?.bestCandidateSource ?? null,
    candidateSelectionReason: output.v3Meta?.candidateSelectionReason ?? null,
    bestCandidateScore: output.v3Meta?.bestCandidateScore ?? null,
    ...blockerSummary,
    solutionSource: output.v3Meta?.solutionSource ?? null,
    warningsCount: output.warnings?.length ?? 0,
    infeasibleReasonCount: output.reasons?.length ?? 0,
  };
};
