import type { ExecutionContext } from '../../../shared/execution';
import type { ExecutionTask } from './day-execution-view';
import { hhmmToMinutes } from './time';
import { madridDate, plannedInstant } from './control-room-metrics';

export type DaySpace = { spaceId: number; zoneId: number | null };
export type ScopeChoice = { value: string; label: string };
export const dayGroups = [
  { key: 'running', label: 'En curso', statuses: ['in_progress'] },
  { key: 'pending', label: 'Pendientes', statuses: ['pending'] },
  { key: 'stopped', label: 'Interrumpidas / canceladas', statuses: ['interrupted', 'cancelled'] },
  { key: 'done', label: 'Completadas', statuses: ['done'] },
] as const;
export type MyDayStatus = 'all' | typeof dayGroups[number]['key'];

export function myDayStatusTasks(tasks: readonly ExecutionTask[], status: MyDayStatus) {
  const group = dayGroups.find(group => group.key === status);
  return tasks.filter(task => !group || group.statuses.some(status => status === task.status));
}

/** Accepted placement order, independent of actual execution or permission. */
export function myDayPlanningOrder(tasks: readonly ExecutionTask[], planDate: string) {
  return tasks.map(task => ({ task, at: plannedInstant(planDate, task.startPlanned) ?? Infinity }))
    .sort((a, b) => a.at - b.at || a.task.id - b.task.id).map(row => row.task);
}

export type MyDaySlot = { at: number; tasks: ExecutionTask[]; delaySeconds: number };
/** UI projection only. Missing temporal authority never implies lateness. */
export function myDayPanel(tasks: readonly ExecutionTask[], planDate: string, nowMs: number, context?: ExecutionContext, online = true) {
  const ordered = myDayPlanningOrder(tasks, planDate);
  const running = ordered.filter(task => task.status === 'in_progress');
  const pending = ordered.filter(task => task.status === 'pending');
  const fullTimestamp = (value: string) => /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
  const comparable = Boolean(online && context?.planningReady && !context.draftPending &&
    fullTimestamp(context.clock.operationalAt) && fullTimestamp(context.clock.serverAt) && madridDate(nowMs) === planDate);
  const late: MyDaySlot[] = [], upcoming: MyDaySlot[] = [];
  let uncomparable = 0;
  for (const task of pending) {
    const at = comparable ? plannedInstant(planDate, task.startPlanned) : null;
    if (at === null) { uncomparable++; continue; }
    const slots = at < nowMs ? late : upcoming;
    const slot = slots.at(-1);
    if (slot?.at === at) slot.tasks.push(task);
    else slots.push({ at, tasks: [task], delaySeconds: Math.max(0, Math.ceil((nowMs - at) / 1000)) });
  }
  return { running, late, upcoming: upcoming[0] ?? null, uncomparable };
}

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

export function myDayScopeChoices(tasks: readonly ExecutionTask[], context: ExecutionContext | undefined, daySpaces: readonly DaySpace[], zones: ReadonlyMap<number, { name: string }>, spaces: ReadonlyMap<number, { name: string }>, onlyMine = true) {
  const choices = new Map<string, ScopeChoice>();
  if (!context || (!context.hasScope && !['production', 'admin'].includes(context.role ?? ''))) return [];
  for (const task of myDayTasks(tasks, context, onlyMine, 'all', daySpaces)) {
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
