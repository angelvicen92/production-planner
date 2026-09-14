import { createHash } from "node:crypto";
import type { PlanOptimizerSnapshotV1 } from "./planOptimizerSnapshot";
import type { EngineInput } from "../engine/types";
import {
  deriveTaskTemplateSnapshotCatalogFingerprint,
  type TaskTemplateOperationalSnapshotV1,
} from "./taskTemplateSnapshot";

export const EFFECTIVE_PLAN_CONFIG_REVISION_CONTRACT_VERSION = 1 as const;

export const EFFECTIVE_PLAN_CONFIG_DERIVED_AUTHORITIES_V1 = [
  "plan_workday",
  "contestant_availability",
  "spatial_configuration",
  "resource_configuration",
  "resource_assignments_and_requirements",
  "resource_bundles",
] as const;

export type EffectivePlanConfigDerivedAuthorityV1 =
  (typeof EFFECTIVE_PLAN_CONFIG_DERIVED_AUTHORITIES_V1)[number];

type EffectivePlanConfigAuthorityPolicyV1 = Readonly<{
  criticality: "REQUIRED";
  canonicalization: "ORDERED" | "UNORDERED_CATALOG";
}> | Readonly<{
  criticality: "OPTIONAL_SIGNAL";
  canonicalization: "ORDERED" | "UNORDERED_CATALOG";
  unavailableReasonCode: "RESOURCE_BUNDLE_SIGNAL_UNAVAILABLE";
}>;

const EFFECTIVE_PLAN_CONFIG_AUTHORITY_POLICIES_V1: Readonly<
  Record<EffectivePlanConfigDerivedAuthorityV1, EffectivePlanConfigAuthorityPolicyV1>
> = {
  plan_workday: { criticality: "REQUIRED", canonicalization: "ORDERED" },
  contestant_availability: { criticality: "REQUIRED", canonicalization: "UNORDERED_CATALOG" },
  spatial_configuration: { criticality: "REQUIRED", canonicalization: "UNORDERED_CATALOG" },
  resource_configuration: { criticality: "REQUIRED", canonicalization: "UNORDERED_CATALOG" },
  resource_assignments_and_requirements: { criticality: "REQUIRED", canonicalization: "UNORDERED_CATALOG" },
  resource_bundles: {
    criticality: "OPTIONAL_SIGNAL",
    canonicalization: "UNORDERED_CATALOG",
    unavailableReasonCode: "RESOURCE_BUNDLE_SIGNAL_UNAVAILABLE",
  },
};

export interface EffectivePlanConfigProvenanceV1 {
  /** Stable name of the materialized daily authority (table/view/contract), not a row id. */
  readonly authority: string;
  readonly authorityContractVersion: number;
}

export interface EffectivePlanConfigAuthorityInputV1 {
  /** Only operational fields belong here. Write ids, timestamps and audit metadata do not. */
  readonly semanticValue: unknown;
  readonly provenance: EffectivePlanConfigProvenanceV1;
}

export interface BuildEffectivePlanConfigRevisionInputV1 {
  readonly planId: number;
  readonly taskTemplateSnapshots: readonly TaskTemplateOperationalSnapshotV1[];
  readonly taskTemplateProvenance: EffectivePlanConfigProvenanceV1;
  readonly optimizerSnapshot: PlanOptimizerSnapshotV1;
  readonly optimizerProvenance: EffectivePlanConfigProvenanceV1;
  readonly authorities: Readonly<Partial<Record<EffectivePlanConfigDerivedAuthorityV1, EffectivePlanConfigAuthorityInputV1>>>;
}

export interface EffectivePlanConfigComponentRevisionV1 {
  readonly authority: "task_templates" | "optimizer" | EffectivePlanConfigDerivedAuthorityV1;
  readonly identityKind: "REUSED_CANONICAL_FINGERPRINT" | "DERIVED_SEMANTIC_FINGERPRINT";
  readonly fingerprint: string;
  readonly availability: "AVAILABLE" | "UNAVAILABLE_NEUTRAL";
  readonly provenance?: EffectivePlanConfigProvenanceV1;
  readonly unavailableReasonCode?: "RESOURCE_BUNDLE_SIGNAL_UNAVAILABLE";
}

export interface EffectivePlanConfigRevisionV1 {
  readonly contractVersion: 1;
  /** Audit context only. It is deliberately excluded from the configuration fingerprint. */
  readonly planId: number;
  readonly components: readonly EffectivePlanConfigComponentRevisionV1[];
  readonly configurationFingerprint: string;
}

