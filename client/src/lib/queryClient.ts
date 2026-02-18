import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

type UnauthorizedBehavior = "returnNull" | "throw";

const shouldRetry = (failureCount: number, error: any) => {
  if (failureCount >= 1) return false;
  const status = Number(error?.status ?? 0);
  if (status === 401 || status === 403) return false;
  return true;
};

export const getQueryFn = <T>(options: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> => {
  const { on401: unauthorizedBehavior } = options;

  return async ({ queryKey, signal }) => {
    const path = String(queryKey[0] ?? "");
    if (!path) {
      throw new Error("Query key inválida: falta path.");
    }

    try {
      return await apiRequest<T>("GET", path, undefined, { signal });
    } catch (error: any) {
      const status = Number(error?.status ?? 0);
      if (unauthorizedBehavior === "returnNull" && status === 401) {
        return null as T;
      }
      throw error;
    }
  };
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 60_000,
      retry: shouldRetry,
      retryDelay: 750,
    },
    mutations: {
      retry: false,
    },
  },
});
