import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Props = {
  enabled: boolean;
  warnings: any[];
  planningStats?: any;
};

export function PlanningWarningsPanel({ enabled, warnings, planningStats }: Props) {
  if (!enabled) return null;

  const gapWarning = (warnings ?? []).find((w: any) => String(w?.code) === "MAIN_ZONE_GAPS_REMAIN");
  const reasons = Array.isArray(gapWarning?.details?.reasons) ? gapWarning.details.reasons : [];
  const hasStats = planningStats && typeof planningStats === "object" && Object.keys(planningStats).length > 0;
  const totalGaps = Number(planningStats?.totalGaps ?? reasons.length ?? 0);

  if (!gapWarning && !hasStats && (!warnings || warnings.length === 0)) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Resultados de optimización</AlertTitle>
        <AlertDescription>No se pudieron cargar avisos del motor.</AlertDescription>
      </Alert>
    );
  }

  if (totalGaps <= 0) {
    return (
      <Alert className="border-emerald-300 bg-emerald-50 text-emerald-900">
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Resultados de optimización</AlertTitle>
        <AlertDescription>Plató principal compactado sin huecos.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Resultados de optimización</AlertTitle>
      <AlertDescription>
        <div className="space-y-2">
          <p>No se pudo eliminar el/los hueco(s) en zona principal.</p>
          <ul className="list-disc pl-5 space-y-1">
            {reasons.map((r: any, idx: number) => (
              <li key={`${r?.blockedMainZoneTaskId ?? "x"}-${idx}`}>
                {String(r?.humanMessage ?? "Sin detalle")}
              </li>
            ))}
          </ul>
        </div>
      </AlertDescription>
    </Alert>
  );
}
