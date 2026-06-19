import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import type { EngineInput, EngineOutput } from "../../types";
import { generatePlanV3 } from "../../v3";
import { analyzeStrategicScenario } from "../analysis";
import { evaluateV4PlanQuality } from "../quality";
import type { V4ComparisonVerdict } from "../comparison";
import { generatePlanV4 } from "../index";
import { benchmarkScenarios } from "../../v3/benchmarks/scenarios";
import { calculateMetrics } from "../../v3/benchmarks/metrics";
import type { BenchmarkScenario } from "../../v3/benchmarks/types";
import type { V4StrategyProfile } from "../orchestrator";

export type BenchmarkEngine = "v3" | "v4";
export type V4BenchmarkProfile = "baseline" | V4StrategyProfile;

export interface V4BenchmarkMetrics {
  scenarioName: string;
  engine: BenchmarkEngine;
  profile: V4BenchmarkProfile;
  runtimeMs: number;
  plannedTasks: number;
  unplannedTasks: number;
  hardFeasible: boolean;
  qualityScore: number;
  mainFlowGapMinutes: number;
  makespan: string | null;
  makespanMinutes: number | null;
  totalTalentStayMinutes: number;
  selectedStrategy: string | null;
  accepted: boolean;
  fallbackToV3Baseline: boolean;
  verdict: V4ComparisonVerdict | "V3_BASELINE";
}

export interface V4BenchmarkScenarioSummary {
  scenario: string;
  v3: V4BenchmarkMetrics;
  v4Safe: V4BenchmarkMetrics;
  v4Balanced: V4BenchmarkMetrics;
  v4Aggressive?: V4BenchmarkMetrics;
  delta: {
    makespanMinutes: number | null;
    mainFlowGapMinutes: number;
    qualityScore: number;
    runtimeMs: number;
  };
  verdict: V4ComparisonVerdict;
  gate: RegressionGateResult;
}

export interface RegressionGateResult {
  passed: boolean;
  causes: string[];
}

export interface V4BenchmarkResult {
  mode: "quick" | "normal" | "strict";
  strict: boolean;
  maxRuntimeMs: number;
  scenarios: V4BenchmarkScenarioSummary[];
  generatedAt: string;
}

const DEFAULT_MAX_RUNTIME_MS = Number(process.env.V4_BENCHMARK_MAX_RUNTIME_MS ?? 12_000);
const QUICK_SCENARIO_ID = "L";

