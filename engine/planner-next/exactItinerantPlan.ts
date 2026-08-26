import type { PlannerNextProblem, ScheduledItinerantUnitMeal, ScheduledOperationalMeal, ScheduledParticipantMeal, ScheduledResourceMeal, ScheduledRoundPreparation, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { createHash } from "node:crypto";
import { anchoredTaskIds } from "./anchoredAccompaniment";
import {
  createExactSearchLedger,
  runExactMainAndFeederSearch,
  type ExactMainAndFeederCoreStatus,
  type ExactSearchLedger,
  type ExactMainAndFeederSearchOptions,
  type ExactCoreCausalDiagnostic,
  type ExactFutureFeasibilityCausalAssessment,
} from "./exactMainAndFeederCore";
import type { MainFeederStructuralRejection } from "./mainFlowPatterns";
import { generateExactSetupBlockCandidates } from "./exactSetupBlocks";
import { fingerprint } from "./fingerprint";
import { materializeScheduledItinerantUnitMeals } from "./itinerantUnitMeals";
import { canPlaceTask, diagnoseTaskPlacement, effectiveResourceTransitionMinutes, exactStartDomainFromIntervals,
  exactTaskDynamicStartDomain, exactTaskStaticStartDomain, intersectExactStartIntervals } from "./placement";
import { effectiveCoachTransitionMinutes } from "./coachRouteTransitions";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { evaluateParticipantItineraryQuality, type ParticipantItineraryQualitySummary } from "./participantItineraryQuality";
import { createResidualObligationMainOrderer } from "./residualObligationAlignment";
import { validatePlan } from "./validate";
import { assessParticipantMealFutureFeasibility, participantMealWitnessFingerprint, type ParticipantMealWitness } from "./participantMeals";
import { assessOperationalMealFutureFeasibility, operationalMealWitnessFingerprint, type OperationalMealWitness } from "./operationalMeals";
import { setupFamilySequence } from "./setupGrouping";
import { roundSynchronizationTaskIds } from "./roundSynchronization";
import { exploreExactRoundSynchronizationPolicy, type ExactRoundSynchronizationEvidence } from "./exactRoundSynchronization";
import { scheduleTransportGroup, transportGroupCandidates, transportGroupStarts, transportTaskIds } from "./transportGrouping";
import { canPlaceJointGroup, jointGroupIds, jointGroupMembers, jointWorkItemKey, scheduleJointGroup } from "./jointTasks";
import { createTechnicalChainExplorer, getTechnicalChains, technicalChainWorkItemKey, type TechnicalChainStartDomainMode } from "./technicalChains";

export type StandaloneCompletionSelection = "FIRST_HARD_VALID" | "BEST_DOMINATING_WITHIN_BUDGET";
export type CompleteParticipantQuality = Pick<ParticipantItineraryQualitySummary,
  "maximumParticipantIdleMinutes" | "maximumSingleGapMinutes" | "totalIdleMinutes" | "totalGapCount" | "totalSpaceChangeCount">;

/** Returns 1 only when candidate dominates incumbent across the five operational metrics. */
export function compareCompleteParticipantQuality(candidate: CompleteParticipantQuality,
  incumbent: CompleteParticipantQuality): -1 | 0 | 1 {
  const keys: Array<keyof CompleteParticipantQuality> = ["maximumParticipantIdleMinutes", "maximumSingleGapMinutes",
    "totalIdleMinutes", "totalGapCount", "totalSpaceChangeCount"];
  if (keys.some((key) => candidate[key] > incumbent[key])) return 0;
  return keys.some((key) => candidate[key] < incumbent[key]) ? 1 : -1;
}

export type ExactItinerantPlanStatus = "COMPLETE" | "CORE_FAILED" | "UNSUPPORTED_STANDALONE_SHAPE"
  | "INFEASIBLE" | "BRANCH_BUDGET_EXHAUSTED";

export interface ExactItinerantPlanEvidence {
  branchesExplored: number;
  coreBranches: number;
  standaloneBranches: number;
  jointGroupFullGridStarts: number;
  jointGroupAnalyticEligibleStarts: number;
  jointGroupAnalyticallyEliminatedStarts: number;
  jointGroupStartsEvaluated: number;
  technicalChainFullGridStarts:number;
  technicalChainAnalyticEligibleStarts:number;
  technicalChainAnalyticallyEliminatedStarts:number;
  technicalChainStartsEvaluated:number;
  technicalChainPreparedAuthorityBuilds:number;
  technicalChainPreparedAuthorityHits:number;
  technicalChainFixedPlacedScansAvoided:number;
  technicalChainDomainBuildMs:number;
  technicalChainFinalPlacementCheckMs:number;
  technicalChainCompleteCandidates:number;
  technicalChainActiveFrontierPeak:number;
  technicalChainAlternativesDeferred:number;
  technicalChainAlternativesRevisited:number;
  technicalChainDeferredQueuePeak:number;
  technicalChainDeferredPushes:number;
  technicalChainDeferredPops:number;
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
  standaloneForwardChecks: number;
  standaloneForwardStartChecks: number;
  standaloneForwardWitnessesFound: number;
  standaloneForwardPrunes: number;
  standaloneForwardBlockingTaskCounts: Record<string, number>;
  standaloneForwardPrunesByDepth: Record<string, number>;
  standaloneForwardImpactedTaskChecks: number;
  standaloneForwardStaticEligibleStarts: number;
  standaloneForwardStaticEliminatedStarts: number;
  standaloneForwardFullGridStarts: number;
  standaloneForwardDynamicEligibleStarts: number;
  standaloneForwardDynamicEliminatedStarts: number;
  standaloneForwardDynamicNonemptyCertificates: number;
  standaloneForwardOracleChecks: number;
  standaloneForwardOracleFallbacks: number;
  standaloneForwardOracleFallbackReasons: Record<string, number>;
  standaloneForwardAnalyticEmptyDomainPrunes: number;
  standaloneForwardWitnessCacheHits: number;
  standaloneForwardWitnessCacheMisses: number;
  standaloneForwardWitnessCacheEntries: number;
  standaloneForwardWitnessBranchesAvoided: number;
  standaloneLeafSearchBranches: number;
  standaloneForwardBranches: number;
  firstStandaloneForwardPruneDepth: number | null;
  lastStandaloneForwardPruneDepth: number | null;
  lastStandaloneForwardBlockingTaskId: string | null;
  lastStandaloneForwardCausingCoreTaskIds: string[];
  lastStandaloneForwardCausingMainTaskId: string | null;
  lastStandaloneForwardCausingFeederStart: number | null;
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
  /** Deepest block-closed, hard-valid partial frontier observed; unlike coreMaximumDepth,
   * this never counts an open main run whose feeder cohort has not closed. */
  deepestCoreDepthReached: number;
  deepestPartialScheduledTaskCount: number;
  deepestPartialMainRunsClosed: number;
  deepestPartialFeederRunsClosed: number;
  deepestPartialCoreTasksRemaining: number;
  deepestPartialFrontierFingerprint: string | null;
  architecturesChecked: number;
  architecturesStructurallyRejected: number;
  structuralRejectionsByReason: Partial<Record<MainFeederStructuralRejection, number>>;
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
  lastExhaustionPhase: "CORE" | "STANDALONE" | null;
  completePlansObserved: number;
  completeIncumbentReplacements: number;
  completeSelectionMode: StandaloneCompletionSelection;
  completeSelectionStoppedByBudget: boolean;
  firstCompleteFingerprint: string | null;
  selectedCompleteFingerprint: string | null;
  firstCompleteQuality: CompleteParticipantQuality | null;
  selectedCompleteQuality: CompleteParticipantQuality | null;
  setupBlockBranchesExplored: number;
  setupBlockSearchInvocations: number;
  setupBlockStartsExplored: number;
  setupBlockCompleteCandidateCount: number;
  setupBlockBudgetExhaustions: number;
  setupFamilyOrderCandidateCountsBySpaceId: Record<string, Record<string, number>>;
  selectedSetupFamilySequenceBySpaceId: Record<string, string[]>;
  selectedSetupPreparationIds: string[];
  roundSynchronizationSearchInvocations: number;
  roundSynchronizationStartCandidates: number;
  roundSynchronizationAssignmentBranches: number;
  roundSynchronizationAssignmentChecks: number;
  roundSynchronizationCompleteAssignments: number;
  roundSynchronizationBacktracks: number;
  roundSynchronizationZeroAlternativePrunes: number;
  selectedRoundPreparationIds: string[];
  participantMealBranchesExplored:number; participantMealFutureFeasibilityChecks:number; participantMealFutureInfeasibleBranches:number; participantMealBlockingTaskIds:string[]; participantMealAcceptedWitnessFingerprint:string|null; participantMealFinalSelectionOrder:string[]; participantMealAttemptedSelectionTrace:string[];
  causalDiagnostic:ExactCoreCausalDiagnostic|null;
}

export interface ExactItinerantPlanResult {
  status: ExactItinerantPlanStatus;
  complete: boolean;
  scheduledTasks: ScheduledTask[];
  scheduledSetupPreparations: ScheduledSetupPreparation[];
  scheduledRoundPreparations: ScheduledRoundPreparation[];
  scheduledSpaceMeals: ScheduledSpaceMeal[];
  scheduledParticipantMeals: ScheduledParticipantMeal[];
  scheduledResourceMeals: ScheduledResourceMeal[];
  scheduledOperationalMeals: ScheduledOperationalMeal[];
  scheduledItinerantUnitMeals: ScheduledItinerantUnitMeal[];
  remainingTaskIds: string[];
  evidence: ExactItinerantPlanEvidence;
}

type StandaloneOutcome = "FOUND" | "DEAD_END" | "BUDGET_EXHAUSTED";
interface Positions { task: Task; starts: number[]; effectiveDeadline: number }
export type StandaloneForwardStartDomainMode = "STATIC_DOMAIN" | "FULL_GRID";
export type JointGroupStartDomainMode = "ANALYTIC_DOMAIN" | "FULL_GRID";
type ClosedStartInterval = { start: number; end: number };
export interface StandaloneForwardStaticDomain {
  readonly intervals: ReadonlyArray<Readonly<ClosedStartInterval>>;
  readonly eligibleStartCount: number;
  starts(): Generator<number, void, undefined>;
}
export type StandaloneForwardDynamicDomain = StandaloneForwardStaticDomain;
interface StandaloneSearchResult { outcome: StandaloneOutcome; tasks: ScheduledTask[] | null; preparations: ScheduledSetupPreparation[]; roundPreparations: ScheduledRoundPreparation[]; selectionOrder: string[]; participantMeals: ParticipantMealWitness | null; operationalMeals: OperationalMealWitness | null }

const byId = <T extends { id: string }>(a: T, b: T): number => a.id.localeCompare(b.id);
const orderScheduled = (tasks: ScheduledTask[]): ScheduledTask[] =>
  [...tasks].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

const causalHash=(value:unknown):string=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canonicalIntervals=(intervals:ReadonlyArray<Readonly<ClosedStartInterval>>)=>intervals.map(({start,end})=>({start,end}));

/** Complete projection of the authorities read by the block-closed standalone placement check. */
export function standaloneForwardAuthoritySignature(problem:PlannerNextProblem,task:Task,placed:ScheduledTask[],meals:ScheduledSpaceMeal[],staticDomain:StandaloneForwardStaticDomain,startDomainMode:StandaloneForwardStartDomainMode):string{
  const resourceIds=[...(task.requiredResourceIds??[])].sort();
  const relevant=placed.filter(other=>task.dependencies.includes(other.id)||other.dependencies.includes(task.id)
    ||(task.participantId!==undefined&&other.participantId===task.participantId)
    ||(task.coachId!==undefined&&other.coachId===task.coachId)||task.spaceId===other.spaceId
    ||resourceIds.some(id=>(other.requiredResourceIds??[]).includes(id))).sort(byId).map(other=>{const sharedResources=resourceIds.filter(id=>(other.requiredResourceIds??[]).includes(id));return {
      id:other.id,start:other.start,end:other.end,spaceId:other.spaceId,participantId:other.participantId??null,
      coachId:other.coachId??null,requiredResourceIds:[...(other.requiredResourceIds??[])].sort(),dependencies:[...other.dependencies].sort(),kind:other.kind,
      participantTransition:task.spaceId!==other.spaceId&&task.participantId!==undefined&&other.participantId===task.participantId?problem.participantTransitionMinutes:0,
      coachTransitions:task.spaceId!==other.spaceId&&task.coachId!==undefined&&other.coachId===task.coachId
        ?[effectiveCoachTransitionMinutes(problem,task.coachId,task.spaceId,other.spaceId),effectiveCoachTransitionMinutes(problem,task.coachId,other.spaceId,task.spaceId)]:[0,0],
      resourceTransitions:task.spaceId===other.spaceId?[]:sharedResources.map(id=>[id,effectiveResourceTransitionMinutes(problem,id)]),
    }});
  const canonicalAvailability=task.availability?.map(({start,end})=>({start,end})).sort((a,b)=>a.start-b.start||a.end-b.end);
  return causalHash({task:{id:task.id,kind:task.kind,duration:task.duration,spaceId:task.spaceId,
    participantId:task.participantId??null,coachId:task.coachId??null,itinerantUnitId:task.itinerantUnitId??null,
    requiredResourceIds:resourceIds,dependencies:[...task.dependencies].sort(),availability:canonicalAvailability},
    staticDomain:canonicalIntervals(staticDomain.intervals),gridAnchor:problem.day.start,startDomainMode,
    occupations:relevant,meals:meals.filter(meal=>meal.spaceId===task.spaceId||problem.resources.some(resource=>resourceIds.includes(resource.id)&&resource.assignedSpaceId===meal.spaceId)).sort(byId)});
}

/** Exact placed-independent interval domain with a lazy projection onto the original day-relative grid. */
export function standaloneForwardStaticDomain(problem: PlannerNextProblem, task: Task,
  scheduledSpaceMeals: ScheduledSpaceMeal[] = []): StandaloneForwardStaticDomain {
  return exactTaskStaticStartDomain(problem, task, scheduledSpaceMeals);
}

/** Exact interval projection of every placed-task authority in canonical placement. */
export function standaloneForwardDynamicDomain(problem: PlannerNextProblem, task: Task,
  placed: ScheduledTask[], staticDomain = standaloneForwardStaticDomain(problem, task)): StandaloneForwardDynamicDomain {
  return exactTaskDynamicStartDomain(problem, task, placed, staticDomain);
}

/** Exact common start domain for synchronized members against all materialized authorities. */
export function standaloneJointGroupStartDomain(problem: PlannerNextProblem, tasks: Task[],
  placed: ScheduledTask[], scheduledSpaceMeals: ScheduledSpaceMeal[] = []): StandaloneForwardDynamicDomain {
  if (tasks.length === 0) return exactStartDomainFromIntervals(problem, []);
  let common = standaloneForwardDynamicDomain(problem, tasks[0]!, placed,
    standaloneForwardStaticDomain(problem, tasks[0]!, scheduledSpaceMeals)).intervals.map((interval) => ({ ...interval }));
  for (const task of tasks.slice(1)) {
    const member = standaloneForwardDynamicDomain(problem, task, placed,
      standaloneForwardStaticDomain(problem, task, scheduledSpaceMeals));
    common = intersectExactStartIntervals(common, member.intervals.map((interval) => ({ ...interval })));
  }
  return exactStartDomainFromIntervals(problem, common);
}

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
  void coreIds;
  const technicalChainIds = new Set(getTechnicalChains(pending).flat().map(({ id }) => id));
  for (const task of [...pending].sort(byId)) {
    const space = problem.spaces.find(({ id }) => id === task.spaceId);
    const isSetupTask = task.setupFamilyId !== undefined;
    if (task.kind !== "auxiliary" && !technicalChainIds.has(task.id)) reasons.push(`UNSUPPORTED_STANDALONE_TASK_KIND:${task.id}`);
    if (anchoredIds.has(task.id)) reasons.push(`UNSUPPORTED_PENDING_ANCHORED_TASK:${task.id}`);
    if (isSetupTask && space?.setupPolicy === undefined) reasons.push(`UNSUPPORTED_STANDALONE_SETUP:${task.id}`);
    if (space?.secondaryContinuity === "REQUIRED" && !isSetupTask)
      reasons.push(`UNSUPPORTED_STANDALONE_REQUIRED_BLOCK:${task.id}`);
    if (space?.mealPolicy !== undefined)
      reasons.push(`UNSUPPORTED_STANDALONE_SECONDARY_MEAL:${task.id}`);
  }
  return [...new Set(reasons)].sort();
}

