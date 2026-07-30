import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { buildArtifact } from "./runPlannerNextFocalA2BandPreferredBenchmark";

const sourcePath = existsSync("planner-next-focal-a2-band-semantics-v4.json")
  ? "planner-next-focal-a2-band-semantics-v4.json"
  : existsSync("planner-next-focal-a2-band-required-audit-v3.json")
    ? "planner-next-focal-a2-band-required-audit-v3.json"
  : existsSync("planner-next-focal-a2-band-preferred-v2.json")
  ? "planner-next-focal-a2-band-preferred-v2.json"
  : existsSync("planner-next-focal-a2-band-required-audit-v1.json")
    ? "planner-next-focal-a2-band-required-audit-v1.json"
    : "planner-next-focal-a2-band-preferred-v1.json";
const published = JSON.parse(readFileSync(sourcePath, "utf8"));
const source = !published.version.includes("band-preferred")
  ? { ...published, scenarios: Object.fromEntries(Object.entries(published.scenarios).filter(([id]) => !["focalA2BandRequiredAudit", "focalA2BandRequiredCompositeFoundationRepair", "focalA2InstrumentMetadataSemantics"].includes(id))) }
  : published;
const manifest = JSON.parse(
  readFileSync(
    "engine/planner-next/benchmarks/focal-a2/focalA2BandPreferredV2HistoricalManifest.json",
    "utf8",
  ),
);

test("v2 builder derives acceptance and preserves both frozen plans", () => {
  const poisoned = structuredClone(source);
  poisoned.acceptance = { accepted: false, acceptedMeaning: "not implemented" };
  poisoned.status = "POISONED";
  poisoned.preferredPolicyAccepted = false;
  const artifact = buildArtifact(poisoned, manifest);

  assert.equal(artifact.version, "planner-next-focal-a2-band-preferred-v2");
  assert.equal(artifact.acceptance.accepted, true);
  assert.match(artifact.acceptance.acceptedMeaning, /applies.*PREFERRED/);
  assert.equal(
    artifact.acceptance.currentPlannerMeetsPreferredBandBenchmark,
    true,
  );
  assert.equal(artifact.acceptance.currentPlannerMeetsFullBandBenchmark, false);
  assert.equal(artifact.acceptance.fullBandBenchmarkPassed, false);
  assert.equal(
    artifact.preferredPlan.fingerprint,
    "cff587b5eac3b77d6e81589791035aead34187b65ab248d9586e462294e0087b",
  );
  assert.equal(artifact.preferredPlan.branches, 15599);
  assert.deepEqual(
    artifact.preferredPlan.bandPresence.preferredLexicographicTuple,
    [4, 330, 60],
  );
  assert.equal(artifact.preferredPlan.focalMakespanMinutes, 450);
  assert.equal(artifact.preferredPlan.mainFlowSpanMinutes, 360);
  assert.equal(
    artifact.currentOff.fingerprint,
    "76f52d292e810ab8506ba868d77036126f299bcf129462a62b6c3b49a13be4fc",
  );
  assert.equal(artifact.currentOff.branches, 64558);
  assert.deepEqual(
    artifact.currentOff.bandPresence.preferredLexicographicTuple,
    [6, 345, 75],
  );
  assert.equal(artifact.preferredEvidence.deterministic, true);
  assert.equal(artifact.preferredEvidence.orderInvariant, true);
  assert.equal(artifact.preferredEvidence.inputUnchanged, true);
  assert.equal(Object.keys(artifact.scenarios).length, 23);
  assert.doesNotThrow(() => JSON.stringify(artifact));
});

test("historical digest and frozen fingerprint mismatches close acceptance", () => {
  const badDigest = structuredClone(manifest);
  badDigest.scenarioDigests.baseline = "bad";
  const digestArtifact = buildArtifact(source, badDigest);
  assert.equal(digestArtifact.acceptance.accepted, false);
  assert.deepEqual(
    digestArtifact.historicalRegressionEvidence.scenarioDigestMismatchIds,
    ["baseline"],
  );

  const badFingerprint = structuredClone(manifest);
  badFingerprint.frozenFingerprints.baseline = "bad";
  const fingerprintArtifact = buildArtifact(source, badFingerprint);
  assert.equal(fingerprintArtifact.acceptance.accepted, false);
  assert.deepEqual(
    fingerprintArtifact.historicalRegressionEvidence.fingerprintMismatchIds,
    ["baseline"],
  );
});
