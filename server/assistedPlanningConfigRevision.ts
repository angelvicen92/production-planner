import type { EffectivePlanConfigRevisionV1 } from "./effectivePlanConfigRevision";

export const EFFECTIVE_PLAN_CONFIG_REPLAY_SNAPSHOT_VERSION = 1 as const;

/** Compact, immutable semantic inputs needed to replay an effective revision. */
export interface EffectivePlanConfigReplaySnapshotV1 {
  readonly contractVersion: 1;
  readonly taskTemplateSnapshots: readonly unknown[];
  readonly optimizerSnapshot: Readonly<Record<string, unknown>>;
  readonly authorities: Readonly<Record<string, unknown>>;
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

export function buildEffectivePlanConfigReplaySnapshotV1(input: {
  taskTemplateSnapshots: readonly unknown[];
  optimizerSnapshot: Readonly<Record<string, unknown>>;
  authorities: Readonly<Record<string, unknown>>;
}): EffectivePlanConfigReplaySnapshotV1 {
  return Object.freeze(canonical({ contractVersion: 1, ...input }) as unknown as EffectivePlanConfigReplaySnapshotV1);
}

export interface PersistablePlanConfigRevisionV1 {
  readonly identity: EffectivePlanConfigRevisionV1;
  readonly replaySnapshot: EffectivePlanConfigReplaySnapshotV1;
}
