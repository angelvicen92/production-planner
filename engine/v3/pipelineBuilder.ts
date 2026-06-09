import type { EngineOutput, TaskInput } from "../types";
import { getCoachResourceIds } from "./coachDetection";
import { validateHardConstraints, type HardConstraintViolationCode, type HardConstraintViolationDetail } from "./hardValidation";
import { toMinutes } from "./metrics";
import { scoreCandidateSolution, type CandidateSolutionScore } from "./solutionScoring";
import type { EngineV3Input } from "./types";

export type PipelineCandidateKind =
  | "pipeline_coachA_first"
  | "pipeline_coachB_first"
  | "pipeline_grouped_balanced";

export type PipelineRejectedReason =
  | "not_enough_mapped_talents"
  | "main_stage_sequence_missing"
  | "candidate_failed_hard_validation"
  | "candidate_would_create_main_stage_gap"
  | "candidate_not_better_than_baseline"
  | "feeders_unschedulable"
  | "all_candidates_rejected"
  | "pipeline_candidate_generated_but_lost_scoring"
  | "resource_conflict"
  | "space_conflict"
  | "availability_violation"
  | "dependency_violation"
  | "locked_or_executed_task"
  | "resource_conflict_unrepaired"
  | "space_conflict_unrepaired"
  | "dependency_conflict_unrepaired"
  | "locked_blocker"
  | "repair_not_better_than_baseline"
  | "repair_success_candidate_generated"
  | "repair_attempted_but_no_valid_candidate"
  | "repair_valid_but_not_better_than_baseline"
  | "repair_blocked_by_locked_or_executed"
  | "segment_has_fixed_blocker";

export type PipelineFeederOutcome = "feeder_relocated" | "feeder_kept_stable" | "feeder_blocked";

export interface PipelineConflictDetail {
  candidateName: string;
  violationCode: string;
  resourceId?: number;
  resourceName?: string;
  spaceId?: number;
  spaceName?: string;
  start?: string;
  end?: string;
  taskIds: number[];
  taskNames: string[];
  talentNames: string[];
  blockingTaskIds: number[];
  blockingTaskNames: string[];
  movableTaskIds: number[];
  lockedOrExecutedTaskIds: number[];
  repairAttempted: boolean;
  repairStrategy: string;
  repairResult: string;
  message: string;
}

export interface PipelineBuilderCandidate {
  kind: PipelineCandidateKind;
  coachOrder: number[];
  talentOrder: number[];
  output: EngineOutput;
  movedTaskIds: number[];
  stableTaskIds: number[];
  feederOutcomes: PipelineFeederOutcome[];
  repaired?: boolean;
  segmentRepaired?: boolean;
  segmentRepairStrategies?: string[];
  movedTalentNames?: string[];
}

export interface PipelineBuilderDiagnostics {
  attempted: boolean;
  candidatesGenerated: number;
  reason: string;
  rejectedReasons: PipelineRejectedReason[];
  before: Record<string, number>;
  after: Record<string, number>;
  mappedTalents: string[];
  unmappedTalents: string[];
  movedTaskIds: number[];
  stableTaskIds: number[];
  feederOutcomes: PipelineFeederOutcome[];
  repairAttempted: boolean;
  repairCandidatesGenerated: number;
  repairAccepted: boolean;
  conflictDetails: PipelineConflictDetail[];
  segmentRepairAttempted: boolean;
  segmentRepairCandidatesGenerated: number;
  segmentRepairAccepted: boolean;
  segmentRepairReason: string;
  segmentRepairStrategiesTried: string[];
  segmentRepairMovedTalentNames: string[];
  segmentRepairRejectedReasons: string[];
}

type Planned = EngineOutput["plannedTasks"][number];
type MainRow = { task: TaskInput; planned: Planned; start: number; end: number; talentId: number };
type MainGroup = { talentId: number; tasks: MainRow[] };

const MAX_TALENT_DIAGNOSTICS = 20;
const MAX_TASK_DIAGNOSTICS = 50;
const MAX_CONFLICT_DIAGNOSTICS = 10;
const MAX_CONFLICT_TASK_IDS = 6;
const MAX_REPAIR_ATTEMPTS_PER_CANDIDATE = 30;
const REPAIR_SHIFTS_MINUTES = [-60, -45, -30, -20, -15, -10, -5, 5, 10, 15, 20, 30, 45, 60];
const MIN_MAPPED_TALENTS = 6;

const toHHMM = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const normalize = (value: unknown): string => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase();

const taskLabel = (input: EngineV3Input, task: TaskInput): string => normalize([
  (task as any).templateName,
  (task as any).name,
  task.templateId ? input.taskTemplateNameById?.[Number(task.templateId)] : null,
].filter(Boolean).join(" "));

const talentLabel = (input: EngineV3Input, talentId: number): string => {
  const name = input.tasks
    .filter((task) => Number(task.contestantId) === talentId)
    .map((task) => String(task.contestantName ?? "").trim())
    .find(Boolean);
  return name || `talent:${talentId}`;
};

const dependencyIds = (task: TaskInput): number[] => [...new Set([
  ...(Array.isArray((task as any).dependencyIds) ? (task as any).dependencyIds : []),
  ...(Array.isArray(task.dependsOnTaskIds) ? task.dependsOnTaskIds : []),
  (task as any).dependencyTaskId,
  task.dependsOnTaskId,
].map(Number).filter(Number.isFinite))];

const isProtectedTask = (input: EngineV3Input, taskId: number): boolean => {
  const task = input.tasks.find((candidate) => Number(candidate.id) === taskId);
  const status = String(task?.status ?? "pending").toLowerCase();
  if (status === "done" || status === "in_progress" || Boolean((task as any)?.isManualBlock)
    || Boolean(task?.fixedWindowStart || task?.fixedWindowEnd || task?.breakId || task?.breakKind)) return true;
  return (input.locks ?? []).some((lock) => Number(lock.taskId) === taskId
    && ["time", "full"].includes(String(lock.lockType ?? "").toLowerCase()));
};

