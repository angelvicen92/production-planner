import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { planQueryKey } from '@/lib/plan-query-keys';
import type { PlanRead } from '@/lib/control-room-metrics';
import { useAuth } from './use-auth';
import { usePlanRealtime } from './use-plan-realtime';
import { useExecutionContext } from './use-execution-context';
import { useIncidentList } from './use-war-room';

export function useControlRoomData(planId: number | null) {
  const { user } = useAuth();
  const sync = usePlanRealtime({ planId });
  // Periodic confirmation remains necessary even while the channel is joined.
  const interval: number | false = sync.online ? (sync.realtimeConnected && !sync.realtimeFailed ? 30000 : 5000) : false;
  const plan = useQuery({
    queryKey: [...planQueryKey(planId ?? 0), 'control-room', user?.id],
    enabled: !!planId && !!user?.id, refetchInterval: interval, retry: false,
    queryFn: ({ signal }) => apiRequest<PlanRead>('GET', planQueryKey(planId!)[0], undefined, { signal }),
  });
  const execution = useExecutionContext(planId, interval);
  const incidents = useIncidentList(planId, interval);
  const confirmedAt = [plan.dataUpdatedAt, execution.dataUpdatedAt, incidents.dataUpdatedAt].every(at => at > 0)
    ? Math.min(plan.dataUpdatedAt, execution.dataUpdatedAt, incidents.dataUpdatedAt) : null;
  return { plan, execution, incidents, sync, interval, confirmedAt,
    refresh: () => Promise.all([plan.refetch(), execution.refetch(), incidents.refetch()]),
  };
}
