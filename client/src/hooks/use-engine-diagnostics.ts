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

export type EngineDiagnosticsMetadata = {
  candidateSelectionReason?: string | null;
  candidateSolutionsEvaluated?: number | null;
  backtrackingAttempted?: boolean | null;
  backtrackingAccepted?: boolean | null;
  neighborhoodSearchAttempted?: boolean | null;
  neighborhoodCandidatesGenerated?: number | null;
  neighborhoodCandidateAccepted?: boolean | null;
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
