import {
  PLAN_OPTIMIZER_HEURISTIC_KEYS_V1,
  normalizePlanOptimizerSnapshotV1,
  type PlanOptimizerHeuristicKeyV1,
  type PlanOptimizerSnapshotV1,
  type PlanOptimizerTransportSnapshotReferencesV1,
} from "./planOptimizerSnapshot";

export type PlanOptimizerTemplateSnapshotCandidateV1 = Readonly<{
  sourceTemplateId: number;
  templateName: string;
  planTemplateSnapshotId: number;
}>;

export type PlanOptimizerSnapshotPersistenceBundleV1 = Readonly<{
  snapshot: Readonly<{
    plan_id: number;
    contract_version: 1;
    source: PlanOptimizerSnapshotV1["source"];
    editing_mode: PlanOptimizerSnapshotV1["editingMode"];
    main_zone_id: number | null;
    arrival_plan_template_snapshot_id: number | null;
    departure_plan_template_snapshot_id: number | null;
    arrival_grouping_target: number;
    departure_grouping_target: number;
    arrival_min_gap_minutes: number;
    departure_min_gap_minutes: number;
    van_capacity: number;
    grouping_weight: number;
    near_hard_breaks_max: number;
  }>;
  heuristics: readonly Readonly<{
    heuristic_key: PlanOptimizerHeuristicKeyV1;
    basic_level: number;
    advanced_value: number;
  }>[];
  groupingZones: readonly Readonly<{ zone_id: number }>[];
}>;

export class PlanOptimizerSnapshotPersistenceError extends Error {
  constructor(
    readonly code:
      | "INVALID_PLAN_OPTIMIZER_SNAPSHOT_PERSISTENCE"
      | "MISSING_PLAN_OPTIMIZER_SNAPSHOT"
      | "INCOMPLETE_PLAN_OPTIMIZER_HEURISTICS"
      | "ACTIVE_TRANSPORT_TEMPLATE_UNRESOLVED"
      | "PLAN_OPTIMIZER_ZONE_OUT_OF_SCOPE",
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(`${code}: ${message}`);
    this.name = "PlanOptimizerSnapshotPersistenceError";
  }
}

type UnknownRecord = Readonly<Record<string, unknown>>;

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

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new PlanOptimizerSnapshotPersistenceError(
      "INVALID_PLAN_OPTIMIZER_SNAPSHOT_PERSISTENCE",
      `${field} must be a positive integer.`,
      { field, value },
    );
  }
  return parsed;
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

function clampedWeight(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(10, Math.round(parsed)));
}

function normalizedTemplateName(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("es-ES");
}

function templateMatches(
  name: unknown,
  candidates: readonly PlanOptimizerTemplateSnapshotCandidateV1[],
): readonly PlanOptimizerTemplateSnapshotCandidateV1[] {
  const normalized = normalizedTemplateName(name);
  if (!normalized) return Object.freeze([]);
  return Object.freeze(
    candidates
      .filter((candidate) => normalizedTemplateName(candidate.templateName) === normalized)
      .slice()
      .sort((left, right) => {
        const sourceOrder = left.sourceTemplateId - right.sourceTemplateId;
        return sourceOrder !== 0 ? sourceOrder : left.planTemplateSnapshotId - right.planTemplateSnapshotId;
      }),
  );
}

function resolveDirectionReference(
  direction: "arrival" | "departure",
  rawName: unknown,
  target: number,
  groupingWeight: number,
  candidates: readonly PlanOptimizerTemplateSnapshotCandidateV1[],
): number | null {
  const matches = templateMatches(rawName, candidates);
  const active = groupingWeight > 0 && target > 0;

  if (active && matches.length !== 1) {
    throw new PlanOptimizerSnapshotPersistenceError(
      "ACTIVE_TRANSPORT_TEMPLATE_UNRESOLVED",
      `Active ${direction} grouping needs exactly one daily task-template snapshot match.`,
      {
        direction,
        templateName: String(rawName ?? ""),
        matchCount: matches.length,
        sourceTemplateIds: matches.map((match) => match.sourceTemplateId),
      },
    );
  }

  return matches.length === 1 ? positiveInteger(matches[0].planTemplateSnapshotId, `${direction}PlanTemplateSnapshotId`) : null;
}

