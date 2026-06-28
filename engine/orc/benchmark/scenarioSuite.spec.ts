import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { productionBenchmarkScenarios } from "./scenarios";
import { OFFICIAL_OPERATIONAL_METRICS, runOperationalDeltaBenchmark } from "./operationalDeltaBenchmark";
import { PRODUCTION_SCENARIO_BENCHMARK_CREATED_AT, PRODUCTION_SCENARIO_BENCHMARK_SUITE_VERSION, runProductionScenarioBenchmark, runProductionScenarioBenchmarkSuite } from "./scenarioSuite";

const officialMetricKeys = [...OFFICIAL_OPERATIONAL_METRICS].sort();

test("Production Scenario Benchmark Suite executes the complete official battery", () => {
  const report = runProductionScenarioBenchmarkSuite({ v4RuntimeMs: 0, orcRuntimeMs: 0 });
  assert.equal(report.suiteVersion, PRODUCTION_SCENARIO_BENCHMARK_SUITE_VERSION);
  assert.equal(report.generatedAt, PRODUCTION_SCENARIO_BENCHMARK_CREATED_AT);
  assert.equal(report.scenarioCount, 10);
  assert.equal(report.passedCount, 10);
  assert.equal(report.failedCount, 0);
  assert.deepEqual(report.results.map((result) => result.scenario.id), productionBenchmarkScenarios.map((scenario) => scenario.id));
  for (const result of report.results) {
    assert.equal(result.status, "passed");
    assert.ok(result.report);
    assert.deepEqual(Object.keys(result.report.metrics.orc).sort(), officialMetricKeys);
    assert.deepEqual(Object.keys(result.report.metrics.v4).sort(), officialMetricKeys);
    assert.equal(result.report.improvementReport.planningInfluence, "none");
  }
});

test("Production Scenario Benchmark Suite executes one scenario", () => {
  const result = runProductionScenarioBenchmark("simple-day", { createdAt: null, v4RuntimeMs: 1, orcRuntimeMs: 1 });
  assert.equal(result.scenario.id, "simple-day");
  assert.equal(result.status, "passed");
  assert.equal(result.report?.scenario.taskCount, 2);
});

test("Production Scenario Benchmark Suite isolates a failing scenario", () => {
  const report = runProductionScenarioBenchmarkSuite({
    scenarioIds: ["simple-day", "complex-day"],
    continueOnFailure: true,
    runner: (input: EngineInput, options, scenario) => {
      if (scenario.id === "simple-day") throw new Error("isolated failure");
      return runOperationalDeltaBenchmark(input, options);
    },
  });
  assert.equal(report.scenarioCount, 2);
  assert.equal(report.failedCount, 1);
  assert.equal(report.passedCount, 1);
  assert.equal(report.results[0].error, "isolated failure");
  assert.equal(report.results[1].status, "passed");
});

test("Production Scenario Benchmark Suite is deterministic", () => {
  const options = { createdAt: "2026-06-28T10:00:00.000Z", v4RuntimeMs: 0, orcRuntimeMs: 0 };
  const a = runProductionScenarioBenchmarkSuite(options);
  const b = runProductionScenarioBenchmarkSuite(options);
  assert.equal(structuralEquals(a, b), true);
});

test("Production Scenario Benchmark Suite serializes cleanly", () => {
  const report = runProductionScenarioBenchmarkSuite({ scenarioIds: ["initial-planning"], createdAt: null });
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  assert.equal(report.globalSummary.officialMetricsOnly, true);
});

test("Production Scenario Benchmark Suite does not mutate scenario inputs", () => {
  const before = productionBenchmarkScenarios.map((scenario) => stableStringify(scenario.input));
  const report = runProductionScenarioBenchmarkSuite({ scenarioIds: ["multiple-locks", "multiple-any-of"], createdAt: null });
  assert.equal(report.results.every((result) => result.inputUnchanged), true);
  assert.deepEqual(productionBenchmarkScenarios.map((scenario) => stableStringify(scenario.input)), before);
});
