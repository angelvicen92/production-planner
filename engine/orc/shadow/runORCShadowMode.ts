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
import { diagnoseOpportunities, type OpportunityDiagnosis } from "../see/opportunityDiagnosis";
import { buildCandidatesFromSearchSpaces } from "../see/candidateBuilder";
import { reprioritizeOpportunities } from "../see/adaptivePriority";
import { buildDecisionInput } from "../decision/decisionInput";
import { executeDecisionPipeline } from "../decision/decisionPipelineOrchestrator";
import { createInitialCognitiveState, recordExploredOpportunity, recordExhaustedSearchSpace, recordSimulatedCandidate, updateReasoningBudget } from "../cognitive/cognitiveState";
import { createCognitiveFeedbackStats } from "../cognitive/cognitiveFeedback";
import { getSessionKnowledge, learnFromCommit, learnFromEvaluation, learnFromRanking } from "../cognitive/sessionLearning";
import { consumeCandidate, consumeOpportunity, consumeSearchSpace, consumeSimulation, remainingBudget } from "../cognitive/reasoningBudget";
import { buildAdvisoryDecision } from "../advisory/advisoryDecision";
import { DEFAULT_ORC_CONFIGURATION, ORCIntegrationMode, type ORCConfiguration, normalizeORCConfiguration } from "../config/orcIntegrationMode";
import { consultORCAdvisory } from "../integration/advisoryIntegration";
import { buildExecutionEvidenceRecord } from "../evidence/executionEvidenceRecorder";
import { understandOperationalCriticality, type OperationalCriticality } from "../understanding/operationalCriticality";
import { buildSearchAndExplorationUnderstanding } from "../search/searchAndExplorationEngine";

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
  };
}

export interface ORCShadowModeOptions {
  enabled?: boolean;
  createdAt?: string | null;
  cognitiveState?: CognitiveState;
  configuration?: Partial<ORCConfiguration>;
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
  const cognitiveStateInitial = options.cognitiveState ?? createInitialCognitiveState(createdAt);
  let cognitiveState = cognitiveStateInitial;
  const operationalMap = buildOperationalMap(operationalState);
  const operationalAnalysis = analyzeOperationalState(operationalState);
  const operationalCriticalityResult = understandOperationalCriticality(operationalState, cognitiveState, createdAt);
  cognitiveState = operationalCriticalityResult.cognitiveState ?? cognitiveState;
  const opportunityResult = detectOpportunitiesWithPruningFromOperationalAnalysis(operationalState, operationalAnalysis, { cognitiveState });
  const classificationResult = classifyOpportunities(opportunityResult.opportunities);
  const prioritizationResult = prioritizeOpportunities(classificationResult.opportunities);
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
  const searchAndExplorationUnderstanding = buildSearchAndExplorationUnderstanding(operationalState, cognitiveState, createdAt, { opportunities, reasoningBudget: cognitiveState.reasoningBudget });
  cognitiveState = searchAndExplorationUnderstanding.cognitiveState ?? cognitiveState;
  const searchSpaceResult = buildAdaptiveSearchSpaces(opportunities, cognitiveState, cognitiveState.reasoningBudget, { diagnoses: diagnosisResult.diagnoses, profiles: searchAndExplorationUnderstanding.adaptiveSearchSpaceProfiles, createdAt });
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
  const candidateResult = buildCandidatesFromSearchSpaces(selectedSearchSpaces, { adaptiveSearchSpaceProfiles: searchAndExplorationUnderstanding.adaptiveSearchSpaceProfiles, opportunityPropagation: searchAndExplorationUnderstanding.opportunityPropagation, operationalState });
  const decisionInput = buildDecisionInput(candidateResult);
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
    ...adaptivePriorityResult.evidence.map((item) => ({ ...item, createdAt })),
    ...opportunityResult.pruning.prunedItems.map((item): Evidence => ({ id: `evidence:orc-see:opportunity:pruned:${item.id}`, source: "orc-see", kind: "opportunity-pruned", subjectId: item.id, createdAt, data: { opportunityId: item.id, reason: item.reason, phase: item.phase, estimatedBudgetSaved: item.estimatedBudgetSaved, readOnly: true } })),
    ...diagnosisResult.evidence.map((item) => ({ ...item, createdAt })),
    ...searchAndExplorationUnderstanding.evidence.filter((item) => item.kind !== "operational-criticality"),
    ...searchSpaceResult.evidence,
    ...searchSpaceSelectionEvidence,
    ...branchOrderingEvidence,
    ...backtrackingExecution.evidence.map((item) => ({ ...item, createdAt })),
    ...iterativeSearchResult.evidence.map((item) => ({ ...item, createdAt })),
    ...decisionInput.evidence,
    ...transformationResult.evidence,
    ...simulationResult.evidence,
    ...validationResult.evidence,
    ...evaluatorResult.evidence,
    ...rankingResult.evidence,
    ...commitResult.evidence,
    ...decisionPipelineResult.evidence,
    buildCognitiveStateEvidence(operationalState, "cognitive-state-final", cognitiveState, createdAt),
    buildCognitiveStateEvidence(operationalState, "cognitive-state-diff", cognitiveStateDiff, createdAt),
    buildShadowSummaryEvidence(configuration, operationalState, operationalMap, opportunities, selectedSearchSpaces.length, candidateResult.candidates.length, commitResult.summary.commitCount, commitResult.summary.rejectCount, createdAt, reasoningBudgetSummary, cognitiveFeedbackSummary, pruningSummary, rankingSummary, evaluationSummary, sessionLearningSummary, adaptivePrioritySummary, diagnosisSummary, adaptiveSearchSpaceSummary, strategyCandidateSummary, { consulted: false, recommendationAvailable: false, evidenceReferences: [] }),
  ];

  const preliminaryResult = {
    operationalState,
    operationalMap,
    operationalAnalysis,
    operationalCriticality: operationalCriticalityResult.operationalCriticality,
    opportunities,
    diagnoses: diagnosisResult.diagnoses,
    searchSpaces: selectedSearchSpaces,
    candidates: decisionInput.candidates,
    candidateStates: transformationResult.candidateStates,
    simulatedStates: simulationResult.simulatedStates,
    validationResults: validationResult.validationResults,
    operationalValues: rankingResult.rankedOperationalValues,
    commitDecisions: commitResult.commitDecisions,
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
      candidateCount: candidateResult.candidates.length,
      candidateStateCount: transformationResult.candidateStates.length,
      simulatedStateCount: simulationResult.simulatedStates.length,
      validCount: validationResult.summary.validCount,
      invalidCount: validationResult.summary.invalidCount,
      evaluatedCount: evaluatorResult.summary.evaluatedCount,
      ranking: rankingSummary,
      evaluation: evaluationSummary,
      sessionLearning: sessionLearningSummary,
      adaptivePriority: adaptivePrioritySummary,
      diagnosis: diagnosisSummary,
      adaptiveSearchSpace: adaptiveSearchSpaceSummary,
      strategyCandidates: strategyCandidateSummary,
      commitCount: commitResult.summary.commitCount,
      rejectCount: commitResult.summary.rejectCount,
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
