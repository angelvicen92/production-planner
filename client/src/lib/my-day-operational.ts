import type { ExecutionContext } from '../../../shared/execution';
import type { ExecutionTask } from './day-execution-view';
import { hhmmToMinutes } from './time';

export type DaySpace = { spaceId: number; zoneId: number | null };
export type ScopeChoice = { value: string; label: string };
export const dayGroups = [
  { key: 'running', label: 'En curso', statuses: ['in_progress'] },
  { key: 'pending', label: 'Pendientes', statuses: ['pending'] },
  { key: 'done', label: 'Completadas', statuses: ['done'] },
  { key: 'stopped', label: 'Interrumpidas / canceladas', statuses: ['interrupted', 'cancelled'] },
] as const;

export function taskZone(task: ExecutionTask, daySpaces: readonly DaySpace[]) {
  return task.zoneId ?? daySpaces.find(space => Number(space.spaceId) === Number(task.spaceId))?.zoneId ?? null;
}

/** The server's effective scope is authoritative. Location filters only narrow it. */
export function myDayTasks(tasks: readonly ExecutionTask[], context: ExecutionContext | undefined, onlyMine: boolean, focus: string, daySpaces: readonly DaySpace[]) {
  if (!context) return [];
  const scope = new Set(context.tasks.filter(task => task.inScope).map(task => task.taskId));
  return tasks.filter(task => (!onlyMine || !context.hasScope || scope.has(task.id)) &&
    (focus === 'all' || (focus.startsWith('space:') ? Number(task.spaceId) === Number(focus.slice(6)) : taskZone(task, daySpaces) === Number(focus.slice(5)))));
}

export function myDayScopeChoices(tasks: readonly ExecutionTask[], context: ExecutionContext | undefined, daySpaces: readonly DaySpace[], zones: ReadonlyMap<number, { name: string }>, spaces: ReadonlyMap<number, { name: string }>) {
  const choices = new Map<string, ScopeChoice>();
  const scope = new Set(context?.tasks.filter(task => task.inScope).map(task => task.taskId));
  for (const task of tasks) {
    if (!scope.has(task.id)) continue;
    const zoneId = taskZone(task, daySpaces);
    if (zoneId) choices.set(`zone:${zoneId}`, { value: `zone:${zoneId}`, label: `Plató / zona · ${zones.get(zoneId)?.name ?? 'Nombre no disponible'}` });
    if (task.spaceId) choices.set(`space:${task.spaceId}`, { value: `space:${task.spaceId}`, label: `Espacio · ${spaces.get(task.spaceId)?.name ?? 'Nombre no disponible'}${zoneId ? ` · ${zones.get(zoneId)?.name ?? 'Zona sin nombre'}` : ''}` });
  }
  return [...choices.values()].sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }));
}

export type DayNeighbours = { previous: ExecutionTask[]; next: ExecutionTask[]; simultaneous: ExecutionTask[] };
/** Planning order, never actual-time sorting or array/ID order, defines neighbours.
 * Ties remain plural; overlapping tasks cannot assert a unique route.
 */
export function myDayNeighbours(task: ExecutionTask, all: readonly ExecutionTask[]): DayNeighbours {
  const start = hhmmToMinutes(task.startPlanned), end = hhmmToMinutes(task.endPlanned);
  if (!task.contestantId || start === null || end === null || end < start) return { previous: [], next: [], simultaneous: [] };
  const peers = all.filter(peer => peer.id !== task.id && peer.contestantId === task.contestantId &&
    hhmmToMinutes(peer.startPlanned) !== null && hhmmToMinutes(peer.endPlanned) !== null && hhmmToMinutes(peer.endPlanned)! >= hhmmToMinutes(peer.startPlanned)!);
  const before = peers.filter(peer => hhmmToMinutes(peer.endPlanned)! <= start && hhmmToMinutes(peer.startPlanned)! < start);
  const after = peers.filter(peer => peer.status !== 'cancelled' && hhmmToMinutes(peer.startPlanned)! >= end && hhmmToMinutes(peer.endPlanned)! > end);
  const previousEnd = Math.max(...before.map(peer => hhmmToMinutes(peer.endPlanned)!));
  const nextStart = Math.min(...after.map(peer => hhmmToMinutes(peer.startPlanned)!));
  return {
    previous: before.filter(peer => hhmmToMinutes(peer.endPlanned) === previousEnd),
    next: after.filter(peer => hhmmToMinutes(peer.startPlanned) === nextStart),
    simultaneous: peers.filter(peer => hhmmToMinutes(peer.startPlanned)! < end && hhmmToMinutes(peer.endPlanned)! > start),
  };
}

/** Only recorded execution establishes a last known operational location. */
export function lastOperationalTasks(task: ExecutionTask, all: readonly ExecutionTask[], nowMs: number) {
  if (!task.contestantId) return [];
  const records = all.filter(peer => peer.contestantId === task.contestantId && ['in_progress', 'done', 'interrupted'].includes(peer.status))
    .map(peer => ({ task: peer, at: Date.parse(peer.endRealAt ?? peer.pausedAt ?? peer.startRealAt ?? '') }))
    .filter(record => Number.isFinite(record.at) && record.at <= nowMs);
  const last = Math.max(...records.map(record => record.at));
  return records.filter(record => record.at === last).map(record => record.task);
}
