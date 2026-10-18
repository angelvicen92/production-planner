import { useState } from 'react';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatExecutionDuration } from '@shared/execution';
import { taskStateLabels, warRoomHref, type ControlRoomProjection, type TaskMetric } from '@/lib/control-room-metrics';
import { Surface, clockTime, signedDuration } from './presentation';
import { activitySections, allActivities, selectActivities, type ActivityFilters, type SpaceSelection } from './temporal-navigation';

function Activity({ task, director, next }: { task: TaskMetric; director: boolean; next: boolean }) {
  const current = task.state === 'in_progress';
  const completed = task.state === 'done';
  const hasExecution = current || completed || task.state === 'interrupted' || task.realStart !== null || task.realEnd !== null;
  const label = task.state === 'unknown' ? 'Estado por confirmar' : taskStateLabels[task.state];
  return <li data-testid={`control-room-activity-${task.id}`} className={cn('min-w-0 rounded-xl border p-4', current && 'border-primary/40 bg-primary/5')}>
    <div data-testid={current ? `control-room-running-${task.id}` : completed ? `control-room-done-${task.id}` : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={current ? 'default' : task.state === 'interrupted' ? 'destructive' : 'secondary'}>{label}</Badge>
        {next && <span className="text-sm font-semibold text-primary">Siguiente en el planning</span>}
      </div>
      <Link href={task.href} className={cn('mt-2 block break-words font-semibold underline underline-offset-4', director && 'text-xl')}>{task.name}</Link>
      <p className={cn('mt-1 break-words text-foreground/75', director ? 'text-base' : 'text-sm')}>{task.person}</p>
      <dl className={cn('mt-3 grid grid-cols-2 gap-3', director ? 'text-base' : 'text-sm')}>
        <div><dt className="text-foreground/75">Planning</dt><dd className="mt-1 font-medium tabular-nums">{clockTime(task.plannedStart)}–{clockTime(task.plannedEnd)}</dd></div>
        {hasExecution && <>
          <div><dt className="text-foreground/75">Tiempo activo · sin pausas</dt><dd className="mt-1 font-semibold tabular-nums">{formatExecutionDuration(task.activeSeconds)}</dd></div>
          <div><dt className="text-foreground/75">Inicio real</dt><dd className="mt-1 font-medium tabular-nums">{clockTime(task.realStart, true)}</dd></div>
          <div><dt className="text-foreground/75">Fin real</dt><dd className="mt-1 font-medium tabular-nums">{clockTime(task.realEnd, true)}</dd></div>
        </>}
      </dl>
      {(current || completed || task.state === 'interrupted') && <p className="mt-3 border-t pt-3 text-sm"><span className="text-foreground/75">Duración frente al planning: </span><strong className="tabular-nums">{signedDuration(task.durationDeltaSeconds)}</strong></p>}
      {!director && <>
        {hasExecution && <p className="mt-2 text-sm text-foreground/75">Inicio Δ {signedDuration(task.startDeltaSeconds)} · Fin Δ {signedDuration(task.endDeltaSeconds)}</p>}
        {task.resources.length > 0 && <p className="mt-2 break-words text-sm text-foreground/75">Recursos efectivos: {task.resources.join(', ')}</p>}
      </>}
      {task.excessSeconds !== null && <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-200">Duración prevista superada en {formatExecutionDuration(Math.floor(task.excessSeconds))}</p>}
      {task.lateSeconds !== null && <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">Comienzo previsto pasado; sigue pendiente.</p>}
    </div>
  </li>;
}

function Space({ selection: { unit, tasks }, planId, director, state, parentName }: {
  selection: SpaceSelection; planId: number; director: boolean; state: ActivityFilters['state']; parentName?: string;
}) {
  const sections = activitySections(tasks);
  const activities = (items: TaskMetric[]) => <ul className="mt-3 space-y-3">{items.map(task =>
    <Activity key={task.id} task={task} director={director} next={unit.next?.id === task.id} />)}</ul>;
  return <article data-testid={`control-room-space-${unit.key}`} className={cn('min-w-0 rounded-xl border p-4', unit.problems && 'border-amber-500/40')}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>{parentName && <p className="text-sm text-foreground/75">{parentName}</p>}<h4 className={cn('font-semibold', director && 'text-xl')}>{unit.name}</h4></div>
      <Badge variant={unit.blocked ? 'destructive' : unit.current.length ? 'default' : 'secondary'}>{unit.blocked ? 'Bloqueo registrado' : unit.current.length ? `${unit.current.length} en curso` : 'Sin actividad en curso'}</Badge>
    </div>
    <p className="mt-2 text-sm text-foreground/75">{tasks.length} de {unit.tasks.length} actividades del espacio en esta selección.</p>
    {sections.current.length > 0 && <div className="mt-4"><h5 className="font-semibold text-primary">Ahora · En curso ({sections.current.length})</h5>{activities(sections.current)}</div>}
    {sections.pending.length > 0 && <div className="mt-4">
      <h5 className="font-semibold">Pendientes y previstas ({sections.pending.length})</h5>
      {activities(sections.pending.slice(0, 1))}
      {sections.pending.length > 1 && <details open={state !== 'all'} className="mt-3">
        <summary className="min-h-11 cursor-pointer rounded py-3 font-medium focus-visible:ring-2 focus-visible:ring-ring">Ver las {sections.pending.length - 1} restantes</summary>
        {activities(sections.pending.slice(1))}
      </details>}
    </div>}
    {sections.completed.length > 0 && <div className="mt-4">
      <h5 className="font-semibold">Completadas · tiempos reales ({sections.completed.length})</h5>
      <p className="mt-2 text-sm text-foreground/75">Última completada</p>
      {activities(sections.completed.slice(0, 1))}
      {sections.completed.length > 1 && <details open={state === 'done'} className="mt-3">
        <summary className="min-h-11 cursor-pointer rounded py-3 font-medium focus-visible:ring-2 focus-visible:ring-ring">Ver las {sections.completed.length - 1} anteriores</summary>
        {activities(sections.completed.slice(1))}
      </details>}
    </div>}
    {sections.other.length > 0 && <details open={state !== 'all'} className="mt-3">
      <summary className="min-h-11 cursor-pointer rounded py-3 font-medium focus-visible:ring-2 focus-visible:ring-ring">Canceladas y estados por confirmar ({sections.other.length})</summary>
      {activities(sections.other)}
    </details>}
    {!unit.tasks.length && <p className="mt-3 text-sm text-foreground/75">Sin actividades en las obligaciones recibidas. No demuestra indisponibilidad.</p>}
    {unit.tasks.length > 0 && !unit.next && <p className="mt-3 text-sm text-foreground/75">Sin próxima actividad en las obligaciones recibidas.</p>}
    <ul className="mt-3 space-y-2">{unit.incidents.map(incident => <li key={incident.id}>
      <Link href={warRoomHref(planId, incident.id)} className={cn('block break-words text-sm underline underline-offset-4', incident.severity === 'critical' && 'font-semibold text-destructive')}>Incidencia abierta: {incident.description}</Link>
    </li>)}</ul>
  </article>;
}

export function StudioSituation({ metrics: m, planId, director }: { metrics: ControlRoomProjection; planId: number; director: boolean }) {
  const [filters, setFilters] = useState<ActivityFilters>(allActivities);
  const visible = selectActivities(m, filters);
  const spaces = m.zones.filter(zone => filters.zone === 'all' || zone.key === filters.zone).flatMap(zone => zone.spaces.map(unit => ({ zone, unit })));
  const selectedCount = visible.reduce((sum, { spaces }) => sum + spaces.reduce((n, space) => n + space.tasks.length, 0), 0);
  const filtered = Object.keys(allActivities).some(key => filters[key as keyof ActivityFilters] !== allActivities[key as keyof ActivityFilters]);
  const selectClass = 'min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base text-foreground';
  return <Surface label="Situación por plató y espacio">
    <h2 className={cn('text-xl font-semibold', director && 'text-3xl')}>Situación por plató y espacio</h2>
    <p className="mt-2 text-base text-foreground/75">Ahora, lo completado y el trabajo pendiente. Los horarios futuros son los del planning, sin predicción.</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="grid min-w-0 gap-1 text-sm text-foreground/75">Plató<select aria-label="Seleccionar plató" value={filters.zone} onChange={e => setFilters({ ...filters, zone: e.target.value, space: 'all' })} className={selectClass}>
        <option value="all">Todos los platós</option>{m.zones.map(zone => <option key={zone.key} value={zone.key}>{zone.name}</option>)}
      </select></label>
      <label className="grid min-w-0 gap-1 text-sm text-foreground/75">Espacio<select aria-label="Seleccionar espacio" value={filters.space} onChange={e => setFilters({ ...filters, space: e.target.value })} className={selectClass}>
        <option value="all">Todos los espacios</option>{spaces.map(({ zone, unit }) => <option key={unit.key} value={unit.key}>{zone.name} · {unit.name}</option>)}
      </select></label>
      <label className="grid min-w-0 gap-1 text-sm text-foreground/75">Estado de actividad<select aria-label="Filtrar estado de actividades" value={filters.state} onChange={e => setFilters({ ...filters, state: e.target.value as ActivityFilters['state'] })} className={selectClass}>
        <option value="all">Todos los estados</option>{Object.entries(taskStateLabels).map(([state, label]) => <option key={state} value={state}>{label}</option>)}<option value="unknown">Estado por confirmar</option>
      </select></label>
      <label className="grid min-w-0 gap-1 text-sm text-foreground/75">Situación del espacio<select aria-label="Filtrar actividad de platós" value={filters.activity} onChange={e => setFilters({ ...filters, activity: e.target.value as ActivityFilters['activity'] })} className={selectClass}>
        <option value="all">Todos</option><option value="active">Activos</option><option value="problems">Con problemas</option>
      </select></label>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p role="status" data-testid="control-room-selection-count" className="text-sm text-foreground/75">{selectedCount} de {m.total} actividades recibidas · El resumen ejecutivo y War Room conservan el ámbito de la jornada.</p>
      {filtered && <button type="button" onClick={() => setFilters(allActivities)} className="min-h-11 rounded-lg border px-4 text-sm font-medium">Limpiar filtros</button>}
    </div>
    <p className="mt-2 text-sm text-foreground/75">Desviaciones: real menos planning; + indica mayor duración o una hora posterior. «No calculable» indica falta de tiempos, planning aceptado o reloj compatible. Los tiempos reales se muestran con segundos.</p>
    <div className={cn('mt-5 grid items-start gap-4 lg:grid-cols-2', director && '2xl:grid-cols-3')}>{visible.map(({ zone, spaces }) => <div id={`control-${zone.key}`} key={zone.key} className="min-w-0 rounded-2xl border bg-background p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className={cn('text-lg font-semibold', director && 'text-2xl')}>{zone.name}</h3>{zone.critical > 0 && <Badge variant="destructive">{zone.critical} críticas</Badge>}</div>
      <p className="mt-2 text-sm text-foreground/75">En el plató: {zone.current} en curso · {zone.pending} pendientes o interrumpidas.</p>
      <details open={filtered || zone.current > 0 || zone.problems || spaces.some(space => space.unit.tasks.length > 0)} className="mt-3">
        <summary className="min-h-11 cursor-pointer rounded py-3 text-base font-medium focus-visible:ring-2 focus-visible:ring-ring">Ver espacios ({spaces.length})</summary>
        <div className="mt-2 space-y-3">{spaces.map(selection => <Space key={selection.unit.key} selection={selection} planId={planId} director={director} state={filters.state} parentName={zone.spaces.find(parent => parent.id === selection.unit.parentId)?.name} />)}
          {!spaces.length && <p className="text-sm text-foreground/75">Sin espacios en el catálogo recibido.</p>}
        </div>
      </details>
    </div>)}</div>
    {!visible.length && <p className="mt-5 text-base text-foreground/75">No hay actividades o espacios para esta selección. Limpia los filtros para volver a la jornada.</p>}
  </Surface>;
}
