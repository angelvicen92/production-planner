import type { PlanSpaceAvailabilityInput, PlanZoneAvailabilityInput, TimeWindow } from "../../types";
import { resolveEffectiveSpaceAvailabilityHierarchy, type AvailabilityWindow, type SpatialAvailabilityReason } from "../../../shared/spatialAvailabilityHierarchy";
import { immutableMapView } from "../../../shared/immutableMapView";

export type EffectiveSpatialDefectReason = SpatialAvailabilityReason | "MISSING_ZONE_SNAPSHOT" | "DUPLICATE_ZONE_SNAPSHOT" | "DUPLICATE_SPACE_SNAPSHOT";
export interface EffectiveSpatialDefect { readonly entity: "workday" | "zone" | "space"; readonly entityId: number | null; readonly reason: EffectiveSpatialDefectReason }
export interface EffectiveZoneAvailability { readonly zoneId: number; readonly effectiveWindow: AvailabilityWindow | null; readonly mode: "INHERITED_WORKDAY" | "EXPLICIT" | null; readonly source?: string; readonly defect?: EffectiveSpatialDefect }
export interface EffectiveSpaceAvailability { readonly spaceId: number; readonly zoneId: number; readonly effectiveWindow: AvailabilityWindow | null; readonly mode: "INHERITED_ZONE" | "EXPLICIT" | null; readonly source?: string; readonly defect?: EffectiveSpatialDefect }
export interface EffectivePlanSpatialAvailability { readonly zonesById: ReadonlyMap<number, EffectiveZoneAvailability>; readonly spacesById: ReadonlyMap<number, EffectiveSpaceAvailability>; readonly defects: readonly EffectiveSpatialDefect[] }

const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value);

export function resolveEffectivePlanSpatialAvailability(workDay: TimeWindow, zones: readonly PlanZoneAvailabilityInput[] = [], spaces: readonly PlanSpaceAvailabilityInput[] = []): EffectivePlanSpatialAvailability {
  const zonesById = new Map<number, EffectiveZoneAvailability>();
  const spacesById = new Map<number, EffectiveSpaceAvailability>();
  const defects: EffectiveSpatialDefect[] = [];
  const zoneCounts = countIds(zones, (entry) => entry.zoneId);
  for (const zone of [...zones].sort((a, b) => a.zoneId - b.zoneId)) {
    if (zonesById.has(zone.zoneId)) continue;
    if (zoneCounts.get(zone.zoneId)! > 1) {
      const defect = freeze({ entity: "zone" as const, entityId: zone.zoneId, reason: "DUPLICATE_ZONE_SNAPSHOT" as const });
      defects.push(defect);
      zonesById.set(zone.zoneId, freeze({ zoneId: zone.zoneId, effectiveWindow: null, mode: null, defect }));
      continue;
    }
    const result = resolveEffectiveSpaceAvailabilityHierarchy({ workDay, zoneAvailability: endpointPair(zone, "availabilityStart", "availabilityEnd"), spaceAvailability: { start: null, end: null } });
    const defect = result.valid ? undefined : freeze({ entity: "zone" as const, entityId: zone.zoneId, reason: result.reason });
    if (defect) defects.push(defect);
    zonesById.set(zone.zoneId, freeze({ zoneId: zone.zoneId, effectiveWindow: result.valid ? result.zone.effectiveWindow : null, mode: result.valid ? result.zone.mode : null, source: zone.source, ...(defect ? { defect } : {}) }));
  }
  const spaceCounts = countIds(spaces, (entry) => entry.spaceId);
  for (const space of [...spaces].sort((a, b) => a.spaceId - b.spaceId || a.zoneId - b.zoneId)) {
    if (spacesById.has(space.spaceId)) continue;
    if (spaceCounts.get(space.spaceId)! > 1) {
      const defect = freeze({ entity: "space" as const, entityId: space.spaceId, reason: "DUPLICATE_SPACE_SNAPSHOT" as const });
      defects.push(defect);
      spacesById.set(space.spaceId, freeze({ spaceId: space.spaceId, zoneId: Math.min(...spaces.filter((entry) => entry.spaceId === space.spaceId).map((entry) => entry.zoneId)), effectiveWindow: null, mode: null, defect }));
      continue;
    }
    const zone = zones.find((entry) => entry.zoneId === space.zoneId);
    const effectiveZone = zonesById.get(space.zoneId);
    if (!zone || !effectiveZone || effectiveZone.defect?.reason === "DUPLICATE_ZONE_SNAPSHOT") {
      const reason = effectiveZone?.defect?.reason === "DUPLICATE_ZONE_SNAPSHOT" ? "DUPLICATE_ZONE_SNAPSHOT" : "MISSING_ZONE_SNAPSHOT";
      const defect = freeze({ entity: "space" as const, entityId: space.spaceId, reason });
      if (reason === "MISSING_ZONE_SNAPSHOT") defects.push(defect);
      spacesById.set(space.spaceId, freeze({ spaceId: space.spaceId, zoneId: space.zoneId, effectiveWindow: null, mode: null, source: space.source, defect })); continue;
    }
    const result = resolveEffectiveSpaceAvailabilityHierarchy({ workDay, zoneAvailability: endpointPair(zone, "availabilityStart", "availabilityEnd"), spaceAvailability: endpointPair(space, "availabilityStart", "availabilityEnd") });
    const defect = result.valid ? undefined : freeze({ entity: "space" as const, entityId: space.spaceId, reason: result.reason });
    if (defect) defects.push(defect);
    spacesById.set(space.spaceId, freeze({ spaceId: space.spaceId, zoneId: space.zoneId, effectiveWindow: result.valid ? result.space.effectiveWindow : null, mode: result.valid ? result.space.mode : null, source: space.source, ...(defect ? { defect } : {}) }));
  }
  return freeze({ zonesById: immutableMapView(zonesById), spacesById: immutableMapView(spacesById), defects: Object.freeze(defects) });
}

function countIds<T>(values: readonly T[], id: (value: T) => number): Map<number, number> {
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(id(value), (counts.get(id(value)) ?? 0) + 1));
  return counts;
}

function endpointPair(value: object, startKey: string, endKey: string): { start?: unknown; end?: unknown } {
  const result: { start?: unknown; end?: unknown } = {};
  if (Object.prototype.hasOwnProperty.call(value, startKey)) result.start = (value as Record<string, unknown>)[startKey];
  if (Object.prototype.hasOwnProperty.call(value, endKey)) result.end = (value as Record<string, unknown>)[endKey];
  return result;
}
