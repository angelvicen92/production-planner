import type { EngineInput, EngineOutput } from "../../types";
import type { EngineV3Options } from "../../v3/types";
import { generatePlanV3 } from "../../v3";
import { analyzeStrategicScenario } from "../analysis";
import { runV4CandidateStrategies, type V4CandidateStrategyId } from "../candidates";
import { compareV3AndV4Quality, type V3V4QualityComparison } from "../comparison";
import type { V4PostOptimizerDiagnostics } from "../postOptimizer";
import type { V4BlockRepackerDiagnostics } from "../blockRepacker";
import { runV4HierarchicalImprovementEngine } from "../improvementEngine";
import { evaluateV4PlanQuality, type V4PlanQualityEvaluation } from "../quality";
import type { EngineV4Diagnostics, EngineV4Result } from "../index";
import { assessV4ScenarioComplexity } from "./complexity";
const ENGINE_V4_VERSION = "v4" as const;

export type V4StrategyProfile = "safe" | "balanced" | "aggressive";

export interface V4ProOrchestratorOptions extends EngineV3Options {
  v4Profile?: V4StrategyProfile;
  maxRuntimeMs?: number;
  maxStrategies?: number;
  enableNativeRemainder?: boolean;
  enableNativeCriticalCore?: boolean;
  enableProductionWave?: boolean;
  enablePostOptimizer?: boolean;
  enableBlockRepacker?: boolean;
  enableImprovementEngine?: boolean;
}

export interface V4FinalAcceptanceDiagnostics {
  accepted: boolean;
  fallbackToV3Baseline: boolean;
  reason: string;
  checks: Record<string, boolean>;
}

export interface V4PerformanceDiagnostics {
  runtimeMs: number;
  strategiesEvaluated: number;
  profile: V4StrategyProfile;
  budgetExceeded: boolean;
  skippedStrategies: V4CandidateStrategyId[];
  warnings: string[];
}

const PROFILE_STRATEGIES: Record<V4StrategyProfile, V4CandidateStrategyId[]> = {
  safe: ["strategy_baseline_v3_order", "strategy_main_flow_guided", "strategy_critical_resources_first", "strategy_v4_production_wave"],
  balanced: ["strategy_baseline_v3_order", "strategy_main_flow_guided", "strategy_critical_resources_first", "strategy_critical_talents_first", "strategy_v4_production_wave", "strategy_v4_native_critical_core"],
  aggressive: ["strategy_baseline_v3_order", "strategy_main_flow_guided", "strategy_critical_resources_first", "strategy_critical_talents_first", "strategy_v4_production_wave", "strategy_v4_native_critical_core", "strategy_v4_native_remainder"],
};

const EMPTY_POST: V4PostOptimizerDiagnostics = {
  applied: false,
  movesAccepted: 0,
  movesRejected: 0,
  makespanBefore: null,
  makespanAfter: null,
  mainFlowGapMinutesBefore: 0,
  mainFlowGapMinutesAfter: 0,
  totalTalentStayBefore: 0,
  totalTalentStayAfter: 0,
  passes: [],
  warnings: [],
};


const EMPTY_BLOCK_REPACKER: V4BlockRepackerDiagnostics = {
  applied: false,
  skippedReason: "Block repacker not run.",
  blocksDetected: 0,
  blocksEvaluated: 0,
  movesAccepted: 0,
  movesRejected: 0,
  makespanBefore: null,
  makespanAfter: null,
  mainFlowGapMinutesBefore: 0,
  mainFlowGapMinutesAfter: 0,
  totalTalentStayBefore: 0,
  totalTalentStayAfter: 0,
  acceptedMoves: [],
  warnings: [],
};

