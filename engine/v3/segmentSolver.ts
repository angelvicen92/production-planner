import type { EngineOutput, TaskInput } from "../types";
import type { EngineV3Input } from "./types";
import { detectCoachAssignments } from "./coachDetection";
import { validateHardConstraints } from "./hardValidation";
import { getMealMode, getMealWindow, isMealTask } from "./mealSemantics";
import { toMinutes } from "./metrics";
import { calculateEngineOperationalCompactionMetrics } from "./operationalQuality";
import { getDependencyIds } from "./operationalPriority";
import { scoreCandidateSolution, type CandidateSolutionScore } from "./solutionScoring";
import { validateOptimizedCandidate } from "./validateCandidate";
import { getSpaceCapacity } from "./spaceCapacity";

export const SEGMENT_SOLVER_MAX_TASKS = 25;
export const SEGMENT_SOLVER_MAX_SEGMENTS = 3;
export const SEGMENT_SOLVER_MAX_MICROSEGMENTS = 4;
export const SEGMENT_SOLVER_MAX_MICRO_TASKS = 18;
export const SEGMENT_SOLVER_MAX_EXPANDED_TASKS = 22;
export const SEGMENT_SOLVER_MAX_MICRO_MOVABLE_TASKS = 14;
export const SEGMENT_SOLVER_MAX_EXPANDED_MOVABLE_TASKS = 16;
export const SEGMENT_SOLVER_MAX_ASSIGNMENTS = 2_500;
export const SEGMENT_SOLVER_GRID_MINUTES = 5;
export const SEGMENT_SOLVER_DEFAULT_TIMEOUT_MS = 4_000;
export const SEGMENT_SOLVER_MICRO_TIMEOUT_MS = 1_200;
export const SEGMENT_SOLVER_MAX_WINDOW_MINUTES = 5 * 60;
export const SEGMENT_SOLVER_MAX_REPAIR_DEPTH = 2;
export const SEGMENT_SOLVER_MAX_REPAIR_ADDED_TASKS = 6;
export const SEGMENT_SOLVER_MAX_REPAIR_MOVED_TASKS = 10;

type MicroSegmentStrategy = "bridge" | "left_shift_right_block" | "right_shift_left_block" | "coach_block_reorder" | "left_shift_with_blocker_expansion" | "right_shift_with_blocker_expansion" | "bridge_with_blocker_expansion";

export type SegmentSolverReason =
  | "accepted"
  | "candidate_not_better"
  | "segment_candidate_valid_but_not_better"
  | "no_problematic_coach_segment"
  | "segment_too_large"
  | "wide_segment_too_large_microsegments_attempted"
  | "microsegment_no_valid_candidate"
  | "solver_disabled"
  | "missing_solver_runtime"
  | "no_movable_tasks"
  | "segment_solver_timeout"
  | "cancelled";

export type SegmentSolverCompactMetrics = Pick<CandidateSolutionScore,
  | "maxCoachGapMinutes" | "coachSplitDayPenalty" | "coachIdlePenalty" | "coachSpanPenalty"
  | "talentIdlePenalty" | "makespan" | "hardConstraintViolations" | "mainStageGapMinutes" | "plannedTasks"
>;

export interface CriticalCoachGap {
  coachId: number;
  coachName: string;
  gapStart: number;
  gapEnd: number;
  gapMinutes: number;
  leftBlockTaskIds: number[];
  rightBlockTaskIds: number[];
  leftBlockTalentNames: string[];
  rightBlockTalentNames: string[];
}

export interface SegmentSolverMeta {
  segmentSolverAttempted: boolean;
  segmentSolverBackend: "bounded_exact_search";
  segmentSolverSegmentsBuilt: number;
  segmentSolverCandidatesGenerated: number;
  segmentSolverAccepted: boolean;
  segmentSolverReason: SegmentSolverReason | string;
  segmentSolverRejectedReasons: string[];
  segmentSolverTargetCoachName?: string;
  segmentSolverWindowStart?: string;
  segmentSolverWindowEnd?: string;
  segmentSolverTaskCount?: number;
  segmentSolverTalentNames?: string[];
  segmentSolverResourceNames?: string[];
  segmentSolverCriticalGapStart?: string;
  segmentSolverCriticalGapEnd?: string;
  segmentSolverCriticalGapMinutes?: number;
  segmentSolverLeftBlockTalentNames?: string[];
  segmentSolverRightBlockTalentNames?: string[];
  segmentSolverMicroSegmentsBuilt: number;
  segmentSolverMicroSegmentStrategiesTried: string[];
  segmentSolverMicroSegmentTaskCounts: number[];
  segmentSolverMicroSegmentRejectedReasons: string[];
  segmentSolverAssignmentsExplored: number;
  segmentSolverValidCandidates: number;
  segmentSolverBestCandidateMovedTaskIds: number[];
  segmentSolverBestCandidateMovedTalentNames: string[];
  segmentSolverBestCandidateReason?: string;
  segmentSolverBestBefore?: SegmentSolverCompactMetrics;
  segmentSolverBestAfter?: SegmentSolverCompactMetrics;
  segmentSolverImprovement?: string;
  segmentSolverTimeoutMs: number;
  segmentSolverElapsedMs: number;
  segmentSolverMealMovesAttempted: boolean;
  segmentSolverMealMovesAccepted: boolean;
  segmentSolverMealMoveCount: number;
  segmentSolverMealRejectedReasons: string[];
  segmentSolverTopBlockers: SegmentSolverBlocker[];
  segmentSolverTopResourceBlockers: SegmentSolverBlocker[];
  segmentSolverTopDependencyBlockers: SegmentSolverBlocker[];
  segmentSolverTopMealBlockers: SegmentSolverBlocker[];
  segmentSolverTopMainStageBlockers: SegmentSolverBlocker[];
  segmentSolverLocalChecksPerformed: number;
  segmentSolverLocalChecksRejected: number;
  segmentSolverFullValidationsPerformed: number;
  segmentSolverFullValidationsRejected: number;
  segmentSolverExpandedMicroSegmentsBuilt: number;
  segmentSolverExpansionTaskIds: number[];
  segmentSolverExpansionReasons: string[];
  segmentSolverExpansionRejectedReasons: string[];
  segmentSolverDirectRepairsAttempted: number;
  segmentSolverDirectRepairsAccepted: number;
  segmentSolverDirectRepairStrategiesTried: string[];
  segmentSolverDirectRepairRejectedReasons: string[];
  segmentSolverRepairChainsAttempted: number;
  segmentSolverRepairChainsAccepted: number;
  segmentSolverRepairChainMaxDepthReached: number;
  segmentSolverRepairChainDepths: number[];
  segmentSolverRepairChainMovedTaskIds: number[];
  segmentSolverRepairChainBlockedBy: string[];
  segmentSolverRepairChainRejectedReasons: string[];
  segmentSolverEarlyStopReason?: string;
  segmentSolverBestFeasibleSeenAtMs?: number;
  segmentSolverFeasibleButNotSelected: boolean;
  segmentSolverCandidateMetrics: SegmentSolverCandidateMetrics[];
}

export interface SegmentSolverOptions {
  timeoutMs?: number;
  maxSegments?: number;
  disabled?: boolean;
  shouldCancel?: () => boolean;
}