const toMinutes = (value?: string | null): number | null => {
  const [h, m] = String(value ?? "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

const scenarioKey = (scenario: BenchmarkScenario): string => scenario.name.replace(/\s+/g, "");

const selectedScenarios = (quick: boolean): BenchmarkScenario[] => {
  if (!quick) return benchmarkScenarios;
  return [benchmarkScenarios.find((scenario) => scenario.id === QUICK_SCENARIO_ID) ?? benchmarkScenarios[0]];
};

function summarizeOutput(scenario: BenchmarkScenario, engine: BenchmarkEngine, profile: V4BenchmarkProfile, output: EngineOutput, runtimeMs: number, v4Diagnostics?: ReturnType<typeof generatePlanV4>["diagnostics"]): V4BenchmarkMetrics {
  const strategic = analyzeStrategicScenario(scenario.input as EngineInput);
  const quality = evaluateV4PlanQuality(scenario.input as EngineInput, output, strategic);
  const metrics = calculateMetrics(scenario.input, output, runtimeMs);
  return {
    scenarioName: scenarioKey(scenario),
    engine,
    profile,
    runtimeMs,
    plannedTasks: metrics.plannedTasks,
    unplannedTasks: metrics.unplannedTasks,
    hardFeasible: output.hardFeasible !== false && metrics.hardConstraintViolations === 0,
    qualityScore: quality.qualityScore,
    mainFlowGapMinutes: quality.mainFlowQuality?.internalGapMinutes ?? metrics.mainStageGapMinutes ?? 0,
    makespan: quality.makespan.lastTaskEnd,
    makespanMinutes: quality.makespan.fromWorkDayStartMinutes ?? toMinutes(quality.makespan.lastTaskEnd),
    totalTalentStayMinutes: quality.talentStayTime.totalStayMinutes,
    selectedStrategy: v4Diagnostics?.bestStrategyId ?? metrics.solutionSource,
    accepted: v4Diagnostics?.finalAcceptance?.accepted ?? true,
    fallbackToV3Baseline: v4Diagnostics?.finalAcceptance?.fallbackToV3Baseline ?? false,
    verdict: v4Diagnostics?.v3V4Comparison.comparison?.verdict ?? "V3_BASELINE",
  };
}

function runV3Baseline(scenario: BenchmarkScenario): V4BenchmarkMetrics {
  const started = performance.now();
  const output = generatePlanV3(scenario.input, { timeLimitMs: 0, requestId: `v4-benchmark-v3-${scenario.id}` });
  return summarizeOutput(scenario, "v3", "baseline", output, Math.round(performance.now() - started));
}

function runV4Profile(scenario: BenchmarkScenario, profile: V4StrategyProfile, maxRuntimeMs: number): V4BenchmarkMetrics {
  const started = performance.now();
  try {
    const result = generatePlanV4(scenario.input as EngineInput, { timeLimitMs: 0, requestId: `v4-benchmark-${profile}-${scenario.id}`, v4Profile: profile, maxRuntimeMs } as any);
    return summarizeOutput(scenario, "v4", profile, result.output, Math.round(performance.now() - started), result.diagnostics);
  } catch (error) {
    const fallback = generatePlanV3(scenario.input, { timeLimitMs: 0, requestId: `v4-benchmark-${profile}-${scenario.id}-fallback` });
    return {
      ...summarizeOutput(scenario, "v4", profile, fallback, Math.round(performance.now() - started)),
      accepted: false,
      fallbackToV3Baseline: true,
      selectedStrategy: `error_fallback_to_v3: ${(error as Error).message}`,
      verdict: "V4_REJECTED",
    };
  }
}

export function evaluateRegressionGate(v3: V4BenchmarkMetrics, v4Balanced: V4BenchmarkMetrics, maxRuntimeMs = DEFAULT_MAX_RUNTIME_MS): RegressionGateResult {
  const causes: string[] = [];
  if (v4Balanced.unplannedTasks > v3.unplannedTasks) causes.push(`V4 balanced leaves more unplanned tasks (${v3.unplannedTasks} -> ${v4Balanced.unplannedTasks}).`);
  if (v3.hardFeasible && !v4Balanced.hardFeasible) causes.push("V4 balanced is not hard-feasible while V3 is hard-feasible.");
  if (v4Balanced.mainFlowGapMinutes > v3.mainFlowGapMinutes) causes.push(`V4 balanced worsens main-flow gaps (${v3.mainFlowGapMinutes} -> ${v4Balanced.mainFlowGapMinutes}).`);
  if (v4Balanced.runtimeMs > maxRuntimeMs) causes.push(`V4 balanced runtime ${v4Balanced.runtimeMs}ms exceeds limit ${maxRuntimeMs}ms.`);
  const improvesMakespan = v4Balanced.makespanMinutes !== null && v3.makespanMinutes !== null && v4Balanced.makespanMinutes < v3.makespanMinutes;
  const improvesQuality = v4Balanced.qualityScore > v3.qualityScore;
  if (!improvesMakespan && !improvesQuality && v4Balanced.verdict === "V4_BETTER") causes.push("V4 balanced verdict is V4_BETTER without improving makespan or qualityScore.");
  return { passed: causes.length === 0, causes };
}

function buildSummary(scenario: BenchmarkScenario, maxRuntimeMs: number): V4BenchmarkScenarioSummary {
  const v3 = runV3Baseline(scenario);
  const v4Safe = runV4Profile(scenario, "safe", maxRuntimeMs);
  const v4Balanced = runV4Profile(scenario, "balanced", maxRuntimeMs);
  const v4Aggressive = runV4Profile(scenario, "aggressive", maxRuntimeMs);
  const delta = {
    makespanMinutes: v4Balanced.makespanMinutes !== null && v3.makespanMinutes !== null ? v4Balanced.makespanMinutes - v3.makespanMinutes : null,
    mainFlowGapMinutes: v4Balanced.mainFlowGapMinutes - v3.mainFlowGapMinutes,
    qualityScore: v4Balanced.qualityScore - v3.qualityScore,
    runtimeMs: v4Balanced.runtimeMs - v3.runtimeMs,
  };
  const worse = v4Balanced.unplannedTasks > v3.unplannedTasks || v4Balanced.mainFlowGapMinutes > v3.mainFlowGapMinutes || (delta.makespanMinutes !== null && delta.makespanMinutes > 45 && delta.qualityScore <= 0);
  const better = v4Balanced.unplannedTasks <= v3.unplannedTasks && v4Balanced.mainFlowGapMinutes <= v3.mainFlowGapMinutes && ((delta.makespanMinutes !== null && delta.makespanMinutes < 0) || delta.qualityScore > 0);
  const verdict = v4Balanced.verdict === "V4_REJECTED" ? "V4_REJECTED" : worse ? "V4_WORSE" : better ? "V4_BETTER" : "V4_EQUAL";
  return { scenario: v3.scenarioName, v3, v4Safe, v4Balanced, v4Aggressive, delta, verdict, gate: evaluateRegressionGate(v3, v4Balanced, maxRuntimeMs) };
}

const printSummary = (result: V4BenchmarkResult): void => {
  console.log("V4 BENCHMARK SUMMARY");
  for (const item of result.scenarios) {
    console.log(`\nScenario: ${item.scenario}`);
    console.log(`V3 makespan: ${item.v3.makespan ?? "n/a"}`);
    console.log(`V4 balanced makespan: ${item.v4Balanced.makespan ?? "n/a"}`);
    console.log(`Main flow gaps: ${item.v3.mainFlowGapMinutes} -> ${item.v4Balanced.mainFlowGapMinutes}`);
    console.log(`Unplanned: ${item.v3.unplannedTasks} -> ${item.v4Balanced.unplannedTasks}`);
    console.log(`Talent stay total: ${item.v3.totalTalentStayMinutes} -> ${item.v4Balanced.totalTalentStayMinutes}`);
    console.log(`Runtime: ${item.v3.runtimeMs}ms -> ${item.v4Balanced.runtimeMs}ms`);
    console.log(`Verdict: ${item.verdict}`);
    console.log(`Selected strategy: ${item.v4Balanced.selectedStrategy ?? "n/a"}`);
    console.log(`Accepted: ${item.v4Balanced.accepted}`);
    if (!item.gate.passed) console.log(`Gate failures: ${item.gate.causes.join(" | ")}`);
  }
};

export function runV4Benchmark(args = process.argv.slice(2)): V4BenchmarkResult {
  const strict = args.includes("--strict");
  const quick = args.includes("--quick");
  const maxRuntimeMs = DEFAULT_MAX_RUNTIME_MS;
  const result: V4BenchmarkResult = { mode: strict ? "strict" : quick ? "quick" : "normal", strict, maxRuntimeMs, scenarios: selectedScenarios(quick).map((scenario) => buildSummary(scenario, maxRuntimeMs)), generatedAt: new Date().toISOString() };
  printSummary(result);
  try { writeFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "latest-result.json"), `${JSON.stringify(result, null, 2)}\n`); } catch (error) { console.warn(`Could not write latest-result.json: ${(error as Error).message}`); }
  if (strict) {
    const failures = result.scenarios.filter((scenario) => !scenario.gate.passed);
    if (failures.length > 0) {
      console.error(`\nV4 strict regression gate failed:\n${failures.map((failure) => `- ${failure.scenario}: ${failure.gate.causes.join("; ")}`).join("\n")}`);
      process.exitCode = 1;
    }
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) runV4Benchmark();
