import type { ExecutionContext } from '../../../shared/execution';
import type { ExecutionTask } from './day-execution-view';

const zone = 'Europe/Madrid';
const wallFormat = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export function completeExecutionInstant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

export function madridWallTime(value: string): string {
  if (!completeExecutionInstant(value)) return '';
  const parts = wallFormat.formatToParts(new Date(value));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
}

export function formatCorrectionInstant(value: unknown): string {
  if (!completeExecutionInstant(value)) return 'Sin timestamp completo';
  return new Intl.DateTimeFormat('es-ES', { timeZone: zone, dateStyle: 'short', timeStyle: 'long' }).format(new Date(value));
}

/** Enumerate Madrid offsets around the requested day, then require an exact
 * wall-time round trip. Never use the device zone or normalize a gap/fold. */
export function resolveMadridCorrection(day: string, time: string): { realAt?: string; error?: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: 'La jornada no tiene una fecha completa. Producción debe revisarla.' };
  const clock = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
  const local = `${day}T${clock}`;
  const nominal = Date.parse(`${local}Z`);
  if (!/^\d{2}:\d{2}:\d{2}$/.test(clock) || !Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 19) !== local) return { error: 'Indica una fecha y hora válidas, con segundos.' };
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = new Date(nominal + hours * 3600000).toISOString();
    offsets.add(Date.parse(`${madridWallTime(sample)}Z`) - Date.parse(sample));
  }
  const candidates = [...offsets].map(offset => new Date(nominal - offset).toISOString()).filter(instant => madridWallTime(instant) === local);
  if (!candidates.length) return { error: 'Esta hora no existe en Europe/Madrid por el cambio de horario. Elige otra hora.' };
  if (candidates.length > 1) return { error: 'Esta hora ocurre dos veces en Europe/Madrid por el cambio de horario. No se puede guardar sin distinguir ambas ocurrencias. Solicita revisión a Producción.' };
  return { realAt: candidates[0] };
}

export function canCorrectExecutionTime(task: ExecutionTask, context?: ExecutionContext): boolean {
  if (!context || !['admin', 'production', 'aux'].includes(context.role ?? '') || !context.tasks.some(t => t.taskId === task.id && t.hasAuthority)) return false;
  if (!Number.isSafeInteger(task.executionVersion) || task.executionVersion! < 0 || !completeExecutionInstant(task.startRealAt)) return false;
  return ['done', 'cancelled'].includes(task.status) ? completeExecutionInstant(task.endRealAt) : ['in_progress', 'interrupted'].includes(task.status) && task.endRealAt == null;
}

export type ExecutionHistory = { executionVersion: number; events: {
  id: number; event_kind: string; corrected_field: 'start' | 'end' | null;
  old_value: string | null; new_value: string | null; reason: string | null;
  changed_by: string | null; created_at: string;
}[] };
