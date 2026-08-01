import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { anchoredTaskIds } from "./anchoredAccompaniment";
import {
  constructExactMainAndFeederCore,
  type ExactMainAndFeederCoreStatus,
} from "./exactMainAndFeederCore";
import { fingerprint } from "./fingerprint";
import { canPlaceTask } from "./placement";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { validatePlan } from "./validate";

export type ExactItinerantPlanStatus =
  | "COMPLETE"
  | "CORE_FAILED"
  | "UNSUPPORTED_STANDALONE_SHAPE"
  | "INFEASIBLE"
  | "BRANCH_BUDGET_EXHAUSTED";

export interface ExactItinerantPlanEvidence {
  branchesExplored: number;
  coreBranches: number;
  standaloneBranches: number;
  standaloneStartChecks: number;
  standaloneTaskSelections: number;
  standaloneZeroAlternativePrunes: number;
  standaloneBacktracks: number;
  standaloneMaximumDepth: number;
  standaloneCompleteLeafCount: number;
  selectedStandaloneTaskIds: string[];
  selectedStandaloneStarts: Record<string, number>;
  coreFingerprint: string | null;
  fullFingerprint: string | null;
  remainingTaskIds: string[];
  coreStatus: ExactMainAndFeederCoreStatus;
  coreReasonCodes: string[];
  reasonCodes: string[];
}

export interface ExactItinerantPlanResult {
  status: ExactItinerantPlanStatus;
  complete: boolean;
  scheduledTasks: ScheduledTask[];
  scheduledSpaceMeals: ScheduledSpaceMeal[];
  remainingTaskIds: string[];
  evidence: ExactItinerantPlanEvidence;
}

type SearchOutcome = "FOUND" | "DEAD_END" | "BUDGET_EXHAUSTED";
interface Positions { task: Task; starts: number[]; effectiveDeadline: number }

const byId = <T extends { id: string }>(a: T, b: T): number => a.id.localeCompare(b.id);
const orderScheduled = (tasks: ScheduledTask[]): ScheduledTask[] =>
  [...tasks].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

function effectiveDeadline(problem: PlannerNextProblem, task: Task): number {
  const participant = task.kind === "technical" ? undefined : problem.participants.find(({ id }) => id === task.participantId);
  const space = problem.spaces.find(({ id }) => id === task.spaceId);
  const resources = (task.requiredResourceIds ?? []).map((id) => problem.resources.find((resource) => resource.id === id));
  const windows = [task.availability, participant?.availability, space?.availability, ...resources.map((resource) => resource?.availability)]
    .filter((value): value is Array<{ start: number; end: number }> => Array.isArray(value));
  return Math.min(problem.day.end, ...windows.flat().map(({ end }) => end));
}

function unsupportedShapeReasons(problem: PlannerNextProblem, pending: Task[], coreIds: Set<string>): string[] {
  const anchoredIds = anchoredTaskIds(problem);
  const reasons: string[] = [];
  for (const task of [...pending].sort(byId)) {
    if (task.kind !== "auxiliary") reasons.push(`UNSUPPORTED_STANDALONE_TASK_KIND:${task.id}`);
    if (anchoredIds.has(task.id)) reasons.push(`UNSUPPORTED_PENDING_ANCHORED_TASK:${task.id}`);
    if (task.setupFamilyId !== undefined) reasons.push(`UNSUPPORTED_STANDALONE_SETUP:${task.id}`);
    if (task.jointGroupId !== undefined) reasons.push(`UNSUPPORTED_STANDALONE_JOINT_GROUP:${task.id}`);
    if (problem.spaces.find(({ id }) => id === task.spaceId)?.secondaryContinuity === "REQUIRED")
      reasons.push(`UNSUPPORTED_STANDALONE_REQUIRED_BLOCK:${task.id}`);
    if (problem.spaces.find(({ id }) => id === task.spaceId)?.mealPolicy !== undefined)
      reasons.push(`UNSUPPORTED_STANDALONE_SECONDARY_MEAL:${task.id}`);
    if (task.dependencies.some((id) => !coreIds.has(id))) reasons.push(`UNSUPPORTED_STANDALONE_DEPENDENCY:${task.id}`);
  }
  return [...new Set(reasons)].sort();
}

