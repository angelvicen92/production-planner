import {
  normalizePlanOptimizerSnapshotV1,
  PlanOptimizerSnapshotError,
  type PlanOptimizerSnapshotV1,
} from "./planOptimizerSnapshot";
import {
  PlanOptimizerSnapshotPersistenceError,
  resolvePlanOptimizerTransportReferencesV1,
  validatePlanOptimizerSnapshotZoneReferencesV1,
  type PlanOptimizerTemplateSnapshotCandidateV1,
} from "./planOptimizerSnapshotPersistence";
import {
  diffPlanOptimizerSnapshotsV1,
  type PlanOptimizerSnapshotDiffV1,
} from "./planOptimizerSnapshotDiff";

export const PLAN_OPTIMIZER_REFRESH_PREVIEW_CONTRACT_VERSION = 1 as const;

export type PlanOptimizerRefreshPreviewIncompatibilityCodeV1 =
  | "ACTIVE_TRANSPORT_TEMPLATE_UNRESOLVED"
  | "PLAN_OPTIMIZER_ZONE_OUT_OF_SCOPE"
  | "INVALID_GLOBAL_OPTIMIZER_SETTINGS";

export interface PlanOptimizerRefreshPreviewIncompatibilityV1 {
  readonly code: PlanOptimizerRefreshPreviewIncompatibilityCodeV1;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface PlanOptimizerRefreshPreviewReadyV1 {
  readonly contractVersion: 1;
  readonly status: "READY";
  readonly current: PlanOptimizerSnapshotV1;
  readonly candidate: PlanOptimizerSnapshotV1;
  readonly diff: PlanOptimizerSnapshotDiffV1;
  readonly incompatibilities: readonly [];
}

export interface PlanOptimizerRefreshPreviewBlockedV1 {
  readonly contractVersion: 1;
  readonly status: "BLOCKED";
  readonly current: PlanOptimizerSnapshotV1;
  readonly candidate: null;
  readonly diff: null;
  readonly incompatibilities: readonly PlanOptimizerRefreshPreviewIncompatibilityV1[];
}

export type PlanOptimizerRefreshPreviewV1 =
  | PlanOptimizerRefreshPreviewReadyV1
  | PlanOptimizerRefreshPreviewBlockedV1;

export interface BuildPlanOptimizerRefreshPreviewInputV1 {
  readonly currentSnapshot: PlanOptimizerSnapshotV1;
  readonly globalOptimizerSettings: unknown;
  readonly dailyTemplateSnapshots: readonly PlanOptimizerTemplateSnapshotCandidateV1[];
  readonly dailyZoneIds: readonly number[];
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function blocked(
  currentSnapshot: PlanOptimizerSnapshotV1,
  incompatibility: PlanOptimizerRefreshPreviewIncompatibilityV1,
): PlanOptimizerRefreshPreviewBlockedV1 {
  return deepFreeze({
    contractVersion: PLAN_OPTIMIZER_REFRESH_PREVIEW_CONTRACT_VERSION,
    status: "BLOCKED" as const,
    current: currentSnapshot,
    candidate: null,
    diff: null,
    incompatibilities: [incompatibility],
  });
}

function normalizeKnownFailure(
  error: unknown,
): PlanOptimizerRefreshPreviewIncompatibilityV1 | null {
  if (error instanceof PlanOptimizerSnapshotPersistenceError) {
    if (error.code === "ACTIVE_TRANSPORT_TEMPLATE_UNRESOLVED") {
      return deepFreeze({
        code: "ACTIVE_TRANSPORT_TEMPLATE_UNRESOLVED" as const,
        message: error.message,
        details: error.details,
      });
    }
    if (error.code === "PLAN_OPTIMIZER_ZONE_OUT_OF_SCOPE") {
      return deepFreeze({
        code: "PLAN_OPTIMIZER_ZONE_OUT_OF_SCOPE" as const,
        message: error.message,
        details: error.details,
      });
    }
  }
  if (error instanceof PlanOptimizerSnapshotError) {
    return deepFreeze({
      code: "INVALID_GLOBAL_OPTIMIZER_SETTINGS" as const,
      message: error.message,
      details: error.details,
    });
  }
  return null;
}

/**
 * Builds the read-only candidate that an explicit "update day from global defaults"
 * action would attempt to persist later. This helper never writes, never reads DB and
 * never chooses a nominal transport match when the daily identity is ambiguous.
 */
export function buildPlanOptimizerRefreshPreviewV1(
  input: BuildPlanOptimizerRefreshPreviewInputV1,
): PlanOptimizerRefreshPreviewV1 {
  try {
    const references = resolvePlanOptimizerTransportReferencesV1(
      input.globalOptimizerSettings,
      input.dailyTemplateSnapshots,
    );
    const candidate = normalizePlanOptimizerSnapshotV1(
      input.globalOptimizerSettings,
      references,
      "DAY_OVERRIDE",
    );
    validatePlanOptimizerSnapshotZoneReferencesV1(candidate, input.dailyZoneIds);
    const diff = diffPlanOptimizerSnapshotsV1(input.currentSnapshot, candidate);

    return deepFreeze({
      contractVersion: PLAN_OPTIMIZER_REFRESH_PREVIEW_CONTRACT_VERSION,
      status: "READY" as const,
      current: input.currentSnapshot,
      candidate,
      diff,
      incompatibilities: [] as const,
    });
  } catch (error) {
    const incompatibility = normalizeKnownFailure(error);
    if (!incompatibility) throw error;
    return blocked(input.currentSnapshot, incompatibility);
  }
}
