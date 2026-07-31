import type {
  PlanMetrics,
  PlanResult,
  PlannerNextProblem,
  ScheduledSetupPreparation,
  ScheduledTask,
  SearchStopReason,
  Task,
  ScheduledSpaceMeal,
} from "./contracts";
import { fingerprint } from "./fingerprint";
import { evaluateResourcePresence, presencePreferenceWeight, resourcePresenceIncrement, resourcePresenceMetrics, resourceRouteMetrics } from "./resourcePresence";
import { preflight, validatePlan } from "./validate";
import { canPlaceTask } from "./placement";
import { placeAuxiliaryTasks, type AuxiliaryPlacementResult } from "./placeAuxiliaryTasks";
import { participantPresenceSpan } from "./participantPresence";
import { requiredSecondarySpaces, secondaryBlockCount, secondaryEnd, secondaryGapMinutes, secondaryStart, secondaryTasks } from "./secondaryContinuity";
import { setupPreparationCounts, setupPreparationMinutesBySpace, setupPreparationSequence, spaceOccupations } from "./setupPreparation";
import { setupBlockCounts, setupFamilySequence, setupSpaces, setupSwitchCount, setupTasks } from "./setupGrouping";
import { technicalMetrics } from "./technicalOperations";
import { getTechnicalChains } from "./technicalChains";
import { buildTimeline, candidateCuts, hasMainFlowMeal, type MainFlowTimeline } from "./mainFlowMeal";
import { assessMainResidualMatching } from "./mainResidualMatching";

import { hasExplicitMainFlowMeal } from "./spaceMeals";
import { closeFeeders, diagnoseGreedyFeederClosure } from "./feederClosure";
import { assessPlacedMainFeederClosure, type PlacedMainFeederClosureAssessment } from "./feederPrefixClosure";
import { buildRequiredCompositeBlocks, requiredCompositePositions, taskFitsRequiredCompositePosition } from "./requiredCompositeBlock";
import { anchoredAccompanimentIndex, firstParticipantObligation, materializeAnchoredOperation } from "./anchoredAccompaniment";

interface MainAlternative {
  tasks: ScheduledTask[];
  score: number;
  signature: string;
  timeline?: MainFlowTimeline;
  feeders?: ScheduledTask[];
  feederScore?: number;
  feederSelectedOrder?: string[];
  preferredPresenceTuple?: [number, number, number];
  participantScore?: number;
  feederClosable?: boolean;
  prefixFeederClosure?: PlacedMainFeederClosureAssessment;
}

function preferredPresenceTuple(problem: PlannerNextProblem, alternative: MainAlternative): [number, number, number] {
  const meals = alternative.timeline ? [alternative.timeline.meal] : [];
  return problem.resources.filter((resource) => resource.presenceConcentrationPolicy === "PREFERRED")
    .reduce<[number, number, number]>((total, resource) => {
      const tuple = evaluateResourcePresence(resource, alternative.tasks, meals).preferredLexicographicTuple;
      const weight = presencePreferenceWeight(resource.presencePreference);
      return [total[0] + tuple[0] * weight, total[1] + tuple[1] * weight, total[2] + tuple[2] * weight];
    }, [0, 0, 0]);
}

function compareAlternatives(a: MainAlternative, b: MainAlternative, preferred: boolean): number {
  const historical = a.score - b.score;
  const aMain=a.tasks.filter(t=>t.kind==="main").length,bMain=b.tasks.filter(t=>t.kind==="main").length;
  if (!preferred || aMain !== bMain || aMain === 0) {
    return historical || a.signature.localeCompare(b.signature);
  }
  if (a.feederClosable !== b.feederClosable) return a.feederClosable ? -1 : 1;
  const left = a.preferredPresenceTuple ?? [0, 0, 0];
  const right = b.preferredPresenceTuple ?? [0, 0, 0];
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
    || historical || a.signature.localeCompare(b.signature);
}

interface Counters {
  alternativesGenerated: number;
  alternativesRetained: number;
  branches: number;
  backtracks: number;
  patternsGenerated: number;
  patternsEvaluated: number;
  auxiliaryBranches: number;
  secondaryBranches: number;
  futureChecks: number; futureBranches: number; futurePruned: number; futureTopPruned: number; blockers: Record<string, number>; acceptedMinimum: number;
  anchoredCandidates:number; anchoredRejected:number; mainMaximumDepth:number; mainLeafAttempts:number; mainFailedLeaves:number; mainDeferred:number; mainDecisionPoints:number; mainFailures:Record<string,number>; mainFirstRank:Record<string,number>; mainMatchingChecks:number; mainMatchingPrunes:number; mainMatchingEdges:number; mainMatchingFailuresByDepth:Record<string,number>; mainStructuralDeadEnds:number; feederPrefixChecks:number; feederPrefixPrunes:number; feederPrefixBranches:number; feederPrefixFailuresByDepth:Record<string,number>; feederPrefixBlockingFeeders:Record<string,number>; feederPrefixBlockingMains:Record<string,number>;
}

function canonical<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

function generatePatterns(
  mains: Task[],
  minimumRun: number,
  maximumRunsByKey: number,
  maximumPatterns: number,
): { patterns: string[][]; exhausted: boolean } {
  const counts = new Map<string, number>();
  for (const task of mains) counts.set(task.blockKey ?? "", (counts.get(task.blockKey ?? "") ?? 0) + 1);
  const keys = [...counts.keys()].sort();
  const output: string[][] = [];
  let exhausted = false;

  function visit(remaining: Map<string, number>, runs: Array<{ key: string; count: number }>): void {
    if (exhausted) return;
    const left = [...remaining.values()].reduce((sum, count) => sum + count, 0);
    if (left === 0) {
      if (output.length >= maximumPatterns) {
        exhausted = true;
        return;
      }
      output.push(runs.flatMap((run) => Array(run.count).fill(run.key) as string[]));
      return;
    }
    for (const key of keys) {
      const available = remaining.get(key) ?? 0;
      const sameAsPrevious = runs.at(-1)?.key === key;
      const runsForKey = runs.filter((run) => run.key === key).length;
      if (available === 0 || sameAsPrevious || runsForKey >= maximumRunsByKey) continue;
      for (let take = minimumRun; take <= available; take += 1) {
        remaining.set(key, available - take);
        visit(remaining, [...runs, { key, count: take }]);
        remaining.set(key, available);
        if (exhausted) return;
      }
    }
  }

  visit(new Map(counts), []);
  const runCount = (pattern: string[]): number => pattern.reduce(
    (count, key, index) => count + (index === 0 || pattern[index - 1] !== key ? 1 : 0), 0,
  );
  output.sort((a, b) => runCount(a) - runCount(b) || a.join("|").localeCompare(b.join("|")));
  return { patterns: output, exhausted };
}

