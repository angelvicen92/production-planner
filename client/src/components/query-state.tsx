import { ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type QueryStateProps = {
  isLoading?: boolean;
  isError?: boolean;
  error?: any;
  onRetry?: () => void;
  children?: ReactNode;
  loadingText?: string;
  errorTitle?: string;
};

const isAuthError = (error: any) => {
  const status = Number(error?.status ?? 0);
  return status === 401 || status === 403;
};

export function QueryState({
  isLoading,
  isError,
  error,
  onRetry,
  children,
  loadingText = "Cargando...",
  errorTitle = "No se pudieron cargar los datos.",
}: QueryStateProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{loadingText}</span>
      </div>
    );
  }

  if (isError) {
    const authError = isAuthError(error);
    const timeoutError = String(error?.message || "").toLowerCase().includes("tiempo de espera");

    return (
      <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
          <div>
            <p className="font-medium text-destructive">
              {authError ? "Sesión expirada o sin permisos." : errorTitle}
            </p>
            <p className="text-muted-foreground">
              {authError
                ? "Tu sesión puede haber expirado. Vuelve a iniciar sesión y reintenta."
                : timeoutError
                  ? "La solicitud tardó demasiado en responder."
                  : String(error?.message || "Error desconocido")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onRetry ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
            >
              Reintentar
            </Button>
          ) : null}
          {authError ? (
            <Button size="sm" asChild>
              <a href="/login">Ir a login</a>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
