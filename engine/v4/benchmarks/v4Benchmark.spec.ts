import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRegressionGate, printEvidenceReport, runV4Benchmark, type V4BenchmarkMetrics, type V4BenchmarkScenarioSummary, type V4BenchmarkResult } from "./runV4Benchmark";
import { buildV4BenchmarkEvidenceReport } from "./evidenceReport";
import { analyzeStrategicScenario } from "../analysis";
import { buildV4StrategyPortfolio, runV4CandidateStrategies } from "../candidates";
import { benchmarkScenarios } from "../../v3/benchmarks/scenarios";
import { generatePlanV4 } from "../index";

import { canPlaceTaskAt, summarizeGapClosureBlocker, tryCloseMainFlowGaps } from "../nativeCriticalCoreScheduler";
import { evaluateV4PlanQuality } from "../quality";

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
  skippedStrategies: [],
  runtimeBudgetExceeded: false,
  finalAcceptanceReason: null,
  nativeCriticalCoreDiscarded: false,
  nativeCriticalCoreRejectionReason: null,
  nativeCriticalCoreRejectionDetails: null,
  candidateFutilityStopApplied: false,
  productionWaveDiscarded: false,
  improvementEngineApplied: false,
  improvementMovesAccepted: 0,
  accepted: true,
  fallbackToV3Baseline: false,
  earlyExitApplied: false,
  complexityLevel: null,
  verdict: "V3_BASELINE",
  ...overrides,
});


test("V4 benchmark smoke uses the small scenario A", () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => undefined;
  console.warn = () => undefined;
  try {
    const result = runV4Benchmark(["--smoke"]);
    assert.equal(result.mode, "smoke");
    assert.equal(result.scenarios.length, 1);
    assert.equal(result.scenarios[0].scenarioId, "A");
    assert.equal(result.scenarios[0].scenarioName, "Talent con salida temprana");
    assert.equal(result.scenarios[0].scenarioType, "smoke");
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
});

test("V4 benchmark quick and strict use representative scenario when realistic voice day exists", () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalExitCode = process.exitCode;
  console.log = () => undefined;
  console.warn = () => undefined;
  console.error = () => undefined;
  try {
    process.exitCode = undefined;
    const quick = runV4Benchmark(["--quick"]);
    const strict = runV4Benchmark(["--strict"]);
    assert.equal(benchmarkScenarios.some((scenario) => scenario.id === "L"), true);
    assert.equal(quick.scenarios[0].scenarioId, "L");
    assert.equal(strict.scenarios[0].scenarioId, "L");
    assert.equal(quick.scenarios[0].scenarioType, "representative");
    assert.equal(strict.scenarios[0].scenarioType, "representative");
    assert.notEqual(quick.scenarios[0].scenarioId, "A");
    assert.notEqual(strict.scenarios[0].scenarioId, "A");
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    process.exitCode = originalExitCode;
  }
});

