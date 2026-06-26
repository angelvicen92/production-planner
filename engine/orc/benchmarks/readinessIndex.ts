import { deepFreeze } from "../immutability";
import type { RecommendationCalibrationReport } from "../advisory/recommendationCalibration";

export interface ReadinessIndexReport {
  generatedAt: string | null;

  readinessIndex: number;

  dimensions: {
    benchmarkCoverage: number;
    recommendationCoverage: number;
    recommendationAgreement: number;
    traceability: number;
    evidenceCompleteness: number;
  };

  summary: string;

  recommendations: string[];
}

type ScenarioBreakdownMetrics = {
  evidenceCompleteness?: unknown;
};

const roundReadinessMetric = (value: number): number => Math.round(Math.max(0, Math.min(1, value)) * 1_000_000) / 1_000_000;

const average = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  return roundReadinessMetric(values.reduce((total, value) => total + value, 0) / values.length);
};

const numericMetric = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

const evidenceCompletenessFromBreakdown = (calibration: RecommendationCalibrationReport): number => {
  const evidenceValues = Object.values(calibration.scenarioBreakdown)
    .map((entry) => numericMetric((entry as ScenarioBreakdownMetrics).evidenceCompleteness))
    .filter((value): value is number => value !== null);

  return average(evidenceValues);
};

const buildRecommendations = (dimensions: ReadinessIndexReport["dimensions"]): string[] => {
  const recommendations: string[] = [];

  if (dimensions.benchmarkCoverage < 1) {
    recommendations.push("Increase evaluated scenario coverage so the readiness index is based on broader existing benchmark evidence.");
  }

  if (dimensions.recommendationCoverage < 1) {
    recommendations.push("Improve recommendation coverage by ensuring advisory evaluations include complete reasoning coverage evidence.");
  }

  if (dimensions.recommendationAgreement < 1) {
    recommendations.push("Review recommendation agreement against ranked ORC evidence before planning controlled integration tests.");
  }

  if (dimensions.traceability < 1) {
    recommendations.push("Improve traceability by preserving explicit advisory evidence links and observations in every evaluated scenario.");
  }

  if (dimensions.evidenceCompleteness < 1) {
    recommendations.push("Complete advisory evidence fields across evaluated scenarios to strengthen historical and CI comparisons.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Readiness evidence is complete across the available calibration dimensions; keep ORC in Shadow Mode until integration criteria are defined separately.");
  }

  return recommendations;
};

export function buildReadinessIndex(
  calibration: RecommendationCalibrationReport,
): ReadinessIndexReport {
  const dimensions: ReadinessIndexReport["dimensions"] = {
    benchmarkCoverage: roundReadinessMetric(calibration.metrics.recommendationAvailability),
    recommendationCoverage: roundReadinessMetric(calibration.metrics.recommendationCoverage),
    recommendationAgreement: roundReadinessMetric(calibration.metrics.topRecommendationAgreement),
    traceability: roundReadinessMetric(calibration.metrics.averageTraceability),
    evidenceCompleteness: roundReadinessMetric(
      calibration.metrics.averageEvidenceCompleteness ?? evidenceCompletenessFromBreakdown(calibration),
    ),
  };

  const readinessIndex = average(Object.values(dimensions));

  return deepFreeze({
    generatedAt: calibration.generatedAt,
    readinessIndex,
    dimensions,
    summary: `ORC-READINESS-INDEX-V1: evaluatedScenarios=${calibration.evaluatedScenarios}; readinessIndex=${readinessIndex}; shadowModeOnly=true.`,
    recommendations: buildRecommendations(dimensions),
  }) as ReadinessIndexReport;
}
