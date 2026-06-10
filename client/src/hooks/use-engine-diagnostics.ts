import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api, buildUrl } from "@shared/routes";

export type EngineDiagnosticWarning = {
  code?: string | null;
  severity?: "info" | "warning" | string | null;
  message?: string | null;
  taskIds?: number[] | null;
  bundleId?: string | null;
};

export type EngineHardViolationDetail = {
  code?: string | null;
  severity?: "hard" | string | null;
  message?: string | null;
  taskIds?: number[] | null;
  resourceId?: number | null;
  spaceId?: number | null;
  spaceName?: string | null;
  spaceCapacity?: number | null;
  observedConcurrency?: number | null;
  capacitySource?: "transport_van_capacity" | "space_max_concurrency" | "default_exclusive" | string | null;
  taskNames?: string[] | null;
  templateNames?: string[] | null;
  contestantId?: number | null;
  start?: string | null;
  end?: string | null;
  details?: Record<string, unknown> | null;
};

export type EngineDiagnosticsMetadata = {
  candidateSelectionReason?: string | null;
  candidateSolutionsEvaluated?: number | null;
  backtrackingAttempted?: boolean | null;
  backtrackingAccepted?: boolean | null;
  neighborhoodSearchAttempted?: boolean | null;
  neighborhoodCandidatesGenerated?: number | null;
  neighborhoodCandidateAccepted?: boolean | null;
  operationalCompactionAttempted?: boolean | null;
  operationalCompactionCandidatesGenerated?: number | null;
  operationalCompactionAccepted?: boolean | null;
  operationalCompactionReason?: string | null;
  operationalCompactionMetricsBefore?: Record<string, unknown> | null;
  operationalCompactionMetricsAfter?: Record<string, unknown> | null;
  coachCompactionAttempted?: boolean | null;
  coachCompactionCandidatesGenerated?: number | null;
  coachCompactionRejectedReasons?: string[] | null;
  coachCompactionTargetedCoaches?: Array<{ coachId: number | null; coachName: string; maxGapMinutes: number; spanMinutes: number; idleMinutes: number }> | null;
  coachCompactionBestBefore?: Record<string, unknown> | null;
  coachCompactionBestAfter?: Record<string, unknown> | null;
  coachWaveOrderingAttempted?: boolean | null;
  coachWaveCandidatesGenerated?: number | null;
  coachWaveAccepted?: boolean | null;
  coachWaveReason?: string | null;
  coachWaveBefore?: Record<string, unknown> | null;
  coachWaveAfter?: Record<string, unknown> | null;
  segmentSolverAttempted?: boolean | null;
  segmentSolverBackend?: string | null;
  segmentSolverSegmentsBuilt?: number | null;
  segmentSolverCandidatesGenerated?: number | null;
  segmentSolverAccepted?: boolean | null;
  segmentSolverReason?: string | null;
  segmentSolverRejectedReasons?: string[] | null;
  segmentSolverTargetCoachName?: string | null;
  segmentSolverWindowStart?: string | null;
  segmentSolverWindowEnd?: string | null;
  segmentSolverTaskCount?: number | null;
  segmentSolverTalentNames?: string[] | null;
  segmentSolverResourceNames?: string[] | null;
  segmentSolverBestBefore?: Record<string, unknown> | null;
  segmentSolverBestAfter?: Record<string, unknown> | null;
  segmentSolverImprovement?: string | null;
  segmentSolverTimeoutMs?: number | null;
  segmentSolverElapsedMs?: number | null;
  segmentSolverMealMovesAttempted?: boolean | null;
  segmentSolverMealMovesAccepted?: boolean | null;
  segmentSolverMealMoveCount?: number | null;
  segmentSolverMealRejectedReasons?: string[] | null;
  pipelineBuilderAttempted?: boolean | null;
  pipelineCandidatesGenerated?: number | null;
  pipelineAccepted?: boolean | null;
  pipelineReason?: string | null;
  pipelineRejectedReasons?: string[] | null;
  pipelineBefore?: Record<string, unknown> | null;
  pipelineAfter?: Record<string, unknown> | null;
  pipelineMappedTalents?: string[] | null;
  pipelineUnmappedTalents?: string[] | null;
  pipelineMovedTasks?: number[] | null;
  pipelineStableTasks?: number[] | null;
  pipelineFeederOutcomes?: string[] | null;
  pipelineRepairAttempted?: boolean | null;
  pipelineRepairCandidatesGenerated?: number | null;
  pipelineRepairAccepted?: boolean | null;
  pipelineConflictDetails?: Array<Record<string, unknown>> | null;
  pipelineSegmentRepairAttempted?: boolean | null;
  pipelineSegmentRepairCandidatesGenerated?: number | null;
  pipelineSegmentRepairAccepted?: boolean | null;
  pipelineSegmentRepairReason?: string | null;
  pipelineSegmentRepairStrategiesTried?: string[] | null;
  pipelineSegmentRepairMovedTalentNames?: string[] | null;
  pipelineSegmentRepairRejectedReasons?: string[] | null;
  mealMode?: "global_hard_break" | "flexible_meal_window" | null;
  mealModeReason?: string | null;
  mealWindowStart?: string | null;
  mealWindowEnd?: string | null;
  mealDurationMinutes?: number | null;
  mealSchedulerAttempted?: boolean | null;
  mealAssignmentsGenerated?: number | null;
  mealSchedulerAccepted?: boolean | null;
  mealSchedulerReason?: string | null;
  mealSchedulerRejectedReasons?: string[] | null;
  mealBlockingConflicts?: number | null;
  mealMovedAssignments?: Array<Record<string, unknown>> | null;
  mealSchedulerPhase?: "post_pipeline" | null;
  mealSchedulerCouldAffectPipeline?: boolean | null;
  mealSchedulerPipelineIntegrationReason?: string | null;
  cpSatAttempted?: boolean | null;
  cpSatAccepted?: boolean | null;
  cpSatPilotAttempted?: boolean | null;
  cpSatPilotAccepted?: boolean | null;
  cpSatPilotReason?: string | null;
  cpSatSegmentsAttempted?: number | null;
  cpSatSegmentsAccepted?: number | null;
  declaredResourceBundleCount?: number | null;
  usableResourceBundleCount?: number | null;
  invalidResourceBundleCount?: number | null;
  partiallyUsableResourceBundleCount?: number | null;
  hardConstraintViolationDetails?: EngineHardViolationDetail[] | null;
  hardConstraintViolationCodes?: string[] | null;
  hardValidationPassed?: boolean | null;
  hardConstraintViolationDetailsTruncated?: boolean | null;
};