export function resolvePlanOptimizerTransportReferencesV1(
  rawSettings: unknown,
  candidates: readonly PlanOptimizerTemplateSnapshotCandidateV1[],
): PlanOptimizerTransportSnapshotReferencesV1 {
  const settings = asRecord(rawSettings);
  if (!settings) {
    throw new PlanOptimizerSnapshotPersistenceError(
      "INVALID_PLAN_OPTIMIZER_SNAPSHOT_PERSISTENCE",
      "Optimizer settings must be an object before transport references can be resolved.",
    );
  }

  const groupingWeight = clampedWeight(
    readPresent(settings, "weightArrivalDepartureGrouping", "weight_arrival_departure_grouping"),
  );
  const arrivalGroupingTarget = nonNegativeInteger(
    readPresent(settings, "arrivalGroupingTarget", "arrival_grouping_target"),
  );
  const departureGroupingTarget = nonNegativeInteger(
    readPresent(settings, "departureGroupingTarget", "departure_grouping_target"),
  );

  return Object.freeze({
    arrivalPlanTemplateSnapshotId: resolveDirectionReference(
      "arrival",
      readPresent(settings, "arrivalTaskTemplateName", "arrival_task_template_name"),
      arrivalGroupingTarget,
      groupingWeight,
      candidates,
    ),
    departurePlanTemplateSnapshotId: resolveDirectionReference(
      "departure",
      readPresent(settings, "departureTaskTemplateName", "departure_task_template_name"),
      departureGroupingTarget,
      groupingWeight,
      candidates,
    ),
  });
}

export function validatePlanOptimizerSnapshotZoneReferencesV1(
  snapshot: PlanOptimizerSnapshotV1,
  dailyZoneIds: readonly number[],
): void {
  const allowed = new Set(
    dailyZoneIds
      .map((zoneId) => Number(zoneId))
      .filter((zoneId) => Number.isFinite(zoneId) && Number.isInteger(zoneId) && zoneId > 0),
  );
  const missing = new Set<number>();
  if (snapshot.mainZoneId !== null && !allowed.has(snapshot.mainZoneId)) missing.add(snapshot.mainZoneId);
  for (const zoneId of snapshot.groupingZoneIds) {
    if (!allowed.has(zoneId)) missing.add(zoneId);
  }
  if (missing.size > 0) {
    throw new PlanOptimizerSnapshotPersistenceError(
      "PLAN_OPTIMIZER_ZONE_OUT_OF_SCOPE",
      "Optimizer snapshot references zones that do not belong to the plan spatial snapshot.",
      { zoneIds: [...missing].sort((left, right) => left - right) },
    );
  }
}

export function buildPlanOptimizerSnapshotPersistenceBundleV1(
  planIdValue: unknown,
  snapshot: PlanOptimizerSnapshotV1,
): PlanOptimizerSnapshotPersistenceBundleV1 {
  const planId = positiveInteger(planIdValue, "planId");
  const heuristics = Object.freeze(
    PLAN_OPTIMIZER_HEURISTIC_KEYS_V1.map((heuristicKey) => {
      const value = snapshot.heuristics[heuristicKey];
      return Object.freeze({
        heuristic_key: heuristicKey,
        basic_level: value.basicLevel,
        advanced_value: value.advancedValue,
      });
    }),
  );
  const groupingZones = Object.freeze(
    snapshot.groupingZoneIds.map((zoneId) => Object.freeze({ zone_id: zoneId })),
  );

  return Object.freeze({
    snapshot: Object.freeze({
      plan_id: planId,
      contract_version: 1 as const,
      source: snapshot.source,
      editing_mode: snapshot.editingMode,
      main_zone_id: snapshot.mainZoneId,
      arrival_plan_template_snapshot_id: snapshot.transport.arrivalPlanTemplateSnapshotId,
      departure_plan_template_snapshot_id: snapshot.transport.departurePlanTemplateSnapshotId,
      arrival_grouping_target: snapshot.transport.arrivalGroupingTarget,
      departure_grouping_target: snapshot.transport.departureGroupingTarget,
      arrival_min_gap_minutes: snapshot.transport.arrivalMinGapMinutes,
      departure_min_gap_minutes: snapshot.transport.departureMinGapMinutes,
      van_capacity: snapshot.transport.vanCapacity,
      grouping_weight: snapshot.transport.groupingWeight,
      near_hard_breaks_max: snapshot.nearHardBreaksMax,
    }),
    heuristics,
    groupingZones,
  });
}

