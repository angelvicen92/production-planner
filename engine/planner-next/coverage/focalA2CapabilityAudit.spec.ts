import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { serializeFocalA2CoverageEvidence } from "../benchmarks/runFocalA2CoverageAuditBenchmark";
import { buildFocalA2CapabilityAudit, selectNextAction } from "./focalA2CapabilityAudit";
import { FOCAL_A2_CAPABILITY_CATALOG } from "./focalA2CapabilityCatalog";
import { FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS } from "./focalA2CapabilityEvidenceBindings";
import { evaluateCapabilityBinding } from "./focalA2EvidenceRegistry";
import { evaluateProbeObservation } from "./focalA2EvidenceAssertions";
import { indexProbeObservations, runFocalA2PilotProbes } from "./focalA2CapabilityProbes";
import { FOCAL_A2_REQUIREMENTS, FOCAL_A2_SOURCE_ASSERTIONS } from "./focalA2SourceManifest";

const PILOT_IDS = [12, 13, 14, 16, 18, 19, 20, 41, 120, 121, 122, 123, 134, 135, 136] as const;
const probeById = () => new Map(runFocalA2PilotProbes().map((probe) => [probe.id, probe]));
const observations = () => indexProbeObservations(runFocalA2PilotProbes());

test("pilot 12: done remains exactly fixed", () => {
  const values = observations();
  assert.deepEqual(values.get("protected.done.availability")?.observed, [{ start: 600, end: 630 }]);
  assert.equal(values.get("protected.done.duration")?.observed, 30);
});

test("pilot 13: in progress remains exactly fixed", () => {
  const values = observations();
  assert.deepEqual(values.get("protected.in_progress.availability")?.observed, [{ start: 600, end: 630 }]);
  assert.equal(values.get("protected.in_progress.duration")?.observed, 30);
});

test("pilot 14: cancelled is excluded with its locks", () => {
  const values = observations();
  assert.equal(values.get("protected.cancelled.problemAbsent")?.observed, true);
  assert.equal(values.get("protected.cancelled.resultAbsent")?.observed, true);
});

test("pilot 16: time lock distinguishes exact and contradictory obligations", () => {
  const values = observations();
  assert.deepEqual(values.get("lock.time.valid.interval")?.observed, [{ start: 600, end: 630 }]);
  assert.equal(values.get("lock.time.contradictory.reason")?.observed, true);
});

test("pilot 18: resource lock deduplicates", () => assert.equal(observations().get("lock.resource.deduplicated")?.observed, 1));

test("pilot 19: full lock reports dimensions separately", () => {
  const values = observations();
  assert.equal(values.get("lock.full.timeDimension")?.observed, false);
  assert.equal(values.get("lock.full.resourceDimension")?.observed, false);
  assert.equal(values.get("lock.full.spaceDimension")?.observed, true);
});

test("pilot 20: combined locks execute compatible and incompatible cases", () => {
  const values = observations();
  assert.equal(values.get("lock.combined.compatible")?.observed, "SUPPORTED");
  assert.equal(values.get("lock.combined.incompatible")?.observed, true);
});

test("pilot 41: coach availability is projected without duplication", () => {
  const values = observations();
  assert.deepEqual(values.get("coach.availability.projected")?.observed, [{ start: 600, end: 720 }]);
  assert.equal(values.get("coach.notDuplicated")?.observed, false);
});

test("pilot 120: technical task without participant executes", () => {
  const values = observations();
  assert.equal(values.get("technical.kind")?.observed, "technical");
  assert.equal(values.get("technical.noParticipant")?.observed, false);
  assert.equal(values.get("technical.hardValid")?.observed, true);
});

test("pilot 121: technical chain is complete and ordered", () => {
  const values = observations();
  assert.equal(values.get("technical.chain.complete")?.pass, true);
  assert.equal(values.get("technical.chain.ordered")?.observed, true);
});

test("pilot 122: technical dependency remains typed and hard-valid", () => {
  const values = observations();
  assert.deepEqual(values.get("technical.dependency.typed")?.observed, ["task:105"]);
  assert.equal(values.get("technical.dependency.hardValid")?.observed, true);
});

test("pilot 123: ordinary technical name is distinct from transport contract", () => {
  const values = observations();
  assert.equal(values.get("transport.ordinaryTechnicalSupported")?.observed, "SUPPORTED");
  assert.equal(values.get("transport.structuredRejected")?.observed, true);
});

