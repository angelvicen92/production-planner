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
  | "segment_has_fixed_blocker"
  | "break_window_blocks_lane"
  | "break_window_blocks_lane_queue"
  | "lane_repair_dependency_blocked"
  | "lane_queue_split_around_break"
  | "break_aware_lane_repair_success"
  | "no_slack_for_lane_queue"
  | "alternative_lane_unavailable_missing_config"
  | "explicit_lock_blocks_lane"
  | "lane_capacity_unschedulable"
  | "dependency_shift_success"
  | "dependency_shift_no_slack"
  | "dependency_fixed"
  | "dependency_would_break_main_stage"
  | "lane_micro_reorder_success"
  | "lane_micro_reorder_no_valid_order";

export type PipelineFeederOutcome = "feeder_relocated" | "feeder_kept_stable" | "feeder_blocked";

export type PipelineConflictKind = "exclusive_lane_capacity" | "break_window_blocker" | "fixed_task_blocker" | "movable_task_conflict" | "dependency_chain_conflict" | "unknown";

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
  conflictKind?: PipelineConflictKind;
  isBreakBlocker?: boolean;
  isExplicitLock?: boolean;
  isDoneOrInProgress?: boolean;
  isImplicitFixed?: boolean;
  canUseAlternativeLane?: boolean;
  fixedReason?: string;
  alternativeLaneSpaceIds?: number[];
  selectedAlternativeLaneSpaceId?: number;
  laneRepairStrategy?: string;
  laneRepairMovedTaskIds?: number[];
  laneRepairMovedTalentNames?: string[];
  laneRepairBefore?: Array<{ taskId: number; start: string; end: string }>;
  laneRepairAfter?: Array<{ taskId: number; start: string; end: string }>;
  laneRepairResult?: string;
  slackAnalysis?: TaskSlackAnalysis[];
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
  laneOnlyRepaired?: boolean;
  laneRepairMovedTaskIds?: number[];
  laneRepairMovedTalentNames?: string[];
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
  laneRepairAttempted: boolean;
  laneRepairCandidatesGenerated: number;
  laneRepairAccepted: boolean;
  laneRepairReason: string;
  laneRepairRejectedReasons: string[];
  laneOnlyRepairAttempted: boolean;
  laneOnlyRepairCandidatesGenerated: number;
  laneOnlyRepairAccepted: boolean;
  laneOnlyRepairReason: string;
  laneOnlyRepairRejectedReasons: string[];
  laneOnlyRepairMovedTaskIds: number[];
  laneOnlyRepairMovedTalentNames: string[];
  alternativeLaneAttempted: boolean;
  alternativeLaneCandidatesGenerated: number;
  alternativeLaneAccepted: boolean;
  alternativeLaneRejectedReasons: string[];
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

const explicitLockForTask = (input: EngineV3Input, taskId: number) => (input.locks ?? []).find((lock) => (
  Number(lock.taskId) === taskId && ["time", "full"].includes(String(lock.lockType ?? "").toLowerCase())
));

const isBreakTask = (input: EngineV3Input, task: TaskInput): boolean => {
  if (Boolean(task.breakId || task.breakKind)) return true;
  if (input.mealTaskTemplateId != null && Number(task.templateId) === Number(input.mealTaskTemplateId)) return true;
  const configuredMealName = normalize(input.mealTaskTemplateName);
  const label = taskLabel(input, task);
  return (Boolean(configuredMealName) && label.includes(configuredMealName))
    || /(^|\s)(comida|almuerzo|meal|lunch)(\s|$)/.test(label);
};

const isProtectedTask = (input: EngineV3Input, taskId: number): boolean => {
  const task = input.tasks.find((candidate) => Number(candidate.id) === taskId);
  const status = String(task?.status ?? "pending").toLowerCase();
  if (status === "done" || status === "in_progress" || Boolean((task as any)?.isManualBlock)
    || Boolean(task?.fixedWindowStart || task?.fixedWindowEnd) || Boolean(task && isBreakTask(input, task))) return true;
  return Boolean(explicitLockForTask(input, taskId));
};

const isTransportTask = (input: EngineV3Input, task: TaskInput): boolean => (
  /(transport|traslado|llegada|recogida|pickup|dropoff)/.test(taskLabel(input, task))
);

const isTransportOrMeal = (input: EngineV3Input, task: TaskInput): boolean => isTransportTask(input, task) || isBreakTask(input, task);

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


export type AlternativeLaneSearchResult = {
  spaceIds: number[];
  reason: "alternative_lane_available" | "alternative_lane_unavailable_missing_config" | "task_hard_bound_to_space";
};

/** Conservative lane lookup: only explicit task/input relations are considered equivalent. */
export const findAlternativeSpaceLane = (
  task: TaskInput,
  conflict: { spaceId?: number },
  input: EngineV3Input,
): AlternativeLaneSearchResult => {
  const configured = [
    ...((task as any).allowedSpaceIds ?? []),
    ...((task as any).alternativeSpaceIds ?? []),
    ...((input as any).equivalentSpaceIdsBySpaceId?.[Number(conflict.spaceId)] ?? []),
  ].map(Number).filter((spaceId) => Number.isFinite(spaceId) && spaceId > 0 && spaceId !== Number(conflict.spaceId));
  const unique = [...new Set(configured)].filter((spaceId) => (
    input.spaceCapacityById?.[spaceId] !== 0 && input.spaceConcurrencyById?.[spaceId] !== 0
  ));
  if (unique.length > 0) return { spaceIds: unique, reason: "alternative_lane_available" };
  if ((task as any).spaceHardBound === true || (task as any).hardBoundSpaceId != null) {
    return { spaceIds: [], reason: "task_hard_bound_to_space" };
  }
  return { spaceIds: [], reason: "alternative_lane_unavailable_missing_config" };
};

