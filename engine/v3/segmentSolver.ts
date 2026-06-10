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

export const SEGMENT_SOLVER_MAX_TASKS = 25;
export const SEGMENT_SOLVER_MAX_SEGMENTS = 3;
export const SEGMENT_SOLVER_MAX_MICROSEGMENTS = 4;
export const SEGMENT_SOLVER_MAX_MICRO_TASKS = 18;
export const SEGMENT_SOLVER_MAX_MICRO_MOVABLE_TASKS = 14;
export const SEGMENT_SOLVER_MAX_ASSIGNMENTS = 1_500;
export const SEGMENT_SOLVER_GRID_MINUTES = 5;
export const SEGMENT_SOLVER_DEFAULT_TIMEOUT_MS = 2_000;
export const SEGMENT_SOLVER_MICRO_TIMEOUT_MS = 1_500;
export const SEGMENT_SOLVER_MAX_WINDOW_MINUTES = 5 * 60;

type MicroSegmentStrategy = "bridge" | "left_shift_right_block" | "right_shift_left_block" | "coach_block_reorder";

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
}

export interface SegmentSolverOptions {
  timeoutMs?: number;
  maxSegments?: number;
  disabled?: boolean;
  shouldCancel?: () => boolean;
}

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
    { strategy: "bridge", seeds: [...gap.leftBlockTaskIds.slice(-2), ...gap.rightBlockTaskIds.slice(0, 2)], offsets: [-15, -30, -45, -60, -90, -120, 15, 30, 45, 60, 90], maxTalents: 4, maxMovable: 14 },
    { strategy: "left_shift_right_block", seeds: gap.rightBlockTaskIds.slice(0, 2), offsets: [-15, -30, -45, -60, -90, -120], maxTalents: 3, maxMovable: 15 },
    { strategy: "right_shift_left_block", seeds: gap.leftBlockTaskIds.slice(-2), offsets: [15, 30, 45, 60, 90], maxTalents: 3, maxMovable: 15 },
    { strategy: "coach_block_reorder", seeds: [...gap.leftBlockTaskIds.slice(-2), ...gap.rightBlockTaskIds.slice(0, 2)], offsets: [-60, -45, -30, -15, 15, 30, 45, 60], maxTalents: 4, maxMovable: 12 },
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
    // Include direct destination conflicts only; unrelated tasks remain fixed outside the microproblem.
    for (const seedId of definition.seeds) {
      const seedTask = taskById.get(seedId); const seedPlanned = plannedById.get(seedId);
      const seedStart = toMinutes(seedPlanned?.startPlanned); const seedEnd = toMinutes(seedPlanned?.endPlanned);
      if (!seedTask || seedStart === null || seedEnd === null) continue;
      const destinationStart = seedStart + Math.min(0, ...definition.offsets);
      const destinationEnd = seedEnd + Math.max(0, ...definition.offsets);
      const seedResources = new Set((seedPlanned?.assignedResources ?? []).map(Number));
      for (const [candidateId, candidatePlanned] of plannedById) {
        if (candidateId === seedId) continue;
        const candidateTask = taskById.get(candidateId); const start = toMinutes(candidatePlanned.startPlanned); const end = toMinutes(candidatePlanned.endPlanned);
        if (!candidateTask || start === null || end === null || !intervalOverlaps(start, end, destinationStart, destinationEnd)) continue;
        const sharesSpace = Number(candidateTask.spaceId ?? NaN) === Number(seedTask.spaceId ?? NaN);
        const sharesResource = (candidatePlanned.assignedResources ?? []).some((id) => seedResources.has(Number(id)));
        if (sharesSpace || sharesResource) selected.add(candidateId);
      }
    }
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

const rejectionReasons = (input: EngineV3Input, baseline: EngineOutput, candidate: EngineOutput): string[] => {
  const validation = validateHardConstraints(input, candidate);
  const optimizedErrors = validateOptimizedCandidate(input, baseline, candidate);
  const reasons = new Set<string>();
  if (!validation.hardValidationPassed || optimizedErrors.length) reasons.add("microsegment_candidate_hard_invalid");
  if ((scoreCandidateSolution(input, candidate).mainStageGapMinutes ?? 0) !== 0) reasons.add("segment_candidate_main_stage_gap");
  const codes = new Set(validation.hardConstraintViolationCodes ?? []);
  if (codes.has("DEPENDENCY_VIOLATION")) reasons.add("segment_candidate_dependency_violation");
  if (codes.has("RESOURCE_OVERLAP") || codes.has("SPACE_OVERLAP") || optimizedErrors.some((error) => error.includes("RESOURCE") || error.includes("SPACE"))) reasons.add("segment_candidate_resource_conflict");
  return [...reasons];
};

