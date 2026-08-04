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
import { indexProbeObservations, runFocalA2PilotProbes, runScopedMealProbe } from "./focalA2CapabilityProbes";
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

test("pilot 134: flexible participant meal task executes under both policies", () => {
  const probe = probeById().get("meal-participant")!;
  assert.deepEqual(probe.reasonCodes, []);
  assert.equal(probe.observations.every((entry) => entry.pass), true);
});

test("pilot 135: resource meal executes and reports break scope", () => {
  const probe = probeById().get("meal-resource")!;
  assert.deepEqual(probe.reasonCodes, []);
  assert.equal(probe.observations.every((entry) => entry.pass), true);
});

test("pilot 136: itinerant unit meal executes and reports break scope", () => {
  const probe = probeById().get("meal-itinerant-unit")!;
  assert.deepEqual(probe.reasonCodes, []);
  assert.equal(probe.observations.every((entry) => entry.pass), true);
});

test("scoped meal observations read mutable windows and exact identities from executed inputs", () => {
  const participant = indexProbeObservations([runScopedMealProbe("participant")]);
  const changedParticipant = indexProbeObservations([runScopedMealProbe("participant", { start: "16:00", end: "16:20", participantId: 202 })]);
  assert.deepEqual(participant.get("meal.participant.window")?.observed, { start: 900, end: 930 });
  assert.deepEqual(changedParticipant.get("meal.participant.window")?.observed, { start: 960, end: 980 });
  assert.equal(participant.get("meal.participant.identity")?.observed, "task:106");
  assert.equal(changedParticipant.get("meal.participant.identity")?.observed, "task:106");
  assert.equal(changedParticipant.get("meal.participant.entity")?.observed, "participant-meal:106");

  const resource = indexProbeObservations([runScopedMealProbe("resource")]);
  const changedResource = indexProbeObservations([runScopedMealProbe("resource", { start: "16:05", end: "16:35", resourceId: 504 })]);
  assert.deepEqual(resource.get("meal.resource.window")?.observed, { start: 900, end: 930 });
  assert.deepEqual(changedResource.get("meal.resource.window")?.observed, { start: 965, end: 995 });
  assert.equal(resource.get("meal.resource.identity")?.observed, "task:106");
  assert.equal(changedResource.get("meal.resource.identity")?.observed, "task:106");
  assert.equal(changedResource.get("meal.resource.entity")?.observed, "break:135");

  const itinerant = indexProbeObservations([runScopedMealProbe("itinerant-unit")]);
  const changedItinerant = indexProbeObservations([runScopedMealProbe("itinerant-unit", { start: "16:10", end: "16:40", itinerantTeamId: 8 })]);
  assert.deepEqual(changedItinerant.get("meal.itinerant-unit.window")?.observed, { start: 970, end: 1000 });
  assert.equal(itinerant.get("meal.itinerant-unit.identity")?.observed, "itinerant-team:7");
  assert.equal(changedItinerant.get("meal.itinerant-unit.identity")?.observed, "itinerant-team:8");
  assert.equal(changedItinerant.get("meal.itinerant-unit.entity")?.observed, "break:unit-meal");
  assert.deepEqual(runScopedMealProbe("participant").reasonCodes, []);
  assert.deepEqual(runScopedMealProbe("resource").reasonCodes, []);
  assert.deepEqual(runScopedMealProbe("itinerant-unit").reasonCodes, []);
});

test("pilot source assertions use exact official anchors and limited A2 claims", () => {
  const byCapability = (id: number) => FOCAL_A2_SOURCE_ASSERTIONS.filter((entry) => entry.capabilityId === id);
  const has = (id: number, document: string, section: string) => byCapability(id).some((entry) => entry.document === document && entry.section === section);
  assert.ok(has(12, "SPEC-10", "8.1. Protegidas")); assert.ok(has(13, "SPEC-10", "8.1. Protegidas"));
  assert.ok(has(14, "SPEC-10", "8.3. No planificables")); assert.ok(has(16, "SPEC-10", "9.1. Lock de tiempo"));
  assert.ok(has(18, "SPEC-10", "9.3. Lock de recurso")); assert.ok(has(19, "SPEC-10", "9.4. Lock completo"));
  assert.ok(has(41, "SPEC-10", "12. Recursos")); assert.ok(has(120, "SPEC-07", "6.9 Operación técnica"));
  assert.ok(has(122, "SPEC-10", "13. Dependencias")); assert.ok(has(123, "SPEC-07", "18.4 Traslado técnico explícito"));
  assert.ok(has(123, "ENSAYO_A2_LV.pdf p.1", "DESMONTAJE Y TRASLADO")); assert.ok(has(134, "SPEC-07", "19.5 Concursantes"));
  assert.ok(has(135, "SPEC-10", "14. Comidas y pausas protegidas")); assert.ok(has(136, "SPEC-10", "14. Comidas y pausas protegidas"));
  assert.equal(byCapability(120).find((entry) => entry.sourceType === "A2_EXAMPLE")?.claim.includes("sin participante"), false);
  assert.equal(byCapability(123).some((entry) => entry.section === "PROGRAMACIÓN + PRUEBA"), false);
  assert.deepEqual(FOCAL_A2_REQUIREMENTS.filter((entry) => entry.requiredByA2Example).map((entry) => entry.capabilityId), [120, 123, 134]);
});

