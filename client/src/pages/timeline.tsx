import { Layout } from "@/components/layout";
import { QueryGuard } from "@/components/QueryGuard";
import { usePlans } from "@/hooks/use-plans";
import { useDefaultPlanId } from "@/hooks/use-default-plan-id";
import { Redirect } from "wouter";
import { queryClient } from "@/lib/queryClient";

export default function TimelinePage() {
  const { data: plans = [], isLoading, error, refetch } = usePlans();
  const { defaultPlanId } = useDefaultPlanId(plans);

  if (isLoading || error) {
    return (
      <Layout>
        <div className="p-6">
          <QueryGuard
            isLoading={isLoading}
            isError={Boolean(error)}
            error={error}
            loadingText="Cargando timeline..."
            onRetry={() => {
              queryClient.cancelQueries({ queryKey: ["/api/plans"] });
              refetch();
            }}
          />
        </div>
      </Layout>
    );
  }

  if (!defaultPlanId) {
    return (
      <Layout>
        <div className="p-6 text-sm text-muted-foreground">No hay planes disponibles.</div>
      </Layout>
    );
  }

  return <Redirect to={`/plans/${defaultPlanId}?tab=planning`} />;
}
