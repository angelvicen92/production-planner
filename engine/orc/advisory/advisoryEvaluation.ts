import type { RealScenarioValidationReport } from "../validation/realScenarioValidation";
import type { AdvisoryDecision } from "./advisoryDecision";
import { deepFreeze } from "../immutability";

export interface AdvisoryEvaluationReport {
  advisoryDecisionId: string;

  evaluatedAt: string | null;

  metrics: {
    recommendationAvailable: boolean;
    topRankAgreement: number;
    reasoningCoverage: number;
    evidenceCompleteness: number;
    traceabilityScore: number;
  };

  observations: string[];

  summary: string;
}

const roundMetric = (value: number): number => Math.round(Math.max(0, Math.min(1, value)) * 1_000_000) / 1_000_000;

const hasText = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;

const uniqueCount = (values: readonly string[]): number => new Set(values).size;

const computeReasoningCoverage = (advisoryDecision: AdvisoryDecision | null): number => {
  if (advisoryDecision === null) return 0;

  const components = [
    hasText(advisoryDecision.reasoningSummary),
    hasText(advisoryDecision.recommendedAction),
    advisoryDecision.constraintsConsidered.length > 0,
  ];

  return roundMetric(components.filter(Boolean).length / components.length);
};

const computeEvidenceCompleteness = (advisoryDecision: AdvisoryDecision | null): number => {
  if (advisoryDecision === null || advisoryDecision.evidenceIds.length === 0) return 0;

  const components = [
    advisoryDecision.evidenceIds.length > 0,
    uniqueCount(advisoryDecision.evidenceIds) === advisoryDecision.evidenceIds.length,
    advisoryDecision.evidenceIds.some((id) => id.includes("evaluation") || id.includes("operational-value")),
    advisoryDecision.evidenceIds.some((id) => id.includes("validation")),
  ];

  return roundMetric(components.filter(Boolean).length / components.length);
};

const computeTraceabilityScore = (
  advisoryDecision: AdvisoryDecision | null,
  validationReport: RealScenarioValidationReport,
): number => {
  if (advisoryDecision === null) return 0;

  const components = [
    hasText(advisoryDecision.decisionId),
    hasText(advisoryDecision.candidateId),
    advisoryDecision.evidenceIds.length > 0,
    hasText(validationReport.scenarioId),
    validationReport.differences.common.some((entry) => entry === `scenario:${validationReport.scenarioId}`),
  ];

  return roundMetric(components.filter(Boolean).length / components.length);
};

const buildObservations = (
  advisoryDecision: AdvisoryDecision | null,
  validationReport: RealScenarioValidationReport,
  metrics: AdvisoryEvaluationReport["metrics"],
): string[] => {
  if (advisoryDecision === null) {
    return [
      "No advisory recommendation was available for evaluation.",
      `Scenario ${validationReport.scenarioId} retains V4 comparison evidence only.`,
    ];
  }

  return [
    `Evaluated advisory recommendation ${advisoryDecision.decisionId}.`,
    `Recommendation candidate=${advisoryDecision.candidateId ?? "none"}; V4 top-rank agreement=${metrics.topRankAgreement}.`,
    `Evidence references=${advisoryDecision.evidenceIds.length}; validation differences=${validationReport.metrics.planningDifferences}.`,
  ];
};

export function evaluateAdvisoryDecision(
  advisoryDecision: AdvisoryDecision | null,
  validationReport: RealScenarioValidationReport,
): AdvisoryEvaluationReport {
  const recommendationAvailable = advisoryDecision !== null;
  const metrics = {
    recommendationAvailable,
    topRankAgreement: recommendationAvailable ? roundMetric(validationReport.metrics.topRankAgreement) : 0,
    reasoningCoverage: computeReasoningCoverage(advisoryDecision),
    evidenceCompleteness: computeEvidenceCompleteness(advisoryDecision),
    traceabilityScore: computeTraceabilityScore(advisoryDecision, validationReport),
  };

  const advisoryDecisionId = advisoryDecision?.decisionId ?? "advisory:none";
  const observations = buildObservations(advisoryDecision, validationReport, metrics);

  return deepFreeze({
    advisoryDecisionId,
    evaluatedAt: validationReport.comparedAt,
    metrics,
    observations,
    summary: `ORC-ADVISORY-EVALUATION-V1: advisory ${advisoryDecisionId} evaluated against scenario ${validationReport.scenarioId}; recommendationAvailable=${metrics.recommendationAvailable}; topRankAgreement=${metrics.topRankAgreement}.`,
  }) as AdvisoryEvaluationReport;
}
