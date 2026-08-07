import { createHash } from "node:crypto";
import {
  clampAdvancedValue,
  clampBasicLevel,
  coerceOptimizationMode,
  mapAdvancedToBasic,
  mapBasicToAdvanced,
} from "../shared/optimizer";

export const PLAN_OPTIMIZER_SNAPSHOT_CONTRACT_VERSION = 1 as const;

export const PLAN_OPTIMIZER_HEURISTIC_KEYS_V1 = [
  "MAIN_ZONE_PRIORITY",
  "MAIN_ZONE_FINISH_EARLY",
  "MAIN_ZONE_KEEP_BUSY",
  "CONTESTANT_COMPACT",
  "GROUP_BY_SPACE_TEMPLATE_MATCH",
  "GROUP_BY_SPACE_ACTIVE",
  "CONTESTANT_STAY_IN_ZONE",
  "CONTESTANT_TOTAL_SPAN",
  "ARRIVAL_DEPARTURE_GROUPING",
] as const;

export type PlanOptimizerHeuristicKeyV1 = (typeof PLAN_OPTIMIZER_HEURISTIC_KEYS_V1)[number];
export type PlanOptimizerSnapshotSourceV1 = "INHERITED" | "LEGACY_BACKFILL" | "DAY_OVERRIDE";
export type PlanOptimizerEditingModeV1 = "BASIC" | "ADVANCED";

export interface PlanOptimizerHeuristicSnapshotV1 {
  readonly basicLevel: number;
  readonly advancedValue: number;
  readonly effectiveWeight: number;
}

export interface PlanOptimizerSnapshotV1 {
  readonly contractVersion: 1;
  readonly source: PlanOptimizerSnapshotSourceV1;
  readonly editingMode: PlanOptimizerEditingModeV1;
  readonly mainZoneId: number | null;
  readonly heuristics: Readonly<Record<PlanOptimizerHeuristicKeyV1, PlanOptimizerHeuristicSnapshotV1>>;
  readonly groupingZoneIds: readonly number[];
  readonly transport: Readonly<{
    arrivalPlanTemplateSnapshotId: number | null;
    departurePlanTemplateSnapshotId: number | null;
    arrivalGroupingTarget: number;
    departureGroupingTarget: number;
    arrivalMinGapMinutes: number;
    departureMinGapMinutes: number;
    vanCapacity: number;
    groupingWeight: number;
  }>;
  readonly nearHardBreaksMax: number;
  readonly configurationFingerprint: string;
}

export interface PlanOptimizerTransportSnapshotReferencesV1 {
  readonly arrivalPlanTemplateSnapshotId?: unknown;
  readonly departurePlanTemplateSnapshotId?: unknown;
}

export class PlanOptimizerSnapshotError extends Error {
  constructor(
    readonly code:
      | "INVALID_PLAN_OPTIMIZER_SNAPSHOT"
      | "MISSING_ACTIVE_TRANSPORT_TEMPLATE_SNAPSHOT",
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(`${code}: ${message}`);
    this.name = "PlanOptimizerSnapshotError";
  }
}

type UnknownRecord = Readonly<Record<string, unknown>>;

type CanonicalHeuristicSeed = Readonly<{
  basicLevel: number;
  advancedValue: number;
}>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function readPresent(record: UnknownRecord | null, ...keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  }
  return undefined;
}

function readNestedHeuristic(record: UnknownRecord, ...keys: string[]): UnknownRecord | null {
  const heuristics = asRecord(readPresent(record, "heuristics"));
  if (!heuristics) return null;
  for (const key of keys) {
    const candidate = asRecord(readPresent(heuristics, key));
    if (candidate) return candidate;
  }
  return null;
}

function optionalPositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function normalizeSource(value: unknown): PlanOptimizerSnapshotSourceV1 {
  const source = String(value ?? "INHERITED").trim().toUpperCase();
  if (source === "INHERITED" || source === "LEGACY_BACKFILL" || source === "DAY_OVERRIDE") {
    return source;
  }
  throw new PlanOptimizerSnapshotError(
    "INVALID_PLAN_OPTIMIZER_SNAPSHOT",
    "Unsupported snapshot source.",
    { source: value },
  );
}

