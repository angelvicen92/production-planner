import type { EngineOutput, TaskInput } from "../types";
import { validateHardConstraints } from "./hardValidation";
import { getMealMode, getMealWindow, isMealTask, mealOccupiesSpace } from "./mealSemantics";
import { calculateOperationalMetrics } from "./metrics";
import type { EngineV3Input } from "./types";

export type MealSchedulerDiagnostics = {
  mealMode: "global_hard_break" | "flexible_meal_window";
  mealModeReason: string;
  mealWindowStart: string | null;
  mealWindowEnd: string | null;
  mealDurationMinutes: number | null;
  mealSchedulerAttempted: boolean;
  mealAssignmentsGenerated: number;
  mealSchedulerAccepted: boolean;
  mealSchedulerReason: string;
  mealSchedulerRejectedReasons: string[];
  mealBlockingConflicts: number;
  mealMovedAssignments: Array<{ taskId: number; fromStart: string | null; toStart: string; toEnd: string }>;
};

const GRID_MINUTES = 5;
const toMinutes = (value: string | null | undefined): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const result = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(result) ? result : null;
};
const toHHMM = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

const isProtectedMeal = (input: EngineV3Input, task: TaskInput): boolean => {
  const status = String(task.status ?? "pending").toLowerCase();
  if (status === "done" || status === "in_progress") return true;
  if (task.fixedWindowStart && task.fixedWindowEnd && task.fixedWindowStart === task.startPlanned && task.fixedWindowEnd === task.endPlanned) return true;
  return (input.locks ?? []).some((lock) => Number(lock.taskId) === Number(task.id) && ["time", "full"].includes(String(lock.lockType)));
};

const sharesMealScope = (meal: TaskInput, other: TaskInput): boolean => {
  if (meal.breakKind === "itinerant_meal") {
    return meal.itinerantTeamId != null && Number(meal.itinerantTeamId) === Number(other.itinerantTeamId);
  }
  if (meal.breakKind === "space_meal") {
    return meal.spaceId != null && Number(meal.spaceId) === Number(other.spaceId);
  }
  return (meal.contestantId != null && Number(meal.contestantId) === Number(other.contestantId))
    || (meal.itinerantTeamId != null && Number(meal.itinerantTeamId) === Number(other.itinerantTeamId))
    || (mealOccupiesSpace(meal) && meal.spaceId != null && Number(meal.spaceId) === Number(other.spaceId));
};

