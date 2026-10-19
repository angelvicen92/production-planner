import { useQueries, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { api, buildUrl } from '@shared/routes';
import type { SheetData } from '@/lib/call-sheet-projection';

export type SheetPlan = { id: number; name?: string; date: string; workStart?: string; workEnd?: string; status?: string };
export type SheetIdentity = { role: 'admin' | 'production' | 'aux' | 'viewer'; staffPersonId?: number | null; resourceItemId?: number | null };

// Local adaptation: useMeLinks/useUserRole cache personal responses without a user
// key, and usePlanOpsData reads GET /plans/:id (which synchronizes meal rows).
// Keep P4/shared hooks untouched; sheet reads are cancellable and user-keyed.
export function useCallSheetIdentity(userId: string) {
  return useQuery({
    queryKey: ['call-sheet', userId, 'identity'], retry: false,
    queryFn: async ({ signal }) => {
      const [role, links] = await Promise.all([
        apiRequest<{ role: SheetIdentity['role'] }>('GET', '/api/me/role', undefined, { signal }),
        apiRequest<Omit<SheetIdentity, 'role'>>('GET', '/api/me/links', undefined, { signal }),
      ]);
      return { ...links, role: role.role };
    },
  });
}
export function useCallSheetPlans(userId: string) {
  return useQuery({
    queryKey: ['call-sheet', userId, 'plans'], retry: false,
    queryFn: ({ signal }) => apiRequest<SheetPlan[]>('GET', api.plans.list.path, undefined, { signal }),
  });
}
export function useCallSheetData(userId: string, planId: number | null) {
  const path = (template: string) => buildUrl(template, { id: planId ?? 0 });
  const sources: [keyof SheetData, string][] = [
    ['tasks', `/api/plans/${planId}/tasks`],
    ['assignments', path(api.plans.staffAssignments.list.path)],
    ['modes', path(api.plans.zoneStaffModes.list.path)],
    ['daySpaces', path(api.plans.spatialAvailability.listSpaces.path)],
    ['resources', path(api.plans.resourceItems.list.path)],
    ['spaceResources', path(api.plans.spaceResourceAssignments.list.path)],
    ['zoneResources', path(api.plans.zoneResourceAssignments.list.path)],
    ['contestants', path(api.plans.contestants.list.path)],
    ['people', api.staffPeople.list.path], ['zones', api.zones.list.path], ['spaces', api.spaces.list.path],
  ];
  const queries = useQueries({ queries: sources.map(([, url]) => ({
    queryKey: ['call-sheet', userId, planId, url], enabled: !!planId, retry: false,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const result = await apiRequest<unknown>('GET', url, undefined, { signal });
      if (!Array.isArray(result)) throw new Error('No se pudo verificar el formato de los datos de la hoja.');
      return result;
    },
  })) });
  const data = Object.fromEntries(sources.map(([key], index) => [key, queries[index].data ?? []])) as SheetData;
  return {
    data, isLoading: queries.some(q => q.isLoading), error: queries.find(q => q.error)?.error,
    updatedAt: Math.min(...queries.map(q => q.dataUpdatedAt)),
    refetch: () => Promise.all(queries.map(q => q.refetch())),
  };
}