export class EffectivePlanConfigRevisionError extends Error {
  constructor(
    readonly code: "INVALID_PLAN_ID" | "MISSING_EFFECTIVE_AUTHORITY" | "INVALID_EFFECTIVE_AUTHORITY",
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(`${code}: ${message}`);
    this.name = "EffectivePlanConfigRevisionError";
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function canonicalize(value: unknown, path: string, unorderedArray: boolean): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    const entries = value.map((entry, index) => canonicalize(entry, `${path}[${index}]`, false));
    return unorderedArray
      ? entries.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      : entries;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw invalidAuthority(path, "semanticValue must contain only JSON records and arrays");
    }
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => {
      const nested = (value as Record<string, unknown>)[key];
      if (nested === undefined) throw invalidAuthority(`${path}.${key}`, "undefined is not canonical");
      return [key, canonicalize(nested, `${path}.${key}`, false)];
    }));
  }
  throw invalidAuthority(path, `unsupported semantic value type ${typeof value}`);
}

/** Canonical semantic value shared by effective identity and durable replay. */
export function canonicalizeEffectivePlanConfigAuthorityValueV1(
  authority: EffectivePlanConfigDerivedAuthorityV1,
  value: unknown,
): unknown {
  const policy = EFFECTIVE_PLAN_CONFIG_AUTHORITY_POLICIES_V1[authority];
  if (policy.canonicalization === "UNORDERED_CATALOG" && !Array.isArray(value)) {
    throw invalidAuthority(authority, "UNORDERED_CATALOG semanticValue must be a root array");
  }
  return canonicalize(value, authority, policy.canonicalization === "UNORDERED_CATALOG");
}

