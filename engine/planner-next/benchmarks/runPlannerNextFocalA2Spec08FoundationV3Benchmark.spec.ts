import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { buildSpec08V3Acceptance, validationAccepted, type RepositoryValidationEvidence } from "./runPlannerNextFocalA2Spec08FoundationV3Benchmark";
import { inspectProtectedHistoricalSubstrate } from "./focal-a2/focalA2ProtectedHistoricalSubstrate";

const directory = "engine/planner-next/benchmarks/focal-a2";
const manifest = JSON.parse(fs.readFileSync(`${directory}/focalA2Spec08FoundationV3HistoricalManifest.json`, "utf8"));
const substrateBuffer = fs.readFileSync(`${directory}/focalA2Spec08V3ProtectedSubstrate.json`);
const substrate = JSON.parse(substrateBuffer.toString("utf8"));
const historicalArtifact = JSON.parse(fs.readFileSync(`${directory}/focalA2Spec08FoundationV3AcceptedArtifact.json`, "utf8"));
const protectedHistory = inspectProtectedHistoricalSubstrate(
  { scenarios: substrate.scenarios, historicalSubstrate: { historicalEvidence: substrate.historicalEvidence } },
  manifest,
);
const validation: RepositoryValidationEvidence = {
  schemaVersion: "focal-a2-009r3-validator-v1",
  completedCommands: ["npm ci", "npm run check", "npm run build", "saturated-resource-window-tests", "planner-next-suite", "npm test"],
  mode: "current",
  protectedSubstrateObservedSha256: manifest.protectedSubstrateSha256,
};
const historicalChecks = () => structuredClone(historicalArtifact.checks);

test("superseded V3 cannot claim final acceptance after main-anchor support", () => {
  const checks = historicalChecks();
  checks.combinedUnsupportedAtomic = { ...checks.combinedUnsupportedAtomic, actual: [true, 0, 0, null], passed: false };

  assert.equal(manifest.supersededHistoricalScenarioIds.includes("focalA2Spec08FoundationConsolidation"), true);
  assert.equal(buildSpec08V3Acceptance(checks, []).accepted, false);
  assert.equal(checks.combinedUnsupportedAtomic.passed, false);
});

test("protected V3 substrate and historical Evidence retain every manifest digest", () => {
  assert.equal(crypto.createHash("sha256").update(substrateBuffer).digest("hex"), manifest.protectedSubstrateSha256);
  assert.deepEqual(protectedHistory.scenarioMismatches, []);
  assert.deepEqual(protectedHistory.evidenceMismatches, []);
  assert.equal(protectedHistory.passed, true);
});

test("missing, incomplete, or forged repository validation cannot open acceptance", () => {
  const signals = [
    undefined,
    { ...validation, completedCommands: validation.completedCommands.slice(1) },
    { ...validation, protectedSubstrateObservedSha256: "poison" },
  ] as Array<RepositoryValidationEvidence | undefined>;

  for (const signal of signals) {
    const checks = historicalChecks();
    checks.finalRepositoryTestsAccepted = { ...checks.finalRepositoryTestsAccepted, actual: validationAccepted(signal, []), passed: false };
    assert.equal(validationAccepted(signal, []), false);
    assert.equal(buildSpec08V3Acceptance(checks, []).accepted, false);
  }
});

test("every required positive check remains an acceptance dependency", () => {
  for (const id of historicalArtifact.requiredPositiveChecks) {
    const checks = historicalChecks();
    checks[id] = { ...checks[id], passed: false };
    assert.equal(buildSpec08V3Acceptance(checks, []).accepted, false, id);
  }
  assert.equal(buildSpec08V3Acceptance(historicalChecks(), ["digest-poison"]).accepted, false);
});

test("historical artifacts are data guards and never planner seeds", () => {
  const runner = fs.readFileSync("engine/planner-next/benchmarks/runPlannerNextFocalA2Spec08FoundationV3Benchmark.ts", "utf8");
  const plannerCalls = [...runner.matchAll(/planMainFlowAndFeeders\(([^)]*)\)/g)].map((match) => match[1]);

  assert.ok(historicalArtifact.scenarios.focalA2Spec08NeutralStandaloneBlockRepair);
  assert.ok(plannerCalls.length > 0);
  assert.ok(plannerCalls.every((argument) => !/artifact|manifest|substrate/i.test(argument)));
  assert.equal(runner.includes("focalA2Spec08FoundationV3AcceptedArtifact.json"), false);
});
