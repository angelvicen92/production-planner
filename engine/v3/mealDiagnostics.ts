import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { getMealMode, getMealWindow } from "./mealSemantics";

export type MealDiagnosticsMetadata = Required<Pick<NonNullable<EngineOutput["v3Meta"]>,
  | "mealMode"
  | "mealModeReason"
  | "mealWindowStart"
  | "mealWindowEnd"
  | "mealDurationMinutes"
  | "mealSchedulerAttempted"
  | "mealAssignmentsGenerated"
  | "mealSchedulerAccepted"
  | "mealSchedulerReason"
  | "mealSchedulerRejectedReasons"
  | "mealBlockingConflicts"
  | "mealMovedAssignments"
  | "mealAttemptedMoves"
  | "mealAcceptedMoves"
  | "mealRejectedMoves"
  | "mealSchedulerPhase"
  | "mealPrePipelineAttempted"
  | "mealPrePipelineCandidatesGenerated"
  | "mealPrePipelineAccepted"
  | "mealPrePipelineReason"
  | "mealPrePipelineRejectedReasons"
  | "mealSchedulerCouldAffectPipeline"
  | "mealSchedulerPipelineIntegrationReason"
>>;

const finitePositive = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export function normalizeMealDiagnosticsMetadata(
  metadata: Record<string, unknown> | Partial<NonNullable<EngineOutput["v3Meta"]>> | null | undefined,
  input?: EngineV3Input | null,
): MealDiagnosticsMetadata {
  const source = (metadata ?? {}) as Record<string, unknown>;
  let inferredMode: ReturnType<typeof getMealMode> = { mode: "global_hard_break", reason: "meal_mode_inferred_legacy_global_break" };
  let inferredWindow: ReturnType<typeof getMealWindow> = null;
  if (input) {
    try {
      inferredMode = getMealMode(input);
      inferredWindow = getMealWindow(input);
    } catch {
      // Stable defaults keep diagnostics serializable for malformed input and exceptions.
    }
  }
  const mode = source.mealMode === "flexible_meal_window" || source.mealMode === "global_hard_break"
    ? source.mealMode
    : inferredMode.mode;
  const moved = Array.isArray(source.mealMovedAssignments) ? source.mealMovedAssignments.slice(0, 25) : [];
  const attemptedMoves = Array.isArray(source.mealAttemptedMoves) ? source.mealAttemptedMoves.slice(0, 25) : [];
  const acceptedMoves = Array.isArray(source.mealAcceptedMoves) ? source.mealAcceptedMoves.slice(0, 25) : [];
  const rejectedMoves = Array.isArray(source.mealRejectedMoves) ? source.mealRejectedMoves.slice(0, 25) : [];
  const rejected = Array.isArray(source.mealSchedulerRejectedReasons)
    ? [...new Set(source.mealSchedulerRejectedReasons.map(String).filter(Boolean))].slice(0, 20)
    : [];
  const phase = source.mealSchedulerPhase === "pre_pipeline" || source.mealSchedulerPhase === "during_pipeline_repair"
    ? source.mealSchedulerPhase
    : "post_pipeline";
  return {
    mealMode: mode,
    mealModeReason: typeof source.mealModeReason === "string" && source.mealModeReason.trim()
      ? source.mealModeReason.trim()
      : inferredMode.reason,
    mealWindowStart: typeof source.mealWindowStart === "string" ? source.mealWindowStart : inferredWindow?.start ?? null,
    mealWindowEnd: typeof source.mealWindowEnd === "string" ? source.mealWindowEnd : inferredWindow?.end ?? null,
    mealDurationMinutes: finitePositive(source.mealDurationMinutes)
      ?? finitePositive(input?.contestantMealDurationMinutes)
      ?? null,
    mealSchedulerAttempted: source.mealSchedulerAttempted === true,
    mealAssignmentsGenerated: Math.max(0, Number(source.mealAssignmentsGenerated) || 0),
    mealSchedulerAccepted: source.mealSchedulerAccepted === true,
    mealSchedulerReason: typeof source.mealSchedulerReason === "string" && source.mealSchedulerReason.trim()
      ? source.mealSchedulerReason.trim()
      : mode === "global_hard_break" ? "global_hard_break_configured" : "generator_not_invoked",
    mealSchedulerRejectedReasons: rejected,
    mealBlockingConflicts: Math.max(0, Number(source.mealBlockingConflicts) || 0),
    mealMovedAssignments: moved as MealDiagnosticsMetadata["mealMovedAssignments"],
    mealAttemptedMoves: attemptedMoves as MealDiagnosticsMetadata["mealAttemptedMoves"],
    mealAcceptedMoves: acceptedMoves as MealDiagnosticsMetadata["mealAcceptedMoves"],
    mealRejectedMoves: rejectedMoves as MealDiagnosticsMetadata["mealRejectedMoves"],
    mealSchedulerPhase: phase,
    mealPrePipelineAttempted: source.mealPrePipelineAttempted === true,
    mealPrePipelineCandidatesGenerated: Math.max(0, Number(source.mealPrePipelineCandidatesGenerated) || 0),
    mealPrePipelineAccepted: source.mealPrePipelineAccepted === true,
    mealPrePipelineReason: typeof source.mealPrePipelineReason === "string" && source.mealPrePipelineReason.trim()
      ? source.mealPrePipelineReason.trim() : "not_attempted",
    mealPrePipelineRejectedReasons: Array.isArray(source.mealPrePipelineRejectedReasons)
      ? [...new Set(source.mealPrePipelineRejectedReasons.map(String).filter(Boolean))].slice(0, 20) : [],
    mealSchedulerCouldAffectPipeline: source.mealSchedulerCouldAffectPipeline === true,
    mealSchedulerPipelineIntegrationReason: typeof source.mealSchedulerPipelineIntegrationReason === "string" && source.mealSchedulerPipelineIntegrationReason.trim()
      ? source.mealSchedulerPipelineIntegrationReason.trim()
      : phase === "post_pipeline"
        ? "meal_scheduler_runs_after_pipeline_selection"
        : "meal_scheduler_not_integrated_with_pipeline",
  };
}
