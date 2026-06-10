import type { EngineOutput, TaskInput } from "../types";
import { validateHardConstraints } from "./hardValidation";
import { getMealMode, getMealWindow, isMealTask, mealOccupiesSpace } from "./mealSemantics";
import { calculateOperationalMetrics } from "./metrics";
import { scoreCandidateSolution } from "./solutionScoring";
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
  mealMovedAssignments: Array<{ taskId: number; fromStart: string | null; toStart: string; toEnd: string; accepted: boolean }>;
  mealAttemptedMoves: Array<{ taskId: number; fromStart: string | null; toStart: string; toEnd: string; accepted: boolean; rejectedReason?: string }>;
  mealAcceptedMoves: Array<{ taskId: number; fromStart: string | null; toStart: string; toEnd: string; accepted: true }>;
  mealRejectedMoves: Array<{ taskId: number; fromStart: string | null; toStart: string; toEnd: string; accepted: false; rejectedReason: string }>;
  mealSchedulerPhase: "pre_pipeline" | "during_pipeline_repair" | "post_pipeline";
  mealPrePipelineAttempted: boolean;
  mealPrePipelineCandidatesGenerated: number;
  mealPrePipelineAccepted: boolean;
  mealPrePipelineReason: string;
  mealPrePipelineRejectedReasons: string[];
  mealSchedulerCouldAffectPipeline: boolean;
  mealSchedulerPipelineIntegrationReason: string;
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

type MealSchedulerDependencies = {
  validateHardConstraints?: typeof validateHardConstraints;
  calculateOperationalMetrics?: typeof calculateOperationalMetrics;
};

const schedulerExceptionDiagnostics = (input: EngineV3Input): MealSchedulerDiagnostics => {
  let mode: ReturnType<typeof getMealMode> = { mode: "flexible_meal_window", reason: "default_flexible_meal_window" };
  let window: ReturnType<typeof getMealWindow> = null;
  try {
    mode = getMealMode(input);
    window = getMealWindow(input);
  } catch {
    // Diagnostics must remain available even when malformed input caused the scheduler exception.
  }
  return {
    mealMode: mode.mode,
    mealModeReason: mode.reason,
    mealWindowStart: window?.start ?? null,
    mealWindowEnd: window?.end ?? null,
    mealDurationMinutes: null,
    mealSchedulerAttempted: true,
    mealAssignmentsGenerated: 0,
    mealSchedulerAccepted: false,
    mealSchedulerReason: "meal_scheduler_exception",
    mealSchedulerRejectedReasons: ["meal_scheduler_exception"],
    mealBlockingConflicts: 0,
    mealMovedAssignments: [],
    mealAttemptedMoves: [],
    mealAcceptedMoves: [],
    mealRejectedMoves: [],
    mealSchedulerPhase: "post_pipeline",
    mealPrePipelineAttempted: false,
    mealPrePipelineCandidatesGenerated: 0,
    mealPrePipelineAccepted: false,
    mealPrePipelineReason: "not_attempted",
    mealPrePipelineRejectedReasons: [],
    mealSchedulerCouldAffectPipeline: false,
    mealSchedulerPipelineIntegrationReason: "meal_scheduler_exception_after_pipeline",
  };
};

