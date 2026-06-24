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
import { buildV4BenchmarkEvidenceReport, type V4BenchmarkEvidenceItem } from "./evidenceReport";

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
  executedStrategies: string[];
  missingMustRunStrategies: string[];
  strategiesEvaluated: number;
  strategiesSkipped: number;
  skippedStrategies: string[];
  runtimeBudgetExceeded: boolean;
  finalAcceptanceReason: string | null;
  nativeCriticalCoreDiscarded: boolean;
  nativeCriticalCoreRejectionReason: string | null;
  nativeCriticalCoreRejectionDetails: Record<string, unknown> | null;
  nativeCriticalCoreGapTargeting: Record<string, unknown> | null;
  candidateFutilityStopApplied: boolean;
  productionWaveDiscarded: boolean;
  improvementEngineApplied: boolean;
  improvementMovesAccepted: number;
  accepted: boolean;
  fallbackToV3Baseline: boolean;
  earlyExitApplied: boolean;
  complexityLevel: "SIMPLE" | "NORMAL" | "COMPLEX" | null;
  verdict: V4ComparisonVerdict | "V3_BASELINE";
}

export interface V4BenchmarkScenarioSummary {
  scenario: string;
  scenarioId: string;
  scenarioName: string;
  scenarioType: "smoke" | "representative" | "normal";
  taskCount: number;
  v3: V4BenchmarkMetrics;
  v4Safe?: V4BenchmarkMetrics;
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
  gateMaxRuntimeMs: number;
}

export interface RegressionGateResult {
  passed: boolean;
  causes: string[];
}

export interface V4BenchmarkResult {
  mode: "smoke" | "quick" | "normal" | "strict" | "aggressive";
  strict: boolean;
  maxRuntimeMs: number;
  scenarios: V4BenchmarkScenarioSummary[];
  generatedAt: string;
  evidenceReport: V4BenchmarkEvidenceItem[];
}

const MODE_MAX_RUNTIME_MS: Record<V4BenchmarkResult["mode"], number> = { smoke: 3000, quick: 8000, normal: 15000, strict: 10000, aggressive: 30000 };
const SMOKE_SCENARIO_ID = "A";
const REPRESENTATIVE_SCENARIO_IDS = ["L", "I"] as const;

