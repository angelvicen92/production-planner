import type { PlannerNextProblem, ScheduledOperationalMeal, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { createHash } from "node:crypto";
import { anchoredTaskIds, materializeAnchoredOperation } from "./anchoredAccompaniment";
import { fingerprint } from "./fingerprint";
import { materializeScheduledItinerantUnitMeals } from "./itinerantUnitMeals";
import { buildTimeline, candidateTimelineDomain, hasMainFlowMeal, mainFlowMealIsOperational, mainFlowOperationalMealPolicy, type MainFlowTimeline } from "./mainFlowMeal";
import { generateMainFlowPatternRunLayers, optimisticPrerequisiteLeadInMinutes, proveMainFeederArchitectureImpossible,
  type MainFeederStructuralRejection } from "./mainFlowPatterns";
import { canPlaceTask, diagnoseTaskPlacement, effectiveResourceTransitionMinutes, prepareTaskPlacementAuthority, type PlacementRejectionReason } from "./placement";
import { effectiveCoachTransitionMinutes, latestFeederEndBeforeMain } from "./coachRouteTransitions";
import { buildRequiredCompositeBlocks, requiredCompositePositions, taskFitsRequiredCompositePosition, type RequiredCompositePosition } from "./requiredCompositeBlock";
import { createScheduledSpaceMeal } from "./spaceMeals";
import { preflight, validatePlan } from "./validate";

export type ExactMainAndFeederCoreStatus = "COMPLETE" | "PREFLIGHT_FAILED" | "UNSUPPORTED_CORE_SHAPE"
  | "INFEASIBLE" | "BRANCH_BUDGET_EXHAUSTED";

export interface ExactCoreLeafShapeRejection {
  expectedCount: number;
  actualCount: number;
  missingTaskIds: string[];
  extraTaskIds: string[];
  architectureKey: string | null;
  timelineKey: string | null;
}

export type ExactCoreLeafHardValidationRejection = ReturnType<typeof validatePlan> & {
  architectureKey: string | null;
  timelineKey: string | null;
  mealStart: number | null;
  mealSplit: number | null;
};

export interface ExactMainAndFeederCoreEvidence {
  branchesExplored: number;
  patternCandidatesExplored: number;
  timelineCandidatesExplored: number;
  mealTimelineDomainCount: number;
  mealTimelinesExplored: number;
  mealTimelinesEliminatedAnalytically: number;
  mealTimelinesPreferred: number;
  mealTimelinesNonPreferred: number;
  mealTimelinesPendingAtExhaustion: number;
  mainCandidatesEvaluated: number;
  feederCandidatesEvaluated: number;
  constructiveFeederStartChecks: number;
  matchingFeederStartChecks: number;
  residualMatchingChecks: number;
  residualMatchingInvocations: number;
  residualMatchingFullBuilds: number;
  residualMatchingIncrementalUpdates: number;
  residualMatchingEdgeCacheHits: number;
  residualMatchingEdgeCacheMisses: number;
  residualMatchingPositionChecks: number;
  residualMatchingAugmentTraversals: number;
  residualMatchingBranchesExplored: number;
  residualMatchingPrunes: number;
  residualMatchingRepairs: number;
  residualMatchingRepairFailures: number;
  mainWitnessChoicesFollowed: number;
  mainWitnessFallbacks: number;
  mainRunWitnessAttempts: number;
  mainRunWitnessRepairs: number;
  mainRunEquivalentOrdersCollapsed: number;
  feederMatchingWitnessMaterializations: number;
  feederMatchingWitnessRepairs: number;
  feederMatchingEquivalentOrdersCollapsed: number;
  feederOrderFallbacks: number;
  forcedMainSingletonChecks: number;
  forcedMainSingletonChoices: number;
  forcedMainSiblingAlternativesEliminated: number;
  forcedMainSingletonDeadEnds: number;
  mainCandidatesExploredBeforeCohort: Record<string, number>;
  zeroAlternativePrunes: number;
  backtracks: number;
  maximumDepth: number;
  completeLeafCount: number;
  coreLeafValidationAttempts: number;
  coreLeafValidShapeRejects: number;
  coreLeafHardValidationRejects: number;
  coreLeafValidationAccepted: number;
  coreLeafValidationReasonCounts: Record<string, number>;
  firstCoreLeafShapeRejection: ExactCoreLeafShapeRejection | null;
  firstCoreLeafHardValidationRejection: ExactCoreLeafHardValidationRejection | null;
  selectedPattern: string[] | null;
  selectedTimelineKey: string | null;
  selectedMainTaskIds: string[];
  selectedFeederTaskIds: string[];
  coreFingerprint: string | null;
  reasonCodes: string[];
  architecturesChecked: number;
  architecturesStructurallyRejected: number;
  structuralRejectionsByReason: Partial<Record<MainFeederStructuralRejection, number>>;
  runLayers: Array<{ runCount: number; patternsGenerated: number; architecturesChecked: number;
    rejectionReasons: Partial<Record<MainFeederStructuralRejection, number>> }>;
  firstExactArchitecture: string | null;
  firstFeedableRunSizes: number[];
  feederOrderBranchesByArchitecture: Record<string, number>;
  feederOrderBranches: number;
  feederSlotAnalyticChecks: number;
  feederSlotAnalyticPrunes: number;
  feederSlotAnalyticAbstentions: number;
  feederSlotMatchingChecks: number;
  feederSlotMatchingPrunes: number;
  feederSlotMatchingEdgeChecks: number;
  feederSlotMatchingAugmentTraversals: number;
  feederSlotMatchingBranchesExplored: number;
  feederSlotIntervalCertificates: number;
  feederSlotExplicitFallbacks: number;
  feederSlotLazyRepairBuilds: number;
  feederCohortCapacityChecks: number;
  feederCohortPrefixCapacityPrunes: number;
  feederCohortEddChecks: number;
  feederCohortEddEmptyPrunes: number;
  blockStartsEliminatedByCohortBound: number;
  feederCohortContiguousWindowChecks: number;
  feederCohortContiguousWindowPrunes: number;
  blockStartsEliminatedByContiguousWindowBound: number;
  contiguousWindowSkippedByTransition: number;
  contiguousWindowSkippedByAuthorizedMeal: number;
  feederRunOptimisticChecks: number;
  feederRunOptimisticPrunes: number;
  feederRunOptimisticPrunesByDepth: Record<string, number>;
  feederRunPrePartialChecks: number;
  feederRunPrePartialPrunes: number;
  feederRunPrePartialPrunesByDepth: Record<string, number>;
  feederRunPreFeederChecks: number;
  feederRunPreFeederPrunes: number;
  feederRunPreFeederPrunesByDepth: Record<string, number>;
  feederRunOptimisticSkippedByTransition: number;
  feederRunOptimisticSkippedByAuthorizedMeal: number;
  causalDiagnostic: ExactCoreCausalDiagnostic | null;
}

export type ExactBranchCategory = "MAIN_CANDIDATE" | "FEEDER_START" | "RESIDUAL_MATCHING" | "CONTINUATION"
  | "PARTICIPANT_MEAL" | "STANDALONE_FORWARD" | "OTHER";
export interface ExactDepthWaterfall { mainCandidate:number; feederStart:number; residualMatching:number; continuation:number; participantMeal:number; standaloneForward:number; other:number; total:number }
export interface ExactDepthFeeder { startsConsidered:number; startsCoachEliminated:number; startsEvaluated:number; valid:number; invalid:number; mainChoicesReachingFeeder:number; mainChoicesWithValidFeeder:number }
export interface ExactCriticalFeederRejection { depth:number; mainTaskId:string; feederTaskId:string; participantId:string|null; startsAttempted:number; firstRejectionReason:PlacementRejectionReason; blockingPlacedTaskId:string|null; blockingDecisionDepth:number|null; blockingDecisionMainTaskId:string|null; count:number }
export interface ExactFeederCoachDomainElimination { depth:number; mainTaskId:string; feederTaskId:string; participantId:string|null; reason:"OVERLAP_COACH"|"TRANSITION_COACH"; blockingPlacedTaskId:string; blockingDecisionDepth:number|null; blockingDecisionMainTaskId:string|null; startsEliminated:number }
export interface ExactFutureFeasibilityCausalAssessment { depth:number; taskId:string; authoritySignature:string; resultSignature:string; domainEmpty:boolean; eligibleStartCount:number; blockers:string[]; ancestralDecisionDepths:number[]; certifiedBackjumpTargetDepth:number|null; occurrences:number }
export interface ExactFutureFeasibilityAuthorityCollision { depth:number; taskId:string; authoritySignature:string; resultSignatures:string[] }
export interface ExactFutureFeasibilityCausalSummary { totalEvaluations:number; uniqueAuthorityStates:number; repeatedEvaluations:number; authorityResultCollisions:number; negativeEvaluations:number; repeatedNegativeEvaluations:number; rejectsWithCertifiedBackjumpTarget:number; evaluationsByDepth:Record<string,number>; repeatedByDepth:Record<string,number>; negativeByDepth:Record<string,number>; assessments:ExactFutureFeasibilityCausalAssessment[]; collisions:ExactFutureFeasibilityAuthorityCollision[] }
export interface ExactStandaloneFrontierCertificate { failure:string|null;authorityId:string|null;demandMinutes:number|null;freeCapacityMinutes:number|null;blockingTaskId:string|null;overloadTaskIds:string[];pivotDepth:number|null;frequency:number }
export interface ExactStandaloneFrontierCoreTask { id:string;start:number;end:number;kind:string;decisionDepth:number|null }
export interface ExactStandaloneFrontierPrefixCheck { prefixDepth:number;failure:string|null;authorityId:string|null;demandMinutes:number|null;freeCapacityMinutes:number|null;certificatePersists:boolean }
export interface ExactStandaloneFrontierExample { certificate:Omit<ExactStandaloneFrontierCertificate,"frequency">;overloadTasks:Array<{id:string;duration:number;kind:string;authorityId:string|null}>;consumingCoreTasks:ExactStandaloneFrontierCoreTask[];introducedByPivot:ExactStandaloneFrontierCoreTask[];prefixChecks:ExactStandaloneFrontierPrefixCheck[];pivotPairProven:boolean }
export interface ExactStandaloneFrontierCausalSummary { totalRejections:number;certificates:ExactStandaloneFrontierCertificate[];examples:ExactStandaloneFrontierExample[] }
export type ExactFeederMatchingRepairTrigger="RESIDUAL_MATCHING_DEAD_END"|"PARTIAL_CORE_REJECT"|"CHILD_DEAD_END";
export interface ExactPartialCoreRejectionCertificate { authorityId:string|null;demandMinutes:number|null;freeCapacityMinutes:number|null;overloadTaskIds:string[] }
export interface ExactFeederMatchingContextDiagnostic {
  fingerprint:string;depth:number;runEnd:number;blockStart:number;cohortSize:number;distinctFeederProfiles:number;
  edgeCount:number;domainSizes:number[];witnessMaterializations:number;rejectedWitnesses:number;repairAttempts:number;
  successfulRepairs:number;failedRepairs:number;augmentTraversals:number;equivalentOrdersCollapsed:number;
  distinctOrderFingerprints:number;repairsByTrigger:Record<ExactFeederMatchingRepairTrigger,number>;
  partialCoreRejects:Array<{certificate:ExactPartialCoreRejectionCertificate|null;rejectedWitnesses:number;repairAttempts:number;augmentTraversals:number;distinctOrderFingerprints:number}>;
}
export interface ExactFeederMatchingCausalSummary { contexts:ExactFeederMatchingContextDiagnostic[];overflowContexts:number }
export interface ExactMacroCapacityCheck { evaluated:boolean;overloaded:boolean;authorityId:string;demandMinutes:number|null;freeCapacityMinutes:number|null;overloadTaskIds:string[] }
export type ExactMacroCapacityCausalAssessment="INTRODUCED_BY_CANDIDATE"|"PREEXISTING"|"UNRESOLVED";
export interface ExactMacroCapacityTask { taskId:string;participantId:string|null;kind:string;spaceId:string;duration:number;requiredResourceIds:string[] }
export interface ExactMacroCapacityPlacement { taskId:string;participantId:string|null;kind:string;start:number;end:number;spaceId:string;requiredResourceIds:string[] }
export interface ExactMacroCapacityCertificate {
  frequency:number;authorityId:string|null;demandMinutes:number|null;freeCapacityMinutes:number|null;overloadTaskIds:string[];
  blockingTaskId:string|null;causingMacroUnitId:string;macroDepth:number;overloadTasks:ExactMacroCapacityTask[];
  candidatePlacement:{macroUnitId:string;taskIds:string[];participantId:string|null;kind:string;start:number;end:number;spaceId:string;requiredResourceIds:string[];tasks:ExactMacroCapacityPlacement[]};
  priorRelevantPlacements:ExactMacroCapacityPlacement[];beforeCandidate:ExactMacroCapacityCheck;afterCandidate:ExactMacroCapacityCheck;
  afterMatchesNormalCertificate:boolean;causalAssessment:ExactMacroCapacityCausalAssessment;candidateIntroducesCertificate:boolean;
}
export interface ExactCoreCausalDiagnostic { waterfallByDepth:Record<string,ExactDepthWaterfall>; feederByDepth:Record<string,ExactDepthFeeder>; feederRejections:ExactCriticalFeederRejection[]; feederCoachDomainEliminations:ExactFeederCoachDomainElimination[]; feederMatching:ExactFeederMatchingCausalSummary; futureFeasibility:ExactFutureFeasibilityCausalSummary; standaloneFrontier:ExactStandaloneFrontierCausalSummary;macroPendingPrerequisiteCapacityCertificates:ExactMacroCapacityCertificate[];macroPendingPrerequisiteCapacityCertificateOverflow:number }

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

interface ResidualMatchingEdge {
  readonly position: number;
  readonly operation: readonly ScheduledTask[];
}

/** A successful, branch-local proof that every remaining main has a distinct position. */
interface ResidualMatchingCertificate {
  readonly taskIds: readonly string[];
  readonly positions: readonly number[];
  readonly validEdges: ReadonlyMap<string, readonly ResidualMatchingEdge[]>;
  readonly invalidPositions: ReadonlyMap<string, ReadonlySet<number>>;
  readonly matching: ReadonlyMap<string, number>;
}

interface ResidualMatchingResult {
  readonly outcome: SearchOutcome;
  readonly certificate?: ResidualMatchingCertificate;
}

/** Returns the task whose current residual domain proves that it must occupy `position`.
 * The graph already applies static pattern/composite/availability/departure authorities and
 * canonical placement against the current occupations. Descendants only add occupations and
 * consume vertices; incremental derivation rechecks interacting edges, so it can delete an
 * edge but cannot introduce a position absent from this certificate. */
export function forcedMainSingletonTaskId(certificate: Readonly<{
  validEdges: ReadonlyMap<string, readonly Readonly<{ position: number }>[]>
}> | undefined, position: number): string | undefined {
  if (certificate === undefined) return undefined;
  return [...certificate.validEdges]
    .find(([, edges]) => edges.length === 1 && edges[0]?.position === position)?.[0];
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

interface CertifiedBackjump { readonly outcome:"CERTIFIED_BACKJUMP"; readonly targetDepth:number }
type SearchOutcome = "FOUND" | "DEAD_END" | "BUDGET_EXHAUSTED" | CertifiedBackjump;

export type ExactCoreContinuationOutcome = "ACCEPT" | "REJECT" | "BUDGET_EXHAUSTED" | CertifiedBackjump;
export type ExactPartialCoreContinuationOutcome = "CONTINUE" | "REJECT" | "BUDGET_EXHAUSTED" | CertifiedBackjump
  | {readonly outcome:"REJECT";readonly diagnosticCertificate?:ExactPartialCoreRejectionCertificate};
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
  /** Branch-local ownership of every materialized atomic task by its CORE decision. */
  decisionDepthByTaskId: Readonly<Record<string, number>>;
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
  /** Test oracle: rebuilds every residual graph without changing search semantics. */
  residualMatchingMode?: "INCREMENTAL" | "FULL_RECOMPUTE";
  /** Read-only diagnostic used by exact-certificate tests; it cannot influence the search. */
  onResidualMatchingDerived?: (trace: Readonly<{
    selectedTaskId: string;
    consumedPosition: number;
    selectedTaskPreviousPosition: number | null;
    consumedPositionPreviousOwner: string | null;
    invalidatedMatchedEdges: number;
    invalidatedUnmatchedEdges: number;
    reusedInvalidEdges: number;
    unmatchedBeforeRepair: number;
    positionChecks: number;
    cacheHits: number;
    augmentTraversals: number;
  }>) => void;
  causalDiagnostic?: boolean;
  onBranchConsumed?: (category:ExactBranchCategory,depth:number,count:number)=>void;
  /** Test oracle: evaluates the unchanged complete grid instead of the coach-derived domain. */
  feederStartDomainMode?: "COACH_DOMAIN" | "FULL_GRID";
}

export interface ExactFeederStartInterval { readonly start: number; readonly end: number }
export interface ExactFeederStartDomain {
  readonly gridAnchor: number;
  readonly intervals: readonly ExactFeederStartInterval[];
  readonly fullGridStartCount: number;
  readonly eligibleStartCount: number;
  readonly coachEliminatedStartCount: number;
  readonly eliminations: readonly Readonly<{ reason:"OVERLAP_COACH"|"TRANSITION_COACH"; blockingPlacedTaskId:string; startsEliminated:number }>[];
  starts(onProgress?: (considered: number, coachEliminated: number) => void): Generator<number>;
}

export type ExactFeederSlotAnalyticCertificate = "NO_PERFECT_MATCH" | "NOT_PROVEN" | "NOT_APPLICABLE";

/** Negative certificate using only deadlines and feeder-domain interval geometry.
 * NOT_PROVEN never establishes feasibility; the exact checks remain authoritative. */
export function exactFeederSlotAnalyticCertificate(blockStart:number,duration:number,slotCount:number,
  candidates:readonly Readonly<{deadline:number;domain:ExactFeederStartDomain}>[]):ExactFeederSlotAnalyticCertificate {
  if(!Number.isFinite(blockStart)||!Number.isFinite(duration)||duration<=0||!Number.isInteger(slotCount)
    ||slotCount<0||candidates.length!==slotCount)return "NOT_APPLICABLE";
  const ranges:Array<{low:number;high:number}>=[];
  for(const {deadline,domain} of candidates){
    if(!Number.isFinite(deadline)||(domain.gridAnchor-blockStart)%5!==0||duration%5!==0)return "NOT_APPLICABLE";
    const clipped=domain.intervals.flatMap(interval=>{
      const low=Math.max(0,Math.ceil((interval.start-blockStart)/duration));
      const high=Math.min(slotCount-1,Math.floor((Math.min(interval.end,deadline-duration)-blockStart)/duration));
      return low<=high?[{low,high}]:[];
    });
    if(clipped.length!==1)return clipped.length===0?"NO_PERFECT_MATCH":"NOT_APPLICABLE";
    ranges.push(clipped[0]!);
  }
  ranges.sort((left,right)=>left.low-right.low||left.high-right.high);
  const available:number[]=[];
  let rangeIndex=0;
  for(let ordinal=0;ordinal<slotCount;ordinal++){
    while(rangeIndex<ranges.length&&ranges[rangeIndex]!.low<=ordinal)available.push(ranges[rangeIndex++]!.high);
    available.sort((left,right)=>left-right);
    if(available.length===0||available[0]!<ordinal)return "NO_PERFECT_MATCH";
    available.shift();
  }
  return "NOT_PROVEN";
}

/** Pure negative-domain membership test. Membership only means that the start was
 * not disproved by this domain; canonical placement remains authoritative. */
export function isExactFeederStartInDomain(domain: ExactFeederStartDomain, start: number): boolean {
  if (!Number.isFinite(start) || (domain.gridAnchor - start) % 5 !== 0) return false;
  return domain.intervals.some((interval) => start >= interval.start && start <= interval.end);
}

const gridCountInInterval = (latestStart: number, interval: ExactFeederStartInterval): number => {
  const firstIndex = Math.max(0, Math.ceil((latestStart - interval.end) / 5));
  const lastIndex = Math.floor((latestStart - interval.start) / 5);
  return Math.max(0, lastIndex - firstIndex + 1);
};
const gridCountInClosedRange = (latestStart:number, intervals:readonly ExactFeederStartInterval[], start:number, end:number):number =>
  start>end?0:intervals.reduce((sum,interval)=>{const intersection={start:Math.max(interval.start,start),end:Math.min(interval.end,end)};
    return sum+(intersection.start<=intersection.end?gridCountInInterval(latestStart,intersection):0);},0);

/** Builds disjoint allowed intervals analytically. Production iteration visits only
 * eligible grid points; FULL_GRID deliberately retains the historical test oracle. */
export function exactFeederStartDomain(problem: PlannerNextProblem, feeder: Task, latestStart: number,
  blockers: readonly ScheduledTask[], mode: "COACH_DOMAIN" | "FULL_GRID" = "COACH_DOMAIN",
  gridAnchor=latestStart): ExactFeederStartDomain {
  const fullInterval = { start: problem.day.start, end: latestStart };
  const fullGridStartCount = latestStart < problem.day.start ? 0 : gridCountInInterval(gridAnchor, fullInterval);
  let intervals: ExactFeederStartInterval[] = fullGridStartCount === 0 ? [] : [fullInterval];
  const eliminations:Array<{reason:"OVERLAP_COACH"|"TRANSITION_COACH";blockingPlacedTaskId:string;startsEliminated:number}>=[];
  if (mode === "COACH_DOMAIN" && feeder.coachId !== undefined) {
    for (const blocker of blockers) {
      if (blocker.coachId !== feeder.coachId) continue;
      const beforeBoundary = blocker.start - feeder.duration - effectiveCoachTransitionMinutes(
        problem, feeder.coachId, feeder.spaceId, blocker.spaceId);
      const afterBoundary = blocker.end + effectiveCoachTransitionMinutes(
        problem, feeder.coachId, blocker.spaceId, feeder.spaceId);
      const transitionBefore=gridCountInClosedRange(gridAnchor,intervals,beforeBoundary+1,blocker.start-feeder.duration);
      const overlap=gridCountInClosedRange(gridAnchor,intervals,blocker.start-feeder.duration+1,blocker.end-1);
      const transitionAfter=gridCountInClosedRange(gridAnchor,intervals,blocker.end,afterBoundary-1);
      if(overlap>0)eliminations.push({reason:"OVERLAP_COACH",blockingPlacedTaskId:blocker.id,startsEliminated:overlap});
      if(transitionBefore+transitionAfter>0)eliminations.push({reason:"TRANSITION_COACH",blockingPlacedTaskId:blocker.id,startsEliminated:transitionBefore+transitionAfter});
      intervals = intervals.flatMap((interval) => {
        const before = { start: interval.start, end: Math.min(interval.end, beforeBoundary) };
        const after = { start: Math.max(interval.start, afterBoundary), end: interval.end };
        return [before, after].filter(({ start, end }) => start <= end);
      });
    }
  }
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  const eligibleStartCount = intervals.reduce((sum, interval) => sum + gridCountInInterval(gridAnchor, interval), 0);
  return {
    gridAnchor,
    intervals: Object.freeze(intervals.map((interval) => Object.freeze(interval))),
    fullGridStartCount,
    eligibleStartCount,
    coachEliminatedStartCount: fullGridStartCount - eligibleStartCount,
    eliminations:Object.freeze(eliminations.map(row=>Object.freeze(row))),
    *starts(onProgress) {
      let nextUnaccountedGridIndex = 0;
      for (let index = intervals.length - 1; index >= 0; index--) {
        const interval = intervals[index]!;
        const firstGridIndex = Math.max(0, Math.ceil((gridAnchor - interval.end) / 5));
        const lastGridIndex = Math.floor((gridAnchor - interval.start) / 5);
        for (let gridIndex = firstGridIndex; gridIndex <= lastGridIndex; gridIndex++) {
          const considered = gridIndex - nextUnaccountedGridIndex + 1;
          onProgress?.(considered, considered - 1);
          nextUnaccountedGridIndex = gridIndex + 1;
          yield gridAnchor - 5 * gridIndex;
        }
      }
      const trailingEliminated = fullGridStartCount - nextUnaccountedGridIndex;
      if (trailingEliminated > 0) onProgress?.(trailingEliminated, trailingEliminated);
    },
  };
}

interface ExactFeederStartUnion {
  readonly fullGridStartCount: number;
  readonly eligibleStartCount: number;
  readonly domainEliminatedStartCount: number;
  starts(): Generator<number>;
}

/** Projects each feeder domain onto the cohort grid, then merges its intervals.
 * Storage is proportional to domain intervals, never to the length of the day. */
export function exactFeederStartDomainUnion(dayStart:number, latestBlockStart:number,
  domains:readonly ExactFeederStartDomain[], maximumStart=latestBlockStart,
  allowedIntervals:readonly ExactFeederStartInterval[]=[{start:dayStart,end:maximumStart}]):ExactFeederStartUnion {
  const fullGridStartCount=latestBlockStart<dayStart?0:gridCountInInterval(latestBlockStart,{start:dayStart,end:latestBlockStart});
  const projected=domains.flatMap(domain=>(domain.gridAnchor-latestBlockStart)%5===0?domain.intervals.flatMap(interval=>allowedIntervals.flatMap(allowed=>{
    const clippedStart=Math.max(dayStart,interval.start,allowed.start),clippedEnd=Math.min(latestBlockStart,maximumStart,interval.end,allowed.end);
    const firstGridIndex=Math.max(0,Math.ceil((latestBlockStart-clippedEnd)/5));
    const lastGridIndex=Math.floor((latestBlockStart-clippedStart)/5);
    return firstGridIndex<=lastGridIndex?[{
      start:latestBlockStart-lastGridIndex*5,end:latestBlockStart-firstGridIndex*5,
    }]:[];
  })):[]).sort((a,b)=>a.start-b.start||a.end-b.end);
  const intervals:ExactFeederStartInterval[]=[];
  for(const interval of projected){
    const previous=intervals.at(-1);
    if(previous&&interval.start<=previous.end+5)intervals[intervals.length-1]={start:previous.start,end:Math.max(previous.end,interval.end)};
    else intervals.push(interval);
  }
  const eligibleStartCount=intervals.reduce((sum,interval)=>sum+gridCountInInterval(latestBlockStart,interval),0);
  return {fullGridStartCount,eligibleStartCount,domainEliminatedStartCount:fullGridStartCount-eligibleStartCount,
    *starts(){for(let index=intervals.length-1;index>=0;index--){const interval=intervals[index]!;
      const first=Math.max(0,Math.ceil((latestBlockStart-interval.end)/5));
      const last=Math.floor((latestBlockStart-interval.start)/5);
      for(let gridIndex=first;gridIndex<=last;gridIndex++)yield latestBlockStart-gridIndex*5;
    }}
  };
}

export interface FeederCohortRelaxedCertificate {
  readonly applicable: boolean;
  readonly prefixCapacityImpossible: boolean;
  readonly latestFeasibleBlockStart: number | null;
  readonly contiguousBlockStartIntervals: readonly ExactFeederStartInterval[];
}

type ExactInterval = Readonly<{ start:number; end:number }>;

/** Canonical interval geometry shared by the complete-cohort and prefix certificates. */
export function mergedClippedIntervals(intervals:readonly ExactInterval[], start:number, end:number):ExactInterval[] {
  const result:{start:number;end:number}[]=[];
  for(const interval of intervals.map(item=>({start:Math.max(item.start,start),end:Math.min(item.end,end)}))
    .filter(item=>item.start<item.end).sort((a,b)=>a.start-b.start||a.end-b.end)){
    const previous=result.at(-1);
    if(previous&&interval.start<=previous.end)previous.end=Math.max(previous.end,interval.end);
    else result.push({...interval});
  }
  return result;
}

export function subtractMergedIntervals(available:readonly ExactInterval[], occupied:readonly ExactInterval[]):ExactInterval[] {
  return available.flatMap(window=>{
    const free:{start:number;end:number}[]=[];let cursor=window.start;
    for(const blocker of occupied){
      if(blocker.end<=cursor||blocker.start>=window.end)continue;
      if(cursor<blocker.start)free.push({start:cursor,end:Math.min(blocker.start,window.end)});
      cursor=Math.max(cursor,Math.min(blocker.end,window.end));
    }
    if(cursor<window.end)free.push({start:cursor,end:window.end});
    return free;
  });
}

/** A negative certificate only: all omitted constraints can only reduce feasibility. */
export function deriveFeederCohortRelaxedCertificate(problem: PlannerNextProblem,
  feeders: readonly Readonly<{ task: Task; deadline: number }>[], placed: readonly ScheduledTask[]): FeederCohortRelaxedCertificate {
  const coachId=feeders[0]?.task.coachId;
  if(feeders.length===0||coachId===undefined||feeders.some(({task})=>task.coachId!==coachId))
    return {applicable:false,prefixCapacityImpossible:false,latestFeasibleBlockStart:null,contiguousBlockStartIntervals:[]};
  const coach=problem.coaches.find(({id})=>id===coachId);
  if(!coach)return {applicable:false,prefixCapacityImpossible:false,latestFeasibleBlockStart:null,contiguousBlockStartIntervals:[]};
  const occupied=mergedClippedIntervals(placed.filter(task=>task.coachId===coachId),problem.day.start,problem.day.end);
  const available=mergedClippedIntervals(coach.availability,problem.day.start,problem.day.end);
  const free=subtractMergedIntervals(available,occupied);
  const capacityBefore=(deadline:number)=>{
    const deadlineAvailable=mergedClippedIntervals(coach.availability,problem.day.start,Math.min(problem.day.end,deadline));
    return subtractMergedIntervals(deadlineAvailable,occupied).reduce((sum,interval)=>sum+interval.end-interval.start,0);
  };
  const deadlines=[...new Set(feeders.map(({deadline})=>deadline))].sort((a,b)=>a-b);
  const prefixCapacityImpossible=deadlines.some(deadline=>
    feeders.filter(item=>item.deadline<=deadline).reduce((sum,item)=>sum+item.task.duration,0)>capacityBefore(deadline));
  let cumulative=0,latestFeasibleBlockStart=Infinity;
  for(const {task,deadline} of [...feeders].sort((a,b)=>a.deadline-b.deadline||a.task.id.localeCompare(b.task.id))){
    cumulative+=task.duration;
    latestFeasibleBlockStart=Math.min(latestFeasibleBlockStart,deadline-cumulative);
  }
  const minimumSpan=feeders.reduce((sum,{task})=>sum+task.duration,0);
  const contiguousBlockStartIntervals=free.flatMap(({start,end})=>start+minimumSpan<=end?[{start,end:end-minimumSpan}]:[]);
  return {applicable:true,prefixCapacityImpossible,latestFeasibleBlockStart,contiguousBlockStartIntervals};
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

/** Pure conservative invalidation predicate for a previously valid residual edge. */
export const residualMatchingOperationsMayInteract = (problem: PlannerNextProblem,
  left: readonly ScheduledTask[], right: readonly ScheduledTask[]): boolean => left.some((candidate) => right.some((added) => {
  if (![candidate.start, candidate.end, added.start, added.end].every(Number.isFinite)) return true;
  if (candidate.dependencies.includes(added.id) && added.end > candidate.start) return true;
  if (added.dependencies.includes(candidate.id) && candidate.end > added.start) return true;

  const participant = candidate.participantId !== undefined && candidate.participantId === added.participantId;
  const coach = candidate.coachId !== undefined && candidate.coachId === added.coachId;
  const sharedResources = (candidate.requiredResourceIds ?? [])
    .filter((id) => (added.requiredResourceIds ?? []).includes(id));
  const overlap = candidate.start < added.end && added.start < candidate.end;
  if (overlap) return participant || coach || candidate.spaceId === added.spaceId || sharedResources.length > 0;
  if (candidate.spaceId === added.spaceId) return false;

  const candidateAfterAdded = added.end <= candidate.start;
  const gap = candidateAfterAdded ? candidate.start - added.end : added.start - candidate.end;
  if (participant && gap < problem.participantTransitionMinutes) return true;
  if (coach && gap < effectiveCoachTransitionMinutes(problem, candidate.coachId!,
    candidateAfterAdded ? added.spaceId : candidate.spaceId,
    candidateAfterAdded ? candidate.spaceId : added.spaceId)) return true;
  return sharedResources.some((id) => gap < effectiveResourceTransitionMinutes(problem, id));
}));

function latestDepartureStartByParticipant(problem: PlannerNextProblem): ReadonlyMap<string, number> {
  const departureIds = new Set(problem.transportPolicy?.departure.taskIds ?? []);
  const latest = new Map<string, number>();
  for (const task of problem.tasks.filter(({ id }) => departureIds.has(id))) {
    if (!task.participantId) continue;
    const participant = problem.participants.find(({ id }) => id === task.participantId);
    const space = problem.spaces.find(({ id }) => id === task.spaceId);
    const resources = (task.requiredResourceIds ?? []).map((id) => problem.resources.find((resource) => resource.id === id));
    const windowSets = [task.availability, participant?.availability, space?.availability,
      ...resources.map((resource) => resource?.availability)]
      .filter((windows): windows is Array<{ start: number; end: number }> => Array.isArray(windows) && windows.length > 0);
    const latestEnd = Math.min(problem.day.end,
      ...windowSets.map((windows) => Math.max(...windows.map(({ end }) => end))));
    const latestStart = latestEnd - task.duration;
    const previous = latest.get(task.participantId);
    latest.set(task.participantId, previous === undefined ? latestStart : Math.min(previous, latestStart));
  }
  return latest;
}

function emptyEvidence(): ExactMainAndFeederCoreEvidence {
  return { branchesExplored: 0, patternCandidatesExplored: 0, timelineCandidatesExplored: 0,
    mealTimelineDomainCount:0,mealTimelinesExplored:0,mealTimelinesEliminatedAnalytically:0,
    mealTimelinesPreferred:0,mealTimelinesNonPreferred:0,mealTimelinesPendingAtExhaustion:0,
    mainCandidatesEvaluated: 0, feederCandidatesEvaluated: 0, constructiveFeederStartChecks: 0,
    matchingFeederStartChecks: 0, residualMatchingChecks: 0, residualMatchingInvocations: 0,
    residualMatchingFullBuilds: 0, residualMatchingIncrementalUpdates: 0,
    residualMatchingEdgeCacheHits: 0, residualMatchingEdgeCacheMisses: 0,
    residualMatchingPositionChecks: 0, residualMatchingAugmentTraversals: 0,
    residualMatchingBranchesExplored: 0, residualMatchingPrunes: 0,
    residualMatchingRepairs: 0, residualMatchingRepairFailures: 0,
    mainWitnessChoicesFollowed: 0, mainWitnessFallbacks: 0,
    mainRunWitnessAttempts:0,mainRunWitnessRepairs:0,mainRunEquivalentOrdersCollapsed:0,
    feederMatchingWitnessMaterializations:0,feederMatchingWitnessRepairs:0,
    feederMatchingEquivalentOrdersCollapsed:0,feederOrderFallbacks:0,
    forcedMainSingletonChecks: 0, forcedMainSingletonChoices: 0,
    forcedMainSiblingAlternativesEliminated: 0, forcedMainSingletonDeadEnds: 0,
    mainCandidatesExploredBeforeCohort: {},
    zeroAlternativePrunes: 0, backtracks: 0, maximumDepth: 0,
    completeLeafCount: 0, coreLeafValidationAttempts:0, coreLeafValidShapeRejects:0,
    coreLeafHardValidationRejects:0, coreLeafValidationAccepted:0, coreLeafValidationReasonCounts:{},
    firstCoreLeafShapeRejection:null, firstCoreLeafHardValidationRejection:null,
    selectedPattern: null, selectedTimelineKey: null,
    selectedMainTaskIds: [], selectedFeederTaskIds: [], coreFingerprint: null, reasonCodes: [],
    architecturesChecked: 0, architecturesStructurallyRejected: 0, structuralRejectionsByReason: {}, runLayers: [],
    firstExactArchitecture: null, firstFeedableRunSizes: [], feederOrderBranchesByArchitecture: {}, feederOrderBranches:0,
    feederSlotAnalyticChecks:0,feederSlotAnalyticPrunes:0,feederSlotAnalyticAbstentions:0,
    feederSlotMatchingChecks:0,feederSlotMatchingPrunes:0,feederSlotMatchingEdgeChecks:0,
    feederSlotMatchingAugmentTraversals:0,feederSlotMatchingBranchesExplored:0,
    feederSlotIntervalCertificates:0,feederSlotExplicitFallbacks:0,feederSlotLazyRepairBuilds:0,
    feederCohortCapacityChecks:0,feederCohortPrefixCapacityPrunes:0,feederCohortEddChecks:0,
    feederCohortEddEmptyPrunes:0,blockStartsEliminatedByCohortBound:0,
    feederCohortContiguousWindowChecks:0,feederCohortContiguousWindowPrunes:0,
    blockStartsEliminatedByContiguousWindowBound:0,contiguousWindowSkippedByTransition:0,
    contiguousWindowSkippedByAuthorizedMeal:0,feederRunOptimisticChecks:0,
    feederRunOptimisticPrunes:0,feederRunOptimisticPrunesByDepth:{},
    feederRunPrePartialChecks:0,feederRunPrePartialPrunes:0,feederRunPrePartialPrunesByDepth:{},
    feederRunPreFeederChecks:0,feederRunPreFeederPrunes:0,feederRunPreFeederPrunesByDepth:{},
    feederRunOptimisticSkippedByTransition:0,feederRunOptimisticSkippedByAuthorizedMeal:0,
    causalDiagnostic:null };
}

/** Internal exact runner; a continuation may reject a hard-valid leaf and resume core DFS. */
export function runExactMainAndFeederSearch(problem: PlannerNextProblem,
  options: ExactMainAndFeederSearchOptions = {}): ExactMainAndFeederCoreResult {
  const evidence = emptyEvidence();
  const ledger = options.ledger ?? createExactSearchLedger(problem.budget.maxBranchExpansions);
  const diagnostic:ExactCoreCausalDiagnostic|null=options.causalDiagnostic?{waterfallByDepth:{},feederByDepth:{},feederRejections:[],feederCoachDomainEliminations:[],feederMatching:{contexts:[],overflowContexts:0},futureFeasibility:{totalEvaluations:0,uniqueAuthorityStates:0,repeatedEvaluations:0,authorityResultCollisions:0,negativeEvaluations:0,repeatedNegativeEvaluations:0,rejectsWithCertifiedBackjumpTarget:0,evaluationsByDepth:{},repeatedByDepth:{},negativeByDepth:{},assessments:[],collisions:[]},standaloneFrontier:{totalRejections:0,certificates:[],examples:[]},macroPendingPrerequisiteCapacityCertificates:[],macroPendingPrerequisiteCapacityCertificateOverflow:0}:null;
  const rejectionByKey=new Map<string,ExactCriticalFeederRejection>();
  const eliminationByKey=new Map<string,ExactFeederCoachDomainElimination>();
  evidence.causalDiagnostic=diagnostic;
  const waterfall=(depth:number):ExactDepthWaterfall=>diagnostic!.waterfallByDepth[String(depth)]??=( {mainCandidate:0,feederStart:0,residualMatching:0,continuation:0,participantMeal:0,standaloneForward:0,other:0,total:0});
  const recordBranch=(category:ExactBranchCategory,depth:number,count=1):void=>{if(diagnostic){const row=waterfall(depth);const key={MAIN_CANDIDATE:"mainCandidate",FEEDER_START:"feederStart",RESIDUAL_MATCHING:"residualMatching",CONTINUATION:"continuation",PARTICIPANT_MEAL:"participantMeal",STANDALONE_FORWARD:"standaloneForward",OTHER:"other"}[category] as keyof ExactDepthWaterfall;row[key]+=count;row.total+=count;}options.onBranchConsumed?.(category,depth,count);};
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
    else if (!main.dependencies.includes(matching[0]!.id)
      || matching[0]!.dependencies.some((dependencyId) => mains.some(({ id }) => id === dependencyId)))
      unsupported.push(`UNSUPPORTED_FEEDER_DEPENDENCY:${main.id}`);
    else feederByMain.set(main.id, { ...matching[0]!, dependencies: [...matching[0]!.dependencies] });
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
  let currentArchitecture: string | null = null;
  const consumeBranch = (reason: string,category:ExactBranchCategory="OTHER",depth=0): boolean => {
    if (!ledger.consume("CORE")) { exhaustionReason = reason; return false; }
    recordBranch(category,depth);
    evidence.branchesExplored = ledger.coreBranches;
    if (reason === "FEEDER_ORDER_SEARCH_BUDGET_EXHAUSTED" && currentArchitecture)
      evidence.feederOrderBranchesByArchitecture[currentArchitecture] =
        (evidence.feederOrderBranchesByArchitecture[currentArchitecture] ?? 0) + 1;
    if(reason==="FEEDER_ORDER_SEARCH_BUDGET_EXHAUSTED")evidence.feederOrderBranches++;
    return true;
  };
  let matchingDiagnosticDepth=0;
  const consumeMatchingBranch = (): boolean => {
    if (!consumeBranch("MATCHING_SEARCH_BUDGET_EXHAUSTED","RESIDUAL_MATCHING",matchingDiagnosticDepth)) return false;
    evidence.residualMatchingBranchesExplored += 1;
    return true;
  };
  const duration = mains[0]!.duration;
  const patternLayers = generateMainFlowPatternRunLayers(mains, problem.mainFlow.minTasksPerBlock,
    problem.mainFlow.maxBlocksByKey, problem.budget.maxPatterns, problem.resources);
  const requiredBlocks = buildRequiredCompositeBlocks(problem, mains);
  const latestDepartureStart = latestDepartureStartByParticipant(problem);
  let selected: { tasks: ScheduledTask[]; meals: ScheduledSpaceMeal[]; pattern: string[]; timeline?: MainFlowTimeline } | null = null;

  const feederMainById=new Map([...feederByMain].map(([mainId,feeder])=>[feeder.id,mainId]));
  const introducedBy=(id:string,placed:ScheduledTask[]):{mainTaskId:string|null;depth:number|null}=>{const direct=mains.some(x=>x.id===id)?id:feederMainById.get(id)??applicableContracts.find(c=>[...c.beforeTaskIds,...c.afterTaskIds].includes(id))?.anchorTaskId??null;if(!direct)return {mainTaskId:null,depth:null};return {mainTaskId:direct,depth:placed.filter(x=>x.kind==="main").findIndex(x=>x.id===direct)+1};};
  const checkFeederTask = (choice: MainChoice, feeder: ScheduledTask, placed: ScheduledTask[],
    meals: ScheduledSpaceMeal[], depth: number): boolean => {
    const assessed = diagnostic ? diagnoseTaskPlacement(problem, choice.feeder, feeder.start, placed, meals) : null;
    const valid = assessed ? assessed.valid : canPlaceTask(problem, choice.feeder, feeder.start, placed, meals);
    if (!valid && diagnostic && assessed?.firstRejectionReason) {
      const blocker=assessed.blockingPlacedTaskId;const prior=blocker?introducedBy(blocker,placed):{mainTaskId:null,depth:null};const key=[depth,choice.task.id,choice.feeder.id,choice.task.participantId??"",assessed.firstRejectionReason,blocker??"",prior.depth??"",prior.mainTaskId??""].join("|");const existing=rejectionByKey.get(key);if(existing){existing.count++;existing.startsAttempted++;}else{const row={depth,mainTaskId:choice.task.id,feederTaskId:choice.feeder.id,participantId:choice.task.participantId??null,startsAttempted:1,firstRejectionReason:assessed.firstRejectionReason,blockingPlacedTaskId:blocker,blockingDecisionDepth:prior.depth&&prior.depth>0?prior.depth:null,blockingDecisionMainTaskId:prior.mainTaskId,count:1};rejectionByKey.set(key,row);diagnostic.feederRejections.push(row);}
    }
    return valid;
  };

  const search = (pattern: string[], slots: number[], composite: RequiredCompositePosition,
    meals: ScheduledSpaceMeal[], placed: ScheduledTask[], used: Set<string>, depth: number,
    timelineKey: string | null, certificate?: ResidualMatchingCertificate): SearchOutcome => {
    evidence.maximumDepth = Math.max(evidence.maximumDepth, depth);
    if (depth === mains.length) {
      if (!consumeBranch("LEAF_VALIDATION_BUDGET_EXHAUSTED")) return "BUDGET_EXHAUSTED";
      evidence.completeLeafCount += 1;
      evidence.coreLeafValidationAttempts += 1;
      const reducedTasks = problem.tasks.filter(({ id }) => coreIds.has(id)).map((task) => ({
        ...task, dependencies: task.dependencies.filter((dependencyId) => coreIds.has(dependencyId)),
      }));
      const deferredSetupSpaceIds = new Set(problem.spaces.filter((space) => space.setupPolicy !== undefined
        && !reducedTasks.some((task) => task.spaceId === space.id)).map(({ id }) => id));
      const operationalMainPolicy=mainFlowMealIsOperational(problem)?mainFlowOperationalMealPolicy(problem):undefined;
      const reduced: PlannerNextProblem = { ...problem, tasks: reducedTasks,
        spaces: problem.spaces.map((space) => deferredSetupSpaceIds.has(space.id)
          ? { ...space, secondaryContinuity: "OFF" as const, setupPolicy: undefined } : space),
        anchoredAccompaniments: applicableContracts, roundSynchronizations: undefined,
        participantMeals: undefined, participantMealCapacity: undefined,
        operationalMealPolicies: operationalMainPolicy===undefined?undefined:[operationalMainPolicy],
        transportPolicy: undefined };
      const expected = [...coreIds].sort(), actual = placed.map(({ id }) => id).sort();
      const validShape = actual.length === expected.length && actual.every((id, index) => id === expected[index]);
      const fixedResourceMeals=(reduced.resourceMeals??[]).map(meal=>({id:meal.id,sourceTaskId:meal.sourceTaskId,resourceIds:[...meal.resourceIds],start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));
      const fixedItinerantMeals=materializeScheduledItinerantUnitMeals(reduced);
      const reducedPlaced = placed.map((task) => ({ ...task,
        dependencies: task.dependencies.filter((dependencyId) => coreIds.has(dependencyId)) }));
      const publishedMeals = mainFlowMealIsOperational(problem) ? [] : meals;
      const validationOperationalMeals:ScheduledOperationalMeal[]=operationalMainPolicy===undefined?[]:meals.map(meal=>({
        id:operationalMainPolicy.id,resourceIds:[...operationalMainPolicy.resourceIds],spaceIds:[...operationalMainPolicy.spaceIds],
        duration:operationalMainPolicy.duration,start:meal.start,end:meal.end,
      }));
      const validation = validatePlan(reduced, reducedPlaced, [], publishedMeals,[],fixedResourceMeals,fixedItinerantMeals,[],validationOperationalMeals);
      if (!validShape) {
        evidence.coreLeafValidShapeRejects += 1;
        evidence.coreLeafValidationReasonCounts.INVALID_CORE_LEAF_SHAPE =
          (evidence.coreLeafValidationReasonCounts.INVALID_CORE_LEAF_SHAPE ?? 0) + 1;
        if (evidence.firstCoreLeafShapeRejection === null) {
          const expectedIds = new Set(expected), actualIds = new Set(actual);
          evidence.firstCoreLeafShapeRejection = {
            expectedCount: expected.length, actualCount: actual.length,
            missingTaskIds: expected.filter((id) => !actualIds.has(id)),
            extraTaskIds: actual.filter((id) => !expectedIds.has(id)),
            architectureKey: currentArchitecture, timelineKey,
          };
        }
      } else if (!validation.hardValid) {
        evidence.coreLeafHardValidationRejects += 1;
        for (const reason of validation.reasonCodes)
          evidence.coreLeafValidationReasonCounts[reason] = (evidence.coreLeafValidationReasonCounts[reason] ?? 0) + 1;
        if (evidence.firstCoreLeafHardValidationRejection === null) {
          const split = timelineKey?.match(/^SPLIT\|(\d+)\|/)?.[1];
          evidence.firstCoreLeafHardValidationRejection = { ...validation,
            architectureKey: currentArchitecture, timelineKey,
            mealStart: meals[0]?.start ?? null, mealSplit: split === undefined ? null : Number(split) };
        }
      } else {
        evidence.coreLeafValidationAccepted += 1;
      }
      if (validShape && validation.hardValid) {
        const originalById = new Map(problem.tasks.map((task) => [task.id, task]));
        const ordered = placed.map((task) => ({ ...task,
          dependencies: [...(originalById.get(task.id)?.dependencies ?? task.dependencies)],
        })).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
        const orderedMeals = [...publishedMeals].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
        const decisionDepthByTaskId=Object.fromEntries(placed.flatMap(task=>{const owner=introducedBy(task.id,placed).depth;
          return owner===null?[]:[[task.id,owner]];}));
        const continuation = options.onHardValidCoreLeaf?.({ tasks: ordered, meals: orderedMeals,
          remainingTaskIds: allTaskIds.filter((id) => !coreIds.has(id)), fingerprint: fingerprint(ordered, [], orderedMeals),
          decisionDepthByTaskId }) ?? "ACCEPT";
        if (continuation === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
        if (continuation === "ACCEPT") { selected = { tasks: ordered, meals: publishedMeals, pattern }; return "FOUND"; }
        if(typeof continuation==="object")return continuation;
      }
      return "DEAD_END";
    }

    // A contiguous pattern run is the structural unit: choose and place every main first,
    // then close the whole feeder cohort before exposing the candidate to secondary search.
    let runEnd = depth + 1;
    while (runEnd < pattern.length && pattern[runEnd] === pattern[depth]) runEnd += 1;
    const descriptors: ExactMainChoiceDescriptor[] = [];
    let cohortCandidatesExplored = 0;

    const feederRunOptimisticallyImpossible = (runStart:number, explicitRunEnd:number, position:number,
      cohort:readonly MainChoice[], placed:readonly ScheduledTask[], used:ReadonlySet<string>,
      boundary:"PREFIX"|"PRE_FEEDER"|"PRE_PARTIAL"="PREFIX"):boolean => {
      const remainingNeeded=explicitRunEnd-position;
      const possibleRemaining=mains.filter(task=>!used.has(task.id)&&Array.from({length:remainingNeeded},(_,index)=>position+index)
        .some(candidatePosition=>task.blockKey===pattern[candidatePosition]
          &&taskFitsRequiredCompositePosition(task,candidatePosition,requiredBlocks,composite)))
        .map(task=>({task,feeder:feederByMain.get(task.id)!}));
      // This union does not assign membership. Its N shortest distinct feeders can only
      // underestimate the load of every exact completion of the remaining positions.
      if(possibleRemaining.length<remainingNeeded)return false;
      const possibleFeeders=[...cohort.map(choice=>choice.feeder),...possibleRemaining.map(({feeder})=>feeder)];
      const coachId=possibleFeeders[0]?.coachId;
      if(coachId===undefined||possibleFeeders.some(feeder=>feeder.coachId!==coachId))return false;
      const possibleSpaces=[...new Set(possibleFeeders.map(feeder=>feeder.spaceId))];
      if(possibleSpaces.some(from=>possibleSpaces.some(to=>from!==to
        &&effectiveCoachTransitionMinutes(problem,coachId,from,to)>0))){
        evidence.feederRunOptimisticSkippedByTransition++;return false;
      }
      // At prefix depth membership is intentionally unresolved, so any authorized meal in a
      // possible feeder space is enough to make strict continuity unproven.
      if(problem.spaces.some(space=>possibleSpaces.includes(space.id)&&space.mealPolicy!==undefined)){
        evidence.feederRunOptimisticSkippedByAuthorizedMeal++;return false;
      }
      const coach=problem.coaches.find(({id})=>id===coachId);
      if(!coach)return false;
      evidence.feederRunOptimisticChecks++;
      if(boundary==="PRE_PARTIAL")evidence.feederRunPrePartialChecks++;
      if(boundary==="PRE_FEEDER")evidence.feederRunPreFeederChecks++;
      const selectedSpan=cohort.reduce((sum,choice)=>sum+choice.feeder.duration,0);
      const optimisticRemainingSpan=possibleRemaining.map(({feeder})=>feeder.duration)
        .sort((a,b)=>a-b).slice(0,remainingNeeded).reduce((sum,duration)=>sum+duration,0);
      const minimumCompletionSpan=selectedSpan+optimisticRemainingSpan;
      // Before the first choice, the main anchor is a relaxed (later) deadline. Afterwards the
      // selected operation supplies the exact first obligation. Both choices favor feasibility.
      const deadline=cohort[0]?.firstObligation??slots[runStart]!;
      const occupied=mergedClippedIntervals(placed.filter(task=>task.coachId===coachId),problem.day.start,deadline);
      const available=mergedClippedIntervals(coach.availability,problem.day.start,deadline);
      const fits=subtractMergedIntervals(available,occupied)
        .some(interval=>interval.end-interval.start>=minimumCompletionSpan);
      if(fits)return false;
      evidence.feederRunOptimisticPrunes++;
      const key=String(position);
      evidence.feederRunOptimisticPrunesByDepth[key]=(evidence.feederRunOptimisticPrunesByDepth[key]??0)+1;
      if(boundary==="PRE_PARTIAL"){
        evidence.feederRunPrePartialPrunes++;
        evidence.feederRunPrePartialPrunesByDepth[key]=(evidence.feederRunPrePartialPrunesByDepth[key]??0)+1;
      }
      if(boundary==="PRE_FEEDER"){
        evidence.feederRunPreFeederPrunes++;
        evidence.feederRunPreFeederPrunesByDepth[key]=(evidence.feederRunPreFeederPrunesByDepth[key]??0)+1;
      }
      evidence.zeroAlternativePrunes++;
      return true;
    };

    const assignMains = (position: number, blockPlaced: ScheduledTask[], blockUsed: Set<string>,
      cohort: MainChoice[], blockCertificate: ResidualMatchingCertificate | undefined): SearchOutcome => {
      evidence.maximumDepth = Math.max(evidence.maximumDepth, position);
      if (position === runEnd) {
        const exploredKey = String(cohortCandidatesExplored);
        evidence.mainCandidatesExploredBeforeCohort[exploredKey] =
          (evidence.mainCandidatesExploredBeforeCohort[exploredKey] ?? 0) + 1;
        const blockOperations = cohort.flatMap(({ operation }) => operation);
        // blockPlaced and blockUsed already include every selected main (and anchored operation)
        // in this just-closed run. Deliberately omit its not-yet-materialized feeders: if the next
        // run still cannot fit in that relaxed state, no feeder-block materialization can help it.
        if(runEnd<mains.length){
          let nextRunEnd=runEnd+1;
          while(nextRunEnd<pattern.length&&pattern[nextRunEnd]===pattern[runEnd])nextRunEnd+=1;
          if(feederRunOptimisticallyImpossible(runEnd,nextRunEnd,runEnd,[],blockPlaced,blockUsed,"PRE_FEEDER"))
            return "DEAD_END";
        }
        const fixedCohortMeals = canonical(problem.spaces.filter((space) => cohort.some(({ feeder }) => feeder.spaceId === space.id)
          && space.mealPolicy !== undefined
          && space.mealPolicy.window.end - space.mealPolicy.window.start === space.mealPolicy.duration))
          .map((space) => createScheduledSpaceMeal(space.id, space.mealPolicy!.window.start, space.mealPolicy!.duration));
        const blockMeals = [...meals, ...fixedCohortMeals.filter((meal) => !meals.some(({ id }) => id === meal.id))];
        const cohortDeadlines = cohort.map((choice) => {
          const mainStart = Math.min(...choice.operation.map(({ start }) => start));
          const deadline = latestFeederEndBeforeMain(problem, choice.feeder, choice.task.spaceId, mainStart, mainStart);
          return {choice,deadline};
        });
        const latestBlockStart = Math.max(...cohortDeadlines.map(({ choice, deadline }) => deadline-choice.feeder.duration));
        const rankedCohort = cohortDeadlines.map(({choice,deadline}) => {
          const domain = exactFeederStartDomain(problem, choice.feeder, deadline - choice.feeder.duration,
            [...blockPlaced, ...blockOperations], options.feederStartDomainMode,latestBlockStart);
          return { choice, deadline, domain };
        }).sort((a,b)=>a.domain.eligibleStartCount-b.domain.eligibleStartCount
          || a.choice.task.id.localeCompare(b.choice.task.id));
        if (diagnostic) for (const { choice, domain } of rankedCohort) for (const elimination of domain.eliminations) {
          const prior = introducedBy(elimination.blockingPlacedTaskId, [...blockPlaced, ...blockOperations]);
          const row: ExactFeederCoachDomainElimination = { depth: runEnd, mainTaskId: choice.task.id,
            feederTaskId: choice.feeder.id, participantId: choice.task.participantId ?? null, ...elimination,
            blockingDecisionDepth: prior.depth && prior.depth > 0 ? prior.depth : null,
            blockingDecisionMainTaskId: prior.mainTaskId };
          const key = [row.depth,row.mainTaskId,row.feederTaskId,row.participantId??"",row.reason,
            row.blockingPlacedTaskId,row.blockingDecisionDepth??"",row.blockingDecisionMainTaskId??""].join("|");
          const existing=eliminationByKey.get(key);if(existing)existing.startsEliminated+=row.startsEliminated;
          else { eliminationByKey.set(key,row); diagnostic.feederCoachDomainEliminations.push(row); }
        }
        const feederRow=diagnostic?(diagnostic.feederByDepth[String(runEnd)]??={startsConsidered:0,startsCoachEliminated:0,startsEvaluated:0,valid:0,invalid:0,mainChoicesReachingFeeder:0,mainChoicesWithValidFeeder:0}):null;
        if (feederRow) feederRow.mainChoicesReachingFeeder++;
        const certificate=deriveFeederCohortRelaxedCertificate(problem,
          rankedCohort.map(({choice,deadline})=>({task:choice.feeder,deadline})),[...blockPlaced,...blockOperations]);
        if(certificate.applicable){
          evidence.feederCohortCapacityChecks++;
          evidence.feederCohortEddChecks++;
          if(certificate.prefixCapacityImpossible){evidence.feederCohortPrefixCapacityPrunes++;evidence.zeroAlternativePrunes++;return "DEAD_END";}
        }
        const unboundedBlockStartDomain=exactFeederStartDomainUnion(problem.day.start,latestBlockStart,rankedCohort.map(({domain})=>domain));
        const maximumStart=certificate.latestFeasibleBlockStart??latestBlockStart;
        const eddBlockStartDomain=exactFeederStartDomainUnion(problem.day.start,latestBlockStart,rankedCohort.map(({domain})=>domain),maximumStart);
        if(certificate.applicable){
          evidence.blockStartsEliminatedByCohortBound+=unboundedBlockStartDomain.eligibleStartCount-eddBlockStartDomain.eligibleStartCount;
          if(eddBlockStartDomain.eligibleStartCount===0){evidence.feederCohortEddEmptyPrunes++;evidence.zeroAlternativePrunes++;return "DEAD_END";}
        }
        const commonCoachId=rankedCohort[0]?.choice.feeder.coachId;
        const contiguousSkippedByTransition=certificate.applicable&&commonCoachId!==undefined&&rankedCohort.some((left,leftIndex)=>
          rankedCohort.some((right,rightIndex)=>leftIndex!==rightIndex&&effectiveCoachTransitionMinutes(problem,commonCoachId,
            left.choice.feeder.spaceId,right.choice.feeder.spaceId)>0));
        const feederSpaceIds=new Set(rankedCohort.map(({choice})=>choice.feeder.spaceId));
        const contiguousSkippedByAuthorizedMeal=certificate.applicable&&blockMeals.some(meal=>feederSpaceIds.has(meal.spaceId));
        if(contiguousSkippedByTransition)evidence.contiguousWindowSkippedByTransition++;
        if(contiguousSkippedByAuthorizedMeal)evidence.contiguousWindowSkippedByAuthorizedMeal++;
        const contiguousApplicable=certificate.applicable&&!contiguousSkippedByTransition&&!contiguousSkippedByAuthorizedMeal;
        if(contiguousApplicable)evidence.feederCohortContiguousWindowChecks++;
        const blockStartDomain=contiguousApplicable
          ?exactFeederStartDomainUnion(problem.day.start,latestBlockStart,rankedCohort.map(({domain})=>domain),maximumStart,certificate.contiguousBlockStartIntervals)
          :eddBlockStartDomain;
        if(contiguousApplicable){
          evidence.blockStartsEliminatedByContiguousWindowBound+=eddBlockStartDomain.eligibleStartCount-blockStartDomain.eligibleStartCount;
          if(blockStartDomain.eligibleStartCount===0){evidence.feederCohortContiguousWindowPrunes++;evidence.zeroAlternativePrunes++;return "DEAD_END";}
        }
        if(feederRow){feederRow.startsConsidered+=blockStartDomain.fullGridStartCount;
          feederRow.startsCoachEliminated+=unboundedBlockStartDomain.domainEliminatedStartCount;}
        let validBlockFound = false;

        /** Hall certificate for a fixed contiguous feeder run. Inter-feeder placement is
         * deliberately omitted, so the graph is an optimistic relaxation: failure to cover
         * every feeder is a sound negative proof, while success leaves FEEDER_ORDER unchanged. */
        type FeederRepairResult={outcome:"PERFECT";matching:ReadonlyMap<string,number>}
          |{outcome:"NO_PERFECT_MATCH"|"BUDGET_EXHAUSTED"};
        type FeederSlotCertificate = {outcome:"PERFECT";matching:ReadonlyMap<string,number>;edgeCount:number;domainSizes:number[];
          repair:(forbidden:ReadonlySet<string>)=>FeederRepairResult}
          | {outcome:"NO_PERFECT_MATCH"|"NOT_APPLICABLE"|"BUDGET_EXHAUSTED"};
        const fixedFeederSlotPlaced=[...blockPlaced,...blockOperations];
        const feederPlacementAuthorities=new Map<string,ReturnType<typeof prepareTaskPlacementAuthority>>();
        const feederPlacementAuthority=(task:Task)=>{const existing=feederPlacementAuthorities.get(task.id);if(existing)return existing;
          const prepared=prepareTaskPlacementAuthority(problem,task,fixedFeederSlotPlaced,blockMeals);
          feederPlacementAuthorities.set(task.id,prepared);return prepared;};
        const feederSlotCertificate = (blockStart:number):FeederSlotCertificate => {
          const first=rankedCohort[0];
          if(!first)return {outcome:"NOT_APPLICABLE"};
          const duration=first.choice.feeder.duration;
          const spaceId=first.choice.feeder.spaceId;
          if(rankedCohort.some(({choice})=>choice.feeder.duration!==duration||choice.feeder.spaceId!==spaceId))
            return {outcome:"NOT_APPLICABLE"};
          if(blockMeals.some(meal=>meal.spaceId===spaceId))return {outcome:"NOT_APPLICABLE"};
          const feederIds=new Set(rankedCohort.map(({choice})=>choice.feeder.id));
          if(rankedCohort.some(({choice})=>choice.feeder.dependencies.some(id=>feederIds.has(id))))
            return {outcome:"NOT_APPLICABLE"};
          for(const left of rankedCohort)for(const right of rankedCohort){
            const coachId=left.choice.feeder.coachId;
            if(coachId!==undefined&&coachId===right.choice.feeder.coachId
              &&effectiveCoachTransitionMinutes(problem,coachId,left.choice.feeder.spaceId,right.choice.feeder.spaceId)!==0)
              return {outcome:"NOT_APPLICABLE"};
          }
          if(rankedCohort.some(({choice})=>(choice.feeder.requiredResourceIds??[]).some(resourceId=>
            effectiveResourceTransitionMinutes(problem,resourceId)!==0)))return {outcome:"NOT_APPLICABLE"};
          evidence.feederSlotAnalyticChecks++;
          const analytic=exactFeederSlotAnalyticCertificate(blockStart,duration,rankedCohort.length,
            rankedCohort.map(({deadline,domain})=>({deadline,domain})));
          if(analytic==="NO_PERFECT_MATCH"){
            evidence.feederSlotAnalyticPrunes++;
            return {outcome:"NO_PERFECT_MATCH"};
          }
          if(analytic==="NOT_APPLICABLE")evidence.feederSlotAnalyticAbstentions++;
          evidence.feederSlotMatchingChecks++;
          const fixedPlaced=fixedFeederSlotPlaced;
          let edges:Map<string,number[]>|undefined;
          const buildEdges=():"BUILT"|"BUDGET_EXHAUSTED"=>{
            if(edges)return "BUILT";
            edges=new Map<string,number[]>();
            for(const candidate of rankedCohort){
              const candidateEdges:number[]=[];
              for(let ordinal=0;ordinal<rankedCohort.length;ordinal++){
                if(!consumeBranch("FEEDER_SLOT_MATCHING_BUDGET_EXHAUSTED","RESIDUAL_MATCHING",runEnd))
                  return "BUDGET_EXHAUSTED";
                evidence.feederSlotMatchingBranchesExplored++;
                evidence.feederSlotMatchingEdgeChecks++;
                const start=blockStart+ordinal*duration;
                if(start+duration>candidate.deadline||!isExactFeederStartInDomain(candidate.domain,start))continue;
                if(canPlaceTask(problem,candidate.choice.feeder,start,fixedPlaced,blockMeals))candidateEdges.push(ordinal);
              }
              edges.set(candidate.choice.feeder.id,candidateEdges);
            }
            return "BUILT";
          };
          const findMatching=(forbidden:ReadonlySet<string>):FeederRepairResult=>{
           if(buildEdges()==="BUDGET_EXHAUSTED")return {outcome:"BUDGET_EXHAUSTED"};
           const owner=new Map<number,string>();
           const augment=(feederId:string,seen:Set<number>):"MATCHED"|"UNMATCHED"|"BUDGET_EXHAUSTED"=>{
            for(const ordinal of edges!.get(feederId)??[]){
              if(seen.has(ordinal)||forbidden.has(`${feederId}@${ordinal}`))continue;
              if(!consumeBranch("FEEDER_SLOT_MATCHING_BUDGET_EXHAUSTED","RESIDUAL_MATCHING",runEnd))
                return "BUDGET_EXHAUSTED";
              evidence.feederSlotMatchingBranchesExplored++;
              evidence.feederSlotMatchingAugmentTraversals++;
              seen.add(ordinal);
              const previous=owner.get(ordinal);
              if(previous===undefined){owner.set(ordinal,feederId);return "MATCHED";}
              const displaced=augment(previous,seen);
              if(displaced==="BUDGET_EXHAUSTED")return displaced;
              if(displaced==="MATCHED"){
                owner.set(ordinal,feederId);return "MATCHED";
              }
            }
            return "UNMATCHED";
           };
           for(const {choice} of rankedCohort){
            const result=augment(choice.feeder.id,new Set());
            if(result==="BUDGET_EXHAUSTED")return {outcome:result};
            if(result==="UNMATCHED")return {outcome:"NO_PERFECT_MATCH"};
           }
           return {outcome:"PERFECT",matching:new Map([...owner].map(([ordinal,feederId])=>[feederId,ordinal]))};
          };
          const ordinalDomains=rankedCohort.map(candidate=>{
            const limit=candidate.deadline-duration;
            const ranges=feederPlacementAuthority(candidate.choice.feeder).baseDomain.intervals
              .flatMap(interval=>{const first=Math.max(0,Math.ceil((interval.start-blockStart)/duration));
                const last=Math.min(rankedCohort.length-1,Math.floor((Math.min(interval.end,limit)-blockStart)/duration));
                return first<=last?[{first,last}]:[];});
            const merged:Array<{first:number;last:number}>=[];
            for(const range of ranges){const previous=merged.at(-1);if(previous&&range.first<=previous.last+1)previous.last=Math.max(previous.last,range.last);else merged.push({...range});}
            return {id:candidate.choice.feeder.id,ranges:merged};
          });
          if(ordinalDomains.every(({ranges})=>ranges.length===1)){
            const owner=new Map<number,string>();
            const next=Array.from({length:rankedCohort.length+1},(_,ordinal)=>ordinal);
            const available=(ordinal:number):number=>next[ordinal]===ordinal?ordinal:(next[ordinal]=available(next[ordinal]!));
            const rank=new Map(rankedCohort.map((row,index)=>[row.choice.feeder.id,index]));
            const ordered=[...ordinalDomains].sort((left,right)=>left.ranges[0]!.last-right.ranges[0]!.last
              ||left.ranges[0]!.first-right.ranges[0]!.first
              ||rank.get(left.id)!-rank.get(right.id)!);
            for(const candidate of ordered){const {first,last}=candidate.ranges[0]!,ordinal=available(first);
              if(ordinal>last)return {outcome:"NO_PERFECT_MATCH"};
              owner.set(ordinal,candidate.id);next[ordinal]=available(ordinal+1);
            }
            evidence.feederSlotIntervalCertificates++;
            const matching=new Map([...owner].map(([ordinal,id])=>[id,ordinal]));
            const sizes=ordinalDomains.map(({ranges})=>ranges[0]!.last-ranges[0]!.first+1);
            let repairBuilt=false;
            return {outcome:"PERFECT",matching,edgeCount:sizes.reduce((sum,size)=>sum+size,0),domainSizes:[...sizes].sort((a,b)=>a-b),
              repair:(forbidden)=>{if(!repairBuilt){evidence.feederSlotLazyRepairBuilds++;repairBuilt=true;}return findMatching(forbidden);}};
          }
          evidence.feederSlotExplicitFallbacks++;
          const initial=findMatching(new Set());
          if(initial.outcome!=="PERFECT")return initial;
          return {...initial,edgeCount:[...edges!.values()].reduce((sum,row)=>sum+row.length,0),
            domainSizes:[...edges!.values()].map(row=>row.length).sort((a,b)=>a-b),repair:findMatching};
        };

        let feederOrderAuthorityObserved=false;
        let feederRepairTrigger:ExactFeederMatchingRepairTrigger="RESIDUAL_MATCHING_DEAD_END";
        let partialCoreCertificate:ExactPartialCoreRejectionCertificate|null=null;
        const closeBlock = (scheduled: ScheduledTask[]): SearchOutcome => {
              if (!validBlockFound && feederRow) feederRow.mainChoicesWithValidFeeder++;
              validBlockFound = true;
              const nextPlaced = [...blockPlaced, ...scheduled];
              if(runEnd<mains.length){
                let nextRunEnd=runEnd+1;
                while(nextRunEnd<pattern.length&&pattern[nextRunEnd]===pattern[runEnd])nextRunEnd+=1;
                if(feederRunOptimisticallyImpossible(runEnd,nextRunEnd,runEnd,[],nextPlaced,blockUsed,"PRE_PARTIAL"))
                  return "DEAD_END";
              }
              matchingDiagnosticDepth=runEnd;
              const matching = residualMatching(pattern, slots, composite, blockMeals, nextPlaced, blockUsed, runEnd,
                options.residualMatchingMode === "FULL_RECOMPUTE" ? undefined : blockCertificate,
                cohort.at(-1)!.task.id, scheduled);
              if (matching.outcome !== "FOUND") {
                feederOrderAuthorityObserved=true;
                feederRepairTrigger="RESIDUAL_MATCHING_DEAD_END";
                if (matching.outcome === "DEAD_END") { evidence.residualMatchingPrunes += 1; evidence.backtracks += 1; }
                return matching.outcome;
              }
              const partial = options.onPartialCoreCandidate?.({ tasks: nextPlaced,
                addedTasks: [...blockOperations, ...scheduled], meals: blockMeals, depth: runEnd,
                mainTaskId: cohort.at(-1)!.task.id, feederStart: Math.min(...scheduled.map(({ start }) => start)),
                pattern: [...pattern], timelineKey }) ?? "CONTINUE";
              if (partial === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
              if (typeof partial === "object"&&partial.outcome==="CERTIFIED_BACKJUMP") return partial;
              if (partial === "REJECT"||(typeof partial === "object"&&partial.outcome==="REJECT")) {
                feederOrderAuthorityObserved=true;feederRepairTrigger="PARTIAL_CORE_REJECT";
                partialCoreCertificate=typeof partial==="object"?partial.diagnosticCertificate??null:null;
                evidence.backtracks += 1; return "DEAD_END";
              }
              if (!consumeBranch("FUTURE_FEASIBILITY_SEARCH_BUDGET_EXHAUSTED","CONTINUATION",runEnd)) return "BUDGET_EXHAUSTED";
              const child = search(pattern, slots, composite, blockMeals, nextPlaced, blockUsed, runEnd, timelineKey,
                matching.certificate);
              if (child === "FOUND") for (const descriptor of descriptors) options.onMainChoiceAccepted?.(descriptor);
              else if (typeof child === "object") return child;
              else if (child === "DEAD_END") {
                // A later hard authority may observe which participant occupied each
                // feeder ordinal. Repair the ordinal matching rather than treating a
                // recursively rejected witness as invariant across the cohort.
                feederOrderAuthorityObserved=true;
                feederRepairTrigger="CHILD_DEAD_END";
                evidence.backtracks += 1;
              }
              return child;
        };

        blockStarts: for (const blockStart of blockStartDomain.starts()) {
          if (!consumeBranch("CONSTRUCTIVE_FEEDER_START_SEARCH_BUDGET_EXHAUSTED","FEEDER_START",runEnd)) return "BUDGET_EXHAUSTED";
          evidence.feederCandidatesEvaluated++;evidence.constructiveFeederStartChecks++;
          if(feederRow)feederRow.startsEvaluated++;
          const feederSlotMatching=feederSlotCertificate(blockStart);
          if(feederSlotMatching.outcome==="BUDGET_EXHAUSTED")return "BUDGET_EXHAUSTED";
          if(feederSlotMatching.outcome==="NO_PERFECT_MATCH"){
            evidence.feederSlotMatchingPrunes++;evidence.zeroAlternativePrunes++;continue;
          }
          if(feederSlotMatching.outcome==="PERFECT"){
            const byFeederId=new Map(rankedCohort.map(candidate=>[candidate.choice.feeder.id,candidate]));
            const feederContextSignature=(feederId:string):string=>{const candidate=byFeederId.get(feederId)!;
              const {choice,deadline,domain}=candidate,feeder=choice.feeder;
              const dependencyProfile=(id:string)=>{const dependency=problem.tasks.find(task=>task.id===id);
                return dependency?{kind:dependency.kind,duration:dependency.duration,spaceId:dependency.spaceId,
                  availability:dependency.availability??null,resources:[...(dependency.requiredResourceIds??[])].sort()}:null;};
              const future=problem.tasks.filter(task=>task.participantId===feeder.participantId
                &&task.id!==feeder.id&&task.id!==choice.task.id).map(task=>({kind:task.kind,duration:task.duration,
                  spaceId:task.spaceId,availability:task.availability??null,
                  resources:[...(task.requiredResourceIds??[])].sort(),dependencies:task.dependencies.map(dependencyProfile)}))
                .sort((left,right)=>JSON.stringify(left).localeCompare(JSON.stringify(right)));
              return JSON.stringify({duration:feeder.duration,spaceId:feeder.spaceId,
                availability:feeder.availability??null,
                participantAvailability:problem.participants.find(item=>item.id===feeder.participantId)?.availability??null,
                resources:[...(feeder.requiredResourceIds??[])].sort(),dependencies:feeder.dependencies.map(dependencyProfile),
                deadline,domain:domain.intervals,future});};
            const feederProfileById=new Map([...byFeederId.keys()].map(id=>[id,feederContextSignature(id)]));
            const contextFingerprint=createHash("sha256").update(JSON.stringify({runEnd,blockStart,
              profiles:[...feederProfileById.values()].sort()})).digest("hex");
            const context=diagnostic?diagnostic.feederMatching.contexts.find(row=>row.fingerprint===contextFingerprint)
              ??(diagnostic.feederMatching.contexts.length<16?(()=>{const row:ExactFeederMatchingContextDiagnostic={fingerprint:contextFingerprint,depth:runEnd,runEnd,blockStart,
                cohortSize:rankedCohort.length,distinctFeederProfiles:new Set(feederProfileById.values()).size,
                edgeCount:feederSlotMatching.edgeCount,domainSizes:feederSlotMatching.domainSizes,witnessMaterializations:0,rejectedWitnesses:0,repairAttempts:0,successfulRepairs:0,failedRepairs:0,
                augmentTraversals:0,equivalentOrdersCollapsed:0,distinctOrderFingerprints:0,
                repairsByTrigger:{RESIDUAL_MATCHING_DEAD_END:0,PARTIAL_CORE_REJECT:0,CHILD_DEAD_END:0},partialCoreRejects:[]};
                diagnostic.feederMatching.contexts.push(row);return row;})():(diagnostic.feederMatching.overflowContexts++,null)):null;
            const pending:[ReadonlySet<string>,ReadonlyMap<string,number>][]=[[new Set(),feederSlotMatching.matching]];
            const seenForbidden=new Set<string>([""]),seenOrders=new Set<string>();
            while(pending.length>0){
              const [forbidden,witness]=pending.pop()!;
              const orderKey=[...witness].sort((left,right)=>left[1]-right[1])
                .map(([id])=>feederContextSignature(id)).join("|");
              if(seenOrders.has(orderKey)){
                evidence.feederMatchingEquivalentOrdersCollapsed++;
                if(context)context.equivalentOrdersCollapsed++;
                continue;
              }
              seenOrders.add(orderKey);
              if(context)context.distinctOrderFingerprints=seenOrders.size;
              feederOrderAuthorityObserved=false;
              const scheduled=[...witness].sort((left,right)=>left[1]-right[1]).map(([feederId,ordinal])=>{
                const feeder=byFeederId.get(feederId)!.choice.feeder;
                const start=blockStart+ordinal*feeder.duration;
                return {...feeder,start,end:start+feeder.duration};
              });
              let jointlyValid=true;
              for(let index=0;index<scheduled.length;index++){
                const feeder=scheduled[index]!;
                const candidate=byFeederId.get(feeder.id)!;
                if(!checkFeederTask(candidate.choice,feeder,[...blockPlaced,...blockOperations,...scheduled.slice(0,index)],blockMeals,runEnd)){
                  jointlyValid=false;break;
                }
              }
              if(jointlyValid){
                evidence.feederMatchingWitnessMaterializations++;
                if(context)context.witnessMaterializations++;
                if(feederRow)feederRow.valid++;
                const child=closeBlock(scheduled);
                if(child!=="DEAD_END")return child;
                if(context){context.rejectedWitnesses++;
                  if(feederRepairTrigger==="PARTIAL_CORE_REJECT"){
                    const certificate=partialCoreCertificate?{...partialCoreCertificate,overloadTaskIds:[...partialCoreCertificate.overloadTaskIds].sort()}:null;
                    const signature=JSON.stringify(certificate);let row=context.partialCoreRejects.find(item=>JSON.stringify(item.certificate)===signature);
                    if(!row){row={certificate,rejectedWitnesses:0,repairAttempts:0,augmentTraversals:0,distinctOrderFingerprints:0};context.partialCoreRejects.push(row);}
                    row.rejectedWitnesses++;row.distinctOrderFingerprints=context.distinctOrderFingerprints;
                  }}
                evidence.backtracks++;
                if(!feederOrderAuthorityObserved)continue blockStarts;
              }
              for(const [feederId,ordinal] of witness){
                // Branch on the structural profile at this ordinal, not on a nominal
                // feeder identity. Equal-profile feeders are interchangeable vertices
                // in the quotient graph and must never recreate factorial repair paths.
                const profile=feederProfileById.get(feederId)!;
                const next=new Set(forbidden);
                for(const [candidateId,candidateProfile] of feederProfileById)
                  if(candidateProfile===profile)next.add(`${candidateId}@${ordinal}`);
                const key=[...next].sort().join("|");
                if(seenForbidden.has(key))continue;
                if(!consumeBranch("FEEDER_SLOT_MATCHING_BUDGET_EXHAUSTED","RESIDUAL_MATCHING",runEnd))
                  return "BUDGET_EXHAUSTED";
                evidence.feederSlotMatchingBranchesExplored++;
                seenForbidden.add(key);evidence.feederMatchingWitnessRepairs++;
                const augmentBefore=evidence.feederSlotMatchingAugmentTraversals;
                const repaired=feederSlotMatching.repair(next);
                if(context){const traversals=evidence.feederSlotMatchingAugmentTraversals-augmentBefore;
                  context.repairAttempts++;context.repairsByTrigger[feederRepairTrigger]++;context.augmentTraversals+=traversals;
                  if(repaired.outcome==="PERFECT")context.successfulRepairs++;else context.failedRepairs++;
                  if(feederRepairTrigger==="PARTIAL_CORE_REJECT"){
                    const certificate=partialCoreCertificate?{...partialCoreCertificate,overloadTaskIds:[...partialCoreCertificate.overloadTaskIds].sort()}:null;
                    const signature=JSON.stringify(certificate);let row=context.partialCoreRejects.find(item=>JSON.stringify(item.certificate)===signature);
                    if(!row){row={certificate,rejectedWitnesses:0,repairAttempts:0,augmentTraversals:0,distinctOrderFingerprints:0};context.partialCoreRejects.push(row);}
                    row.repairAttempts++;row.augmentTraversals+=traversals;row.distinctOrderFingerprints=context.distinctOrderFingerprints;
                  }}
                if(repaired.outcome==="BUDGET_EXHAUSTED")return "BUDGET_EXHAUSTED";
                if(repaired.outcome==="PERFECT")pending.push([next,repaired.matching]);
              }
            }
            continue;
          }
          evidence.feederOrderFallbacks++;
          let completeOrderAtStart=false;
          // Exact transposition: only tails for authorities used by remaining feeders can affect a
          // future placement. Failed equivalent prefixes are not expanded factorially again.
          const failedOrderStates=new Set<string>();
          const orderStateKey=(scheduled:ScheduledTask[],remaining:typeof rankedCohort):string=>{
            const tails=new Map<string,ScheduledTask>();
            const futureAuthorities=new Set(remaining.flatMap(({choice:{feeder:task}})=>[
              `space:${task.spaceId}`,...(task.coachId?[`coach:${task.coachId}`]:[]),
              ...(task.participantId?[`participant:${task.participantId}`]:[]),
              ...(task.itinerantUnitId?[`itinerant:${task.itinerantUnitId}`]:[]),
              ...(task.requiredResourceIds??[]).map(id=>`resource:${id}`)]));
            for(const task of scheduled){
              const authorities=[`space:${task.spaceId}`,...(task.coachId?[`coach:${task.coachId}`]:[]),
                ...(task.participantId?[`participant:${task.participantId}`]:[]),
                ...(task.itinerantUnitId?[`itinerant:${task.itinerantUnitId}`]:[]),
                ...(task.requiredResourceIds??[]).map(id=>`resource:${id}`)];
              for(const authority of authorities)if(futureAuthorities.has(authority)
                &&(tails.get(authority)?.end??-Infinity)<=task.end)tails.set(authority,task);
            }
            const previous=scheduled.at(-1);
            return [remaining.map(({choice})=>choice.task.id).sort().join(","),
              previous?`${previous.end}:${previous.spaceId}:${previous.coachId??""}`:"",
              ...[...tails].sort(([a],[b])=>a.localeCompare(b)).map(([authority,task])=>`${authority}:${task.end}:${task.spaceId}`)].join("|");
          };
          interface FeederOrderFrame { scheduled:ScheduledTask[];remaining:typeof rankedCohort;nextIndex:number;stateKey:string|null }
          const worklist:FeederOrderFrame[]=[{scheduled:[],remaining:rankedCohort,nextIndex:0,stateKey:null}];
          let child:SearchOutcome="DEAD_END";
          let orderBudgetExhausted=false;
          while(worklist.length>0){
            const frame=worklist.at(-1)!;
            if(frame.stateKey===null){
              frame.stateKey=orderStateKey(frame.scheduled,frame.remaining);
              if(failedOrderStates.has(frame.stateKey)){
                worklist.pop();if(worklist.length>0)evidence.backtracks++;continue;
              }
            }
            if(frame.nextIndex>=frame.remaining.length){
              failedOrderStates.add(frame.stateKey);worklist.pop();if(worklist.length>0)evidence.backtracks++;continue;
            }
            const candidate=frame.remaining[frame.nextIndex++]!;
            const previous=frame.scheduled.at(-1);const choice=candidate.choice;
            const transition=previous?.coachId!==undefined&&previous.coachId===choice.feeder.coachId
              ?effectiveCoachTransitionMinutes(problem,previous.coachId,previous.spaceId,choice.feeder.spaceId):0;
            let start=previous?previous.end+transition:blockStart;
            if(previous&&transition===0&&previous.spaceId===choice.feeder.spaceId){const meal=blockMeals.find(item=>item.spaceId===previous.spaceId&&item.start===start);if(meal)start=meal.end;}
            if(start+choice.feeder.duration>candidate.deadline)continue;
            if(!isExactFeederStartInDomain(candidate.domain,start))continue;
            if(!consumeBranch("FEEDER_ORDER_SEARCH_BUDGET_EXHAUSTED","FEEDER_START",runEnd)){
              orderBudgetExhausted=true;break;
            }
            const feeder={...choice.feeder,start,end:start+choice.feeder.duration};
            if(!checkFeederTask(choice,feeder,[...blockPlaced,...blockOperations,...frame.scheduled],blockMeals,runEnd))continue;
            const nextScheduled=[...frame.scheduled,feeder];
            const nextRemaining=frame.remaining.filter(({choice:item})=>item.task.id!==choice.task.id);
            if(nextRemaining.length===0){
              completeOrderAtStart=true;child=closeBlock(nextScheduled);
              if(child!=="DEAD_END")return child;
              evidence.backtracks++;continue;
            }
            worklist.push({scheduled:nextScheduled,remaining:nextRemaining,nextIndex:0,stateKey:null});
          }
          if(feederRow){if(completeOrderAtStart)feederRow.valid++;else feederRow.invalid++;}
          if(orderBudgetExhausted)return "BUDGET_EXHAUSTED";
        }
        if(!validBlockFound)evidence.zeroAlternativePrunes++;
        return "DEAD_END";
      }

      const slot = slots[position]!, choices: MainChoice[] = [];
      evidence.forcedMainSingletonChecks += 1;
      const forcedTaskId = forcedMainSingletonTaskId(blockCertificate, position);
      if (forcedTaskId !== undefined) {
        evidence.forcedMainSingletonChoices += 1;
        evidence.forcedMainSiblingAlternativesEliminated += mains.filter((task) =>
          !blockUsed.has(task.id) && task.id !== forcedTaskId && task.blockKey === pattern[position]
          && taskFitsRequiredCompositePosition(task, position, requiredBlocks, composite)).length;
      }
      for (const task of mains) {
        if (blockUsed.has(task.id) || task.blockKey !== pattern[position]
          || !taskFitsRequiredCompositePosition(task, position, requiredBlocks, composite)
          || (forcedTaskId !== undefined && task.id !== forcedTaskId)) continue;
        if (!consumeBranch("MAIN_CANDIDATE_SEARCH_BUDGET_EXHAUSTED","MAIN_CANDIDATE",position)) return "BUDGET_EXHAUSTED";
        evidence.mainCandidatesEvaluated += 1;
        const operation = materializeAnchoredOperation(problem, task, slot, blockPlaced, meals);
        if (!operation) continue;
        const departureDeadline = latestDepartureStart.get(task.participantId);
        if (departureDeadline !== undefined && operation.end > departureDeadline) continue;
        const participant = problem.participants.find(({ id }) => id === task.participantId)!;
        const containing = participant.availability.filter(({ start, end }) => start <= operation.start && operation.end <= end);
        const slack = containing.length ? Math.min(...containing.map(({ start, end }) => (operation.start-start)+(end-operation.end))) : 0;
        choices.push({ task, operation: operation.tasks, feeder: feederByMain.get(task.id)!, participantSlack: slack,
          firstObligation: operation.start });
      }
      choices.sort((a,b)=>a.participantSlack-b.participantSlack||a.firstObligation-b.firstObligation||a.task.id.localeCompare(b.task.id));
      if (choices.length === 0) {
        evidence.zeroAlternativePrunes += 1;
        if (forcedTaskId !== undefined) evidence.forcedMainSingletonDeadEnds += 1;
        return "DEAD_END";
      }
      const describe = (choice: MainChoice): ExactMainChoiceDescriptor => Object.freeze({
        mainTask: readonlyTaskCopy(choice.task), operationTasks:Object.freeze(choice.operation.map(readonlyTaskCopy)),
        feeder:readonlyTaskCopy(choice.feeder), placedTasks:Object.freeze(blockPlaced.map(readonlyTaskCopy)),
        meals:Object.freeze(meals.map(meal=>Object.freeze({...meal}))), slot, depth:position,
        pattern:Object.freeze([...pattern]), participantSlack:choice.participantSlack, firstObligation:choice.firstObligation });
      const byId=new Map(choices.map(choice=>[choice.task.id,describe(choice)]));
      const baseline=choices.map(choice=>byId.get(choice.task.id)!);
      if(options.mainChoiceComparator)choices.sort((a,b)=>options.mainChoiceComparator!(byId.get(a.task.id)!,byId.get(b.task.id)!));
      const witnessTaskId = [...(blockCertificate?.matching ?? [])]
        .find(([, witnessPosition]) => witnessPosition === position)?.[0];
      if (witnessTaskId !== undefined) choices.sort((a, b) =>
        Number(b.task.id === witnessTaskId) - Number(a.task.id === witnessTaskId));
      options.onMainChoicesRanked?.(Object.freeze([...baseline]),Object.freeze(choices.map(choice=>byId.get(choice.task.id)!)));
      for(const choice of choices){
        cohortCandidatesExplored += 1;
        if (choice.task.id === witnessTaskId) evidence.mainWitnessChoicesFollowed += 1;
        else if (witnessTaskId !== undefined) evidence.mainWitnessFallbacks += 1;
        const descriptor=byId.get(choice.task.id)!; options.onMainChoiceEntered?.(descriptor); descriptors.push(descriptor);
        const nextPlaced=[...blockPlaced,...choice.operation], nextUsed=new Set(blockUsed).add(choice.task.id);
        if(feederRunOptimisticallyImpossible(depth,runEnd,position+1,[...cohort,choice],nextPlaced,nextUsed)){
          descriptors.pop();evidence.backtracks+=1;continue;
        }
        matchingDiagnosticDepth=position;
        const matching=residualMatching(pattern,slots,composite,meals,nextPlaced,nextUsed,position+1,
          options.residualMatchingMode === "FULL_RECOMPUTE" ? undefined : blockCertificate,
          choice.task.id,choice.operation);
        if(matching.outcome === "BUDGET_EXHAUSTED") return matching.outcome;
        if(matching.outcome === "DEAD_END") { evidence.residualMatchingPrunes += 1; evidence.backtracks += 1; descriptors.pop(); continue; }
        const child=assignMains(position+1,nextPlaced,nextUsed,[...cohort,choice],matching.certificate);
        if(typeof child === "object") {
          if(child.targetDepth !== position + 1)return child;
        } else if(child!=="DEAD_END")return child;
        descriptors.pop(); evidence.backtracks+=1;
      }
      if (forcedTaskId !== undefined) evidence.forcedMainSingletonDeadEnds += 1;
      return "DEAD_END";
    };
    let initialCertificate = certificate;
    if(feederRunOptimisticallyImpossible(depth,runEnd,depth,[],placed,used))return "DEAD_END";
    if (initialCertificate === undefined) {
      matchingDiagnosticDepth = depth;
      const matching = residualMatching(pattern, slots, composite, meals, placed, used, depth,
        undefined, "", []);
      if (matching.outcome !== "FOUND") {
        if (matching.outcome === "DEAD_END") evidence.residualMatchingPrunes += 1;
        return matching.outcome;
      }
      initialCertificate = matching.certificate;
    }
    // A run is an assignment problem first.  Enumerating position -> task here used to
    // rediscover every nominal permutation even when none of the resulting operations
    // shared a hard authority.  Repair only edges that are causally implicated by a
    // joint-placement conflict (or by a different cohort being required downstream).
    const forbiddenQueue:ReadonlySet<string>[]=[new Set()];
    const seenForbidden=new Set<string>();
    const seenEquivalentCohorts=new Set<string>();
    let runWitnessBudgetExhausted=false;
    const edgeKey=(taskId:string,position:number)=>`${taskId}@${position}`;
    const enqueueForbidden=(base:ReadonlySet<string>,key:string):void=>{
      const next=new Set(base).add(key);const canonicalKey=[...next].sort().join("|");
      if(!seenForbidden.has(canonicalKey)){
        if(!consumeMatchingBranch()){runWitnessBudgetExhausted=true;return;}
        evidence.residualMatchingAugmentTraversals++;
        seenForbidden.add(canonicalKey);forbiddenQueue.push(next);
      }
    };
    const enqueueCohortExclusion=(base:ReadonlySet<string>,taskId:string):void=>{
      const next=new Set(base);
      for(const edge of initialCertificate!.validEdges.get(taskId)??[])
        if(depth<=edge.position&&edge.position<runEnd)next.add(edgeKey(taskId,edge.position));
      const canonicalKey=[...next].sort().join("|");
      if(!seenForbidden.has(canonicalKey)){
        if(!consumeMatchingBranch()){runWitnessBudgetExhausted=true;return;}
        evidence.residualMatchingAugmentTraversals++;
        seenForbidden.add(canonicalKey);forbiddenQueue.push(next);
      }
    };
    while(forbiddenQueue.length>0){
      if(runWitnessBudgetExhausted)return "BUDGET_EXHAUSTED";
      const forbidden=forbiddenQueue.pop()!;
      const descriptorBase=descriptors.length;
      evidence.mainRunWitnessAttempts++;
      const matching=new Map<string,number>(),owner=new Map<number,string>();
      let witnessBudgetExhausted=false;
      const augment=(taskId:string,seen:Set<number>):boolean=>{
        const preferred=initialCertificate!.matching.get(taskId);
        const edges=[...(initialCertificate!.validEdges.get(taskId)??[])].sort((left,right)=>
          Number(right.position===preferred)-Number(left.position===preferred)||left.position-right.position);
        for(const edge of edges){
          if(forbidden.has(edgeKey(taskId,edge.position))||seen.has(edge.position))continue;
          if(!consumeMatchingBranch()){witnessBudgetExhausted=true;return false;}
          evidence.residualMatchingAugmentTraversals++;
          seen.add(edge.position);const previous=owner.get(edge.position);
          if(previous===undefined||augment(previous,seen)){
            owner.set(edge.position,taskId);matching.set(taskId,edge.position);return true;
          }
        }
        return false;
      };
      let perfect=true;
      for(const taskId of initialCertificate.taskIds)if(!matching.has(taskId)&&!augment(taskId,new Set())){perfect=false;break;}
      if(witnessBudgetExhausted)return "BUDGET_EXHAUSTED";
      if(!perfect)continue;
      const runAssignments=[...matching].filter(([,position])=>depth<=position&&position<runEnd)
        .sort((left,right)=>left[1]-right[1]);
      const assignedEdges=runAssignments.map(([taskId,position])=>({taskId,position,
        operation:(initialCertificate!.validEdges.get(taskId)??[]).find(edge=>edge.position===position)!.operation}));
      /** Contextual, identity-free proof of assignment equivalence.  A task profile contains
       * every active authority that can make assigning that contestant to this position
       * observable downstream.  Unknown/different profiles remain distinct; only equal
       * profiles can share an assignment class. */
      const taskContextSignature=({taskId,operation}:typeof assignedEdges[number]):string=>{
        const task=mains.find(candidate=>candidate.id===taskId)!;
        const feeder=feederByMain.get(taskId)!;
        const anchor=operation.find(item=>item.id===taskId)!;
        const dependencyProfile=(id:string)=>{const dependency=problem.tasks.find(item=>item.id===id);
          return dependency?{kind:dependency.kind,duration:dependency.duration,spaceId:dependency.spaceId,
            blockKey:dependency.blockKey??null,availability:dependency.availability??null,
            resources:[...(dependency.requiredResourceIds??[])].sort()}:null;};
        const future=problem.tasks.filter(item=>item.participantId===task.participantId
          &&item.id!==task.id&&item.id!==feeder.id&&!anchoredTaskIds(problem).has(item.id)).map(item=>({
            kind:item.kind,duration:item.duration,spaceId:item.spaceId,availability:item.availability??null,
            dependencies:item.dependencies.map(dependencyProfile),resources:[...(item.requiredResourceIds??[])].sort(),
          })).sort((left,right)=>JSON.stringify(left).localeCompare(JSON.stringify(right)));
        return JSON.stringify({
          main:{duration:task.duration,availability:task.availability??null,
            participantAvailability:problem.participants.find(item=>item.id===task.participantId)?.availability??null,
            dependencies:task.dependencies.map(dependencyProfile),resources:[...(task.requiredResourceIds??[])].sort(),
            departureDeadline:latestDepartureStart.get(task.participantId)??null},
          operation:operation.map(item=>({kind:item.kind,start:item.start-anchor.start,end:item.end-anchor.start,
            duration:item.duration,spaceId:item.spaceId,coachId:item.coachId??null,
            resources:[...(item.requiredResourceIds??[])].sort(),dependencies:item.dependencies.map(dependencyProfile)})),
          feeder:{duration:feeder.duration,spaceId:feeder.spaceId,availability:feeder.availability??null,
            dependencies:feeder.dependencies.map(dependencyProfile),resources:[...(feeder.requiredResourceIds??[])].sort(),
            transition:latestFeederEndBeforeMain(problem,feeder,task.spaceId,anchor.start,anchor.start)-anchor.start},
          future,continuity:problem.mainFlow.continuity,
        });
      };
      const contextualProfiles=assignedEdges.map(taskContextSignature);
      const cohortKey=contextualProfiles.join("|");
      if(seenEquivalentCohorts.has(cohortKey)){
        evidence.mainRunEquivalentOrdersCollapsed++;
        for(const [taskId] of runAssignments)enqueueCohortExclusion(forbidden,taskId);
        continue;
      }
      seenEquivalentCohorts.add(cohortKey);
      const witnessCohort:MainChoice[]=[];const witnessPlaced=[...placed];const witnessUsed=new Set(used);
      let conflict:[string,number,string,number]|undefined;
      for(const [taskId,position] of runAssignments){
        const task=mains.find(candidate=>candidate.id===taskId)!;
        const edge=(initialCertificate.validEdges.get(taskId)??[]).find(candidate=>candidate.position===position)!;
        const previous=witnessCohort.find(choice=>residualMatchingOperationsMayInteract(problem,choice.operation,edge.operation));
        if(previous){
          const operationValid=edge.operation.every((scheduled,index)=>canPlaceTask(problem,scheduled,scheduled.start,
            [...witnessPlaced,...edge.operation.slice(0,index)],meals));
          if(!operationValid){
            const previousPosition=matching.get(previous.task.id)!;
            conflict=[taskId,position,previous.task.id,previousPosition];break;
          }
        }
        const participant=problem.participants.find(({id})=>id===task.participantId)!;
        const containing=participant.availability.filter(({start,end})=>start<=edge.operation[0]!.start
          &&Math.max(...edge.operation.map(item=>item.end))<=end);
        const slack=containing.length?Math.min(...containing.map(({start,end})=>(edge.operation[0]!.start-start)
          +(end-Math.max(...edge.operation.map(item=>item.end))))):0;
        witnessCohort.push({task,operation:[...edge.operation],feeder:feederByMain.get(task.id)!,participantSlack:slack,
          firstObligation:Math.min(...edge.operation.map(item=>item.start))});
        const choice=witnessCohort.at(-1)!;
        const descriptor:ExactMainChoiceDescriptor=Object.freeze({mainTask:readonlyTaskCopy(task),
          operationTasks:Object.freeze(choice.operation.map(readonlyTaskCopy)),feeder:readonlyTaskCopy(choice.feeder),
          placedTasks:Object.freeze(witnessPlaced.map(readonlyTaskCopy)),meals:Object.freeze(meals.map(meal=>Object.freeze({...meal}))),
          slot:slots[position]!,depth:position,pattern:Object.freeze([...pattern]),participantSlack:slack,
          firstObligation:choice.firstObligation});
        if(options.onMainChoicesRanked){
          const alternatives=assignedEdges.filter(candidate=>!witnessUsed.has(candidate.taskId)).map(candidate=>{
            const candidateTask=mains.find(item=>item.id===candidate.taskId)!;
            return Object.freeze({mainTask:readonlyTaskCopy(candidateTask),
              operationTasks:Object.freeze(candidate.operation.map(readonlyTaskCopy)),
              feeder:readonlyTaskCopy(feederByMain.get(candidate.taskId)!),
              placedTasks:Object.freeze(witnessPlaced.map(readonlyTaskCopy)),
              meals:Object.freeze(meals.map(meal=>Object.freeze({...meal}))),slot:slots[candidate.position]!,
              depth:candidate.position,pattern:Object.freeze([...pattern]),participantSlack:0,
              firstObligation:Math.min(...candidate.operation.map(item=>item.start))});
          });
          const ordered=[...alternatives];
          if(options.mainChoiceComparator)ordered.sort(options.mainChoiceComparator);
          ordered.sort((left,right)=>Number(right.mainTask.id===taskId)-Number(left.mainTask.id===taskId));
          options.onMainChoicesRanked(Object.freeze(alternatives),Object.freeze(ordered));
        }
        descriptors.push(descriptor);options.onMainChoiceEntered?.(descriptor);
        witnessPlaced.push(...edge.operation);witnessUsed.add(task.id);
      }
      if(conflict){
        descriptors.length=descriptorBase;
        evidence.mainRunWitnessRepairs++;
        enqueueForbidden(forbidden,edgeKey(conflict[0],conflict[1]));
        enqueueForbidden(forbidden,edgeKey(conflict[2],conflict[3]));
        continue;
      }
      cohortCandidatesExplored+=witnessCohort.length;
      const profileCounts=new Map<string,number>();
      for(const profile of contextualProfiles)profileCounts.set(profile,(profileCounts.get(profile)??0)+1);
      evidence.mainRunEquivalentOrdersCollapsed += [...profileCounts.values()]
        .reduce((sum,count)=>sum+Math.max(0,count-1),0);
      matchingDiagnosticDepth=runEnd;
      const residual=residualMatching(pattern,slots,composite,meals,witnessPlaced,witnessUsed,runEnd,
        undefined,"",witnessCohort.flatMap(choice=>choice.operation));
      if(residual.outcome==="BUDGET_EXHAUSTED")return residual.outcome;
      if(residual.outcome==="FOUND"){
        const child=assignMains(runEnd,witnessPlaced,witnessUsed,witnessCohort,residual.certificate);
        if(typeof child === "object") {
          if(child.targetDepth<=depth)return child;
          const target=runAssignments.find(([,position])=>position===child.targetDepth-1);
          descriptors.length=descriptorBase;
          if(target){evidence.mainRunWitnessRepairs++;enqueueForbidden(forbidden,edgeKey(target[0],target[1]));}
          continue;
        }
        if(child!=="DEAD_END")return child;
      }
      descriptors.length=descriptorBase;
      // A feeder failure changes cohort membership, not nominal order.  Exclude one
      // selected edge at a time so matching can produce every structurally distinct
      // cohort without regenerating permutations of a cohort already evaluated.
      for(const [taskId] of runAssignments)enqueueCohortExclusion(forbidden,taskId);
    }
    if(runWitnessBudgetExhausted)return "BUDGET_EXHAUSTED";
    return "DEAD_END";
  };

  const residualMatching = (pattern: string[], slots: number[], composite: RequiredCompositePosition,
    meals: ScheduledSpaceMeal[], placed: ScheduledTask[], used: Set<string>, nextDepth: number,
    parent: ResidualMatchingCertificate | undefined, selectedTaskId: string,
    addedTasks: readonly ScheduledTask[]): ResidualMatchingResult => {
    evidence.residualMatchingChecks += 1;
    evidence.residualMatchingInvocations += 1;
    let invocationPositionChecks = 0;
    let invocationCacheHits = 0;
    let invocationAugmentTraversals = 0;
    const remaining = mains.filter(({ id }) => !used.has(id));
    const remainingIds = remaining.map(({ id }) => id);
    const remainingIdSet = new Set(remainingIds);
    const positions = Array.from({ length: mains.length - nextDepth }, (_, index) => nextDepth + index);
    const positionSet = new Set(positions);
    const validEdges = new Map<string, ResidualMatchingEdge[]>();
    const invalidPositions = new Map<string, Set<number>>();
    let derivedTrace: Omit<Parameters<NonNullable<ExactMainAndFeederSearchOptions["onResidualMatchingDerived"]>>[0],
      "positionChecks" | "cacheHits" | "augmentTraversals"> | undefined;

    const evaluate = (task: Task, position: number): ResidualMatchingEdge | null | "BUDGET_EXHAUSTED" => {
      if (!consumeMatchingBranch()) return "BUDGET_EXHAUSTED";
      evidence.residualMatchingPositionChecks += 1;
      invocationPositionChecks += 1;
      const operation = materializeAnchoredOperation(problem, task, slots[position]!, placed, meals);
      if (!operation) return null;
      const departureDeadline = latestDepartureStart.get(task.participantId);
      if (departureDeadline !== undefined && operation.end > departureDeadline) return null;
      return { position, operation: operation.tasks.map((item) => ({ ...item,
        dependencies: [...item.dependencies], requiredResourceIds: item.requiredResourceIds === undefined
          ? undefined : [...item.requiredResourceIds] })) };
    };

    if (parent === undefined) {
      evidence.residualMatchingFullBuilds += 1;
      for (const task of remaining) {
        const taskEdges: ResidualMatchingEdge[] = [];
        const taskInvalid = new Set<number>();
        for (const position of positions) {
          if (task.blockKey !== pattern[position]
            || !taskFitsRequiredCompositePosition(task, position, requiredBlocks, composite)) continue;
          const edge = evaluate(task, position);
          if (edge === "BUDGET_EXHAUSTED") return { outcome: "BUDGET_EXHAUSTED" };
          if (edge) taskEdges.push(edge); else taskInvalid.add(position);
        }
        validEdges.set(task.id, taskEdges);
        invalidPositions.set(task.id, taskInvalid);
        if (taskEdges.length === 0) return { outcome: "DEAD_END" };
      }
    } else {
      evidence.residualMatchingIncrementalUpdates += 1;
      const consumedPosition = nextDepth - 1;
      let invalidatedMatchedEdges = 0;
      let invalidatedUnmatchedEdges = 0;
      let reusedInvalidEdges = 0;
      // Both vertices are removed independently: the parent's matching need not pair them together.
      for (const task of remaining) {
        const parentInvalid = parent.invalidPositions.get(task.id) ?? new Set<number>();
        const retainedInvalid = [...parentInvalid].filter((position) => positionSet.has(position));
        reusedInvalidEdges += retainedInvalid.length;
        invalidPositions.set(task.id, new Set(retainedInvalid));
        const taskEdges: ResidualMatchingEdge[] = [];
        for (const edge of parent.validEdges.get(task.id) ?? []) {
          if (edge.position === consumedPosition || !positionSet.has(edge.position)) continue;
          if (!residualMatchingOperationsMayInteract(problem, edge.operation, addedTasks)) {
            evidence.residualMatchingEdgeCacheHits += 1;
            invocationCacheHits += 1;
            taskEdges.push(edge);
            continue;
          }
          evidence.residualMatchingEdgeCacheMisses += 1;
          const refreshed = evaluate(task, edge.position);
          if (refreshed === "BUDGET_EXHAUSTED") return { outcome: "BUDGET_EXHAUSTED" };
          if (refreshed) taskEdges.push(refreshed);
          else {
            invalidPositions.get(task.id)!.add(edge.position);
            if (parent.matching.get(task.id) === edge.position) invalidatedMatchedEdges += 1;
            else invalidatedUnmatchedEdges += 1;
          }
        }
        validEdges.set(task.id, taskEdges);
        if (taskEdges.length === 0) return { outcome: "DEAD_END" };
      }
      // Assert the requested removal in the derivation rather than relying only on `used`.
      if (parent.taskIds.includes(selectedTaskId) && remainingIdSet.has(selectedTaskId))
        throw new Error("RESIDUAL_MATCHING_SELECTED_TASK_NOT_REMOVED");

      if (options.onResidualMatchingDerived) {
        const retainedTaskIds = new Set<string>();
        for (const [taskId, position] of parent.matching) {
          if (remainingIdSet.has(taskId) && positionSet.has(position)
            && (validEdges.get(taskId) ?? []).some((edge) => edge.position === position)) retainedTaskIds.add(taskId);
        }
        derivedTrace = {
          selectedTaskId,
          consumedPosition,
          selectedTaskPreviousPosition: parent.matching.get(selectedTaskId) ?? null,
          consumedPositionPreviousOwner: [...parent.matching]
            .find(([, position]) => position === consumedPosition)?.[0] ?? null,
          invalidatedMatchedEdges,
          invalidatedUnmatchedEdges,
          reusedInvalidEdges,
          unmatchedBeforeRepair: remainingIds.filter((id) => !retainedTaskIds.has(id)).length,
        };
      }
    }

    const matching = new Map<string, number>();
    const positionOwner = new Map<number, string>();
    if (parent !== undefined) {
      for (const [taskId, position] of parent.matching) {
        if (!remainingIdSet.has(taskId) || !positionSet.has(position)) continue;
        if (!(validEdges.get(taskId) ?? []).some((edge) => edge.position === position)) continue;
        matching.set(taskId, position);
        positionOwner.set(position, taskId);
      }
    }
    const augment = (taskId: string, seen: Set<number>): "MATCHED" | "UNMATCHED" | "BUDGET_EXHAUSTED" => {
      for (const { position } of validEdges.get(taskId) ?? []) {
        if (seen.has(position)) continue;
        if (!consumeMatchingBranch()) return "BUDGET_EXHAUSTED";
        evidence.residualMatchingAugmentTraversals += 1;
        invocationAugmentTraversals += 1;
        seen.add(position);
        const owner = positionOwner.get(position);
        if (owner === undefined) {
          positionOwner.set(position, taskId);
          matching.set(taskId, position);
          return "MATCHED";
        }
        const displaced = augment(owner, seen);
        if (displaced === "BUDGET_EXHAUSTED") return displaced;
        if (displaced === "MATCHED") {
          positionOwner.set(position, taskId);
          matching.set(taskId, position);
          return "MATCHED";
        }
      }
      return "UNMATCHED";
    };
    const unmatched = remainingIds.filter((id) => !matching.has(id));
    if (parent !== undefined && unmatched.length > 0) evidence.residualMatchingRepairs += 1;
    for (const taskId of unmatched) {
      const result = augment(taskId, new Set());
      if (result === "BUDGET_EXHAUSTED") return { outcome: result };
      if (result === "UNMATCHED") {
        if (parent !== undefined) evidence.residualMatchingRepairFailures += 1;
        return { outcome: "DEAD_END" };
      }
    }
    const certificate: ResidualMatchingCertificate = {
      taskIds: remainingIds, positions, validEdges, invalidPositions, matching,
    };
    if (derivedTrace) options.onResidualMatchingDerived!(Object.freeze({ ...derivedTrace,
      positionChecks: invocationPositionChecks,
      cacheHits: invocationCacheHits,
      augmentTraversals: invocationAugmentTraversals,
    }));
    return { outcome: "FOUND", certificate };
  };

  outer: for (const layer of patternLayers) {
    const layerEvidence = { runCount: layer.runCount, patternsGenerated: layer.patterns.length,
      architecturesChecked: 0, rejectionReasons: {} as Partial<Record<MainFeederStructuralRejection, number>> };
    evidence.runLayers.push(layerEvidence);
    if (!layer.complete)
      return fail("BRANCH_BUDGET_EXHAUSTED", ["PATTERN_SEARCH_BUDGET_EXHAUSTED"], coreIds);
    for (const pattern of layer.patterns) {
      if (!consumeBranch("PATTERN_SEARCH_BUDGET_EXHAUSTED"))
        return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
      evidence.patternCandidatesExplored += 1;
      const compositeAllowance = ledger.limit - ledger.branchesExplored;
      const positionsResult = requiredCompositePositions(requiredBlocks, mains, pattern, compositeAllowance);
      if (!ledger.consume("CORE", positionsResult.rawCombinationCount))
        return fail("BRANCH_BUDGET_EXHAUSTED", ["COMPOSITE_SEARCH_BUDGET_EXHAUSTED"], coreIds);
      recordBranch("OTHER",0,positionsResult.rawCombinationCount);
      evidence.branchesExplored = ledger.coreBranches;
      if (positionsResult.exhausted)
        return fail("BRANCH_BUDGET_EXHAUSTED", ["COMPOSITE_SEARCH_BUDGET_EXHAUSTED"], coreIds);
      const positions = positionsResult.positions.length ? positionsResult.positions : [{ startIndexByResourceId: {}, signature: "" }];
      const mealTimelineDomain=hasMainFlowMeal(problem)?candidateTimelineDomain(problem,pattern,duration):undefined;
      if(mealTimelineDomain){evidence.mealTimelineDomainCount+=mealTimelineDomain.domainCount;
        evidence.mealTimelinesEliminatedAnalytically+=mealTimelineDomain.analyticallyEliminated;
        evidence.mealTimelinesPendingAtExhaustion+=mealTimelineDomain.feasibleCount;}
      const timelineRanges=mealTimelineDomain?.ranges??[undefined];
      for(const timelineRange of timelineRanges){
       const timelineCount=timelineRange?.feasibleCount??1;
       for(let timelineIndex=0;timelineIndex<timelineCount;timelineIndex++){
        let timeline:MainFlowTimeline|undefined;
        if(timelineRange){
          if(!consumeBranch("TIMELINE_SEARCH_BUDGET_EXHAUSTED"))
            return fail("BRANCH_BUDGET_EXHAUSTED",[exhaustionReason],coreIds);
          evidence.timelineCandidatesExplored+=1;evidence.mealTimelinesExplored+=1;
          evidence.mealTimelinesPendingAtExhaustion-=1;
          if(timelineRange.strategyRank===0)evidence.mealTimelinesPreferred+=1;else evidence.mealTimelinesNonPreferred+=1;
          timeline=buildTimeline(problem,pattern,duration,timelineRange.cut,timelineRange.startMin+timelineIndex*timelineRange.step);
        }
        const departureEnds = [...latestDepartureStart.values()];
        const historicalEnds = [...new Set([
          problem.mainFlow.preferredEnd,
          ...departureEnds.filter((deadline) => problem.mainFlow.preferredEnd < deadline && deadline <= problem.day.end)
            .sort((left, right) => left - right),
          ...(problem.day.end > problem.mainFlow.preferredEnd ? [problem.day.end] : []),
          ...departureEnds.filter((deadline) => deadline < problem.mainFlow.preferredEnd)
            .sort((left, right) => right - left),
        ])];
        let candidateEnds = timeline
          ? [timeline.meal.start]
          : [...new Set([
            problem.mainFlow.preferredEnd,
            problem.day.start + pattern.length * duration,
            // Structural lower-bound events let backward packing move away from an
            // unusably early preferred end without sweeping human clock values.  The
            // exact closure still decides whether either vocal/styling order works.
            ...pattern.flatMap((blockKey, position) => mains.filter((main) => main.blockKey === blockKey).map((main) => {
              const ancestors = new Map<string, Task>();
              const collect = (id: string): void => {
                const task = problem.tasks.find((candidate) => candidate.id === id);
                if (!task || task.participantId !== main.participantId || ancestors.has(id)) return;
                ancestors.set(id, task);
                for (const dependency of task.dependencies) collect(dependency);
              };
              for (const dependency of main.dependencies) collect(dependency);
              const feeder = feederByMain.get(main.id)!;
              const transition = effectiveCoachTransitionMinutes(problem, main.coachId!, feeder.spaceId, main.spaceId);
              const earliestMainStart = problem.day.start
                + [...ancestors.values()].reduce((sum, task) => sum + task.duration, 0) + transition;
              return earliestMainStart + main.duration + (pattern.length - position - 1) * duration;
            })),
            ...pattern.flatMap((blockKey, runStart) => {
              if (runStart > 0 && pattern[runStart - 1] === blockKey) return [];
              let runEnd = runStart + 1;
              while (runEnd < pattern.length && pattern[runEnd] === blockKey) runEnd += 1;
              const candidates = mains.filter((main) => main.blockKey === blockKey)
                .map((main) => ({ main, feeder: feederByMain.get(main.id)! }));
              const selected = candidates.sort((left, right) => left.feeder.duration - right.feeder.duration
                || left.main.id.localeCompare(right.main.id)).slice(0, runEnd - runStart);
              if (selected.length !== runEnd - runStart) return [];
              const feederLoad = selected.reduce((sum, { feeder }) => sum + feeder.duration, 0);
              const prerequisiteLeadIn = Math.min(...candidates.map(({ feeder }) =>
                optimisticPrerequisiteLeadInMinutes(problem, feeder)));
              const terminalTransition = Math.min(...selected.map(({ main, feeder }) => main.coachId === undefined ? 0
                : effectiveCoachTransitionMinutes(problem, main.coachId, feeder.spaceId, main.spaceId)));
              const withoutLeadIn = problem.day.start + feederLoad + terminalTransition
                + (pattern.length - runStart) * duration;
              return [withoutLeadIn, withoutLeadIn + prerequisiteLeadIn];
            }),
            ...[...new Set(pattern)].flatMap((blockKey) => {
              const runStarts = pattern.flatMap((key, index) => key === blockKey
                && (index === 0 || pattern[index - 1] !== key) ? [index] : []);
              const eligible = mains.filter((main) => main.blockKey === blockKey)
                .map((main) => ({ main, feeder: feederByMain.get(main.id)! }))
                .sort((left, right) => left.feeder.duration - right.feeder.duration
                  || left.main.id.localeCompare(right.main.id));
              let required = 0;
              return runStarts.map((runStart) => {
                let runEnd = runStart + 1;
                while (runEnd < pattern.length && pattern[runEnd] === blockKey) runEnd += 1;
                required += runEnd - runStart;
                const selected = eligible.slice(0, required);
                const feederLoad = selected.reduce((sum, { feeder }) => sum + feeder.duration, 0);
                const prerequisiteLeadIn = Math.min(...eligible.map(({ feeder }) =>
                  optimisticPrerequisiteLeadInMinutes(problem, feeder)));
                const earlierMainLoad = pattern.slice(0, runStart).filter((key) => key === blockKey).length * duration;
                const terminalTransition = Math.min(...selected.map(({ main, feeder }) => main.coachId === undefined ? 0
                  : effectiveCoachTransitionMinutes(problem, main.coachId, feeder.spaceId, main.spaceId)));
                const withoutLeadIn = problem.day.start + feederLoad + earlierMainLoad + terminalTransition
                  + (pattern.length - runStart) * duration;
                return [withoutLeadIn, withoutLeadIn + prerequisiteLeadIn];
              });
            }).flat(),
            ...departureEnds
              .filter((deadline) => problem.mainFlow.preferredEnd < deadline && deadline <= problem.day.end)
              .sort((left, right) => left - right),
            ...(problem.day.end > problem.mainFlow.preferredEnd ? [problem.day.end] : []),
            ...departureEnds
              .filter((deadline) => deadline < problem.mainFlow.preferredEnd)
              .sort((left, right) => right - left),
          ])];
        if (!timeline) {
          const historicalSet = new Set(historicalEnds);
          candidateEnds = [...historicalEnds, ...candidateEnds.filter((end) => !historicalSet.has(end))];
        }
        for (const candidateEnd of candidateEnds) {
          if (!timeline){
            if (!consumeBranch("TIMELINE_SEARCH_BUDGET_EXHAUSTED"))
              return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
            evidence.timelineCandidatesExplored += 1;
          }
          const slots = timeline?.slots ?? pattern.map((_, index) => candidateEnd - pattern.length * duration + index * duration);
          if (slots.length > 0 && slots[0]! < problem.day.start) continue;
          for (const composite of positions) {
            if (!consumeBranch("COMPOSITE_POSITION_SEARCH_BUDGET_EXHAUSTED"))
              return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
            const architectureKey = [pattern.join("|"), timeline?.key ?? `END:${candidateEnd}`, composite.signature].join("::");
            evidence.architecturesChecked += 1;
            layerEvidence.architecturesChecked += 1;
            const rejection = proveMainFeederArchitectureImpossible(problem, mains, feederByMain, { pattern, slots });
            if (rejection) {
              evidence.architecturesStructurallyRejected += 1;
              evidence.structuralRejectionsByReason[rejection] =
                (evidence.structuralRejectionsByReason[rejection] ?? 0) + 1;
              layerEvidence.rejectionReasons[rejection] = (layerEvidence.rejectionReasons[rejection] ?? 0) + 1;
              evidence.feederOrderBranchesByArchitecture[architectureKey] = 0;
              continue;
            }
            if (evidence.firstExactArchitecture === null) {
              evidence.firstExactArchitecture = architectureKey;
              evidence.firstFeedableRunSizes = pattern.reduce<number[]>((runs, key, index) => {
                if (index === 0 || pattern[index - 1] !== key) runs.push(1);
                else runs[runs.length - 1]! += 1;
                return runs;
              }, []);
            }
            evidence.feederOrderBranchesByArchitecture[architectureKey] ??= 0;
            currentArchitecture = architectureKey;
            const result = search(pattern, slots, composite, timeline ? [timeline.meal] : [], [], new Set(), 0,
              timeline?.key ?? null);
            currentArchitecture = null;
            if (result === "BUDGET_EXHAUSTED")
              return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
            if (result === "FOUND") {
              if (selected) selected.timeline = timeline;
              break outer;
            }
          }
        }
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
