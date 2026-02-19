import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api, buildUrl } from "@shared/routes";

export type PlanningRun = {
  id: number;
  planId: number;
  status: "running" | "success" | "infeasible" | "error";
  startedAt: string;
  updatedAt: string;
  totalPending: number;
  plannedCount: number;
  message: string | null;
  phase: string | null;
  lastTaskId: number | null;
  lastTaskName: string | null;
  lastReasons: any[] | null;
  requestId: string | null;
};

export function usePlanningRun(planId: number | null) {
  return useQuery<PlanningRun | null>({
    queryKey: ["planning-run", planId],
    enabled: Number.isFinite(planId) && Number(planId) > 0,
    queryFn: () => apiRequest("GET", buildUrl(api.planningRuns.latestByPlan.path, { id: Number(planId) })),
    refetchInterval: (query) => {
      const run = query.state.data as PlanningRun | null | undefined;
      return run?.status === "running" ? 700 : false;
    },
    refetchOnWindowFocus: true,
  });
}
