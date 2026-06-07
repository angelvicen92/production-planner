import assert from "node:assert/strict";
import { generatePlanV3, runOperationalNeighborhoodSelection } from "../index";
import {
  countContestantOverlaps,
  countContestantWindowViolations,
  countDependencyViolations,
  calculateCoachSwitchCount,
  calculateRestrictiveTalentAverageStartOffset,
  countExclusiveResourceOverlaps,
  countExecutedTaskMoved,
  countLockedTaskMoved,
  countMealCrossings,
  countSpaceOverlaps,
  calculateMetrics,
} from "./metrics";
import { benchmarkScenarios, scenarioById } from "./scenarios";
import { runMainStageCpSatPilot } from "../mainStageCpSatPilot";
import { compareCandidateSolutions, explainCandidateComparison, scoreCandidateSolution } from "../solutionScoring";
import { applyFinalHardValidationGate } from "../hardValidation";

const plannedById = (output: any) => new Map((output.plannedTasks ?? []).map((planned: any) => [Number(planned.taskId), planned]));
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

const run = (id: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V") => {
  const scenario = scenarioById.get(id);
  assert.ok(scenario, `scenario ${id} should exist`);
  const output = scenario.hardValidationSeedOutput
    ? applyFinalHardValidationGate(scenario.input, scenario.hardValidationSeedOutput)
    : scenario.benchmarkCandidateOutputs
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
      : generatePlanV3(scenario.input, { timeLimitMs: 0 });
  return { scenario, output };
};

for (const scenario of benchmarkScenarios) {
  assert.ok(scenario.id, "scenario id is required");
  assert.ok(scenario.name, `scenario ${scenario.id} name is required`);
  assert.ok(scenario.description, `scenario ${scenario.id} description is required`);
  assert.ok(scenario.operationalExpectation, `scenario ${scenario.id} expectation is required`);
  assert.ok(Array.isArray(scenario.riskNotes), `scenario ${scenario.id} risk notes are required`);
  assert.ok(Array.isArray(scenario.input.tasks), `scenario ${scenario.id} input must be compatible with generatePlanV3`);
}

// Escenario E — invariantes hard de ejecución y locks.
{
  const { scenario, output } = run("E");
  assert.equal(output.hardFeasible, true);
  assert.equal(countExecutedTaskMoved(scenario.input, output), 0, "done/in_progress tasks must not move");
  assert.equal(countLockedTaskMoved(scenario.input, output), 0, "manual time locks must be respected");

  const planned = plannedById(output);
  const assertNotMovedIfReturned = (taskId: number, start: string, end: string, label: string) => {
    const row = planned.get(taskId) as any;
    if (!row) return;
    assert.deepEqual({ start: row.startPlanned, end: row.endPlanned }, { start, end }, label);
  };
  assertNotMovedIfReturned(5001, "09:00", "09:30", "done task stays fixed if returned by the engine");
  assertNotMovedIfReturned(5002, "09:30", "10:00", "in_progress task stays fixed if returned by the engine");
  assertNotMovedIfReturned(5003, "10:00", "10:30", "locked pending task stays fixed if returned by the engine");
}

// Disponibilidad de concursantes: los escenarios completos no deben planificar fuera de ventana.
for (const id of ["A", "B", "C", "D", "F", "G", "H", "J", "K"] as const) {
  const { scenario, output } = run(id);
  if (output.complete) {
    assert.equal(countContestantWindowViolations(scenario.input, output), 0, `scenario ${id} contestant windows`);
  }
}

// No solapar concursante ni espacio en escenarios completos.
for (const id of ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"] as const) {
  const { scenario, output } = run(id);
  if (output.complete) {
    assert.equal(countContestantOverlaps(scenario.input, output), 0, `scenario ${id} contestant overlaps`);
    assert.equal(countSpaceOverlaps(scenario.input, output), 0, `scenario ${id} space overlaps`);
  }
}

// Recursos exclusivos modelados como byItem en escenario D.
{
  const { scenario, output } = run("D");
  if (output.complete) {
    assert.equal(countExclusiveResourceOverlaps(scenario.input, output), 0, "exclusive coach resources must not overlap");
  }
}

// Compatibilidad legacy: input.meal es una ventana flexible, no un bloqueo global.
{
  const { scenario, output } = run("F");
  if (output.complete) {
    assert.equal(countMealCrossings(scenario.input, output), 0, "the legacy meal window must not create meal crossings");
  }
}

