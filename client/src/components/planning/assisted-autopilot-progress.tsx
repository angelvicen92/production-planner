import React from "react";
import { CircleAlert, CircleCheck, CirclePause, Loader2 } from "lucide-react";
import type { AutopilotProgress } from "@shared/assistedAutopilot";
import type { AutopilotProgressView } from "@/lib/assisted-autopilot-progress";

export function AssistedAutopilotProgress({ view, progress, compact = false }: { view: AutopilotProgressView; progress: AutopilotProgress; compact?: boolean }) {
  const Icon = view.tone === "success" ? CircleCheck : view.tone === "warning" ? CircleAlert : view.tone === "stopped" ? CirclePause : Loader2;
  if (compact) return <section data-testid="assisted-autopilot-progress" data-phase={progress.phase} className="min-w-0 flex-1 space-y-1">
    <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
      <strong className="shrink-0 tabular-nums">{view.completed} de {view.total} tareas</strong>
      <div role="progressbar" aria-label="Progreso de la jornada planificada" aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.percent} aria-valuetext={`${view.completed} de ${view.total} tareas completadas`} className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${view.percent}%` }} />
      </div>
      <strong className="shrink-0 tabular-nums">{view.percentLabel}%</strong>
    </div>
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <p role="status" aria-live="polite" className="flex min-w-0 flex-1 items-center gap-1">
        <Icon aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${view.tone === "running" ? "motion-safe:animate-spin text-primary" : "text-primary"}`} />
        <span className="shrink-0">{view.terminal ? view.title : view.phaseLabel} · Etapa {progress.stage}</span>
        {view.scopeLabel ? <span className="min-w-0 truncate text-muted-foreground" title={`${view.scopeCaption}: ${view.scopeLabel}`}>· {view.scopeCaption}: {view.scopeLabel}</span> : null}
      </p>
      <details className="relative shrink-0 text-muted-foreground" data-testid="assisted-autopilot-technical">
        <summary className="cursor-pointer focus-visible:outline focus-visible:outline-2">Detalle</summary>
        <div className="absolute right-0 top-full z-50 max-h-[45dvh] w-[min(85vw,28rem)] overflow-auto rounded border bg-card p-2 shadow-lg">
          {view.guidance ? <p>{view.guidance}</p> : null}
          <p>{progress.message}</p>
          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(progress, null, 2)}</pre>
        </div>
      </details>
    </div>
  </section>;
  return <section data-testid="assisted-autopilot-progress" data-phase={progress.phase} className="grid gap-2 sm:grid-cols-2 sm:gap-x-4">
    <div role="status" aria-live="polite" aria-atomic="true" className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">OptiPlan · Planificación automática</p>
      <div className="flex items-center gap-2 font-semibold">
        <Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${view.tone === "running" ? "motion-safe:animate-spin text-primary" : view.tone === "warning" ? "text-amber-600" : "text-primary"}`} />
        <h3 className={view.terminal ? "" : "hidden sm:block"}>{view.title}</h3>
        {!view.terminal ? <span className="sm:hidden">{view.phaseLabel}</span> : null}
      </div>
      {!view.terminal ? <p className="hidden text-sm text-muted-foreground sm:block">{view.phaseLabel}</p> : null}
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
      <p className="hidden text-xs text-muted-foreground sm:block">{view.stageLabel} · El progreso refleja las tareas confirmadas.</p>
    </div>
    {view.scopeLabel ? <div className="text-xs sm:col-span-2">
      <p><span className="text-muted-foreground">{view.scopeCaption}: </span><strong>{view.scopeLabel}</strong> · {view.scopeCountLabel}</p>
      <p className="text-muted-foreground">Tipos de tarea: {view.breakdown}</p>
    </div> : null}
    <details className="text-xs text-muted-foreground sm:col-span-2" data-testid="assisted-autopilot-technical">
      <summary className="cursor-pointer rounded py-1 focus-visible:outline focus-visible:outline-2">Ver detalle técnico</summary>
      <div className="space-y-2 pt-2">
        <p>{progress.message}</p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border p-2">{JSON.stringify(progress, null, 2)}</pre>
      </div>
    </details>
  </section>;
}
