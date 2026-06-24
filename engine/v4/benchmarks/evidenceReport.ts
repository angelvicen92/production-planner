import type { V4BenchmarkMetrics, V4BenchmarkResult, V4BenchmarkScenarioSummary } from "./runV4Benchmark";

export type V4BenchmarkLossCategory =
  | "UNPLANNED_WORSE"
  | "HARD_FEASIBILITY_WORSE"
  | "MAIN_FLOW_GAP_WORSE"
  | "MAKESPAN_WORSE"
  | "TALENT_STAY_WORSE"
  | "QUALITY_SCORE_WORSE"
  | "RUNTIME_TOO_SLOW"
  | "FALLBACK_TO_V3"
  | "NATIVE_CORE_NOT_EXECUTED"
  | "NATIVE_CORE_DISCARDED"
  | "PRODUCTION_WAVE_DISCARDED"
  | "IMPROVEMENT_ENGINE_NO_GAIN"
  | "NO_STRATEGY_BEAT_BASELINE"
  | "SIMPLE_SCENARIO_EARLY_EXIT";

export interface V4BenchmarkEvidenceItem {
  scenarioId: string;
  scenarioName: string;
  scenarioType: V4BenchmarkScenarioSummary["scenarioType"];
  verdict: string;
  mainReason: string;
  v3Summary: Pick<V4BenchmarkMetrics, "unplannedTasks" | "hardFeasible" | "mainFlowGapMinutes" | "makespan" | "makespanMinutes" | "totalTalentStayMinutes" | "qualityScore" | "runtimeMs">;
  v4Summary: Pick<V4BenchmarkMetrics, "unplannedTasks" | "hardFeasible" | "mainFlowGapMinutes" | "makespan" | "makespanMinutes" | "totalTalentStayMinutes" | "qualityScore" | "runtimeMs">;
  winningStrategy: string | null;
  fallbackUsed: boolean;
  finalAcceptanceReason: string | null;
  losses: V4BenchmarkLossCategory[];
  wins: string[];
  strategyDiagnosis: {
    executedStrategies: string[];
    skippedStrategies: string[];
    selectedStrategy: string | null;
    nativeCriticalCoreExecuted: boolean;
    nativeCriticalCoreDiscarded: boolean;
    nativeCriticalCoreRejectionReason: string | null;
    nativeCriticalCoreRejectionDetails: Record<string, unknown> | null;
    candidateFutilityStopApplied: boolean;
    productionWaveExecuted: boolean;
    productionWaveDiscarded: boolean;
    improvementEngineApplied: boolean;
    improvementMovesAccepted: number;
    finalAcceptanceAccepted: boolean;
  };
  requiredNextAction: string;
}

const has = (items: string[], prefix: string) => items.some((item) => item.startsWith(prefix));
const delta = (a: number | null, b: number | null): number | null => a === null || b === null ? null : a - b;
const summary = (m: V4BenchmarkMetrics) => ({ unplannedTasks: m.unplannedTasks, hardFeasible: m.hardFeasible, mainFlowGapMinutes: m.mainFlowGapMinutes, makespan: m.makespan, makespanMinutes: m.makespanMinutes, totalTalentStayMinutes: m.totalTalentStayMinutes, qualityScore: m.qualityScore, runtimeMs: m.runtimeMs });
const unique = <T>(items: T[]): T[] => [...new Set(items)];

function lossesFor(item: V4BenchmarkScenarioSummary): V4BenchmarkLossCategory[] {
  const { v3, v4Balanced: v4, delta: d } = item;
  const losses: V4BenchmarkLossCategory[] = [];
  if (v4.earlyExitApplied || v4.complexityLevel === "SIMPLE") return ["SIMPLE_SCENARIO_EARLY_EXIT"];
  if (v4.unplannedTasks > v3.unplannedTasks) losses.push("UNPLANNED_WORSE");
  if (v3.hardFeasible && !v4.hardFeasible) losses.push("HARD_FEASIBILITY_WORSE");
  if (v4.mainFlowGapMinutes > v3.mainFlowGapMinutes) losses.push("MAIN_FLOW_GAP_WORSE");
  if (d.makespanMinutes !== null && d.makespanMinutes > 0) losses.push("MAKESPAN_WORSE");
  if (v4.totalTalentStayMinutes > v3.totalTalentStayMinutes) losses.push("TALENT_STAY_WORSE");
  if (v4.qualityScore < v3.qualityScore) losses.push("QUALITY_SCORE_WORSE");
  if (v4.runtimeMs > item.gateMaxRuntimeMs || v4.runtimeBudgetExceeded) losses.push("RUNTIME_TOO_SLOW");
  if (v4.fallbackToV3Baseline) losses.push("FALLBACK_TO_V3");
  if (!has(v4.executedStrategies, "strategy_v4_native_critical_core")) losses.push("NATIVE_CORE_NOT_EXECUTED");
  if (v4.nativeCriticalCoreDiscarded) losses.push("NATIVE_CORE_DISCARDED");
  if (v4.productionWaveDiscarded) losses.push("PRODUCTION_WAVE_DISCARDED");
  if (v4.improvementEngineApplied && v4.improvementMovesAccepted === 0) losses.push("IMPROVEMENT_ENGINE_NO_GAIN");
  if (v4.verdict !== "V4_BETTER" && !v4.accepted) losses.push("NO_STRATEGY_BEAT_BASELINE");
  return unique(losses);
}

