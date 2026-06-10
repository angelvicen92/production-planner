import type { EngineInput, EngineOutput } from "../types";
import { calculateOperationalMetrics } from "./metrics";
import { diagnoseCompositeResources } from "./resourceDiagnostics";
import { validateResourceBundles } from "./resourceBundleValidation";
import { validateHardConstraints, type HardConstraintViolationDetail, type HardConstraintViolationCode } from "./hardValidation";
import { normalizePipelineDiagnosticsMetadata } from "./pipelineDiagnostics";

type SelectedCandidateMetrics = NonNullable<NonNullable<EngineOutput["v3Meta"]>["selectedCandidateMetrics"]>;
type PipelineConflictDiagnostic = NonNullable<NonNullable<EngineOutput["v3Meta"]>["pipelineConflictDetails"]>[number];

type CompactWarning = {
  code: string;
  message: string;
  taskIds: number[];
  severity?: "info" | "warning";
  bundleId?: string;
};

export interface EngineRunDiagnostics {
  engineVersion: "v3";
  solutionSource: string;
  status: "success" | "infeasible";
  plannedTasks: number;
  unplannedTasks: number;
  hardConstraintViolations: number;
  hardConstraintViolationDetails: HardConstraintViolationDetail[];
  hardConstraintViolationCodes: HardConstraintViolationCode[];
  hardValidationPassed: boolean;
  mainStageGapMinutes: number | null;
  mainStageGapCount: number | null;
  coachSwitchCount: number | null;
  restrictiveTalentAverageStartOffset: number | null;
  selectedCandidateMetrics: SelectedCandidateMetrics | null;
  engineMetadata: {
    candidateSelectionReason: string | null;
    candidateSolutionsEvaluated: number | null;
    backtrackingAttempted: boolean;
    backtrackingAccepted: boolean;
    neighborhoodSearchAttempted: boolean;
    neighborhoodCandidatesGenerated: number;
    neighborhoodCandidateAccepted: boolean;
    operationalCompactionAttempted: boolean;
    operationalCompactionCandidatesGenerated: number;
    operationalCompactionAccepted: boolean;
    operationalCompactionReason: string | null;
    operationalCompactionMetricsBefore: Record<string, number> | null;
    operationalCompactionMetricsAfter: Record<string, number> | null;
    coachCompactionAttempted: boolean;
    coachCompactionCandidatesGenerated: number;
    coachCompactionRejectedReasons: string[];
    coachCompactionTargetedCoaches: Array<{
      coachId: number | null;
      coachName: string;
      maxGapMinutes: number;
      spanMinutes: number;
      idleMinutes: number;
    }>;
    coachCompactionBestBefore: Record<string, number>;
    coachCompactionBestAfter: Record<string, number>;
    coachWaveOrderingAttempted: boolean;
    coachWaveCandidatesGenerated: number;
    coachWaveAccepted: boolean;
    coachWaveReason: string | null;
    coachWaveBefore: Record<string, number>;
    coachWaveAfter: Record<string, number>;
    pipelineBuilderAttempted: boolean;
    pipelineCandidatesGenerated: number;
    pipelineAccepted: boolean;
    pipelineReason: string | null;
    pipelineRejectedReasons: string[];
    pipelineBefore: Record<string, number>;
    pipelineAfter: Record<string, number>;
    pipelineMappedTalents: string[];
    pipelineUnmappedTalents: string[];
    pipelineMovedTasks: number[];
    pipelineStableTasks: number[];
    pipelineFeederOutcomes: string[];
    pipelineRepairAttempted: boolean;
    pipelineRepairCandidatesGenerated: number;
    pipelineRepairAccepted: boolean;
    pipelineConflictDetails: PipelineConflictDiagnostic[];
    pipelineSegmentRepairAttempted: boolean;
    pipelineSegmentRepairCandidatesGenerated: number;
    pipelineSegmentRepairAccepted: boolean;
    pipelineSegmentRepairReason: string | null;
    pipelineSegmentRepairStrategiesTried: string[];
    pipelineSegmentRepairMovedTalentNames: string[];
    pipelineSegmentRepairRejectedReasons: string[];
    pipelineLaneRepairAttempted: boolean;
    pipelineLaneRepairCandidatesGenerated: number;
    pipelineLaneRepairAccepted: boolean;
    pipelineLaneRepairReason: string;
    pipelineLaneRepairRejectedReasons: string[];
    pipelineLaneOnlyRepairAttempted: boolean;
    pipelineLaneOnlyRepairCandidatesGenerated: number;
    pipelineLaneOnlyRepairAccepted: boolean;
    pipelineLaneOnlyRepairReason: string;
    pipelineLaneOnlyRepairRejectedReasons: string[];
    pipelineLaneOnlyRepairMovedTaskIds: number[];
    pipelineLaneOnlyRepairMovedTalentNames: string[];
    pipelineAlternativeLaneAttempted: boolean;
    pipelineAlternativeLaneCandidatesGenerated: number;
    pipelineAlternativeLaneAccepted: boolean;
    pipelineAlternativeLaneRejectedReasons: string[];
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
    cpSatAttempted: boolean;
    cpSatAccepted: boolean;
    cpSatPilotAttempted: boolean;
    cpSatPilotAccepted: boolean;
    cpSatSegmentsAttempted: number;
    cpSatSegmentsAccepted: number;
    fallbackReasons: string[];
    declaredResourceBundleCount: number;
    usableResourceBundleCount: number;
    invalidResourceBundleCount: number;
    partiallyUsableResourceBundleCount: number;
    hardConstraintViolationDetails: HardConstraintViolationDetail[];
    hardConstraintViolationCodes: HardConstraintViolationCode[];
    hardValidationPassed: boolean;
    hardConstraintViolationDetailsTruncated: boolean;
  };
  diagnosticWarnings: {
    resourceDiagnosticWarnings: CompactWarning[];
    resourceBundleValidationWarnings: CompactWarning[];
  };
}

