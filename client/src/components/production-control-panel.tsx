import { useState } from 'react';
import { Link } from 'wouter';
import { warRoomHref, type ControlRoomProjection, type PlanRead } from '@/lib/control-room-metrics';
import { ExecutiveSummary } from './control-room/executive-summary';
import { AttentionPanel } from './control-room/attention-panel';
import { StudioSituation } from './control-room/studio-situation';
import { UpcomingActivities } from './control-room/upcoming-activities';
import { Surface, clockTime } from './control-room/presentation';

export function ProductionControlPanel({ metrics: m, plan, realNowMs }: {
  metrics: ControlRoomProjection; plan: PlanRead; realNowMs: number;
}) {
  const [inspect, setInspect] = useState(false);
  const current = m.tasks.filter(task => task.state === 'in_progress');
  const blocked = m.zones.flatMap(zone => zone.spaces.filter(space => space.blocked).map(space => ({ zone, space })));
  return <div className="space-y-5" data-testid="control-room-pro">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">Centro de decisiones</h2><Link href={`/my-day?plan=${plan.id}`} className="min-h-11 rounded-lg border px-4 py-3 text-sm font-medium">Abrir Mi Día</Link></div>
    <AttentionPanel metrics={m} planId={plan.id} realNow={realNowMs} director={false} />
    {blocked.length > 0 && <Surface label="Espacios con bloqueo registrado"><h2 className="text-xl font-semibold">Espacios con bloqueo registrado</h2><ul className="mt-4 grid gap-3 sm:grid-cols-2">{blocked.slice(0, 4).map(({ zone, space }) => <li key={space.key} className="min-w-0 rounded-xl border border-destructive/40 p-4"><p className="break-words font-semibold">{zone.name} · {space.name}</p><Link href={warRoomHref(plan.id, space.incidents.find(i => i.type === 'space_blocked')?.id)} className="mt-2 block text-sm underline underline-offset-4">Abrir incidencia del bloqueo</Link></li>)}</ul>{blocked.length > 4 && <p className="mt-3 text-sm">{blocked.length - 4} espacios adicionales en la inspección detallada.</p>}</Surface>}
    <Surface label="Actividades en curso"><h2 className="text-xl font-semibold">En curso · {m.counts.in_progress}</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{current.slice(0, 6).map(task => <li key={task.id} className="min-w-0 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <Link data-testid={`control-room-current-${task.id}`} href={task.href} className="break-words font-semibold underline underline-offset-4">{task.name}</Link><p className="mt-1 text-sm">{task.person}</p><p className="mt-2 text-sm text-foreground/75">{task.location} · {clockTime(task.plannedStart)}–{clockTime(task.plannedEnd)}</p>
      </li>)}</ul>
      {!current.length && <p className="mt-3 text-sm text-foreground/75">Sin tareas en curso en los datos recibidos.</p>}
      {current.length > 6 && <p className="mt-3 text-sm">{current.length - 6} más en la inspección detallada.</p>}
    </Surface>
    <UpcomingActivities metrics={m} director={false} />
    <ExecutiveSummary metrics={m} plan={plan} director={false} />
    <details onToggle={event => setInspect(event.currentTarget.open)}><summary className="min-h-11 cursor-pointer rounded-xl border bg-card p-4 font-semibold focus-visible:ring-2 focus-visible:ring-ring">Inspección detallada por plató y espacio</summary>
      {inspect && <div className="mt-4"><StudioSituation metrics={m} planId={plan.id} director={false} /></div>}
    </details>
  </div>;
}