export { diagnoseGreedyFeederClosure } from "./feederClosure";
export function tryGreedyFeederClosure(problem: PlannerNextProblem, mains: ScheduledTask[], scheduledSpaceMeals: ScheduledSpaceMeal[] = []): ScheduledTask[] | null {
  const diagnosis=diagnoseGreedyFeederClosure(problem,mains,scheduledSpaceMeals);return diagnosis.complete?diagnosis.scheduledTasks:null;
}

function emptyMetrics(
  problem: PlannerNextProblem,
  reasons: string[],
  runtimeMs: number,
  stopReason: SearchStopReason,
  counters?: Partial<Counters>,
): PlanMetrics {
  return {
    complete: false,
    hardValid: false,
    plannedTaskCount: 0,
    unplannedTaskCount: Array.isArray(problem.tasks) ? problem.tasks.length : 0,
    mainFlowStart: null,
    mainFlowEnd: null,
    mainFlowGapMinutes: 0,
    mainFlowMealStart:null,mainFlowMealEnd:null,mainFlowMorningTaskCount:0,mainFlowAfternoonTaskCount:0,mainFlowSelectedSplitIndex:null,mainFlowTimelineCandidateCount:0,mainFlowAllMorningAlternativeCount:0,mainFlowSplitAlternativeCount:0,
    blockSequence: [],
    blockCountByKey: {},
    dependencyViolationCount: 0,
    overlapViolationCount: 0,
    transitionViolationCount: 0,
    availabilityViolationCount: 0,
    taskAvailabilityViolationCount: 0,
    blockViolationCount: 0,
    resourceAvailabilityViolationCount: 0,
    resourceOverlapViolationCount: 0,
    resourceTransitionViolationCount: 0,
    secondaryContinuityViolationCount: 0,
    setupViolationCount: 0,
    setupPreparationViolationCount: 0,
    jointGroupViolationCount: 0,
    technicalOperationViolationCount: 0,
    technicalChainViolationCount: 0,
    spaceMealViolationCount:0,
    mainFlowMealViolationCount:0,
    anchoredAccompanimentViolationCount:0,
    participantPresenceMinutesById: {},
    totalParticipantPresenceMinutes: 0,
    maxParticipantPresenceMinutes: 0,
    resourcePresenceMinutesById: {},
    resourceInternalGapMinutesById: {},
    resourceOperationalBlockCountById: {},
    resourceAuthorizedMealMinutesById: {},
    resourceMoveCountById: {},
    resourceTransitionSlackMinutesById: {},
    totalResourcePresenceMinutes: 0,
    maxResourcePresenceMinutes: 0,
    alternativesGenerated: counters?.alternativesGenerated ?? 0,
    alternativesRetained: counters?.alternativesRetained ?? 0,
    branchesExplored: counters?.branches ?? 0,
    backtracks: counters?.backtracks ?? 0,
    patternsGenerated: counters?.patternsGenerated ?? 0,
    patternsEvaluated: counters?.patternsEvaluated ?? 0,
    branchBudgetConsumed: counters?.branches ?? 0,
    feederClosureFallbackUsed:false,feederClosureBranchesExplored:0,feederClosureCompleteCandidateCount:0,feederClosureMaximumPartialStates:0,feederClosureSelectedOrder:[],feederClosureZeroAlternativeTaskIds:[],feederClosureRejectedStateBlockerIds:[],
    searchStopReason: stopReason,
    runtimeMs,
    planFingerprint: fingerprint([]),
    auxiliaryTaskCount: Array.isArray(problem.tasks) ? problem.tasks.filter((x) => x?.kind === "auxiliary").length : 0,
    auxiliaryPlannedTaskCount: 0,
    auxiliaryBranchesExplored: counters?.auxiliaryBranches ?? 0,
    auxiliarySelectionOrder: [],
    auxiliaryCandidateCountWhenSelectedByTaskId: {},
    saturatedResourceWindowBlockCount:0,saturatedResourceWindowBlockPlannedCount:0,saturatedResourceWindowBlockBranchesExplored:0,saturatedResourceWindowBlockCandidateCountByKey:{},saturatedResourceWindowBlockTaskIdsByKey:{},saturatedResourceWindowBlockResourceIdsByKey:{},saturatedResourceWindowBlockStartByKey:{},saturatedResourceWindowBlockEndByKey:{},saturatedResourceWindowBlockSelectedOrderByKey:{},
    secondaryBlockBranchesExplored: counters?.secondaryBranches ?? 0,
    auxiliaryWorkItemSelectionOrder: [],
    secondaryBlockCandidateCountWhenSelectedBySpaceId: {},
    secondarySpaceStartById: {},
    secondarySpaceEndById: {},
    secondarySpaceGapMinutesById: {},
    secondarySpaceBlockCountById: {},
    setupFamilySequenceBySpaceId: {}, setupBlockCountBySpaceAndFamily: {}, setupSwitchCountBySpaceId: {},
    setupPreparationCount: 0, setupPreparationMinutesBySpaceId: {}, setupPreparationCountBySpaceAndFamily: {}, setupPreparationSequenceBySpaceId: {},
    jointGroupCount:0,jointScheduledTaskCount:0,jointGroupCandidateCountWhenSelectedById:{},jointGroupStartById:{},jointGroupEndById:{},jointGroupParticipantIdsById:{},
    technicalOperationCount: Array.isArray(problem.tasks) ? problem.tasks.filter((task) => task?.kind === "technical").length : 0,
    technicalOperationPlannedCount: 0, technicalOperationCandidateCountWhenSelectedById: {}, technicalOperationStartById: {}, technicalOperationEndById: {},
    technicalChainCount:0,technicalChainPlannedCount:0,technicalChainScheduledTaskCount:0,technicalChainCandidateCountWhenSelectedByRootId:{},technicalChainTaskIdsByRootId:{},technicalChainStartByRootId:{},technicalChainEndByRootId:{},technicalChainBranchesExplored:0,
    spaceMealCount:Array.isArray(problem.spaces)?problem.spaces.filter(x=>x?.mealPolicy!==undefined).length:0,spaceMealPlannedCount:0,spaceMealCandidateCountWhenSelectedBySpaceId:{},spaceMealStartBySpaceId:{},spaceMealEndBySpaceId:{},spaceMealMinutesBySpaceId:{},spaceMealBranchesExplored:0,
    anchoredAccompanimentCount:Array.isArray(problem.anchoredAccompaniments)?problem.anchoredAccompaniments.length:0,anchoredAccompanimentPlannedCount:0,anchoredAccompanimentScheduledSegmentCount:0,anchoredAccompanimentCandidatePositionsEvaluated:0,anchoredAccompanimentRejectedPositionCount:0,anchoredAccompanimentAnchorTaskIdById:{},anchoredAccompanimentBeforeTaskIdsById:{},anchoredAccompanimentAfterTaskIdsById:{},anchoredAccompanimentOperationStartById:{},anchoredAccompanimentAnchorStartById:{},anchoredAccompanimentAnchorEndById:{},anchoredAccompanimentOperationEndById:{},anchoredAccompanimentTotalDurationById:{},anchoredAccompanimentAdjacencySatisfiedById:{},anchoredAccompanimentParticipantSatisfiedById:{},anchoredAccompanimentSpacesSatisfiedById:{},anchoredAccompanimentResourcesSatisfiedById:{},anchoredAccompanimentTaskWindowsSatisfiedById:{},anchoredAccompanimentCompleteById:{},anchoredAccompanimentRejectedReasonCountByCode:{},
    futureFeasibilityChecks: counters?.futureChecks ?? 0, futureFeasibilityBranchesExplored: counters?.futureBranches ?? 0, futureInfeasibleCandidatesPruned: counters?.futurePruned ?? 0, futureTopRankedCandidatesPruned: counters?.futureTopPruned ?? 0, futureBlockerCountByWorkItemKey: counters?.blockers ?? {}, acceptedPathMinimumFutureAlternativeCount: counters?.acceptedMinimum ?? 0,
    mainBacktrackCount: counters?.backtracks ?? 0, mainMaximumSearchDepth: counters?.mainMaximumDepth ?? 0,
    mainCompleteLeafAttemptCount: counters?.mainLeafAttempts ?? 0, mainFailedLeafCount: counters?.mainFailedLeaves ?? 0,
    mainDeferredCandidateExploredCount: counters?.mainDeferred ?? 0, mainDecisionPointCount: counters?.mainDecisionPoints ?? 0,
    mainFailureCountByReason: counters?.mainFailures ?? {}, mainFirstSolutionRankByDepth: counters?.mainFirstRank ?? {},
    mainResidualMatchingCheckCount: counters?.mainMatchingChecks ?? 0,
    mainResidualMatchingPruneCount: counters?.mainMatchingPrunes ?? 0,
    mainResidualMatchingEdgeEvaluationCount: counters?.mainMatchingEdges ?? 0,
    mainResidualMatchingFailureCountByDepth: counters?.mainMatchingFailuresByDepth ?? {},
    mainStructuralDeadEndCount: counters?.mainStructuralDeadEnds ?? 0,
    feederPrefixClosureCheckCount: counters?.feederPrefixChecks ?? 0,
    feederPrefixClosurePruneCount: counters?.feederPrefixPrunes ?? 0,
    feederPrefixClosureBranchesExplored: counters?.feederPrefixBranches ?? 0,
    feederPrefixClosureFailureCountByDepth: counters?.feederPrefixFailuresByDepth ?? {},
    feederPrefixBlockingCountByFeederId: counters?.feederPrefixBlockingFeeders ?? {},
    feederPrefixBlockingCountByMainTaskId: counters?.feederPrefixBlockingMains ?? {},
    reasonCodes: reasons,
  };
}