const isTransportOrMeal = (input: EngineV3Input, task: TaskInput): boolean => (
  /(transport|traslado|llegada|salida|recogida|pickup|dropoff|comida|almuerzo|meal|lunch)/.test(taskLabel(input, task))
);

const isFeeder = (input: EngineV3Input, task: TaskInput): boolean => (
  /(vocal|coach|pasillo|prep|pre[- ]?main|preparacion|prueba|ensayo)/.test(taskLabel(input, task))
);

const isPostMain = (input: EngineV3Input, task: TaskInput): boolean => (
  /(reality|total(?:es)?|post[- ]?main)/.test(taskLabel(input, task))
);

export type TalentPipelineSegment = {
  talentId: number;
  mainStage: TaskInput[];
  preMainDirect: TaskInput[];
  vocalCoach: TaskInput[];
  prep: TaskInput[];
  postMainDirect: TaskInput[];
  directDependencies: TaskInput[];
  segmentCritical: TaskInput[];
  segmentMovable: TaskInput[];
  segmentFixed: TaskInput[];
};

export type TalentPipelineDependencies = {
  mainZoneId?: number | null;
  fixedTaskIds?: Iterable<number>;
  transportOrMealTaskIds?: Iterable<number>;
};

const uniqueTasks = (tasks: TaskInput[]): TaskInput[] => tasks.filter((task, index, all) => (
  all.findIndex((candidate) => Number(candidate.id) === Number(task.id)) === index
));

/** Pure segment classifier used by the pipeline repair pass and focused unit tests. */
export const buildTalentPipelineSegment = (
  talentId: number,
  tasks: TaskInput[],
  dependencies: TalentPipelineDependencies = {},
): TalentPipelineSegment => {
  const talentTasks = tasks.filter((task) => Number(task.contestantId) === Number(talentId));
  const taskById = new Map(tasks.map((task) => [Number(task.id), task]));
  const mainStage = talentTasks.filter((task) => Number(task.zoneId) === Number(dependencies.mainZoneId ?? NaN));
  const mainIds = new Set(mainStage.map((task) => Number(task.id)));
  const preMainDirect = uniqueTasks(mainStage.flatMap((task) => dependencyIds(task)
    .map((id) => taskById.get(id))
    .filter((candidate): candidate is TaskInput => candidate !== undefined)
    .filter((candidate) => Number(candidate.contestantId) === Number(talentId))));
  const postMainDirect = talentTasks.filter((task) => dependencyIds(task).some((id) => mainIds.has(id)));
  const directDependencies = uniqueTasks([...preMainDirect, ...postMainDirect]);
  const vocalCoach = talentTasks.filter((task) => /(vocal|coach)/.test(normalize([(task as any).templateName, (task as any).name].filter(Boolean).join(" "))));
  const prep = talentTasks.filter((task) => /(pasillo|prep|pre[- ]?main|preparacion|prueba|ensayo)/.test(
    normalize([(task as any).templateName, (task as any).name].filter(Boolean).join(" ")),
  ));
  const fixedIds = new Set(Array.from(dependencies.fixedTaskIds ?? [], Number));
  const transportIds = new Set(Array.from(dependencies.transportOrMealTaskIds ?? [], Number));
  const transportOrMeal = talentTasks.filter((task) => transportIds.has(Number(task.id)));
  const segmentTasks = uniqueTasks([...mainStage, ...directDependencies, ...vocalCoach, ...prep, ...transportOrMeal]);
  const segmentFixed = segmentTasks.filter((task) => fixedIds.has(Number(task.id)) || transportIds.has(Number(task.id)));
  const fixedSet = new Set(segmentFixed.map((task) => Number(task.id)));
  const mainSet = new Set(mainStage.map((task) => Number(task.id)));
  const segmentCritical = uniqueTasks([...mainStage, ...preMainDirect]);
  const segmentMovable = segmentTasks.filter((task) => !fixedSet.has(Number(task.id)) && !mainSet.has(Number(task.id)));
  return { talentId, mainStage, preMainDirect, vocalCoach, prep, postMainDirect, directDependencies, segmentCritical, segmentMovable, segmentFixed };
};

const compactMetrics = (score: CandidateSolutionScore): Record<string, number> => ({
  coachSplitDayPenalty: score.coachSplitDayPenalty,
  maxCoachGapMinutes: score.maxCoachGapMinutes,
  coachIdlePenalty: score.coachIdlePenalty,
  coachSpanPenalty: score.coachSpanPenalty,
  coachSwitchPenalty: score.coachSwitchPenalty,
  talentIdlePenalty: score.talentIdlePenalty,
  talentSpanPenalty: score.talentSpanPenalty,
  mainStageGapMinutes: score.mainStageGapMinutes,
  hardConstraintViolations: score.hardConstraintViolations,
  plannedTasks: score.plannedTasks,
});

const uniqueOrders = (orders: Array<{ kind: PipelineCandidateKind; order: number[] }>) => orders.filter((entry, index, all) => (
  entry.order.length > 0 && all.findIndex((other) => other.order.join(",") === entry.order.join(",")) === index
));

const balancedGroups = (groups: number[][]): number[] => {
  const remaining = groups.map((group) => [...group]);
  const result: number[] = [];
  while (remaining.some((group) => group.length > 0)) {
    for (const group of remaining) {
      const talentId = group.shift();
      if (talentId !== undefined) result.push(talentId);
    }
  }
  return result;
};

const mergeMappedIntoStableHoles = (originalOrder: number[], mappedOrder: number[], mappedSet: Set<number>): number[] => {
  let mappedIndex = 0;
  return originalOrder.map((talentId) => mappedSet.has(talentId) ? mappedOrder[mappedIndex++] : talentId);
};

const sortByDependencies = (tasks: TaskInput[]): TaskInput[] => {
  const taskIds = new Set(tasks.map((task) => Number(task.id)));
  const remaining = [...tasks];
  const ordered: TaskInput[] = [];
  while (remaining.length > 0) {
    const readyIndex = remaining.findIndex((task) => dependencyIds(task).every((id) => !taskIds.has(id) || ordered.some((done) => Number(done.id) === id)));
    if (readyIndex < 0) return tasks;
    ordered.push(remaining.splice(readyIndex, 1)[0]);
  }
  return ordered;
};

