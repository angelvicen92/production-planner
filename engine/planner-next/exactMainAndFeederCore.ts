import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { anchoredAccompanimentIndex, anchoredTaskIds, materializeAnchoredOperation } from "./anchoredAccompaniment";
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
  futureMainPositions: number;
}

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
  const anchorIndex = anchoredAccompanimentIndex(problem);
  const mainIds = new Set(mains.map(({ id }) => id));
  const applicableContracts = canonical((problem.anchoredAccompaniments ?? []).filter((contract) => mainIds.has(contract.anchorTaskId)));
  const coreIds = new Set([...mainIds, ...feederByMain.values()].map((value) => typeof value === "string" ? value : value.id));
  for (const contract of applicableContracts) for (const id of [...contract.beforeTaskIds, ...contract.afterTaskIds]) coreIds.add(id);
  if ([...anchoredIds].some((id) => !coreIds.has(id))) return fail("UNSUPPORTED_CORE_SHAPE", ["UNSUPPORTED_NON_MAIN_ANCHORED_OPERATION"], coreIds);

  let exhausted = false;
  const consume = (): boolean => {
    if (evidence.branchesExplored >= problem.budget.maxBranchExpansions) { exhausted = true; return false; }
    evidence.branchesExplored += 1;
    return true;
  };
  const duration = mains[0]!.duration;
  const patterns = generateMainFlowPatterns(mains, problem.mainFlow.minTasksPerBlock,
    problem.mainFlow.maxBlocksByKey, problem.budget.maxPatterns);
  if (patterns.exhausted) return fail("PREFLIGHT_FAILED", ["PATTERN_BUDGET_EXHAUSTED"], coreIds);
  const requiredBlocks = buildRequiredCompositeBlocks(problem, mains);
  let selected: { tasks: ScheduledTask[]; meals: ScheduledSpaceMeal[]; pattern: string[]; timeline?: MainFlowTimeline } | null = null;

  const feederStarts = (feeder: Task, operation: ScheduledTask[], placed: ScheduledTask[], meals: ScheduledSpaceMeal[]): number[] => {
    const first = operation[0]!.start;
    const deadline = first - Math.max(problem.participantTransitionMinutes, problem.resourceTransitionMinutes);
    const starts: number[] = [];
    for (let start = deadline - feeder.duration; start >= problem.day.start; start -= 5) {
      if (!consume()) return starts;
      evidence.feederCandidatesEvaluated += 1;
      if (canPlaceTask(problem, feeder, start, [...placed, ...operation], meals)) starts.push(start);
    }
    return starts;
  };
  const feederHasStart = (feeder: Task, operation: ScheduledTask[], placed: ScheduledTask[], meals: ScheduledSpaceMeal[]): boolean => {
    const deadline = operation[0]!.start - Math.max(problem.participantTransitionMinutes, problem.resourceTransitionMinutes);
    for (let start = deadline - feeder.duration; start >= problem.day.start; start -= 5) {
      if (canPlaceTask(problem, feeder, start, [...placed, ...operation], meals)) return true;
    }
    return false;
  };

  const search = (pattern: string[], slots: number[], composite: RequiredCompositePosition,
    meals: ScheduledSpaceMeal[], placed: ScheduledTask[], used: Set<string>, depth: number): boolean => {
    if (exhausted) return false;
    evidence.maximumDepth = Math.max(evidence.maximumDepth, depth);
    if (depth === mains.length) {
      evidence.completeLeafCount += 1;
      const reduced: PlannerNextProblem = { ...problem, tasks: problem.tasks.filter(({ id }) => coreIds.has(id)),
        anchoredAccompaniments: applicableContracts };
      const expected = [...coreIds].sort();
      const actual = placed.map(({ id }) => id).sort();
      const validShape = actual.length === expected.length && actual.every((id, index) => id === expected[index]);
      const validation = validatePlan(reduced, placed, [], meals);
      if (validShape && validation.hardValid) { selected = { tasks: placed, meals, pattern }; return true; }
      evidence.backtracks += 1;
      return false;
    }
    const slot = slots[depth]!;
    const candidates: Alternative[] = [];
    for (const task of mains) {
      if (used.has(task.id) || task.blockKey !== pattern[depth]
        || !taskFitsRequiredCompositePosition(task, depth, requiredBlocks, composite)) continue;
      if (!consume()) return false;
      evidence.mainCandidatesEvaluated += 1;
      const operation = materializeAnchoredOperation(problem, task, slot, placed, meals);
      const feeder = feederByMain.get(task.id)!;
      if (!operation) continue;
      const starts = feederStarts(feeder, operation.tasks, placed, meals);
      if (exhausted) return false;
      if (starts.length === 0) { evidence.zeroAlternativePrunes += 1; continue; }
      const participant = problem.participants.find(({ id }) => id === task.participantId)!;
      const containing = participant.availability.filter(({ start, end }) => start <= operation.start && operation.end <= end);
      const slack = containing.length ? Math.min(...containing.map(({ start, end }) => (operation.start - start) + (end - operation.end))) : 0;
      const futurePositions = slots.slice(depth + 1).filter((futureSlot, offset) => task.blockKey === pattern[depth + 1 + offset]
        && taskFitsRequiredCompositePosition(task, depth + 1 + offset, requiredBlocks, composite)
        && materializeAnchoredOperation(problem, task, futureSlot, placed, meals) !== null).length;
      for (const start of starts) candidates.push({ task, operation: operation.tasks,
        feeder: { ...feeder, start, end: start + feeder.duration }, feederAlternativeCount: starts.length,
        participantSlack: slack, firstObligation: operation.start, futureMainPositions: futurePositions });
    }
    candidates.sort((a, b) => a.feederAlternativeCount - b.feederAlternativeCount
      || a.participantSlack - b.participantSlack || a.firstObligation - b.firstObligation
      || a.futureMainPositions - b.futureMainPositions || a.task.id.localeCompare(b.task.id)
      || b.feeder.start - a.feeder.start);
    if (candidates.length === 0) { evidence.zeroAlternativePrunes += 1; return false; }
    for (const alternative of candidates) {
      const nextPlaced = [...placed, ...alternative.operation, alternative.feeder];
      const nextUsed = new Set(used).add(alternative.task.id);
      if (!residualMatching(pattern, slots, composite, meals, nextPlaced, nextUsed, depth + 1)) {
        if (exhausted) return false;
        evidence.residualMatchingPrunes += 1;
        evidence.backtracks += 1;
        continue;
      }
      if (!consume()) return false; // the recursive future-feasibility alternative
      if (search(pattern, slots, composite, meals, nextPlaced, nextUsed, depth + 1)) return true;
      evidence.backtracks += 1;
      if (exhausted) return false;
    }
    return false;
  };

  const residualMatching = (pattern: string[], slots: number[], composite: RequiredCompositePosition,
    meals: ScheduledSpaceMeal[], placed: ScheduledTask[], used: Set<string>, nextDepth: number): boolean => {
    evidence.residualMatchingChecks += 1;
    const remaining = mains.filter(({ id }) => !used.has(id));
    if (remaining.length === 0) return true;
    const edges = new Map<string, number[]>();
    for (const task of remaining) {
      const positions: number[] = [];
      for (let position = nextDepth; position < mains.length; position += 1) {
        if (task.blockKey !== pattern[position] || !taskFitsRequiredCompositePosition(task, position, requiredBlocks, composite)) continue;
        if (!consume()) return false;
        const operation = materializeAnchoredOperation(problem, task, slots[position]!, placed, meals);
        if (!operation) continue;
        const feeder = feederByMain.get(task.id)!;
        if (feederHasStart(feeder, operation.tasks, placed, meals)) positions.push(position);
      }
      edges.set(task.id, positions);
      if (positions.length === 0) return false;
    }
    const positionOwner = new Map<number, string>();
    const augment = (taskId: string, seen: Set<number>): boolean => {
      for (const position of edges.get(taskId) ?? []) {
        if (seen.has(position)) continue;
        if (!consume()) return false;
        seen.add(position);
        const owner = positionOwner.get(position);
        if (owner === undefined || augment(owner, seen)) { positionOwner.set(position, taskId); return true; }
      }
      return false;
    };
    return remaining.every(({ id }) => augment(id, new Set()));
  };

  outer: for (const pattern of patterns.patterns) {
    if (!consume()) break;
    evidence.patternCandidatesExplored += 1;
    const positionsResult = requiredCompositePositions(requiredBlocks, mains, pattern, problem.budget.maxPatterns);
    if (positionsResult.exhausted) return fail("PREFLIGHT_FAILED", ["COMPOSITE_PATTERN_BUDGET_EXHAUSTED"], coreIds);
    const positions = positionsResult.positions.length ? positionsResult.positions : [{ startIndexByResourceId: {}, signature: "" }];
    const timelines: Array<MainFlowTimeline | undefined> = hasMainFlowMeal(problem)
      ? orderTimelines(candidateCuts(pattern).map((cut) => buildTimeline(problem, pattern, duration, cut))) : [undefined];
    for (const timeline of timelines) {
      if (!consume()) break outer;
      evidence.timelineCandidatesExplored += 1;
      const slots = timeline?.slots ?? pattern.map((_, index) => problem.mainFlow.preferredEnd - pattern.length * duration + index * duration);
      for (const composite of positions) {
        if (search(pattern, slots, composite, timeline ? [timeline.meal] : [], [], new Set(), 0)) {
          if (selected) selected.timeline = timeline;
          break outer;
        }
        if (exhausted) break outer;
      }
    }
  }
  if (exhausted) return fail("BRANCH_BUDGET_EXHAUSTED", ["BRANCH_BUDGET_EXHAUSTED"], coreIds);
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
