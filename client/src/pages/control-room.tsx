import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
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
import { usePlanRealtime } from "@/hooks/use-plan-realtime";
import { usePlanningRun } from "@/hooks/use-planning-run";
import { useControlRoomSettings } from "@/hooks/use-control-room-settings";
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
  const { data: settings } = useControlRoomSettings();

  const [directorMode, setDirectorMode] = useState<boolean>(() => localStorage.getItem("control-room:director-mode") === "1");
  const [autoScroll, setAutoScroll] = useState<boolean>(() => localStorage.getItem("control-room:auto-scroll") === "1");

  const planIds = useMemo(() => new Set(plans.map((p: any) => Number(p?.id))), [plans]);
  const favoritePlanId = Number(preferences?.favoritePlanId);

  const initialPlanId = useMemo(() => {
    if (Number.isFinite(routePlanId) && planIds.has(routePlanId as number)) return routePlanId as number;
    if (Number.isFinite(favoritePlanId) && planIds.has(favoritePlanId)) return favoritePlanId;
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
  const planningRunQ = usePlanningRun(effectivePlanId);

  const { realtimeConnected, realtimeFailed } = usePlanRealtime({ planId: effectivePlanId });

  useEffect(() => {
    if (!effectivePlanId) return;
    queryClient.invalidateQueries({ queryKey: planQueryKey(effectivePlanId) });
    if (!realtimeConnected || realtimeFailed) {
      const id = window.setInterval(() => {
        queryClient.invalidateQueries({ queryKey: planQueryKey(effectivePlanId) });
      }, 30000);
      return () => window.clearInterval(id);
    }
  }, [effectivePlanId, queryClient, realtimeConnected, realtimeFailed]);

  useEffect(() => {
    localStorage.setItem("control-room:director-mode", directorMode ? "1" : "0");
  }, [directorMode]);

  useEffect(() => {
    localStorage.setItem("control-room:auto-scroll", autoScroll ? "1" : "0");
  }, [autoScroll]);

  useEffect(() => {
    if (!autoScroll || !directorMode) return;
    const id = window.setInterval(() => {
      window.scrollBy({ top: window.innerHeight * 0.8, behavior: "smooth" });
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 16) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [autoScroll, directorMode]);

  const favoriteValid = Number.isFinite(favoritePlanId) && planIds.has(favoritePlanId);
  const isFavoritePlan = Boolean(effectivePlanId && favoriteValid && effectivePlanId === favoritePlanId);
  const run = planningRunQ.data;
  const showPlanning = run?.status === "running";
  const planningProgress = run && run.totalPending > 0 ? Math.min(100, (run.plannedCount / run.totalPending) * 100) : 0;

  return (
    <Layout>
      <div className={directorMode ? "space-y-5 max-w-none" : "space-y-4"}>
        <div className="space-y-2">
          <h1 className={directorMode ? "text-4xl font-black tracking-tight" : "text-2xl font-bold"}>Control Room</h1>
          <p className={directorMode ? "text-base text-muted-foreground" : "text-sm text-muted-foreground"}>Dirección operativa multi-plan.</p>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Select value={effectivePlanId ? String(effectivePlanId) : undefined} onValueChange={(value) => setSelectedPlanId(Number(value))} disabled={plansLoading || plans.length === 0}>
                <SelectTrigger className="w-full md:w-[320px]" aria-label="Seleccionar plan para Control Room"><SelectValue placeholder="Selecciona un plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map((candidate: any) => {
                    const candidateId = Number(candidate?.id);
                    const isFavorite = favoriteValid && candidateId === favoritePlanId;
                    return <SelectItem key={candidateId} value={String(candidateId)}><div className="flex items-center gap-2"><span>Plan #{candidateId}</span>{isFavorite ? <Badge variant="secondary">Plan favorito</Badge> : null}</div></SelectItem>;
                  })}
                </SelectContent>
              </Select>
              {isFavoritePlan ? <Badge variant="secondary">Plan favorito</Badge> : null}
              <div className="flex items-center gap-2 pl-2">
                <span className="text-sm">Modo director</span>
                <Switch checked={directorMode} onCheckedChange={setDirectorMode} />
              </div>
              {directorMode ? <div className="flex items-center gap-2"><span className="text-sm">Auto-scroll</span><Switch checked={autoScroll} onCheckedChange={setAutoScroll} /></div> : null}
            </div>

            <Button type="button" variant="outline" disabled={!effectivePlanId || setFavoritePlan.isPending || isFavoritePlan} onClick={() => effectivePlanId && setFavoritePlan.mutate(effectivePlanId)}>
              <Star className="mr-2 h-4 w-4" />
              {isFavoritePlan ? "Favorito actual" : "Marcar como favorito"}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">Realtime: {realtimeConnected ? "conectado" : "fallback polling 30s"}</div>
          {plansLoading ? <div className="text-sm text-muted-foreground">Cargando planes…</div> : null}
          {!plansLoading && plansError ? <div className="text-sm text-destructive">Error cargando planes.</div> : null}
        </div>

        {showPlanning ? (
          <div className="rounded-lg border p-4 bg-blue-500/5 border-blue-500/30 space-y-2">
            <div className="text-sm font-medium">Planificando… {run?.plannedCount ?? 0} / {run?.totalPending ?? 0}</div>
            <Progress value={planningProgress} />
          </div>
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
            settings={settings}
            directorMode={directorMode}
          />
        ) : null}

        {effectivePlanId == null && !plansLoading ? <div className="rounded-lg border p-6 text-sm text-muted-foreground">Selecciona un plan para abrir el panel.</div> : null}
        {effectivePlanId != null && planLoading ? <div className="rounded-lg border p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Cargando datos del plan...</div> : null}
        {effectivePlanId != null && !planLoading && planError ? <div className="rounded-lg border border-destructive/40 p-6 text-sm text-destructive">Error cargando datos del plan.</div> : null}
      </div>
    </Layout>
  );
}