const minutes = (value?: string | null): number => {
  const [h, m] = String(value ?? "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};
const unplanned = (output: EngineOutput) => Array.isArray(output.unplanned) ? output.unplanned.length : 0;
const planned = (output: EngineOutput) => Array.isArray(output.plannedTasks) ? output.plannedTasks.length : 0;

function enabledStrategies(options: V4ProOrchestratorOptions): V4CandidateStrategyId[] {
  const profile = options.v4Profile ?? "balanced";
  let strategies = [...PROFILE_STRATEGIES[profile]];
  if (options.enableProductionWave === false) strategies = strategies.filter((s) => s !== "strategy_v4_production_wave");
  if (options.enableNativeCriticalCore === false) strategies = strategies.filter((s) => s !== "strategy_v4_native_critical_core");
  if (profile !== "aggressive" && options.enableNativeRemainder === true && !strategies.includes("strategy_v4_native_remainder")) strategies.push("strategy_v4_native_remainder");
  if (options.enableNativeRemainder !== true) strategies = strategies.filter((s) => s !== "strategy_v4_native_remainder");
  const profileDefaults: Record<V4StrategyProfile, number> = { safe: 4, balanced: 6, aggressive: 12 };
  return strategies.slice(0, Math.max(1, Number(options.maxStrategies ?? profileDefaults[profile])));
}

function preserveProtectedTasks(input: EngineInput, baseline: EngineOutput, candidate: EngineOutput): boolean {
  const taskStatus = new Map((input.tasks ?? []).map((task) => [Number(task.id), String(task.status ?? "").toLowerCase()]));
  const locked = new Set((input.locks ?? []).map((lock) => Number(lock.taskId)).filter(Number.isFinite));
  const protectedIds = new Set([...locked, ...(input.tasks ?? []).filter((task) => ["done", "in_progress"].includes(String(task.status ?? "").toLowerCase())).map((task) => Number(task.id))]);
  const baselineById = new Map((baseline.plannedTasks ?? []).map((item) => [Number(item.taskId), item]));
  const candidateById = new Map((candidate.plannedTasks ?? []).map((item) => [Number(item.taskId), item]));
  for (const id of protectedIds) {
    const a = baselineById.get(id);
    const b = candidateById.get(id);
    if (!a && !b) continue;
    if (!a || !b) return false;
    if (a.startPlanned !== b.startPlanned || a.endPlanned !== b.endPlanned) return false;
  }
  return [...taskStatus.entries()].every(([id, status]) => !["done", "in_progress"].includes(status) || protectedIds.has(id));
}

function finalAcceptanceGate(input: EngineInput, baseline: EngineOutput, baselineQuality: V4PlanQualityEvaluation, candidate: EngineOutput, candidateQuality: V4PlanQualityEvaluation): V4FinalAcceptanceDiagnostics {
  const deltas = compareV3AndV4Quality(baselineQuality, candidateQuality).deltas;
  const strongMainFlowImprovement = deltas.mainFlowGapMinutes <= -15;
  const checks = {
    unplannedNotWorse: unplanned(candidate) <= unplanned(baseline),
    hardFeasibilityNotWorse: baseline.hardFeasible === false || candidate.hardFeasible !== false,
    mainFlowNotWorse: deltas.mainFlowGapMinutes <= 0,
    makespanSafe: deltas.makespanMinutes <= 5 || strongMainFlowImprovement,
    protectedTasksUntouched: preserveProtectedTasks(input, baseline, candidate),
  };
  const accepted = Object.values(checks).every(Boolean) && (deltas.mainFlowGapMinutes < 0 || deltas.makespanMinutes < 0 || deltas.qualityScore > 0 || deltas.unplannedTasks < 0);
  return accepted
    ? { accepted: true, fallbackToV3Baseline: false, reason: "V4 improved main-flow continuity or makespan without losing feasibility.", checks }
    : { accepted: false, fallbackToV3Baseline: true, reason: "V4 did not beat baseline safely.", checks };
}

function executiveSummary(verdict: string, finalAcceptance: V4FinalAcceptanceDiagnostics, comparison: V3V4QualityComparison | null, selectedStrategy: V4CandidateStrategyId) {
  const wins = (comparison?.reasons ?? []).filter((r) => /improves|reduces|plans/.test(r)).slice(0, 3);
  const losses = (comparison?.reasons ?? []).filter((r) => /worsens|increases|leaves|drops/.test(r)).slice(0, 3);
  const risks = finalAcceptance.accepted ? [] : [finalAcceptance.reason];
  const headline = finalAcceptance.accepted
    ? "V4 mejora el plan sin perder seguridad operativa."
    : "V4 queda como experimental y se mantiene el baseline V3 seguro.";
  return { verdict, headline, wins, losses, risks, selectedStrategy };
}

export function runV4ProOrchestrator(input: EngineInput, rawOptions: V4ProOrchestratorOptions = {}): EngineV4Result {
  const started = Date.now();
  const profile = rawOptions.v4Profile ?? "balanced";
  const maxRuntimeMs = Number(rawOptions.maxRuntimeMs ?? 8000);
  const strategies = enabledStrategies(rawOptions);
  const strategicAnalysis = analyzeStrategicScenario(input);
  const complexityAssessment = assessV4ScenarioComplexity(input, strategicAnalysis);
  if (complexityAssessment.level === "SIMPLE") {
    const baselineOutput = generatePlanV3(input, { ...rawOptions, timeLimitMs: 0 });
    const baselineQuality = evaluateV4PlanQuality(input, baselineOutput, strategicAnalysis);
    const comparison = compareV3AndV4Quality(baselineQuality, baselineQuality);
    const finalAcceptance = {
      accepted: false,
      fallbackToV3Baseline: true,
      reason: "Simple scenario: V4 strategic overhead not justified.",
      checks: { simpleScenarioEarlyExit: true },
    };
    const runtimeMs = Date.now() - started;
    const diagnostics: EngineV4Diagnostics = {
      status: (baselineOutput as any).hardFeasible === false ? "infeasible" : "success",
      engineVersion: ENGINE_V4_VERSION,
      generatedAt: new Date().toISOString(),
      plannedTasks: planned(baselineOutput),
      unplannedTasks: unplanned(baselineOutput),
      warning: "Motor V4 Pro omitido: escenario simple, se devuelve baseline V3 seguro.",
      strategicAnalysis,
      guidedOrdering: { applied: false, reorderedTaskCount: 0, priorityBuckets: [], topOrderedTasks: [], reason: "Simple scenario early exit." },
      quality: baselineQuality,
      qualityBeforeImprovement: baselineQuality,
      qualityBeforePostOptimizer: baselineQuality,
      postOptimizer: { ...EMPTY_POST, warnings: ["Simple scenario early exit: post-optimizer not run."] },
      blockRepacker: { ...EMPTY_BLOCK_REPACKER, skippedReason: "Simple scenario early exit.", warnings: ["Simple scenario early exit: block repacker not run."] },
      improvementEngine: { applied: false, runtimeMs: 0, iterations: 0, movesAccepted: 0, movesRejected: 0, qualityBefore: baselineQuality, qualityAfter: baselineQuality, makespanBefore: baselineQuality.makespan.lastTaskEnd, makespanAfter: baselineQuality.makespan.lastTaskEnd, mainFlowGapMinutesBefore: baselineQuality.mainFlowQuality?.internalGapMinutes ?? 0, mainFlowGapMinutesAfter: baselineQuality.mainFlowQuality?.internalGapMinutes ?? 0, totalTalentStayBefore: baselineQuality.talentStayTime.totalStayMinutes, totalTalentStayAfter: baselineQuality.talentStayTime.totalStayMinutes, families: [], acceptedMoves: [], warnings: ["Simple scenario early exit: improvement engine not run."] },
      mainFlowImprovement: { applied: false, movesAccepted: 0, movesRejected: 0, mainFlowGapMinutesBefore: baselineQuality.mainFlowQuality?.internalGapMinutes ?? 0, mainFlowGapMinutesAfter: baselineQuality.mainFlowQuality?.internalGapMinutes ?? 0, warnings: ["Simple scenario early exit: main-flow improvement not run."] } as any,
      mainFlowSequenceSearch: undefined,
      candidateRunner: { applied: false, bestStrategyId: "strategy_baseline_v3_order", candidateCount: 0, skippedCount: 0, budgetExceeded: false, candidates: [] },
      v3V4Comparison: { v3Baseline: baselineQuality, v4Final: baselineQuality, comparison: { ...comparison, verdict: "V4_REJECTED" as const, reasons: [...comparison.reasons, finalAcceptance.reason] } },
      bestStrategyId: "strategy_baseline_v3_order",
      finalAcceptance,
      performance: { runtimeMs, strategiesEvaluated: 0, profile, budgetExceeded: false, skippedStrategies: PROFILE_STRATEGIES[profile], warnings: ["Simple scenario early exit: candidate runner not run."] },
      executiveSummary: executiveSummary("V4_REJECTED", finalAcceptance, comparison, "strategy_baseline_v3_order"),
      complexityAssessment,
      earlyExit: { applied: true, fallbackToV3Baseline: true, reason: "Simple scenario: V4 strategic overhead not justified." },
    };
    return { output: baselineOutput, diagnostics };
  }
  const candidateResult = runV4CandidateStrategies(input, strategicAnalysis, { ...rawOptions, enabledStrategies: strategies, maxRuntimeMs } as any);
  const baselineDiagnostic = candidateResult.candidatesDiagnostics.candidates.find((candidate) => candidate.strategyId === "strategy_baseline_v3_order");
  const baselineOutput = candidateResult.baselineOutput ?? candidateResult.bestOutput;
  const baselineQuality = baselineDiagnostic?.quality ?? evaluateV4PlanQuality(input, baselineOutput, strategicAnalysis);

  const remaining = maxRuntimeMs - (Date.now() - started);
  const canImprove = rawOptions.enableImprovementEngine !== false
    && remaining >= 750
    && candidateResult.bestOutput.hardFeasible !== false
    && unplanned(candidateResult.bestOutput) <= unplanned(baselineOutput);
  const improved = canImprove
    ? runV4HierarchicalImprovementEngine(input, candidateResult.bestOutput, strategicAnalysis, candidateResult.bestQuality, { ...rawOptions, improvementEngine: { ...(rawOptions as any).improvementEngine, maxRuntimeMs: Math.max(50, remaining) } } as any)
    : { output: candidateResult.bestOutput, quality: candidateResult.bestQuality, diagnostics: { applied: false, runtimeMs: 0, iterations: 0, movesAccepted: 0, movesRejected: 0, qualityBefore: candidateResult.bestQuality, qualityAfter: candidateResult.bestQuality, makespanBefore: candidateResult.bestQuality.makespan.lastTaskEnd, makespanAfter: candidateResult.bestQuality.makespan.lastTaskEnd, mainFlowGapMinutesBefore: candidateResult.bestQuality.mainFlowQuality?.internalGapMinutes ?? 0, mainFlowGapMinutesAfter: candidateResult.bestQuality.mainFlowQuality?.internalGapMinutes ?? 0, totalTalentStayBefore: candidateResult.bestQuality.talentStayTime.totalStayMinutes, totalTalentStayAfter: candidateResult.bestQuality.talentStayTime.totalStayMinutes, families: [], acceptedMoves: [], warnings: ["Improvement engine skipped: candidate was not safe enough or no runtime budget remained."] } };

  const optimized = { output: improved.output, quality: improved.quality, diagnostics: { ...EMPTY_POST, warnings: ["Post-optimizer superseded by V4 hierarchical improvement engine."] } };
  const repacked = { output: improved.output, quality: improved.quality, diagnostics: { ...EMPTY_BLOCK_REPACKER, skippedReason: "Block repacker managed internally by V4 hierarchical improvement engine.", warnings: ["Block repacker superseded by V4 hierarchical improvement engine."] } };

  const comparisonBeforeGate = compareV3AndV4Quality(baselineQuality, repacked.quality);
  const finalAcceptance = finalAcceptanceGate(input, baselineOutput, baselineQuality, repacked.output, repacked.quality);
  const finalOutput = finalAcceptance.accepted ? repacked.output : baselineOutput;
  const finalQuality = finalAcceptance.accepted ? repacked.quality : baselineQuality;
  const comparison = finalAcceptance.accepted ? comparisonBeforeGate : { ...comparisonBeforeGate, verdict: "V4_REJECTED" as const, reasons: [...comparisonBeforeGate.reasons, finalAcceptance.reason] };
  const allProfile = PROFILE_STRATEGIES[profile];
  const skippedStrategies = allProfile.filter((strategy) => !candidateResult.candidatesDiagnostics.candidates.some((c) => c.strategyId === strategy));
  const runtimeMs = Date.now() - started;
  const budgetExceeded = runtimeMs >= maxRuntimeMs || candidateResult.candidatesDiagnostics.budgetExceeded;
  const perfWarnings = budgetExceeded ? ["Strategy budget exceeded; remaining strategies or optimizations were skipped."] : [];
  const performance = { runtimeMs, strategiesEvaluated: candidateResult.candidatesDiagnostics.candidateCount, profile, budgetExceeded, skippedStrategies, warnings: perfWarnings };
  const diagnostics: EngineV4Diagnostics = {
    status: (finalOutput as any).hardFeasible === false ? "infeasible" : "success",
    engineVersion: ENGINE_V4_VERSION,
    generatedAt: new Date().toISOString(),
    plannedTasks: planned(finalOutput),
    unplannedTasks: unplanned(finalOutput),
    warning: finalAcceptance.accepted ? "Motor V4 Pro aceptado por la quality gate final." : "Motor V4 Pro no superó la gate final; se devuelve baseline V3 seguro.",
    strategicAnalysis,
    complexityAssessment,
    earlyExit: { applied: false, fallbackToV3Baseline: false, reason: "V4 strategic pipeline executed." },
    guidedOrdering: candidateResult.bestGuidedOrdering,
    quality: finalQuality,
    qualityBeforeImprovement: candidateResult.bestQualityBeforeImprovement,
    qualityBeforePostOptimizer: candidateResult.bestQuality,
    postOptimizer: optimized.diagnostics,
    blockRepacker: repacked.diagnostics,
    improvementEngine: improved.diagnostics,
    mainFlowImprovement: candidateResult.bestMainFlowImprovement,
    mainFlowSequenceSearch: candidateResult.candidatesDiagnostics.mainFlowSequenceSearch,
    candidateRunner: candidateResult.candidatesDiagnostics,
    v3V4Comparison: { v3Baseline: baselineQuality, v4Final: repacked.quality, comparison },
    bestStrategyId: candidateResult.bestStrategyId,
    finalAcceptance,
    performance,
    executiveSummary: executiveSummary(comparison.verdict, finalAcceptance, comparison, candidateResult.bestStrategyId),
  } as EngineV4Diagnostics;
  return { output: finalOutput, diagnostics };
}
