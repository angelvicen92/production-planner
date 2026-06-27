import assert from "node:assert/strict";
import test from "node:test";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { compareGoldenBenchmarkReports, runGoldenBenchmarkSuite } from "./goldenBenchmarkSuite";
import { goldenBenchmarkScenarios } from "./fixtures/goldenScenarios";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("runGoldenBenchmarkSuite supports an empty suite", () => {
  const report = runGoldenBenchmarkSuite([]);
  assert.equal(report.scenariosExecuted, 0);
  assert.deepEqual(report.reports, []);
  assert.deepEqual(report.summary, {
    averageExecutionTimeMs: 0,
    averageCandidates: 0,
    averageSearchSpaces: 0,
    averageSimulations: 0,
  });
});

test("runGoldenBenchmarkSuite executes one scenario", () => {
  const report = runGoldenBenchmarkSuite([goldenBenchmarkScenarios[0]]);
  assert.equal(report.scenariosExecuted, 1);
  assert.equal(report.reports.length, 1);
  assert.ok(report.reports[0].opportunitiesDetected > 0);
  assert.equal(report.summary.averageCandidates, report.reports[0].candidatesGenerated);
  assert.equal(report.summary.averageSearchSpaces, report.reports[0].searchSpacesGenerated);
});

test("runGoldenBenchmarkSuite executes multiple scenarios and aggregates metrics", () => {
  const report = runGoldenBenchmarkSuite(goldenBenchmarkScenarios);
  const expectedAverageCandidates = report.reports.reduce((sum, item) => sum + item.candidatesGenerated, 0) / report.reports.length;
  assert.equal(report.scenariosExecuted, goldenBenchmarkScenarios.length);
  assert.equal(report.reports.length, goldenBenchmarkScenarios.length);
  assert.equal(report.summary.averageCandidates, expectedAverageCandidates);
});

test("compareGoldenBenchmarkReports detects structural differences only", () => {
  const baseline = runGoldenBenchmarkSuite([goldenBenchmarkScenarios[0]]);
  const changed = clone(baseline);
  changed.reports[0].candidatesGenerated += 1;
  changed.summary.averageCandidates += 1;

  const comparison = compareGoldenBenchmarkReports(baseline, changed);
  assert.equal(comparison.equal, false);
  assert.ok(comparison.differences.some((difference) => difference.path === "reports.0.candidatesGenerated"));
  assert.ok(comparison.differences.some((difference) => difference.path === "summary.averageCandidates"));
  assert.equal(comparison.summary.differencesDetected, comparison.differences.length);
});

test("runGoldenBenchmarkSuite is deterministic", () => {
  const first = runGoldenBenchmarkSuite(goldenBenchmarkScenarios);
  const second = runGoldenBenchmarkSuite(goldenBenchmarkScenarios);
  assert.equal(structuralEquals(first, second), true);
});

test("compareGoldenBenchmarkReports reports structural equality", () => {
  const first = runGoldenBenchmarkSuite(goldenBenchmarkScenarios);
  const second = runGoldenBenchmarkSuite(goldenBenchmarkScenarios);
  const comparison = compareGoldenBenchmarkReports(first, second);
  assert.equal(comparison.equal, true);
  assert.deepEqual(comparison.differences, []);
});

test("runGoldenBenchmarkSuite does not mutate scenarios", () => {
  const scenarios = clone(goldenBenchmarkScenarios);
  const before = stableStringify(scenarios);
  runGoldenBenchmarkSuite(scenarios);
  assert.equal(stableStringify(scenarios), before);
});


test("runGoldenBenchmarkSuite includes real production scenarios only when requested", () => {
  const goldenOnly = runGoldenBenchmarkSuite(goldenBenchmarkScenarios);
  const withReal = runGoldenBenchmarkSuite(goldenBenchmarkScenarios, { includeRealProductionScenarios: true });

  assert.equal(goldenOnly.scenariosExecuted, goldenBenchmarkScenarios.length);
  assert.ok(withReal.scenariosExecuted > goldenOnly.scenariosExecuted);
  assert.equal(withReal.reports.length, withReal.scenariosExecuted);
});
