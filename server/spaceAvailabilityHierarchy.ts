import { resolveEffectiveSpaceAvailabilityHierarchy, type AvailabilityWindow, type NullableAvailabilityWindow } from "../shared/spatialAvailabilityHierarchy";
export { resolveEffectiveSpaceAvailabilityHierarchy } from "../shared/spatialAvailabilityHierarchy";
export type { AvailabilityWindow, NullableAvailabilityWindow, SpatialAvailabilityInput, SpatialAvailabilityReason, SpatialAvailabilityResult } from "../shared/spatialAvailabilityHierarchy";
export type SpatialCatalogZone = Readonly<{ id: number; availabilityStart: unknown; availabilityEnd: unknown }>;
export type SpatialCatalogSpace = Readonly<{ id: number; zoneId: number; availabilityStart: unknown; availabilityEnd: unknown }>;

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

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
  zones: ReadonlyArray<{ id: number; defaultAvailabilityStart: unknown; defaultAvailabilityEnd: unknown }>;
  spaces: ReadonlyArray<{ id: number; zoneId: number; defaultAvailabilityStart: unknown; defaultAvailabilityEnd: unknown }>;
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

export function validateSpatialAvailabilityCatalog(input: Readonly<{
  workDay: NullableAvailabilityWindow;
  zones: readonly SpatialCatalogZone[];
  spaces: readonly SpatialCatalogSpace[];
}>): Readonly<{ workDay: AvailabilityWindow; zoneIds: readonly number[]; spaceIds: readonly number[] }> {
  const zones = [...input.zones].sort((a, b) => a.id - b.id);
  const spaces = [...input.spaces].sort((a, b) => a.id - b.id);
  const byZone = new Map(zones.map((zone) => [zone.id, zone]));
  for (const zone of zones) {
    const result = resolveEffectiveSpaceAvailabilityHierarchy({
      workDay: input.workDay,
      zoneAvailability: { start: zone.availabilityStart, end: zone.availabilityEnd },
      spaceAvailability: { start: null, end: null },
    });
    if (!result.valid) throw new Error(`${result.reason}: zone ${zone.id}`);
  }
  for (const space of spaces) {
    const zone = byZone.get(space.zoneId);
    if (!zone) throw new Error(`SPACE_ZONE_NOT_FOUND: space ${space.id}, zone ${space.zoneId}`);
    const result = resolveEffectiveSpaceAvailabilityHierarchy({
      workDay: input.workDay,
      zoneAvailability: { start: zone.availabilityStart, end: zone.availabilityEnd },
      spaceAvailability: { start: space.availabilityStart, end: space.availabilityEnd },
    });
    if (!result.valid) throw new Error(`${result.reason}: space ${space.id}, zone ${space.zoneId}`);
  }
  const workdayResult = resolveEffectiveSpaceAvailabilityHierarchy({ workDay: input.workDay, zoneAvailability: { start: null, end: null }, spaceAvailability: { start: null, end: null } });
  if (!workdayResult.valid) throw new Error(workdayResult.reason);
  return Object.freeze({ workDay: workdayResult.workDay, zoneIds: Object.freeze(zones.map(({ id }) => id)), spaceIds: Object.freeze(spaces.map(({ id }) => id)) });
}

export type ExistingZoneSnapshot = Readonly<{ zoneId: number; availabilityStart: unknown; availabilityEnd: unknown; source: string }>;
export type ExistingSpaceSnapshot = Readonly<{ spaceId: number; zoneId: number; availabilityStart: unknown; availabilityEnd: unknown; source: string }>;

export function buildPlanSpatialAvailabilityInitializationBatch(input: Readonly<{
  planId: number;
  workDay: NullableAvailabilityWindow;
  zones: readonly SpatialCatalogZone[];
  spaces: readonly SpatialCatalogSpace[];
  existingZones: readonly ExistingZoneSnapshot[];
  existingSpaces: readonly ExistingSpaceSnapshot[];
}>): Readonly<{ zones: SpatialSnapshotBatch["zones"]; spaces: SpatialSnapshotBatch["spaces"] }> {
  const existingZoneById = new Map(input.existingZones.map((row) => [row.zoneId, row]));
  const existingSpaceById = new Map(input.existingSpaces.map((row) => [row.spaceId, row]));
  const finalZones: SpatialCatalogZone[] = [...input.zones].sort((a, b) => a.id - b.id).map((zone) => {
    const existing = existingZoneById.get(zone.id);
    return existing ? { id: existing.zoneId, availabilityStart: existing.availabilityStart, availabilityEnd: existing.availabilityEnd } : zone;
  });
  for (const existing of input.existingZones) {
    if (!finalZones.some((zone) => zone.id === existing.zoneId)) finalZones.push({ id: existing.zoneId, availabilityStart: existing.availabilityStart, availabilityEnd: existing.availabilityEnd });
  }
  const finalSpaces: SpatialCatalogSpace[] = [...input.spaces].sort((a, b) => a.id - b.id).map((space) => {
    const existing = existingSpaceById.get(space.id);
    return existing ? { id: existing.spaceId, zoneId: existing.zoneId, availabilityStart: existing.availabilityStart, availabilityEnd: existing.availabilityEnd } : space;
  });
  for (const existing of input.existingSpaces) {
    if (!finalSpaces.some((space) => space.id === existing.spaceId)) finalSpaces.push({ id: existing.spaceId, zoneId: existing.zoneId, availabilityStart: existing.availabilityStart, availabilityEnd: existing.availabilityEnd });
  }
  validateSpatialAvailabilityCatalog({ workDay: input.workDay, zones: finalZones, spaces: finalSpaces });
  const newZones = [...input.zones].filter((zone) => !existingZoneById.has(zone.id)).sort((a, b) => a.id - b.id).map((zone) => Object.freeze({ plan_id: input.planId, zone_id: zone.id, availability_start: zone.availabilityStart as string | null, availability_end: zone.availabilityEnd as string | null, source: "default" as const }));
  const newSpaces = [...input.spaces].filter((space) => !existingSpaceById.has(space.id)).sort((a, b) => a.id - b.id).map((space) => Object.freeze({ plan_id: input.planId, space_id: space.id, zone_id: space.zoneId, availability_start: space.availabilityStart as string | null, availability_end: space.availabilityEnd as string | null, source: "default" as const }));
  return Object.freeze({ zones: Object.freeze(newZones), spaces: Object.freeze(newSpaces) });
}
