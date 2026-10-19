import React from "react";
import { assistedStageLabel, buildAssistedHistory, stageObligations, type HistoryStage } from "@shared/assistedHistory";
import type { AssistedStageTiming } from "@shared/assistedStageTiming";
import { Button } from "@/components/ui/button";
import { HistoryTimingTotal, historyDuration, StageHistoryTiming } from "./stage-history-timing";

export function AssistedStageHistory({ model, active, timings, disabled, onRestore, onRedo }: {
  model: ReturnType<typeof buildAssistedHistory>;
  active: HistoryStage | null;
  timings: readonly AssistedStageTiming[];
  disabled: boolean;
  onRestore: (stage: HistoryStage) => void;
  onRedo: () => void;
}) {
  const progress = stageObligations(active);
  const obligations = (stage: HistoryStage | null) => {
    const value = stageObligations(stage);
    return value ? `${value.scheduled}/${value.total}` : "No disponible";
  };
  const stageCard = (stage: HistoryStage, current: boolean) => {
    const row = model.rows.find(row => row.stage.id === stage.id);
    const timing = current ? row?.timing : timings.find(timing => timing.stageId === stage.id);
    return <article key={stage.id} className="min-w-0 rounded-md border p-3 text-xs" data-testid={current ? "active-history-stage" : "other-history-stage"} data-stage-id={stage.id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{current && row ? assistedStageLabel(row.localNumber) : `Etapa histórica #${stage.ordinal} · ID ${stage.id}`}{stage.id === active?.id ? " · actual" : ""}</h4>
        <Button size="sm" variant="ghost" disabled={disabled || !!stage.archivedAt || stage.id === active?.id} onClick={() => onRestore(stage)}>Restaurar</Button>
      </div>
      <p>Obligaciones: {obligations(stage)} con horario</p>
      {Number(stage.validationSummaryJson?.requiredCount) > 0 ? <p>{String(stage.validationSummaryJson!.requiredCount)} desviación(es) aceptada(s)</p> : null}
      {Number(stage.validationSummaryJson?.hardCount) > 0 ? <p className="text-destructive">{String(stage.validationSummaryJson!.hardCount)} conflicto(s) crítico(s) aceptado(s)</p> : null}
      {!current ? <p>{stage.archivedAt ? "Rama archivada · otro recorrido" : model.lineageError ? "Recorrido no verificable" : "Fuera del recorrido activo"}</p> : null}
      <StageHistoryTiming timing={timing} acceptedAt={stage.acceptedAt} cumulative={current && row ? { generation: row.generationTotal, process: row.processTotal } : undefined} />
    </article>;
  };
  return <div className="space-y-3 pt-2" data-testid="assisted-current-history">
    <div className="rounded-md border bg-muted/30 p-3" data-testid="history-planning-summary">
      <h3 className="font-semibold">Planificación actual · {assistedStageLabel(model.localNumber)}</h3>
      <p className="mt-1 text-sm">Obligaciones con horario: {obligations(active)} · {progress?.percentage != null ? `${new Intl.NumberFormat("es", { maximumFractionDigits: 1 }).format(progress.percentage)} % completado` : "Porcentaje no disponible"}</p>
      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div data-testid="history-generation-total"><dt className="text-muted-foreground">Generación acumulada</dt><dd className="font-medium"><HistoryTimingTotal value={model.generationTotal} /></dd></div>
        <div data-testid="history-process-total"><dt className="text-muted-foreground">Solicitud a aceptación acumulada</dt><dd className="font-medium"><HistoryTimingTotal value={model.processTotal} /></dd></div>
        <div data-testid="history-elapsed-total"><dt className="text-muted-foreground">Tiempo total transcurrido</dt><dd className="font-medium">{model.elapsed ? historyDuration(model.elapsed.durationMs) : "No disponible"}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">Generación suma el cálculo de los runs aceptados. Proceso suma sus intervalos de solicitud a aceptación. El tiempo total va de la primera solicitud a la última aceptación e incluye las esperas entre etapas. S0 no tiene solicitud y no se suma.</p>
    </div>
    {model.lineageError ? <p role="alert" className="text-sm text-destructive">{model.lineageError}</p> : null}
    {model.timingIssues.length ? <p role="status" className="text-sm text-destructive">Hay tiempos inconsistentes en el recorrido. Se excluyen y los acumulados muestran solo la cobertura disponible.</p> : null}
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2" aria-label="Etapas de la planificación actual">{model.rows.map(row => stageCard(row.stage, true))}</div>
    <Button size="sm" variant="outline" disabled={disabled} onClick={onRedo}>Rehacer</Button>
    {model.otherStages.length ? <details className="rounded-md border p-3" data-testid="history-other-stages">
      <summary className="cursor-pointer text-sm">Otros recorridos y etapas · {model.otherStages.length}</summary>
      <p className="my-2 text-xs text-muted-foreground">Estas etapas quedan fuera de la planificación actual y de sus tiempos acumulados.</p>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">{model.otherStages.map(stage => stageCard(stage, false))}</div>
    </details> : null}
  </div>;
}
