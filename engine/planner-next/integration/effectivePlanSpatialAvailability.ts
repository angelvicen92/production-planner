import type { PlanSpaceAvailabilityInput, PlanZoneAvailabilityInput, TimeWindow } from "../../types";
import { resolveEffectiveSpaceAvailabilityHierarchy, type AvailabilityWindow, type SpatialAvailabilityReason } from "../../../shared/spatialAvailabilityHierarchy";

export interface EffectiveSpatialDefect { readonly entity: "workday" | "zone" | "space"; readonly entityId: number | null; readonly reason: SpatialAvailabilityReason | "MISSING_ZONE_SNAPSHOT" }
export interface EffectiveZoneAvailability { readonly zoneId: number; readonly effectiveWindow: AvailabilityWindow | null; readonly mode: "INHERITED_WORKDAY" | "EXPLICIT" | null; readonly source?: string; readonly defect?: EffectiveSpatialDefect }
export interface EffectiveSpaceAvailability { readonly spaceId: number; readonly zoneId: number; readonly effectiveWindow: AvailabilityWindow | null; readonly mode: "INHERITED_ZONE" | "EXPLICIT" | null; readonly source?: string; readonly defect?: EffectiveSpatialDefect }
export interface EffectivePlanSpatialAvailability { readonly zonesById: ReadonlyMap<number, EffectiveZoneAvailability>; readonly spacesById: ReadonlyMap<number, EffectiveSpaceAvailability>; readonly defects: readonly EffectiveSpatialDefect[] }

const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value);
export function resolveEffectivePlanSpatialAvailability(workDay: TimeWindow, zones: readonly PlanZoneAvailabilityInput[] = [], spaces: readonly PlanSpaceAvailabilityInput[] = []): EffectivePlanSpatialAvailability {
  const zonesById = new Map<number, EffectiveZoneAvailability>();
  const spacesById = new Map<number, EffectiveSpaceAvailability>();
  const defects: EffectiveSpatialDefect[] = [];
  for (const zone of [...zones].sort((a, b) => a.zoneId - b.zoneId)) {
    const result = resolveEffectiveSpaceAvailabilityHierarchy({ workDay, zoneAvailability: endpointPair(zone, "availabilityStart", "availabilityEnd"), spaceAvailability: { start: null, end: null } });
    const defect = result.valid ? undefined : freeze({ entity: "zone" as const, entityId: zone.zoneId, reason: result.reason });
    if (defect) defects.push(defect);
    zonesById.set(zone.zoneId, freeze({ zoneId: zone.zoneId, effectiveWindow: result.valid ? result.zone.effectiveWindow : null, mode: result.valid ? result.zone.mode : null, source: zone.source, ...(defect ? { defect } : {}) }));
  }
  for (const space of [...spaces].sort((a, b) => a.spaceId - b.spaceId)) {
    const zone = zones.find((entry) => entry.zoneId === space.zoneId);
    if (!zone) {
      const defect = freeze({ entity: "space" as const, entityId: space.spaceId, reason: "MISSING_ZONE_SNAPSHOT" as const }); defects.push(defect);
      spacesById.set(space.spaceId, freeze({ spaceId: space.spaceId, zoneId: space.zoneId, effectiveWindow: null, mode: null, source: space.source, defect })); continue;
    }
    const result = resolveEffectiveSpaceAvailabilityHierarchy({ workDay, zoneAvailability: endpointPair(zone, "availabilityStart", "availabilityEnd"), spaceAvailability: endpointPair(space, "availabilityStart", "availabilityEnd") });
    const defect = result.valid ? undefined : freeze({ entity: "space" as const, entityId: space.spaceId, reason: result.reason });
    if (defect) defects.push(defect);
    spacesById.set(space.spaceId, freeze({ spaceId: space.spaceId, zoneId: space.zoneId, effectiveWindow: result.valid ? result.space.effectiveWindow : null, mode: result.valid ? result.space.mode : null, source: space.source, ...(defect ? { defect } : {}) }));
  }
  return freeze({ zonesById, spacesById, defects: Object.freeze(defects) });
}

function endpointPair(value: object, startKey: string, endKey: string): { start?: unknown; end?: unknown } {
  const result: { start?: unknown; end?: unknown } = {};
  if (Object.prototype.hasOwnProperty.call(value, startKey)) result.start = (value as Record<string, unknown>)[startKey];
  if (Object.prototype.hasOwnProperty.call(value, endKey)) result.end = (value as Record<string, unknown>)[endKey];
  return result;
}
