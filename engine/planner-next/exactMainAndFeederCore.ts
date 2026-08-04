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
  constructiveFeederStartChecks: number;
  matchingFeederStartChecks: number;
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

interface MainChoice {
  task: Task;
  operation: ScheduledTask[];
  feeder: Task;
  participantSlack: number;
  firstObligation: number;
}

/** Immutable, derived view exposed only to experimental candidate-ordering code. */
export interface ExactMainChoiceDescriptor {
  readonly mainTask: Readonly<Task>;
  readonly operationTasks: readonly Readonly<ScheduledTask>[];
  readonly feeder: Readonly<Task>;
  readonly placedTasks: readonly Readonly<ScheduledTask>[];
  readonly meals: readonly Readonly<ScheduledSpaceMeal>[];
  readonly slot: number;
  readonly depth: number;
  readonly pattern: readonly string[];
  readonly participantSlack: number;
  readonly firstObligation: number;
}

type SearchOutcome = "FOUND" | "DEAD_END" | "BUDGET_EXHAUSTED";

export type ExactCoreContinuationOutcome = "ACCEPT" | "REJECT" | "BUDGET_EXHAUSTED";
export type ExactPartialCoreContinuationOutcome = "CONTINUE" | "REJECT" | "BUDGET_EXHAUSTED";
export interface ExactSearchLedger {
  limit: number;
  branchesExplored: number;
  coreBranches: number;
  standaloneBranches: number;
  lastExhaustionPhase: "CORE" | "STANDALONE" | null;
  consume(phase: "CORE" | "STANDALONE", count?: number): boolean;
}
export interface ExactCoreLeafCandidate {
  tasks: ScheduledTask[];
  meals: ScheduledSpaceMeal[];
  remainingTaskIds: string[];
  fingerprint: string;
}
export interface ExactPartialCoreCandidate {
  tasks: ScheduledTask[];
  addedTasks: ScheduledTask[];
  meals: ScheduledSpaceMeal[];
  depth: number;
  mainTaskId: string;
  feederStart: number;
  pattern: string[];
  timelineKey: string | null;
}
export interface ExactMainAndFeederSearchOptions {
  ledger?: ExactSearchLedger;
  onHardValidCoreLeaf?: (candidate: ExactCoreLeafCandidate) => ExactCoreContinuationOutcome;
  onPartialCoreCandidate?: (candidate: ExactPartialCoreCandidate) => ExactPartialCoreContinuationOutcome;
  /** Experimental ordering only: a negative result puts `a` before `b`; no candidate can be removed. */
  mainChoiceComparator?: (a: ExactMainChoiceDescriptor, b: ExactMainChoiceDescriptor) => number;
  onMainChoicesRanked?: (baseline: readonly ExactMainChoiceDescriptor[], ordered: readonly ExactMainChoiceDescriptor[]) => void;
  onMainChoiceEntered?: (candidate: ExactMainChoiceDescriptor) => void;
  onMainChoiceAccepted?: (candidate: ExactMainChoiceDescriptor) => void;
}

export function createExactSearchLedger(limit: number): ExactSearchLedger {
  const ledger: ExactSearchLedger = {
    limit, branchesExplored: 0, coreBranches: 0, standaloneBranches: 0, lastExhaustionPhase: null,
    consume(phase, count = 1) {
      if (ledger.branchesExplored + count > ledger.limit) { ledger.lastExhaustionPhase = phase; return false; }
      ledger.branchesExplored += count;
      if (phase === "CORE") ledger.coreBranches += count; else ledger.standaloneBranches += count;
      return true;
    },
  };
  return ledger;
}

const canonical = <T extends { id: string }>(values: readonly T[]): T[] => [...values].sort((a, b) => a.id.localeCompare(b.id));
const readonlyTaskCopy = <T extends Task | ScheduledTask>(task: T): Readonly<T> => Object.freeze({ ...task,
  dependencies: Object.freeze([...task.dependencies]),
  requiredResourceIds: task.requiredResourceIds === undefined ? undefined : Object.freeze([...task.requiredResourceIds]),
  availability: task.availability === undefined ? undefined : Object.freeze(task.availability.map((window) => Object.freeze({ ...window }))),
}) as Readonly<T>;

function emptyEvidence(): ExactMainAndFeederCoreEvidence {
  return { branchesExplored: 0, patternCandidatesExplored: 0, timelineCandidatesExplored: 0,
    mainCandidatesEvaluated: 0, feederCandidatesEvaluated: 0, constructiveFeederStartChecks: 0,
    matchingFeederStartChecks: 0, residualMatchingChecks: 0,
    residualMatchingPrunes: 0, zeroAlternativePrunes: 0, backtracks: 0, maximumDepth: 0,
    completeLeafCount: 0, selectedPattern: null, selectedTimelineKey: null,
    selectedMainTaskIds: [], selectedFeederTaskIds: [], coreFingerprint: null, reasonCodes: [] };
}

