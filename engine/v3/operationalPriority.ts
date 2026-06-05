import type { EngineOutput, TaskInput } from "../types";
import type { EngineV3Input } from "./types";
import { calculateCoachSwitchMetrics, getPlannedViews, toMinutes } from "./metrics";

export interface RestrictiveTalentUrgencyInput {
  workDayStartMin: number | null | undefined;
  workDayEndMin: number | null | undefined;
  availabilityStartMin: number | null | undefined;
  availabilityEndMin: number | null | undefined;
  remainingDurationMin: number | null | undefined;
  taskDurationMin: number | null | undefined;
  earliestStartMin?: number | null | undefined;
  feedsMainStage?: boolean;
}

const finite = (value: number | null | undefined): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const getDependencyIds = (task: Pick<TaskInput, "dependsOnTaskId" | "dependsOnTaskIds"> | any): number[] => [
  ...(Array.isArray(task?.dependsOnTaskIds) ? task.dependsOnTaskIds : []),
  ...(task?.dependsOnTaskId ? [task.dependsOnTaskId] : []),
].map(Number).filter((id) => Number.isFinite(id) && id > 0);

export const taskFeedsMainStage = (input: EngineV3Input, taskId: number): boolean => {
  const mainZoneId = Number(input.optimizerMainZoneId ?? NaN);
  if (!Number.isFinite(mainZoneId) || mainZoneId <= 0) return false;
  const normalizedTaskId = Number(taskId);
  if (!Number.isFinite(normalizedTaskId) || normalizedTaskId <= 0) return false;
  return (input.tasks ?? []).some((task: any) => {
    if (Number(task?.zoneId ?? NaN) !== mainZoneId) return false;
    return getDependencyIds(task).includes(normalizedTaskId);
  });
};

export const calculateRestrictiveTalentUrgency = (params: RestrictiveTalentUrgencyInput): number => {
  const dayStart = finite(params.workDayStartMin);
  const dayEnd = finite(params.workDayEndMin);
  const availabilityStart = finite(params.availabilityStartMin);
  const availabilityEnd = finite(params.availabilityEndMin);
  if (dayStart === null || dayEnd === null || availabilityStart === null || availabilityEnd === null || dayEnd <= dayStart || availabilityEnd <= availabilityStart) {
    return 0;
  }

  const restrictive = availabilityStart > dayStart || availabilityEnd < dayEnd;
  if (!restrictive) return 0;

  const remainingDuration = Math.max(0, finite(params.remainingDurationMin) ?? 0);
  const taskDuration = Math.max(0, finite(params.taskDurationMin) ?? 0);
  const earliestStart = finite(params.earliestStartMin) ?? Math.max(dayStart, availabilityStart);
  const effectiveRemaining = Math.max(remainingDuration, taskDuration);
  const remainingWindowFromEarliest = Math.max(0, availabilityEnd - Math.max(availabilityStart, earliestStart));
  const slack = remainingWindowFromEarliest - effectiveRemaining;
  const dayLength = Math.max(1, dayEnd - dayStart);

  const earlyEndPressure = clamp(dayEnd - availabilityEnd, 0, dayLength);
  const lateStartPressure = clamp(availabilityStart - dayStart, 0, dayLength) * 0.35;
  const slackPressure = clamp(180 - slack, 0, 360);
  const tightWindowPressure = clamp(360 - (availabilityEnd - availabilityStart), 0, 360) * 0.5;
  const feederBonus = params.feedsMainStage ? 90 : 0;

  const urgency = earlyEndPressure * 3 + lateStartPressure + slackPressure * 4 + tightWindowPressure + feederBonus;
  return Number.isFinite(urgency) ? Math.round(urgency) : 0;
};

export const calculateRestrictiveTalentLatenessPenalty = (input: EngineV3Input, output: EngineOutput): number => {
  const dayStart = toMinutes(input.workDay?.start);
  const dayEnd = toMinutes(input.workDay?.end);
  if (dayStart === null || dayEnd === null) return 0;

  const taskByContestant = new Map<number, number>();
  for (const task of input.tasks ?? []) {
    const contestantId = Number((task as any).contestantId ?? NaN);
    if (!Number.isFinite(contestantId) || contestantId <= 0) continue;
    const duration = Math.max(0, Math.floor(Number((task as any).durationOverrideMin ?? 30)));
    taskByContestant.set(contestantId, (taskByContestant.get(contestantId) ?? 0) + duration);
  }

  let penalty = 0;
  for (const view of getPlannedViews(input, output)) {
    const contestantId = Number(view.task.contestantId ?? NaN);
    if (!Number.isFinite(contestantId) || contestantId <= 0) continue;
    const window = input.contestantAvailabilityById?.[contestantId];
    const windowStart = toMinutes(window?.start);
    const windowEnd = toMinutes(window?.end);
    const start = toMinutes(view.startPlanned);
    if (windowStart === null || windowEnd === null || start === null) continue;
    const urgency = calculateRestrictiveTalentUrgency({
      workDayStartMin: dayStart,
      workDayEndMin: dayEnd,
      availabilityStartMin: windowStart,
      availabilityEndMin: windowEnd,
      remainingDurationMin: taskByContestant.get(contestantId) ?? Number(view.task.durationOverrideMin ?? 30),
      taskDurationMin: Number(view.task.durationOverrideMin ?? 30),
      earliestStartMin: windowStart,
      feedsMainStage: taskFeedsMainStage(input, Number(view.task.id)),
    });
    if (urgency <= 0) continue;
    penalty += Math.max(0, start - windowStart) * Math.max(1, urgency);
  }
  return Math.round(penalty);
};

export { getCoachResourceIds } from "./metrics";

export const calculateCoachSwitchPenalty = (input: EngineV3Input, output: EngineOutput): number =>
  calculateCoachSwitchMetrics(input, output).weightedPenalty;
