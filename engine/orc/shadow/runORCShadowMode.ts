import type { EngineInput } from "../../types";
import type { AdvisoryDecision } from "../advisory/advisoryDecision";
import type { OperationalAnalysis } from "../analysis/operationalStateAnalyzer";
import { analyzeOperationalState } from "../analysis/operationalStateAnalyzer";
import { estimateExplorationValue } from "../analysis/explorationValueEstimator";
import { buildBranchOrderingEvidence, orderSearchSpaces } from "../analysis/branchOrderingEngine";
import { executeBacktrackingSearch } from "../search/backtrackingSearchExecutor";
import { executeIterativeSearch } from "../search/iterativeSearchSolver";
import { initializeBacktrackingState } from "../search/searchBacktrackingFramework";
import { propagateFutureConstraints } from "../analysis/futureConstraintPropagationEngine";
import { buildSearchSpaceSelectionEvidence, selectSearchSpaces } from "../analysis/searchSpaceSelectionEngine";
import type { ExecutionEvidenceRecord } from "../evidence/executionEvidenceRecorder";
import type { Candidate, CandidateState, CognitiveState, CommitDecision, Evidence, OperationalState, OperationalValue, Opportunity, SearchSpace, SimulatedState, ValidationResult } from "../contracts";
import type { OperationalMap } from "../see/operationalMap";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { buildOperationalMap } from "../see/operationalMap";
import { buildOpportunityDetectionEvidence, detectOpportunitiesWithPruningFromOperationalAnalysis } from "../see/opportunityDetection";
import { buildAdaptiveSearchSpaces } from "../see/adaptiveSearchSpaceBuilder";
import { classifyOpportunities } from "../analysis/opportunityClassificationEngine";
import { prioritizeOpportunities } from "../analysis/opportunityPrioritizationEngine";
import { analyzeDynamicBottlenecks } from "../analysis/dynamicBottleneckAnalyzer";
import { diagnoseOpportunities, type OpportunityDiagnosis } from "../see/opportunityDiagnosis";
import { buildCandidatesFromSearchSpaces } from "../see/candidateBuilder";
import { buildBaselineOverlapRepairCandidates } from "../see/baselineOverlapRepairCandidateBuilder";
import { prefilterCandidatesByHardConstraints } from "../see/candidateHardPrefilter";
import { assertBaselineRepairRuntimeInvariant } from "../see/baselineRepairRuntimeInvariant";
import { composePartialPlans } from "../see/partialPlanComposer";
import { reprioritizeOpportunities } from "../see/adaptivePriority";
import { buildDecisionInput } from "../decision/decisionInput";
import { executeDecisionPipeline } from "../decision/decisionPipelineOrchestrator";
import { createInitialCognitiveState, recordExploredOpportunity, recordExhaustedSearchSpace, recordSimulatedCandidate, updateDecisionFeedbackLoop, updateReasoningBudget } from "../cognitive/cognitiveState";
import { createCognitiveFeedbackStats } from "../cognitive/cognitiveFeedback";
import { getSessionKnowledge, learnFromCommit, learnFromEvaluation, learnFromRanking } from "../cognitive/sessionLearning";
import { consumeCandidate, consumeOpportunity, consumeSearchSpace, consumeSimulation, remainingBudget } from "../cognitive/reasoningBudget";
import { buildAdvisoryDecision } from "../advisory/advisoryDecision";
import { DEFAULT_ORC_CONFIGURATION, ORCIntegrationMode, type ORCConfiguration, normalizeORCConfiguration } from "../config/orcIntegrationMode";
import { consultORCAdvisory } from "../integration/advisoryIntegration";
import { buildExecutionEvidenceRecord } from "../evidence/executionEvidenceRecorder";
import { understandOperationalCriticality, type OperationalCriticality } from "../understanding/operationalCriticality";
import { buildSearchAndExplorationUnderstanding } from "../search/searchAndExplorationEngine";
import { buildDecisionFeedbackEvidence, buildDecisionFeedbackFromDecisions, reuseDecisionFeedback } from "../analysis/decisionFeedbackLoop";
import { resolveCandidateLineage } from "../decision/candidateLineage";
import { auditORCBaselineSeedHardFeasibility, type ORCBaselineSeedHardFeasibilityAudit } from "../active/orcBaselineSeedFeasibilityAudit";
import { buildORCRuntimeContractID224 } from "../active/runActiveBaselineRepairPreflight";
import { runPostRepairMainZoneContinuityPass } from "../active/runPostRepairMainZoneContinuityPass";
import { runCriticalResourceIdleCompressionPass } from "../active/runCriticalResourceIdleCompressionPass";
import { buildFinalORCCompositeSummary } from "../active/buildFinalORCCompositeSummary";

export interface ORCShadowModeResult {
  operationalState: OperationalState;
  operationalMap: OperationalMap;
  operationalAnalysis: OperationalAnalysis;
  operationalCriticality: OperationalCriticality;
  opportunities: Opportunity[];
  diagnoses: OpportunityDiagnosis[];
  searchSpaces: SearchSpace[];
  candidates: Candidate[];
  candidateStates: CandidateState[];
  simulatedStates: SimulatedState[];
  validationResults: ValidationResult[];
  operationalValues: OperationalValue[];
  commitDecisions: CommitDecision[];
  evidence: Evidence[];
  advisoryDecision: AdvisoryDecision | null;
  executionEvidence: ExecutionEvidenceRecord;
  cognitiveState: CognitiveState;
  cognitiveStateInitial: CognitiveState;
  cognitiveStateDiff: Record<string, unknown>;
  candidateSummary: {
    searchSpaceCount: number;
    candidateCount: number;
    duplicateCandidatesDiscarded: number;
    truncatedByBudget: boolean;
  };
  summary: {
    enabled: boolean;
    integrationMode: ORCIntegrationMode;
    configuration: Readonly<ORCConfiguration>;
    opportunityCount: number;
    searchSpaceCount: number;
    candidateCount: number;
    candidateStateCount: number;
    simulatedStateCount: number;
    validCount: number;
    invalidCount: number;
    evaluatedCount: number;
    ranking: {
      rankedCandidates: number;
      tiesResolved: number;
      topCandidateId: string | null;
    };
    evaluation: {
      averageOverallScore: number | null;
      bestOverallScore: number | null;
      worstOverallScore: number | null;
    };
    commitCount: number;
    rejectCount: number;
    topOpportunityId: string | null;
    topOpportunityKind: string | null;
    generatedAt: string | null;
    reasoningBudget: {
      consumedOpportunities: number;
      consumedSearchSpaces: number;
      consumedCandidates: number;
      consumedSimulations: number;
      remaining: ReturnType<typeof remainingBudget>;
    };
    pruning: {
      skippedOpportunities: number;
      skippedSearchSpaces: number;
      skippedCandidates: number;
      estimatedBudgetSaved: number;
    };
    cognitiveFeedback: {
      repeatedOpportunities: number;
      repeatedSearchSpaces: number;
      repeatedCandidates: number;
      potentialSavings: number;
    };
    advisory: {
      available: boolean;
      confidence: number;
      evidenceCount: number;
    };
    advisoryIntegration: {
      consulted: boolean;
      recommendationAvailable: boolean;
      evidenceReferences: string[];
    };
    sessionLearning: {
      learnedPatterns: string[];
      exhaustedRegions: string[];
      usefulCandidates: string[];
      discardedCandidates: string[];
    };
    adaptivePriority: {
      promoted: number;
      demoted: number;
      unchanged: number;
    };
    diagnosis: {
      diagnosed: number;
      averageConfidence: number;
      primaryCauseDistribution: Record<string, number>;
    };
    adaptiveSearchSpace: {
      generated: number;
      discarded: number;
      averageSize: number;
      exhaustedRegionsSkipped: number;
    };
    strategyCandidates: {
      generated: number;
      discardedEquivalent: number;
      strategyFamilies: number;
      averageCandidatesPerSearchSpace: number;
    };
    candidatePreselection: {
      generatedCandidates: number;
      acceptedCandidates: number;
      discardedCandidates: number;
      limit: number;
    };
    mainFlowGapClosure: unknown;
    mainZoneContinuity: unknown;
    mainZoneGapResourceBlockSwap: unknown;
    baselineOverlapRepair: unknown;
    postRepairMainZoneContinuityPass: unknown;
    criticalResourceIdleCompression: unknown;
    decisionFeedback: {
      feedbackCount: number;
      influencedDecisions: number;
      promoted: number;
      demoted: number;
      adjustedCandidateBudget: number;
      adjustedSimulationBudget: number;
    };
  };
}

