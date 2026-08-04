import type { FocalA2CapabilityId } from "./focalA2CapabilityCatalog";
import { FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS, type CapabilityEvidenceBinding } from "./focalA2CapabilityEvidenceBindings";
import {
  evaluateBenchmarkAssertion,
  evaluateProbeObservation,
  evaluateSourceAssertion,
  evaluateTestAssertion,
  type AssertionResult,
  type EvidenceLayer,
  type SourceAssertion,
} from "./focalA2EvidenceAssertions";
import { indexProbeObservations, type CapabilityProbeResult } from "./focalA2CapabilityProbes";
import { FOCAL_A2_REQUIREMENTS, FOCAL_A2_SOURCE_ASSERTIONS } from "./focalA2SourceManifest";

export type CoverageStatus =
  | "EVIDENCED_SUPPORTED"
  | "CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE"
  | "PARTIALLY_SUPPORTED"
  | "EXPLICITLY_UNSUPPORTED"
  | "CONTRACT_GAP"
  | "SOURCE_AMBIGUOUS"
  | "NOT_AUDITED"
  | "PRODUCT_PHASE_NOT_IMPLEMENTED";
export type BlockingLayer = "SOURCE" | "PREFLIGHT" | "ADAPTER" | "SEARCH" | "VALIDATION" | "EVIDENCE" | "PRODUCT" | "AUDIT" | "NONE";

export interface CapabilityEvidenceRecord {
  readonly capabilityId: FocalA2CapabilityId;
  readonly binding: CapabilityEvidenceBinding | null;
  readonly assertionResults: readonly AssertionResult[];
  readonly derivedCoverageStatus: CoverageStatus;
  readonly derivedBlockingLayer: BlockingLayer;
  readonly technicallyAudited: boolean;
  readonly sourceReviewed: boolean;
  readonly missingEvidence: readonly string[];
  readonly readOnly: true;
}

export interface CoverageDerivationInput {
  readonly productPhase: boolean;
  readonly sourceAuditStatus: "REVIEWED" | "NOT_AUDITED" | "AMBIGUOUS";
  readonly binding: CapabilityEvidenceBinding | null;
  readonly assertionResults: readonly AssertionResult[];
}

const allPass = (results: readonly AssertionResult[]): boolean => results.length > 0 && results.every((entry) => entry.status === "PASS");

export function deriveCoverageStatus(input: CoverageDerivationInput): { status: CoverageStatus; blockingLayer: BlockingLayer; technicallyAudited: boolean } {
  if (input.productPhase) return { status: "PRODUCT_PHASE_NOT_IMPLEMENTED", blockingLayer: "PRODUCT", technicallyAudited: false };
  if (!input.binding) return { status: "NOT_AUDITED", blockingLayer: "AUDIT", technicallyAudited: false };
  if (!allPass(input.assertionResults)) return { status: "NOT_AUDITED", blockingLayer: "AUDIT", technicallyAudited: false };
  if (input.sourceAuditStatus === "AMBIGUOUS") return { status: "SOURCE_AMBIGUOUS", blockingLayer: "SOURCE", technicallyAudited: false };
  if (input.sourceAuditStatus !== "REVIEWED") return { status: "NOT_AUDITED", blockingLayer: "AUDIT", technicallyAudited: false };

  const resultIds = new Set(input.assertionResults.filter((entry) => entry.status === "PASS").map((entry) => entry.id));
  const observationPasses = (ids: readonly string[]) => ids.length > 0 && ids.every((id) => resultIds.has(id));
  const supported = observationPasses(input.binding.supportedVariantObservationIds);
  const unsupported = observationPasses(input.binding.unsupportedVariantObservationIds);
  const contractGap = observationPasses(input.binding.contractGapObservationIds);
  const layers = new Set(input.assertionResults.filter((entry) => entry.status === "PASS").map((entry) => entry.layer));
  const technicalPathComplete = input.binding.requiredLayers.every((layer) => layers.has(layer));
  const concreteTest = input.assertionResults.some((entry) => entry.kind === "TEST" && entry.status === "PASS");
  const concreteBenchmark = input.assertionResults.some((entry) => entry.kind === "BENCHMARK" && entry.status === "PASS");
  const representative = input.assertionResults.some((entry) => entry.kind === "BENCHMARK" && entry.status === "PASS" && entry.boundary === input.binding!.representativeBoundary);
  const technicallyAudited = technicalPathComplete && concreteTest && concreteBenchmark;

  if (!technicallyAudited) return { status: "NOT_AUDITED", blockingLayer: "AUDIT", technicallyAudited: false };
  if (supported && (unsupported || contractGap)) return { status: "PARTIALLY_SUPPORTED", blockingLayer: contractGap ? "PREFLIGHT" : "EVIDENCE", technicallyAudited: true };
  if (contractGap) return { status: "CONTRACT_GAP", blockingLayer: "PREFLIGHT", technicallyAudited: true };
  if (unsupported) return { status: "EXPLICITLY_UNSUPPORTED", blockingLayer: "PREFLIGHT", technicallyAudited: true };
  if (supported && representative) return { status: "EVIDENCED_SUPPORTED", blockingLayer: "NONE", technicallyAudited: true };
  if (supported) return { status: "CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE", blockingLayer: "EVIDENCE", technicallyAudited: true };
  return { status: "NOT_AUDITED", blockingLayer: "AUDIT", technicallyAudited: false };
}

