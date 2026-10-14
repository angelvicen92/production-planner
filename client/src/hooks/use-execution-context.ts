import { useQuery } from '@tanstack/react-query';
import type { ExecutionContext } from '@shared/execution';
import { apiRequest } from '@/lib/api';

export function useExecutionContext(planId?: number | null, pollInterval: number | false = false) {
  return useQuery({
    queryKey: [`/api/plans/${planId}/execution`],
    enabled: Boolean(planId),
    queryFn: () => apiRequest<ExecutionContext>('GET', `/api/plans/${planId}/execution`),
    refetchInterval: pollInterval,
    retry: false,
  });
}
