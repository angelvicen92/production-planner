import assert from "node:assert/strict";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { compareCandidateSolutions, explainCandidateComparison, scoreCandidateSolution } from "./solutionScoring";
import { generatePlanV3 } from "./index";
import { scenarioById } from "./benchmarks/scenarios";
import { calculateMetrics, countHardConstraintViolations } from "./benchmarks/metrics";

const baseInput = (overrides: Partial<EngineV3Input> = {}): EngineV3Input => ({
  planId: 7007,
  workDay: { start: "09:00", end: "11:00" },
  meal: { start: "12:00", end: "12:30" },
  camerasAvailable: 2,
  contestantMealDurationMinutes: 30,
  contestantMealMaxSimultaneous: 10,
  tasks: [
    { id: 1, planId: 7007, templateId: 1, templateName: "Main A", zoneId: 1, spaceId: 101, contestantId: 1, status: "pending", durationOverrideMin: 30 },
    { id: 2, planId: 7007, templateId: 2, templateName: "Main B", zoneId: 1, spaceId: 101, contestantId: 2, status: "pending", durationOverrideMin: 30 },
    { id: 3, planId: 7007, templateId: 3, templateName: "Aux", zoneId: 2, spaceId: 202, contestantId: 3, status: "pending", durationOverrideMin: 30 },
  ] as any,
  locks: [],
  groupingZoneIds: [1],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [],
  resourceItemComponents: {},
  optimizerMainZoneId: 1,
  optimizerPrioritizeMainZone: true,
  optimizerMainZoneOptKeepBusy: true,
  ...overrides,
});

const output = (planned: Array<[number, string, string]>, unplanned: number[] = []): EngineOutput => ({
  feasible: true,
  complete: unplanned.length === 0,
  hardFeasible: true,
  plannedTasks: planned.map(([taskId, startPlanned, endPlanned]) => ({ taskId, startPlanned, endPlanned, assignedSpace: taskId === 3 ? 202 : 101, assignedResources: [] })),
  unplanned: unplanned.map((taskId) => ({ taskId, reason: { code: "TEST", message: "synthetic" } } as any)),
  warnings: [],
  reasons: [],
});

// Test 1 — Comparador lexicográfico.
{
  const input = baseInput({ contestantAvailabilityById: { 2: { start: "09:00", end: "09:30" } } });
  const valid = output([[2, "09:00", "09:30"]]);
  const hardViolation = output([[2, "09:30", "10:00"]]);
  assert.equal(scoreCandidateSolution(input, hardViolation).hardConstraintViolations, 1);
  assert.ok(compareCandidateSolutions(input, valid, hardViolation) > 0, "fewer hard violations wins");

  const morePlanned = output([[1, "09:00", "09:30"], [2, "09:30", "10:00"], [3, "09:00", "09:30"]]);
  const fewerPlanned = output([[1, "09:00", "09:30"], [2, "09:30", "10:00"]], [3]);
  assert.ok(compareCandidateSolutions(baseInput(), morePlanned, fewerPlanned) > 0, "more planned tasks wins");

  const compact = output([[1, "09:00", "09:30"], [2, "09:30", "10:00"], [3, "09:00", "09:30"]]);
  const gapped = output([[1, "09:00", "09:30"], [2, "10:00", "10:30"], [3, "09:00", "09:30"]]);
  assert.ok(compareCandidateSolutions(baseInput(), compact, gapped) > 0, "fewer main-stage gaps wins");

  const shorter = output([[1, "09:00", "09:30"], [2, "09:30", "10:00"]]);
  const longer = output([[1, "09:00", "09:30"], [2, "10:00", "10:30"]]);
  assert.ok(compareCandidateSolutions(baseInput({ optimizerMainZoneId: null }), shorter, longer) > 0, "lower makespan wins after earlier criteria tie");
}

// Test 2 — Desempate determinista.
{
  const input = baseInput({ optimizerMainZoneId: null });
  const a = output([[1, "09:00", "09:30"], [2, "09:30", "10:00"]]);
  const b = output([[2, "09:30", "10:00"], [1, "09:00", "09:30"]]);
  const results = Array.from({ length: 5 }, () => compareCandidateSolutions(input, a, b));
  assert.deepEqual(results, [results[0], results[0], results[0], results[0], results[0]]);
}

// Test 3 — Greedy se conserva si es mejor que una alternativa equivalente o peor.
{
  const scenario = scenarioById.get("H");
  assert.ok(scenario);
  const input = { ...scenario.input, v3GreedyProbeForcedTaskStarts: undefined, v3ComparativeProbeForcedTaskStarts: { 8002: 10 * 60 } } as any;
  const output = generatePlanV3(input, { timeLimitMs: 0 });
  assert.equal(output.complete, true);
  assert.notEqual(output.v3Meta?.solutionSource, "phaseA_backtracking");
}