export const fixedReasonForTask = (input: EngineV3Input, taskId: number): string | undefined => {
  const task = input.tasks.find((candidate) => Number(candidate.id) === taskId);
  const status = String(task?.status ?? "pending").toLowerCase();
  if (status === "done") return "status_done";
  if (status === "in_progress") return "status_in_progress";
  const lock = explicitLockForTask(input, taskId);
  if (lock) return `explicit_${String(lock.lockType).toLowerCase()}_lock`;
  if (task && isBreakTask(input, task)) return "protected_break_window";
  if (task?.fixedWindowStart || task?.fixedWindowEnd) return "fixed_window";
  if (Boolean((task as any)?.isManualBlock)) return "manual_block";
  return undefined;
};

const protectedBreakWindows = (input: EngineV3Input, spaceId: number): Array<{ start: number; end: number }> => {
  const rows = [
    ...(input.globalHardBreaks ?? []).map((item) => ({ ...item })),
    ...(input.protectedBreaks ?? []).filter((item) => item.spaceId == null || Number(item.spaceId) === spaceId),
    ...(input.actualMeal && (input.actualMeal.spaceId == null || Number(input.actualMeal.spaceId) === spaceId) ? [input.actualMeal] : []),
  ];
  return rows.map((item) => ({ start: toMinutes(item.start), end: toMinutes(item.end) }))
    .filter((item): item is { start: number; end: number } => item.start !== null && item.end !== null && item.end > item.start)
    .sort((a, b) => a.start - b.start);
};

const skipBreakWindows = (start: number, duration: number, breaks: Array<{ start: number; end: number }>): number => {
  let cursor = start;
  for (const window of breaks) {
    if (cursor < window.end && cursor + duration > window.start) cursor = window.end;
  }
  return cursor;
};

export type LaneRepairConflict = Pick<HardConstraintViolationDetail,
  "code" | "resourceId" | "spaceId" | "start" | "end" | "taskIds"> & { conflictKind?: PipelineConflictKind };

export type LaneRepairContext = {
  input: EngineV3Input;
  baseline: EngineOutput;
  extendedWindowMinutes?: number;
};

export type TaskSlackAnalysis = {
  taskId: number;
  taskName: string;
  talentName: string;
  earliestStart: string;
  latestEnd: string;
  slackBeforeMinutes: number;
  slackAfterMinutes: number;
  canShiftEarlier: boolean;
  canShiftLater: boolean;
  blockingReason?: string;
};

export type LaneRepairResult = {
  output: EngineOutput | null;
  reason: string;
  strategy: string;
  movedTaskIds: number[];
  movedTalentNames: string[];
  before: Array<{ taskId: number; start: string; end: string }>;
  after: Array<{ taskId: number; start: string; end: string }>;
  slackAnalysis: TaskSlackAnalysis[];
};

type LaneRow = { task: TaskInput; planned: Planned; start: number; end: number; duration: number };


type TaskSlackSchedule = EngineOutput | { plannedTasks: EngineOutput["plannedTasks"] };

