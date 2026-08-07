import type {
  PlanOptimizerSnapshotV1,
  PlanOptimizerSnapshotSourceV1,
  PlanOptimizerEditingModeV1,
} from "../server/planOptimizerSnapshot";

export const PLAN_OPTIMIZER_LEGACY_ENGINE_ADAPTER_VERSION = 1 as const;

export interface PlanOptimizerDailyTemplateIdentityV1 {
  readonly planTemplateSnapshotId: number;
  readonly sourceTemplateId: number;
  readonly templateName: string;
}

export interface LegacyEngineOptimizerProjectionV1 {
  readonly adapterVersion: 1;
  readonly snapshot: Readonly<{
    contractVersion: 1;
    source: PlanOptimizerSnapshotSourceV1;
    editingMode: PlanOptimizerEditingModeV1;
    configurationFingerprint: string;
    compatibilityWarnings: readonly string[];
    ignoredActiveHeuristics: readonly string[];
  }>;
  readonly mainZoneId: number | null;
  readonly prioritizeMainZone: boolean;
  readonly groupBySpaceAndTemplate: boolean;
  readonly groupingZoneIds: readonly number[];
  readonly mainZonePriorityLevel: number;
  readonly groupingLevel: number;
  readonly mainZoneOptFinishEarly: boolean;
  readonly mainZoneOptKeepBusy: boolean;
  readonly contestantCompactLevel: number;
  readonly contestantStayInZoneLevel: number;
  readonly nearHardBreaksMax: number;
  readonly weights: Readonly<{
    mainZoneFinishEarly: number;
    mainZoneKeepBusy: number;
    contestantCompact: number;
    groupBySpaceTemplateMatch: number;
    groupBySpaceActive: number;
    contestantStayInZone: number;
    contestantTotalSpan: number;
    arrivalDepartureGrouping: number;
  }>;
  readonly transport: Readonly<{
    arrivalPlanTemplateSnapshotId: number | null;
    departurePlanTemplateSnapshotId: number | null;
    arrivalSourceTemplateId: number | null;
    departureSourceTemplateId: number | null;
    arrivalTemplateName: string;
    departureTemplateName: string;
    arrivalGroupingTarget: number;
    departureGroupingTarget: number;
    arrivalMinGapMinutes: number;
    departureMinGapMinutes: number;
    vanCapacity: number;
    groupingWeight: number;
  }>;
}

export class PlanOptimizerLegacyAdapterError extends Error {
  constructor(
    readonly code:
      | "INVALID_DAILY_TEMPLATE_IDENTITY"
      | "DUPLICATE_DAILY_TEMPLATE_IDENTITY"
      | "OPTIMIZER_TRANSPORT_TEMPLATE_IDENTITY_UNAVAILABLE",
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(`${code}: ${message}`);
    this.name = "PlanOptimizerLegacyAdapterError";
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new PlanOptimizerLegacyAdapterError(
      "INVALID_DAILY_TEMPLATE_IDENTITY",
      `${field} must be a positive integer.`,
      { field, value },
    );
  }
  return parsed;
}

function indexDailyTemplateIdentities(
  identities: readonly PlanOptimizerDailyTemplateIdentityV1[],
): ReadonlyMap<number, Readonly<{ sourceTemplateId: number; templateName: string }>> {
  const byDailyId = new Map<number, Readonly<{ sourceTemplateId: number; templateName: string }>>();
  for (const identity of identities) {
    const planTemplateSnapshotId = positiveInteger(identity.planTemplateSnapshotId, "planTemplateSnapshotId");
    const sourceTemplateId = positiveInteger(identity.sourceTemplateId, "sourceTemplateId");
    const templateName = String(identity.templateName ?? "").trim();
    if (!templateName) {
      throw new PlanOptimizerLegacyAdapterError(
        "INVALID_DAILY_TEMPLATE_IDENTITY",
        "Daily task-template identity needs a non-empty template name.",
        { planTemplateSnapshotId, sourceTemplateId },
      );
    }
    if (byDailyId.has(planTemplateSnapshotId)) {
      throw new PlanOptimizerLegacyAdapterError(
        "DUPLICATE_DAILY_TEMPLATE_IDENTITY",
        "Daily task-template snapshot identity is duplicated.",
        { planTemplateSnapshotId },
      );
    }
    byDailyId.set(planTemplateSnapshotId, Object.freeze({ sourceTemplateId, templateName }));
  }
  return byDailyId;
}

function resolveTransportIdentity(
  direction: "arrival" | "departure",
  planTemplateSnapshotId: number | null,
  byDailyId: ReadonlyMap<number, Readonly<{ sourceTemplateId: number; templateName: string }>>,
): Readonly<{ sourceTemplateId: number | null; templateName: string }> {
  if (planTemplateSnapshotId === null) {
    return Object.freeze({ sourceTemplateId: null, templateName: "" });
  }
  const identity = byDailyId.get(planTemplateSnapshotId);
  if (!identity) {
    throw new PlanOptimizerLegacyAdapterError(
      "OPTIMIZER_TRANSPORT_TEMPLATE_IDENTITY_UNAVAILABLE",
      `Optimizer ${direction} reference does not exist in the plan task-template snapshot catalog.`,
      { direction, planTemplateSnapshotId },
    );
  }
  return identity;
}

