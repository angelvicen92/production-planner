import { Layout } from "@/components/layout";
import { CreatePlanDialog } from "@/components/create-plan-dialog";
import { usePlans, useDeletePlan } from "@/hooks/use-plans";
import { useMePreferences, useSetFavoritePlan } from "@/hooks/use-preferences";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, Clock, ArrowRight, Trash2, Star } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

function formatPct(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

export default function PlansPage() {
  const { data: plans, isLoading, error } = usePlans();
  const { data: preferences } = useMePreferences();
  const setFavoritePlan = useSetFavoritePlan();
  const deletePlan = useDeletePlan();

  const favoritePlanId = preferences?.favoritePlanId ?? null;

  const handleDelete = async (planId: number, planDate: string) => {
    const ok = window.confirm(
      `¿Borrar este plan (${format(new Date(planDate), "MMMM d, yyyy")})?\n\nNo se podrá recuperar.`
    );
    if (!ok) return;

    deletePlan.mutate(planId);
  };

  if (error) {
    return (
      <Layout>
        <div className="p-6 rounded-xl border">
          <h2 className="text-lg font-semibold">Error cargando planes</h2>
          <p className="text-sm text-muted-foreground mt-2">
            {(error as any)?.message || "Error desconocido"}
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Planes Producción</h1>
            <p className="text-muted-foreground mt-1">Gestiona la planificación de cada día.</p>
          </div>
          <CreatePlanDialog />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-48 animate-pulse bg-muted/50 border-transparent" />
            ))}
          </div>
        ) : plans?.length === 0 ? (
          <div className="text-center py-24 bg-card rounded-xl border border-dashed border-border/60">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">Aún no hay planes creados</h3>
            <p className="text-muted-foreground mb-4">Empieza creando tu primer plan.</p>
            <CreatePlanDialog />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans?.map((plan) => (
              <Card key={plan.id} className="group hover:border-primary/50 transition-colors duration-300">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <Badge variant={
                      plan.status === 'draft' ? 'secondary' : 
                      plan.status === 'optimized' ? 'default' : 'outline'
                    }>
                      {plan.status}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono">#{plan.id}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const nextPlanId = favoritePlanId === plan.id ? null : plan.id;
                          setFavoritePlan.mutate(nextPlanId);
                        }}
                        title={favoritePlanId === plan.id ? "Quitar favorito" : "Marcar favorito"}
                      >
                        <Star
                          className={`h-4 w-4 ${favoritePlanId === plan.id ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground"}`}
                        />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDelete(plan.id, plan.date as any);
                        }}
                        disabled={deletePlan.isPending}
                        title="Borrar plan"
                      >
                        {deletePlan.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="mt-2 text-xl">
                    {format(new Date(plan.date), "MMMM d, yyyy")}
                  </CardTitle>
                  <CardDescription>
                    Resumen del plan
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Clock className="mr-2 h-4 w-4" />
                      {plan.workStart} - {plan.workEnd}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Concursantes: {plan.contestantsCount ?? "—"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Tareas: {plan.tasksPlanned ?? "—"}/{plan.tasksTotal ?? "—"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Horario día: {plan.workStart || "—"} - {plan.workEnd || "—"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Horario real: {plan.firstTaskStart ?? "—"} - {plan.lastTaskEnd ?? "—"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Ocupación: {formatPct(plan.occupancyAvailablePct)} (jornada) / {formatPct(plan.occupancyRealPct)} (real)
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2">
                    <Link href={`/plans/${plan.id}`}>
                      <Button className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                        Ver detalles
                        <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
