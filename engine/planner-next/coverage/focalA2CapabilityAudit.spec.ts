import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { serializeFocalA2CoverageEvidence } from "../benchmarks/runFocalA2CoverageAuditBenchmark";
import { FOCAL_A2_CAPABILITY_CATALOG } from "./focalA2CapabilityCatalog";
import { buildFocalA2CapabilityAudit, evaluateA2Families } from "./focalA2CapabilityAudit";
import { deriveCoverageStatus, FOCAL_A2_EVIDENCE_REGISTRY } from "./focalA2EvidenceRegistry";
import { PLANNER_LAYER_PROBES, runSupportedIntegrationProbe } from "./focalA2CapabilityProbes";
import { FOCAL_A2_REQUIREMENTS } from "./focalA2SourceManifest";

test("catalog has exactly 167 unique explicit IDs and requirements", () => {
  assert.equal(FOCAL_A2_CAPABILITY_CATALOG.length, 167); assert.equal(new Set(FOCAL_A2_CAPABILITY_CATALOG.map(({ id }) => id)).size, 167);
  assert.equal(FOCAL_A2_REQUIREMENTS.length, 167); assert.deepEqual(FOCAL_A2_REQUIREMENTS.map(({ capabilityId }) => capabilityId), FOCAL_A2_CAPABILITY_CATALOG.map(({ id }) => id));
});
test("requirements source contains neither regex nor generated range decisions", () => {
  const source = readFileSync("engine/planner-next/coverage/focalA2SourceManifest.ts", "utf8");
  assert.doesNotMatch(source, /RegExp|\.match\(|\.test\(|capability\.name|for\s*\(|\.includes\(.*name/); assert.equal((source.match(/capabilityId:/g) ?? []).length, 168);
});
test("classifier covers every branch and missing audit is not a contract gap", () => {
  const cases = [
    [{ requirement: "REQUIRED", audited: false }, "NOT_AUDITED"], [{ requirement: "UNRESOLVED", audited: true }, "SOURCE_AMBIGUOUS"],
    [{ requirement: "REQUIRED", audited: true, productPhase: true }, "PRODUCT_PHASE_NOT_IMPLEMENTED"], [{ requirement: "REQUIRED", audited: true, contractGap: "ENGINE_INPUT" }, "CONTRACT_GAP"],
    [{ requirement: "REQUIRED", audited: true, supportedVariants: ["a"], unsupportedVariants: ["b"] }, "PARTIALLY_SUPPORTED"], [{ requirement: "REQUIRED", audited: true, negativeReasonCode: "REAL_CODE" }, "EXPLICITLY_UNSUPPORTED"],
    [{ requirement: "REQUIRED", audited: true, technicalPathComplete: true, concreteTest: true }, "CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE"],
    [{ requirement: "REQUIRED", audited: true, technicalPathComplete: true, concreteTest: true, concreteBenchmark: true, representativeA2: true }, "EVIDENCED_SUPPORTED"],
  ] as const;
  for (const [input, expected] of cases) assert.equal(deriveCoverageStatus(input).status, expected);
});
test("end-to-end probe invokes dispatcher and canonical validator without mutation", () => {
  const probe = runSupportedIntegrationProbe(); assert.equal(probe.preflightStatus, "SUPPORTED"); assert.equal(probe.adapterStatus, "SUPPORTED");
  assert.equal(probe.dispatcherStatus, "SUPPORTED"); assert.equal(probe.validationStatus, "SUPPORTED"); assert.equal(probe.inputImmutable, true);
  assert.deepEqual(probe.exactFunctionExecuted, ["preflightEngineInputForPlannerNext", "adaptEngineInputToPlannerNextProblem", "executePlannerNext", "validatePlan"]);
});
test("planner-layer probes honestly mark omitted integration layers", () => {
  for (const probe of PLANNER_LAYER_PROBES) { assert.equal(probe.probeScope, "PLANNER_LAYER"); assert.equal(probe.preflightStatus, "NOT_EXECUTED"); assert.equal(probe.adapterStatus, "NOT_EXECUTED"); assert.equal(probe.dispatcherStatus, "NOT_EXECUTED"); }
});
test("all structured file and benchmark scenario references exist", () => {
  const manifests = new Map<string, unknown>();
  for (const record of FOCAL_A2_EVIDENCE_REGISTRY) for (const evidence of [...record.testEvidence, ...record.benchmarkEvidence]) {
    assert.equal(existsSync(evidence.file), true, `${evidence.file} missing`);
    if (evidence.scenarioId) { const parsed = manifests.get(evidence.file) ?? JSON.parse(readFileSync(evidence.file, "utf8")); manifests.set(evidence.file, parsed); assert.ok(readFileSync(evidence.file, "utf8").includes(`\"${evidence.scenarioId}\"`), `${evidence.scenarioId} missing`); }
  }
  assert.equal(readFileSync("engine/planner-next/benchmarks/fixtures/spec10-011-protected-task-resource-availability-evidence.json", "utf8").includes("in-progress-generic-lock-compatible"), false);
});
test("known corrections are evidence-derived rather than fictitious gaps", () => {
  const status = (id: number) => FOCAL_A2_EVIDENCE_REGISTRY.find((row) => row.capabilityId === id)!.derivedCoverageStatus;
  assert.notEqual(status(12), "CONTRACT_GAP"); assert.notEqual(status(13), "CONTRACT_GAP"); assert.equal(status(16), "PARTIALLY_SUPPORTED");
  assert.notEqual(status(18), "CONTRACT_GAP"); assert.equal(status(19), "PARTIALLY_SUPPORTED"); assert.notEqual(status(41), "CONTRACT_GAP"); assert.notEqual(status(120), "CONTRACT_GAP");
  for (const id of [134, 135, 136]) assert.equal(status(id), "EXPLICITLY_UNSUPPORTED");
});
test("Reality and vocal families use executable exact assertions", () => {
  const families = new Map(evaluateA2Families().map((entry) => [entry.id, entry]));
  assert.equal(families.get("reality-a")?.status, "ENGINE_SUPPORTED_INTEGRATION_MISSING"); assert.match(families.get("reality-a")!.assertion, /exact/);
  assert.equal(families.get("reality-b")?.status, "ENGINE_SUPPORTED_INTEGRATION_MISSING"); assert.equal(families.get("reality-combined")?.status, "ENGINE_SUPPORTED_INTEGRATION_MISSING");
  assert.equal(families.get("vocal-aggregate")?.status, "ENGINE_SUPPORTED_INTEGRATION_MISSING"); assert.equal(families.get("vocal-jose-maria")?.status, "PARTIALLY_REPRESENTED");
});
test("coverage and product readiness are separate and incomplete audit gates implementation", () => {
  const audit = buildFocalA2CapabilityAudit(); assert.equal(audit.fullA2PlanningCoverage, false); assert.equal(audit.fullA2ProductReadiness, false);
  assert.equal(audit.recommendation.type, "CLARIFY_DOMAIN"); assert.equal(audit.recommendation.selectedCapabilityId, 141); assert.ok(audit.notAuditedCapabilityIds.length > 0);
});
test("audit serialization is byte deterministic and read-only", () => {
  const first = serializeFocalA2CoverageEvidence(); const second = serializeFocalA2CoverageEvidence(); assert.equal(first, second); assert.deepEqual(JSON.parse(first), JSON.parse(second));
  const audit = buildFocalA2CapabilityAudit(); assert.equal(audit.readOnly, true); assert.equal(audit.inputImmutable, true);
});
test("coverage tooling is not exported by the production entrypoint", () => assert.doesNotMatch(readFileSync("engine/planner-next/index.ts", "utf8"), /coverage|focalA2CapabilityAudit/));
