import assert from "node:assert/strict";
import test from "node:test";
import { stableStringify, structuralEquals } from "../structuralEquality";
import type { BaselineReport } from "./baselineReport";
import { buildBaselineReport } from "./baselineReport";
import { buildCalibrationReport } from "./calibrationFramework";
import { GOLDEN_BENCHMARK_VERSION, runGoldenBenchmarkSuite } from "./goldenBenchmarkSuite";
import { goldenBenchmarkScenarios } from "./fixtures/goldenScenarios";

const minimalBaseline = (): BaselineReport => ({
  benchmarkVersion: GOLDEN_BENCHMARK_VERSION,
  generatedAt: null,
  scenarios: 0,
  metrics: {
    executionTimeMs: 0,
    opportunities: 0,
    searchSpaces: 0,
    candidates: 0,
    simulations: 0,
    validSimulations: 0,
    invalidSimulations: 0,
    validations: 0,
    operationalValues: 0,
    averageOperationalScore: 0,
    commits: 0,
    reasoningBudgetConsumed: {
      maxOpportunities: 0,
      maxSearchSpaces: 0,
      maxCandidates: 0,
      maxSimulations: 0,
      consumedOpportunities: 0,
      consumedSearchSpaces: 0,
      consumedCandidates: 0,
      consumedSimulations: 0,
    },
  },
});

const completeBaseline = (): BaselineReport => ({
  ...minimalBaseline(),
  generatedAt: "2026-06-26T16:00:00.000Z",
  scenarios: 2,
  metrics: {
    ...minimalBaseline().metrics,
    opportunities: 6,
    searchSpaces: 3,
    candidates: 12,
    simulations: 24,
    validSimulations: 18,
    invalidSimulations: 6,
    validations: 24,
    operationalValues: 24,
    averageOperationalScore: 0.625,
    reasoningBudgetConsumed: {
      maxOpportunities: 10,
      maxSearchSpaces: 10,
      maxCandidates: 20,
      maxSimulations: 40,
      consumedOpportunities: 6,
      consumedSearchSpaces: 3,
      consumedCandidates: 12,
      consumedSimulations: 24,
    },
  },
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("buildCalibrationReport returns a safe minimum report", () => {
  const report = buildCalibrationReport(minimalBaseline());

  assert.equal(report.generatedAt, null);
  assert.equal(report.benchmarkVersion, `${GOLDEN_BENCHMARK_VERSION}:CALIBRATION-V1`);
  assert.deepEqual(report.quality, {
    opportunitiesPerSearchSpace: 0,
    candidatesPerSearchSpace: 0,
    simulationsPerCandidate: 0,
    validSimulationRate: 0,
    averageOperationalScore: 0,
    reasoningBudgetEfficiency: 0,
  });
  assert.deepEqual(report.recommendations, [
    "Review reasoning budget allocation: less than half of the available budget is consumed.",
    "Review simulation quality: fewer than 75% of simulations produce valid validation results.",
  ]);
});

test("buildCalibrationReport derives complete quality metrics from a BaselineReport only", () => {
  const report = buildCalibrationReport(completeBaseline());

  assert.deepEqual(report.quality, {
    opportunitiesPerSearchSpace: 2,
    candidatesPerSearchSpace: 4,
    simulationsPerCandidate: 2,
    validSimulationRate: 0.75,
    averageOperationalScore: 0.625,
    reasoningBudgetEfficiency: 0.5625,
  });
  assert.deepEqual(report.recommendations, [
    "Review SearchSpace coverage: multiple opportunities converge into each SearchSpace on average.",
  ]);
});

test("buildCalibrationReport forwards baseline comparison metadata for future CI comparison", () => {
  const baseline = completeBaseline();
  baseline.comparison = {
    baselineVersion: "previous-baseline",
    differences: { "metrics.candidates": { before: 8, after: 12 } },
  };

  const report = buildCalibrationReport(baseline);

  assert.deepEqual(report.comparison, baseline.comparison);
});

test("buildCalibrationReport is deterministic for generated baseline reports", () => {
  const goldenReport = runGoldenBenchmarkSuite(goldenBenchmarkScenarios);
  const baseline = buildBaselineReport(goldenReport);

  const first = buildCalibrationReport(baseline);
  const second = buildCalibrationReport(baseline);

  assert.equal(structuralEquals(first, second), true);
});

test("buildCalibrationReport output is structurally JSON-serializable", () => {
  const report = buildCalibrationReport(completeBaseline());

  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});

test("buildCalibrationReport does not mutate the baseline report", () => {
  const baseline = completeBaseline();
  const before = stableStringify(clone(baseline));

  buildCalibrationReport(baseline);

  assert.equal(stableStringify(baseline), before);
});
