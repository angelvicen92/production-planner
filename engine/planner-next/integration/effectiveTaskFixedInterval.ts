import type { LockInput, TaskInput, TimeWindow } from "../../types";

export type EffectiveTaskFixedInterval =
  | Readonly<{ status: "NONE" }>
  | Readonly<{ status: "EXACT"; interval: Readonly<TimeWindow>; sources: readonly string[] }>
  | Readonly<{ status: "CONFLICT"; intervals: readonly Readonly<TimeWindow>[]; sources: readonly string[] }>
  | Readonly<{ status: "INVALID"; sources: readonly string[] }>;

const minute = (value: unknown): number | null => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value);

export function resolveEffectiveTaskFixedInterval(task: TaskInput, locks: readonly LockInput[]): EffectiveTaskFixedInterval {
  const entries: Array<{ source: string; interval?: TimeWindow }> = [];
  if (task.status === "done" || task.status === "in_progress") {
    const anyReal = task.startReal != null || task.endReal != null;
    if (anyReal && (task.startReal == null || task.endReal == null)) entries.push({ source: "protected:PARTIAL_REAL" });
    else if (task.startReal != null && task.endReal != null) entries.push({ source: "protected:real", interval: { start: task.startReal, end: task.endReal } });
    else if (task.startPlanned != null && task.endPlanned != null) entries.push({ source: "protected:planned", interval: { start: task.startPlanned, end: task.endPlanned } });
    else entries.push({ source: "protected:MISSING" });
  }
  const hasFixedStart = task.fixedWindowStart != null, hasFixedEnd = task.fixedWindowEnd != null;
  if (hasFixedStart || hasFixedEnd) entries.push({ source: "fixedWindow", ...(hasFixedStart && hasFixedEnd ? { interval: { start: task.fixedWindowStart!, end: task.fixedWindowEnd! } } : {}) });
  locks.filter((lock) => lock.taskId === task.id && (lock.lockType === "time" || lock.lockType === "full"))
    .sort((a, b) => a.id - b.id).forEach((lock) => entries.push({ source: `lock:${lock.id}`, ...(lock.lockedStart != null && lock.lockedEnd != null ? { interval: { start: lock.lockedStart, end: lock.lockedEnd } } : {}) }));
  if (!entries.length) return freeze({ status: "NONE" });
  const sources = freeze(entries.map((entry) => entry.source));
  if (entries.some((entry) => !entry.interval || minute(entry.interval.start) === null || minute(entry.interval.end) === null || minute(entry.interval.start)! >= minute(entry.interval.end)!)) return freeze({ status: "INVALID", sources });
  const unique = [...new Map(entries.map((entry) => [`${entry.interval!.start}\0${entry.interval!.end}`, freeze({ ...entry.interval! })])).values()];
  if (unique.length > 1) return freeze({ status: "CONFLICT", intervals: freeze(unique), sources });
  const interval = unique[0]!;
  const duration = minute(interval.end)! - minute(interval.start)!;
  if ((task.status === "pending" || task.status === "interrupted") && task.durationOverrideMin !== duration) return freeze({ status: "INVALID", sources });
  return freeze({ status: "EXACT", interval, sources });
}
