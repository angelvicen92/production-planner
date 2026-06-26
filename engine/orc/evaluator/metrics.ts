import type { ORCRecord, SimulatedState } from "../contracts";

export interface MetricEvaluation {
  readonly score: number;
  readonly explanation: string;
  readonly metrics: ORCRecord;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const round = (value: number): number => Math.round(clamp01(value) * 1_000_000) / 1_000_000;

function minutes(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function duration(start: string | null | undefined, end: string | null | undefined): number {
  const startMinutes = minutes(start);
  const endMinutes = minutes(end);
  if (startMinutes == null || endMinutes == null || endMinutes < startMinutes) return 0;
  return endMinutes - startMinutes;
}

function workDayDuration(simulatedState: SimulatedState): number {
  const workDay = simulatedState.operationalStateSnapshot.workDay ?? simulatedState.operationalStateSnapshot.availability.workDay;
  return duration(workDay?.start, workDay?.end);
}

function planningIntervals(simulatedState: SimulatedState): Array<{ start: number; end: number; duration: number; resources: readonly number[] }> {
  return simulatedState.operationalStateSnapshot.planning
    .map((item) => {
      const start = minutes(item.startPlanned) ?? 0;
      const end = minutes(item.endPlanned) ?? start;
      return { start, end, duration: Math.max(0, end - start), resources: item.assignedResourceIds ?? [] };
    })
    .filter((item) => item.duration > 0)
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

function span(intervals: Array<{ start: number; end: number }>): number {
  if (intervals.length === 0) return 0;
  return Math.max(...intervals.map((item) => item.end)) - Math.min(...intervals.map((item) => item.start));
}

function totalScheduledMinutes(simulatedState: SimulatedState): number {
  return planningIntervals(simulatedState).reduce((sum, item) => sum + item.duration, 0);
}

export function evaluateContinuity(simulatedState: SimulatedState): MetricEvaluation {
  const intervals = planningIntervals(simulatedState);
  if (intervals.length <= 1) return { score: 1, explanation: "Zero or one scheduled interval has no internal gaps.", metrics: { intervalCount: intervals.length, gapMinutes: 0 } };
  let gaps = 0;
  let cursor = intervals[0].end;
  for (const interval of intervals.slice(1)) {
    if (interval.start > cursor) gaps += interval.start - cursor;
    cursor = Math.max(cursor, interval.end);
  }
  const activeSpan = span(intervals);
  const score = round(1 - gaps / Math.max(activeSpan, 1));
  return { score, explanation: `Continuity compares ${gaps} gap minutes against ${activeSpan} active span minutes.`, metrics: { intervalCount: intervals.length, gapMinutes: gaps, activeSpanMinutes: activeSpan } };
}

export function evaluateMakespan(simulatedState: SimulatedState): MetricEvaluation {
  const activeSpan = span(planningIntervals(simulatedState));
  const day = workDayDuration(simulatedState);
  const score = activeSpan === 0 ? 1 : round(1 - activeSpan / Math.max(day || activeSpan, 1));
  return { score, explanation: `Makespan compares ${activeSpan} active span minutes against ${day} workday minutes.`, metrics: { activeSpanMinutes: activeSpan, workDayMinutes: day } };
}

export function evaluatePermanence(simulatedState: SimulatedState): MetricEvaluation {
  const transformationCount = simulatedState.appliedTransformations.length;
  const planningCount = simulatedState.operationalStateSnapshot.planning.length;
  const score = round(1 - transformationCount / Math.max(planningCount + transformationCount, 1));
  return { score, explanation: `Permanence penalizes ${transformationCount} applied transformations over ${planningCount} scheduled items.`, metrics: { transformationCount, planningCount } };
}

export function evaluateCompaction(simulatedState: SimulatedState): MetricEvaluation {
  const scheduled = totalScheduledMinutes(simulatedState);
  const activeSpan = span(planningIntervals(simulatedState));
  const score = activeSpan === 0 ? 1 : round(scheduled / activeSpan);
  return { score, explanation: `Compaction compares ${scheduled} scheduled minutes with ${activeSpan} active span minutes.`, metrics: { scheduledMinutes: scheduled, activeSpanMinutes: activeSpan } };
}

export function evaluateResourcePressure(simulatedState: SimulatedState): MetricEvaluation {
  const intervals = planningIntervals(simulatedState);
  const resourceIds = new Set(simulatedState.operationalStateSnapshot.resources.map((resource) => resource.id));
  intervals.forEach((interval) => interval.resources.forEach((id) => resourceIds.add(id)));
  const assignments = intervals.reduce((sum, interval) => sum + interval.resources.length, 0);
  const capacity = Math.max(resourceIds.size * Math.max(workDayDuration(simulatedState), 1), 1);
  const pressure = assignments === 0 ? 0 : intervals.reduce((sum, interval) => sum + interval.duration * Math.max(interval.resources.length, 1), 0) / capacity;
  const score = round(1 - pressure);
  return { score, explanation: `Resource pressure estimates ${Math.round(pressure * 1_000_000) / 1_000_000} utilization pressure across ${resourceIds.size} resources.`, metrics: { resourceCount: resourceIds.size, assignmentCount: assignments, pressure: round(pressure) } };
}

export function evaluateRobustness(simulatedState: SimulatedState): MetricEvaluation {
  const intervals = planningIntervals(simulatedState);
  const day = simulatedState.operationalStateSnapshot.workDay ?? simulatedState.operationalStateSnapshot.availability.workDay;
  const dayStart = minutes(day?.start);
  const dayEnd = minutes(day?.end);
  const protectedBreaks = [...simulatedState.operationalStateSnapshot.availability.globalHardBreaks, ...simulatedState.operationalStateSnapshot.availability.protectedBreaks];
  const safe = intervals.filter((interval) => {
    const inDay = dayStart == null || dayEnd == null || (interval.start >= dayStart && interval.end <= dayEnd);
    const avoidsBreak = protectedBreaks.every((breakWindow) => {
      const breakStart = minutes(breakWindow.start) ?? 0;
      const breakEnd = minutes(breakWindow.end) ?? breakStart;
      return interval.end <= breakStart || interval.start >= breakEnd;
    });
    return inDay && avoidsBreak;
  }).length;
  const score = intervals.length === 0 ? 1 : round(safe / intervals.length);
  return { score, explanation: `Robustness counts ${safe} of ${intervals.length} intervals inside operating windows and outside protected breaks.`, metrics: { safeIntervalCount: safe, intervalCount: intervals.length, protectedBreakCount: protectedBreaks.length } };
}

export function evaluateStability(simulatedState: SimulatedState): MetricEvaluation {
  const transformationCount = simulatedState.appliedTransformations.length;
  const taskCount = simulatedState.operationalStateSnapshot.tasks.length;
  const score = round(1 - transformationCount / Math.max(taskCount, transformationCount, 1));
  return { score, explanation: `Stability compares ${transformationCount} transformations with ${taskCount} tasks.`, metrics: { transformationCount, taskCount } };
}

export function evaluateFutureFreedom(simulatedState: SimulatedState): MetricEvaluation {
  const scheduledTaskIds = new Set(simulatedState.operationalStateSnapshot.planning.map((item) => item.taskId));
  const taskCount = simulatedState.operationalStateSnapshot.tasks.length;
  const unscheduled = Math.max(0, taskCount - scheduledTaskIds.size);
  const freeDayRatio = 1 - totalScheduledMinutes(simulatedState) / Math.max(workDayDuration(simulatedState) || totalScheduledMinutes(simulatedState) || 1, 1);
  const unscheduledRatio = taskCount === 0 ? 1 : unscheduled / taskCount;
  const score = round((clamp01(freeDayRatio) + clamp01(unscheduledRatio)) / 2);
  return { score, explanation: `Future freedom combines ${Math.round(freeDayRatio * 1_000_000) / 1_000_000} free-day ratio with ${unscheduledRatio} unscheduled-task ratio.`, metrics: { taskCount, scheduledTaskCount: scheduledTaskIds.size, unscheduledTaskCount: unscheduled, freeDayRatio: round(freeDayRatio), unscheduledRatio: round(unscheduledRatio) } };
}

export function evaluateOperationalMetrics(simulatedState: SimulatedState): Record<string, MetricEvaluation> {
  return {
    continuity: evaluateContinuity(simulatedState),
    makespan: evaluateMakespan(simulatedState),
    permanence: evaluatePermanence(simulatedState),
    compaction: evaluateCompaction(simulatedState),
    resourcePressure: evaluateResourcePressure(simulatedState),
    robustness: evaluateRobustness(simulatedState),
    stability: evaluateStability(simulatedState),
    futureFreedom: evaluateFutureFreedom(simulatedState),
  };
}

export function calculateOverallScore(breakdown: Record<string, MetricEvaluation>): number {
  const values = Object.values(breakdown).map((item) => item.score);
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