export type EngineDiagnostics = {
  id?: number | null;
  planId?: number | null;
  createdAt?: string | null;
  engineVersion?: string | null;
  solutionSource?: string | null;
  status?: "running" | "success" | "infeasible" | "error" | string | null;
  plannedTasks?: number | null;
  unplannedTasks?: number | null;
  hardConstraintViolations?: number | null;
  hardConstraintViolationDetails?: EngineHardViolationDetail[] | null;
  hardConstraintViolationCodes?: string[] | null;
  hardValidationPassed?: boolean | null;
  mainStageGapMinutes?: number | null;
  mainStageGapCount?: number | null;
  coachSwitchCount?: number | null;
  restrictiveTalentAverageStartOffset?: number | null;
  selectedCandidateMetrics?: Record<string, unknown> | null;
  engineMetadata?: EngineDiagnosticsMetadata | null;
  diagnosticWarnings?: {
    resourceDiagnosticWarnings?: EngineDiagnosticWarning[] | null;
    resourceBundleValidationWarnings?: EngineDiagnosticWarning[] | null;
  } | null;
};

type LatestEngineDiagnosticsResponse = {
  diagnostics?: EngineDiagnostics | null;
};

export const engineDiagnosticsQueryKey = (planId: number | null, latestSuccessRunId?: number | null) => latestSuccessRunId === undefined
  ? ["engine-diagnostics", planId] as const
  : ["engine-diagnostics", planId, latestSuccessRunId] as const;

export function useEngineDiagnostics(planId: number | null, latestSuccessRunId: number | null = null) {
  return useQuery<EngineDiagnostics | null>({
    queryKey: engineDiagnosticsQueryKey(planId, latestSuccessRunId),
    enabled: Number.isFinite(planId) && Number(planId) > 0,
    retry: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await apiRequest<LatestEngineDiagnosticsResponse>(
        api.planningRuns.latestEngineDiagnostics.method,
        buildUrl(api.planningRuns.latestEngineDiagnostics.path, { id: Number(planId) }),
      );

      return response?.diagnostics && typeof response.diagnostics === "object"
        ? response.diagnostics
        : null;
    },
  });
}