// Test 4 + Test 5 — Backtracking se elige si mejora y escenario H evalúa candidatos.
{
  const scenario = scenarioById.get("H");
  assert.ok(scenario, "scenario H should exist");
  const output = generatePlanV3(scenario.input, { timeLimitMs: 0 });
  assert.equal(output.complete, true);
  assert.equal(output.v3Meta?.solutionSource, "phaseA_backtracking");
  assert.ok((output.v3Meta?.candidateSolutionsEvaluated ?? 0) >= 2);
  assert.match(String(output.v3Meta?.candidateSelectionReason ?? ""), /main-stage gaps|gap/);
  assert.equal(countHardConstraintViolations(scenario.input, output), 0);
}

// Test 6 — Hard constraints siguen inviolables frente a una alternativa inválida.
{
  const input = baseInput({ contestantAvailabilityById: { 2: { start: "09:00", end: "09:30" } } });
  const valid = output([[2, "09:00", "09:30"]], [1, 3]);
  const invalid = output([[1, "09:00", "09:30"], [2, "09:30", "10:00"], [3, "09:00", "09:30"]]);
  assert.ok(compareCandidateSolutions(input, valid, invalid) > 0, "hard-valid candidate beats invalid candidate even with fewer planned tasks");
}

// Test 7 — Candidate scoring prioriza timing de talent restrictivo cuando empatan hard/planned/gaps.
{
  const input = baseInput({
    optimizerMainZoneId: null,
    contestantAvailabilityById: {
      1: { start: "09:00", end: "11:00" },
      2: { start: "09:00", end: "10:30" },
      3: { start: "09:00", end: "11:00" },
    },
  });
  const earlyRestrictive = output([[1, "09:30", "10:00"], [2, "09:00", "09:30"], [3, "09:00", "09:30"]]);
  const lateRestrictive = output([[1, "09:00", "09:30"], [2, "09:30", "10:00"], [3, "09:00", "09:30"]]);
  const earlyScore = scoreCandidateSolution(input, earlyRestrictive);
  const lateScore = scoreCandidateSolution(input, lateRestrictive);
  assert.ok(earlyScore.restrictiveTalentLatenessPenalty < lateScore.restrictiveTalentLatenessPenalty);
  assert.ok(compareCandidateSolutions(input, earlyRestrictive, lateRestrictive) > 0, "earlier restrictive talent wins");
  assert.match(explainCandidateComparison("phaseA_backtracking", "phaseA_greedy", earlyScore, lateScore), /earlier restrictive talents/);
}

// Test 8 — Candidate scoring penaliza switches de coach cuando empatan hard/planned/gaps/restrictive.
{
  const input = baseInput({
    optimizerMainZoneId: null,
    planResourceItems: [
      { id: 501, resourceItemId: 9001, typeId: 10, name: "Coach Alpha", isAvailable: true },
      { id: 502, resourceItemId: 9002, typeId: 10, name: "Coach Beta", isAvailable: true },
    ],
    tasks: [
      { id: 1, planId: 7007, templateId: 1, templateName: "Coach A1", zoneId: 2, spaceId: 201, contestantId: 1, status: "pending", durationOverrideMin: 30, resourceRequirements: { byItem: { 9001: 1 } } },
      { id: 2, planId: 7007, templateId: 2, templateName: "Coach A2", zoneId: 2, spaceId: 202, contestantId: 2, status: "pending", durationOverrideMin: 30, resourceRequirements: { byItem: { 9001: 1 } } },
      { id: 3, planId: 7007, templateId: 3, templateName: "Coach B", zoneId: 2, spaceId: 203, contestantId: 3, status: "pending", durationOverrideMin: 30, resourceRequirements: { byItem: { 9002: 1 } } },
    ] as any,
  });
  const compactCoaches: EngineOutput = { ...output([]), plannedTasks: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedSpace: 201, assignedResources: [501] },
    { taskId: 2, startPlanned: "09:30", endPlanned: "10:00", assignedSpace: 202, assignedResources: [501] },
    { taskId: 3, startPlanned: "10:00", endPlanned: "10:30", assignedSpace: 203, assignedResources: [502] },
  ] };
  const alternatingCoaches: EngineOutput = { ...output([]), plannedTasks: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedSpace: 201, assignedResources: [501] },
    { taskId: 3, startPlanned: "09:30", endPlanned: "10:00", assignedSpace: 203, assignedResources: [502] },
    { taskId: 2, startPlanned: "10:00", endPlanned: "10:30", assignedSpace: 202, assignedResources: [501] },
  ] };
  const compactScore = scoreCandidateSolution(input, compactCoaches);
  const alternatingScore = scoreCandidateSolution(input, alternatingCoaches);
  assert.ok(compactScore.coachSwitchPenalty < alternatingScore.coachSwitchPenalty);
  assert.equal(compactScore.coachSwitchCount, calculateMetrics(input, compactCoaches, 0).coachSwitchCount, "scoring and benchmark must share coach-switch count");
  assert.equal(compactScore.coachSwitchPenalty, calculateMetrics(input, compactCoaches, 0).coachSwitchPenalty, "scoring and benchmark must share weighted coach-switch penalty");
  assert.ok(compareCandidateSolutions(input, compactCoaches, alternatingCoaches) > 0, "fewer coach switches wins");
  assert.match(explainCandidateComparison("phaseA_backtracking", "phaseA_greedy", compactScore, alternatingScore), /fewer coach switches/);
  const weightedOnlyScore = { ...alternatingScore, coachSwitchCount: compactScore.coachSwitchCount, coachSwitchPenalty: compactScore.coachSwitchPenalty + 1 };
  assert.match(
    explainCandidateComparison("phaseA_backtracking", "phaseA_greedy", compactScore, weightedOnlyScore),
    /lower weighted coach-switch penalty \(raw coach-switch count unchanged\)/,
    "selection reason must not claim fewer raw switches when only the weighted penalty improves",
  );
}

