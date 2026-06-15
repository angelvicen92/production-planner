import type {
  EngineDiagnosticWarning,
  EngineDiagnostics,
  EngineDiagnosticsMetadata,
} from "@/hooks/use-engine-diagnostics";
import {
  calculatePlanningOperationalQuality,
  type OperationalQuality,
  type OperationalQualityInput,
} from "@/lib/planning-operational-quality";

export const ENGINE_DIAGNOSTICS_EXPORT_VERSION = 6;
export const MAX_EXPORTED_HARD_VIOLATIONS = 50;
export const MAX_EXPORTED_WARNINGS_PER_GROUP = 20;

const MAX_WARNING_TASK_IDS = 25;
const MAX_WARNING_MESSAGE_LENGTH = 500;
const MAX_METRIC_KEYS = 25;
const MAX_METRIC_ARRAY_ITEMS = 25;
const MAX_METRIC_DEPTH = 3;
const MAX_METRIC_STRING_LENGTH = 500;

type JsonPrimitive = string | number | boolean | null;
type CompactJsonValue = JsonPrimitive | CompactJsonValue[] | { [key: string]: CompactJsonValue };

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function compactJsonValue(value: unknown, depth = 0): CompactJsonValue | undefined {
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "string") {
    return typeof value === "string" && value.length > MAX_METRIC_STRING_LENGTH
      ? value.slice(0, MAX_METRIC_STRING_LENGTH)
      : value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (depth >= MAX_METRIC_DEPTH) return undefined;

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METRIC_ARRAY_ITEMS)
      .map((item) => compactJsonValue(item, depth + 1))
      .filter((item): item is CompactJsonValue => item !== undefined);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_METRIC_KEYS)
        .flatMap(([key, item]) => {
          const compacted = compactJsonValue(item, depth + 1);
          return compacted === undefined ? [] : [[key, compacted]];
        }),
    );
  }

  return undefined;
}

function compactWarning(warning: EngineDiagnosticWarning): EngineDiagnosticWarning {
  return {
    code: optionalString(warning?.code),
    severity: optionalString(warning?.severity),
    message: optionalString(warning?.message)?.slice(0, MAX_WARNING_MESSAGE_LENGTH) ?? null,
    taskIds: Array.isArray(warning?.taskIds)
      ? warning.taskIds
        .map(optionalNumber)
        .filter((taskId): taskId is number => taskId !== null)
        .slice(0, MAX_WARNING_TASK_IDS)
      : null,
    bundleId: optionalString(warning?.bundleId),
  };
}

function compactWarnings(value: unknown): EngineDiagnosticWarning[] {
  return Array.isArray(value)
    ? value
      .filter((warning): warning is EngineDiagnosticWarning => Boolean(warning) && typeof warning === "object")
      .slice(0, MAX_EXPORTED_WARNINGS_PER_GROUP)
      .map(compactWarning)
    : [];
}

const PIPELINE_REPAIRABLE_REJECTIONS = new Set([
  "resource_conflict",
  "resource_conflict_unrepaired",
  "space_conflict",
  "space_conflict_unrepaired",
  "dependency_violation",
  "dependency_conflict_unrepaired",
  "candidate_failed_hard_validation",
]);

