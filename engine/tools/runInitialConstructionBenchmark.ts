import { readFileSync } from "node:fs";
import { parseEngineScenarioSnapshot, cloneEngineScenarioValue } from "../scenarioSnapshot";
import { buildOperationalStateFromEngineInput } from "../orc/adapters/fromEngineInput";
import { runInitialConstructionStage1 } from "../orc/active/runInitialConstructionStage1";
import { runInitialConstructionStage2FirstPartialPlan } from "../orc/active/runInitialConstructionStage2FirstPartialPlan";
import { runInitialConstructionIterativeSession } from "../orc/active/runInitialConstructionIterativeSession";
import { buildInitialConstructionCanonicalContext } from "../orc/understanding/initialConstructionCanonicalContext";
import { resolveInitialConstructionOperationalClassification } from "../orc/understanding/initialConstructionMap";

export interface InitialConstructionBenchmarkResult {
  [key: string]: unknown;
  exclusiveConstructiveRuntimeMs: number;
  assignmentsReached: number;
  cycles: number;
  stopReason: string | null;
  budgetLimitReached: string | null;
  sessionFingerprint: string | null;
  finalCombinedAssignmentsFingerprint: string | null;
  finalValidationResult: string | null;
  exactEligibleAnchorCountAtStop: number | null;
  terminalAnchorsScanned: number | null;
  allEligibleAnchorsExhausted: boolean | null;
  terminalBlockerCodeCounts: Record<string, number>;
  terminalBlockerEvidenceComplete: boolean | null;
  terminalBlockerEvidenceIncompleteAnchorCount: number | null;
  terminalBlockerEvidenceFingerprint: string | null;
  terminalPrimaryBlockerCodeCounts: Record<string, number>;
  terminalDeadEndReasonCounts: Record<string, number>;
  terminalBlockedAnchorSample: unknown[];
  runtimeTelemetry: unknown;
  widenedAnchorAttemptCount: number;
  widenedAnchorAcceptedCount: number;
  maxTemporalCandidatesScannedForAnyAnchor: number;
  temporalCandidateBatchesExecuted: number;
  branchEvaluationsAfterInitialBatch: number;
  firstWidenedAcceptedAnchorTaskId: number | null;
  dependencyBoundedTemporalCandidateCount: number;
  combinedDependencyPrecheckCount: number;
  combinedDependencyPrecheckRejectedCount: number;
  combinedDependencyPrecheckViolationCount: number;
  contradictoryDependencyBoundCount: number;
  firstDependencyBoundAcceptedAnchorTaskId: number | null;

