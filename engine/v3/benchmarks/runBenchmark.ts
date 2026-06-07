import { performance } from "node:perf_hooks";
import { generatePlanV3, runOperationalNeighborhoodSelection } from "../index";
import { calculateMetrics } from "./metrics";
import { runMainStageCpSatPilot } from "../mainStageCpSatPilot";
import { compareCandidateSolutions, explainCandidateComparison, scoreCandidateSolution } from "../solutionScoring";
import { benchmarkScenarios } from "./scenarios";
import type { BenchmarkRunResult } from "./types";

const QUICK_SCENARIO_IDS = ["A", "G", "H", "I", "L", "R", "S"] as const;

type BenchmarkSelection = {
  label: string;
  scenarioIds: string[] | null;
};

const parseScenarioIds = (value: string, source: string): string[] => {
  const scenarioIds = [...new Set(value.split(",").map((id) => id.trim().toUpperCase()).filter(Boolean))];
  if (scenarioIds.length === 0) {
    throw new Error(`${source} requires at least one scenario ID`);
  }
  return scenarioIds;
};

const parseBenchmarkSelection = (args: string[], envValue: string | undefined): BenchmarkSelection => {
  let requestedMode: "quick" | "full" | "scenario" | null = null;
  let scenarioIds: string[] | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--quick" || arg === "--full") {
      if (requestedMode) throw new Error(`Cannot combine ${arg} with another benchmark filter`);
      requestedMode = arg === "--quick" ? "quick" : "full";
      continue;
    }

    if (arg === "--scenario" || arg.startsWith("--scenario=")) {
      if (requestedMode) throw new Error(`${arg} cannot be combined with another benchmark filter`);
      const value = arg === "--scenario" ? args[++index] : arg.slice("--scenario=".length);
      if (value === undefined) throw new Error("--scenario requires a comma-separated list of scenario IDs");
      requestedMode = "scenario";
      scenarioIds = parseScenarioIds(value, "--scenario");
      continue;
    }

    throw new Error(`Unknown benchmark argument: ${arg}`);
  }

  if (requestedMode === "quick") return { label: "quick", scenarioIds: [...QUICK_SCENARIO_IDS] };
  if (requestedMode === "full") return { label: "full", scenarioIds: null };
  if (requestedMode === "scenario") return { label: `scenario ${scenarioIds!.join(",")}`, scenarioIds };
  if (envValue?.trim()) {
    const envScenarioIds = parseScenarioIds(envValue, "BENCHMARK_SCENARIOS");
    return { label: `BENCHMARK_SCENARIOS=${envScenarioIds.join(",")}`, scenarioIds: envScenarioIds };
  }
  return { label: "full", scenarioIds: null };
};

const benchmarkSelection = parseBenchmarkSelection(process.argv.slice(2), process.env.BENCHMARK_SCENARIOS);
const knownScenarioIds = new Set(benchmarkScenarios.map((scenario) => scenario.id));
const unknownScenarioIds = benchmarkSelection.scenarioIds?.filter((id) => !knownScenarioIds.has(id)) ?? [];
if (unknownScenarioIds.length > 0) {
  throw new Error(`Unknown benchmark scenario ID(s): ${unknownScenarioIds.join(", ")}`);
}
const selectedBenchmarkScenarios = benchmarkSelection.scenarioIds
  ? benchmarkSelection.scenarioIds.map((id) => benchmarkScenarios.find((scenario) => scenario.id === id)!)
  : benchmarkScenarios;

const formatNullable = (value: number | boolean | string | null | undefined): string => value === null || value === undefined ? "n/a" : String(value);
const formatCompact = (value: string | null | undefined): string => value === null || value === undefined ? "n/a" : value.length > 140 ? `${value.slice(0, 137)}...` : value;

const selectedMetricsFromScore = (score: ReturnType<typeof scoreCandidateSolution>) => ({
  coachSwitchCount: score.coachSwitchCount,
  coachSwitchPenalty: score.coachSwitchPenalty,
  bundleCoherencePenalty: score.bundleCoherencePenalty,
  bundleSwitchPenalty: score.bundleSwitchPenalty,
  partialBundleUsageWarnings: score.partialBundleUsageWarnings,
  bundleSpaceAffinityMatches: score.bundleSpaceAffinityMatches,
  bundleSpaceAffinityMismatches: score.bundleSpaceAffinityMismatches,
  restrictiveTalentAverageStartOffset: score.restrictiveTalentAverageStartOffset,
  mainStageGapMinutes: score.mainStageGapMinutes,
  mainStageGapCount: score.mainStageGapCount,
  makespan: score.makespan === Number.MAX_SAFE_INTEGER ? null : score.makespan,
  hardConstraintViolations: score.hardConstraintViolations,
});