/** Constructs the accepted exact core, then atomically extends it with standalone itinerant tasks. */
export function constructExactItinerantPlan(problem: PlannerNextProblem): ExactItinerantPlanResult {
  const core = constructExactMainAndFeederCore(problem);
  const evidence: ExactItinerantPlanEvidence = {
    branchesExplored: core.evidence.branchesExplored,
    coreBranches: core.evidence.branchesExplored,
    standaloneBranches: 0,
    standaloneStartChecks: 0,
    standaloneTaskSelections: 0,
    standaloneZeroAlternativePrunes: 0,
    standaloneBacktracks: 0,
    standaloneMaximumDepth: 0,
    standaloneCompleteLeafCount: 0,
    selectedStandaloneTaskIds: [],
    selectedStandaloneStarts: {},
    coreFingerprint: core.evidence.coreFingerprint,
    fullFingerprint: null,
    remainingTaskIds: [...core.remainingTaskIds].sort(),
    coreStatus: core.status,
    coreReasonCodes: [...core.evidence.reasonCodes],
    reasonCodes: [],
  };
  const fail = (status: Exclude<ExactItinerantPlanStatus, "COMPLETE">, reasons: string[]): ExactItinerantPlanResult => {
    evidence.branchesExplored = evidence.coreBranches + evidence.standaloneBranches;
    evidence.reasonCodes = [...new Set(reasons)].sort();
    return { status, complete: false, scheduledTasks: [], scheduledSpaceMeals: [],
      remainingTaskIds: [...evidence.remainingTaskIds], evidence };
  };
  if (core.status !== "COMPLETE") return fail("CORE_FAILED", [`CORE_${core.status}`, ...core.evidence.reasonCodes]);

  const coreIds = new Set(core.scheduledTasks.map(({ id }) => id));
  const taskById = new Map(problem.tasks.map((task) => [task.id, task]));
  const pending = core.remainingTaskIds.map((id) => taskById.get(id)).filter((task): task is Task => task !== undefined);
  const missingIds = core.remainingTaskIds.filter((id) => !taskById.has(id)).map((id) => `MISSING_REMAINING_TASK:${id}`);
  const unsupported = [...missingIds, ...unsupportedShapeReasons(problem, pending, coreIds)].sort();
  if (unsupported.length > 0) return fail("UNSUPPORTED_STANDALONE_SHAPE", unsupported);

  const allowance = Math.max(0, problem.budget.maxBranchExpansions - evidence.coreBranches);
  let selected: ScheduledTask[] | null = null;
  const consumeBranch = (): boolean => {
    if (evidence.standaloneBranches >= allowance) return false;
    evidence.standaloneBranches += 1;
    evidence.branchesExplored = evidence.coreBranches + evidence.standaloneBranches;
    return true;
  };
  const search = (remaining: Task[], placedStandalone: ScheduledTask[], depth: number): SearchOutcome => {
    evidence.standaloneMaximumDepth = Math.max(evidence.standaloneMaximumDepth, depth);
    if (remaining.length === 0) {
      if (!consumeBranch()) return "BUDGET_EXHAUSTED";
      evidence.standaloneCompleteLeafCount += 1;
      const candidate = orderScheduled([...core.scheduledTasks, ...placedStandalone]);
      const expectedIds = [...problem.tasks].sort(byId).map(({ id }) => id);
      const actualIds = [...candidate].sort(byId).map(({ id }) => id);
      const exact = actualIds.length === expectedIds.length && actualIds.every((id, index) => id === expectedIds[index]);
      if (exact && validatePlan(problem, candidate, [], core.scheduledSpaceMeals).hardValid) {
        selected = candidate;
        return "FOUND";
      }
      return "DEAD_END";
    }

    const alternatives: Positions[] = [];
    for (const task of [...remaining].sort(byId)) {
      const starts: number[] = [];
      for (let start = problem.day.start; start + task.duration <= problem.day.end; start += 5) {
        if (!consumeBranch()) return "BUDGET_EXHAUSTED";
        evidence.standaloneStartChecks += 1;
        if (canPlaceTask(problem, task, start, [...core.scheduledTasks, ...placedStandalone], core.scheduledSpaceMeals)) starts.push(start);
      }
      if (starts.length === 0) {
        evidence.standaloneZeroAlternativePrunes += 1;
        return "DEAD_END";
      }
      alternatives.push({ task, starts, effectiveDeadline: effectiveDeadline(problem, task) });
    }
    alternatives.sort((a, b) => a.starts.length - b.starts.length
      || a.effectiveDeadline - b.effectiveDeadline
      || b.task.duration - a.task.duration
      || (b.task.requiredResourceIds?.length ?? 0) - (a.task.requiredResourceIds?.length ?? 0)
      || a.task.id.localeCompare(b.task.id));
    const choice = alternatives[0]!;
    evidence.standaloneTaskSelections += 1;
    const orderedStarts = choice.starts.map((start) => scoreAuxiliaryTask(problem, choice.task, start,
      [...core.scheduledTasks, ...placedStandalone])).sort((a, b) => a.cost - b.cost
        || a.scheduled.start - b.scheduled.start || a.scheduled.id.localeCompare(b.scheduled.id));
    for (const { scheduled } of orderedStarts) {
      const child = search(remaining.filter(({ id }) => id !== choice.task.id), [...placedStandalone, scheduled], depth + 1);
      if (child === "FOUND") return child;
      if (child === "BUDGET_EXHAUSTED") return child;
      evidence.standaloneBacktracks += 1;
    }
    return "DEAD_END";
  };

  const outcome = search(pending, [], 0);
  if (outcome === "BUDGET_EXHAUSTED") return fail("BRANCH_BUDGET_EXHAUSTED", ["STANDALONE_BRANCH_BUDGET_EXHAUSTED"]);
  if (outcome === "DEAD_END" || selected === null) return fail("INFEASIBLE", ["NO_COMPLETE_HARD_VALID_ITINERANT_PLAN"]);
  const scheduledTasks: ScheduledTask[] = selected;
  evidence.selectedStandaloneTaskIds = scheduledTasks.filter(({ id }) => !coreIds.has(id)).map(({ id }) => id);
  evidence.selectedStandaloneStarts = Object.fromEntries(scheduledTasks.filter(({ id }) => !coreIds.has(id)).map(({ id, start }) => [id, start]));
  evidence.fullFingerprint = fingerprint(scheduledTasks, [], core.scheduledSpaceMeals);
  evidence.remainingTaskIds = [];
  evidence.reasonCodes = [];
  evidence.branchesExplored = evidence.coreBranches + evidence.standaloneBranches;
  return { status: "COMPLETE", complete: true, scheduledTasks,
    scheduledSpaceMeals: [...core.scheduledSpaceMeals], remainingTaskIds: [], evidence };
}
