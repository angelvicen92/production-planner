import { createHash } from "node:crypto";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";

export interface ParticipantItineraryGap {
  start: number;
  end: number;
  duration: number;
  beforeTaskId: string;
  afterTaskId: string;
  beforeSpaceId: string;
  afterSpaceId: string;
}

export interface ParticipantItineraryMetrics {
  participantId: string;
  taskCount: number;
  taskIds: string[];
  firstTaskId: string | null;
  firstTaskStart: number | null;
  lastTaskId: string | null;
  lastTaskEnd: number | null;
  presenceSpanMinutes: number;
  productiveMinutes: number;
  idleMinutes: number;
  idleRatio: number;
  gapCount: number;
  maximumGapMinutes: number;
  maximumGapBeforeTaskId: string | null;
  maximumGapAfterTaskId: string | null;
  gaps: ParticipantItineraryGap[];
  spaceChangeCount: number;
  usedAvailabilityWindowCount: number;
}

export interface ParticipantItineraryQualitySummary {
  participantCount: number;
  participantsWithTasks: number;
  totalPresenceSpanMinutes: number;
  totalProductiveMinutes: number;
  totalIdleMinutes: number;
  overallIdleRatio: number;
  maximumParticipantPresenceSpanMinutes: number;
  maximumParticipantIdleMinutes: number;
  maximumSingleGapMinutes: number;
  participantsWithInternalGaps: number;
  totalGapCount: number;
  totalSpaceChangeCount: number;
  participantIdsByIdleDescending: string[];
  participantIdsByPresenceDescending: string[];
  qualityFingerprint: string;
}

export interface ParticipantItineraryQualityEvaluation {
  participants: ParticipantItineraryMetrics[];
  summary: ParticipantItineraryQualitySummary;
}

const byTaskTime = (left: ScheduledTask, right: ScheduledTask) =>
  left.start - right.start || left.end - right.end || left.id.localeCompare(right.id);

function metricsForParticipant(problem: PlannerNextProblem, participantId: string, scheduledTasks: readonly ScheduledTask[]): ParticipantItineraryMetrics {
  const tasks = scheduledTasks.filter((task) => task.participantId === participantId).sort(byTaskTime);
  if (tasks.length === 0) return {
    participantId, taskCount: 0, taskIds: [], firstTaskId: null, firstTaskStart: null, lastTaskId: null, lastTaskEnd: null,
    presenceSpanMinutes: 0, productiveMinutes: 0, idleMinutes: 0, idleRatio: 0, gapCount: 0, maximumGapMinutes: 0,
    maximumGapBeforeTaskId: null, maximumGapAfterTaskId: null, gaps: [], spaceChangeCount: 0, usedAvailabilityWindowCount: 0,
  };

  const first = tasks[0]!;
  let productiveMinutes = 0;
  let unionStart = first.start;
  let unionEnd = first.end;
  let unionEndTask = first;
  const gaps: ParticipantItineraryGap[] = [];
  for (const task of tasks.slice(1)) {
    if (task.start > unionEnd) {
      productiveMinutes += Math.max(0, unionEnd - unionStart);
      gaps.push({ start: unionEnd, end: task.start, duration: task.start - unionEnd, beforeTaskId: unionEndTask.id,
        afterTaskId: task.id, beforeSpaceId: unionEndTask.spaceId, afterSpaceId: task.spaceId });
      unionStart = task.start; unionEnd = task.end; unionEndTask = task;
    } else if (task.end > unionEnd || (task.end === unionEnd && task.id.localeCompare(unionEndTask.id) < 0)) {
      unionEnd = Math.max(unionEnd, task.end); unionEndTask = task;
    }
  }
  productiveMinutes += Math.max(0, unionEnd - unionStart);
  const lastTaskEnd = Math.max(...tasks.map(({ end }) => end));
  const lastTask = tasks.filter(({ end }) => end === lastTaskEnd).sort(byTaskTime).at(-1)!;
  const presenceSpanMinutes = Math.max(0, lastTaskEnd - first.start);
  productiveMinutes = Math.min(presenceSpanMinutes, productiveMinutes);
  const idleMinutes = Math.max(0, presenceSpanMinutes - productiveMinutes);
  const maximumGap = [...gaps].sort((a, b) => b.duration - a.duration || a.start - b.start
    || a.beforeTaskId.localeCompare(b.beforeTaskId) || a.afterTaskId.localeCompare(b.afterTaskId))[0];
  const participant = problem.participants.find(({ id }) => id === participantId)!;
  const usedAvailabilityWindowCount = participant.availability.filter((window) =>
    tasks.some((task) => window.start <= task.start && task.end <= window.end)).length;
  return {
    participantId, taskCount: tasks.length, taskIds: tasks.map(({ id }) => id), firstTaskId: first.id, firstTaskStart: first.start,
    lastTaskId: lastTask.id, lastTaskEnd, presenceSpanMinutes, productiveMinutes, idleMinutes,
    idleRatio: presenceSpanMinutes === 0 ? 0 : idleMinutes / presenceSpanMinutes,
    gapCount: gaps.length, maximumGapMinutes: maximumGap?.duration ?? 0,
    maximumGapBeforeTaskId: maximumGap?.beforeTaskId ?? null, maximumGapAfterTaskId: maximumGap?.afterTaskId ?? null, gaps,
    spaceChangeCount: tasks.slice(1).reduce((count, task, index) => count + (tasks[index]!.spaceId === task.spaceId ? 0 : 1), 0),
    usedAvailabilityWindowCount,
  };
}

