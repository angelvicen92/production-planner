import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api, buildUrl } from "@shared/routes";
import { getPlanningRunUiState } from "@shared/planning-run-state";
import { hasActivePlanningContext, isAbortLikeError } from "@/lib/planning-recovery";

export type PlanningRun = {
  id: number;
  planId: number;
  status:
    | "running"
    | "pending"
    | "queued"
    | "optimizing"
    | "success"
    | "infeasible"
    | "invalid"
    | "error"
    | "failed"
    | "cancelled"
    | "canceled"
    | "stale";
  stale?: boolean;
  startedAt: string;
  updatedAt: string;
  totalPending: number;
  plannedCount: number;
  message: string | null;
  phase: string | null;
  progressPct: number;
  progressMessage: string | null;
  phaseStartedAt: string | null;
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
      return getPlanningRunUiState(run) === "active" || hasPersistedContext ? 700 : false;
    },
    refetchIntervalInBackground: true,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
  });
}