console.log("engine/v3/solutionScoring.spec.ts: OK");

// ID 019 — sin bundles el score permanece neutral; con bundles gana la coherencia declarada tras empatar criterios críticos.
{
  const scenario = scenarioById.get("R");
  assert.ok(scenario?.benchmarkCandidateOutputs, "scenario R should expose two valid candidates");
  const [coherent, incoherent] = scenario.benchmarkCandidateOutputs;
  const withoutBundles = {
    ...scenario.input,
    resourceBundles: undefined,
    resourceBundleComponents: undefined,
    resourceBundleSpaceAffinities: undefined,
  };
  assert.equal(compareCandidateSolutions(withoutBundles, coherent, incoherent), 0);
  assert.ok(compareCandidateSolutions(scenario.input, coherent, incoherent) > 0);
  assert.match(explainCandidateComparison("phaseA_backtracking", "phaseA_greedy", scoreCandidateSolution(scenario.input, coherent), scoreCandidateSolution(scenario.input, incoherent)), /bundle|resource coherence/i);
}

// ID 031 — compactación de coaches desempata después de criterios hard y de plató.
{
  const input = baseInput({
    optimizerMainZoneId: null,
    planResourceItems: [{ id: 501, resourceItemId: 9001, typeId: 10, name: "Coach", isAvailable: true }],
    tasks: [
      { id: 1, planId: 7007, templateId: 1, zoneId: 2, spaceId: 201, contestantId: 1, status: "pending", durationOverrideMin: 30 },
      { id: 2, planId: 7007, templateId: 2, zoneId: 2, spaceId: 202, contestantId: 2, status: "pending", durationOverrideMin: 30 },
    ] as any,
  });
  const compact = { ...output([]), plannedTasks: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [501] },
    { taskId: 2, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [501] },
  ] };
  const split = { ...output([]), plannedTasks: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [501] },
    { taskId: 2, startPlanned: "10:00", endPlanned: "10:30", assignedResources: [501] },
  ] };
  assert.ok(scoreCandidateSolution(input, compact).coachIdlePenalty < scoreCandidateSolution(input, split).coachIdlePenalty);
  assert.ok(compareCandidateSolutions(input, compact, split) > 0);
  assert.match(explainCandidateComparison("operational_neighborhood", "phaseA_greedy", scoreCandidateSolution(input, compact), scoreCandidateSolution(input, split)), /lower coach idle/);
}

// ID 031 — compactación de talents desempata cuando los criterios superiores permanecen iguales.
{
  const input = baseInput({ optimizerMainZoneId: null, tasks: [
    { id: 1, planId: 7007, templateId: 1, zoneId: 2, spaceId: 201, contestantId: 9, status: "pending", durationOverrideMin: 30 },
    { id: 2, planId: 7007, templateId: 2, zoneId: 2, spaceId: 202, contestantId: 9, status: "pending", durationOverrideMin: 30 },
  ] as any });
  const compact = output([[1, "09:00", "09:30"], [2, "09:30", "10:00"]]);
  const split = output([[1, "09:00", "09:30"], [2, "10:00", "10:30"]]);
  assert.ok(scoreCandidateSolution(input, compact).talentIdlePenalty < scoreCandidateSolution(input, split).talentIdlePenalty);
  assert.ok(compareCandidateSolutions(input, compact, split) > 0);
  assert.match(explainCandidateComparison("operational_neighborhood", "phaseA_greedy", scoreCandidateSolution(input, compact), scoreCandidateSolution(input, split)), /lower talent idle/);
}