// Dependencias modeladas en escenarios C y D.
for (const id of ["C", "D", "J"] as const) {
  const { scenario, output } = run(id);
  if (output.complete) {
    assert.equal(countDependencyViolations(scenario.input, output), 0, `scenario ${id} dependencies`);
  }
}

// Escenario G — backtracking limitado debe activarse y aceptar una solución completa.
{
  const { scenario, output } = run("G");
  assert.equal(output.complete, true, "scenario G should be complete after limited backtracking");
  assert.equal(output.v3Meta?.backtrackingAttempted, true, "scenario G should attempt backtracking");
  assert.equal(output.v3Meta?.backtrackingAccepted, true, "scenario G should accept backtracking");
  assert.equal(output.v3Meta?.solutionSource, "phaseA_backtracking", "scenario G source");
  assert.equal(countContestantWindowViolations(scenario.input, output), 0, "scenario G contestant windows");
  assert.equal(countSpaceOverlaps(scenario.input, output), 0, "scenario G space overlaps");
}

// Escenario H — selección comparativa elige una alternativa válida mejor.
{
  const { scenario, output } = run("H");
  assert.equal(output.complete, true, "scenario H should be complete");
  assert.ok((output.v3Meta?.candidateSolutionsEvaluated ?? 0) >= 2, "scenario H should compare candidates");
  assert.equal(output.v3Meta?.solutionSource, "phaseA_backtracking", "scenario H source");
  assert.match(String(output.v3Meta?.candidateSelectionReason ?? ""), /main-stage gaps|gap/, "scenario H selection reason");
  assert.equal(countContestantWindowViolations(scenario.input, output), 0, "scenario H contestant windows");
  assert.equal(countSpaceOverlaps(scenario.input, output), 0, "scenario H space overlaps");
}

// Escenario J — calidad operativa en caso compacto con salida temprana y continuidad de coach/feeders.
{
  const { scenario, output } = run("J");
  assert.equal(output.complete, true, "scenario J should remain complete");
  assert.equal(countContestantWindowViolations(scenario.input, output), 0, "scenario J contestant windows");
  assert.equal(countDependencyViolations(scenario.input, output), 0, "scenario J dependencies");
  assert.equal(countExclusiveResourceOverlaps(scenario.input, output), 0, "scenario J exclusive coach overlaps");
  const planned = plannedById(output);
  const restrictiveFeeder = planned.get(9001) as any;
  const restrictiveMain = planned.get(9002) as any;
  assert.ok(restrictiveFeeder && restrictiveMain, "scenario J restrictive feeder and main should be planned");
  assert.equal(restrictiveFeeder.startPlanned, "09:00", "restrictive feeder should be first in its coach chain");
  assert.ok(String(restrictiveMain.endPlanned) <= "10:05", "restrictive main must finish before early exit");
  assert.ok((calculateRestrictiveTalentAverageStartOffset(scenario.input, output) ?? 999) <= 20, "restrictive timing should stay early in scenario J");
  assert.ok((calculateCoachSwitchCount(scenario.input, output) ?? 999) <= 4, "scenario J should keep coach switches bounded");
}


// Escenario K — vecindario operativo mejora un plan completo.
{
  const { scenario, output } = run("K");
  assert.equal(output.complete, true, "scenario K should remain complete");
  assert.equal(output.v3Meta?.neighborhoodSearchAttempted, true, "scenario K should attempt neighborhoods");
  assert.equal(output.v3Meta?.neighborhoodCandidateAccepted, true, "scenario K should accept a neighborhood candidate");
  assert.equal(output.v3Meta?.solutionSource, "operational_neighborhood", "scenario K source");
  assert.equal(countContestantWindowViolations(scenario.input, output), 0, "scenario K contestant windows");
  assert.equal(countSpaceOverlaps(scenario.input, output), 0, "scenario K space overlaps");
}