const toMinutes = (value?: string | null): number | null => {
  const [h, m] = String(value ?? "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

const scenarioKey = (scenario: BenchmarkScenario): string => scenario.name.replace(/\s+/g, "");

const representativeScenario = (): BenchmarkScenario =>
  REPRESENTATIVE_SCENARIO_IDS.map((id) => benchmarkScenarios.find((scenario) => scenario.id === id)).find(Boolean)
  ?? benchmarkScenarios.find((scenario) => /realistic|realista|voz|voice/i.test(`${scenario.id} ${scenario.name} ${scenario.description ?? ""}`))
  ?? benchmarkScenarios.find((scenario) => scenario.id !== SMOKE_SCENARIO_ID)
  ?? benchmarkScenarios[0];

const smokeScenario = (): BenchmarkScenario => benchmarkScenarios.find((scenario) => scenario.id === SMOKE_SCENARIO_ID) ?? benchmarkScenarios[0];

const selectedScenarios = (mode: V4BenchmarkResult["mode"]): BenchmarkScenario[] => {
  if (mode === "smoke") return [smokeScenario()];
  if (mode === "normal") return benchmarkScenarios;
  return [representativeScenario()];
};

const hasRepresentativeScenario = (): boolean => REPRESENTATIVE_SCENARIO_IDS.some((id) => benchmarkScenarios.some((scenario) => scenario.id === id));

const scenarioType = (scenario: BenchmarkScenario, mode: V4BenchmarkResult["mode"]): V4BenchmarkScenarioSummary["scenarioType"] => {
  if (mode === "normal") return scenario.id === SMOKE_SCENARIO_ID ? "smoke" : REPRESENTATIVE_SCENARIO_IDS.includes(scenario.id as any) ? "representative" : "normal";
  if (scenario.id === SMOKE_SCENARIO_ID) return "smoke";
  return "representative";
};

function assertBenchmarkScenarioSelection(mode: V4BenchmarkResult["mode"], scenarios: BenchmarkScenario[]): void {
  if ((mode === "quick" || mode === "strict") && hasRepresentativeScenario() && scenarios.some((scenario) => scenario.id === SMOKE_SCENARIO_ID)) {
    throw new Error("V4 benchmark quick/strict selected smoke scenario A instead of representative scenario.");
  }
  if (mode === "aggressive" && hasRepresentativeScenario() && scenarios.some((scenario) => scenario.id === SMOKE_SCENARIO_ID)) {
    throw new Error("V4 benchmark aggressive selected smoke scenario A instead of representative scenario.");
  }
}

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
    executedStrategies: v4Diagnostics?.candidateRunner?.candidates?.filter((candidate: any) => !candidate.skipped).map((candidate: any) => candidate.strategyId) ?? [],
    missingMustRunStrategies: v4Diagnostics?.candidateRunner?.portfolio?.missingMustRunStrategies ?? [],
    skippedStrategies: v4Diagnostics?.candidateRunner?.candidates?.filter((candidate: any) => candidate.skipped).map((candidate: any) => candidate.strategyId) ?? [],
    strategiesEvaluated: v4Diagnostics?.candidateRunner?.candidates?.filter((candidate: any) => !candidate.skipped).length ?? 0,
    strategiesSkipped: v4Diagnostics?.candidateRunner?.candidates?.filter((candidate: any) => candidate.skipped).length ?? 0,
    runtimeBudgetExceeded: v4Diagnostics?.performance?.budgetExceeded ?? false,
    finalAcceptanceReason: v4Diagnostics?.finalAcceptance?.reason ?? null,
    nativeCriticalCoreDiscarded: v4Diagnostics?.candidateRunner?.candidates?.some((candidate: any) => candidate.nativeCriticalCoreScheduler?.discarded) ?? false,
    nativeCriticalCoreRejectionReason: v4Diagnostics?.candidateRunner?.candidates?.find((candidate: any) => candidate.nativeCriticalCoreScheduler?.rejectionReason)?.nativeCriticalCoreScheduler?.rejectionReason ?? null,
    nativeCriticalCoreRejectionDetails: v4Diagnostics?.candidateRunner?.candidates?.find((candidate: any) => candidate.nativeCriticalCoreScheduler?.rejectionDetails)?.nativeCriticalCoreScheduler?.rejectionDetails ?? null,
    nativeCriticalCoreGapTargeting: v4Diagnostics?.candidateRunner?.candidates?.find((candidate: any) => candidate.nativeCriticalCoreScheduler?.gapTargeting)?.nativeCriticalCoreScheduler?.gapTargeting ?? null,
    candidateFutilityStopApplied: v4Diagnostics?.candidateRunner?.futilityStop?.applied ?? false,
    productionWaveDiscarded: v4Diagnostics?.candidateRunner?.candidates?.some((candidate: any) => candidate.productionWaveScheduler?.discarded || candidate.productionWaveScheduler?.accepted === false) ?? false,
    improvementEngineApplied: v4Diagnostics?.improvementEngine?.applied ?? false,
    improvementMovesAccepted: v4Diagnostics?.improvementEngine?.movesAccepted ?? 0,
    accepted: v4Diagnostics?.finalAcceptance?.accepted ?? true,
    fallbackToV3Baseline: v4Diagnostics?.finalAcceptance?.fallbackToV3Baseline ?? false,
    earlyExitApplied: v4Diagnostics?.earlyExit?.applied ?? false,
    complexityLevel: v4Diagnostics?.complexityAssessment?.level ?? null,
    verdict: v4Diagnostics?.v3V4Comparison.comparison?.verdict ?? "V3_BASELINE",
  };
}

function runV3Baseline(scenario: BenchmarkScenario): V4BenchmarkMetrics {
  const started = performance.now();
  const output = generatePlanV3(scenario.input, { timeLimitMs: 0, requestId: `v4-benchmark-v3-${scenario.id}` });
  return summarizeOutput(scenario, "v3", "baseline", output, Math.round(performance.now() - started));
}

