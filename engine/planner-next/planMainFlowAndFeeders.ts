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
import { placeAuxiliaryTasks } from "./placeAuxiliaryTasks";
import { participantPresenceSpan } from "./participantPresence";
import { requiredSecondarySpaces, secondaryBlockCount, secondaryEnd, secondaryGapMinutes, secondaryStart, secondaryTasks } from "./secondaryContinuity";
import { setupPreparationCounts, setupPreparationMinutesBySpace, setupPreparationSequence, spaceOccupations } from "./setupPreparation";
import { setupBlockCounts, setupFamilySequence, setupSpaces, setupSwitchCount, setupTasks } from "./setupGrouping";
import { technicalMetrics } from "./technicalOperations";
import { getTechnicalChains } from "./technicalChains";
import { buildTimeline, candidateCuts, hasMainFlowMeal, type MainFlowTimeline } from "./mainFlowMeal";

import { hasExplicitMainFlowMeal } from "./spaceMeals";
import { closeFeeders } from "./feederClosure";
import { buildRequiredCompositeBlocks, requiredCompositePositions, taskFitsRequiredCompositePosition } from "./requiredCompositeBlock";
import { anchoredAccompanimentIndex, buildAnchoredExecutionContext, evaluateAnchoredAccompaniments, firstParticipantObligation, materializeAnchoredOperation, type AnchoredFailureReasonCode } from "./anchoredAccompaniment";
import { anchoredTaskIds } from "./anchoredAccompaniment";

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
  futureMinimumAlternativeCount?: number;
  futureTotalAlternativeCount?: number;
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
    return historical || (b.futureMinimumAlternativeCount??0)-(a.futureMinimumAlternativeCount??0)
      || (b.futureTotalAlternativeCount??0)-(a.futureTotalAlternativeCount??0) || a.signature.localeCompare(b.signature);
  }
  if (a.feederClosable !== b.feederClosable) return a.feederClosable ? -1 : 1;
  const left = a.preferredPresenceTuple ?? [0, 0, 0];
  const right = b.preferredPresenceTuple ?? [0, 0, 0];
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
    || historical || (b.futureMinimumAlternativeCount??0)-(a.futureMinimumAlternativeCount??0)
    || (b.futureTotalAlternativeCount??0)-(a.futureTotalAlternativeCount??0) || a.signature.localeCompare(b.signature);
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
  anchoredCandidates:number; anchoredAccepted:number; anchoredRejected:number; anchoredRejections:Record<string,number>; anchoredFutureProbes:number; anchoredFutureBranches:number; anchoredHardPrunes:number;
}

