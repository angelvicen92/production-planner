import type { EngineOutput, ProtectedBreakInput, TaskInput, TimeWindow } from "../types";
import type { EngineV3Input } from "./types";
import { toMinutes } from "./metrics";
import { getProtectedBreaks, isMealTask } from "./mealSemantics";
import { getSpaceCapacityResolution, type SpaceCapacitySource } from "./spaceCapacity";

export const MAX_HARD_VIOLATION_DETAILS = 50;

export type HardConstraintViolationCode =
  | "CONTESTANT_OVERLAP"
  | "SPACE_OVERLAP"
  | "RESOURCE_OVERLAP"
  | "LOCK_MOVED"
  | "DONE_MOVED"
  | "IN_PROGRESS_MOVED"
  | "AVAILABILITY_VIOLATION"
  | "DEPENDENCY_VIOLATION"
  | "MEAL_CROSSING"
  | "GLOBAL_BREAK_CROSSING"
  | "PROTECTED_BREAK_CROSSING"
  | "UNKNOWN_HARD_VIOLATION";

export interface HardConstraintViolationDetail {
  code: HardConstraintViolationCode;
  severity: "hard";
  message: string;
  taskIds: number[];
  resourceId?: number;
  spaceId?: number;
  spaceName?: string;
  spaceCapacity?: number;
  observedConcurrency?: number;
  capacitySource?: SpaceCapacitySource;
  taskNames?: string[];
  templateNames?: string[];
  contestantId?: number;
  start?: string;
  end?: string;
  details?: Record<string, unknown>;
}

export interface HardValidationResult {
  hardConstraintViolations: number;
  hardConstraintViolationDetails: HardConstraintViolationDetail[];
  hardConstraintViolationCodes: HardConstraintViolationCode[];
  hardValidationPassed: boolean;
  detailsTruncated: boolean;
}

type Interval = {
  taskId: number;
  task: TaskInput;
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  resources: number[];
};

const overlaps = (a: Interval, b: Interval): boolean => a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
const minutesToHHMM = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const positiveId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
};
const taskIds = (values: unknown[]): number[] => Array.from(new Set(values.map(Number).filter((id) => Number.isFinite(id) && id > 0)));
const dependencyIds = (task: TaskInput): number[] => taskIds([
  ...(Array.isArray(task.dependsOnTaskIds) ? task.dependsOnTaskIds : []),
  task.dependsOnTaskId,
]);
const isCancelled = (task: TaskInput): boolean => String(task.status ?? "pending").toLowerCase() === "cancelled";
const isItinerantWrapper = (task: TaskInput): boolean => {
  const requirement = String(task.itinerantTeamRequirement ?? "none").toLowerCase();
  return requirement !== "" && requirement !== "none";
};
const isIntentionalWrapperPair = (a: Interval, b: Interval): boolean => (
  (isItinerantWrapper(a.task) && dependencyIds(a.task).includes(b.taskId))
  || (isItinerantWrapper(b.task) && dependencyIds(b.task).includes(a.taskId))
);

const compactDetails = (details: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
  if (!details) return undefined;
  return Object.fromEntries(Object.entries(details).slice(0, 12));
};