const runScenario = (scenario: (typeof benchmarkScenarios)[number]): BenchmarkRunResult => {
  const start = performance.now();
  const output = scenario.benchmarkCandidateOutputs
    ? (() => {
      const [first, second] = scenario.benchmarkCandidateOutputs;
      const selected = compareCandidateSolutions(scenario.input, first, second) >= 0 ? first : second;
      const rejected = selected === first ? second : first;
      const selectedScore = scoreCandidateSolution(scenario.input, selected);
      const rejectedScore = scoreCandidateSolution(scenario.input, rejected);
      const reason = explainCandidateComparison("phaseA_backtracking", "phaseA_greedy", selectedScore, rejectedScore);
      return { ...selected, v3Meta: { ...(selected.v3Meta ?? {}), candidateSolutionsEvaluated: 2, bestCandidateSource: "phaseA_backtracking" as const, solutionSource: "phaseA_backtracking" as const, candidateSelectionReason: reason, candidateComparisonSummary: reason, bestCandidateScore: selectedScore.score, selectedCandidateMetrics: selectedMetricsFromScore(selectedScore) } };
    })()
    : scenario.cpSatPilotSeedOutput
    ? (() => {
      const selected = runMainStageCpSatPilot(scenario.input, scenario.cpSatPilotSeedOutput!);
      const score = scoreCandidateSolution(scenario.input, selected.output);
      return { ...selected.output, v3Meta: { ...(selected.output.v3Meta ?? {}), ...selected.meta, solutionSource: selected.meta.cpSatPilotAccepted ? "cp_sat_pilot" : "phaseA_greedy", selectedCandidateMetrics: selectedMetricsFromScore(score) } };
    })()
    : scenario.neighborhoodSeedOutput
      ? (() => {
        const selected = runOperationalNeighborhoodSelection(scenario.input, scenario.neighborhoodSeedOutput!, "phaseA_greedy");
        return { ...selected.output, v3Meta: { ...(selected.output.v3Meta ?? {}), ...selected.meta } };
      })()
      : generatePlanV3(scenario.input, { timeLimitMs: 0, requestId: `benchmark-${scenario.id}` });
  const runtimeMs = Math.round(performance.now() - start);
  const metrics = calculateMetrics(scenario.input, output, runtimeMs);
  return { scenario, output, runtimeMs, metrics };
};