function canonical<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}
interface AnchoredFutureFeasibility { feasible:boolean; minimumAlternativeCount:number; totalAlternativeCount:number; blockerKeys:string[]; branchesConsumed:number }
function assessAnchoredFutureFeasibility(problem:PlannerNextProblem,placed:ScheduledTask[],meals:ScheduledSpaceMeal[]):AnchoredFutureFeasibility{
 if(!(problem.anchoredAccompaniments?.length))return {feasible:true,minimumAlternativeCount:0,totalAlternativeCount:0,blockerKeys:[],branchesConsumed:0};
 const excluded=anchoredTaskIds(problem),withFeeders=tryGreedyFeederClosure(problem,placed,meals)??placed, counts:number[]=[], blockers:string[]=[];let branches=0;
 for(const task of problem.tasks.filter(t=>(t.kind==="auxiliary"||t.kind==="technical")&&!excluded.has(t.id)&&!placed.some(x=>x.id===t.id)).sort((a,b)=>a.id.localeCompare(b.id))){let count=0;for(let start=problem.day.start;start+task.duration<=problem.day.end;start+=5){branches+=1;if(canPlaceTask(problem,task,start,withFeeders,meals))count+=1;}counts.push(count);if(count===0)blockers.push(task.id);}
 return {feasible:blockers.length===0,minimumAlternativeCount:counts.length?Math.min(...counts):0,totalAlternativeCount:counts.reduce((n,x)=>n+x,0),blockerKeys:blockers,branchesConsumed:branches};
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

export interface GreedyFeederClosureResult { complete:boolean; scheduledTasks:ScheduledTask[]; scheduledFeeders:ScheduledTask[]; attemptedFeederIds:string[]; placedFeederIds:string[]; blockingFeederId:string|null; blockingMainTaskId:string|null; attemptedStartCountByFeederId:Record<string,number> }
export function diagnoseGreedyFeederClosure(problem: PlannerNextProblem, mains: ScheduledTask[], scheduledSpaceMeals: ScheduledSpaceMeal[] = []): GreedyFeederClosureResult {
  const placed = [...mains];
  const attemptedFeederIds:string[]=[],placedFeederIds:string[]=[];const attemptedStartCountByFeederId:Record<string,number>={};
  const feederByParticipant = new Map(
    problem.tasks.filter(({ kind }) => kind === "vocal").map((task) => [task.participantId, task]),
  );
  const latestFirst = mains.filter(t=>t.kind==="main").sort((a, b) => b.start - a.start || a.id.localeCompare(b.id));
  for (const main of latestFirst) {
    const feeder = feederByParticipant.get(main.participantId);
    if (!feeder) return {complete:false,scheduledTasks:[],scheduledFeeders:[],attemptedFeederIds,placedFeederIds,blockingFeederId:null,blockingMainTaskId:main.id,attemptedStartCountByFeederId};
    attemptedFeederIds.push(feeder.id);attemptedStartCountByFeederId[feeder.id]=0;
    const deadline = firstParticipantObligation(main,placed,anchoredAccompanimentIndex(problem)) - Math.max(
      problem.participantTransitionMinutes,
      problem.resourceTransitionMinutes,
    );
    let selectedStart: number | undefined;
    for (let start = deadline - feeder.duration; start >= problem.day.start; start -= 5) {
      attemptedStartCountByFeederId[feeder.id] += 1;
      if (canPlaceTask(problem, feeder, start, placed, scheduledSpaceMeals)) {
        selectedStart = start;
        break;
      }
    }
    if (selectedStart === undefined) return {complete:false,scheduledTasks:[],scheduledFeeders:[],attemptedFeederIds,placedFeederIds,blockingFeederId:feeder.id,blockingMainTaskId:main.id,attemptedStartCountByFeederId};
    placed.push({ ...feeder, start: selectedStart, end: selectedStart + feeder.duration });
    placedFeederIds.push(feeder.id);
  }
  return {complete:true,scheduledTasks:placed,scheduledFeeders:placed.filter(t=>t.kind==="vocal"),attemptedFeederIds,placedFeederIds,blockingFeederId:null,blockingMainTaskId:null,attemptedStartCountByFeederId};
}
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
    anchoredAccompanimentCount:Array.isArray(problem.anchoredAccompaniments)?problem.anchoredAccompaniments.length:0,anchoredAccompanimentPlannedCount:0,anchoredAccompanimentScheduledSegmentCount:0,anchoredAccompanimentCandidatePositionsEvaluated:0,anchoredAccompanimentCandidatePositionsAccepted:0,anchoredAccompanimentRejectedPositionCount:0,anchoredAccompanimentFutureFeasibilityProbes:0,anchoredAccompanimentFutureFeasibilityBranchesConsumed:0,anchoredAccompanimentHardZeroAlternativePrunes:0,anchoredAccompanimentMinimumAlternativesOnAcceptedPath:0,anchoredAccompanimentAnchorTaskIdById:{},anchoredAccompanimentBeforeTaskIdsById:{},anchoredAccompanimentAfterTaskIdsById:{},anchoredAccompanimentOperationStartById:{},anchoredAccompanimentAnchorStartById:{},anchoredAccompanimentAnchorEndById:{},anchoredAccompanimentOperationEndById:{},anchoredAccompanimentTotalDurationById:{},anchoredAccompanimentAdjacencySatisfiedById:{},anchoredAccompanimentParticipantSatisfiedById:{},anchoredAccompanimentSpacesSatisfiedById:{},anchoredAccompanimentResourcesSatisfiedById:{},anchoredAccompanimentTaskWindowsSatisfiedById:{},anchoredAccompanimentCompleteById:{},anchoredAccompanimentContinuousResourceIdsById:{},anchoredAccompanimentRejectedReasonCountByCode:{},
    futureFeasibilityChecks: counters?.futureChecks ?? 0, futureFeasibilityBranchesExplored: counters?.futureBranches ?? 0, futureInfeasibleCandidatesPruned: counters?.futurePruned ?? 0, futureTopRankedCandidatesPruned: counters?.futureTopPruned ?? 0, futureBlockerCountByWorkItemKey: counters?.blockers ?? {}, acceptedPathMinimumFutureAlternativeCount: counters?.acceptedMinimum ?? 0,
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
    secondaryBranches: 0, futureChecks: 0, futureBranches: 0, futurePruned: 0, futureTopPruned: 0, blockers: {}, acceptedMinimum: 0, anchoredCandidates:0, anchoredAccepted:0, anchoredRejected:0, anchoredRejections:{}, anchoredFutureProbes:0, anchoredFutureBranches:0, anchoredHardPrunes:0,
  };
  if (generatedPatterns.exhausted) {
    return failure(problem, begun, "PATTERN_BUDGET_EXHAUSTED", counters);
  }

  const alternatives: MainAlternative[] = [];
  const anchoredContext=buildAnchoredExecutionContext(problem);
  let structuralCombinationsEvaluated = 0;
  for (const pattern of generatedPatterns.patterns) {
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
    let beam: MainAlternative[] = [{ tasks: [], score: 0, participantScore: 0, signature: "", timeline }];
    for (let position = 0; position < mains.length && beam.length > 0; position += 1) {
      const next: MainAlternative[] = [];
      const slot = timeline?.slots[position] ?? mainStart + position * duration;
      for (const state of beam) {
        for (const task of mains) {
          if (requiredBlocks.length > 0 && (task.blockKey !== pattern[position]
            || !taskFitsRequiredCompositePosition(task, position, requiredBlocks, compositePosition))) continue;
          if (counters.branches >= problem.budget.maxBranchExpansions) {
            return failure(problem, begun, "BRANCH_BUDGET_EXHAUSTED", counters);
          }
          counters.branches += 1;
          if (task.blockKey !== pattern[position]
            || !taskFitsRequiredCompositePosition(task, position, requiredBlocks, compositePosition)
            || state.tasks.some(({ id }) => id === task.id)) continue;
          const materialized=materializeAnchoredOperation(problem,task,slot,state.tasks,timeline?[timeline.meal]:[],anchoredContext);
          if(anchoredContext.contractByAnchorTaskId.has(task.id)){counters.anchoredCandidates+=1;if(!materialized.success){counters.anchoredRejected+=1;for(const reason of materialized.reasonCodes)counters.anchoredRejections[reason]=(counters.anchoredRejections[reason]??0)+1;}else counters.anchoredAccepted+=1;}
          if (!materialized.success) continue;
          const operation=materialized.operation, provisional=[...state.tasks,...operation.tasks];
          const feeder = problem.tasks.find(
            (candidate) => candidate.kind === "vocal" && candidate.participantId === task.participantId,
          );
          const participant = problem.participants.find(({ id }) => id === task.participantId);
          if (!feeder || !participant) continue;
          const deadline = operation.start - Math.max(
            problem.participantTransitionMinutes,
            problem.resourceTransitionMinutes,
          );
          if (!participant.availability.some((window) => window.start + feeder.duration <= deadline)) continue;
          const loss = participant.availability
            .filter((window) => window.start <= slot && slot + duration <= window.end)
            .reduce((total, window) => total + Math.max(0, window.end - slot), 0);
          const originalIndex = mains.findIndex(({ id }) => id === task.id);
          const scheduledTask = operation.anchor;
          const resourcePenalty = (task.requiredResourceIds ?? []).reduce((sum, resourceId) => {
            const resource = problem.resources.find(({ id }) => id === resourceId);
            return sum + (resource && resource.presenceConcentrationPolicy !== "PREFERRED"
              && resource.presenceConcentrationPolicy !== "REQUIRED" ? resourcePresenceIncrement(resourceId, state.tasks, scheduledTask)
              * presencePreferenceWeight(resource.presencePreference) : 0);
          }, 0);
          const score = state.score + loss + Math.abs(originalIndex - position) + resourcePenalty;
          const tasks = provisional;
          const future=assessAnchoredFutureFeasibility(problem,tasks,timeline?[timeline.meal]:[]);counters.anchoredFutureProbes+=1;counters.anchoredFutureBranches+=future.branchesConsumed;
          if(!future.feasible){counters.anchoredHardPrunes+=1;continue;}
          const candidate: MainAlternative = { tasks, score, futureMinimumAlternativeCount:future.minimumAlternativeCount,futureTotalAlternativeCount:future.totalAlternativeCount, participantScore: (state.participantScore ?? 0) + loss, signature: tasks.filter(t=>t.kind==="main").map(({ id }) => id).join("|"), timeline };
          if (hasPreferredPresence) candidate.preferredPresenceTuple = preferredPresenceTuple(problem, candidate);
          if (hasPreferredPresence) {
            candidate.feederClosable = tryGreedyFeederClosure(problem, tasks, timeline ? [timeline.meal] : []) !== null;
          }
          if (hasPreferredPresence && position === mains.length - 2) {
            const finalSlot = timeline?.slots[position + 1] ?? mainStart + (position + 1) * duration;
            const completions = mains.filter((remaining) => remaining.blockKey === pattern[position + 1]
              && !tasks.some(({ id }) => id === remaining.id)
              && materializeAnchoredOperation(problem,remaining,finalSlot,tasks,timeline?[timeline.meal]:[],anchoredContext).success)
              .map((remaining) => materializeAnchoredOperation(problem,remaining,finalSlot,tasks,timeline?[timeline.meal]:[],anchoredContext))
              .filter(result=>result.success)
              .map((result) => [...tasks, ...result.operation.tasks]);
            const closable = completions.filter((completion) => tryGreedyFeederClosure(problem, completion, timeline ? [timeline.meal] : []) !== null);
            if (closable.length > 0) {
              candidate.feederClosable = true;
              candidate.preferredPresenceTuple = closable.map((completion) => preferredPresenceTuple(problem, { ...candidate, tasks: completion }))
                .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])[0];
            } else candidate.feederClosable = false;
          }
          if (hasPreferredPresence && position === mains.length - 1) {
            candidate.feederClosable = tryGreedyFeederClosure(problem, tasks, timeline ? [timeline.meal] : []) !== null;
          }
          next.push(candidate);
          counters.alternativesGenerated += 1;
        }
      }
      beam = next
        .sort((a, b) => compareAlternatives(a, b, hasPreferredPresence))
        .slice(0, problem.budget.bestK);
    }
    alternatives.push(...beam);
    }
  }
  let feederFallbackUsed=false,feederBranches=0,feederCompleteCount=0,feederMaximumStates=0;
  const feederRejectedIds:string[]=[];
  const feederClosedAlternatives:MainAlternative[]=[];
  for(const alternative of alternatives){
    const meals=alternative.timeline?[alternative.timeline.meal]:[];
    const requiredValid = problem.resources.every((resource) => resource.presenceConcentrationPolicy !== "REQUIRED"
      || evaluateResourcePresence(resource, alternative.tasks, meals).requiredPolicySatisfied);
    if (!requiredValid) continue;
    const greedy=tryGreedyFeederClosure(problem,alternative.tasks,meals);
    if(greedy){feederClosedAlternatives.push({...alternative,feeders:greedy.filter(t=>t.kind==="vocal"),feederScore:greedy.filter(t=>t.kind==="vocal").reduce((sum,f)=>sum+(alternative.tasks.find(m=>m.participantId===f.participantId)?.end??f.end)-f.start,0)});continue}
    if(!hasExplicitMainFlowMeal(problem))continue;
    feederFallbackUsed=true;
    const closure=closeFeeders(problem,alternative.tasks,meals,Math.max(0,problem.budget.maxBranchExpansions-counters.branches));
    feederBranches+=closure.diagnostics.consumed;counters.branches+=closure.diagnostics.consumed;
    feederCompleteCount+=closure.diagnostics.completeClosuresGenerated;
    feederMaximumStates=Math.max(feederMaximumStates,closure.diagnostics.maximumPartialStates);
    for(const id of closure.diagnostics.rejectedStateBlockerIds)if(!feederRejectedIds.includes(id))feederRejectedIds.push(id);
    if(closure.diagnostics.exhausted)return failure(problem,begun,"BRANCH_BUDGET_EXHAUSTED",counters);
    for(const candidate of closure.candidates)feederClosedAlternatives.push({...alternative,feeders:candidate.feeders,feederScore:candidate.cost,feederSelectedOrder:candidate.selectedFeederOrder,signature:`${alternative.signature}|${candidate.signature}`});
  }
  const retained = withMeal
    ? [...new Map(candidateCuts(generatedPatterns.patterns[0] ?? []).map(cut => [cut, feederClosedAlternatives.filter(a=>a.timeline?.splitIndex===cut).sort((a,b)=>compareAlternatives(a,b,hasPreferredPresence)).slice(0,problem.budget.bestK)])).values()].flat()
    : alternatives.sort((a,b)=>compareAlternatives(a,b,hasPreferredPresence)).slice(0,problem.budget.bestK);
  counters.alternativesRetained = retained.length;

  for (let index = 0; index < retained.length; index += 1) {
    const alternative = retained[index];
    if (!alternative) continue;
    const initialMeals = alternative.timeline ? [alternative.timeline.meal] : [];
    const core = alternative.feeders ? [...alternative.tasks,...alternative.feeders] : tryGreedyFeederClosure(problem,alternative.tasks,initialMeals);
    const auxiliary = core ? placeAuxiliaryTasks(problem, core, Math.max(0, problem.budget.maxBranchExpansions - counters.branches), initialMeals) : null;
    if (auxiliary) { counters.auxiliaryBranches += auxiliary.branches; counters.branches += auxiliary.branches; }
    if (auxiliary) { counters.secondaryBranches += auxiliary.secondaryBranches; counters.futureChecks += auxiliary.futureChecks; counters.futureBranches += auxiliary.futureBranches; counters.futurePruned += auxiliary.futurePruned; counters.futureTopPruned += auxiliary.futureTopPruned; counters.acceptedMinimum = auxiliary.acceptedMinimum; for (const [key,value] of Object.entries(auxiliary.blockers)) counters.blockers[key]=(counters.blockers[key]??0)+value; }
    if (auxiliary?.futureExhausted) return failure(problem, begun, "FUTURE_FEASIBILITY_BRANCH_BUDGET_EXHAUSTED", counters);
    if (auxiliary?.secondaryExhausted) return failure(problem, begun, "SECONDARY_BLOCK_BRANCH_BUDGET_EXHAUSTED", counters);
    if (auxiliary?.exhausted) return failure(problem, begun, "AUXILIARY_BRANCH_BUDGET_EXHAUSTED", counters);
    const all = auxiliary?.tasks ?? null;
    const preparations = auxiliary?.preparations ?? [];
    const meals=auxiliary?.meals??[];
    const validation = all ? validatePlan(problem, all, preparations,meals) : null;
    if (!all || !validation?.hardValid) {
      const hasNext = index + 1 < retained.length;
      if (!hasNext) break;
      if (counters.backtracks >= problem.budget.maxBacktracks) {
        return failure(problem, begun, "BACKTRACK_BUDGET_EXHAUSTED", counters);
      }
      counters.backtracks += 1;
      continue;
    }

    const ordered = [...all].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    const mainTasks = ordered.filter(({ kind }) => kind === "main");
    const firstMain = mainTasks[0];
    const lastMain = mainTasks.at(-1);
    if (!firstMain || !lastMain) break;
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
      mainFlowAllMorningAlternativeCount:feederClosedAlternatives.filter(a=>a.timeline?.afternoonTaskCount===0).length,
      mainFlowSplitAlternativeCount:feederClosedAlternatives.filter(a=>(a.timeline?.afternoonTaskCount??0)>0).length,
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
      ...anchoredMetrics(problem,ordered,counters),
    };
    return { complete: true, scheduledTasks: ordered, scheduledSetupPreparations: preparations, scheduledSpaceMeals:meals, metrics };
  }
  return failure(problem, begun, "NO_COMPLETE_HARD_VALID_PLAN", counters);
}

