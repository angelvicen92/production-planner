import assert from "node:assert/strict";
import test from "node:test";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { buildBaselineReport } from "./baselineReport";
import { GOLDEN_BENCHMARK_VERSION, runGoldenBenchmarkSuite } from "./goldenBenchmarkSuite";
import { goldenBenchmarkScenarios } from "./fixtures/goldenScenarios";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const sampleGoldenReport = () => runGoldenBenchmarkSuite([goldenBenchmarkScenarios[0]]);

test("buildBaselineReport summarizes the Golden Benchmark Suite without a previous baseline", () => {
  const goldenReport = sampleGoldenReport();
  const baseline = buildBaselineReport(goldenReport);

  assert.equal(baseline.benchmarkVersion, GOLDEN_BENCHMARK_VERSION);
  assert.equal(baseline.generatedAt, null);
  assert.equal(baseline.scenarios, goldenReport.scenariosExecuted);
  assert.equal(baseline.metrics.executionTimeMs, 0);
  assert.equal(baseline.metrics.opportunities, goldenReport.reports[0].opportunitiesDetected);
  assert.equal(baseline.metrics.searchSpaces, goldenReport.reports[0].searchSpacesGenerated);
  assert.equal(baseline.metrics.candidates, goldenReport.reports[0].candidatesGenerated);
  assert.equal(baseline.metrics.simulations, goldenReport.reports[0].simulatedStatesGenerated);
  assert.equal(baseline.metrics.validSimulations, goldenReport.reports[0].summary.metrics.validCount);
  assert.equal(baseline.metrics.invalidSimulations, goldenReport.reports[0].summary.metrics.invalidCount);
  assert.equal(baseline.metrics.validations, goldenReport.reports[0].validationResultsGenerated);
  assert.equal(baseline.metrics.operationalValues, goldenReport.reports[0].operationalValuesGenerated);
  assert.equal(baseline.metrics.averageOperationalScore, goldenReport.reports[0].summary.metrics.averageOverallScore);
  assert.equal(baseline.metrics.commits, goldenReport.reports[0].commitDecisionsGenerated);
  assert.deepEqual(baseline.metrics.reasoningBudgetConsumed, goldenReport.reports[0].reasoningBudgetConsumed);
  assert.equal(baseline.comparison, undefined);
});

test("buildBaselineReport compares every consolidated metric with a previous baseline", () => {
  const goldenReport = sampleGoldenReport();
  const previous = buildBaselineReport(goldenReport);
  const changedGoldenReport = clone(goldenReport);

  changedGoldenReport.scenariosExecuted += 1;
  changedGoldenReport.reports[0].executionTimeMs += 5;
  changedGoldenReport.reports[0].opportunitiesDetected += 1;
  changedGoldenReport.reports[0].searchSpacesGenerated += 1;
  changedGoldenReport.reports[0].candidatesGenerated += 1;
  changedGoldenReport.reports[0].simulatedStatesGenerated += 1;
  changedGoldenReport.reports[0].summary.metrics.validCount += 1;
  changedGoldenReport.reports[0].summary.metrics.invalidCount += 1;
  changedGoldenReport.reports[0].validationResultsGenerated += 1;
  changedGoldenReport.reports[0].operationalValuesGenerated += 1;
  changedGoldenReport.reports[0].summary.metrics.averageOverallScore += 1;
  changedGoldenReport.reports[0].commitDecisionsGenerated += 1;
  changedGoldenReport.reports[0].reasoningBudgetConsumed.consumedCandidates += 1;

  const baseline = buildBaselineReport(changedGoldenReport, previous);

  assert.equal(baseline.comparison?.baselineVersion, previous.benchmarkVersion);
  assert.deepEqual(Object.keys(baseline.comparison?.differences ?? {}), [
    "scenarios",
    "metrics.executionTimeMs",
    "metrics.opportunities",
    "metrics.searchSpaces",
    "metrics.candidates",
    "metrics.simulations",
    "metrics.validSimulations",
    "metrics.invalidSimulations",
    "metrics.validations",
    "metrics.operationalValues",
    "metrics.averageOperationalScore",
    "metrics.commits",
    "metrics.reasoningBudgetConsumed",
  ]);
});

test("buildBaselineReport comparison is empty when metrics are equal", () => {
  const previous = buildBaselineReport(sampleGoldenReport());
  const current = buildBaselineReport(sampleGoldenReport(), previous);

  assert.deepEqual(current.comparison, {
    baselineVersion: previous.benchmarkVersion,
    differences: {},
  });
});

test("buildBaselineReport is deterministic", () => {
  const goldenReport = runGoldenBenchmarkSuite(goldenBenchmarkScenarios);
  const first = buildBaselineReport(goldenReport);
  const second = buildBaselineReport(goldenReport);

  assert.equal(structuralEquals(first, second), true);
});

test("buildBaselineReport output is structurally JSON-serializable", () => {
  const baseline = buildBaselineReport(sampleGoldenReport());
  assert.deepEqual(JSON.parse(JSON.stringify(baseline)), baseline);
});

test("buildBaselineReport does not mutate current or previous reports", () => {
  const goldenReport = sampleGoldenReport();
  const previous = buildBaselineReport(goldenReport);
  const goldenBefore = stableStringify(goldenReport);
  const previousBefore = stableStringify(previous);

  buildBaselineReport(goldenReport, previous);

  assert.equal(stableStringify(goldenReport), goldenBefore);
  assert.equal(stableStringify(previous), previousBefore);
});