test("simple scenarios activate V4 early exit and representative scenarios do not", () => {
  const simple = benchmarkScenarios.find((scenario) => scenario.id === "A")!;
  const representative = benchmarkScenarios.find((scenario) => scenario.id === "L")!;
  const simpleResult = generatePlanV4(simple.input as any, { v4Profile: "balanced" } as any);
  const representativeResult = generatePlanV4(representative.input as any, { v4Profile: "balanced", maxRuntimeMs: 2500, maxStrategies: 1 } as any);
  assert.equal(simpleResult.diagnostics.complexityAssessment?.level, "SIMPLE");
  assert.equal(simpleResult.diagnostics.earlyExit?.applied, true);
  assert.equal(simpleResult.diagnostics.candidateRunner.applied, false);
  assert.notEqual(representativeResult.diagnostics.complexityAssessment?.level, "SIMPLE");
  assert.equal(representativeResult.diagnostics.earlyExit?.applied, false);
  assert.notEqual(representativeResult.diagnostics.candidateRunner.candidates[0]?.skipReason, "Perfect baseline early accept.");
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
    assert.equal(summary.scenarioId, "L");
    assert.equal(summary.scenarioType, "representative");
    assert.equal(summary.scenarioName, "Jornada audiovisual anonimizada tipo La Voz");
    assert.equal(typeof summary.taskCount, "number");
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

const evidenceResult = (v4Overrides: Partial<V4BenchmarkMetrics> = {}, summaryOverrides: Partial<V4BenchmarkScenarioSummary> = {}): V4BenchmarkResult => {
  const v3 = metric();
  const v4 = metric({ engine: "v4", profile: "balanced", selectedStrategy: "strategy_v4_native_critical_core__balanced_hybrid", verdict: "V4_BETTER", ...v4Overrides });
  const delta = {
    makespanMinutes: v4.makespanMinutes !== null && v3.makespanMinutes !== null ? v4.makespanMinutes - v3.makespanMinutes : null,
    mainFlowGapMinutes: v4.mainFlowGapMinutes - v3.mainFlowGapMinutes,
    qualityScore: v4.qualityScore - v3.qualityScore,
    runtimeMs: v4.runtimeMs - v3.runtimeMs,
  };
  const summary: V4BenchmarkScenarioSummary = {
    scenario: "fixture",
    scenarioId: "L",
    scenarioName: "Fixture representative",
    scenarioType: "representative",
    taskCount: 120,
    v3,
    v4Balanced: v4,
    delta,
    verdict: v4.verdict === "V4_REJECTED" ? "V4_REJECTED" : delta.mainFlowGapMinutes > 0 ? "V4_WORSE" : delta.makespanMinutes !== null && delta.makespanMinutes > 45 ? "V4_WORSE" : v4.verdict as any,
    gate: evaluateRegressionGate(v3, v4, 100),
    gateMaxRuntimeMs: 100,
    ...summaryOverrides,
  };
  return { mode: "quick", strict: false, maxRuntimeMs: 100, scenarios: [summary], generatedAt: "2026-06-19T00:00:00.000Z", evidenceReport: [] };
};

test("evidence report identifies V4 better wins and next action", () => {
  const [report] = buildV4BenchmarkEvidenceReport(evidenceResult({ qualityScore: 90, makespanMinutes: 50, makespan: "09:50" }));
  assert.equal(report.verdict, "V4_BETTER");
  assert.ok(report.wins.some((win) => win.includes("Reduces makespan")));
  assert.equal(report.requiredNextAction, "Proceed to tuning: V4 beats V3 on continuity and makespan.");
});

test("evidence report diagnoses final acceptance fallback", () => {
  const [report] = buildV4BenchmarkEvidenceReport(evidenceResult({ accepted: false, fallbackToV3Baseline: true, verdict: "V4_REJECTED", finalAcceptanceReason: "V4 did not beat baseline safely." }));
  assert.ok(report.losses.includes("FALLBACK_TO_V3"));
  assert.equal(report.fallbackUsed, true);
  assert.ok(report.requiredNextAction.includes("final acceptance"));
});

test("evidence report diagnoses native critical core missing", () => {
  const [report] = buildV4BenchmarkEvidenceReport(evidenceResult({ executedStrategies: ["strategy_baseline_v3_order"], skippedStrategies: ["strategy_v4_native_critical_core__balanced_hybrid"] }));
  assert.ok(report.losses.includes("NATIVE_CORE_NOT_EXECUTED"));
  assert.equal(report.strategyDiagnosis.nativeCriticalCoreExecuted, false);
});

test("evidence report diagnoses native critical core discarded", () => {
  const [report] = buildV4BenchmarkEvidenceReport(evidenceResult({ nativeCriticalCoreDiscarded: true }));
  assert.ok(report.losses.includes("NATIVE_CORE_DISCARDED"));
  assert.equal(report.strategyDiagnosis.nativeCriticalCoreDiscarded, true);
});

test("evidence report generates specific action from native core rejection reason", () => {
  const [report] = buildV4BenchmarkEvidenceReport(evidenceResult({ nativeCriticalCoreDiscarded: true, nativeCriticalCoreRejectionReason: "MAIN_FLOW_GAP_NOT_IMPROVED" }));
  assert.equal(report.strategyDiagnosis.nativeCriticalCoreRejectionReason, "MAIN_FLOW_GAP_NOT_IMPROVED");
  assert.equal(report.requiredNextAction, "Native Critical Core ran but did not reduce main-flow gaps. Tune core placement around main-flow continuity.");
});

test("evidence report diagnoses runtime too slow", () => {
  const [report] = buildV4BenchmarkEvidenceReport(evidenceResult({ runtimeMs: 200, runtimeBudgetExceeded: true }));
  assert.ok(report.losses.includes("RUNTIME_TOO_SLOW"));
  assert.ok(report.mainReason.includes("runtime"));
});

test("evidence report diagnoses makespan worse", () => {
  const [report] = buildV4BenchmarkEvidenceReport(evidenceResult({ makespanMinutes: 130, makespan: "10:30", qualityScore: 80 }, { verdict: "V4_WORSE" }));
  assert.ok(report.losses.includes("MAKESPAN_WORSE"));
  assert.ok(report.mainReason.includes("makespan"));
});

test("evidence report diagnoses main flow gap worse", () => {
  const [report] = buildV4BenchmarkEvidenceReport(evidenceResult({ mainFlowGapMinutes: 25 }, { verdict: "V4_WORSE" }));
  assert.ok(report.losses.includes("MAIN_FLOW_GAP_WORSE"));
  assert.ok(report.requiredNextAction.includes("Production Wave"));
});

test("evidence report classifies simple scenario early exit as no-action", () => {
  const [report] = buildV4BenchmarkEvidenceReport(evidenceResult({ accepted: false, fallbackToV3Baseline: true, earlyExitApplied: true, complexityLevel: "SIMPLE", verdict: "V4_REJECTED", finalAcceptanceReason: "Simple scenario: V4 strategic overhead not justified.", executedStrategies: [] }));
  assert.deepEqual(report.losses, ["SIMPLE_SCENARIO_EARLY_EXIT"]);
  assert.equal(report.scenarioId, "L");
  assert.equal(report.scenarioType, "representative");
  assert.equal(report.requiredNextAction, "No action: smoke early exit correctly used V3 fallback.");
});


test("evidence report serializes scenario identity and representative rejection action", () => {
  const [report] = buildV4BenchmarkEvidenceReport(evidenceResult({ accepted: false, fallbackToV3Baseline: true, verdict: "V4_REJECTED", finalAcceptanceReason: "V4 did not beat baseline safely." }));
  assert.equal(report.scenarioId, "L");
  assert.equal(report.scenarioName, "Fixture representative");
  assert.equal(report.scenarioType, "representative");
  assert.ok(report.requiredNextAction.startsWith("Representative V4 rejected:"));
});

test("evidence report differentiates representative V4 worse action", () => {
  const [report] = buildV4BenchmarkEvidenceReport(evidenceResult({ makespanMinutes: 130, makespan: "10:30", qualityScore: 80 }, { verdict: "V4_WORSE" }));
  assert.ok(report.requiredNextAction.startsWith("Representative V4 worse:"));
});


test("PULL_SEGMENT_AFTER_GAP skips non-main-flow rows and finds next main-flow segment", () => {
  const input: any = {
    planId: 1,
    workDay: { start: "09:00", end: "11:00" },
    tasks: [
      { id: 1, planId: 1, templateId: 1, status: "pending", spaceId: 1, durationOverrideMin: 10 },
      { id: 2, planId: 1, templateId: 2, status: "pending", spaceId: 2, durationOverrideMin: 10 },
      { id: 3, planId: 1, templateId: 3, status: "pending", spaceId: 1, durationOverrideMin: 10 },
    ],
  };
  const output: any = { plannedTasks: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResources: [] },
    { taskId: 2, startPlanned: "09:20", endPlanned: "09:30", assignedResources: [] },
    { taskId: 3, startPlanned: "09:30", endPlanned: "09:40", assignedResources: [] },
  ], unplanned: [], hardFeasible: true };
  const strategic: any = { mainFlow: { id: 1 }, criticalResources: [], criticalTalents: [], continuousSpaces: [] };
  const quality = evaluateV4PlanQuality(input, output, strategic);
  const result = tryCloseMainFlowGaps(input, output, strategic, quality, { totalGapMinutes: 10, gaps: [{ start: 550, end: 560, durationMinutes: 10, previousTaskId: 1, nextTaskId: null, candidateTaskIds: [], blockingReasons: [] }] } as any, Date.now(), 1000);
  const segmentAttempt = result.attempts.find((attempt) => attempt.operation === "PULL_SEGMENT_AFTER_GAP");
  assert.equal(segmentAttempt?.success, true);
  assert.deepEqual(segmentAttempt?.movedTaskIds, [3]);
  assert.equal(result.segmentSearch.mainFlowRowsAfterGap, 1);
  assert.equal(result.segmentSearch.segmentCandidates, 1);
});


