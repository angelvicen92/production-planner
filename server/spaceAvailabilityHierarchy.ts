export type AvailabilityWindow = Readonly<{ start: string; end: string }>;
export type NullableAvailabilityWindow = Readonly<{ start: unknown; end: unknown }>;

export type SpatialAvailabilityReason =
  | "INVALID_WORKDAY"
  | "MISSING_ZONE_WINDOW_ENDPOINT"
  | "MIXED_ZONE_WINDOW"
  | "INVALID_ZONE_TIME_FORMAT"
  | "INVALID_ZONE_TIME_ORDER"
  | "ZONE_OUTSIDE_WORKDAY"
  | "MISSING_SPACE_WINDOW_ENDPOINT"
  | "MIXED_SPACE_WINDOW"
  | "INVALID_SPACE_TIME_FORMAT"
  | "INVALID_SPACE_TIME_ORDER"
  | "SPACE_OUTSIDE_ZONE";

export type SpatialAvailabilityResult =
  | Readonly<{
      valid: true;
      workDay: AvailabilityWindow;
      zone: Readonly<{ effectiveWindow: AvailabilityWindow; mode: "INHERITED_WORKDAY" | "EXPLICIT" }>;
      space: Readonly<{ effectiveWindow: AvailabilityWindow; mode: "INHERITED_ZONE" | "EXPLICIT" }>;
    }>
  | Readonly<{ valid: false; reason: SpatialAvailabilityReason; workDay: AvailabilityWindow | null }>;

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const freezeWindow = (start: string, end: string): AvailabilityWindow => Object.freeze({ start, end });
const invalid = (reason: SpatialAvailabilityReason, workDay: AvailabilityWindow | null): SpatialAvailabilityResult =>
  Object.freeze({ valid: false, reason, workDay });

function validateChildPair(
  value: NullableAvailabilityWindow,
  level: "ZONE" | "SPACE",
): { inherited: true } | { inherited: false; window: AvailabilityWindow } | { reason: SpatialAvailabilityReason } {
  const hasStart = own(value, "start");
  const hasEnd = own(value, "end");
  if (hasStart !== hasEnd || !hasStart) return { reason: `MISSING_${level}_WINDOW_ENDPOINT` };
  if (value.start === null && value.end === null) return { inherited: true };
  if (value.start === null || value.end === null) return { reason: `MIXED_${level}_WINDOW` };
  if (typeof value.start !== "string" || typeof value.end !== "string" || !TIME.test(value.start) || !TIME.test(value.end)) {
    return { reason: `INVALID_${level}_TIME_FORMAT` };
  }
  if (value.start >= value.end) return { reason: `INVALID_${level}_TIME_ORDER` };
  return { inherited: false, window: freezeWindow(value.start, value.end) };
}

export function resolveEffectiveSpaceAvailabilityHierarchy(input: Readonly<{
  workDay: NullableAvailabilityWindow;
  zoneAvailability: NullableAvailabilityWindow;
  spaceAvailability: NullableAvailabilityWindow;
}>): SpatialAvailabilityResult {
  const work = input.workDay;
  if (typeof work?.start !== "string" || typeof work?.end !== "string" || !TIME.test(work.start) || !TIME.test(work.end) || work.start >= work.end) {
    return invalid("INVALID_WORKDAY", null);
  }
  const workDay = freezeWindow(work.start, work.end);
  const zonePair = validateChildPair(input.zoneAvailability, "ZONE");
  if ("reason" in zonePair) return invalid(zonePair.reason, workDay);
  const zoneWindow = zonePair.inherited ? workDay : zonePair.window;
  if (zoneWindow.start < workDay.start || zoneWindow.end > workDay.end) return invalid("ZONE_OUTSIDE_WORKDAY", workDay);

  const spacePair = validateChildPair(input.spaceAvailability, "SPACE");
  if ("reason" in spacePair) return invalid(spacePair.reason, workDay);
  const spaceWindow = spacePair.inherited ? zoneWindow : spacePair.window;
  if (spaceWindow.start < zoneWindow.start || spaceWindow.end > zoneWindow.end) return invalid("SPACE_OUTSIDE_ZONE", workDay);

  return Object.freeze({
    valid: true,
    workDay,
    zone: Object.freeze({ effectiveWindow: zoneWindow, mode: zonePair.inherited ? "INHERITED_WORKDAY" : "EXPLICIT" }),
    space: Object.freeze({ effectiveWindow: spaceWindow, mode: spacePair.inherited ? "INHERITED_ZONE" : "EXPLICIT" }),
  });
}

