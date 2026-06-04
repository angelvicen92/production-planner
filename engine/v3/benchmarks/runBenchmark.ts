import { performance } from "node:perf_hooks";
import { generatePlanV3 } from "../index";
import { calculateMetrics } from "./metrics";
import { benchmarkScenarios } from "./scenarios";
import type { BenchmarkRunResult } from "./types";

const formatNullable = (value: number | boolean | string | null): string => value === null ? "n/a" : String(value);
const formatCompact = (value: string | null): string => value === null ? "n/a" : value.length > 140 ? `${value.slice(0, 137)}...` : value;

const runScenario = (scenario: (typeof benchmarkScenarios)[number]): BenchmarkRunResult => {
  const start = performance.now();
  const output = generatePlanV3(scenario.input, { timeLimitMs: 0, requestId: `benchmark-${scenario.id}` });
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
  console.log(`  plannedTasks / totalTasks: ${metrics.plannedTasks} / ${metrics.totalTasks}`);
  console.log(`  runtimeMs: ${metrics.runtimeMs}`);
  console.log(`  makespan: ${formatNullable(metrics.makespan)}`);
  console.log(`  mainStageGapMinutes: ${formatNullable(metrics.mainStageGapMinutes)}`);
  console.log(`  mainStageGapCount: ${formatNullable(metrics.mainStageGapCount)}`);
  console.log(`  contestantWindowViolations: ${metrics.contestantWindowViolations}`);
  console.log(`  hardConstraintViolations: ${metrics.hardConstraintViolations}`);
  console.log(`  lockedTaskMovedCount: ${metrics.lockedTaskMovedCount}`);
  console.log(`  executedTaskMovedCount: ${metrics.executedTaskMovedCount}`);
  console.log(`  coachSwitchCount: ${formatNullable(metrics.coachSwitchCount)}`);
  console.log(`  cpSatAttempted: ${formatNullable(metrics.cpSatAttempted)}`);
  console.log(`  cpSatAccepted: ${formatNullable(metrics.cpSatAccepted)}`);
  console.log(`  phaseAUsed: ${formatNullable(metrics.phaseAUsed)}`);
  console.log(`  backtrackingAttempted: ${formatNullable(metrics.backtrackingAttempted)}`);
  console.log(`  backtrackingAccepted: ${formatNullable(metrics.backtrackingAccepted)}`);
  console.log(`  backtrackingAttempts: ${formatNullable(metrics.backtrackingAttempts)}`);
  console.log(`  backtrackingBranchesExplored: ${formatNullable(metrics.backtrackingBranchesExplored)}`);
  console.log(`  candidateSolutionsEvaluated: ${formatNullable(metrics.candidateSolutionsEvaluated)}`);
  console.log(`  bestCandidateSource: ${formatNullable(metrics.bestCandidateSource)}`);
  console.log(`  candidateSelectionReason: ${formatNullable(metrics.candidateSelectionReason)}`);
  console.log(`  bestCandidateScore: ${formatCompact(metrics.bestCandidateScore)}`);
  console.log(`  structuredBlockersCount: ${metrics.structuredBlockersCount}`);
  console.log(`  movableBlockersCount: ${metrics.movableBlockersCount}`);
  console.log(`  immovableBlockersCount: ${metrics.immovableBlockersCount}`);
  console.log(`  unknownBlockersCount: ${metrics.unknownBlockersCount}`);
  console.log(`  solutionSource: ${formatNullable(metrics.solutionSource)}`);
  console.log(`  warningsCount: ${metrics.warningsCount}`);
  console.log(`  infeasibleReasonCount: ${metrics.infeasibleReasonCount}`);
  console.log(`  notas: ${scenario.riskNotes.join("; ")}${scenario.knownRisk ? `; riesgo conocido: ${scenario.knownRisk}` : ""}`);
};

console.log("ENGINE V3 BENCHMARK — ID 004 + ID 006 + ID 007");
console.log("Benchmark operativo reproducible: no modifica lógica del motor y reporta riesgos conocidos y selección comparativa de candidatos sin fallar por optimización no perfecta.");

const results = benchmarkScenarios.map(runScenario);
for (const result of results) printResult(result);

const completed = results.filter((result) => result.output.complete).length;
const hardViolationsInCompleted = results.filter((result) => result.output.complete && result.metrics.hardConstraintViolations > 0).length;
const knownRisks = results.filter((result) => result.scenario.knownRisk).length;

console.log("\nResumen");
console.log(`  escenarios: ${results.length}`);
console.log(`  completos: ${completed}`);
console.log(`  completos con hardConstraintViolations: ${hardViolationsInCompleted}`);
console.log(`  escenarios con riesgo conocido documentado: ${knownRisks}`);
console.log("  exitCode: 0 salvo excepción técnica");