export function scheduleFlexibleMeals(input: EngineV3Input, output: EngineOutput): { output: EngineOutput; diagnostics: MealSchedulerDiagnostics } {
  const mode = getMealMode(input);
  const window = getMealWindow(input);
  const windowStart = toMinutes(window?.start);
  const windowEnd = toMinutes(window?.end);
  const mealTasks = input.tasks.filter((task) => isMealTask(input, task));
  const defaultDuration = mealTasks.map((task) => Number(task.durationOverrideMin)).find((duration) => Number.isFinite(duration) && duration > 0)
    ?? (Number(input.contestantMealDurationMinutes ?? 0) || null);
  const base: MealSchedulerDiagnostics = {
    mealMode: mode.mode,
    mealModeReason: mode.reason,
    mealWindowStart: window?.start ?? null,
    mealWindowEnd: window?.end ?? null,
    mealDurationMinutes: defaultDuration,
    mealSchedulerAttempted: false,
    mealAssignmentsGenerated: 0,
    mealSchedulerAccepted: false,
    mealSchedulerReason: mode.mode === "global_hard_break" ? "global_hard_break_configured" : "not_attempted",
    mealSchedulerRejectedReasons: [],
    mealBlockingConflicts: 0,
    mealMovedAssignments: [],
  };
  if (mode.mode !== "flexible_meal_window") return { output, diagnostics: base };
  base.mealSchedulerAttempted = true;
  if (windowStart === null || windowEnd === null || windowEnd <= windowStart) {
    return { output, diagnostics: { ...base, mealSchedulerReason: "invalid_meal_window", mealSchedulerRejectedReasons: ["invalid_meal_window"] } };
  }
  if (!mealTasks.length) return { output, diagnostics: { ...base, mealSchedulerReason: "no_meal_assignments_required", mealSchedulerAccepted: true } };

  const taskById = new Map(input.tasks.map((task) => [Number(task.id), task]));
  const plannedById = new Map(output.plannedTasks.map((planned) => [Number(planned.taskId), { ...planned }]));
  const baselineGap = calculateOperationalMetrics(input, output).mainStageGapMinutes;
  let acceptedOutput = output;
  const moved: MealSchedulerDiagnostics["mealMovedAssignments"] = [];
  const rejected = new Set<string>();
  let generated = 0;
  let blockingConflicts = 0;

  for (const meal of mealTasks) {
    const current = plannedById.get(Number(meal.id));
    const duration = Math.max(1, Math.round(Number(meal.durationOverrideMin ?? defaultDuration ?? 0)));
    if (!current || !Number.isFinite(duration) || isProtectedMeal(input, { ...meal, startPlanned: current?.startPlanned, endPlanned: current?.endPlanned })) continue;
    const otherScoped = [...plannedById.values()].filter((planned) => {
      if (Number(planned.taskId) === Number(meal.id)) return false;
      const task = taskById.get(Number(planned.taskId));
      return Boolean(task && !isMealTask(input, task) && sharesMealScope(meal, task));
    });
    const candidateStarts: number[] = [];
    for (let start = windowStart; start + duration <= windowEnd; start += GRID_MINUTES) candidateStarts.push(start);
    candidateStarts.sort((left, right) => {
      const score = (start: number) => {
        const scopedConflicts = otherScoped.reduce((sum, planned) => {
          const otherStart = toMinutes(planned.startPlanned);
          const otherEnd = toMinutes(planned.endPlanned);
          return sum + (otherStart !== null && otherEnd !== null && overlaps(start, start + duration, otherStart, otherEnd) ? 10_000 : 0);
        }, 0);
        const simultaneousMeals = mealTasks.reduce((sum, otherMeal) => {
          if (Number(otherMeal.id) === Number(meal.id)) return sum;
          const planned = plannedById.get(Number(otherMeal.id));
          const otherStart = toMinutes(planned?.startPlanned);
          const otherEnd = toMinutes(planned?.endPlanned);
          return sum + (otherStart !== null && otherEnd !== null && overlaps(start, start + duration, otherStart, otherEnd) ? 100 : 0);
        }, 0);
        return scopedConflicts + simultaneousMeals + Math.abs(start - (windowStart + windowEnd - duration) / 2);
      };
      return score(left) - score(right);
    });

    let assigned = false;
    for (const start of candidateStarts) {
      generated += 1;
      const end = start + duration;
      if (otherScoped.some((planned) => {
        const otherStart = toMinutes(planned.startPlanned);
        const otherEnd = toMinutes(planned.endPlanned);
        return otherStart !== null && otherEnd !== null && overlaps(start, end, otherStart, otherEnd);
      })) {
        blockingConflicts += 1;
        continue;
      }
      const nextPlanned = [...plannedById.values()].map((planned) => Number(planned.taskId) === Number(meal.id)
        ? { ...planned, startPlanned: toHHMM(start), endPlanned: toHHMM(end), assignedResources: [] }
        : planned);
      const candidate = { ...acceptedOutput, plannedTasks: nextPlanned };
      const hard = validateHardConstraints(input, candidate);
      const candidateGap = calculateOperationalMetrics(input, candidate).mainStageGapMinutes;
      if (!hard.hardValidationPassed || candidateGap !== baselineGap) continue;
      const fromStart = current.startPlanned ?? null;
      plannedById.set(Number(meal.id), nextPlanned.find((planned) => Number(planned.taskId) === Number(meal.id))!);
      acceptedOutput = candidate;
      if (fromStart !== toHHMM(start)) moved.push({ taskId: Number(meal.id), fromStart, toStart: toHHMM(start), toEnd: toHHMM(end) });
      assigned = true;
      break;
    }
    if (!assigned) rejected.add("no_meal_slot_available_for_resource");
  }

  const accepted = rejected.size === 0;
  return {
    output: acceptedOutput,
    diagnostics: {
      ...base,
      mealAssignmentsGenerated: generated,
      mealSchedulerAccepted: accepted,
      mealSchedulerReason: accepted ? (moved.length ? "flexible_meals_scheduled" : "existing_meal_assignments_valid") : "no_meal_slot_available_for_resource",
      mealSchedulerRejectedReasons: [...rejected],
      mealBlockingConflicts: blockingConflicts,
      mealMovedAssignments: moved.slice(0, 50),
    },
  };
}