export type SpatialSnapshotBatch = Readonly<{
  workStart: string;
  workEnd: string;
  zones: ReadonlyArray<Readonly<{ plan_id: number; zone_id: number; availability_start: string | null; availability_end: string | null; source: "default" }>>;
  spaces: ReadonlyArray<Readonly<{ plan_id: number; space_id: number; zone_id: number; availability_start: string | null; availability_end: string | null; source: "default" }>>;
}>;

export function buildPlanSpatialAvailabilitySnapshot(input: {
  planId: number;
  requestedWorkDay: { start?: unknown; end?: unknown };
  defaultWorkDay: NullableAvailabilityWindow;
  zones: Array<{ id: number; defaultAvailabilityStart: unknown; defaultAvailabilityEnd: unknown }>;
  spaces: Array<{ id: number; zoneId: number; defaultAvailabilityStart: unknown; defaultAvailabilityEnd: unknown }>;
}): SpatialSnapshotBatch {
  const hasStart = own(input.requestedWorkDay, "start") && input.requestedWorkDay.start !== undefined;
  const hasEnd = own(input.requestedWorkDay, "end") && input.requestedWorkDay.end !== undefined;
  if (hasStart !== hasEnd) throw new Error("WORKDAY_REQUEST_PARTIAL");
  const workDay = hasStart
    ? { start: input.requestedWorkDay.start, end: input.requestedWorkDay.end }
    : input.defaultWorkDay;
  const zoneById = new Map(input.zones.map((zone) => [zone.id, zone]));
  const sortedZones = [...input.zones].sort((a, b) => a.id - b.id);
  const sortedSpaces = [...input.spaces].sort((a, b) => a.id - b.id);
  const zoneRows = sortedZones.map((zone) => {
    const result = resolveEffectiveSpaceAvailabilityHierarchy({
      workDay,
      zoneAvailability: { start: zone.defaultAvailabilityStart, end: zone.defaultAvailabilityEnd },
      spaceAvailability: { start: null, end: null },
    });
    if (!result.valid) throw new Error(`${result.reason}: zone ${zone.id}`);
    return Object.freeze({ plan_id: input.planId, zone_id: zone.id, availability_start: zone.defaultAvailabilityStart as string | null, availability_end: zone.defaultAvailabilityEnd as string | null, source: "default" as const });
  });
  const spaceRows = sortedSpaces.map((space) => {
    const zone = zoneById.get(space.zoneId);
    if (!zone) throw new Error(`SPACE_ZONE_NOT_FOUND: space ${space.id}, zone ${space.zoneId}`);
    const result = resolveEffectiveSpaceAvailabilityHierarchy({
      workDay,
      zoneAvailability: { start: zone.defaultAvailabilityStart, end: zone.defaultAvailabilityEnd },
      spaceAvailability: { start: space.defaultAvailabilityStart, end: space.defaultAvailabilityEnd },
    });
    if (!result.valid) throw new Error(`${result.reason}: space ${space.id}, zone ${space.zoneId}`);
    return Object.freeze({ plan_id: input.planId, space_id: space.id, zone_id: space.zoneId, availability_start: space.defaultAvailabilityStart as string | null, availability_end: space.defaultAvailabilityEnd as string | null, source: "default" as const });
  });
  const checked = resolveEffectiveSpaceAvailabilityHierarchy({ workDay, zoneAvailability: { start: null, end: null }, spaceAvailability: { start: null, end: null } });
  if (!checked.valid) throw new Error(checked.reason);
  return Object.freeze({ workStart: checked.workDay.start, workEnd: checked.workDay.end, zones: Object.freeze(zoneRows), spaces: Object.freeze(spaceRows) });
}

export function missingSpatialSnapshots<T extends { zone_id?: number; space_id?: number }>(
  candidates: readonly T[], existingIds: readonly number[], kind: "zone" | "space",
): readonly T[] {
  const existing = new Set(existingIds);
  const key = kind === "zone" ? "zone_id" : "space_id";
  return Object.freeze(candidates.filter((row) => !existing.has(Number(row[key]))));
}