export const validateHardConstraints = (
  input: EngineV3Input,
  output: EngineOutput,
  maxDetails = MAX_HARD_VIOLATION_DETAILS,
): HardValidationResult => {
  const allDetails: HardConstraintViolationDetail[] = [];
  const add = (detail: HardConstraintViolationDetail): void => {
    allDetails.push({
      ...detail,
      taskIds: taskIds(detail.taskIds).slice(0, 10),
      details: compactDetails(detail.details),
    });
  };

  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const plannedById = new Map<number, EngineOutput["plannedTasks"][number]>();
  const intervals: Interval[] = [];

  for (const planned of output.plannedTasks ?? []) {
    const id = positiveId(planned.taskId);
    if (id === null) continue; // Synthetic break rows use negative ids and are validated by their own scheduler.
    const task = taskById.get(id);
    if (!task) {
      add({ code: "UNKNOWN_HARD_VIOLATION", severity: "hard", message: `Planned task ${id} is not present in the engine input.`, taskIds: [id] });
      continue;
    }
    if (isCancelled(task)) continue; // Cancelled tasks are non-operational and must not create overlap false positives.
    if (plannedById.has(id)) {
      add({ code: "UNKNOWN_HARD_VIOLATION", severity: "hard", message: `Task ${id} appears more than once in the final plan.`, taskIds: [id] });
      continue;
    }
    plannedById.set(id, planned);
    const startMinutes = toMinutes(planned.startPlanned);
    const endMinutes = toMinutes(planned.endPlanned);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      add({
        code: "UNKNOWN_HARD_VIOLATION",
        severity: "hard",
        message: `Task ${id} has an invalid planned interval.`,
        taskIds: [id],
        start: planned.startPlanned,
        end: planned.endPlanned,
      });
      continue;
    }
    intervals.push({
      taskId: id,
      task,
      start: planned.startPlanned,
      end: planned.endPlanned,
      startMinutes,
      endMinutes,
      resources: taskIds(Array.isArray(planned.assignedResources) ? planned.assignedResources : []),
    });
  }

  const checkWindow = (interval: Interval, window: TimeWindow | null | undefined, source: string): void => {
    const windowStart = toMinutes(window?.start);
    const windowEnd = toMinutes(window?.end);
    if (windowStart === null || windowEnd === null || interval.startMinutes < windowStart || interval.endMinutes > windowEnd) {
      add({
        code: "AVAILABILITY_VIOLATION",
        severity: "hard",
        message: `Task ${interval.taskId} is outside its ${source} availability window.`,
        taskIds: [interval.taskId],
        contestantId: positiveId(interval.task.contestantId) ?? undefined,
        start: interval.start,
        end: interval.end,
        details: { source, windowStart: window?.start ?? null, windowEnd: window?.end ?? null },
      });
    }
  };

  for (const interval of intervals) {
    checkWindow(interval, input.workDay, "workday");
    if (interval.task.fixedWindowStart || interval.task.fixedWindowEnd) {
      checkWindow(interval, { start: interval.task.fixedWindowStart ?? "", end: interval.task.fixedWindowEnd ?? "" }, "fixed");
    }
    const contestantId = positiveId(interval.task.contestantId);
    if (contestantId !== null && input.contestantAvailabilityById?.[contestantId]) {
      checkWindow(interval, input.contestantAvailabilityById[contestantId], "contestant");
    }

  }

  const protectedBreakAppliesToTask = (hardBreak: ProtectedBreakInput, task: TaskInput): boolean => {
    const scopes: Array<[unknown, unknown]> = [
      [hardBreak.contestantId, task.contestantId],
      [hardBreak.itinerantTeamId, task.itinerantTeamId],
      [hardBreak.spaceId, task.spaceId],
      [hardBreak.zoneId, task.zoneId],
    ];
    const configuredScopes = scopes.filter(([expected]) => positiveId(expected) !== null);
    return configuredScopes.length === 0 || configuredScopes.every(([expected, actual]) => positiveId(expected) === positiveId(actual));
  };

  for (const hardBreak of getProtectedBreaks(input)) {
    const breakStart = toMinutes(hardBreak.start);
    const breakEnd = toMinutes(hardBreak.end);
    if (breakStart === null || breakEnd === null) continue;
    for (const interval of intervals) {
      if (isMealTask(input, interval.task) || !protectedBreakAppliesToTask(hardBreak, interval.task)) continue;
      if (interval.startMinutes >= breakEnd || breakStart >= interval.endMinutes) continue;
      const code = hardBreak.kind === "meal"
        ? "MEAL_CROSSING"
        : hardBreak.kind === "global"
          ? "GLOBAL_BREAK_CROSSING"
          : "PROTECTED_BREAK_CROSSING";
      add({
        code,
        severity: "hard",
        message: hardBreak.kind === "meal"
          ? `Task ${interval.taskId} overlaps an assigned meal block.`
          : `Task ${interval.taskId} overlaps a protected hard break.`,
        taskIds: [interval.taskId],
        contestantId: positiveId(interval.task.contestantId) ?? undefined,
        spaceId: positiveId(interval.task.spaceId) ?? undefined,
        start: interval.start,
        end: interval.end,
        details: {
          violationType: hardBreak.kind === "meal" ? "MEAL_BLOCK_CROSSING" : hardBreak.kind === "global" ? "GLOBAL_BREAK_CROSSING" : "PROTECTED_BREAK_CROSSING",
          breakStart: hardBreak.start,
          breakEnd: hardBreak.end,
          breakSource: hardBreak.source,
          breakId: hardBreak.id ?? null,
          breakLabel: hardBreak.label ?? null,
        },
      });
    }
  }

  const intervalsBySpace = new Map<number, Interval[]>();
  for (const interval of intervals) {
    const spaceId = positiveId(interval.task.spaceId);
    if (spaceId === null || isItinerantWrapper(interval.task)) continue;
    const rows = intervalsBySpace.get(spaceId) ?? [];
    rows.push(interval);
    intervalsBySpace.set(spaceId, rows);
  }

  for (const [spaceId, spaceIntervals] of intervalsBySpace.entries()) {
    const { capacity, capacitySource } = getSpaceCapacityResolution(input, spaceId);
    const events = new Map<number, { starts: Interval[]; ends: Interval[] }>();
    for (const interval of spaceIntervals) {
      const startEvent = events.get(interval.startMinutes) ?? { starts: [], ends: [] };
      startEvent.starts.push(interval);
      events.set(interval.startMinutes, startEvent);
      const endEvent = events.get(interval.endMinutes) ?? { starts: [], ends: [] };
      endEvent.ends.push(interval);
      events.set(interval.endMinutes, endEvent);
    }

    const times = [...events.keys()].sort((a, b) => a - b);
    const active = new Map<number, Interval>();
    for (let index = 0; index < times.length - 1; index += 1) {
      const time = times[index];
      const event = events.get(time)!;
      for (const interval of event.ends) active.delete(interval.taskId);
      for (const interval of event.starts) active.set(interval.taskId, interval);
      const nextTime = times[index + 1];
      if (nextTime <= time || active.size <= capacity) continue;

      const activeIntervals = [...active.values()].sort((a, b) => a.taskId - b.taskId);
      const visibleIntervals = activeIntervals.slice(0, 10);
      const taskNames = visibleIntervals.map((interval) => String(interval.task.templateName ?? `Task ${interval.taskId}`));
      const templateNames = Array.from(new Set(taskNames));
      const spaceName = String(input.spaceNameById?.[spaceId] ?? "").trim() || undefined;
      const start = activeIntervals.find((interval) => interval.startMinutes === time)?.start ?? minutesToHHMM(time);
      const end = activeIntervals.find((interval) => interval.endMinutes === nextTime)?.end ?? minutesToHHMM(nextTime);
      const compactTaskIds = activeIntervals.map((interval) => interval.taskId);
      add({
        code: "SPACE_OVERLAP", severity: "hard",
        message: `${spaceName ? `Space ${spaceName} (${spaceId})` : `Space ${spaceId}`} exceeds capacity ${capacity}: ${active.size} simultaneous tasks.`,
        taskIds: compactTaskIds, taskNames, templateNames, spaceId, spaceName, spaceCapacity: capacity, observedConcurrency: active.size, capacitySource, start, end,
        details: { spaceId, spaceName: spaceName ?? null, spaceCapacity: capacity, observedConcurrency: active.size, capacitySource, taskIds: compactTaskIds.slice(0, 10), taskNames, templateNames },
      });
    }
  }

  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i];
      const b = intervals[j];
      if (!overlaps(a, b)) continue;
      const aIsMeal = isMealTask(input, a.task);
      const bIsMeal = isMealTask(input, b.task);
      if (aIsMeal !== bIsMeal) {
        const meal = aIsMeal ? a : b;
        const work = aIsMeal ? b : a;
        const sameContestant = positiveId(meal.task.contestantId) !== null && positiveId(meal.task.contestantId) === positiveId(work.task.contestantId);
        const sameTeam = positiveId(meal.task.itinerantTeamId) !== null && positiveId(meal.task.itinerantTeamId) === positiveId(work.task.itinerantTeamId);
        const sameSpace = positiveId(meal.task.spaceId) !== null && positiveId(meal.task.spaceId) === positiveId(work.task.spaceId);
        const applies = meal.task.breakKind === "space_meal"
          ? sameSpace
          : meal.task.breakKind === "itinerant_meal"
            ? sameTeam || sameContestant
            : sameContestant || sameTeam || sameSpace;
        if (applies) {
          add({
            code: "MEAL_CROSSING",
            severity: "hard",
            message: `Task ${work.taskId} overlaps assigned meal task ${meal.taskId}.`,
            taskIds: [work.taskId, meal.taskId],
            contestantId: positiveId(work.task.contestantId) ?? undefined,
            spaceId: positiveId(work.task.spaceId) ?? undefined,
            start: work.start,
            end: work.end,
            details: { violationType: "MEAL_BLOCK_CROSSING", mealTaskId: meal.taskId, mealStart: meal.start, mealEnd: meal.end },
          });
        }
      }
      const nonOccupyingWrapperPair = isItinerantWrapper(a.task) || isItinerantWrapper(b.task) || isIntentionalWrapperPair(a, b);
      const contestantId = positiveId(a.task.contestantId);
      if (!nonOccupyingWrapperPair && contestantId !== null && contestantId === positiveId(b.task.contestantId)) {
        add({ code: "CONTESTANT_OVERLAP", severity: "hard", message: `Contestant ${contestantId} has overlapping tasks.`, taskIds: [a.taskId, b.taskId], contestantId, start: a.startMinutes >= b.startMinutes ? a.start : b.start, end: a.endMinutes <= b.endMinutes ? a.end : b.end });
      }
      for (const resourceId of a.resources.filter((id) => b.resources.includes(id))) {
        add({ code: "RESOURCE_OVERLAP", severity: "hard", message: `Exclusive resource ${resourceId} is assigned to overlapping tasks.`, taskIds: [a.taskId, b.taskId], resourceId, start: a.startMinutes >= b.startMinutes ? a.start : b.start, end: a.endMinutes <= b.endMinutes ? a.end : b.end });
      }
    }
  }

  for (const lock of input.locks ?? []) {
    if (lock.lockType !== "time" && lock.lockType !== "full") continue;
    if (!lock.lockedStart && !lock.lockedEnd) continue;
    const planned = plannedById.get(Number(lock.taskId));
    if (!planned) continue;
    if ((lock.lockedStart && planned.startPlanned !== lock.lockedStart) || (lock.lockedEnd && planned.endPlanned !== lock.lockedEnd)) {
      add({ code: "LOCK_MOVED", severity: "hard", message: `Locked task ${lock.taskId} was moved.`, taskIds: [lock.taskId], start: planned.startPlanned, end: planned.endPlanned, details: { lockId: lock.id, lockedStart: lock.lockedStart ?? null, lockedEnd: lock.lockedEnd ?? null } });
    }
  }

  for (const task of input.tasks ?? []) {
    if (isCancelled(task)) continue;
    const planned = plannedById.get(Number(task.id));
    if (planned && (task.status === "done" || task.status === "in_progress")) {
      const expectedStart = task.startPlanned ?? task.startReal ?? null;
      const expectedEnd = task.endPlanned ?? task.endReal ?? null;
      if (expectedStart && expectedEnd && (planned.startPlanned !== expectedStart || planned.endPlanned !== expectedEnd)) {
        const code = task.status === "done" ? "DONE_MOVED" : "IN_PROGRESS_MOVED";
        add({ code, severity: "hard", message: `${task.status === "done" ? "Done" : "In-progress"} task ${task.id} was moved.`, taskIds: [task.id], start: planned.startPlanned, end: planned.endPlanned, details: { expectedStart, expectedEnd } });
      }
    }
    if (!planned || isItinerantWrapper(task)) continue;
    const start = toMinutes(planned.startPlanned);
    if (start === null) continue;
    for (const dependencyId of dependencyIds(task)) {
      const dependency = plannedById.get(dependencyId);
      const dependencyEnd = toMinutes(dependency?.endPlanned);
      if (dependency && dependencyEnd !== null && start < dependencyEnd) {
        add({ code: "DEPENDENCY_VIOLATION", severity: "hard", message: `Task ${task.id} starts before dependency ${dependencyId} finishes.`, taskIds: [dependencyId, task.id], start: planned.startPlanned, end: dependency.endPlanned, details: { dependencyTaskId: dependencyId } });
      }
    }
  }

  const limit = Math.max(0, Math.min(MAX_HARD_VIOLATION_DETAILS, Math.floor(maxDetails)));
  const codes = Array.from(new Set(allDetails.map((detail) => detail.code)));
  return {
    hardConstraintViolations: allDetails.length,
    hardConstraintViolationDetails: allDetails.slice(0, limit),
    hardConstraintViolationCodes: codes,
    hardValidationPassed: allDetails.length === 0,
    detailsTruncated: allDetails.length > limit,
  };
};