function failure(
  problem: PlannerNextProblem,
  begun: number,
  reason: SearchStopReason,
  counters?: Partial<Counters>,
): PlanResult {
  return {
    complete: false,
    scheduledTasks: [],
    scheduledSetupPreparations: [],
    scheduledSpaceMeals: [],
    metrics: emptyMetrics(problem, [reason], performance.now() - begun, reason, counters),
  };
}

export function planMainFlowAndFeeders(problem: PlannerNextProblem): PlanResult {
  const begun = performance.now();
  const hasPreferredPresence = Array.isArray(problem.resources)
    && problem.resources.some((resource) => resource.presenceConcentrationPolicy === "PREFERRED");
  const preflightReasons = preflight(problem);
  if (preflightReasons.length > 0) {
    return {
      complete: false,
      scheduledTasks: [],
      scheduledSetupPreparations: [],
      scheduledSpaceMeals: [],
      metrics: emptyMetrics(problem, preflightReasons, performance.now() - begun, "PREFLIGHT_FAILED"),
    };
  }

  const mains = canonical(problem.tasks.filter(({ kind }) => kind === "main"));
  const requiredBlocks = buildRequiredCompositeBlocks(problem, mains);
  const duration = mains[0]?.duration;
  if (duration === undefined || mains.length === 0) {
    return failure(problem, begun, "NO_COMPLETE_HARD_VALID_PLAN");
  }
  const mainStart = problem.mainFlow.preferredEnd - mains.length * duration;
  const withMeal = hasMainFlowMeal(problem);
  let timelineCandidateCount = 0;
  const generatedPatterns = generatePatterns(
    mains,
    problem.mainFlow.minTasksPerBlock,
    problem.mainFlow.maxBlocksByKey,
    problem.budget.maxPatterns,
  );
  const counters: Counters = {
    alternativesGenerated: 0,
    alternativesRetained: 0,
    branches: 0,
    backtracks: 0,
    patternsGenerated: generatedPatterns.patterns.length,
    patternsEvaluated: 0,
    auxiliaryBranches: 0,
    secondaryBranches: 0, futureChecks: 0, futureBranches: 0, futurePruned: 0, futureTopPruned: 0, blockers: {}, acceptedMinimum: 0, anchoredCandidates:0, anchoredRejected:0, mainMaximumDepth:0, mainLeafAttempts:0, mainFailedLeaves:0, mainDeferred:0, mainDecisionPoints:0, mainFailures:{}, mainFirstRank:{}, mainMatchingChecks:0, mainMatchingPrunes:0, mainMatchingEdges:0, mainMatchingFailuresByDepth:{}, mainStructuralDeadEnds:0, feederPrefixChecks:0, feederPrefixPrunes:0, feederPrefixBranches:0, feederPrefixFailuresByDepth:{}, feederPrefixBlockingFeeders:{}, feederPrefixBlockingMains:{},
  };
  if (generatedPatterns.exhausted) {
    return failure(problem, begun, "PATTERN_BUDGET_EXHAUSTED", counters);
  }

  type LeafSolution = {
    alternative: MainAlternative;
    auxiliary: AuxiliaryPlacementResult;
    validation: ReturnType<typeof validatePlan>;
  };
  type SearchResult =
    | { kind: "solution"; value: LeafSolution }
    | { kind: "dead-end"; reason: string; failedLeaf: boolean }
    | { kind: "budget-exhausted"; reason: string };

  let feederFallbackUsed = false, feederBranches = 0, feederCompleteCount = 0, feederMaximumStates = 0;
  const feederRejectedIds: string[] = [];
  const recordFailure = (reason: string): void => {
    counters.mainFailures[reason] = (counters.mainFailures[reason] ?? 0) + 1;
  };
  const addAuxiliaryDiagnostics = (auxiliary: AuxiliaryPlacementResult): void => {
    counters.auxiliaryBranches += auxiliary.branches;
    counters.branches += auxiliary.branches;
    counters.secondaryBranches += auxiliary.secondaryBranches;
    counters.futureChecks += auxiliary.futureChecks;
    counters.futureBranches += auxiliary.futureBranches;
    counters.futurePruned += auxiliary.futurePruned;
    counters.futureTopPruned += auxiliary.futureTopPruned;
    counters.acceptedMinimum = auxiliary.acceptedMinimum;
    for (const [key, value] of Object.entries(auxiliary.blockers)) {
      counters.blockers[key] = (counters.blockers[key] ?? 0) + value;
    }
  };
  const failLeaf = (reason: string): SearchResult => {
    counters.mainFailedLeaves += 1;
    recordFailure(reason);
    return { kind: "dead-end", reason, failedLeaf: true };
  };
  const tryCompleteMainLeaf = (alternative: MainAlternative): SearchResult => {
    counters.mainLeafAttempts += 1;
    const initialMeals = alternative.timeline ? [alternative.timeline.meal] : [];
    const requiredValid = problem.resources.every(resource => resource.presenceConcentrationPolicy !== "REQUIRED"
      || evaluateResourcePresence(resource, alternative.tasks, initialMeals).requiredPolicySatisfied);
    if (!requiredValid) return failLeaf("REQUIRED_RESOURCE_PRESENCE_FAILED");

    const feederCandidates: Array<{ tasks: ScheduledTask[]; selectedOrder?: string[]; signature?: string }> = [];
    const preparedClosure = alternative.prefixFeederClosure;
    if (preparedClosure) {
      feederFallbackUsed = true;
      feederBranches += preparedClosure.consumedBranches;
      feederCompleteCount += preparedClosure.completeClosureCount;
      feederMaximumStates = Math.max(feederMaximumStates, preparedClosure.maximumPartialStates);
      for (const id of preparedClosure.rejectedStateBlockerIds) if (!feederRejectedIds.includes(id)) feederRejectedIds.push(id);
      for (const candidate of preparedClosure.closureCandidates) {
        feederCandidates.push({ tasks: [...alternative.tasks, ...candidate.feeders], selectedOrder: candidate.selectedFeederOrder, signature: candidate.signature });
      }
    } else {
      const remaining = problem.budget.maxBranchExpansions - counters.branches;
      if (remaining <= 0) return { kind: "budget-exhausted", reason: "FEEDER_BRANCH_BUDGET_EXHAUSTED" };
      const closure = closeFeeders(problem, alternative.tasks, initialMeals, remaining);
      feederBranches += closure.diagnostics.consumed;
      counters.branches += closure.diagnostics.consumed;
      feederCompleteCount += closure.diagnostics.completeClosuresGenerated;
      feederMaximumStates = Math.max(feederMaximumStates, closure.diagnostics.maximumPartialStates);
      if (closure.diagnostics.exhausted) return { kind: "budget-exhausted", reason: "FEEDER_BRANCH_BUDGET_EXHAUSTED" };
      for (const candidate of closure.candidates) feederCandidates.push({ tasks: [...alternative.tasks, ...candidate.feeders], selectedOrder: candidate.selectedFeederOrder, signature: candidate.signature });
    }
    if (feederCandidates.length === 0) return failLeaf("FEEDER_CLOSURE_FAILED");

    let auxiliaryReachedValidation = false;
    for (const feederCandidate of feederCandidates) {
      const remaining = problem.budget.maxBranchExpansions - counters.branches;
      if (remaining <= 0) {
        recordFailure("AUXILIARY_BRANCH_BUDGET_EXHAUSTED");
        return { kind: "budget-exhausted", reason: "AUXILIARY_BRANCH_BUDGET_EXHAUSTED" };
      }
      const auxiliary = placeAuxiliaryTasks(problem, feederCandidate.tasks, remaining, initialMeals);
      addAuxiliaryDiagnostics(auxiliary);
      if (auxiliary.futureExhausted || auxiliary.secondaryExhausted || auxiliary.exhausted && auxiliary.tasks === null) {
        recordFailure("AUXILIARY_BRANCH_BUDGET_EXHAUSTED");
        return { kind: "budget-exhausted", reason: "AUXILIARY_BRANCH_BUDGET_EXHAUSTED" };
      }
      if (!auxiliary.tasks) continue;
      auxiliaryReachedValidation = true;
      const validation = validatePlan(problem, auxiliary.tasks, auxiliary.preparations, auxiliary.meals);
      if (!validation.hardValid || auxiliary.tasks.length !== problem.tasks.length) continue;
      return {
        kind: "solution",
        value: {
          alternative: {
            ...alternative,
            feeders: feederCandidate.tasks.filter(task => task.kind === "vocal"),
            feederSelectedOrder: feederCandidate.selectedOrder,
            signature: feederCandidate.signature ? `${alternative.signature}|${feederCandidate.signature}` : alternative.signature,
          },
          auxiliary,
          validation,
        },
      };
    }
    return failLeaf(auxiliaryReachedValidation ? "FINAL_HARD_VALIDATION_FAILED" : "AUXILIARY_PLACEMENT_FAILED");
  };

  let solution: LeafSolution | null = null;
  let budgetExhausted: SearchStopReason | null = null;
  let structuralCombinationsEvaluated = 0;
  searchSpace: for (const pattern of generatedPatterns.patterns) {
    counters.patternsEvaluated += 1;
    const compositeResult = requiredBlocks.length === 0 ? null : requiredCompositePositions(requiredBlocks, mains, pattern,
      problem.budget.maxPatterns - structuralCombinationsEvaluated);
    structuralCombinationsEvaluated += compositeResult?.rawCombinationCount ?? 0;
    if (compositeResult?.exhausted) return failure(problem, begun, "PATTERN_BUDGET_EXHAUSTED", counters);
    const compositePositions = compositeResult?.positions ?? [{ startIndexByResourceId: {}, signature: "" }];
    const timelines: Array<MainFlowTimeline | undefined> = withMeal
      ? candidateCuts(pattern).map(cut => buildTimeline(problem, pattern, duration, cut)) : [undefined];
    timelineCandidateCount += timelines.length;
    for (const timeline of timelines) for (const compositePosition of compositePositions) {
      const search = (state: MainAlternative, position: number): SearchResult => {
        counters.mainMaximumDepth = Math.max(counters.mainMaximumDepth, position);
        if (position === mains.length) return tryCompleteMainLeaf(state);
        const slot = timeline?.slots[position] ?? mainStart + position * duration;
        const candidates: MainAlternative[] = [];
        let feederPrefixBudgetExhausted = false;
        for (const task of mains) {
          if (task.blockKey !== pattern[position]
            || !taskFitsRequiredCompositePosition(task, position, requiredBlocks, compositePosition)
            || state.tasks.some(({ id }) => id === task.id)) continue;
          if (counters.branches >= problem.budget.maxBranchExpansions) {
            return { kind: "budget-exhausted", reason: "MAIN_BRANCH_BUDGET_EXHAUSTED" };
          }
          counters.branches += 1;
          const operation = materializeAnchoredOperation(problem, task, slot, state.tasks, timeline ? [timeline.meal] : []);
          if (anchoredAccompanimentIndex(problem).has(task.id)) {
            counters.anchoredCandidates += 1;
            if (!operation) counters.anchoredRejected += 1;
          }
          if (!operation) continue;
          const feeder = problem.tasks.find(candidate => candidate.kind === "vocal" && candidate.participantId === task.participantId);
          const participant = problem.participants.find(({ id }) => id === task.participantId);
          if (!feeder || !participant) continue;
          const deadline = operation.start - Math.max(problem.participantTransitionMinutes, problem.resourceTransitionMinutes);
          if (!participant.availability.some(window => window.start + feeder.duration <= deadline)) continue;
          const loss = participant.availability.filter(window => window.start <= slot && slot + duration <= window.end)
            .reduce((total, window) => total + Math.max(0, window.end - slot), 0);
          const originalIndex = mains.findIndex(({ id }) => id === task.id);
          const resourcePenalty = (task.requiredResourceIds ?? []).reduce((sum, resourceId) => {
            const resource = problem.resources.find(({ id }) => id === resourceId);
            return sum + (resource && resource.presenceConcentrationPolicy !== "PREFERRED"
              && resource.presenceConcentrationPolicy !== "REQUIRED"
              ? resourcePresenceIncrement(resourceId, state.tasks, operation.anchor) * presencePreferenceWeight(resource.presencePreference) : 0);
          }, 0);
          const tasks = [...state.tasks, ...operation.tasks];
          const candidate: MainAlternative = {
            tasks,
            score: state.score + loss + Math.abs(originalIndex - position) + resourcePenalty,
            participantScore: (state.participantScore ?? 0) + loss,
            signature: tasks.filter(task => task.kind === "main").map(({ id }) => id).join("|"),
            timeline,
          };
          const remainingMainTasks = mains.filter(main => !tasks.some(placed => placed.id === main.id));
          const remainingPositions = Array.from({ length: mains.length - position - 1 }, (_, offset) => {
            const residualPosition = position + offset + 1;
            return { position: residualPosition, slot: timeline?.slots[residualPosition] ?? mainStart + residualPosition * duration };
          });
          const matching = assessMainResidualMatching(problem, remainingMainTasks, remainingPositions, pattern, timeline,
            requiredBlocks, compositePosition, tasks, timeline ? [timeline.meal] : []);
          counters.mainMatchingChecks += 1;
          counters.mainMatchingEdges += matching.edgeEvaluationCount;
          if (!matching.feasible) {
            counters.mainMatchingPrunes += 1;
            counters.mainStructuralDeadEnds += 1;
            const depth = String(position + 1);
            counters.mainMatchingFailuresByDepth[depth] = (counters.mainMatchingFailuresByDepth[depth] ?? 0) + 1;
            for (const id of matching.unmatchedTaskIds) recordFailure(`MAIN_RESIDUAL_UNMATCHED:${id}`);
            continue;
          }
          const remainingBranchAllowance = problem.budget.maxBranchExpansions - counters.branches;
          const placedMainCount = tasks.filter(placed => placed.kind === "main").length;
          const prefixClosure = assessPlacedMainFeederClosure(problem, tasks, timeline ? [timeline.meal] : [],
            remainingBranchAllowance, placedMainCount === mains.length ? problem.budget.bestK : 1);
          counters.feederPrefixChecks += 1;
          counters.feederPrefixBranches += prefixClosure.consumedBranches;
          counters.branches += prefixClosure.consumedBranches;
          if (prefixClosure.exhausted) {
            feederPrefixBudgetExhausted = true;
            break;
          }
          if (!prefixClosure.feasible) {
            counters.feederPrefixPrunes += 1;
            counters.mainStructuralDeadEnds += 1;
            const depth = String(position + 1);
            counters.feederPrefixFailuresByDepth[depth] = (counters.feederPrefixFailuresByDepth[depth] ?? 0) + 1;
            for (const id of prefixClosure.blockingFeederIds) counters.feederPrefixBlockingFeeders[id] = (counters.feederPrefixBlockingFeeders[id] ?? 0) + 1;
            for (const id of prefixClosure.blockingMainTaskIds) counters.feederPrefixBlockingMains[id] = (counters.feederPrefixBlockingMains[id] ?? 0) + 1;
            recordFailure("FEEDER_PREFIX_CLOSURE_FAILED");
            continue;
          }
          candidate.prefixFeederClosure = prefixClosure;
          if (hasPreferredPresence) candidate.preferredPresenceTuple = preferredPresenceTuple(problem, candidate);
          candidates.push(candidate);
          counters.alternativesGenerated += 1;
        }
        if (feederPrefixBudgetExhausted) return { kind: "budget-exhausted", reason: "FEEDER_PREFIX_BRANCH_BUDGET_EXHAUSTED" };
        candidates.sort((a, b) => compareAlternatives(a, b, hasPreferredPresence));
        if (candidates.length > 1) counters.mainDecisionPoints += 1;
        if (candidates.length === 0) {
          counters.mainStructuralDeadEnds += 1;
          recordFailure("MAIN_DEAD_END");
          return { kind: "dead-end", reason: "MAIN_DEAD_END", failedLeaf: false };
        }
        let failedLeafInSubtree = false;
        for (let rank = 0; rank < candidates.length; rank += 1) {
          if (rank >= problem.budget.bestK) counters.mainDeferred += 1;
          const result = search(candidates[rank]!, position + 1);
          if (result.kind === "solution") {
            counters.mainFirstRank[String(position)] = rank;
            return result;
          }
          if (result.kind === "budget-exhausted") return result;
          failedLeafInSubtree ||= result.failedLeaf;
          if (result.failedLeaf && rank + 1 < candidates.length) {
            if (counters.backtracks >= problem.budget.maxBacktracks) {
              return { kind: "budget-exhausted", reason: "BACKTRACK_BUDGET_EXHAUSTED" };
            }
            counters.backtracks += 1;
          }
        }
        return { kind: "dead-end", reason: "MAIN_DEAD_END", failedLeaf: failedLeafInSubtree };
      };
      const result = search({ tasks: [], score: 0, participantScore: 0, signature: "", timeline }, 0);
      if (result.kind === "solution") {
        solution = result.value;
        break searchSpace;
      }
      if (result.kind === "budget-exhausted") {
        budgetExhausted = result.reason === "BACKTRACK_BUDGET_EXHAUSTED" ? "BACKTRACK_BUDGET_EXHAUSTED" : "BRANCH_BUDGET_EXHAUSTED";
        break searchSpace;
      }
    }
  }
  if (budgetExhausted) return failure(problem, begun, budgetExhausted, counters);
  if (!solution) return failure(problem, begun, "NO_COMPLETE_HARD_VALID_PLAN", counters);

  const alternative = solution.alternative;
  const auxiliary = solution.auxiliary;
  const validation = solution.validation;
  const all = auxiliary.tasks!;
  const preparations = auxiliary.preparations;
  const meals = auxiliary.meals;
    const ordered = [...all].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    const mainTasks = ordered.filter(({ kind }) => kind === "main");
    const firstMain = mainTasks[0];
    const lastMain = mainTasks.at(-1);
    if (!firstMain || !lastMain) return failure(problem, begun, "NO_COMPLETE_HARD_VALID_PLAN", counters);
    const runs: string[] = [];
    for (const task of mainTasks) {
      const key = task.blockKey;
      if (key && runs.at(-1) !== key) runs.push(key);
    }
    const blockCountByKey: Record<string, number> = {};
    for (const key of runs) blockCountByKey[key] = (blockCountByKey[key] ?? 0) + 1;
    const presence: Record<string, number> = {};
    for (const id of canonical(problem.participants).map(({ id }) => id)) {
      presence[id] = participantPresenceSpan(id, ordered);
    }
    const values = Object.values(presence);
    const resourcePresence = resourcePresenceMetrics(problem.resources, ordered, meals);
    const resourceRoute = resourceRouteMetrics(problem, ordered);
    const resourceValues = Object.values(resourcePresence.presenceMinutesById);
    const secondaryStartById: Record<string, number | null> = {}, secondaryEndById: Record<string, number | null> = {}, secondaryGapsById: Record<string, number> = {}, secondaryBlocksById: Record<string, number> = {};
    for (const space of requiredSecondarySpaces(problem)) { const tasks = secondaryTasks(ordered, space.id); const occupations = spaceOccupations(tasks, preparations, space.id, meals); secondaryStartById[space.id] = secondaryStart(occupations); secondaryEndById[space.id] = secondaryEnd(occupations); secondaryGapsById[space.id] = secondaryGapMinutes(occupations); secondaryBlocksById[space.id] = secondaryBlockCount(occupations); }
    const metrics: PlanMetrics = {
      ...validation,
      complete: true,
      plannedTaskCount: all.length,
      unplannedTaskCount: 0,
      mainFlowStart: firstMain.start,
      mainFlowEnd: lastMain.end,
      mainFlowGapMinutes: mainTasks.slice(1).reduce((total, task, mainIndex) => { const previous=mainTasks[mainIndex]; const gap=previous?Math.max(0,task.start-previous.end):0; return total+(alternative.timeline&&previous?.end===alternative.timeline.meal.start&&task.start===alternative.timeline.meal.end?0:gap); },0),
      mainFlowMealStart:alternative.timeline?.meal.start??null,mainFlowMealEnd:alternative.timeline?.meal.end??null,
      mainFlowMorningTaskCount:alternative.timeline?.morningTaskCount??mainTasks.length,mainFlowAfternoonTaskCount:alternative.timeline?.afternoonTaskCount??0,
      mainFlowSelectedSplitIndex:alternative.timeline?.splitIndex??null,mainFlowTimelineCandidateCount:timelineCandidateCount,
      mainFlowAllMorningAlternativeCount:alternative.timeline?.afternoonTaskCount===0?1:0,
      mainFlowSplitAlternativeCount:(alternative.timeline?.afternoonTaskCount??0)>0?1:0,
      blockSequence: runs,
      blockCountByKey,
      participantPresenceMinutesById: presence,
      totalParticipantPresenceMinutes: values.reduce((sum, value) => sum + value, 0),
      maxParticipantPresenceMinutes: values.length > 0 ? Math.max(...values) : 0,
      resourcePresenceMinutesById: resourcePresence.presenceMinutesById,
      resourceInternalGapMinutesById: resourcePresence.internalGapMinutesById,
      resourceOperationalBlockCountById: resourcePresence.operationalBlockCountById,
      resourceAuthorizedMealMinutesById: resourcePresence.authorizedMealMinutesById,
      resourceMoveCountById: resourceRoute.moveCountById,
      resourceTransitionSlackMinutesById: resourceRoute.transitionSlackMinutesById,
      totalResourcePresenceMinutes: resourceValues.reduce((sum, value) => sum + value, 0),
      maxResourcePresenceMinutes: resourceValues.length > 0 ? Math.max(...resourceValues) : 0,
      alternativesGenerated: counters.alternativesGenerated,
      alternativesRetained: counters.alternativesRetained,
      branchesExplored: counters.branches,
      backtracks: counters.backtracks,
      patternsGenerated: counters.patternsGenerated,
      patternsEvaluated: counters.patternsEvaluated,
      branchBudgetConsumed: counters.branches,
      feederClosureFallbackUsed:feederFallbackUsed,feederClosureBranchesExplored:feederBranches,feederClosureCompleteCandidateCount:feederFallbackUsed?feederCompleteCount:1,feederClosureMaximumPartialStates:feederMaximumStates,feederClosureSelectedOrder:alternative.feederSelectedOrder??[],feederClosureZeroAlternativeTaskIds:[],feederClosureRejectedStateBlockerIds:[...feederRejectedIds].sort(),
      searchStopReason: "SOLUTION_FOUND",
      runtimeMs: performance.now() - begun,
      planFingerprint: fingerprint(ordered, preparations,meals),
      auxiliaryTaskCount: problem.tasks.filter((x) => x.kind === "auxiliary").length,
      auxiliaryPlannedTaskCount: ordered.filter((x) => x.kind === "auxiliary").length,
      auxiliaryBranchesExplored: counters.auxiliaryBranches,
      auxiliarySelectionOrder: auxiliary?.selectionOrder ?? [],
      auxiliaryCandidateCountWhenSelectedByTaskId: auxiliary?.candidateCounts ?? {},
      saturatedResourceWindowBlockCount:auxiliary?.saturatedBlockCount??0,
      saturatedResourceWindowBlockPlannedCount:auxiliary?.saturatedBlockPlannedCount??0,
      saturatedResourceWindowBlockBranchesExplored:auxiliary?.saturatedBlockBranches??0,
      saturatedResourceWindowBlockCandidateCountByKey:auxiliary?.saturatedCandidateCounts??{},
      saturatedResourceWindowBlockTaskIdsByKey:auxiliary?.saturatedTaskIds??{},
      saturatedResourceWindowBlockResourceIdsByKey:auxiliary?.saturatedResourceIds??{},
      saturatedResourceWindowBlockStartByKey:auxiliary?.saturatedStarts??{},
      saturatedResourceWindowBlockEndByKey:auxiliary?.saturatedEnds??{},
      saturatedResourceWindowBlockSelectedOrderByKey:auxiliary?.saturatedSelectedOrders??{},
      secondaryBlockBranchesExplored: counters.secondaryBranches,
      auxiliaryWorkItemSelectionOrder: auxiliary?.workItemSelectionOrder ?? [],
      secondaryBlockCandidateCountWhenSelectedBySpaceId: auxiliary?.blockCandidateCounts ?? {},
      secondarySpaceStartById: secondaryStartById,
      secondarySpaceEndById: secondaryEndById,
      secondarySpaceGapMinutesById: secondaryGapsById,
      secondarySpaceBlockCountById: secondaryBlocksById,
      setupFamilySequenceBySpaceId: Object.fromEntries(setupSpaces(problem).map((space) => [space.id, setupFamilySequence(setupTasks(ordered, space.id))])),
      setupBlockCountBySpaceAndFamily: Object.fromEntries(setupSpaces(problem).flatMap((space) => Object.entries(setupBlockCounts(setupTasks(ordered, space.id))).map(([family, count]) => [`${space.id}|${family}`, count]))),
      setupSwitchCountBySpaceId: Object.fromEntries(setupSpaces(problem).map((space) => [space.id, setupSwitchCount(setupTasks(ordered, space.id))])),
      setupPreparationCount: preparations.length,
      setupPreparationMinutesBySpaceId: setupPreparationMinutesBySpace(preparations),
      setupPreparationCountBySpaceAndFamily: setupPreparationCounts(preparations),
      setupPreparationSequenceBySpaceId: Object.fromEntries(setupSpaces(problem).filter(space=>space.setupPolicy?.preparationMinutesByFamily).map(space=>[space.id,setupPreparationSequence(preparations.filter(p=>p.spaceId===space.id))])),
      jointGroupCount:new Set(problem.tasks.map(t=>t.jointGroupId).filter(Boolean)).size,
      jointScheduledTaskCount:ordered.filter(t=>t.jointGroupId!==undefined).length,
      jointGroupCandidateCountWhenSelectedById:auxiliary?.jointCandidateCounts??{},
      jointGroupStartById:Object.fromEntries([...new Set(problem.tasks.map(t=>t.jointGroupId).filter((x):x is string=>Boolean(x)))].sort().map(id=>[id,ordered.find(t=>t.jointGroupId===id)?.start??null])),
      jointGroupEndById:Object.fromEntries([...new Set(problem.tasks.map(t=>t.jointGroupId).filter((x):x is string=>Boolean(x)))].sort().map(id=>[id,ordered.find(t=>t.jointGroupId===id)?.end??null])),
      jointGroupParticipantIdsById:Object.fromEntries([...new Set(problem.tasks.map(t=>t.jointGroupId).filter((x):x is string=>Boolean(x)))].sort().map(id=>[id,problem.tasks.filter(t=>t.jointGroupId===id).map(t=>t.participantId).sort()])),
      ...technicalMetrics(problem.tasks, ordered),
      technicalOperationCandidateCountWhenSelectedById: auxiliary?.technicalCandidateCounts ?? {},
      technicalChainCount:getTechnicalChains(problem.tasks).length,
      technicalChainPlannedCount:getTechnicalChains(problem.tasks).filter(chain=>chain.every(t=>ordered.some(x=>x.id===t.id))).length,
      technicalChainScheduledTaskCount:getTechnicalChains(problem.tasks).flat().filter(t=>ordered.some(x=>x.id===t.id)).length,
      technicalChainCandidateCountWhenSelectedByRootId:auxiliary?.technicalChainCandidateCounts??{},
      technicalChainTaskIdsByRootId:Object.fromEntries(getTechnicalChains(problem.tasks).map(c=>[c[0]!.id,c.map(t=>t.id)])),
      technicalChainStartByRootId:Object.fromEntries(getTechnicalChains(problem.tasks).map(c=>[c[0]!.id,ordered.find(t=>t.id===c[0]!.id)?.start??null])),
      technicalChainEndByRootId:Object.fromEntries(getTechnicalChains(problem.tasks).map(c=>[c[0]!.id,ordered.find(t=>t.id===c.at(-1)!.id)?.end??null])),
      technicalChainBranchesExplored:auxiliary?.technicalChainBranches??0,
      spaceMealCount:problem.spaces.filter(s=>s.mealPolicy!==undefined).length,spaceMealPlannedCount:meals.length,spaceMealCandidateCountWhenSelectedBySpaceId:auxiliary?.mealCandidateCounts??{},spaceMealStartBySpaceId:Object.fromEntries(meals.map(m=>[m.spaceId,m.start])),spaceMealEndBySpaceId:Object.fromEntries(meals.map(m=>[m.spaceId,m.end])),spaceMealMinutesBySpaceId:Object.fromEntries(meals.map(m=>[m.spaceId,m.duration])),spaceMealBranchesExplored:auxiliary?.spaceMealBranches??0,
      futureFeasibilityChecks: counters.futureChecks, futureFeasibilityBranchesExplored: counters.futureBranches, futureInfeasibleCandidatesPruned: counters.futurePruned, futureTopRankedCandidatesPruned: counters.futureTopPruned, futureBlockerCountByWorkItemKey: counters.blockers, acceptedPathMinimumFutureAlternativeCount: counters.acceptedMinimum,
      mainBacktrackCount: counters.backtracks, mainMaximumSearchDepth: counters.mainMaximumDepth,
      mainCompleteLeafAttemptCount: counters.mainLeafAttempts, mainFailedLeafCount: counters.mainFailedLeaves,
      mainDeferredCandidateExploredCount: counters.mainDeferred, mainDecisionPointCount: counters.mainDecisionPoints,
      mainFailureCountByReason: counters.mainFailures, mainFirstSolutionRankByDepth: counters.mainFirstRank,
      mainResidualMatchingCheckCount: counters.mainMatchingChecks,
      mainResidualMatchingPruneCount: counters.mainMatchingPrunes,
      mainResidualMatchingEdgeEvaluationCount: counters.mainMatchingEdges,
      mainResidualMatchingFailureCountByDepth: counters.mainMatchingFailuresByDepth,
      mainStructuralDeadEndCount: counters.mainStructuralDeadEnds,
      feederPrefixClosureCheckCount: counters.feederPrefixChecks,
      feederPrefixClosurePruneCount: counters.feederPrefixPrunes,
      feederPrefixClosureBranchesExplored: counters.feederPrefixBranches,
      feederPrefixClosureFailureCountByDepth: counters.feederPrefixFailuresByDepth,
      feederPrefixBlockingCountByFeederId: counters.feederPrefixBlockingFeeders,
      feederPrefixBlockingCountByMainTaskId: counters.feederPrefixBlockingMains,
      ...anchoredMetrics(problem,ordered,counters.anchoredCandidates,counters.anchoredRejected),
    };
  return { complete: true, scheduledTasks: ordered, scheduledSetupPreparations: preparations, scheduledSpaceMeals:meals, metrics };
}

