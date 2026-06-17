import type { EngineInput, EngineOutput, TaskInput, TimeWindow } from "../types";
import type { V4StrategicAnalysis } from "./analysis";

export type V4QualityGrade = "EXCELLENT" | "GOOD" | "ACCEPTABLE" | "WEAK" | "BAD";

type Interval = { start: number; end: number };

export interface V4PlanQualityEvaluation {
  qualityScore: number;
  grade: V4QualityGrade;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  warnings: string[];
  mainFlowQuality: null | {
    firstTaskStart: string | null;
    lastTaskEnd: string | null;
    occupiedDurationMinutes: number;
    internalGapMinutes: number;
    internalGapCount: number;
    maxInternalGapMinutes: number;
    continuityPercent: number;
    plannedMainFlowTasks: number;
    unplannedMainFlowTasks: number;
  };
  makespan: {
    lastTaskEnd: string | null;
    plannedDayDurationMinutes: number;
    fromWorkDayStartMinutes: number | null;
  };
  talentStayTime: {
    averageStayMinutes: number;
    maxStayMinutes: number;
    totalStayMinutes: number;
    talentCount: number;
    topWaitingTalents: Array<{ talentId: number; talentName: string; waitMinutes: number; stayMinutes: number; workMinutes: number }>;
  };
  criticalResourceUsage: Array<{
    resourceId: number;
    resourceName: string;
    firstTaskStart: string | null;
    lastTaskEnd: string | null;
    loadMinutes: number;
    activeMinutes: number;
    internalGapMinutes: number;
    internalGapCount: number;
    compactnessPercent: number;
  }>;
  risk: {
    unplannedTasks: number;
    unplannedCriticalTalentTasks: number;
    unplannedMainFlowTasks: number;
    affectedCriticalResources: Array<{ resourceId: number; resourceName: string; unplannedTasks: number }>;
  };
}

