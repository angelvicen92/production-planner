import { FOCAL_A2_CAPABILITY_CATALOG } from "./focalA2CapabilityCatalog";
import { FOCAL_A2_EVIDENCE_REGISTRY, type CoverageStatus } from "./focalA2EvidenceRegistry";
import { PLANNER_LAYER_PROBES, runSupportedIntegrationProbe } from "./focalA2CapabilityProbes";
import { FOCAL_A2_REQUIREMENTS, FOCAL_A2_SOURCE_FACTS, type A2RequirementStatus } from "./focalA2SourceManifest";

export type FamilyStatus = "COVERED_END_TO_END" | "ENGINE_SUPPORTED_INTEGRATION_MISSING" | "INTEGRATED_NOT_A2_EVIDENCED"
  | "PARTIALLY_REPRESENTED" | "NOT_REPRESENTED" | "SOURCE_UNRESOLVED" | "NOT_AUDITED";
export type RecommendationType = "IMPLEMENT_CAPABILITY" | "CLARIFY_DOMAIN" | "AUDIT_MISSING_EVIDENCE" | "PRODUCT_INTEGRATION";

const family = (id: string, status: FamilyStatus, assertion: string) => ({ id, status, assertion, readOnly: true as const });
export function evaluateA2Families() {
  const exact = (id: string, expected: readonly string[]) => FOCAL_A2_SOURCE_FACTS.realityUnits.some((unit) => unit.id === id && JSON.stringify(unit.resourceIds) === JSON.stringify(expected));
  return Object.freeze([
    family("vocal-jose-maria", "PARTIALLY_REPRESENTED", "room identity exists; reversible per-room count is absent"),
    family("vocal-lucia", "PARTIALLY_REPRESENTED", "room identity exists; reversible per-room count is absent"),
    family("vocal-aggregate", FOCAL_A2_SOURCE_FACTS.vocalTaskCount === 19 ? "ENGINE_SUPPORTED_INTEGRATION_MISSING" : "NOT_REPRESENTED", "assert vocalTaskCount === 19 exactly once"),
    family("main-plato-7", "ENGINE_SUPPORTED_INTEGRATION_MISSING", "Focal asserts 19 continuous main tasks"),
    family("reality-a", exact("A", ["reality-camera-3", "reality-sound-1"]) ? "ENGINE_SUPPORTED_INTEGRATION_MISSING" : "NOT_REPRESENTED", "exact ordered resource composition"),
    family("reality-b", exact("B", ["reality-camera-4", "reality-sound-2"]) ? "ENGINE_SUPPORTED_INTEGRATION_MISSING" : "NOT_REPRESENTED", "exact ordered resource composition"),
    family("reality-combined", exact("COMBINED", ["reality-camera-3", "reality-camera-4", "reality-sound-1"]) ? "ENGINE_SUPPORTED_INTEGRATION_MISSING" : "NOT_REPRESENTED", "exact composition and differentiated window"),
    family("alfombra-roja", "ENGINE_SUPPORTED_INTEGRATION_MISSING", "standalone operation exists in Focal profile"),
    family("plato-14-pasillo", "NOT_AUDITED", "no executable family assertion"), family("plato-14-recursos", "NOT_AUDITED", "no executable family assertion"),
    family("plato-14-giratuto", "NOT_AUDITED", "no executable family assertion"), family("plato-15-croma", "NOT_AUDITED", "no executable family assertion"),
    family("plato-15-estrellas-sillon", "NOT_AUDITED", "no executable family assertion"), family("totales-1", "NOT_AUDITED", "no executable family assertion"),
    family("totales-coreo", "NOT_AUDITED", "no executable family assertion"), family("sodexo", "PARTIALLY_REPRESENTED", "human chronology shows meals but scoped integration rejects them"),
    family("technical-preparations", "ENGINE_SUPPORTED_INTEGRATION_MISSING", "technical operation benchmark scenario"),
    family("fixed-events", "INTEGRATED_NOT_A2_EVIDENCED", "protected task integration probes"),
    family("transitions", "ENGINE_SUPPORTED_INTEGRATION_MISSING", "Focal resource windows and transition checks"),
    family("eligibility", "SOURCE_UNRESOLVED", "upstream filtering versus planner contract is unresolved"),
    family("complete-talent-view", "NOT_AUDITED", "product projection has not been audited"),
  ]);
}