export const normalizeSegmentSolverMetadata = (meta?: Partial<NonNullable<EngineOutput["v3Meta"]>> | Partial<SegmentSolverMeta>): Partial<NonNullable<EngineOutput["v3Meta"]>> => ({
  segmentSolverAttempted: meta?.segmentSolverAttempted ?? false,
  segmentSolverBackend: meta?.segmentSolverBackend ?? "bounded_exact_search",
  segmentSolverSegmentsBuilt: meta?.segmentSolverSegmentsBuilt ?? 0,
  segmentSolverCandidatesGenerated: meta?.segmentSolverCandidatesGenerated ?? 0,
  segmentSolverAccepted: meta?.segmentSolverAccepted ?? false,
  segmentSolverReason: meta?.segmentSolverReason ?? "no_problematic_coach_segment",
  segmentSolverRejectedReasons: meta?.segmentSolverRejectedReasons ?? [],
  segmentSolverMicroSegmentsBuilt: meta?.segmentSolverMicroSegmentsBuilt ?? 0,
  segmentSolverMicroSegmentStrategiesTried: meta?.segmentSolverMicroSegmentStrategiesTried ?? [],
  segmentSolverMicroSegmentTaskCounts: meta?.segmentSolverMicroSegmentTaskCounts ?? [],
  segmentSolverMicroSegmentRejectedReasons: meta?.segmentSolverMicroSegmentRejectedReasons ?? [],
  segmentSolverAssignmentsExplored: meta?.segmentSolverAssignmentsExplored ?? 0,
  segmentSolverValidCandidates: meta?.segmentSolverValidCandidates ?? 0,
  segmentSolverBestCandidateMovedTaskIds: meta?.segmentSolverBestCandidateMovedTaskIds ?? [],
  segmentSolverBestCandidateMovedTalentNames: meta?.segmentSolverBestCandidateMovedTalentNames ?? [],
  segmentSolverTimeoutMs: meta?.segmentSolverTimeoutMs ?? SEGMENT_SOLVER_DEFAULT_TIMEOUT_MS,
  segmentSolverElapsedMs: meta?.segmentSolverElapsedMs ?? 0,
  segmentSolverMealMovesAttempted: meta?.segmentSolverMealMovesAttempted ?? false,
  segmentSolverMealMovesAccepted: meta?.segmentSolverMealMovesAccepted ?? false,
  segmentSolverMealMoveCount: meta?.segmentSolverMealMoveCount ?? 0,
  segmentSolverMealRejectedReasons: meta?.segmentSolverMealRejectedReasons ?? [],
  segmentSolverTopBlockers: meta?.segmentSolverTopBlockers ?? [],
  segmentSolverTopResourceBlockers: meta?.segmentSolverTopResourceBlockers ?? [],
  segmentSolverTopDependencyBlockers: meta?.segmentSolverTopDependencyBlockers ?? [],
  segmentSolverTopMealBlockers: meta?.segmentSolverTopMealBlockers ?? [],
  segmentSolverTopMainStageBlockers: meta?.segmentSolverTopMainStageBlockers ?? [],
  segmentSolverLocalChecksPerformed: meta?.segmentSolverLocalChecksPerformed ?? 0,
  segmentSolverLocalChecksRejected: meta?.segmentSolverLocalChecksRejected ?? 0,
  segmentSolverFullValidationsPerformed: meta?.segmentSolverFullValidationsPerformed ?? 0,
  segmentSolverFullValidationsRejected: meta?.segmentSolverFullValidationsRejected ?? 0,
  segmentSolverExpandedMicroSegmentsBuilt: meta?.segmentSolverExpandedMicroSegmentsBuilt ?? 0,
  segmentSolverExpansionTaskIds: meta?.segmentSolverExpansionTaskIds ?? [],
  segmentSolverExpansionReasons: meta?.segmentSolverExpansionReasons ?? [],
  segmentSolverExpansionRejectedReasons: meta?.segmentSolverExpansionRejectedReasons ?? [],
  segmentSolverDirectRepairsAttempted: meta?.segmentSolverDirectRepairsAttempted ?? 0,
  segmentSolverDirectRepairsAccepted: meta?.segmentSolverDirectRepairsAccepted ?? 0,
  segmentSolverDirectRepairStrategiesTried: meta?.segmentSolverDirectRepairStrategiesTried ?? [],
  segmentSolverDirectRepairRejectedReasons: meta?.segmentSolverDirectRepairRejectedReasons ?? [],
  segmentSolverRepairChainsAttempted: meta?.segmentSolverRepairChainsAttempted ?? 0,
  segmentSolverRepairChainsAccepted: meta?.segmentSolverRepairChainsAccepted ?? 0,
  segmentSolverRepairChainMaxDepthReached: meta?.segmentSolverRepairChainMaxDepthReached ?? 0,
  segmentSolverRepairChainDepths: meta?.segmentSolverRepairChainDepths ?? [],
  segmentSolverRepairChainMovedTaskIds: meta?.segmentSolverRepairChainMovedTaskIds ?? [],
  segmentSolverRepairChainBlockedBy: meta?.segmentSolverRepairChainBlockedBy ?? [],
  segmentSolverRepairChainRejectedReasons: meta?.segmentSolverRepairChainRejectedReasons ?? [],
  segmentSolverFeasibleButNotSelected: meta?.segmentSolverFeasibleButNotSelected ?? false,
  segmentSolverCandidateMetrics: meta?.segmentSolverCandidateMetrics ?? [],
}) as Partial<NonNullable<EngineOutput["v3Meta"]>>;

export interface CriticalCoachSegment {
  coachId: number;
  coachName: string;
  windowStart: number;
  windowEnd: number;
  taskIds: number[];
  movableTaskIds: number[];
  talentIds: number[];
  talentNames: string[];
  resourceIds: number[];
  resourceNames: string[];
}

export interface CoachMicroSegment extends CriticalCoachSegment {
  strategy: MicroSegmentStrategy;
  offsetMinutes: number[];
  targetTaskIds: number[];
}

const hhmm = (value: number): string => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const roundUpGrid = (value: number): number => Math.ceil(value / SEGMENT_SOLVER_GRID_MINUTES) * SEGMENT_SOLVER_GRID_MINUTES;
const normalize = (value: unknown): string => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const intervalOverlaps = (start: number, end: number, windowStart: number, windowEnd: number) => start < windowEnd && windowStart < end;
const uniq = <T>(values: T[]): T[] => [...new Set(values)];

const compactMetrics = (score: CandidateSolutionScore): SegmentSolverCompactMetrics => ({
  maxCoachGapMinutes: score.maxCoachGapMinutes,
  coachSplitDayPenalty: score.coachSplitDayPenalty,
  coachIdlePenalty: score.coachIdlePenalty,
  coachSpanPenalty: score.coachSpanPenalty,
  talentIdlePenalty: score.talentIdlePenalty,
  makespan: score.makespan,
  hardConstraintViolations: score.hardConstraintViolations,
  mainStageGapMinutes: score.mainStageGapMinutes,
  plannedTasks: score.plannedTasks,
});

const taskLabel = (input: EngineV3Input, task: TaskInput): string => normalize(task.templateName ?? input.taskTemplateNameById?.[Number(task.templateId)] ?? "");
const isTransportTask = (input: EngineV3Input, task: TaskInput): boolean => {
  if (Number(input.transportSpaceId ?? NaN) === Number(task.spaceId ?? NaN)) return true;
  const configured = [input.arrivalTaskTemplateName, input.departureTaskTemplateName].map(normalize).filter(Boolean);
  const label = taskLabel(input, task);
  return configured.includes(label) || /(^|\s)(transport|transporte|traslado|llegada|salida|recogida|pickup|dropoff)(\s|$)/.test(label);
};

const isFixedTask = (input: EngineV3Input, task: TaskInput): boolean => {
  const status = normalize(task.status);
  if (status === "done" || status === "in_progress" || status === "cancelled") return true;
  if (Boolean((task as any).isManualBlock)) return true;
  if ((input.locks ?? []).some((lock) => Number(lock.taskId) === Number(task.id))) return true;
  if (Number(task.zoneId ?? NaN) === Number(input.optimizerMainZoneId ?? NaN)) return true;
  if (isTransportTask(input, task)) return true;
  if ((task.fixedWindowStart || task.fixedWindowEnd) && !isMealTask(input, task)) return true;
  return false;
};

export const findCriticalCoachGap = (input: EngineV3Input, output: EngineOutput, coachId: number): CriticalCoachGap | null => {
  const group = detectCoachAssignments(input, output).find((item) => Number(item.coachId) === Number(coachId));
  if (!group || group.intervals.length < 2 || group.coachId === null) return null;
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const intervals = [...group.intervals].sort((a, b) => a.start - b.start || a.end - b.end || a.taskId - b.taskId);
  let mergedEnd = intervals[0].end;
  let currentBlock = [intervals[0].taskId];
  let best: { start: number; end: number; left: number[]; right: number[] } | null = null;
  for (let index = 1; index < intervals.length; index += 1) {
    const interval = intervals[index];
    if (interval.start > mergedEnd) {
      const right: number[] = [interval.taskId];
      for (let cursor = index + 1; cursor < intervals.length && intervals[cursor].start <= interval.end; cursor += 1) right.push(intervals[cursor].taskId);
      if (!best || interval.start - mergedEnd > best.end - best.start) best = { start: mergedEnd, end: interval.start, left: [...currentBlock], right };
      currentBlock = [interval.taskId];
      mergedEnd = interval.end;
    } else {
      currentBlock.push(interval.taskId);
      mergedEnd = Math.max(mergedEnd, interval.end);
    }
  }
  if (!best || best.end <= best.start) return null;
  const names = (ids: number[]) => uniq(ids.map((id) => String(taskById.get(id)?.contestantName ?? "").trim()).filter(Boolean));
  return {
    coachId: group.coachId,
    coachName: group.coachName,
    gapStart: best.start,
    gapEnd: best.end,
    gapMinutes: best.end - best.start,
    leftBlockTaskIds: best.left,
    rightBlockTaskIds: best.right,
    leftBlockTalentNames: names(best.left),
    rightBlockTalentNames: names(best.right),
  };
};

