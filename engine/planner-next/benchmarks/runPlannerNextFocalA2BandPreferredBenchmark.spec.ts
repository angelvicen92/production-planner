import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonical } from "./runPlannerNextFocalA2BandPreferredBenchmark";
import { inspectProtectedHistoricalSubstrate } from "./focal-a2/focalA2ProtectedHistoricalSubstrate";

const current = JSON.parse(readFileSync("planner-next-focal-a2-itinerant-spec08-foundation-v2.json", "utf8"));
const manifest = JSON.parse(readFileSync(
  "engine/planner-next/benchmarks/focal-a2/focalA2BandPreferredV2HistoricalManifest.json",
  "utf8",
));

const protectedSubstrate = inspectProtectedHistoricalSubstrate(current, manifest);

test("current artifact retains the v2 preferred historical scenarios and frozen plans", () => {
  const historicalScenarioIds = Object.keys(manifest.scenarioDigests);
  assert.ok(protectedSubstrate.passed);
  assert.equal(historicalScenarioIds.length, 23);
  assert.ok(historicalScenarioIds.every((id) => protectedSubstrate.scenarios[id] !== undefined));
  assert.equal(protectedSubstrate.evidence.preferredPlan.fingerprint, "cff587b5eac3b77d6e81589791035aead34187b65ab248d9586e462294e0087b");
  assert.equal(protectedSubstrate.evidence.preferredPlan.branches, 15599);
  assert.deepEqual(current.scenarios.focalA2BandPreferredAudit.preferred.bandPresence.preferredLexicographicTuple, [4, 330, 60]);
  const scheduled = protectedSubstrate.evidence.preferredPlan.scheduledTasks;
  assert.equal(Math.max(...scheduled.map((task: any) => task.end)) - Math.min(...scheduled.map((task: any) => task.start)), 450);
  assert.equal(protectedSubstrate.evidence.preferredPlan.mainFlowSpanMinutes, 360);
  assert.equal(protectedSubstrate.evidence.currentOff.fingerprint, "76f52d292e810ab8506ba868d77036126f299bcf129462a62b6c3b49a13be4fc");
  assert.equal(protectedSubstrate.evidence.currentOff.branches, 64558);
});

test("preferred v2 historical manifest remains a real digest guard", () => {
  assert.equal(manifest.sourceArtifactVersion, "planner-next-focal-a2-band-preferred-v1");
  assert.equal(typeof manifest.sourceArtifactSha256, "string");
  assert.equal(manifest.sourceArtifactSha256.length, 64);
  assert.notDeepEqual(canonical({ runtimeMs: 1, branches: 2 }), canonical({ runtimeMs: 1, branches: 3 }));
});
