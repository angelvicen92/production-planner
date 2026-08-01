import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { anchoredTaskIds, materializeAnchoredOperation } from "./anchoredAccompaniment";
import { fingerprint } from "./fingerprint";
import { buildTimeline, candidateCuts, hasMainFlowMeal, orderTimelines, type MainFlowTimeline } from "./mainFlowMeal";
import { generateMainFlowPatterns } from "./mainFlowPatterns";
import { canPlaceTask } from "./placement";
import { buildRequiredCompositeBlocks, requiredCompositePositions, taskFitsRequiredCompositePosition, type RequiredCompositePosition } from "./requiredCompositeBlock";
import { preflight, validatePlan } from "./validate";

export type ExactMainAndFeederCoreStatus = "COMPLETE" | "PREFLIGHT_FAILED" | "UNSUPPORTED_CORE_SHAPE"
  | "INFEASIBLE" | "BRANCH_BUDGET_EXHAUSTED";

export interface ExactMainAndFeederCoreEvidence {
  branchesExplored: number;
  patternCandidatesExplored: number;
  timelineCandidatesExplored: number;
  mainCandidatesEvaluated: number;
  feederCandidatesEvaluated: number;
  residualMatchingChecks: number;
  residualMatchingPrunes: number;
  zeroAlternativePrunes: number;
  backtracks: number;
  maximumDepth: number;
  completeLeafCount: number;
  selectedPattern: string[] | null;
  selectedTimelineKey: string | null;
  selectedMainTaskIds: string[];
  selectedFeederTaskIds: string[];
  coreFingerprint: string | null;
  reasonCodes: string[];
}

export interface ExactMainAndFeederCoreResult {
  status: ExactMainAndFeederCoreStatus;
  complete: boolean;
  scheduledTasks: ScheduledTask[];
  scheduledSpaceMeals: ScheduledSpaceMeal[];
  remainingTaskIds: string[];
  evidence: ExactMainAndFeederCoreEvidence;
}

interface Alternative {
  task: Task;
  operation: ScheduledTask[];
  feeder: ScheduledTask;
  feederAlternativeCount: number;
  participantSlack: number;
  firstObligation: number;
}

type SearchOutcome = "FOUND" | "DEAD_END" | "BUDGET_EXHAUSTED";
type FeederStartOutcome = { status: "COMPLETE"; starts: number[] } | { status: "BUDGET_EXHAUSTED" };

const canonical = <T extends { id: string }>(values: readonly T[]): T[] => [...values].sort((a, b) => a.id.localeCompare(b.id));

function emptyEvidence(): ExactMainAndFeederCoreEvidence {
  return { branchesExplored: 0, patternCandidatesExplored: 0, timelineCandidatesExplored: 0,
    mainCandidatesEvaluated: 0, feederCandidatesEvaluated: 0, residualMatchingChecks: 0,
    residualMatchingPrunes: 0, zeroAlternativePrunes: 0, backtracks: 0, maximumDepth: 0,
    completeLeafCount: 0, selectedPattern: null, selectedTimelineKey: null,
    selectedMainTaskIds: [], selectedFeederTaskIds: [], coreFingerprint: null, reasonCodes: [] };
}

