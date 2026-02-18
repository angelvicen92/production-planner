import { AlertCircle, CheckCircle2, RefreshCcw } from "lucide-react";
import { useHealthStatus } from "@/hooks/use-health-status";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const dotColor: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

export function HealthIndicator() {
  const health = useHealthStatus();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs">
          <span className={`h-2.5 w-2.5 rounded-full ${dotColor[health.color]}`} />
          <span className="hidden md:inline">Salud</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm p-3 text-xs">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium">
            {health.color === "green" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />}
            Estado general: {health.color === "green" ? "OK" : health.color === "yellow" ? "Degradado" : "KO"}
          </div>
          <div>Auth: {health.sessionExpired ? "Expirada" : "OK"}</div>
          <div>API: {health.apiOk ? `OK${health.lastPingMs ? ` (${health.lastPingMs} ms)` : ""}` : "KO (timeout/red)"}</div>
          <div>Queries: {health.stuckQueries.length === 0 ? "0 stuck" : `${health.stuckQueries.length} stuck`}</div>
          {health.stuckQueries.slice(0, 2).map((q) => (
            <div key={q.key} className="text-muted-foreground">• {q.key} ({q.seconds}s)</div>
          ))}
          <div>Realtime: {health.realtimeStatus === "ok" ? "OK" : "KO"}</div>
          <Button size="sm" variant="outline" className="mt-1 h-7" onClick={() => void health.retryNow()}>
            <RefreshCcw className="mr-1 h-3.5 w-3.5" /> Reintentar ahora
          </Button>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