export function evaluateCapabilityBinding(
  binding: CapabilityEvidenceBinding,
  probes: readonly CapabilityProbeResult[],
  sourceAssertions: readonly SourceAssertion[] = FOCAL_A2_SOURCE_ASSERTIONS,
): readonly AssertionResult[] {
  const sourceIndex = new Map(sourceAssertions.map((assertion) => [assertion.id, assertion]));
  const observationIndex = indexProbeObservations(probes);
  return Object.freeze([
    ...binding.sourceEvidenceIds.map((id) => evaluateSourceAssertion(id, binding.capabilityId, sourceIndex)),
    ...binding.probeObservationIds.map((id) => evaluateProbeObservation(id, observationIndex)),
    ...binding.testAssertions.map(evaluateTestAssertion),
    ...binding.benchmarkAssertions.map((assertion) => evaluateBenchmarkAssertion(assertion, probes)),
  ]);
}

export function buildEvidenceRegistry(probes: readonly CapabilityProbeResult[]): readonly CapabilityEvidenceRecord[] {
  const bindingByCapability = new Map(FOCAL_A2_CAPABILITY_EVIDENCE_BINDINGS.map((binding) => [binding.capabilityId, binding]));
  return Object.freeze(FOCAL_A2_REQUIREMENTS.map((requirement) => {
    const binding = bindingByCapability.get(requirement.capabilityId) ?? null;
    const assertionResults = binding ? evaluateCapabilityBinding(binding, probes) : [];
    const derived = deriveCoverageStatus({ productPhase: requirement.productPhase, sourceAuditStatus: requirement.sourceAuditStatus, binding, assertionResults });
    return Object.freeze({
      capabilityId: requirement.capabilityId,
      binding,
      assertionResults,
      derivedCoverageStatus: derived.status,
      derivedBlockingLayer: derived.blockingLayer,
      technicallyAudited: derived.technicallyAudited,
      sourceReviewed: requirement.sourceAuditStatus === "REVIEWED",
      missingEvidence: derived.status === "NOT_AUDITED" ? [binding ? "all referenced assertions must pass" : "pilot binding"] : [],
      readOnly: true as const,
    });
  }));
}

export const REQUIRED_EVIDENCE_LAYERS: readonly EvidenceLayer[] = ["SOURCE", "PREFLIGHT", "ADAPTER", "SEARCH", "VALIDATION", "EVIDENCE"];