export interface ORCShadowModeOptions {
  enabled?: boolean;
  createdAt?: string | null;
  cognitiveState?: CognitiveState;
  configuration?: Partial<ORCConfiguration>;
  baselineSeedHardFeasibility?: ORCBaselineSeedHardFeasibilityAudit | null;
}

function buildShadowSummaryEvidence(
  configuration: Readonly<ORCConfiguration>,
  operationalState: OperationalState,
  operationalMap: OperationalMap,
  opportunities: Opportunity[],
  searchSpaceCount: number,
  candidateCount: number,
  commitCount: number,
  rejectCount: number,
  createdAt: string | null,
  reasoningBudgetSummary: ORCShadowModeResult["summary"]["reasoningBudget"],
  cognitiveFeedbackSummary: ORCShadowModeResult["summary"]["cognitiveFeedback"],
  pruningSummary: ORCShadowModeResult["summary"]["pruning"],
  rankingSummary: ORCShadowModeResult["summary"]["ranking"],
  evaluationSummary: ORCShadowModeResult["summary"]["evaluation"],
  sessionLearningSummary: ORCShadowModeResult["summary"]["sessionLearning"],
  adaptivePrioritySummary: ORCShadowModeResult["summary"]["adaptivePriority"],
  diagnosisSummary: ORCShadowModeResult["summary"]["diagnosis"],
  adaptiveSearchSpaceSummary: ORCShadowModeResult["summary"]["adaptiveSearchSpace"],
  strategyCandidateSummary: ORCShadowModeResult["summary"]["strategyCandidates"],
  advisoryIntegrationSummary: ORCShadowModeResult["summary"]["advisoryIntegration"],
  candidatePreselectionSummary: ORCShadowModeResult["summary"]["candidatePreselection"],
  decisionFeedbackSummary: ORCShadowModeResult["summary"]["decisionFeedback"],
  baselineSafetySummary: Record<string, unknown>,
  mainFlowGapClosureSummary: Record<string, unknown>,
  mainZoneContinuitySummary: Record<string, unknown>,
  mainZoneGapResourceBlockSwapSummary: Record<string, unknown>,
  baselineOverlapRepairSummary: Record<string, unknown>,
  postRepairMainZoneContinuityPassSummary: Record<string, unknown>,
  criticalResourceIdleCompressionSummary: Record<string, unknown>,
): Evidence {
  const topOpportunity = opportunities[0] ?? null;
  return {
    id: `evidence:orc-shadow:summary:${operationalState.id}`,
    source: "orc-shadow",
    kind: "shadow-mode-summary",
    subjectId: operationalState.id,
    createdAt,
    data: {
      enabled: true,
      integrationMode: configuration.integrationMode,
      configuration,
      stateId: operationalState.id,
      mapStateId: operationalMap.stateId,
      opportunityCount: opportunities.length,
      searchSpaceCount,
      candidateCount,
      commitCount,
      rejectCount,
      topOpportunityId: topOpportunity?.id ?? null,
      topOpportunityKind: topOpportunity?.kind ?? null,
      generatedAt: createdAt,
      readOnly: true,
      planningInfluence: "none",
      reasoningBudget: reasoningBudgetSummary,
      pruning: pruningSummary,
      cognitiveFeedback: cognitiveFeedbackSummary,
      ranking: rankingSummary,
      evaluation: evaluationSummary,
      sessionLearning: sessionLearningSummary,
      adaptivePriority: adaptivePrioritySummary,
      diagnosis: diagnosisSummary,
      adaptiveSearchSpace: adaptiveSearchSpaceSummary,
      strategyCandidates: strategyCandidateSummary,
      candidatePreselection: candidatePreselectionSummary,
      decisionFeedback: decisionFeedbackSummary,
      baselineSafety: baselineSafetySummary,
      mainFlowGapClosure: mainFlowGapClosureSummary,
      mainZoneContinuity: mainZoneContinuitySummary,
      mainZoneGapResourceBlockSwap: mainZoneGapResourceBlockSwapSummary,
      baselineOverlapRepair: baselineOverlapRepairSummary,
      postRepairMainZoneContinuityPass: postRepairMainZoneContinuityPassSummary,
      criticalResourceIdleCompression: criticalResourceIdleCompressionSummary,
      advisoryIntegration: advisoryIntegrationSummary,
    },
  };
}

function buildCognitiveStateEvidence(
  operationalState: OperationalState,
  kind: "cognitive-state-initial" | "cognitive-state-final" | "cognitive-state-diff",
  stateOrDiff: CognitiveState | Record<string, unknown>,
  createdAt: string | null,
): Evidence {
  return {
    id: `evidence:orc-shadow:${kind}:${operationalState.id}`,
    source: "orc-shadow",
    kind,
    subjectId: operationalState.id,
    createdAt,
    data: stateOrDiff as Record<string, never>,
  };
}

function diffCognitiveStates(initial: CognitiveState, final: CognitiveState): Record<string, unknown> {
  return {
    exploredOpportunityIdsAdded: final.exploredOpportunityIds.filter((id) => !initial.exploredOpportunityIds.includes(id)),
    exhaustedSearchSpaceIdsAdded: final.exhaustedSearchSpaceIds.filter((id) => !initial.exhaustedSearchSpaceIds.includes(id)),
    discardedCandidateIdsAdded: final.discardedCandidateIds.filter((id) => !initial.discardedCandidateIds.includes(id)),
    simulatedCandidateIdsAdded: final.simulatedCandidateIds.filter((id) => !initial.simulatedCandidateIds.includes(id)),
    committedCandidateIdsAdded: final.committedCandidateIds.filter((id) => !initial.committedCandidateIds.includes(id)),
    reasoningBudgetInitial: initial.reasoningBudget,
    reasoningBudgetFinal: final.reasoningBudget,
    reasoningBudgetRemaining: remainingBudget(final.reasoningBudget),
    confidenceBefore: initial.confidence,
    confidenceAfter: final.confidence,
    temporaryKnowledgeInitial: initial.temporaryKnowledge,
    temporaryKnowledgeFinal: final.temporaryKnowledge,
    decisionFeedbackInitial: initial.decisionFeedbackLoop ?? null,
    decisionFeedbackFinal: final.decisionFeedbackLoop ?? null,
  };
}