/** Conservative movable window derived from hard bounds, direct dependencies and occupied local lanes. */
export const computeTaskSlack = (
  task: TaskInput,
  schedule: TaskSlackSchedule,
  dependencies: TaskInput[],
  constraints: EngineV3Input,
): TaskSlackAnalysis => {
  const plannedById = new Map((schedule.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));
  const current = plannedById.get(Number(task.id));
  const currentStart = toMinutes(current?.startPlanned) ?? toMinutes(task.startPlanned) ?? 0;
  const currentEnd = toMinutes(current?.endPlanned) ?? toMinutes(task.endPlanned) ?? currentStart;
  const duration = Math.max(0, currentEnd - currentStart);
  const availability = task.contestantId == null ? undefined : constraints.contestantAvailabilityById?.[Number(task.contestantId)];
  let earliestStart = Math.max(toMinutes(constraints.workDay.start) ?? 0, toMinutes(availability?.start) ?? 0);
  let latestEnd = Math.min(toMinutes(constraints.workDay.end) ?? 24 * 60, toMinutes(availability?.end) ?? 24 * 60);
  const predecessorEnds = dependencyIds(task).map((id) => toMinutes(plannedById.get(id)?.endPlanned)).filter((value): value is number => value !== null);
  if (predecessorEnds.length > 0) earliestStart = Math.max(earliestStart, ...predecessorEnds);
  const successors = dependencies.filter((candidate) => dependencyIds(candidate).includes(Number(task.id)));
  const successorStarts = successors.map((candidate) => toMinutes(plannedById.get(Number(candidate.id))?.startPlanned)).filter((value): value is number => value !== null);
  if (successorStarts.length > 0) latestEnd = Math.min(latestEnd, ...successorStarts);
  if (task.fixedWindowStart) earliestStart = Math.max(earliestStart, toMinutes(task.fixedWindowStart) ?? earliestStart);
  if (task.fixedWindowEnd) latestEnd = Math.min(latestEnd, toMinutes(task.fixedWindowEnd) ?? latestEnd);

  const assignedResources = new Set((current?.assignedResources ?? task.assignedResourceIds ?? []).map(Number));
  for (const other of constraints.tasks) {
    if (Number(other.id) === Number(task.id)) continue;
    const otherPlanned = plannedById.get(Number(other.id));
    const otherStart = toMinutes(otherPlanned?.startPlanned);
    const otherEnd = toMinutes(otherPlanned?.endPlanned);
    if (otherStart === null || otherEnd === null) continue;
    const sameTalent = task.contestantId != null && Number(other.contestantId) === Number(task.contestantId);
    const sameExclusiveSpace = task.spaceId != null && Number(other.spaceId) === Number(task.spaceId)
      && Number(constraints.spaceCapacityById?.[Number(task.spaceId)] ?? constraints.spaceConcurrencyById?.[Number(task.spaceId)] ?? 1) === 1;
    const otherResources = new Set((otherPlanned?.assignedResources ?? other.assignedResourceIds ?? []).map(Number));
    const sameResource = [...assignedResources].some((resourceId) => otherResources.has(resourceId));
    if (!sameTalent && !sameExclusiveSpace && !sameResource) continue;
    if (otherEnd <= currentStart) earliestStart = Math.max(earliestStart, otherEnd);
    if (otherStart >= currentEnd) latestEnd = Math.min(latestEnd, otherStart);
  }

  const fixedReason = fixedReasonForTask(constraints, Number(task.id));
  const protectedReason = fixedReason
    ?? (isTransportTask(constraints, task) ? "transport_fixed" : undefined)
    ?? (isMainStageTask(constraints, task) ? "main_stage_continuity" : undefined);
  if (protectedReason) {
    earliestStart = currentStart;
    latestEnd = currentEnd;
  }
  const slackBeforeMinutes = Math.max(0, currentStart - earliestStart);
  const slackAfterMinutes = Math.max(0, latestEnd - currentEnd);
  const inferredBlocker = protectedReason
    ?? (slackAfterMinutes === 0 && successorStarts.length > 0 ? "successor_dependency" : undefined)
    ?? (slackBeforeMinutes === 0 && predecessorEnds.length > 0 ? "predecessor_dependency" : undefined)
    ?? (slackBeforeMinutes === 0 && slackAfterMinutes === 0 ? "no_operational_slack" : undefined);
  return {
    taskId: Number(task.id),
    taskName: taskName(constraints, Number(task.id)),
    talentName: task.contestantId ? talentLabel(constraints, Number(task.contestantId)) : "",
    earliestStart: toHHMM(earliestStart),
    latestEnd: toHHMM(latestEnd),
    slackBeforeMinutes,
    slackAfterMinutes,
    canShiftEarlier: slackBeforeMinutes > 0 && !protectedReason,
    canShiftLater: slackAfterMinutes > 0 && !protectedReason,
    ...(inferredBlocker ? { blockingReason: inferredBlocker } : {}),
  };
};

const laneSnapshot = (rows: LaneRow[]): Array<{ taskId: number; start: string; end: string }> => rows
  .map((row) => ({ taskId: Number(row.task.id), start: row.planned.startPlanned, end: row.planned.endPlanned }))
  .slice(0, 20);

const overlapsWindow = (row: LaneRow, start: number, end: number): boolean => row.start < end && start < row.end;

const rowsForLane = (input: EngineV3Input, candidate: EngineOutput, conflict: LaneRepairConflict): LaneRow[] => {
  const taskById = new Map(input.tasks.map((task) => [Number(task.id), task]));
  return candidate.plannedTasks.map((planned) => {
    const task = taskById.get(Number(planned.taskId));
    const start = toMinutes(planned.startPlanned);
    const end = toMinutes(planned.endPlanned);
    if (!task || start === null || end === null || end <= start) return null;
    const sameSpace = conflict.spaceId != null && Number(task.spaceId) === Number(conflict.spaceId);
    const sameResource = conflict.resourceId != null && (planned.assignedResources ?? []).map(Number).includes(Number(conflict.resourceId));
    return sameSpace || sameResource ? { task, planned, start, end, duration: end - start } : null;
  }).filter((row): row is LaneRow => row !== null);
};

const mainStageDistance = (input: EngineV3Input, candidate: EngineOutput, task: TaskInput, start: number): number => {
  const talentId = Number(task.contestantId ?? NaN);
  if (!Number.isFinite(talentId)) return Number.MAX_SAFE_INTEGER;
  const taskById = new Map(input.tasks.map((item) => [Number(item.id), item]));
  const starts = candidate.plannedTasks.filter((planned) => {
    const item = taskById.get(Number(planned.taskId));
    return item && Number(item.contestantId) === talentId && isMainStageTask(input, item);
  }).map((planned) => toMinutes(planned.startPlanned)).filter((value): value is number => value !== null);
  return starts.length > 0 ? Math.min(...starts.map((mainStart) => Math.abs(mainStart - start))) : Number.MAX_SAFE_INTEGER;
};