const rejectionForCodes = (codes: HardConstraintViolationCode[]): PipelineRejectedReason => {
  if (codes.includes("RESOURCE_OVERLAP")) return "resource_conflict";
  if (codes.includes("SPACE_OVERLAP")) return "space_conflict";
  if (codes.includes("AVAILABILITY_VIOLATION")) return "availability_violation";
  if (codes.includes("DEPENDENCY_VIOLATION")) return "dependency_violation";
  if (codes.some((code) => code === "LOCK_MOVED" || code === "DONE_MOVED" || code === "IN_PROGRESS_MOVED")) return "locked_or_executed_task";
  return "candidate_failed_hard_validation";
};

const updatePlanned = (plannedById: Map<number, Planned>, taskId: number, start: number): void => {
  const current = plannedById.get(taskId);
  if (!current) return;
  const oldStart = toMinutes(current.startPlanned);
  const oldEnd = toMinutes(current.endPlanned);
  if (oldStart === null || oldEnd === null) return;
  plannedById.set(taskId, { ...current, startPlanned: toHHMM(start), endPlanned: toHHMM(start + oldEnd - oldStart) });
};

const addRejected = (diagnostics: PipelineBuilderDiagnostics, reason: PipelineRejectedReason): void => {
  if (!diagnostics.rejectedReasons.includes(reason)) diagnostics.rejectedReasons.push(reason);
};

const resourceName = (input: EngineV3Input, resourceId: number | undefined): string | undefined => {
  if (!Number.isFinite(Number(resourceId))) return undefined;
  const item = (input.planResourceItems ?? []).find((resource) => Number((resource as any).id) === Number(resourceId)
    || Number((resource as any).resourceItemId) === Number(resourceId));
  return String((item as any)?.name ?? (item as any)?.resourceName ?? "").trim() || undefined;
};

const taskName = (input: EngineV3Input, taskId: number): string => {
  const task = input.tasks.find((candidate) => Number(candidate.id) === taskId);
  return String((task as any)?.templateName ?? (task as any)?.name ?? `Task ${taskId}`).trim() || `Task ${taskId}`;
};

const isMainStageTask = (input: EngineV3Input, task: TaskInput): boolean => Number(task.zoneId) === Number(input.optimizerMainZoneId ?? NaN);

const isRepairMovableTask = (input: EngineV3Input, taskId: number): boolean => {
  const task = input.tasks.find((candidate) => Number(candidate.id) === taskId);
  if (!task) return false;
  if (isProtectedTask(input, taskId) || isTransportOrMeal(input, task) || isMainStageTask(input, task)) return false;
  return true;
};

const protectedConflictTaskIds = (input: EngineV3Input, taskIds: number[]): number[] => taskIds.filter((taskId) => !isRepairMovableTask(input, taskId));

const compactConflictDetail = (
  input: EngineV3Input,
  candidateName: string,
  violation: HardConstraintViolationDetail,
  repairAttempted: boolean,
  repairStrategy: string,
  repairResult: string,
  candidate?: EngineOutput,
  baseline?: EngineOutput,
): PipelineConflictDetail => {
  const candidateById = new Map((candidate?.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));
  const baselineById = new Map((baseline?.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));
  const explicitIds = (violation.taskIds ?? []).map(Number).filter(Number.isFinite);
  const violationStart = toMinutes(violation.start);
  const violationEnd = toMinutes(violation.end);
  const overlappingIds = violationStart === null || violationEnd === null ? [] : (candidate?.plannedTasks ?? [])
    .filter((planned) => {
      const task = input.tasks.find((item) => Number(item.id) === Number(planned.taskId));
      const start = toMinutes(planned.startPlanned);
      const end = toMinutes(planned.endPlanned);
      if (!task || start === null || end === null || start >= violationEnd || violationStart >= end) return false;
      if (violation.resourceId && !(planned.assignedResources ?? []).map(Number).includes(Number(violation.resourceId))) return false;
      if (violation.spaceId && Number(task.spaceId) !== Number(violation.spaceId)) return false;
      return Boolean(violation.resourceId || violation.spaceId);
    }).map((planned) => Number(planned.taskId));
  const taskIds = [...new Set([...explicitIds, ...overlappingIds])].slice(0, MAX_CONFLICT_TASK_IDS);
  const movableTaskIds = taskIds.filter((taskId) => isRepairMovableTask(input, taskId));
  const lockedOrExecutedTaskIds = protectedConflictTaskIds(input, taskIds);
  const blockingTaskIds = taskIds.filter((taskId) => {
    const current = candidateById.get(taskId);
    const original = baselineById.get(taskId);
    return lockedOrExecutedTaskIds.includes(taskId) || Boolean(current && original
      && current.startPlanned === original.startPlanned && current.endPlanned === original.endPlanned);
  }).slice(0, MAX_CONFLICT_TASK_IDS);
  const talentNames = [...new Set(taskIds.map((taskId) => {
    const task = input.tasks.find((candidateTask) => Number(candidateTask.id) === taskId);
    return task?.contestantId ? talentLabel(input, Number(task.contestantId)) : null;
  }).filter((name): name is string => Boolean(name)))].slice(0, 6);
  return {
    candidateName,
    violationCode: violation.code,
    resourceId: violation.resourceId,
    resourceName: resourceName(input, violation.resourceId),
    spaceId: violation.spaceId,
    spaceName: violation.spaceName ?? (violation.spaceId ? String(input.spaceNameById?.[violation.spaceId] ?? "").trim() || undefined : undefined),
    start: violation.start,
    end: violation.end,
    taskIds,
    taskNames: taskIds.map((taskId) => taskName(input, taskId)).slice(0, MAX_CONFLICT_TASK_IDS),
    talentNames,
    blockingTaskIds,
    blockingTaskNames: blockingTaskIds.map((taskId) => taskName(input, taskId)).slice(0, MAX_CONFLICT_TASK_IDS),
    movableTaskIds,
    lockedOrExecutedTaskIds,
    repairAttempted,
    repairStrategy,
    repairResult,
    message: String(violation.message ?? "").slice(0, 240),
  };
};

