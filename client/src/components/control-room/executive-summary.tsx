import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { taskStateLabels, madridDate, type ControlRoomProjection, type PlanRead } from '@/lib/control-room-metrics';
import { Surface, clockTime } from './presentation';

export function ExecutiveSummary({ metrics: m, plan, director }: { metrics: ControlRoomProjection; plan: PlanRead; director: boolean }) {
  return <Surface label="Resumen ejecutivo" className={cn('border-primary/20', director && 'p-8 sm:p-10')}>
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-widest text-foreground/75">{m.scoped ? 'Estado de tu ámbito parcial' : 'Estado de la jornada'} · {plan.date}</p>
        <h2 className={cn('mt-2 text-3xl font-bold tracking-tight sm:text-4xl', director && 'sm:text-5xl')}>{m.phase}</h2>
        <p className="mt-3 text-sm text-foreground/75 sm:text-base">{m.phaseDetail}</p>
      </div>
      <div className="text-right"><Badge variant="outline">{m.clock?.mode === 'manual' ? 'Reloj simulado autorizado' : m.clock ? 'Reloj real del servidor' : 'Reloj sin confirmar'}</Badge>
        <p className={cn('mt-2 text-3xl font-semibold tabular-nums', director && 'sm:text-5xl')}>{clockTime(m.operationalNow, true)}</p><p className="mt-1 text-xs text-foreground/75">Europe/Madrid · {m.operationalNow === null ? 'Fecha sin confirmar' : madridDate(m.operationalNow)}</p>
      </div>
    </div>
    {!m.temporalApplicable && <p className="mt-4 rounded-xl bg-muted p-3 text-sm">La fecha del reloj no coincide con esta jornada o el reloj no está confirmado. No se declaran retrasos actuales.</p>}
    <div className="mt-6 grid gap-6 border-t pt-6 lg:grid-cols-[1.4fr_1fr]">
      <div><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-foreground/75">{m.scoped ? m.started ? 'Progreso de tu ámbito' : 'Preparación de tu ámbito' : m.started || m.finished ? 'Progreso de ejecución' : 'Preparación del rodaje'}</p><p className={cn('mt-1 text-4xl font-bold tabular-nums', director && 'sm:text-6xl')}>{m.started || m.finished ? m.progressPct === null ? '—' : `${m.progressPct.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%` : `${m.acceptedCoverage ?? '—'} / ${m.total}`}</p></div><p className="max-w-xs text-sm text-foreground/75">{m.started || m.finished ? `${m.counts.done} completadas / ${m.total} obligaciones recibidas. Canceladas incluidas en el total, fuera del numerador.` : m.acceptedCoverage === null ? `${m.plannedCount} con horario en el estado de trabajo; cobertura aceptada sin confirmar.` : m.scoped ? 'Obligaciones de tu ámbito con horario en la versión aceptada.' : 'Obligaciones con horario en el planning completo aceptado.'}</p></div>
        <Progress className="mt-4 h-2.5" value={m.started || m.finished ? m.progressPct ?? 0 : m.total ? (m.acceptedCoverage ?? 0) / m.total * 100 : 0} aria-label={m.started ? 'Porcentaje de obligaciones completadas' : 'Cobertura del planning aceptado'} />
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-5">{Object.entries(taskStateLabels).map(([key, label]) => <div key={key}><dt className="text-xs text-foreground/75">{label}</dt><dd data-testid={`control-count-${key}`} className={cn('mt-1 text-2xl font-semibold tabular-nums', director && 'text-3xl')}>{m.counts[key as keyof typeof taskStateLabels]}</dd></div>)}</dl>
        {m.counts.unknown > 0 && <p className="mt-3 text-sm text-destructive">{m.counts.unknown} obligaciones con estado no reconocido. El total conserva estas obligaciones.</p>}
      </div>
      <div className="rounded-xl bg-muted/50 p-4"><dl className="grid grid-cols-2 gap-4"><div><dt className="text-xs text-foreground/75">{m.scoped ? 'Comienzo de tu ámbito' : 'Comienzo planificado'}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{clockTime(m.plannedStart)}</dd></div><div><dt className="text-xs text-foreground/75">{m.scoped ? 'Fin de tu ámbito' : 'Fin planificado'}</dt><dd className={cn('mt-1 text-xl font-semibold tabular-nums', director && 'text-3xl')}>{clockTime(m.plannedEnd)}</dd></div></dl><p className="mt-3 text-xs text-foreground/75">{m.scoped ? 'Horarios de las obligaciones de tu ámbito; no representan el inicio ni el cierre global.' : 'Versión efectiva aceptada/publicada, completa y sin borrador pendiente.'}</p>
        {m.finished && <p className="mt-3 text-sm">Último fin real: <strong>{clockTime(m.actualEnd, true)}</strong></p>}
        <p className="mt-4 border-t pt-3 text-sm text-foreground/75">{m.estimateReason}</p>
        {!m.started && <p className="mt-3 text-xs text-foreground/75">Ventana del día {plan.workStart ?? '—'}–{plan.workEnd ?? '—'} · Comida {plan.mealStart ?? '—'}–{plan.mealEnd ?? '—'}</p>}
      </div>
    </div>
  </Surface>;
}
