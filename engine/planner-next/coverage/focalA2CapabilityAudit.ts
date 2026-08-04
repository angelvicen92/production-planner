import { readFileSync } from "node:fs";
import { FOCAL_A2_CAPABILITY_CATALOG } from "./focalA2CapabilityCatalog";
import { FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS } from "./focalA2CapabilityEvidenceBindings";
import { runFocalA2PilotProbes } from "./focalA2CapabilityProbes";
import { buildEvidenceRegistry, type CapabilityEvidenceRecord, type CoverageStatus } from "./focalA2EvidenceRegistry";
import { FOCAL_A2_REQUIREMENTS, FOCAL_A2_SOURCE_ASSERTIONS, type A2RequirementStatus } from "./focalA2SourceManifest";

export type FamilyStatus = "EVIDENCED_SUPPORTED" | "PARTIALLY_SUPPORTED" | "EXPLICITLY_UNSUPPORTED" | "NOT_AUDITED";
export type RecommendationType = "IMPLEMENT_CAPABILITY" | "AUDIT_MISSING_EVIDENCE" | "CLARIFY_DOMAIN";

interface PilotFamilyDefinition {
  readonly familyId: string;
  readonly requiredCapabilityIds: readonly number[];
}

export const PILOT_FAMILY_DEFINITIONS: readonly PilotFamilyDefinition[] = Object.freeze([
  { familyId: "protected-task-status", requiredCapabilityIds: [12, 13, 14] },
  { familyId: "locks", requiredCapabilityIds: [16, 18, 19, 20] },
  { familyId: "coach-availability", requiredCapabilityIds: [41] },
  { familyId: "technical-operations", requiredCapabilityIds: [120, 121, 122, 123] },
  { familyId: "scoped-meals", requiredCapabilityIds: [134, 135, 136] },
]);

export function evaluatePilotFamilies(records: readonly CapabilityEvidenceRecord[]) {
  const byId = new Map(records.map((record) => [record.capabilityId, record]));
  return Object.freeze(PILOT_FAMILY_DEFINITIONS.map((definition) => {
    const members = definition.requiredCapabilityIds.map((id) => byId.get(id)!);
    const statuses = members.map((member) => member.derivedCoverageStatus);
    const status: FamilyStatus = statuses.some((value) => value === "NOT_AUDITED")
      ? "NOT_AUDITED"
      : statuses.every((value) => value === "EXPLICITLY_UNSUPPORTED")
        ? "EXPLICITLY_UNSUPPORTED"
        : statuses.some((value) => value === "PARTIALLY_SUPPORTED" || value === "CONTRACT_GAP" || value === "EXPLICITLY_UNSUPPORTED")
          ? "PARTIALLY_SUPPORTED"
          : "EVIDENCED_SUPPORTED";
    return Object.freeze({
      ...definition,
      status,
      memberStatuses: Object.fromEntries(members.map((member) => [member.capabilityId, member.derivedCoverageStatus])),
      failedAssertions: members.flatMap((member) => member.assertionResults.filter((assertion) => assertion.status !== "PASS").map((assertion) => assertion.id)),
      derived: true as const,
    });
  }));
}

const recommendationPriority = (record: CapabilityEvidenceRecord): readonly [number, number, number] => {
  const requirement = FOCAL_A2_REQUIREMENTS.find((entry) => entry.capabilityId === record.capabilityId)!;
  const impact = Number(requirement.requiredByA2Example) * 2 + Number(requirement.requiredByOfficialSpec);
  const risk = record.derivedCoverageStatus === "EXPLICITLY_UNSUPPORTED" ? 0 : 1;
  return [-impact, risk, record.capabilityId];
};

