import {
  PLAN_OPTIMIZER_HEURISTIC_KEYS_V1,
  type PlanOptimizerHeuristicKeyV1,
  type PlanOptimizerSnapshotSourceV1,
  type PlanOptimizerSnapshotV1,
} from "./planOptimizerSnapshot";

export const PLAN_OPTIMIZER_SNAPSHOT_DIFF_CONTRACT_VERSION = 1 as const;

export type PlanOptimizerSnapshotDiffCategoryV1 =
  | "EDITING_MODE"
  | "MAIN_ZONE"
  | "HEURISTIC"
  | "GROUPING_ZONES"
  | "TRANSPORT_TEMPLATE"
  | "TRANSPORT_PARAMETER"
  | "NEAR_HARD";

export type PlanOptimizerSnapshotDiffValueV1 =
  | string
  | number
  | null
  | readonly number[]
  | Readonly<{
      basicLevel: number;
      advancedValue: number;
      effectiveWeight: number;
    }>;

export interface PlanOptimizerSnapshotChangeV1 {
  readonly path: string;
  readonly category: PlanOptimizerSnapshotDiffCategoryV1;
  readonly heuristicKey?: PlanOptimizerHeuristicKeyV1;
  readonly currentValue: PlanOptimizerSnapshotDiffValueV1;
  readonly candidateValue: PlanOptimizerSnapshotDiffValueV1;
}

