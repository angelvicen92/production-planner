import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { anchoredTaskIds } from "./anchoredAccompaniment";
import {
  createExactSearchLedger,
  runExactMainAndFeederSearch,
  type ExactMainAndFeederCoreStatus,
  type ExactSearchLedger,
} from "./exactMainAndFeederCore";
import { fingerprint } from "./fingerprint";
import { canPlaceTask } from "./placement";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { validatePlan } from "./validate";

export type ExactItinerantPlanStatus = "COMPLETE" | "CORE_FAILED" | "UNSUPPORTED_STANDALONE_SHAPE"
  | "INFEASIBLE" | "BRANCH_BUDGET_EXHAUSTED";

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
  coreCompleteLeavesEvaluated: number;
  coreLeavesRejectedByStandalone: number;
  standaloneSearchInvocations: number;
  standaloneBlockingTaskCounts: Record<string, number>;
  /** Canonical stable-ID list of the standalone tasks in the accepted plan, not DFS order. */
  selectedStandaloneTaskIds: string[];
  selectedStandaloneStarts: Record<string, number>;
  /** Actual dynamic DFS selection order along the accepted standalone path. */
  selectedStandaloneSelectionOrder: string[];
  coreFingerprint: string | null;
  selectedCoreFingerprint: string | null;
  defaultCoreFingerprint: string | null;
  fullFingerprint: string | null;
  remainingTaskIds: string[];
  coreStatus: ExactMainAndFeederCoreStatus;
  coreReasonCodes: string[];
  reasonCodes: string[];
  coreBacktracks: number;
  coreMaximumDepth: number;
  coreCompleteLeafCount: number;
  lastExhaustionPhase: "CORE" | "STANDALONE" | null;
}

export interface ExactItinerantPlanResult {
  status: ExactItinerantPlanStatus;
  complete: boolean;
  scheduledTasks: ScheduledTask[];
  scheduledSpaceMeals: ScheduledSpaceMeal[];
  remainingTaskIds: string[];
  evidence: ExactItinerantPlanEvidence;
}

type StandaloneOutcome = "FOUND" | "DEAD_END" | "BUDGET_EXHAUSTED";
interface Positions { task: Task; starts: number[]; effectiveDeadline: number }
interface StandaloneSearchResult { outcome: StandaloneOutcome; tasks: ScheduledTask[] | null; selectionOrder: string[] }

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
  const anchoredIds = anchoredTaskIds(problem), reasons: string[] = [];
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

function searchStandaloneForCoreCandidate(problem: PlannerNextProblem, coreTasks: ScheduledTask[], coreMeals: ScheduledSpaceMeal[],
  pending: Task[], ledger: ExactSearchLedger, evidence: ExactItinerantPlanEvidence): StandaloneSearchResult {
  evidence.standaloneSearchInvocations += 1;
  let found: ScheduledTask[] | null = null, foundOrder: string[] = [];
  const search = (remaining: Task[], placed: ScheduledTask[], depth: number, selectionOrder: string[]): StandaloneOutcome => {
    evidence.standaloneMaximumDepth = Math.max(evidence.standaloneMaximumDepth, depth);
    if (remaining.length === 0) {
      if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
      evidence.standaloneCompleteLeafCount += 1;
      const candidate = orderScheduled([...coreTasks, ...placed]);
      const expected = [...problem.tasks].sort(byId).map(({ id }) => id), actual = [...candidate].sort(byId).map(({ id }) => id);
      const exact = actual.length === expected.length && actual.every((id, index) => id === expected[index]);
      if (exact && validatePlan(problem, candidate, [], coreMeals).hardValid) {
        found = candidate; foundOrder = selectionOrder; return "FOUND";
      }
      return "DEAD_END";
    }
    const alternatives: Positions[] = [];
    for (const task of [...remaining].sort(byId)) {
      const starts: number[] = [];
      for (let start = problem.day.start; start + task.duration <= problem.day.end; start += 5) {
        if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
        evidence.standaloneStartChecks += 1;
        if (canPlaceTask(problem, task, start, [...coreTasks, ...placed], coreMeals)) starts.push(start);
      }
      if (starts.length === 0) {
        evidence.standaloneZeroAlternativePrunes += 1;
        evidence.standaloneBlockingTaskCounts[task.id] = (evidence.standaloneBlockingTaskCounts[task.id] ?? 0) + 1;
        return "DEAD_END";
      }
      alternatives.push({ task, starts, effectiveDeadline: effectiveDeadline(problem, task) });
    }
    alternatives.sort((a, b) => a.starts.length - b.starts.length || a.effectiveDeadline - b.effectiveDeadline
      || b.task.duration - a.task.duration
      || (b.task.requiredResourceIds?.length ?? 0) - (a.task.requiredResourceIds?.length ?? 0)
      || a.task.id.localeCompare(b.task.id));
    const choice = alternatives[0]!;
    evidence.standaloneTaskSelections += 1;
    const orderedStarts = choice.starts.map((start) => scoreAuxiliaryTask(problem, choice.task, start,
      [...coreTasks, ...placed])).sort((a, b) => a.cost - b.cost || a.scheduled.start - b.scheduled.start
        || a.scheduled.id.localeCompare(b.scheduled.id));
    for (const { scheduled } of orderedStarts) {
      const child = search(remaining.filter(({ id }) => id !== choice.task.id), [...placed, scheduled], depth + 1,
        [...selectionOrder, choice.task.id]);
      if (child !== "DEAD_END") return child;
      evidence.standaloneBacktracks += 1;
    }
    return "DEAD_END";
  };
  const outcome = search(pending, [], 0, []);
  return { outcome, tasks: found, selectionOrder: foundOrder };
}