const stableDependencyOrder = (input: EngineV3Input, candidate: EngineOutput, rows: LaneRow[]): LaneRow[] => {
  const byId = new Map(rows.map((row) => [Number(row.task.id), row]));
  const remaining = new Set(byId.keys());
  const ordered: LaneRow[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => dependencyIds(byId.get(id)!.task).every((dependencyId) => !remaining.has(dependencyId)));
    const pool = ready.length > 0 ? ready : [...remaining];
    pool.sort((leftId, rightId) => {
      const left = byId.get(leftId)!;
      const right = byId.get(rightId)!;
      return left.start - right.start
        || mainStageDistance(input, candidate, left.task, left.start) - mainStageDistance(input, candidate, right.task, right.start)
        || leftId - rightId;
    });
    const selected = pool[0];
    ordered.push(byId.get(selected)!);
    remaining.delete(selected);
  }
  return ordered;
};

const firstAvailableStart = (
  preferredStart: number,
  duration: number,
  blockers: Array<{ start: number; end: number }>,
  workEnd: number,
): number | null => {
  let cursor = preferredStart;
  for (let guard = 0; guard <= blockers.length; guard += 1) {
    const blocker = blockers.find((window) => cursor < window.end && cursor + duration > window.start);
    if (!blocker) return cursor + duration <= workEnd ? cursor : null;
    cursor = blocker.end;
  }
  return null;
};

