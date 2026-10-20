import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import type { ControlRoomProjection, PlanRead } from '@/lib/control-room-metrics';
import { warRoomHref } from '@/lib/control-room-metrics';
import { ExecutiveSummary } from './executive-summary';
import { Surface } from './presentation';

/** Bounded executive presentation of the same projection used by Production. */
export function DirectorOverview({ metrics: m, plan }: { metrics: ControlRoomProjection; plan: PlanRead }) {
  const critical = m.incidents.recent.filter(i => i.status !== 'resolved' && i.severity === 'critical');
  const blocked = m.zones.flatMap(zone => zone.spaces.filter(space => space.blocked).map(space => ({ zone, space })));
  return <div className="space-y-6" data-testid="control-room-director">
    <h2 className="text-2xl font-semibold text-foreground/75">Panorama de la jornada</h2>
    <ExecutiveSummary metrics={m} plan={plan} director />
    <div className="grid items-start gap-6 xl:grid-cols-[1.3fr_1fr]">
      <Surface label="Hechos principales"><h2 className="text-2xl font-semibold sm:text-3xl">Hechos principales</h2><p className="mt-2 text-sm text-foreground/75">{m.alerts.length} hechos verificados en los datos recibidos. Se muestran los primeros cuatro por prioridad.</p>
        <ul className="mt-5 space-y-4">{m.alerts.slice(0, 4).map(alert => <li key={alert.key} className={`rounded-xl border p-5 ${alert.severity === 'critical' ? 'border-destructive/50 bg-destructive/5' : 'bg-muted/30'}`}><Link href={alert.href} className="block rounded focus-visible:ring-2 focus-visible:ring-ring"><p className="break-words text-lg font-semibold sm:text-2xl">{alert.title}</p><p className="mt-2 break-words text-sm text-foreground/75">{alert.evidence}</p></Link></li>)}</ul>
        {!m.alerts.length && <p className="mt-5 text-lg">{m.incidents.available ? 'Sin hechos de atención demostrados.' : 'Registro de incidencias sin confirmar.'}</p>}
      </Surface>
      <Surface label="Incidencias críticas"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">Incidencias críticas</h2><Badge variant={m.incidents.critical ? 'destructive' : 'secondary'}>{m.incidents.critical ?? 'Sin confirmar'}</Badge></div>
        <ul className="mt-5 space-y-4">{critical.slice(0, 3).map(i => <li key={i.id} data-testid={`control-incident-${i.id}`} className="rounded-xl border border-destructive/40 p-4"><Link href={warRoomHref(plan.id, i.id)} className="break-words text-lg font-semibold underline underline-offset-4">{i.description}</Link><p className="mt-2 text-sm text-foreground/75">{[i.zoneName, i.spaceName].filter(Boolean).join(' · ') || 'Jornada'} · {i.status === 'escalated' ? 'Escalada' : 'Crítica abierta'}</p></li>)}</ul>
        {!critical.length && <p className="mt-4 text-sm text-foreground/75">{m.incidents.available ? 'Sin incidencias críticas abiertas en el registro recibido.' : 'No disponible: consulta de incidencias sin confirmar.'}</p>}
        {critical.length > 3 && <p className="mt-4 text-sm">{critical.length - 3} críticas adicionales en el registro.</p>}
        <h3 className="mt-6 border-t pt-5 text-lg font-semibold">Bloqueos registrados</h3><ul className="mt-3 space-y-2">{blocked.slice(0, 4).map(({ zone, space }) => <li key={space.key} className="break-words text-sm">{zone.name} · {space.name}</li>)}</ul>
        {!blocked.length && <p className="mt-3 text-sm text-foreground/75">{m.incidents.available ? 'Sin bloqueos de espacio registrados.' : 'Bloqueos sin confirmar.'}</p>}
        {blocked.length > 4 && <p className="mt-3 text-sm">{blocked.length - 4} espacios adicionales con bloqueo registrado.</p>}
      </Surface>
    </div>
    <Surface label="Panorama de platós"><h2 className="text-2xl font-semibold sm:text-3xl">Panorama de platós</h2><p className="mt-2 text-sm text-foreground/75">Actividad confirmada y atención registrada; sin inferir causas de parada ni saturación.</p>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{m.zones.slice(0, 8).map(zone => <li key={zone.key} className="min-w-0 rounded-xl border p-5"><h3 className="break-words text-xl font-semibold">{zone.name}</h3><p className="mt-3 text-3xl font-bold tabular-nums">{zone.current} <span className="text-sm font-normal text-foreground/75">en curso</span></p><p className="mt-2 text-sm text-foreground/75">{zone.pending} pendientes o interrumpidas</p><p className="mt-3 text-sm font-medium">{zone.critical ? `${zone.critical} incidencias críticas` : zone.problems ? 'Con hechos de atención' : 'Sin hechos de atención registrados'}</p></li>)}</ul>
      {m.zones.length > 8 && <p className="mt-4 text-sm text-foreground/75">{m.zones.length - 8} platós adicionales en la lectura recibida.</p>}
    </Surface>
  </div>;
}