// Escenario I — stress sintético realista: puede ser complete o partial, pero nunca debe aceptar violaciones hard.
{
  const { scenario, output } = run("I");
  const contestantIds = new Set((scenario.input.tasks ?? []).map((task: any) => Number(task.contestantId)).filter((id: number) => Number.isFinite(id) && id > 0));
  assert.ok(contestantIds.size >= 12 && contestantIds.size <= 18, "scenario I should model 12-18 talents");
  assert.ok((scenario.input.tasks ?? []).length >= 60, "scenario I should include at least 60 tasks");
  assert.ok((scenario.input.planResourceItems ?? []).some((resource: any) => String(resource.name).includes("Coach")), "scenario I should include coaches");
  assert.ok(Number(scenario.input.optimizerMainZoneId ?? 0) > 0, "scenario I should define a main stage zone");
  assert.ok((scenario.input.locks ?? []).length >= 1, "scenario I should include manual locks");
  assert.ok((scenario.input.tasks ?? []).some((task: any) => task.status === "done"), "scenario I should include a done task");
  assert.ok((scenario.input.tasks ?? []).some((task: any) => task.status === "in_progress"), "scenario I should include an in_progress task");

  assert.equal(countContestantOverlaps(scenario.input, output), 0, "scenario I contestant overlaps");
  assert.equal(countSpaceOverlaps(scenario.input, output), 0, "scenario I space overlaps");
  assert.equal(countExclusiveResourceOverlaps(scenario.input, output), 0, "scenario I exclusive resource overlaps");
  assert.equal(countExecutedTaskMoved(scenario.input, output), 0, "scenario I done/in_progress tasks must not move");
  assert.equal(countLockedTaskMoved(scenario.input, output), 0, "scenario I manual locks must be respected");
  assert.equal(countMealCrossings(scenario.input, output), 0, "scenario I tasks must not cross hard meal block");
  assert.equal(countContestantWindowViolations(scenario.input, output), 0, "scenario I contestant availability windows");
  assert.equal(countDependencyViolations(scenario.input, output), 0, "scenario I dependencies");
  const metrics = calculateMetrics(scenario.input, output, 0);
  assert.equal(metrics.selectedCandidateMetricsConsistent, true, "scenario I selected metrics must describe the final output");
  assert.equal(output.v3Meta?.selectedCandidateMetrics?.coachSwitchCount, metrics.coachSwitchCount, "scenario I metadata and benchmark coach-switch count");
}

// Escenario L — jornada audiovisual anonimizada: invariantes hard y consistencia de métricas.
{
  const { scenario, output } = run("L");
  const tasks = scenario.input.tasks ?? [];
  const talentIds = new Set(tasks.map((task: any) => Number(task.contestantId)).filter((id: number) => Number.isFinite(id) && id > 0));
  const spaceIds = new Set(tasks.map((task: any) => Number(task.spaceId)).filter((id: number) => Number.isFinite(id) && id > 0));
  const resourceNames = (scenario.input.planResourceItems ?? []).map((resource: any) => String(resource.name));

  assert.ok(talentIds.size >= 18 && talentIds.size <= 22, "scenario L should model 18-22 talents");
  assert.ok(tasks.length >= 90 && tasks.length <= 140, "scenario L should include 90-140 tasks");
  assert.ok(spaceIds.size >= 8 && spaceIds.size <= 12, "scenario L should use 8-12 spaces");
  assert.equal(resourceNames.filter((name: string) => name.startsWith("Coach ")).length, 2, "scenario L should include two coaches");
  assert.ok(resourceNames.filter((name: string) => name.startsWith("Camera ")).length >= 4, "scenario L should include camera resources");
  assert.ok(resourceNames.filter((name: string) => name.startsWith("Sound ")).length >= 3, "scenario L should include sound resources");
  assert.equal(tasks.filter((task: any) => task.status === "done").length, 2, "scenario L should include two done tasks");
  assert.equal(tasks.filter((task: any) => task.status === "in_progress").length, 1, "scenario L should include one in-progress task");
  assert.equal((scenario.input.locks ?? []).length, 2, "scenario L should include two manual locks");

  assert.equal(countContestantOverlaps(scenario.input, output), 0, "scenario L talent overlaps");
  assert.equal(countSpaceOverlaps(scenario.input, output), 0, "scenario L space overlaps");
  assert.equal(countExclusiveResourceOverlaps(scenario.input, output), 0, "scenario L exclusive resource overlaps");
  assert.equal(countExecutedTaskMoved({ ...scenario.input, tasks: tasks.filter((task: any) => task.status === "done") }, output), 0, "scenario L done tasks must not move");
  assert.equal(countExecutedTaskMoved({ ...scenario.input, tasks: tasks.filter((task: any) => task.status === "in_progress") }, output), 0, "scenario L in-progress task must not move");
  assert.equal(countLockedTaskMoved(scenario.input, output), 0, "scenario L manual locks must not move");
  assert.equal(countMealCrossings(scenario.input, output), 0, "scenario L tasks must not cross hard meal");
  assert.equal(countContestantWindowViolations(scenario.input, output), 0, "scenario L talent availability");
  assert.equal(countDependencyViolations(scenario.input, output), 0, "scenario L dependencies");

  const metrics = calculateMetrics(scenario.input, output, 0);
  assert.equal(output.complete, true, "scenario L must remain complete");
  assert.equal(metrics.hardConstraintViolations, 0, "scenario L must have no hard violations");
  assert.ok(output.v3Meta?.cpSatPilotReason, "scenario L must report pilot attempt or deterministic skip reason");
  assert.ok((output.v3Meta?.cpSatSegmentsAttempted ?? 0) >= 1 || output.v3Meta?.cpSatPilotReason === "no_valid_segments", "scenario L must attempt a bounded segment or explain deterministically why none is valid");
  assert.notEqual(output.v3Meta?.cpSatPilotReason, "task_limit_exceeded", "scenario L must not stop at the global task limit when valid segmentation is available");
  assert.ok((output.v3Meta?.neighborhoodCandidatesGenerated ?? 0) > 0, "scenario L should generate at least one operational neighborhood candidate");
  assert.ok(
    (output.v3Meta?.neighborhoodDepth2Candidates ?? 0) > 0
      || Object.keys(output.v3Meta?.neighborhoodRejectedReasons ?? {}).length > 0,
    "scenario L should evaluate depth 2 when viable or expose deterministic rejection diagnostics",
  );
  if (metrics.selectedCandidateMetrics !== null) {
    assert.equal(metrics.selectedCandidateMetricsConsistent, true, "scenario L selected metrics must describe final output");
  }
}

