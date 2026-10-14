import { Link } from 'wouter';
import { cn } from '@/lib/utils';
import type { ControlRoomProjection } from '@/lib/control-room-metrics';
import { Surface, clockTime } from './presentation';
export function UpcomingActivities({ metrics: m, director }: { metrics: ControlRoomProjection; director: boolean }) {
  return <Surface label="Próximas actividades"><h2 className={cn('text-xl font-semibold', director && 'text-3xl')}>Próximas actividades</h2><p className="mt-2 text-sm text-foreground/75">Ordenadas por evidencia de atención y comienzo previsto. Se prioriza el flujo principal cuando está configurado. No se infiere criticidad de dependencias o recursos.</p>
    <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{m.upcoming.slice(0, director ? 3 : 6).map(task => <li key={task.id} className="min-w-0 rounded-xl border p-4">{task.mainFlow && <p className="mb-2 text-xs font-semibold text-primary">Flujo principal configurado</p>}<p className="text-xl font-semibold tabular-nums">{clockTime(task.plannedStart)}</p><Link href={task.href} className={cn('mt-2 block break-words font-semibold underline-offset-4 hover:underline', director && 'text-xl')}>{task.name}</Link><p className="mt-1 text-sm text-foreground/75">{task.person}</p><p className="mt-2 text-sm text-foreground/75">{task.location}</p></li>)}</ul>
    {!m.upcoming.length && <p className="mt-4 text-sm text-foreground/75">No hay próximas actividades con horario verificable.</p>}
  </Surface>;
}