function invalidAuthority(path: string, message: string): EffectivePlanConfigRevisionError {
  return new EffectivePlanConfigRevisionError("INVALID_EFFECTIVE_AUTHORITY", message, { path });
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateProvenance(
  provenance: EffectivePlanConfigProvenanceV1 | null | undefined,
  authority: string,
): EffectivePlanConfigProvenanceV1 {
  if (!provenance) {
    throw new EffectivePlanConfigRevisionError(
      "MISSING_EFFECTIVE_AUTHORITY",
      `Missing provenance for ${authority}.`,
      { authority },
    );
  }
  if (!provenance.authority.trim() || !Number.isInteger(provenance.authorityContractVersion) || provenance.authorityContractVersion <= 0) {
    throw invalidAuthority(authority, "provenance must identify a versioned daily authority");
  }
  return deepFreeze({ ...provenance });
}

/**
 * Produces the pure identity consumed by later persistence/stage contracts.
 * Callers must pass already materialized daily authorities; this function has no storage access.
 */
export function buildEffectivePlanConfigRevisionV1(
  input: BuildEffectivePlanConfigRevisionInputV1,
): EffectivePlanConfigRevisionV1 {
  if (!Number.isInteger(input.planId) || input.planId <= 0) {
    throw new EffectivePlanConfigRevisionError("INVALID_PLAN_ID", "planId must be a positive integer.", { planId: input.planId });
  }
  if (!input.taskTemplateSnapshots) {
    throw new EffectivePlanConfigRevisionError("MISSING_EFFECTIVE_AUTHORITY", "Missing task-template snapshots.", { authority: "task_templates" });
  }
  if (!input.optimizerSnapshot?.configurationFingerprint) {
    throw new EffectivePlanConfigRevisionError("MISSING_EFFECTIVE_AUTHORITY", "Missing optimizer snapshot.", { authority: "optimizer" });
  }

  const components: EffectivePlanConfigComponentRevisionV1[] = [
    {
      authority: "task_templates",
      identityKind: "REUSED_CANONICAL_FINGERPRINT",
      availability: "AVAILABLE",
      fingerprint: deriveTaskTemplateSnapshotCatalogFingerprint(input.taskTemplateSnapshots),
      provenance: validateProvenance(input.taskTemplateProvenance, "task_templates"),
    },
    {
      authority: "optimizer",
      identityKind: "REUSED_CANONICAL_FINGERPRINT",
      availability: "AVAILABLE",
      fingerprint: input.optimizerSnapshot.configurationFingerprint,
      provenance: validateProvenance(input.optimizerProvenance, "optimizer"),
    },
  ];

  for (const authority of EFFECTIVE_PLAN_CONFIG_DERIVED_AUTHORITIES_V1) {
    const policy = EFFECTIVE_PLAN_CONFIG_AUTHORITY_POLICIES_V1[authority];
    const component = input.authorities?.[authority];
    if (!component) {
      if (policy.criticality === "OPTIONAL_SIGNAL") {
        const unavailableReasonCode = policy.unavailableReasonCode;
        components.push({
          authority,
          identityKind: "DERIVED_SEMANTIC_FINGERPRINT",
          availability: "UNAVAILABLE_NEUTRAL",
          unavailableReasonCode,
          fingerprint: digest({ contractVersion: 1, authority, availability: "UNAVAILABLE_NEUTRAL", unavailableReasonCode }),
        });
        continue;
      }
      throw new EffectivePlanConfigRevisionError(
        "MISSING_EFFECTIVE_AUTHORITY",
        `Missing required daily authority ${authority}.`,
        { authority },
      );
    }
    components.push({
      authority,
      identityKind: "DERIVED_SEMANTIC_FINGERPRINT",
      availability: "AVAILABLE",
      fingerprint: digest({
        contractVersion: 1,
        authority,
        availability: "AVAILABLE",
        semanticValue: canonicalizeEffectivePlanConfigAuthorityValueV1(authority, component.semanticValue),
      }),
      provenance: validateProvenance(component.provenance, authority),
    });
  }

  components.sort((left, right) => left.authority.localeCompare(right.authority));
  const configurationFingerprint = digest({
    contractVersion: EFFECTIVE_PLAN_CONFIG_REVISION_CONTRACT_VERSION,
    components: components.map(({ authority, availability, fingerprint }) => ({ authority, availability, fingerprint })),
  });
  return deepFreeze({
    contractVersion: EFFECTIVE_PLAN_CONFIG_REVISION_CONTRACT_VERSION,
    planId: input.planId,
    components,
    configurationFingerprint,
  });
}

/**
 * Adapter for the exact daily projections consumed by the engine. Mutable catalog
 * rows must never be supplied here; callers pass the already-built EngineInput.
 */
export function projectEffectiveAuthoritiesFromEngineInputV1(
  input: EngineInput,
): BuildEffectivePlanConfigRevisionInputV1["authorities"] {
  const provenance = (authority: string): EffectivePlanConfigProvenanceV1 => ({ authority, authorityContractVersion: 1 });
  const bundleUnavailable = (input.resourceBundleLoadWarnings?.length ?? 0) > 0;
  return {
    plan_workday: { semanticValue: [{ workDay: input.workDay, meal: input.meal, mealWindow: input.mealWindow, mealMode: input.mealMode }], provenance: provenance("plans") },
    contestant_availability: { semanticValue: Object.entries(input.contestantAvailabilityById ?? {}).map(([contestantId, availability]) => ({ contestantId: Number(contestantId), ...availability })), provenance: provenance("contestants") },
    spatial_configuration: { semanticValue: [
      ...(input.planZoneSettings ?? []).map(({ zoneId, availabilityStart, availabilityEnd, name, mealStartPreferred, mealEndPreferred, groupingLevel, groupingMinChain, maxTemplateChanges, spaceMealBreakMinutes }) => ({ kind: "zone", zoneId, availabilityStart: availabilityStart ?? null, availabilityEnd: availabilityEnd ?? null, name: name ?? "", mealStartPreferred: mealStartPreferred ?? null, mealEndPreferred: mealEndPreferred ?? null, groupingLevel: groupingLevel ?? 0, groupingMinChain: groupingMinChain ?? 4, maxTemplateChanges: maxTemplateChanges ?? 4, spaceMealBreakMinutes: spaceMealBreakMinutes ?? null })),
      ...(input.planSpaceSettings ?? []).map(({ spaceId, zoneId, availabilityStart, availabilityEnd, name, parentSpaceId, priorityLevel, groupingLevel, groupingMinChain, groupingApplyToDescendants }) => ({ kind: "space", spaceId, zoneId, availabilityStart: availabilityStart ?? null, availabilityEnd: availabilityEnd ?? null, name: name ?? "", parentSpaceId: parentSpaceId ?? null, priorityLevel: priorityLevel ?? 1, groupingLevel: groupingLevel ?? 0, groupingMinChain: groupingMinChain ?? 4, groupingApplyToDescendants: groupingApplyToDescendants ?? false })),
    ], provenance: provenance("plan_zone_settings+plan_space_settings") },
    resource_configuration: { semanticValue: input.planResourceItems ?? [], provenance: provenance("plan_resource_items") },
    resource_assignments_and_requirements: { semanticValue: [
      { kind: "zoneAssignments", value: input.zoneResourceAssignments },
      { kind: "spaceAssignments", value: input.spaceResourceAssignments },
      { kind: "zoneRequirements", value: input.zoneResourceTypeRequirements },
      { kind: "spaceRequirements", value: input.spaceResourceTypeRequirements },
      { kind: "components", value: input.resourceItemComponents },
    ], provenance: provenance("plan_resource_authorities") },
    ...(bundleUnavailable ? {} : { resource_bundles: { semanticValue: [
      ...(input.resourceBundles ?? []).map((row) => ({ kind: "bundle", ...row })),
      ...(input.resourceBundleComponents ?? []).map((row) => ({ kind: "component", ...row })),
      ...(input.resourceBundleSpaceAffinities ?? []).map((row) => ({ kind: "spaceAffinity", ...row })),
    ], provenance: provenance("plan_resource_bundle_snapshots") } }),
  };
}
