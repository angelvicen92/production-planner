import { Layout } from "@/components/layout";
import { usePlans, usePlan } from "@/hooks/use-plans";
import { useContestants } from "@/hooks/use-tasks";
import { PlanningTimeline } from "@/components/planning-timeline";
import { FullscreenPlanningPanel } from "@/components/planning/fullscreen-planning-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { GanttChartSquare } from "lucide-react";
import { QueryState } from "@/components/query-state";
import { queryClient } from "@/lib/queryClient";

export default function TimelinePage() {
  const { data: plans, isLoading: isLoadingPlans, error: plansError, refetch: refetchPlans } = usePlans();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const planId = selectedPlanId ? parseInt(selectedPlanId) : plans?.[0]?.id;
  const { data: contestants = [], isLoading: isLoadingContestants, error: contestantsError, refetch: refetchContestants } = useContestants(planId || 0);

  const selectedPlanSummary = plans?.find(p => p.id === planId);
  const { data: selectedPlan, isLoading: isLoadingPlan, error: planError, refetch: refetchPlan } = usePlan(planId || 0);

  if (isLoadingPlans || plansError) {
    return (
      <Layout>
        <div className="p-6">
          <QueryState
            isLoading={isLoadingPlans}
            isError={Boolean(plansError)}
            error={plansError}
            loadingText="Cargando planes..."
            onRetry={() => {
              queryClient.cancelQueries({ queryKey: ["/api/plans"] });
              refetchPlans();
            }}
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <GanttChartSquare className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Timeline Explorer</h1>
          </div>

          <div className="w-full md:w-64">
            <Select 
              value={selectedPlanId || plans?.[0]?.id?.toString()} 
              onValueChange={setSelectedPlanId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {plans?.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    Plan #{p.id} - {new Date(p.date).toLocaleDateString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedPlanSummary ? (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Plan Details: #{selectedPlanSummary.id}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium capitalize">{selectedPlanSummary.status}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Work Hours</p>
                    <p className="font-medium">{selectedPlanSummary.workStart} - {selectedPlanSummary.workEnd}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Meal Break</p>
                    <p className="font-medium">{selectedPlanSummary.mealStart} - {selectedPlanSummary.mealEnd}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tasks</p>
                    <p className="font-medium">{(selectedPlan as any)?.dailyTasks?.length || 0} items</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <QueryState
              isLoading={isLoadingPlan || isLoadingContestants}
              isError={Boolean(planError || contestantsError)}
              error={planError || contestantsError}
              loadingText="Cargando timeline..."
              onRetry={() => {
                if (planId) {
                  queryClient.cancelQueries({ queryKey: ["/api/plans", planId] });
                }
                refetchPlan();
                refetchContestants();
              }}
            >
              <FullscreenPlanningPanel title="Timeline Explorer" viewKey="timeline-explorer" supportsZoom>
                <PlanningTimeline 
                  plan={(selectedPlan as any) ?? ({ ...selectedPlanSummary, dailyTasks: [] } as any)} 
                  contestants={contestants as any} 
                />
              </FullscreenPlanningPanel>
            </QueryState>
          </div>
        ) : (
          <Card className="p-12 text-center bg-muted/50">
            <p className="text-muted-foreground">No plans available to visualize.</p>
          </Card>
        )}
      </div>
    </Layout>
  );
}
