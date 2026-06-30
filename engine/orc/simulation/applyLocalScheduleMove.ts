import type { EngineInput, TaskInput } from "../../types";
import { calculateOperationalPlanningQualityMetrics, type OperationalPlanningQualityMetrics, type PlanningAssignment } from "../benchmark/operationalPlanningQualityMetrics";

export interface EffectiveMoveAccepted {
  readonly taskId: number;
  readonly fromStart: string;
  readonly fromEnd: string;
  readonly toStart: string;
  readonly toEnd: string;
  readonly reason: string;
  readonly improvedMetrics: string[];
}

export interface EffectiveMoveRejected { readonly taskId: number; readonly reason: string }
export interface EffectiveMovesDiagnostics {
  readonly attempted: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly acceptedMoves: EffectiveMoveAccepted[];
  readonly rejectedMoves: EffectiveMoveRejected[];
}
export interface LocalScheduleMoveResult { readonly planning: PlanningAssignment[]; readonly diagnostics: EffectiveMovesDiagnostics; readonly metrics: OperationalPlanningQualityMetrics; }

const PROTECTED = new Set<TaskInput["status"]>(["done", "in_progress"]);
const ACTIVE = new Set<TaskInput["status"]>(["pending", "interrupted"]);

const toMinutes = (value: string): number => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const duration = (item: PlanningAssignment): number => toMinutes(item.endPlanned) - toMinutes(item.startPlanned);
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean => aStart < bEnd && bStart < aEnd;
const total = (record: Record<string, number>): number => Object.values(record).reduce((sum, value) => sum + value, 0);

function sameCriticalMetricOrBetter(base: OperationalPlanningQualityMetrics, next: OperationalPlanningQualityMetrics): boolean {
  return next.operationalCompactness >= base.operationalCompactness
    && next.mainFlowContinuityQuality.gaps <= base.mainFlowContinuityQuality.gaps
    && total(next.resourceIdleTime) <= total(base.resourceIdleTime)
    && total(next.talentIdleTime) <= total(base.talentIdleTime);
}

function improvedMetrics(base: OperationalPlanningQualityMetrics, next: OperationalPlanningQualityMetrics): string[] {
  const improved: string[] = [];
  if (total(next.resourceIdleTime) < total(base.resourceIdleTime)) improved.push("resourceIdleTime");
  if (total(next.talentIdleTime) < total(base.talentIdleTime)) improved.push("talentIdleTime");
  if (total(next.talentActiveSpan) < total(base.talentActiveSpan)) improved.push("talentActiveSpan");
  if (total(next.resourceFragmentation) < total(base.resourceFragmentation)) improved.push("resourceFragmentation");
  if (next.operationalCompactness > base.operationalCompactness) improved.push("operationalCompactness");
  return improved;
}

function taskHasUnverifiedDependencies(task: TaskInput): boolean {
  return Boolean(task.hasDependency || task.dependsOnTaskId || task.dependsOnTemplateId || (task.dependsOnTaskIds?.length ?? 0) > 0 || (task.dependsOnTemplateIds?.length ?? 0) > 0);
}

function isLocked(input: EngineInput, taskId: number): boolean {
  return (input.locks ?? []).some((lock) => lock.taskId === taskId);
}

function validateNoOverlap(input: EngineInput, planning: PlanningAssignment[]): string | null {
  const tasks = new Map((input.tasks ?? []).map((task) => [task.id, task]));
  const windows = planning.map((entry) => ({ entry, task: tasks.get(entry.taskId), start: toMinutes(entry.startPlanned), end: toMinutes(entry.endPlanned) }));
  for (let i = 0; i < windows.length; i += 1) for (let j = i + 1; j < windows.length; j += 1) {
    const left = windows[i]; const right = windows[j];
    if (!overlaps(left.start, left.end, right.start, right.end)) continue;
    if ((left.entry.assignedResources ?? []).some((id) => (right.entry.assignedResources ?? []).includes(id))) return `resource-overlap:${left.entry.taskId}:${right.entry.taskId}`;
    if (left.task?.spaceId != null && left.task.spaceId === right.task?.spaceId) return `space-overlap:${left.entry.taskId}:${right.entry.taskId}`;
    const sameTalent = (left.task?.contestantId != null && left.task.contestantId === right.task?.contestantId) || (left.task?.itinerantTeamId != null && left.task.itinerantTeamId === right.task?.itinerantTeamId);
    if (sameTalent) return `talent-overlap:${left.entry.taskId}:${right.entry.taskId}`;
  }
  return null;
}

