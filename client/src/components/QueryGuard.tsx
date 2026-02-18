import { ReactNode, useEffect, useMemo, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type QueryGuardProps = {
  queryKey?: QueryKey;
  isLoading?: boolean;
  isError?: boolean;
  error?: any;
  loadingText?: string;
  errorTitle?: string;
  onRetry?: () => void;
  children?: ReactNode;
};

const isAuthError = (error: any) => {
  const status = Number(error?.status ?? 0);
  return status === 401 || status === 403;
};

export function QueryGuard({
  queryKey,
  isLoading,
  isError,
  error,
  loadingText = "Cargando...",
  errorTitle = "No se pudieron cargar los datos.",
  onRetry,
  children,
}: QueryGuardProps) {
  const queryClient = useQueryClient();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setSlow(false);
      return;
    }

    const timeout = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(timeout);
  }, [isLoading]);

  const authError = useMemo(() => isAuthError(error), [error]);

  const retry = async () => {
    if (queryKey) {
      await queryClient.cancelQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey });
      await queryClient.refetchQueries({ queryKey, type: "active" });
    }
    onRetry?.();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{loadingText}</span>
        </div>
        {slow ? (
          <div className="space-y-2">
            <p className="text-foreground">Está tardando demasiado.</p>
            <Button size="sm" variant="outline" onClick={() => void retry()}>Reintentar</Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
          <div>
            <p className="font-medium text-destructive">{authError ? "Sesión expirada o sin permisos." : errorTitle}</p>
            <p className="text-muted-foreground">{String(error?.message || "Error desconocido")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void retry()}>Reintentar</Button>
          {authError ? <Button size="sm" asChild><a href="/login">Ir a login</a></Button> : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