const MAX_WARNINGS_PER_GROUP = 50;
const MAX_WARNING_TASK_IDS = 25;
const MAX_TEXT_LENGTH = 500;

const compactText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_TEXT_LENGTH) : null;
};

const compactWarning = (warning: {
  code?: unknown;
  message?: unknown;
  taskIds?: unknown;
  severity?: unknown;
  bundleId?: unknown;
}): CompactWarning => ({
  code: compactText(warning.code) ?? "UNKNOWN_WARNING",
  message: compactText(warning.message) ?? "Diagnostic warning",
  taskIds: Array.isArray(warning.taskIds)
    ? warning.taskIds.map(Number).filter(Number.isFinite).slice(0, MAX_WARNING_TASK_IDS)
    : [],
  ...(warning.severity === "info" || warning.severity === "warning" ? { severity: warning.severity } : {}),
  ...(compactText(warning.bundleId) ? { bundleId: compactText(warning.bundleId)! } : {}),
});

const uniqueCompactReasons = (values: unknown[]): string[] => Array.from(new Set(
  values.map(compactText).filter((value): value is string => value !== null),
)).slice(0, 10);

/**
 * Builds the small, persistence-safe audit projection for one V3 execution.
 * It deliberately excludes tasks, assignments, full inputs/outputs and solver payloads.
 */
