import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api, buildUrl } from "@shared/routes";
import { getPlanningRunUiState } from "@shared/planning-run-state";
import { hasActivePlanningContext, isAbortLikeError, readCancelledPlanningRunId, shouldRecoverPlanningRun } from "@/lib/planning-recovery";

export type PlanningRun = {
  id: number;
  planId: number;
  status:
    | "running"
    | "pending"
    | "queued"
    | "optimizing"
    | "cancelling"
    | "success"
    | "infeasible"
    | "invalid"
    | "error"
    | "failed"
    | "cancelled"
    | "canceled"
    | "stale";
  stale?: boolean;
  cancelRequestedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  startedAt: string;
  updatedAt: string;
  totalPending: number;
  plannedCount: number;
  message: string | null;
  phase: string | null;
  progressPct: number;
  progressMessage: string | null;
  phaseStartedAt: string | null;
  lastProgressAt: string | null;
  progressHistory: Array<{ phase: string; progressPercent: number; message?: string | null; at: string }>;
  candidatesEvaluated: number;
  candidatesGenerated: number;
  currentBestReason: string | null;
  engine: "v3";
  requestedTimeLimitMs: number | null;
  finishedAt: string | null;
  lastTaskId: number | null;
  lastTaskName: string | null;
  lastReasons: any[] | null;
  requestId: string | null;
};

export function usePlanningRun(planId: number | null) {
  return useQuery<PlanningRun | null>({
    queryKey: ["planning-run", planId],
    enabled: Number.isFinite(planId) && Number(planId) > 0,
    queryFn: () =>
      apiRequest(
        "GET",
        buildUrl(api.planningRuns.latestByPlan.path, { id: Number(planId) }),
      ),
    retry: (failureCount, error) => isAbortLikeError(error) && failureCount < 5,
    retryDelay: (attempt) => Math.min(750 * (2 ** attempt), 8_000),
    refetchInterval: (query) => {
      const run = query.state.data as PlanningRun | null | undefined;
      const hasPersistedContext = typeof window !== "undefined" && hasActivePlanningContext(Number(planId), window.localStorage);
      const cancelledRunId = typeof window !== "undefined" ? readCancelledPlanningRunId(Number(planId), window.sessionStorage) : null;
      if (run && !shouldRecoverPlanningRun(run, cancelledRunId)) return false;
      if (String(run?.phase ?? "") === "persisting_result") return 300;
      return getPlanningRunUiState(run) === "active" || (hasPersistedContext && !run) ? 700 : false;
    },
    refetchIntervalInBackground: true,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
  });
}
