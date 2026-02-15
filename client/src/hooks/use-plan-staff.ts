import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

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
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: [api.plans.zoneStaffModes.list.path, planId],
      });
      toast({ title: "Modos guardados" });
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo guardar",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
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
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: [api.plans.staffAssignments.list.path, planId],
      });
      toast({ title: "Asignaciones guardadas" });
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo guardar",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    },
  });
}
