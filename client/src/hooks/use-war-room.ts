import { useQuery } from '@tanstack/react-query';
import { api, buildUrl } from '@shared/routes';
import { apiRequest } from '@/lib/api';
import { usePlanRealtime } from './use-plan-realtime';
import { useAuth } from './use-auth';

export const incidentsKey = (planId: number) => [buildUrl(api.incidents.list.path, { planId })];
// Shared read cache; the caller owns reconciliation and the existing channel.
export function useIncidentList(planId: number | null, interval: number | false) {
  const { user } = useAuth();
  const root = incidentsKey(planId ?? 0)[0];
  return useQuery({
    queryKey: [root, 'list', user?.id], enabled: !!planId && !!user?.id, refetchInterval: interval, retry: false,
    queryFn: async ({ signal }) => api.incidents.list.responses[200].parse(await apiRequest('GET', root, undefined, { signal })),
  });
}
export function useWarRoom(planId: number | null, incidentId: string | null) {
  const { user } = useAuth();
  const actor = user?.id;
  const sync = usePlanRealtime({ planId });
  // A joined channel alone is not proof of event delivery. Keep reconciliation
  // even when subscribed; the UI always states the verified polling interval.
  const interval = sync.online ? (sync.realtimeConnected ? 30000 : 5000) : false;
  const root = incidentsKey(planId ?? 0)[0];
  const list = useIncidentList(planId, interval);
  const context = useQuery({
    queryKey: [root, 'context', actor], enabled: !!planId && !!actor, refetchInterval: interval, retry: false,
    queryFn: async ({ signal }) => api.incidents.context.responses[200].parse(await apiRequest('GET', `${root}/context`, undefined, { signal })),
  });
  const detail = useQuery({
    queryKey: [root, 'detail', actor, incidentId], enabled: !!planId && !!actor && !!incidentId, refetchInterval: interval, retry: false,
    queryFn: async ({ signal }) => api.incidents.detail.responses[200].parse(await apiRequest('GET', `${root}/${incidentId}`, undefined, { signal })),
  });
  return { list, context, detail, sync };
}
