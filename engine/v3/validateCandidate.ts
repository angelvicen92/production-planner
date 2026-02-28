import type { EngineOutput, TaskInput } from "../types";
import type { EngineV3Input } from "./types";

const toMinutes = (hhmm: string) => {
  const [h, m] = String(hhmm ?? "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

const overlap = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

export function validateOptimizedCandidate(input: EngineV3Input, warm: EngineOutput, candidate: EngineOutput): string[] {
  const errors: string[] = [];
  const workStart = toMinutes(input.workDay.start);
  const workEnd = toMinutes(input.workDay.end);
  if (workStart == null || workEnd == null) return ["INVALID_WORKDAY"];

  const taskById = new Map<number, TaskInput>();
  for (const t of input.tasks ?? []) taskById.set(Number((t as any).id), t as any);

  const warmById = new Map<number, any>();
  for (const p of warm.plannedTasks ?? []) warmById.set(Number((p as any).taskId), p as any);

  const lockByTaskId = new Map<number, any>();
  for (const lock of input.locks ?? []) {
    const taskId = Number((lock as any)?.taskId ?? NaN);
    const lockType = String((lock as any)?.lockType ?? "");
    if (!Number.isFinite(taskId) || taskId <= 0) continue;
    if (lockType !== "time" && lockType !== "full") continue;
    lockByTaskId.set(taskId, lock);
  }

  const planned = (candidate.plannedTasks ?? []).filter((p: any) => Number((p as any).taskId) > 0);
  const intervals: Array<{ taskId: number; start: number; end: number; contestantId: number; spaceId: number; resources: number[] }> = [];

  for (const p of planned as any[]) {
    const taskId = Number(p.taskId);
    const task = taskById.get(taskId);
    if (!task) {
      errors.push(`UNKNOWN_TASK_${taskId}`);
      continue;
    }
    const start = toMinutes(String(p.startPlanned));
    const end = toMinutes(String(p.endPlanned));
    if (start == null || end == null || end <= start) {
      errors.push(`INVALID_INTERVAL_${taskId}`);
      continue;
    }
    if (start < workStart || end > workEnd) {
      errors.push(`OUTSIDE_WORKDAY_${taskId}`);
    }

    const warmP = warmById.get(taskId);
    if (warmP) {
      const ws = toMinutes(String(warmP.startPlanned));
      const we = toMinutes(String(warmP.endPlanned));
      if (ws != null && we != null && we > ws && (end - start) !== (we - ws)) {
        errors.push(`DURATION_CHANGED_${taskId}`);
      }
    }

    const status = String((task as any).status ?? "pending");
    if (status === "done" || status === "in_progress" || status === "cancelled") {
      if (warmP && (warmP.startPlanned !== p.startPlanned || warmP.endPlanned !== p.endPlanned)) {
        errors.push(`MOVED_FIXED_STATUS_${taskId}`);
      }
    }

    const lock = lockByTaskId.get(taskId);
    if (lock) {
      const lockStart = String((lock as any)?.lockedStart ?? "");
      const lockEnd = String((lock as any)?.lockedEnd ?? "");
      if (lockStart && String(p.startPlanned) !== lockStart) {
        errors.push(`MOVED_LOCKED_TIME_${taskId}`);
      }
      if (lockEnd && String(p.endPlanned) !== lockEnd) {
        errors.push(`MOVED_LOCKED_TIME_${taskId}`);
      }
    }

    intervals.push({
      taskId,
      start,
      end,
      contestantId: Number((task as any).contestantId ?? 0),
      spaceId: Number((task as any).spaceId ?? 0),
      resources: Array.isArray((p as any).assignedResources) ? ((p as any).assignedResources as any[]).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0) : [],
    });
  }

  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i];
      const b = intervals[j];
      if (!overlap(a.start, a.end, b.start, b.end)) continue;
      if (a.spaceId > 0 && a.spaceId === b.spaceId) errors.push(`SPACE_OVERLAP_${a.taskId}_${b.taskId}`);
      if (a.contestantId > 0 && a.contestantId === b.contestantId) errors.push(`CONTESTANT_OVERLAP_${a.taskId}_${b.taskId}`);
      const hasSharedResource = a.resources.some((r) => b.resources.includes(r));
      if (hasSharedResource) errors.push(`RESOURCE_OVERLAP_${a.taskId}_${b.taskId}`);
    }
  }

  const candidateById = new Map<number, { start: number; end: number }>();
  for (const p of intervals) candidateById.set(p.taskId, { start: p.start, end: p.end });
  for (const t of input.tasks ?? []) {
    const tid = Number((t as any).id);
    const slot = candidateById.get(tid);
    if (!slot) continue;
    const deps = Array.isArray((t as any).dependsOnTaskIds) ? (t as any).dependsOnTaskIds : [];
    for (const dep of deps) {
      const depSlot = candidateById.get(Number(dep));
      if (!depSlot) continue;
      if (slot.start < depSlot.end) errors.push(`DEPENDENCY_BROKEN_${tid}_${dep}`);
    }
  }

  return Array.from(new Set(errors));
}
