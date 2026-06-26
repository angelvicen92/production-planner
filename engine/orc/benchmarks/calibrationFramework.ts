import type { BaselineReport } from "./baselineReport";
import { roundBenchmarkMetric } from "./orcBenchmarkHarness";

export interface CalibrationReport {
  generatedAt: string | null;

  benchmarkVersion: string;

  quality: {
    opportunitiesPerSearchSpace: number;
    candidatesPerSearchSpace: number;
    simulationsPerCandidate: number;
    validSimulationRate: number;
    averageOperationalScore: number;
    reasoningBudgetEfficiency: number;
  };

  recommendations: string[];

  comparison?: Record<string, unknown>;
}

const safeRatio = (numerator: number, denominator: number): number => {
  if (denominator === 0) return 0;
  return roundBenchmarkMetric(numerator / denominator);
};

const consumedReasoningBudget = (baseline: BaselineReport): number => {
  const budget = baseline.metrics.reasoningBudgetConsumed;
  return budget.consumedOpportunities + budget.consumedSearchSpaces + budget.consumedCandidates + budget.consumedSimulations;
};

const maximumReasoningBudget = (baseline: BaselineReport): number => {
  const budget = baseline.metrics.reasoningBudgetConsumed;
  return budget.maxOpportunities + budget.maxSearchSpaces + budget.maxCandidates + budget.maxSimulations;
};

const buildRecommendations = (quality: CalibrationReport["quality"]): string[] => {
  const recommendations: string[] = [];

  if (quality.candidatesPerSearchSpace > 4) {
    recommendations.push("Review candidate generation breadth: candidates per SearchSpace exceed the calibration threshold.");
  }

  if (quality.opportunitiesPerSearchSpace > 1.5) {
    recommendations.push("Review SearchSpace coverage: multiple opportunities converge into each SearchSpace on average.");
  }

  if (quality.reasoningBudgetEfficiency < 0.5) {
    recommendations.push("Review reasoning budget allocation: less than half of the available budget is consumed.");
  }

  if (quality.validSimulationRate < 0.75) {
    recommendations.push("Review simulation quality: fewer than 75% of simulations produce valid validation results.");
  }

  if (recommendations.length === 0) {
    recommendations.push("No calibration alerts: baseline-derived reasoning metrics are within objective thresholds.");
  }

  return recommendations;
};

export function buildCalibrationReport(
  baseline: BaselineReport,
): CalibrationReport {
  const reasoningBudgetEfficiency = safeRatio(consumedReasoningBudget(baseline), maximumReasoningBudget(baseline));

  const quality: CalibrationReport["quality"] = {
    opportunitiesPerSearchSpace: safeRatio(baseline.metrics.opportunities, baseline.metrics.searchSpaces),
    candidatesPerSearchSpace: safeRatio(baseline.metrics.candidates, baseline.metrics.searchSpaces),
    simulationsPerCandidate: safeRatio(baseline.metrics.simulations, baseline.metrics.candidates),
    validSimulationRate: safeRatio(baseline.metrics.validSimulations, baseline.metrics.simulations),
    averageOperationalScore: baseline.metrics.averageOperationalScore,
    reasoningBudgetEfficiency,
  };

  const calibrationReport: CalibrationReport = {
    generatedAt: baseline.generatedAt,
    benchmarkVersion: `${baseline.benchmarkVersion}:CALIBRATION-V1`,
    quality,
    recommendations: buildRecommendations(quality),
  };

  if (baseline.comparison) {
    calibrationReport.comparison = {
      baselineVersion: baseline.comparison.baselineVersion,
      differences: baseline.comparison.differences,
    };
  }

  return calibrationReport;
}