function anchoredMetrics(problem:PlannerNextProblem,scheduled:ScheduledTask[],candidates:number,rejected:number):Pick<PlanMetrics,"anchoredAccompanimentCount"|"anchoredAccompanimentPlannedCount"|"anchoredAccompanimentScheduledSegmentCount"|"anchoredAccompanimentCandidatePositionsEvaluated"|"anchoredAccompanimentRejectedPositionCount"|"anchoredAccompanimentAnchorTaskIdById"|"anchoredAccompanimentBeforeTaskIdsById"|"anchoredAccompanimentAfterTaskIdsById"|"anchoredAccompanimentOperationStartById"|"anchoredAccompanimentAnchorStartById"|"anchoredAccompanimentAnchorEndById"|"anchoredAccompanimentOperationEndById"|"anchoredAccompanimentTotalDurationById"|"anchoredAccompanimentAdjacencySatisfiedById"|"anchoredAccompanimentParticipantSatisfiedById"|"anchoredAccompanimentSpacesSatisfiedById"|"anchoredAccompanimentResourcesSatisfiedById"|"anchoredAccompanimentTaskWindowsSatisfiedById"|"anchoredAccompanimentCompleteById"|"anchoredAccompanimentRejectedReasonCountByCode">{
 const contracts=problem.anchoredAccompaniments??[],byId=new Map(scheduled.map(t=>[t.id,t])),expected=new Map(problem.tasks.map(t=>[t.id,t]));const record=<T>()=>({} as Record<string,T>);const anchor=record<string>(),before=record<string[]>(),after=record<string[]>(),opStart=record<number|null>(),aStart=record<number|null>(),aEnd=record<number|null>(),opEnd=record<number|null>(),duration=record<number>(),adj=record<boolean>(),participant=record<boolean>(),spaces=record<boolean>(),resources=record<boolean>(),windows=record<boolean>(),complete=record<boolean>();let planned=0,segments=0;
 for(const c of [...contracts].sort((a,b)=>a.id.localeCompare(b.id))){const ids=[...c.beforeTaskIds,c.anchorTaskId,...c.afterTaskIds],tasks=ids.map(id=>byId.get(id));anchor[c.id]=c.anchorTaskId;before[c.id]=[...c.beforeTaskIds];after[c.id]=[...c.afterTaskIds];opStart[c.id]=tasks[0]?.start??null;aStart[c.id]=byId.get(c.anchorTaskId)?.start??null;aEnd[c.id]=byId.get(c.anchorTaskId)?.end??null;opEnd[c.id]=tasks.at(-1)?.end??null;duration[c.id]=ids.reduce((n,id)=>n+(expected.get(id)?.duration??0),0);adj[c.id]=tasks.every(Boolean)&&tasks.slice(1).every((t,i)=>tasks[i]!.end===t!.start);participant[c.id]=tasks.every(t=>t?.participantId===tasks[0]?.participantId);spaces[c.id]=tasks.every((t,i)=>t?.spaceId===expected.get(ids[i]!)?.spaceId);resources[c.id]=tasks.every((t,i)=>JSON.stringify([...(t?.requiredResourceIds??[])].sort())===JSON.stringify([...(expected.get(ids[i]!)?.requiredResourceIds??[])].sort()));windows[c.id]=tasks.every((t,i)=>t&&t.end-t.start===expected.get(ids[i]!)?.duration);complete[c.id]=tasks.every(Boolean)&&adj[c.id]&&participant[c.id]&&spaces[c.id]&&resources[c.id]&&windows[c.id];if(complete[c.id])planned+=1;segments+=c.beforeTaskIds.filter(id=>byId.has(id)).length+c.afterTaskIds.filter(id=>byId.has(id)).length;}
 return {anchoredAccompanimentCount:contracts.length,anchoredAccompanimentPlannedCount:planned,anchoredAccompanimentScheduledSegmentCount:segments,anchoredAccompanimentCandidatePositionsEvaluated:candidates,anchoredAccompanimentRejectedPositionCount:rejected,anchoredAccompanimentAnchorTaskIdById:anchor,anchoredAccompanimentBeforeTaskIdsById:before,anchoredAccompanimentAfterTaskIdsById:after,anchoredAccompanimentOperationStartById:opStart,anchoredAccompanimentAnchorStartById:aStart,anchoredAccompanimentAnchorEndById:aEnd,anchoredAccompanimentOperationEndById:opEnd,anchoredAccompanimentTotalDurationById:duration,anchoredAccompanimentAdjacencySatisfiedById:adj,anchoredAccompanimentParticipantSatisfiedById:participant,anchoredAccompanimentSpacesSatisfiedById:spaces,anchoredAccompanimentResourcesSatisfiedById:resources,anchoredAccompanimentTaskWindowsSatisfiedById:windows,anchoredAccompanimentCompleteById:complete,anchoredAccompanimentRejectedReasonCountByCode:{}};
}