function normalizedPipelineExport(metadata: EngineDiagnosticsMetadata) {
  const rejectedReasons = Array.isArray(metadata.pipelineRejectedReasons)
    ? metadata.pipelineRejectedReasons.map(optionalString).filter((reason): reason is string => reason !== null).slice(0, 20)
    : [];
  const repairableRejection = rejectedReasons.some((reason) => PIPELINE_REPAIRABLE_REJECTIONS.has(reason));
  const segmentRepairAttempted = optionalBoolean(metadata.pipelineSegmentRepairAttempted) ?? false;
  const segmentRepairAccepted = optionalBoolean(metadata.pipelineSegmentRepairAccepted) ?? false;
  const strategies = Array.isArray(metadata.pipelineSegmentRepairStrategiesTried)
    ? metadata.pipelineSegmentRepairStrategiesTried.map(optionalString).filter((strategy): strategy is string => strategy !== null).slice(0, 10)
    : [];
  const segmentRepairReason = !segmentRepairAttempted && repairableRejection
    ? "segment_repair_not_invoked"
    : optionalString(metadata.pipelineSegmentRepairReason)
      ?? (segmentRepairAttempted && !segmentRepairAccepted ? "repair_attempted_but_no_valid_candidate" : "not_attempted");
  const conflictDetails = Array.isArray(metadata.pipelineConflictDetails)
    ? metadata.pipelineConflictDetails.slice(0, 10).map((detail: any) => ({
      ...detail,
      candidateName: optionalString(detail?.candidateName) ?? "pipeline_builder",
      violationCode: optionalString(detail?.violationCode) ?? "HARD_VALIDATION_FAILURE",
      taskIds: Array.isArray(detail?.taskIds) ? detail.taskIds.slice(0, 6) : [],
      taskNames: Array.isArray(detail?.taskNames) ? detail.taskNames.slice(0, 6) : [],
      blockingTaskIds: Array.isArray(detail?.blockingTaskIds) ? detail.blockingTaskIds.slice(0, 6) : [],
      blockingTaskNames: Array.isArray(detail?.blockingTaskNames) ? detail.blockingTaskNames.slice(0, 6) : [],
      movableTaskIds: Array.isArray(detail?.movableTaskIds) ? detail.movableTaskIds.slice(0, 6) : [],
      lockedOrExecutedTaskIds: Array.isArray(detail?.lockedOrExecutedTaskIds) ? detail.lockedOrExecutedTaskIds.slice(0, 6) : [],
      talentNames: Array.isArray(detail?.talentNames) ? detail.talentNames.slice(0, 6) : [],
      repairAttempted: optionalBoolean(detail?.repairAttempted) ?? segmentRepairAttempted,
      repairStrategy: optionalString(detail?.repairStrategy) ?? (strategies.join(",") || "none"),
      repairResult: optionalString(detail?.repairResult) ?? segmentRepairReason,
      message: optionalString(detail?.message) ?? "conflict_detail_unavailable_from_validator",
    }))
    : [];
  if (conflictDetails.length === 0 && repairableRejection) {
    conflictDetails.push({
      candidateName: "pipeline_builder",
      violationCode: rejectedReasons.some((reason) => reason.includes("resource_conflict"))
        ? "RESOURCE_OVERLAP"
        : rejectedReasons.some((reason) => reason.includes("space_conflict"))
          ? "SPACE_OVERLAP"
          : rejectedReasons.some((reason) => reason.includes("dependency"))
            ? "DEPENDENCY_VIOLATION"
            : "HARD_VALIDATION_FAILURE",
      taskIds: [],
      taskNames: [],
      blockingTaskIds: [],
      blockingTaskNames: [],
      movableTaskIds: [],
      lockedOrExecutedTaskIds: [],
      talentNames: [],
      repairAttempted: segmentRepairAttempted,
      repairStrategy: strategies.join(",") || "none",
      repairResult: segmentRepairReason,
      message: "conflict_detail_unavailable_from_validator",
    });
  }
  return { conflictDetails, segmentRepairAttempted, segmentRepairAccepted, segmentRepairReason, strategies };
}