  productiveAssignmentsReached: number;
  productiveTasksRemaining: number;
  causalConflictBuildCount: number;
  structuredCausalConflictBuildCount: number;
  structuredCausalConflictEvidenceCompleteCount: number;
  structuredCausalConflictEvidenceIncompleteCount: number;
  causalConflictAllActiveAssignmentsFallbackCount: number;
  causalBlockerTaskIdUnsupportedByFailureEvidenceCount: number;
  causalConflictTaskIdMissingFromActiveAssignmentsCount: number;
  decisionLineageLookupCount: number;
  decisionLineageLookupMissCount: number;
  decisionPathStringParseCount: number;
  conflictDirectedSelectionChangedLegacyChoiceCount: number;
  conflictDirectedSelectionMatchedLegacyChoiceCount: number;
  incompleteCausalEvidenceLegacyFallbackCount: number;
  changesOnlyNonBlockingDecisionsSkippedCount: number;
  causalBlockerAssignmentChangedCount: number;
  causalBlockerAssignmentRemovedCount: number;
  structuredCausalConflictSamples: unknown[];
  structuredCausalBackjumpSamples: unknown[];
  conflictDirectedBackjumpAcceptedCount: number;
  conflictDirectedBackjumpUnavailableCount: number;
  nogoodRegisteredCount: number;
  nogoodHitCount: number;
  repeatedEquivalentDeadEndAvoidedCount: number;
  causalEvidenceFingerprint: string | null;
  repairExecuted: boolean;
  repairRoundCount: number;
  repairAttemptCount: number;
  repairAcceptedCount: number;
  acceptedPartialPlanBacktrackCount: number;
  candidateEjectionSetCount: number;
  staticHardBlockerProfileCount:number;
  shiftableDependencyBoundProfileCount:number;
  uncoveredHardBlockerProfileCount:number;
  executableCandidateProfileCount:number;
  effectiveRepairRootCount:number;
  equivalentRepairRootDedupCount:number;
  effectiveRepairRootsByAnchor:Record<string,unknown[]>;
  terminalRankByAnchor:Record<string,number>;
  scheduledEffectiveRootFingerprintsByRound:string[][];
  repairAttemptedEffectiveRootFingerprintsByRound:string[][];
  duplicateEffectiveRootAttemptCount:number;
  effectiveRepairRootPortfolioFingerprint:string|null;
  rootRejectedReasonCounts:Record<string,number>;
  rootStaticWindowConflictCountsByAnchor:Record<string,number>;
  rootShiftableWindowConflictCountsByAnchor:Record<string,number>;
  acceptedBlockedAnchorTaskIds: number[];
  acceptedEjectionTaskIds: number[];
  acceptedRepairDependencyClosureTaskIds: number[];
  productiveAssignmentDelta: number;
  protectedAssignmentsModified: boolean;
  outsideNeighborhoodAssignmentsModified: number;
  repairStopReason: string | null;
  repairFingerprint: string | null;
  repairCandidateProfilesFingerprint: string | null;
  repairCandidateProfileCount: number | null;
  repairableCandidateProfileCount: number | null;
  candidateProfilesWithDependencyBoundBlockers: number | null;
  dependencyBoundSourceTaskIdsByAnchor: unknown;
  candidateProfilesByAnchor: unknown;
  candidateEjectionSetsByAnchor: unknown;
  repairQueueByRound: unknown[] | null;
  repairAttemptedAnchorIdsByRound: unknown[] | null;
  repairAttemptedProfileFingerprintsByRound: unknown[] | null;
  roundRobinFairnessValid: boolean | null;
  repairNeighborhoodSessionCount: number | null;
  repairNeighborhoodAcceptedCycleCount: number | null;
  repairNeighborhoodAnchorAttemptCount: number | null;
  repairNeighborhoodValidationCount: number | null;
  repairNeighborhoodExpansionAttemptCount: number | null;
  repairNeighborhoodExpansionAcceptedCount: number | null;
  repairExpansionChildNodeCount: number | null;
  anchorBranchBacktrackCount: number | null;
  searchNodeSequenceFingerprint: string | null;
  searchNodeTransitionFingerprint: string | null;
  searchNodeTransitionInvalidCount: number | null;
  cumulativeEjectionLimitRejectedCount: number | null;
  cumulativeNeighborhoodLimitRejectedCount: number | null;
  cumulativeClosureRemovalFailureCount: number | null;
  searchNodeSampleFirst: unknown[] | null;
  searchNodeSampleLast: unknown[] | null;
  repairSearchNodeCount: number | null;
  repairSearchNodePrunedCount: number | null;
  maxRepairExpansionDepthObserved: number | null;
  maxCumulativeEjectedAssignmentCount: number | null;
  repairFailurePhaseCounts: Record<string, number> | null;
  repairAttemptStopReasonCounts: Record<string, number> | null;
  failedTaskIds: number[] | null;
  closureContractValid: boolean | null;
  nonPrerequisiteTaskIdsPassedAsClosure: number[] | null;
  protectedAssignmentIdsModified: number[] | null;
  outsideNeighborhoodAssignmentIdsModified: number[] | null;
  duplicateTaskIds: number[] | null;
  removedAssignmentIds: number[] | null;
  reinsertedAssignmentIds: number[] | null;
  modifiedNeighborhoodAssignmentIds: number[] | null;
  lostProductiveTaskIds: number[] | null;
  newlyAssignedProductiveTaskIds: number[] | null;
  finalProductiveAssignedTaskIds: number[] | null;
  commitsExecuted: number;
  v4SeedUsed: boolean;
  canonicalContextSource: string | null;
  canonicalContextFingerprint: string | null;
  canonicalContextBuildCount: number;
  dependencyGraphFallbackResolutionCount: number;
  hotPathDependencyGraphResolutionCount: number;
  preRepairAssignmentsReached: number;
  preRepairAcceptedCycleCount: number;
  preRepairAssignmentsFingerprint: string | null;
  preRepairProductiveTasksRemaining: number;
  preRepairStopReason: string | null;
  /** @deprecated use sessionFingerprint */
  fingerprint: string | null;
}

