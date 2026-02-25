import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Props = {
  enabled: boolean;
  warnings: any[];
  planningStats?: any;
};

export function PlanningWarningsPanel({ enabled, warnings, planningStats }: Props) {
  if (!enabled) return null;

  const allWarnings = Array.isArray(warnings) ? warnings : [];
  const gapWarning = allWarnings.find((w: any) => String(w?.code) === "MAIN_ZONE_GAPS_REMAIN");
  const nonGapWarnings = allWarnings.filter((w: any) => String(w?.code) !== "MAIN_ZONE_GAPS_REMAIN");

  const hasStats = planningStats && typeof planningStats === "object" && Object.keys(planningStats).length > 0;
  const hasMainZoneConfigured = Number.isFinite(Number(planningStats?.zoneId)) && Number(planningStats?.zoneId) > 0;
  const totalGaps = Number(planningStats?.totalGaps ?? gapWarning?.details?.gaps?.length ?? 0);

  const reasonsFromWarning = Array.isArray(gapWarning?.details?.reasons) ? gapWarning.details.reasons : [];
  const reasonsFromStats = Array.isArray(planningStats?.gapReasons) ? planningStats.gapReasons : [];
  const reasons = reasonsFromWarning.length ? reasonsFromWarning : reasonsFromStats;

  if (allWarnings.length === 0 && !hasStats) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Resultados de optimización</AlertTitle>
        <AlertDescription>Sin avisos del motor.</AlertDescription>
      </Alert>
    );
  }

  if (hasMainZoneConfigured && totalGaps === 0) {
    return (
      <Alert className="border-emerald-300 bg-emerald-50 text-emerald-900">
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Resultados de optimización</AlertTitle>
        <AlertDescription>
          <div className="space-y-2">
            <p>Plató principal compactado sin huecos.</p>
            {nonGapWarnings.length > 0 && (
              <ul className="list-disc pl-5 space-y-1">
                {nonGapWarnings.map((w: any, idx: number) => (
                  <li key={`${w?.code ?? "warning"}-${idx}`}>{String(w?.message ?? "Aviso sin detalle")}</li>
                ))}
              </ul>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant={totalGaps > 0 ? "destructive" : "default"}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Resultados de optimización</AlertTitle>
      <AlertDescription>
        <div className="space-y-2">
          {totalGaps > 0 ? (
            <>
              <p>Se detectaron huecos en la zona principal.</p>
              <ul className="list-disc pl-5 space-y-1">
                {reasons.length > 0 ? (
                  reasons.map((r: any, idx: number) => (
                    <li key={`${r?.blockedMainZoneTaskId ?? "x"}-${idx}`}>{String(r?.humanMessage ?? "Sin detalle")}</li>
                  ))
                ) : (
                  <li>Hay huecos, pero faltan detalles.</li>
                )}
              </ul>
            </>
          ) : (
            <p>No hay evidencia suficiente para confirmar si existe compactación sin huecos.</p>
          )}

          {nonGapWarnings.length > 0 && (
            <>
              <p className="font-medium">Otros avisos</p>
              <ul className="list-disc pl-5 space-y-1">
                {nonGapWarnings.map((w: any, idx: number) => (
                  <li key={`${w?.code ?? "warning"}-${idx}`}>{String(w?.message ?? "Aviso sin detalle")}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