export const buildCriticalCoachSegments = (input: EngineV3Input, output: EngineOutput, maxSegments = SEGMENT_SOLVER_MAX_SEGMENTS): CriticalCoachSegment[] => {
  const plannedById = new Map((output.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const compaction = calculateEngineOperationalCompactionMetrics(input, output);
  const dayStart = toMinutes(input.workDay.start) ?? 0;
  const dayEnd = toMinutes(input.workDay.end) ?? 24 * 60;
  const resourceById = new Map((input.planResourceItems ?? []).map((resource) => [Number(resource.id), resource.name]));
  return compaction.coaches
    .filter((metric) => metric.maxGapMinutes > 0 && metric.idleMinutes > 0)
    .sort((a, b) => b.maxGapMinutes - a.maxGapMinutes || b.idleMinutes - a.idleMinutes || a.id - b.id)
    .slice(0, Math.max(0, maxSegments))
    .flatMap((metric): CriticalCoachSegment[] => {
      const gap = findCriticalCoachGap(input, output, metric.id);
      if (!gap) return [];
      let windowStart = Math.max(dayStart, gap.gapStart - 60);
      let windowEnd = Math.min(dayEnd, gap.gapEnd + 60);
      if (windowEnd - windowStart > SEGMENT_SOLVER_MAX_WINDOW_MINUTES) {
        const center = Math.floor((gap.gapStart + gap.gapEnd) / 2);
        windowStart = Math.max(dayStart, center - Math.floor(SEGMENT_SOLVER_MAX_WINDOW_MINUTES / 2));
        windowEnd = Math.min(dayEnd, windowStart + SEGMENT_SOLVER_MAX_WINDOW_MINUTES);
      }
      const coachTaskIds = new Set([...gap.leftBlockTaskIds, ...gap.rightBlockTaskIds]);
      const talentIds = new Set<number>();
      coachTaskIds.forEach((id) => {
        const talentId = Number(taskById.get(id)?.contestantId ?? NaN);
        if (Number.isFinite(talentId) && talentId > 0) talentIds.add(talentId);
      });
      const selected = new Set<number>();
      for (const task of input.tasks ?? []) {
        const planned = plannedById.get(Number(task.id));
        const start = toMinutes(planned?.startPlanned);
        const end = toMinutes(planned?.endPlanned);
        if (start === null || end === null || !intervalOverlaps(start, end, windowStart, windowEnd)) continue;
        if (coachTaskIds.has(Number(task.id)) || talentIds.has(Number(task.contestantId))) selected.add(Number(task.id));
      }
      let changed = true;
      while (changed && selected.size <= SEGMENT_SOLVER_MAX_TASKS * 4) {
        changed = false;
        for (const taskId of [...selected]) for (const dependencyId of getDependencyIds(taskById.get(taskId)!)) {
          if (taskById.has(dependencyId) && plannedById.has(dependencyId) && !selected.has(dependencyId)) { selected.add(dependencyId); changed = true; }
        }
      }
      const taskIds = [...selected].filter((id) => plannedById.has(id)).sort((a, b) => a - b);
      const movableTaskIds = taskIds.filter((id) => { const task = taskById.get(id); return Boolean(task && !isFixedTask(input, task)); });
      const resourceIds = uniq(taskIds.flatMap((id) => (plannedById.get(id)?.assignedResources ?? []).map(Number))).sort((a, b) => a - b);
      const talentNames = uniq([...talentIds].map((talentId) => input.tasks.find((task) => Number(task.contestantId) === talentId)?.contestantName?.trim() || `Talent ${talentId}`));
      return [{ coachId: gap.coachId, coachName: gap.coachName, windowStart, windowEnd, taskIds, movableTaskIds, talentIds: [...talentIds], talentNames, resourceIds, resourceNames: resourceIds.map((id) => resourceById.get(id) ?? `Resource ${id}`) }];
    });
};

export const buildCoachMicroSegments = (input: EngineV3Input, output: EngineOutput, gap: CriticalCoachGap): { segments: CoachMicroSegment[]; rejectedReasons: string[] } => {
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const plannedById = new Map((output.plannedTasks ?? []).map((task) => [Number(task.taskId), task]));
  const dayStart = toMinutes(input.workDay.start) ?? 0;
  const dayEnd = toMinutes(input.workDay.end) ?? 24 * 60;
  const resourceById = new Map((input.planResourceItems ?? []).map((resource) => [Number(resource.id), resource.name]));
  const rejected = new Set<string>();
  const definitions: Array<{ strategy: MicroSegmentStrategy; seeds: number[]; offsets: number[]; maxTalents: number; maxMovable: number }> = [
    { strategy: "left_shift_right_block", seeds: gap.rightBlockTaskIds.slice(0, 2), offsets: [-120, -90, -75, -60, -45, -30, -15], maxTalents: 3, maxMovable: 15 },
    { strategy: "bridge", seeds: [...gap.leftBlockTaskIds.slice(-2), ...gap.rightBlockTaskIds.slice(0, 2)], offsets: [-120, -90, -75, -60, -45, -30, -15, 15, 30], maxTalents: 4, maxMovable: 14 },
    { strategy: "coach_block_reorder", seeds: [...gap.leftBlockTaskIds.slice(-2), ...gap.rightBlockTaskIds.slice(0, 2)], offsets: [-60, -45, -30, -15, 15, 30], maxTalents: 4, maxMovable: 12 },
    { strategy: "right_shift_left_block", seeds: gap.leftBlockTaskIds.slice(-2), offsets: [15, 30, 45, 60, 75, 90, 120], maxTalents: 3, maxMovable: 15 },
  ];
  const segments: CoachMicroSegment[] = [];
  for (const definition of definitions) {
    const seedTasks = definition.seeds.map((id) => taskById.get(id)).filter((task): task is TaskInput => Boolean(task));
    const talentIds = uniq(seedTasks.map((task) => Number(task.contestantId)).filter((id) => Number.isFinite(id) && id > 0)).slice(0, definition.maxTalents);
    if (!talentIds.length) { rejected.add("microsegment_no_movable_tasks"); continue; }
    const windowStart = Math.max(dayStart, gap.gapStart - 45);
    const windowEnd = Math.min(dayEnd, gap.gapEnd + 45);
    const selected = new Set(definition.seeds);
    // Add only immediate dependencies and local flexible meals for directly involved talents.
    for (const seedId of definition.seeds) for (const depId of getDependencyIds(taskById.get(seedId)!)) if (plannedById.has(depId)) selected.add(depId);
    for (const task of input.tasks ?? []) {
      const id = Number(task.id);
      if (!talentIds.includes(Number(task.contestantId))) continue;
      const planned = plannedById.get(id);
      const start = toMinutes(planned?.startPlanned); const end = toMinutes(planned?.endPlanned);
      if (start === null || end === null || !intervalOverlaps(start, end, windowStart, windowEnd)) continue;
      if (definition.seeds.includes(id) || isMealTask(input, task) || getDependencyIds(task).some((depId) => definition.seeds.includes(depId))) selected.add(id);
    }
    // Destination conflicts deliberately stay outside until incremental checks identify a concrete blocker.
    const ordered = [...selected].filter((id) => plannedById.has(id)).sort((a, b) => {
      const aSeed = definition.seeds.includes(a) ? 0 : 1; const bSeed = definition.seeds.includes(b) ? 0 : 1;
      return aSeed - bSeed || Math.abs((toMinutes(plannedById.get(a)?.startPlanned) ?? gap.gapStart) - gap.gapStart) - Math.abs((toMinutes(plannedById.get(b)?.startPlanned) ?? gap.gapStart) - gap.gapStart) || a - b;
    });
    if (ordered.length > SEGMENT_SOLVER_MAX_MICRO_TASKS) rejected.add("microsegment_dependency_closure_too_large");
    const taskIds = ordered.slice(0, SEGMENT_SOLVER_MAX_MICRO_TASKS);
    const movableTaskIds = taskIds.filter((id) => { const task = taskById.get(id); return Boolean(task && !isFixedTask(input, task)); }).slice(0, definition.maxMovable);
    if (!movableTaskIds.length) { rejected.add(taskIds.length ? "microsegment_all_fixed" : "microsegment_no_movable_tasks"); continue; }
    const resourceIds = uniq(taskIds.flatMap((id) => (plannedById.get(id)?.assignedResources ?? []).map(Number))).sort((a, b) => a - b);
    segments.push({
      strategy: definition.strategy, coachId: gap.coachId, coachName: gap.coachName, windowStart, windowEnd,
      taskIds, movableTaskIds, targetTaskIds: definition.seeds.filter((id) => movableTaskIds.includes(id)), offsetMinutes: definition.offsets,
      talentIds, talentNames: uniq(talentIds.map((id) => input.tasks.find((task) => Number(task.contestantId) === id)?.contestantName?.trim() || `Talent ${id}`)),
      resourceIds, resourceNames: resourceIds.map((id) => resourceById.get(id) ?? `Resource ${id}`),
    });
    if (segments.length >= SEGMENT_SOLVER_MAX_MICROSEGMENTS) break;
  }
  return { segments, rejectedReasons: [...rejected] };
};

const compareSegmentScores = (candidate: CandidateSolutionScore, baseline: CandidateSolutionScore, changedTasks: number, baselineChanges: number): number => {
  const checks: Array<[number, number]> = [
    [candidate.hardConstraintViolations, baseline.hardConstraintViolations], [candidate.mainStageGapMinutes, baseline.mainStageGapMinutes],
    [baseline.plannedTasks, candidate.plannedTasks], [candidate.maxCoachGapMinutes, baseline.maxCoachGapMinutes],
    [candidate.coachSplitDayPenalty, baseline.coachSplitDayPenalty], [candidate.coachIdlePenalty, baseline.coachIdlePenalty],
    [candidate.coachSpanPenalty, baseline.coachSpanPenalty], [candidate.talentIdlePenalty, baseline.talentIdlePenalty],
    [candidate.makespan, baseline.makespan], [changedTasks, baselineChanges],
  ];
  for (const [left, right] of checks) if (left !== right) return left < right ? 1 : -1;
  return 0;
};

const changedTaskIds = (baseline: EngineOutput, candidate: EngineOutput): number[] => {
  const before = new Map((baseline.plannedTasks ?? []).map((task) => [Number(task.taskId), `${task.startPlanned}-${task.endPlanned}-${(task.assignedResources ?? []).join(",")}`]));
  return (candidate.plannedTasks ?? []).filter((task) => before.get(Number(task.taskId)) !== `${task.startPlanned}-${task.endPlanned}-${(task.assignedResources ?? []).join(",")}`).map((task) => Number(task.taskId));
};
const candidateWithStarts = (baseline: EngineOutput, starts: Map<number, number>): EngineOutput => ({ ...baseline, plannedTasks: (baseline.plannedTasks ?? []).map((planned) => {
  const start = starts.get(Number(planned.taskId)); if (start === undefined) return planned;
  const oldStart = toMinutes(planned.startPlanned); const oldEnd = toMinutes(planned.endPlanned);
  return oldStart === null || oldEnd === null ? planned : { ...planned, startPlanned: hhmm(start), endPlanned: hhmm(start + oldEnd - oldStart) };
}) });

export type SegmentMoveRejectionCode =
  | "resource_overlap_with_outside_task" | "dependency_predecessor_outside_segment" | "dependency_successor_outside_segment"
  | "meal_slot_resource_conflict" | "main_stage_gap_would_open" | "talent_overlap_with_outside_task"
  | "space_overlap_with_outside_task" | "fixed_task_blocks_shift" | "microsegment_expansion_limit_reached"
  | "local_move_outside_workday" | "microsegment_candidate_hard_invalid";

export interface SegmentSolverBlocker {
  strategy: string;
  offsetMinutes?: number;
  moveDescription?: string;
  rejectionCode: SegmentMoveRejectionCode | string;
  constraintType: "dependency" | "talent" | "resource" | "space" | "meal" | "main_stage" | "fixed" | "workday" | "hard";
  taskIds: number[];
  taskNames: string[];
  talentNames: string[];
  resourceId?: number;
  resourceName?: string;
  spaceId?: number;
  spaceName?: string;
  start?: string;
  end?: string;
  blockingTaskIds: number[];
  blockingTaskNames: string[];
  canExpandSegment: boolean;
  suggestedExpansionTaskIds: number[];
}

export interface SegmentSolverCandidateMetrics extends SegmentSolverCompactMetrics {
  movedTaskIds: number[];
  improvementMinutes: number;
  selected: boolean;
}

type LocalMoveContext = {
  segment: CoachMicroSegment;
  starts: Map<number, number>;
  strategy: string;
  offsetMinutes?: number;
  moveDescription?: string;
};

type PlannedInterval = { taskId: number; task: TaskInput; start: number; end: number; resources: number[] };

const intervalIndex = (input: EngineV3Input, output: EngineOutput, starts = new Map<number, number>()): PlannedInterval[] => {
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  return (output.plannedTasks ?? []).flatMap((planned): PlannedInterval[] => {
    const taskId = Number(planned.taskId); const task = taskById.get(taskId);
    const oldStart = toMinutes(planned.startPlanned); const oldEnd = toMinutes(planned.endPlanned);
    if (!task || oldStart === null || oldEnd === null) return [];
    const start = starts.get(taskId) ?? oldStart;
    return [{ taskId, task, start, end: start + oldEnd - oldStart, resources: (planned.assignedResources ?? []).map(Number) }];
  });
};

const blockerName = (input: EngineV3Input, taskId: number) => String(input.tasks.find((task) => Number(task.id) === taskId)?.templateName ?? input.taskTemplateNameById?.[Number(input.tasks.find((task) => Number(task.id) === taskId)?.templateId)] ?? `Task ${taskId}`);
const resourceName = (input: EngineV3Input, id: number) => input.planResourceItems.find((item) => Number(item.id) === id)?.name ?? `Resource ${id}`;
const spaceName = (input: EngineV3Input, id: number) => input.spaceNameById?.[id] ?? `Space ${id}`;

const makeBlocker = (
  input: EngineV3Input, context: LocalMoveContext, code: SegmentMoveRejectionCode, constraintType: SegmentSolverBlocker["constraintType"],
  moved: PlannedInterval[], blocking: PlannedInterval[] = [], extra: Partial<SegmentSolverBlocker> = {},
): SegmentSolverBlocker => {
  const blockingIds = uniq(blocking.map((item) => item.taskId));
  const movableBlocking = blockingIds.filter((id) => { const task = input.tasks.find((item) => Number(item.id) === id); return Boolean(task && !isFixedTask(input, task)); });
  return {
    strategy: context.strategy, offsetMinutes: context.offsetMinutes, moveDescription: context.moveDescription,
    rejectionCode: code, constraintType, taskIds: uniq(moved.map((item) => item.taskId)),
    taskNames: uniq(moved.map((item) => blockerName(input, item.taskId))),
    talentNames: uniq([...moved, ...blocking].map((item) => String(item.task.contestantName ?? "").trim()).filter(Boolean)),
    start: moved.length ? hhmm(Math.min(...moved.map((item) => item.start))) : undefined,
    end: moved.length ? hhmm(Math.max(...moved.map((item) => item.end))) : undefined,
    blockingTaskIds: blockingIds, blockingTaskNames: blockingIds.map((id) => blockerName(input, id)),
    canExpandSegment: movableBlocking.length > 0, suggestedExpansionTaskIds: movableBlocking.slice(0, 4), ...extra,
  };
};

/** Finds concrete baseline intervals blocking a local move, before full-plan validation. */
export const findBlockingIntervals = (input: EngineV3Input, baseline: EngineOutput, context: LocalMoveContext): SegmentSolverBlocker[] => {
  const effective = intervalIndex(input, baseline, context.starts);
  const movedIds = new Set(context.starts.keys());
  const moved = effective.filter((item) => movedIds.has(item.taskId));
  const outside = effective.filter((item) => !movedIds.has(item.taskId));
  const blockers: SegmentSolverBlocker[] = [];
  const segmentIds = new Set(context.segment.taskIds);
  const byId = new Map(effective.map((item) => [item.taskId, item]));
  const successors = new Map<number, number[]>();
  for (const item of effective) for (const dependencyId of getDependencyIds(item.task)) successors.set(dependencyId, [...(successors.get(dependencyId) ?? []), item.taskId]);

  for (const item of moved) {
    for (const dependencyId of getDependencyIds(item.task)) {
      const dependency = byId.get(dependencyId);
      if (dependency && item.start < dependency.end) blockers.push(makeBlocker(input, context, "dependency_predecessor_outside_segment", "dependency", [item], [dependency], { canExpandSegment: !segmentIds.has(dependencyId) && !isFixedTask(input, dependency.task), suggestedExpansionTaskIds: !segmentIds.has(dependencyId) && !isFixedTask(input, dependency.task) ? [dependencyId] : [] }));
    }
    for (const successorId of successors.get(item.taskId) ?? []) {
      const successor = byId.get(successorId);
      if (successor && successor.start < item.end) blockers.push(makeBlocker(input, context, "dependency_successor_outside_segment", "dependency", [item], [successor], { canExpandSegment: !segmentIds.has(successorId) && !isFixedTask(input, successor.task), suggestedExpansionTaskIds: !segmentIds.has(successorId) && !isFixedTask(input, successor.task) ? [successorId] : [] }));
    }
    for (const other of [...outside, ...moved.filter((candidate) => candidate.taskId > item.taskId)]) {
      if (!intervalOverlaps(item.start, item.end, other.start, other.end)) continue;
      if (Number(item.task.contestantId ?? 0) > 0 && Number(item.task.contestantId) === Number(other.task.contestantId)) blockers.push(makeBlocker(input, context, "talent_overlap_with_outside_task", "talent", [item], [other]));
      const sharedResource = item.resources.find((id) => other.resources.includes(id));
      if (sharedResource) blockers.push(makeBlocker(input, context, isMealTask(input, item.task) || isMealTask(input, other.task) ? "meal_slot_resource_conflict" : "resource_overlap_with_outside_task", isMealTask(input, item.task) || isMealTask(input, other.task) ? "meal" : "resource", [item], [other], { resourceId: sharedResource, resourceName: resourceName(input, sharedResource) }));
      const spaceId = Number(item.task.spaceId ?? 0);
      if (spaceId > 0 && spaceId === Number(other.task.spaceId ?? 0) && getSpaceCapacity(input, spaceId) <= 1) blockers.push(makeBlocker(input, context, "space_overlap_with_outside_task", "space", [item], [other], { spaceId, spaceName: spaceName(input, spaceId) }));
    }
  }
  return blockers;
};

/** Classifies a local rejection and upgrades immovable external blockers to fixed_task_blocks_shift. */
export const classifySegmentMoveRejection = (input: EngineV3Input, blocker: SegmentSolverBlocker): SegmentSolverBlocker => {
  if (!["resource_overlap_with_outside_task", "talent_overlap_with_outside_task", "space_overlap_with_outside_task", "meal_slot_resource_conflict"].includes(blocker.rejectionCode)) return blocker;
  const blockingTasks = blocker.blockingTaskIds.map((id) => input.tasks.find((task) => Number(task.id) === id)).filter((task): task is TaskInput => Boolean(task));
  if (blockingTasks.length && blockingTasks.every((task) => isFixedTask(input, task))) return { ...blocker, rejectionCode: "fixed_task_blocks_shift", constraintType: "fixed", canExpandSegment: false, suggestedExpansionTaskIds: [] };
  return blocker;
};

/** Incremental validation in dependency, talent, resource/space, then Main Stage order. */
export const checkLocalMoveFeasibility = (input: EngineV3Input, baseline: EngineOutput, context: LocalMoveContext): { feasible: boolean; blockers: SegmentSolverBlocker[] } => {
  const dayStart = toMinutes(input.workDay.start) ?? 0; const dayEnd = toMinutes(input.workDay.end) ?? 24 * 60;
  const moved = intervalIndex(input, baseline, context.starts).filter((item) => context.starts.has(item.taskId));
  const outsideDay = moved.filter((item) => item.start < dayStart || item.end > dayEnd);
  if (outsideDay.length) return { feasible: false, blockers: [makeBlocker(input, context, "local_move_outside_workday", "workday", outsideDay)] };
  const blockers = findBlockingIntervals(input, baseline, context).map((blocker) => classifySegmentMoveRejection(input, blocker));
  const order: SegmentSolverBlocker["constraintType"][] = ["dependency", "talent", "resource", "space", "meal", "main_stage", "fixed", "workday", "hard"];
  blockers.sort((a, b) => order.indexOf(a.constraintType) - order.indexOf(b.constraintType));
  return { feasible: blockers.length === 0, blockers: blockers.slice(0, 3) };
};

const immediateClosure = (input: EngineV3Input, taskIds: number[]): number[] => {
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const result = new Set(taskIds);
  for (const taskId of taskIds) for (const dependencyId of getDependencyIds(taskById.get(taskId)!)) if (taskById.has(dependencyId)) result.add(dependencyId);
  for (const task of input.tasks ?? []) if (getDependencyIds(task).some((id) => taskIds.includes(id))) result.add(Number(task.id));
  return [...result];
};

const expandMicroSegment = (input: EngineV3Input, segment: CoachMicroSegment, blocker: SegmentSolverBlocker): { segment?: CoachMicroSegment; reason?: string; added: number[] } => {
  const requested = immediateClosure(input, blocker.suggestedExpansionTaskIds).filter((id) => !segment.taskIds.includes(id)).slice(0, 4);
  const taskIds = uniq([...segment.taskIds, ...requested]);
  const movableTaskIds = taskIds.filter((id) => { const task = input.tasks.find((item) => Number(item.id) === id); return Boolean(task && !isFixedTask(input, task)); });
  if (!requested.length || taskIds.length > SEGMENT_SOLVER_MAX_EXPANDED_TASKS || movableTaskIds.length > SEGMENT_SOLVER_MAX_EXPANDED_MOVABLE_TASKS) return { reason: "microsegment_expansion_limit_reached", added: requested };
  const suffix = segment.strategy === "bridge" ? "bridge_with_blocker_expansion" : segment.strategy === "left_shift_right_block" ? "left_shift_with_blocker_expansion" : "right_shift_with_blocker_expansion";
  return { segment: { ...segment, strategy: suffix as MicroSegmentStrategy, taskIds, movableTaskIds, targetTaskIds: uniq([...segment.targetTaskIds, ...requested]) }, added: requested };
};

const fullRejectionReasons = (input: EngineV3Input, baseline: EngineOutput, candidate: EngineOutput): string[] => {
  const validation = validateHardConstraints(input, candidate); const optimizedErrors = validateOptimizedCandidate(input, baseline, candidate); const reasons = new Set<string>();
  if (!validation.hardValidationPassed || optimizedErrors.length) reasons.add("microsegment_candidate_hard_invalid");
  if ((scoreCandidateSolution(input, candidate).mainStageGapMinutes ?? 0) !== 0) reasons.add("main_stage_gap_would_open");
  const codes = new Set(validation.hardConstraintViolationCodes ?? []);
  if (codes.has("DEPENDENCY_VIOLATION")) reasons.add("segment_candidate_dependency_violation");
  if (codes.has("RESOURCE_OVERLAP") || codes.has("SPACE_OVERLAP") || optimizedErrors.some((error) => error.includes("RESOURCE") || error.includes("SPACE"))) reasons.add("segment_candidate_resource_conflict");
  return [...reasons];
};

const improvementReason = (before: CandidateSolutionScore, after: CandidateSolutionScore): string => {
  if (after.maxCoachGapMinutes <= before.maxCoachGapMinutes - 10 && after.makespan <= before.makespan + 10) return "segment_solver selected: reduced critical coach gap";
  if (after.coachSplitDayPenalty < before.coachSplitDayPenalty) return "segment_solver selected: lower split day";
  return "segment_solver selected: better operational quality";
};

export interface DirectRepairResult { starts?: Map<number, number>; strategy?: string; rejectedReasons: string[] }

export interface RepairChainResult {
  starts?: Map<number, number>;
  segment: CoachMicroSegment;
  depthReached: number;
  addedTaskIds: number[];
  movedTaskIds: number[];
  strategiesTried: string[];
  blockedBy: string[];
  rejectedReasons: string[];
}

/** Repairs a direct external blocker with bounded shifts, lane ordering, or a flexible meal relocation. */
export const repairDirectBlocker = (input: EngineV3Input, baseline: EngineOutput, segment: CoachMicroSegment, starts: Map<number, number>, blocker: SegmentSolverBlocker): DirectRepairResult => {
  const intervals = intervalIndex(input, baseline, starts); const byId = new Map(intervals.map((item) => [item.taskId, item]));
  const target = blocker.taskIds.map((id) => byId.get(id)).find(Boolean); const blocked = blocker.blockingTaskIds.map((id) => byId.get(id)).find(Boolean);
  if (!target || !blocked || isFixedTask(input, blocked.task)) return { rejectedReasons: ["outside_blocker_not_movable", "fixed_task_blocks_shift"] };
  const mealWindow = getMealMode(input).mode === "flexible_meal_window" ? getMealWindow(input) : null;
  const mealStart = toMinutes(mealWindow?.start); const mealEnd = toMinutes(mealWindow?.end);
  const attempts: Array<{ strategy: string; start: number }> = [];
  const duration = blocked.end - blocked.start;
  if (blocker.rejectionCode === "dependency_predecessor_outside_segment") attempts.push({ strategy: "dependency_predecessor_included", start: target.start - duration });
  if (blocker.rejectionCode === "dependency_successor_outside_segment") attempts.push({ strategy: "dependency_successor_included", start: target.end });
  for (const offset of [5, 10, 15, 30, -5, -10, -15]) attempts.push({ strategy: `shift_blocker_${offset > 0 ? "forward" : "backward"}_${Math.abs(offset)}`, start: blocked.start + offset });
  attempts.push({ strategy: "lane_sequentialization_after", start: target.end }, { strategy: "lane_sequentialization_before", start: target.start - (blocked.end - blocked.start) });
  if (isMealTask(input, blocked.task) && mealStart !== null && mealEnd !== null) {
    const useful = uniq([target.start - duration, target.end, target.start - 5 - duration, target.end + 5, mealStart, mealEnd - duration])
      .filter((start) => start >= mealStart && start + duration <= mealEnd)
      .sort((a, b) => Math.abs(a - blocked.start) - Math.abs(b - blocked.start));
    useful.forEach((start) => attempts.unshift({ strategy: "flexible_meal_slot_relocation", start }));
  }
  const rejected = new Set<string>();
  let chainedCandidate: { starts: Map<number, number>; strategy: string } | undefined;
  for (const attempt of attempts) {
    const repaired = new Map(starts); repaired.set(blocked.taskId, attempt.start);
    const local = checkLocalMoveFeasibility(input, baseline, { segment: { ...segment, taskIds: uniq([...segment.taskIds, blocked.taskId]) }, starts: repaired, strategy: attempt.strategy, moveDescription: `${blocked.taskId}@${hhmm(attempt.start)}` });
    if (local.feasible) return { starts: repaired, strategy: attempt.strategy, rejectedReasons: [] };
    if (!chainedCandidate && local.blockers.some((item) => item.canExpandSegment && item.rejectionCode !== "fixed_task_blocks_shift")) chainedCandidate = { starts: repaired, strategy: attempt.strategy };
    local.blockers.forEach((item) => rejected.add(item.rejectionCode));
  }
  if (chainedCandidate) return { ...chainedCandidate, rejectedReasons: [] };
  if (isMealTask(input, blocked.task)) rejected.add("meal_no_slot_near_conflict");
  else rejected.add("outside_blocker_shift_causes_secondary_conflict");
  return { rejectedReasons: [...rejected] };
};

/** Recursively repairs at most two concrete outside blockers while keeping the branch surgical. */
export const repairBlockerChain = (
  input: EngineV3Input,
  baseline: EngineOutput,
  initialSegment: CoachMicroSegment,
  initialStarts: Map<number, number>,
  maxDepth = SEGMENT_SOLVER_MAX_REPAIR_DEPTH,
): RepairChainResult => {
  const originalIds = new Set(initialSegment.taskIds);
  const strategies: string[] = [];
  const blockedBy: string[] = [];
  const rejected = new Set<string>();
  let maxDepthReached = 0;

  const visit = (segment: CoachMicroSegment, starts: Map<number, number>, depth: number): { starts?: Map<number, number>; segment: CoachMicroSegment } => {
    maxDepthReached = Math.max(maxDepthReached, depth);
    const local = checkLocalMoveFeasibility(input, baseline, { segment, starts, strategy: segment.strategy });
    if (local.feasible) return { starts, segment };
    const blocker = local.blockers[0];
    if (!blocker) { rejected.add("repair_chain_no_concrete_blocker"); return { segment }; }
    blockedBy.push(blocker.rejectionCode);
    if (blocker.rejectionCode === "fixed_task_blocks_shift" || !blocker.canExpandSegment) {
      rejected.add(blocker.rejectionCode === "fixed_task_blocks_shift" ? "fixed_task_blocks_shift" : "outside_blocker_not_movable");
      return { segment };
    }
    if (depth >= maxDepth) { rejected.add("repair_chain_max_depth_reached"); return { segment }; }
    const added = blocker.suggestedExpansionTaskIds.filter((id) => !segment.taskIds.includes(id));
    const totalAdded = uniq([...segment.taskIds, ...added]).filter((id) => !originalIds.has(id));
    if (totalAdded.length > SEGMENT_SOLVER_MAX_REPAIR_ADDED_TASKS) { rejected.add("repair_chain_max_added_tasks_exceeded"); return { segment }; }
    if (uniq([...starts.keys(), ...added]).length > SEGMENT_SOLVER_MAX_REPAIR_MOVED_TASKS) { rejected.add("repair_chain_max_moved_tasks_exceeded"); return { segment }; }
    const expanded = { ...segment, taskIds: uniq([...segment.taskIds, ...added]), movableTaskIds: uniq([...segment.movableTaskIds, ...added]) };
    const direct = repairDirectBlocker(input, baseline, expanded, starts, blocker);
    if (!direct.starts) { direct.rejectedReasons.forEach((reason) => rejected.add(reason)); return { segment: expanded }; }
    if (direct.strategy) strategies.push(direct.strategy);
    return visit(expanded, direct.starts, depth + 1);
  };

  const result = visit(initialSegment, new Map(initialStarts), 0);
  const movedTaskIds = [...(result.starts?.keys() ?? [])];
  return {
    starts: result.starts,
    segment: result.segment,
    depthReached: maxDepthReached,
    addedTaskIds: result.segment.taskIds.filter((id) => !originalIds.has(id)),
    movedTaskIds,
    strategiesTried: uniq(strategies),
    blockedBy: uniq(blockedBy),
    rejectedReasons: [...rejected],
  };
};

export const runSegmentSolver = (input: EngineV3Input, baseline: EngineOutput, options: SegmentSolverOptions = {}): { output: EngineOutput; candidates: EngineOutput[]; meta: SegmentSolverMeta } => {
  const startedAt = Date.now(); const timeoutMs = Math.max(0, Number(options.timeoutMs ?? SEGMENT_SOLVER_DEFAULT_TIMEOUT_MS)); const baseScore = scoreCandidateSolution(input, baseline);
  const emptyMeta: SegmentSolverMeta = {
    segmentSolverAttempted: false, segmentSolverBackend: "bounded_exact_search", segmentSolverSegmentsBuilt: 0, segmentSolverCandidatesGenerated: 0,
    segmentSolverAccepted: false, segmentSolverReason: options.disabled ? "solver_disabled" : "no_problematic_coach_segment", segmentSolverRejectedReasons: [],
    segmentSolverMicroSegmentsBuilt: 0, segmentSolverMicroSegmentStrategiesTried: [], segmentSolverMicroSegmentTaskCounts: [], segmentSolverMicroSegmentRejectedReasons: [],
    segmentSolverAssignmentsExplored: 0, segmentSolverValidCandidates: 0, segmentSolverBestCandidateMovedTaskIds: [], segmentSolverBestCandidateMovedTalentNames: [],
    segmentSolverBestBefore: compactMetrics(baseScore), segmentSolverBestAfter: compactMetrics(baseScore), segmentSolverTimeoutMs: timeoutMs, segmentSolverElapsedMs: 0,
    segmentSolverMealMovesAttempted: false, segmentSolverMealMovesAccepted: false, segmentSolverMealMoveCount: 0, segmentSolverMealRejectedReasons: [],
    segmentSolverTopBlockers: [], segmentSolverTopResourceBlockers: [], segmentSolverTopDependencyBlockers: [], segmentSolverTopMealBlockers: [], segmentSolverTopMainStageBlockers: [],
    segmentSolverLocalChecksPerformed: 0, segmentSolverLocalChecksRejected: 0, segmentSolverFullValidationsPerformed: 0, segmentSolverFullValidationsRejected: 0,
    segmentSolverExpandedMicroSegmentsBuilt: 0, segmentSolverExpansionTaskIds: [], segmentSolverExpansionReasons: [], segmentSolverExpansionRejectedReasons: [],
    segmentSolverDirectRepairsAttempted: 0, segmentSolverDirectRepairsAccepted: 0, segmentSolverDirectRepairStrategiesTried: [], segmentSolverDirectRepairRejectedReasons: [],
    segmentSolverRepairChainsAttempted: 0, segmentSolverRepairChainsAccepted: 0, segmentSolverRepairChainMaxDepthReached: 0,
    segmentSolverRepairChainDepths: [], segmentSolverRepairChainMovedTaskIds: [], segmentSolverRepairChainBlockedBy: [], segmentSolverRepairChainRejectedReasons: [],
    segmentSolverFeasibleButNotSelected: false, segmentSolverCandidateMetrics: [],
  };
  if (options.disabled) return { output: baseline, candidates: [], meta: emptyMeta };
  const segments = buildCriticalCoachSegments(input, baseline, options.maxSegments);
  if (!segments.length) return { output: baseline, candidates: [], meta: { ...emptyMeta, segmentSolverElapsedMs: Date.now() - startedAt } };
  const wide = segments[0]; const gap = findCriticalCoachGap(input, baseline, wide.coachId)!; const microBuild = buildCoachMicroSegments(input, baseline, gap);
  const wideTooLarge = wide.movableTaskIds.length > SEGMENT_SOLVER_MAX_TASKS; const solveSegments = microBuild.segments;
  const meta: SegmentSolverMeta = { ...emptyMeta, segmentSolverAttempted: true, segmentSolverSegmentsBuilt: segments.length, segmentSolverTargetCoachName: wide.coachName,
    segmentSolverWindowStart: hhmm(wide.windowStart), segmentSolverWindowEnd: hhmm(wide.windowEnd), segmentSolverTaskCount: wide.taskIds.length,
    segmentSolverTalentNames: wide.talentNames, segmentSolverResourceNames: wide.resourceNames, segmentSolverCriticalGapStart: hhmm(gap.gapStart), segmentSolverCriticalGapEnd: hhmm(gap.gapEnd),
    segmentSolverCriticalGapMinutes: gap.gapMinutes, segmentSolverLeftBlockTalentNames: gap.leftBlockTalentNames, segmentSolverRightBlockTalentNames: gap.rightBlockTalentNames,
    segmentSolverMicroSegmentsBuilt: solveSegments.length, segmentSolverMicroSegmentStrategiesTried: solveSegments.map((segment) => segment.strategy),
    segmentSolverMicroSegmentTaskCounts: solveSegments.map((segment) => segment.taskIds.length), segmentSolverMicroSegmentRejectedReasons: microBuild.rejectedReasons,
    segmentSolverReason: wideTooLarge ? "wide_segment_too_large_microsegments_attempted" : "microsegment_built", segmentSolverRejectedReasons: wideTooLarge ? ["wide_segment_too_large"] : [] };
  if (!solveSegments.length) return { output: baseline, candidates: [], meta: { ...meta, segmentSolverReason: wideTooLarge ? "segment_too_large" : "no_movable_tasks", segmentSolverElapsedMs: Date.now() - startedAt } };

  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task])); const plannedById = new Map((baseline.plannedTasks ?? []).map((task) => [Number(task.taskId), task]));
  const mealWindow = getMealMode(input).mode === "flexible_meal_window" ? getMealWindow(input) : null; const mealStart = toMinutes(mealWindow?.start); const mealEnd = toMinutes(mealWindow?.end);
  const globalDeadline = startedAt + timeoutMs; let timedOut = false; let cancelled = false; let earlyStop = false; let best = baseline; let bestScore = baseScore; let bestChanges = 0;
  const candidates: EngineOutput[] = []; const rejected = new Set(meta.segmentSolverRejectedReasons); const mealRejected = new Set<string>(); const blockerKeys = new Set<string>(); const perSegmentBlockers = new Map<string, number>(); const expansionCounts = new Map<string, number>();
  const recordBlocker = (blocker: SegmentSolverBlocker, segment: CoachMicroSegment) => {
    const segmentKey = `${segment.strategy}:${segment.targetTaskIds.join(",")}`; const key = `${segmentKey}:${blocker.rejectionCode}:${blocker.taskIds}:${blocker.blockingTaskIds}`;
    if (blockerKeys.has(key) || meta.segmentSolverTopBlockers.length >= 10 || (perSegmentBlockers.get(segmentKey) ?? 0) >= 3) return;
    blockerKeys.add(key); perSegmentBlockers.set(segmentKey, (perSegmentBlockers.get(segmentKey) ?? 0) + 1); meta.segmentSolverTopBlockers.push(blocker);
    if (blocker.constraintType === "resource" || blocker.constraintType === "space" || blocker.constraintType === "talent" || blocker.constraintType === "fixed") meta.segmentSolverTopResourceBlockers.push(blocker);
    if (blocker.constraintType === "dependency") meta.segmentSolverTopDependencyBlockers.push(blocker);
    if (blocker.constraintType === "meal") meta.segmentSolverTopMealBlockers.push(blocker);
    if (blocker.constraintType === "main_stage") meta.segmentSolverTopMainStageBlockers.push(blocker);
  };

  const evaluate = (segment: CoachMicroSegment, starts: Map<number, number>, offsetMinutes?: number, moveDescription?: string, allowRepair = true) => {
    if (Date.now() >= globalDeadline) { timedOut = true; return; } if (options.shouldCancel?.()) { cancelled = true; return; }
    meta.segmentSolverAssignmentsExplored += 1; meta.segmentSolverLocalChecksPerformed += 1;
    const context = { segment, starts, strategy: segment.strategy, offsetMinutes, moveDescription }; const local = checkLocalMoveFeasibility(input, baseline, context);
    if (!local.feasible) {
      meta.segmentSolverLocalChecksRejected += 1;
      for (const blocker of local.blockers) { rejected.add(blocker.rejectionCode); recordBlocker(blocker, segment); if (blocker.constraintType === "meal") mealRejected.add(blocker.rejectionCode); }
      const direct = local.blockers.find((blocker) => [
        "resource_overlap_with_outside_task", "talent_overlap_with_outside_task", "space_overlap_with_outside_task",
        "meal_slot_resource_conflict", "dependency_predecessor_outside_segment", "dependency_successor_outside_segment",
      ].includes(blocker.rejectionCode));
      if (allowRepair && direct) {
        const segmentKey = `${segment.strategy}:${segment.targetTaskIds.join(",")}`; const count = expansionCounts.get(segmentKey) ?? 0;
        if (direct.canExpandSegment && count < 2) {
          const expansion = expandMicroSegment(input, segment, direct); expansionCounts.set(segmentKey, count + 1);
          if (expansion.segment) { meta.segmentSolverExpandedMicroSegmentsBuilt += 1; meta.segmentSolverExpansionTaskIds.push(...expansion.added); meta.segmentSolverExpansionReasons.push(direct.rejectionCode); meta.segmentSolverMicroSegmentStrategiesTried.push(expansion.segment.strategy); }
          else { meta.segmentSolverExpansionRejectedReasons.push(expansion.reason!); rejected.add(expansion.reason!); }
        }
        meta.segmentSolverDirectRepairsAttempted += 1;
        meta.segmentSolverRepairChainsAttempted += 1;
        const repair = repairBlockerChain(input, baseline, segment, starts);
        meta.segmentSolverRepairChainMaxDepthReached = Math.max(meta.segmentSolverRepairChainMaxDepthReached, repair.depthReached);
        meta.segmentSolverRepairChainDepths.push(repair.depthReached);
        meta.segmentSolverRepairChainMovedTaskIds.push(...repair.movedTaskIds);
        meta.segmentSolverRepairChainBlockedBy.push(...repair.blockedBy);
        meta.segmentSolverRepairChainRejectedReasons.push(...repair.rejectedReasons);
        meta.segmentSolverDirectRepairStrategiesTried.push(...repair.strategiesTried);
        if (repair.starts) {
          meta.segmentSolverDirectRepairsAccepted += 1;
          meta.segmentSolverRepairChainsAccepted += 1;
          evaluate(repair.segment, repair.starts, offsetMinutes, repair.strategiesTried.join(" -> "), false);
        } else {
          meta.segmentSolverDirectRepairRejectedReasons.push(...repair.rejectedReasons);
        }
      }
      return;
    }
    const candidate = candidateWithStarts(baseline, starts); const movedIds = changedTaskIds(baseline, candidate); if (!movedIds.length) return;
    meta.segmentSolverFullValidationsPerformed += 1; const reasons = fullRejectionReasons(input, baseline, candidate);
    if (reasons.length) { meta.segmentSolverFullValidationsRejected += 1; reasons.forEach((reason) => rejected.add(reason)); return; }
    const score = scoreCandidateSolution(input, candidate); const improvementMinutes = baseScore.maxCoachGapMinutes - score.maxCoachGapMinutes;
    const changes = movedIds.length;
    if (score.hardConstraintViolations !== 0 || score.mainStageGapMinutes !== 0 || score.plannedTasks !== baseScore.plannedTasks || (improvementMinutes < 10 && compareSegmentScores(score, baseScore, changes, 0) <= 0)) { rejected.add("segment_candidate_valid_but_not_better"); return; }
    meta.segmentSolverValidCandidates += 1; meta.segmentSolverCandidatesGenerated += 1; if (candidates.length < 50) candidates.push(candidate);
    const metrics: SegmentSolverCandidateMetrics = { ...compactMetrics(score), movedTaskIds: movedIds.slice(0, 22), improvementMinutes, selected: false }; meta.segmentSolverCandidateMetrics.push(metrics);
    if (compareSegmentScores(score, bestScore, changes, bestChanges) > 0) { best = candidate; bestScore = score; bestChanges = changes; meta.segmentSolverBestFeasibleSeenAtMs ??= Date.now() - startedAt; }
    if (improvementMinutes >= 30) { earlyStop = true; meta.segmentSolverEarlyStopReason = "coach_gap_improved_by_at_least_30_minutes"; }
  };

  for (const segment of solveSegments) {
    if (Date.now() >= globalDeadline || earlyStop) { timedOut ||= Date.now() >= globalDeadline; break; }
    const microDeadline = Math.min(globalDeadline, Date.now() + SEGMENT_SOLVER_MICRO_TIMEOUT_MS); let assignments = 0;
    const movable = segment.movableTaskIds.map((taskId) => { const task = taskById.get(taskId)!; const planned = plannedById.get(taskId)!; const currentStart = toMinutes(planned.startPlanned)!; const currentEnd = toMinutes(planned.endPlanned)!; const duration = currentEnd - currentStart; const meal = isMealTask(input, task) && mealStart !== null && mealEnd !== null; const minStart = Math.max(segment.windowStart, meal ? mealStart! : segment.windowStart); const maxStart = Math.min(segment.windowEnd, meal ? mealEnd! : segment.windowEnd) - duration; const strategyOffsets = segment.targetTaskIds.includes(taskId) ? segment.offsetMinutes : [-30, -15, 0, 15, 30]; const domain = uniq([currentStart, ...strategyOffsets.map((offset) => currentStart + offset)]).filter((start) => start >= minStart && start <= maxStart && start % 5 === 0); return { taskId, task, currentStart, isMeal: meal, domain }; }).filter((item) => item.domain.length);
    meta.segmentSolverMealMovesAttempted ||= movable.some((item) => item.isMeal);
    for (const offset of segment.offsetMinutes) { if (Date.now() >= microDeadline || assignments >= SEGMENT_SOLVER_MAX_ASSIGNMENTS || earlyStop || cancelled) break; const starts = new Map<number, number>(); for (const item of movable) if (segment.targetTaskIds.includes(item.taskId) && item.domain.includes(item.currentStart + offset)) starts.set(item.taskId, item.currentStart + offset); if (starts.size) { assignments += 1; evaluate(segment, starts, offset); } }
    if (!earlyStop && !cancelled && segment.strategy === "coach_block_reorder") { const items = movable.filter((item) => segment.targetTaskIds.includes(item.taskId)).slice(0, 4); const slots = items.map((item) => item.currentStart).sort((a, b) => a - b); if (items.length > 1) evaluate(segment, new Map(items.map((item, index) => [item.taskId, slots[items.length - index - 1]])), undefined, "reverse_coach_block_order"); }
    for (const item of movable) { if (earlyStop || cancelled || Date.now() >= microDeadline) break; for (const start of item.domain.slice(0, 8)) { if (start === item.currentStart) continue; assignments += 1; evaluate(segment, new Map([[item.taskId, start]]), start - item.currentStart); if (earlyStop || cancelled || Date.now() >= microDeadline) break; } }
  }

  const accepted = best !== baseline && bestScore.hardConstraintViolations === 0 && bestScore.mainStageGapMinutes === 0 && compareSegmentScores(bestScore, baseScore, bestChanges, 0) > 0;
  const movedIds = accepted ? changedTaskIds(baseline, best) : []; const movedTalentNames = uniq(movedIds.map((id) => String(taskById.get(id)?.contestantName ?? "").trim()).filter(Boolean)); const movedMealCount = accepted ? movedIds.filter((id) => isMealTask(input, taskById.get(id)!)).length : 0;
  if (timedOut) rejected.add("segment_candidate_timeout"); if (!meta.segmentSolverValidCandidates) meta.segmentSolverMicroSegmentRejectedReasons.push("microsegment_no_valid_candidate"); else if (!accepted) meta.segmentSolverMicroSegmentRejectedReasons.push("microsegment_candidate_not_better");
  meta.segmentSolverAccepted = accepted; meta.segmentSolverReason = cancelled ? "cancelled" : accepted ? "accepted" : meta.segmentSolverTopBlockers[0]?.rejectionCode ?? (timedOut ? "segment_solver_timeout" : meta.segmentSolverValidCandidates ? "segment_candidate_valid_but_not_better" : "microsegment_no_valid_candidate");
  meta.segmentSolverRejectedReasons = [...rejected].slice(0, 20); meta.segmentSolverBestAfter = compactMetrics(accepted ? bestScore : baseScore); meta.segmentSolverImprovement = accepted ? improvementReason(baseScore, bestScore) : meta.segmentSolverValidCandidates ? `segment_candidate_valid_but_not_better: baseline=${JSON.stringify(compactMetrics(baseScore))}; candidate=${JSON.stringify(compactMetrics(bestScore))}` : `microsegment_no_valid_candidate${meta.segmentSolverTopBlockers[0] ? `: ${meta.segmentSolverTopBlockers[0].rejectionCode}` : ""}`;
  meta.segmentSolverBestCandidateMovedTaskIds = movedIds; meta.segmentSolverBestCandidateMovedTalentNames = movedTalentNames; meta.segmentSolverBestCandidateReason = accepted ? improvementReason(baseScore, bestScore) : meta.segmentSolverImprovement; meta.segmentSolverElapsedMs = Math.max(0, Date.now() - startedAt); meta.segmentSolverMealMovesAccepted = movedMealCount > 0; meta.segmentSolverMealMoveCount = movedMealCount; meta.segmentSolverMealRejectedReasons = [...mealRejected].slice(0, 10); meta.segmentSolverFeasibleButNotSelected = meta.segmentSolverValidCandidates > 0 && !accepted;
  const selectedIds = new Set(movedIds); meta.segmentSolverCandidateMetrics = meta.segmentSolverCandidateMetrics.slice(0, 10).map((item) => ({ ...item, selected: accepted && item.movedTaskIds.length === selectedIds.size && item.movedTaskIds.every((id) => selectedIds.has(id)) })); meta.segmentSolverExpansionTaskIds = uniq(meta.segmentSolverExpansionTaskIds).slice(0, 16); meta.segmentSolverExpansionReasons = uniq(meta.segmentSolverExpansionReasons).slice(0, 10); meta.segmentSolverExpansionRejectedReasons = uniq(meta.segmentSolverExpansionRejectedReasons).slice(0, 10); meta.segmentSolverDirectRepairStrategiesTried = uniq(meta.segmentSolverDirectRepairStrategiesTried).slice(0, 10); meta.segmentSolverDirectRepairRejectedReasons = uniq(meta.segmentSolverDirectRepairRejectedReasons).slice(0, 10);
  meta.segmentSolverRepairChainDepths = meta.segmentSolverRepairChainDepths.slice(0, 20);
  meta.segmentSolverRepairChainMovedTaskIds = uniq(meta.segmentSolverRepairChainMovedTaskIds).slice(0, SEGMENT_SOLVER_MAX_REPAIR_MOVED_TASKS);
  meta.segmentSolverRepairChainBlockedBy = uniq(meta.segmentSolverRepairChainBlockedBy).slice(0, 10);
  meta.segmentSolverRepairChainRejectedReasons = uniq(meta.segmentSolverRepairChainRejectedReasons).slice(0, 10);
  return { output: accepted ? best : baseline, candidates, meta };
};

export const segmentSolverSelectionReason = improvementReason;
