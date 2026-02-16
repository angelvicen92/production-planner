import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { buildUrl, api } from "@shared/routes";

export function usePlanOpsData(planId?: number | null) {
  const safePlanId = Number(planId);
  const enabled = Number.isFinite(safePlanId) && safePlanId > 0;

  const results = useQueries({
    queries: [
      {
        queryKey: [buildUrl(api.plans.get.path, { id: safePlanId })],
        queryFn: () => apiRequest("GET", buildUrl(api.plans.get.path, { id: safePlanId })),
        enabled,
      },
      {
        queryKey: [`/api/plans/${safePlanId}/tasks`],
        queryFn: () => apiRequest("GET", `/api/plans/${safePlanId}/tasks`),
        enabled,
      },
      {
        queryKey: [`/api/plans/${safePlanId}/locks`],
        queryFn: () => apiRequest("GET", `/api/plans/${safePlanId}/locks`),
        enabled,
      },
      {
        queryKey: [api.zones.list.path],
        queryFn: () => apiRequest("GET", api.zones.list.path),
      },
      {
        queryKey: [api.spaces.list.path],
        queryFn: () => apiRequest("GET", api.spaces.list.path),
      },
      {
        queryKey: [buildUrl(api.plans.staffAssignments.list.path, { id: safePlanId })],
        queryFn: () => apiRequest("GET", buildUrl(api.plans.staffAssignments.list.path, { id: safePlanId })),
        enabled,
      },
      {
        queryKey: [buildUrl(api.plans.zoneStaffModes.list.path, { id: safePlanId })],
        queryFn: () => apiRequest("GET", buildUrl(api.plans.zoneStaffModes.list.path, { id: safePlanId })),
        enabled,
      },
    ],
  });

  const [planQ, tasksQ, locksQ, zonesQ, spacesQ, staffQ, modesQ] = results;

  const error = useMemo(
    () => results.find((q) => q.error)?.error as Error | undefined,
    [results],
  );

  const refetch = async () => {
    await Promise.all(results.map((q) => q.refetch()));
  };

  return {
    data: {
      plan: (planQ.data as any) ?? null,
      tasks: (tasksQ.data as any[]) ?? [],
      locks: (locksQ.data as any[]) ?? [],
      zones: (zonesQ.data as any[]) ?? [],
      spaces: (spacesQ.data as any[]) ?? [],
      staffAssignments: (staffQ.data as any[]) ?? [],
      zoneStaffModes: (modesQ.data as any[]) ?? [],
    },
    isLoading: results.some((q) => q.isLoading),
    isFetching: results.some((q) => q.isFetching),
    error,
    refetch,
  };
}
