import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildRealityArtifact, digest } from "./runPlannerNextFocalA2RealityBaselineBenchmark";

const source = () => JSON.parse(readFileSync("planner-next-focal-a2-reality-baseline-v1.json", "utf8"));
const manifest = () => JSON.parse(readFileSync("engine/planner-next/benchmarks/focal-a2/focalA2ItinerantUnitV2HistoricalManifest.json", "utf8"));

test("runner preserves 27 scenarios and adds the corrected contract audit", () => {
  const input = source();
  const before = digest(input);
  const output = buildRealityArtifact(input, manifest());
  assert.equal(digest(input), before);
  assert.equal(Object.keys(output.scenarios).length, 28);
  assert.equal(output.historicalRegressionEvidence.intact, true);
  assert.equal(output.withdrawnScenarioEvidence.status, "WITHDRAWN_INVALID_OPERATIONAL_PROJECTION");
  assert.equal(output.acceptance.accepted, true);
  assert.equal(output.acceptance.fullRealityBenchmarkPassed, false);
});

test("runner executes standalone input and refuses a false combined projection", () => {
  const output = buildRealityArtifact(source(), manifest());
  assert.match(output.standaloneRealityRun.status, /^EXECUTED_/);
  assert.equal(output.combinedRealityRun.status, "NOT_EXECUTED_UNREPRESENTABLE_INPUT");
  assert.deepEqual(output.confirmedGapCodes, [
    "ANCHORED_OPERATION_RELATIVE_SEGMENTS_NOT_EXPRESSIBLE",
    "MAIN_FLOW_GENERIC_ANCHORED_CLOSURE_NOT_EXPRESSIBLE",
  ]);
  assert.equal(output.invalidStandaloneSubstitutionControl.validProjection, false);
});
