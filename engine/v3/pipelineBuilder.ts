import type { EngineOutput, TaskInput } from "../types";
import { getCoachResourceIds } from "./coachDetection";
import { validateHardConstraints, type HardConstraintViolationCode } from "./hardValidation";
import { toMinutes } from "./metrics";
import { scoreCandidateSolution, type CandidateSolutionScore } from "./solutionScoring";
import type { EngineV3Input } from "./types";

export type PipelineCandidateKind =
  | "pipeline_coachA_first"
  | "pipeline_coachB_first"
  | "pipeline_alternating_blocks";

export type PipelineRejectedReason =
  | "missing_main_stage_sequence"
  | "missing_talent_coach_mapping"
  | "feeder_chain_unschedulable"
  | "resource_conflict"
  | "space_conflict"
  | "availability_violation"
  | "dependency_violation"
  | "would_create_main_stage_gap"
  | "locked_or_executed_task"
  | "not_better_than_baseline";

export interface PipelineBuilderCandidate {
  kind: PipelineCandidateKind;
  coachOrder: number[];
  talentOrder: number[];
  output: EngineOutput;
}

export interface PipelineBuilderDiagnostics {
  attempted: boolean;
  candidatesGenerated: number;
  reason: string;
  rejectedReasons: PipelineRejectedReason[];
  before: Record<string, number>;
  after: Record<string, number>;
}

type Planned = EngineOutput["plannedTasks"][number];
type MainGroup = { talentId: number; tasks: Array<{ task: TaskInput; planned: Planned; start: number; end: number }> };

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