export const buildRunDiagnostics = (input: EngineInput, output: EngineOutput): EngineRunDiagnostics => {
  const metrics = calculateOperationalMetrics(input, output);
  const hardValidation = validateHardConstraints(input, output);
  const resourceDiagnostics = diagnoseCompositeResources(input, output);
  const bundleValidation = validateResourceBundles(input);
  const meta = output.v3Meta;
  const pipelineMetadata = normalizePipelineDiagnosticsMetadata(meta);
  const plannedTasks = output.plannedTasks?.length ?? 0;
  const unplannedTasks = output.unplanned?.length ?? Math.max(0, input.tasks.length - plannedTasks);

  return {
    engineVersion: "v3",
    solutionSource: meta?.solutionSource ?? (output.hardFeasible === false ? "infeasible" : "unknown"),
    status: output.hardFeasible === false || !hardValidation.hardValidationPassed ? "infeasible" : "success",
    plannedTasks,
    unplannedTasks,
    hardConstraintViolations: hardValidation.hardConstraintViolations,
    hardConstraintViolationDetails: hardValidation.hardConstraintViolationDetails,
    hardConstraintViolationCodes: hardValidation.hardConstraintViolationCodes,
    hardValidationPassed: hardValidation.hardValidationPassed,
    mainStageGapMinutes: metrics.mainStageGapMinutes,
    mainStageGapCount: metrics.mainStageGapCount,
    coachSwitchCount: metrics.coachSwitchCount,
    restrictiveTalentAverageStartOffset: metrics.restrictiveTalentAverageStartOffset,
    selectedCandidateMetrics: meta?.selectedCandidateMetrics ?? null,
    engineMetadata: {
      candidateSelectionReason: compactText(meta?.candidateSelectionReason),
      candidateSolutionsEvaluated: meta?.candidateSolutionsEvaluated ?? null,
      backtrackingAttempted: meta?.backtrackingAttempted ?? false,
      backtrackingAccepted: meta?.backtrackingAccepted ?? false,
      neighborhoodSearchAttempted: meta?.neighborhoodSearchAttempted ?? false,
      neighborhoodCandidatesGenerated: meta?.neighborhoodCandidatesGenerated ?? 0,
      neighborhoodCandidateAccepted: meta?.neighborhoodCandidateAccepted ?? false,
      operationalCompactionAttempted: meta?.operationalCompactionAttempted ?? false,
      operationalCompactionCandidatesGenerated: meta?.operationalCompactionCandidatesGenerated ?? 0,
      operationalCompactionAccepted: meta?.operationalCompactionAccepted ?? false,
      operationalCompactionReason: compactText(meta?.operationalCompactionReason),
      operationalCompactionMetricsBefore: meta?.operationalCompactionMetricsBefore ?? null,
      operationalCompactionMetricsAfter: meta?.operationalCompactionMetricsAfter ?? null,
      coachCompactionAttempted: meta?.coachCompactionAttempted ?? false,
      coachCompactionCandidatesGenerated: meta?.coachCompactionCandidatesGenerated ?? 0,
      coachCompactionRejectedReasons: uniqueCompactReasons(meta?.coachCompactionRejectedReasons ?? []),
      coachCompactionTargetedCoaches: meta?.coachCompactionTargetedCoaches ?? [],
      coachCompactionBestBefore: meta?.coachCompactionBestBefore ?? {},
      coachCompactionBestAfter: meta?.coachCompactionBestAfter ?? {},
      coachWaveOrderingAttempted: meta?.coachWaveOrderingAttempted ?? false,
      coachWaveCandidatesGenerated: meta?.coachWaveCandidatesGenerated ?? 0,
      coachWaveAccepted: meta?.coachWaveAccepted ?? false,
      coachWaveReason: meta?.coachWaveReason ?? "generator_not_invoked",
      coachWaveBefore: meta?.coachWaveBefore ?? {},
      coachWaveAfter: meta?.coachWaveAfter ?? {},
      pipelineBuilderAttempted: meta?.pipelineBuilderAttempted ?? false,
      pipelineCandidatesGenerated: meta?.pipelineCandidatesGenerated ?? 0,
      pipelineAccepted: meta?.pipelineAccepted ?? false,
      pipelineReason: compactText(meta?.pipelineReason) ?? "generator_not_invoked",
      pipelineRejectedReasons: uniqueCompactReasons(meta?.pipelineRejectedReasons ?? []),
      pipelineBefore: meta?.pipelineBefore ?? {},
      pipelineAfter: meta?.pipelineAfter ?? {},
      pipelineMappedTalents: (meta?.pipelineMappedTalents ?? []).slice(0, 20),
      pipelineUnmappedTalents: (meta?.pipelineUnmappedTalents ?? []).slice(0, 20),
      pipelineMovedTasks: (meta?.pipelineMovedTasks ?? []).slice(0, 50),
      pipelineStableTasks: (meta?.pipelineStableTasks ?? []).slice(0, 50),
      pipelineFeederOutcomes: uniqueCompactReasons(meta?.pipelineFeederOutcomes ?? []),
      ...pipelineMetadata,
      mealMode: meta?.mealMode ?? "global_hard_break",
      mealModeReason: meta?.mealModeReason ?? "meal_mode_inferred_legacy_global_break",
      mealWindowStart: meta?.mealWindowStart ?? null,
      mealWindowEnd: meta?.mealWindowEnd ?? null,
      mealDurationMinutes: meta?.mealDurationMinutes ?? null,
      mealSchedulerAttempted: meta?.mealSchedulerAttempted ?? false,
      mealAssignmentsGenerated: meta?.mealAssignmentsGenerated ?? 0,
      mealSchedulerAccepted: meta?.mealSchedulerAccepted ?? false,
      mealSchedulerReason: meta?.mealSchedulerReason ?? "generator_not_invoked",
      mealSchedulerRejectedReasons: uniqueCompactReasons(meta?.mealSchedulerRejectedReasons ?? []),
      mealBlockingConflicts: meta?.mealBlockingConflicts ?? 0,
      mealMovedAssignments: (meta?.mealMovedAssignments ?? []).slice(0, 50),
      cpSatAttempted: meta?.cpSatAttempted ?? false,
      cpSatAccepted: meta?.cpSatAccepted ?? false,
      cpSatPilotAttempted: meta?.cpSatPilotAttempted ?? false,
      cpSatPilotAccepted: meta?.cpSatPilotAccepted ?? false,
      cpSatSegmentsAttempted: meta?.cpSatSegmentsAttempted ?? 0,
      cpSatSegmentsAccepted: meta?.cpSatSegmentsAccepted ?? 0,
      fallbackReasons: uniqueCompactReasons([
        meta?.fallbackReason,
        meta?.backtrackingFallbackReason,
        meta?.cpSatReason,
        meta?.cpSatPilotReason,
        ...(meta?.cpSatSegmentReasons ?? []),
      ]),
      declaredResourceBundleCount: resourceDiagnostics.declaredResourceBundleCount,
      usableResourceBundleCount: resourceDiagnostics.usableResourceBundleCount,
      invalidResourceBundleCount: resourceDiagnostics.invalidResourceBundleCount,
      partiallyUsableResourceBundleCount: resourceDiagnostics.partiallyUsableResourceBundleCount,
      hardConstraintViolationDetails: hardValidation.hardConstraintViolationDetails,
      hardConstraintViolationCodes: hardValidation.hardConstraintViolationCodes,
      hardValidationPassed: hardValidation.hardValidationPassed,
      hardConstraintViolationDetailsTruncated: hardValidation.detailsTruncated,
    },
    diagnosticWarnings: {
      resourceDiagnosticWarnings: resourceDiagnostics.resourceDiagnosticWarnings
        .slice(0, MAX_WARNINGS_PER_GROUP)
        .map(compactWarning),
      resourceBundleValidationWarnings: bundleValidation.warnings
        .slice(0, MAX_WARNINGS_PER_GROUP)
        .map(compactWarning),
    },
  };
};
