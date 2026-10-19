import { useQuery } from "@tanstack/react-query";
import { apiRequest, type ApiPermissionError } from "@/lib/api";
import { useAuth } from './use-auth';

export type AppRole = "admin" | "production" | "aux" | "viewer";

export function useUserRole(enabled = true) {
  const { user } = useAuth();
  const query = useQuery<{ role: AppRole }, ApiPermissionError | Error>({
    queryKey: ["/api/me/role", user?.id],
    enabled: enabled && !!user?.id,
    retry: false,
    refetchInterval: 30000,
    queryFn: ({ signal }) => apiRequest<{ role: AppRole }>("GET", "/api/me/role", undefined, { signal }),
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
    role: !user?.id || query.isError ? null : query.data?.role ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