export function hydratePlanOptimizerSnapshotV1(
  rawSnapshot: unknown,
  rawHeuristics: readonly unknown[],
  rawGroupingZones: readonly unknown[],
): PlanOptimizerSnapshotV1 {
  const snapshot = asRecord(rawSnapshot);
  if (!snapshot) {
    throw new PlanOptimizerSnapshotPersistenceError(
      "MISSING_PLAN_OPTIMIZER_SNAPSHOT",
      "The plan has no persisted optimizer snapshot.",
    );
  }
  if (Number(readPresent(snapshot, "contractVersion", "contract_version")) !== 1) {
    throw new PlanOptimizerSnapshotPersistenceError(
      "INVALID_PLAN_OPTIMIZER_SNAPSHOT_PERSISTENCE",
      "Unsupported persisted optimizer snapshot contract version.",
      { contractVersion: readPresent(snapshot, "contractVersion", "contract_version") },
    );
  }

  const heuristicByKey = new Map<PlanOptimizerHeuristicKeyV1, Readonly<{ basicLevel: number; advancedValue: number }>>();
  for (const raw of rawHeuristics) {
    const row = asRecord(raw);
    if (!row) {
      throw new PlanOptimizerSnapshotPersistenceError(
        "INVALID_PLAN_OPTIMIZER_SNAPSHOT_PERSISTENCE",
        "Optimizer heuristic row must be an object.",
      );
    }
    const key = String(readPresent(row, "heuristicKey", "heuristic_key")) as PlanOptimizerHeuristicKeyV1;
    if (!PLAN_OPTIMIZER_HEURISTIC_KEYS_V1.includes(key)) {
      throw new PlanOptimizerSnapshotPersistenceError(
        "INCOMPLETE_PLAN_OPTIMIZER_HEURISTICS",
        "Persisted optimizer snapshot contains an unsupported heuristic key.",
        { heuristicKey: key },
      );
    }
    if (heuristicByKey.has(key)) {
      throw new PlanOptimizerSnapshotPersistenceError(
        "INCOMPLETE_PLAN_OPTIMIZER_HEURISTICS",
        "Persisted optimizer snapshot contains a duplicate heuristic key.",
        { heuristicKey: key },
      );
    }
    heuristicByKey.set(key, Object.freeze({
      basicLevel: Number(readPresent(row, "basicLevel", "basic_level")),
      advancedValue: Number(readPresent(row, "advancedValue", "advanced_value")),
    }));
  }

  const missing = PLAN_OPTIMIZER_HEURISTIC_KEYS_V1.filter((key) => !heuristicByKey.has(key));
  if (missing.length > 0 || heuristicByKey.size !== PLAN_OPTIMIZER_HEURISTIC_KEYS_V1.length) {
    throw new PlanOptimizerSnapshotPersistenceError(
      "INCOMPLETE_PLAN_OPTIMIZER_HEURISTICS",
      "Persisted optimizer snapshot must contain exactly the V1 heuristic set.",
      { missing, count: heuristicByKey.size },
    );
  }

  const groupingZoneIds = rawGroupingZones
    .map((raw) => optionalPositiveInteger(readPresent(asRecord(raw), "zoneId", "zone_id")))
    .filter((zoneId): zoneId is number => zoneId !== null)
    .sort((left, right) => left - right);
  if (new Set(groupingZoneIds).size !== groupingZoneIds.length) {
    throw new PlanOptimizerSnapshotPersistenceError(
      "INVALID_PLAN_OPTIMIZER_SNAPSHOT_PERSISTENCE",
      "Persisted optimizer snapshot contains duplicate grouping zones.",
      { groupingZoneIds },
    );
  }

  const heuristics = Object.fromEntries(
    PLAN_OPTIMIZER_HEURISTIC_KEYS_V1.map((key) => [key, heuristicByKey.get(key)]),
  );
  const editingMode = String(readPresent(snapshot, "editingMode", "editing_mode") ?? "BASIC").trim().toUpperCase();

  return normalizePlanOptimizerSnapshotV1({
    contractVersion: 1,
    source: readPresent(snapshot, "source"),
    optimizationMode: editingMode === "ADVANCED" ? "advanced" : "basic",
    mainZoneId: readPresent(snapshot, "mainZoneId", "main_zone_id"),
    heuristics,
    groupingZoneIds,
    arrivalPlanTemplateSnapshotId: readPresent(snapshot, "arrivalPlanTemplateSnapshotId", "arrival_plan_template_snapshot_id"),
    departurePlanTemplateSnapshotId: readPresent(snapshot, "departurePlanTemplateSnapshotId", "departure_plan_template_snapshot_id"),
    arrivalGroupingTarget: readPresent(snapshot, "arrivalGroupingTarget", "arrival_grouping_target"),
    departureGroupingTarget: readPresent(snapshot, "departureGroupingTarget", "departure_grouping_target"),
    arrivalMinGapMinutes: readPresent(snapshot, "arrivalMinGapMinutes", "arrival_min_gap_minutes"),
    departureMinGapMinutes: readPresent(snapshot, "departureMinGapMinutes", "departure_min_gap_minutes"),
    vanCapacity: readPresent(snapshot, "vanCapacity", "van_capacity"),
    weightArrivalDepartureGrouping: readPresent(snapshot, "groupingWeight", "grouping_weight"),
    nearHardBreaksMax: readPresent(snapshot, "nearHardBreaksMax", "near_hard_breaks_max"),
  });
}
