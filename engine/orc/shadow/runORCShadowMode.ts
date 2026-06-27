import type { EngineInput } from "../../types";
import type { AdvisoryDecision } from "../advisory/advisoryDecision";
import type { Candidate, CandidateState, CognitiveState, CommitDecision, Evidence, OperationalState, OperationalValue, Opportunity, SearchSpace, SimulatedState, ValidationResult } from "../contracts";
import type { OperationalMap } from "../see/operationalMap";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { buildOperationalMap } from "../see/operationalMap";
import { buildOpportunityDetectionEvidence, detectOpportunitiesWithPruning } from "../see/opportunityDetection";
import { buildAdaptiveSearchSpaces } from "../see/adaptiveSearchSpaceBuilder";
import { diagnoseOpportunities, type OpportunityDiagnosis } from "../see/opportunityDiagnosis";
import { buildCandidatesFromSearchSpaces } from "../see/candidateBuilder";
import { reprioritizeOpportunities } from "../see/adaptivePriority";
import { buildCandidateStates } from "../transformation/transformationEngine";
import { simulateCandidateStates } from "../simulation/simulationEngine";
import { validateSimulatedStates } from "../validation/validationEngine";
import { evaluateSimulatedStates } from "../evaluator/operationalEvaluator";
import { rankOperationalValues } from "../decision/rankingEngine";
import { buildCommitDecisions } from "../commit/commitEngine";
import { createInitialCognitiveState, recordExploredOpportunity, recordExhaustedSearchSpace, recordSimulatedCandidate, updateReasoningBudget } from "../cognitive/cognitiveState";
import { createCognitiveFeedbackStats } from "../cognitive/cognitiveFeedback";
import { getSessionKnowledge, learnFromCommit, learnFromEvaluation, learnFromRanking } from "../cognitive/sessionLearning";
import { consumeCandidate, consumeOpportunity, consumeSearchSpace, consumeSimulation, remainingBudget } from "../cognitive/reasoningBudget";
import { buildAdvisoryDecision } from "../advisory/advisoryDecision";
import { consultORCAdvisory } from "../integration/advisoryIntegration";

export interface ORCShadowModeResult {
  operationalState: OperationalState;
  operationalMap: OperationalMap;
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
}

