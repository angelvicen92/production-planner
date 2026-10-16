import React from "react";
import type { AssistedStageTiming, StageTimeInterval } from "@shared/assistedStageTiming";
import type { TimingTotal } from "@shared/assistedHistory";
import { stageTimestamp } from "@shared/assistedStageTiming";

export function historyDuration(ms: number) {
  return new Intl.NumberFormat("es", { maximumFractionDigits: 3 }).format(ms / 1000) + " s";
}

function Interval({ value, startLabel, endLabel }: { value: StageTimeInterval | null; startLabel: string; endLabel: string }) {
  if (!value) return <>No disponible</>;
  return <>{startLabel}: <time dateTime={value.start}>{new Date(value.start).toLocaleString()}</time> · {endLabel}: <time dateTime={value.end}>{new Date(value.end).toLocaleString()}</time></>;
}

export function HistoryTimingTotal({ value }: { value: TimingTotal }) {
  if (value.durationMs === null) return <>No disponible</>;
  return <>{historyDuration(value.durationMs)}{value.knownStages < value.totalStages ? <span className="block text-muted-foreground">Cobertura parcial: {value.knownStages}/{value.totalStages} etapas con solicitud</span> : null}</>;
}

export function StageHistoryTiming({ timing, acceptedAt, cumulative }: { timing?: AssistedStageTiming; acceptedAt?: string | null; cumulative?: { generation: TimingTotal; process: TimingTotal } }) {
  return <>
    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Generación</dt><dd>{timing?.generation ? historyDuration(timing.generation.durationMs) : "No disponible"}</dd></div>
      <div><dt className="text-muted-foreground">Solicitud a aceptación</dt><dd>{timing?.requestToAcceptance ? historyDuration(timing.requestToAcceptance.durationMs) : "No disponible"}</dd></div>
      {cumulative ? <>
        <div><dt className="text-muted-foreground">Generación acumulada</dt><dd><HistoryTimingTotal value={cumulative.generation} /></dd></div>
        <div><dt className="text-muted-foreground">Tiempo acumulado de proceso</dt><dd><HistoryTimingTotal value={cumulative.process} /></dd></div>
      </> : null}
    </dl>
    <details className="mt-2 text-muted-foreground">
      <summary className="cursor-pointer">Timestamps de la etapa</summary>
      <ul className="mt-1 space-y-1 break-words">
        <li><Interval value={timing?.generation ?? null} startLabel="Inicio del run" endLabel="Fin del run" /></li>
        <li><Interval value={timing?.requestToAcceptance ?? null} startLabel="Solicitud registrada" endLabel="Aceptación" /></li>
        {stageTimestamp(acceptedAt) !== null && !timing?.requestToAcceptance ? <li>Aceptación: <time dateTime={acceptedAt!}>{new Date(acceptedAt!).toLocaleString()}</time></li> : null}
      </ul>
    </details>
  </>;
}
