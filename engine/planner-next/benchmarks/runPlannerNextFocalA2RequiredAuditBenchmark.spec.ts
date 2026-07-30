import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { buildArtifact, canonical } from "./runPlannerNextFocalA2RequiredAuditBenchmark";

const sourcePath = () => existsSync("planner-next-focal-a2-band-required-audit-v3.json") ? "planner-next-focal-a2-band-required-audit-v3.json" : "planner-next-focal-a2-band-required-audit-v2.json";
const source = () => JSON.parse(readFileSync(sourcePath(), "utf8"));
const manifest = () => JSON.parse(readFileSync("engine/planner-next/benchmarks/focal-a2/focalA2BandRequiredCompositeV3HistoricalManifest.json", "utf8"));

test("the audit builder is serializable, explicit, and accepts expected false gates", () => {
  const output = buildArtifact(source(), manifest(), sourcePath());
  assert.doesNotThrow(() => JSON.stringify(output));
  assert.equal(output.acceptance.accepted, true);
  assert.equal(output.acceptance.currentRequiredAtomic, true);
  assert.equal(output.acceptance.fullBandBenchmarkPassed, false);
  assert.equal(Object.keys(output.scenarios).length, 25);
  assert.equal(output.focalRequiredFeasibilityEvidence.certificateDeterministic, true);
  assert.equal(output.focalRequiredFeasibilityEvidence.certificateOrderInvariant, true);
});

test("every manifest mismatch closes acceptance and poisoned source acceptance is not inherited", () => {
  const poisoned = source();
  poisoned.acceptance = { accepted: true, artifactAccepted: true };
  poisoned.scenarios.baseline = { poisoned: true };
  const output = buildArtifact(poisoned, manifest());
  assert.equal(output.acceptance.accepted, false);
  assert.deepEqual(output.historicalRegressionEvidence.scenarioDigestMismatchIds, ["baseline"]);
  assert.notDeepEqual(output.acceptance, poisoned.acceptance);
});

test("canonical comparison excludes runtimeMs and no other evidence", () => {
  assert.deepEqual(canonical({ runtimeMs: 1, branches: 2 }), canonical({ runtimeMs: 99, branches: 2 }));
  assert.notDeepEqual(canonical({ runtimeMs: 1, branches: 2 }), canonical({ runtimeMs: 1, branches: 3 }));
});

test("the validator always leaves valid failure JSON without replacing the accepted artifact", () => {
  const active = sourcePath();
  const before = readFileSync(active);
  const result = spawnSync("bash", ["validate-focal-a2-005.sh", "__INVALID_MODE__"]);
  assert.notEqual(result.status, 0);
  const failed = JSON.parse(readFileSync("planner-next-focal-a2-band-required-audit-v3.failed.json", "utf8"));
  assert.equal(failed.accepted, false);
  assert.equal(failed.reason, "MODE_ARTIFACT_MISMATCH");
  assert.deepEqual(readFileSync(active), before);
  rmSync("planner-next-focal-a2-band-required-audit-v3.failed.json");
});