const printResult = (result: BenchmarkRunResult): void => {
  const { scenario, output, metrics } = result;
  const status = output.complete ? "complete" : output.hardFeasible === false ? "infeasible" : "partial";
  const hardMarker = output.complete && metrics.hardConstraintViolations > 0 ? " ⚠️ HARD VIOLATIONS" : "";

  console.log(`\n[${scenario.id}] ${scenario.name}`);
  console.log(`  status: ${status}${hardMarker}`);
  console.log(`  totalTasks: ${metrics.totalTasks}`);
  console.log(`  plannedTasks: ${metrics.plannedTasks}`);
  console.log(`  unplannedTasks: ${metrics.unplannedTasks}`);
  console.log(`  runtimeMs: ${metrics.runtimeMs}`);
  console.log(`  makespan: ${formatNullable(metrics.makespan)}`);
  console.log(`  mainStageGapMinutes: ${formatNullable(metrics.mainStageGapMinutes)}`);
  console.log(`  mainStageGapCount: ${formatNullable(metrics.mainStageGapCount)}`);
  console.log(`  contestantWindowViolations: ${metrics.contestantWindowViolations}`);
  console.log(`  hardConstraintViolations: ${metrics.hardConstraintViolations}`);
  console.log(`  lockedTaskMovedCount: ${metrics.lockedTaskMovedCount}`);
  console.log(`  executedTaskMovedCount: ${metrics.executedTaskMovedCount}`);
  console.log(`  coachSwitchCount: ${formatNullable(metrics.coachSwitchCount)}`);
  console.log(`  coachSwitchPenalty: ${metrics.coachSwitchPenalty}`);
  console.log(`  restrictiveTalentAverageStartOffset: ${formatNullable(metrics.restrictiveTalentAverageStartOffset)}`);
  console.log(`  restrictiveTalentLatestFinishSlack: ${formatNullable(metrics.restrictiveTalentLatestFinishSlack)}`);
  console.log(`  mainStageUtilizationPercent: ${formatNullable(metrics.mainStageUtilizationPercent)}`);
  console.log(`  tasksPerContestantMinMax: ${formatNullable(metrics.tasksPerContestantMinMax)}`);
  console.log(`  resourceUtilizationSummary: ${formatCompact(metrics.resourceUtilizationSummary)}`);
  console.log(`  resourcePoolPressureSummary: ${formatCompact(metrics.resourcePoolPressureSummary)}`);
  console.log(`  maxAnyOfPoolConcurrency: ${formatNullable(metrics.maxAnyOfPoolConcurrency)}`);
  console.log(`  resourceSwitchCount: ${formatNullable(metrics.resourceSwitchCount)}`);
  console.log(`  compositeResourceCandidateCount: ${formatNullable(metrics.compositeResourceCandidateCount)}`);
  console.log(`  declaredResourceBundleCount: ${metrics.declaredResourceBundleCount}`);
  console.log(`  usableResourceBundleCount: ${metrics.usableResourceBundleCount}`);
  console.log(`  invalidResourceBundleCount: ${metrics.invalidResourceBundleCount}`);
  console.log(`  partiallyUsableResourceBundleCount: ${metrics.partiallyUsableResourceBundleCount}`);
  console.log(`  resourceBundleValidationWarnings: ${metrics.resourceBundleValidationWarnings}`);
  console.log(`  bundleComponentUsageCount: ${metrics.bundleComponentUsageCount}`);
  console.log(`  partialBundleUsageWarnings: ${metrics.partialBundleUsageWarnings}`);
  console.log(`  bundleSpaceAffinityMatches: ${metrics.bundleSpaceAffinityMatches}`);
  console.log(`  bundleSpaceAffinityMismatches: ${metrics.bundleSpaceAffinityMismatches}`);
  console.log(`  bundleSwitchPenalty: ${metrics.bundleSwitchPenalty}`);
  console.log(`  declaredBundleCandidateMatches: ${metrics.declaredBundleCandidateMatches}`);
  console.log(`  resourceDiagnosticWarnings: ${metrics.resourceDiagnosticWarnings === null ? "n/a" : metrics.resourceDiagnosticWarnings.length > 0 ? formatCompact(metrics.resourceDiagnosticWarnings.join(" | ")) : "[]"}`);
  console.log(`  cpSatAttempted: ${formatNullable(metrics.cpSatAttempted)}`);
  console.log(`  cpSatAccepted: ${formatNullable(metrics.cpSatAccepted)}`);
  console.log(`  cpSatPilotAttempted: ${formatNullable(metrics.cpSatPilotAttempted)}`);
  console.log(`  cpSatPilotAccepted: ${formatNullable(metrics.cpSatPilotAccepted)}`);
  console.log(`  cpSatPilotTaskCount: ${formatNullable(metrics.cpSatPilotTaskCount)}`);
  console.log(`  cpSatPilotRuntimeMs: ${formatNullable(metrics.cpSatPilotRuntimeMs)}`);
  console.log(`  cpSatPilotReason: ${formatNullable(metrics.cpSatPilotReason)}`);
  console.log(`  cpSatPilotImprovementSummary: ${formatCompact(metrics.cpSatPilotImprovementSummary)}`);
  console.log(`  cpSatSegmentsAttempted: ${formatNullable(metrics.cpSatSegmentsAttempted)}`);
  console.log(`  cpSatSegmentsAccepted: ${formatNullable(metrics.cpSatSegmentsAccepted)}`);
  console.log(`  cpSatSegmentReasons: ${metrics.cpSatSegmentReasons?.join(",") ?? "n/a"}`);
  console.log(`  cpSatSegmentTaskCounts: ${metrics.cpSatSegmentTaskCounts?.join(",") ?? "n/a"}`);
  console.log(`  cpSatBestSegmentKind: ${formatNullable(metrics.cpSatBestSegmentKind)}`);
  console.log(`  cpSatSegmentImprovementSummary: ${formatCompact(metrics.cpSatSegmentImprovementSummary)}`);
  console.log(`  phaseAUsed: ${formatNullable(metrics.phaseAUsed)}`);
  console.log(`  backtrackingAttempted: ${formatNullable(metrics.backtrackingAttempted)}`);
  console.log(`  backtrackingAccepted: ${formatNullable(metrics.backtrackingAccepted)}`);
  console.log(`  backtrackingAttempts: ${formatNullable(metrics.backtrackingAttempts)}`);
  console.log(`  backtrackingBranchesExplored: ${formatNullable(metrics.backtrackingBranchesExplored)}`);
  console.log(`  candidateSolutionsEvaluated: ${formatNullable(metrics.candidateSolutionsEvaluated)}`);
  console.log(`  bestCandidateSource: ${formatNullable(metrics.bestCandidateSource)}`);
  console.log(`  candidateSelectionReason: ${formatNullable(metrics.candidateSelectionReason)}`);
  console.log(`  bestCandidateScore: ${formatCompact(metrics.bestCandidateScore)}`);
  console.log(`  selectedCandidateMetrics: ${metrics.selectedCandidateMetrics ? JSON.stringify(metrics.selectedCandidateMetrics) : "n/a"}`);
  console.log(`  selectedCandidateMetricsConsistent: ${formatNullable(metrics.selectedCandidateMetricsConsistent)}${metrics.selectedCandidateMetricsConsistent === false ? " ⚠️ METRICS DIVERGENCE" : ""}`);
  console.log(`  neighborhoodSearchAttempted: ${formatNullable(metrics.neighborhoodSearchAttempted)}`);
  console.log(`  neighborhoodCandidatesGenerated: ${formatNullable(metrics.neighborhoodCandidatesGenerated)}`);
  console.log(`  neighborhoodSearchDepth: ${formatNullable(metrics.neighborhoodSearchDepth)}`);
  console.log(`  neighborhoodDepth1Candidates: ${formatNullable(metrics.neighborhoodDepth1Candidates)}`);
  console.log(`  neighborhoodDepth2Candidates: ${formatNullable(metrics.neighborhoodDepth2Candidates)}`);
  console.log(`  neighborhoodChainsEvaluated: ${formatNullable(metrics.neighborhoodChainsEvaluated)}`);
  console.log(`  neighborhoodAcceptedChain: ${formatNullable(metrics.neighborhoodAcceptedChain)}`);
  console.log(`  neighborhoodCandidateAccepted: ${formatNullable(metrics.neighborhoodCandidateAccepted)}`);
  console.log(`  neighborhoodAcceptedReason: ${formatNullable(metrics.neighborhoodAcceptedReason)}`);
  console.log(`  neighborhoodTypesAttempted: ${metrics.neighborhoodTypesAttempted?.join(",") ?? "n/a"}`);
  console.log(`  neighborhoodTypesGenerated: ${metrics.neighborhoodTypesGenerated?.join(",") ?? "n/a"}`);
  console.log(`  neighborhoodRejectedReasons: ${metrics.neighborhoodRejectedReasons ? JSON.stringify(metrics.neighborhoodRejectedReasons) : "n/a"}`);
  console.log(`  structuredBlockersCount: ${metrics.structuredBlockersCount}`);
  console.log(`  movableBlockersCount: ${metrics.movableBlockersCount}`);
  console.log(`  immovableBlockersCount: ${metrics.immovableBlockersCount}`);
  console.log(`  unknownBlockersCount: ${metrics.unknownBlockersCount}`);
  console.log(`  solutionSource: ${formatNullable(metrics.solutionSource)}`);
  console.log(`  warningsCount: ${metrics.warningsCount}`);
  console.log(`  infeasibleReasonCount: ${metrics.infeasibleReasonCount}`);
  console.log(`  notas: ${scenario.riskNotes.join("; ")}${scenario.knownRisk ? `; riesgo conocido: ${scenario.knownRisk}` : ""}`);
};

