import type { AdvisoryDecision } from "../advisory/advisoryDecision";
import { deepFreeze } from "../immutability";
import type { Evidence } from "../contracts";
import type { ORCShadowModeResult } from "../shadow/runORCShadowMode";

export interface AdvisoryIntegrationResult {
  consulted: boolean;
  advisoryDecision: AdvisoryDecision | null;
  evidence: Evidence[];
}

const uniqueSorted = (values: string[]): string[] => Array.from(new Set(values)).sort();

function buildEvidence(
  shadowResult: ORCShadowModeResult,
  advisoryDecision: AdvisoryDecision | null,
): Evidence {
  const advisoryEvidenceIds = advisoryDecision?.evidenceIds ?? [];
  const evidenceReferences = uniqueSorted([
    ...advisoryEvidenceIds,
    ...shadowResult.evidence
      .filter((item) => item.kind === "shadow-mode-summary" || item.kind === "operational-value-ranked")
      .map((item) => item.id),
  ]);

  return {
    id: `evidence:orc-advisory-integration:${shadowResult.operationalState.id}`,
    source: "orc-advisory-integration",
    kind: advisoryDecision === null ? "orc-advisory-consulted-recommendation-absent" : "orc-advisory-consulted-recommendation-available",
    subjectId: shadowResult.operationalState.id,
    createdAt: shadowResult.summary.generatedAt,
    data: {
      consulted: true,
      recommendationAvailable: advisoryDecision !== null,
      advisoryDecisionId: advisoryDecision?.decisionId ?? null,
      candidateId: advisoryDecision?.candidateId ?? null,
      confidence: advisoryDecision?.confidence ?? 0,
      evidenceReferences,
      planningInfluence: "none",
      readOnly: true,
    },
  };
}

export function consultORCAdvisory(
  shadowResult: ORCShadowModeResult | null,
): AdvisoryIntegrationResult {
  if (shadowResult === null) {
    return deepFreeze({ consulted: false, advisoryDecision: null, evidence: [] }) as AdvisoryIntegrationResult;
  }

  const advisoryDecision = shadowResult.advisoryDecision;
  return deepFreeze({
    consulted: true,
    advisoryDecision,
    evidence: [buildEvidence(shadowResult, advisoryDecision)],
  }) as AdvisoryIntegrationResult;
}
