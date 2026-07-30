import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canonical } from "./runPlannerNextFocalA2RequiredAuditBenchmark";

const manifest = () => JSON.parse(readFileSync("engine/planner-next/benchmarks/focal-a2/focalA2BandSemanticsV4HistoricalManifest.json", "utf8"));
const output = JSON.parse(readFileSync("planner-next-focal-a2-reality-baseline-v1.json", "utf8"));

test("v4 withdraws the false gap and carries all 25 historical scenarios", () => {
  const historicalScenarioIds = Object.keys(manifest().scenarioDigests);
  assert.equal(historicalScenarioIds.length, 25);
  assert.ok(historicalScenarioIds.every((id) => output.scenarios[id] !== undefined));
  assert.ok(output.scenarios.focalA2InstrumentMetadataSemantics);
  assert.deepEqual(output.remainingGapCodes, []);
  assert.deepEqual(output.withdrawnAssumptionCodes, ["MAIN_FLOW_INSTRUMENT_REQUIREMENT_NOT_REPRESENTABLE"]);
  assert.equal(output.withdrawalEvidence.status, "WITHDRAWN_INVALID_OPERATIONAL_ASSUMPTION");
});

test("three metadata variants project and plan identically", () => {
  const scenario = output.scenarios.focalA2InstrumentMetadataSemantics;
  assert.equal(new Set(scenario.executionFingerprints).size, 1);
  assert.equal(scenario.informationalVariantDigests.length, 3);
  assert.equal(new Set(scenario.executionFingerprints).size, 1);
  assert.equal(scenario.annotations.length, 6);
  assert.equal(scenario.noInstrumentResources, true);
});

test("all independent flag combinations project Band only", () => {
  const combinations = output.scenarios.focalA2InstrumentMetadataSemantics.flagCombinations;
  const byId = Object.fromEntries(combinations.map((entry: any) => [entry.id, entry]));
  assert.deepEqual(byId.NEITHER.projection.requiredResourceIds, []);
  assert.deepEqual(byId.INSTRUMENT_ONLY.projection.requiredResourceIds, []);
  assert.deepEqual(byId.BAND_ONLY.projection.requiredResourceIds, byId.BOTH.projection.requiredResourceIds);
});

test("canonical comparison ignores runtime only", () => {
  assert.deepEqual(canonical({ runtimeMs: 1, branches: 2 }), canonical({ runtimeMs: 9, branches: 2 }));
  assert.notDeepEqual(canonical({ runtimeMs: 1, branches: 2 }), canonical({ runtimeMs: 1, branches: 3 }));
});