export type EngineDiagnosticsSnapshot = {
  exportVersion: number;
  generatedAt: string;
  planId: number | null;
  runId: number | null;
  engineVersion: string | null;
  status: string | null;
  solutionSource: string | null;
  createdAt: string | null;
  summary: {
    plannedTasks: number | null;
    unplannedTasks: number | null;
    hardConstraintViolations: number | null;
    hardValidationPassed: boolean | null;
    hardConstraintViolationCodes: string[];
    hardConstraintViolationDetails: CompactJsonValue[];
    mainStageGapMinutes: number | null;
    mainStageGapCount: number | null;
    coachSwitchCount: number | null;
    restrictiveTalentAverageStartOffset: number | null;
  };
  intelligence: {
    candidateSolutionsEvaluated: number | null;
    candidateSelectionReason: string | null;
    backtrackingAttempted: boolean | null;
    backtrackingAccepted: boolean | null;
    neighborhoodSearchAttempted: boolean | null;
    neighborhoodCandidatesGenerated: number | null;
    neighborhoodCandidateAccepted: boolean | null;
    operationalCompactionAttempted: boolean | null;
    operationalCompactionCandidatesGenerated: number | null;
    operationalCompactionAccepted: boolean | null;
    operationalCompactionReason: string | null;
    operationalCompactionMetricsBefore: CompactJsonValue | null;
    operationalCompactionMetricsAfter: CompactJsonValue | null;
    coachCompactionAttempted: boolean;
    coachCompactionCandidatesGenerated: number;
    coachCompactionRejectedReasons: CompactJsonValue;
    coachCompactionTargetedCoaches: CompactJsonValue;
    coachCompactionBestBefore: CompactJsonValue;
    coachCompactionBestAfter: CompactJsonValue;
    coachWaveOrderingAttempted: boolean;
    coachWaveCandidatesGenerated: number;
    coachWaveAccepted: boolean;
    coachWaveReason: string;
    coachWaveBefore: CompactJsonValue;
    coachWaveAfter: CompactJsonValue;
    segmentSolverAttempted: boolean;
    segmentSolverBackend: string;
    segmentSolverSegmentsBuilt: number;
    segmentSolverCandidatesGenerated: number;
    segmentSolverAccepted: boolean;
    segmentSolverReason: string;
    segmentSolverRejectedReasons: CompactJsonValue;
    segmentSolverTargetCoachName: string | null;
    segmentSolverWindowStart: string | null;
    segmentSolverWindowEnd: string | null;
    segmentSolverTaskCount: number | null;
    segmentSolverTalentNames: CompactJsonValue;
    segmentSolverResourceNames: CompactJsonValue;
    segmentSolverCriticalGapStart: string | null;
    segmentSolverCriticalGapEnd: string | null;
    segmentSolverCriticalGapMinutes: number | null;
    segmentSolverLeftBlockTalentNames: CompactJsonValue;
    segmentSolverRightBlockTalentNames: CompactJsonValue;
    segmentSolverMicroSegmentsBuilt: number;
    segmentSolverMicroSegmentStrategiesTried: CompactJsonValue;
    segmentSolverMicroSegmentTaskCounts: CompactJsonValue;
    segmentSolverMicroSegmentRejectedReasons: CompactJsonValue;
    segmentSolverAssignmentsExplored: number;
    segmentSolverValidCandidates: number;
    segmentSolverBestCandidateMovedTaskIds: CompactJsonValue;
    segmentSolverBestCandidateMovedTalentNames: CompactJsonValue;
    segmentSolverBestCandidateReason: string | null;
    segmentSolverBestBefore: CompactJsonValue;
    segmentSolverBestAfter: CompactJsonValue;
    segmentSolverImprovement: string | null;
    segmentSolverTimeoutMs: number;
    segmentSolverElapsedMs: number;
    segmentSolverMealMovesAttempted: boolean;
    segmentSolverMealMovesAccepted: boolean;
    segmentSolverMealMoveCount: number;
    segmentSolverMealRejectedReasons: CompactJsonValue;
    segmentSolverTopBlockers: CompactJsonValue;
    segmentSolverTopResourceBlockers: CompactJsonValue;
    segmentSolverTopDependencyBlockers: CompactJsonValue;
    segmentSolverTopMealBlockers: CompactJsonValue;
    segmentSolverTopMainStageBlockers: CompactJsonValue;
    segmentSolverLocalChecksPerformed: number;
    segmentSolverLocalChecksRejected: number;
    segmentSolverFullValidationsPerformed: number;
    segmentSolverFullValidationsRejected: number;
    segmentSolverExpandedMicroSegmentsBuilt: number;
    segmentSolverExpansionTaskIds: CompactJsonValue;
    segmentSolverExpansionReasons: CompactJsonValue;
    segmentSolverExpansionRejectedReasons: CompactJsonValue;
    segmentSolverDirectRepairsAttempted: number;
    segmentSolverDirectRepairsAccepted: number;
    segmentSolverDirectRepairStrategiesTried: CompactJsonValue;
    segmentSolverDirectRepairRejectedReasons: CompactJsonValue;
    segmentSolverRepairChainsAttempted: number;
    segmentSolverRepairChainsAccepted: number;
    segmentSolverRepairChainMaxDepthReached: number;
    segmentSolverRepairChainDepths: CompactJsonValue;
    segmentSolverRepairChainMovedTaskIds: CompactJsonValue;
    segmentSolverRepairChainBlockedBy: CompactJsonValue;
    segmentSolverRepairChainRejectedReasons: CompactJsonValue;
    segmentSolverCandidateMetrics: CompactJsonValue;
    segmentSolverFeasibleButNotSelected: boolean;
    pipelineBuilderAttempted: boolean;
    pipelineCandidatesGenerated: number;
    pipelineAccepted: boolean;
    pipelineReason: string;
    pipelineRejectedReasons: CompactJsonValue;
    pipelineBefore: CompactJsonValue;
    pipelineAfter: CompactJsonValue;
    pipelineMappedTalents: CompactJsonValue;
    pipelineUnmappedTalents: CompactJsonValue;
    pipelineMovedTasks: CompactJsonValue;
    pipelineStableTasks: CompactJsonValue;
    pipelineFeederOutcomes: CompactJsonValue;
    pipelineRepairAttempted: boolean;
    pipelineRepairCandidatesGenerated: number;
    pipelineRepairAccepted: boolean;
    pipelineConflictDetails: CompactJsonValue;
    pipelineSegmentRepairAttempted: boolean;
    pipelineSegmentRepairCandidatesGenerated: number;
    pipelineSegmentRepairAccepted: boolean;
    pipelineSegmentRepairReason: string;
    pipelineSegmentRepairStrategiesTried: CompactJsonValue;
    pipelineSegmentRepairMovedTalentNames: CompactJsonValue;
    pipelineSegmentRepairRejectedReasons: CompactJsonValue;
    mealMode: "global_hard_break" | "flexible_meal_window";
    mealModeReason: string;
    mealWindowStart: string | null;
    mealWindowEnd: string | null;
    mealDurationMinutes: number | null;
    mealSchedulerAttempted: boolean;
    mealAssignmentsGenerated: number;
    mealSchedulerAccepted: boolean;
    mealSchedulerReason: string;
    mealSchedulerRejectedReasons: CompactJsonValue;
    mealBlockingConflicts: number;
    mealMovedAssignments: CompactJsonValue;
    mealSchedulerPhase: "post_pipeline";
    mealSchedulerCouldAffectPipeline: boolean;
    mealSchedulerPipelineIntegrationReason: string;
    cpSatPilotAttempted: boolean | null;
    cpSatPilotAccepted: boolean | null;
    cpSatPilotReason: string | null;
    cpSatSegmentsAttempted: number | null;
    cpSatSegmentsAccepted: number | null;
  };
  selectedCandidateMetrics: CompactJsonValue | null;
  humanReviewTemplate: {
    observedIssue: null;
    expectedBehavior: null;
    criticalTalentOrResource: null;
    notes: null;
  };
  resourceBundles: {
    declared: number | null;
    usable: number | null;
    invalid: number | null;
    partiallyUsable: number | null;
  };
  warnings: {
    resourceDiagnosticWarnings: EngineDiagnosticWarning[];
    resourceBundleValidationWarnings: EngineDiagnosticWarning[];
  };
  operationalQuality: OperationalQuality;
};