const improvementReason = (before: CandidateSolutionScore, after: CandidateSolutionScore): string => {
  if (after.maxCoachGapMinutes < before.maxCoachGapMinutes) return "segment_solver selected: lower coach gap";
  if (after.coachSplitDayPenalty < before.coachSplitDayPenalty) return "segment_solver selected: lower split day";
  return "segment_solver selected: better operational quality";
};

export const runSegmentSolver = (input: EngineV3Input, baseline: EngineOutput, options: SegmentSolverOptions = {}): { output: EngineOutput; candidates: EngineOutput[]; meta: SegmentSolverMeta } => {
  const startedAt = Date.now();
  const timeoutMs = Math.max(0, Number(options.timeoutMs ?? SEGMENT_SOLVER_DEFAULT_TIMEOUT_MS));
  const baseScore = scoreCandidateSolution(input, baseline);
  const emptyMeta: SegmentSolverMeta = {
    segmentSolverAttempted: false, segmentSolverBackend: "bounded_exact_search", segmentSolverSegmentsBuilt: 0,
    segmentSolverCandidatesGenerated: 0, segmentSolverAccepted: false, segmentSolverReason: options.disabled ? "solver_disabled" : "no_problematic_coach_segment",
    segmentSolverRejectedReasons: [], segmentSolverMicroSegmentsBuilt: 0, segmentSolverMicroSegmentStrategiesTried: [],
    segmentSolverMicroSegmentTaskCounts: [], segmentSolverMicroSegmentRejectedReasons: [], segmentSolverAssignmentsExplored: 0,
    segmentSolverValidCandidates: 0, segmentSolverBestCandidateMovedTaskIds: [], segmentSolverBestCandidateMovedTalentNames: [],
    segmentSolverBestBefore: compactMetrics(baseScore), segmentSolverBestAfter: compactMetrics(baseScore), segmentSolverTimeoutMs: timeoutMs,
    segmentSolverElapsedMs: 0, segmentSolverMealMovesAttempted: false, segmentSolverMealMovesAccepted: false,
    segmentSolverMealMoveCount: 0, segmentSolverMealRejectedReasons: [],
  };
  if (options.disabled) return { output: baseline, candidates: [], meta: emptyMeta };
  const segments = buildCriticalCoachSegments(input, baseline, options.maxSegments);
  if (!segments.length) return { output: baseline, candidates: [], meta: { ...emptyMeta, segmentSolverElapsedMs: Date.now() - startedAt } };
  const wide = segments[0];
  const gap = findCriticalCoachGap(input, baseline, wide.coachId)!;
  const microBuild = buildCoachMicroSegments(input, baseline, gap);
  const wideTooLarge = wide.movableTaskIds.length > SEGMENT_SOLVER_MAX_TASKS;
  const solveSegments: CoachMicroSegment[] = microBuild.segments;
  const meta: SegmentSolverMeta = {
    ...emptyMeta, segmentSolverAttempted: true, segmentSolverSegmentsBuilt: segments.length, segmentSolverTargetCoachName: wide.coachName,
    segmentSolverWindowStart: hhmm(wide.windowStart), segmentSolverWindowEnd: hhmm(wide.windowEnd), segmentSolverTaskCount: wide.taskIds.length,
    segmentSolverTalentNames: wide.talentNames, segmentSolverResourceNames: wide.resourceNames,
    segmentSolverCriticalGapStart: hhmm(gap.gapStart), segmentSolverCriticalGapEnd: hhmm(gap.gapEnd), segmentSolverCriticalGapMinutes: gap.gapMinutes,
    segmentSolverLeftBlockTalentNames: gap.leftBlockTalentNames, segmentSolverRightBlockTalentNames: gap.rightBlockTalentNames,
    segmentSolverMicroSegmentsBuilt: solveSegments.length, segmentSolverMicroSegmentStrategiesTried: solveSegments.map((segment) => segment.strategy),
    segmentSolverMicroSegmentTaskCounts: solveSegments.map((segment) => segment.taskIds.length),
    segmentSolverMicroSegmentRejectedReasons: microBuild.rejectedReasons,
    segmentSolverReason: wideTooLarge ? "wide_segment_too_large_microsegments_attempted" : "microsegment_built",
    segmentSolverRejectedReasons: wideTooLarge ? ["wide_segment_too_large"] : [],
  };
  if (!solveSegments.length) return { output: baseline, candidates: [], meta: { ...meta, segmentSolverReason: wideTooLarge ? "segment_too_large" : "no_movable_tasks", segmentSolverElapsedMs: Date.now() - startedAt } };

  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const plannedById = new Map((baseline.plannedTasks ?? []).map((task) => [Number(task.taskId), task]));
  const mealWindow = getMealMode(input).mode === "flexible_meal_window" ? getMealWindow(input) : null;
  const mealStart = toMinutes(mealWindow?.start); const mealEnd = toMinutes(mealWindow?.end);
  const globalDeadline = startedAt + timeoutMs;
  let timedOut = false; let cancelled = false; let best = baseline; let bestScore = baseScore; let bestChanges = 0;
  const candidates: EngineOutput[] = []; const rejected = new Set(meta.segmentSolverRejectedReasons); const mealRejected = new Set<string>();

  for (const segment of solveSegments) {
    if (Date.now() >= globalDeadline) { timedOut = true; break; }
    const microDeadline = Math.min(globalDeadline, Date.now() + SEGMENT_SOLVER_MICRO_TIMEOUT_MS);
    let assignments = 0;
    let microStopped = false;
    const movable = segment.movableTaskIds.map((taskId) => {
      const task = taskById.get(taskId)!; const planned = plannedById.get(taskId)!;
      const currentStart = toMinutes(planned.startPlanned)!; const currentEnd = toMinutes(planned.endPlanned)!; const duration = currentEnd - currentStart;
      const meal = isMealTask(input, task) && mealStart !== null && mealEnd !== null;
      const minStart = Math.max(segment.windowStart, meal ? mealStart! : segment.windowStart);
      const maxStart = Math.min(segment.windowEnd, meal ? mealEnd! : segment.windowEnd) - duration;
      const strategyOffsets = segment.targetTaskIds.includes(taskId) ? segment.offsetMinutes : [-30, -15, 0, 15, 30];
      const domain = uniq([currentStart, ...strategyOffsets.map((offset) => currentStart + offset)])
        .filter((start) => start >= minStart && start <= maxStart && start % SEGMENT_SOLVER_GRID_MINUTES === 0)
        .sort((a, b) => Math.abs(a - currentStart) - Math.abs(b - currentStart) || a - b);
      return { taskId, task, currentStart, duration, isMeal: meal, domain };
    }).filter((item) => item.domain.length);
    meta.segmentSolverMealMovesAttempted ||= movable.some((item) => item.isMeal);

    const evaluate = (starts: Map<number, number>) => {
      if (Date.now() >= globalDeadline) { timedOut = true; return; }
      if (assignments >= SEGMENT_SOLVER_MAX_ASSIGNMENTS || Date.now() >= microDeadline) { microStopped = true; return; }
      if (options.shouldCancel?.()) { cancelled = true; return; }
      assignments += 1; meta.segmentSolverAssignmentsExplored += 1;
      const candidate = candidateWithStarts(baseline, starts); const movedIds = changedTaskIds(baseline, candidate);
      if (!movedIds.length) return;
      const reasons = rejectionReasons(input, baseline, candidate);
      if (reasons.length) { reasons.forEach((reason) => rejected.add(reason)); if (movedIds.some((id) => movable.find((item) => item.taskId === id)?.isMeal)) reasons.forEach((reason) => mealRejected.add(reason)); return; }
      meta.segmentSolverValidCandidates += 1; meta.segmentSolverCandidatesGenerated += 1;
      if (candidates.length < 50) candidates.push(candidate);
      const score = scoreCandidateSolution(input, candidate); const changes = movedIds.length;
      if (score.makespan <= baseScore.makespan && compareSegmentScores(score, bestScore, changes, bestChanges) > 0) {
        best = candidate; bestScore = score; bestChanges = changes;
      }
    };

    // Surgical block shifts are the highest-value assignments and preserve local ordering/dependencies.
    for (const offset of segment.offsetMinutes) {
      const starts = new Map<number, number>();
      for (const item of movable) if (segment.targetTaskIds.includes(item.taskId) && item.domain.includes(item.currentStart + offset)) starts.set(item.taskId, item.currentStart + offset);
      if (starts.size) evaluate(starts);
      if (timedOut || cancelled || microStopped) break;
    }
    if (segment.strategy === "coach_block_reorder") {
      const reorderItems = movable.filter((item) => segment.targetTaskIds.includes(item.taskId)).slice(0, 4);
      const slots = reorderItems.map((item) => item.currentStart).sort((a, b) => a - b);
      let permutationsTried = 0;
      const permute = (remaining: typeof reorderItems, ordered: typeof reorderItems) => {
        if (permutationsTried >= 12 || timedOut || cancelled || microStopped) return;
        if (!remaining.length) {
          permutationsTried += 1;
          evaluate(new Map(ordered.map((item, index) => [item.taskId, slots[index]])));
          return;
        }
        remaining.forEach((item, index) => permute([...remaining.slice(0, index), ...remaining.slice(index + 1)], [...ordered, item]));
      };
      if (reorderItems.length > 1) permute(reorderItems, []);
    }
    // Then enumerate single moves and a bounded exact product over the four highest-impact tasks.
    for (const item of movable) {
      for (const start of item.domain) { if (start !== item.currentStart) evaluate(new Map([[item.taskId, start]])); if (timedOut || cancelled || microStopped) break; }
      if (timedOut || cancelled || microStopped) break;
    }
    const searchItems = movable.filter((item) => segment.targetTaskIds.includes(item.taskId) || item.isMeal).slice(0, 4);
    const dfs = (index: number, starts: Map<number, number>) => {
      if (timedOut || cancelled || microStopped || assignments >= SEGMENT_SOLVER_MAX_ASSIGNMENTS || Date.now() >= microDeadline) { microStopped ||= assignments >= SEGMENT_SOLVER_MAX_ASSIGNMENTS || Date.now() >= microDeadline; return; }
      if (index === searchItems.length) { evaluate(starts); return; }
      const item = searchItems[index];
      for (const start of item.domain.slice(0, 10)) { starts.set(item.taskId, start); dfs(index + 1, starts); starts.delete(item.taskId); if (timedOut || cancelled || microStopped) return; }
    };
    if (!timedOut && !cancelled && !microStopped && searchItems.length > 1) dfs(0, new Map());
    if (cancelled) break;
  }

  const accepted = best !== baseline && compareSegmentScores(bestScore, baseScore, bestChanges, 0) > 0;
  const movedIds = accepted ? changedTaskIds(baseline, best) : [];
  const movedTalentNames = uniq(movedIds.map((id) => String(taskById.get(id)?.contestantName ?? "").trim()).filter(Boolean));
  const movedMealCount = accepted ? movedIds.filter((id) => isMealTask(input, taskById.get(id)!)).length : 0;
  if (timedOut) rejected.add("segment_candidate_timeout");
  if (!meta.segmentSolverValidCandidates) meta.segmentSolverMicroSegmentRejectedReasons.push("microsegment_no_valid_candidate");
  else if (!accepted) meta.segmentSolverMicroSegmentRejectedReasons.push("microsegment_candidate_not_better");
  meta.segmentSolverAccepted = accepted;
  meta.segmentSolverReason = cancelled ? "cancelled" : timedOut && !accepted ? "segment_solver_timeout" : accepted ? "accepted" : meta.segmentSolverValidCandidates ? "segment_candidate_valid_but_not_better" : "microsegment_no_valid_candidate";
  meta.segmentSolverRejectedReasons = [...rejected].slice(0, 20);
  meta.segmentSolverBestAfter = compactMetrics(accepted ? bestScore : baseScore);
  meta.segmentSolverImprovement = accepted ? improvementReason(baseScore, bestScore) : meta.segmentSolverValidCandidates ? `segment_candidate_valid_but_not_better: baseline=${JSON.stringify(compactMetrics(baseScore))}; candidate=${JSON.stringify(compactMetrics(bestScore))}` : "microsegment_no_valid_candidate";
  meta.segmentSolverBestCandidateMovedTaskIds = movedIds;
  meta.segmentSolverBestCandidateMovedTalentNames = movedTalentNames;
  meta.segmentSolverBestCandidateReason = accepted ? improvementReason(baseScore, bestScore) : meta.segmentSolverImprovement;
  meta.segmentSolverElapsedMs = Math.max(0, Date.now() - startedAt);
  meta.segmentSolverMealMovesAccepted = movedMealCount > 0; meta.segmentSolverMealMoveCount = movedMealCount;
  meta.segmentSolverMealRejectedReasons = [...mealRejected].slice(0, 10);
  return { output: accepted ? best : baseline, candidates, meta };
};

export const segmentSolverSelectionReason = improvementReason;
