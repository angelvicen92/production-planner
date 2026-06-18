import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Copy, Cpu, Download, Info, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEngineDiagnostics, type EngineDiagnosticWarning } from "@/hooks/use-engine-diagnostics";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/use-user-role";
import {
  buildEngineDiagnosticsSnapshot,
  engineDiagnosticsFilename,
  getDiagnosticsExportAvailability,
} from "@/lib/engine-diagnostics-export";
import { calculatePlanningOperationalQuality } from "@/lib/planning-operational-quality";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";
import { cn } from "@/lib/utils";

const MAX_WARNINGS_SHOWN = 8;
const MAX_WARNING_MESSAGE_LENGTH = 180;

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metric(value: unknown, suffix = ""): string {
  const number = safeNumber(value);
  return number === null ? "—" : `${number}${suffix}`;
}

function label(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "Desconocido";
  return value.trim().replaceAll("_", " ");
}

function compactMessage(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "Warning sin detalle.";
  const message = value.trim();
  return message.length > MAX_WARNING_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_WARNING_MESSAGE_LENGTH - 1)}…`
    : message;
}

function MetricCell({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function UsageBadge({
  label: badgeLabel,
  attempted,
  accepted,
  detail,
}: {
  label: string;
  attempted: boolean;
  accepted: boolean;
  detail?: string;
}) {
  const state = accepted ? "Aceptado" : attempted ? "Intentado" : "No usado";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
      <span className="font-medium">{badgeLabel}</span>
      <div className="flex items-center gap-2">
        {detail ? <span className="text-xs tabular-nums text-muted-foreground">{detail}</span> : null}
        <Badge variant={accepted ? "default" : attempted ? "secondary" : "outline"}>{state}</Badge>
      </div>
    </div>
  );
}

function WarningRow({ warning }: { warning: EngineDiagnosticWarning }) {
  const taskCount = Array.isArray(warning?.taskIds) ? warning.taskIds.length : 0;
  const severity = warning?.severity === "info" ? "info" : "warning";
  const code = typeof warning?.code === "string" && warning.code.trim()
    ? warning.code.trim()
    : "UNKNOWN_WARNING";

  return (
    <li className="rounded-md border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={severity === "warning" ? "destructive" : "secondary"}>
          {severity === "warning" ? "warning" : "info"}
        </Badge>
        <code className="text-xs font-semibold">{code}</code>
        {taskCount > 0 ? (
          <span className="text-xs text-muted-foreground">
            {taskCount} {taskCount === 1 ? "tarea" : "tareas"}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{compactMessage(warning?.message)}</p>
    </li>
  );
}

type TransportOperationalSettings = {
  vanCapacity?: number | null;
  arrivalTaskTemplateName?: string | null;
  departureTaskTemplateName?: string | null;
};

type PlanEngineDiagnosticsProps = {
  planId: number;
  tasks?: unknown[] | null;
  contestants?: unknown[] | null;
  resourceNamesById?: Record<number, string> | null;
  planningActive?: boolean;
  latestSuccessRunId?: number | null;
};

export function PlanEngineDiagnostics({
  planId,
  tasks,
  contestants,
  resourceNamesById,
  planningActive = false,
  latestSuccessRunId = null,
}: PlanEngineDiagnosticsProps) {
  const { role } = useUserRole();
  const { toast } = useToast();
  const diagnosticsQuery = useEngineDiagnostics(planId, latestSuccessRunId);
  const optimizerSettingsQuery = useQuery<TransportOperationalSettings>({
    queryKey: [api.optimizerSettings.get.path],
    queryFn: () => apiRequest<TransportOperationalSettings>("GET", api.optimizerSettings.get.path),
    retry: false,
  });
  const operationalQualityInput = useMemo(() => ({
    tasks,
    contestants,
    resourceNamesById,
    vanCapacity: optimizerSettingsQuery.data?.vanCapacity,
    arrivalTaskTemplateName: optimizerSettingsQuery.data?.arrivalTaskTemplateName,
    departureTaskTemplateName: optimizerSettingsQuery.data?.departureTaskTemplateName,
  }), [contestants, optimizerSettingsQuery.data, resourceNamesById, tasks]);
  const operationalQuality = useMemo(
    () => calculatePlanningOperationalQuality(operationalQualityInput),
    [operationalQualityInput],
  );

  // Do not hide the panel while role resolution is pending or unavailable.
  if (role && role !== "admin" && role !== "production") return null;

  if (diagnosticsQuery.isLoading) {
    return (
      <Card aria-label="Cargando diagnóstico del motor">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4" /> Diagnóstico del motor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Generando diagnóstico…</p>
          <Skeleton className="h-8 w-full" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (diagnosticsQuery.isError) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Plan aplicado, diagnóstico pendiente.</AlertTitle>
        <AlertDescription className="flex items-center gap-2">
          <span>La planificación sigue disponible.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void diagnosticsQuery.refetch()}>Reintentar</Button>
        </AlertDescription>
      </Alert>
    );
  }

  const diagnostics = diagnosticsQuery.data;
  if (!diagnostics) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Aún no hay diagnóstico del motor para este plan.</AlertTitle>
        <AlertDescription>Se mostrará aquí después de una ejecución V3 que persista su resumen.</AlertDescription>
      </Alert>
    );
  }

  const metadata = diagnostics.engineMetadata ?? {};
  const v4Quality = (metadata as any)?.quality ?? (diagnostics as any)?.quality ?? null;
  const candidateRunner = (metadata as any)?.candidateRunner ?? (diagnostics as any)?.candidateRunner ?? null;
  const productionWave = Array.isArray(candidateRunner?.candidates)
    ? candidateRunner.candidates.find((candidate: any) => candidate?.strategyId === "strategy_v4_production_wave")?.productionWaveScheduler
    : (metadata as any)?.productionWaveScheduler ?? (diagnostics as any)?.productionWaveScheduler ?? null;
  const nativeRemainder = Array.isArray(candidateRunner?.candidates)
    ? candidateRunner.candidates.find((candidate: any) => candidate?.strategyId === "strategy_v4_native_remainder")?.nativeRemainderScheduler
    : (metadata as any)?.nativeRemainderScheduler ?? (diagnostics as any)?.nativeRemainderScheduler ?? null;
  const nativeCriticalCore = Array.isArray(candidateRunner?.candidates)
    ? candidateRunner.candidates.find((candidate: any) => candidate?.strategyId === "strategy_v4_native_critical_core")?.nativeCriticalCoreScheduler
    : (metadata as any)?.nativeCriticalCoreScheduler ?? (diagnostics as any)?.nativeCriticalCoreScheduler ?? null;
  const postOptimizer = (metadata as any)?.postOptimizer ?? (diagnostics as any)?.postOptimizer ?? null;
  const blockRepacker = (metadata as any)?.blockRepacker ?? (diagnostics as any)?.blockRepacker ?? null;
  const improvementEngine = (metadata as any)?.improvementEngine ?? (diagnostics as any)?.improvementEngine ?? null;
  const v3V4Comparison = (metadata as any)?.v3V4Comparison ?? (diagnostics as any)?.v3V4Comparison ?? null;
  const executiveSummary = (metadata as any)?.executiveSummary ?? (diagnostics as any)?.executiveSummary ?? null;
  const finalAcceptance = (metadata as any)?.finalAcceptance ?? (diagnostics as any)?.finalAcceptance ?? null;
  const performance = (metadata as any)?.performance ?? (diagnostics as any)?.performance ?? null;
  const resourceWarnings = Array.isArray(diagnostics.diagnosticWarnings?.resourceDiagnosticWarnings)
    ? diagnostics.diagnosticWarnings.resourceDiagnosticWarnings
    : [];
  const bundleWarnings = Array.isArray(diagnostics.diagnosticWarnings?.resourceBundleValidationWarnings)
    ? diagnostics.diagnosticWarnings.resourceBundleValidationWarnings
    : [];
  const warnings = [...resourceWarnings, ...bundleWarnings];
  const hardViolations = safeNumber(diagnostics.hardConstraintViolations);
  const hardViolationCodes = Array.isArray(diagnostics.hardConstraintViolationCodes)
    ? diagnostics.hardConstraintViolationCodes
    : Array.isArray(metadata.hardConstraintViolationCodes) ? metadata.hardConstraintViolationCodes : [];
  const status = label(diagnostics.status);
  const isHealthy = diagnostics.status === "success" && hardViolations === 0;
  const createdAt = diagnostics.createdAt && !Number.isNaN(Date.parse(diagnostics.createdAt))
    ? new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(new Date(diagnostics.createdAt))
    : null;
  const exportAvailability = getDiagnosticsExportAvailability({
    planningActive,
    latestSuccessRunId,
    diagnosticsRunId: Number.isFinite(Number(diagnostics.id)) ? Number(diagnostics.id) : null,
    isFetching: diagnosticsQuery.isFetching,
    isError: diagnosticsQuery.isError,
  });

  const serializeSnapshot = () => {
    const snapshot = buildEngineDiagnosticsSnapshot(diagnostics, { planId, operationalQualityInput });
    return { snapshot, json: JSON.stringify(snapshot, null, 2) };
  };

  const copyDiagnostics = async () => {
    if (!exportAvailability.ready) {
      toast({ title: "JSON no disponible", description: exportAvailability.message, variant: exportAvailability.reason === "load_failed" ? "destructive" : "default" });
      return;
    }
    if (!navigator.clipboard?.writeText) {
      toast({
        title: "No se pudo copiar el diagnóstico",
        description: "El navegador no permite acceder al portapapeles. Puedes descargar el JSON.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { json } = serializeSnapshot();
      await navigator.clipboard.writeText(json);
      toast({ title: "Diagnóstico copiado", description: "El JSON compacto está en el portapapeles." });
    } catch {
      toast({
        title: "No se pudo copiar el diagnóstico",
        description: "Revisa los permisos del portapapeles o descarga el JSON.",
        variant: "destructive",
      });
    }
  };

  const downloadDiagnostics = () => {
    if (!exportAvailability.ready) {
      toast({ title: "JSON no disponible", description: exportAvailability.message, variant: exportAvailability.reason === "load_failed" ? "destructive" : "default" });
      return;
    }
    try {
      const { snapshot, json } = serializeSnapshot();
      const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = engineDiagnosticsFilename(snapshot);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Diagnóstico descargado", description: "Se ha generado un snapshot JSON compacto." });
    } catch {
      toast({
        title: "No se pudo descargar el diagnóstico",
        description: "Vuelve a intentarlo desde este panel.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4" /> Diagnóstico del motor
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              JSON run #{diagnostics.id ?? "—"}{createdAt ? ` · generatedAt ${createdAt}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="capitalize">{label(diagnostics.solutionSource)}</Badge>
              <Badge
                variant={isHealthy ? "default" : diagnostics.status === "infeasible" || diagnostics.status === "error" ? "destructive" : "secondary"}
                className="capitalize"
              >
                {status}
              </Badge>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={copyDiagnostics} disabled={!exportAvailability.ready} title={exportAvailability.message}>
                <Copy /> Copiar JSON
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={downloadDiagnostics} disabled={!exportAvailability.ready} title={exportAvailability.message}>
                <Download /> Descargar JSON
              </Button>
            </div>
            {!exportAvailability.ready ? <p className="max-w-sm text-right text-xs text-muted-foreground">{exportAvailability.message}</p> : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {operationalQuality.summary.status !== "unknown" ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>El JSON exportado incluye análisis operativo del planning.</AlertTitle>
            {operationalQuality.summary.mainConcerns.length > 0 ? (
              <AlertDescription>
                Principales revisiones: {operationalQuality.summary.mainConcerns.slice(0, 3).join(" · ")}
              </AlertDescription>
            ) : null}
          </Alert>
        ) : null}

        {(hardViolations ?? 0) > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>El plan contiene violaciones hard</AlertTitle>
            <AlertDescription>
              No debe usarse como planificación válida.
              {hardViolationCodes.length ? ` Códigos: ${hardViolationCodes.slice(0, 10).join(", ")}.` : ""}
            </AlertDescription>
          </Alert>
        )}
        <details className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Cómo usar este diagnóstico</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Revisa primero las hard violations y las tareas sin planificar.</li>
            <li>Comprueba <code>solutionSource</code> para saber qué solución quedó seleccionada.</li>
            <li>Copia o descarga el JSON compacto para una revisión externa.</li>
            <li>Añade una observación humana si el resultado no cuadra operativamente.</li>
          </ul>
        </details>

        <section aria-labelledby="diagnostics-main-state">
          <h3 id="diagnostics-main-state" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Estado principal
          </h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCell title="Tareas planificadas" value={metric(diagnostics.plannedTasks)} />
            <MetricCell title="Tareas sin planificar" value={metric(diagnostics.unplannedTasks)} />
            <MetricCell title="Hard violations" value={metric(diagnostics.hardConstraintViolations)} />
            <MetricCell title="Candidatos evaluados" value={metric(metadata.candidateSolutionsEvaluated)} />
          </div>
        </section>

        <section aria-labelledby="diagnostics-quality">
          <h3 id="diagnostics-quality" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Calidad operativa
          </h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCell title="Gap Main Stage" value={metric(diagnostics.mainStageGapMinutes, " min")} />
            <MetricCell title="N.º gaps Main Stage" value={metric(diagnostics.mainStageGapCount)} />
            <MetricCell title="Cambios de coach" value={metric(diagnostics.coachSwitchCount)} />
            <MetricCell title="Offset talento restrictivo" value={metric(diagnostics.restrictiveTalentAverageStartOffset, " min")} />
          </div>
        </section>



        <section aria-labelledby="diagnostics-v4-full">
          <h3 id="diagnostics-v4-full" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            V4 Diagnostics
          </h3>
          <div className="mb-3 grid gap-3 lg:grid-cols-3">
            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">Executive Summary</div>
              <p className="mt-1 text-xs text-muted-foreground">{executiveSummary ? `${label(executiveSummary?.verdict)} · ${executiveSummary?.headline ?? "—"} · estrategia ${label(executiveSummary?.selectedStrategy)}` : "Sin resumen ejecutivo V4."}</p>
              {Array.isArray(executiveSummary?.risks) && executiveSummary.risks.length ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Riesgos: {executiveSummary.risks.slice(0, 2).join(" · ")}</p> : null}
            </div>
            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">Final Acceptance</div>
              <p className="mt-1 text-xs text-muted-foreground">{finalAcceptance ? `${finalAcceptance?.accepted ? "aceptado" : "rechazado"} · fallback V3 ${finalAcceptance?.fallbackToV3Baseline ? "sí" : "no"} · ${finalAcceptance?.reason ?? "—"}` : "Sin gate final disponible."}</p>
            </div>
            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">Performance</div>
              <p className="mt-1 text-xs text-muted-foreground">{performance ? `${metric(performance?.runtimeMs, " ms")} · ${metric(performance?.strategiesEvaluated)} estrategias · perfil ${label(performance?.profile)} · budget ${performance?.budgetExceeded ? "excedido" : "ok"}` : "Sin métricas de performance."}</p>
              {Array.isArray(performance?.skippedStrategies) && performance.skippedStrategies.length ? <p className="mt-1 text-xs text-muted-foreground">Omitidas: {performance.skippedStrategies.slice(0, 4).map(label).join(" · ")}</p> : null}
            </div>
          </div>
          <div className="mb-3 rounded-md border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">Improvement Engine</div>
              <Badge variant={improvementEngine?.applied ? "default" : "outline"}>{improvementEngine?.applied ? "aplicado" : "omitido"}</Badge>
            </div>
            {improvementEngine ? (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <MetricCell title="Runtime" value={metric(improvementEngine?.runtimeMs, " ms")} />
                  <MetricCell title="Aceptados / rechazados" value={`${metric(improvementEngine?.movesAccepted)} / ${metric(improvementEngine?.movesRejected)}`} />
                  <MetricCell title="Makespan" value={`${improvementEngine?.makespanBefore ?? "—"} → ${improvementEngine?.makespanAfter ?? "—"}`} />
                  <MetricCell title="Gap flujo principal" value={`${metric(improvementEngine?.mainFlowGapMinutesBefore, " min")} → ${metric(improvementEngine?.mainFlowGapMinutesAfter, " min")}`} />
                  <MetricCell title="Permanencia total" value={`${metric(improvementEngine?.totalTalentStayBefore, " min")} → ${metric(improvementEngine?.totalTalentStayAfter, " min")}`} />
                  <MetricCell title="Iteraciones" value={metric(improvementEngine?.iterations)} />
                </div>
                {Array.isArray(improvementEngine?.families) && improvementEngine.families.length ? (
                  <p className="text-xs text-muted-foreground">
                    Familias: {improvementEngine.families.map((family: any) => `${label(family?.name)} ${metric(family?.accepted)}/${metric(family?.candidates)}`).join(" · ")}
                  </p>
                ) : <p className="text-xs text-muted-foreground">Sin familias ejecutadas.</p>}
                {Array.isArray(improvementEngine?.acceptedMoves) && improvementEngine.acceptedMoves.length ? (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {improvementEngine.acceptedMoves.slice(0, 5).map((move: any, index: number) => (
                      <li key={`${move?.family ?? "move"}-${index}`}>{label(move?.family)} · tareas {(move?.taskIds ?? []).join(", ") || "—"} · {move?.from ?? "—"} → {move?.to ?? "—"} · {move?.reason ?? "—"}</li>
                    ))}
                  </ul>
                ) : null}
                {Array.isArray(improvementEngine?.warnings) && improvementEngine.warnings.length ? <p className="text-xs text-amber-700 dark:text-amber-400">{improvementEngine.warnings.slice(0, 3).join(" · ")}</p> : null}
              </div>
            ) : <p className="mt-1 text-xs text-muted-foreground">Sin improvement engine disponible para esta ejecución.</p>}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">Candidate Runner</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {candidateRunner ? `${metric(candidateRunner?.candidateCount)} candidatos · best ${label(candidateRunner?.bestStrategyId)}` : "Sin candidate runner disponible."}
              </p>
            </div>
            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">Production Wave</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {productionWave ? `${productionWave?.accepted === false ? "rechazada" : productionWave?.applied ? "aplicada" : "no aplicada"} · ${metric(productionWave?.mainFlowTasksPlaced)} main · ${metric(productionWave?.prerequisitesPlaced)} prereq · gaps ${metric(productionWave?.mainFlowGapMinutes, " min")}` : "Sin production wave disponible."}
              </p>
              {productionWave?.rejectionReason ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{productionWave.rejectionReason}</p> : null}
            </div>

            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">Native Critical Core</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {nativeCriticalCore ? `${nativeCriticalCore?.discarded ? "descartado" : nativeCriticalCore?.applied ? "aplicado" : "no aplicado"} · core ${metric(nativeCriticalCore?.coreTasksPlaced)}/${metric(nativeCriticalCore?.coreTasksSelected)} · delegadas ${metric(nativeCriticalCore?.coreTasksDelegated)} · locks ${metric(nativeCriticalCore?.strategicInternalLocks)} · V3 fill ${nativeCriticalCore?.v3FillUsed ? "sí" : "no"} · gaps ${metric(nativeCriticalCore?.flowGapMinutesBeforeV3Fill, " min")}→${metric(nativeCriticalCore?.finalMainFlowGapMinutes, " min")} · makespan ${nativeCriticalCore?.finalMakespan ?? "—"}` : "Sin native critical core disponible."}
              </p>
              {Array.isArray(nativeCriticalCore?.blockers) && nativeCriticalCore.blockers.length ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Blockers: {nativeCriticalCore.blockers.slice(0, 2).map((blocker: any) => `${blocker?.taskId ?? "—"}: ${blocker?.reason ?? "—"}`).join(" · ")}</p> : null}
              {Array.isArray(nativeCriticalCore?.warnings) && nativeCriticalCore.warnings.length ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{nativeCriticalCore.warnings.slice(0, 2).join(" · ")}</p> : null}
            </div>
            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">Native Remainder Scheduler</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {nativeRemainder ? `${nativeRemainder?.discarded ? "descartado" : nativeRemainder?.applied ? "aplicado" : "no aplicado"} · wave ${metric(nativeRemainder?.placedByWave)} · native ${metric(nativeRemainder?.placedByNativeScheduler)} · unplanned ${metric(nativeRemainder?.unplanned)} · makespan ${nativeRemainder?.makespan ?? "—"} · gaps ${metric(nativeRemainder?.mainFlowGapMinutes, " min")}` : "Sin native remainder scheduler disponible."}
              </p>
              {Array.isArray(nativeRemainder?.buckets) && nativeRemainder.buckets.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {nativeRemainder.buckets.slice(0, 5).map((bucket: any) => `${label(bucket?.name)} ${metric(bucket?.placed)}/${metric(bucket?.tasks)}`).join(" · ")}
                </p>
              ) : null}
              {Array.isArray(nativeRemainder?.blockers) && nativeRemainder.blockers.length ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Blockers: {nativeRemainder.blockers.slice(0, 2).map((blocker: any) => `${blocker?.taskId ?? "—"}: ${blocker?.reason ?? "—"}`).join(" · ")}</p> : null}
              {Array.isArray(nativeRemainder?.warnings) && nativeRemainder.warnings.length ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{nativeRemainder.warnings.slice(0, 2).join(" · ")}</p> : null}
            </div>
            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">Post Optimizer</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {postOptimizer ? `${postOptimizer?.applied ? "aplicado" : "sin cambios"} · ${metric(postOptimizer?.acceptedMoves)} movimientos aceptados` : "Sin post optimizer disponible."}
              </p>
            </div>
            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">Strategic Block Repacker</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {blockRepacker ? `${blockRepacker?.applied ? "aplicado" : "omitido"} · ${metric(blockRepacker?.blocksDetected)} bloques · ${metric(blockRepacker?.movesAccepted)} aceptados / ${metric(blockRepacker?.movesRejected)} rechazados · makespan ${blockRepacker?.makespanBefore ?? "—"} → ${blockRepacker?.makespanAfter ?? blockRepacker?.makespanBefore ?? "—"}` : "Sin strategic block repacker disponible."}
              </p>
              {Array.isArray(blockRepacker?.warnings) && blockRepacker.warnings.length ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{blockRepacker.warnings.slice(0, 2).join(" · ")}</p> : null}
            </div>
            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">V3/V4 Comparison</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {v3V4Comparison?.comparison ? `${label(v3V4Comparison.comparison.verdict)} · Δscore ${metric(v3V4Comparison.comparison.deltas?.qualityScore)} · Δgap ${metric(v3V4Comparison.comparison.deltas?.mainFlowGapMinutes, " min")} · Δmakespan ${metric(v3V4Comparison.comparison.deltas?.makespanMinutes, " min")}` : "Sin comparación V3/V4 disponible."}
              </p>
              {Array.isArray(v3V4Comparison?.comparison?.reasons) && v3V4Comparison.comparison.reasons.length ? <p className="mt-1 text-xs text-muted-foreground">{v3V4Comparison.comparison.reasons.slice(0, 2).join(" · ")}</p> : null}
            </div>
          </div>
        </section>

        <section aria-labelledby="diagnostics-v4-quality">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 id="diagnostics-v4-quality" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              V4 Quality
            </h3>
            {v4Quality?.grade ? <Badge variant="outline">{label(v4Quality.grade)}</Badge> : null}
          </div>
          {v4Quality ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCell title="Quality Score" value={metric(v4Quality?.qualityScore)} />
                <MetricCell title="Main Flow Continuity" value={metric(v4Quality?.mainFlowQuality?.continuityPercent, "%")} />
                <MetricCell title="Makespan" value={v4Quality?.makespan?.lastTaskEnd ? String(v4Quality.makespan.lastTaskEnd) : "—"} />
                <MetricCell title="Permanencia media" value={metric(v4Quality?.talentStayTime?.averageStayMinutes, " min")} />
              </div>
              <p className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {v4Quality?.summary ?? "Quality summary no disponible."}
              </p>
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="rounded-md border px-3 py-2 text-sm">
                  <div className="font-medium">Main Flow</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {metric(v4Quality?.mainFlowQuality?.internalGapCount)} gaps · {metric(v4Quality?.mainFlowQuality?.internalGapMinutes, " min")} internos · máximo {metric(v4Quality?.mainFlowQuality?.maxInternalGapMinutes, " min")}
                  </p>
                </div>
                <div className="rounded-md border px-3 py-2 text-sm">
                  <div className="font-medium">Talent Stay Summary</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {metric(v4Quality?.talentStayTime?.talentCount)} talents · máximo {metric(v4Quality?.talentStayTime?.maxStayMinutes, " min")} · total {metric(v4Quality?.talentStayTime?.totalStayMinutes, " min")}
                  </p>
                </div>
                <div className="rounded-md border px-3 py-2 text-sm">
                  <div className="font-medium">Critical Resource Summary</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Array.isArray(v4Quality?.criticalResourceUsage) ? v4Quality.criticalResourceUsage.length : 0} recursos · {metric(v4Quality?.risk?.affectedCriticalResources?.length)} afectados por unplanned
                  </p>
                </div>
              </div>
              {Array.isArray(v4Quality?.warnings) && v4Quality.warnings.length ? (
                <Alert>
                  <TriangleAlert className="h-4 w-4" />
                  <AlertTitle>Warnings V4 Quality</AlertTitle>
                  <AlertDescription>{v4Quality.warnings.slice(0, 3).join(" · ")}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              Esta ejecución no incluye todavía evaluación de calidad V4.
            </p>
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section aria-labelledby="diagnostics-intelligence">
            <h3 id="diagnostics-intelligence" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Inteligencia usada
            </h3>
            <div className="space-y-2">
              <UsageBadge
                label="Backtracking"
                attempted={metadata.backtrackingAttempted === true}
                accepted={metadata.backtrackingAccepted === true}
              />
              <UsageBadge
                label="Neighborhood search"
                attempted={metadata.neighborhoodSearchAttempted === true}
                accepted={metadata.neighborhoodCandidateAccepted === true}
                detail={`${metric(metadata.neighborhoodCandidatesGenerated)} candidatos`}
              />
              <UsageBadge
                label="Segment solver"
                attempted={metadata.segmentSolverAttempted === true}
                accepted={metadata.segmentSolverAccepted === true}
                detail={`${metric(metadata.segmentSolverCandidatesGenerated)} candidatos · ${label(metadata.segmentSolverReason)}`}
              />
              <UsageBadge
                label="Production Wave"
                attempted={metadata.productionWaveAttempted === true}
                accepted={metadata.productionWaveAccepted === true}
                detail={`${metric(metadata.productionWaveAnchorsFound)} anchors · ${metric(metadata.productionWaveCandidatesGenerated)} candidatos · ${label(metadata.productionWaveReason)}`}
              />
              <UsageBadge
                label="CP-SAT pilot"
                attempted={metadata.cpSatPilotAttempted === true}
                accepted={metadata.cpSatPilotAccepted === true}
              />
              <UsageBadge
                label="CP-SAT segments"
                attempted={(safeNumber(metadata.cpSatSegmentsAttempted) ?? 0) > 0}
                accepted={(safeNumber(metadata.cpSatSegmentsAccepted) ?? 0) > 0}
                detail={`${metric(metadata.cpSatSegmentsAccepted)}/${metric(metadata.cpSatSegmentsAttempted)} aceptados`}
              />
              <UsageBadge
                label="CP-SAT global"
                attempted={metadata.cpSatAttempted === true}
                accepted={metadata.cpSatAccepted === true}
              />
            </div>
          </section>

          <section aria-labelledby="diagnostics-bundles">
            <h3 id="diagnostics-bundles" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bundles y recursos
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <MetricCell title="Declarados" value={metric(metadata.declaredResourceBundleCount)} />
              <MetricCell title="Utilizables" value={metric(metadata.usableResourceBundleCount)} />
              <MetricCell title="Inválidos" value={metric(metadata.invalidResourceBundleCount)} />
              <MetricCell title="Parcialmente utilizables" value={metric(metadata.partiallyUsableResourceBundleCount)} />
            </div>
          </section>
        </div>

        <section aria-labelledby="diagnostics-warnings">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 id="diagnostics-warnings" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Warnings de recursos y bundles
            </h3>
            <span className={cn("flex items-center gap-1 text-xs", warnings.length ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400")}>
              {warnings.length ? <TriangleAlert className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {warnings.length ? `${warnings.length} detectados` : "Sin warnings"}
            </span>
          </div>
          {warnings.length ? (
            <>
              <ul className="space-y-2">
                {warnings.slice(0, MAX_WARNINGS_SHOWN).map((warning, index) => (
                  <WarningRow key={`${warning?.code ?? "warning"}-${index}`} warning={warning ?? {}} />
                ))}
              </ul>
              {warnings.length > MAX_WARNINGS_SHOWN ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Se muestran {MAX_WARNINGS_SHOWN} de {warnings.length} warnings para mantener el panel compacto.
                </p>
              ) : null}
            </>
          ) : (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              La última ejecución no registró warnings de recursos ni de validación de bundles.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