function runV4Profile(scenario: BenchmarkScenario, profile: V4StrategyProfile, maxRuntimeMs: number, extraOptions: Record<string, unknown> = {}): V4BenchmarkMetrics {
  const started = performance.now();
  try {
    const result = generatePlanV4(scenario.input as EngineInput, { timeLimitMs: 0, requestId: `v4-benchmark-${profile}-${scenario.id}`, v4Profile: profile, maxRuntimeMs, ...extraOptions } as any);
    return summarizeOutput(scenario, "v4", profile, result.output, Math.round(performance.now() - started), result.diagnostics);
  } catch (error) {
    const fallback = generatePlanV3(scenario.input, { timeLimitMs: 0, requestId: `v4-benchmark-${profile}-${scenario.id}-fallback` });
    return {
      ...summarizeOutput(scenario, "v4", profile, fallback, Math.round(performance.now() - started)),
      skippedStrategies: [],
      finalAcceptanceReason: (error as Error).message,
      nativeCriticalCoreDiscarded: false,
      nativeCriticalCoreRejectionReason: null,
      nativeCriticalCoreRejectionDetails: null,
      nativeCriticalCoreGapTargeting: null,
      candidateFutilityStopApplied: false,
      productionWaveDiscarded: false,
      improvementEngineApplied: false,
      improvementMovesAccepted: 0,
      accepted: false,
      fallbackToV3Baseline: true,
      earlyExitApplied: false,
      complexityLevel: null,
      selectedStrategy: `error_fallback_to_v3: ${(error as Error).message}`,
      verdict: "V4_REJECTED",
    };
  }
}

export function evaluateRegressionGate(v3: V4BenchmarkMetrics, v4Balanced: V4BenchmarkMetrics, maxRuntimeMs = MODE_MAX_RUNTIME_MS.strict): RegressionGateResult {
  const causes: string[] = [];
  if (v4Balanced.unplannedTasks > v3.unplannedTasks) causes.push(`V4 balanced leaves more unplanned tasks (${v3.unplannedTasks} -> ${v4Balanced.unplannedTasks}).`);
  if (v3.hardFeasible && !v4Balanced.hardFeasible) causes.push("V4 balanced is not hard-feasible while V3 is hard-feasible.");
  if (v4Balanced.mainFlowGapMinutes > v3.mainFlowGapMinutes) causes.push(`V4 balanced worsens main-flow gaps (${v3.mainFlowGapMinutes} -> ${v4Balanced.mainFlowGapMinutes}).`);
  if (v4Balanced.runtimeMs > maxRuntimeMs) causes.push("V4 balanced exceeded runtime budget");
  if (!v4Balanced.earlyExitApplied && !v4Balanced.executedStrategies.some((strategy) => strategy.startsWith("strategy_v4_native_critical_core"))) causes.push("V4 balanced did not execute any native critical core strategy.");
  const improvesMakespan = v4Balanced.makespanMinutes !== null && v3.makespanMinutes !== null && v4Balanced.makespanMinutes < v3.makespanMinutes;
  const improvesQuality = v4Balanced.qualityScore > v3.qualityScore;
  if (!improvesMakespan && !improvesQuality && v4Balanced.verdict === "V4_BETTER") causes.push("V4 balanced verdict is V4_BETTER without improving makespan or qualityScore.");
  return { passed: causes.length === 0, causes };
}

function buildSummary(scenario: BenchmarkScenario, mode: V4BenchmarkResult["mode"], maxRuntimeMs: number): V4BenchmarkScenarioSummary {
  const v3 = runV3Baseline(scenario);
  const v4Safe = mode === "normal" ? runV4Profile(scenario, "safe", maxRuntimeMs) : undefined;
  const balancedOptions = mode === "quick" ? { maxStrategies: 6 } : {};
  const v4Balanced = runV4Profile(scenario, "balanced", maxRuntimeMs, balancedOptions);
  const v4Aggressive = mode === "aggressive" ? runV4Profile(scenario, "aggressive", maxRuntimeMs) : undefined;
  const delta = {
    makespanMinutes: v4Balanced.makespanMinutes !== null && v3.makespanMinutes !== null ? v4Balanced.makespanMinutes - v3.makespanMinutes : null,
    mainFlowGapMinutes: v4Balanced.mainFlowGapMinutes - v3.mainFlowGapMinutes,
    qualityScore: v4Balanced.qualityScore - v3.qualityScore,
    runtimeMs: v4Balanced.runtimeMs - v3.runtimeMs,
  };
  const worse = v4Balanced.unplannedTasks > v3.unplannedTasks || v4Balanced.mainFlowGapMinutes > v3.mainFlowGapMinutes || (delta.makespanMinutes !== null && delta.makespanMinutes > 45 && delta.qualityScore <= 0);
  const better = v4Balanced.unplannedTasks <= v3.unplannedTasks && v4Balanced.mainFlowGapMinutes <= v3.mainFlowGapMinutes && ((delta.makespanMinutes !== null && delta.makespanMinutes < 0) || delta.qualityScore > 0);
  const verdict = v4Balanced.verdict === "V4_REJECTED" ? "V4_REJECTED" : worse ? "V4_WORSE" : better ? "V4_BETTER" : "V4_EQUAL";
  return {
    scenario: v3.scenarioName,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    scenarioType: scenarioType(scenario, mode),
    taskCount: scenario.input.tasks.length,
    v3,
    v4Safe: v4Safe as V4BenchmarkMetrics,
    v4Balanced,
    v4Aggressive,
    delta,
    verdict,
    gate: evaluateRegressionGate(v3, v4Balanced, maxRuntimeMs),
    gateMaxRuntimeMs: maxRuntimeMs,
  };
}