/** Repairs only the conflicting capacity lane and at most its direct movable dependants. */
export const repairExclusiveLaneSequentially = (
  candidate: EngineOutput,
  conflict: LaneRepairConflict,
  context: LaneRepairContext,
): LaneRepairResult => {
  const { input, baseline } = context;
  const strategy = "slack_aware_lane_queue";
  const empty = (reason: string): LaneRepairResult => ({ output: null, reason, strategy, movedTaskIds: [], movedTalentNames: [], before: [], after: [], slackAnalysis: [] });
  const capacity = conflict.spaceId != null
    ? Number(input.spaceCapacityById?.[Number(conflict.spaceId)] ?? input.spaceConcurrencyById?.[Number(conflict.spaceId)] ?? 1)
    : conflict.resourceId != null ? 1 : Number.NaN;
  if (!Number.isFinite(capacity) || capacity !== 1) return empty("lane_not_exclusive");

  const allRows = rowsForLane(input, candidate, conflict);
  const conflictStart = toMinutes(conflict.start) ?? Math.min(...allRows.map((row) => row.start));
  const conflictEnd = toMinutes(conflict.end) ?? Math.max(...allRows.map((row) => row.end));
  if (!allRows.length || !Number.isFinite(conflictStart) || !Number.isFinite(conflictEnd)) return empty("lane_capacity_unschedulable");

  const extension = context.extendedWindowMinutes ?? 60;
  const explicitConflictIds = new Set((conflict.taskIds ?? []).map(Number));
  const localRows = allRows.filter((row) => explicitConflictIds.has(Number(row.task.id))
    || overlapsWindow(row, conflictStart - extension, conflictEnd + extension));
  const movableRows = localRows.filter((row) => isRepairMovableTask(input, Number(row.task.id)));
  const before = laneSnapshot(localRows);
  const slackAnalysis = localRows.map((row) => computeTaskSlack(row.task, candidate, input.tasks, input)).slice(0, 6);
  const failure = (reason: string, movedTaskIds: number[] = [], after = before): LaneRepairResult => ({
    output: null,
    reason,
    strategy,
    movedTaskIds: movedTaskIds.slice(0, 20),
    movedTalentNames: [...new Set(movedTaskIds.map((taskId) => input.tasks.find((task) => Number(task.id) === taskId))
      .map((task) => task?.contestantId ? talentLabel(input, Number(task.contestantId)) : null)
      .filter((name): name is string => Boolean(name)))].slice(0, 10),
    before,
    after,
    slackAnalysis,
  });
  if (movableRows.length === 0) {
    return failure(localRows.some((row) => Boolean(explicitLockForTask(input, Number(row.task.id))))
      ? "explicit_lock_blocks_lane" : "segment_has_fixed_blocker");
  }

  const protectedRows = allRows.filter((row) => !isRepairMovableTask(input, Number(row.task.id)));
  const breakWindows = conflict.spaceId == null ? [] : protectedBreakWindows(input, Number(conflict.spaceId));
  const blockers = [...breakWindows, ...protectedRows.map((row) => ({ start: row.start, end: row.end }))]
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const workStart = toMinutes(input.workDay.start) ?? 0;
  const workEnd = toMinutes(input.workDay.end) ?? 24 * 60;
  const ordered = stableDependencyOrder(input, candidate, movableRows);
  const reorderRows = ordered.slice(0, Math.min(4, ordered.length));
  const permutations: LaneRow[][] = [ordered];
  const permute = (prefix: LaneRow[], rest: LaneRow[]) => {
    if (permutations.length >= 13) return;
    if (rest.length === 0) {
      if (prefix.some((row, index) => row !== reorderRows[index])) permutations.push([...prefix, ...ordered.slice(reorderRows.length)]);
      return;
    }
    for (let index = 0; index < rest.length && permutations.length < 13; index += 1) {
      permute([...prefix, rest[index]], [...rest.slice(0, index), ...rest.slice(index + 1)]);
    }
  };
  if (reorderRows.length >= 2) permute([], reorderRows);

  let bestFailedMoved: number[] = [];
  let bestFailedAfter = before;
  let dependencyFailure = "";
  for (let orderIndex = 0; orderIndex < permutations.length && orderIndex < 13; orderIndex += 1) {
    const plannedById = clonePlannedMap(candidate);
    const movedIds = new Set<number>();
    let cursor = Math.max(workStart, Math.min(...movableRows.map((row) => row.start)));
    let splitAroundBreak = false;
    let failed = false;
    let attempts = 0;
    for (const [rowIndex, row] of permutations[orderIndex].entries()) {
      if (attempts++ >= MAX_REPAIR_ATTEMPTS_PER_CANDIDATE) { failed = true; break; }
      const slack = computeTaskSlack(row.task, { plannedTasks: [...plannedById.values()] }, input.tasks, input);
      const earliest = toMinutes(slack.earliestStart) ?? workStart;
      const directSuccessors = input.tasks.filter((task) => dependencyIds(task).includes(Number(row.task.id)));
      const fixedSuccessorStarts = directSuccessors.filter((task) => !isRepairMovableTask(input, Number(task.id)))
        .map((task) => toMinutes(plannedById.get(Number(task.id))?.startPlanned))
        .filter((value): value is number => value !== null);
      const availabilityEnd = row.task.contestantId == null
        ? workEnd
        : toMinutes(input.contestantAvailabilityById?.[Number(row.task.contestantId)]?.end) ?? workEnd;
      const latestEnd = fixedSuccessorStarts.length > 0 ? Math.min(workEnd, availabilityEnd, ...fixedSuccessorStarts) : Math.min(workEnd, availabilityEnd);
      const latestStart = latestEnd - row.duration;
      const predecessorEnds = dependencyIds(row.task).map((dependencyId) => toMinutes(plannedById.get(dependencyId)?.endPlanned))
        .filter((value): value is number => value !== null);
      const preferred = rowIndex === 0 ? row.start : Math.max(row.start, cursor);
      const desired = Math.max(earliest, cursor, predecessorEnds.length > 0 ? Math.max(...predecessorEnds) : workStart, preferred);
      const nextStart = firstAvailableStart(desired, row.duration, blockers, Math.min(workEnd, latestStart + row.duration));
      if (nextStart === null || nextStart > latestStart) {
        if (directSuccessors.some((task) => !isRepairMovableTask(input, Number(task.id)))) {
          dependencyFailure = directSuccessors.some((task) => isMainStageTask(input, task))
            ? "dependency_would_break_main_stage" : "dependency_fixed";
        }
        failed = true;
        break;
      }
      if (breakWindows.some((window) => desired < window.end && desired + row.duration > window.start && nextStart >= window.end)) splitAroundBreak = true;
      updatePlanned(plannedById, Number(row.task.id), nextStart);
      if (nextStart !== row.start) movedIds.add(Number(row.task.id));
      cursor = nextStart + row.duration;
    }

    let dependencyShiftCount = 0;
    const shiftDependants = (sourceId: number, depth: number): boolean => {
      if (depth > 2) return false;
      const sourceEnd = toMinutes(plannedById.get(sourceId)?.endPlanned);
      if (sourceEnd === null) return true;
      for (const dependant of input.tasks.filter((task) => dependencyIds(task).includes(sourceId))) {
        const dependantId = Number(dependant.id);
        const planned = plannedById.get(dependantId);
        const start = toMinutes(planned?.startPlanned);
        const end = toMinutes(planned?.endPlanned);
        if (!planned || start === null || end === null || start >= sourceEnd) continue;
        if (isMainStageTask(input, dependant)) { dependencyFailure = "dependency_would_break_main_stage"; return false; }
        if (!isRepairMovableTask(input, dependantId)) { dependencyFailure = "dependency_fixed"; return false; }
        const dependantSuccessorStarts = input.tasks.filter((task) => dependencyIds(task).includes(dependantId) && !isRepairMovableTask(input, Number(task.id)))
          .map((task) => toMinutes(plannedById.get(Number(task.id))?.startPlanned))
          .filter((value): value is number => value !== null);
        const availabilityEnd = dependant.contestantId == null
          ? workEnd
          : toMinutes(input.contestantAvailabilityById?.[Number(dependant.contestantId)]?.end) ?? workEnd;
        const latestEnd = dependantSuccessorStarts.length > 0 ? Math.min(workEnd, availabilityEnd, ...dependantSuccessorStarts) : Math.min(workEnd, availabilityEnd);
        const latestStart = latestEnd - (end - start);
        const shifted = firstAvailableStart(sourceEnd, end - start, [], Math.min(workEnd, latestStart + end - start));
        if (shifted === null || shifted > latestStart) { dependencyFailure = "dependency_shift_no_slack"; return false; }
        if (dependencyShiftCount >= 3) { dependencyFailure = "dependency_shift_no_slack"; return false; }
        updatePlanned(plannedById, dependantId, shifted);
        movedIds.add(dependantId);
        dependencyShiftCount += 1;
        if (!shiftDependants(dependantId, depth + 1)) return false;
      }
      return true;
    };
    if (!failed) {
      for (const movedId of [...movedIds]) {
        if (!shiftDependants(movedId, 1)) { failed = true; break; }
      }
    }
    const afterRows = localRows.map((row) => {
      const planned = plannedById.get(Number(row.task.id)) ?? row.planned;
      return { ...row, planned, start: toMinutes(planned.startPlanned) ?? row.start, end: toMinutes(planned.endPlanned) ?? row.end };
    });
    const after = laneSnapshot(afterRows);
    if (movedIds.size > bestFailedMoved.length) { bestFailedMoved = [...movedIds]; bestFailedAfter = after; }
    if (failed || movedIds.size === 0) continue;
    const output = outputWithPlannedMap(candidate, plannedById);
    if (!protectedTasksUnchanged(input, baseline, output)) return failure("explicit_lock_blocks_lane", [...movedIds], after);
    const candidateValidation = validateHardConstraints(input, output, MAX_CONFLICT_DIAGNOSTICS);
    if (!candidateValidation.hardValidationPassed) {
      if (candidateValidation.hardConstraintViolationCodes.includes("DEPENDENCY_VIOLATION")) {
        dependencyFailure = dependencyFailure || "dependency_shift_no_slack";
      }
      continue;
    }
    const movedTaskIds = [...movedIds].slice(0, 20);
    const movedTalentNames = [...new Set(movedTaskIds.map((taskId) => input.tasks.find((task) => Number(task.id) === taskId))
      .map((task) => task?.contestantId ? talentLabel(input, Number(task.contestantId)) : null)
      .filter((name): name is string => Boolean(name)))].slice(0, 10);
    const reason = orderIndex > 0 ? "lane_micro_reorder_success"
      : splitAroundBreak ? "break_aware_lane_repair_success"
        : dependencyShiftCount > 0 ? "dependency_shift_success" : "lane_sequentialized";
    return { output, reason, strategy, movedTaskIds, movedTalentNames, before, after, slackAnalysis };
  }
  return failure(dependencyFailure || (permutations.length > 1 ? "lane_micro_reorder_no_valid_order" : breakWindows.length > 0 ? "no_slack_for_lane_queue" : "no_slack_for_lane_queue"), bestFailedMoved, bestFailedAfter);
};

