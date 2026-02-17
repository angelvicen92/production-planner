import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { planQueryKey } from "@/lib/plan-query-keys";

export type ZoneStaffMode = "zone" | "space";
export type StaffRoleType = "production" | "editorial";
export type StaffScopeType =
  | "zone"
  | "space"
  | "reality_team"
  | "itinerant_team";

export type PlanZoneStaffModeRow = {
  zoneId: number;
  mode: ZoneStaffMode;
};

export type PlanStaffAssignmentRow = {
  id: number;
  planId: number;
  staffRole: StaffRoleType;
  staffPersonId: number;
  staffPersonName: string;
  scopeType: StaffScopeType;
  zoneId: number | null;
  spaceId: number | null;
  realityTeamCode: string | null;
  itinerantTeamId: number | null;
};

export function usePlanZoneStaffModes(planId: number) {
  return useQuery<PlanZoneStaffModeRow[]>({
    queryKey: [api.plans.zoneStaffModes.list.path, planId],
    queryFn: () =>
      apiRequest(
        "GET",
        buildUrl(api.plans.zoneStaffModes.list.path, { id: planId }),
      ),
  });
}

export function useSavePlanZoneStaffModes(planId: number) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (modes: PlanZoneStaffModeRow[]) =>
      apiRequest(
        "PUT",
        buildUrl(api.plans.zoneStaffModes.saveAll.path, { id: planId }),
        { modes },
      ),
    onMutate: async (modes) => {
      const key = [api.plans.zoneStaffModes.list.path, planId] as const;
      await qc.cancelQueries({ queryKey: key });
      const previousModes = qc.getQueryData(key);
      qc.setQueryData(key, modes);
      return { previousModes };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.previousModes) qc.setQueryData([api.plans.zoneStaffModes.list.path, planId], ctx.previousModes);
      toast({
        title: "No se pudo guardar",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    },
    onSettled: () => {
      qc.invalidateQueries({
        queryKey: [api.plans.zoneStaffModes.list.path, planId],
      });
      qc.invalidateQueries({ queryKey: planQueryKey(planId) });
      toast({ title: "Modos guardados" });
    },
  });
}

export function usePlanStaffAssignments(planId: number) {
  return useQuery<PlanStaffAssignmentRow[]>({
    queryKey: [api.plans.staffAssignments.list.path, planId],
    queryFn: () =>
      apiRequest(
        "GET",
        buildUrl(api.plans.staffAssignments.list.path, { id: planId }),
      ),
  });
}

export function useSavePlanStaffAssignments(planId: number) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (
      assignments: Array<{
        staffRole: StaffRoleType;
        staffPersonId: number;
        scopeType: StaffScopeType;
        zoneId?: number | null;
        spaceId?: number | null;
        realityTeamCode?: string | null;
        itinerantTeamId?: number | null;
      }>,
    ) =>
      apiRequest(
        "PUT",
        buildUrl(api.plans.staffAssignments.saveAll.path, { id: planId }),
        { assignments },
      ),
    onMutate: async (assignments) => {
      const key = [api.plans.staffAssignments.list.path, planId] as const;
      await qc.cancelQueries({ queryKey: key });
      const previousAssignments = qc.getQueryData(key);
      qc.setQueryData(key, assignments as any);
      return { previousAssignments };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.previousAssignments) qc.setQueryData([api.plans.staffAssignments.list.path, planId], ctx.previousAssignments);
      toast({
        title: "No se pudo guardar",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    },
    onSettled: () => {
      qc.invalidateQueries({
        queryKey: [api.plans.staffAssignments.list.path, planId],
      });
      qc.invalidateQueries({ queryKey: planQueryKey(planId) });
      toast({ title: "Asignaciones guardadas" });
    },
  });
}