console.log("ENGINE V3 BENCHMARK — ID 004 + ID 006 + ID 007 + ID 008 + ID 009 + ID 010 + ID 011 + ID 012 + ID 013 + ID 014 + ID 015 + ID 016 + ID 017 + ID 019 + ID 020");
console.log("Benchmark operativo reproducible: reporta riesgos conocidos, selección comparativa de candidatos, stress sintético y prioridad operativa soft de talents/coaches y vecindarios operativos acotados sin fallar por optimización no perfecta.");

console.log(`Selection: ${benchmarkSelection.label} (${selectedBenchmarkScenarios.map((scenario) => scenario.id).join(",")})`);

const results = selectedBenchmarkScenarios.map(runScenario);
for (const result of results) printResult(result);


const printNeighborhoodComparison = (scenarioId: "I" | "L"): void => {
  const scenario = benchmarkScenarios.find((candidate) => candidate.id === scenarioId);
  if (!scenario) return;
  const offInput = { ...scenario.input, enableOperationalNeighborhoods: false } as any;
  const offStart = performance.now();
  const offOutput = generatePlanV3(offInput, { timeLimitMs: 0, requestId: `benchmark-${scenarioId}-neighborhood-off`, enableLimitedBacktracking: false });
  const offMetrics = calculateMetrics(offInput, offOutput, Math.round(performance.now() - offStart));
  const onResult = results.find((result) => result.scenario.id === scenarioId);
  if (!onResult) return;
  console.log(`\nComparativa escenario ${scenarioId} — neighborhoods off/on`);
  console.log(`  off: planned=${offMetrics.plannedTasks}, mainStageGapMinutes=${formatNullable(offMetrics.mainStageGapMinutes)}, restrictiveTalentAverageStartOffset=${formatNullable(offMetrics.restrictiveTalentAverageStartOffset)}, coachSwitchCount=${formatNullable(offMetrics.coachSwitchCount)}, coachSwitchPenalty=${offMetrics.coachSwitchPenalty}, runtimeMs=${offMetrics.runtimeMs}, neighborhoodCandidatesGenerated=${formatNullable(offMetrics.neighborhoodCandidatesGenerated)}, candidateSolutionsEvaluated=${formatNullable(offMetrics.candidateSolutionsEvaluated)}, solutionSource=${formatNullable(offMetrics.solutionSource)}`);
  console.log(`  on : planned=${onResult.metrics.plannedTasks}, mainStageGapMinutes=${formatNullable(onResult.metrics.mainStageGapMinutes)}, restrictiveTalentAverageStartOffset=${formatNullable(onResult.metrics.restrictiveTalentAverageStartOffset)}, coachSwitchCount=${formatNullable(onResult.metrics.coachSwitchCount)}, coachSwitchPenalty=${onResult.metrics.coachSwitchPenalty}, runtimeMs=${onResult.metrics.runtimeMs}, neighborhoodCandidatesGenerated=${formatNullable(onResult.metrics.neighborhoodCandidatesGenerated)}, candidateSolutionsEvaluated=${formatNullable(onResult.metrics.candidateSolutionsEvaluated)}, solutionSource=${formatNullable(onResult.metrics.solutionSource)}`);
};

