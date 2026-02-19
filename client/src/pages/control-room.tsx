import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/hooks/use-plans";
import { useContestants, useTaskTemplates } from "@/hooks/use-tasks";
import { useSpaces, useZones } from "@/hooks/use-spaces";
import { useProductionClock } from "@/hooks/use-production-clock";
import { planQueryKey } from "@/lib/plan-query-keys";
import { ProductionControlPanel } from "@/components/production-control-panel";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useParams } from "wouter";

export default function ControlRoomPage() {
  const params = useParams<{ planId: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const planId = Number(params?.planId);

  const { data: plan, isLoading, error } = usePlan(planId);
  const { data: contestants = [] } = useContestants(planId);
  const { data: templates = [] } = useTaskTemplates();
  const { data: zones = [] } = useZones();
  const { data: spaces = [] } = useSpaces();
  const { nowTime, nowSeconds } = useProductionClock();

  useEffect(() => {
    if (!planId) return;
    queryClient.invalidateQueries({ queryKey: planQueryKey(planId) });
    const id = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: planQueryKey(planId) });
    }, 12000);
    return () => window.clearInterval(id);
  }, [planId, queryClient]);

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation(`/plans/${planId}`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Control Room</h1>
              <p className="text-sm text-muted-foreground">Dirección · Plan #{planId}</p>
            </div>
          </div>
        </div>

        {isLoading ? <div className="rounded-lg border p-6 text-sm text-muted-foreground">Cargando...</div> : null}
        {!isLoading && error ? <div className="rounded-lg border border-destructive/40 p-6 text-sm text-destructive">Error cargando datos del plan.</div> : null}
        {!isLoading && !error && !plan ? <div className="rounded-lg border p-6 text-sm text-muted-foreground">No se encontró el plan.</div> : null}

        {!isLoading && !error && plan ? (
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