export function runInitialConstructionBenchmarkFromInput(input: any, reasoningBudget: Record<string, unknown> = {}): InitialConstructionBenchmarkResult {
  const originInput = cloneEngineScenarioValue(input);
  const originOperationalState = buildOperationalStateFromEngineInput(originInput as any);
  const started = performance.now();
  const stage1 = runInitialConstructionStage1({ originInput, originOperationalState, createdAt: "benchmark" });
  const canonical = buildInitialConstructionCanonicalContext({ input: originInput, stage1 });
  const constructionSearchStrategy = reasoningBudget.constructionSearchStrategy === "critical_chain_retained_alternatives" ? "critical_chain_retained_alternatives" : "single_path";
  const stage2 = runInitialConstructionStage2FirstPartialPlan({ originInput, originOperationalState, stage1, createdAt: "benchmark", canonicalContext: canonical.context, constructionSearchStrategy });
  const session = runInitialConstructionIterativeSession({ originInput, originOperationalState, stage1, stage2, reasoningBudget: reasoningBudget as any, createdAt: "benchmark", canonicalContext: canonical.context, constructionSearchStrategy });
  const ended = performance.now();
  const iterativeSessionExecuted = session.executed === true || session.evidence?.executed === true;
  const iterativeSessionReason = session.reason ?? session.evidence?.stopReason ?? null;
  const benchmarkOutcome = iterativeSessionExecuted ? "EXECUTED" : stage2?.executed === true && stage2?.selectedValidationResult !== "VALID" ? "STAGE2_GATE_REJECTED" : "SESSION_NOT_EXECUTED";
  const benchmarkComparisonEligible = iterativeSessionExecuted;
  const repair = session.evidence?.initialConstructionConflictDirectedRepair ?? {};
  const classification = resolveInitialConstructionOperationalClassification({input:originInput,state:originOperationalState,planningMode:"INITIAL_CONSTRUCTION",provisionalAssignments:[]});
  const universe = classification.taskUniverse;
  const canonicalProductiveIds = [...universe.constructiveTargetTaskIds];
  const canonicalProductiveSet = new Set(canonicalProductiveIds);
  const finalAssignments = [...(originOperationalState.planning??[]),...(session.combinedPartialPlan?.assignments??[])];
  const finalProductiveAssignedTaskIds = [...new Set(finalAssignments.map((a:any)=>Number(a.taskId)).filter((id:number)=>canonicalProductiveSet.has(id)))].sort((a,b)=>a-b);
  const residualProductiveTaskIds = canonicalProductiveIds.filter(id=>!finalProductiveAssignedTaskIds.includes(id));
  const nonProductiveAssignedTaskIds = [...new Set(finalAssignments.map((a:any)=>Number(a.taskId)).filter((id:number)=>!canonicalProductiveSet.has(id)))].sort((a,b)=>a-b);
  return {
    ...(session.evidence ?? {}),
    constructionSearchStrategy,
    stage2Executed: stage2?.executed === true,
    stage2Reason: stage2?.reason ?? null,
    stage2SelectedBranchId: stage2?.selectedBranchId ?? null,
    stage2SelectedAssignmentCount: stage2?.selectedAssignmentCount ?? 0,
    stage2SelectedValidationResult: stage2?.selectedValidationResult ?? null,
    stage2SelectedFutureFeasibilityStatus: stage2?.selectedFutureFeasibilityStatus ?? null,
    stage2HardValidBranchCount: stage2?.hardValidBranchCount ?? 0,
    stage2FutureInfeasibleBranchCount: stage2?.futureInfeasibleBranchCount ?? 0,
    iterativeSessionExecuted,
    iterativeSessionReason,
    benchmarkComparisonEligible,
    benchmarkOutcome,
    exclusiveConstructiveRuntimeMs: Math.round(ended - started),
    assignmentsReached: session.evidence?.finalCombinedAssignmentCount ?? stage2.selectedAssignmentCount ?? 0,
    cycles: session.evidence?.acceptedCycleCount ?? 0,
    stopReason: session.evidence?.stopReason ?? null,
    budgetLimitReached: session.evidence?.budgetLimitReached ?? null,
    sessionFingerprint: session.evidence?.sessionFingerprint ?? null,
    finalCombinedAssignmentsFingerprint: session.evidence?.finalCombinedAssignmentsFingerprint ?? null,
    finalValidationResult: session.evidence?.finalCombinedValidationResult ?? null,
    exactEligibleAnchorCountAtStop: session.evidence?.terminalCycle?.eligibleAnchorCount ?? null,
    terminalAnchorsScanned: session.evidence?.terminalCycle?.anchorRanksScanned ?? null,
    allEligibleAnchorsExhausted: session.evidence?.terminalCycle?.allEligibleAnchorsExhausted ?? null,
    terminalBlockerCodeCounts: session.evidence?.terminalCycle?.terminalBlockerCodeCounts ?? {},
    terminalBlockerEvidenceComplete: session.evidence?.terminalBlockerEvidenceComplete ?? null,
    terminalBlockerEvidenceIncompleteAnchorCount: session.evidence?.terminalBlockerEvidenceIncompleteAnchorCount ?? null,
    terminalBlockerEvidenceFingerprint: session.evidence?.terminalBlockerEvidenceFingerprint ?? null,
    terminalPrimaryBlockerCodeCounts: session.evidence?.terminalPrimaryBlockerCodeCounts ?? {},
    terminalDeadEndReasonCounts: session.evidence?.terminalDeadEndReasonCounts ?? {},
    terminalBlockedAnchorSample: session.evidence?.terminalBlockedAnchorSample ?? [],
    runtimeTelemetry: { ...(session.evidence?.runtimeTelemetry ?? {}), exclusiveConstructiveRuntimeMs: Math.round(ended - started) },
    widenedAnchorAttemptCount: session.evidence?.widenedAnchorAttemptCount ?? 0,
    widenedAnchorAcceptedCount: session.evidence?.widenedAnchorAcceptedCount ?? 0,
    maxTemporalCandidatesScannedForAnyAnchor: session.evidence?.maxTemporalCandidatesScannedForAnyAnchor ?? 0,
    temporalCandidateBatchesExecuted: session.evidence?.temporalCandidateBatchesExecuted ?? 0,
    branchEvaluationsAfterInitialBatch: session.evidence?.branchEvaluationsAfterInitialBatch ?? 0,
    firstWidenedAcceptedAnchorTaskId: session.evidence?.firstWidenedAcceptedAnchorTaskId ?? null,
    dependencyBoundedTemporalCandidateCount: session.evidence?.dependencyBoundedTemporalCandidateCount ?? 0,
    combinedDependencyPrecheckCount: session.evidence?.combinedDependencyPrecheckCount ?? 0,
    combinedDependencyPrecheckRejectedCount: session.evidence?.combinedDependencyPrecheckRejectedCount ?? 0,
    combinedDependencyPrecheckViolationCount: session.evidence?.combinedDependencyPrecheckViolationCount ?? 0,
    contradictoryDependencyBoundCount: session.evidence?.contradictoryDependencyBoundCount ?? 0,
    firstDependencyBoundAcceptedAnchorTaskId: session.evidence?.firstDependencyBoundAcceptedAnchorTaskId ?? null,
    strictProductiveWorkTaskCount: universe.strictProductiveWorkTaskIds.length,
    strictProductiveWorkTaskIds: universe.strictProductiveWorkTaskIds,
    transportArrivalTargetTaskCount: universe.transportArrivalTaskIds.length,
    transportArrivalTargetTaskIds: universe.transportArrivalTaskIds,
    totalCanonicalProductiveTaskCount: canonicalProductiveIds.length,
    canonicalConstructiveTargetTaskIds: canonicalProductiveIds,
    canonicalConstructiveTargetFingerprint: universe.constructiveTargetFingerprint,
    finalProductiveAssignedTaskIds,
    productiveAssignmentsReached: finalProductiveAssignedTaskIds.length,
    productiveTasksRemaining: residualProductiveTaskIds.length,
    causalConflictBuildCount: session.evidence?.causalConflictBuildCount ?? 0,
    structuredCausalConflictBuildCount: session.evidence?.structuredCausalConflictBuildCount ?? 0,
    structuredCausalConflictEvidenceCompleteCount: session.evidence?.structuredCausalConflictEvidenceCompleteCount ?? 0,
    structuredCausalConflictEvidenceIncompleteCount: session.evidence?.structuredCausalConflictEvidenceIncompleteCount ?? 0,
    causalConflictAllActiveAssignmentsFallbackCount: session.evidence?.causalConflictAllActiveAssignmentsFallbackCount ?? 0,
    causalBlockerTaskIdUnsupportedByFailureEvidenceCount: session.evidence?.causalBlockerTaskIdUnsupportedByFailureEvidenceCount ?? 0,
    causalConflictTaskIdMissingFromActiveAssignmentsCount: session.evidence?.causalConflictTaskIdMissingFromActiveAssignmentsCount ?? 0,
    decisionLineageLookupCount: session.evidence?.decisionLineageLookupCount ?? 0,
    decisionLineageLookupMissCount: session.evidence?.decisionLineageLookupMissCount ?? 0,
    decisionPathStringParseCount: session.evidence?.decisionPathStringParseCount ?? 0,
    conflictDirectedSelectionChangedLegacyChoiceCount: session.evidence?.conflictDirectedSelectionChangedLegacyChoiceCount ?? 0,
    conflictDirectedSelectionMatchedLegacyChoiceCount: session.evidence?.conflictDirectedSelectionMatchedLegacyChoiceCount ?? 0,
    incompleteCausalEvidenceLegacyFallbackCount: session.evidence?.incompleteCausalEvidenceLegacyFallbackCount ?? 0,
    changesOnlyNonBlockingDecisionsSkippedCount: session.evidence?.changesOnlyNonBlockingDecisionsSkippedCount ?? 0,
    causalBlockerAssignmentChangedCount: session.evidence?.causalBlockerAssignmentChangedCount ?? 0,
    causalBlockerAssignmentRemovedCount: session.evidence?.causalBlockerAssignmentRemovedCount ?? 0,
    structuredCausalConflictSamples: session.evidence?.structuredCausalConflictSamples ?? [],
    structuredCausalBackjumpSamples: session.evidence?.structuredCausalBackjumpSamples ?? [],
    conflictDirectedBackjumpAcceptedCount: session.evidence?.conflictDirectedBackjumpAcceptedCount ?? 0,
    conflictDirectedBackjumpUnavailableCount: session.evidence?.conflictDirectedBackjumpUnavailableCount ?? 0,
    nogoodRegisteredCount: session.evidence?.nogoodRegisteredCount ?? 0,
    nogoodHitCount: session.evidence?.nogoodHitCount ?? 0,
    repeatedEquivalentDeadEndAvoidedCount: session.evidence?.repeatedEquivalentDeadEndAvoidedCount ?? 0,
    equivalentConflictObservedCount: session.evidence?.equivalentConflictObservedCount ?? 0,
    nogoodMatchCount: session.evidence?.nogoodMatchCount ?? 0,
    nogoodTransitionActuallySkippedCount: session.evidence?.nogoodTransitionActuallySkippedCount ?? 0,
    repeatedEquivalentDeadEndActuallyAvoidedCount: session.evidence?.repeatedEquivalentDeadEndActuallyAvoidedCount ?? 0,
    rejectedTemporalCandidateEvidenceCount: session.evidence?.rejectedTemporalCandidateEvidenceCount ?? 0,
    repairableRejectedTemporalCandidateCount: session.evidence?.repairableRejectedTemporalCandidateCount ?? 0,
    staticRejectedTemporalCandidateCount: session.evidence?.staticRejectedTemporalCandidateCount ?? 0,
    immutableRejectedTemporalCandidateCount: session.evidence?.immutableRejectedTemporalCandidateCount ?? 0,
    incompleteRejectedTemporalCandidateCount: session.evidence?.incompleteRejectedTemporalCandidateCount ?? 0,
    shiftableWindowConflictCount: session.evidence?.shiftableWindowConflictCount ?? 0,
    staticWindowConflictCount: session.evidence?.staticWindowConflictCount ?? 0,
    completeTaskWindowConflictWithoutExplanationCount: session.evidence?.completeTaskWindowConflictWithoutExplanationCount ?? 0,
    selectedRepairableFailureCandidateCount: session.evidence?.selectedRepairableFailureCandidateCount ?? 0,
    selectedStaticFailureCandidateCount: session.evidence?.selectedStaticFailureCandidateCount ?? 0,
    selectedImmutableFailureCandidateCount: session.evidence?.selectedImmutableFailureCandidateCount ?? 0,
    selectedIncompleteFailureCandidateCount: session.evidence?.selectedIncompleteFailureCandidateCount ?? 0,
    frontierSourceCausalLinkCount: session.evidence?.frontierSourceCausalLinkCount ?? 0,
    frontierSourceCausalLinkRejectedCount: session.evidence?.frontierSourceCausalLinkRejectedCount ?? 0,
    repairableConflictTaskIdCount: session.evidence?.repairableConflictTaskIdCount ?? 0,
    immutableConflictTaskIdCount: session.evidence?.immutableConflictTaskIdCount ?? 0,
    staticUnrepairableReasonCount: session.evidence?.staticUnrepairableReasonCount ?? 0,
    rejectedTemporalCandidateSamples: session.evidence?.rejectedTemporalCandidateSamples ?? [],
    windowConflictClassificationSamples: session.evidence?.windowConflictClassificationSamples ?? [],
    selectedFrontierFailureCandidateSamples: session.evidence?.selectedFrontierFailureCandidateSamples ?? [],
    causalEvidenceFingerprint: session.evidence?.causalEvidenceFingerprint ?? null,
    residualProductiveTaskIds,
    nonProductiveAssignedTaskIds,
    repairExecuted: repair.repairExecuted ?? repair.executed ?? false,
    repairRoundCount: repair.repairRoundCount ?? 0,
    repairAttemptCount: repair.repairAttemptCount ?? 0,
    repairAcceptedCount: repair.repairAcceptedCount ?? 0,
    acceptedPartialPlanBacktrackCount: repair.acceptedPartialPlanBacktrackCount ?? 0,
    candidateEjectionSetCount: repair.candidateEjectionSetCount ?? 0,
    staticHardBlockerProfileCount:repair.staticHardBlockerProfileCount??0,
    shiftableDependencyBoundProfileCount:repair.shiftableDependencyBoundProfileCount??0,
    uncoveredHardBlockerProfileCount:repair.uncoveredHardBlockerProfileCount??0,
    executableCandidateProfileCount:repair.candidateEjectionSetCount??0,
    effectiveRepairRootCount:repair.effectiveRepairRootCount??0,
    equivalentRepairRootDedupCount:repair.equivalentRepairRootDedupCount??0,
    effectiveRepairRootsByAnchor:repair.effectiveRepairRootsByAnchor??{},
    terminalRankByAnchor:repair.terminalRankByAnchor??{},
    scheduledEffectiveRootFingerprintsByRound:repair.scheduledEffectiveRootFingerprintsByRound??[],
    repairAttemptedEffectiveRootFingerprintsByRound:repair.repairAttemptedEffectiveRootFingerprintsByRound??[],
    duplicateEffectiveRootAttemptCount:repair.duplicateEffectiveRootAttemptCount??0,
    effectiveRepairRootPortfolioFingerprint:repair.effectiveRepairRootPortfolioFingerprint??null,
    rootRejectedReasonCounts:repair.rootRejectedReasonCounts??{},
    rootStaticWindowConflictCountsByAnchor:repair.rootStaticWindowConflictCountsByAnchor??{},
    rootShiftableWindowConflictCountsByAnchor:repair.rootShiftableWindowConflictCountsByAnchor??{},
    acceptedBlockedAnchorTaskIds: repair.acceptedBlockedAnchorTaskIds ?? [],
    acceptedEjectionTaskIds: repair.acceptedEjectionTaskIds ?? [],
    acceptedRepairDependencyClosureTaskIds: repair.acceptedRepairDependencyClosureTaskIds ?? [],
    productiveAssignmentDelta: repair.productiveAssignmentDelta ?? 0,
    protectedAssignmentsModified: repair.protectedAssignmentsModified ?? false,
    outsideNeighborhoodAssignmentsModified: repair.outsideNeighborhoodAssignmentsModified ?? 0,
    repairStopReason: repair.repairLogicalStopReason ?? repair.stopReason ?? null,
    repairFingerprint: repair.repairFingerprint ?? null,
    repairCandidateProfilesFingerprint: repair.repairCandidateProfilesFingerprint ?? null,
    repairCandidateProfileCount: repair.repairCandidateProfileCount ?? null,
    repairableCandidateProfileCount: repair.repairableCandidateProfileCount ?? null,
    candidateProfilesWithDependencyBoundBlockers: repair.candidateProfilesWithDependencyBoundBlockers ?? null,
    dependencyBoundSourceTaskIdsByAnchor: repair.dependencyBoundSourceTaskIdsByAnchor ?? null,
    candidateProfilesByAnchor: repair.candidateProfilesByAnchor ?? null,
    candidateEjectionSetsByAnchor: repair.candidateEjectionSetsByAnchor ?? null,
    repairQueueByRound: repair.repairQueueByRound ?? null,
    repairAttemptedAnchorIdsByRound: repair.repairAttemptedAnchorIdsByRound ?? null,
    repairAttemptedProfileFingerprintsByRound: repair.repairAttemptedProfileFingerprintsByRound ?? null,
    roundRobinFairnessValid: repair.roundRobinFairnessValid ?? null,
    repairNeighborhoodSessionCount: repair.repairNeighborhoodSessionCount ?? null,
    repairNeighborhoodAcceptedCycleCount: repair.repairNeighborhoodAcceptedCycleCount ?? null,
    repairNeighborhoodAnchorAttemptCount: repair.repairNeighborhoodAnchorAttemptCount ?? null,
    repairNeighborhoodValidationCount: repair.repairNeighborhoodValidationCount ?? null,
    repairNeighborhoodExpansionAttemptCount: repair.repairNeighborhoodExpansionAttemptCount ?? null,
    repairNeighborhoodExpansionAcceptedCount: repair.repairNeighborhoodExpansionAcceptedCount ?? null,
    repairExpansionChildNodeCount: repair.repairExpansionChildNodeCount ?? null,
    anchorBranchBacktrackCount: repair.anchorBranchBacktrackCount ?? null,
    searchNodeSequenceFingerprint: repair.searchNodeSequenceFingerprint ?? null,
    searchNodeTransitionFingerprint: repair.searchNodeTransitionFingerprint ?? null,
    searchNodeTransitionInvalidCount: repair.searchNodeTransitionInvalidCount ?? 0,
    cumulativeEjectionLimitRejectedCount: repair.cumulativeEjectionLimitRejectedCount ?? 0,
    cumulativeNeighborhoodLimitRejectedCount: repair.cumulativeNeighborhoodLimitRejectedCount ?? 0,
    cumulativeClosureRemovalFailureCount: repair.cumulativeClosureRemovalFailureCount ?? 0,
    searchNodeSampleFirst: repair.searchNodeSampleFirst ?? [],
    searchNodeSampleLast: repair.searchNodeSampleLast ?? [],
    repairSearchNodeCount: repair.repairSearchNodeCount ?? null,
    repairSearchNodePrunedCount: repair.repairSearchNodePrunedCount ?? null,
    maxRepairExpansionDepthObserved: repair.maxRepairExpansionDepthObserved ?? null,
    maxCumulativeEjectedAssignmentCount: repair.maxCumulativeEjectedAssignmentCount ?? null,
    repairFailurePhaseCounts: repair.repairFailurePhaseCounts ?? null,
    repairAttemptStopReasonCounts: repair.repairAttemptStopReasonCounts ?? null,
    failedTaskIds: repair.failedTaskIds ?? null,
    closureContractValid: repair.closureContractValid ?? null,
    nonPrerequisiteTaskIdsPassedAsClosure: repair.nonPrerequisiteTaskIdsPassedAsClosure ?? null,
    protectedAssignmentIdsModified: repair.protectedAssignmentIdsModified ?? session.evidence?.protectedAssignmentIdsModified ?? [],
    outsideNeighborhoodAssignmentIdsModified: repair.outsideNeighborhoodAssignmentIdsModified ?? null,
    duplicateTaskIds: repair.duplicateTaskIds ?? session.evidence?.duplicateTaskIds ?? [],
    removedAssignmentIds: repair.removedAssignmentIds ?? null,
    reinsertedAssignmentIds: repair.reinsertedAssignmentIds ?? null,
    modifiedNeighborhoodAssignmentIds: repair.modifiedNeighborhoodAssignmentIds ?? null,
    lostProductiveTaskIds: repair.lostProductiveTaskIds ?? [],
    newlyAssignedProductiveTaskIds: repair.newlyAssignedProductiveTaskIds ?? null,
    finalProductiveAssignedTaskIds: repair.finalProductiveAssignedTaskIds ?? finalProductiveAssignedTaskIds,
    commitsExecuted: repair.commitsExecuted ?? session.evidence?.commitsExecuted ?? 0,
    v4SeedUsed: repair.v4SeedUsed ?? session.evidence?.v4SeedUsed ?? false,
    canonicalContextSource: session.evidence?.canonicalContextSource ?? null,
    canonicalContextFingerprint: session.evidence?.canonicalContextFingerprint ?? null,
    canonicalContextBuildCount: session.evidence?.canonicalContextBuildCount ?? 0,
    dependencyGraphFallbackResolutionCount: session.evidence?.dependencyGraphFallbackResolutionCount ?? 0,
    hotPathDependencyGraphResolutionCount: session.evidence?.hotPathDependencyGraphResolutionCount ?? 0,
    preRepairAssignmentsReached: session.evidence?.preRepairAssignmentsReached ?? 0,
    preRepairAcceptedCycleCount: session.evidence?.preRepairAcceptedCycleCount ?? 0,
    preRepairAssignmentsFingerprint: session.evidence?.preRepairAssignmentsFingerprint ?? null,
    preRepairProductiveTasksRemaining: session.evidence?.preRepairProductiveTasksRemaining ?? 0,
    preRepairStopReason: session.evidence?.preRepairStopReason ?? null,
    fingerprint: session.evidence?.sessionFingerprint ?? null,
  };
}

export function runInitialConstructionBenchmarkSnapshot(snapshotPath: string, reasoningBudget: Record<string, unknown> = {}) {
  const snapshot = parseEngineScenarioSnapshot(readFileSync(snapshotPath));
  return runInitialConstructionBenchmarkFromInput(snapshot.engineInput, reasoningBudget);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const snapshotPath = process.argv[2];
  if (!snapshotPath) {
    console.error("Usage: tsx engine/tools/runInitialConstructionBenchmark.ts <snapshot.json> [budgetJson]");
    process.exit(1);
  }
  const budget = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  console.log(JSON.stringify(runInitialConstructionBenchmarkSnapshot(snapshotPath, budget), null, 2));
}