function winsFor(item: V4BenchmarkScenarioSummary): string[] {
  const wins: string[] = [];
  const { v3, v4Balanced: v4, delta: d } = item;
  if (v4.unplannedTasks < v3.unplannedTasks) wins.push(`Plans ${v3.unplannedTasks - v4.unplannedTasks} more task(s).`);
  if (v3.hardFeasible === false && v4.hardFeasible) wins.push("Restores hard feasibility.");
  if (v4.mainFlowGapMinutes < v3.mainFlowGapMinutes) wins.push(`Reduces main-flow gaps by ${v3.mainFlowGapMinutes - v4.mainFlowGapMinutes} min.`);
  if (d.makespanMinutes !== null && d.makespanMinutes < 0) wins.push(`Reduces makespan by ${Math.abs(d.makespanMinutes)} min.`);
  if (v4.totalTalentStayMinutes < v3.totalTalentStayMinutes) wins.push(`Reduces talent stay by ${v3.totalTalentStayMinutes - v4.totalTalentStayMinutes} min.`);
  if (v4.qualityScore > v3.qualityScore) wins.push(`Improves quality score by ${(v4.qualityScore - v3.qualityScore).toFixed(2)}.`);
  return wins;
}

function mainReason(item: V4BenchmarkScenarioSummary, losses: V4BenchmarkLossCategory[]): string {
  const d = item.delta;
  if (losses.includes("SIMPLE_SCENARIO_EARLY_EXIT")) return "Simple scenario correctly used V3 fallback without running V4 strategic pipeline.";
  if (losses.includes("FALLBACK_TO_V3")) return (() => { const reason = item.v4Balanced.finalAcceptanceReason ?? "final acceptance rejected the candidate"; return `V4 fell back to V3: ${reason.replace(/[.]+$/, "")}.`; })();
  if (losses.includes("UNPLANNED_WORSE")) return `V4 leaves ${item.v4Balanced.unplannedTasks - item.v3.unplannedTasks} more unplanned task(s).`;
  if (losses.includes("HARD_FEASIBILITY_WORSE")) return "V4 lost hard feasibility while V3 was feasible.";
  if (losses.includes("MAIN_FLOW_GAP_WORSE")) return `V4 increased main-flow gaps by ${item.v4Balanced.mainFlowGapMinutes - item.v3.mainFlowGapMinutes} min.`;
  if (losses.includes("MAKESPAN_WORSE") && d.makespanMinutes !== null) return `V4 increased makespan by ${d.makespanMinutes} min.`;
  if (losses.includes("RUNTIME_TOO_SLOW")) return `V4 runtime ${item.v4Balanced.runtimeMs}ms exceeded budget ${item.gateMaxRuntimeMs}ms.`;
  if (item.verdict === "V4_BETTER") return winsFor(item)[0] ?? "V4 beats V3 on benchmark quality.";
  return "V4 is equal to V3 or no strategy produced a safe measurable gain.";
}

function cleanReason(reason: string | null): string {
  return (reason ?? "V4 did not beat baseline safely").replace(/[.]+$/, "");
}