test("pilot 134: participant meal executes and reports break scope", () => {
  const probe = probeById().get("meal-participant")!;
  assert.deepEqual(probe.reasonCodes, ["UNSUPPORTED_BREAK_SCOPE"]);
  assert.equal(probe.observations.every((entry) => entry.pass), true);
});

test("pilot 135: resource meal executes and reports break scope", () => {
  const probe = probeById().get("meal-resource")!;
  assert.deepEqual(probe.reasonCodes, ["UNSUPPORTED_BREAK_SCOPE"]);
  assert.equal(probe.observations.every((entry) => entry.pass), true);
});

test("pilot 136: itinerant unit meal executes and reports break scope", () => {
  const probe = probeById().get("meal-itinerant-unit")!;
  assert.deepEqual(probe.reasonCodes, ["UNSUPPORTED_BREAK_SCOPE"]);
  assert.equal(probe.observations.every((entry) => entry.pass), true);
});

test("pilot contains exactly fifteen literal distinct bindings", () => {
  assert.equal(FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS.length, 15);
  assert.deepEqual(FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS.map((binding) => binding.capabilityId), [...PILOT_IDS]);
  const source = readFileSync("engine/planner-next/coverage/focalA2CapabilityEvidenceBindings.ts", "utf8");
  assert.doesNotMatch(source, /const\s+ids\s*=|\.map\(\s*capabilityId\s*=>/);
  assert.equal((source.match(/^    capabilityId: \d+,/gm) ?? []).length, 15);
  const signatures = FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS.map((binding) => JSON.stringify({ source: binding.sourceEvidenceIds, probes: binding.probeObservationIds, tests: binding.testAssertions.map((entry) => entry.id), benchmarks: binding.benchmarkAssertions.map((entry) => entry.id) }));
  assert.equal(new Set(signatures).size, 15);
  assert.ok(FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS.every((binding) => binding.sourceEvidenceIds.length > 0 && binding.probeObservationIds.length > 0 && binding.testAssertions.length > 0 && binding.benchmarkAssertions.length > 0));
  assert.doesNotMatch(source, /stable capability catalog row exists|property:\s*["']catalog/);
});

test("source and probe references are evaluated and missing references degrade", () => {
  const probes = runFocalA2PilotProbes();
  for (const binding of FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS) assert.equal(evaluateCapabilityBinding(binding, probes).every((entry) => entry.status === "PASS"), true);
  assert.equal(evaluateProbeObservation("absent-observation", indexProbeObservations(probes)).status, "NOT_FOUND");
  const mutated = { ...FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS[0]!, probeObservationIds: ["absent-observation"] };
  assert.equal(evaluateCapabilityBinding(mutated, probes).some((entry) => entry.status === "NOT_FOUND"), true);
  const absentTest = { ...FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS[0]!, testAssertions: [{ ...FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS[0]!.testAssertions[0]!, testName: "missing functional test" }] };
  assert.equal(evaluateCapabilityBinding(absentTest, probes).some((entry) => entry.status === "NOT_FOUND"), true);
});

test("only pilot capabilities are technically audited and product phases stay separate", () => {
  const audit = buildFocalA2CapabilityAudit();
  assert.equal(audit.technicallyAuditedCapabilityCount, 15);
  assert.equal(audit.auditedCapabilityCount, 15);
  assert.equal(audit.sourceReviewedCapabilityCount, 15);
  for (const record of audit.evidenceRecords) {
    if (PILOT_IDS.includes(record.capabilityId as typeof PILOT_IDS[number])) assert.equal(record.technicallyAudited, true);
    else if (record.capabilityId >= 162) assert.equal(record.derivedCoverageStatus, "PRODUCT_PHASE_NOT_IMPLEMENTED");
    else assert.equal(record.derivedCoverageStatus, "NOT_AUDITED");
  }
  assert.equal(audit.evidenceRecords.filter((record) => record.derivedCoverageStatus === "SOURCE_AMBIGUOUS").length, 0);
});

test("meal classification comes only from executed probe observations", () => {
  const registrySource = readFileSync("engine/planner-next/coverage/focalA2EvidenceRegistry.ts", "utf8");
  assert.doesNotMatch(registrySource, /UNSUPPORTED_BREAK_SCOPE|\[134\s*,\s*135\s*,\s*136\]/);
  const audit = buildFocalA2CapabilityAudit();
  for (const id of [134, 135, 136]) assert.equal(audit.evidenceRecords.find((record) => record.capabilityId === id)?.derivedCoverageStatus, "EXPLICITLY_UNSUPPORTED");
});

test("probe mutation or missing selector degrades capability", () => {
  const probes = runFocalA2PilotProbes();
  const binding = FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS.find((entry) => entry.capabilityId === 16)!;
  const mutatedProbes = probes.map((probe) => probe.id !== "lock-time-valid" ? probe : ({ ...probe, observations: probe.observations.map((entry) => entry.id !== "lock.time.valid.interval" ? entry : ({ ...entry, pass: false, observed: [] })) }));
  assert.equal(evaluateCapabilityBinding(binding, mutatedProbes).some((entry) => entry.status === "FAIL"), true);
  const missingSelector = { ...binding, benchmarkAssertions: [{ ...binding.benchmarkAssertions[0]!, selector: "observations.[id=absent].value" }] };
  assert.equal(evaluateCapabilityBinding(missingSelector, probes).some((entry) => entry.status === "NOT_FOUND"), true);
});

test("recommendation is generic and selects executed required rejection", () => {
  const source = readFileSync("engine/planner-next/coverage/focalA2CapabilityAudit.ts", "utf8");
  assert.doesNotMatch(source, /capabilityId\s*===\s*141|find\([^\n]*141/);
  const audit = buildFocalA2CapabilityAudit();
  assert.equal(audit.recommendation.type, "IMPLEMENT_CAPABILITY");
  assert.equal(audit.evidenceRecords.find((record) => record.capabilityId === audit.recommendation.selectedCapabilityId)?.derivedCoverageStatus, "EXPLICITLY_UNSUPPORTED");
  const withoutUnsupported = audit.evidenceRecords.map((record) => record.derivedCoverageStatus === "EXPLICITLY_UNSUPPORTED" ? { ...record, derivedCoverageStatus: "NOT_AUDITED" as const } : record);
  assert.equal(selectNextAction(withoutUnsupported).type, "AUDIT_MISSING_EVIDENCE");
});

test("Focal observations are read from accepted artifact rather than hardcoded", () => {
  const source = readFileSync("engine/planner-next/coverage/focalA2CapabilityAudit.ts", "utf8");
  for (const pattern of [/accepted:\s*true/, /hardValid:\s*true/, /scenarioCount:\s*33/, /plannedTaskCount:\s*53/, /fallback:\s*false/]) assert.doesNotMatch(source, pattern);
  const artifact = JSON.parse(readFileSync("planner-next-focal-a2-itinerant-spec08-foundation-v4.json", "utf8"));
  const audit = buildFocalA2CapabilityAudit();
  assert.equal(audit.focalEvidence.observations.accepted, artifact.acceptance.accepted);
  assert.equal(audit.focalEvidence.observations.scenarioCount, artifact.scenarioCount);
});

test("source manifest keeps 167 rows and distinguishes reviewed from not audited", () => {
  assert.equal(FOCAL_A2_CAPABILITY_CATALOG.length, 167);
  assert.equal(FOCAL_A2_REQUIREMENTS.length, 167);
  assert.equal(FOCAL_A2_SOURCE_ASSERTIONS.length, 15);
  assert.deepEqual(FOCAL_A2_REQUIREMENTS.filter((entry) => entry.sourceAuditStatus === "REVIEWED").map((entry) => entry.capabilityId), [...PILOT_IDS]);
  assert.ok(FOCAL_A2_REQUIREMENTS.filter((entry) => entry.sourceAuditStatus === "NOT_AUDITED").every((entry) => entry.a2RequirementEvidence[0]?.startsWith("SOURCE_NOT_AUDITED")));
});

test("all probes are deterministic and inputs remain immutable", () => {
  const probes = runFocalA2PilotProbes();
  assert.equal(probes.every((probe) => probe.deterministic), true);
  assert.equal(probes.every((probe) => probe.inputImmutable), true);
  assert.equal(serializeFocalA2CoverageEvidence(), serializeFocalA2CoverageEvidence());
});

test("tooling isolation inspects the actual diff against the merged base", () => {
  const changed = execFileSync("git", ["diff", "--name-only", "f3924c0394c548b218e81af19f2ea364ae2c86dd"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const allowed = /^(README\.md|docs\/(coverage|evidence)\/|engine\/planner-next\/coverage\/|engine\/planner-next\/benchmarks\/runFocalA2CoverageAuditBenchmark\.ts$)/;
  assert.ok(changed.length > 0);
  for (const file of changed) assert.match(file, allowed, `productive file changed: ${file}`);
  assert.doesNotMatch(readFileSync("engine/planner-next/index.ts", "utf8"), /focalA2CapabilityAudit|coverage/);
});
