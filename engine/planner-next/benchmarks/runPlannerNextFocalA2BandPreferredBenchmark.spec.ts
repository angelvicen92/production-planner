import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonical } from "./runPlannerNextFocalA2BandPreferredBenchmark";

const current = JSON.parse(readFileSync("planner-next-focal-a2-reality-baseline-v1.json", "utf8"));
const manifest = JSON.parse(readFileSync(
  "engine/planner-next/benchmarks/focal-a2/focalA2BandPreferredV2HistoricalManifest.json",
  "utf8",
));

test("current artifact retains the v2 preferred historical scenarios and frozen plans", () => {
  const historicalScenarioIds = Object.keys(manifest.scenarioDigests);
  assert.equal(historicalScenarioIds.length, 23);
  assert.ok(historicalScenarioIds.every((id) => current.scenarios[id] !== undefined));
  assert.equal(current.preferredPlan.fingerprint, "cff587b5eac3b77d6e81589791035aead34187b65ab248d9586e462294e0087b");
  assert.equal(current.preferredPlan.branches, 15599);
  assert.deepEqual(current.scenarios.focalA2BandPreferredAudit.preferred.bandPresence.preferredLexicographicTuple, [4, 330, 60]);
  const scheduled = current.preferredPlan.scheduledTasks;
  assert.equal(Math.max(...scheduled.map((task: any) => task.end)) - Math.min(...scheduled.map((task: any) => task.start)), 450);
  assert.equal(current.preferredPlan.mainFlowSpanMinutes, 360);
  assert.equal(current.currentOff.fingerprint, "76f52d292e810ab8506ba868d77036126f299bcf129462a62b6c3b49a13be4fc");
  assert.equal(current.currentOff.branches, 64558);
  assert.deepEqual(current.acceptedFocalPlanBandPresence.preferredLexicographicTuple, [6, 345, 75]);
});

test("preferred v2 historical manifest remains a real digest guard", () => {
  assert.equal(manifest.sourceArtifactVersion, "planner-next-focal-a2-band-preferred-v1");
  assert.equal(typeof manifest.sourceArtifactSha256, "string");
  assert.equal(manifest.sourceArtifactSha256.length, 64);
  assert.notDeepEqual(canonical({ runtimeMs: 1, branches: 2 }), canonical({ runtimeMs: 1, branches: 3 }));
});
