import { executionClockCurrent, executionDuration, type ExecutionContext } from '../../../shared/execution';
import type { ExecutionTask } from './day-execution-view';
import { madridDate, plannedInstant } from './control-room-metrics';

// Presentation only: the final fifth of the accepted placement, never an engine policy.
const FINAL_FRACTION = 0.2;
export type MyDayTemporal =
  | { kind: 'neutral'; reason: string }
  | { kind: 'normal' | 'ending' | 'overrun'; seconds: number }
  | { kind: 'completed'; startDelta: number; endDelta: number; durationDelta: number };

const timestamp = (value?: string | null): number | null => value && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

/** Read-only view of accepted placements and recorded execution. No permissions or state transitions. */
export function myDayTemporal(task: ExecutionTask, planDate: string, nowMs: number, context?: ExecutionContext, online = true): MyDayTemporal | null {
  if (!['in_progress', 'done'].includes(task.status)) return null;
  const neutral = (reason: string): MyDayTemporal => ({ kind: 'neutral', reason });
  if (!context?.planningReady || context.draftPending) return neutral('Sin planificación aceptada comparable.');
  const start = plannedInstant(planDate, task.startPlanned), end = plannedInstant(planDate, task.endPlanned);
  if (start === null || end === null || end <= start) return neutral('Horario previsto incompleto o no comparable.');
  const realStart = timestamp(task.startRealAt);
  const { clock } = context;
  if (realStart === null || madridDate(realStart) !== planDate) return neutral('Inicio real sin fecha comparable con la jornada.');
  if (!executionClockCurrent(task, clock)) return neutral('El reloj cambió desde el inicio de la actividad.');
  const paused = task.pausedTotalSeconds ?? 0;
  if (!Number.isFinite(paused) || paused < 0) return neutral('Tiempo de pausa no comparable.');
  if (task.status === 'done') {
    const realEnd = timestamp(task.endRealAt);
    const active = executionDuration(task, NaN, clock);
    if (realEnd === null || realEnd < realStart || madridDate(realEnd) !== planDate || active === null || paused > (realEnd - realStart) / 1000) return neutral('Registro final incompleto o no comparable.');
    return { kind: 'completed', startDelta: (realStart - start) / 1000, endDelta: (realEnd - end) / 1000, durationDelta: active - (end - start) / 1000 };
  }
  if (!online) return neutral('Sin conexión · comparación temporal pausada.');
  if (timestamp(clock.operationalAt) === null || timestamp(clock.serverAt) === null || !Number.isFinite(nowMs) || madridDate(nowMs) !== planDate) return neutral('El reloj operativo no es comparable con la fecha del plan.');
  if (task.endRealAt != null || task.pausedAt != null || nowMs < realStart || paused > (nowMs - realStart) / 1000) return neutral('Registro en curso no comparable con el reloj operativo.');
  if (nowMs < start) return neutral('Actividad iniciada antes del intervalo previsto.');
  const remainingMs = end - nowMs;
  if (remainingMs < 0) return { kind: 'overrun', seconds: Math.ceil(-remainingMs / 1000) };
  return { kind: remainingMs <= (end - start) * FINAL_FRACTION ? 'ending' : 'normal', seconds: Math.ceil(remainingMs / 1000) };
}
