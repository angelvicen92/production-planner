import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, type ApiPermissionError } from "@/lib/api";
import { useAuth } from './use-auth';

export type AppRole = "admin" | "production" | "aux" | "viewer";

export function useUserRole(enabled = true) {
  return useRole(enabled, false);
}

/** Control Room reconfirms its perspectives independently of long Assisted runs. */
export function useControlRoomRole() {
  return useRole(true, true);
}

function useRole(enabled: boolean, controlRoom: boolean) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const globalKey = ["/api/me/role", user?.id];
  const query = useQuery<{ role: AppRole | null }, ApiPermissionError | Error>({
    queryKey: controlRoom ? [...globalKey, 'control-room'] : globalKey,
    enabled: enabled && !!user?.id,
    retry: false,
    refetchInterval: controlRoom ? 30000 : false,
    queryFn: async ({ signal }) => {
      try {
        const data = await apiRequest<{ role: AppRole | null }>("GET", "/api/me/role", undefined, { signal });
        // A confirmed downgrade is also authoritative for the global consumer.
        if (controlRoom) queryClient.setQueryData(globalKey, data);
        return data;
      } catch (error) {
        const status = (error as ApiPermissionError)?.status;
        if (status === 401 || status === 403) {
          // Erase confirmed-denied authority, including the other policy's cache.
          // Rethrow: denial remains an error, and later timeouts cannot revive it.
          queryClient.setQueriesData({ queryKey: globalKey }, { role: null });
        }
        throw error;
      }
    },
  });

  if (!enabled) {
    return {
      role: null,
      isLoading: false,
      isError: false,
      error: null,
      refetch: query.refetch,
    };
  }

  return {
    role: !user?.id || (controlRoom && query.isError) ? null : query.data?.role ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