export interface PlanOptimizerSnapshotDiffV1 {
  readonly contractVersion: 1;
  readonly current: Readonly<{
    source: PlanOptimizerSnapshotSourceV1;
    configurationFingerprint: string;
  }>;
  readonly candidate: Readonly<{
    source: PlanOptimizerSnapshotSourceV1;
    configurationFingerprint: string;
  }>;
  /** Source/provenance is shown separately and is not itself a semantic optimizer change. */
  readonly provenanceChanged: boolean;
  readonly hasSemanticChanges: boolean;
  /** A changed policy only affects scheduling after an explicit replan action. */
  readonly replanningRequiredForEffect: boolean;
  readonly changes: readonly PlanOptimizerSnapshotChangeV1[];
  readonly warnings: readonly (
    | "CURRENT_OPTIMIZER_SNAPSHOT_LEGACY_BACKFILL"
    | "CANDIDATE_OPTIMIZER_SNAPSHOT_LEGACY_BACKFILL"
  )[];
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function heuristicEqual(
  left: PlanOptimizerSnapshotV1["heuristics"][PlanOptimizerHeuristicKeyV1],
  right: PlanOptimizerSnapshotV1["heuristics"][PlanOptimizerHeuristicKeyV1],
): boolean {
  return left.basicLevel === right.basicLevel
    && left.advancedValue === right.advancedValue
    && left.effectiveWeight === right.effectiveWeight;
}

function heuristicValue(
  value: PlanOptimizerSnapshotV1["heuristics"][PlanOptimizerHeuristicKeyV1],
): Readonly<{ basicLevel: number; advancedValue: number; effectiveWeight: number }> {
  return Object.freeze({
    basicLevel: value.basicLevel,
    advancedValue: value.advancedValue,
    effectiveWeight: value.effectiveWeight,
  });
}

function pushScalarChange(
  changes: PlanOptimizerSnapshotChangeV1[],
  category: PlanOptimizerSnapshotDiffCategoryV1,
  path: string,
  currentValue: string | number | null,
  candidateValue: string | number | null,
): void {
  if (currentValue === candidateValue) return;
  changes.push(Object.freeze({ category, path, currentValue, candidateValue }));
}

/**
 * Canonical, DB-free comparison used by future preview/UI/update flows.
 *
 * Both inputs must already be valid PlanOptimizerSnapshotV1 values. The helper
 * deliberately does not read global settings, resolve names or mutate either input.
 * Change order is a contract: UI/API callers must not sort independently.
 */
export function diffPlanOptimizerSnapshotsV1(
  current: PlanOptimizerSnapshotV1,
  candidate: PlanOptimizerSnapshotV1,
): PlanOptimizerSnapshotDiffV1 {
  const changes: PlanOptimizerSnapshotChangeV1[] = [];

  pushScalarChange(changes, "EDITING_MODE", "editingMode", current.editingMode, candidate.editingMode);
  pushScalarChange(changes, "MAIN_ZONE", "mainZoneId", current.mainZoneId, candidate.mainZoneId);

  for (const heuristicKey of PLAN_OPTIMIZER_HEURISTIC_KEYS_V1) {
    const currentHeuristic = current.heuristics[heuristicKey];
    const candidateHeuristic = candidate.heuristics[heuristicKey];
    if (heuristicEqual(currentHeuristic, candidateHeuristic)) continue;
    changes.push(Object.freeze({
      category: "HEURISTIC" as const,
      path: `heuristics.${heuristicKey}`,
      heuristicKey,
      currentValue: heuristicValue(currentHeuristic),
      candidateValue: heuristicValue(candidateHeuristic),
    }));
  }

  if (!arraysEqual(current.groupingZoneIds, candidate.groupingZoneIds)) {
    changes.push(Object.freeze({
      category: "GROUPING_ZONES" as const,
      path: "groupingZoneIds",
      currentValue: Object.freeze([...current.groupingZoneIds]),
      candidateValue: Object.freeze([...candidate.groupingZoneIds]),
    }));
  }

  pushScalarChange(
    changes,
    "TRANSPORT_TEMPLATE",
    "transport.arrivalPlanTemplateSnapshotId",
    current.transport.arrivalPlanTemplateSnapshotId,
    candidate.transport.arrivalPlanTemplateSnapshotId,
  );
  pushScalarChange(
    changes,
    "TRANSPORT_TEMPLATE",
    "transport.departurePlanTemplateSnapshotId",
    current.transport.departurePlanTemplateSnapshotId,
    candidate.transport.departurePlanTemplateSnapshotId,
  );
  pushScalarChange(
    changes,
    "TRANSPORT_PARAMETER",
    "transport.arrivalGroupingTarget",
    current.transport.arrivalGroupingTarget,
    candidate.transport.arrivalGroupingTarget,
  );
  pushScalarChange(
    changes,
    "TRANSPORT_PARAMETER",
    "transport.departureGroupingTarget",
    current.transport.departureGroupingTarget,
    candidate.transport.departureGroupingTarget,
  );
  pushScalarChange(
    changes,
    "TRANSPORT_PARAMETER",
    "transport.arrivalMinGapMinutes",
    current.transport.arrivalMinGapMinutes,
    candidate.transport.arrivalMinGapMinutes,
  );
  pushScalarChange(
    changes,
    "TRANSPORT_PARAMETER",
    "transport.departureMinGapMinutes",
    current.transport.departureMinGapMinutes,
    candidate.transport.departureMinGapMinutes,
  );
  pushScalarChange(
    changes,
    "TRANSPORT_PARAMETER",
    "transport.vanCapacity",
    current.transport.vanCapacity,
    candidate.transport.vanCapacity,
  );
  pushScalarChange(
    changes,
    "TRANSPORT_PARAMETER",
    "transport.groupingWeight",
    current.transport.groupingWeight,
    candidate.transport.groupingWeight,
  );
  pushScalarChange(
    changes,
    "NEAR_HARD",
    "nearHardBreaksMax",
    current.nearHardBreaksMax,
    candidate.nearHardBreaksMax,
  );

  const hasSemanticChanges = current.configurationFingerprint !== candidate.configurationFingerprint;
  if ((changes.length > 0) !== hasSemanticChanges) {
    throw new Error(
      "PLAN_OPTIMIZER_DIFF_FINGERPRINT_MISMATCH: structured diff and configuration fingerprint disagree",
    );
  }

  const warnings: Array<
    "CURRENT_OPTIMIZER_SNAPSHOT_LEGACY_BACKFILL"
    | "CANDIDATE_OPTIMIZER_SNAPSHOT_LEGACY_BACKFILL"
  > = [];
  if (current.source === "LEGACY_BACKFILL") warnings.push("CURRENT_OPTIMIZER_SNAPSHOT_LEGACY_BACKFILL");
  if (candidate.source === "LEGACY_BACKFILL") warnings.push("CANDIDATE_OPTIMIZER_SNAPSHOT_LEGACY_BACKFILL");

  return deepFreeze({
    contractVersion: PLAN_OPTIMIZER_SNAPSHOT_DIFF_CONTRACT_VERSION,
    current: {
      source: current.source,
      configurationFingerprint: current.configurationFingerprint,
    },
    candidate: {
      source: candidate.source,
      configurationFingerprint: candidate.configurationFingerprint,
    },
    provenanceChanged: current.source !== candidate.source,
    hasSemanticChanges,
    replanningRequiredForEffect: hasSemanticChanges,
    changes,
    warnings,
  });
}
