import type { ORCRecord, SimulatedState } from "../contracts";

export interface MetricEvaluation {
  readonly score: number;
  readonly explanation: string;
  readonly metrics: ORCRecord;
  readonly penalties: ReadonlyArray<string>;
  readonly improvements: ReadonlyArray<string>;
}

export interface ProductionObjectiveWeights {
  readonly continuityScore: number;
  readonly availabilityScore: number;
  readonly criticalResourceScore: number;
  readonly waitingTimeScore: number;
  readonly replanningImpactScore: number;
  readonly operationalFeasibilityScore: number;
}

const DEFAULT_WEIGHTS: ProductionObjectiveWeights = {
  continuityScore: 1,
  availabilityScore: 1,
  criticalResourceScore: 1,
  waitingTimeScore: 1,
  replanningImpactScore: 1,
  operationalFeasibilityScore: 1,
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const round = (value: number): number => Math.round(clamp01(value) * 1_000_000) / 1_000_000;
const rounded = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 1_000_000) / 1_000_000;

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

type Interval = { taskId: number; start: number; end: number; duration: number; resources: readonly number[]; spaceId: number | null; contestantId: number | null };

function taskById(simulatedState: SimulatedState): Map<number, SimulatedState["operationalStateSnapshot"]["tasks"][number]> {
  return new Map(simulatedState.operationalStateSnapshot.tasks.map((task) => [task.id, task]));
}

function planningIntervals(simulatedState: SimulatedState): Interval[] {
  const tasks = taskById(simulatedState);
  return simulatedState.operationalStateSnapshot.planning
    .map((item) => {
      const task = tasks.get(item.taskId);
      const start = minutes(item.startPlanned) ?? 0;
      const end = minutes(item.endPlanned) ?? start;
      return { taskId: item.taskId, start, end, duration: Math.max(0, end - start), resources: item.assignedResourceIds ?? [], spaceId: item.spaceId ?? task?.spaceId ?? null, contestantId: task?.contestantId ?? null };
    })
    .filter((item) => item.duration > 0)
    .sort((left, right) => left.start - right.start || left.end - right.end || left.taskId - right.taskId);
}

function span(intervals: Array<{ start: number; end: number }>): number {
  if (intervals.length === 0) return 0;
  return Math.max(...intervals.map((item) => item.end)) - Math.min(...intervals.map((item) => item.start));
}

function totalScheduledMinutes(simulatedState: SimulatedState): number {
  return planningIntervals(simulatedState).reduce((sum, item) => sum + item.duration, 0);
}

function gapMinutes(intervals: Interval[]): number {
  if (intervals.length <= 1) return 0;
  let gaps = 0;
  let cursor = intervals[0].end;
  for (const interval of intervals.slice(1)) {
    if (interval.start > cursor) gaps += interval.start - cursor;
    cursor = Math.max(cursor, interval.end);
  }
  return gaps;
}

function mainStageSpaceIds(simulatedState: SimulatedState): Set<number> {
  const ids = new Set<number>();
  for (const [rawId, name] of Object.entries(simulatedState.operationalStateSnapshot.spaces.nameById)) {
    if (/main|principal|plat[oó]|stage|set/i.test(String(name))) ids.add(Number(rawId));
  }
  return ids;
}

function overlaps(left: { start: number; end: number }, right: { start: number; end: number }): boolean {
  return left.start < right.end && right.start < left.end;
}

function evaluateProductionContinuity(simulatedState: SimulatedState): MetricEvaluation {
  const all = planningIntervals(simulatedState);
  const mainSpaces = mainStageSpaceIds(simulatedState);
  const intervals = mainSpaces.size === 0 ? all : all.filter((interval) => interval.spaceId != null && mainSpaces.has(interval.spaceId));
  const gaps = gapMinutes(intervals);
  const activeSpan = span(intervals);
  const score = intervals.length <= 1 ? 1 : round(1 - gaps / Math.max(activeSpan, 1));
  return { score, explanation: `Continuity of the main production flow compares ${gaps} idle minutes against ${activeSpan} active span minutes.`, metrics: { intervalCount: intervals.length, mainStageSpaceCount: mainSpaces.size, gapMinutes: gaps, activeSpanMinutes: activeSpan }, penalties: gaps > 0 ? [`${gaps} minutes without scheduled main-flow activity.`] : [], improvements: gaps === 0 ? ["No internal gaps detected in the main production flow."] : [] };
}