export function scheduleFlexibleMeals(
  input: EngineV3Input,
  output: EngineOutput,
  dependencies: MealSchedulerDependencies = {},
): { output: EngineOutput; diagnostics: MealSchedulerDiagnostics } {
  try {
  const mode = getMealMode(input);
  const window = getMealWindow(input);
  const windowStart = toMinutes(window?.start);
  const windowEnd = toMinutes(window?.end);
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const plannedTasks = Array.isArray(output.plannedTasks) ? output.plannedTasks : [];
  const mealTasks = tasks.filter((task) => isMealTask(input, task));
  const configuredDuration = Number(input.contestantMealDurationMinutes);
  const defaultDuration = mealTasks.map((task) => Number(task.durationOverrideMin)).find((duration) => Number.isFinite(duration) && duration > 0)
    ?? (Number.isFinite(configuredDuration) && configuredDuration > 0 ? configuredDuration : 30);
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
    mealAttemptedMoves: [],
    mealAcceptedMoves: [],
    mealRejectedMoves: [],
    mealSchedulerPhase: "post_pipeline",
    mealPrePipelineAttempted: false,
    mealPrePipelineCandidatesGenerated: 0,
    mealPrePipelineAccepted: false,
    mealPrePipelineReason: "not_attempted",
    mealPrePipelineRejectedReasons: [],
    mealSchedulerCouldAffectPipeline: mode.mode === "flexible_meal_window" && mealTasks.length > 0,
    mealSchedulerPipelineIntegrationReason: mode.mode === "flexible_meal_window"
      ? "post_pipeline_meal_moves_can_change_pipeline_blockers"
      : "global_hard_break_has_no_post_pipeline_moves",
  };
  if (mode.mode !== "flexible_meal_window") return { output, diagnostics: base };
  base.mealSchedulerAttempted = true;
  if (windowStart === null || windowEnd === null || windowEnd <= windowStart) {
    return { output, diagnostics: { ...base, mealSchedulerReason: "invalid_meal_window", mealSchedulerRejectedReasons: ["invalid_meal_window"] } };
  }
  if (!mealTasks.length) return { output, diagnostics: { ...base, mealSchedulerReason: "no_meal_assignments_required", mealSchedulerAccepted: true } };

  const taskById = new Map(tasks.map((task) => [Number(task.id), task]));
  const plannedById = new Map(plannedTasks.map((planned) => [Number(planned.taskId), { ...planned }]));
  const calculateMetrics = dependencies.calculateOperationalMetrics ?? calculateOperationalMetrics;
  const validateCandidate = dependencies.validateHardConstraints ?? validateHardConstraints;
  let baselineGap = Number.POSITIVE_INFINITY;
  try {
    baselineGap = Number(calculateMetrics(input, { ...output, plannedTasks }).mainStageGapMinutes ?? Number.POSITIVE_INFINITY);
  } catch (error) {
    console.warn("[meal-scheduler] baseline diagnostics failed", { error: error instanceof Error ? error.message : String(error) });
  }
  let workingOutput = output;
  const attemptedMoves: MealSchedulerDiagnostics["mealAttemptedMoves"] = [];
  const acceptedMoves: MealSchedulerDiagnostics["mealAcceptedMoves"] = [];
  const rejectedMoves: MealSchedulerDiagnostics["mealRejectedMoves"] = [];
  const rejected = new Set<string>();
  let generated = 0;
  let blockingConflicts = 0;

  for (const meal of mealTasks) {
    const current = plannedById.get(Number(meal.id));
    const requestedDuration = Number(meal.durationOverrideMin);
    const duration = Math.max(1, Math.round(Number.isFinite(requestedDuration) && requestedDuration > 0 ? requestedDuration : defaultDuration));
    if (!current || isProtectedMeal(input, { ...meal, startPlanned: current?.startPlanned, endPlanned: current?.endPlanned })) continue;
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
      const candidate = { ...workingOutput, plannedTasks: nextPlanned };
      let hard: ReturnType<typeof validateHardConstraints>;
      let candidateGap: number;
      try {
        hard = validateCandidate(input, candidate);
        candidateGap = Number(calculateMetrics(input, candidate).mainStageGapMinutes ?? Number.POSITIVE_INFINITY);
      } catch (error) {
        rejected.add("meal_candidate_validation_exception");
        attemptedMoves.push({ taskId: Number(meal.id), fromStart: current.startPlanned ?? null, toStart: toHHMM(start), toEnd: toHHMM(end), accepted: false, rejectedReason: "meal_candidate_validation_exception" });
        rejectedMoves.push({ taskId: Number(meal.id), fromStart: current.startPlanned ?? null, toStart: toHHMM(start), toEnd: toHHMM(end), accepted: false, rejectedReason: "meal_candidate_validation_exception" });
        console.warn("[meal-scheduler] candidate validation failed", {
          taskId: Number(meal.id),
          start: toHHMM(start),
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (!hard.hardValidationPassed || candidateGap !== baselineGap) {
        const reason = candidateGap !== baselineGap ? "meal_shift_would_break_main_stage" : hard.hardConstraintViolationCodes[0] ?? "meal_candidate_failed_hard_validation";
        for (const code of hard.hardConstraintViolationCodes) rejected.add(code);
        attemptedMoves.push({ taskId: Number(meal.id), fromStart: current.startPlanned ?? null, toStart: toHHMM(start), toEnd: toHHMM(end), accepted: false, rejectedReason: reason });
        rejectedMoves.push({ taskId: Number(meal.id), fromStart: current.startPlanned ?? null, toStart: toHHMM(start), toEnd: toHHMM(end), accepted: false, rejectedReason: reason });
        continue;
      }
      const fromStart = current.startPlanned ?? null;
      plannedById.set(Number(meal.id), nextPlanned.find((planned) => Number(planned.taskId) === Number(meal.id))!);
      workingOutput = candidate;
      if (fromStart !== toHHMM(start)) {
        const move = { taskId: Number(meal.id), fromStart, toStart: toHHMM(start), toEnd: toHHMM(end), accepted: true as const };
        attemptedMoves.push(move);
        acceptedMoves.push(move);
      }
      assigned = true;
      break;
    }
    if (!assigned) rejected.add("no_meal_slot_available_for_resource");
  }

  if (rejected.size === 0) {
    const beforeScore = scoreCandidateSolution(input, output);
    const afterScore = scoreCandidateSolution(input, workingOutput);
    const worsened = afterScore.hardConstraintViolations > beforeScore.hardConstraintViolations
      || afterScore.mainStageGapMinutes > beforeScore.mainStageGapMinutes
      || afterScore.coachSplitDayPenalty > beforeScore.coachSplitDayPenalty
      || afterScore.maxCoachGapMinutes > beforeScore.maxCoachGapMinutes
      || afterScore.coachIdlePenalty > beforeScore.coachIdlePenalty
      || afterScore.talentIdlePenalty > beforeScore.talentIdlePenalty;
    if (worsened) rejected.add("meal_candidate_not_better_than_baseline");
  }
  const accepted = rejected.size === 0;
  return {
    output: accepted ? workingOutput : output,
    diagnostics: {
      ...base,
      mealAssignmentsGenerated: generated,
      mealSchedulerAccepted: accepted,
      mealSchedulerReason: accepted ? (acceptedMoves.length ? "flexible_meals_scheduled" : "existing_meal_assignments_valid") : "no_meal_slot_available_for_resource",
      mealSchedulerRejectedReasons: [...rejected],
      mealBlockingConflicts: blockingConflicts,
      mealMovedAssignments: accepted ? acceptedMoves.slice(0, 25) : [],
      mealAttemptedMoves: attemptedMoves.slice(0, 25),
      mealAcceptedMoves: accepted ? acceptedMoves.slice(0, 25) : [],
      mealRejectedMoves: rejectedMoves.slice(0, 25),
    },
  };
  } catch (error) {
    console.warn("[meal-scheduler] ignored scheduler failure", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return { output, diagnostics: schedulerExceptionDiagnostics(input) };
  }
}

export function runMealSchedulerSafely(
  input: EngineV3Input,
  output: EngineOutput,
  scheduler: (input: EngineV3Input, output: EngineOutput) => { output: EngineOutput; diagnostics: MealSchedulerDiagnostics } = scheduleFlexibleMeals,
): { output: EngineOutput; diagnostics: MealSchedulerDiagnostics } {
  try {
    return scheduler(input, output);
  } catch (error) {
    console.warn("[meal-scheduler] ignored scheduler exception", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return { output, diagnostics: schedulerExceptionDiagnostics(input) };
  }
}
