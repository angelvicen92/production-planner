import type { EngineInput, TaskStatus } from "../../types";
import { resolveEffectivePlanSpatialAvailability } from "./effectivePlanSpatialAvailability";

export type EffectiveTaskResourceZoneResolution = "NONE" | "TASK" | "DAILY_SPACE" | "MATCH" | "CONFLICT";

export interface EffectiveTaskResourceAssignment {
  taskId: number;
  status: Exclude<TaskStatus, "cancelled">;
  spaceId: number | null;
  explicitZoneId: number | null;
  mappedZoneId: number | null;
  effectiveZoneId: number | null;
  zoneResolution: EffectiveTaskResourceZoneResolution;
  directResourceIds: readonly number[];
  spaceResourceIds: readonly number[];
  zoneResourceIds: readonly number[];
  effectiveResourceIds: readonly number[];
}

export interface EffectiveTaskResourceZoneConflict {
  taskId: number;
  spaceId: number;
  explicitZoneId: number;
  mappedZoneId: number;
  path: string;
}

export interface EffectiveTaskResourceAssignmentResolution {
  assignments: readonly EffectiveTaskResourceAssignment[];
  zoneConflicts: readonly EffectiveTaskResourceZoneConflict[];
  readOnly: true;
}

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0;

function normalizedIds(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze([...new Set(value.filter(isPositiveInteger))].sort((left, right) => left - right));
}

function mapValue(map: unknown, id: number | null): unknown {
  if (id === null || map === null || typeof map !== "object" || Array.isArray(map)) return undefined;
  return (map as Record<number, unknown>)[id];
}

export function resolveEffectiveTaskResourceAssignments(input: EngineInput): EffectiveTaskResourceAssignmentResolution {
  const assignments: EffectiveTaskResourceAssignment[] = [];
  const zoneConflicts: EffectiveTaskResourceZoneConflict[] = [];
  const spatial = resolveEffectivePlanSpatialAvailability(input.workDay, input.planZoneSettings, input.planSpaceSettings);

  for (const task of input.tasks) {
    if (!(["pending", "interrupted", "in_progress", "done"] as const).includes(task.status as Exclude<TaskStatus, "cancelled">)) continue;
    const spaceId = isPositiveInteger(task.spaceId) ? task.spaceId : null;
    const explicitZoneId = isPositiveInteger(task.zoneId) ? task.zoneId : null;
    const dailySpace = spaceId === null ? undefined : spatial.spacesById.get(spaceId);
    const duplicateSpace = dailySpace?.defect?.reason === "DUPLICATE_SPACE_SNAPSHOT";
    const mappedZoneId = dailySpace && !duplicateSpace && isPositiveInteger(dailySpace.zoneId) ? dailySpace.zoneId : null;
    const dailyHierarchyUsable = dailySpace?.effectiveWindow != null;
    let effectiveZoneId: number | null = null;
    let zoneResolution: EffectiveTaskResourceZoneResolution = "NONE";

    if (spaceId !== null && mappedZoneId === null) {
      zoneResolution = "NONE";
    } else if (explicitZoneId !== null && mappedZoneId !== null) {
      if (explicitZoneId === mappedZoneId) {
        effectiveZoneId = dailyHierarchyUsable ? mappedZoneId : null;
        zoneResolution = dailyHierarchyUsable ? "MATCH" : "NONE";
      } else {
        zoneResolution = "CONFLICT";
        zoneConflicts.push(Object.freeze({ taskId: task.id, spaceId: spaceId!, explicitZoneId, mappedZoneId, path: `tasks.${task.id}.zoneId` }));
      }
    } else if (explicitZoneId !== null) {
      effectiveZoneId = explicitZoneId;
      zoneResolution = "TASK";
    } else if (mappedZoneId !== null) {
      effectiveZoneId = dailyHierarchyUsable ? mappedZoneId : null;
      zoneResolution = dailyHierarchyUsable ? "DAILY_SPACE" : "NONE";
    }

    const directResourceIds = normalizedIds(task.assignedResourceIds);
    const spaceResourceIds = normalizedIds(mapValue(input.spaceResourceAssignments, spaceId));
    const zoneResourceIds = zoneResolution === "CONFLICT" ? Object.freeze([] as number[]) : normalizedIds(mapValue(input.zoneResourceAssignments, effectiveZoneId));
    const effectiveResourceIds = normalizedIds([...directResourceIds, ...spaceResourceIds, ...zoneResourceIds]);
    assignments.push(Object.freeze({ taskId: task.id, status: task.status, spaceId, explicitZoneId, mappedZoneId, effectiveZoneId, zoneResolution, directResourceIds, spaceResourceIds, zoneResourceIds, effectiveResourceIds }));
  }

  assignments.sort((left, right) => left.taskId - right.taskId);
  zoneConflicts.sort((left, right) => left.taskId - right.taskId);
  return Object.freeze({ assignments: Object.freeze(assignments), zoneConflicts: Object.freeze(zoneConflicts), readOnly: true });
}
