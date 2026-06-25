import type { EngineInput } from "../../types";
import type { Candidate, CandidateState, CognitiveState, CommitDecision, Evidence, OperationalState, OperationalValue, Opportunity, SearchSpace, SimulatedState, ValidationResult } from "../contracts";
import type { OperationalMap } from "../see/operationalMap";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { buildOperationalMap } from "../see/operationalMap";
import { buildOpportunityDetectionEvidence, detectOpportunitiesFromOperationalMap } from "../see/opportunityDetection";
import { buildSearchSpacesForOpportunities } from "../see/searchSpaceBuilder";
import { buildCandidatesFromSearchSpaces } from "../see/candidateBuilder";
import { prioritizeOpportunities } from "../see/opportunityPriority";
import { buildCandidateStates } from "../transformation/transformationEngine";
import { simulateCandidateStates } from "../simulation/simulationEngine";
import { validateSimulatedStates } from "../validation/validationEngine";
import { evaluateSimulatedStates } from "../evaluator/operationalEvaluator";
import { buildCommitDecisions } from "../commit/commitEngine";
import { createInitialCognitiveState, recordExploredOpportunity, recordExhaustedSearchSpace, recordObservedCommit, recordSimulatedCandidate, updateReasoningBudget } from "../cognitive/cognitiveState";
import { consumeCandidate, consumeOpportunity, consumeSearchSpace, consumeSimulation, remainingBudget } from "../cognitive/reasoningBudget";

export interface ORCShadowModeResult {
  operationalState: OperationalState;
  operationalMap: OperationalMap;
  opportunities: Opportunity[];
  searchSpaces: SearchSpace[];
  candidates: Candidate[];
  candidateStates: CandidateState[];
  simulatedStates: SimulatedState[];
  validationResults: ValidationResult[];
  operationalValues: OperationalValue[];
  commitDecisions: CommitDecision[];
  evidence: Evidence[];
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
  };
}

export interface ORCShadowModeOptions {
  enabled?: boolean;
  createdAt?: string | null;
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
  };
}

export function runORCShadowMode(
  input: EngineInput,
  options: ORCShadowModeOptions = {},
): ORCShadowModeResult | null {
  if (options.enabled === false) return null;

  const createdAt = options.createdAt ?? null;
  const operationalState = buildOperationalStateFromEngineInput(input);
  const cognitiveStateInitial = createInitialCognitiveState(createdAt);
  let cognitiveState = cognitiveStateInitial;
  const operationalMap = buildOperationalMap(operationalState);
  const opportunities = prioritizeOpportunities(detectOpportunitiesFromOperationalMap(operationalState, operationalMap));
  const topOpportunity = opportunities[0] ?? null;
  cognitiveState = opportunities.reduce((state, opportunity) => updateReasoningBudget(recordExploredOpportunity(state, opportunity.id), consumeOpportunity(state.reasoningBudget)), cognitiveState);
  const searchSpaceResult = buildSearchSpacesForOpportunities(operationalState, operationalMap, opportunities, { createdAt });
  cognitiveState = searchSpaceResult.searchSpaces.reduce((state, searchSpace) => updateReasoningBudget(recordExhaustedSearchSpace(state, searchSpace.id), consumeSearchSpace(state.reasoningBudget)), cognitiveState);
  const candidateResult = buildCandidatesFromSearchSpaces(operationalState, searchSpaceResult.searchSpaces, { createdAt });
  cognitiveState = candidateResult.candidates.reduce((state) => updateReasoningBudget(state, consumeCandidate(state.reasoningBudget)), cognitiveState);
  const transformationResult = buildCandidateStates(operationalState, candidateResult.candidates, { createdAt });
  const simulationResult = simulateCandidateStates(operationalState, transformationResult.candidateStates, { createdAt });
  cognitiveState = simulationResult.simulatedStates.reduce((state, simulatedState) => updateReasoningBudget(recordSimulatedCandidate(state, simulatedState.candidateStateId), consumeSimulation(state.reasoningBudget)), cognitiveState);
  const validationResult = validateSimulatedStates(simulationResult.simulatedStates, { createdAt });
  const evaluatorResult = evaluateSimulatedStates(simulationResult.simulatedStates, validationResult.validationResults, { createdAt });
  const commitResult = buildCommitDecisions(evaluatorResult.operationalValues, { createdAt });
  const simulatedCandidateIdByOperationalValueId = new Map(simulationResult.simulatedStates.map((simulatedState) => [simulatedState.id, simulatedState.candidateStateId]));
  cognitiveState = commitResult.commitDecisions.filter((decision) => decision.decision === "COMMIT" && decision.operationalValueId != null).reduce((state, decision) => recordObservedCommit(state, simulatedCandidateIdByOperationalValueId.get(String(decision.operationalValueId)) ?? String(decision.operationalValueId)), cognitiveState);
  const cognitiveStateDiff = diffCognitiveStates(cognitiveStateInitial, cognitiveState);
  const reasoningBudgetSummary = {
    consumedOpportunities: cognitiveState.reasoningBudget.consumedOpportunities,
    consumedSearchSpaces: cognitiveState.reasoningBudget.consumedSearchSpaces,
    consumedCandidates: cognitiveState.reasoningBudget.consumedCandidates,
    consumedSimulations: cognitiveState.reasoningBudget.consumedSimulations,
    remaining: remainingBudget(cognitiveState.reasoningBudget),
  };
  const evidence = [
    buildCognitiveStateEvidence(operationalState, "cognitive-state-initial", cognitiveStateInitial, createdAt),
    ...buildOpportunityDetectionEvidence(operationalState, operationalMap, opportunities, createdAt),
    ...searchSpaceResult.evidence,
    ...candidateResult.evidence,
    ...transformationResult.evidence,
    ...simulationResult.evidence,
    ...validationResult.evidence,
    ...evaluatorResult.evidence,
    ...commitResult.evidence,
    buildCognitiveStateEvidence(operationalState, "cognitive-state-final", cognitiveState, createdAt),
    buildCognitiveStateEvidence(operationalState, "cognitive-state-diff", cognitiveStateDiff, createdAt),
    buildShadowSummaryEvidence(operationalState, operationalMap, opportunities, searchSpaceResult.searchSpaces.length, candidateResult.candidates.length, commitResult.summary.commitCount, commitResult.summary.rejectCount, createdAt, reasoningBudgetSummary),
  ];

  return {
    operationalState,
    operationalMap,
    opportunities,
    searchSpaces: searchSpaceResult.searchSpaces,
    candidates: candidateResult.candidates,
    candidateStates: transformationResult.candidateStates,
    simulatedStates: simulationResult.simulatedStates,
    validationResults: validationResult.validationResults,
    operationalValues: evaluatorResult.operationalValues,
    commitDecisions: commitResult.commitDecisions,
    evidence,
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
      commitCount: commitResult.summary.commitCount,
      rejectCount: commitResult.summary.rejectCount,
      topOpportunityId: topOpportunity?.id ?? null,
      topOpportunityKind: topOpportunity?.kind ?? null,
      generatedAt: createdAt,
      reasoningBudget: reasoningBudgetSummary,
    },
  };
}