printNeighborhoodComparison("I");
printNeighborhoodComparison("L");

const completed = results.filter((result) => result.output.complete).length;
const hardViolationsInCompleted = results.filter((result) => result.output.complete && result.metrics.hardConstraintViolations > 0).length;
const movedFixedTasks = results.filter((result) => result.metrics.lockedTaskMovedCount > 0 || result.metrics.executedTaskMovedCount > 0).length;
const knownRisks = results.filter((result) => result.scenario.knownRisk).length;
const selectedMetricDivergences = results.filter((result) => result.metrics.selectedCandidateMetricsConsistent === false).length;

console.log("\nResumen");
console.log(`  escenarios: ${results.length}`);
console.log(`  completos: ${completed}`);
console.log(`  completos con hardConstraintViolations: ${hardViolationsInCompleted}`);
console.log(`  escenarios con locks/ejecución movidos: ${movedFixedTasks}`);
console.log(`  escenarios con riesgo conocido documentado: ${knownRisks}`);
console.log(`  divergencias entre output final y selectedCandidateMetrics: ${selectedMetricDivergences}`);
if (hardViolationsInCompleted > 0 || movedFixedTasks > 0 || selectedMetricDivergences > 0) {
  process.exitCode = 1;
  console.log("  exitCode: 1 por violación hard, movimiento de lock/ejecución o divergencia de métricas seleccionadas");
} else {
  console.log("  exitCode: 0 salvo excepción técnica");
}