const countBy = <T extends string>(values: readonly T[]): Record<T, number> => values.reduce((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {} as Record<T, number>);

export function buildFocalA2CapabilityAudit() {
  const integrationProbe = runSupportedIntegrationProbe(); const families = evaluateA2Families();
  const requirementCounts = { REQUIRED: 0, NOT_REQUIRED: 0, UNRESOLVED: 0, ...countBy(FOCAL_A2_REQUIREMENTS.map((row) => row.a2RequirementStatus)) } satisfies Record<A2RequirementStatus, number>;
  const statusCounts = { EVIDENCED_SUPPORTED: 0, CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE: 0, PARTIALLY_SUPPORTED: 0, EXPLICITLY_UNSUPPORTED: 0, CONTRACT_GAP: 0, SOURCE_AMBIGUOUS: 0, NOT_AUDITED: 0, PRODUCT_PHASE_NOT_IMPLEMENTED: 0, ...countBy(FOCAL_A2_EVIDENCE_REGISTRY.map((row) => row.derivedCoverageStatus)) } satisfies Record<CoverageStatus, number>;
  const familyCounts = { COVERED_END_TO_END: 0, ENGINE_SUPPORTED_INTEGRATION_MISSING: 0, INTEGRATED_NOT_A2_EVIDENCED: 0, PARTIALLY_REPRESENTED: 0, NOT_REPRESENTED: 0, SOURCE_UNRESOLVED: 0, NOT_AUDITED: 0, ...countBy(families.map((row) => row.status)) } satisfies Record<FamilyStatus, number>;
  const notAudited = FOCAL_A2_EVIDENCE_REGISTRY.filter((row) => row.derivedCoverageStatus === "NOT_AUDITED").map((row) => row.capabilityId);
  const blockers = FOCAL_A2_EVIDENCE_REGISTRY.filter((row) => row.derivedBlockingLayer !== "NONE").map((row) => ({ capabilityId: row.capabilityId, layer: row.derivedBlockingLayer, status: row.derivedCoverageStatus }));
  return Object.freeze({
    schemaVersion: "SPEC10-012R-evidence-v1", classification: "DB Safe Merge", sourceFacts: FOCAL_A2_SOURCE_FACTS,
    requirements: FOCAL_A2_REQUIREMENTS, evidenceRecords: FOCAL_A2_EVIDENCE_REGISTRY,
    probes: Object.freeze([integrationProbe, ...PLANNER_LAYER_PROBES]), families,
    focalAssertions: Object.freeze([
      { field: "tasks.kind", operation: "main", metric: "count", expected: 19, validatorCheck: "validatePlan.hardValid", scenarioId: "baseline", evidenceBoundary: "PLANNER_LAYER" },
      { field: "tasks.kind", operation: "vocal", metric: "count", expected: 19, validatorCheck: "validatePlan.hardValid", scenarioId: "baseline", evidenceBoundary: "PLANNER_LAYER" },
      { field: "itinerantOperations", operation: "standalone", metric: "count", expected: 9, validatorCheck: "realityReferenceValidation", scenarioId: "itinerantUnits", evidenceBoundary: "PLANNER_LAYER" },
      { field: "anchoredAccompaniments", operation: "before/after", metric: "segments", expected: 6, validatorCheck: "ANCHORED_ACCOMPANIMENT_VIOLATION absent", scenarioId: "itinerantUnits", evidenceBoundary: "PLANNER_LAYER" },
      { field: "integration", operation: "supported fixture", metric: "hard-valid", expected: true, validatorCheck: "validatePlan", scenarioId: "supported-engine-input", evidenceBoundary: "ENGINE_INPUT" },
    ]),
    auditedCapabilityCount: 167 - notAudited.length, notAuditedCapabilityIds: Object.freeze(notAudited), requirementCounts, statusCounts, familyCounts,
    fullA2PlanningCoverage: blockers.length === 0, fullA2ProductReadiness: false,
    recommendation: Object.freeze({ type: "CLARIFY_DOMAIN" as RecommendationType, selectedCapabilityId: 141, selectedQuestion: "Must eligibility reach Planner Next, or does EngineInput contain only applicable tasks?", gating: ["critical SOURCE_AMBIGUOUS capability 141", "critical NOT_AUDITED families", "family associations not demonstrated"] }),
    blockers: Object.freeze(blockers), decisionTrace: Object.freeze(["read explicit source requirement rows", "collect structured layer evidence", "execute official integration probe", "derive coverage without treating missing probes as gaps", "evaluate families from assertions", "gate implementation recommendation on incomplete audit"]),
    deterministic: true, inputImmutable: integrationProbe.inputImmutable, readOnly: true,
  });
}