function normalizePositiveIntegerArray(value: unknown): readonly number[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return Object.freeze([] as number[]);
  return Object.freeze(
    Array.from(
      new Set(
        raw
          .map((entry) => Number(entry))
          .filter((entry) => Number.isFinite(entry) && Number.isInteger(entry) && entry > 0),
      ),
    ).sort((left, right) => left - right),
  );
}

function legacyBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function heuristicSeed(
  nested: UnknownRecord | null,
  basicFallback: unknown,
  advancedFallback: unknown,
): CanonicalHeuristicSeed {
  const basicLevel = clampBasicLevel(
    readPresent(nested, "basicLevel", "basic_level") ?? basicFallback,
  );
  const advancedRaw = readPresent(nested, "advancedValue", "advanced_value") ?? advancedFallback;
  const advancedValue = advancedRaw === null || advancedRaw === undefined
    ? mapBasicToAdvanced(basicLevel)
    : clampAdvancedValue(advancedRaw);
  return Object.freeze({ basicLevel, advancedValue });
}

function canonicalHeuristic(
  mode: PlanOptimizerEditingModeV1,
  seed: CanonicalHeuristicSeed,
): PlanOptimizerHeuristicSnapshotV1 {
  return Object.freeze({
    basicLevel: seed.basicLevel,
    advancedValue: seed.advancedValue,
    effectiveWeight: mode === "ADVANCED" ? seed.advancedValue : mapBasicToAdvanced(seed.basicLevel),
  });
}

function transportGroupingHeuristic(weight: number): PlanOptimizerHeuristicSnapshotV1 {
  // V1 preserves the current product contract: transport grouping is edited and consumed
  // as a direct 0..10 weight independently from BASIC/ADVANCED optimizer mode.
  // The basic level is a deterministic derived representation only, never a second authority.
  return Object.freeze({
    basicLevel: mapAdvancedToBasic(weight),
    advancedValue: weight,
    effectiveWeight: weight,
  });
}

