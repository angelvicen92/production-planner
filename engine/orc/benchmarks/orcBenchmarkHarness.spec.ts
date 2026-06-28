import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { generatePlanV4 } from "../../v4";
import { benchmarkScenarios } from "../../v3/benchmarks/scenarios";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { runORCShadowMode } from "../shadow/runORCShadowMode";
import { ORC_BENCHMARK_VERSION, runORCBenchmark } from "./orcBenchmarkHarness";

const minimalInput = (): EngineInput => ({
  planId: 113,
  workDay: { start: "09:00", end: "18:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 2,
  tasks: [
    { id: 1, planId: 113, templateId: 10, status: "pending", contestantId: 1, zoneId: 10, spaceId: 10, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7] },
    { id: 2, planId: 113, templateId: 11, status: "pending", contestantId: 1, zoneId: 10, spaceId: 10, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [7] },
    { id: 3, planId: 113, templateId: 12, status: "pending", contestantId: 2 },
  ],
  locks: [],
  optimizerMainZoneId: 10,
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [{ id: 7, resourceItemId: 70, typeId: 1, name: "Camera 1", isAvailable: true }],
  resourceItemComponents: {},
  groupingZoneIds: [],
});

const comparableV4 = (result: ReturnType<typeof generatePlanV4>) => ({
  feasible: result.output.feasible,
  complete: result.output.complete,
  hardFeasible: result.output.hardFeasible,
  plannedTasks: result.output.plannedTasks,
  unplanned: result.output.unplanned,
  warnings: result.output.warnings,
  reasons: result.output.reasons,
});

test("runORCBenchmark produces minimum deterministic benchmark metrics", () => {
  const result = runORCBenchmark(minimalInput(), { createdAt: "2026-06-26T14:52:00.000Z" });
  assert.equal(result.executionTimeMs, 0);
  assert.ok(result.opportunitiesDetected > 0);
  assert.equal(result.diagnosesGenerated, result.opportunitiesDetected);
  assert.ok(result.candidateStatesGenerated >= result.candidatesGenerated);
  assert.equal(result.simulatedStatesGenerated, result.candidateStatesGenerated);
  assert.equal(result.validationResultsGenerated, result.simulatedStatesGenerated);
  assert.equal(result.operationalValuesGenerated, result.validationResultsGenerated);
  assert.equal(result.commitDecisionsGenerated, result.operationalValuesGenerated);
  assert.equal(result.summary.benchmarkVersion, ORC_BENCHMARK_VERSION);
});

test("runORCBenchmark exposes stable evidence and aggregate metrics", () => {
  const result = runORCBenchmark(minimalInput(), { createdAt: "2026-06-26T14:52:00.000Z", executionTimeMs: 12.3456789 });
  const summary = result.summary as Record<string, any>;
  assert.equal(result.executionTimeMs, 12.345679);
  assert.equal(summary.configuration.createdAt, "2026-06-26T14:52:00.000Z");
  assert.equal(summary.evidence.timestamp, "2026-06-26T14:52:00.000Z");
  assert.equal(summary.evidence.benchmarkVersion, ORC_BENCHMARK_VERSION);
  assert.equal(summary.evidence.configuration.planningInfluence, "none");
  assert.equal(typeof summary.metrics.averageSearchSpaceSize, "number");
  assert.equal(typeof summary.metrics.candidatesPerSearchSpace, "number");
  assert.equal(typeof summary.metrics.pruningPercentage, "number");
});

test("runORCBenchmark is deterministic with the same input and injected timestamp", () => {
  const input = minimalInput();
  const first = runORCBenchmark(input, { createdAt: "2026-06-26T14:52:00.000Z" });
  const second = runORCBenchmark(input, { createdAt: "2026-06-26T14:52:00.000Z" });
  assert.equal(structuralEquals(first, second), true);
});

test("runORCBenchmark preserves structural equality over repeated executions", () => {
  const results = Array.from({ length: 3 }, () => runORCBenchmark(minimalInput(), { createdAt: null }));
  assert.equal(structuralEquals(results[0], results[1]), true);
  assert.equal(structuralEquals(results[1], results[2]), true);
});

test("runORCBenchmark does not mutate EngineInput", () => {
  const input = minimalInput();
  const before = stableStringify(input);
  runORCBenchmark(input, { createdAt: "2026-06-26T14:52:00.000Z" });
  assert.equal(stableStringify(input), before);
});

test("runORCBenchmark integrates with Shadow Mode counts", () => {
  const input = minimalInput();
  const createdAt = "2026-06-26T14:52:00.000Z";
  const benchmark = runORCBenchmark(input, { createdAt });
  const shadow = runORCShadowMode(input, { enabled: true, createdAt });
  assert.notEqual(shadow, null);
  assert.equal(benchmark.opportunitiesDetected, shadow?.opportunities.length);
  assert.equal(benchmark.searchSpacesGenerated, shadow?.searchSpaces.length);
  assert.equal(benchmark.candidatesGenerated, shadow?.candidates.length);
  assert.deepEqual(benchmark.reasoningBudgetConsumed, shadow?.cognitiveState.reasoningBudget);
});

test("runORCBenchmark does not alter generatePlanV4 output", () => {
  const scenario = benchmarkScenarios[0];
  const input = scenario.input as EngineInput;
  const options = { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any;
  const before = generatePlanV4(input, options);
  runORCBenchmark(input, { createdAt: null });
  const after = generatePlanV4(input, options);
  assert.equal(structuralEquals(comparableV4(before), comparableV4(after)), true);
});