export function buildEngineDiagnosticsSnapshot(
  diagnostics: EngineDiagnostics,
  options: { generatedAt?: Date; planId?: number; operationalQualityInput?: OperationalQualityInput } = {},
): EngineDiagnosticsSnapshot {
  const metadata = diagnostics?.engineMetadata ?? {};
  const warnings = diagnostics?.diagnosticWarnings ?? {};
  const selectedCandidateMetrics = compactJsonValue(diagnostics?.selectedCandidateMetrics);
  const pipeline = normalizedPipelineExport(metadata);

  return {
    exportVersion: ENGINE_DIAGNOSTICS_EXPORT_VERSION,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    planId: optionalNumber(diagnostics?.planId) ?? optionalNumber(options.planId),
    runId: optionalNumber(diagnostics?.id),
    engineVersion: optionalString(diagnostics?.engineVersion),
    status: optionalString(diagnostics?.status),
    solutionSource: optionalString(diagnostics?.solutionSource),
    createdAt: optionalString(diagnostics?.createdAt),
    summary: {
      plannedTasks: optionalNumber(diagnostics?.plannedTasks),
      unplannedTasks: optionalNumber(diagnostics?.unplannedTasks),
      hardConstraintViolations: optionalNumber(diagnostics?.hardConstraintViolations),
      hardValidationPassed: optionalBoolean(diagnostics?.hardValidationPassed ?? metadata.hardValidationPassed),
      hardConstraintViolationCodes: (Array.isArray(diagnostics?.hardConstraintViolationCodes)
        ? diagnostics.hardConstraintViolationCodes
        : Array.isArray(metadata.hardConstraintViolationCodes) ? metadata.hardConstraintViolationCodes : [])
        .map(optionalString).filter((code): code is string => code !== null).slice(0, 20),
      hardConstraintViolationDetails: (Array.isArray(diagnostics?.hardConstraintViolationDetails)
        ? diagnostics.hardConstraintViolationDetails
        : Array.isArray(metadata.hardConstraintViolationDetails) ? metadata.hardConstraintViolationDetails : [])
        .slice(0, MAX_EXPORTED_HARD_VIOLATIONS)
        .map((detail) => compactJsonValue(detail))
        .filter((detail): detail is CompactJsonValue => detail !== undefined),
      mainStageGapMinutes: optionalNumber(diagnostics?.mainStageGapMinutes),
      mainStageGapCount: optionalNumber(diagnostics?.mainStageGapCount),
      coachSwitchCount: optionalNumber(diagnostics?.coachSwitchCount),
      restrictiveTalentAverageStartOffset: optionalNumber(diagnostics?.restrictiveTalentAverageStartOffset),
    },
    intelligence: {
      candidateSolutionsEvaluated: optionalNumber(metadata.candidateSolutionsEvaluated),
      candidateSelectionReason: optionalString(metadata.candidateSelectionReason),
      backtrackingAttempted: optionalBoolean(metadata.backtrackingAttempted),
      backtrackingAccepted: optionalBoolean(metadata.backtrackingAccepted),
      neighborhoodSearchAttempted: optionalBoolean(metadata.neighborhoodSearchAttempted),
      neighborhoodCandidatesGenerated: optionalNumber(metadata.neighborhoodCandidatesGenerated),
      neighborhoodCandidateAccepted: optionalBoolean(metadata.neighborhoodCandidateAccepted),
      operationalCompactionAttempted: optionalBoolean(metadata.operationalCompactionAttempted),
      operationalCompactionCandidatesGenerated: optionalNumber(metadata.operationalCompactionCandidatesGenerated),
      operationalCompactionAccepted: optionalBoolean(metadata.operationalCompactionAccepted),
      operationalCompactionReason: optionalString(metadata.operationalCompactionReason),
      operationalCompactionMetricsBefore: compactJsonValue(metadata.operationalCompactionMetricsBefore) ?? null,
      operationalCompactionMetricsAfter: compactJsonValue(metadata.operationalCompactionMetricsAfter) ?? null,
      coachCompactionAttempted: optionalBoolean(metadata.coachCompactionAttempted) ?? false,
      coachCompactionCandidatesGenerated: optionalNumber(metadata.coachCompactionCandidatesGenerated) ?? 0,
      coachCompactionRejectedReasons: compactJsonValue(metadata.coachCompactionRejectedReasons) ?? [],
      coachCompactionTargetedCoaches: compactJsonValue(metadata.coachCompactionTargetedCoaches) ?? [],
      coachCompactionBestBefore: compactJsonValue(metadata.coachCompactionBestBefore) ?? {},
      coachCompactionBestAfter: compactJsonValue(metadata.coachCompactionBestAfter) ?? {},
      coachWaveOrderingAttempted: optionalBoolean(metadata.coachWaveOrderingAttempted) ?? false,
      coachWaveCandidatesGenerated: optionalNumber(metadata.coachWaveCandidatesGenerated) ?? 0,
      coachWaveAccepted: optionalBoolean(metadata.coachWaveAccepted) ?? false,
      coachWaveReason: optionalString(metadata.coachWaveReason) ?? "generator_not_invoked",
      coachWaveBefore: compactJsonValue(metadata.coachWaveBefore) ?? {},
      coachWaveAfter: compactJsonValue(metadata.coachWaveAfter) ?? {},
      segmentSolverAttempted: optionalBoolean(metadata.segmentSolverAttempted) ?? false,
      segmentSolverBackend: optionalString(metadata.segmentSolverBackend) ?? "bounded_exact_search",
      segmentSolverSegmentsBuilt: optionalNumber(metadata.segmentSolverSegmentsBuilt) ?? 0,
      segmentSolverCandidatesGenerated: optionalNumber(metadata.segmentSolverCandidatesGenerated) ?? 0,
      segmentSolverAccepted: optionalBoolean(metadata.segmentSolverAccepted) ?? false,
      segmentSolverReason: optionalString(metadata.segmentSolverReason) ?? "no_problematic_coach_segment",
      segmentSolverRejectedReasons: compactJsonValue(metadata.segmentSolverRejectedReasons) ?? [],
      segmentSolverTargetCoachName: optionalString(metadata.segmentSolverTargetCoachName),
      segmentSolverWindowStart: optionalString(metadata.segmentSolverWindowStart),
      segmentSolverWindowEnd: optionalString(metadata.segmentSolverWindowEnd),
      segmentSolverTaskCount: optionalNumber(metadata.segmentSolverTaskCount),
      segmentSolverTalentNames: compactJsonValue(metadata.segmentSolverTalentNames) ?? [],
      segmentSolverResourceNames: compactJsonValue(metadata.segmentSolverResourceNames) ?? [],
      segmentSolverCriticalGapStart: optionalString(metadata.segmentSolverCriticalGapStart),
      segmentSolverCriticalGapEnd: optionalString(metadata.segmentSolverCriticalGapEnd),
      segmentSolverCriticalGapMinutes: optionalNumber(metadata.segmentSolverCriticalGapMinutes),
      segmentSolverLeftBlockTalentNames: compactJsonValue(metadata.segmentSolverLeftBlockTalentNames) ?? [],
      segmentSolverRightBlockTalentNames: compactJsonValue(metadata.segmentSolverRightBlockTalentNames) ?? [],
      segmentSolverMicroSegmentsBuilt: optionalNumber(metadata.segmentSolverMicroSegmentsBuilt) ?? 0,
      segmentSolverMicroSegmentStrategiesTried: compactJsonValue(metadata.segmentSolverMicroSegmentStrategiesTried) ?? [],
      segmentSolverMicroSegmentTaskCounts: compactJsonValue(metadata.segmentSolverMicroSegmentTaskCounts) ?? [],
      segmentSolverMicroSegmentRejectedReasons: compactJsonValue(metadata.segmentSolverMicroSegmentRejectedReasons) ?? [],
      segmentSolverAssignmentsExplored: optionalNumber(metadata.segmentSolverAssignmentsExplored) ?? 0,
      segmentSolverValidCandidates: optionalNumber(metadata.segmentSolverValidCandidates) ?? 0,
      segmentSolverBestCandidateMovedTaskIds: compactJsonValue(metadata.segmentSolverBestCandidateMovedTaskIds) ?? [],
      segmentSolverBestCandidateMovedTalentNames: compactJsonValue(metadata.segmentSolverBestCandidateMovedTalentNames) ?? [],
      segmentSolverBestCandidateReason: optionalString(metadata.segmentSolverBestCandidateReason),
      segmentSolverBestBefore: compactJsonValue(metadata.segmentSolverBestBefore) ?? {},
      segmentSolverBestAfter: compactJsonValue(metadata.segmentSolverBestAfter) ?? {},
      segmentSolverImprovement: optionalString(metadata.segmentSolverImprovement),
      segmentSolverTimeoutMs: optionalNumber(metadata.segmentSolverTimeoutMs) ?? 0,
      segmentSolverElapsedMs: optionalNumber(metadata.segmentSolverElapsedMs) ?? 0,
      segmentSolverMealMovesAttempted: optionalBoolean(metadata.segmentSolverMealMovesAttempted) ?? false,
      segmentSolverMealMovesAccepted: optionalBoolean(metadata.segmentSolverMealMovesAccepted) ?? false,
      segmentSolverMealMoveCount: optionalNumber(metadata.segmentSolverMealMoveCount) ?? 0,
      segmentSolverMealRejectedReasons: compactJsonValue(metadata.segmentSolverMealRejectedReasons) ?? [],
      segmentSolverTopBlockers: compactJsonValue(metadata.segmentSolverTopBlockers) ?? [],
      segmentSolverTopResourceBlockers: compactJsonValue(metadata.segmentSolverTopResourceBlockers) ?? [],
      segmentSolverTopDependencyBlockers: compactJsonValue(metadata.segmentSolverTopDependencyBlockers) ?? [],
      segmentSolverTopMealBlockers: compactJsonValue(metadata.segmentSolverTopMealBlockers) ?? [],
      segmentSolverTopMainStageBlockers: compactJsonValue(metadata.segmentSolverTopMainStageBlockers) ?? [],
      segmentSolverLocalChecksPerformed: optionalNumber(metadata.segmentSolverLocalChecksPerformed) ?? 0,
      segmentSolverLocalChecksRejected: optionalNumber(metadata.segmentSolverLocalChecksRejected) ?? 0,
      segmentSolverFullValidationsPerformed: optionalNumber(metadata.segmentSolverFullValidationsPerformed) ?? 0,
      segmentSolverFullValidationsRejected: optionalNumber(metadata.segmentSolverFullValidationsRejected) ?? 0,
      segmentSolverExpandedMicroSegmentsBuilt: optionalNumber(metadata.segmentSolverExpandedMicroSegmentsBuilt) ?? 0,
      segmentSolverExpansionTaskIds: compactJsonValue(metadata.segmentSolverExpansionTaskIds) ?? [],
      segmentSolverExpansionReasons: compactJsonValue(metadata.segmentSolverExpansionReasons) ?? [],
      segmentSolverExpansionRejectedReasons: compactJsonValue(metadata.segmentSolverExpansionRejectedReasons) ?? [],
      segmentSolverDirectRepairsAttempted: optionalNumber(metadata.segmentSolverDirectRepairsAttempted) ?? 0,
      segmentSolverDirectRepairsAccepted: optionalNumber(metadata.segmentSolverDirectRepairsAccepted) ?? 0,
      segmentSolverDirectRepairStrategiesTried: compactJsonValue(metadata.segmentSolverDirectRepairStrategiesTried) ?? [],
      segmentSolverDirectRepairRejectedReasons: compactJsonValue(metadata.segmentSolverDirectRepairRejectedReasons) ?? [],
      segmentSolverRepairChainsAttempted: optionalNumber(metadata.segmentSolverRepairChainsAttempted) ?? 0,
      segmentSolverRepairChainsAccepted: optionalNumber(metadata.segmentSolverRepairChainsAccepted) ?? 0,
      segmentSolverRepairChainMaxDepthReached: optionalNumber(metadata.segmentSolverRepairChainMaxDepthReached) ?? 0,
      segmentSolverRepairChainDepths: compactJsonValue(metadata.segmentSolverRepairChainDepths) ?? [],
      segmentSolverRepairChainMovedTaskIds: compactJsonValue(metadata.segmentSolverRepairChainMovedTaskIds) ?? [],
      segmentSolverRepairChainBlockedBy: compactJsonValue(metadata.segmentSolverRepairChainBlockedBy) ?? [],
      segmentSolverRepairChainRejectedReasons: compactJsonValue(metadata.segmentSolverRepairChainRejectedReasons) ?? [],
      segmentSolverCandidateMetrics: compactJsonValue(metadata.segmentSolverCandidateMetrics) ?? [],
      segmentSolverFeasibleButNotSelected: optionalBoolean(metadata.segmentSolverFeasibleButNotSelected) ?? false,
      pipelineBuilderAttempted: optionalBoolean(metadata.pipelineBuilderAttempted) ?? false,
      pipelineCandidatesGenerated: optionalNumber(metadata.pipelineCandidatesGenerated) ?? 0,
      pipelineAccepted: optionalBoolean(metadata.pipelineAccepted) ?? false,
      pipelineReason: optionalString(metadata.pipelineReason) ?? "generator_not_invoked",
      pipelineRejectedReasons: compactJsonValue(Array.isArray(metadata.pipelineRejectedReasons) ? metadata.pipelineRejectedReasons.slice(0, 20) : []) ?? [],
      pipelineBefore: compactJsonValue(metadata.pipelineBefore) ?? {},
      pipelineAfter: compactJsonValue(metadata.pipelineAfter) ?? {},
      pipelineMappedTalents: compactJsonValue(Array.isArray(metadata.pipelineMappedTalents) ? metadata.pipelineMappedTalents.slice(0, 20) : []) ?? [],
      pipelineUnmappedTalents: compactJsonValue(Array.isArray(metadata.pipelineUnmappedTalents) ? metadata.pipelineUnmappedTalents.slice(0, 20) : []) ?? [],
      pipelineMovedTasks: compactJsonValue(Array.isArray(metadata.pipelineMovedTasks) ? metadata.pipelineMovedTasks.slice(0, 50) : []) ?? [],
      pipelineStableTasks: compactJsonValue(Array.isArray(metadata.pipelineStableTasks) ? metadata.pipelineStableTasks.slice(0, 50) : []) ?? [],
      pipelineFeederOutcomes: compactJsonValue(Array.isArray(metadata.pipelineFeederOutcomes) ? metadata.pipelineFeederOutcomes.slice(0, 10) : []) ?? [],
      pipelineRepairAttempted: optionalBoolean(metadata.pipelineRepairAttempted) ?? false,
      pipelineRepairCandidatesGenerated: optionalNumber(metadata.pipelineRepairCandidatesGenerated) ?? 0,
      pipelineRepairAccepted: optionalBoolean(metadata.pipelineRepairAccepted) ?? false,
      pipelineConflictDetails: compactJsonValue(pipeline.conflictDetails) ?? [],
      pipelineSegmentRepairAttempted: pipeline.segmentRepairAttempted,
      pipelineSegmentRepairCandidatesGenerated: optionalNumber(metadata.pipelineSegmentRepairCandidatesGenerated) ?? 0,
      pipelineSegmentRepairAccepted: pipeline.segmentRepairAccepted,
      pipelineSegmentRepairReason: pipeline.segmentRepairReason,
      pipelineSegmentRepairStrategiesTried: compactJsonValue(pipeline.strategies) ?? [],
      pipelineSegmentRepairMovedTalentNames: compactJsonValue(Array.isArray(metadata.pipelineSegmentRepairMovedTalentNames)
        ? metadata.pipelineSegmentRepairMovedTalentNames.slice(0, 20) : []) ?? [],
      pipelineSegmentRepairRejectedReasons: compactJsonValue(Array.isArray(metadata.pipelineSegmentRepairRejectedReasons)
        ? metadata.pipelineSegmentRepairRejectedReasons.slice(0, 10) : []) ?? [],
      mealMode: metadata.mealMode === "flexible_meal_window" ? "flexible_meal_window" : "global_hard_break",
      mealModeReason: optionalString(metadata.mealModeReason) ?? "meal_mode_inferred_legacy_global_break",
      mealWindowStart: optionalString(metadata.mealWindowStart),
      mealWindowEnd: optionalString(metadata.mealWindowEnd),
      mealDurationMinutes: optionalNumber(metadata.mealDurationMinutes),
      mealSchedulerAttempted: optionalBoolean(metadata.mealSchedulerAttempted) ?? false,
      mealAssignmentsGenerated: optionalNumber(metadata.mealAssignmentsGenerated) ?? 0,
      mealSchedulerAccepted: optionalBoolean(metadata.mealSchedulerAccepted) ?? false,
      mealSchedulerReason: optionalString(metadata.mealSchedulerReason) ?? "generator_not_invoked",
      mealSchedulerRejectedReasons: compactJsonValue(Array.isArray(metadata.mealSchedulerRejectedReasons)
        ? metadata.mealSchedulerRejectedReasons.slice(0, 20) : []) ?? [],
      mealBlockingConflicts: optionalNumber(metadata.mealBlockingConflicts) ?? 0,
      mealMovedAssignments: compactJsonValue(Array.isArray(metadata.mealMovedAssignments)
        ? metadata.mealMovedAssignments.slice(0, 50) : []) ?? [],
      mealSchedulerPhase: "post_pipeline",
      mealSchedulerCouldAffectPipeline: optionalBoolean(metadata.mealSchedulerCouldAffectPipeline) ?? false,
      mealSchedulerPipelineIntegrationReason: optionalString(metadata.mealSchedulerPipelineIntegrationReason)
        ?? "meal_scheduler_runs_after_pipeline_selection",
      cpSatPilotAttempted: optionalBoolean(metadata.cpSatPilotAttempted),
      cpSatPilotAccepted: optionalBoolean(metadata.cpSatPilotAccepted),
      cpSatPilotReason: optionalString(metadata.cpSatPilotReason) ?? "missing_solver_runtime",
      cpSatSegmentsAttempted: optionalNumber(metadata.cpSatSegmentsAttempted),
      cpSatSegmentsAccepted: optionalNumber(metadata.cpSatSegmentsAccepted),
    },
    selectedCandidateMetrics: selectedCandidateMetrics ?? null,
    humanReviewTemplate: {
      observedIssue: null,
      expectedBehavior: null,
      criticalTalentOrResource: null,
      notes: null,
    },
    resourceBundles: {
      declared: optionalNumber(metadata.declaredResourceBundleCount),
      usable: optionalNumber(metadata.usableResourceBundleCount),
      invalid: optionalNumber(metadata.invalidResourceBundleCount),
      partiallyUsable: optionalNumber(metadata.partiallyUsableResourceBundleCount),
    },
    warnings: {
      resourceDiagnosticWarnings: compactWarnings(warnings.resourceDiagnosticWarnings),
      resourceBundleValidationWarnings: compactWarnings(warnings.resourceBundleValidationWarnings),
    },
    operationalQuality: calculatePlanningOperationalQuality(options.operationalQualityInput),
  };
}