const addConflictDetail = (diagnostics: PipelineBuilderDiagnostics, detail: PipelineConflictDetail): void => {
  if (diagnostics.conflictDetails.length >= MAX_CONFLICT_DIAGNOSTICS) return;
  diagnostics.conflictDetails.push(detail);
};

const addFeederOutcome = (outcomes: PipelineFeederOutcome[], outcome: PipelineFeederOutcome): void => {
  if (!outcomes.includes(outcome)) outcomes.push(outcome);
};

const taskIdsByMovement = (baseline: EngineOutput, plannedById: Map<number, Planned>): { moved: number[]; stable: number[] } => {
  const moved: number[] = [];
  const stable: number[] = [];
  for (const planned of baseline.plannedTasks ?? []) {
    const candidate = plannedById.get(Number(planned.taskId));
    const target = candidate
      && candidate.startPlanned === planned.startPlanned
      && candidate.endPlanned === planned.endPlanned
      ? stable : moved;
    target.push(Number(planned.taskId));
  }
  return { moved: moved.slice(0, MAX_TASK_DIAGNOSTICS), stable: stable.slice(0, MAX_TASK_DIAGNOSTICS) };
};


const outputWithPlannedMap = (baseline: EngineOutput, plannedById: Map<number, Planned>): EngineOutput => ({
  ...baseline,
  plannedTasks: (baseline.plannedTasks ?? []).map((planned) => plannedById.get(Number(planned.taskId)) ?? planned),
});

const clonePlannedMap = (output: EngineOutput): Map<number, Planned> => new Map(
  (output.plannedTasks ?? []).map((planned) => [Number(planned.taskId), { ...planned }]),
);

const isCandidateStructurallySafe = (
  input: EngineV3Input,
  baselineScore: CandidateSolutionScore,
  output: EngineOutput,
): boolean => {
  const score = scoreCandidateSolution(input, output);
  return score.plannedTasks === baselineScore.plannedTasks
    && score.mainStageGapMinutes === 0
    && score.mainStageGapMinutes <= baselineScore.mainStageGapMinutes;
};

type SegmentRepairStrategy = "move_whole_segment_by_offset" | "reanchor_around_main_stage" | "pairwise_talent_swap" | "segment_micro_cascade";
type RepairResult = {
  output: EngineOutput | null;
  attempts: number;
  result: string;
  strategiesTried: SegmentRepairStrategy[];
  movedTalentNames: string[];
  rejectedReasons: string[];
};

const segmentForTalent = (input: EngineV3Input, talentId: number): TalentPipelineSegment => buildTalentPipelineSegment(
  talentId,
  input.tasks,
  {
    mainZoneId: input.optimizerMainZoneId,
    fixedTaskIds: input.tasks.filter((task) => isProtectedTask(input, Number(task.id))).map((task) => Number(task.id)),
    transportOrMealTaskIds: input.tasks.filter((task) => isTransportOrMeal(input, task)).map((task) => Number(task.id)),
  },
);

const plannedBounds = (plannedById: Map<number, Planned>, tasks: TaskInput[]): { start: number; end: number } | null => {
  const rows = tasks.map((task) => plannedById.get(Number(task.id))).filter((planned): planned is Planned => Boolean(planned));
  const starts = rows.map((planned) => toMinutes(planned.startPlanned)).filter((value): value is number => value !== null);
  const ends = rows.map((planned) => toMinutes(planned.endPlanned)).filter((value): value is number => value !== null);
  return starts.length > 0 && ends.length > 0 ? { start: Math.min(...starts), end: Math.max(...ends) } : null;
};

const shiftTasks = (
  output: EngineOutput,
  tasks: TaskInput[],
  delta: number,
  workStart: number,
  workEnd: number,
): EngineOutput | null => {
  const plannedById = clonePlannedMap(output);
  for (const task of tasks) {
    const planned = plannedById.get(Number(task.id));
    const start = toMinutes(planned?.startPlanned);
    const end = toMinutes(planned?.endPlanned);
    if (start === null || end === null || start + delta < workStart || end + delta > workEnd) return null;
    updatePlanned(plannedById, Number(task.id), start + delta);
  }
  return outputWithPlannedMap(output, plannedById);
};

export const reanchorTalentPipelineSegment = (
  input: EngineV3Input,
  output: EngineOutput,
  talentId: number,
): EngineOutput | null => {
  const segment = segmentForTalent(input, talentId);
  const plannedById = clonePlannedMap(output);
  const mainBounds = plannedBounds(plannedById, segment.mainStage);
  if (!mainBounds) return null;
  const fixedIds = new Set(segment.segmentFixed.map((task) => Number(task.id)));
  const preIds = new Set([...segment.preMainDirect, ...segment.vocalCoach, ...segment.prep].map((task) => Number(task.id)));
  const pre = sortByDependencies(segment.segmentMovable.filter((task) => preIds.has(Number(task.id))));
  let cursor = mainBounds.start;
  for (const task of [...pre].reverse()) {
    if (fixedIds.has(Number(task.id))) continue;
    const planned = plannedById.get(Number(task.id));
    const start = toMinutes(planned?.startPlanned);
    const end = toMinutes(planned?.endPlanned);
    if (start === null || end === null) return null;
    cursor -= end - start;
    if (cursor < (toMinutes(input.workDay.start) ?? 0)) return null;
    updatePlanned(plannedById, Number(task.id), cursor);
  }
  let postCursor = mainBounds.end;
  for (const task of sortByDependencies(segment.postMainDirect.filter((item) => !fixedIds.has(Number(item.id))))) {
    const planned = plannedById.get(Number(task.id));
    const start = toMinutes(planned?.startPlanned);
    const end = toMinutes(planned?.endPlanned);
    if (start === null || end === null || postCursor + end - start > (toMinutes(input.workDay.end) ?? 24 * 60)) return null;
    updatePlanned(plannedById, Number(task.id), postCursor);
    postCursor += end - start;
  }
  return outputWithPlannedMap(output, plannedById);
};