export const applyFinalHardValidationGate = (input: EngineV3Input, output: EngineOutput): EngineOutput => {
  const validation = validateHardConstraints(input, output);
  const v3Meta = {
    ...(output.v3Meta ?? {}),
    hardConstraintViolations: validation.hardConstraintViolations,
    hardConstraintViolationDetails: validation.hardConstraintViolationDetails,
    hardConstraintViolationCodes: validation.hardConstraintViolationCodes,
    hardValidationPassed: validation.hardValidationPassed,
    hardConstraintViolationDetailsTruncated: validation.detailsTruncated,
  };
  if (validation.hardValidationPassed) return { ...output, v3Meta };

  return {
    ...output,
    feasible: false,
    complete: false,
    hardFeasible: false,
    warnings: [
      ...(output.warnings ?? []),
      { code: "HARD_VALIDATION_FAILED", message: "El plan contiene violaciones hard y no debe usarse como planificación válida.", details: { hardConstraintViolations: validation.hardConstraintViolations, codes: validation.hardConstraintViolationCodes } },
    ],
    reasons: [
      ...(output.reasons ?? []),
      { code: "HARD_VALIDATION_FAILED", message: "La validación hard final rechazó el plan.", details: { hardConstraintViolations: validation.hardConstraintViolations, hardConstraintViolationDetails: validation.hardConstraintViolationDetails, detailsTruncated: validation.detailsTruncated } },
    ],
    v3Meta: { ...v3Meta, fallbackReason: "hard_validation_failed" },
  };
};