// Escenario M — un vecindario feeder-aware mejora y es seleccionado.
{
  const { scenario, output } = run("M");
  const metrics = calculateMetrics(scenario.input, output, 0);
  assert.equal(output.v3Meta?.neighborhoodSearchAttempted, true);
  assert.ok((output.v3Meta?.neighborhoodCandidatesGenerated ?? 0) > 0);
  assert.equal(output.v3Meta?.neighborhoodCandidateAccepted, true);
  assert.equal(output.v3Meta?.solutionSource, "operational_neighborhood");
  assert.equal(metrics.hardConstraintViolations, 0);
  assert.equal(metrics.selectedCandidateMetricsConsistent, true);
}


// Escenario N — la mejora requiere feeder_advance seguido de main_stage_gap_fill.
{
  const { scenario, output } = run("N");
  const metrics = calculateMetrics(scenario.input, output, 0);
  const greedyGap = calculateMetrics(scenario.input, scenario.neighborhoodSeedOutput!, 0).mainStageGapMinutes ?? 0;
  assert.equal(output.v3Meta?.neighborhoodSearchAttempted, true);
  assert.equal(output.v3Meta?.neighborhoodSearchDepth, 2);
  assert.ok((output.v3Meta?.neighborhoodChainsEvaluated ?? 0) > 0);
  assert.ok((output.v3Meta?.neighborhoodDepth2Candidates ?? 0) > 0);
  assert.equal(output.v3Meta?.neighborhoodCandidateAccepted, true);
  assert.equal(output.v3Meta?.neighborhoodAcceptedChain, "feeder_advance -> main_stage_gap_fill");
  assert.equal(output.v3Meta?.solutionSource, "operational_neighborhood");
  assert.ok((metrics.mainStageGapMinutes ?? 999) < greedyGap);
  assert.equal(metrics.hardConstraintViolations, 0);
  assert.equal(metrics.selectedCandidateMetricsConsistent, true);
}


// Escenario O — CP-SAT pilot acotado mejora Main Stage + feeders.
{
  const { scenario, output } = run("O");
  const metrics = calculateMetrics(scenario.input, output, 0);
  const baselineGap = calculateMetrics(scenario.input, scenario.cpSatPilotSeedOutput!, 0).mainStageGapMinutes ?? 0;
  assert.equal(output.v3Meta?.cpSatPilotAttempted, true);
  assert.equal(output.v3Meta?.cpSatPilotAccepted, true);
  assert.equal(output.v3Meta?.solutionSource, "cp_sat_pilot");
  assert.ok((metrics.mainStageGapMinutes ?? 999) < baselineGap);
  assert.equal(metrics.hardConstraintViolations, 0);
  assert.equal(metrics.selectedCandidateMetricsConsistent, true);
}

