import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { generatePlanV4 } from "../../v4";
import { benchmarkScenarios } from "../../v3/benchmarks/scenarios";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { DEFAULT_ORC_CONFIGURATION, ORCIntegrationMode, normalizeORCConfiguration } from "./orcIntegrationMode";
import { runORCShadowMode } from "../shadow/runORCShadowMode";

const shadowComparable = (input: EngineInput, integrationMode: ORCIntegrationMode) => {
  const result = runORCShadowMode(input, { createdAt: "2026-06-27T00:00:00.000Z", configuration: { integrationMode } });
  assert.notEqual(result, null);
  return {
    opportunities: result.opportunities,
    searchSpaces: result.searchSpaces,
    candidates: result.candidates,
    candidateStates: result.candidateStates,
    simulatedStates: result.simulatedStates,
    validationResults: result.validationResults,
    operationalValues: result.operationalValues,
    commitDecisions: result.commitDecisions,
    advisoryDecision: result.advisoryDecision,
    summary: {
      ...result.summary,
      integrationMode: ORCIntegrationMode.Shadow,
      configuration: DEFAULT_ORC_CONFIGURATION,
    },
  };
};

const v4Comparable = (result: ReturnType<typeof generatePlanV4>) => ({
  feasible: result.output.feasible,
  complete: result.output.complete,
  hardFeasible: result.output.hardFeasible,
  plannedTasks: result.output.plannedTasks,
  unplanned: result.output.unplanned,
  warnings: result.output.warnings,
  reasons: result.output.reasons,
});

test("DEFAULT_ORC_CONFIGURATION is immutable and defaults to shadow mode", () => {
  assert.equal(DEFAULT_ORC_CONFIGURATION.integrationMode, ORCIntegrationMode.Shadow);
  assert.equal(Object.isFrozen(DEFAULT_ORC_CONFIGURATION), true);
  assert.throws(() => ((DEFAULT_ORC_CONFIGURATION as { integrationMode: ORCIntegrationMode }).integrationMode = ORCIntegrationMode.Disabled), TypeError);
});

test("normalizeORCConfiguration returns immutable centralized configuration without mutating input", () => {
  const partial = { integrationMode: ORCIntegrationMode.Advisory };
  const before = stableStringify(partial);
  const configuration = normalizeORCConfiguration(partial);
  assert.deepEqual(configuration, { integrationMode: ORCIntegrationMode.Advisory });
  assert.equal(Object.isFrozen(configuration), true);
  assert.equal(stableStringify(partial), before);
});

test("Disabled mode disables ORC shadow execution", () => {
  const input = benchmarkScenarios[0].input as EngineInput;
  assert.equal(runORCShadowMode(input, { configuration: { integrationMode: ORCIntegrationMode.Disabled } }), null);
});

test("Shadow mode records active mode and configuration in summary evidence", () => {
  const input = benchmarkScenarios[0].input as EngineInput;
  const result = runORCShadowMode(input, { createdAt: "2026-06-27T00:00:00.000Z", configuration: { integrationMode: ORCIntegrationMode.Shadow } });
  assert.notEqual(result, null);
  assert.equal(result.summary.integrationMode, ORCIntegrationMode.Shadow);
  assert.deepEqual(result.summary.configuration, DEFAULT_ORC_CONFIGURATION);
  const summaryEvidence = result.evidence.find((item) => item.kind === "shadow-mode-summary");
  assert.equal(summaryEvidence?.data.integrationMode, ORCIntegrationMode.Shadow);
  assert.deepEqual(summaryEvidence?.data.configuration, DEFAULT_ORC_CONFIGURATION);
});

test("Advisory mode is structurally equal to Shadow mode for current read-only ORC behavior", () => {
  const input = benchmarkScenarios[0].input as EngineInput;
  assert.equal(structuralEquals(shadowComparable(input, ORCIntegrationMode.Shadow), shadowComparable(input, ORCIntegrationMode.Advisory)), true);
});

test("ORC integration modes do not alter generatePlanV4 output", () => {
  const input = benchmarkScenarios[0].input as EngineInput;
  const options = { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any;
  const baseline = v4Comparable(generatePlanV4(input, options));
  assert.equal(runORCShadowMode(input, { configuration: { integrationMode: ORCIntegrationMode.Disabled } }), null);
  const afterDisabled = v4Comparable(generatePlanV4(input, options));
  runORCShadowMode(input, { configuration: { integrationMode: ORCIntegrationMode.Shadow } });
  const afterShadow = v4Comparable(generatePlanV4(input, options));
  runORCShadowMode(input, { configuration: { integrationMode: ORCIntegrationMode.Advisory } });
  const afterAdvisory = v4Comparable(generatePlanV4(input, options));
  assert.equal(structuralEquals(baseline, afterDisabled), true);
  assert.equal(structuralEquals(baseline, afterShadow), true);
  assert.equal(structuralEquals(baseline, afterAdvisory), true);
});