test("flowOrder ranks same-fit alternatives before later strategic tasks", () => {
  const input: any = { planId: 1, workDay: { start: "09:00", end: "11:00" }, tasks: [
    { id: 1, planId: 1, templateId: 1, status: "pending", spaceId: 1, contestantId: 1, durationOverrideMin: 10 },
    { id: 4, planId: 1, templateId: 4, status: "done", spaceId: 1, contestantId: 4, durationOverrideMin: 5 },
    { id: 2, planId: 1, templateId: 2, status: "pending", spaceId: 1, contestantId: 20, durationOverrideMin: 10 },
    { id: 3, planId: 1, templateId: 3, status: "pending", spaceId: 1, contestantId: 10, durationOverrideMin: 10 },
  ] };
  const output: any = { plannedTasks: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResources: [] },
    { taskId: 4, startPlanned: "09:20", endPlanned: "09:25", assignedResources: [] },
    { taskId: 2, startPlanned: "09:25", endPlanned: "09:35", assignedResources: [] },
    { taskId: 3, startPlanned: "09:35", endPlanned: "09:45", assignedResources: [] },
  ], unplanned: [], hardFeasible: true };
  const strategic: any = { mainFlow: { id: 1 }, mainFlowSequence: [{ talentId: 10 }, { talentId: 20 }], criticalResources: [], criticalTalents: [], continuousSpaces: [] };
  const quality = evaluateV4PlanQuality(input, output, strategic);
  const result = tryCloseMainFlowGaps(input, output, strategic, quality, { totalGapMinutes: 10, gaps: [{ start: 550, end: 560, durationMinutes: 10, previousTaskId: 1, nextTaskId: null, candidateTaskIds: [], blockingReasons: [] }] } as any, Date.now(), 1000);
  const alternativeAttempt = result.attempts.find((attempt) => attempt.operation === "INSERT_ALTERNATIVE_MAIN_FLOW_TASK" && attempt.success);
  assert.deepEqual(alternativeAttempt?.movedTaskIds, [3]);
  assert.equal(result.alternativeSearch.alternativesFound, 2);
});