const printSummary = (result: V4BenchmarkResult): void => {
  console.log("V4 BENCHMARK SUMMARY");
  console.log(`Mode: ${result.mode}`);
  for (const item of result.scenarios) {
    console.log(`\nScenario ID: ${item.scenarioId}`);
    console.log(`Scenario Name: ${item.scenarioName}`);
    console.log(`Scenario Type: ${item.scenarioType}`);
    console.log(`Task count: ${item.taskCount}`);
    console.log(`V3 makespan: ${item.v3.makespan ?? "n/a"}`);
    console.log(`V4 balanced makespan: ${item.v4Balanced.makespan ?? "n/a"}`);
    console.log(`Main flow gaps: ${item.v3.mainFlowGapMinutes} -> ${item.v4Balanced.mainFlowGapMinutes}`);
    console.log(`Unplanned: ${item.v3.unplannedTasks} -> ${item.v4Balanced.unplannedTasks}`);
    console.log(`Talent stay total: ${item.v3.totalTalentStayMinutes} -> ${item.v4Balanced.totalTalentStayMinutes}`);
    console.log(`Runtime: ${item.v3.runtimeMs}ms -> ${item.v4Balanced.runtimeMs}ms`);
    console.log(`Verdict: ${item.verdict}`);
    console.log(`Strategies evaluated: ${item.v4Balanced.strategiesEvaluated}`);
    console.log(`Strategies skipped: ${item.v4Balanced.strategiesSkipped}`);
    console.log(`Runtime budget exceeded: ${item.v4Balanced.runtimeBudgetExceeded}`);
    console.log(`Selected strategy: ${item.v4Balanced.selectedStrategy ?? "n/a"}`);
    console.log(`Fallback to V3: ${item.v4Balanced.fallbackToV3Baseline}`);
    console.log(`Final acceptance: ${item.v4Balanced.accepted}`);
    if (item.v4Balanced.earlyExitApplied) console.log("V4 early exit: simple scenario, V3 fallback used.");
    if (!item.gate.passed) console.log(`Gate failures: ${item.gate.causes.join(" | ")}`);
  }
};