/** Internal exact runner; a continuation may reject a hard-valid leaf and resume core DFS. */
export function runExactMainAndFeederSearch(problem: PlannerNextProblem,
  options: ExactMainAndFeederSearchOptions = {}): ExactMainAndFeederCoreResult {
  const evidence = emptyEvidence();
  const ledger = options.ledger ?? createExactSearchLedger(problem.budget.maxBranchExpansions);
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
    if (!ledger.consume("CORE")) { exhaustionReason = reason; return false; }
    evidence.branchesExplored = ledger.coreBranches;
    return true;
  };
  const duration = mains[0]!.duration;
  const patterns = generateMainFlowPatterns(mains, problem.mainFlow.minTasksPerBlock,
    problem.mainFlow.maxBlocksByKey, problem.budget.maxPatterns);
  if (patterns.exhausted) return fail("BRANCH_BUDGET_EXHAUSTED", ["PATTERN_SEARCH_BUDGET_EXHAUSTED"], coreIds);
  const requiredBlocks = buildRequiredCompositeBlocks(problem, mains);
  let selected: { tasks: ScheduledTask[]; meals: ScheduledSpaceMeal[]; pattern: string[]; timeline?: MainFlowTimeline } | null = null;

  const checkFeederStart = (feeder: Task, start: number, operation: ScheduledTask[], placed: ScheduledTask[],
    meals: ScheduledSpaceMeal[]): "VALID" | "INVALID" | "BUDGET_EXHAUSTED" => {
    if (!consumeBranch("CONSTRUCTIVE_FEEDER_START_SEARCH_BUDGET_EXHAUSTED")) return "BUDGET_EXHAUSTED";
    evidence.feederCandidatesEvaluated += 1;
    evidence.constructiveFeederStartChecks += 1;
    return canPlaceTask(problem, feeder, start, [...placed, ...operation], meals) ? "VALID" : "INVALID";
  };

  const search = (pattern: string[], slots: number[], composite: RequiredCompositePosition,
    meals: ScheduledSpaceMeal[], placed: ScheduledTask[], used: Set<string>, depth: number,
    timelineKey: string | null): SearchOutcome => {
    evidence.maximumDepth = Math.max(evidence.maximumDepth, depth);
    if (depth === mains.length) {
      if (!consumeBranch("LEAF_VALIDATION_BUDGET_EXHAUSTED")) return "BUDGET_EXHAUSTED";
      evidence.completeLeafCount += 1;
      const reduced: PlannerNextProblem = { ...problem, tasks: problem.tasks.filter(({ id }) => coreIds.has(id)),
        anchoredAccompaniments: applicableContracts, participantMeals: undefined, participantMealCapacity: undefined };
      const expected = [...coreIds].sort();
      const actual = placed.map(({ id }) => id).sort();
      const validShape = actual.length === expected.length && actual.every((id, index) => id === expected[index]);
      const validation = validatePlan(reduced, placed, [], meals);
      if (validShape && validation.hardValid) {
        const ordered = [...placed].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
        const orderedMeals = [...meals].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
        const continuation = options.onHardValidCoreLeaf?.({ tasks: ordered, meals: orderedMeals,
          remainingTaskIds: allTaskIds.filter((id) => !coreIds.has(id)), fingerprint: fingerprint(ordered, [], orderedMeals) }) ?? "ACCEPT";
        if (continuation === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
        if (continuation === "ACCEPT") { selected = { tasks: placed, meals, pattern }; return "FOUND"; }
      }
      return "DEAD_END";
    }
    const slot = slots[depth]!;
    const choices: MainChoice[] = [];
    for (const task of mains) {
      if (used.has(task.id) || task.blockKey !== pattern[depth]
        || !taskFitsRequiredCompositePosition(task, depth, requiredBlocks, composite)) continue;
      if (!consumeBranch("MAIN_CANDIDATE_SEARCH_BUDGET_EXHAUSTED")) return "BUDGET_EXHAUSTED";
      evidence.mainCandidatesEvaluated += 1;
      const operation = materializeAnchoredOperation(problem, task, slot, placed, meals);
      const feeder = feederByMain.get(task.id)!;
      if (!operation) continue;
      const participant = problem.participants.find(({ id }) => id === task.participantId)!;
      const containing = participant.availability.filter(({ start, end }) => start <= operation.start && operation.end <= end);
      const slack = containing.length ? Math.min(...containing.map(({ start, end }) => (operation.start - start) + (end - operation.end))) : 0;
      choices.push({ task, operation: operation.tasks, feeder, participantSlack: slack, firstObligation: operation.start });
    }
    choices.sort((a, b) => a.participantSlack - b.participantSlack
      || a.firstObligation - b.firstObligation || a.task.id.localeCompare(b.task.id));
    if (choices.length === 0) { evidence.zeroAlternativePrunes += 1; return "DEAD_END"; }
    const describe = (choice: MainChoice): ExactMainChoiceDescriptor => Object.freeze({
      mainTask: readonlyTaskCopy(choice.task),
      operationTasks: Object.freeze(choice.operation.map(readonlyTaskCopy)),
      feeder: readonlyTaskCopy(choice.feeder),
      placedTasks: Object.freeze(placed.map(readonlyTaskCopy)),
      meals: Object.freeze(meals.map((meal) => Object.freeze({ ...meal }))),
      slot, depth, pattern: Object.freeze([...pattern]), participantSlack: choice.participantSlack,
      firstObligation: choice.firstObligation,
    });
    const descriptorById = new Map(choices.map((choice) => [choice.task.id, describe(choice)]));
    const baselineDescriptors = choices.map((choice) => descriptorById.get(choice.task.id)!);
    if (options.mainChoiceComparator) choices.sort((a, b) => options.mainChoiceComparator!(
      descriptorById.get(a.task.id)!, descriptorById.get(b.task.id)!));
    options.onMainChoicesRanked?.(Object.freeze([...baselineDescriptors]),
      Object.freeze(choices.map((choice) => descriptorById.get(choice.task.id)!)));
    for (const choice of choices) {
      options.onMainChoiceEntered?.(descriptorById.get(choice.task.id)!);
      const deadline = choice.firstObligation - Math.max(problem.participantTransitionMinutes, problem.resourceTransitionMinutes);
      let validStartFound = false;
      for (let start = deadline - choice.feeder.duration; start >= problem.day.start; start -= 5) {
        const startCheck = checkFeederStart(choice.feeder, start, choice.operation, placed, meals);
        if (startCheck === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
        if (startCheck === "INVALID") continue;
        validStartFound = true;
        const scheduledFeeder: ScheduledTask = { ...choice.feeder, start, end: start + choice.feeder.duration };
        const nextPlaced = [...placed, ...choice.operation, scheduledFeeder];
        const nextUsed = new Set(used).add(choice.task.id);
        const matching = residualMatching(pattern, slots, composite, meals, nextPlaced, nextUsed, depth + 1);
        if (matching === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
        if (matching === "DEAD_END") {
          evidence.residualMatchingPrunes += 1;
          evidence.backtracks += 1;
          continue;
        }
        const partial = options.onPartialCoreCandidate?.({ tasks: nextPlaced, addedTasks: [...choice.operation, scheduledFeeder],
          meals, depth: depth + 1, mainTaskId: choice.task.id, feederStart: start, pattern: [...pattern],
          timelineKey }) ?? "CONTINUE";
        if (partial === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
        if (partial === "REJECT") { evidence.backtracks += 1; continue; }
        if (!consumeBranch("FUTURE_FEASIBILITY_SEARCH_BUDGET_EXHAUSTED")) return "BUDGET_EXHAUSTED";
        const child = search(pattern, slots, composite, meals, nextPlaced, nextUsed, depth + 1, timelineKey);
        if (child === "FOUND") { options.onMainChoiceAccepted?.(descriptorById.get(choice.task.id)!); return "FOUND"; }
        if (child === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
        evidence.backtracks += 1;
      }
      if (!validStartFound) evidence.zeroAlternativePrunes += 1;
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
        positions.push(position);
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
    const compositeAllowance = ledger.limit - ledger.branchesExplored;
    const positionsResult = requiredCompositePositions(requiredBlocks, mains, pattern, compositeAllowance);
    if (!ledger.consume("CORE", positionsResult.rawCombinationCount))
      return fail("BRANCH_BUDGET_EXHAUSTED", ["COMPOSITE_SEARCH_BUDGET_EXHAUSTED"], coreIds);
    evidence.branchesExplored = ledger.coreBranches;
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
        const result = search(pattern, slots, composite, timeline ? [timeline.meal] : [], [], new Set(), 0,
          timeline?.key ?? null);
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

/** Constructs only the first exact main-flow, direct vocal-feeder and main-anchored hard-valid leaf. */
export function constructExactMainAndFeederCore(problem: PlannerNextProblem): ExactMainAndFeederCoreResult {
  return runExactMainAndFeederSearch(problem);
}
