export type ExecutionContext = {
  role: 'admin' | 'production' | 'aux' | 'viewer' | null;
  planningState: 'accepted' | 'published' | 'pending';
  planningReady: boolean;
  draftPending: boolean;
  hasScope: boolean;
  clock: { operationalAt: string; serverAt: string; mode: 'auto' | 'manual'; revision: string | null };
  tasks: { taskId: number; inScope: boolean; hasAuthority: boolean; canExecute: boolean; resources: string[] }[];
};

export const executionNextStates: Record<string, readonly string[]> = {
  pending: ['in_progress', 'cancelled'], in_progress: ['done', 'interrupted'],
  interrupted: ['in_progress', 'cancelled'], done: [], cancelled: [],
};

export function executionClockCurrent(task: any, clock?: ExecutionContext['clock']): boolean {
  if (!clock || !task?.startRealAt) return true;
  const previous = task.executionClockRevision ?? null;
  const revisionMatches = previous === clock.revision || (previous !== null && clock.revision !== null && Date.parse(previous) === Date.parse(clock.revision));
  return task.executionClockMode === clock.mode && revisionMatches;
}

export function executionDuration(task: any, nowMs: number, clock?: ExecutionContext['clock']): number | null {
  if (task?.status === 'in_progress' && !executionClockCurrent(task, clock)) return null;
  const start = Date.parse(task?.startRealAt ?? '');
  const end = Date.parse(task?.endRealAt ?? task?.pausedAt ?? '');
  if (!Number.isFinite(start) || (!Number.isFinite(end) && task?.status !== 'in_progress')) return null;
  const until = Number.isFinite(end) ? end : nowMs;
  if (!Number.isFinite(until) || until < start) return null;
  return Math.max(0, Math.floor((until - start) / 1000) - Number(task?.pausedTotalSeconds ?? 0));
}

export function formatExecutionDuration(seconds: number | null): string {
  if (seconds === null) return 'No disponible';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Resolve a simulated wall time in Madrid independently of browser timezone. */
export function madridClockBase(hhmm: string, anchor: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(anchor);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const nominal = Date.parse(`${part('year')}-${part('month')}-${part('day')}T${hhmm}:00Z`);
  let instant = nominal;
  for (let step = 0; step < 2; step++) {
    const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset' }).formatToParts(new Date(instant)).find(p => p.type === 'timeZoneName')!.value;
    const match = /GMT([+-])(\d+)(?::(\d+))?/.exec(offset);
    const minutes = match ? (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === '+' ? 1 : -1) : 0;
    instant = nominal - minutes * 60000;
  }
  return new Date(instant);
}
