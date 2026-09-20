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
import { generateExactSetupBlockCandidates, probeExactSetupMacroDomain } from "./exactSetupBlocks";
import { fingerprint } from "./fingerprint";
import { materializeScheduledItinerantUnitMeals } from "./itinerantUnitMeals";
import { canPlaceTask, diagnoseTaskPlacement, effectiveResourceTransitionMinutes, exactStartDomainFromIntervals,
  exactTaskDynamicStartDomain, exactTaskStaticStartDomain, intersectExactStartIntervals } from "./placement";
import { effectiveCoachTransitionMinutes } from "./coachRouteTransitions";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { evaluateParticipantItineraryQuality, type ParticipantItineraryQualitySummary } from "./participantItineraryQuality";
import { createResidualObligationMainOrderer } from "./residualObligationAlignment";
import { validatePlan } from "./validate";
import { assessParticipantMealFutureFeasibility, probeParticipantMealFutureFeasibility, participantMealWitnessFingerprint, type ParticipantMealWitness } from "./participantMeals";
import { probeParticipantFutureReservations, type ParticipantFutureReservationProbe } from "./participantFutureFeasibility";
import { probeTechnicalChainFutureReservations, type TechnicalChainFutureReservationProbe } from "./technicalChainFutureFeasibility";
import { assessOperationalMealFutureFeasibility, operationalMealWitnessFingerprint, type OperationalMealWitness } from "./operationalMeals";
import { mainFlowMealPolicy } from "./mainFlowMeal";
import { setupFamilySequence } from "./setupGrouping";
import { roundSynchronizationTaskIds } from "./roundSynchronization";
import { exploreExactRoundSynchronizationPolicy, probeExactRoundSynchronizationMacroDomain, type ExactRoundSynchronizationEvidence } from "./exactRoundSynchronization";
import { assessCoreArrivalTransportFeasibility, materializeTerminalTransport, transportTaskIds, type TransportMaterializationEvidence } from "./transportGrouping";
import { canPlaceJointGroup, jointGroupIds, jointGroupMembers, jointWorkItemKey, scheduleJointGroup } from "./jointTasks";
import { createTechnicalChainExplorer, getTechnicalChains, probeExactTechnicalChainMacroDomain, technicalChainWorkItemKey, type TechnicalChainStartDomainMode } from "./technicalChains";
import { selectMostConstrainedUnit } from "./macroScheduling";
import { checkIndividualPendingPrerequisiteReservations, checkMacroPendingPrerequisites, type MacroPendingPrerequisiteForwardCache } from "./macroPendingPrerequisiteForwardCheck";
import { materializeFirstNominalPipelineWitness, materializeNominalPipelineWitness } from "./anonymousPipelineWitness";

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

export type TerminalCompletionRejectionCause = "SUBSTANTIVE_IDENTITY_INCOMPLETE"
  | "PARTICIPANT_MEAL_WITNESS_INCOMPLETE" | "OPERATIONAL_MEAL_WITNESS_INCOMPLETE"
  | "TRANSPORT_MATERIALIZATION_FAILED" | "CANDIDATE_IDENTITY_MISMATCH" | "VALIDATION_REJECTED";

export interface TerminalCompletionRejection {
  readonly cause: TerminalCompletionRejectionCause;
  readonly phase: "SUBSTANTIVE_IDENTITY" | "PARTICIPANT_MEALS" | "OPERATIONAL_MEALS"
    | "TRANSPORT_MATERIALIZATION" | "CANDIDATE_IDENTITY" | "VALIDATION";
  readonly expectedTaskCount: number;
  readonly actualTaskCount: number;
  readonly participantMealWitness: ParticipantMealWitness | null;
  readonly operationalMealWitness: OperationalMealWitness | null;
  readonly transportWitness: TransportMaterializationEvidence | null;
  readonly validation: { readonly hardValid: boolean; readonly reasonCodes: readonly string[];
    readonly violations: readonly import("./contracts").ValidationViolationDetail[] } | null;
}

export type StandaloneDeadEndCauseKind = "MACRO_ZERO_DOMAIN" | "MACRO_CANDIDATES_EXHAUSTED"
  | "PREREQUISITE_RESERVATION_PRUNE" | "ORDINARY_ZERO_DYNAMIC_DOMAIN" | "ORDINARY_STARTS_REJECTED";

/** First material DFS dead-end. This is diagnostic only and never participates in search decisions. */
export interface StandaloneDeadEndCause {
  readonly kind: StandaloneDeadEndCauseKind;
  readonly phase: "MACRO" | "ORDINARY";
  readonly depth: number;
  readonly workItemId: string;
  readonly workItemKind: string;
  readonly taskIds: readonly string[];
  readonly domainBefore: number | null;
  readonly domainAfter: number;
  readonly candidatesEvaluated: number;
  readonly blockingTaskId: string | null;
  readonly blockingAuthority: string | null;
  readonly firstPlacementRejection: { readonly start: number; readonly reason: string;
    readonly blockingPlacedTaskId: string | null } | null;
  readonly ancestralDecisions: readonly { readonly taskId: string; readonly start: number }[];
}

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
  technicalChainMacroDomainQueries:number;technicalChainMacroDomainCandidates:number;technicalChainMacroDomainCacheHits:number;technicalChainMacroDomainCacheMisses:number;
  technicalChainRootStartsConsidered:number;technicalChainRootStartsFeasible:number;technicalChainBranchesExplored:number;
  standaloneStartChecks: number;
  standaloneTaskSelections: number;
  standaloneZeroAlternativePrunes: number;
  standaloneBacktracks: number;
  standaloneMaximumDepth: number;
  standaloneCompleteLeafCount: number;
  standaloneBranchesByDepth: Record<string, number>;
  standaloneSelectionsByTaskId: Record<string, number>;
  standaloneCandidateStartsByTaskId: Record<string, number>;
  standaloneFirstSelectedTaskId: string | null;
  standaloneDominantPathFirst20: Array<{ taskId: string; start: number }>;
  standaloneFirstDominantBlocker: { taskId: string; count: number } | null;
  standaloneBranchesBeforeFirstOrdinaryCompleteLeaf: number | null;
  standaloneBranchesAfterFirstOrdinaryCompleteLeaf: number;
  terminalTransportMaterializationAttempts: number;
  terminalTransportMaterializationFailures: number;
  terminalTransportWitness: TransportMaterializationEvidence | null;
  terminalCompletionRejectionsByCause: Record<TerminalCompletionRejectionCause, number>;
  firstTerminalCompletionRejection: TerminalCompletionRejection | null;
  coreLeafTransportPrunes: number;
  transportContiguousStates: number;
  membershipFallbackEntered: number;
  coreLeafArrivalEvidence: TransportMaterializationEvidence["directions"][number] | null;
  firstHardValidCoreLeaf: {
    coreTaskCount: number;
    coreTasksByKind: Record<string, number>;
    pendingSupportingTotal: number;
    pendingOrdinaryNoTransport: number;
    pendingDynamicTransport: number;
    pendingTasksByKind: Record<string, number>;
  } | null;
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
  patternCandidatesExplored:number;
  timelineCandidatesExplored:number;
  mainCandidatesEvaluated:number;
  feederCandidatesEvaluated:number;
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
  setupBlockMatchingAttempts: number;
  setupBlockMatchingSuccesses: number;
  setupBlockPermutationBranchesAvoided: number;
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
  totalesMacroCandidates: number;
  totalesMatchingAttempts: number;
  totalesMatchingSuccesses: number;
  totalesAssignmentBranchesAvoided: number;
  criticalResourceBranches: number;
  criticalResourceMacroCandidates: number;
  criticalResourceAssignments: number;
  macroUnitsSelected: number;
  macroSelectionOrder: string[];
  macroSelectionReason: string[];
  macroDomainSizes: Record<string, number>;
  macroSelectionSteps: Array<{ selected: string; reason: string; candidates: Array<{ id: string; kind: string; domainSize: number; domainMeasure: string; domainExact: boolean; hardResourceAvailabilityMinutes: number; totalDuration: number; affectedTaskCount: number; structuralCandidateCount?: number; matchingFeasibleCandidateCount?: number }> }>;
  macroPendingPrerequisiteForwardChecks:number;macroPendingPrerequisiteTasksChecked:number;macroPendingPrerequisiteIndividualDomainChecks:number;
  macroPendingPrerequisiteCollectiveCapacityChecks:number;macroPendingPrerequisiteObligationsChecked:number;macroPendingPrerequisiteCollectiveCapacityPrunes:number;
  macroPendingPrerequisiteJointChecks:number;macroPendingPrerequisiteCacheHits:number;macroPendingPrerequisiteCacheMisses:number;
  macroPendingPrerequisitePrunes:number;macroPendingPrerequisiteIndividualZeroDomainPrunes:number;macroPendingPrerequisiteJointInfeasiblePrunes:number;
  macroPendingPrerequisiteWitnesses:number;macroPendingPrerequisiteChecksByDepth:Record<string,number>;
  macroPendingPrerequisiteBlockingTaskCounts:Record<string,number>;macroPendingPrerequisiteCausingMacroUnitCounts:Record<string,number>;
  macroPendingPrerequisiteFirstPrune:{causingMacroUnitId:string;blockingTaskId:string;macroDepth:number;deadline:number|null;failure:string;authorityId:string|null;demandMinutes:number|null;freeCapacityMinutes:number|null}|null;
  ordinaryDomainQueries: number;
  ordinaryAnalyticDomainBuilds: number;
  ordinaryAnalyticEligibleStarts: number;
  ordinaryExactStartEnumerations: number;
  ordinaryExactStartChecks: number;
  ordinaryDomainCacheHits: number;
  ordinaryDomainCacheMisses: number;
  ordinaryDomainRecomputations: number;
  ordinaryMRVSelections: number;
  ordinaryBranchesExplored: number;
  ordinaryIndividualForwardChecks: number;
  ordinaryIndividualForwardTasksChecked: number;
  ordinaryIndividualForwardExactDomainChecks: number;
  ordinaryIndividualForwardStartsChecked: number;
  ordinaryIndividualForwardZeroDomainPrunes: number;
  ordinaryIndividualForwardUnrelatedSkips: number;
  ordinaryIndividualForwardWitnesses: number;
  ordinaryIndividualForwardCausingTaskCounts: Record<string, number>;
  ordinaryIndividualForwardBlockingTaskCounts: Record<string, number>;
  ordinaryIndividualForwardChecksByDepth: Record<string, number>;
  ordinaryIndividualForwardFirstPrune: { causingTaskId: string; blockingTaskId: string; depth: number } | null;
  corePrerequisiteReservationChecks: number;
  corePrerequisiteReservationPrunes: number;
  ordinaryPrerequisiteReservationChecks: number;
  ordinaryPrerequisiteReservationPrunes: number;
  firstPrerequisiteReservationPrune: { phase:"CORE"|"ORDINARY"; causingTaskId:string; blockingPrerequisiteId:string; depth:number; deadline:number; duration:number; earliestFeasibleStart:number|null; latestFeasibleStart:number|null; failure:"INDIVIDUAL_ZERO_DOMAIN" } | null;
  firstStandaloneDeadEndCause: StandaloneDeadEndCause | null;
  standaloneBlockingTaskDetails: Record<string, { taskId: string; participantId: string | null; spaceId: string; duration: number; requiredResourceIds: string[]; setupFamilyId: string | null; kind: string }>;
  selectedRoundPreparationIds: string[];
  participantMealBranchesExplored:number; participantMealFutureFeasibilityChecks:number; participantMealFutureInfeasibleBranches:number; participantMealCheapProbes:number; participantMealAffectedObligationsChecked:number; participantMealAnalyticDomainBuilds:number; participantMealLogicalGridStarts:number; participantMealAnalyticallyEliminatedStarts:number; participantMealActuallyEvaluatedStarts:number; participantMealZeroDomainPrunes:number; participantMealAnalyticCollectivePrunes:number; participantMealExactSearchesAvoided:number; participantMealExactMaterializations:number; participantMealBlockingTaskIds:string[]; participantMealAcceptedWitnessFingerprint:string|null; participantMealFinalSelectionOrder:string[]; participantMealAttemptedSelectionTrace:string[];
  firstParticipantMealFuturePrune:{ phase:"CORE"|"STANDALONE"; causingTaskId:string; scheduledCandidateStart:number;
    blockingMealTaskId:string; participantId:string; candidateCount:number; domainResult:"ZERO_DOMAIN"|"ANALYTIC_COLLECTIVE_INFEASIBLE";
    reasonCodes:string[] }|null;
  participantFutureReservationChecks:number; participantFutureReservationPasses:number; participantFutureReservationPrunes:number;
  participantFutureReservationAbstentions:number; participantFutureAffectedParticipants:number;
  participantFutureTasksChecked:number; participantFutureMealsChecked:number; participantFutureIndividualDomainChecks:number;
  participantFutureIndividualZeroDomainPrunes:number; participantFutureJointTaskMealChecks:number;
  participantFutureJointTaskMealPrunes:number; participantFutureCollectiveChecks:number; participantFutureCollectivePrunes:number;
  participantFutureCompatiblePairChecks:number; participantFutureAnalyticChecks:number; participantFutureBranchesConsumed:number;
  firstParticipantFutureReservationPrune:({phase:"CORE"|"STANDALONE";causingTaskId:string;causingCandidateStart:number;depth:number} & ParticipantFutureReservationProbe)|null;
  technicalChainFutureReservationChecks:number; technicalChainFutureReservationPasses:number;
  technicalChainFutureReservationPrunes:number; technicalChainFutureReservationAbstentions:number;
  technicalChainFutureBranchesConsumed:number;
  firstTechnicalChainFutureReservationPrune:({phase:"CORE"|"STANDALONE";causingTaskId:string;causingCandidateStart:number;depth:number} & TechnicalChainFutureReservationProbe)|null;
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

