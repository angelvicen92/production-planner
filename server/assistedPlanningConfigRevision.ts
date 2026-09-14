import {
  canonicalizeEffectivePlanConfigAuthorityValueV1,
  EFFECTIVE_PLAN_CONFIG_DERIVED_AUTHORITIES_V1,
  type BuildEffectivePlanConfigRevisionInputV1,
  type EffectivePlanConfigDerivedAuthorityV1,
  type EffectivePlanConfigRevisionV1,
} from "./effectivePlanConfigRevision";
import type { PlanOptimizerSnapshotV1 } from "./planOptimizerSnapshot";
import {
  normalizeTaskTemplateCatalogEntry,
  type TaskTemplateOperationalSnapshotV1,
} from "./taskTemplateSnapshot";

export const EFFECTIVE_PLAN_CONFIG_REPLAY_SNAPSHOT_VERSION = 1 as const;

/** Compact, immutable semantic inputs needed to replay an effective revision. */
export interface EffectivePlanConfigReplaySnapshotV1 {
  readonly contractVersion: 1;
  readonly taskTemplateSnapshots: readonly TaskTemplateOperationalSnapshotV1[];
  readonly optimizerSnapshot: PlanOptimizerSnapshotV1;
  readonly authorities: Readonly<Partial<Record<EffectivePlanConfigDerivedAuthorityV1, unknown>>>;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    // Array order can itself be operational (for example optimizer precedence).
    return value.map(canonical);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) throw new Error(`undefined is not valid replay data at ${key}`);
      return [key, canonical(item)];
    }));
  }
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
  throw new Error("replay snapshot must contain JSON values only");
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

export function buildEffectivePlanConfigReplaySnapshotV1(
  input: Pick<BuildEffectivePlanConfigRevisionInputV1, "taskTemplateSnapshots" | "optimizerSnapshot" | "authorities">,
): EffectivePlanConfigReplaySnapshotV1 {
  const taskTemplateSnapshots = input.taskTemplateSnapshots
    .map((snapshot) => normalizeTaskTemplateCatalogEntry(snapshot, snapshot.source))
    .sort((left, right) => left.sourceTemplateId - right.sourceTemplateId);
  // This is already the normalized ASST-002 snapshot. Re-normalizing it as a
  // mutable settings row would lose nested transport fields.
  const optimizerSnapshot = canonical(input.optimizerSnapshot) as PlanOptimizerSnapshotV1;
  const authorities: Partial<Record<EffectivePlanConfigDerivedAuthorityV1, unknown>> = {};
  for (const authority of EFFECTIVE_PLAN_CONFIG_DERIVED_AUTHORITIES_V1) {
    const component = input.authorities[authority];
    if (component) {
      authorities[authority] = canonicalizeEffectivePlanConfigAuthorityValueV1(authority, component.semanticValue);
    }
  }
  return deepFreeze(canonical({ contractVersion: 1, taskTemplateSnapshots, optimizerSnapshot, authorities }) as unknown as EffectivePlanConfigReplaySnapshotV1);
}

export interface PersistablePlanConfigRevisionV1 {
  readonly identity: EffectivePlanConfigRevisionV1;
  readonly replaySnapshot: EffectivePlanConfigReplaySnapshotV1;
}
