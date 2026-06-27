import assert from "node:assert/strict";
import test from "node:test";
import { generatePlanV4 } from "../../v4";
import type { EngineInput } from "../../types";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { runGoldenBenchmarkSuite } from "./goldenBenchmarkSuite";
import { buildRealProductionScenarioSuite } from "./realProductionScenarioSuite";
import { goldenBenchmarkScenarios } from "./fixtures/goldenScenarios";
import { realProductionScenarios } from "./fixtures/real-scenarios/realProductionScenarios";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("buildRealProductionScenarioSuite supports an empty suite", () => {
  const suite = buildRealProductionScenarioSuite([]);
  assert.deepEqual(suite, { scenarios: [] });
});

test("buildRealProductionScenarioSuite exposes one or more real scenarios", () => {
  const suite = buildRealProductionScenarioSuite();
  assert.ok(suite.scenarios.length >= 1);
  assert.ok(suite.scenarios.every((scenario) => scenario.id.startsWith("real-")));
  assert.ok(suite.scenarios.every((scenario) => scenario.input.planId >= 12201));
});

test("buildRealProductionScenarioSuite is deterministic", () => {
  const first = buildRealProductionScenarioSuite();
  const second = buildRealProductionScenarioSuite();
  assert.equal(structuralEquals(first, second), true);
});

test("buildRealProductionScenarioSuite preserves structural equality", () => {
  const first = buildRealProductionScenarioSuite(realProductionScenarios);
  const second = buildRealProductionScenarioSuite(realProductionScenarios);
  assert.equal(stableStringify(first), stableStringify(second));
});

test("buildRealProductionScenarioSuite does not mutate fixtures or caller scenarios", () => {
  const scenarios = clone(realProductionScenarios);
  const beforeFixtures = stableStringify(realProductionScenarios);
  const beforeCaller = stableStringify(scenarios);

  const suite = buildRealProductionScenarioSuite(scenarios);
  suite.scenarios[0].input.tasks[0].status = "done";

  assert.equal(stableStringify(realProductionScenarios), beforeFixtures);
  assert.equal(stableStringify(scenarios), beforeCaller);
});

test("runGoldenBenchmarkSuite can optionally include real production scenarios", () => {
  const goldenOnly = runGoldenBenchmarkSuite(goldenBenchmarkScenarios);
  const withReal = runGoldenBenchmarkSuite(goldenBenchmarkScenarios, { includeRealProductionScenarios: true });

  assert.equal(withReal.scenariosExecuted, goldenBenchmarkScenarios.length + realProductionScenarios.length);
  assert.equal(withReal.reports.length, withReal.scenariosExecuted);
  assert.ok(withReal.scenariosExecuted > goldenOnly.scenariosExecuted);
});

test("runGoldenBenchmarkSuite can include an explicit real production scenario subset", () => {
  const report = runGoldenBenchmarkSuite([], {
    includeRealProductionScenarios: true,
    realProductionScenarios: [realProductionScenarios[0]],
  });

  assert.equal(report.scenariosExecuted, 1);
  assert.equal(report.reports.length, 1);
});

test("real production scenarios do not change generatePlanV4 output", () => {
  for (const scenario of realProductionScenarios) {
    const input = scenario.input as EngineInput;
    const before = generatePlanV4(input, { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any).output;
    buildRealProductionScenarioSuite([scenario]);
    const after = generatePlanV4(input, { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any).output;
    assert.equal(stableStringify(after), stableStringify(before));
  }
});
