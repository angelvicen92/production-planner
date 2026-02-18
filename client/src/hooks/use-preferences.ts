import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export type MePreferences = {
  favoritePlanId: number | null;
};

export const mePreferencesQueryKey = ["/api/me/preferences"] as const;

export function useMePreferences() {
  return useQuery<MePreferences>({
    queryKey: mePreferencesQueryKey,
    queryFn: () => apiRequest("GET", "/api/me/preferences"),
  });
}

export function useSetFavoritePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (planId: number | null) =>
      apiRequest<MePreferences>("POST", "/api/me/preferences/favorite-plan", { planId }),
    onMutate: async (planId) => {
      await queryClient.cancelQueries({ queryKey: mePreferencesQueryKey });
      const previousPreferences = queryClient.getQueryData<MePreferences>(mePreferencesQueryKey);

      queryClient.setQueryData<MePreferences>(mePreferencesQueryKey, (current) => ({
        ...(current || {}),
        favoritePlanId: planId,
      }));

      return { previousPreferences };
    },
    onError: (_err, _planId, ctx) => {
      if (ctx?.previousPreferences) {
        queryClient.setQueryData(mePreferencesQueryKey, ctx.previousPreferences);
        return;
      }
      queryClient.invalidateQueries({ queryKey: mePreferencesQueryKey });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(mePreferencesQueryKey, data);
    },
  });
}
