import type { EngineInput } from "../../types";
import type { ORCBenchmarkResult } from "./orcBenchmarkHarness";
import { ORC_BENCHMARK_VERSION, roundBenchmarkMetric, runORCBenchmark } from "./orcBenchmarkHarness";

export const GOLDEN_BENCHMARK_VERSION = `${ORC_BENCHMARK_VERSION}:GOLDEN-SUITE-V1`;

export interface GoldenBenchmarkScenario {
  id: string;
  name: string;
  description: string;
  input: EngineInput;
}

export interface GoldenBenchmarkReport {
  scenariosExecuted: number;
  reports: ORCBenchmarkResult[];
  summary: {
    averageExecutionTimeMs: number;
    averageCandidates: number;
    averageSearchSpaces: number;
    averageSimulations: number;
  };
}

export interface GoldenBenchmarkDifference {
  path: string;
  before: unknown;
  after: unknown;
}

export interface GoldenBenchmarkComparisonReport {
  equal: boolean;
  differences: GoldenBenchmarkDifference[];
  scenariosCompared: number;
  summary: {
    differencesDetected: number;
  };
}

const average = (reports: ORCBenchmarkResult[], metric: (report: ORCBenchmarkResult) => number): number => {
  if (reports.length === 0) return 0;
  return roundBenchmarkMetric(reports.reduce((sum, report) => sum + metric(report), 0) / reports.length);
};

export function runGoldenBenchmarkSuite(
  scenarios: GoldenBenchmarkScenario[],
): GoldenBenchmarkReport {
  const reports = scenarios.map((scenario) => runORCBenchmark(scenario.input, { createdAt: null, executionTimeMs: 0 }));

  return {
    scenariosExecuted: scenarios.length,
    reports,
    summary: {
      averageExecutionTimeMs: average(reports, (report) => report.executionTimeMs),
      averageCandidates: average(reports, (report) => report.candidatesGenerated),
      averageSearchSpaces: average(reports, (report) => report.searchSpacesGenerated),
      averageSimulations: average(reports, (report) => report.simulatedStatesGenerated),
    },
  };
}

const metricPaths = [
  "scenariosExecuted",
  "summary.averageExecutionTimeMs",
  "summary.averageCandidates",
  "summary.averageSearchSpaces",
  "summary.averageSimulations",
  "reports.*.executionTimeMs",
  "reports.*.opportunitiesDetected",
  "reports.*.searchSpacesGenerated",
  "reports.*.candidatesGenerated",
  "reports.*.simulatedStatesGenerated",
  "reports.*.reasoningBudgetConsumed",
] as const;

const valueAt = (value: unknown, path: string): unknown => path.split(".").reduce<unknown>((current, segment) => {
  if (current === null || current === undefined || typeof current !== "object") return undefined;
  return (current as Record<string, unknown>)[segment];
}, value);

const addIfDifferent = (differences: GoldenBenchmarkDifference[], path: string, before: unknown, after: unknown): void => {
  if (JSON.stringify(before) !== JSON.stringify(after)) differences.push({ path, before, after });
};

export function compareGoldenBenchmarkReports(
  before: GoldenBenchmarkReport,
  after: GoldenBenchmarkReport,
): GoldenBenchmarkComparisonReport {
  const differences: GoldenBenchmarkDifference[] = [];

  for (const metricPath of metricPaths) {
    if (metricPath.startsWith("reports.*.")) {
      const reportMetric = metricPath.slice("reports.*.".length);
      const maxReports = Math.max(before.reports.length, after.reports.length);
      for (let index = 0; index < maxReports; index += 1) {
        addIfDifferent(
          differences,
          `reports.${index}.${reportMetric}`,
          valueAt(before.reports[index], reportMetric),
          valueAt(after.reports[index], reportMetric),
        );
      }
    } else {
      addIfDifferent(differences, metricPath, valueAt(before, metricPath), valueAt(after, metricPath));
    }
  }

  return {
    equal: differences.length === 0,
    differences,
    scenariosCompared: Math.min(before.scenariosExecuted, after.scenariosExecuted),
    summary: { differencesDetected: differences.length },
  };
}
