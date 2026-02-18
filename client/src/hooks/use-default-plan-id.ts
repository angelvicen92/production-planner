import { useEffect, useMemo } from "react";
import { useRoute } from "wouter";
import { pickDefaultPlan } from "@/lib/plan-default";
import { useMePreferences, useSetFavoritePlan } from "@/hooks/use-preferences";

type PlanLike = { id: number; date?: string | null };

export function useDefaultPlanId(plans: PlanLike[], selectedPlanId?: string | null) {
  const [isPlanRoute, params] = useRoute<{ id: string }>("/plans/:id");
  const routePlanId = isPlanRoute ? Number(params.id) : null;

  const { data: preferences, isFetched: isPreferencesFetched } = useMePreferences();
  const setFavoritePlan = useSetFavoritePlan();

  const favoritePlanId = typeof preferences?.favoritePlanId === "number" ? preferences.favoritePlanId : null;

  const planIds = useMemo(() => new Set(plans.map((plan) => Number(plan.id))), [plans]);
  const selectedFromUi = selectedPlanId ? Number(selectedPlanId) : null;

  useEffect(() => {
    if (!isPreferencesFetched) return;
    if (!favoritePlanId) return;
    if (!plans.length) return;
    if (planIds.has(favoritePlanId)) return;
    setFavoritePlan.mutate(null);
  }, [favoritePlanId, isPreferencesFetched, planIds, plans.length, setFavoritePlan]);

  const defaultPlanId = useMemo(() => {
    if (routePlanId && planIds.has(routePlanId)) return routePlanId;
    if (selectedFromUi && planIds.has(selectedFromUi)) return selectedFromUi;
    if (favoritePlanId && planIds.has(favoritePlanId)) return favoritePlanId;
    return pickDefaultPlan(plans)?.id ?? null;
  }, [routePlanId, selectedFromUi, favoritePlanId, plans, planIds]);

  return { defaultPlanId, favoritePlanId };
}
