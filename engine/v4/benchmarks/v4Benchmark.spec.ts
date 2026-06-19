import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRegressionGate, runV4Benchmark, type V4BenchmarkMetrics } from "./runV4Benchmark";
import { analyzeStrategicScenario } from "../analysis";
import { buildV4StrategyPortfolio, runV4CandidateStrategies } from "../candidates";
import { benchmarkScenarios } from "../../v3/benchmarks/scenarios";

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
  executedStrategies: ["strategy_v4_native_critical_core__balanced_hybrid"],
  missingMustRunStrategies: [],
  strategiesEvaluated: 0,
  strategiesSkipped: 0,
  runtimeBudgetExceeded: false,
  accepted: true,
  fallbackToV3Baseline: false,
  verdict: "V3_BASELINE",
  ...overrides,
});

test("V4 benchmark quick mode executes and returns comparable V3/V4 balanced results", () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalBudget = process.env.V4_BENCHMARK_MAX_RUNTIME_MS;
  process.env.V4_BENCHMARK_MAX_RUNTIME_MS = "3000";
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
    assert.equal(summary.v4Safe, undefined);
    assert.equal(summary.v4Aggressive, undefined);
    assert.equal(typeof summary.v3.plannedTasks, "number");
    assert.equal(typeof summary.v4Balanced.unplannedTasks, "number");
    assert.equal(typeof summary.v4Balanced.runtimeMs, "number");
    assert.equal(typeof summary.v4Balanced.qualityScore, "number");
    assert.ok("makespanMinutes" in summary.delta);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    if (originalBudget === undefined) delete process.env.V4_BENCHMARK_MAX_RUNTIME_MS; else process.env.V4_BENCHMARK_MAX_RUNTIME_MS = originalBudget;
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


test("V4 benchmark strict does not execute aggressive profile", () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalBudget = process.env.V4_BENCHMARK_MAX_RUNTIME_MS;
  process.env.V4_BENCHMARK_MAX_RUNTIME_MS = "3000";
  const originalExitCode = process.exitCode;
  console.log = () => undefined;
  console.warn = () => undefined;
  console.error = () => undefined;
  try {
    process.exitCode = undefined;
    const result = runV4Benchmark(["--strict"]);
    assert.equal(result.mode, "strict");
    assert.ok(result.scenarios.every((summary) => summary.v4Aggressive === undefined));
    assert.ok(result.scenarios.every((summary) => summary.v4Safe === undefined));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    process.exitCode = originalExitCode;
    if (originalBudget === undefined) delete process.env.V4_BENCHMARK_MAX_RUNTIME_MS; else process.env.V4_BENCHMARK_MAX_RUNTIME_MS = originalBudget;
  }
});

test("V4 benchmark aggressive profile only runs with aggressive flag", () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalBudget = process.env.V4_BENCHMARK_MAX_RUNTIME_MS;
  process.env.V4_BENCHMARK_MAX_RUNTIME_MS = "3000";
  console.log = () => undefined;
  console.warn = () => undefined;
  try {
    const normal = runV4Benchmark(["--quick"]);
    const aggressive = runV4Benchmark(["--quick", "--aggressive"]);
    assert.equal(normal.scenarios.some((summary) => summary.v4Aggressive), false);
    assert.equal(aggressive.mode, "aggressive");
    assert.equal(aggressive.scenarios.every((summary) => summary.v4Aggressive?.profile === "aggressive"), true);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    if (originalBudget === undefined) delete process.env.V4_BENCHMARK_MAX_RUNTIME_MS; else process.env.V4_BENCHMARK_MAX_RUNTIME_MS = originalBudget;
  }
});

test("strict regression gate fails with human runtime budget cause", () => {
  const v3 = metric();
  const v4 = metric({ engine: "v4", profile: "balanced", runtimeMs: 101, qualityScore: 81, verdict: "V4_BETTER" });
  const gate = evaluateRegressionGate(v3, v4, 100);
  assert.equal(gate.passed, false);
  assert.ok(gate.causes.includes("V4 balanced exceeded runtime budget"));
});