function evaluateAvailabilityCompliance(simulatedState: SimulatedState): MetricEvaluation {
  const intervals = planningIntervals(simulatedState);
  const day = simulatedState.operationalStateSnapshot.workDay ?? simulatedState.operationalStateSnapshot.availability.workDay;
  const dayStart = minutes(day?.start);
  const dayEnd = minutes(day?.end);
  const hardBreaks = [...simulatedState.operationalStateSnapshot.availability.globalHardBreaks, ...simulatedState.operationalStateSnapshot.availability.protectedBreaks].map((item) => ({ start: minutes(item.start) ?? 0, end: minutes(item.end) ?? 0 }));
  const contestantWindows = simulatedState.operationalStateSnapshot.availability.contestantAvailabilityById;
  let violations = 0;
  for (const interval of intervals) {
    const inDay = dayStart == null || dayEnd == null || (interval.start >= dayStart && interval.end <= dayEnd);
    const avoidsBreaks = hardBreaks.every((item) => !overlaps(interval, item));
    const contestantWindow = interval.contestantId == null ? null : contestantWindows[interval.contestantId];
    const contestantStart = minutes(contestantWindow?.start);
    const contestantEnd = minutes(contestantWindow?.end);
    const inContestantWindow = contestantStart == null || contestantEnd == null || (interval.start >= contestantStart && interval.end <= contestantEnd);
    if (!inDay || !avoidsBreaks || !inContestantWindow) violations += 1;
  }
  const score = intervals.length === 0 ? 1 : round(1 - violations / intervals.length);
  return { score, explanation: `Availability checks workday, protected breaks and contestant windows with ${violations} violating intervals.`, metrics: { intervalCount: intervals.length, violationCount: violations, protectedWindowCount: hardBreaks.length }, penalties: violations > 0 ? [`${violations} intervals violate availability windows.`] : [], improvements: violations === 0 ? ["All scheduled intervals respect known availability windows."] : [] };
}

function evaluateCriticalResources(simulatedState: SimulatedState): MetricEvaluation {
  const intervals = planningIntervals(simulatedState);
  const resources = simulatedState.operationalStateSnapshot.resources;
  const unavailable = new Set(resources.filter((resource) => resource.isAvailable === false).map((resource) => resource.id));
  const assignedUnavailable = intervals.reduce((sum, interval) => sum + interval.resources.filter((id) => unavailable.has(id)).length, 0);
  const resourceMinutes = intervals.reduce((sum, interval) => sum + interval.duration * Math.max(interval.resources.length, 1), 0);
  const capacity = Math.max(Math.max(resources.length, 1) * Math.max(workDayDuration(simulatedState), 1), 1);
  const utilization = resourceMinutes / capacity;
  const overPressure = Math.max(0, utilization - 0.85) / 0.15;
  const score = round(1 - (assignedUnavailable + overPressure) / Math.max(intervals.length + 1, 1));
  return { score, explanation: `Critical resources combine unavailable assignments (${assignedUnavailable}) and utilization pressure (${rounded(utilization)}).`, metrics: { resourceCount: resources.length, assignedUnavailableCount: assignedUnavailable, utilization: rounded(utilization), resourceMinutes, capacityMinutes: capacity }, penalties: [...(assignedUnavailable > 0 ? [`${assignedUnavailable} unavailable resource assignments.`] : []), ...(utilization > 0.85 ? [`Critical resource utilization pressure is ${rounded(utilization)}.`] : [])], improvements: assignedUnavailable === 0 && utilization <= 0.85 ? ["Critical resources remain available and below pressure threshold."] : [] };
}

function evaluateWaitingTime(simulatedState: SimulatedState): MetricEvaluation {
  const intervals = planningIntervals(simulatedState);
  const gaps = gapMinutes(intervals);
  const day = workDayDuration(simulatedState);
  const score = round(1 - gaps / Math.max(day || span(intervals) || 1, 1));
  return { score, explanation: `Waiting time penalizes ${gaps} idle minutes across the simulated schedule.`, metrics: { gapMinutes: gaps, workDayMinutes: day, intervalCount: intervals.length }, penalties: gaps > 0 ? [`${gaps} idle minutes introduce waiting time.`] : [], improvements: gaps === 0 ? ["No waiting gaps detected between scheduled intervals."] : [] };
}

function evaluateReplanningImpact(simulatedState: SimulatedState): MetricEvaluation {
  const transformationCount = simulatedState.appliedTransformations.length;
  const planningCount = simulatedState.operationalStateSnapshot.planning.length;
  const score = round(1 - transformationCount / Math.max(planningCount + transformationCount, 1));
  return { score, explanation: `Replanning impact penalizes ${transformationCount} applied transformations over ${planningCount} scheduled items.`, metrics: { transformationCount, planningCount }, penalties: transformationCount > 0 ? [`${transformationCount} transformations required to reach the simulated state.`] : [], improvements: transformationCount === 0 ? ["Simulated state preserves the existing plan without transformations."] : [] };
}