/** Continues every hard-valid exact-core leaf with exact standalone DFS under one shared budget. */
export function constructExactItinerantPlan(problem: PlannerNextProblem): ExactItinerantPlanResult {
  const ledger = createExactSearchLedger(problem.budget.maxBranchExpansions);
  const evidence: ExactItinerantPlanEvidence = {
    branchesExplored: 0, coreBranches: 0, standaloneBranches: 0, standaloneStartChecks: 0,
    standaloneTaskSelections: 0, standaloneZeroAlternativePrunes: 0, standaloneBacktracks: 0,
    standaloneMaximumDepth: 0, standaloneCompleteLeafCount: 0, coreCompleteLeavesEvaluated: 0,
    coreLeavesRejectedByStandalone: 0, standaloneSearchInvocations: 0, standaloneBlockingTaskCounts: {},
    selectedStandaloneTaskIds: [], selectedStandaloneStarts: {}, selectedStandaloneSelectionOrder: [],
    coreFingerprint: null, selectedCoreFingerprint: null, defaultCoreFingerprint: null, fullFingerprint: null,
    remainingTaskIds: [], coreStatus: "INFEASIBLE", coreReasonCodes: [], reasonCodes: [], coreBacktracks: 0,
    coreMaximumDepth: 0, coreCompleteLeafCount: 0, lastExhaustionPhase: null,
  };
  let selectedTasks: ScheduledTask[] | null = null, selectedMeals: ScheduledSpaceMeal[] = [], selectedCoreIds = new Set<string>();
  let unsupported: string[] = [];
  const core = runExactMainAndFeederSearch(problem, { ledger, onHardValidCoreLeaf(candidate) {
    evidence.coreCompleteLeavesEvaluated += 1;
    const coreIds = new Set(candidate.tasks.map(({ id }) => id));
    const taskMap = new Map(problem.tasks.map((task) => [task.id, task]));
    const pending = candidate.remainingTaskIds.map((id) => taskMap.get(id)).filter((task): task is Task => task !== undefined);
    unsupported = [...candidate.remainingTaskIds.filter((id) => !taskMap.has(id)).map((id) => `MISSING_REMAINING_TASK:${id}`),
      ...unsupportedShapeReasons(problem, pending, coreIds)].sort();
    if (unsupported.length) return "BUDGET_EXHAUSTED";
    const standalone = searchStandaloneForCoreCandidate(problem, candidate.tasks, candidate.meals, pending, ledger, evidence);
    if (standalone.outcome === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
    if (standalone.outcome === "DEAD_END" || !standalone.tasks) {
      evidence.coreLeavesRejectedByStandalone += 1; return "REJECT";
    }
    selectedTasks = standalone.tasks; selectedMeals = candidate.meals; selectedCoreIds = coreIds;
    evidence.selectedCoreFingerprint = candidate.fingerprint; evidence.coreFingerprint = candidate.fingerprint;
    evidence.selectedStandaloneSelectionOrder = standalone.selectionOrder;
    return "ACCEPT";
  }});
  evidence.branchesExplored = ledger.branchesExplored; evidence.coreBranches = ledger.coreBranches;
  evidence.standaloneBranches = ledger.standaloneBranches; evidence.lastExhaustionPhase = ledger.lastExhaustionPhase;
  evidence.coreStatus = core.status; evidence.coreReasonCodes = [...core.evidence.reasonCodes];
  evidence.coreBacktracks = core.evidence.backtracks; evidence.coreMaximumDepth = core.evidence.maximumDepth;
  evidence.coreCompleteLeafCount = core.evidence.completeLeafCount;
  evidence.remainingTaskIds = [...core.remainingTaskIds].sort();
  const fail = (status: Exclude<ExactItinerantPlanStatus, "COMPLETE">, reasons: string[]): ExactItinerantPlanResult => {
    evidence.reasonCodes = [...new Set(reasons)].sort();
    return { status, complete: false, scheduledTasks: [], scheduledSpaceMeals: [],
      remainingTaskIds: [...evidence.remainingTaskIds], evidence };
  };
  if (unsupported.length) return fail("UNSUPPORTED_STANDALONE_SHAPE", unsupported);
  if (core.status === "BRANCH_BUDGET_EXHAUSTED") return fail("BRANCH_BUDGET_EXHAUSTED",
    [ledger.lastExhaustionPhase === "STANDALONE" ? "STANDALONE_BRANCH_BUDGET_EXHAUSTED" : "CORE_BRANCH_BUDGET_EXHAUSTED"]);
  if (core.status !== "COMPLETE" || selectedTasks === null) {
    if (evidence.coreCompleteLeavesEvaluated > 0) return fail("INFEASIBLE", ["NO_COMPLETE_HARD_VALID_ITINERANT_PLAN"]);
    return fail("CORE_FAILED", [`CORE_${core.status}`, ...core.evidence.reasonCodes]);
  }
  const scheduledTasks: ScheduledTask[] = selectedTasks;
  evidence.selectedStandaloneTaskIds = scheduledTasks.filter(({ id }) => !selectedCoreIds.has(id)).map(({ id }) => id).sort();
  evidence.selectedStandaloneStarts = Object.fromEntries(scheduledTasks.filter(({ id }) => !selectedCoreIds.has(id))
    .sort(byId).map(({ id, start }) => [id, start]));
  evidence.fullFingerprint = fingerprint(scheduledTasks, [], selectedMeals); evidence.remainingTaskIds = []; evidence.reasonCodes = [];
  return { status: "COMPLETE", complete: true, scheduledTasks, scheduledSpaceMeals: [...selectedMeals], remainingTaskIds: [], evidence };
}