export function applyLocalScheduleMove(input: EngineInput, baselinePlanning: readonly PlanningAssignment[]): LocalScheduleMoveResult {
  const baseline = [...baselinePlanning].sort((a, b) => a.taskId - b.taskId);
  const baselineMetrics = calculateOperationalPlanningQualityMetrics(input, baseline);
  const rejectedMoves: EffectiveMoveRejected[] = [];
  let attempted = 0;
  const tasks = new Map((input.tasks ?? []).map((task) => [task.id, task]));
  const candidates = [...baseline]
    .filter((entry) => ACTIVE.has(tasks.get(entry.taskId)?.status as TaskInput["status"]))
    .sort((a, b) => toMinutes(a.startPlanned) - toMinutes(b.startPlanned) || a.taskId - b.taskId);

  for (const candidate of candidates) {
    const task = tasks.get(candidate.taskId);
    if (!task || PROTECTED.has(task.status) || isLocked(input, candidate.taskId) || taskHasUnverifiedDependencies(task)) {
      rejectedMoves.push({ taskId: candidate.taskId, reason: !task ? "task-not-found" : PROTECTED.has(task.status) ? `task-status-protected:${task.status}` : isLocked(input, candidate.taskId) ? "lock-protected" : "dependencies-not-verifiable" });
      continue;
    }
    const currentStart = toMinutes(candidate.startPlanned);
    const compatiblePreviousEnd = baseline
      .filter((entry) => entry.taskId !== candidate.taskId && toMinutes(entry.endPlanned) <= currentStart && (entry.assignedResources ?? []).some((id) => (candidate.assignedResources ?? []).includes(id)))
      .sort((a, b) => toMinutes(b.endPlanned) - toMinutes(a.endPlanned) || a.taskId - b.taskId)[0];
    if (!compatiblePreviousEnd) { rejectedMoves.push({ taskId: candidate.taskId, reason: "no-prior-resource-block" }); continue; }
    const nextStart = toMinutes(compatiblePreviousEnd.endPlanned);
    if (nextStart >= currentStart) { rejectedMoves.push({ taskId: candidate.taskId, reason: "no-positive-gap" }); continue; }
    attempted += 1;
    const nextEnd = nextStart + duration(candidate);
    if (nextStart < toMinutes(input.workDay.start) || nextEnd > toMinutes(input.workDay.end)) { rejectedMoves.push({ taskId: candidate.taskId, reason: "outside-workday" }); continue; }
    const nextPlanning = baseline.map((entry) => entry.taskId === candidate.taskId ? { ...entry, startPlanned: toTime(nextStart), endPlanned: toTime(nextEnd) } : entry);
    const overlap = validateNoOverlap(input, nextPlanning);
    if (overlap) { rejectedMoves.push({ taskId: candidate.taskId, reason: overlap }); continue; }
    const nextMetrics = calculateOperationalPlanningQualityMetrics(input, nextPlanning);
    const improved = improvedMetrics(baselineMetrics, nextMetrics);
    if (!sameCriticalMetricOrBetter(baselineMetrics, nextMetrics) || improved.length === 0) { rejectedMoves.push({ taskId: candidate.taskId, reason: "opqm-not-improved" }); continue; }
    return { planning: nextPlanning.sort((a, b) => a.taskId - b.taskId), metrics: nextMetrics, diagnostics: { attempted, accepted: 1, rejected: rejectedMoves.length, acceptedMoves: [{ taskId: candidate.taskId, fromStart: candidate.startPlanned, fromEnd: candidate.endPlanned, toStart: toTime(nextStart), toEnd: toTime(nextEnd), reason: "compact_resource_gap", improvedMetrics: improved }], rejectedMoves } };
  }
  return { planning: baseline, metrics: baselineMetrics, diagnostics: { attempted, accepted: 0, rejected: rejectedMoves.length, acceptedMoves: [], rejectedMoves } };
}
