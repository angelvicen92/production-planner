import { createHash } from "node:crypto";
import type { PlanOptimizerSnapshotV1 } from "./planOptimizerSnapshot";
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
  readonly authorities: Readonly<Record<EffectivePlanConfigDerivedAuthorityV1, EffectivePlanConfigAuthorityInputV1>>;
}

export interface EffectivePlanConfigComponentRevisionV1 {
  readonly authority: "task_templates" | "optimizer" | EffectivePlanConfigDerivedAuthorityV1;
  readonly identityKind: "REUSED_CANONICAL_FINGERPRINT" | "DERIVED_SEMANTIC_FINGERPRINT";
  readonly fingerprint: string;
  readonly provenance: EffectivePlanConfigProvenanceV1;
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

function canonicalize(value: unknown, path: string): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    // These authorities are catalogs/sets of effective rows. Their storage order is not semantic.
    return value.map((entry, index) => canonicalize(entry, `${path}[${index}]`))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw invalidAuthority(path, "semanticValue must contain only JSON records and arrays");
    }
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => {
      const nested = (value as Record<string, unknown>)[key];
      if (nested === undefined) throw invalidAuthority(`${path}.${key}`, "undefined is not canonical");
      return [key, canonicalize(nested, `${path}.${key}`)];
    }));
  }
  throw invalidAuthority(path, `unsupported semantic value type ${typeof value}`);
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
      fingerprint: deriveTaskTemplateSnapshotCatalogFingerprint(input.taskTemplateSnapshots),
      provenance: validateProvenance(input.taskTemplateProvenance, "task_templates"),
    },
    {
      authority: "optimizer",
      identityKind: "REUSED_CANONICAL_FINGERPRINT",
      fingerprint: input.optimizerSnapshot.configurationFingerprint,
      provenance: validateProvenance(input.optimizerProvenance, "optimizer"),
    },
  ];

  for (const authority of EFFECTIVE_PLAN_CONFIG_DERIVED_AUTHORITIES_V1) {
    const component = input.authorities?.[authority];
    if (!component) {
      throw new EffectivePlanConfigRevisionError(
        "MISSING_EFFECTIVE_AUTHORITY",
        `Missing required daily authority ${authority}.`,
        { authority },
      );
    }
    components.push({
      authority,
      identityKind: "DERIVED_SEMANTIC_FINGERPRINT",
      fingerprint: digest({ contractVersion: 1, authority, semanticValue: canonicalize(component.semanticValue, authority) }),
      provenance: validateProvenance(component.provenance, authority),
    });
  }

  components.sort((left, right) => left.authority.localeCompare(right.authority));
  const configurationFingerprint = digest({
    contractVersion: EFFECTIVE_PLAN_CONFIG_REVISION_CONTRACT_VERSION,
    components: components.map(({ authority, fingerprint }) => ({ authority, fingerprint })),
  });
  return deepFreeze({
    contractVersion: EFFECTIVE_PLAN_CONFIG_REVISION_CONTRACT_VERSION,
    planId: input.planId,
    components,
    configurationFingerprint,
  });
}