function evaluateOperationalFeasibility(simulatedState: SimulatedState): MetricEvaluation {
  const intervals = planningIntervals(simulatedState);
  const tasks = taskById(simulatedState);
  let violations = 0;
  for (let index = 0; index < intervals.length; index += 1) {
    const interval = intervals[index];
    const task = tasks.get(interval.taskId);
    const fixedStart = minutes(task?.fixedWindowStart);
    const fixedEnd = minutes(task?.fixedWindowEnd);
    if ((fixedStart != null && interval.start < fixedStart) || (fixedEnd != null && interval.end > fixedEnd)) violations += 1;
    for (const dependency of simulatedState.operationalStateSnapshot.dependencies.filter((item) => item.taskId === interval.taskId)) {
      for (const dependencyTaskId of dependency.dependsOnTaskIds ?? []) {
        const dependencyInterval = intervals.find((item) => item.taskId === dependencyTaskId);
        if (dependencyInterval && dependencyInterval.end > interval.start) violations += 1;
      }
    }
    for (const other of intervals.slice(index + 1)) {
      if (!overlaps(interval, other)) continue;
      if (interval.resources.some((id) => other.resources.includes(id))) violations += 1;
      const exclusive = interval.spaceId != null && interval.spaceId === other.spaceId && simulatedState.operationalStateSnapshot.spaces.exclusiveById[interval.spaceId] !== false;
      if (exclusive) violations += 1;
    }
  }
  const score = round(1 - violations / Math.max(intervals.length + violations, 1));
  return { score, explanation: `Operational feasibility checks fixed windows, dependencies and resource/space overlaps with ${violations} detected violations.`, metrics: { intervalCount: intervals.length, violationCount: violations }, penalties: violations > 0 ? [`${violations} operational feasibility violations detected.`] : [], improvements: violations === 0 ? ["No operational feasibility violations detected."] : [] };
}

export function evaluateOperationalMetrics(simulatedState: SimulatedState): Record<string, MetricEvaluation> {
  return {
    continuityScore: evaluateProductionContinuity(simulatedState),
    availabilityScore: evaluateAvailabilityCompliance(simulatedState),
    criticalResourceScore: evaluateCriticalResources(simulatedState),
    waitingTimeScore: evaluateWaitingTime(simulatedState),
    replanningImpactScore: evaluateReplanningImpact(simulatedState),
    operationalFeasibilityScore: evaluateOperationalFeasibility(simulatedState),
  };
}

export function calculateOverallScore(breakdown: Record<string, MetricEvaluation>, weights: Partial<ProductionObjectiveWeights> = {}): number {
  const configured = { ...DEFAULT_WEIGHTS, ...weights };
  let weighted = 0;
  let totalWeight = 0;
  for (const [key, evaluation] of Object.entries(breakdown)) {
    const weight = Math.max(0, Number(configured[key as keyof ProductionObjectiveWeights] ?? 0));
    weighted += evaluation.score * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  return round(weighted / totalWeight);
}

export const evaluateContinuity = evaluateProductionContinuity;
export const evaluateMakespan = evaluateAvailabilityCompliance;
export const evaluatePermanence = evaluateReplanningImpact;
export const evaluateCompaction = evaluateWaitingTime;
export const evaluateResourcePressure = evaluateCriticalResources;
export const evaluateRobustness = evaluateOperationalFeasibility;
export const evaluateStability = evaluateReplanningImpact;
export function evaluateFutureFreedom(simulatedState: SimulatedState): MetricEvaluation {
  const scheduledTaskIds = new Set(simulatedState.operationalStateSnapshot.planning.map((item) => item.taskId));
  const taskCount = simulatedState.operationalStateSnapshot.tasks.length;
  const unscheduled = Math.max(0, taskCount - scheduledTaskIds.size);
  const freeDayRatio = 1 - totalScheduledMinutes(simulatedState) / Math.max(workDayDuration(simulatedState) || totalScheduledMinutes(simulatedState) || 1, 1);
  const unscheduledRatio = taskCount === 0 ? 1 : unscheduled / taskCount;
  const score = round((clamp01(freeDayRatio) + clamp01(unscheduledRatio)) / 2);
  return { score, explanation: `Future freedom combines ${rounded(freeDayRatio)} free-day ratio with ${rounded(unscheduledRatio)} unscheduled-task ratio.`, metrics: { taskCount, scheduledTaskCount: scheduledTaskIds.size, unscheduledTaskCount: unscheduled, freeDayRatio: round(freeDayRatio), unscheduledRatio: round(unscheduledRatio) }, penalties: [], improvements: [] };
}