test("candidate runner records budget skips and portfolio keeps must-run within maxStrategies", () => {
  const variants = [{ id: "pressure_default" }, { id: "earliest_deadline_first" }, { id: "balanced_hybrid" }];
  const capped = buildV4StrategyPortfolio("balanced", ["strategy_baseline_v3_order", "strategy_v4_production_wave", "strategy_v4_native_critical_core"] as any, variants, { maxStrategies: 6 });
  assert.equal(capped.strategies.length, 4);
  assert.ok(capped.strategies.some((strategy) => strategy.startsWith("strategy_v4_native_critical_core")));
  assert.equal(capped.diagnostics.missingMustRunStrategies.length, 0);

  const scenario = benchmarkScenarios.find((item) => item.id === "A") ?? benchmarkScenarios[0];
  const input = scenario.input as any;
  const strategic = analyzeStrategicScenario(input);
  const budgeted = runV4CandidateStrategies(input, strategic, {
    v4Profile: "balanced" as any,
    enabledStrategies: ["strategy_baseline_v3_order", "strategy_v4_production_wave", "strategy_v4_native_critical_core"] as any,
    maxStrategies: 6,
    maxRuntimeMs: 1,
  } as any);
  assert.ok(budgeted.candidatesDiagnostics.candidates.some((candidate) => candidate.skipped && candidate.skipReason === "Runtime budget exceeded before strategy execution."));
  assert.equal(budgeted.candidatesDiagnostics.candidates.some((candidate) => candidate.strategyId === "strategy_v4_native_remainder"), false);
});

test("strategy portfolio calibrates profile-specific V4 candidates", () => {
  const variants = [{ id: "pressure_default" }, { id: "earliest_deadline_first" }, { id: "balanced_hybrid" }];
  const balanced = buildV4StrategyPortfolio("balanced", ["strategy_baseline_v3_order", "strategy_main_flow_guided", "strategy_critical_resources_first", "strategy_critical_talents_first", "strategy_v4_production_wave", "strategy_v4_native_critical_core", "strategy_v4_native_remainder"] as any, variants, { maxStrategies: 6 });
  assert.ok(balanced.strategies.some((strategy) => strategy.startsWith("strategy_v4_native_critical_core")));
  assert.equal(balanced.strategies.some((strategy) => strategy === "strategy_v4_native_remainder"), false);
  assert.equal(balanced.diagnostics.missingMustRunStrategies.length, 0);

  const safe = buildV4StrategyPortfolio("safe", ["strategy_baseline_v3_order", "strategy_main_flow_guided", "strategy_v4_production_wave", "strategy_v4_native_remainder"] as any, variants, {});
  assert.ok(safe.strategies.length <= 4);
  assert.equal(safe.strategies.some((strategy) => strategy === "strategy_v4_native_remainder"), false);

  const aggressive = buildV4StrategyPortfolio("aggressive", ["strategy_baseline_v3_order", "strategy_main_flow_guided", "strategy_critical_resources_first", "strategy_critical_talents_first", "strategy_v4_production_wave", "strategy_v4_native_critical_core", "strategy_v4_native_remainder"] as any, variants, {});
  assert.ok(aggressive.strategies.includes("strategy_v4_native_remainder"));
});

test("strict regression gate fails when balanced lacks native critical core", () => {
  const v3 = metric();
  const v4 = metric({ engine: "v4", profile: "balanced", executedStrategies: ["strategy_baseline_v3_order", "strategy_v4_production_wave__balanced_hybrid"] });
  const gate = evaluateRegressionGate(v3, v4, 100);
  assert.equal(gate.passed, false);
  assert.ok(gate.causes.includes("V4 balanced did not execute any native critical core strategy."));
});