/** Backwards-compatible space-only wrapper. */
export const repairExclusiveSpaceLane = (
  input: EngineV3Input,
  baseline: EngineOutput,
  candidate: EngineOutput,
  spaceId: number,
): { output: EngineOutput | null; reason: string; movedTaskIds: number[] } => {
  const rows = rowsForLane(input, candidate, { code: "SPACE_OVERLAP", spaceId, taskIds: [] });
  const result = repairExclusiveLaneSequentially(candidate, {
    code: "SPACE_OVERLAP",
    spaceId,
    taskIds: rows.map((row) => Number(row.task.id)),
    start: rows.length > 0 ? toHHMM(Math.min(...rows.map((row) => row.start))) : undefined,
    end: rows.length > 0 ? toHHMM(Math.max(...rows.map((row) => row.end))) : undefined,
    conflictKind: "exclusive_lane_capacity",
  }, { input, baseline, extendedWindowMinutes: 0 });
  return { output: result.output, reason: result.reason, movedTaskIds: result.movedTaskIds };
};

const compactConflictDetail = (
  input: EngineV3Input,
  candidateName: string,
  violation: HardConstraintViolationDetail,
  repairAttempted: boolean,
  repairStrategy: string,
  repairResult: string,
  candidate?: EngineOutput,
  baseline?: EngineOutput,
  laneRepair?: LaneRepairResult,
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
  const tasks = taskIds.map((taskId) => input.tasks.find((task) => Number(task.id) === taskId)).filter((task): task is TaskInput => Boolean(task));
  const isBreakBlocker = tasks.some((task) => isBreakTask(input, task));
  const isExplicitLock = taskIds.some((taskId) => Boolean(explicitLockForTask(input, taskId)));
  const isDoneOrInProgress = tasks.some((task) => ["done", "in_progress"].includes(String(task.status).toLowerCase()));
  const fixedReasons = lockedOrExecutedTaskIds.map((taskId) => fixedReasonForTask(input, taskId)).filter((value): value is string => Boolean(value));
  const isImplicitFixed = lockedOrExecutedTaskIds.length > 0 && fixedReasons.length === 0;
  const alternativeLaneSpaceIds = violation.spaceId == null ? [] : [...new Set(tasks.flatMap((task) => findAlternativeSpaceLane(task, violation, input).spaceIds))];
  const conflictKind: PipelineConflictKind = violation.code === "DEPENDENCY_VIOLATION"
    ? "dependency_chain_conflict"
    : isBreakBlocker ? "break_window_blocker"
      : violation.code === "SPACE_OVERLAP" && Number(input.spaceCapacityById?.[Number(violation.spaceId)] ?? input.spaceConcurrencyById?.[Number(violation.spaceId)] ?? 1) === 1
        ? "exclusive_lane_capacity"
        : lockedOrExecutedTaskIds.length > 0 ? "fixed_task_blocker"
          : movableTaskIds.length > 0 ? "movable_task_conflict" : "unknown";
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
    conflictKind,
    isBreakBlocker,
    isExplicitLock,
    isDoneOrInProgress,
    isImplicitFixed,
    canUseAlternativeLane: alternativeLaneSpaceIds.length > 0,
    fixedReason: fixedReasons.join(",") || undefined,
    alternativeLaneSpaceIds,
    laneRepairStrategy: laneRepair?.strategy ?? (repairStrategy.includes("sequentialize_exclusive_lane") ? "lane_only_sequential_queue" : undefined),
    laneRepairMovedTaskIds: laneRepair?.movedTaskIds.slice(0, 20) ?? [],
    laneRepairMovedTalentNames: laneRepair?.movedTalentNames.slice(0, 10) ?? [],
    laneRepairBefore: laneRepair?.before.slice(0, 20) ?? [],
    laneRepairAfter: laneRepair?.after.slice(0, 20) ?? [],
    laneRepairResult: laneRepair?.reason ?? repairResult,
    slackAnalysis: laneRepair?.slackAnalysis.slice(0, 6) ?? [],
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

type SegmentRepairStrategy = "move_whole_segment_by_offset" | "reanchor_around_main_stage" | "pairwise_talent_swap" | "segment_micro_cascade" | "sequentialize_exclusive_lane" | "skip_break_window";
type RepairResult = {
  output: EngineOutput | null;
  attempts: number;
  result: string;
  strategiesTried: SegmentRepairStrategy[];
  movedTalentNames: string[];
  rejectedReasons: string[];
  laneRepair?: LaneRepairResult;
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
  const initialValidation = validateHardConstraints(input, candidate, MAX_CONFLICT_DIAGNOSTICS);
  const laneConflicts = initialValidation.hardConstraintViolationDetails.filter((detail) => (
    (detail.code === "SPACE_OVERLAP" && detail.spaceId != null) || (detail.code === "RESOURCE_OVERLAP" && detail.resourceId != null)
  ));
  for (const conflict of laneConflicts) {
    const lane = repairExclusiveLaneSequentially(candidate, {
      ...conflict,
      conflictKind: conflict.code === "SPACE_OVERLAP" ? "exclusive_lane_capacity" : "movable_task_conflict",
    }, { input, baseline });
    strategiesTried.push("sequentialize_exclusive_lane" as SegmentRepairStrategy);
    attempts += 1;
    if (lane.output) {
      const laneValidation = validateHardConstraints(input, lane.output, MAX_CONFLICT_DIAGNOSTICS);
      if (laneValidation.hardValidationPassed && isCandidateStructurallySafe(input, baselineScore, lane.output)
        && protectedTasksUnchanged(input, baseline, lane.output)) {
        return {
          output: lane.output, attempts, result: lane.reason, strategiesTried,
          movedTalentNames: lane.movedTalentNames, rejectedReasons: [], laneRepair: lane,
        };
      }
      rejectedReasons.add(laneValidation.hardConstraintViolationCodes.includes("DEPENDENCY_VIOLATION")
        ? "lane_repair_dependency_blocked" : "lane_candidate_failed_hard_validation");
    } else {
      rejectedReasons.add(lane.reason);
    }
  }
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
      const conflictTasks = conflict.taskIds.map(Number);
      if (conflictTasks.length > 0 && conflictTasks.every((taskId) => !isRepairMovableTask(input, taskId))) {
        rejectedReasons.add("segment_has_fixed_blocker");
      }

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
    result: rejectedReasons.has("explicit_lock_blocks_lane") ? "explicit_lock_blocks_lane"
      : rejectedReasons.has("lane_repair_dependency_blocked") ? "lane_repair_dependency_blocked"
        : rejectedReasons.has("break_window_blocks_lane_queue") ? "break_window_blocks_lane_queue"
          : rejectedReasons.has("no_slack_for_lane_queue") ? "no_slack_for_lane_queue"
            : rejectedReasons.has("segment_has_fixed_blocker") ? "segment_has_fixed_blocker" : "repair_attempted_but_no_valid_candidate",
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
  laneRepairAttempted: false,
  laneRepairCandidatesGenerated: 0,
  laneRepairAccepted: false,
  laneRepairReason: "not_attempted",
  laneRepairRejectedReasons: [],
  laneOnlyRepairAttempted: false,
  laneOnlyRepairCandidatesGenerated: 0,
  laneOnlyRepairAccepted: false,
  laneOnlyRepairReason: "not_attempted",
  laneOnlyRepairRejectedReasons: [],
  laneOnlyRepairMovedTaskIds: [],
  laneOnlyRepairMovedTalentNames: [],
  alternativeLaneAttempted: false,
  alternativeLaneCandidatesGenerated: 0,
  alternativeLaneAccepted: false,
  alternativeLaneRejectedReasons: [],
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
    let repairStrategiesUsed: SegmentRepairStrategy[] = [];
    let laneRepairUsed: LaneRepairResult | undefined;
    if (!validation.hardValidationPassed) {
      const repairableConflicts = validation.hardConstraintViolationDetails
        .filter((detail) => detail.code === "RESOURCE_OVERLAP" || detail.code === "SPACE_OVERLAP" || detail.code === "DEPENDENCY_VIOLATION");
      if (repairableConflicts.length > 0) {
        report.repairAttempted = true;
        report.segmentRepairAttempted = true;
        const laneConflicts = repairableConflicts.filter((detail) => detail.code === "SPACE_OVERLAP" && detail.spaceId != null);
        if (laneConflicts.length > 0) {
          report.laneRepairAttempted = true;
          report.laneOnlyRepairAttempted = true;
          report.alternativeLaneAttempted = true;
          const alternatives = laneConflicts.flatMap((detail) => detail.taskIds.flatMap((taskId) => {
            const task = input.tasks.find((item) => Number(item.id) === Number(taskId));
            return task ? findAlternativeSpaceLane(task, detail, input).spaceIds : [];
          }));
          if (alternatives.length === 0 && !report.alternativeLaneRejectedReasons.includes("alternative_lane_unavailable_missing_config")) {
            report.alternativeLaneRejectedReasons.push("alternative_lane_unavailable_missing_config");
          }
        }
        const hasMovableBlocker = repairableConflicts.some((detail) => detail.taskIds.some((taskId) => isRepairMovableTask(input, Number(taskId))));
        const repair = attemptPipelineRepair(input, baseline, output, baselineScore);
        repairStrategiesUsed = repair.strategiesTried;
        laneRepairUsed = repair.laneRepair;
        report.segmentRepairStrategiesTried = [...new Set([...report.segmentRepairStrategiesTried, ...repair.strategiesTried])];
        report.segmentRepairMovedTalentNames = [...new Set([...report.segmentRepairMovedTalentNames, ...repair.movedTalentNames])].slice(0, MAX_TALENT_DIAGNOSTICS);
        report.segmentRepairRejectedReasons = [...new Set([
          ...report.segmentRepairRejectedReasons,
          ...repair.rejectedReasons,
          ...(repair.output ? [] : [repair.result]),
        ])].slice(0, 10);
        for (const conflict of repairableConflicts) {
          addConflictDetail(report, compactConflictDetail(input, variant.kind, conflict, true, repair.strategiesTried.join(","), repair.output
            ? repair.result
            : hasMovableBlocker ? repair.result : "repair_blocked_by_locked_or_executed", output, baseline, repair.laneRepair));
        }
        if (repair.output) {
          output = repair.output;
          validation = validateHardConstraints(input, output, MAX_CONFLICT_DIAGNOSTICS);
          repaired = validation.hardValidationPassed;
          if (repaired) {
            report.repairCandidatesGenerated += 1;
            report.segmentRepairCandidatesGenerated += 1;
            if (repair.strategiesTried.includes("sequentialize_exclusive_lane") && repair.laneRepair) {
              report.laneRepairCandidatesGenerated += 1;
              report.laneRepairReason = repair.result;
              report.laneOnlyRepairCandidatesGenerated += 1;
              report.laneOnlyRepairReason = repair.result;
              report.laneOnlyRepairMovedTaskIds = [...new Set([
                ...report.laneOnlyRepairMovedTaskIds, ...repair.laneRepair.movedTaskIds,
              ])].slice(0, 20);
              report.laneOnlyRepairMovedTalentNames = [...new Set([
                ...report.laneOnlyRepairMovedTalentNames, ...repair.laneRepair.movedTalentNames,
              ])].slice(0, 10);
            }
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
          if (report.laneRepairAttempted) {
            report.laneRepairReason = repair.result;
            report.laneRepairRejectedReasons = [...new Set([...report.laneRepairRejectedReasons, ...repair.rejectedReasons, repair.result])].slice(0, 10);
            report.laneOnlyRepairReason = repair.result;
            report.laneOnlyRepairRejectedReasons = [...new Set([
              ...report.laneOnlyRepairRejectedReasons, ...repair.rejectedReasons, repair.result,
            ])].slice(0, 10);
          }
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
      segmentRepairStrategies: repaired ? [...repairStrategiesUsed] : [],
      movedTalentNames: repaired ? [...report.segmentRepairMovedTalentNames] : [],
      laneOnlyRepaired: repaired && Boolean(laneRepairUsed),
      laneRepairMovedTaskIds: repaired ? laneRepairUsed?.movedTaskIds.slice(0, 20) ?? [] : [],
      laneRepairMovedTalentNames: repaired ? laneRepairUsed?.movedTalentNames.slice(0, 10) ?? [] : [],
    });
  }

  report.candidatesGenerated = candidates.length;
  report.repairAccepted = candidates.some((candidate) => candidate.repaired);
  report.segmentRepairAccepted = candidates.some((candidate) => candidate.segmentRepaired);
  report.laneRepairAccepted = candidates.some((candidate) => candidate.laneOnlyRepaired);
  report.laneOnlyRepairAccepted = report.laneRepairAccepted;
  if (report.laneRepairAccepted) {
    report.laneRepairReason = "lane_repair_candidate_generated";
    report.laneOnlyRepairReason = "lane_repair_candidate_generated";
  } else if (!report.laneRepairAttempted) {
    report.laneRepairReason = "not_needed";
    report.laneOnlyRepairReason = "not_needed";
  }
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