export const swapTalentPipelineSegments = (
  input: EngineV3Input,
  output: EngineOutput,
  firstTalentId: number,
  secondTalentId: number,
): EngineOutput | null => {
  const first = segmentForTalent(input, firstTalentId);
  const second = segmentForTalent(input, secondTalentId);
  if (first.segmentFixed.length > 0 || second.segmentFixed.length > 0) return null;
  const plannedById = clonePlannedMap(output);
  const firstMain = plannedBounds(plannedById, first.mainStage);
  const secondMain = plannedBounds(plannedById, second.mainStage);
  if (!firstMain || !secondMain || firstMain.end - firstMain.start !== secondMain.end - secondMain.start) return null;
  const move = (segment: TalentPipelineSegment, fromAnchor: number, toAnchor: number): boolean => {
    for (const task of uniqueTasks([...segment.mainStage, ...segment.segmentMovable])) {
      const planned = plannedById.get(Number(task.id));
      const start = toMinutes(planned?.startPlanned);
      if (start === null) return false;
      updatePlanned(plannedById, Number(task.id), toAnchor + start - fromAnchor);
    }
    return true;
  };
  if (!move(first, firstMain.start, secondMain.start) || !move(second, secondMain.start, firstMain.start)) return null;
  return outputWithPlannedMap(output, plannedById);
};

const protectedTasksUnchanged = (input: EngineV3Input, baseline: EngineOutput, output: EngineOutput): boolean => {
  const baselineById = new Map((baseline.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));
  return (output.plannedTasks ?? []).every((planned) => {
    const task = input.tasks.find((candidate) => Number(candidate.id) === Number(planned.taskId));
    if (!task || (!isProtectedTask(input, Number(task.id)) && !isTransportOrMeal(input, task))) return true;
    const original = baselineById.get(Number(planned.taskId));
    return Boolean(original && original.startPlanned === planned.startPlanned && original.endPlanned === planned.endPlanned);
  });
};

const attemptPipelineRepair = (
  input: EngineV3Input,
  baseline: EngineOutput,
  candidate: EngineOutput,
  baselineScore: CandidateSolutionScore,
): RepairResult => {
  let attempts = 0;
  const workStart = toMinutes(input.workDay.start) ?? 0;
  const workEnd = toMinutes(input.workDay.end) ?? 24 * 60;
  const strategiesTried: SegmentRepairStrategy[] = [];
  const movedTalentNames = new Set<string>();
  const rejectedReasons = new Set<string>();
  const queue: Array<{ output: EngineOutput; depth: number; movedTalents: number[] }> = [{ output: candidate, depth: 0, movedTalents: [] }];
  const addStrategy = (strategy: SegmentRepairStrategy): void => {
    if (!strategiesTried.includes(strategy)) strategiesTried.push(strategy);
  };
  const accept = (output: EngineOutput, talents: number[]): RepairResult | null => {
    const validation = validateHardConstraints(input, output, MAX_CONFLICT_DIAGNOSTICS);
    if (!validation.hardValidationPassed || !isCandidateStructurallySafe(input, baselineScore, output)
      || !protectedTasksUnchanged(input, baseline, output)) return null;
    talents.forEach((talentId) => movedTalentNames.add(talentLabel(input, talentId)));
    return { output, attempts, result: "repair_success_candidate_generated", strategiesTried, movedTalentNames: [...movedTalentNames], rejectedReasons: [...rejectedReasons] };
  };

  while (queue.length > 0 && attempts < MAX_REPAIR_ATTEMPTS_PER_CANDIDATE) {
    const state = queue.shift()!;
    const validation = validateHardConstraints(input, state.output, MAX_CONFLICT_DIAGNOSTICS);
    const accepted = validation.hardValidationPassed ? accept(state.output, state.movedTalents) : null;
    if (accepted) return accepted;
    if (state.depth >= 2) continue;
    const conflict = validation.hardConstraintViolationDetails.find((detail) => (
      detail.code === "RESOURCE_OVERLAP" || detail.code === "SPACE_OVERLAP" || detail.code === "DEPENDENCY_VIOLATION"
    ));
    if (!conflict) continue;
    const conflictTalents = [...new Set(conflict.taskIds.map((taskId) => input.tasks.find((task) => Number(task.id) === Number(taskId)))
      .map((task) => Number(task?.contestantId ?? NaN)).filter((talentId) => Number.isFinite(talentId) && talentId > 0))];
    for (const talentId of conflictTalents) {
      if (attempts >= MAX_REPAIR_ATTEMPTS_PER_CANDIDATE) break;
      const segment = segmentForTalent(input, talentId);
      if (segment.segmentFixed.length > 0) rejectedReasons.add("segment_has_fixed_blocker");

      addStrategy("move_whole_segment_by_offset");
      if (segment.segmentFixed.length === 0) {
        for (const delta of REPAIR_SHIFTS_MINUTES) {
          if (attempts >= MAX_REPAIR_ATTEMPTS_PER_CANDIDATE) break;
          attempts += 1;
          const shifted = shiftTasks(state.output, segment.segmentMovable, delta, workStart, workEnd);
          if (!shifted) continue;
          const shiftedAccepted = accept(shifted, [...state.movedTalents, talentId]);
          if (shiftedAccepted) return shiftedAccepted;
          const nextValidation = validateHardConstraints(input, shifted, 3);
          const repairable = nextValidation.hardConstraintViolationDetails.some((detail) => (
            detail.code === "RESOURCE_OVERLAP" || detail.code === "SPACE_OVERLAP" || detail.code === "DEPENDENCY_VIOLATION"
          ));
          if (repairable && state.depth === 0 && new Set([...state.movedTalents, talentId]).size <= 2) {
            addStrategy("segment_micro_cascade");
            queue.push({ output: shifted, depth: 1, movedTalents: [...new Set([...state.movedTalents, talentId])] });
          }
        }
      }

      if (attempts < MAX_REPAIR_ATTEMPTS_PER_CANDIDATE) {
        addStrategy("reanchor_around_main_stage");
        attempts += 1;
        const reanchored = reanchorTalentPipelineSegment(input, state.output, talentId);
        if (reanchored) {
          const reanchoredAccepted = accept(reanchored, [...state.movedTalents, talentId]);
          if (reanchoredAccepted) return reanchoredAccepted;
          if (state.depth === 0) {
            addStrategy("segment_micro_cascade");
            queue.push({ output: reanchored, depth: 1, movedTalents: [...new Set([...state.movedTalents, talentId])] });
          }
        }
      }

      addStrategy("pairwise_talent_swap");
      const allTalentIds = [...new Set(input.tasks.map((task) => Number(task.contestantId ?? NaN))
        .filter((otherTalentId) => Number.isFinite(otherTalentId) && otherTalentId > 0 && otherTalentId !== talentId))];
      for (const otherTalentId of allTalentIds) {
        if (attempts >= MAX_REPAIR_ATTEMPTS_PER_CANDIDATE) break;
        if (new Set([...state.movedTalents, talentId, otherTalentId]).size > 2) continue;
        attempts += 1;
        const swapped = swapTalentPipelineSegments(input, state.output, talentId, otherTalentId);
        if (!swapped) continue;
        const swappedAccepted = accept(swapped, [...state.movedTalents, talentId, otherTalentId]);
        if (swappedAccepted) return swappedAccepted;
      }
    }
  }

  return {
    output: null,
    attempts,
    result: rejectedReasons.has("segment_has_fixed_blocker") ? "segment_has_fixed_blocker" : "repair_attempted_but_no_valid_candidate",
    strategiesTried,
    movedTalentNames: [...movedTalentNames],
    rejectedReasons: [...rejectedReasons],
  };
};