function recordParticipantFutureReservation(evidence:ExactItinerantPlanEvidence,probe:ParticipantFutureReservationProbe):void {
  evidence.participantFutureReservationChecks++;
  evidence.participantFutureReservationPasses+=Number(probe.status==="PASS");
  evidence.participantFutureReservationPrunes+=Number(probe.status==="PRUNE");
  evidence.participantFutureReservationAbstentions+=Number(probe.status==="ABSTAIN");
  evidence.participantFutureAffectedParticipants+=probe.affectedParticipants.length;
  evidence.participantFutureTasksChecked+=probe.affectedFutureTasksChecked;
  evidence.participantFutureMealsChecked+=probe.affectedMealsChecked;
  evidence.participantFutureIndividualDomainChecks+=probe.individualDomainChecks;
  evidence.participantFutureIndividualZeroDomainPrunes+=probe.individualZeroDomainPrunes;
  evidence.participantFutureJointTaskMealChecks+=probe.jointTaskMealChecks;
  evidence.participantFutureJointTaskMealPrunes+=probe.jointTaskMealPrunes;
  evidence.participantFutureCollectiveChecks+=probe.collectiveChecks;
  evidence.participantFutureCollectivePrunes+=probe.collectivePrunes;
  evidence.participantFutureCompatiblePairChecks+=probe.compatiblePairChecks;
  evidence.participantFutureAnalyticChecks+=probe.analyticChecks;
  evidence.participantFutureBranchesConsumed+=probe.branchesConsumed;
}
function recordTechnicalChainFutureReservation(evidence:ExactItinerantPlanEvidence,probe:TechnicalChainFutureReservationProbe):void {
  evidence.technicalChainFutureReservationChecks++;
  evidence.technicalChainFutureReservationPasses+=Number(probe.status==="PASS");
  evidence.technicalChainFutureReservationPrunes+=Number(probe.status==="PRUNE");
  evidence.technicalChainFutureReservationAbstentions+=Number(probe.status==="ABSTAIN");
  evidence.technicalChainFutureBranchesConsumed+=probe.branchesConsumed;
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
  const technicalChainIds = new Set(getTechnicalChains(pending,problem.technicalChains).flat().map(({ id }) => id));
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
  technicalChainStartDomainMode:TechnicalChainStartDomainMode, acceptsValidation?:ExactItinerantPlanSearchOptions["acceptsValidation"]): StandaloneSearchResult {
  evidence.standaloneSearchInvocations += 1;
  const invocationStartBranches = ledger.standaloneBranches;
  let found: ScheduledTask[] | null = null, foundOrder: string[] = [], foundParticipantMeals: ParticipantMealWitness | null = null, foundOperationalMeals: OperationalMealWitness | null = null;
  let foundPreparations: ScheduledSetupPreparation[] = [];
  let foundRoundPreparations: ScheduledRoundPreparation[] = [];
  const ordinaryDomainCache = new Map<string, StandaloneForwardDynamicDomain>();
  const ordinaryStaticDomainCache = new Map<string, StandaloneForwardStaticDomain>();
  const ordinaryStaticDomain = (task: Task): StandaloneForwardStaticDomain => {
    const cached = ordinaryStaticDomainCache.get(task.id);
    if (cached) return cached;
    const domain = standaloneForwardStaticDomain(problem, task, coreMeals);
    ordinaryStaticDomainCache.set(task.id, domain);
    return domain;
  };
  const macroDomainCache = new Map<string, { domainSize:number; structuralCandidateCount?:number; matchingFeasibleCandidateCount?:number }>();
  const macroPendingPrerequisiteCache:MacroPendingPrerequisiteForwardCache=new Map();
  const staticMacroDomains = new Map<string, StandaloneForwardStaticDomain>();
  const recordDeadEnd = (cause: StandaloneDeadEndCause): void => {
    evidence.firstStandaloneDeadEndCause ??= cause;
  };
  const ancestors = (selectionOrder: readonly string[], placed: readonly ScheduledTask[]) => selectionOrder
    .map((taskId) => placed.find((task) => task.id === taskId))
    .filter((task): task is ScheduledTask => task !== undefined)
    .map(({ id: taskId, start }) => ({ taskId, start }));
  const recordBlockingTask = (task: Task): void => {
    evidence.standaloneBlockingTaskCounts[task.id] = (evidence.standaloneBlockingTaskCounts[task.id] ?? 0) + 1;
    evidence.standaloneBlockingTaskDetails[task.id] ??= {
      taskId: task.id, participantId: task.participantId ?? null, spaceId: task.spaceId,
      duration: task.duration, requiredResourceIds: [...(task.requiredResourceIds ?? [])].sort(),
      setupFamilyId: task.setupFamilyId ?? null, kind: task.kind,
    };
  };
  const consumeLeafBranch = (depth: number): boolean => {
    if (!ledger.consume("STANDALONE")) return false;
    evidence.standaloneLeafSearchBranches += 1;
    evidence.standaloneBranchesByDepth[String(depth)] = (evidence.standaloneBranchesByDepth[String(depth)] ?? 0) + 1;
    return true;
  };
  const completeLeaf = (placed: ScheduledTask[], preparations: ScheduledSetupPreparation[], roundPreparations: ScheduledRoundPreparation[], selectionOrder: string[]): StandaloneOutcome => {
    evidence.standaloneBranchesBeforeFirstOrdinaryCompleteLeaf ??= ledger.standaloneBranches - invocationStartBranches;
    if (!consumeLeafBranch(selectionOrder.length)) return "BUDGET_EXHAUSTED";
    evidence.standaloneCompleteLeafCount += 1;
    const substantive = orderScheduled([...coreTasks, ...placed]);
    const expected = [...problem.tasks].sort(byId).map(({ id }) => id);
    const expectedSubstantive = problem.tasks.filter(({ id }) => !transportTaskIds(problem).has(id)).sort(byId).map(({ id }) => id);
    const actualSubstantive = [...substantive].sort(byId).map(({ id }) => id);
    const transportAlreadyMaterialized=actualSubstantive.length===expected.length
      &&actualSubstantive.every((id,index)=>id===expected[index]);
    const exactSubstantive = transportAlreadyMaterialized||(actualSubstantive.length === expectedSubstantive.length
      && actualSubstantive.every((id, index) => id === expectedSubstantive[index]));
    const mealBudget={remaining:Math.max(0,ledger.limit-ledger.branchesExplored),consume:(count=1)=>ledger.consume("STANDALONE",count)};
    const mealWitness=exactSubstantive?assessParticipantMealFutureFeasibility(problem,substantive,mealBudget,"MATERIALIZE"):null;
    if(mealWitness){evidence.participantMealFutureFeasibilityChecks+=1;evidence.participantMealExactMaterializations+=1;evidence.participantMealLogicalGridStarts+=mealWitness.logicalGridStarts;evidence.participantMealActuallyEvaluatedStarts+=mealWitness.actuallyEvaluatedStarts;evidence.participantMealBranchesExplored+=mealWitness.branchesExplored;if(!mealWitness.complete)evidence.participantMealFutureInfeasibleBranches+=1;for(const id of mealWitness.blockingMealTaskIds)if(!evidence.participantMealBlockingTaskIds.includes(id))evidence.participantMealBlockingTaskIds.push(id);}
    const operationalMealBudget={remaining:Math.max(0,ledger.limit-ledger.branchesExplored),consume:(count=1)=>ledger.consume("STANDALONE",count)};
    const mainMealAuthority=mainFlowMealPolicy(problem);
    const fixedMainOperationalMeals:ScheduledOperationalMeal[]=mainMealAuthority ? (problem.operationalMealPolicies??[])
      .filter(policy=>mainMealAuthority.sourceIds.includes(policy.id)).flatMap(policy=>coreMeals.slice(0,1).map(meal=>({
        id:policy.id,resourceIds:[...policy.resourceIds],spaceIds:[...policy.spaceIds],duration:policy.duration,
        start:meal.start,end:meal.end,
      }))) : [];
    const operationalMealWitness=exactSubstantive?assessOperationalMealFutureFeasibility(problem,substantive,
      operationalMealBudget,"MATERIALIZE",fixedMainOperationalMeals):null;
    if(operationalMealWitness?.reasonCodes.includes("OPERATIONAL_MEAL_BRANCH_BUDGET_EXHAUSTED"))return "BUDGET_EXHAUSTED";
    const fixedResourceMeals=(problem.resourceMeals??[]).map(meal=>({id:meal.id,sourceTaskId:meal.sourceTaskId,resourceIds:[...meal.resourceIds],start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));
    const fixedItinerantMeals=materializeScheduledItinerantUnitMeals(problem);
    if (mealWitness?.complete&&!transportAlreadyMaterialized) evidence.terminalTransportMaterializationAttempts += 1;
    let terminalTransportWitness: TransportMaterializationEvidence | null = null;
    const transport = transportAlreadyMaterialized ? [] : mealWitness?.complete ? materializeTerminalTransport(problem, substantive, mealWitness.scheduled, {
      consumeFallbackBranch: () => ledger.consume("STANDALONE"),
      onEvidence: (witness) => { terminalTransportWitness = witness; },
    }) : null;
    const observedTerminalTransportWitness = terminalTransportWitness as TransportMaterializationEvidence | null;
    if (observedTerminalTransportWitness) {
      evidence.transportContiguousStates += observedTerminalTransportWitness.directions
        .reduce((sum, item) => sum + item.contiguousStatesExplored, 0);
      evidence.membershipFallbackEntered += observedTerminalTransportWitness.directions
        .filter((item) => item.membershipFallbackEntered).length;
    }
    if (mealWitness?.complete && !transportAlreadyMaterialized && transport === null) evidence.terminalTransportMaterializationFailures += 1;
    const candidate = transport === null ? substantive : orderScheduled([...substantive, ...transport]);
    const actual = [...candidate].sort(byId).map(({ id }) => id);
    const exact = actual.length === expected.length && actual.every((id, index) => id === expected[index]);
    const validationCoreMeals=mainMealAuthority?.source==="OPERATIONAL_MEAL_POLICY"?[]:coreMeals;
    const validation = validatePlan(problem, candidate, preparations, validationCoreMeals,[...mealWitness?.scheduled ?? []],fixedResourceMeals,fixedItinerantMeals,roundPreparations,[...operationalMealWitness?.scheduled ?? []]);
    const validationAccepted=validation.hardValid||Boolean(transport!==null&&exact&&mealWitness?.complete
      &&operationalMealWitness?.complete&&acceptsValidation?.(validation));
    const rejectionCause:TerminalCompletionRejectionCause|null=!exactSubstantive?"SUBSTANTIVE_IDENTITY_INCOMPLETE"
      :!mealWitness?.complete?"PARTICIPANT_MEAL_WITNESS_INCOMPLETE"
      :!operationalMealWitness?.complete?"OPERATIONAL_MEAL_WITNESS_INCOMPLETE"
      :transport===null?"TRANSPORT_MATERIALIZATION_FAILED"
      :!exact?"CANDIDATE_IDENTITY_MISMATCH"
      :!validationAccepted?"VALIDATION_REJECTED":null;
    if(rejectionCause){
      evidence.terminalCompletionRejectionsByCause[rejectionCause]+=1;
      evidence.firstTerminalCompletionRejection??={cause:rejectionCause,phase:({
        SUBSTANTIVE_IDENTITY_INCOMPLETE:"SUBSTANTIVE_IDENTITY",PARTICIPANT_MEAL_WITNESS_INCOMPLETE:"PARTICIPANT_MEALS",
        OPERATIONAL_MEAL_WITNESS_INCOMPLETE:"OPERATIONAL_MEALS",TRANSPORT_MATERIALIZATION_FAILED:"TRANSPORT_MATERIALIZATION",
        CANDIDATE_IDENTITY_MISMATCH:"CANDIDATE_IDENTITY",VALIDATION_REJECTED:"VALIDATION",
      } as const)[rejectionCause],expectedTaskCount:expected.length,actualTaskCount:actual.length,
      participantMealWitness:mealWitness,operationalMealWitness,transportWitness:observedTerminalTransportWitness,
      validation:{hardValid:validation.hardValid,reasonCodes:[...validation.reasonCodes],violations:[...(validation.violations??[])]}};
    }
    if (transport !== null && exact && mealWitness?.complete && operationalMealWitness?.complete && validationAccepted) {
      evidence.terminalTransportWitness = terminalTransportWitness;
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
    const allPlaced = [...coreTasks, ...placed];
    for (const task of [...remaining].sort(byId)) {
      evidence.ordinaryDomainQueries += 1;
      const staticDomain = ordinaryStaticDomain(task);
      const signature = standaloneForwardAuthoritySignature(problem, task, allPlaced, coreMeals, staticDomain, "STATIC_DOMAIN");
      let domain = ordinaryDomainCache.get(signature);
      if (domain) evidence.ordinaryDomainCacheHits += 1;
      else {
        evidence.ordinaryDomainCacheMisses += 1;
        evidence.ordinaryAnalyticDomainBuilds += 1;
        evidence.ordinaryDomainRecomputations += 1;
        domain = standaloneForwardDynamicDomain(problem, task, allPlaced, staticDomain);
        if (ordinaryDomainCache.size >= 2048) ordinaryDomainCache.delete(ordinaryDomainCache.keys().next().value!);
        ordinaryDomainCache.set(signature, domain);
      }
      evidence.ordinaryAnalyticEligibleStarts += domain.eligibleStartCount;
      if (domain.eligibleStartCount === 0) {
        recordDeadEnd({kind:"ORDINARY_ZERO_DYNAMIC_DOMAIN",phase:"ORDINARY",depth,
          workItemId:task.id,workItemKind:task.kind,taskIds:[task.id],domainBefore:staticDomain.eligibleStartCount,
          domainAfter:0,candidatesEvaluated:0,blockingTaskId:null,blockingAuthority:"exactTaskDynamicStartDomain",
          firstPlacementRejection:null,ancestralDecisions:ancestors(selectionOrder,placed)});
        evidence.standaloneZeroAlternativePrunes += 1;
        recordBlockingTask(task);
        return "DEAD_END";
      }
      alternatives.push({ task, starts: [...domain.starts()], effectiveDeadline: effectiveDeadline(problem, task) });
    }
    alternatives.sort((a, b) => a.starts.length - b.starts.length || a.effectiveDeadline - b.effectiveDeadline
      || b.task.duration - a.task.duration
      || (b.task.requiredResourceIds?.length ?? 0) - (a.task.requiredResourceIds?.length ?? 0)
      || a.task.id.localeCompare(b.task.id));
    const choice = alternatives[0]!;
    // Prepare the lightweight set of still-pending hard predecessors once for
    // this ordinary node, not once per candidate start.
    evidence.standaloneTaskSelections += 1;
    evidence.standaloneFirstSelectedTaskId ??= choice.task.id;
    evidence.standaloneSelectionsByTaskId[choice.task.id] = (evidence.standaloneSelectionsByTaskId[choice.task.id] ?? 0) + 1;
    evidence.ordinaryMRVSelections += 1;
    evidence.ordinaryExactStartEnumerations += 1;
    const feasibleStarts = choice.starts.filter((start) => {
      evidence.ordinaryExactStartChecks += 1;
      evidence.standaloneStartChecks += 1;
      return canPlaceTask(problem, choice.task, start, allPlaced, coreMeals);
    });
    evidence.standaloneCandidateStartsByTaskId[choice.task.id]
      = (evidence.standaloneCandidateStartsByTaskId[choice.task.id] ?? 0) + feasibleStarts.length;
    if (feasibleStarts.length === 0) {
      const firstStart=choice.starts[0]!;
      const rejection=diagnoseTaskPlacement(problem,choice.task,firstStart,allPlaced,coreMeals);
      recordDeadEnd({kind:"ORDINARY_STARTS_REJECTED",phase:"ORDINARY",depth,workItemId:choice.task.id,
        workItemKind:choice.task.kind,taskIds:[choice.task.id],domainBefore:ordinaryStaticDomain(choice.task).eligibleStartCount,
        domainAfter:choice.starts.length,candidatesEvaluated:choice.starts.length,
        blockingTaskId:rejection.blockingPlacedTaskId,blockingAuthority:rejection.firstRejectionReason,
        firstPlacementRejection:{start:firstStart,reason:rejection.firstRejectionReason??"UNKNOWN",
          blockingPlacedTaskId:rejection.blockingPlacedTaskId},ancestralDecisions:ancestors(selectionOrder,placed)});
      evidence.standaloneZeroAlternativePrunes += 1;
      recordBlockingTask(choice.task);
      return "DEAD_END";
    }
    const orderedStarts = feasibleStarts.map((start) => scoreAuxiliaryTask(problem, choice.task, start,
      allPlaced)).sort((a, b) => a.cost - b.cost || a.scheduled.start - b.scheduled.start
        || a.scheduled.id.localeCompare(b.scheduled.id));
    const ordinaryForwardObligations = remaining
      .filter((task) => task.id !== choice.task.id)
      .sort(byId);
    const pendingReservationPrerequisites=[...ordinaryForwardObligations,
      ...pending.filter(task=>transportTaskIds(problem).has(task.id)&&!allPlaced.some(placedTask=>placedTask.id===task.id))]
      .filter((task,index,tasks)=>tasks.findIndex(other=>other.id===task.id)===index).sort(byId);
    for (const { scheduled } of orderedStarts) {
      if (!consumeLeafBranch(depth)) return "BUDGET_EXHAUSTED";
      if (depth + 1 > evidence.standaloneDominantPathFirst20.length && depth < 20) {
        evidence.standaloneDominantPathFirst20 = [...selectionOrder.map((taskId) => ({ taskId, start: placed.find(task=>task.id===taskId)!.start })),
          { taskId: choice.task.id, start: scheduled.start }].slice(0, 20);
      }
      evidence.ordinaryBranchesExplored += 1;
      evidence.ordinaryPrerequisiteReservationChecks += 1;
      const reservation=checkIndividualPendingPrerequisiteReservations(problem,pendingReservationPrerequisites,allPlaced,[scheduled],coreMeals);
      if(!reservation.feasible){
        recordDeadEnd({kind:"PREREQUISITE_RESERVATION_PRUNE",phase:"ORDINARY",depth,
          workItemId:choice.task.id,workItemKind:choice.task.kind,taskIds:[choice.task.id],
          domainBefore:choice.starts.length,domainAfter:feasibleStarts.length,candidatesEvaluated:1,
          blockingTaskId:reservation.blockingTaskId??null,blockingAuthority:"pending-prerequisite-reservation",
          firstPlacementRejection:null,ancestralDecisions:ancestors(selectionOrder,placed)});
        evidence.ordinaryPrerequisiteReservationPrunes += 1;
        evidence.ordinaryIndividualForwardChecks += 1;
        evidence.ordinaryIndividualForwardChecksByDepth[String(depth)]
          = (evidence.ordinaryIndividualForwardChecksByDepth[String(depth)] ?? 0) + 1;
        evidence.ordinaryIndividualForwardTasksChecked += reservation.tasksChecked;
        evidence.ordinaryIndividualForwardExactDomainChecks += reservation.tasksChecked;
        evidence.ordinaryIndividualForwardZeroDomainPrunes += 1;
        evidence.ordinaryIndividualForwardCausingTaskCounts[choice.task.id]
          = (evidence.ordinaryIndividualForwardCausingTaskCounts[choice.task.id] ?? 0) + 1;
        evidence.ordinaryIndividualForwardBlockingTaskCounts[reservation.blockingTaskId!]
          = (evidence.ordinaryIndividualForwardBlockingTaskCounts[reservation.blockingTaskId!] ?? 0) + 1;
        evidence.ordinaryIndividualForwardFirstPrune ??= {causingTaskId:choice.task.id,blockingTaskId:reservation.blockingTaskId!,depth};
        evidence.firstPrerequisiteReservationPrune??={phase:"ORDINARY",causingTaskId:choice.task.id,blockingPrerequisiteId:reservation.blockingTaskId!,depth,
          deadline:reservation.deadline!,duration:reservation.duration!,earliestFeasibleStart:reservation.earliestFeasibleStart,
          latestFeasibleStart:reservation.latestFeasibleStart,failure:"INDIVIDUAL_ZERO_DOMAIN"};
        evidence.standaloneBacktracks += 1;
        continue;
      }
      evidence.ordinaryIndividualForwardChecks += 1;
      evidence.ordinaryIndividualForwardChecksByDepth[String(depth)]
        = (evidence.ordinaryIndividualForwardChecksByDepth[String(depth)] ?? 0) + 1;
      const affectedObligations = ordinaryForwardObligations.filter((task) =>
        tasksCanAffectEachOther(task, choice.task));
      evidence.ordinaryIndividualForwardUnrelatedSkips += ordinaryForwardObligations.length - affectedObligations.length;
      let zeroDomainObligation: Task | null = null;
      const provisionalPlaced = [...allPlaced, scheduled];
      for (const obligation of affectedObligations) {
        evidence.ordinaryIndividualForwardTasksChecked += 1;
        evidence.ordinaryIndividualForwardExactDomainChecks += 1;
        const domain = standaloneForwardDynamicDomain(problem, obligation, provisionalPlaced,
          ordinaryStaticDomain(obligation));
        if (domain.eligibleStartCount > 0) evidence.ordinaryIndividualForwardWitnesses += 1;
        else { zeroDomainObligation = obligation; break; }
      }
      if (zeroDomainObligation) {
        evidence.ordinaryIndividualForwardZeroDomainPrunes += 1;
        evidence.ordinaryIndividualForwardCausingTaskCounts[choice.task.id]
          = (evidence.ordinaryIndividualForwardCausingTaskCounts[choice.task.id] ?? 0) + 1;
        evidence.ordinaryIndividualForwardBlockingTaskCounts[zeroDomainObligation.id]
          = (evidence.ordinaryIndividualForwardBlockingTaskCounts[zeroDomainObligation.id] ?? 0) + 1;
        evidence.ordinaryIndividualForwardFirstPrune ??= {
          causingTaskId: choice.task.id, blockingTaskId: zeroDomainObligation.id, depth,
        };
        evidence.standaloneBacktracks += 1;
        continue;
      }
      if((problem.analyticalFutureTechnicalChains?.length??0)>0){const reservation=probeTechnicalChainFutureReservations(problem,[...coreTasks,...placed,scheduled],[scheduled],Math.max(0,ledger.limit-ledger.branchesExplored));if(reservation.branchesConsumed>0&&!ledger.consume("STANDALONE",reservation.branchesConsumed))return "BUDGET_EXHAUSTED";recordTechnicalChainFutureReservation(evidence,reservation);if(reservation.status==="PRUNE"){evidence.firstTechnicalChainFutureReservationPrune??={phase:"STANDALONE",causingTaskId:scheduled.id,causingCandidateStart:scheduled.start,depth,...reservation};evidence.standaloneBacktracks+=1;continue;}}
      if((problem.analyticalFutureParticipantTasks?.length??0)>0){const reservation=probeParticipantFutureReservations(problem,[...coreTasks,...placed,scheduled],[scheduled]);recordParticipantFutureReservation(evidence,reservation);if(reservation.status==="PRUNE"){evidence.firstParticipantFutureReservationPrune??={phase:"STANDALONE",causingTaskId:scheduled.id,causingCandidateStart:scheduled.start,depth,...reservation};evidence.standaloneBacktracks+=1;continue;}}
      if((problem.participantMeals?.length??0)>0){const mealProbe=probeParticipantMealFutureFeasibility(problem,[...coreTasks,...placed,scheduled],[scheduled]);evidence.participantMealFutureFeasibilityChecks+=1;evidence.participantMealCheapProbes+=1;evidence.participantMealAffectedObligationsChecked+=mealProbe.affectedObligationsChecked;evidence.participantMealAnalyticDomainBuilds+=mealProbe.analyticDomainBuilds;evidence.participantMealLogicalGridStarts+=mealProbe.logicalGridStarts;evidence.participantMealAnalyticallyEliminatedStarts+=mealProbe.analyticallyEliminatedStarts;evidence.participantMealActuallyEvaluatedStarts+=mealProbe.actuallyEvaluatedStarts;evidence.participantMealZeroDomainPrunes+=mealProbe.zeroDomainPrunes;evidence.participantMealAnalyticCollectivePrunes+=mealProbe.analyticCollectivePrunes;evidence.participantMealExactSearchesAvoided+=1;if(!mealProbe.feasible){evidence.participantMealFutureInfeasibleBranches+=1;for(const id of mealProbe.blockingMealTaskIds)if(!evidence.participantMealBlockingTaskIds.includes(id))evidence.participantMealBlockingTaskIds.push(id);const blockingId=mealProbe.blockingMealTaskIds[0];const obligation=problem.participantMeals?.find(meal=>meal.sourceTaskId===blockingId);if(blockingId&&obligation)evidence.firstParticipantMealFuturePrune??={phase:"STANDALONE",causingTaskId:scheduled.id,scheduledCandidateStart:scheduled.start,blockingMealTaskId:blockingId,participantId:obligation.participantId,candidateCount:mealProbe.candidateCountByTaskId[blockingId]??0,domainResult:mealProbe.zeroDomainPrunes>0?"ZERO_DOMAIN":"ANALYTIC_COLLECTIVE_INFEASIBLE",reasonCodes:[...mealProbe.reasonCodes]};evidence.standaloneBacktracks+=1;continue;}}
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
const mergeSetupOrderCounts = (spaceId: string, counts: Record<string, number>): void => {
  const merged = { ...(evidence.setupFamilyOrderCandidateCountsBySpaceId[spaceId] ?? {}) };
  for (const [key, count] of Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
    merged[key] = (merged[key] ?? 0) + count;
  evidence.setupFamilyOrderCandidateCountsBySpaceId[spaceId] = merged;
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
  evidence.totalesMacroCandidates += delta.startCandidates;
  evidence.totalesMatchingAttempts += delta.matchingAttempts;
  evidence.totalesMatchingSuccesses += delta.matchingSuccesses;
  evidence.totalesAssignmentBranchesAvoided += delta.assignmentBranchesAvoided;
};
const dynamicTransportIds = transportTaskIds(problem);
const technicalItems = getTechnicalChains(pending,problem.technicalChains).map((tasks) => ({ id: technicalChainWorkItemKey(tasks[0]!.id), kind: "TECHNICAL_CHAIN" as const, tasks }));
const technicalRepresentativeIds=new Set(technicalItems.flatMap(({tasks})=>tasks.map(({id})=>id)));
const jointItems = jointGroupIds(pending).filter((id)=>!jointGroupMembers(pending,id).some(({id:taskId})=>technicalRepresentativeIds.has(taskId))).map((id) => ({ id: jointWorkItemKey(id), kind: "JOINT" as const, tasks: jointGroupMembers(pending, id) }));
const coupledTaskIds = new Set([...jointItems, ...technicalItems].flatMap(({ tasks }) => tasks.flatMap((task) => task.jointGroupId ? jointGroupMembers(pending,task.jointGroupId).map(({id})=>id) : [task.id])));
const resourceItems = pending.filter((task) => (task.requiredResourceIds?.length ?? 0) > 0
  && !coupledTaskIds.has(task.id) && !roundTaskIds.has(task.id) && task.setupFamilyId === undefined
  && !dynamicTransportIds.has(task.id)).map((task) => ({ id: `resource:${task.id}`, kind: "RESOURCE_TASK" as const, tasks: [task] }));
const roundItems = roundPolicies.map((policy) => ({ id: `round:${policy.id}`, kind: "ROUND_SYNCHRONIZATION" as const, policy,
  tasks: policy.lanes.flatMap((lane) => lane.taskIds.map((id) => problem.tasks.find((task) => task.id === id)!)).filter(Boolean).sort(byId) }));
const setupItems = setupGroups.map((group) => ({ id: `setup:${group.spaceId}`, kind: "SETUP_GROUP" as const, ...group }));
type MacroUnit = typeof jointItems[number] | typeof technicalItems[number] | typeof resourceItems[number]
  | typeof roundItems[number] | typeof setupItems[number];
const macroUnits: MacroUnit[] = [...jointItems, ...technicalItems, ...resourceItems, ...roundItems, ...setupItems]
  .sort((left, right) => left.id.localeCompare(right.id));
const macroTaskIds = new Set(macroUnits.flatMap(({ tasks }) => tasks.flatMap((task) => task.jointGroupId ? jointGroupMembers(pending,task.jointGroupId).map(({id})=>id) : [task.id])));
const ordinaryPending = pending.filter(({ id }) => !macroTaskIds.has(id) && !dynamicTransportIds.has(id)).sort(byId);
const resourceAvailabilityMinutes = (tasks: readonly Task[]): number => {
  const ids = [...new Set(tasks.flatMap((task) => task.requiredResourceIds ?? []))].sort();
  if (ids.length === 0) return problem.day.end - problem.day.start;
  return ids.flatMap((id) => problem.resources.find((resource) => resource.id === id)?.availability ?? [])
    .reduce((sum, interval) => sum + interval.end - interval.start, 0);
};
const macroConstrainedness = (unit: MacroUnit, placed: ScheduledTask[], preparations: ScheduledSetupPreparation[] = [], roundPreparations: ScheduledRoundPreparation[] = []) => {
  const allPlaced = [...coreTasks, ...placed];
  const taskDomain = (task:Task) => {
    let staticDomain=staticMacroDomains.get(task.id);
    if(!staticDomain){staticDomain=standaloneForwardStaticDomain(problem,task,coreMeals);staticMacroDomains.set(task.id,staticDomain);}
    const signature=standaloneForwardAuthoritySignature(problem,task,allPlaced,coreMeals,staticDomain,"STATIC_DOMAIN");
    const cached=macroDomainCache.get(`task:${signature}`);if(cached!==undefined)return cached.domainSize;
    const count=standaloneForwardDynamicDomain(problem,task,allPlaced,staticDomain).eligibleStartCount;
    if(macroDomainCache.size>=4096)macroDomainCache.delete(macroDomainCache.keys().next().value!);
    macroDomainCache.set(`task:${signature}`,{domainSize:count});return count;
  };
  const authoritySignatures=unit.tasks.map((task)=>{let staticDomain=staticMacroDomains.get(task.id);if(!staticDomain){staticDomain=standaloneForwardStaticDomain(problem,task,coreMeals);staticMacroDomains.set(task.id,staticDomain);}return standaloneForwardAuthoritySignature(problem,task,allPlaced,coreMeals,staticDomain,"STATIC_DOMAIN");}).sort();
  const macroSignature=causalHash({id:unit.id,authoritySignatures,preparations:[...preparations].sort(byId),roundPreparations:[...roundPreparations].sort(byId)});
  let measure=macroDomainCache.get(macroSignature);
  if(unit.kind==="TECHNICAL_CHAIN"){evidence.technicalChainMacroDomainQueries+=1;if(measure)evidence.technicalChainMacroDomainCacheHits+=1;else evidence.technicalChainMacroDomainCacheMisses+=1;}
  if(!measure){
    if(unit.kind==="RESOURCE_TASK")measure={domainSize:taskDomain(unit.tasks[0]!)};
    else if(unit.kind==="JOINT")measure={domainSize:standaloneJointGroupStartDomain(problem,unit.tasks,allPlaced,coreMeals).eligibleStartCount};
    else if(unit.kind==="ROUND_SYNCHRONIZATION")measure=probeExactRoundSynchronizationMacroDomain(problem,unit.policy,allPlaced,preparations,roundPreparations,coreMeals);
    else if(unit.kind==="SETUP_GROUP")measure=probeExactSetupMacroDomain(problem,unit.tasks,allPlaced,preparations,coreMeals);
    else measure={domainSize:probeExactTechnicalChainMacroDomain(problem,unit.tasks,allPlaced,technicalChainStartDomainMode,coreMeals)};
    if(macroDomainCache.size>=4096)macroDomainCache.delete(macroDomainCache.keys().next().value!);macroDomainCache.set(macroSignature,measure);
  }
  if(unit.kind==="TECHNICAL_CHAIN")evidence.technicalChainMacroDomainCandidates+=measure.domainSize;
  const resourceIds = [...new Set(unit.tasks.flatMap((task) => task.requiredResourceIds ?? []))];
  const synchronizedSlotCount = unit.kind === "ROUND_SYNCHRONIZATION"
    ? Math.min(...unit.policy.lanes.map((lane) => lane.taskIds.length))
    : unit.kind === "JOINT" ? unit.tasks.length : 0;
  return { unit, id: unit.id, domainSize:measure.domainSize, domainMeasure:"hard-valid-top-level-macro-placements", domainExact:true,
    structuralCandidateCount:measure.structuralCandidateCount,matchingFeasibleCandidateCount:measure.matchingFeasibleCandidateCount,
    hardResourceAvailabilityMinutes: resourceAvailabilityMinutes(unit.tasks),
    exclusiveResourceCount: resourceIds.length, synchronizedSlotCount,
    totalDuration: unit.tasks.reduce((sum, task) => sum + task.duration, 0), affectedTaskCount: unit.tasks.length };
};
const selectionReason = (selected: ReturnType<typeof macroConstrainedness>, candidates: ReturnType<typeof macroConstrainedness>[]): string => {
  const peers = candidates.filter(({ id }) => id !== selected.id);
  if (peers.some((item) => item.domainSize !== selected.domainSize)) return "minimum-macro-domain";
  if (peers.some((item) => item.hardResourceAvailabilityMinutes !== selected.hardResourceAvailabilityMinutes)) return "resource-availability-tiebreak";
  if (peers.some((item) => item.exclusiveResourceCount !== selected.exclusiveResourceCount)) return "exclusive-resource-tiebreak";
  if (peers.some((item) => item.synchronizedSlotCount !== selected.synchronizedSlotCount)) return "synchronization-tiebreak";
  if (peers.some((item) => item.totalDuration !== selected.totalDuration)) return "duration-tiebreak";
  if (peers.some((item) => item.affectedTaskCount !== selected.affectedTaskCount)) return "affected-task-count-tiebreak";
  return "canonical-id-tiebreak";
};
const recordMacroDecision = (depth: number, selected: ReturnType<typeof macroConstrainedness>, candidates: ReturnType<typeof macroConstrainedness>[]): void => {
  evidence.macroDomainSizes[selected.id] = selected.domainSize;
  if (evidence.macroSelectionSteps.length > depth) return;
  const reason = selectionReason(selected, candidates);
  evidence.macroUnitsSelected += 1;
  evidence.macroSelectionOrder.push(`${selected.unit.kind}:${selected.id}`);
  evidence.macroSelectionReason.push(reason);
  evidence.macroSelectionSteps.push({ selected: selected.id, reason, candidates: candidates.map((candidate) => ({
    id: candidate.id, kind: candidate.unit.kind, domainSize: candidate.domainSize,
    domainMeasure:candidate.domainMeasure,domainExact:candidate.domainExact,
    hardResourceAvailabilityMinutes: candidate.hardResourceAvailabilityMinutes,totalDuration:candidate.totalDuration,
    affectedTaskCount:candidate.affectedTaskCount,structuralCandidateCount:candidate.structuralCandidateCount,
    matchingFeasibleCandidateCount:candidate.matchingFeasibleCandidateCount,
  })).sort((left, right) => left.id.localeCompare(right.id)) });
};
const mergeTechnicalDiagnostics = (explorer: ReturnType<typeof createTechnicalChainExplorer>, accounted: {
  consumed:number;full:number;eligible:number;eliminated:number;complete:number;deferred:number;revisited:number;pushes:number;pops:number;builds:number;hits:number;scans:number;domainMs:number;checkMs:number;rootStarts:number;
}): boolean => {
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
  evidence.technicalChainRootStartsConsidered+=diagnostics.startsExplored-accounted.rootStarts;
  evidence.technicalChainRootStartsFeasible+=diagnostics.completeCandidatesYielded-accounted.complete;
  evidence.technicalChainBranchesExplored+=consumedDelta;
  Object.assign(accounted,{consumed:explorer.consumed,full:diagnostics.fullGridStarts,eligible:diagnostics.analyticEligibleStarts,
    eliminated:diagnostics.analyticallyEliminatedStarts,complete:diagnostics.completeCandidatesYielded,
    deferred:diagnostics.alternativesDeferred,revisited:diagnostics.alternativesRevisited,pushes:diagnostics.deferredPushes,
    pops:diagnostics.deferredPops,builds:diagnostics.preparedAuthorityBuilds,hits:diagnostics.preparedAuthorityHits,
    scans:diagnostics.fixedPlacedScansAvoided,domainMs:diagnostics.domainBuildMs,checkMs:diagnostics.finalPlacementCheckMs,rootStarts:diagnostics.startsExplored});
  return true;
};
const searchMacroUnits = (remainingUnits: MacroUnit[], placed: ScheduledTask[], preparations: ScheduledSetupPreparation[],
  roundPreparations: ScheduledRoundPreparation[], depth: number, selectionOrder: string[]): StandaloneOutcome => {
  if (remainingUnits.length === 0) return search(ordinaryPending, placed, preparations, roundPreparations, placed.length, selectionOrder);
  const constrained = remainingUnits.map((unit) => macroConstrainedness(unit, placed, preparations, roundPreparations));
  const selected = selectMostConstrainedUnit(constrained)!;
  recordMacroDecision(depth, selected, constrained);
  const unit = selected.unit;
  const rest = remainingUnits.filter(({ id }) => id !== unit.id);
  let candidatesEvaluated=0;
  const macroDomainAuthority=({JOINT:"standaloneJointGroupStartDomain",RESOURCE_TASK:"standaloneForwardDynamicDomain",
    ROUND_SYNCHRONIZATION:"probeExactRoundSynchronizationMacroDomain",SETUP_GROUP:"probeExactSetupMacroDomain",
    TECHNICAL_CHAIN:"probeExactTechnicalChainMacroDomain"} as const)[unit.kind];
  if(selected.domainSize===0)recordDeadEnd({kind:"MACRO_ZERO_DOMAIN",phase:"MACRO",depth,
    workItemId:unit.id,workItemKind:unit.kind,taskIds:unit.tasks.map(({id})=>id).sort(),
    domainBefore:selected.structuralCandidateCount??selected.domainSize,
    domainAfter:0,candidatesEvaluated:0,blockingTaskId:null,blockingAuthority:macroDomainAuthority,
    firstPlacementRejection:null,ancestralDecisions:ancestors(selectionOrder,placed)});
  const recurse = (tasks: ScheduledTask[], nextPreparations = preparations, nextRoundPreparations = roundPreparations): StandaloneOutcome => {
    const pendingForCheck=[...ordinaryPending,...rest.flatMap(item=>item.tasks)].filter((task,index,array)=>array.findIndex(item=>item.id===task.id)===index);
    const checked=checkMacroPendingPrerequisites(problem,pendingForCheck,[...coreTasks,...placed],tasks,coreMeals,macroPendingPrerequisiteCache);
    evidence.macroPendingPrerequisiteForwardChecks+=1;evidence.macroPendingPrerequisiteTasksChecked+=checked.tasksChecked;
    evidence.macroPendingPrerequisiteIndividualDomainChecks+=checked.individualDomainChecks;evidence.macroPendingPrerequisiteJointChecks+=checked.jointChecks;
    evidence.macroPendingPrerequisiteCollectiveCapacityChecks+=checked.collectiveCapacityChecks;evidence.macroPendingPrerequisiteObligationsChecked+=checked.obligationsChecked;evidence.macroPendingPrerequisiteCollectiveCapacityPrunes+=checked.collectiveCapacityPrunes;
    evidence.macroPendingPrerequisiteWitnesses+=checked.witnesses;evidence.macroPendingPrerequisiteChecksByDepth[String(depth)]=(evidence.macroPendingPrerequisiteChecksByDepth[String(depth)]??0)+1;
    if(checked.cacheHit)evidence.macroPendingPrerequisiteCacheHits+=1;else evidence.macroPendingPrerequisiteCacheMisses+=1;
    if(!checked.feasible){evidence.macroPendingPrerequisitePrunes+=1;if(checked.failure==="INDIVIDUAL_ZERO_DOMAIN")evidence.macroPendingPrerequisiteIndividualZeroDomainPrunes+=1;else if(checked.failure==="JOINT_INFEASIBLE")evidence.macroPendingPrerequisiteJointInfeasiblePrunes+=1;
      recordDeadEnd({kind:"PREREQUISITE_RESERVATION_PRUNE",phase:"MACRO",depth,workItemId:unit.id,
        workItemKind:unit.kind,taskIds:unit.tasks.map(({id})=>id).sort(),domainBefore:selected.domainSize,
        domainAfter:selected.domainSize,candidatesEvaluated,blockingTaskId:checked.blockingTaskId??null,
        blockingAuthority:checked.authorityId??checked.failure??"pending-prerequisite-reservation",
        firstPlacementRejection:null,ancestralDecisions:ancestors(selectionOrder,placed)});
      if(checked.blockingTaskId)evidence.macroPendingPrerequisiteBlockingTaskCounts[checked.blockingTaskId]=(evidence.macroPendingPrerequisiteBlockingTaskCounts[checked.blockingTaskId]??0)+1;
      evidence.macroPendingPrerequisiteCausingMacroUnitCounts[unit.id]=(evidence.macroPendingPrerequisiteCausingMacroUnitCounts[unit.id]??0)+1;
      evidence.macroPendingPrerequisiteFirstPrune??={causingMacroUnitId:unit.id,blockingTaskId:checked.blockingTaskId??"unknown",macroDepth:depth,deadline:checked.deadline,failure:checked.failure??"unknown",authorityId:checked.authorityId,demandMinutes:checked.demandMinutes,freeCapacityMinutes:checked.freeCapacityMinutes};return "DEAD_END";}
    return searchMacroUnits(rest, [...placed, ...tasks], nextPreparations, nextRoundPreparations, depth + 1,[...selectionOrder, ...tasks.map(({ id }) => id)]);
  };
  if (unit.kind === "JOINT" || unit.kind === "RESOURCE_TASK") {
    const duration = unit.tasks[0]!.duration;
    const fullGridCount = Math.max(0, Math.floor((problem.day.end - duration - problem.day.start) / 5) + 1);
    const domain = unit.kind === "JOINT" ? standaloneJointGroupStartDomain(problem, unit.tasks, [...coreTasks, ...placed], coreMeals)
      : standaloneForwardDynamicDomain(problem, unit.tasks[0]!, [...coreTasks, ...placed], standaloneForwardStaticDomain(problem, unit.tasks[0]!, coreMeals));
    evidence.jointGroupFullGridStarts += fullGridCount;
    evidence.jointGroupAnalyticEligibleStarts += domain.eligibleStartCount;
    evidence.jointGroupAnalyticallyEliminatedStarts += fullGridCount-domain.eligibleStartCount;
    const starts = unit.kind === "JOINT" && jointGroupStartDomainMode === "FULL_GRID"
      ? (function* () { for (let start=problem.day.start;start+duration<=problem.day.end;start+=5) yield start; })()
      : domain.starts();
    for (const start of starts) {
      if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
      evidence.jointGroupStartsEvaluated += 1; evidence.criticalResourceBranches += 1;
      candidatesEvaluated += 1;
      if (unit.kind === "JOINT" && !canPlaceJointGroup(problem, unit.tasks, start, [...coreTasks, ...placed])) continue;
      if (unit.kind === "RESOURCE_TASK" && !canPlaceTask(problem, unit.tasks[0]!, start, [...coreTasks, ...placed], coreMeals)) continue;
      const scheduled = unit.kind === "JOINT" ? scheduleJointGroup(unit.tasks, start)
        : [scoreAuxiliaryTask(problem, unit.tasks[0]!, start, [...coreTasks, ...placed]).scheduled];
      evidence.criticalResourceMacroCandidates += 1; evidence.criticalResourceAssignments += scheduled.length;
      const child = recurse(scheduled); if (child !== "DEAD_END") return child; evidence.standaloneBacktracks += 1;
    }
  } else if (unit.kind === "SETUP_GROUP") {
    evidence.setupBlockSearchInvocations += 1;
    const generated = generateExactSetupBlockCandidates(problem, unit.tasks, [...coreTasks, ...placed], preparations, coreMeals, ledger);
    evidence.setupBlockBranchesExplored += generated.evidence.branchesExplored;
    evidence.setupBlockStartsExplored += generated.evidence.startsExplored;
    evidence.setupBlockCompleteCandidateCount += generated.evidence.completeCandidateCount;
    evidence.setupBlockMatchingAttempts += generated.evidence.matchingAttempts;
    evidence.setupBlockMatchingSuccesses += generated.evidence.matchingSuccesses;
    evidence.setupBlockPermutationBranchesAvoided += generated.evidence.permutationBranchesAvoided;
    mergeSetupOrderCounts(unit.spaceId, generated.evidence.familyOrderCandidateCounts);
    if (generated.outcome === "BUDGET_EXHAUSTED") { evidence.setupBlockBudgetExhaustions += 1; return "BUDGET_EXHAUSTED"; }
    for (const candidate of generated.candidates) {
      candidatesEvaluated += 1;
      const child = recurse(candidate.tasks, [...preparations, ...candidate.preparations]);
      if (child !== "DEAD_END") return child; evidence.standaloneBacktracks += 1;
    }
  } else if (unit.kind === "ROUND_SYNCHRONIZATION") {
    evidence.roundSynchronizationSearchInvocations += 1;
    const explored = exploreExactRoundSynchronizationPolicy(problem, unit.policy, [...coreTasks, ...placed], preparations,
      roundPreparations, coreMeals, ledger, (candidate) => recurse(candidate.tasks, preparations,
        [...roundPreparations, ...candidate.preparations]));
    candidatesEvaluated=explored.evidence.completeAssignments;
    mergeRoundEvidence(explored.evidence);
    if(explored.outcome!=="DEAD_END")return explored.outcome;
  } else {
    const explorer=createTechnicalChainExplorer(problem,unit.tasks,[...coreTasks,...placed],Math.max(0,ledger.limit-ledger.branchesExplored),
      technicalChainStartDomainMode,coreMeals,"INCREMENTAL_HEAP",false);
    const accounted={consumed:0,full:0,eligible:0,eliminated:0,complete:0,deferred:0,revisited:0,pushes:0,pops:0,builds:0,hits:0,scans:0,domainMs:0,checkMs:0,rootStarts:0};
    while(true){const candidate=explorer.nextCandidate();if(!mergeTechnicalDiagnostics(explorer,accounted))return "BUDGET_EXHAUSTED";
      if(explorer.exhausted){ledger.consume("STANDALONE");return "BUDGET_EXHAUSTED";}
      if(!candidate)break;candidatesEvaluated+=1;const child=recurse(candidate.tasks);if(child!=="DEAD_END")return child;evidence.standaloneBacktracks+=1;}
  }
  recordDeadEnd({kind:selected.domainSize===0?"MACRO_ZERO_DOMAIN":"MACRO_CANDIDATES_EXHAUSTED",phase:"MACRO",depth,
    workItemId:unit.id,workItemKind:unit.kind,taskIds:unit.tasks.map(({id})=>id).sort(),domainBefore:selected.domainSize,
    domainAfter:selected.domainSize,candidatesEvaluated,blockingTaskId:null,blockingAuthority:macroDomainAuthority,
    firstPlacementRejection:null,ancestralDecisions:ancestors(selectionOrder,placed)});
  for (const task of unit.tasks) recordBlockingTask(task);
  return "DEAD_END";
};
const searchOutcome = searchMacroUnits(macroUnits, [], [], [], 0, []);
const outcome = searchOutcome === "DEAD_END" && found !== null ? "FOUND" : searchOutcome;
evidence.standaloneBranchesAfterFirstOrdinaryCompleteLeaf = evidence.standaloneBranchesBeforeFirstOrdinaryCompleteLeaf === null
  ? 0 : ledger.standaloneBranches - invocationStartBranches - evidence.standaloneBranchesBeforeFirstOrdinaryCompleteLeaf;
const dominantBlocker = Object.entries(evidence.standaloneBlockingTaskCounts)
  .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0];
evidence.standaloneFirstDominantBlocker = dominantBlocker ? { taskId: dominantBlocker[0], count: dominantBlocker[1] } : null;
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
  /** Assisted-only exact violation baseline; never relaxes placement feasibility. */
  acceptsValidation?: (validation: import("./contracts").ValidationSummary) => boolean;
  /** Immutable Assisted placements, materialized before residual search. */
  fixedPlacements?: readonly ScheduledTask[];
  fixedPlacementsAsContext?: boolean;
}

export function runExactItinerantPlanSearch(problem: PlannerNextProblem,
  options: ExactItinerantPlanSearchOptions = {}): ExactItinerantPlanResult {
  const completeSelectionMode = options.standaloneCompletionSelection ?? "FIRST_HARD_VALID";
  // A single nominal witness is safe only when no future hard structure needs
  // alternative local geometry. Otherwise retain the ordinary exact core DFS.
  const assistedPipeline=options.fixedPlacementsAsContext&&(problem.analyticalFutureTechnicalChains?.length??0)===0
    ?materializeFirstNominalPipelineWitness(problem):null;
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
    technicalChainMacroDomainQueries:0,technicalChainMacroDomainCandidates:0,technicalChainMacroDomainCacheHits:0,technicalChainMacroDomainCacheMisses:0,
    technicalChainRootStartsConsidered:0,technicalChainRootStartsFeasible:0,technicalChainBranchesExplored:0,
    standaloneTaskSelections: 0, standaloneZeroAlternativePrunes: 0, standaloneBacktracks: 0,
    standaloneMaximumDepth: 0, standaloneCompleteLeafCount: 0, coreCompleteLeavesEvaluated: 0,
    standaloneBranchesByDepth:{},standaloneSelectionsByTaskId:{},standaloneCandidateStartsByTaskId:{},
    standaloneFirstSelectedTaskId:null,standaloneDominantPathFirst20:[],standaloneFirstDominantBlocker:null,
    standaloneBranchesBeforeFirstOrdinaryCompleteLeaf:null,standaloneBranchesAfterFirstOrdinaryCompleteLeaf:0,
    terminalTransportMaterializationAttempts:0,terminalTransportMaterializationFailures:0,terminalTransportWitness:null,
    terminalCompletionRejectionsByCause:{SUBSTANTIVE_IDENTITY_INCOMPLETE:0,PARTICIPANT_MEAL_WITNESS_INCOMPLETE:0,
      OPERATIONAL_MEAL_WITNESS_INCOMPLETE:0,TRANSPORT_MATERIALIZATION_FAILED:0,CANDIDATE_IDENTITY_MISMATCH:0,VALIDATION_REJECTED:0},
    firstTerminalCompletionRejection:null,
    coreLeafTransportPrunes:0,transportContiguousStates:0,membershipFallbackEntered:0,coreLeafArrivalEvidence:null,firstHardValidCoreLeaf:null,
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
    coreMaximumDepth: 0, coreCompleteLeafCount: 0,patternCandidatesExplored:0,timelineCandidatesExplored:0,
    mainCandidatesEvaluated:0,feederCandidatesEvaluated:0,deepestCoreDepthReached:0,
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
    setupBlockMatchingAttempts: 0, setupBlockMatchingSuccesses: 0, setupBlockPermutationBranchesAvoided: 0,
    setupFamilyOrderCandidateCountsBySpaceId: {}, selectedSetupFamilySequenceBySpaceId: {},
    selectedSetupPreparationIds: [],
    roundSynchronizationSearchInvocations: 0, roundSynchronizationStartCandidates: 0,
    roundSynchronizationAssignmentBranches: 0, roundSynchronizationAssignmentChecks: 0,
    roundSynchronizationCompleteAssignments: 0, roundSynchronizationBacktracks: 0,
    roundSynchronizationZeroAlternativePrunes: 0, selectedRoundPreparationIds: [],
    totalesMacroCandidates:0,totalesMatchingAttempts:0,totalesMatchingSuccesses:0,totalesAssignmentBranchesAvoided:0,
    criticalResourceBranches:0,criticalResourceMacroCandidates:0,criticalResourceAssignments:0,
    macroUnitsSelected:0,macroSelectionOrder:[],macroSelectionReason:[],macroDomainSizes:{},macroSelectionSteps:[],
    macroPendingPrerequisiteForwardChecks:0,macroPendingPrerequisiteTasksChecked:0,macroPendingPrerequisiteIndividualDomainChecks:0,
    macroPendingPrerequisiteCollectiveCapacityChecks:0,macroPendingPrerequisiteObligationsChecked:0,macroPendingPrerequisiteCollectiveCapacityPrunes:0,
    macroPendingPrerequisiteJointChecks:0,macroPendingPrerequisiteCacheHits:0,macroPendingPrerequisiteCacheMisses:0,
    macroPendingPrerequisitePrunes:0,macroPendingPrerequisiteIndividualZeroDomainPrunes:0,macroPendingPrerequisiteJointInfeasiblePrunes:0,
    macroPendingPrerequisiteWitnesses:0,macroPendingPrerequisiteChecksByDepth:{},macroPendingPrerequisiteBlockingTaskCounts:{},macroPendingPrerequisiteCausingMacroUnitCounts:{},macroPendingPrerequisiteFirstPrune:null,
    ordinaryDomainQueries:0,ordinaryAnalyticDomainBuilds:0,ordinaryAnalyticEligibleStarts:0,
    ordinaryExactStartEnumerations:0,ordinaryExactStartChecks:0,ordinaryDomainCacheHits:0,
    ordinaryDomainCacheMisses:0,ordinaryDomainRecomputations:0,ordinaryMRVSelections:0,ordinaryBranchesExplored:0,
    ordinaryIndividualForwardChecks:0,ordinaryIndividualForwardTasksChecked:0,
    ordinaryIndividualForwardExactDomainChecks:0,ordinaryIndividualForwardStartsChecked:0,
    ordinaryIndividualForwardZeroDomainPrunes:0,ordinaryIndividualForwardUnrelatedSkips:0,
    ordinaryIndividualForwardWitnesses:0,ordinaryIndividualForwardCausingTaskCounts:{},
    ordinaryIndividualForwardBlockingTaskCounts:{},ordinaryIndividualForwardChecksByDepth:{},
    ordinaryIndividualForwardFirstPrune:null,
    corePrerequisiteReservationChecks:0,corePrerequisiteReservationPrunes:0,
    ordinaryPrerequisiteReservationChecks:0,ordinaryPrerequisiteReservationPrunes:0,firstPrerequisiteReservationPrune:null,
    firstStandaloneDeadEndCause:null,
    standaloneBlockingTaskDetails:{},
    participantMealBranchesExplored:0,participantMealFutureFeasibilityChecks:0,participantMealFutureInfeasibleBranches:0,participantMealCheapProbes:0,participantMealAffectedObligationsChecked:0,participantMealAnalyticDomainBuilds:0,participantMealLogicalGridStarts:0,participantMealAnalyticallyEliminatedStarts:0,participantMealActuallyEvaluatedStarts:0,participantMealZeroDomainPrunes:0,participantMealAnalyticCollectivePrunes:0,participantMealExactSearchesAvoided:0,participantMealExactMaterializations:0,participantMealBlockingTaskIds:[],participantMealAcceptedWitnessFingerprint:null,participantMealFinalSelectionOrder:[],participantMealAttemptedSelectionTrace:[],firstParticipantMealFuturePrune:null,participantFutureReservationChecks:0,participantFutureReservationPasses:0,participantFutureReservationPrunes:0,participantFutureReservationAbstentions:0,participantFutureAffectedParticipants:0,participantFutureTasksChecked:0,participantFutureMealsChecked:0,participantFutureIndividualDomainChecks:0,participantFutureIndividualZeroDomainPrunes:0,participantFutureJointTaskMealChecks:0,participantFutureJointTaskMealPrunes:0,participantFutureCollectiveChecks:0,participantFutureCollectivePrunes:0,participantFutureCompatiblePairChecks:0,participantFutureAnalyticChecks:0,participantFutureBranchesConsumed:0,firstParticipantFutureReservationPrune:null,technicalChainFutureReservationChecks:0,technicalChainFutureReservationPasses:0,technicalChainFutureReservationPrunes:0,technicalChainFutureReservationAbstentions:0,technicalChainFutureBranchesConsumed:0,firstTechnicalChainFutureReservationPrune:null,causalDiagnostic:null,
  };
  let selectedTasks: ScheduledTask[] | null = null, selectedPreparations: ScheduledSetupPreparation[] = [], selectedRoundPreparations: ScheduledRoundPreparation[] = [], selectedMeals: ScheduledSpaceMeal[] = [], selectedParticipantMeals: ParticipantMealWitness | null = null, selectedOperationalMeals: OperationalMealWitness | null = null, selectedCoreIds = new Set<string>();
  const staticCoreIds = new Set(problem.tasks.filter(({ kind }) => kind === "main" || kind === "vocal").map(({ id }) => id));
  const fixedIds=new Set((options.fixedPlacements??[]).map(item=>item.id));
  for (const id of anchoredTaskIds(problem)) staticCoreIds.add(id);
  const standaloneTasks = problem.tasks.filter(({ id }) => !staticCoreIds.has(id)&&!fixedIds.has(id)).sort(byId);
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
  const coreDecisionDepthForTask=(candidate:Pick<Parameters<NonNullable<ExactMainAndFeederSearchOptions["onPartialCoreCandidate"]>>[0],"tasks">,taskId:string):number|null=>{
    const task=candidate.tasks.find(item=>item.id===taskId);if(!task)return null;
    const mains=candidate.tasks.filter(item=>item.kind==="main").sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
    const contracts=problem.anchoredAccompaniments??[];
    const mainId=task.kind==="main"?task.id:mains.find(main=>main.dependencies.includes(task.id))?.id
      ??contracts.find(contract=>[contract.anchorTaskId,...contract.beforeTaskIds,...contract.afterTaskIds].includes(task.id))?.anchorTaskId;
    const index=mains.findIndex(main=>main.id===mainId);return index<0?null:index+1;
  };
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
  const core = runExactMainAndFeederSearch(problem, { ledger, ...options.coreOrderer, acceptsValidation:options.acceptsValidation,
    fixedPlacements:options.fixedPlacements, fixedPlacementsAsContext:options.fixedPlacementsAsContext,
    causalDiagnostic:options.causalDiagnostic, onPartialCoreCandidate(candidate) {
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
    if((problem.analyticalFutureTechnicalChains?.length??0)>0){const reservation=probeTechnicalChainFutureReservations(problem,candidate.tasks,candidate.addedTasks,Math.max(0,ledger.limit-ledger.branchesExplored));if(reservation.branchesConsumed>0&&!ledger.consume("CORE",reservation.branchesConsumed))return "BUDGET_EXHAUSTED";recordTechnicalChainFutureReservation(evidence,reservation);if(reservation.status==="PRUNE"){
      const causing=candidate.addedTasks.find(task=>task.id===reservation.certifiedCausingTaskId);
      if(causing)evidence.firstTechnicalChainFutureReservationPrune??={phase:"CORE",causingTaskId:causing.id,causingCandidateStart:causing.start,depth:candidate.depth,...reservation};
      const target=reservation.certifiedCausingTaskId===null?null:coreDecisionDepthForTask(candidate,reservation.certifiedCausingTaskId);
      return target!==null&&target<=candidate.depth?{outcome:"CERTIFIED_BACKJUMP",targetDepth:target}:"REJECT";
    }}
    if((problem.analyticalFutureParticipantTasks?.length??0)>0){const reservation=probeParticipantFutureReservations(problem,candidate.tasks,candidate.addedTasks);recordParticipantFutureReservation(evidence,reservation);if(reservation.status==="PRUNE"){const causing=[...candidate.addedTasks].sort(byId)[0];if(causing)evidence.firstParticipantFutureReservationPrune??={phase:"CORE",causingTaskId:causing.id,causingCandidateStart:causing.start,depth:candidate.depth,...reservation};return "REJECT";}}
    if((problem.participantMeals?.length??0)>0){const mealProbe=probeParticipantMealFutureFeasibility(problem,candidate.tasks,candidate.addedTasks);evidence.participantMealFutureFeasibilityChecks+=1;evidence.participantMealCheapProbes+=1;evidence.participantMealAffectedObligationsChecked+=mealProbe.affectedObligationsChecked;evidence.participantMealAnalyticDomainBuilds+=mealProbe.analyticDomainBuilds;evidence.participantMealLogicalGridStarts+=mealProbe.logicalGridStarts;evidence.participantMealAnalyticallyEliminatedStarts+=mealProbe.analyticallyEliminatedStarts;evidence.participantMealActuallyEvaluatedStarts+=mealProbe.actuallyEvaluatedStarts;evidence.participantMealZeroDomainPrunes+=mealProbe.zeroDomainPrunes;evidence.participantMealAnalyticCollectivePrunes+=mealProbe.analyticCollectivePrunes;evidence.participantMealExactSearchesAvoided+=1;if(!mealProbe.feasible){evidence.participantMealFutureInfeasibleBranches+=1;for(const id of mealProbe.blockingMealTaskIds)if(!evidence.participantMealBlockingTaskIds.includes(id))evidence.participantMealBlockingTaskIds.push(id);const blockingId=mealProbe.blockingMealTaskIds[0];const obligation=problem.participantMeals?.find(meal=>meal.sourceTaskId===blockingId);const causing=(obligation&&candidate.addedTasks.find(task=>task.participantId===obligation.participantId||task.id===obligation.sourceTaskId||task.dependencies.includes(obligation.sourceTaskId)||(obligation.dependencies??[]).includes(task.id)))??candidate.addedTasks[0];if(blockingId&&obligation&&causing)evidence.firstParticipantMealFuturePrune??={phase:"CORE",causingTaskId:causing.id,scheduledCandidateStart:causing.start,blockingMealTaskId:blockingId,participantId:obligation.participantId,candidateCount:mealProbe.candidateCountByTaskId[blockingId]??0,domainResult:mealProbe.zeroDomainPrunes>0?"ZERO_DOMAIN":"ANALYTIC_COLLECTIVE_INFEASIBLE",reasonCodes:[...mealProbe.reasonCodes]};return "REJECT";}}
    evidence.corePrerequisiteReservationChecks+=1;
    const reservation=checkIndividualPendingPrerequisiteReservations(problem,standaloneTasks,candidate.tasks.filter(task=>!candidate.addedTasks.some(added=>added.id===task.id)),candidate.addedTasks,candidate.meals);
    if(!reservation.feasible){
      evidence.corePrerequisiteReservationPrunes+=1;
      evidence.firstPrerequisiteReservationPrune??={phase:"CORE",causingTaskId:[...candidate.addedTasks].sort(byId)[0]?.id??candidate.mainTaskId,
        blockingPrerequisiteId:reservation.blockingTaskId!,depth:candidate.depth,deadline:reservation.deadline!,duration:reservation.duration!,
        earliestFeasibleStart:reservation.earliestFeasibleStart,latestFeasibleStart:reservation.latestFeasibleStart,failure:"INDIVIDUAL_ZERO_DOMAIN"};
      return "REJECT";
    }
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
      // Transport is terminally materialized. Its exact non-empty dynamic interval is the cheap,
      // sound room certificate during core construction; do not spend the constructive frontier
      // enumerating starts that cannot yet determine its final contiguous group.
      if (transportTaskIds(problem).has(task.id) && !fullGridMode && dynamicDomain.eligibleStartCount > 0) {
        evidence.standaloneForwardWitnessesFound += 1;
        continue;
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
    if (evidence.firstHardValidCoreLeaf === null) {
      const counts=(tasks:readonly {kind:string}[])=>tasks.reduce<Record<string,number>>((result,task)=>{
        result[task.kind]=(result[task.kind]??0)+1;return result;},{});
      const dynamicTransport=transportTaskIds(problem);
      evidence.firstHardValidCoreLeaf={coreTaskCount:candidate.tasks.length,coreTasksByKind:counts(candidate.tasks),
        pendingSupportingTotal:standaloneTasks.length,pendingOrdinaryNoTransport:standaloneTasks.filter(task=>!dynamicTransport.has(task.id)).length,
        pendingDynamicTransport:standaloneTasks.filter(task=>dynamicTransport.has(task.id)).length,pendingTasksByKind:counts(standaloneTasks)};
    }
    const fixedById=new Map((options.fixedPlacements??[]).map(task=>[task.id,task]));
    const orderedMains=candidate.tasks.filter(task=>task.kind==="main").sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
    const pipeline=(problem.analyticalFutureTechnicalChains?.length??0)>0?null:assistedPipeline??(orderedMains.length===problem.tasks.filter(task=>task.kind==="main").length
      ?materializeNominalPipelineWitness(problem,{pattern:orderedMains.map(task=>task.blockKey??""),slots:orderedMains.map(task=>task.start)})
      :null);
    const pipelinePreservesFixed=pipeline?.witness.status==="FEASIBLE"&&[...fixedById].every(([id,fixed])=>{
      const placed=pipeline.scheduledTasks.find(task=>task.id===id);
      return !placed||(placed.start===fixed.start&&placed.end===fixed.end);
    });
    const structuralTasks=pipelinePreservesFixed ? [...pipeline!.scheduledTasks] : candidate.tasks;
    const coreIds = new Set(structuralTasks.map(({ id }) => id));
    const immutableCoreTasks=[...structuralTasks.filter(task=>!fixedById.has(task.id)),...fixedById.values()];
    const arrival = assessCoreArrivalTransportFeasibility(problem, immutableCoreTasks, {
      consumeFallbackBranch: () => ledger.consume("STANDALONE"),
    });
    evidence.coreLeafArrivalEvidence = arrival.evidence;
    evidence.transportContiguousStates += arrival.evidence.contiguousStatesExplored;
    if (arrival.evidence.membershipFallbackEntered) evidence.membershipFallbackEntered += 1;
    if (arrival.status === "INFEASIBLE") {
      evidence.coreLeafTransportPrunes += 1;
      return "REJECT";
    }
    // The nominal Assisted pipeline can materialize a complete core without
    // visiting partial-core callbacks. Apply the same exact reservation at that
    // boundary so no locally complete proposal can bypass future structures.
    if((problem.analyticalFutureTechnicalChains?.length??0)>0){const reservation=probeTechnicalChainFutureReservations(problem,immutableCoreTasks,immutableCoreTasks,Math.max(0,ledger.limit-ledger.branchesExplored));if(reservation.branchesConsumed>0&&!ledger.consume("CORE",reservation.branchesConsumed))return "BUDGET_EXHAUSTED";recordTechnicalChainFutureReservation(evidence,reservation);if(reservation.status==="PRUNE"){
      const causing=immutableCoreTasks.find(task=>task.id===reservation.certifiedCausingTaskId);
      const target=causing?coreDecisionDepthForTask(candidate,causing.id):null;
      if(causing)evidence.firstTechnicalChainFutureReservationPrune??={phase:"CORE",causingTaskId:causing.id,
        causingCandidateStart:causing.start,depth:candidate.tasks.filter(task=>task.kind==="main").length,...reservation};
      return target===null?"REJECT":{outcome:"CERTIFIED_BACKJUMP",targetDepth:target};
    }}
    const remainingStandalone=standaloneTasks.filter(task=>!coreIds.has(task.id));
    const standalone = searchStandaloneForCoreCandidate(problem, immutableCoreTasks, candidate.meals, remainingStandalone, ledger, evidence,
      completeSelectionMode, options.jointGroupStartDomainMode ?? "ANALYTIC_DOMAIN",
      options.technicalChainStartDomainMode??"ANALYTIC_DOMAIN", options.acceptsValidation);
    if (standalone.tasks) {
      selectedTasks = standalone.tasks; selectedPreparations = [...standalone.preparations]; selectedRoundPreparations = [...standalone.roundPreparations]; selectedMeals = mainFlowMealPolicy(problem)?.source==="OPERATIONAL_MEAL_POLICY"?[]:candidate.meals; selectedParticipantMeals=standalone.participantMeals; selectedOperationalMeals=standalone.operationalMeals; selectedCoreIds = coreIds;
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
  evidence.standaloneBranches = ledger.standaloneBranches;
  evidence.lastExhaustionPhase = ledger.lastExhaustionPhase
    ?? (ledger.branchesExplored >= ledger.limit ? "STANDALONE" : null);
  if (evidence.causalDiagnostic) {
    const accounted = Object.values(evidence.causalDiagnostic.waterfallByDepth).reduce((sum, row) => sum + row.total, 0);
    const unclassifiedStandalone = Math.max(0, ledger.branchesExplored - accounted);
    if (unclassifiedStandalone > 0) {
      const row = evidence.causalDiagnostic.waterfallByDepth["0"]
        ?? { mainCandidate:0,feederStart:0,residualMatching:0,continuation:0,participantMeal:0,standaloneForward:0,other:0,total:0 };
      row.other += unclassifiedStandalone;
      row.total += unclassifiedStandalone;
      evidence.causalDiagnostic.waterfallByDepth["0"] = row;
    }
  }
  evidence.coreStatus = core.status; evidence.coreReasonCodes = [...core.evidence.reasonCodes];
  evidence.coreBacktracks = core.evidence.backtracks; evidence.coreMaximumDepth = core.evidence.maximumDepth;
  evidence.coreCompleteLeafCount = core.evidence.completeLeafCount;
  evidence.patternCandidatesExplored=core.evidence.patternCandidatesExplored;
  evidence.timelineCandidatesExplored=core.evidence.timelineCandidatesExplored;
  evidence.mainCandidatesEvaluated=core.evidence.mainCandidatesEvaluated;
  evidence.feederCandidatesEvaluated=core.evidence.feederCandidatesEvaluated;
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
  const completedOperationalMeals = selectedOperationalMeals as OperationalMealWitness | null;
  const completedParticipantMeals = selectedParticipantMeals as ParticipantMealWitness | null;
  const scheduledItinerantUnitMeals=materializeScheduledItinerantUnitMeals(problem);const scheduledOperationalMeals=[...(completedOperationalMeals?.scheduled??[])];evidence.fullFingerprint=fingerprint(scheduledTasks,scheduledSetupPreparations,selectedMeals,scheduledItinerantUnitMeals,scheduledRoundPreparations,scheduledOperationalMeals); evidence.remainingTaskIds = []; evidence.reasonCodes = [];
  const scheduledResourceMeals=(problem.resourceMeals??[]).map(meal=>({id:meal.id,sourceTaskId:meal.sourceTaskId,resourceIds:[...meal.resourceIds],start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));
  return { status: "COMPLETE", complete: true, scheduledTasks, scheduledSetupPreparations, scheduledRoundPreparations, scheduledSpaceMeals: [...selectedMeals], scheduledParticipantMeals:[...(completedParticipantMeals?.scheduled??[])],scheduledResourceMeals,scheduledOperationalMeals,scheduledItinerantUnitMeals,remainingTaskIds: [], evidence };
}

/** Frozen historical control and explicit rollback path. */
export function constructFirstHardValidExactItinerantPlan(problem: PlannerNextProblem): ExactItinerantPlanResult {
  return runExactItinerantPlanSearch(problem, {});
}

/** Accepted exact path: selects the best dominating complete incumbent observed within the shared budget. */
export function constructExactItinerantPlan(problem: PlannerNextProblem, causalDiagnostic=false, acceptsValidation?:ExactItinerantPlanSearchOptions["acceptsValidation"],fixedPlacements?:readonly ScheduledTask[],fixedPlacementsAsContext=false): ExactItinerantPlanResult {
  let effectiveFixedPlacements=fixedPlacements;
  if(fixedPlacementsAsContext){
    const pipeline=materializeFirstNominalPipelineWitness(problem);
    const protectedById=new Map((fixedPlacements??[]).map(task=>[task.id,task]));
    const preservesProtected=pipeline?.scheduledTasks.every(task=>{const fixed=protectedById.get(task.id);
      return !fixed||(fixed.start===task.start&&fixed.end===task.end);});
    if(pipeline&&preservesProtected){
      const structuralIds=new Set(problem.tasks.filter(task=>task.kind==="main"||task.kind==="vocal").map(task=>task.id));
      for(const id of anchoredTaskIds(problem))structuralIds.add(id);
      effectiveFixedPlacements=[...pipeline.scheduledTasks.filter(task=>structuralIds.has(task.id)&&!protectedById.has(task.id)),...protectedById.values()];
    }
  }
  const coreIds = new Set(problem.tasks.filter(({ kind }) => kind === "main" || kind === "vocal").map(({ id }) => id));
  for (const id of anchoredTaskIds(problem)) coreIds.add(id);
  const standaloneTasks = problem.tasks.filter(({ id }) => !coreIds.has(id));
  if (standaloneTasks.length === 0) return runExactItinerantPlanSearch(problem,{causalDiagnostic,acceptsValidation,fixedPlacements:effectiveFixedPlacements,fixedPlacementsAsContext});
  const orderer = createResidualObligationMainOrderer(problem, standaloneTasks);
  return runExactItinerantPlanSearch(problem, {
    coreOrderer: orderer.options,
    // Assisted search protects an accepted baseline and needs one canonical
    // hard-valid completion around it; spending the full residual budget on
    // incumbent domination cannot improve the human-protected placements.
    standaloneCompletionSelection: fixedPlacementsAsContext ? "FIRST_HARD_VALID" : "BEST_DOMINATING_WITHIN_BUDGET",
    causalDiagnostic, acceptsValidation, fixedPlacements:effectiveFixedPlacements, fixedPlacementsAsContext,
  });
}
