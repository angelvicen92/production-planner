import { useQuery } from '@tanstack/react-query';
import type { ExecutionContext } from '@shared/execution';
import { apiRequest } from '@/lib/api';
import { useAuth } from './use-auth';

export function useExecutionContext(planId?: number | null, pollInterval: number | false = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [`/api/plans/${planId}/execution`, user?.id],
    enabled: Boolean(planId && user?.id),
    queryFn: ({ signal }) => apiRequest<ExecutionContext>('GET', `/api/plans/${planId}/execution`, undefined, { signal }),
    refetchInterval: pollInterval,
    retry: false,
  });
}