/** Constructs only the exact main-flow, direct vocal feeders and main-anchored operations. */
export function constructExactMainAndFeederCore(problem: PlannerNextProblem): ExactMainAndFeederCoreResult {
  const evidence = emptyEvidence();
  const allTaskIds = canonical(Array.isArray(problem.tasks) ? problem.tasks : []).map(({ id }) => id);
  const fail = (status: Exclude<ExactMainAndFeederCoreStatus, "COMPLETE">, reasons: string[], coreIds: Set<string> = new Set()): ExactMainAndFeederCoreResult => {
    evidence.reasonCodes = [...new Set(reasons)].sort();
    return { status, complete: false, scheduledTasks: [], scheduledSpaceMeals: [],
      remainingTaskIds: allTaskIds.filter((id) => !coreIds.has(id)), evidence };
  };
  const mains = canonical(problem.tasks.filter((task) => task.kind === "main"));
  const vocals = canonical(problem.tasks.filter((task) => task.kind === "vocal"));
  const feederByMain = new Map<string, Task>();
  const unsupported: string[] = [];
  for (const main of mains) {
    const matching = vocals.filter((task) => task.participantId === main.participantId);
    if (matching.length !== 1) unsupported.push(`${matching.length === 0 ? "MISSING" : "MULTIPLE"}_VOCAL_FEEDER:${main.id}`);
    else if (!main.dependencies.includes(matching[0]!.id) || matching[0]!.dependencies.length !== 0)
      unsupported.push(`UNSUPPORTED_FEEDER_DEPENDENCY:${main.id}`);
    else feederByMain.set(main.id, matching[0]!);
  }
  if (unsupported.length > 0 || mains.length === 0)
    return fail("UNSUPPORTED_CORE_SHAPE", unsupported.length ? unsupported : ["MISSING_MAIN_TASK"]);
  const preflightReasons = preflight(problem);
  if (preflightReasons.length > 0) return fail("PREFLIGHT_FAILED", preflightReasons);
  const anchoredIds = anchoredTaskIds(problem);
  const mainIds = new Set(mains.map(({ id }) => id));
  const applicableContracts = canonical((problem.anchoredAccompaniments ?? []).filter((contract) => mainIds.has(contract.anchorTaskId)));
  const coreIds = new Set([...mainIds, ...feederByMain.values()].map((value) => typeof value === "string" ? value : value.id));
  for (const contract of applicableContracts) for (const id of [...contract.beforeTaskIds, ...contract.afterTaskIds]) coreIds.add(id);
  if ([...anchoredIds].some((id) => !coreIds.has(id))) return fail("UNSUPPORTED_CORE_SHAPE", ["UNSUPPORTED_NON_MAIN_ANCHORED_OPERATION"], coreIds);

  let exhaustionReason = "BRANCH_BUDGET_EXHAUSTED";
  const consumeBranch = (reason: string): boolean => {
    if (evidence.branchesExplored >= problem.budget.maxBranchExpansions) { exhaustionReason = reason; return false; }
    evidence.branchesExplored += 1;
    return true;
  };
  const duration = mains[0]!.duration;
  const patterns = generateMainFlowPatterns(mains, problem.mainFlow.minTasksPerBlock,
    problem.mainFlow.maxBlocksByKey, problem.budget.maxPatterns);
  if (patterns.exhausted) return fail("BRANCH_BUDGET_EXHAUSTED", ["PATTERN_SEARCH_BUDGET_EXHAUSTED"], coreIds);
  const requiredBlocks = buildRequiredCompositeBlocks(problem, mains);
  let selected: { tasks: ScheduledTask[]; meals: ScheduledSpaceMeal[]; pattern: string[]; timeline?: MainFlowTimeline } | null = null;

  const evaluateFeederStarts = (feeder: Task, operation: ScheduledTask[], placed: ScheduledTask[],
    meals: ScheduledSpaceMeal[], mode: "ALL" | "FIRST_WITNESS"): FeederStartOutcome => {
    const first = operation[0]!.start;
    const deadline = first - Math.max(problem.participantTransitionMinutes, problem.resourceTransitionMinutes);
    const starts: number[] = [];
    for (let start = deadline - feeder.duration; start >= problem.day.start; start -= 5) {
      if (!consumeBranch("FEEDER_START_SEARCH_BUDGET_EXHAUSTED")) return { status: "BUDGET_EXHAUSTED" };
      evidence.feederCandidatesEvaluated += 1;
      if (canPlaceTask(problem, feeder, start, [...placed, ...operation], meals)) {
        starts.push(start);
        if (mode === "FIRST_WITNESS") break;
      }
    }
    return { status: "COMPLETE", starts };
  };

  const search = (pattern: string[], slots: number[], composite: RequiredCompositePosition,
    meals: ScheduledSpaceMeal[], placed: ScheduledTask[], used: Set<string>, depth: number): SearchOutcome => {
    evidence.maximumDepth = Math.max(evidence.maximumDepth, depth);
    if (depth === mains.length) {
      if (!consumeBranch("LEAF_VALIDATION_BUDGET_EXHAUSTED")) return "BUDGET_EXHAUSTED";
      evidence.completeLeafCount += 1;
      const reduced: PlannerNextProblem = { ...problem, tasks: problem.tasks.filter(({ id }) => coreIds.has(id)),
        anchoredAccompaniments: applicableContracts };
      const expected = [...coreIds].sort();
      const actual = placed.map(({ id }) => id).sort();
      const validShape = actual.length === expected.length && actual.every((id, index) => id === expected[index]);
      const validation = validatePlan(reduced, placed, [], meals);
      if (validShape && validation.hardValid) { selected = { tasks: placed, meals, pattern }; return "FOUND"; }
      return "DEAD_END";
    }
    const slot = slots[depth]!;
    const candidates: Alternative[] = [];
    for (const task of mains) {
      if (used.has(task.id) || task.blockKey !== pattern[depth]
        || !taskFitsRequiredCompositePosition(task, depth, requiredBlocks, composite)) continue;
      if (!consumeBranch("MAIN_CANDIDATE_SEARCH_BUDGET_EXHAUSTED")) return "BUDGET_EXHAUSTED";
      evidence.mainCandidatesEvaluated += 1;
      const operation = materializeAnchoredOperation(problem, task, slot, placed, meals);
      const feeder = feederByMain.get(task.id)!;
      if (!operation) continue;
      const feederResult = evaluateFeederStarts(feeder, operation.tasks, placed, meals, "ALL");
      if (feederResult.status === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
      if (feederResult.starts.length === 0) { evidence.zeroAlternativePrunes += 1; continue; }
      const participant = problem.participants.find(({ id }) => id === task.participantId)!;
      const containing = participant.availability.filter(({ start, end }) => start <= operation.start && operation.end <= end);
      const slack = containing.length ? Math.min(...containing.map(({ start, end }) => (operation.start - start) + (end - operation.end))) : 0;
      for (const start of feederResult.starts) candidates.push({ task, operation: operation.tasks,
        feeder: { ...feeder, start, end: start + feeder.duration }, feederAlternativeCount: feederResult.starts.length,
        participantSlack: slack, firstObligation: operation.start });
    }
    candidates.sort((a, b) => a.feederAlternativeCount - b.feederAlternativeCount
      || a.participantSlack - b.participantSlack || a.firstObligation - b.firstObligation
      || a.task.id.localeCompare(b.task.id)
      || b.feeder.start - a.feeder.start);
    if (candidates.length === 0) { evidence.zeroAlternativePrunes += 1; return "DEAD_END"; }
    for (const alternative of candidates) {
      const nextPlaced = [...placed, ...alternative.operation, alternative.feeder];
      const nextUsed = new Set(used).add(alternative.task.id);
      const matching = residualMatching(pattern, slots, composite, meals, nextPlaced, nextUsed, depth + 1);
      if (matching === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
      if (matching === "DEAD_END") {
        evidence.residualMatchingPrunes += 1;
        evidence.backtracks += 1;
        continue;
      }
      if (!consumeBranch("FUTURE_FEASIBILITY_SEARCH_BUDGET_EXHAUSTED")) return "BUDGET_EXHAUSTED";
      const child = search(pattern, slots, composite, meals, nextPlaced, nextUsed, depth + 1);
      if (child === "FOUND") return "FOUND";
      if (child === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
      evidence.backtracks += 1; // exactly this already-taken alternative is abandoned
    }
    return "DEAD_END";
  };

  const residualMatching = (pattern: string[], slots: number[], composite: RequiredCompositePosition,
    meals: ScheduledSpaceMeal[], placed: ScheduledTask[], used: Set<string>, nextDepth: number): SearchOutcome => {
    if (!consumeBranch("MATCHING_SEARCH_BUDGET_EXHAUSTED")) return "BUDGET_EXHAUSTED";
    evidence.residualMatchingChecks += 1;
    const remaining = mains.filter(({ id }) => !used.has(id));
    if (remaining.length === 0) return "FOUND";
    const edges = new Map<string, number[]>();
    for (const task of remaining) {
      const positions: number[] = [];
      for (let position = nextDepth; position < mains.length; position += 1) {
        if (task.blockKey !== pattern[position] || !taskFitsRequiredCompositePosition(task, position, requiredBlocks, composite)) continue;
        if (!consumeBranch("MATCHING_SEARCH_BUDGET_EXHAUSTED")) return "BUDGET_EXHAUSTED";
        const operation = materializeAnchoredOperation(problem, task, slots[position]!, placed, meals);
        if (!operation) continue;
        const feeder = feederByMain.get(task.id)!;
        const feederResult = evaluateFeederStarts(feeder, operation.tasks, placed, meals, "FIRST_WITNESS");
        if (feederResult.status === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
        if (feederResult.starts.length > 0) positions.push(position);
      }
      edges.set(task.id, positions);
      if (positions.length === 0) return "DEAD_END";
    }
    const positionOwner = new Map<number, string>();
    const augment = (taskId: string, seen: Set<number>): "MATCHED" | "UNMATCHED" | "BUDGET_EXHAUSTED" => {
      for (const position of edges.get(taskId) ?? []) {
        if (seen.has(position)) continue;
        if (!consumeBranch("MATCHING_SEARCH_BUDGET_EXHAUSTED")) return "BUDGET_EXHAUSTED";
        seen.add(position);
        const owner = positionOwner.get(position);
        if (owner === undefined) { positionOwner.set(position, taskId); return "MATCHED"; }
        const displaced = augment(owner, seen);
        if (displaced === "BUDGET_EXHAUSTED") return displaced;
        if (displaced === "MATCHED") { positionOwner.set(position, taskId); return "MATCHED"; }
      }
      return "UNMATCHED";
    };
    for (const { id } of remaining) {
      const result = augment(id, new Set());
      if (result === "BUDGET_EXHAUSTED") return result;
      if (result === "UNMATCHED") return "DEAD_END";
    }
    return "FOUND";
  };

  outer: for (const pattern of patterns.patterns) {
    if (!consumeBranch("PATTERN_SEARCH_BUDGET_EXHAUSTED"))
      return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
    evidence.patternCandidatesExplored += 1;
    const compositeAllowance = problem.budget.maxBranchExpansions - evidence.branchesExplored;
    const positionsResult = requiredCompositePositions(requiredBlocks, mains, pattern, compositeAllowance);
    evidence.branchesExplored += positionsResult.rawCombinationCount;
    if (positionsResult.exhausted)
      return fail("BRANCH_BUDGET_EXHAUSTED", ["COMPOSITE_SEARCH_BUDGET_EXHAUSTED"], coreIds);
    const positions = positionsResult.positions.length ? positionsResult.positions : [{ startIndexByResourceId: {}, signature: "" }];
    const timelines: Array<MainFlowTimeline | undefined> = hasMainFlowMeal(problem)
      ? orderTimelines(candidateCuts(pattern).map((cut) => buildTimeline(problem, pattern, duration, cut))) : [undefined];
    for (const timeline of timelines) {
      if (!consumeBranch("TIMELINE_SEARCH_BUDGET_EXHAUSTED"))
        return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
      evidence.timelineCandidatesExplored += 1;
      const slots = timeline?.slots ?? pattern.map((_, index) => problem.mainFlow.preferredEnd - pattern.length * duration + index * duration);
      for (const composite of positions) {
        if (!consumeBranch("COMPOSITE_POSITION_SEARCH_BUDGET_EXHAUSTED"))
          return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
        const result = search(pattern, slots, composite, timeline ? [timeline.meal] : [], [], new Set(), 0);
        if (result === "BUDGET_EXHAUSTED")
          return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
        if (result === "FOUND") {
          if (selected) selected.timeline = timeline;
          break outer;
        }
      }
    }
  }
  if (!selected) return fail("INFEASIBLE", ["NO_COMPLETE_HARD_VALID_CORE"], coreIds);
  const ordered = [...selected.tasks].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const meals = [...selected.meals].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  evidence.selectedPattern = [...selected.pattern];
  evidence.selectedTimelineKey = selected.timeline?.key ?? null;
  evidence.selectedMainTaskIds = ordered.filter(({ kind }) => kind === "main").map(({ id }) => id);
  evidence.selectedFeederTaskIds = ordered.filter(({ kind }) => kind === "vocal").map(({ id }) => id);
  evidence.coreFingerprint = fingerprint(ordered, [], meals);
  evidence.reasonCodes = [];
  return { status: "COMPLETE", complete: true, scheduledTasks: ordered, scheduledSpaceMeals: meals,
    remainingTaskIds: allTaskIds.filter((id) => !coreIds.has(id)), evidence };
}