test("exact-fit alternatives are tried before shorter alternatives", () => {
  const input: any = { planId: 1, workDay: { start: "09:00", end: "11:00" }, tasks: [
    { id: 1, planId: 1, templateId: 1, status: "pending", spaceId: 1, contestantId: 1, durationOverrideMin: 10 },
    { id: 4, planId: 1, templateId: 4, status: "done", spaceId: 1, contestantId: 4, durationOverrideMin: 5 },
    { id: 2, planId: 1, templateId: 2, status: "pending", spaceId: 1, contestantId: 10, durationOverrideMin: 5 },
    { id: 3, planId: 1, templateId: 3, status: "pending", spaceId: 1, contestantId: 20, durationOverrideMin: 10 },
  ] };
  const output: any = { plannedTasks: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResources: [] },
    { taskId: 4, startPlanned: "09:20", endPlanned: "09:25", assignedResources: [] },
    { taskId: 2, startPlanned: "09:25", endPlanned: "09:30", assignedResources: [] },
    { taskId: 3, startPlanned: "09:30", endPlanned: "09:40", assignedResources: [] },
  ], unplanned: [], hardFeasible: true };
  const strategic: any = { mainFlow: { id: 1 }, mainFlowSequence: [{ talentId: 10 }, { talentId: 20 }], criticalResources: [], criticalTalents: [], continuousSpaces: [] };
  const quality = evaluateV4PlanQuality(input, output, strategic);
  const result = tryCloseMainFlowGaps(input, output, strategic, quality, { totalGapMinutes: 10, gaps: [{ start: 550, end: 560, durationMinutes: 10, previousTaskId: 1, nextTaskId: null, candidateTaskIds: [], blockingReasons: [] }] } as any, Date.now(), 1000);
  const alternativeAttempt = result.attempts.find((attempt) => attempt.operation === "INSERT_ALTERNATIVE_MAIN_FLOW_TASK" && attempt.success);
  assert.deepEqual(alternativeAttempt?.movedTaskIds, [3]);
});