function anchoredMetrics(problem:PlannerNextProblem,scheduled:ScheduledTask[],counters:Counters):Pick<PlanMetrics,"anchoredAccompanimentCount"|"anchoredAccompanimentPlannedCount"|"anchoredAccompanimentScheduledSegmentCount"|"anchoredAccompanimentCandidatePositionsEvaluated"|"anchoredAccompanimentCandidatePositionsAccepted"|"anchoredAccompanimentRejectedPositionCount"|"anchoredAccompanimentFutureFeasibilityProbes"|"anchoredAccompanimentFutureFeasibilityBranchesConsumed"|"anchoredAccompanimentHardZeroAlternativePrunes"|"anchoredAccompanimentMinimumAlternativesOnAcceptedPath"|"anchoredAccompanimentAnchorTaskIdById"|"anchoredAccompanimentBeforeTaskIdsById"|"anchoredAccompanimentAfterTaskIdsById"|"anchoredAccompanimentOperationStartById"|"anchoredAccompanimentAnchorStartById"|"anchoredAccompanimentAnchorEndById"|"anchoredAccompanimentOperationEndById"|"anchoredAccompanimentTotalDurationById"|"anchoredAccompanimentAdjacencySatisfiedById"|"anchoredAccompanimentParticipantSatisfiedById"|"anchoredAccompanimentSpacesSatisfiedById"|"anchoredAccompanimentResourcesSatisfiedById"|"anchoredAccompanimentTaskWindowsSatisfiedById"|"anchoredAccompanimentCompleteById"|"anchoredAccompanimentContinuousResourceIdsById"|"anchoredAccompanimentRejectedReasonCountByCode">{
 const contracts=problem.anchoredAccompaniments??[],byId=new Map(scheduled.map(t=>[t.id,t])),expected=new Map(problem.tasks.map(t=>[t.id,t])),evaluation=new Map(evaluateAnchoredAccompaniments(problem,scheduled).map(e=>[e.contractId,e]));const record=<T>()=>({} as Record<string,T>);const anchor=record<string>(),before=record<string[]>(),after=record<string[]>(),opStart=record<number|null>(),aStart=record<number|null>(),aEnd=record<number|null>(),opEnd=record<number|null>(),duration=record<number>(),adj=record<boolean>(),participant=record<boolean>(),spaces=record<boolean>(),resources=record<boolean>(),windows=record<boolean>(),complete=record<boolean>(),continuous=record<string[]>();let planned=0,segments=0;
 for(const c of [...contracts].sort((a,b)=>a.id.localeCompare(b.id))){const ids=[...c.beforeTaskIds,c.anchorTaskId,...c.afterTaskIds],tasks=ids.map(id=>byId.get(id)),e=evaluation.get(c.id)!;anchor[c.id]=c.anchorTaskId;before[c.id]=[...c.beforeTaskIds];after[c.id]=[...c.afterTaskIds];opStart[c.id]=tasks[0]?.start??null;aStart[c.id]=byId.get(c.anchorTaskId)?.start??null;aEnd[c.id]=byId.get(c.anchorTaskId)?.end??null;opEnd[c.id]=tasks.at(-1)?.end??null;duration[c.id]=ids.reduce((n,id)=>n+(expected.get(id)?.duration??0),0);adj[c.id]=e.adjacencySatisfied;participant[c.id]=e.participantSatisfied;spaces[c.id]=tasks.every((t,i)=>t?.spaceId===expected.get(ids[i]!)?.spaceId);resources[c.id]=e.resourcesSatisfied;windows[c.id]=e.taskWindowsSatisfied;complete[c.id]=e.complete;continuous[c.id]=e.continuousResourceIds;if(e.complete)planned+=1;segments+=c.beforeTaskIds.filter(id=>byId.has(id)).length+c.afterTaskIds.filter(id=>byId.has(id)).length;}
 return {anchoredAccompanimentCount:contracts.length,anchoredAccompanimentPlannedCount:planned,anchoredAccompanimentScheduledSegmentCount:segments,anchoredAccompanimentCandidatePositionsEvaluated:counters.anchoredCandidates,anchoredAccompanimentCandidatePositionsAccepted:counters.anchoredAccepted,anchoredAccompanimentRejectedPositionCount:counters.anchoredRejected,anchoredAccompanimentFutureFeasibilityProbes:counters.anchoredFutureProbes,anchoredAccompanimentFutureFeasibilityBranchesConsumed:counters.anchoredFutureBranches,anchoredAccompanimentHardZeroAlternativePrunes:counters.anchoredHardPrunes,anchoredAccompanimentMinimumAlternativesOnAcceptedPath:0,anchoredAccompanimentAnchorTaskIdById:anchor,anchoredAccompanimentBeforeTaskIdsById:before,anchoredAccompanimentAfterTaskIdsById:after,anchoredAccompanimentOperationStartById:opStart,anchoredAccompanimentAnchorStartById:aStart,anchoredAccompanimentAnchorEndById:aEnd,anchoredAccompanimentOperationEndById:opEnd,anchoredAccompanimentTotalDurationById:duration,anchoredAccompanimentAdjacencySatisfiedById:adj,anchoredAccompanimentParticipantSatisfiedById:participant,anchoredAccompanimentSpacesSatisfiedById:spaces,anchoredAccompanimentResourcesSatisfiedById:resources,anchoredAccompanimentTaskWindowsSatisfiedById:windows,anchoredAccompanimentCompleteById:complete,anchoredAccompanimentContinuousResourceIdsById:continuous,anchoredAccompanimentRejectedReasonCountByCode:Object.fromEntries(Object.entries(counters.anchoredRejections).sort(([a],[b])=>a.localeCompare(b)))};
}
