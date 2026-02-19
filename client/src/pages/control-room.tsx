import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMePreferences, useSetFavoritePlan } from "@/hooks/use-preferences";
import { usePlan, usePlans } from "@/hooks/use-plans";
import { useSpaces, useZones } from "@/hooks/use-spaces";
import { useProductionClock } from "@/hooks/use-production-clock";
import { useContestants, useTaskTemplates } from "@/hooks/use-tasks";
import { planQueryKey } from "@/lib/plan-query-keys";
import { pickDefaultPlan } from "@/lib/plan-default";
import { ProductionControlPanel } from "@/components/production-control-panel";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";

export default function ControlRoomPage() {
  const [isLegacyRoute, params] = useRoute<{ planId: string }>("/plans/:planId/control-room");
  const routePlanId = isLegacyRoute ? Number(params?.planId) : null;

  const queryClient = useQueryClient();
  const { data: plans = [], isLoading: plansLoading, error: plansError } = usePlans();
  const { data: preferences } = useMePreferences();
  const setFavoritePlan = useSetFavoritePlan();
  const { data: zones = [] } = useZones();
  const { data: spaces = [] } = useSpaces();
  const { nowTime, nowSeconds } = useProductionClock();

  const planIds = useMemo(() => new Set(plans.map((p: any) => Number(p?.id))), [plans]);
  const favoritePlanId = Number(preferences?.favoritePlanId);

  const initialPlanId = useMemo(() => {
    if (Number.isFinite(routePlanId) && planIds.has(routePlanId as number)) {
      return routePlanId as number;
    }
    if (Number.isFinite(favoritePlanId) && planIds.has(favoritePlanId)) {
      return favoritePlanId;
    }
    return Number(pickDefaultPlan(plans)?.id ?? NaN);
  }, [routePlanId, favoritePlanId, plans, planIds]);

  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(initialPlanId) || initialPlanId <= 0) return;
    setSelectedPlanId((prev) => (prev && planIds.has(prev) ? prev : initialPlanId));
  }, [initialPlanId, planIds]);

  const effectivePlanId = selectedPlanId && planIds.has(selectedPlanId) ? selectedPlanId : null;

  const { data: plan, isLoading: planLoading, error: planError } = usePlan(effectivePlanId ?? 0);
  const { data: contestants = [] } = useContestants(effectivePlanId ?? 0);
  const { data: templates = [] } = useTaskTemplates();

  useEffect(() => {
    if (!effectivePlanId) return;
    queryClient.invalidateQueries({ queryKey: planQueryKey(effectivePlanId) });
    const id = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: planQueryKey(effectivePlanId) });
    }, 12000);
    return () => window.clearInterval(id);
  }, [effectivePlanId, queryClient]);

  const favoriteValid = Number.isFinite(favoritePlanId) && planIds.has(favoritePlanId);

  return (
    <Layout>
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Control Room</h1>
          <p className="text-sm text-muted-foreground">Dirección operativa multi-plan.</p>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Select
                value={effectivePlanId ? String(effectivePlanId) : undefined}
                onValueChange={(value) => setSelectedPlanId(Number(value))}
                disabled={plansLoading || plans.length === 0}
              >
                <SelectTrigger className="w-full md:w-[320px]" aria-label="Seleccionar plan para Control Room">
                  <SelectValue placeholder="Selecciona un plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((candidate: any) => {
                    const candidateId = Number(candidate?.id);
                    const isFavorite = favoriteValid && candidateId === favoritePlanId;
                    return (
                      <SelectItem key={candidateId} value={String(candidateId)}>
                        <div className="flex items-center gap-2">
                          <span>Plan #{candidateId}</span>
                          {isFavorite ? <Badge variant="secondary">Plan favorito</Badge> : null}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {effectivePlanId && favoriteValid && effectivePlanId === favoritePlanId ? (
                <Badge variant="secondary">Plan favorito</Badge>
              ) : null}
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={!effectivePlanId || setFavoritePlan.isPending}
              onClick={() => {
                if (!effectivePlanId) return;
                setFavoritePlan.mutate(effectivePlanId);
              }}
            >
              <Star className="mr-2 h-4 w-4" />
              Marcar como favorito
            </Button>
          </div>

          {plansLoading ? <div className="text-sm text-muted-foreground">Cargando planes…</div> : null}
          {!plansLoading && plansError ? <div className="text-sm text-destructive">Error cargando planes.</div> : null}
          {!plansLoading && !plansError && plans.length === 0 ? (
            <div className="text-sm text-muted-foreground">No hay planes disponibles.</div>
          ) : null}
        </div>

        {effectivePlanId == null && !plansLoading ? (
          <div className="rounded-lg border p-6 text-sm text-muted-foreground">Selecciona un plan para abrir el panel.</div>
        ) : null}

        {effectivePlanId != null && planLoading ? (
          <div className="rounded-lg border p-6 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando datos del plan...
          </div>
        ) : null}

        {effectivePlanId != null && !planLoading && planError ? (
          <div className="rounded-lg border border-destructive/40 p-6 text-sm text-destructive">Error cargando datos del plan.</div>
        ) : null}

        {effectivePlanId != null && !planLoading && !planError && !plan ? (
          <div className="rounded-lg border p-6 text-sm text-muted-foreground">No se encontró el plan.</div>
        ) : null}

        {effectivePlanId != null && !planLoading && !planError && plan ? (
          <ProductionControlPanel
            plan={plan}
            tasks={plan?.dailyTasks ?? []}
            zones={zones as any[]}
            spaces={spaces as any[]}
            contestants={contestants}
            templates={templates}
            nowTime={nowTime}
            nowSeconds={nowSeconds}
          />
        ) : null}
      </div>
    </Layout>
  );
}
