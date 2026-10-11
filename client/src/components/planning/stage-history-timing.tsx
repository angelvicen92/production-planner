import React from "react";
import type { AssistedStageTiming, StageTimeInterval } from "@shared/assistedStageTiming";

function duration(ms: number) {
  return new Intl.NumberFormat("es", { maximumFractionDigits: 3 }).format(ms / 1000) + " s";
}

function Interval({ value, startLabel, endLabel }: { value: StageTimeInterval | null; startLabel: string; endLabel: string }) {
  if (!value) return <>No disponible</>;
  return <>{duration(value.durationMs)}<span className="block text-muted-foreground">{startLabel}: <time dateTime={value.start}>{new Date(value.start).toLocaleString()}</time> · {endLabel}: <time dateTime={value.end}>{new Date(value.end).toLocaleString()}</time></span></>;
}

export function StageHistoryTiming({ timing }: { timing?: AssistedStageTiming }) {
  return <dl className="mt-2 space-y-1">
    <div><dt className="font-medium">Generación</dt><dd><Interval value={timing?.generation ?? null} startLabel="Inicio del run" endLabel="Fin del run" /></dd></div>
    <div><dt className="font-medium">Solicitud a aceptación</dt><dd><Interval value={timing?.requestToAcceptance ?? null} startLabel="Solicitud registrada" endLabel="Aceptación" /></dd></div>
  </dl>;
}
