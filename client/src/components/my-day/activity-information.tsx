import React from 'react';
import type { ExecutionContext } from '../../../../shared/execution';
import { executionDuration, formatExecutionDuration } from '../../../../shared/execution';
import type { ExecutionTask } from '../../lib/day-execution-view';
import { getTaskName } from '../../lib/lookups';
import { lastOperationalTasks, myDayNeighbours } from '../../lib/my-day-operational';

const statusLabels: Record<string, string> = { pending: 'Pendiente', in_progress: 'En curso', done: 'Completada', interrupted: 'Interrumpida', cancelled: 'Cancelada' };

export function ActivityInformation({ task, allTasks, nowMs, clock, resources, location }: {
  task: ExecutionTask; allTasks: readonly ExecutionTask[]; nowMs: number; clock?: ExecutionContext['clock']; resources: readonly string[]; location: (task: ExecutionTask) => string;
}) {
  const neighbours = myDayNeighbours(task, allTasks);
  const last = lastOperationalTasks(task, allTasks, nowMs);
  const related = (peer: ExecutionTask) => <li key={peer.id} className="mt-1">{getTaskName(peer)} · {location(peer)} · {peer.startPlanned ?? '—'}–{peer.endPlanned ?? '—'} <span className="font-semibold">{statusLabels[peer.status] ?? 'Estado no disponible'}</span></li>;
  return <div className="space-y-3 text-sm" data-testid={`activity-information-${task.id}`}>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-muted/50 p-3 sm:grid-cols-3">
      <div><dt className="text-xs text-muted-foreground">Inicio previsto</dt><dd className="mt-1 font-semibold tabular-nums">{task.startPlanned ?? 'Sin horario'}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Fin previsto</dt><dd className="mt-1 font-semibold tabular-nums">{task.endPlanned ?? 'Sin horario'}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Duración activa</dt><dd className="mt-1 font-mono font-semibold tabular-nums" data-testid="execution-timer">{formatExecutionDuration(executionDuration(task, nowMs, clock))}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Inicio real</dt><dd className="mt-1 font-semibold tabular-nums">{task.startReal ?? 'Sin registro'}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Fin real</dt><dd className="mt-1 font-semibold tabular-nums">{task.endReal ?? 'Sin registro'}</dd></div>
    </dl>
    <p><span className="font-medium">Recursos efectivos: </span>{resources.length ? resources.join(' · ') : 'Sin recursos nominales registrados'}</p>
    {['pending', 'in_progress'].includes(task.status) ? <div className="space-y-2 border-l-2 border-primary/30 pl-3" data-testid={`contestant-flow-${task.id}`}>
      {!task.contestantId ? <p className="text-muted-foreground">Actividad sin concursante; sin recorrido individual.</p> : <>
        {task.status === 'pending' ? <div><p className="font-medium">Actividad anterior del concursante</p>{neighbours.previous.length ? <ul>{neighbours.previous.map(related)}</ul> : <p className="text-muted-foreground">Sin actividad anterior identificable en el planning recibido.</p>}</div> : <div><p className="font-medium">Siguiente destino previsto del concursante</p>{neighbours.next.length ? <ul>{neighbours.next.map(related)}</ul> : <p className="text-muted-foreground">Sin siguiente destino conocido en el planning recibido.</p>}</div>}
        {neighbours.simultaneous.length ? <p className="text-muted-foreground">Hay actividades simultáneas del concursante en el planning; el recorrido no es único.</p> : null}
        <p><span className="font-medium">Última ubicación operativa conocida: </span>{last.length ? last.map(peer => `${location(peer)} (${getTaskName(peer)} · ${statusLabels[peer.status]} · ${peer.endReal ?? (peer.status === 'interrupted' ? 'pausa registrada' : peer.startReal) ?? 'hora registrada'})`).join(' / ') : 'Sin registro de ejecución disponible.'}</p>
        <p className="text-xs text-muted-foreground">Ubicación física actual: no confirmada. Los registros de actividad no confirman presencia ni traslados.</p>
      </>}
    </div> : null}
  </div>;
}