function fingerprint(participants: ParticipantItineraryMetrics[], integers: Omit<ParticipantItineraryQualitySummary, "overallIdleRatio" | "qualityFingerprint">): string {
  const canonicalParticipants = participants.map(({ idleRatio: _ratio, ...metrics }) => metrics);
  return createHash("sha256").update(JSON.stringify({ participants: canonicalParticipants, summary: integers })).digest("hex");
}

export function evaluateParticipantItineraryQuality(problem: PlannerNextProblem, scheduledTasks: readonly ScheduledTask[]): ParticipantItineraryQualityEvaluation {
  const participantIds = [...new Set(problem.participants.map(({ id }) => id).filter((id) => id.length > 0))].sort();
  const validIds = new Set(participantIds);
  const participantTasks = scheduledTasks.filter((task) => typeof task.participantId === "string" && validIds.has(task.participantId));
  const participants = participantIds.map((id) => metricsForParticipant(problem, id, participantTasks));
  const withTasks = participants.filter(({ taskCount }) => taskCount > 0);
  const totalPresenceSpanMinutes = withTasks.reduce((sum, item) => sum + item.presenceSpanMinutes, 0);
  const totalProductiveMinutes = withTasks.reduce((sum, item) => sum + item.productiveMinutes, 0);
  const totalIdleMinutes = withTasks.reduce((sum, item) => sum + item.idleMinutes, 0);
  const participantIdsByIdleDescending = withTasks.map(({ participantId }) => participantId).sort((a, b) =>
    participants.find((item) => item.participantId === b)!.idleMinutes - participants.find((item) => item.participantId === a)!.idleMinutes || a.localeCompare(b));
  const participantIdsByPresenceDescending = withTasks.map(({ participantId }) => participantId).sort((a, b) =>
    participants.find((item) => item.participantId === b)!.presenceSpanMinutes - participants.find((item) => item.participantId === a)!.presenceSpanMinutes || a.localeCompare(b));
  const integers = {
    participantCount: participantIds.length, participantsWithTasks: withTasks.length, totalPresenceSpanMinutes, totalProductiveMinutes, totalIdleMinutes,
    maximumParticipantPresenceSpanMinutes: Math.max(0, ...withTasks.map(({ presenceSpanMinutes }) => presenceSpanMinutes)),
    maximumParticipantIdleMinutes: Math.max(0, ...withTasks.map(({ idleMinutes }) => idleMinutes)),
    maximumSingleGapMinutes: Math.max(0, ...withTasks.map(({ maximumGapMinutes }) => maximumGapMinutes)),
    participantsWithInternalGaps: withTasks.filter(({ gapCount }) => gapCount > 0).length,
    totalGapCount: withTasks.reduce((sum, item) => sum + item.gapCount, 0),
    totalSpaceChangeCount: withTasks.reduce((sum, item) => sum + item.spaceChangeCount, 0),
    participantIdsByIdleDescending, participantIdsByPresenceDescending,
  };
  return { participants, summary: { ...integers, overallIdleRatio: totalPresenceSpanMinutes === 0 ? 0 : totalIdleMinutes / totalPresenceSpanMinutes,
    qualityFingerprint: fingerprint(participants, integers) } };
}