const alternatingBlocks = (first: number[], second: number[], remaining: number[][]): number[] => {
  const blockSize = Math.max(1, Math.ceil(Math.max(first.length, second.length) / 2));
  const result: number[] = [];
  for (let offset = 0; offset < Math.max(first.length, second.length); offset += blockSize) {
    result.push(...first.slice(offset, offset + blockSize), ...second.slice(offset, offset + blockSize));
  }
  return [...result, ...remaining.flat()];
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
  return "feeder_chain_unschedulable";
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

export const generatePipelineBuilderCandidates = (
  input: EngineV3Input,
  baseline: EngineOutput,
  diagnostics?: PipelineBuilderDiagnostics,
): PipelineBuilderCandidate[] => {
  const baselineScore = scoreCandidateSolution(input, baseline);
  const report = diagnostics ?? {
    attempted: false,
    candidatesGenerated: 0,
    reason: "missing_main_stage_sequence",
    rejectedReasons: [],
    before: compactMetrics(baselineScore),
    after: compactMetrics(baselineScore),
  };
  report.attempted = true;
  report.candidatesGenerated = 0;
  report.rejectedReasons = [];
  report.before = compactMetrics(baselineScore);
  report.after = compactMetrics(baselineScore);

  const mainZoneId = Number(input.optimizerMainZoneId ?? NaN);
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const plannedByIdBase = new Map((baseline.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));
  if (!Number.isFinite(mainZoneId)) {
    addRejected(report, "missing_main_stage_sequence");
    report.reason = "missing_main_stage_sequence";
    return [];
  }

  const mainRows = (baseline.plannedTasks ?? []).map((planned) => {
    const task = taskById.get(Number(planned.taskId));
    const start = toMinutes(planned.startPlanned);
    const end = toMinutes(planned.endPlanned);
    if (!task || Number(task.zoneId) !== mainZoneId || start === null || end === null || end <= start) return null;
    const talentId = Number(task.contestantId ?? NaN);
    return Number.isFinite(talentId) && talentId > 0 ? { task, planned, start, end, talentId } : null;
  }).filter((row): row is NonNullable<typeof row> => row !== null).sort((a, b) => a.start - b.start || Number(a.task.id) - Number(b.task.id));
  if (mainRows.length < 2) {
    addRejected(report, "missing_main_stage_sequence");
    report.reason = "missing_main_stage_sequence";
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
  if (coachByTalent.size !== originalTalentOrder.length) {
    addRejected(report, "missing_talent_coach_mapping");
    report.reason = "missing_talent_coach_mapping";
    return [];
  }
  const coachOrder = originalTalentOrder.map((talentId) => coachByTalent.get(talentId)!)
    .filter((coachId, index, all) => all.indexOf(coachId) === index);
  if (coachOrder.length < 2) {
    addRejected(report, "missing_talent_coach_mapping");
    report.reason = "missing_talent_coach_mapping";
    return [];
  }
  const talentsByCoach = coachOrder.map((coachId) => originalTalentOrder.filter((talentId) => coachByTalent.get(talentId) === coachId));
  const orders = uniqueOrders([
    { kind: "pipeline_coachA_first", order: talentsByCoach.flat() },
    { kind: "pipeline_coachB_first", order: [talentsByCoach[1], talentsByCoach[0], ...talentsByCoach.slice(2)].flat() },
    { kind: "pipeline_alternating_blocks", order: alternatingBlocks(talentsByCoach[0], talentsByCoach[1], talentsByCoach.slice(2)) },
  ]).slice(0, 3);

  const candidates: PipelineBuilderCandidate[] = [];
  for (const variant of orders) {
    const plannedById = new Map([...plannedByIdBase.entries()].map(([id, planned]) => [id, { ...planned }]));
    const changedTaskIds = new Set<number>();
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
        if (cursor !== row.start) changedTaskIds.add(taskId);
        cursor += row.end - row.start;
      }
      mainEndByTalent.set(talentId, cursor);
      if (blocked) break;
    }
    if (blocked) continue;

    for (const talentId of variant.order) {
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
        const start = toMinutes(planned.startPlanned)!;
        const end = toMinutes(planned.endPlanned)!;
        const newStart = feederCursor - (end - start);
        if (newStart < (toMinutes(input.workDay.start) ?? 0) || (isProtectedTask(input, taskId) && newStart !== start)) {
          addRejected(report, isProtectedTask(input, taskId) ? "locked_or_executed_task" : "feeder_chain_unschedulable");
          blocked = true;
          break;
        }
        updatePlanned(plannedById, taskId, newStart);
        if (newStart !== start) changedTaskIds.add(taskId);
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
        if (postCursor !== start) changedTaskIds.add(taskId);
        postCursor += end - start;
      }
      if (blocked) break;
    }
    if (blocked || changedTaskIds.size === 0) continue;

    const output: EngineOutput = {
      ...baseline,
      plannedTasks: (baseline.plannedTasks ?? []).map((planned) => plannedById.get(Number(planned.taskId)) ?? planned),
    };
    const validation = validateHardConstraints(input, output);
    const score = scoreCandidateSolution(input, output);
    if (!validation.hardValidationPassed) {
      addRejected(report, rejectionForCodes(validation.hardConstraintViolationCodes));
      continue;
    }
    if (score.plannedTasks !== baselineScore.plannedTasks) {
      addRejected(report, "feeder_chain_unschedulable");
      continue;
    }
    if (score.mainStageGapMinutes !== 0 || score.mainStageGapMinutes > baselineScore.mainStageGapMinutes) {
      addRejected(report, "would_create_main_stage_gap");
      continue;
    }
    candidates.push({
      kind: variant.kind,
      coachOrder: variant.order.map((talentId) => coachByTalent.get(talentId)!).filter((id, index, all) => all.indexOf(id) === index),
      talentOrder: variant.order,
      output,
    });
  }

  report.candidatesGenerated = candidates.length;
  report.reason = candidates.length > 0 ? "pipeline_candidates_generated" : report.rejectedReasons[0] ?? "feeder_chain_unschedulable";
  if (candidates.length > 0) {
    const best = candidates.map((candidate) => scoreCandidateSolution(input, candidate.output))
      .sort((a, b) => a.coachSplitDayPenalty - b.coachSplitDayPenalty
        || a.maxCoachGapMinutes - b.maxCoachGapMinutes
        || a.coachIdlePenalty - b.coachIdlePenalty
        || a.coachSpanPenalty - b.coachSpanPenalty)[0];
    report.after = compactMetrics(best);
  }
  return candidates;
};