export function engineDiagnosticsFilename(snapshot: EngineDiagnosticsSnapshot): string {
  const planId = snapshot.planId ?? "unknown";
  const runId = snapshot.runId ?? "unknown";
  return `engine-diagnostics-plan-${planId}-${runId}.json`;
}

export type DiagnosticsExportAvailability = {
  ready: boolean;
  reason: "ready" | "planning_active" | "refreshing" | "stale_run" | "load_failed" | "missing_diagnostics";
  message: string;
};

export function getDiagnosticsExportAvailability(input: {
  planningActive: boolean;
  latestSuccessRunId: number | null;
  diagnosticsRunId: number | null;
  isFetching?: boolean;
  isError?: boolean;
}): DiagnosticsExportAvailability {
  if (input.planningActive) return { ready: false, reason: "planning_active", message: "El JSON estará disponible al finalizar esta planificación." };
  if (input.isError) return { ready: false, reason: "load_failed", message: "No se pudo cargar el diagnóstico actualizado" };
  if (input.isFetching) return { ready: false, reason: "refreshing", message: "Cargando el diagnóstico actualizado…" };
  if (input.diagnosticsRunId === null) return { ready: false, reason: "missing_diagnostics", message: "Aún no hay un diagnóstico disponible." };
  if (input.latestSuccessRunId !== null && input.diagnosticsRunId !== input.latestSuccessRunId) {
    return { ready: false, reason: "stale_run", message: "Cargando el diagnóstico del último run correcto…" };
  }
  return { ready: true, reason: "ready", message: "JSON actualizado disponible." };
}