test("Evidence boundaries preserve Planner-layer technical-chain authority", () => {
  const probes = runFocalA2PilotProbes();
  const chain = probes.find((probe) => probe.id === "technical-chain")!;
  assert.ok(chain.observations.every((entry) => entry.boundary === "PLANNER_LAYER"));
  assert.ok(probes.filter((probe) => probe.id !== "technical-chain").flatMap((probe) => probe.observations).every((entry) => entry.boundary === "ENGINE_INPUT"));
  const binding = FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS.find((entry) => entry.capabilityId === 121)!;
  assert.equal(binding.representativeBoundary, "PLANNER_LAYER");
  assert.equal(binding.benchmarkAssertions[0]?.boundary, "PLANNER_LAYER");
  const evaluated = evaluateCapabilityBinding(binding, probes);
  assert.equal(evaluated.find((entry) => entry.id === "technical.chain.ids")?.boundary, "PLANNER_LAYER");
  assert.equal(evaluated.find((entry) => entry.id === "benchmark-121")?.boundary, "PLANNER_LAYER");
  const wrongBoundary = { ...binding, benchmarkAssertions: [{ ...binding.benchmarkAssertions[0]!, boundary: "ENGINE_INPUT" as const }] };
  assert.equal(evaluateCapabilityBinding(wrongBoundary, probes).find((entry) => entry.id === "benchmark-121")?.status, "FAIL");
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
  assert.equal(audit.evidenceRecords.find((record) => record.capabilityId === 134)?.derivedCoverageStatus, "EVIDENCED_SUPPORTED");
  assert.equal(audit.evidenceRecords.find((record) => record.capabilityId === 135)?.derivedCoverageStatus, "EVIDENCED_SUPPORTED");
  assert.equal(audit.evidenceRecords.find((record) => record.capabilityId === 136)?.derivedCoverageStatus, "EVIDENCED_SUPPORTED");
});

test("probe mutation or missing selector degrades capability", () => {
  const probes = runFocalA2PilotProbes();
  const binding = FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS.find((entry) => entry.capabilityId === 16)!;
  const mutatedProbes = probes.map((probe) => probe.id !== "lock-time-valid" ? probe : ({ ...probe, observations: probe.observations.map((entry) => entry.id !== "lock.time.valid.interval" ? entry : ({ ...entry, pass: false, observed: [] })) }));
  assert.equal(evaluateCapabilityBinding(binding, mutatedProbes).some((entry) => entry.status === "FAIL"), true);
  const missingSelector = { ...binding, benchmarkAssertions: [{ ...binding.benchmarkAssertions[0]!, selector: "observations.[id=absent].value" }] };
  assert.equal(evaluateCapabilityBinding(missingSelector, probes).some((entry) => entry.status === "NOT_FOUND"), true);
});

test("recommendation is generic after all scoped meals are evidenced", () => {
  const source = readFileSync("engine/planner-next/coverage/focalA2CapabilityAudit.ts", "utf8");
  assert.doesNotMatch(source, /capabilityId\s*===\s*141|find\([^\n]*141/);
  const audit = buildFocalA2CapabilityAudit();
  assert.equal(audit.recommendation.type, "AUDIT_MISSING_EVIDENCE");
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
  const scenario = artifact.scenarios[artifact.activeScenarioId];
  assert.deepEqual(audit.focalEvidence.observations, {
    status: artifact.status ?? null,
    scenarioCount: artifact.scenarioCount ?? null,
    accepted: artifact.acceptance?.accepted ?? null,
    complete: scenario?.complete ?? null,
    hardValid: scenario?.hardValid ?? null,
    plannedTaskCount: scenario?.plannedTaskCount ?? null,
    unplannedTaskCount: scenario?.metrics?.unplannedTaskCount ?? null,
    branchesExplored: scenario?.branchesExplored ?? null,
    maxBranchExpansions: scenario?.maxBranchExpansions ?? null,
    humanScheduleUsedAsSeed: scenario?.humanScheduleUsedAsSeed ?? null,
    anchoredAccompanimentPlannedCount: scenario?.metrics?.anchoredAccompanimentPlannedCount ?? null,
    anchoredAccompanimentScheduledSegmentCount: scenario?.metrics?.anchoredAccompanimentScheduledSegmentCount ?? null,
    fallbackUsed: scenario?.metrics?.feederClosureFallbackUsed ?? null,
  });
});

test("source manifest keeps 167 rows and distinguishes reviewed from not audited", () => {
  assert.equal(FOCAL_A2_CAPABILITY_CATALOG.length, 167);
  assert.equal(FOCAL_A2_REQUIREMENTS.length, 167);
  assert.equal(FOCAL_A2_SOURCE_ASSERTIONS.length, 26);
  assert.deepEqual(FOCAL_A2_REQUIREMENTS.filter((entry) => entry.sourceAuditStatus === "REVIEWED").map((entry) => entry.capabilityId), [...PILOT_IDS]);
  assert.ok(FOCAL_A2_REQUIREMENTS.filter((entry) => entry.sourceAuditStatus === "NOT_AUDITED").every((entry) => entry.a2RequirementEvidence[0]?.startsWith("SOURCE_NOT_AUDITED")));
});

test("all probes are deterministic and inputs remain immutable", () => {
  const probes = runFocalA2PilotProbes();
  assert.equal(probes.every((probe) => probe.deterministic), true);
  assert.equal(probes.every((probe) => probe.inputImmutable), true);
  assert.equal(serializeFocalA2CoverageEvidence(), serializeFocalA2CoverageEvidence());
});

test("functional correction remains isolated from DB, UI and API", () => {
  const changed = execFileSync("git", ["diff", "--name-only", "f3924c0394c548b218e81af19f2ea364ae2c86dd"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  assert.ok(changed.length > 0);
  for (const file of changed) assert.doesNotMatch(file, /^(migrations\/|client\/|server\/|shared\/schema)/, `forbidden surface changed: ${file}`);
  assert.doesNotMatch(readFileSync("engine/planner-next/index.ts", "utf8"), /focalA2CapabilityAudit|coverage/);
});