const compareTuple = (left: readonly number[], right: readonly number[]): number => {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

export function selectNextAction(records: readonly CapabilityEvidenceRecord[]) {
  const requiredUnsupported = records
    .filter((record) => record.derivedCoverageStatus === "EXPLICITLY_UNSUPPORTED")
    .filter((record) => FOCAL_A2_REQUIREMENTS.find((entry) => entry.capabilityId === record.capabilityId)?.a2RequirementStatus === "REQUIRED")
    .sort((left, right) => compareTuple(recommendationPriority(left), recommendationPriority(right)));
  if (requiredUnsupported[0]) {
    const selected = requiredUnsupported[0];
    const capability = FOCAL_A2_CAPABILITY_CATALOG.find((entry) => entry.id === selected.capabilityId)!;
    return Object.freeze({
      type: "IMPLEMENT_CAPABILITY" as RecommendationType,
      selectedCapabilityId: selected.capabilityId,
      selectedAction: `Implement the demonstrated required blocker: ${capability.name}`,
      decisionTrace: Object.freeze([
        "collect REQUIRED capabilities with executed EXPLICITLY_UNSUPPORTED Evidence",
        "rank higher A2 visibility before official-only impact",
        "prefer directly observed rejection over inferred contract risk",
        `select ${capability.name} from the resulting deterministic order`,
      ]),
    });
  }
  const missing = records.find((record) => record.derivedCoverageStatus === "NOT_AUDITED");
  if (missing) return Object.freeze({ type: "AUDIT_MISSING_EVIDENCE" as RecommendationType, selectedCapabilityId: missing.capabilityId, selectedAction: "Audit the next missing capability binding", decisionTrace: Object.freeze(["no required executed rejection remains", "select first stable NOT_AUDITED catalog row"]) });
  const ambiguous = records.find((record) => record.derivedCoverageStatus === "SOURCE_AMBIGUOUS");
  return Object.freeze({ type: "CLARIFY_DOMAIN" as RecommendationType, selectedCapabilityId: ambiguous?.capabilityId ?? null, selectedAction: "Clarify reviewed source ambiguity", decisionTrace: Object.freeze(["no required rejection or missing Evidence remains", "review source ambiguity"]) });
}

function readFocalEvidence() {
  const file = "planner-next-focal-a2-itinerant-spec08-foundation-v4.json";
  const artifact = JSON.parse(readFileSync(file, "utf8"));
  const scenario = artifact.scenarios?.[artifact.activeScenarioId];
  return Object.freeze({
    file,
    activeScenarioId: artifact.activeScenarioId ?? null,
    observations: Object.freeze({
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
    }),
  });
}

const countBy = <T extends string>(values: readonly T[]): Record<T, number> => values.reduce((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {} as Record<T, number>);

export function buildFocalA2CapabilityAudit() {
  const probes = runFocalA2PilotProbes();
  const evidenceRecords = buildEvidenceRegistry(probes);
  const assertionResults = evidenceRecords.flatMap((record) => record.assertionResults);
  const families = evaluatePilotFamilies(evidenceRecords);
  const technicallyAuditedCapabilityCount = evidenceRecords.filter((record) => record.technicallyAudited).length;
  const sourceReviewedCapabilityCount = evidenceRecords.filter((record) => record.sourceReviewed).length;
  const notAuditedCapabilityIds = evidenceRecords.filter((record) => record.derivedCoverageStatus === "NOT_AUDITED").map((record) => record.capabilityId);
  const statusCounts = { EVIDENCED_SUPPORTED: 0, CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE: 0, PARTIALLY_SUPPORTED: 0, EXPLICITLY_UNSUPPORTED: 0, CONTRACT_GAP: 0, SOURCE_AMBIGUOUS: 0, NOT_AUDITED: 0, PRODUCT_PHASE_NOT_IMPLEMENTED: 0, ...countBy(evidenceRecords.map((record) => record.derivedCoverageStatus)) } satisfies Record<CoverageStatus, number>;
  const requirementCounts = { REQUIRED: 0, NOT_REQUIRED: 0, UNRESOLVED: 0, ...countBy(FOCAL_A2_REQUIREMENTS.map((row) => row.a2RequirementStatus)) } satisfies Record<A2RequirementStatus, number>;
  return Object.freeze({
    schemaVersion: "SPEC10-012R2-evidence-pilot-v3",
    classification: "DB Safe Merge",
    pilotCapabilityIds: FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS.map((binding) => binding.capabilityId),
    requirements: FOCAL_A2_REQUIREMENTS,
    sourceAssertions: FOCAL_A2_SOURCE_ASSERTIONS,
    bindings: FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS,
    probes,
    probeObservations: probes.flatMap((probe) => probe.observations),
    assertionResults,
    assertionCounts: { PASS: assertionResults.filter((entry) => entry.status === "PASS").length, FAIL: assertionResults.filter((entry) => entry.status === "FAIL").length, NOT_FOUND: assertionResults.filter((entry) => entry.status === "NOT_FOUND").length, NOT_EXECUTED: assertionResults.filter((entry) => entry.status === "NOT_EXECUTED").length },
    evidenceRecords,
    families,
    auditedCapabilityCount: technicallyAuditedCapabilityCount,
    technicallyAuditedCapabilityCount,
    sourceReviewedCapabilityCount,
    notAuditedCapabilityCount: notAuditedCapabilityIds.length,
    notAuditedCapabilityIds,
    productPhaseCapabilityIds: evidenceRecords.filter((record) => record.derivedCoverageStatus === "PRODUCT_PHASE_NOT_IMPLEMENTED").map((record) => record.capabilityId),
    requirementCounts,
    statusCounts,
    familyCounts: countBy(families.map((family) => family.status)),
    recommendation: selectNextAction(evidenceRecords),
    focalEvidence: readFocalEvidence(),
    deterministic: probes.every((probe) => probe.deterministic),
    inputImmutable: probes.every((probe) => probe.inputImmutable),
    readOnly: true,
  });
}