// Escenario P — el scope global excede el límite, pero un segmento local mejora el hueco.
{
  const { scenario, output } = run("P");
  const metrics = calculateMetrics(scenario.input, output, 0);
  const baselineGap = calculateMetrics(scenario.input, scenario.cpSatPilotSeedOutput!, 0).mainStageGapMinutes ?? 0;
  assert.equal(output.v3Meta?.cpSatPilotAttempted, true);
  assert.ok((output.v3Meta?.cpSatSegmentsAttempted ?? 0) >= 1);
  assert.ok((output.v3Meta?.cpSatSegmentsAccepted ?? 0) >= 1);
  assert.equal(output.v3Meta?.solutionSource, "cp_sat_pilot");
  assert.ok((metrics.mainStageGapMinutes ?? 999) < baselineGap);
  assert.equal(metrics.hardConstraintViolations, 0);
  assert.equal(metrics.selectedCandidateMetricsConsistent, true);
}


// Escenario Q — diagnóstico informativo de bundles sin alterar hard constraints.
{
  const { scenario, output } = run("Q");
  const metrics = calculateMetrics(scenario.input, output, 0);
  assert.equal(output.complete, true);
  assert.equal(metrics.hardConstraintViolations, 0);
  assert.ok((metrics.compositeResourceCandidateCount ?? 0) > 0);
  assert.ok((metrics.resourceDiagnosticWarnings?.length ?? 0) > 0);
  assert.ok(metrics.resourceDiagnosticWarnings?.some((warning) => warning.includes("RESOURCE_BUNDLE_CONFLICT")));
}

// Escenario R — bundles declarados actúan solo como desempate soft.
{
  const { scenario, output } = run("R");
  const metrics = calculateMetrics(scenario.input, output, 0);
  assert.equal(output.complete, true);
  assert.equal(metrics.hardConstraintViolations, 0);
  assert.ok(metrics.declaredResourceBundleCount > 0);
  assert.ok(metrics.bundleSpaceAffinityMatches > 0);
  assert.match(String(metrics.candidateSelectionReason), /bundle|resource coherence/i);
  assert.equal(metrics.selectedCandidateMetricsConsistent, true);
}

// Escenario S — el catálogo parcialmente inválido se diagnostica y solo su parte usable puntúa.
{
  const { scenario, output } = run("S");
  const metrics = calculateMetrics(scenario.input, output, 0);
  assert.equal(output.complete, true);
  assert.equal(metrics.hardConstraintViolations, 0);
  assert.ok(metrics.usableResourceBundleCount > 0);
  assert.ok(metrics.invalidResourceBundleCount > 0 || metrics.partiallyUsableResourceBundleCount > 0);
  assert.ok(metrics.resourceBundleValidationWarnings > 0);
  assert.ok(metrics.resourceDiagnosticWarnings?.some((warning) => warning.includes("BUNDLE_WITHOUT_COMPONENTS")));
  assert.ok(metrics.resourceDiagnosticWarnings?.some((warning) => warning.includes("DUPLICATE_BUNDLE_COMPONENT")));
  assert.ok(metrics.resourceDiagnosticWarnings?.some((warning) => warning.includes("BUNDLE_COMPONENT_UNKNOWN_RESOURCE_ITEM")));
  assert.ok(metrics.resourceDiagnosticWarnings?.some((warning) => warning.includes("BUNDLE_AFFINITY_UNKNOWN_SPACE")));
  assert.equal(metrics.selectedCandidateMetricsConsistent, true);
}

// Escenario T — gate final hard invalida un candidato solapado y conserva detalle por código.
{
  const { output } = run("T");
  assert.ok((output.v3Meta?.hardConstraintViolations ?? 0) > 0);
  assert.equal(output.v3Meta?.hardValidationPassed, false);
  assert.equal(output.complete, false);
  assert.equal(output.hardFeasible, false);
  assert.ok(output.v3Meta?.hardConstraintViolationCodes?.includes("CONTESTANT_OVERLAP"));
}


// Escenarios U/V — ventana flexible permitida y bloque real protegido.
{
  const flexible = run("U");
  const flexibleMetrics = calculateMetrics(flexible.scenario.input, flexible.output, 0);
  assert.equal(flexible.output.complete, true);
  assert.equal(flexibleMetrics.hardConstraintViolations, 0);
  assert.equal(countMealCrossings(flexible.scenario.input, flexible.output), 0);

  const protectedMeal = run("V");
  assert.equal(protectedMeal.output.complete, false);
  assert.ok((protectedMeal.output.v3Meta?.hardConstraintViolations ?? 0) > 0);
  assert.ok(protectedMeal.output.v3Meta?.hardConstraintViolationCodes?.includes("MEAL_CROSSING"));
  assert.ok(protectedMeal.output.v3Meta?.hardConstraintViolationDetails?.some((detail) => detail.details?.violationType === "MEAL_BLOCK_CROSSING"));
}

console.log("engine/v3/benchmarks/scenarios.spec.ts: OK");