/** Pure impact filter only; canPlaceTask remains the authority for actual validity. */
export function tasksCanAffectEachOther(a: Task, b: Task): boolean {
  const aParticipant = a.kind === "technical" ? undefined : a.participantId;
  const bParticipant = b.kind === "technical" ? undefined : b.participantId;
  const aCoach = a.kind === "technical" ? undefined : a.coachId;
  const bCoach = b.kind === "technical" ? undefined : b.coachId;
  return (aParticipant !== undefined && aParticipant === bParticipant)
    || (aCoach !== undefined && aCoach === bCoach)
    || a.spaceId === b.spaceId
    || (a.requiredResourceIds ?? []).some((id) => (b.requiredResourceIds ?? []).includes(id))
    || a.dependencies.includes(b.id) || b.dependencies.includes(a.id);
}

function searchStandaloneForCoreCandidate(problem: PlannerNextProblem, coreTasks: ScheduledTask[], coreMeals: ScheduledSpaceMeal[],
  pending: Task[], ledger: ExactSearchLedger, evidence: ExactItinerantPlanEvidence,
  selection: StandaloneCompletionSelection, jointGroupStartDomainMode: JointGroupStartDomainMode,
  technicalChainStartDomainMode:TechnicalChainStartDomainMode): StandaloneSearchResult {
  evidence.standaloneSearchInvocations += 1;
  let found: ScheduledTask[] | null = null, foundOrder: string[] = [], foundParticipantMeals: ParticipantMealWitness | null = null, foundOperationalMeals: OperationalMealWitness | null = null;
  let foundPreparations: ScheduledSetupPreparation[] = [];
  let foundRoundPreparations: ScheduledRoundPreparation[] = [];
  const consumeLeafBranch = (): boolean => {
    if (!ledger.consume("STANDALONE")) return false;
    evidence.standaloneLeafSearchBranches += 1;
    return true;
  };
  const completeLeaf = (placed: ScheduledTask[], preparations: ScheduledSetupPreparation[], roundPreparations: ScheduledRoundPreparation[], selectionOrder: string[]): StandaloneOutcome => {
    if (!consumeLeafBranch()) return "BUDGET_EXHAUSTED";
    evidence.standaloneCompleteLeafCount += 1;
    const candidate = orderScheduled([...coreTasks, ...placed]);
    const expected = [...problem.tasks].sort(byId).map(({ id }) => id), actual = [...candidate].sort(byId).map(({ id }) => id);
    const exact = actual.length === expected.length && actual.every((id, index) => id === expected[index]);
    const mealBudget={remaining:Math.max(0,ledger.limit-ledger.branchesExplored),consume:(count=1)=>ledger.consume("STANDALONE",count)};
    const mealWitness=exact?assessParticipantMealFutureFeasibility(problem,candidate,mealBudget,"MATERIALIZE"):null;
    if(mealWitness){evidence.participantMealFutureFeasibilityChecks+=1;evidence.participantMealBranchesExplored+=mealWitness.branchesExplored;if(!mealWitness.complete)evidence.participantMealFutureInfeasibleBranches+=1;for(const id of mealWitness.blockingMealTaskIds)if(!evidence.participantMealBlockingTaskIds.includes(id))evidence.participantMealBlockingTaskIds.push(id);}
    const operationalMealBudget={remaining:Math.max(0,ledger.limit-ledger.branchesExplored),consume:(count=1)=>ledger.consume("STANDALONE",count)};
    const operationalMealWitness=exact?assessOperationalMealFutureFeasibility(problem,candidate,operationalMealBudget,"MATERIALIZE"):null;
    if(operationalMealWitness?.reasonCodes.includes("OPERATIONAL_MEAL_BRANCH_BUDGET_EXHAUSTED"))return "BUDGET_EXHAUSTED";
    const fixedResourceMeals=(problem.resourceMeals??[]).map(meal=>({id:meal.id,sourceTaskId:meal.sourceTaskId,resourceIds:[...meal.resourceIds],start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));
    const fixedItinerantMeals=materializeScheduledItinerantUnitMeals(problem);
    if (exact && mealWitness?.complete && operationalMealWitness?.complete && validatePlan(problem, candidate, preparations, coreMeals,[...mealWitness.scheduled],fixedResourceMeals,fixedItinerantMeals,roundPreparations,[...operationalMealWitness.scheduled]).hardValid) {
      const quality = evaluateParticipantItineraryQuality(problem, candidate).summary;
      const compact: CompleteParticipantQuality = { maximumParticipantIdleMinutes: quality.maximumParticipantIdleMinutes,
        maximumSingleGapMinutes: quality.maximumSingleGapMinutes, totalIdleMinutes: quality.totalIdleMinutes,
        totalGapCount: quality.totalGapCount, totalSpaceChangeCount: quality.totalSpaceChangeCount };
      const candidateFingerprint = fingerprint(candidate,preparations,coreMeals,fixedItinerantMeals,roundPreparations,[...operationalMealWitness.scheduled]);
      evidence.completePlansObserved += 1;
      if (!found) {
        found = candidate; foundPreparations = [...preparations]; foundRoundPreparations = [...roundPreparations]; foundOrder = selectionOrder; foundParticipantMeals=mealWitness; foundOperationalMeals=operationalMealWitness; evidence.firstCompleteFingerprint = candidateFingerprint;
        evidence.selectedCompleteFingerprint = candidateFingerprint; evidence.firstCompleteQuality = compact; evidence.selectedCompleteQuality = compact;
      } else if (compareCompleteParticipantQuality(compact, evidence.selectedCompleteQuality!) === 1) {
        found = candidate; foundPreparations = [...preparations]; foundRoundPreparations = [...roundPreparations]; foundOrder = selectionOrder; foundParticipantMeals=mealWitness; foundOperationalMeals=operationalMealWitness; evidence.completeIncumbentReplacements += 1;
        evidence.selectedCompleteFingerprint = candidateFingerprint; evidence.selectedCompleteQuality = compact;
      }
      return selection === "FIRST_HARD_VALID" ? "FOUND" : "DEAD_END";
    }
    return "DEAD_END";
  };
  let completeAfterOrdinary = completeLeaf;
  const search = (remaining: Task[], placed: ScheduledTask[], preparations: ScheduledSetupPreparation[], roundPreparations: ScheduledRoundPreparation[], depth: number, selectionOrder: string[]): StandaloneOutcome => {
    evidence.standaloneMaximumDepth = Math.max(evidence.standaloneMaximumDepth, depth);
    if (remaining.length === 0) {
      return completeAfterOrdinary(placed, preparations, roundPreparations, selectionOrder);
    }
    const alternatives: Positions[] = [];
    for (const task of [...remaining].sort(byId)) {
      const starts: number[] = [];
      for (let start = problem.day.start; start + task.duration <= problem.day.end; start += 5) {
        if (!consumeLeafBranch()) return "BUDGET_EXHAUSTED";
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
      if((problem.participantMeals?.length??0)>0){const mealBudget={remaining:Math.max(0,ledger.limit-ledger.branchesExplored),consume:(count=1)=>ledger.consume("STANDALONE",count)};const mealProbe=assessParticipantMealFutureFeasibility(problem,[...coreTasks,...placed,scheduled],mealBudget,"PROBE");evidence.participantMealFutureFeasibilityChecks+=1;evidence.participantMealBranchesExplored+=mealProbe.branchesExplored;if(!mealProbe.complete){evidence.participantMealFutureInfeasibleBranches+=1;for(const id of mealProbe.blockingMealTaskIds)if(!evidence.participantMealBlockingTaskIds.includes(id))evidence.participantMealBlockingTaskIds.push(id);if(mealProbe.reasonCodes.includes("PARTICIPANT_MEAL_BRANCH_BUDGET_EXHAUSTED"))return "BUDGET_EXHAUSTED";evidence.standaloneBacktracks+=1;continue;}}
      const child = search(remaining.filter(({ id }) => id !== choice.task.id), [...placed, scheduled], preparations, roundPreparations, depth + 1,
        [...selectionOrder, choice.task.id]);
      if (child !== "DEAD_END") return child;
      evidence.standaloneBacktracks += 1;
    }
    return "DEAD_END";
  };
const setupSpaceIds = [...new Set(pending.filter((task) => task.setupFamilyId !== undefined).map(({ spaceId }) => spaceId))].sort();
const setupGroups = setupSpaceIds.map((spaceId) => ({
  spaceId,
  tasks: pending.filter((task) => task.spaceId === spaceId && task.setupFamilyId !== undefined).sort(byId),
}));
const setupTaskIds = new Set(setupGroups.flatMap(({ tasks }) => tasks.map(({ id }) => id)));
const ordinaryPending = pending.filter(({ id }) => !setupTaskIds.has(id)).sort(byId);
const mergeSetupOrderCounts = (spaceId: string, counts: Record<string, number>): void => {
  const merged = { ...(evidence.setupFamilyOrderCandidateCountsBySpaceId[spaceId] ?? {}) };
  for (const [key, count] of Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
    merged[key] = (merged[key] ?? 0) + count;
  evidence.setupFamilyOrderCandidateCountsBySpaceId[spaceId] = merged;
};
let activeRoundPreparations: ScheduledRoundPreparation[] = [];
const searchSetup = (
  index: number,
  placed: ScheduledTask[],
  preparations: ScheduledSetupPreparation[],
  depth: number,
  selectionOrder: string[],
): StandaloneOutcome => {
  if (index >= setupGroups.length) return search(ordinaryPending, placed, preparations, activeRoundPreparations, depth, selectionOrder);
  const group = setupGroups[index]!;
  evidence.setupBlockSearchInvocations += 1;
  const generated = generateExactSetupBlockCandidates(
    problem,
    group.tasks,
    [...coreTasks, ...placed],
    preparations,
    coreMeals,
    ledger,
  );
  evidence.setupBlockBranchesExplored += generated.evidence.branchesExplored;
  evidence.setupBlockStartsExplored += generated.evidence.startsExplored;
  evidence.setupBlockCompleteCandidateCount += generated.evidence.completeCandidateCount;
  mergeSetupOrderCounts(group.spaceId, generated.evidence.familyOrderCandidateCounts);
  if (generated.outcome === "BUDGET_EXHAUSTED") {
    evidence.setupBlockBudgetExhaustions += 1;
    return "BUDGET_EXHAUSTED";
  }
  if (generated.candidates.length === 0) {
    evidence.standaloneZeroAlternativePrunes += 1;
    for (const task of group.tasks)
      evidence.standaloneBlockingTaskCounts[task.id] = (evidence.standaloneBlockingTaskCounts[task.id] ?? 0) + 1;
    return "DEAD_END";
  }
  for (const candidate of generated.candidates) {
    const child = searchSetup(
      index + 1,
      [...placed, ...candidate.tasks],
      [...preparations, ...candidate.preparations],
      depth + candidate.tasks.length,
      [...selectionOrder, ...candidate.tasks.map(({ id }) => id)],
    );
    if (child !== "DEAD_END") return child;
    evidence.standaloneBacktracks += 1;
  }
  return "DEAD_END";
};
const synchronizedTaskIds = roundSynchronizationTaskIds(problem);
const roundPolicies = [...(problem.roundSynchronizations ?? [])].sort((left, right) => left.id.localeCompare(right.id));
const roundTaskIds = new Set(roundPolicies.flatMap((policy) => policy.lanes.flatMap((lane) => lane.taskIds)));
const roundPendingIds = new Set(pending.filter((task) => roundTaskIds.has(task.id)).map((task) => task.id));
if (roundPendingIds.size !== roundTaskIds.size || [...synchronizedTaskIds].some((id) => !roundTaskIds.has(id))) {
  return { outcome: "DEAD_END", tasks: null, preparations: [], roundPreparations: [], selectionOrder: [], participantMeals: null, operationalMeals: null };
}

const mergeRoundEvidence = (delta: ExactRoundSynchronizationEvidence): void => {
  evidence.roundSynchronizationStartCandidates += delta.startCandidates;
  evidence.roundSynchronizationAssignmentBranches += delta.assignmentBranches;
  evidence.roundSynchronizationAssignmentChecks += delta.assignmentChecks;
  evidence.roundSynchronizationCompleteAssignments += delta.completeAssignments;
  evidence.roundSynchronizationBacktracks += delta.backtracks;
  evidence.roundSynchronizationZeroAlternativePrunes += delta.zeroAlternativePrunes;
};

const dynamicTransportIds = transportTaskIds(problem);
const jointItems = jointGroupIds(pending).map((id) => ({
  key: jointWorkItemKey(id),
  kind: "joint" as const,
  tasks: jointGroupMembers(pending, id),
}));
const technicalItems = getTechnicalChains(pending).map((tasks) => ({
  key: technicalChainWorkItemKey(tasks[0]!.id),
  kind: "technical" as const,
  tasks,
}));
const atomicItems = [...jointItems, ...technicalItems].sort((left, right) => left.key.localeCompare(right.key));
const atomicTaskIds = new Set(atomicItems.flatMap(({ tasks }) => tasks.map(({ id }) => id)));
const pendingWithoutRounds = pending.filter(({ id }) => !roundTaskIds.has(id) && !dynamicTransportIds.has(id) && !atomicTaskIds.has(id));
const originalOrdinary = ordinaryPending.splice(0, ordinaryPending.length, ...pendingWithoutRounds.filter(({ id }) => !setupTaskIds.has(id)).sort(byId));
void originalOrdinary;

const searchAtomicItems = (
  index: number,
  placed: ScheduledTask[],
  selectionOrder: string[],
): StandaloneOutcome => {
  if (index >= atomicItems.length) return searchSetup(0, placed, [], placed.length, selectionOrder);
  const item = atomicItems[index]!;
  if (item.kind === "joint") {
    const duration = item.tasks[0]?.duration ?? 0;
    const fullGridCount = Math.max(0, Math.floor((problem.day.end - duration - problem.day.start) / 5) + 1);
    const analyticDomain = standaloneJointGroupStartDomain(problem, item.tasks, [...coreTasks, ...placed], coreMeals);
    const starts = jointGroupStartDomainMode === "FULL_GRID"
      ? (function* () { for (let start = problem.day.start; start + duration <= problem.day.end; start += 5) yield start; })()
      : analyticDomain.starts();
    evidence.jointGroupFullGridStarts += fullGridCount;
    evidence.jointGroupAnalyticEligibleStarts += analyticDomain.eligibleStartCount;
    evidence.jointGroupAnalyticallyEliminatedStarts += fullGridCount - analyticDomain.eligibleStartCount;
    for (const start of starts) {
      if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
      evidence.standaloneBranches += 1;
      evidence.jointGroupStartsEvaluated += 1;
      if (!canPlaceJointGroup(problem, item.tasks, start, [...coreTasks, ...placed])) continue;
      const scheduled = scheduleJointGroup(item.tasks, start);
      const child = searchAtomicItems(index + 1, [...placed, ...scheduled], [...selectionOrder, ...scheduled.map(({ id }) => id)]);
      if (child !== "DEAD_END") return child;
      evidence.standaloneBacktracks += 1;
    }
    for (const task of item.tasks)
      evidence.standaloneBlockingTaskCounts[task.id] = (evidence.standaloneBlockingTaskCounts[task.id] ?? 0) + 1;
    return "DEAD_END";
  }
  const explorer=createTechnicalChainExplorer(problem,item.tasks,[...coreTasks,...placed],
    Math.max(0,ledger.limit-ledger.branchesExplored),technicalChainStartDomainMode,coreMeals,"INCREMENTAL_HEAP",true);
  let accounted={consumed:0,full:0,eligible:0,eliminated:0,complete:0,deferred:0,revisited:0,pushes:0,pops:0,
    builds:0,hits:0,scans:0,domainMs:0,checkMs:0};
  const accountExplorer=()=>{
    const diagnostics=explorer.diagnostics;
    const consumedDelta=explorer.consumed-accounted.consumed;
    if(consumedDelta>0&&!ledger.consume("STANDALONE",consumedDelta))return false;
    evidence.technicalChainFullGridStarts+=diagnostics.fullGridStarts-accounted.full;
    evidence.technicalChainAnalyticEligibleStarts+=diagnostics.analyticEligibleStarts-accounted.eligible;
    evidence.technicalChainAnalyticallyEliminatedStarts+=diagnostics.analyticallyEliminatedStarts-accounted.eliminated;
    evidence.technicalChainStartsEvaluated+=diagnostics.startsEvaluated-accounted.consumed;
    evidence.technicalChainPreparedAuthorityBuilds+=diagnostics.preparedAuthorityBuilds-accounted.builds;
    evidence.technicalChainPreparedAuthorityHits+=diagnostics.preparedAuthorityHits-accounted.hits;
    evidence.technicalChainFixedPlacedScansAvoided+=diagnostics.fixedPlacedScansAvoided-accounted.scans;
    evidence.technicalChainDomainBuildMs+=diagnostics.domainBuildMs-accounted.domainMs;
    evidence.technicalChainFinalPlacementCheckMs+=diagnostics.finalPlacementCheckMs-accounted.checkMs;
    evidence.technicalChainCompleteCandidates+=diagnostics.completeCandidatesYielded-accounted.complete;
    evidence.technicalChainAlternativesDeferred+=diagnostics.alternativesDeferred-accounted.deferred;
    evidence.technicalChainAlternativesRevisited+=diagnostics.alternativesRevisited-accounted.revisited;
    evidence.technicalChainActiveFrontierPeak=Math.max(evidence.technicalChainActiveFrontierPeak,diagnostics.activeFrontierPeak);
    evidence.technicalChainDeferredQueuePeak=Math.max(evidence.technicalChainDeferredQueuePeak,diagnostics.deferredQueuePeak);
    evidence.technicalChainDeferredPushes+=diagnostics.deferredPushes-accounted.pushes;
    evidence.technicalChainDeferredPops+=diagnostics.deferredPops-accounted.pops;
    accounted={consumed:explorer.consumed,full:diagnostics.fullGridStarts,eligible:diagnostics.analyticEligibleStarts,
      eliminated:diagnostics.analyticallyEliminatedStarts,complete:diagnostics.completeCandidatesYielded,
      deferred:diagnostics.alternativesDeferred,revisited:diagnostics.alternativesRevisited,
      pushes:diagnostics.deferredPushes,pops:diagnostics.deferredPops,builds:diagnostics.preparedAuthorityBuilds,
      hits:diagnostics.preparedAuthorityHits,scans:diagnostics.fixedPlacedScansAvoided,
      domainMs:diagnostics.domainBuildMs,checkMs:diagnostics.finalPlacementCheckMs};
    return true;
  };
  while(true){
    const candidate=explorer.nextCandidate();
    if(!accountExplorer()||explorer.exhausted)return "BUDGET_EXHAUSTED";
    if(!candidate)break;
    const child = searchAtomicItems(index + 1, [...placed, ...candidate.tasks],
      [...selectionOrder, ...candidate.tasks.map(({ id }) => id)]);
    if (child !== "DEAD_END") return child;
    evidence.standaloneBacktracks += 1;
  }
  for (const task of item.tasks)
    evidence.standaloneBlockingTaskCounts[task.id] = (evidence.standaloneBlockingTaskCounts[task.id] ?? 0) + 1;
  return "DEAD_END";
};

const searchRounds = (
  index: number,
  placed: ScheduledTask[],
  roundPreparations: ScheduledRoundPreparation[],
  selectionOrder: string[],
): StandaloneOutcome => {
  if (index >= roundPolicies.length) {
    activeRoundPreparations = [...roundPreparations];
    return searchAtomicItems(0, placed, selectionOrder);
  }
  const policy = roundPolicies[index]!;
  evidence.roundSynchronizationSearchInvocations += 1;
  const explored = exploreExactRoundSynchronizationPolicy(
    problem,
    policy,
    [...coreTasks, ...placed],
    [],
    roundPreparations,
    coreMeals,
    ledger,
    (candidate) => searchRounds(
      index + 1,
      [...placed, ...candidate.tasks],
      [...roundPreparations, ...candidate.preparations],
      [...selectionOrder, ...candidate.selectionOrder],
    ),
  );
  mergeRoundEvidence(explored.evidence);
  return explored.outcome;
};

const searchTransportGroups = (
  direction: "arrival" | "departure",
  remaining: Task[],
  placed: ScheduledTask[],
  groupStarts: number[],
  selectionOrder: string[],
  continuation: (placed: ScheduledTask[], selectionOrder: string[]) => StandaloneOutcome,
): StandaloneOutcome => {
  if (!problem.transportPolicy || remaining.length === 0) return continuation(placed, selectionOrder);
  const policy = problem.transportPolicy![direction];
  const candidates = transportGroupCandidates(remaining, policy);
  if (candidates.length === 0) return "DEAD_END";
  for (const group of candidates) {
    const starts = transportGroupStarts(problem, group, [...coreTasks, ...placed], groupStarts, policy);
    if (starts.length === 0) evidence.standaloneBacktracks += 1;
    for (const start of starts) {
      if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
      evidence.standaloneBranches += 1;
      const scheduled = scheduleTransportGroup(group, start);
      const memberIds = new Set(group.map(({ id }) => id));
      const child = searchTransportGroups(
        direction,
        remaining.filter(({ id }) => !memberIds.has(id)),
        [...placed, ...scheduled],
        [...groupStarts, start],
        [...selectionOrder, ...group.map(({ id }) => id)],
        continuation,
      );
      if (child !== "DEAD_END") return child;
      evidence.standaloneBacktracks += 1;
    }
  }
  return "DEAD_END";
};
const departureTasks = problem.transportPolicy
  ? problem.tasks.filter((task) => problem.transportPolicy!.departure.taskIds.includes(task.id)).sort(byId)
  : [];
completeAfterOrdinary = (placed, preparations, roundPreparations, selectionOrder) => searchTransportGroups(
  "departure",
  departureTasks,
  placed,
  [],
  selectionOrder,
  (withDeparture, finalOrder) => completeLeaf(withDeparture, preparations, roundPreparations, finalOrder),
);
const arrivalTasks = problem.transportPolicy
  ? problem.tasks.filter((task) => problem.transportPolicy!.arrival.taskIds.includes(task.id)).sort(byId)
  : [];
const searchOutcome = searchTransportGroups(
  "arrival",
  arrivalTasks,
  [],
  [],
  [],
  (withArrival, arrivalOrder) => searchRounds(0, withArrival, [], arrivalOrder),
);
const outcome = searchOutcome === "DEAD_END" && found !== null ? "FOUND" : searchOutcome;
return { outcome, tasks: found, preparations: foundPreparations, roundPreparations: foundRoundPreparations, selectionOrder: foundOrder, participantMeals: foundParticipantMeals, operationalMeals: foundOperationalMeals };
}

/** Continues every hard-valid exact-core leaf with exact standalone DFS under one shared budget. */
export interface ExactItinerantPlanSearchOptions {
  coreOrderer?: Pick<ExactMainAndFeederSearchOptions, "mainChoiceComparator" | "onMainChoicesRanked" | "onMainChoiceEntered" | "onMainChoiceAccepted" | "feederStartDomainMode">;
  standaloneCompletionSelection?: StandaloneCompletionSelection;
  /** Test oracle only; production always uses the exact analytic static domain. */
  standaloneForwardStartDomainMode?: StandaloneForwardStartDomainMode;
  /** Test oracle only; production intersects exact member domains before projecting grid starts. */
  jointGroupStartDomainMode?: JointGroupStartDomainMode;
  /** Test oracle only; production removes exact technical-chain impossibility regions analytically. */
  technicalChainStartDomainMode?:TechnicalChainStartDomainMode;
  /** Test oracle only; production memoizes positive block-closed witnesses locally. */
  standaloneForwardWitnessMemoization?: boolean;
  causalDiagnostic?: boolean;
}

export function runExactItinerantPlanSearch(problem: PlannerNextProblem,
  options: ExactItinerantPlanSearchOptions = {}): ExactItinerantPlanResult {
  const completeSelectionMode = options.standaloneCompletionSelection ?? "FIRST_HARD_VALID";
  const ledger = createExactSearchLedger(problem.budget.maxBranchExpansions);
  const evidence: ExactItinerantPlanEvidence = {
    branchesExplored: 0, coreBranches: 0, standaloneBranches: 0, standaloneStartChecks: 0,
    jointGroupFullGridStarts: 0, jointGroupAnalyticEligibleStarts: 0,
    jointGroupAnalyticallyEliminatedStarts: 0, jointGroupStartsEvaluated: 0,
    technicalChainFullGridStarts:0,technicalChainAnalyticEligibleStarts:0,
    technicalChainAnalyticallyEliminatedStarts:0,technicalChainStartsEvaluated:0,
    technicalChainPreparedAuthorityBuilds:0,technicalChainPreparedAuthorityHits:0,
    technicalChainFixedPlacedScansAvoided:0,technicalChainDomainBuildMs:0,technicalChainFinalPlacementCheckMs:0,
    technicalChainCompleteCandidates:0,technicalChainActiveFrontierPeak:0,
    technicalChainAlternativesDeferred:0,technicalChainAlternativesRevisited:0,
    technicalChainDeferredQueuePeak:0,technicalChainDeferredPushes:0,technicalChainDeferredPops:0,
    standaloneTaskSelections: 0, standaloneZeroAlternativePrunes: 0, standaloneBacktracks: 0,
    standaloneMaximumDepth: 0, standaloneCompleteLeafCount: 0, coreCompleteLeavesEvaluated: 0,
    coreLeavesRejectedByStandalone: 0, standaloneSearchInvocations: 0, standaloneBlockingTaskCounts: {},
    standaloneForwardChecks: 0, standaloneForwardStartChecks: 0, standaloneForwardWitnessesFound: 0,
    standaloneForwardPrunes: 0, standaloneForwardBlockingTaskCounts: {}, standaloneForwardPrunesByDepth: {},
    standaloneForwardImpactedTaskChecks: 0, standaloneLeafSearchBranches: 0, standaloneForwardBranches: 0,
    standaloneForwardStaticEligibleStarts: 0, standaloneForwardStaticEliminatedStarts: 0,
    standaloneForwardFullGridStarts: 0, standaloneForwardDynamicEligibleStarts: 0,
    standaloneForwardDynamicEliminatedStarts: 0, standaloneForwardDynamicNonemptyCertificates: 0,
    standaloneForwardOracleChecks: 0, standaloneForwardOracleFallbacks: 0,
    standaloneForwardOracleFallbackReasons: {}, standaloneForwardAnalyticEmptyDomainPrunes: 0,
    standaloneForwardWitnessCacheHits: 0, standaloneForwardWitnessCacheMisses: 0,
    standaloneForwardWitnessCacheEntries: 0, standaloneForwardWitnessBranchesAvoided: 0,
    firstStandaloneForwardPruneDepth: null, lastStandaloneForwardPruneDepth: null,
    lastStandaloneForwardBlockingTaskId: null, lastStandaloneForwardCausingCoreTaskIds: [],
    lastStandaloneForwardCausingMainTaskId: null, lastStandaloneForwardCausingFeederStart: null,
    selectedStandaloneTaskIds: [], selectedStandaloneStarts: {}, selectedStandaloneSelectionOrder: [],
    coreFingerprint: null, selectedCoreFingerprint: null, defaultCoreFingerprint: null, fullFingerprint: null,
    remainingTaskIds: [], coreStatus: "INFEASIBLE", coreReasonCodes: [], reasonCodes: [], coreBacktracks: 0,
    coreMaximumDepth: 0, coreCompleteLeafCount: 0,deepestCoreDepthReached:0,
    deepestPartialScheduledTaskCount:0,deepestPartialMainRunsClosed:0,deepestPartialFeederRunsClosed:0,
    deepestPartialCoreTasksRemaining:0,deepestPartialFrontierFingerprint:null,architecturesChecked:0,
    architecturesStructurallyRejected:0,structuralRejectionsByReason:{},firstExactArchitecture:null,firstFeedableRunSizes:[],
    feederOrderBranchesByArchitecture:{},feederOrderBranches:0,feederSlotAnalyticChecks:0,
    feederSlotAnalyticPrunes:0,feederSlotAnalyticAbstentions:0,feederSlotMatchingChecks:0,
    feederSlotMatchingPrunes:0,feederSlotMatchingEdgeChecks:0,feederSlotMatchingAugmentTraversals:0,
    feederSlotMatchingBranchesExplored:0,feederCohortCapacityChecks:0,
    feederCohortPrefixCapacityPrunes:0,feederCohortEddChecks:0,feederCohortEddEmptyPrunes:0,
    blockStartsEliminatedByCohortBound:0,feederCohortContiguousWindowChecks:0,
    feederCohortContiguousWindowPrunes:0,blockStartsEliminatedByContiguousWindowBound:0,
    contiguousWindowSkippedByTransition:0,contiguousWindowSkippedByAuthorizedMeal:0,
    feederRunOptimisticChecks:0,feederRunOptimisticPrunes:0,feederRunOptimisticPrunesByDepth:{},
    feederRunPrePartialChecks:0,feederRunPrePartialPrunes:0,feederRunPrePartialPrunesByDepth:{},
    feederRunPreFeederChecks:0,feederRunPreFeederPrunes:0,feederRunPreFeederPrunesByDepth:{},
    feederRunOptimisticSkippedByTransition:0,feederRunOptimisticSkippedByAuthorizedMeal:0,
    residualMatchingInvocations: 0, residualMatchingFullBuilds: 0,
    residualMatchingIncrementalUpdates: 0, residualMatchingEdgeCacheHits: 0,
    residualMatchingEdgeCacheMisses: 0, residualMatchingPositionChecks: 0,
    residualMatchingAugmentTraversals: 0, residualMatchingBranchesExplored: 0,
    residualMatchingPrunes: 0, residualMatchingRepairs: 0, residualMatchingRepairFailures: 0,
    mainWitnessChoicesFollowed: 0, mainWitnessFallbacks: 0,
    mainRunWitnessAttempts:0,mainRunWitnessRepairs:0,mainRunEquivalentOrdersCollapsed:0,
    feederMatchingWitnessMaterializations:0,feederMatchingWitnessRepairs:0,
    feederMatchingEquivalentOrdersCollapsed:0,feederOrderFallbacks:0,
    forcedMainSingletonChecks: 0, forcedMainSingletonChoices: 0,
    forcedMainSiblingAlternativesEliminated: 0, forcedMainSingletonDeadEnds: 0,
    mainCandidatesExploredBeforeCohort: {},
    lastExhaustionPhase: null,
    completePlansObserved: 0, completeIncumbentReplacements: 0, completeSelectionMode,
    completeSelectionStoppedByBudget: false, firstCompleteFingerprint: null, selectedCompleteFingerprint: null,
    firstCompleteQuality: null, selectedCompleteQuality: null,
    setupBlockBranchesExplored: 0, setupBlockSearchInvocations: 0, setupBlockStartsExplored: 0,
    setupBlockCompleteCandidateCount: 0, setupBlockBudgetExhaustions: 0,
    setupFamilyOrderCandidateCountsBySpaceId: {}, selectedSetupFamilySequenceBySpaceId: {},
    selectedSetupPreparationIds: [],
    roundSynchronizationSearchInvocations: 0, roundSynchronizationStartCandidates: 0,
    roundSynchronizationAssignmentBranches: 0, roundSynchronizationAssignmentChecks: 0,
    roundSynchronizationCompleteAssignments: 0, roundSynchronizationBacktracks: 0,
    roundSynchronizationZeroAlternativePrunes: 0, selectedRoundPreparationIds: [],
    participantMealBranchesExplored:0,participantMealFutureFeasibilityChecks:0,participantMealFutureInfeasibleBranches:0,participantMealBlockingTaskIds:[],participantMealAcceptedWitnessFingerprint:null,participantMealFinalSelectionOrder:[],participantMealAttemptedSelectionTrace:[],causalDiagnostic:null,
  };
  let selectedTasks: ScheduledTask[] | null = null, selectedPreparations: ScheduledSetupPreparation[] = [], selectedRoundPreparations: ScheduledRoundPreparation[] = [], selectedMeals: ScheduledSpaceMeal[] = [], selectedParticipantMeals: ParticipantMealWitness | null = null, selectedOperationalMeals: OperationalMealWitness | null = null, selectedCoreIds = new Set<string>();
  const staticCoreIds = new Set(problem.tasks.filter(({ kind }) => kind === "main" || kind === "vocal").map(({ id }) => id));
  for (const id of anchoredTaskIds(problem)) staticCoreIds.add(id);
  const standaloneTasks = problem.tasks.filter(({ id }) => !staticCoreIds.has(id)).sort(byId);
  const unsupported = unsupportedShapeReasons(problem, standaloneTasks, staticCoreIds);
  if (unsupported.length) {
    evidence.remainingTaskIds = standaloneTasks.map(({ id }) => id); evidence.reasonCodes = unsupported;
    return { status: "UNSUPPORTED_STANDALONE_SHAPE", complete: false, scheduledTasks: [], scheduledSetupPreparations: [], scheduledRoundPreparations: [], scheduledSpaceMeals: [], scheduledParticipantMeals: [],scheduledResourceMeals:[],scheduledOperationalMeals:[],scheduledItinerantUnitMeals:[],
      remainingTaskIds: [...evidence.remainingTaskIds], evidence };
  }
  const supplementalByDepth:Record<string,{participantMeal:number;standaloneForward:number}>={};
  const supplemental=(depth:number)=>supplementalByDepth[String(depth)]??={participantMeal:0,standaloneForward:0};
  const futureAssessments=new Map<string,{rows:Map<string,ExactFutureFeasibilityCausalAssessment>;occurrences:number}>();
  const standaloneForwardWitnessCache=new Map<string,number>();
  const certifyFutureBackjump=(candidate:Parameters<NonNullable<ExactMainAndFeederSearchOptions["onPartialCoreCandidate"]>>[0],task:Task,
    staticDomain:StandaloneForwardStaticDomain,dynamicDomain:StandaloneForwardDynamicDomain,witness:boolean):number|null=>{
    const blockers=staticDomain.eligibleStartCount>0&&dynamicDomain.eligibleStartCount===0
      ?candidate.tasks.filter(other=>tasksCanAffectEachOther(task,other)).map(({id})=>id).sort():[];
    const locallyReconfigurableFeederIds=new Set(candidate.addedTasks
      .filter(({kind})=>kind==="vocal").map(({id})=>id));
    const ancestralTasks=candidate.tasks.filter(({id})=>!locallyReconfigurableFeederIds.has(id));
    const feederIndependentEmpty=blockers.length>0
      &&standaloneForwardDynamicDomain(problem,task,ancestralTasks,staticDomain).eligibleStartCount===0;
    const attributableBlockers=feederIndependentEmpty
      ?ancestralTasks.filter(other=>tasksCanAffectEachOther(task,other)).map(({id})=>id).sort():[];
    const mains=candidate.tasks.filter(({kind})=>kind==="main");
    const contracts=problem.anchoredAccompaniments??[];
    const blockerDepth=(id:string):number|null=>{const blocker=candidate.tasks.find(task=>task.id===id);if(!blocker)return null;
      const mainId=blocker.kind==="main"?blocker.id:mains.find(main=>main.dependencies.includes(id))?.id
        ??contracts.find(contract=>[...contract.beforeTaskIds,...contract.afterTaskIds].includes(id))?.anchorTaskId;
      const index=mains.findIndex(main=>main.id===mainId);return index<0?null:index+1;};
    const depths=attributableBlockers.map(blockerDepth).filter((depth):depth is number=>depth!==null).sort((a,b)=>a-b);
    const target=attributableBlockers.length>0&&depths.length===attributableBlockers.length?Math.max(...depths):null;
    const certified=target!==null&&target<candidate.depth?target:null;
    if(!options.causalDiagnostic)return certified;
    const authoritySignature=standaloneForwardAuthoritySignature(problem,task,candidate.tasks,candidate.meals,staticDomain,options.standaloneForwardStartDomainMode??"STATIC_DOMAIN");
    const result={domain:canonicalIntervals(dynamicDomain.intervals),eligibleStartCount:dynamicDomain.eligibleStartCount,
      empty:!witness,blockers,certifiedBackjumpTargetDepth:certified};
    const resultSignature=causalHash(result),key=`${candidate.depth}|${task.id}|${authoritySignature}`;
    const state=futureAssessments.get(key)??{rows:new Map<string,ExactFutureFeasibilityCausalAssessment>(),occurrences:0};state.occurrences++;
    const existing=state.rows.get(resultSignature);if(existing)existing.occurrences++;else state.rows.set(resultSignature,{depth:candidate.depth,taskId:task.id,authoritySignature,resultSignature,domainEmpty:!witness,
      eligibleStartCount:dynamicDomain.eligibleStartCount,blockers,ancestralDecisionDepths:[...new Set(depths)],certifiedBackjumpTargetDepth:certified,occurrences:1});
    futureAssessments.set(key,state);
    return certified;
  };
  const core = runExactMainAndFeederSearch(problem, { ledger, ...options.coreOrderer, causalDiagnostic:options.causalDiagnostic, onPartialCoreCandidate(candidate) {
    const frontierFingerprint=fingerprint(candidate.tasks,[],candidate.meals);
    const shouldRecord=candidate.depth>evidence.deepestCoreDepthReached
      ||(candidate.depth===evidence.deepestCoreDepthReached
        &&(candidate.tasks.length>evidence.deepestPartialScheduledTaskCount
          ||(candidate.tasks.length===evidence.deepestPartialScheduledTaskCount
            &&(evidence.deepestPartialFrontierFingerprint===null
              ||frontierFingerprint<evidence.deepestPartialFrontierFingerprint))));
    if(shouldRecord){
      let closedRuns=0;
      for(let index=0;index<candidate.depth;index++)
        if(index===0||candidate.pattern[index]!==candidate.pattern[index-1])closedRuns++;
      evidence.deepestCoreDepthReached=candidate.depth;
      evidence.deepestPartialScheduledTaskCount=candidate.tasks.length;
      evidence.deepestPartialMainRunsClosed=closedRuns;
      evidence.deepestPartialFeederRunsClosed=closedRuns;
      const scheduledIds=new Set(candidate.tasks.map(({id})=>id));
      evidence.deepestPartialCoreTasksRemaining=[...staticCoreIds].filter(id=>!scheduledIds.has(id)).length;
      evidence.deepestPartialFrontierFingerprint=frontierFingerprint;
    }
    if((problem.participantMeals?.length??0)>0){const mealBudget={remaining:Math.max(0,ledger.limit-ledger.branchesExplored),consume:(count=1)=>{const ok=ledger.consume("STANDALONE",count);if(ok&&options.causalDiagnostic)supplemental(candidate.depth).participantMeal+=count;return ok;}};const mealProbe=assessParticipantMealFutureFeasibility(problem,candidate.tasks,mealBudget,"PROBE");evidence.participantMealFutureFeasibilityChecks+=1;evidence.participantMealBranchesExplored+=mealProbe.branchesExplored;if(!mealProbe.complete){evidence.participantMealFutureInfeasibleBranches+=1;for(const id of mealProbe.blockingMealTaskIds)if(!evidence.participantMealBlockingTaskIds.includes(id))evidence.participantMealBlockingTaskIds.push(id);return mealProbe.reasonCodes.includes("PARTICIPANT_MEAL_BRANCH_BUDGET_EXHAUSTED")?"BUDGET_EXHAUSTED":"REJECT";}}
    const impacted = standaloneTasks.filter((task) => candidate.addedTasks.some((added) => tasksCanAffectEachOther(task, added)));
    if (impacted.length === 0) return "CONTINUE";
    evidence.standaloneForwardChecks += 1;
    for (const task of impacted) {
      evidence.standaloneForwardImpactedTaskChecks += 1;
      let witness = false;
      const fullGridCount = Math.max(0, Math.floor((problem.day.end - task.duration - problem.day.start) / 5) + 1);
      const staticDomain = standaloneForwardStaticDomain(problem, task, candidate.meals);
      evidence.standaloneForwardFullGridStarts += fullGridCount;
      evidence.standaloneForwardStaticEligibleStarts += staticDomain.eligibleStartCount;
      evidence.standaloneForwardStaticEliminatedStarts += fullGridCount - staticDomain.eligibleStartCount;
      const fullGridMode = options.standaloneForwardStartDomainMode === "FULL_GRID";
      const dynamicDomain = fullGridMode ? staticDomain
        : standaloneForwardDynamicDomain(problem, task, candidate.tasks, staticDomain);
      if (!fullGridMode) {
        evidence.standaloneForwardDynamicEligibleStarts += dynamicDomain.eligibleStartCount;
        evidence.standaloneForwardDynamicEliminatedStarts += staticDomain.eligibleStartCount - dynamicDomain.eligibleStartCount;
        if (dynamicDomain.eligibleStartCount === 0) evidence.standaloneForwardAnalyticEmptyDomainPrunes += 1;
        else evidence.standaloneForwardDynamicNonemptyCertificates += 1;
      }
      const memoizationEnabled=options.standaloneForwardWitnessMemoization!==false;
      const authoritySignature=dynamicDomain.eligibleStartCount>0&&memoizationEnabled
        ?standaloneForwardAuthoritySignature(problem,task,candidate.tasks,candidate.meals,staticDomain,
          options.standaloneForwardStartDomainMode??"STATIC_DOMAIN")
        :null;
      const witnessCacheKey=authoritySignature===null?null:`${candidate.depth}|${task.id}|${authoritySignature}`;
      const cachedOracleBranches=witnessCacheKey===null?undefined:standaloneForwardWitnessCache.get(witnessCacheKey);
      if(cachedOracleBranches!==undefined){
        witness=true;
        evidence.standaloneForwardWitnessCacheHits+=1;
        evidence.standaloneForwardWitnessBranchesAvoided+=cachedOracleBranches;
      }else if(witnessCacheKey!==null)evidence.standaloneForwardWitnessCacheMisses+=1;
      const starts = fullGridMode
        ? Array.from({ length: fullGridCount }, (_, index) => problem.day.start + index * 5)
        : dynamicDomain.starts();
      let fallbackRecorded = false;
      let oracleBranches=0;
      for (const start of witness?[]:starts) {
        if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
        oracleBranches+=1;
        if(options.causalDiagnostic)supplemental(candidate.depth).standaloneForward+=1;
        evidence.standaloneForwardBranches += 1; evidence.standaloneForwardStartChecks += 1;
        evidence.standaloneForwardOracleChecks += 1;
        if (canPlaceTask(problem, task, start, candidate.tasks, candidate.meals)) { witness = true; break; }
        if (!fullGridMode && !fallbackRecorded) {
          const diagnosis = diagnoseTaskPlacement(problem, task, start, candidate.tasks, candidate.meals);
          evidence.standaloneForwardOracleFallbacks += 1;
          const reason = diagnosis.firstRejectionReason ?? "UNKNOWN";
          evidence.standaloneForwardOracleFallbackReasons[reason] = (evidence.standaloneForwardOracleFallbackReasons[reason] ?? 0) + 1;
          fallbackRecorded = true;
        }
      }
      if(witness&&witnessCacheKey!==null&&cachedOracleBranches===undefined){
        standaloneForwardWitnessCache.set(witnessCacheKey,oracleBranches);
        evidence.standaloneForwardWitnessCacheEntries=standaloneForwardWitnessCache.size;
      }
      const certifiedBackjumpTargetDepth=certifyFutureBackjump(candidate,task,staticDomain,dynamicDomain,witness);
      if (witness) { evidence.standaloneForwardWitnessesFound += 1; continue; }
      evidence.standaloneForwardPrunes += 1;
      evidence.standaloneForwardBlockingTaskCounts[task.id] = (evidence.standaloneForwardBlockingTaskCounts[task.id] ?? 0) + 1;
      const depthKey = String(candidate.depth);
      evidence.standaloneForwardPrunesByDepth[depthKey] = (evidence.standaloneForwardPrunesByDepth[depthKey] ?? 0) + 1;
      evidence.firstStandaloneForwardPruneDepth ??= candidate.depth;
      evidence.lastStandaloneForwardPruneDepth = candidate.depth;
      evidence.lastStandaloneForwardBlockingTaskId = task.id;
      evidence.lastStandaloneForwardCausingCoreTaskIds = candidate.addedTasks.map(({ id }) => id).sort();
      evidence.lastStandaloneForwardCausingMainTaskId = candidate.mainTaskId;
      evidence.lastStandaloneForwardCausingFeederStart = candidate.feederStart;
      return certifiedBackjumpTargetDepth===null?"REJECT":{outcome:"CERTIFIED_BACKJUMP",targetDepth:certifiedBackjumpTargetDepth};
    }
    return "CONTINUE";
  }, onHardValidCoreLeaf(candidate) {
    evidence.coreCompleteLeavesEvaluated += 1;
    const coreIds = new Set(candidate.tasks.map(({ id }) => id));
    const standalone = searchStandaloneForCoreCandidate(problem, candidate.tasks, candidate.meals, standaloneTasks, ledger, evidence,
      completeSelectionMode, options.jointGroupStartDomainMode ?? "ANALYTIC_DOMAIN",
      options.technicalChainStartDomainMode??"ANALYTIC_DOMAIN");
    if (standalone.tasks) {
      selectedTasks = standalone.tasks; selectedPreparations = [...standalone.preparations]; selectedRoundPreparations = [...standalone.roundPreparations]; selectedMeals = candidate.meals; selectedParticipantMeals=standalone.participantMeals; selectedOperationalMeals=standalone.operationalMeals; selectedCoreIds = coreIds;
      if(selectedParticipantMeals){evidence.participantMealAcceptedWitnessFingerprint=participantMealWitnessFingerprint(selectedParticipantMeals.scheduled);evidence.participantMealFinalSelectionOrder=[...selectedParticipantMeals.finalSelectionOrder];evidence.participantMealAttemptedSelectionTrace=[...selectedParticipantMeals.attemptedSelectionTrace];}
      evidence.selectedCoreFingerprint = candidate.fingerprint; evidence.coreFingerprint = candidate.fingerprint;
      evidence.selectedStandaloneSelectionOrder = standalone.selectionOrder;
    }
    if (standalone.outcome === "BUDGET_EXHAUSTED") {
      evidence.completeSelectionStoppedByBudget = completeSelectionMode === "BEST_DOMINATING_WITHIN_BUDGET" && standalone.tasks !== null;
      return "BUDGET_EXHAUSTED";
    }
    if (standalone.outcome === "DEAD_END" || !standalone.tasks) {
      evidence.coreLeavesRejectedByStandalone += 1; return "REJECT";
    }
    return "ACCEPT";
  }});
  evidence.causalDiagnostic=core.evidence.causalDiagnostic;
  if(evidence.causalDiagnostic){const summary=evidence.causalDiagnostic.futureFeasibility;const states=[...futureAssessments.values()];summary.assessments=states.flatMap(state=>[...state.rows.values()]).sort((a,b)=>a.depth-b.depth||a.taskId.localeCompare(b.taskId)||a.authoritySignature.localeCompare(b.authoritySignature)||a.resultSignature.localeCompare(b.resultSignature));
    summary.collisions=states.filter(state=>state.rows.size>1).map(state=>{const row=state.rows.values().next().value!;return {depth:row.depth,taskId:row.taskId,authoritySignature:row.authoritySignature,resultSignatures:[...state.rows.keys()].sort()}}).sort((a,b)=>a.depth-b.depth||a.taskId.localeCompare(b.taskId)||a.authoritySignature.localeCompare(b.authoritySignature));summary.authorityResultCollisions=summary.collisions.length;
    for(const state of states){const row=state.rows.values().next().value!;summary.totalEvaluations+=state.occurrences;summary.uniqueAuthorityStates+=1;summary.repeatedEvaluations+=state.occurrences-1;
      const depth=String(row.depth);summary.evaluationsByDepth[depth]=(summary.evaluationsByDepth[depth]??0)+state.occurrences;if(state.occurrences>1)summary.repeatedByDepth[depth]=(summary.repeatedByDepth[depth]??0)+state.occurrences-1;}
    for(const row of summary.assessments){const depth=String(row.depth);
      if(row.domainEmpty){summary.negativeEvaluations+=row.occurrences;summary.repeatedNegativeEvaluations+=row.occurrences-1;summary.negativeByDepth[depth]=(summary.negativeByDepth[depth]??0)+row.occurrences;if(row.certifiedBackjumpTargetDepth!==null)summary.rejectsWithCertifiedBackjumpTarget+=row.occurrences;}}}
  if(evidence.causalDiagnostic)for(const [depth,extra] of Object.entries(supplementalByDepth)){const row=evidence.causalDiagnostic.waterfallByDepth[depth]??={mainCandidate:0,feederStart:0,residualMatching:0,continuation:0,participantMeal:0,standaloneForward:0,other:0,total:0};row.participantMeal+=extra.participantMeal;row.standaloneForward+=extra.standaloneForward;row.total+=extra.participantMeal+extra.standaloneForward;evidence.causalDiagnostic.waterfallByDepth[depth]=row;}
  evidence.branchesExplored = ledger.branchesExplored; evidence.coreBranches = ledger.coreBranches;
  evidence.standaloneBranches = ledger.standaloneBranches; evidence.lastExhaustionPhase = ledger.lastExhaustionPhase;
  evidence.coreStatus = core.status; evidence.coreReasonCodes = [...core.evidence.reasonCodes];
  evidence.coreBacktracks = core.evidence.backtracks; evidence.coreMaximumDepth = core.evidence.maximumDepth;
  evidence.coreCompleteLeafCount = core.evidence.completeLeafCount;
  evidence.architecturesChecked=core.evidence.architecturesChecked;
  evidence.architecturesStructurallyRejected=core.evidence.architecturesStructurallyRejected;
  evidence.structuralRejectionsByReason={...core.evidence.structuralRejectionsByReason};
  evidence.firstExactArchitecture=core.evidence.firstExactArchitecture;
  evidence.firstFeedableRunSizes=[...core.evidence.firstFeedableRunSizes];
  evidence.feederOrderBranchesByArchitecture={...core.evidence.feederOrderBranchesByArchitecture};
  evidence.feederOrderBranches=core.evidence.feederOrderBranches;
  evidence.feederCohortCapacityChecks=core.evidence.feederCohortCapacityChecks;
  evidence.feederCohortPrefixCapacityPrunes=core.evidence.feederCohortPrefixCapacityPrunes;
  evidence.feederCohortEddChecks=core.evidence.feederCohortEddChecks;
  evidence.feederCohortEddEmptyPrunes=core.evidence.feederCohortEddEmptyPrunes;
  evidence.blockStartsEliminatedByCohortBound=core.evidence.blockStartsEliminatedByCohortBound;
  evidence.feederCohortContiguousWindowChecks=core.evidence.feederCohortContiguousWindowChecks;
  evidence.feederCohortContiguousWindowPrunes=core.evidence.feederCohortContiguousWindowPrunes;
  evidence.blockStartsEliminatedByContiguousWindowBound=core.evidence.blockStartsEliminatedByContiguousWindowBound;
  evidence.contiguousWindowSkippedByTransition=core.evidence.contiguousWindowSkippedByTransition;
  evidence.contiguousWindowSkippedByAuthorizedMeal=core.evidence.contiguousWindowSkippedByAuthorizedMeal;
  evidence.feederRunOptimisticChecks=core.evidence.feederRunOptimisticChecks;
  evidence.feederRunOptimisticPrunes=core.evidence.feederRunOptimisticPrunes;
  evidence.feederRunOptimisticPrunesByDepth={...core.evidence.feederRunOptimisticPrunesByDepth};
  evidence.feederRunPrePartialChecks=core.evidence.feederRunPrePartialChecks;
  evidence.feederRunPrePartialPrunes=core.evidence.feederRunPrePartialPrunes;
  evidence.feederRunPrePartialPrunesByDepth={...core.evidence.feederRunPrePartialPrunesByDepth};
  evidence.feederRunPreFeederChecks=core.evidence.feederRunPreFeederChecks;
  evidence.feederRunPreFeederPrunes=core.evidence.feederRunPreFeederPrunes;
  evidence.feederRunPreFeederPrunesByDepth={...core.evidence.feederRunPreFeederPrunesByDepth};
  evidence.feederRunOptimisticSkippedByTransition=core.evidence.feederRunOptimisticSkippedByTransition;
  evidence.feederRunOptimisticSkippedByAuthorizedMeal=core.evidence.feederRunOptimisticSkippedByAuthorizedMeal;
  evidence.feederSlotAnalyticChecks=core.evidence.feederSlotAnalyticChecks;
  evidence.feederSlotAnalyticPrunes=core.evidence.feederSlotAnalyticPrunes;
  evidence.feederSlotAnalyticAbstentions=core.evidence.feederSlotAnalyticAbstentions;
  evidence.feederSlotMatchingChecks=core.evidence.feederSlotMatchingChecks;
  evidence.feederSlotMatchingPrunes=core.evidence.feederSlotMatchingPrunes;
  evidence.feederSlotMatchingEdgeChecks=core.evidence.feederSlotMatchingEdgeChecks;
  evidence.feederSlotMatchingAugmentTraversals=core.evidence.feederSlotMatchingAugmentTraversals;
  evidence.feederSlotMatchingBranchesExplored=core.evidence.feederSlotMatchingBranchesExplored;
  evidence.residualMatchingInvocations = core.evidence.residualMatchingInvocations;
  evidence.residualMatchingFullBuilds = core.evidence.residualMatchingFullBuilds;
  evidence.residualMatchingIncrementalUpdates = core.evidence.residualMatchingIncrementalUpdates;
  evidence.residualMatchingEdgeCacheHits = core.evidence.residualMatchingEdgeCacheHits;
  evidence.residualMatchingEdgeCacheMisses = core.evidence.residualMatchingEdgeCacheMisses;
  evidence.residualMatchingPositionChecks = core.evidence.residualMatchingPositionChecks;
  evidence.residualMatchingAugmentTraversals = core.evidence.residualMatchingAugmentTraversals;
  evidence.residualMatchingBranchesExplored = core.evidence.residualMatchingBranchesExplored;
  evidence.residualMatchingPrunes = core.evidence.residualMatchingPrunes;
  evidence.residualMatchingRepairs = core.evidence.residualMatchingRepairs;
  evidence.residualMatchingRepairFailures = core.evidence.residualMatchingRepairFailures;
  evidence.mainWitnessChoicesFollowed = core.evidence.mainWitnessChoicesFollowed;
  evidence.mainWitnessFallbacks = core.evidence.mainWitnessFallbacks;
  evidence.mainRunWitnessAttempts=core.evidence.mainRunWitnessAttempts;
  evidence.mainRunWitnessRepairs=core.evidence.mainRunWitnessRepairs;
  evidence.mainRunEquivalentOrdersCollapsed=core.evidence.mainRunEquivalentOrdersCollapsed;
  evidence.feederMatchingWitnessMaterializations=core.evidence.feederMatchingWitnessMaterializations;
  evidence.feederMatchingWitnessRepairs=core.evidence.feederMatchingWitnessRepairs;
  evidence.feederMatchingEquivalentOrdersCollapsed=core.evidence.feederMatchingEquivalentOrdersCollapsed;
  evidence.feederOrderFallbacks=core.evidence.feederOrderFallbacks;
  evidence.forcedMainSingletonChecks = core.evidence.forcedMainSingletonChecks;
  evidence.forcedMainSingletonChoices = core.evidence.forcedMainSingletonChoices;
  evidence.forcedMainSiblingAlternativesEliminated = core.evidence.forcedMainSiblingAlternativesEliminated;
  evidence.forcedMainSingletonDeadEnds = core.evidence.forcedMainSingletonDeadEnds;
  evidence.mainCandidatesExploredBeforeCohort = { ...core.evidence.mainCandidatesExploredBeforeCohort };
  evidence.remainingTaskIds = [...core.remainingTaskIds].sort();
  const fail = (status: Exclude<ExactItinerantPlanStatus, "COMPLETE">, reasons: string[]): ExactItinerantPlanResult => {
    evidence.reasonCodes = [...new Set(reasons)].sort();
    return { status, complete: false, scheduledTasks: [], scheduledSetupPreparations: [], scheduledRoundPreparations: [], scheduledSpaceMeals: [], scheduledParticipantMeals: [],scheduledResourceMeals:[],scheduledOperationalMeals:[],scheduledItinerantUnitMeals:[],
      remainingTaskIds: [...evidence.remainingTaskIds], evidence };
  };
  if (core.status === "BRANCH_BUDGET_EXHAUSTED" && selectedTasks === null) return fail("BRANCH_BUDGET_EXHAUSTED",
    [ledger.lastExhaustionPhase === "STANDALONE" ? "STANDALONE_BRANCH_BUDGET_EXHAUSTED" : "CORE_BRANCH_BUDGET_EXHAUSTED"]);
  if (selectedTasks === null) {
    if (evidence.coreCompleteLeavesEvaluated > 0 || evidence.standaloneForwardPrunes > 0)
      return fail("INFEASIBLE", ["NO_COMPLETE_HARD_VALID_ITINERANT_PLAN"]);
    return fail("CORE_FAILED", [`CORE_${core.status}`, ...core.evidence.reasonCodes]);
  }
  const scheduledTasks: ScheduledTask[] = selectedTasks;
  evidence.selectedStandaloneTaskIds = scheduledTasks.filter(({ id }) => !selectedCoreIds.has(id)).map(({ id }) => id).sort();
  evidence.selectedStandaloneStarts = Object.fromEntries(scheduledTasks.filter(({ id }) => !selectedCoreIds.has(id))
    .sort(byId).map(({ id, start }) => [id, start]));
  const scheduledSetupPreparations = [...selectedPreparations];
  evidence.selectedSetupFamilySequenceBySpaceId = Object.fromEntries(problem.spaces
    .filter((space) => space.setupPolicy !== undefined)
    .sort(byId)
    .map((space) => [space.id, setupFamilySequence(scheduledTasks.filter((task) => task.spaceId === space.id))]));
  evidence.selectedSetupPreparationIds = scheduledSetupPreparations.map(({ id }) => id).sort();
  const scheduledRoundPreparations = [...selectedRoundPreparations];
  evidence.selectedRoundPreparationIds = scheduledRoundPreparations.map(({ id }) => id).sort();
  const scheduledItinerantUnitMeals=materializeScheduledItinerantUnitMeals(problem);const scheduledOperationalMeals=[...(selectedOperationalMeals?.scheduled??[])];evidence.fullFingerprint=fingerprint(scheduledTasks,scheduledSetupPreparations,selectedMeals,scheduledItinerantUnitMeals,scheduledRoundPreparations,scheduledOperationalMeals); evidence.remainingTaskIds = []; evidence.reasonCodes = [];
  const scheduledResourceMeals=(problem.resourceMeals??[]).map(meal=>({id:meal.id,sourceTaskId:meal.sourceTaskId,resourceIds:[...meal.resourceIds],start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));
  return { status: "COMPLETE", complete: true, scheduledTasks, scheduledSetupPreparations, scheduledRoundPreparations, scheduledSpaceMeals: [...selectedMeals], scheduledParticipantMeals:[...(selectedParticipantMeals?.scheduled??[])],scheduledResourceMeals,scheduledOperationalMeals,scheduledItinerantUnitMeals,remainingTaskIds: [], evidence };
}

/** Frozen historical control and explicit rollback path. */
export function constructFirstHardValidExactItinerantPlan(problem: PlannerNextProblem): ExactItinerantPlanResult {
  return runExactItinerantPlanSearch(problem, {});
}

/** Accepted exact path: selects the best dominating complete incumbent observed within the shared budget. */
export function constructExactItinerantPlan(problem: PlannerNextProblem, causalDiagnostic=false): ExactItinerantPlanResult {
  const coreIds = new Set(problem.tasks.filter(({ kind }) => kind === "main" || kind === "vocal").map(({ id }) => id));
  for (const id of anchoredTaskIds(problem)) coreIds.add(id);
  const standaloneTasks = problem.tasks.filter(({ id }) => !coreIds.has(id));
  if (standaloneTasks.length === 0) return runExactItinerantPlanSearch(problem,{causalDiagnostic});
  const orderer = createResidualObligationMainOrderer(problem, standaloneTasks);
  return runExactItinerantPlanSearch(problem, {
    coreOrderer: orderer.options,
    standaloneCompletionSelection: "BEST_DOMINATING_WITHIN_BUDGET",
    causalDiagnostic,
  });
}
