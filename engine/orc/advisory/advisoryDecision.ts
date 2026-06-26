import type { ORCShadowModeResult } from "../shadow/runORCShadowMode";
import { deepFreeze } from "../immutability";

export interface AdvisoryDecision {
  decisionId: string;
  candidateId: string | null;
  confidence: number;
  reasoningSummary: string;
  evidenceIds: string[];
  recommendedAction: string;
  constraintsConsidered: string[];
  generatedAt: string | null;
}

const ADVISORY_PREFIX = "advisory:orc-decision";

const uniqueSorted = (values: string[]): string[] => Array.from(new Set(values)).sort();

const finiteScore = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const roundConfidence = (value: number): number => Math.round(Math.max(0, Math.min(1, value)) * 1_000_000) / 1_000_000;

const evidenceExists = (shadowResult: ORCShadowModeResult, evidenceId: string): boolean => shadowResult.evidence.some((evidence) => evidence.id === evidenceId);

export function buildAdvisoryDecision(
  shadowResult: ORCShadowModeResult,
): AdvisoryDecision | null {
  const topOperationalValue = shadowResult.operationalValues[0] ?? null;
  if (topOperationalValue === null) return null;

  const simulatedState = shadowResult.simulatedStates.find((state) => state.id === topOperationalValue.simulatedStateId) ?? null;
  const validationResult = shadowResult.validationResults.find((result) => result.simulatedStateId === topOperationalValue.simulatedStateId && result.result === "VALID") ?? null;
  if (simulatedState === null || validationResult === null) return null;

  const candidateState = shadowResult.candidateStates.find((state) => state.id === simulatedState.candidateStateId) ?? null;
  const candidateId = candidateState?.candidateId ?? null;
  if (candidateId === null) return null;

  const rankingEvidenceId = `evidence:orc-ranking-engine:operational-value:${topOperationalValue.simulatedStateId}:rank:1`;
  const evidenceIds = uniqueSorted([
    ...topOperationalValue.evidenceIds,
    ...validationResult.evidenceIds,
    ...(evidenceExists(shadowResult, rankingEvidenceId) ? [rankingEvidenceId] : []),
  ]);

  const constraintsConsidered = validationResult.violatedConstraints.length === 0
    ? ["validation:VALID:no-violated-constraints"]
    : uniqueSorted(validationResult.violatedConstraints.map((constraint) => `validation:${constraint}`));

  const confidence = roundConfidence(Math.min(
    finiteScore(topOperationalValue.overallScore),
    finiteScore(candidateState?.confidence),
  ));

  return deepFreeze({
    decisionId: `${ADVISORY_PREFIX}:${topOperationalValue.simulatedStateId}`,
    candidateId,
    confidence,
    reasoningSummary: `Recommend candidate ${candidateId} because ranked operational value ${topOperationalValue.simulatedStateId} is position 1 with overallScore=${topOperationalValue.overallScore} and validation=${validationResult.result}.`,
    evidenceIds,
    recommendedAction: "HUMAN_REVIEW_RECOMMENDED_CANDIDATE_ONLY",
    constraintsConsidered,
    generatedAt: shadowResult.summary.generatedAt,
  }) as AdvisoryDecision;
}