const emptyDiagnostics = (baselineScore: CandidateSolutionScore): PipelineBuilderDiagnostics => ({
  attempted: false,
  candidatesGenerated: 0,
  reason: "generator_not_invoked",
  rejectedReasons: [],
  before: compactMetrics(baselineScore),
  after: compactMetrics(baselineScore),
  mappedTalents: [],
  unmappedTalents: [],
  movedTaskIds: [],
  stableTaskIds: [],
  feederOutcomes: [],
  repairAttempted: false,
  repairCandidatesGenerated: 0,
  repairAccepted: false,
  conflictDetails: [],
  segmentRepairAttempted: false,
  segmentRepairCandidatesGenerated: 0,
  segmentRepairAccepted: false,
  segmentRepairReason: "generator_not_invoked",
  segmentRepairStrategiesTried: [],
  segmentRepairMovedTalentNames: [],
  segmentRepairRejectedReasons: [],
});

export const generatePipelineBuilderCandidates = (
  input: EngineV3Input,
  baseline: EngineOutput,
  diagnostics?: PipelineBuilderDiagnostics,
): PipelineBuilderCandidate[] => {
  const baselineScore = scoreCandidateSolution(input, baseline);
  const report = diagnostics ?? emptyDiagnostics(baselineScore);
  Object.assign(report, emptyDiagnostics(baselineScore), { attempted: true });

  const mainZoneId = Number(input.optimizerMainZoneId ?? NaN);
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const plannedByIdBase = new Map((baseline.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));
  if (!Number.isFinite(mainZoneId)) {
    addRejected(report, "main_stage_sequence_missing");
    report.reason = "main_stage_sequence_missing";
    return [];
  }

  const mainRows = (baseline.plannedTasks ?? []).map((planned) => {
    const task = taskById.get(Number(planned.taskId));
    const start = toMinutes(planned.startPlanned);
    const end = toMinutes(planned.endPlanned);
    if (!task || Number(task.zoneId) !== mainZoneId || start === null || end === null || end <= start) return null;
    const talentId = Number(task.contestantId ?? NaN);
    return Number.isFinite(talentId) && talentId > 0 ? { task, planned, start, end, talentId } : null;
  }).filter((row): row is MainRow => row !== null).sort((a, b) => a.start - b.start || Number(a.task.id) - Number(b.task.id));
  if (mainRows.length < 2) {
    addRejected(report, "main_stage_sequence_missing");
    report.reason = "main_stage_sequence_missing";
    return [];
  }

  const groupByTalent = new Map<number, MainGroup>();
  for (const row of mainRows) {
    const group = groupByTalent.get(row.talentId) ?? { talentId: row.talentId, tasks: [] };
    group.tasks.push(row);
    groupByTalent.set(row.talentId, group);
  }
  const originalTalentOrder = [...groupByTalent.values()].sort((a, b) => a.tasks[0].start - b.tasks[0].start).map((group) => group.talentId);
  const coachIds = getCoachResourceIds(input);
  const coachByTalent = new Map<number, number>();
  for (const talentId of originalTalentOrder) {
    const assigned = new Set<number>();
    for (const task of input.tasks.filter((candidate) => Number(candidate.contestantId) === talentId)) {
      const planned = plannedByIdBase.get(Number(task.id));
      if (!planned) continue;
      for (const resourceId of planned.assignedResources ?? []) if (coachIds.has(Number(resourceId))) assigned.add(Number(resourceId));
    }
    if (assigned.size === 1) coachByTalent.set(talentId, [...assigned][0]);
  }

  const mappedTalents = originalTalentOrder.filter((talentId) => coachByTalent.has(talentId));
  const unmappedTalents = originalTalentOrder.filter((talentId) => !coachByTalent.has(talentId));
  report.mappedTalents = mappedTalents.map((talentId) => talentLabel(input, talentId)).slice(0, MAX_TALENT_DIAGNOSTICS);
  report.unmappedTalents = unmappedTalents.map((talentId) => talentLabel(input, talentId)).slice(0, MAX_TALENT_DIAGNOSTICS);

  const coachOrder = mappedTalents.map((talentId) => coachByTalent.get(talentId)!)
    .filter((coachId, index, all) => all.indexOf(coachId) === index);
  if (mappedTalents.length < MIN_MAPPED_TALENTS || coachOrder.length < 2) {
    addRejected(report, "not_enough_mapped_talents");
    report.reason = "not_enough_mapped_talents";
    return [];
  }

  const mappedSet = new Set(mappedTalents);
  const talentsByCoach = coachOrder.map((coachId) => mappedTalents.filter((talentId) => coachByTalent.get(talentId) === coachId));
  const mappedOrders = uniqueOrders([
    { kind: "pipeline_coachA_first", order: talentsByCoach.flat() },
    { kind: "pipeline_coachB_first", order: [talentsByCoach[1], talentsByCoach[0], ...talentsByCoach.slice(2)].flat() },
    { kind: "pipeline_grouped_balanced", order: balancedGroups(talentsByCoach) },
  ]).slice(0, 3);
  const orders = mappedOrders.map((variant) => ({
    ...variant,
    order: mergeMappedIntoStableHoles(originalTalentOrder, variant.order, mappedSet),
  }));

  const candidates: PipelineBuilderCandidate[] = [];
  for (const variant of orders) {
    const plannedById = new Map([...plannedByIdBase.entries()].map(([id, planned]) => [id, { ...planned }]));
    const feederOutcomes: PipelineFeederOutcome[] = [];
    let cursor = mainRows[0].start;
    let blocked = false;
    const mainStartByTalent = new Map<number, number>();
    const mainEndByTalent = new Map<number, number>();

    for (const talentId of variant.order) {
      const group = groupByTalent.get(talentId)!;
      mainStartByTalent.set(talentId, cursor);
      for (const row of group.tasks) {
        const taskId = Number(row.task.id);
        if (isProtectedTask(input, taskId) && cursor !== row.start) {
          addRejected(report, "locked_or_executed_task");
          blocked = true;
          break;
        }
        updatePlanned(plannedById, taskId, cursor);
        cursor += row.end - row.start;
      }
      mainEndByTalent.set(talentId, cursor);
      if (blocked) break;
    }
    if (blocked) continue;

    for (const talentId of variant.order) {
      if (!mappedSet.has(talentId)) continue;
      const mainTaskIds = new Set(groupByTalent.get(talentId)!.tasks.map((row) => Number(row.task.id)));
      const talentTasks = input.tasks.filter((task) => Number(task.contestantId) === talentId && plannedById.has(Number(task.id)) && !mainTaskIds.has(Number(task.id)));
      const ancestorIds = new Set<number>();
      const visitAncestors = (taskId: number): void => {
        const task = taskById.get(taskId);
        for (const dependencyId of task ? dependencyIds(task) : []) {
          const dependency = taskById.get(dependencyId);
          if (!dependency || Number(dependency.contestantId) !== talentId || ancestorIds.has(dependencyId)) continue;
          ancestorIds.add(dependencyId);
          visitAncestors(dependencyId);
        }
      };
      for (const mainTaskId of mainTaskIds) visitAncestors(mainTaskId);
      const originalMainStart = Math.min(...groupByTalent.get(talentId)!.tasks.map((row) => row.start));
      const feeders = sortByDependencies(talentTasks.filter((task) => {
        if (isTransportOrMeal(input, task)) return false;
        const planned = plannedByIdBase.get(Number(task.id));
        const end = toMinutes(planned?.endPlanned);
        return ancestorIds.has(Number(task.id)) || (isFeeder(input, task) && end !== null && end <= originalMainStart);
      }));
      let feederCursor = mainStartByTalent.get(talentId)!;
      for (const task of [...feeders].reverse()) {
        const taskId = Number(task.id);
        const planned = plannedById.get(taskId)!;
        const original = plannedByIdBase.get(taskId)!;
        const start = toMinutes(planned.startPlanned)!;
        const end = toMinutes(planned.endPlanned)!;
        const originalEnd = toMinutes(original.endPlanned)!;
        const newStart = feederCursor - (end - start);
        const canKeepStable = originalEnd <= feederCursor;
        if (newStart < (toMinutes(input.workDay.start) ?? 0) || (isProtectedTask(input, taskId) && newStart !== start)) {
          if (canKeepStable) {
            plannedById.set(taskId, { ...original });
            feederCursor = toMinutes(original.startPlanned)!;
            addFeederOutcome(feederOutcomes, "feeder_kept_stable");
            continue;
          }
          addFeederOutcome(feederOutcomes, "feeder_blocked");
          addRejected(report, isProtectedTask(input, taskId) ? "locked_or_executed_task" : "feeders_unschedulable");
          blocked = true;
          break;
        }
        updatePlanned(plannedById, taskId, newStart);
        if (newStart !== start) addFeederOutcome(feederOutcomes, "feeder_relocated");
        else addFeederOutcome(feederOutcomes, "feeder_kept_stable");
        feederCursor = newStart;
      }
      if (blocked) break;

      const postTasks = sortByDependencies(talentTasks.filter((task) => !isTransportOrMeal(input, task) && isPostMain(input, task)
        && dependencyIds(task).some((dependencyId) => mainTaskIds.has(dependencyId))));
      let postCursor = mainEndByTalent.get(talentId)!;
      for (const task of postTasks) {
        const taskId = Number(task.id);
        const planned = plannedById.get(taskId)!;
        const start = toMinutes(planned.startPlanned)!;
        const end = toMinutes(planned.endPlanned)!;
        if (isProtectedTask(input, taskId) && postCursor !== start) {
          addRejected(report, "locked_or_executed_task");
          blocked = true;
          break;
        }
        updatePlanned(plannedById, taskId, postCursor);
        postCursor += end - start;
      }
      if (blocked) break;
    }
    for (const outcome of feederOutcomes) addFeederOutcome(report.feederOutcomes, outcome);
    if (blocked) continue;

    const movement = taskIdsByMovement(baseline, plannedById);
    if (movement.moved.length === 0) continue;
    let output: EngineOutput = outputWithPlannedMap(baseline, plannedById);
    let validation = validateHardConstraints(input, output, MAX_CONFLICT_DIAGNOSTICS);
    let repaired = false;
    if (!validation.hardValidationPassed) {
      const repairableConflicts = validation.hardConstraintViolationDetails
        .filter((detail) => detail.code === "RESOURCE_OVERLAP" || detail.code === "SPACE_OVERLAP" || detail.code === "DEPENDENCY_VIOLATION");
      if (repairableConflicts.length > 0) {
        report.repairAttempted = true;
        report.segmentRepairAttempted = true;
        const hasMovableBlocker = repairableConflicts.some((detail) => detail.taskIds.some((taskId) => isRepairMovableTask(input, Number(taskId))));
        const repair = attemptPipelineRepair(input, baseline, output, baselineScore);
        report.segmentRepairStrategiesTried = [...new Set([...report.segmentRepairStrategiesTried, ...repair.strategiesTried])];
        report.segmentRepairMovedTalentNames = [...new Set([...report.segmentRepairMovedTalentNames, ...repair.movedTalentNames])].slice(0, MAX_TALENT_DIAGNOSTICS);
        report.segmentRepairRejectedReasons = [...new Set([
          ...report.segmentRepairRejectedReasons,
          ...repair.rejectedReasons,
          ...(repair.output ? [] : [repair.result]),
        ])].slice(0, 10);
        for (const conflict of repairableConflicts) {
          addConflictDetail(report, compactConflictDetail(input, variant.kind, conflict, true, repair.strategiesTried.join(","), repair.output
            ? "repair_success_candidate_generated"
            : hasMovableBlocker ? repair.result : "repair_blocked_by_locked_or_executed", output, baseline));
        }
        if (repair.output) {
          output = repair.output;
          validation = validateHardConstraints(input, output, MAX_CONFLICT_DIAGNOSTICS);
          repaired = validation.hardValidationPassed;
          if (repaired) {
            report.repairCandidatesGenerated += 1;
            report.segmentRepairCandidatesGenerated += 1;
            report.segmentRepairReason = "repair_success_candidate_generated";
            addRejected(report, "repair_success_candidate_generated");
          }
        } else {
          addRejected(report, hasMovableBlocker ? "repair_attempted_but_no_valid_candidate" : "repair_blocked_by_locked_or_executed");
          if (repair.result === "segment_has_fixed_blocker") addRejected(report, "segment_has_fixed_blocker");
          addRejected(report, hasMovableBlocker ? (repairableConflicts[0].code === "RESOURCE_OVERLAP"
            ? "resource_conflict_unrepaired" : repairableConflicts[0].code === "SPACE_OVERLAP"
              ? "space_conflict_unrepaired" : "dependency_conflict_unrepaired") : "locked_blocker");
          report.segmentRepairReason = repair.result;
        }
      } else {
        for (const detail of validation.hardConstraintViolationDetails.slice(0, MAX_CONFLICT_DIAGNOSTICS)) {
          addConflictDetail(report, compactConflictDetail(input, variant.kind, detail, false, "none", "not_repairable_by_pipeline_pass", output, baseline));
        }
      }
    }
    const score = scoreCandidateSolution(input, output);
    if (!validation.hardValidationPassed) {
      if (report.conflictDetails.length === 0) {
        for (const detail of validation.hardConstraintViolationDetails.slice(0, MAX_CONFLICT_DIAGNOSTICS)) {
          addConflictDetail(report, compactConflictDetail(
            input,
            variant.kind,
            detail,
            report.segmentRepairAttempted,
            report.segmentRepairStrategiesTried.join(",") || "none",
            report.segmentRepairReason,
            output,
            baseline,
          ));
        }
      }
      addRejected(report, "candidate_failed_hard_validation");
      addRejected(report, rejectionForCodes(validation.hardConstraintViolationCodes));
      if (validation.hardConstraintViolationCodes.includes("DEPENDENCY_VIOLATION")) addRejected(report, "dependency_conflict_unrepaired");
      continue;
    }
    if (score.plannedTasks !== baselineScore.plannedTasks) {
      addRejected(report, "candidate_failed_hard_validation");
      continue;
    }
    if (score.mainStageGapMinutes !== 0 || score.mainStageGapMinutes > baselineScore.mainStageGapMinutes) {
      addRejected(report, "candidate_would_create_main_stage_gap");
      continue;
    }
    const finalMovement = taskIdsByMovement(baseline, clonePlannedMap(output));
    candidates.push({
      kind: variant.kind,
      coachOrder: variant.order.map((talentId) => coachByTalent.get(talentId)).filter((id): id is number => id !== undefined)
        .filter((id, index, all) => all.indexOf(id) === index),
      talentOrder: variant.order,
      output,
      movedTaskIds: finalMovement.moved,
      stableTaskIds: finalMovement.stable,
      feederOutcomes,
      repaired,
      segmentRepaired: repaired,
      segmentRepairStrategies: repaired ? [...report.segmentRepairStrategiesTried] : [],
      movedTalentNames: repaired ? [...report.segmentRepairMovedTalentNames] : [],
    });
  }

  report.candidatesGenerated = candidates.length;
  report.repairAccepted = candidates.some((candidate) => candidate.repaired);
  report.segmentRepairAccepted = candidates.some((candidate) => candidate.segmentRepaired);
  if (report.segmentRepairAccepted) report.segmentRepairReason = "repair_success_candidate_generated";
  else if (!report.segmentRepairAttempted) report.segmentRepairReason = "not_needed";
  report.reason = candidates.length > 0
    ? unmappedTalents.length > 0 ? "partial_mapping_used" : "pipeline_candidates_generated"
    : report.rejectedReasons.length > 1 ? "all_candidates_rejected" : report.rejectedReasons[0] ?? "feeders_unschedulable";
  if (candidates.length > 0) {
    const best = candidates.map((candidate) => ({ candidate, score: scoreCandidateSolution(input, candidate.output) }))
      .sort((a, b) => a.score.coachSplitDayPenalty - b.score.coachSplitDayPenalty
        || a.score.maxCoachGapMinutes - b.score.maxCoachGapMinutes
        || a.score.coachIdlePenalty - b.score.coachIdlePenalty
        || a.score.coachSpanPenalty - b.score.coachSpanPenalty)[0];
    report.after = compactMetrics(best.score);
    report.movedTaskIds = best.candidate.movedTaskIds.slice(0, MAX_TASK_DIAGNOSTICS);
    report.stableTaskIds = best.candidate.stableTaskIds.slice(0, MAX_TASK_DIAGNOSTICS);
  }
  return candidates;
};