const toMinutes = (value?: string | null): number | null => {
  const [h, m] = String(value ?? "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
const toHHMM = (minutes: number | null): string | null => minutes === null ? null : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const duration = (task?: TaskInput): number => Math.max(0, Number(task?.durationOverrideMin ?? 30) || 30);
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
const pct = (n: number) => clamp(n, 0, 100);

function windowToInterval(window?: TimeWindow | null): Interval | null {
  const start = toMinutes(window?.start);
  const end = toMinutes(window?.end);
  return start === null || end === null || end <= start ? null : { start, end };
}

function overlapMinutes(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

function excludedIntervals(input: EngineInput): Interval[] {
  const windows = [input.actualMeal, input.mealMode === "global_hard_break" ? input.meal : null, ...(input.globalHardBreaks ?? []), ...(input.protectedBreaks ?? [])];
  return windows.map(windowToInterval).filter((interval): interval is Interval => interval !== null);
}

function internalGaps(intervals: Interval[], exclusions: Interval[]): { gapMinutes: number; gapCount: number; maxGapMinutes: number } {
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  let gapMinutes = 0;
  let gapCount = 0;
  let maxGapMinutes = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const raw: Interval = { start: sorted[i - 1].end, end: sorted[i].start };
    if (raw.end <= raw.start) continue;
    const excluded = exclusions.reduce((sum, item) => sum + overlapMinutes(raw, item), 0);
    const net = Math.max(0, raw.end - raw.start - excluded);
    if (net > 0) {
      gapCount += 1;
      gapMinutes += net;
      maxGapMinutes = Math.max(maxGapMinutes, net);
    }
  }
  return { gapMinutes, gapCount, maxGapMinutes };
}

function taskResourceIds(task: TaskInput): number[] {
  return [
    ...Object.keys(task.resourceRequirements?.byItem ?? {}).map(Number),
    ...(task.resourceRequirements?.anyOf ?? []).flatMap((group) => group.resourceItemIds ?? []).map(Number),
    ...(task.assignedResourceIds ?? []).map(Number),
  ].filter(Number.isFinite);
}

export function evaluateV4PlanQuality(input: EngineInput, output: EngineOutput, strategicAnalysis: V4StrategicAnalysis): V4PlanQualityEvaluation {
  const warnings: string[] = [];
  const tasksById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const planned = (output.plannedTasks ?? []).map((item) => ({
    taskId: Number(item.taskId),
    task: tasksById.get(Number(item.taskId)),
    start: toMinutes(item.startPlanned),
    end: toMinutes(item.endPlanned),
    assignedResources: (item.assignedResources ?? []).map(Number).filter(Number.isFinite),
  })).filter((item) => item.start !== null && item.end !== null && item.end > item.start) as Array<{ taskId: number; task?: TaskInput; start: number; end: number; assignedResources: number[] }>;
  const plannedIds = new Set(planned.map((item) => item.taskId));
  const unplannedTasks = Array.isArray(output.unplanned) ? output.unplanned.length : Math.max(0, (input.tasks ?? []).filter((task) => task.status === "pending" && !plannedIds.has(task.id)).length);
  const exclusions = excludedIntervals(input);
  if ((input.locks?.length ?? 0) > 0) warnings.push("Manual locks are not fully subtracted from quality gaps unless they are represented as protected breaks.");

  const mainFlowTasks = strategicAnalysis.mainFlow ? (input.tasks ?? []).filter((task) => Number(task.spaceId ?? task.zoneId) === strategicAnalysis.mainFlow?.id || Number(task.zoneId) === strategicAnalysis.mainFlow?.id) : [];
  const mainFlowPlanned = planned.filter((item) => mainFlowTasks.some((task) => task.id === item.taskId));
  const mainFlowGap = internalGaps(mainFlowPlanned, exclusions);
  const mainFlowSpan = mainFlowPlanned.length ? Math.max(...mainFlowPlanned.map((i) => i.end)) - Math.min(...mainFlowPlanned.map((i) => i.start)) : 0;
  const mainFlowWork = mainFlowPlanned.reduce((sum, item) => sum + (item.end - item.start), 0);
  const mainFlowContinuity = mainFlowSpan > 0 ? pct((mainFlowWork / Math.max(1, mainFlowWork + mainFlowGap.gapMinutes)) * 100) : 0;
  const mainFlowQuality = strategicAnalysis.mainFlow ? {
    firstTaskStart: toHHMM(mainFlowPlanned.length ? Math.min(...mainFlowPlanned.map((i) => i.start)) : null),
    lastTaskEnd: toHHMM(mainFlowPlanned.length ? Math.max(...mainFlowPlanned.map((i) => i.end)) : null),
    occupiedDurationMinutes: mainFlowSpan,
    internalGapMinutes: mainFlowGap.gapMinutes,
    internalGapCount: mainFlowGap.gapCount,
    maxInternalGapMinutes: mainFlowGap.maxGapMinutes,
    continuityPercent: mainFlowContinuity,
    plannedMainFlowTasks: mainFlowPlanned.length,
    unplannedMainFlowTasks: mainFlowTasks.filter((task) => task.status === "pending" && !plannedIds.has(task.id)).length,
  } : null;

  const firstStart = planned.length ? Math.min(...planned.map((i) => i.start)) : null;
  const lastEnd = planned.length ? Math.max(...planned.map((i) => i.end)) : null;
  const dayStart = toMinutes(input.workDay?.start);
  const dayEnd = toMinutes(input.workDay?.end);
  const dayDuration = dayStart !== null && dayEnd !== null ? Math.max(1, dayEnd - dayStart) : Math.max(1, (lastEnd ?? 0) - (firstStart ?? 0));

  const byTalent = new Map<number, typeof planned>();
  for (const item of planned) {
    const talentId = Number(item.task?.contestantId);
    if (!Number.isFinite(talentId)) continue;
    byTalent.set(talentId, [...(byTalent.get(talentId) ?? []), item]);
  }
  const talents = [...byTalent.entries()].map(([talentId, items]) => {
    const start = Math.min(...items.map((i) => i.start));
    const end = Math.max(...items.map((i) => i.end));
    const work = items.reduce((sum, item) => sum + (item.end - item.start), 0);
    return { talentId, talentName: String(items[0]?.task?.contestantName ?? `Talent ${talentId}`), stayMinutes: end - start, workMinutes: work, waitMinutes: Math.max(0, end - start - work) };
  });

  const criticalResourceIds = new Set(strategicAnalysis.criticalResources.map((r) => r.id));
  const resourceNames = new Map([...(input.planResourceItems ?? []).map((r) => [Number(r.id), r.name] as const), ...strategicAnalysis.criticalResources.map((r) => [r.id, r.name] as const)]);
  const criticalResourceUsage = [...criticalResourceIds].map((resourceId) => {
    const items = planned.filter((item) => item.assignedResources.includes(resourceId) || taskResourceIds(item.task as TaskInput).includes(resourceId));
    const gaps = internalGaps(items, exclusions);
    const active = items.reduce((sum, item) => sum + (item.end - item.start), 0);
    const span = items.length ? Math.max(...items.map((i) => i.end)) - Math.min(...items.map((i) => i.start)) : 0;
    return { resourceId, resourceName: resourceNames.get(resourceId) ?? `Resource ${resourceId}`, firstTaskStart: toHHMM(items.length ? Math.min(...items.map((i) => i.start)) : null), lastTaskEnd: toHHMM(items.length ? Math.max(...items.map((i) => i.end)) : null), loadMinutes: active, activeMinutes: active, internalGapMinutes: gaps.gapMinutes, internalGapCount: gaps.gapCount, compactnessPercent: span > 0 ? pct((active / Math.max(1, active + gaps.gapMinutes)) * 100) : 0 };
  });

  const unplannedTaskInputs = (input.tasks ?? []).filter((task) => task.status === "pending" && !plannedIds.has(task.id));
  const affectedCriticalResources = [...criticalResourceIds].map((resourceId) => ({ resourceId, resourceName: resourceNames.get(resourceId) ?? `Resource ${resourceId}`, unplannedTasks: unplannedTaskInputs.filter((task) => taskResourceIds(task).includes(resourceId)).length })).filter((item) => item.unplannedTasks > 0);
  const criticalTalentIds = new Set(strategicAnalysis.criticalTalents.map((t) => t.id));

  let score = output.hardFeasible === false ? 20 : 100;
  if (unplannedTasks > 0) score -= Math.min(35, unplannedTasks * 5);
  if (mainFlowQuality) score -= Math.round((100 - mainFlowQuality.continuityPercent) * 0.25) + mainFlowQuality.unplannedMainFlowTasks * 8;
  if (lastEnd !== null && dayStart !== null) score -= Math.max(0, Math.round(((lastEnd - dayStart) / dayDuration - 0.85) * 25));
  score -= Math.min(12, unplannedTaskInputs.filter((task) => criticalTalentIds.has(Number(task.contestantId))).length * 4);
  const avgWait = talents.length ? talents.reduce((sum, t) => sum + t.waitMinutes, 0) / talents.length : 0;
  score -= Math.min(10, Math.round(avgWait / 30));
  const avgCompact = criticalResourceUsage.length ? criticalResourceUsage.reduce((sum, r) => sum + r.compactnessPercent, 0) / criticalResourceUsage.length : 100;
  score -= Math.min(8, Math.round((100 - avgCompact) / 15));
  score = clamp(score);

  const grade: V4QualityGrade = score >= 90 ? "EXCELLENT" : score >= 75 ? "GOOD" : score >= 60 ? "ACCEPTABLE" : score >= 40 ? "WEAK" : "BAD";
  const strengths = [mainFlowQuality && `Main flow continuity ${mainFlowQuality.continuityPercent}%`, unplannedTasks === 0 && "No unplanned tasks"].filter(Boolean) as string[];
  const weaknesses = [unplannedTasks > 0 && `${unplannedTasks} unplanned tasks`, mainFlowQuality && mainFlowQuality.internalGapMinutes > 0 && `${mainFlowQuality.internalGapMinutes} min internal main flow gaps`, avgWait > 60 && `Average talent wait ${Math.round(avgWait)} min`].filter(Boolean) as string[];

  return {
    qualityScore: score,
    grade,
    summary: mainFlowQuality ? `V4 main flow continuity is ${mainFlowQuality.continuityPercent}% and the plan finishes at ${toHHMM(lastEnd) ?? "—"}.` : `V4 plan finishes at ${toHHMM(lastEnd) ?? "—"}.`,
    strengths,
    weaknesses,
    warnings,
    mainFlowQuality,
    makespan: { lastTaskEnd: toHHMM(lastEnd), plannedDayDurationMinutes: firstStart !== null && lastEnd !== null ? lastEnd - firstStart : 0, fromWorkDayStartMinutes: dayStart !== null && lastEnd !== null ? lastEnd - dayStart : null },
    talentStayTime: { averageStayMinutes: talents.length ? Math.round(talents.reduce((s, t) => s + t.stayMinutes, 0) / talents.length) : 0, maxStayMinutes: talents.length ? Math.max(...talents.map((t) => t.stayMinutes)) : 0, totalStayMinutes: talents.reduce((s, t) => s + t.stayMinutes, 0), talentCount: talents.length, topWaitingTalents: talents.sort((a, b) => b.waitMinutes - a.waitMinutes).slice(0, 5) },
    criticalResourceUsage,
    risk: { unplannedTasks, unplannedCriticalTalentTasks: unplannedTaskInputs.filter((task) => criticalTalentIds.has(Number(task.contestantId))).length, unplannedMainFlowTasks: mainFlowQuality?.unplannedMainFlowTasks ?? 0, affectedCriticalResources },
  };
}