export function runORCShadowMode(
  input: EngineInput,
  options: ORCShadowModeOptions = {},
): ORCShadowModeResult | null {
  const configuration = normalizeORCConfiguration(options.enabled === false ? { integrationMode: ORCIntegrationMode.Disabled } : options.configuration ?? DEFAULT_ORC_CONFIGURATION);
  if (configuration.integrationMode === ORCIntegrationMode.Disabled) return null;

  const createdAt = options.createdAt ?? null;
  const operationalState = buildOperationalStateFromEngineInput(input);
  const baselineSeedHardFeasibility = options.baselineSeedHardFeasibility ?? auditORCBaselineSeedHardFeasibility(input, { createdAt });
  const cognitiveStateInitial = options.cognitiveState ?? createInitialCognitiveState(createdAt);
  let cognitiveState = cognitiveStateInitial;
  const operationalMap = buildOperationalMap(operationalState);
  const operationalAnalysis = analyzeOperationalState(operationalState);
  const operationalCriticalityResult = understandOperationalCriticality(operationalState, cognitiveState, createdAt);
  cognitiveState = operationalCriticalityResult.cognitiveState ?? cognitiveState;
  const opportunityResult = detectOpportunitiesWithPruningFromOperationalAnalysis(operationalState, operationalAnalysis, { cognitiveState });
  const classificationResult = classifyOpportunities(opportunityResult.opportunities);
  const dynamicBottleneckAnalysis = analyzeDynamicBottlenecks(operationalState, classificationResult.opportunities, createdAt);
  const prioritizationResult = prioritizeOpportunities(classificationResult.opportunities, { dynamicBottleneckAnalysis });
  const adaptivePriorityResult = reprioritizeOpportunities(prioritizationResult.opportunities, cognitiveState);
  const opportunities = adaptivePriorityResult.opportunities;
  const adaptivePrioritySummary = {
    promoted: adaptivePriorityResult.summary.promotedCount,
    demoted: adaptivePriorityResult.summary.demotedCount,
    unchanged: opportunities.length - adaptivePriorityResult.summary.promotedCount - adaptivePriorityResult.summary.demotedCount,
  };
  const topOpportunity = opportunities[0] ?? null;
  const repeatedOpportunityIds = opportunityResult.pruning.prunedItems.map((item) => item.id);
  cognitiveState = opportunities.reduce((state, opportunity) => updateReasoningBudget(recordExploredOpportunity(state, opportunity.id), consumeOpportunity(state.reasoningBudget)), cognitiveState);
  const diagnosisResult = diagnoseOpportunities(opportunities, operationalState, cognitiveState);
  const searchAndExplorationUnderstanding = buildSearchAndExplorationUnderstanding(operationalState, cognitiveState, createdAt, { opportunities, reasoningBudget: cognitiveState.reasoningBudget, dynamicBottleneckAnalysis });
  cognitiveState = searchAndExplorationUnderstanding.cognitiveState ?? cognitiveState;
  const feedbackReuseBeforeSearch = reuseDecisionFeedback(cognitiveState.decisionFeedbackLoop ?? buildDecisionFeedbackFromDecisions({ opportunities: [], operationalValues: [], commitDecisions: [] }), opportunities, cognitiveState.reasoningBudget, createdAt);
  cognitiveState = updateReasoningBudget(cognitiveState, feedbackReuseBeforeSearch.reasoningBudget);
  const searchSpaceResult = buildAdaptiveSearchSpaces([...feedbackReuseBeforeSearch.opportunities], cognitiveState, cognitiveState.reasoningBudget, { diagnoses: diagnosisResult.diagnoses, profiles: searchAndExplorationUnderstanding.adaptiveSearchSpaceProfiles, createdAt });
  const explorationValueAnalysis = estimateExplorationValue(searchSpaceResult.searchSpaces);
  const searchSpaceSelectionResult = selectSearchSpaces(searchSpaceResult.searchSpaces, operationalAnalysis.operationalPriorityMap, explorationValueAnalysis);
  const futureConstraintPropagation = propagateFutureConstraints(searchSpaceSelectionResult);
  const branchOrderingResult = orderSearchSpaces(searchSpaceSelectionResult, futureConstraintPropagation);
  const backtrackingExecution = executeBacktrackingSearch(branchOrderingResult, initializeBacktrackingState());
  const iterativeSearchResult = executeIterativeSearch(backtrackingExecution);
  const orderedBranchById = new Map(branchOrderingResult.orderedSearchSpaces.map((item) => [item.searchSpace.id, item]));
  const selectionBySearchSpaceId = new Map(searchSpaceSelectionResult.selected.map((item) => [item.searchSpace.id, item]));
  const selectedSearchSpaces = backtrackingExecution.explorationOrder.map((searchSpaceId) => orderedBranchById.get(searchSpaceId)).filter((ordered): ordered is NonNullable<typeof ordered> => ordered != null).map((ordered) => {
    const item = selectionBySearchSpaceId.get(ordered.searchSpace.id);
    return {
      ...ordered.searchSpace,
      explorationValue: explorationValueAnalysis.values.find((value) => value.searchSpaceId === ordered.searchSpace.id) ?? ordered.searchSpace.explorationValue,
      evidenceIds: [...ordered.searchSpace.evidenceIds, `evidence:orc-see:search-space-selection:${ordered.searchSpace.id}`, `evidence:orc-see:branch-ordering:${ordered.searchSpace.id}`],
      metadata: { ...ordered.searchSpace.metadata, searchSpaceSelection: { selected: item?.selected ?? true, selectionReason: item?.selectionReason ?? "Selected for branch ordering." }, branchOrdering: { explorationOrder: ordered.explorationOrder, orderingScore: ordered.orderingScore, explanation: ordered.explanation } },
    };
  });
  const searchSpaceSelectionEvidence = buildSearchSpaceSelectionEvidence(searchSpaceSelectionResult, operationalAnalysis.operationalPriorityMap, explorationValueAnalysis, createdAt);
  const branchOrderingEvidence = buildBranchOrderingEvidence(branchOrderingResult, createdAt);
  const repeatedSearchSpaceIds = searchSpaceResult.evidence.filter((item) => item.kind === "adaptive-search-space-discarded" && item.data.reason === "exhausted-region").map((item) => String(item.subjectId));
  const candidateResult = buildCandidatesFromSearchSpaces(selectedSearchSpaces, { adaptiveSearchSpaceProfiles: searchAndExplorationUnderstanding.adaptiveSearchSpaceProfiles, opportunityPropagation: searchAndExplorationUnderstanding.opportunityPropagation, operationalGoals: searchAndExplorationUnderstanding.operationalGoals, operationalState, createdAt, baselineSeedHardFeasibility });
  const partialPlanResult = composePartialPlans(candidateResult.candidates, { createdAt });
  const baselineSafetyCandidate = candidateResult.candidates.find((candidate) => candidate.metadata.baselineSafetyCandidate === true || candidate.metadata.baselinePreservation === true) ?? null;
  const baselineSafetyPartialPlan = baselineSafetyCandidate ? partialPlanResult.partialPlans.find((plan) => plan.candidateIds.length === 1 && plan.candidateIds[0] === baselineSafetyCandidate.id) ?? null : null;
  const decisionInput = buildDecisionInput({ ...candidateResult, partialPlans: partialPlanResult.partialPlans } as Parameters<typeof buildDecisionInput>[0] & { partialPlans: typeof partialPlanResult.partialPlans });
  cognitiveState = selectedSearchSpaces.reduce((state, searchSpace) => updateReasoningBudget(recordExhaustedSearchSpace(state, searchSpace.id), consumeSearchSpace(state.reasoningBudget)), cognitiveState);
  const repeatedCandidateIds = candidateResult.summary.pruning.prunedItems.map((item) => item.id);
  cognitiveState = candidateResult.candidates.reduce((state) => updateReasoningBudget(state, consumeCandidate(state.reasoningBudget)), cognitiveState);
  const decisionPipelineResult = executeDecisionPipeline({ ...decisionInput, operationalState, createdAt });
  const transformationResult = decisionPipelineResult.transformation;
  const simulationResult = decisionPipelineResult.simulation;
  cognitiveState = simulationResult.simulatedStates.reduce((state, simulatedState) => updateReasoningBudget(recordSimulatedCandidate(state, simulatedState.candidateStateId), consumeSimulation(state.reasoningBudget)), cognitiveState);
  const validationResult = decisionPipelineResult.validation;
  const evaluatorResult = decisionPipelineResult.evaluation;
  cognitiveState = learnFromEvaluation(cognitiveState, { operationalValues: evaluatorResult.operationalValues, candidateStates: transformationResult.candidateStates, simulatedStates: simulationResult.simulatedStates, candidates: decisionInput.candidates, searchSpaces: selectedSearchSpaces });
  const rankingResult = decisionPipelineResult.ranking;
  cognitiveState = learnFromRanking(cognitiveState, { rankedOperationalValues: rankingResult.rankedOperationalValues, candidateStates: transformationResult.candidateStates, simulatedStates: simulationResult.simulatedStates });
  const commitResult = decisionPipelineResult.commit;
  cognitiveState = learnFromCommit(cognitiveState, { commitDecisions: commitResult.commitDecisions, candidateStates: transformationResult.candidateStates, simulatedStates: simulationResult.simulatedStates, searchSpaces: selectedSearchSpaces });
  const baselineSafetyCandidateStateIds = new Set(transformationResult.candidateStates.filter((state) => state.candidateId === baselineSafetyCandidate?.id).map((state) => state.id));
  const baselineSafetySimulatedStateIds = new Set(simulationResult.simulatedStates.filter((state) => baselineSafetyCandidateStateIds.has(state.candidateStateId)).map((state) => state.id));
  const baselineSafetySelectedAsOutcome = baselineSafetyCandidate != null && commitResult.commitDecisions.some((decision) => decision.decision === "COMMIT" && decision.operationalValueId != null && baselineSafetySimulatedStateIds.has(decision.operationalValueId));
  const selectedCommitValue = commitResult.commitDecisions.find((decision) => decision.decision === "COMMIT")?.operationalValueId ?? null;
  const selectedCommitSimulation = selectedCommitValue ? evaluatorResult.operationalValues.find((value) => value.simulatedStateId === selectedCommitValue)?.simulatedStateId ?? selectedCommitValue : null;
  const rankedBestSimulationId = rankingResult.rankedOperationalValues[0]?.simulatedStateId ?? null;
  const baselineRepairCandidateIds = new Set(candidateResult.summary.baselineOverlapRepair.candidateIds ?? []);
  const baselineRepairLineage = resolveCandidateLineage({ rawCandidateIds: baselineRepairCandidateIds, decisionInputCandidates: decisionInput.candidates, candidateStates: transformationResult.candidateStates, simulatedStates: simulationResult.simulatedStates, operationalValues: evaluatorResult.operationalValues, commitDecisions: commitResult.commitDecisions, partialPlans: partialPlanResult.partialPlans, rankedBestSimulatedStateId: rankedBestSimulationId });
  const baselineRepairSimulatedStateIds = new Set(baselineRepairLineage.simulatedStateIds);
  const baselineRepairValidSimulationCount = validationResult.validationResults.filter((result) => baselineRepairSimulatedStateIds.has(result.simulatedStateId) && result.result === "VALID").length;
  const baselineRepairInvalidSimulationCount = validationResult.validationResults.filter((result) => baselineRepairSimulatedStateIds.has(result.simulatedStateId) && result.result === "INVALID").length;
  const criticalResourceIdleCompressionCandidateIds = new Set(candidateResult.summary.criticalResourceIdleCompression.candidateIds ?? []);
  const mainZoneSwapCandidateIds = new Set(candidateResult.summary.mainZoneGapResourceBlockSwap.candidateIds ?? []);
  const mainZoneSwapLineage = resolveCandidateLineage({ rawCandidateIds: mainZoneSwapCandidateIds, decisionInputCandidates: decisionInput.candidates, candidateStates: transformationResult.candidateStates, simulatedStates: simulationResult.simulatedStates, operationalValues: evaluatorResult.operationalValues, commitDecisions: commitResult.commitDecisions, partialPlans: partialPlanResult.partialPlans, rankedBestSimulatedStateId: rankedBestSimulationId });
  const mainZoneSwapSimulatedStateIds = new Set(mainZoneSwapLineage.simulatedStateIds);
  const mainZoneSwapValidSimulationCount = validationResult.validationResults.filter((result) => mainZoneSwapSimulatedStateIds.has(result.simulatedStateId) && result.result === "VALID").length;
  const mainZoneSwapInvalidSimulationCount = validationResult.validationResults.filter((result) => mainZoneSwapSimulatedStateIds.has(result.simulatedStateId) && result.result === "INVALID").length;
  const mainFlowCandidateIds = new Set(candidateResult.summary.mainFlowGapClosure.candidateIds ?? []);
  const mainFlowLineage = resolveCandidateLineage({ rawCandidateIds: mainFlowCandidateIds, decisionInputCandidates: decisionInput.candidates, candidateStates: transformationResult.candidateStates, simulatedStates: simulationResult.simulatedStates, operationalValues: evaluatorResult.operationalValues, commitDecisions: commitResult.commitDecisions, partialPlans: partialPlanResult.partialPlans, rankedBestSimulatedStateId: rankedBestSimulationId });
  const mainFlowSimulatedStateIds = new Set(mainFlowLineage.simulatedStateIds);
  const mainFlowValidSimulationCount = validationResult.validationResults.filter((result) => mainFlowSimulatedStateIds.has(result.simulatedStateId) && result.result === "VALID").length;
  const mainFlowInvalidSimulationCount = validationResult.validationResults.filter((result) => mainFlowSimulatedStateIds.has(result.simulatedStateId) && result.result === "INVALID").length;
  const pickSelectedRawCandidateId = (lineage: { selectedRawCandidateIds: readonly string[] }, preferredIds: ReadonlySet<string>): string | null => {
    const selected = lineage.selectedRawCandidateIds.filter((id) => preferredIds.has(id)).sort();
    return selected[0] ?? lineage.selectedRawCandidateIds[0] ?? null;
  };
  const criticalResourceIdleCompressionLineage = resolveCandidateLineage({ rawCandidateIds: criticalResourceIdleCompressionCandidateIds, decisionInputCandidates: decisionInput.candidates, candidateStates: transformationResult.candidateStates, simulatedStates: simulationResult.simulatedStates, operationalValues: evaluatorResult.operationalValues, commitDecisions: commitResult.commitDecisions, partialPlans: partialPlanResult.partialPlans, rankedBestSimulatedStateId: rankedBestSimulationId });
  const criticalResourceIdleCompressionSimulatedStateIds = new Set(criticalResourceIdleCompressionLineage.simulatedStateIds);
  const criticalResourceIdleCompressionValidSimulationCount = validationResult.validationResults.filter((result) => criticalResourceIdleCompressionSimulatedStateIds.has(result.simulatedStateId) && result.result === "VALID").length;
  let criticalResourceIdleCompressionSummary = { ...candidateResult.summary.criticalResourceIdleCompression, candidateStateCount: criticalResourceIdleCompressionLineage.candidateStateIds.length, simulatedStateCount: criticalResourceIdleCompressionLineage.simulatedStateIds.length, validSimulationCount: criticalResourceIdleCompressionValidSimulationCount, invalidSimulationCount: Math.max(0, criticalResourceIdleCompressionLineage.simulatedStateIds.length - criticalResourceIdleCompressionValidSimulationCount), selectedCandidateId: pickSelectedRawCandidateId(criticalResourceIdleCompressionLineage, criticalResourceIdleCompressionCandidateIds), selectedAsCommit: selectedCommitSimulation != null && criticalResourceIdleCompressionLineage.committedSimulatedStateIds.includes(selectedCommitSimulation), selectedSimulatedStateId: selectedCommitSimulation != null && criticalResourceIdleCompressionLineage.committedSimulatedStateIds.includes(selectedCommitSimulation) ? selectedCommitSimulation : null, lineage: { rawCandidateIds: criticalResourceIdleCompressionLineage.rawCandidateIds, syntheticCandidateIds: criticalResourceIdleCompressionLineage.syntheticCandidateIds, partialPlanIds: criticalResourceIdleCompressionLineage.partialPlanIds, candidateStateIds: criticalResourceIdleCompressionLineage.candidateStateIds, simulatedStateIds: criticalResourceIdleCompressionLineage.simulatedStateIds, committedSimulatedStateIds: criticalResourceIdleCompressionLineage.committedSimulatedStateIds, readOnly: true } };
  let mainZoneGapResourceBlockSwapSummary = { ...candidateResult.summary.mainZoneGapResourceBlockSwap, candidateStateCount: mainZoneSwapLineage.candidateStateIds.length, simulatedStateCount: mainZoneSwapLineage.simulatedStateIds.length, validSimulationCount: mainZoneSwapValidSimulationCount, invalidSimulationCount: mainZoneSwapInvalidSimulationCount, selectedCandidateId: pickSelectedRawCandidateId(mainZoneSwapLineage, mainZoneSwapCandidateIds), selectedAsBest: mainZoneSwapLineage.rankedBestSimulatedStateId != null, selectedAsCommit: selectedCommitSimulation != null && mainZoneSwapLineage.committedSimulatedStateIds.includes(selectedCommitSimulation), lineage: { rawCandidateIds: mainZoneSwapLineage.rawCandidateIds, syntheticCandidateIds: mainZoneSwapLineage.syntheticCandidateIds, partialPlanIds: mainZoneSwapLineage.partialPlanIds, candidateStateIds: mainZoneSwapLineage.candidateStateIds, simulatedStateIds: mainZoneSwapLineage.simulatedStateIds, committedSimulatedStateIds: mainZoneSwapLineage.committedSimulatedStateIds, readOnly: true } };
  const mainFlowGapClosureSummary = { ...candidateResult.summary.mainFlowGapClosure, candidateStateCount: mainFlowLineage.candidateStateIds.length, simulatedStateCount: mainFlowLineage.simulatedStateIds.length, validSimulationCount: mainFlowValidSimulationCount, invalidSimulationCount: mainFlowInvalidSimulationCount, selectedCandidateId: pickSelectedRawCandidateId(mainFlowLineage, mainFlowCandidateIds), selectedAsBest: mainFlowLineage.rankedBestSimulatedStateId != null, selectedAsCommit: selectedCommitSimulation != null && mainFlowLineage.committedSimulatedStateIds.includes(selectedCommitSimulation), lineage: { rawCandidateIds: mainFlowLineage.rawCandidateIds, syntheticCandidateIds: mainFlowLineage.syntheticCandidateIds, partialPlanIds: mainFlowLineage.partialPlanIds, candidateStateIds: mainFlowLineage.candidateStateIds, simulatedStateIds: mainFlowLineage.simulatedStateIds, committedSimulatedStateIds: mainFlowLineage.committedSimulatedStateIds, readOnly: true } };
  let baselineOverlapRepairSummary = { ...candidateResult.summary.baselineOverlapRepair, candidateStateCount: baselineRepairLineage.candidateStateIds.length, simulatedStateCount: baselineRepairLineage.simulatedStateIds.length, validSimulationCount: baselineRepairValidSimulationCount, invalidSimulationCount: baselineRepairInvalidSimulationCount, selectedCandidateId: pickSelectedRawCandidateId(baselineRepairLineage, baselineRepairCandidateIds), selectedAsBest: baselineRepairLineage.rankedBestSimulatedStateId != null, selectedAsCommit: selectedCommitSimulation != null && baselineRepairLineage.committedSimulatedStateIds.includes(selectedCommitSimulation), lineage: { rawCandidateIds: baselineRepairLineage.rawCandidateIds, syntheticCandidateIds: baselineRepairLineage.syntheticCandidateIds, partialPlanIds: baselineRepairLineage.partialPlanIds, candidateStateIds: baselineRepairLineage.candidateStateIds, simulatedStateIds: baselineRepairLineage.simulatedStateIds, committedSimulatedStateIds: baselineRepairLineage.committedSimulatedStateIds, readOnly: true } };

  const initialBaselineRepairInvariant = assertBaselineRepairRuntimeInvariant({ baselineSeedHardFeasibility, baselineOverlapRepairSummary: baselineOverlapRepairSummary as Record<string, unknown>, candidateResult, operationalState });
  let lateAuditRepairPass = { executed: false, reason: initialBaselineRepairInvariant.ok ? null : initialBaselineRepairInvariant.invariantViolationCode, candidateIds: [] as string[], generatedCandidateCount: 0, candidateStateCount: 0, simulatedStateCount: 0, validSimulationCount: 0, invalidSimulationCount: 0, selectedAsCommit: false, candidateStateIds: [] as string[], simulatedStateIds: [] as string[], committedSimulatedStateIds: [] as string[], lineage: { rawCandidateIds: [] as string[], syntheticCandidateIds: [] as string[], partialPlanIds: [] as string[], candidateStateIds: [] as string[], simulatedStateIds: [] as string[], committedSimulatedStateIds: [] as string[], readOnly: true as const }, warnings: [] as string[], readOnly: true as const };
  let lateEvidence: Evidence[] = [];
  let lateDecisionPipelineResult: ReturnType<typeof executeDecisionPipeline> | null = null;
  let lateDecisionInputCandidates: Candidate[] = [];
  let latePartialPlans: ReturnType<typeof composePartialPlans>["partialPlans"] = [];
  if (!initialBaselineRepairInvariant.ok && initialBaselineRepairInvariant.repairableAuditGroupDetected) {
    const lateRepair = buildBaselineOverlapRepairCandidates(operationalState, { createdAt, baselineSeedHardFeasibility, auditPassedToCandidateBuilder: true });
    const latePrefilter = prefilterCandidatesByHardConstraints(lateRepair.candidates, operationalState, { createdAt });
    const latePartialPlanResult = composePartialPlans(latePrefilter.candidates, { createdAt });
    latePartialPlans = latePartialPlanResult.partialPlans;
    const lateCandidateResult = {
      candidates: latePrefilter.candidates,
      evidence: [...lateRepair.evidence, ...latePrefilter.evidence, ...latePartialPlanResult.evidence],
      partialPlans: latePartialPlanResult.partialPlans,
      summary: { ...candidateResult.summary, searchSpaceCount: 0, candidateCount: latePrefilter.candidates.length, baselineOverlapRepair: lateRepair.summary, pruning: { ...candidateResult.summary.pruning, generatedCount: lateRepair.candidates.length, keptCount: latePrefilter.candidates.length, prunedCount: lateRepair.candidates.length - latePrefilter.candidates.length, estimatedBudgetSaved: lateRepair.candidates.length - latePrefilter.candidates.length, prunedItems: [] }, hardPrefilter: { ...candidateResult.summary.hardPrefilter, receivedCandidateCount: lateRepair.candidates.length, acceptedCandidateCount: latePrefilter.candidates.length, discardedCandidateCount: lateRepair.candidates.length - latePrefilter.candidates.length, discardedByReason: latePrefilter.summary.discardedByReason, overflowDiscardCount: latePrefilter.summary.overflowDiscardCount } },
    };
    const lateDecisionInput = buildDecisionInput(lateCandidateResult as Parameters<typeof buildDecisionInput>[0]);
    lateDecisionInputCandidates = lateDecisionInput.candidates;
    lateDecisionPipelineResult = executeDecisionPipeline({ ...lateDecisionInput, operationalState, createdAt });
    lateEvidence = [...lateRepair.evidence, ...latePrefilter.evidence, ...latePartialPlanResult.evidence, ...lateDecisionInput.evidence, ...lateDecisionPipelineResult.evidence, ...lateDecisionPipelineResult.transformation.evidence, ...lateDecisionPipelineResult.simulation.evidence, ...lateDecisionPipelineResult.validation.evidence, ...lateDecisionPipelineResult.evaluation.evidence, ...lateDecisionPipelineResult.ranking.evidence, ...lateDecisionPipelineResult.commit.evidence];
    const lateCandidateIds = lateRepair.candidates.map((candidate) => candidate.id);
    const lateRankedBestSimulationId = lateDecisionPipelineResult.ranking.rankedOperationalValues[0]?.simulatedStateId ?? null;
    const lateLineage = resolveCandidateLineage({ rawCandidateIds: new Set(lateCandidateIds), decisionInputCandidates: lateDecisionInput.candidates, candidateStates: lateDecisionPipelineResult.transformation.candidateStates, simulatedStates: lateDecisionPipelineResult.simulation.simulatedStates, operationalValues: lateDecisionPipelineResult.ranking.rankedOperationalValues, commitDecisions: lateDecisionPipelineResult.commit.commitDecisions, partialPlans: latePartialPlans, rankedBestSimulatedStateId: lateRankedBestSimulationId });
    const lateSimulatedStateIds = new Set(lateLineage.simulatedStateIds);
    const lateValid = lateDecisionPipelineResult.validation.validationResults.filter((result) => lateSimulatedStateIds.has(result.simulatedStateId) && result.result === "VALID").length;
    const lateInvalid = lateDecisionPipelineResult.validation.validationResults.filter((result) => lateSimulatedStateIds.has(result.simulatedStateId) && result.result === "INVALID").length;
    const lateCommit = lateLineage.committedSimulatedStateIds.length > 0;
    const lateLineageSummary = { rawCandidateIds: lateLineage.rawCandidateIds, syntheticCandidateIds: lateLineage.syntheticCandidateIds, partialPlanIds: lateLineage.partialPlanIds, candidateStateIds: lateLineage.candidateStateIds, simulatedStateIds: lateLineage.simulatedStateIds, committedSimulatedStateIds: lateLineage.committedSimulatedStateIds, readOnly: true as const };
    lateAuditRepairPass = { executed: true, reason: initialBaselineRepairInvariant.invariantViolationCode, candidateIds: lateCandidateIds, generatedCandidateCount: lateRepair.candidates.length, candidateStateCount: lateLineage.candidateStateIds.length, simulatedStateCount: lateLineage.simulatedStateIds.length, validSimulationCount: lateValid, invalidSimulationCount: lateInvalid, selectedAsCommit: lateCommit, candidateStateIds: lateLineage.candidateStateIds, simulatedStateIds: lateLineage.simulatedStateIds, committedSimulatedStateIds: lateLineage.committedSimulatedStateIds, lineage: lateLineageSummary, warnings: lateRepair.summary.runtimeWiringWarnings ?? [], readOnly: true };
    baselineOverlapRepairSummary = { ...baselineOverlapRepairSummary, ...lateRepair.summary, generatedCandidateCount: lateRepair.summary.generatedCandidateCount, candidateIds: lateCandidateIds, conflictingTaskIds: lateRepair.summary.conflictingTaskIds, skippedReason: lateRepair.summary.generatedCandidateCount > 0 ? null : lateRepair.summary.skippedReason, candidateStateCount: lateLineage.candidateStateIds.length, simulatedStateCount: lateLineage.simulatedStateIds.length, validSimulationCount: lateValid, invalidSimulationCount: lateInvalid, selectedAsCommit: lateCommit, selectedCandidateId: pickSelectedRawCandidateId(lateLineage, new Set(lateCandidateIds)), lineage: lateLineageSummary, lateAuditRepairPass };
  }
  baselineOverlapRepairSummary = { ...baselineOverlapRepairSummary, lateAuditRepairPass, runtimeInvariant: assertBaselineRepairRuntimeInvariant({ baselineSeedHardFeasibility, baselineOverlapRepairSummary: baselineOverlapRepairSummary as Record<string, unknown>, candidateResult, operationalState }) };

  const allSimulatedStatesForPostRepair = [...simulationResult.simulatedStates, ...(lateDecisionPipelineResult?.simulation.simulatedStates ?? [])];
  const allValidationResultsForPostRepair = [...validationResult.validationResults, ...(lateDecisionPipelineResult?.validation.validationResults ?? [])];
  const repairCommittedSimId = ((baselineOverlapRepairSummary as any).lineage?.committedSimulatedStateIds?.[0] ?? (baselineOverlapRepairSummary as any).lateAuditRepairPass?.committedSimulatedStateIds?.[0] ?? null) as string | null;
  const selectedRepairSimulationForPostRepair = repairCommittedSimId ? allSimulatedStatesForPostRepair.find((sim) => sim.id === repairCommittedSimId) ?? null : null;
  const selectedRepairValidationForPostRepair = repairCommittedSimId ? allValidationResultsForPostRepair.find((validation) => validation.simulatedStateId === repairCommittedSimId) ?? null : null;
  const postRepairContinuityPass = runPostRepairMainZoneContinuityPass({ originalState: operationalState, selectedRepairSimulation: selectedRepairSimulationForPostRepair, selectedRepairValidation: selectedRepairValidationForPostRepair, baselineOverlapRepair: baselineOverlapRepairSummary, createdAt });
  const postRepairSummary = postRepairContinuityPass.summary;
  if (postRepairSummary.selectedAsCommit) {
    mainZoneGapResourceBlockSwapSummary = { ...mainZoneGapResourceBlockSwapSummary, ...postRepairSummary, selectedAsCommit: true, selectedAsBest: true, skippedReason: null, lineage: { rawCandidateIds: postRepairSummary.candidateIds, syntheticCandidateIds: [], partialPlanIds: postRepairContinuityPass.partialPlans.map((p) => p.partialPlanId), candidateStateIds: postRepairContinuityPass.pipeline?.transformation.candidateStates.map((state) => state.id) ?? [], simulatedStateIds: postRepairContinuityPass.pipeline?.simulation.simulatedStates.map((state) => state.id) ?? [], committedSimulatedStateIds: postRepairSummary.selectedSimulatedStateId ? [postRepairSummary.selectedSimulatedStateId] : [], readOnly: true } };
  }

  const baselineSafetySummary = {
    generated: baselineSafetyCandidate != null,
    candidateId: baselineSafetyCandidate?.id ?? null,
    standalonePartialPlan: baselineSafetyPartialPlan?.partialPlanId ?? null,
    selectedAsOutcome: baselineSafetySelectedAsOutcome,
    reason: typeof baselineSafetyCandidate?.metadata.generationReason === "string" ? baselineSafetyCandidate.metadata.generationReason : null,
  };
  const resourceIdleBaseSimulation = postRepairSummary.selectedAsCommit && postRepairSummary.selectedSimulatedStateId ? postRepairContinuityPass.pipeline?.simulation.simulatedStates.find((sim) => sim.id === postRepairSummary.selectedSimulatedStateId) ?? null : selectedRepairSimulationForPostRepair;
  const resourceIdleBaseValidation = resourceIdleBaseSimulation ? [...(postRepairContinuityPass.pipeline?.validation.validationResults ?? []), ...allValidationResultsForPostRepair].find((validation) => validation.simulatedStateId === resourceIdleBaseSimulation.id) ?? null : null;
  const resourceIdleBaseCompositeSummary = buildFinalORCCompositeSummary({ originalState: operationalState, repairedState: selectedRepairSimulationForPostRepair?.operationalStateSnapshot ?? null, selectedSimulation: resourceIdleBaseSimulation, initialMainZoneContinuity: candidateResult.summary.mainZoneContinuity as unknown as Record<string, unknown>, mainZoneGapResourceBlockSwap: mainZoneGapResourceBlockSwapSummary as Record<string, unknown>, postRepairMainZoneContinuityPass: postRepairSummary as unknown as Record<string, unknown>, criticalResourceIdleCompression: criticalResourceIdleCompressionSummary as Record<string, unknown>, planningMaterialization: resourceIdleBaseSimulation?.planningMaterialization as unknown as Record<string, unknown> } as any);
  const resourceIdleBaseMaterialization = resourceIdleBaseCompositeSummary.planningMaterialization as Record<string, unknown> | null;
  const postContinuityResourceIdlePass = runCriticalResourceIdleCompressionPass({ originalState: operationalState, baseSimulation: resourceIdleBaseSimulation, baseValidation: resourceIdleBaseValidation, basePlanningMaterialization: resourceIdleBaseMaterialization, mainZoneContinuity: resourceIdleBaseCompositeSummary.mainZoneContinuity as Record<string, unknown>, postRepairMainZoneContinuityPass: postRepairSummary as unknown as Record<string, unknown>, criticalResourceIdleCompressionSummaryFromInitialPass: criticalResourceIdleCompressionSummary as unknown as Record<string, unknown>, createdAt });
  criticalResourceIdleCompressionSummary = { ...criticalResourceIdleCompressionSummary, ...postContinuityResourceIdlePass.summary } as any;

  const decisionFeedbackLoop = buildDecisionFeedbackFromDecisions({ opportunities, operationalValues: [...rankingResult.rankedOperationalValues, ...(lateDecisionPipelineResult?.ranking.rankedOperationalValues ?? []), ...(postRepairContinuityPass.pipeline?.ranking.rankedOperationalValues ?? []), ...(postContinuityResourceIdlePass.pipeline?.ranking.rankedOperationalValues ?? [])], commitDecisions: commitResult.commitDecisions });
  cognitiveState = updateDecisionFeedbackLoop(cognitiveState, decisionFeedbackLoop);
  const decisionFeedbackReuseAfterDecision = reuseDecisionFeedback(decisionFeedbackLoop, opportunities, cognitiveState.reasoningBudget, createdAt);
  const decisionFeedbackEvidence = buildDecisionFeedbackEvidence(decisionFeedbackLoop, decisionFeedbackReuseAfterDecision.influences, createdAt);
  const finalSelectedSimulation = postContinuityResourceIdlePass.summary.selectedAsCommit && postContinuityResourceIdlePass.selectedSimulation ? postContinuityResourceIdlePass.selectedSimulation : (postRepairSummary.selectedAsCommit && postRepairSummary.selectedSimulatedStateId ? postRepairContinuityPass.pipeline?.simulation.simulatedStates.find((sim) => sim.id === postRepairSummary.selectedSimulatedStateId) ?? null : (selectedCommitSimulation ? [...simulationResult.simulatedStates, ...(lateDecisionPipelineResult?.simulation.simulatedStates ?? [])].find((sim) => sim.id === selectedCommitSimulation) ?? null : null));
  const compositeSummary = buildFinalORCCompositeSummary({ originalState: operationalState, repairedState: selectedRepairSimulationForPostRepair?.operationalStateSnapshot ?? null, selectedSimulation: finalSelectedSimulation, initialMainZoneContinuity: candidateResult.summary.mainZoneContinuity as unknown as Record<string, unknown>, mainZoneGapResourceBlockSwap: mainZoneGapResourceBlockSwapSummary as Record<string, unknown>, postRepairMainZoneContinuityPass: postRepairSummary as unknown as Record<string, unknown>, criticalResourceIdleCompression: criticalResourceIdleCompressionSummary as Record<string, unknown>, planningMaterialization: finalSelectedSimulation?.planningMaterialization as unknown as Record<string, unknown> } as any);
  mainZoneGapResourceBlockSwapSummary = compositeSummary.mainZoneGapResourceBlockSwap as typeof mainZoneGapResourceBlockSwapSummary;

  const decisionFeedbackSummary = {
    feedbackCount: decisionFeedbackLoop.entries.length,
    influencedDecisions: decisionFeedbackReuseAfterDecision.influences.filter((influence) => influence.influence !== "unchanged").length,
    promoted: decisionFeedbackReuseAfterDecision.influences.filter((influence) => influence.influence === "promote").length,
    demoted: decisionFeedbackReuseAfterDecision.influences.filter((influence) => influence.influence === "demote").length,
    adjustedCandidateBudget: decisionFeedbackReuseAfterDecision.reasoningBudget.maxCandidates,
    adjustedSimulationBudget: decisionFeedbackReuseAfterDecision.reasoningBudget.maxSimulations,
  };
  const sessionKnowledge = getSessionKnowledge(cognitiveState);
  const sessionLearningSummary = {
    learnedPatterns: sessionKnowledge.learnedPatterns,
    exhaustedRegions: sessionKnowledge.exhaustedRegions,
    usefulCandidates: sessionKnowledge.usefulCandidates,
    discardedCandidates: sessionKnowledge.discardedCandidates,
  };
  const cognitiveStateDiff = diffCognitiveStates(cognitiveStateInitial, cognitiveState);
  const reasoningBudgetSummary = {
    consumedOpportunities: cognitiveState.reasoningBudget.consumedOpportunities,
    consumedSearchSpaces: cognitiveState.reasoningBudget.consumedSearchSpaces,
    consumedCandidates: cognitiveState.reasoningBudget.consumedCandidates,
    consumedSimulations: cognitiveState.reasoningBudget.consumedSimulations,
    remaining: remainingBudget(cognitiveState.reasoningBudget),
  };
  const pruningSummary = {
    skippedOpportunities: opportunityResult.pruning.prunedCount,
    skippedSearchSpaces: searchSpaceResult.summary.exhaustedRegionsSkipped,
    skippedCandidates: candidateResult.summary.pruning.prunedCount,
    estimatedBudgetSaved: opportunityResult.pruning.estimatedBudgetSaved + searchSpaceResult.summary.exhaustedRegionsSkipped + candidateResult.summary.pruning.estimatedBudgetSaved,
  };
  const cognitiveFeedbackSummary = createCognitiveFeedbackStats({ repeatedOpportunities: repeatedOpportunityIds.length, repeatedSearchSpaces: repeatedSearchSpaceIds.length, repeatedCandidates: repeatedCandidateIds.length, potentialSavings: pruningSummary.estimatedBudgetSaved });
  const primaryCauseDistribution = diagnosisResult.diagnoses.reduce<Record<string, number>>((distribution, diagnosis) => {
    distribution[diagnosis.primaryCause] = (distribution[diagnosis.primaryCause] ?? 0) + 1;
    return distribution;
  }, {});
  const diagnosisSummary = { ...diagnosisResult.summary, primaryCauseDistribution };
  const adaptiveSearchSpaceSummary = {
    generated: searchSpaceResult.summary.generatedSearchSpaces,
    discarded: searchSpaceResult.summary.discardedSearchSpaces,
    averageSize: searchSpaceResult.summary.averageSearchSpaceSize,
    exhaustedRegionsSkipped: searchSpaceResult.summary.exhaustedRegionsSkipped,
  };
  const strategyCandidateSummary = {
    generated: candidateResult.summary.candidateCount,
    discardedEquivalent: candidateResult.summary.duplicateCandidatesDiscarded,
    strategyFamilies: new Set(candidateResult.candidates.map((candidate) => typeof candidate.metadata.strategyFamily === "string" ? candidate.metadata.strategyFamily : String(candidate.metadata.strategy ?? "unknown"))).size,
    averageCandidatesPerSearchSpace: selectedSearchSpaces.length === 0 ? 0 : Math.round((candidateResult.summary.candidateCount / selectedSearchSpaces.length) * 1_000_000) / 1_000_000,
  };
  const candidatePreselectionSummary = candidateResult.summary.preselection;
  const rankingSummary = {
    rankedCandidates: rankingResult.summary.rankedCount,
    tiesResolved: rankingResult.summary.tieCount,
    topCandidateId: rankingResult.rankedOperationalValues[0]?.simulatedStateId ?? null,
  };
  const overallScores = evaluatorResult.operationalValues.map((value) => value.overallScore);
  const evaluationSummary = {
    averageOverallScore: overallScores.length === 0 ? null : Math.round((overallScores.reduce((sum, score) => sum + score, 0) / overallScores.length) * 1_000_000) / 1_000_000,
    bestOverallScore: overallScores.length === 0 ? null : Math.max(...overallScores),
    worstOverallScore: overallScores.length === 0 ? null : Math.min(...overallScores),
  };
  const evidence = [
    buildCognitiveStateEvidence(operationalState, "cognitive-state-initial", cognitiveStateInitial, createdAt),
    ...operationalCriticalityResult.evidence,
    ...buildOpportunityDetectionEvidence(operationalState, operationalMap, opportunities, createdAt, cognitiveStateInitial),
    ...dynamicBottleneckAnalysis.evidence,
    ...adaptivePriorityResult.evidence.map((item) => ({ ...item, createdAt })),
    ...opportunityResult.pruning.prunedItems.map((item): Evidence => ({ id: `evidence:orc-see:opportunity:pruned:${item.id}`, source: "orc-see", kind: "opportunity-pruned", subjectId: item.id, createdAt, data: { opportunityId: item.id, reason: item.reason, phase: item.phase, estimatedBudgetSaved: item.estimatedBudgetSaved, readOnly: true } })),
    ...diagnosisResult.evidence.map((item) => ({ ...item, createdAt })),
    ...searchAndExplorationUnderstanding.evidence.filter((item) => item.kind !== "operational-criticality" && item.kind !== "dynamic-bottleneck-analysis"),
    ...searchSpaceResult.evidence,
    ...searchSpaceSelectionEvidence,
    ...branchOrderingEvidence,
    ...backtrackingExecution.evidence.map((item) => ({ ...item, createdAt })),
    ...iterativeSearchResult.evidence.map((item) => ({ ...item, createdAt })),
    ...partialPlanResult.evidence,
    ...decisionInput.evidence,
    ...transformationResult.evidence,
    ...simulationResult.evidence,
    ...validationResult.evidence,
    ...evaluatorResult.evidence,
    ...rankingResult.evidence,
    ...commitResult.evidence,
    ...decisionPipelineResult.evidence,
    ...lateEvidence,
    ...postRepairContinuityPass.evidence,
    ...postContinuityResourceIdlePass.evidence,
    ...decisionFeedbackEvidence,
    buildCognitiveStateEvidence(operationalState, "cognitive-state-final", cognitiveState, createdAt),
    buildCognitiveStateEvidence(operationalState, "cognitive-state-diff", cognitiveStateDiff, createdAt),
    buildShadowSummaryEvidence(configuration, operationalState, operationalMap, opportunities, selectedSearchSpaces.length, candidateResult.candidates.length, commitResult.summary.commitCount, commitResult.summary.rejectCount, createdAt, reasoningBudgetSummary, cognitiveFeedbackSummary, pruningSummary, rankingSummary, evaluationSummary, sessionLearningSummary, adaptivePrioritySummary, diagnosisSummary, adaptiveSearchSpaceSummary, strategyCandidateSummary, { consulted: false, recommendationAvailable: false, evidenceReferences: [] }, candidatePreselectionSummary, decisionFeedbackSummary, baselineSafetySummary, mainFlowGapClosureSummary, candidateResult.summary.mainZoneContinuity as unknown as Record<string, unknown>, mainZoneGapResourceBlockSwapSummary, baselineOverlapRepairSummary, postRepairSummary as unknown as Record<string, unknown>, criticalResourceIdleCompressionSummary as Record<string, unknown>),
  ];

  const preliminaryResult = {
    operationalState,
    operationalMap,
    operationalAnalysis,
    operationalCriticality: operationalCriticalityResult.operationalCriticality,
    dynamicBottleneckAnalysis,
    opportunities,
    diagnoses: diagnosisResult.diagnoses,
    searchSpaces: selectedSearchSpaces,
    candidates: [...decisionInput.candidates, ...lateDecisionInputCandidates, ...postRepairContinuityPass.decisionInputCandidates, ...postContinuityResourceIdlePass.decisionInputCandidates],
    candidateStates: [...transformationResult.candidateStates, ...(lateDecisionPipelineResult?.transformation.candidateStates ?? []), ...(postRepairContinuityPass.pipeline?.transformation.candidateStates ?? []), ...(postContinuityResourceIdlePass.pipeline?.transformation.candidateStates ?? [])],
    simulatedStates: [...simulationResult.simulatedStates, ...(lateDecisionPipelineResult?.simulation.simulatedStates ?? []), ...(postRepairContinuityPass.pipeline?.simulation.simulatedStates ?? []), ...(postContinuityResourceIdlePass.selectedSimulation ? [postContinuityResourceIdlePass.selectedSimulation] : (postContinuityResourceIdlePass.pipeline?.simulation.simulatedStates ?? []))],
    validationResults: [...validationResult.validationResults, ...(lateDecisionPipelineResult?.validation.validationResults ?? []), ...(postRepairContinuityPass.pipeline?.validation.validationResults ?? []), ...(postContinuityResourceIdlePass.selectedValidation ? [postContinuityResourceIdlePass.selectedValidation] : (postContinuityResourceIdlePass.pipeline?.validation.validationResults ?? []))],
    operationalValues: [...rankingResult.rankedOperationalValues, ...(lateDecisionPipelineResult?.ranking.rankedOperationalValues ?? []), ...(postRepairContinuityPass.pipeline?.ranking.rankedOperationalValues ?? []), ...(postContinuityResourceIdlePass.pipeline?.ranking.rankedOperationalValues ?? [])],
    commitDecisions: [...commitResult.commitDecisions, ...(lateDecisionPipelineResult?.commit.commitDecisions ?? []), ...(postRepairContinuityPass.pipeline?.commit.commitDecisions ?? []), ...(postContinuityResourceIdlePass.pipeline?.commit.commitDecisions ?? [])],
    evidence,
    advisoryDecision: null,
    cognitiveState,
    cognitiveStateInitial,
    cognitiveStateDiff,
    candidateSummary: candidateResult.summary,
    summary: {
      enabled: true,
      integrationMode: configuration.integrationMode,
      configuration,
      opportunityCount: opportunities.length,
      searchSpaceCount: selectedSearchSpaces.length,
      candidateCount: candidateResult.candidates.length + lateDecisionInputCandidates.length + postRepairContinuityPass.decisionInputCandidates.length + postContinuityResourceIdlePass.decisionInputCandidates.length,
      candidateStateCount: transformationResult.candidateStates.length + (lateDecisionPipelineResult?.transformation.candidateStates.length ?? 0) + (postRepairContinuityPass.pipeline?.transformation.candidateStates.length ?? 0) + (postContinuityResourceIdlePass.pipeline?.transformation.candidateStates.length ?? 0),
      simulatedStateCount: simulationResult.simulatedStates.length + (lateDecisionPipelineResult?.simulation.simulatedStates.length ?? 0) + (postRepairContinuityPass.pipeline?.simulation.simulatedStates.length ?? 0) + (postContinuityResourceIdlePass.pipeline?.simulation.simulatedStates.length ?? 0),
      validCount: validationResult.summary.validCount + (lateDecisionPipelineResult?.validation.summary.validCount ?? 0) + (postRepairContinuityPass.pipeline?.validation.summary.validCount ?? 0) + (postContinuityResourceIdlePass.pipeline?.validation.summary.validCount ?? 0),
      invalidCount: validationResult.summary.invalidCount + (lateDecisionPipelineResult?.validation.summary.invalidCount ?? 0) + (postRepairContinuityPass.pipeline?.validation.summary.invalidCount ?? 0) + (postContinuityResourceIdlePass.pipeline?.validation.summary.invalidCount ?? 0),
      evaluatedCount: evaluatorResult.summary.evaluatedCount + (lateDecisionPipelineResult?.evaluation.summary.evaluatedCount ?? 0) + (postRepairContinuityPass.pipeline?.evaluation.summary.evaluatedCount ?? 0) + (postContinuityResourceIdlePass.pipeline?.evaluation.summary.evaluatedCount ?? 0),
      ranking: rankingSummary,
      evaluation: evaluationSummary,
      sessionLearning: sessionLearningSummary,
      adaptivePriority: adaptivePrioritySummary,
      diagnosis: diagnosisSummary,
      adaptiveSearchSpace: adaptiveSearchSpaceSummary,
      strategyCandidates: strategyCandidateSummary,
      candidatePreselection: candidatePreselectionSummary,
      decisionFeedback: decisionFeedbackSummary,
      baselineSafety: baselineSafetySummary,
      mainFlowGapClosure: mainFlowGapClosureSummary,
      mainZoneContinuity: compositeSummary.mainZoneContinuity,
      mainZoneGapResourceBlockSwap: mainZoneGapResourceBlockSwapSummary,
      criticalResourceIdleCompression: criticalResourceIdleCompressionSummary,
      baselineSeedHardFeasibility,
      runtimeContract: { ...buildORCRuntimeContractID224(), postContinuityResourceIdleCompressionPassVersion: "ORC-POST-CONTINUITY-RESOURCE-IDLE-PASS-ID231", resourceIdleCompositeSelectionPolicy: "valid-committed-continuity-and-net-positive-resource-compactness-first-v1", resourceIdleNetValueContractVersion: "ORC-RESOURCE-IDLE-NET-VALUE-ID234" },
      baselineOverlapRepair: baselineOverlapRepairSummary,
      postRepairMainZoneContinuityPass: compositeSummary.postRepairMainZoneContinuityPass,
      summaryContractValid: compositeSummary.summaryContractValid,
      summaryContractWarnings: compositeSummary.summaryContractWarnings,
      finalSummaryBuiltFromSelectedSimulation: compositeSummary.finalSummaryBuiltFromSelectedSimulation,
      compositeSimulationLineage: compositeSummary.compositeSimulationLineage,
      finalSelectedCandidateFamily: compositeSummary.finalSelectedCandidateFamily,
      finalSelectedSimulationIncludesBaselineRepair: compositeSummary.finalSelectedSimulationIncludesBaselineRepair,
      finalSelectedSimulationIncludesPostRepairContinuity: compositeSummary.finalSelectedSimulationIncludesPostRepairContinuity,
      finalSelectedSimulationIncludesCriticalResourceIdleCompression: compositeSummary.finalSelectedSimulationIncludesCriticalResourceIdleCompression,
      productionConceptAlignment: compositeSummary.productionConceptAlignment,
      commitCount: commitResult.summary.commitCount + (lateDecisionPipelineResult?.commit.summary.commitCount ?? 0) + (postRepairContinuityPass.pipeline?.commit.summary.commitCount ?? 0) + (postContinuityResourceIdlePass.pipeline?.commit.summary.commitCount ?? 0),
      rejectCount: commitResult.summary.rejectCount + (lateDecisionPipelineResult?.commit.summary.rejectCount ?? 0) + (postRepairContinuityPass.pipeline?.commit.summary.rejectCount ?? 0) + (postContinuityResourceIdlePass.pipeline?.commit.summary.rejectCount ?? 0),
      topOpportunityId: topOpportunity?.id ?? null,
      topOpportunityKind: topOpportunity?.kind ?? null,
      generatedAt: createdAt,
      reasoningBudget: reasoningBudgetSummary,
      pruning: pruningSummary,
      cognitiveFeedback: cognitiveFeedbackSummary,
      advisory: {
        available: false,
        confidence: 0,
        evidenceCount: 0,
      },
      advisoryIntegration: {
        consulted: false,
        recommendationAvailable: false,
        evidenceReferences: [],
      },
    },
  } as unknown as ORCShadowModeResult;

  const advisoryDecision = buildAdvisoryDecision(preliminaryResult);
  const resultWithAdvisory = {
    ...preliminaryResult,
    advisoryDecision,
    summary: {
      ...preliminaryResult.summary,
      advisory: {
        available: advisoryDecision !== null,
        confidence: advisoryDecision?.confidence ?? 0,
        evidenceCount: advisoryDecision?.evidenceIds.length ?? 0,
      },
    },
  } as unknown as ORCShadowModeResult;
  const advisoryIntegration = consultORCAdvisory(resultWithAdvisory);
  const advisoryIntegrationSummary = {
    consulted: advisoryIntegration.consulted,
    recommendationAvailable: advisoryIntegration.advisoryDecision !== null,
    evidenceReferences: advisoryIntegration.evidence.flatMap((item) => (Array.isArray(item.data.evidenceReferences) ? item.data.evidenceReferences.map(String) : [])),
  };

  const evidenceWithIntegrationSummary = resultWithAdvisory.evidence.map((item) => item.kind === "shadow-mode-summary" ? { ...item, data: { ...item.data, advisoryIntegration: advisoryIntegrationSummary } } : item);

  const finalResult = {
    ...resultWithAdvisory,
    evidence: [...evidenceWithIntegrationSummary, ...advisoryIntegration.evidence],
    summary: {
      ...resultWithAdvisory.summary,
      advisoryIntegration: advisoryIntegrationSummary,
    },
  } as unknown as ORCShadowModeResult;

  return {
    ...finalResult,
    executionEvidence: buildExecutionEvidenceRecord(finalResult),
  };
}