/**
 * Pure compatibility projection from the authoritative per-plan optimizer snapshot
 * to the legacy EngineInput surface still consumed by V3/V4.
 *
 * This adapter never reads DB state and deliberately does not activate capabilities
 * that the current productive buildInput kept disabled. In particular,
 * CONTESTANT_TOTAL_SPAN remains projected as 0 until a dedicated behavior change is
 * evidenced and approved.
 */
export function adaptPlanOptimizerSnapshotToLegacyEngineV1(
  snapshot: PlanOptimizerSnapshotV1,
  dailyTemplateIdentities: readonly PlanOptimizerDailyTemplateIdentityV1[],
): LegacyEngineOptimizerProjectionV1 {
  const byDailyId = indexDailyTemplateIdentities(dailyTemplateIdentities);
  const arrival = resolveTransportIdentity(
    "arrival",
    snapshot.transport.arrivalPlanTemplateSnapshotId,
    byDailyId,
  );
  const departure = resolveTransportIdentity(
    "departure",
    snapshot.transport.departurePlanTemplateSnapshotId,
    byDailyId,
  );

  const h = snapshot.heuristics;
  const groupingEffectiveWeight = Math.max(
    h.GROUP_BY_SPACE_TEMPLATE_MATCH.effectiveWeight,
    h.GROUP_BY_SPACE_ACTIVE.effectiveWeight,
  );
  const groupingBasicLevel = Math.max(
    h.GROUP_BY_SPACE_TEMPLATE_MATCH.basicLevel,
    h.GROUP_BY_SPACE_ACTIVE.basicLevel,
  );
  const ignoredActiveHeuristics = h.CONTESTANT_TOTAL_SPAN.effectiveWeight > 0
    ? ["CONTESTANT_TOTAL_SPAN"]
    : [];
  const compatibilityWarnings = [
    "OPTIMIZER_LEGACY_ENGINE_ADAPTER_V1",
    ...(snapshot.source === "LEGACY_BACKFILL" ? ["OPTIMIZER_SNAPSHOT_LEGACY_BACKFILL"] : []),
    ...(ignoredActiveHeuristics.length > 0 ? ["OPTIMIZER_ACTIVE_HEURISTIC_NOT_PROJECTED"] : []),
  ];

  return deepFreeze({
    adapterVersion: PLAN_OPTIMIZER_LEGACY_ENGINE_ADAPTER_VERSION,
    snapshot: {
      contractVersion: snapshot.contractVersion,
      source: snapshot.source,
      editingMode: snapshot.editingMode,
      configurationFingerprint: snapshot.configurationFingerprint,
      compatibilityWarnings,
      ignoredActiveHeuristics,
    },
    mainZoneId: snapshot.mainZoneId,
    prioritizeMainZone: h.MAIN_ZONE_PRIORITY.effectiveWeight > 0,
    groupBySpaceAndTemplate: groupingEffectiveWeight > 0,
    groupingZoneIds: [...snapshot.groupingZoneIds],
    mainZonePriorityLevel: h.MAIN_ZONE_PRIORITY.basicLevel,
    groupingLevel: groupingBasicLevel,
    mainZoneOptFinishEarly: h.MAIN_ZONE_FINISH_EARLY.effectiveWeight > 0,
    mainZoneOptKeepBusy: h.MAIN_ZONE_KEEP_BUSY.effectiveWeight > 0,
    contestantCompactLevel: h.CONTESTANT_COMPACT.basicLevel,
    contestantStayInZoneLevel: h.CONTESTANT_STAY_IN_ZONE.basicLevel,
    nearHardBreaksMax: snapshot.nearHardBreaksMax,
    weights: {
      mainZoneFinishEarly: h.MAIN_ZONE_FINISH_EARLY.effectiveWeight,
      mainZoneKeepBusy: h.MAIN_ZONE_KEEP_BUSY.effectiveWeight,
      contestantCompact: h.CONTESTANT_COMPACT.effectiveWeight,
      groupBySpaceTemplateMatch: h.GROUP_BY_SPACE_TEMPLATE_MATCH.effectiveWeight,
      groupBySpaceActive: h.GROUP_BY_SPACE_ACTIVE.effectiveWeight,
      contestantStayInZone: h.CONTESTANT_STAY_IN_ZONE.effectiveWeight,
      contestantTotalSpan: 0,
      arrivalDepartureGrouping: snapshot.transport.groupingWeight,
    },
    transport: {
      arrivalPlanTemplateSnapshotId: snapshot.transport.arrivalPlanTemplateSnapshotId,
      departurePlanTemplateSnapshotId: snapshot.transport.departurePlanTemplateSnapshotId,
      arrivalSourceTemplateId: arrival.sourceTemplateId,
      departureSourceTemplateId: departure.sourceTemplateId,
      arrivalTemplateName: arrival.templateName,
      departureTemplateName: departure.templateName,
      arrivalGroupingTarget: snapshot.transport.arrivalGroupingTarget,
      departureGroupingTarget: snapshot.transport.departureGroupingTarget,
      arrivalMinGapMinutes: snapshot.transport.arrivalMinGapMinutes,
      departureMinGapMinutes: snapshot.transport.departureMinGapMinutes,
      vanCapacity: snapshot.transport.vanCapacity,
      groupingWeight: snapshot.transport.groupingWeight,
    },
  });
}
