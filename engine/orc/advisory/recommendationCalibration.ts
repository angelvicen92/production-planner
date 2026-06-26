import { deepFreeze } from "../immutability";
import type { AdvisoryEvaluationReport } from "./advisoryEvaluation";

export interface RecommendationCalibrationReport {
  generatedAt: string | null;

  evaluatedScenarios: number;

  metrics: {
    recommendationCoverage: number;
    topRecommendationAgreement: number;
    averageConfidence: number;
    averageTraceability: number;
    averageEvidenceCompleteness: number;
    recommendationAvailability: number;
  };

  scenarioBreakdown: Record<string, unknown>;

  summary: string;
}

type ScenarioBreakdownEntry = {
  advisoryDecisionId: string;
  evaluatedAt: string | null;
  recommendationAvailable: boolean;
  topRankAgreement: number;
  recommendationConfidence: number;
  reasoningCoverage: number;
  evidenceCompleteness: number;
  traceabilityScore: number;
  observations: string[];
  advisoryEvaluationSummary: string;
};

const roundMetric = (value: number): number => Math.round(Math.max(0, Math.min(1, value)) * 1_000_000) / 1_000_000;

const average = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  return roundMetric(values.reduce((total, value) => total + value, 0) / values.length);
};

const buildBreakdownKey = (evaluation: AdvisoryEvaluationReport, index: number): string => {
  const stableId = evaluation.advisoryDecisionId.trim().length > 0 ? evaluation.advisoryDecisionId : "advisory:unknown";
  return `scenario:${String(index + 1).padStart(3, "0")}:${stableId}`;
};

const buildScenarioBreakdown = (evaluations: readonly AdvisoryEvaluationReport[]): Record<string, ScenarioBreakdownEntry> => Object.fromEntries(
  evaluations.map((evaluation, index) => [
    buildBreakdownKey(evaluation, index),
    {
      advisoryDecisionId: evaluation.advisoryDecisionId,
      evaluatedAt: evaluation.evaluatedAt,
      recommendationAvailable: evaluation.metrics.recommendationAvailable,
      topRankAgreement: evaluation.metrics.topRankAgreement,
      recommendationConfidence: evaluation.metrics.recommendationConfidence,
      reasoningCoverage: evaluation.metrics.reasoningCoverage,
      evidenceCompleteness: evaluation.metrics.evidenceCompleteness,
      traceabilityScore: evaluation.metrics.traceabilityScore,
      observations: [...evaluation.observations],
      advisoryEvaluationSummary: evaluation.summary,
    },
  ]),
);

export function buildRecommendationCalibrationReport(
  evaluations: AdvisoryEvaluationReport[],
): RecommendationCalibrationReport {
  const evaluatedScenarios = evaluations.length;
  const availableEvaluations = evaluations.filter((evaluation) => evaluation.metrics.recommendationAvailable);

  const metrics: RecommendationCalibrationReport["metrics"] = {
    recommendationCoverage: average(evaluations.map((evaluation) => evaluation.metrics.reasoningCoverage)),
    topRecommendationAgreement: average(evaluations.map((evaluation) => evaluation.metrics.topRankAgreement)),
    averageConfidence: average(availableEvaluations.map((evaluation) => evaluation.metrics.recommendationConfidence)),
    averageTraceability: average(evaluations.map((evaluation) => evaluation.metrics.traceabilityScore)),
    averageEvidenceCompleteness: average(evaluations.map((evaluation) => evaluation.metrics.evidenceCompleteness)),
    recommendationAvailability: roundMetric(evaluatedScenarios === 0 ? 0 : availableEvaluations.length / evaluatedScenarios),
  };

  return deepFreeze({
    generatedAt: evaluations[0]?.evaluatedAt ?? null,
    evaluatedScenarios,
    metrics,
    scenarioBreakdown: buildScenarioBreakdown(evaluations),
    summary: `ORC-RECOMMENDATION-CALIBRATION-V1: evaluatedScenarios=${evaluatedScenarios}; recommendationAvailability=${metrics.recommendationAvailability}; topRecommendationAgreement=${metrics.topRecommendationAgreement}; averageConfidence=${metrics.averageConfidence}.`,
  }) as RecommendationCalibrationReport;
}
