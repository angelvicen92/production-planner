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
  cpSatAttempted?: boolean | null;
  cpSatAccepted?: boolean | null;
  cpSatPilotAttempted?: boolean | null;
  cpSatPilotAccepted?: boolean | null;
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

export const engineDiagnosticsQueryKey = (planId: number | null) => [
  "engine-diagnostics",
  planId,
] as const;

export function useEngineDiagnostics(planId: number | null) {
  return useQuery<EngineDiagnostics | null>({
    queryKey: engineDiagnosticsQueryKey(planId),
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
