import assert from "node:assert/strict";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { compareCandidateSolutions, scoreCandidateSolution } from "./solutionScoring";
import { generatePlanV3 } from "./index";
import { scenarioById } from "./benchmarks/scenarios";
import { countHardConstraintViolations } from "./benchmarks/metrics";

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

console.log("engine/v3/solutionScoring.spec.ts: OK");
