import type { EngineInput } from "../../types";
import type { Evidence, OperationalState, Opportunity, SearchSpace } from "../contracts";
import type { OperationalMap } from "../see/operationalMap";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { buildOperationalMap } from "../see/operationalMap";
import { buildOpportunityDetectionEvidence, detectOpportunitiesFromOperationalMap } from "../see/opportunityDetection";
import { buildSearchSpacesForOpportunities } from "../see/searchSpaceBuilder";
import { prioritizeOpportunities } from "../see/opportunityPriority";

export interface ORCShadowModeResult {
  operationalState: OperationalState;
  operationalMap: OperationalMap;
  opportunities: Opportunity[];
  searchSpaces: SearchSpace[];
  evidence: Evidence[];
  summary: {
    enabled: boolean;
    opportunityCount: number;
    searchSpaceCount: number;
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
  const evidence = [
    ...buildOpportunityDetectionEvidence(operationalState, operationalMap, opportunities, createdAt),
    ...searchSpaceResult.evidence,
    buildShadowSummaryEvidence(operationalState, operationalMap, opportunities, searchSpaceResult.searchSpaces.length, createdAt),
  ];

  return {
    operationalState,
    operationalMap,
    opportunities,
    searchSpaces: searchSpaceResult.searchSpaces,
    evidence,
    summary: {
      enabled: true,
      opportunityCount: opportunities.length,
      searchSpaceCount: searchSpaceResult.searchSpaces.length,
      topOpportunityId: topOpportunity?.id ?? null,
      topOpportunityKind: topOpportunity?.kind ?? null,
      generatedAt: createdAt,
    },
  };
}
