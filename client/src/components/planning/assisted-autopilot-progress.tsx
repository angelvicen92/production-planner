import React from "react";
import { CircleAlert, CircleCheck, CirclePause, Loader2 } from "lucide-react";
import type { AutopilotProgress } from "@shared/assistedAutopilot";
import type { AutopilotProgressView } from "@/lib/assisted-autopilot-progress";

export function AssistedAutopilotProgress({ view, progress }: { view: AutopilotProgressView; progress: AutopilotProgress }) {
  const Icon = view.tone === "success" ? CircleCheck : view.tone === "warning" ? CircleAlert : view.tone === "stopped" ? CirclePause : Loader2;
  return <section data-testid="assisted-autopilot-progress" data-phase={progress.phase} className="space-y-4">
    <div role="status" aria-live="polite" aria-atomic="true" className="space-y-1">
      <div className="flex items-center gap-2 font-semibold">
        <Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${view.tone === "running" ? "motion-safe:animate-spin text-primary" : view.tone === "warning" ? "text-amber-600" : "text-primary"}`} />
        <h3>{view.title}</h3>
      </div>
      {!view.terminal ? <p className="text-sm text-muted-foreground">{view.phaseLabel}</p> : null}
      {view.guidance ? <p className="text-sm">{view.guidance}</p> : null}
    </div>
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <strong>{view.completed} de {view.total} tareas completadas</strong>
        <span className="font-semibold tabular-nums">{view.percentLabel}%</span>
      </div>
      <div role="progressbar" aria-label="Progreso de la jornada planificada" aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.percent} aria-valuetext={`${view.completed} de ${view.total} tareas completadas`} className="h-3 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${view.percent}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">{view.countsKnown ? `${view.percentLabel}% de la jornada planificada · Quedan ${view.remaining} tareas` : "Total de tareas pendiente de comprobar."}</p>
      <p className="text-xs text-muted-foreground">{view.stageLabel} · El progreso refleja las tareas confirmadas.</p>
    </div>
    {view.scopeLabel ? <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
      <p><span className="text-muted-foreground">{view.scopeCaption}: </span><strong>{view.scopeLabel}</strong></p>
      <p>{view.scopeCountLabel}</p>
      <p className="text-muted-foreground">Tipos de tarea: {view.breakdown}</p>
    </div> : null}
    <details className="text-xs text-muted-foreground" data-testid="assisted-autopilot-technical">
      <summary className="cursor-pointer rounded py-2 focus-visible:outline focus-visible:outline-2">Ver detalle técnico</summary>
      <div className="space-y-2 pt-2">
        <p>{progress.message}</p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border p-2">{JSON.stringify(progress, null, 2)}</pre>
      </div>
    </details>
  </section>;
}
