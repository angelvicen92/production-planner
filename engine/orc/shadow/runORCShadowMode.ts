import type { EngineInput } from "../../types";
import type { Evidence, OperationalState, Opportunity } from "../contracts";
import type { OperationalMap } from "../see/operationalMap";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { buildOperationalMap } from "../see/operationalMap";
import { buildOpportunityDetectionEvidence, detectOpportunitiesFromOperationalMap } from "../see/opportunityDetection";
import { prioritizeOpportunities } from "../see/opportunityPriority";

export interface ORCShadowModeResult {
  operationalState: OperationalState;
  operationalMap: OperationalMap;
  opportunities: Opportunity[];
  evidence: Evidence[];
  summary: {
    enabled: boolean;
    opportunityCount: number;
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
  const evidence = [
    ...buildOpportunityDetectionEvidence(operationalState, operationalMap, opportunities, createdAt),
    buildShadowSummaryEvidence(operationalState, operationalMap, opportunities, createdAt),
  ];

  return {
    operationalState,
    operationalMap,
    opportunities,
    evidence,
    summary: {
      enabled: true,
      opportunityCount: opportunities.length,
      topOpportunityId: topOpportunity?.id ?? null,
      topOpportunityKind: topOpportunity?.kind ?? null,
      generatedAt: createdAt,
    },
  };
}
