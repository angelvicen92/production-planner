import type { EngineOutput, TaskInput } from "../types";
import { getCoachResourceIds } from "./coachDetection";
import { validateHardConstraints, type HardConstraintViolationCode } from "./hardValidation";
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
  | "locked_or_executed_task";

export type PipelineFeederOutcome = "feeder_relocated" | "feeder_kept_stable" | "feeder_blocked";

export interface PipelineBuilderCandidate {
  kind: PipelineCandidateKind;
  coachOrder: number[];
  talentOrder: number[];
  output: EngineOutput;
  movedTaskIds: number[];
  stableTaskIds: number[];
  feederOutcomes: PipelineFeederOutcome[];
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
}

type Planned = EngineOutput["plannedTasks"][number];
type MainRow = { task: TaskInput; planned: Planned; start: number; end: number; talentId: number };
type MainGroup = { talentId: number; tasks: MainRow[] };

const MAX_TALENT_DIAGNOSTICS = 20;
const MAX_TASK_DIAGNOSTICS = 50;
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
  if (status === "done" || status === "in_progress" || Boolean((task as any)?.isManualBlock)) return true;
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
    const output: EngineOutput = {
      ...baseline,
      plannedTasks: (baseline.plannedTasks ?? []).map((planned) => plannedById.get(Number(planned.taskId)) ?? planned),
    };
    const validation = validateHardConstraints(input, output);
    const score = scoreCandidateSolution(input, output);
    if (!validation.hardValidationPassed) {
      addRejected(report, "candidate_failed_hard_validation");
      addRejected(report, rejectionForCodes(validation.hardConstraintViolationCodes));
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
    candidates.push({
      kind: variant.kind,
      coachOrder: variant.order.map((talentId) => coachByTalent.get(talentId)).filter((id): id is number => id !== undefined)
        .filter((id, index, all) => all.indexOf(id) === index),
      talentOrder: variant.order,
      output,
      movedTaskIds: movement.moved,
      stableTaskIds: movement.stable,
      feederOutcomes,
    });
  }

  report.candidatesGenerated = candidates.length;
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