test("PULL_SEGMENT_AFTER_GAP does not include done, in-progress or locked tasks", () => {
  for (const protectedPatch of [{ status: "done" }, { status: "in_progress" }, { status: "pending", lock: true }]) {
    const input: any = { planId: 1, workDay: { start: "09:00", end: "11:00" }, locks: protectedPatch.lock ? [{ id: 1, taskId: 3, lockedStart: "09:30", lockedEnd: "09:40" }] : [], tasks: [
      { id: 1, planId: 1, templateId: 1, status: "pending", spaceId: 1, durationOverrideMin: 10 },
      { id: 3, planId: 1, templateId: 3, ...protectedPatch, spaceId: 1, durationOverrideMin: 10 },
    ] };
    const output: any = { plannedTasks: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResources: [] },
      { taskId: 3, startPlanned: "09:30", endPlanned: "09:40", assignedResources: [] },
    ], unplanned: [], hardFeasible: true };
    const strategic: any = { mainFlow: { id: 1 }, mainFlowSequence: [], criticalResources: [], criticalTalents: [], continuousSpaces: [] };
    const quality = evaluateV4PlanQuality(input, output, strategic);
    const result = tryCloseMainFlowGaps(input, output, strategic, quality, { totalGapMinutes: 20, gaps: [{ start: 550, end: 570, durationMinutes: 20, previousTaskId: 1, nextTaskId: null, candidateTaskIds: [], blockingReasons: [] }] } as any, Date.now(), 1000);
    const segmentAttempt = result.attempts.find((attempt) => attempt.operation === "PULL_SEGMENT_AFTER_GAP");
    assert.notEqual(segmentAttempt?.success, true);
  }
});

test("canPlaceTaskAt rejects moving a task after an already planned dependent", () => {
  const input: any = {
    planId: 1,
    workDay: { start: "09:00", end: "11:00" },
    tasks: [
      { id: 1, planId: 1, templateId: 1, status: "pending", durationOverrideMin: 10 },
      { id: 2, planId: 1, templateId: 2, status: "pending", dependsOnTaskIds: [1], durationOverrideMin: 10 },
    ],
  };
  const output: any = { plannedTasks: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResources: [] },
    { taskId: 2, startPlanned: "09:10", endPlanned: "09:20", assignedResources: [] },
  ], unplanned: [], hardFeasible: true };
  const check = canPlaceTaskAt(input, output, 1, 560, 570);
  assert.equal(check.ok, false);
  if (!check.ok) assert.equal(check.reason, "Dependent would start too early");
});

test("summarizeGapClosureBlocker prioritizes concrete conflicts over generic messages", () => {
  const summary = summarizeGapClosureBlocker([
    { gapStart: "09:10", gapEnd: "09:20", previousTaskId: 1, nextTaskId: 2, operation: "PULL_NEXT_MAIN_FLOW_TASK_EARLIER", success: false, reason: "Candidate did not safely reduce gap", details: "Generic failure." },
    { gapStart: "09:10", gapEnd: "09:20", previousTaskId: 1, nextTaskId: 2, operation: "PULL_SEGMENT_AFTER_GAP", success: false, reason: "Talent conflict", details: "Talent has task 88 at 10:30-10:40." },
  ], []);
  assert.equal(summary.mainBlocker, "Talent conflict");
  assert.equal(summary.mainBlockerDetails, "Talent has task 88 at 10:30-10:40.");
});

test("evidence report prints gap targeting proof fields", () => {
  const [report] = buildV4BenchmarkEvidenceReport(evidenceResult({ nativeCriticalCoreGapTargeting: { applied: true, baselineGapMinutes: 10, candidateGapMinutes: 5, gapsTargeted: 1, gapsClosed: 1, mainBlocker: "Talent conflict", bestOperation: "PULL_SEGMENT_AFTER_GAP", segmentSearch: { mainFlowRowsAfterGap: 5, segmentCandidates: 2 }, alternativeSearch: { alternativesFound: 3, alternativesTried: 2 }, attempts: [] } as any }));
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (value?: unknown) => { lines.push(String(value)); };
  try { printEvidenceReport([report]); } finally { console.log = originalLog; }
  assert.ok(lines.includes("Gap targeting baseline: 10"));
  assert.ok(lines.includes("Gap targeting candidate: 5"));
  assert.ok(lines.includes("Main blocker: Talent conflict"));
  assert.ok(lines.includes("Best operation: PULL_SEGMENT_AFTER_GAP"));
  assert.ok(lines.includes("Segment candidates: 2"));
  assert.ok(lines.includes("Alternatives found: 3"));
  assert.ok(lines.includes("Alternatives tried: 2"));
});