export const printEvidenceReport = (report: V4BenchmarkEvidenceItem[]): void => {
  console.log("\nV4 EVIDENCE REPORT");
  for (const item of report) {
    console.log(`\nScenario ID: ${item.scenarioId}`);
    console.log(`Scenario Name: ${item.scenarioName}`);
    console.log(`Scenario Type: ${item.scenarioType}`);
    console.log(`Verdict: ${item.verdict}`);
    console.log(`Main reason: ${item.mainReason}`);
    console.log(`Selected strategy: ${item.strategyDiagnosis.selectedStrategy ?? "n/a"}`);
    console.log(`Fallback: ${item.fallbackUsed}`);
    console.log(`Native core: ${item.strategyDiagnosis.nativeCriticalCoreExecuted ? "executed" : "not executed"}, discarded: ${item.strategyDiagnosis.nativeCriticalCoreDiscarded}`);
    console.log(`Native core rejection: ${item.strategyDiagnosis.nativeCriticalCoreRejectionReason ?? "n/a"}`);
    const nativeDetails = item.strategyDiagnosis.nativeCriticalCoreRejectionDetails as any;
    console.log(`Native core details: ${nativeDetails ? `gap ${nativeDetails.baselineMainFlowGapMinutes} -> ${nativeDetails.candidateMainFlowGapMinutes}, makespan ${nativeDetails.baselineMakespanMinutes} -> ${nativeDetails.candidateMakespanMinutes}` : "n/a"}`);
    const gapTargeting = item.strategyDiagnosis.nativeCriticalCoreGapTargeting as any;
    console.log(`Gap targeting: applied ${gapTargeting?.applied ? "true" : "false"}`);
    console.log(`Gap targeting baseline: ${Number(gapTargeting?.baselineGapMinutes ?? item.v3Summary.mainFlowGapMinutes)}`);
    console.log(`Gap targeting candidate: ${Number(gapTargeting?.candidateGapMinutes ?? item.v4Summary.mainFlowGapMinutes)}`);
    console.log(`Baseline gap: ${Number(gapTargeting?.baselineGapMinutes ?? item.v3Summary.mainFlowGapMinutes)}`);
    console.log(`Candidate gap: ${Number(gapTargeting?.candidateGapMinutes ?? item.v4Summary.mainFlowGapMinutes)}`);
    console.log(`Gaps targeted: ${Number(gapTargeting?.gapsTargeted ?? 0)}`);
    console.log(`Gaps closed: ${Number(gapTargeting?.gapsClosed ?? 0)}`);
    console.log(`Main blocker: ${gapTargeting?.mainBlocker ?? gapTargeting?.blockers?.[0] ?? "n/a"}`);
    console.log(`Best operation: ${gapTargeting?.bestOperation ?? gapTargeting?.attempts?.find?.((attempt: any) => attempt.success)?.operation ?? gapTargeting?.attempts?.[0]?.operation ?? "n/a"}`);
    console.log(`Candidate futility stop: ${item.strategyDiagnosis.candidateFutilityStopApplied}`);
    console.log(`Production wave: ${item.strategyDiagnosis.productionWaveExecuted ? "executed" : "not executed"}, discarded: ${item.strategyDiagnosis.productionWaveDiscarded}`);
    console.log(`Improvement engine: ${item.strategyDiagnosis.improvementMovesAccepted} moves accepted`);
    console.log(`Losses: ${item.losses.length ? item.losses.join(", ") : "none"}`);
    console.log("Required next action:");
    console.log(item.requiredNextAction);
  }
};

export function runV4Benchmark(args = process.argv.slice(2)): V4BenchmarkResult {
  const strict = args.includes("--strict");
  const smoke = args.includes("--smoke");
  const quick = args.includes("--quick");
  const aggressive = args.includes("--aggressive");
  const mode: V4BenchmarkResult["mode"] = smoke ? "smoke" : aggressive ? "aggressive" : strict ? "strict" : quick ? "quick" : "normal";
  const maxRuntimeMs = Number(process.env.V4_BENCHMARK_MAX_RUNTIME_MS ?? MODE_MAX_RUNTIME_MS[mode]);
  const scenarios = selectedScenarios(mode);
  assertBenchmarkScenarioSelection(mode, scenarios);
  const result = { mode, strict, maxRuntimeMs, scenarios: scenarios.map((scenario) => buildSummary(scenario, mode, maxRuntimeMs)), generatedAt: new Date().toISOString(), evidenceReport: [] } as V4BenchmarkResult;
  result.evidenceReport = buildV4BenchmarkEvidenceReport(result);
  printSummary(result);
  printEvidenceReport(result.evidenceReport);
  try { writeFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "latest-result.json"), `${JSON.stringify(result, null, 2)}\n`); } catch (error) { console.warn(`Could not write latest-result.json: ${(error as Error).message}`); }
  if (strict) {
    const failures = result.scenarios.filter((scenario) => !scenario.gate.passed);
    if (failures.length > 0) {
      console.error(`\nV4 strict regression gate failed:\n${failures.map((failure) => `- ${failure.scenario}: ${failure.gate.causes.join("; ")}`).join("\n")}`);
      printEvidenceReport(result.evidenceReport.filter((item) => failures.some((failure) => failure.scenario === item.scenarioName)));
      process.exitCode = 1;
    }
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) runV4Benchmark();