function buildShadowSummaryEvidence(
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
  if (options.enabled === false) return null;

  const createdAt = options.createdAt ?? null;
  const operationalState = buildOperationalStateFromEngineInput(input);
  const cognitiveStateInitial = options.cognitiveState ?? createInitialCognitiveState(createdAt);
  let cognitiveState = cognitiveStateInitial;
  const operationalMap = buildOperationalMap(operationalState);
  const opportunityResult = detectOpportunitiesWithPruning(operationalState, operationalMap, { cognitiveState });
  const adaptivePriorityResult = reprioritizeOpportunities(opportunityResult.opportunities, cognitiveState);
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
  const searchSpaceResult = buildAdaptiveSearchSpaces(opportunities, cognitiveState, cognitiveState.reasoningBudget, { diagnoses: diagnosisResult.diagnoses });
  const repeatedSearchSpaceIds = searchSpaceResult.evidence.filter((item) => item.kind === "adaptive-search-space-discarded" && item.data.reason === "exhausted-region").map((item) => String(item.subjectId));
  const candidateBuilderState = cognitiveState;
  const candidateResult = buildCandidatesFromSearchSpaces(operationalState, searchSpaceResult.searchSpaces, { createdAt, cognitiveState: candidateBuilderState });
  cognitiveState = searchSpaceResult.searchSpaces.reduce((state, searchSpace) => updateReasoningBudget(recordExhaustedSearchSpace(state, searchSpace.id), consumeSearchSpace(state.reasoningBudget)), cognitiveState);
  const repeatedCandidateIds = candidateResult.summary.pruning.prunedItems.map((item) => item.id);
  cognitiveState = candidateResult.candidates.reduce((state) => updateReasoningBudget(state, consumeCandidate(state.reasoningBudget)), cognitiveState);
  const transformationResult = buildCandidateStates(operationalState, candidateResult.candidates, { createdAt });
  const simulationResult = simulateCandidateStates(operationalState, transformationResult.candidateStates, { createdAt });
  cognitiveState = simulationResult.simulatedStates.reduce((state, simulatedState) => updateReasoningBudget(recordSimulatedCandidate(state, simulatedState.candidateStateId), consumeSimulation(state.reasoningBudget)), cognitiveState);
  const validationResult = validateSimulatedStates(simulationResult.simulatedStates, { createdAt });
  const evaluatorResult = evaluateSimulatedStates(simulationResult.simulatedStates, validationResult.validationResults, { createdAt });
  cognitiveState = learnFromEvaluation(cognitiveState, { operationalValues: evaluatorResult.operationalValues, candidateStates: transformationResult.candidateStates, simulatedStates: simulationResult.simulatedStates, candidates: candidateResult.candidates, searchSpaces: searchSpaceResult.searchSpaces });
  const rankingResult = rankOperationalValues(evaluatorResult.operationalValues, { createdAt });
  cognitiveState = learnFromRanking(cognitiveState, { rankedOperationalValues: rankingResult.rankedOperationalValues, candidateStates: transformationResult.candidateStates, simulatedStates: simulationResult.simulatedStates });
  const commitResult = buildCommitDecisions(rankingResult.rankedOperationalValues, { createdAt });
  cognitiveState = learnFromCommit(cognitiveState, { commitDecisions: commitResult.commitDecisions, candidateStates: transformationResult.candidateStates, simulatedStates: simulationResult.simulatedStates, searchSpaces: searchSpaceResult.searchSpaces });
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
    averageCandidatesPerSearchSpace: searchSpaceResult.searchSpaces.length === 0 ? 0 : Math.round((candidateResult.summary.candidateCount / searchSpaceResult.searchSpaces.length) * 1_000_000) / 1_000_000,
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
    ...buildOpportunityDetectionEvidence(operationalState, operationalMap, opportunities, createdAt, cognitiveStateInitial),
    ...adaptivePriorityResult.evidence.map((item) => ({ ...item, createdAt })),
    ...opportunityResult.pruning.prunedItems.map((item): Evidence => ({ id: `evidence:orc-see:opportunity:pruned:${item.id}`, source: "orc-see", kind: "opportunity-pruned", subjectId: item.id, createdAt, data: { opportunityId: item.id, reason: item.reason, phase: item.phase, estimatedBudgetSaved: item.estimatedBudgetSaved, readOnly: true } })),
    ...diagnosisResult.evidence.map((item) => ({ ...item, createdAt })),
    ...searchSpaceResult.evidence,
    ...candidateResult.evidence,
    ...transformationResult.evidence,
    ...simulationResult.evidence,
    ...validationResult.evidence,
    ...evaluatorResult.evidence,
    ...rankingResult.evidence,
    ...commitResult.evidence,
    buildCognitiveStateEvidence(operationalState, "cognitive-state-final", cognitiveState, createdAt),
    buildCognitiveStateEvidence(operationalState, "cognitive-state-diff", cognitiveStateDiff, createdAt),
    buildShadowSummaryEvidence(operationalState, operationalMap, opportunities, searchSpaceResult.searchSpaces.length, candidateResult.candidates.length, commitResult.summary.commitCount, commitResult.summary.rejectCount, createdAt, reasoningBudgetSummary, cognitiveFeedbackSummary, pruningSummary, rankingSummary, evaluationSummary, sessionLearningSummary, adaptivePrioritySummary, diagnosisSummary, adaptiveSearchSpaceSummary, strategyCandidateSummary, { consulted: false, recommendationAvailable: false, evidenceReferences: [] }),
  ];

  const preliminaryResult = {
    operationalState,
    operationalMap,
    opportunities,
    diagnoses: diagnosisResult.diagnoses,
    searchSpaces: searchSpaceResult.searchSpaces,
    candidates: candidateResult.candidates,
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
      opportunityCount: opportunities.length,
      searchSpaceCount: searchSpaceResult.searchSpaces.length,
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
  } as ORCShadowModeResult;

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
  } as ORCShadowModeResult;
  const advisoryIntegration = consultORCAdvisory(resultWithAdvisory);
  const advisoryIntegrationSummary = {
    consulted: advisoryIntegration.consulted,
    recommendationAvailable: advisoryIntegration.advisoryDecision !== null,
    evidenceReferences: advisoryIntegration.evidence.flatMap((item) => (Array.isArray(item.data.evidenceReferences) ? item.data.evidenceReferences.map(String) : [])),
  };

  const evidenceWithIntegrationSummary = resultWithAdvisory.evidence.map((item) => item.kind === "shadow-mode-summary" ? { ...item, data: { ...item.data, advisoryIntegration: advisoryIntegrationSummary } } : item);

  return {
    ...resultWithAdvisory,
    evidence: [...evidenceWithIntegrationSummary, ...advisoryIntegration.evidence],
    summary: {
      ...resultWithAdvisory.summary,
      advisoryIntegration: advisoryIntegrationSummary,
    },
  };
}
