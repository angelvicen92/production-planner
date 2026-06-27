import test from "node:test";
import assert from "node:assert/strict";

import { benchmarkScenarios } from "../../v3/benchmarks/scenarios";
import { generatePlanV4 } from "../../v4";
import { stableStringify } from "../structuralEquality";
import { runShadowSearchBenchmark, type ShadowBenchmarkResult } from "./shadowSearchBenchmark";

const scenario = benchmarkScenarios[0];
const planningFingerprint = (output: ReturnType<typeof generatePlanV4>["output"]): string => stableStringify({
  feasible: output.feasible,
  complete: output.complete,
  hardFeasible: output.hardFeasible,
  plannedTasks: output.plannedTasks,
  unplanned: output.unplanned ?? [],
  reasons: output.reasons ?? [],
});
const deterministicClock = () => 0;
const withoutTime = (result: ShadowBenchmarkResult): ShadowBenchmarkResult => ({
  ...result,
  v4: { ...result.v4, executionTimeMs: 0 },
  orc: { ...result.orc, executionTimeMs: 0 },
  differences: result.differences.filter((difference) => !difference.startsWith("Execution time differs:")),
});

test("runShadowSearchBenchmark supports an empty benchmark", () => {
  const result = runShadowSearchBenchmark({ scenarios: [], now: deterministicClock });

  assert.deepEqual(result, {
    v4: { exploredSolutions: 0, bestSolutionScore: null, executionTimeMs: 0, matchesV4Output: true },
    orc: { exploredSolutions: 0, bestSolutionScore: null, executionTimeMs: 0, matchesV4Output: true },
    differences: [],
  });
});

test("runShadowSearchBenchmark produces standard V4 and ORC metrics", () => {
  const result = runShadowSearchBenchmark({ scenarios: [scenario], now: deterministicClock });

  assert.equal(typeof result.v4.exploredSolutions, "number");
  assert.equal(typeof result.orc.exploredSolutions, "number");
  assert.equal(result.v4.executionTimeMs, 0);
  assert.equal(result.orc.executionTimeMs, 0);
});

test("runShadowSearchBenchmark preserves V4 planning output equality", () => {
  const before = planningFingerprint(generatePlanV4(JSON.parse(JSON.stringify(scenario.input)), { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any).output);
  const result = runShadowSearchBenchmark({ scenarios: [scenario], now: deterministicClock });
  const after = planningFingerprint(generatePlanV4(JSON.parse(JSON.stringify(scenario.input)), { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any).output);

  assert.equal(result.v4.matchesV4Output, true);
  assert.equal(result.orc.matchesV4Output, true);
  assert.equal(after, before);
});

test("runShadowSearchBenchmark is deterministic except execution time", () => {
  const first = runShadowSearchBenchmark({ scenarios: [scenario] });
  const second = runShadowSearchBenchmark({ scenarios: [scenario] });

  assert.deepEqual(withoutTime(first), withoutTime(second));
});

test("ShadowBenchmarkResult is serializable", () => {
  const result = runShadowSearchBenchmark({ scenarios: [scenario], now: deterministicClock });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("runShadowSearchBenchmark does not mutate scenarios", () => {
  const input = JSON.parse(JSON.stringify(scenario.input));
  const before = stableStringify(input);

  runShadowSearchBenchmark({ scenarios: [{ input }], now: deterministicClock });

  assert.equal(stableStringify(input), before);
});
