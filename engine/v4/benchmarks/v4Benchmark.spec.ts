import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRegressionGate, runV4Benchmark, type V4BenchmarkMetrics } from "./runV4Benchmark";

const metric = (overrides: Partial<V4BenchmarkMetrics> = {}): V4BenchmarkMetrics => ({
  scenarioName: "fixture",
  engine: "v3",
  profile: "baseline",
  runtimeMs: 10,
  plannedTasks: 2,
  unplannedTasks: 0,
  hardFeasible: true,
  qualityScore: 80,
  mainFlowGapMinutes: 0,
  makespan: "10:00",
  makespanMinutes: 60,
  totalTalentStayMinutes: 120,
  selectedStrategy: null,
  accepted: true,
  fallbackToV3Baseline: false,
  verdict: "V3_BASELINE",
  ...overrides,
});

test("V4 benchmark quick mode executes and returns comparable V3/V4 balanced results", () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => undefined;
  console.warn = () => undefined;
  try {
    const result = runV4Benchmark(["--quick"]);
    assert.equal(result.mode, "quick");
    assert.ok(result.scenarios.length >= 1);
    const [summary] = result.scenarios;
    assert.equal(summary.v3.engine, "v3");
    assert.equal(summary.v4Balanced.engine, "v4");
    assert.equal(summary.v4Balanced.profile, "balanced");
    assert.equal(typeof summary.v3.plannedTasks, "number");
    assert.equal(typeof summary.v4Balanced.unplannedTasks, "number");
    assert.equal(typeof summary.v4Balanced.runtimeMs, "number");
    assert.equal(typeof summary.v4Balanced.qualityScore, "number");
    assert.ok("makespanMinutes" in summary.delta);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
});

test("strict regression gate passes equivalent safe fixture", () => {
  const v3 = metric();
  const v4 = metric({ engine: "v4", profile: "balanced", runtimeMs: 20, qualityScore: 81, verdict: "V4_BETTER" });
  assert.deepEqual(evaluateRegressionGate(v3, v4, 100), { passed: true, causes: [] });
});

test("strict regression gate reports human causes for regressions", () => {
  const v3 = metric();
  const v4 = metric({ engine: "v4", profile: "balanced", unplannedTasks: 1, hardFeasible: false, mainFlowGapMinutes: 10, runtimeMs: 200, verdict: "V4_BETTER" });
  const gate = evaluateRegressionGate(v3, v4, 100);
  assert.equal(gate.passed, false);
  assert.ok(gate.causes.some((cause) => cause.includes("unplanned")));
  assert.ok(gate.causes.some((cause) => cause.includes("hard-feasible")));
  assert.ok(gate.causes.some((cause) => cause.includes("main-flow")));
  assert.ok(gate.causes.some((cause) => cause.includes("runtime")));
  assert.ok(gate.causes.some((cause) => cause.includes("without improving makespan or qualityScore")));
});