function nextAction(item: V4BenchmarkScenarioSummary, losses: V4BenchmarkLossCategory[]): string {
  const d = item.delta;
  if (losses.includes("SIMPLE_SCENARIO_EARLY_EXIT")) return "No action: smoke early exit correctly used V3 fallback.";
  if (losses.includes("MAKESPAN_WORSE") && d.makespanMinutes !== null) return item.scenarioType === "representative"
    ? `Representative V4 worse: improve Native Critical Core slot scoring; selected strategy loses makespan by ${d.makespanMinutes} min.`
    : `Improve Native Critical Core slot scoring: selected strategy loses makespan by ${d.makespanMinutes} min.`;
  if (losses.includes("NATIVE_CORE_NOT_EXECUTED")) return "Increase balanced budget or reduce sequence variants: native critical core was skipped.";
  if (losses.includes("NATIVE_CORE_DISCARDED")) {
    switch (item.v4Balanced.nativeCriticalCoreRejectionReason) {
      case "MAIN_FLOW_GAP_NOT_IMPROVED": return "Native Critical Core ran but did not reduce main-flow gaps. Tune core placement around main-flow continuity.";
      case "V3_FILL_INFEASIBLE": return "Native Critical Core creates internal locks that make V3 fill infeasible. Relax or reduce strategic locks.";
      case "MAKESPAN_WORSE": return "Native Critical Core worsens makespan. Improve slot scoring to prefer earlier completion.";
      case "CORE_TASKS_NOT_PLACED": return "Native Critical Core selected tasks but placed none. Inspect core placement blockers before tuning scoring.";
      case "CORE_TASK_SELECTION_EMPTY": return "Native Critical Core found no eligible core tasks. Inspect strategic analysis main-flow and critical-resource inputs.";
      default: return `Inspect Native Critical Core acceptance inputs: discarded reason ${item.v4Balanced.nativeCriticalCoreRejectionReason ?? "UNKNOWN"}.`;
    }
  }
  if (losses.includes("FALLBACK_TO_V3")) return item.scenarioType === "representative"
    ? `Representative V4 rejected: fix final acceptance blocker: ${cleanReason(item.v4Balanced.finalAcceptanceReason)}.`
    : `Fix final acceptance blocker: ${cleanReason(item.v4Balanced.finalAcceptanceReason)}.`;
  if (losses.includes("PRODUCTION_WAVE_DISCARDED") || losses.includes("MAIN_FLOW_GAP_WORSE")) return "Fix Production Wave dependency placement: main-flow gaps are worse than baseline.";
  if (losses.includes("RUNTIME_TOO_SLOW")) return "Do not tune engine yet: V4 is equal to V3 but slower.";
  if (item.verdict === "V4_BETTER") return "Proceed to tuning: V4 beats V3 on continuity and makespan.";
  return "Compare candidate diagnostics before adding heuristics: no strategy beat baseline safely.";
}

export function buildV4BenchmarkEvidenceReport(result: V4BenchmarkResult): V4BenchmarkEvidenceItem[] {
  return result.scenarios.map((item) => {
    const v4 = item.v4Balanced;
    const losses = lossesFor(item);
    return {
      scenarioId: item.scenarioId,
      scenarioName: item.scenarioName,
      scenarioType: item.scenarioType,
      verdict: item.verdict,
      mainReason: mainReason(item, losses),
      v3Summary: summary(item.v3),
      v4Summary: summary(v4),
      winningStrategy: v4.selectedStrategy,
      fallbackUsed: v4.fallbackToV3Baseline,
      finalAcceptanceReason: v4.finalAcceptanceReason,
      losses,
      wins: winsFor(item),
      strategyDiagnosis: {
        executedStrategies: v4.executedStrategies,
        skippedStrategies: v4.skippedStrategies,
        selectedStrategy: v4.selectedStrategy,
        nativeCriticalCoreExecuted: has(v4.executedStrategies, "strategy_v4_native_critical_core"),
        nativeCriticalCoreDiscarded: v4.nativeCriticalCoreDiscarded,
        nativeCriticalCoreRejectionReason: v4.nativeCriticalCoreRejectionReason,
        nativeCriticalCoreRejectionDetails: v4.nativeCriticalCoreRejectionDetails,
        candidateFutilityStopApplied: v4.candidateFutilityStopApplied,
        productionWaveExecuted: has(v4.executedStrategies, "strategy_v4_production_wave"),
        productionWaveDiscarded: v4.productionWaveDiscarded,
        improvementEngineApplied: v4.improvementEngineApplied,
        improvementMovesAccepted: v4.improvementMovesAccepted,
        finalAcceptanceAccepted: v4.accepted,
      },
      requiredNextAction: nextAction(item, losses),
    };
  });
}
