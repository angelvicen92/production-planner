import { useQuery } from "@tanstack/react-query";
import { apiRequest, type ApiPermissionError } from "@/lib/api";

export type AppRole = "admin" | "production" | "aux" | "viewer";

export function useUserRole(enabled = true) {
  const query = useQuery<{ role: AppRole }, ApiPermissionError | Error>({
    queryKey: ["/api/me/role"],
    enabled,
    retry: false,
    queryFn: () => apiRequest<{ role: AppRole }>("GET", "/api/me/role"),
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
    role: query.data?.role ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
