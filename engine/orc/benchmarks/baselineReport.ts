import type { ReasoningBudget } from "../cognitive/reasoningBudget";
import type { GoldenBenchmarkReport } from "./goldenBenchmarkSuite";
import { GOLDEN_BENCHMARK_VERSION } from "./goldenBenchmarkSuite";
import { roundBenchmarkMetric } from "./orcBenchmarkHarness";

export interface BaselineReport {
  benchmarkVersion: string;
  generatedAt: string | null;
  scenarios: number;

  metrics: {
    executionTimeMs: number;
    opportunities: number;
    searchSpaces: number;
    candidates: number;
    simulations: number;
    validSimulations: number;
    invalidSimulations: number;
    validations: number;
    operationalValues: number;
    averageOperationalScore: number;
    commits: number;
    reasoningBudgetConsumed: ReasoningBudget;
  };

  comparison?: {
    baselineVersion: string;
    differences: Record<string, unknown>;
  };
}

type BaselineMetricKey = keyof BaselineReport["metrics"];

const metricKeys = [
  "executionTimeMs",
  "opportunities",
  "searchSpaces",
  "candidates",
  "simulations",
  "validSimulations",
  "invalidSimulations",
  "validations",
  "operationalValues",
  "averageOperationalScore",
  "commits",
  "reasoningBudgetConsumed",
] as const satisfies readonly BaselineMetricKey[];

const emptyReasoningBudget = (): ReasoningBudget => ({
  maxOpportunities: 0,
  maxSearchSpaces: 0,
  maxCandidates: 0,
  maxSimulations: 0,
  consumedOpportunities: 0,
  consumedSearchSpaces: 0,
  consumedCandidates: 0,
  consumedSimulations: 0,
});

const sumReasoningBudget = (report: GoldenBenchmarkReport): ReasoningBudget => report.reports.reduce<ReasoningBudget>(
  (total, benchmark) => ({
    maxOpportunities: total.maxOpportunities + benchmark.reasoningBudgetConsumed.maxOpportunities,
    maxSearchSpaces: total.maxSearchSpaces + benchmark.reasoningBudgetConsumed.maxSearchSpaces,
    maxCandidates: total.maxCandidates + benchmark.reasoningBudgetConsumed.maxCandidates,
    maxSimulations: total.maxSimulations + benchmark.reasoningBudgetConsumed.maxSimulations,
    consumedOpportunities: total.consumedOpportunities + benchmark.reasoningBudgetConsumed.consumedOpportunities,
    consumedSearchSpaces: total.consumedSearchSpaces + benchmark.reasoningBudgetConsumed.consumedSearchSpaces,
    consumedCandidates: total.consumedCandidates + benchmark.reasoningBudgetConsumed.consumedCandidates,
    consumedSimulations: total.consumedSimulations + benchmark.reasoningBudgetConsumed.consumedSimulations,
  }),
  emptyReasoningBudget(),
);

const sumReportMetric = (report: GoldenBenchmarkReport, metric: (report: GoldenBenchmarkReport["reports"][number]) => number): number => (
  roundBenchmarkMetric(report.reports.reduce((sum, benchmark) => sum + metric(benchmark), 0))
);

const summaryMetric = (benchmark: GoldenBenchmarkReport["reports"][number], key: string): number => {
  const value = (benchmark.summary.metrics as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const averageReportMetric = (report: GoldenBenchmarkReport, metric: (report: GoldenBenchmarkReport["reports"][number]) => number): number => {
  if (report.reports.length === 0) return 0;
  return roundBenchmarkMetric(report.reports.reduce((sum, benchmark) => sum + metric(benchmark), 0) / report.reports.length);
};

const compareValues = (before: unknown, after: unknown): unknown => {
  if (JSON.stringify(before) === JSON.stringify(after)) return undefined;
  return { before, after };
};

const compareMetrics = (
  previous: BaselineReport,
  current: BaselineReport,
): Record<string, unknown> => {
  const differences: Record<string, unknown> = {};

  const scenarioDifference = compareValues(previous.scenarios, current.scenarios);
  if (scenarioDifference !== undefined) differences.scenarios = scenarioDifference;

  for (const key of metricKeys) {
    const difference = compareValues(previous.metrics[key], current.metrics[key]);
    if (difference !== undefined) differences[`metrics.${key}`] = difference;
  }

  return differences;
};

export function buildBaselineReport(
  report: GoldenBenchmarkReport,
  previous?: BaselineReport,
): BaselineReport {
  const baselineReport: BaselineReport = {
    benchmarkVersion: GOLDEN_BENCHMARK_VERSION,
    generatedAt: null,
    scenarios: report.scenariosExecuted,
    metrics: {
      executionTimeMs: sumReportMetric(report, (benchmark) => benchmark.executionTimeMs),
      opportunities: sumReportMetric(report, (benchmark) => benchmark.opportunitiesDetected),
      searchSpaces: sumReportMetric(report, (benchmark) => benchmark.searchSpacesGenerated),
      candidates: sumReportMetric(report, (benchmark) => benchmark.candidatesGenerated),
      simulations: sumReportMetric(report, (benchmark) => benchmark.simulatedStatesGenerated),
      validSimulations: sumReportMetric(report, (benchmark) => summaryMetric(benchmark, "validCount")),
      invalidSimulations: sumReportMetric(report, (benchmark) => summaryMetric(benchmark, "invalidCount")),
      validations: sumReportMetric(report, (benchmark) => benchmark.validationResultsGenerated),
      operationalValues: sumReportMetric(report, (benchmark) => benchmark.operationalValuesGenerated),
      averageOperationalScore: averageReportMetric(report, (benchmark) => summaryMetric(benchmark, "averageOverallScore")),
      commits: sumReportMetric(report, (benchmark) => benchmark.commitDecisionsGenerated),
      reasoningBudgetConsumed: sumReasoningBudget(report),
    },
  };

  if (previous) {
    baselineReport.comparison = {
      baselineVersion: previous.benchmarkVersion,
      differences: compareMetrics(previous, baselineReport),
    };
  }

  return baselineReport;
}