function keySort(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const numeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
  return numeric ? leftNumber - rightNumber : left.localeCompare(right);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.keys(record)
      .sort(keySort)
      .map((key) => [key, canonicalize(record[key])]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function deepFreezePlanOptimizerSnapshot<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreezePlanOptimizerSnapshot(nested);
  return Object.freeze(value);
}

function fingerprintPayload(
  snapshot: Omit<PlanOptimizerSnapshotV1, "configurationFingerprint" | "source">,
): UnknownRecord {
  return snapshot as unknown as UnknownRecord;
}

export function derivePlanOptimizerSnapshotFingerprint(
  snapshot: Omit<PlanOptimizerSnapshotV1, "configurationFingerprint" | "source">,
): string {
  return createHash("sha256")
    .update(stableJson(fingerprintPayload(snapshot)))
    .digest("hex");
}

export function normalizePlanOptimizerSnapshotV1(
  value: unknown,
  references: PlanOptimizerTransportSnapshotReferencesV1 = {},
  sourceOverride?: PlanOptimizerSnapshotSourceV1,
): PlanOptimizerSnapshotV1 {
  const record = asRecord(value);
  if (!record) {
    throw new PlanOptimizerSnapshotError(
      "INVALID_PLAN_OPTIMIZER_SNAPSHOT",
      "Optimizer settings input must be an object.",
    );
  }

  const mode: PlanOptimizerEditingModeV1 = coerceOptimizationMode(
    readPresent(record, "optimizationMode", "optimization_mode", "editingMode", "editing_mode"),
  ) === "advanced" ? "ADVANCED" : "BASIC";

  const prioritizeMainZone = legacyBoolean(
    readPresent(record, "prioritizeMainZone", "prioritize_main_zone"),
    false,
  );
  const groupBySpaceAndTemplate = legacyBoolean(
    readPresent(record, "groupBySpaceAndTemplate", "group_by_space_and_template"),
    true,
  );

  const mainZonePriority = heuristicSeed(
    readNestedHeuristic(record, "mainZonePriority", "MAIN_ZONE_PRIORITY"),
    readPresent(record, "mainZonePriorityLevel", "main_zone_priority_level") ?? (prioritizeMainZone ? 2 : 0),
    readPresent(record, "mainZonePriorityAdvancedValue", "main_zone_priority_advanced_value"),
  );
  const mainZoneFinishEarly = heuristicSeed(
    readNestedHeuristic(record, "mainZoneFinishEarly", "MAIN_ZONE_FINISH_EARLY"),
    readPresent(record, "mainZoneFinishEarlyLevel", "main_zone_finish_early_level") ?? mainZonePriority.basicLevel,
    readPresent(record, "mainZoneFinishEarlyAdvancedValue", "main_zone_finish_early_advanced_value") ?? mainZonePriority.advancedValue,
  );
  const mainZoneKeepBusy = heuristicSeed(
    readNestedHeuristic(record, "mainZoneKeepBusy", "MAIN_ZONE_KEEP_BUSY"),
    readPresent(record, "mainZoneKeepBusyLevel", "main_zone_keep_busy_level") ?? mainZonePriority.basicLevel,
    readPresent(record, "mainZoneKeepBusyAdvancedValue", "main_zone_keep_busy_advanced_value") ?? mainZonePriority.advancedValue,
  );
  const contestantCompact = heuristicSeed(
    readNestedHeuristic(record, "contestantCompact", "CONTESTANT_COMPACT"),
    readPresent(record, "contestantCompactLevel", "contestant_compact_level"),
    readPresent(record, "contestantCompactAdvancedValue", "contestant_compact_advanced_value"),
  );
  const grouping = heuristicSeed(
    readNestedHeuristic(record, "groupBySpaceTemplateMatch", "GROUP_BY_SPACE_TEMPLATE_MATCH", "groupBySpaceActive", "GROUP_BY_SPACE_ACTIVE"),
    readPresent(record, "groupingLevel", "grouping_level") ?? (groupBySpaceAndTemplate ? 2 : 0),
    readPresent(record, "groupingAdvancedValue", "grouping_advanced_value"),
  );
  const contestantStayInZone = heuristicSeed(
    readNestedHeuristic(record, "contestantStayInZone", "CONTESTANT_STAY_IN_ZONE"),
    readPresent(record, "contestantStayInZoneLevel", "contestant_stay_in_zone_level"),
    readPresent(record, "contestantStayInZoneAdvancedValue", "contestant_stay_in_zone_advanced_value"),
  );
  const contestantTotalSpan = heuristicSeed(
    readNestedHeuristic(record, "contestantTotalSpan", "CONTESTANT_TOTAL_SPAN"),
    readPresent(record, "contestantTotalSpanLevel", "contestant_total_span_level"),
    readPresent(record, "contestantTotalSpanAdvancedValue", "contestant_total_span_advanced_value"),
  );
  const directTransportWeight = clampAdvancedValue(
    readPresent(record, "weightArrivalDepartureGrouping", "weight_arrival_departure_grouping") ??
      readPresent(readNestedHeuristic(record, "arrivalDepartureGrouping", "ARRIVAL_DEPARTURE_GROUPING"), "advancedValue", "advanced_value"),
  );

  const heuristics = deepFreezePlanOptimizerSnapshot({
    MAIN_ZONE_PRIORITY: canonicalHeuristic(mode, mainZonePriority),
    MAIN_ZONE_FINISH_EARLY: canonicalHeuristic(mode, mainZoneFinishEarly),
    MAIN_ZONE_KEEP_BUSY: canonicalHeuristic(mode, mainZoneKeepBusy),
    CONTESTANT_COMPACT: canonicalHeuristic(mode, contestantCompact),
    GROUP_BY_SPACE_TEMPLATE_MATCH: canonicalHeuristic(mode, grouping),
    GROUP_BY_SPACE_ACTIVE: canonicalHeuristic(mode, grouping),
    CONTESTANT_STAY_IN_ZONE: canonicalHeuristic(mode, contestantStayInZone),
    CONTESTANT_TOTAL_SPAN: canonicalHeuristic(mode, contestantTotalSpan),
    ARRIVAL_DEPARTURE_GROUPING: transportGroupingHeuristic(directTransportWeight),
  } satisfies Record<PlanOptimizerHeuristicKeyV1, PlanOptimizerHeuristicSnapshotV1>);

  const arrivalPlanTemplateSnapshotId = optionalPositiveInteger(
    references.arrivalPlanTemplateSnapshotId ??
      readPresent(record, "arrivalPlanTemplateSnapshotId", "arrival_plan_template_snapshot_id"),
  );
  const departurePlanTemplateSnapshotId = optionalPositiveInteger(
    references.departurePlanTemplateSnapshotId ??
      readPresent(record, "departurePlanTemplateSnapshotId", "departure_plan_template_snapshot_id"),
  );
  const arrivalGroupingTarget = nonNegativeInteger(
    readPresent(record, "arrivalGroupingTarget", "arrival_grouping_target"),
  );
  const departureGroupingTarget = nonNegativeInteger(
    readPresent(record, "departureGroupingTarget", "departure_grouping_target"),
  );

  if (directTransportWeight > 0 && arrivalGroupingTarget > 0 && arrivalPlanTemplateSnapshotId === null) {
    throw new PlanOptimizerSnapshotError(
      "MISSING_ACTIVE_TRANSPORT_TEMPLATE_SNAPSHOT",
      "Active arrival grouping requires a daily arrival template snapshot id.",
      { direction: "arrival", groupingWeight: directTransportWeight, arrivalGroupingTarget },
    );
  }
  if (directTransportWeight > 0 && departureGroupingTarget > 0 && departurePlanTemplateSnapshotId === null) {
    throw new PlanOptimizerSnapshotError(
      "MISSING_ACTIVE_TRANSPORT_TEMPLATE_SNAPSHOT",
      "Active departure grouping requires a daily departure template snapshot id.",
      { direction: "departure", groupingWeight: directTransportWeight, departureGroupingTarget },
    );
  }

  const normalizedWithoutFingerprint = deepFreezePlanOptimizerSnapshot({
    contractVersion: PLAN_OPTIMIZER_SNAPSHOT_CONTRACT_VERSION,
    source: sourceOverride ?? normalizeSource(readPresent(record, "source")),
    editingMode: mode,
    mainZoneId: optionalPositiveInteger(readPresent(record, "mainZoneId", "main_zone_id")),
    heuristics,
    groupingZoneIds: normalizePositiveIntegerArray(
      readPresent(record, "groupingZoneIds", "grouping_zone_ids"),
    ),
    transport: {
      arrivalPlanTemplateSnapshotId,
      departurePlanTemplateSnapshotId,
      arrivalGroupingTarget,
      departureGroupingTarget,
      arrivalMinGapMinutes: nonNegativeInteger(readPresent(record, "arrivalMinGapMinutes", "arrival_min_gap_minutes")),
      departureMinGapMinutes: nonNegativeInteger(readPresent(record, "departureMinGapMinutes", "departure_min_gap_minutes")),
      vanCapacity: nonNegativeInteger(readPresent(record, "vanCapacity", "van_capacity")),
      groupingWeight: directTransportWeight,
    },
    nearHardBreaksMax: clampAdvancedValue(readPresent(record, "nearHardBreaksMax", "near_hard_breaks_max")),
  });

  const { source: _source, ...configuration } = normalizedWithoutFingerprint;
  return deepFreezePlanOptimizerSnapshot({
    ...normalizedWithoutFingerprint,
    configurationFingerprint: derivePlanOptimizerSnapshotFingerprint(configuration),
  });
}
