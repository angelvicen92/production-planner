import type { EngineInput } from "../../types";
import type { Candidate, CandidateState, Evidence, OperationalState, OperationalValue, Opportunity, SearchSpace, SimulatedState, ValidationResult } from "../contracts";
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
  evidence: Evidence[];
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
    topOpportunityId: string | null;
    topOpportunityKind: string | null;
    generatedAt: string | null;
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
  createdAt: string | null,
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
      topOpportunityId: topOpportunity?.id ?? null,
      topOpportunityKind: topOpportunity?.kind ?? null,
      generatedAt: createdAt,
      readOnly: true,
      planningInfluence: "none",
    },
  };
}

export function runORCShadowMode(
  input: EngineInput,
  options: ORCShadowModeOptions = {},
): ORCShadowModeResult | null {
  if (options.enabled === false) return null;

  const createdAt = options.createdAt ?? null;
  const operationalState = buildOperationalStateFromEngineInput(input);
  const operationalMap = buildOperationalMap(operationalState);
  const opportunities = prioritizeOpportunities(detectOpportunitiesFromOperationalMap(operationalState, operationalMap));
  const topOpportunity = opportunities[0] ?? null;
  const searchSpaceResult = buildSearchSpacesForOpportunities(operationalState, operationalMap, opportunities, { createdAt });
  const candidateResult = buildCandidatesFromSearchSpaces(operationalState, searchSpaceResult.searchSpaces, { createdAt });
  const transformationResult = buildCandidateStates(operationalState, candidateResult.candidates, { createdAt });
  const simulationResult = simulateCandidateStates(operationalState, transformationResult.candidateStates, { createdAt });
  const validationResult = validateSimulatedStates(simulationResult.simulatedStates, { createdAt });
  const evaluatorResult = evaluateSimulatedStates(simulationResult.simulatedStates, validationResult.validationResults, { createdAt });
  const evidence = [
    ...buildOpportunityDetectionEvidence(operationalState, operationalMap, opportunities, createdAt),
    ...searchSpaceResult.evidence,
    ...candidateResult.evidence,
    ...transformationResult.evidence,
    ...simulationResult.evidence,
    ...validationResult.evidence,
    ...evaluatorResult.evidence,
    buildShadowSummaryEvidence(operationalState, operationalMap, opportunities, searchSpaceResult.searchSpaces.length, candidateResult.candidates.length, createdAt),
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
    evidence,
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
      topOpportunityId: topOpportunity?.id ?? null,
      topOpportunityKind: topOpportunity?.kind ?? null,
      generatedAt: createdAt,
    },
  };
}
