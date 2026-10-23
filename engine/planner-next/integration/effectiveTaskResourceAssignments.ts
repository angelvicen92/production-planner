import type { EngineInput, TaskInput, TaskStatus } from "../../types";
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
  /** Fixed catalogue requirements resolved by identity in this day's inventory. */
  byItemResourceIds?: readonly number[];
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

/** No selection: only a single daily identity can represent one concrete item. */
export function resolveConcreteTaskResourceRequirements(input: EngineInput, task: TaskInput) {
  const resourceIds: number[] = [];
  const issues: {resourceItemId: string; quantity: number; dailyResourceIds: number[]; reason: string}[] = [];
  for (const [resourceItemId, quantity] of Object.entries(task.resourceRequirements?.byItem ?? {}).sort(([a],[b])=>a.localeCompare(b))) {
    const matches = input.planResourceItems.filter(item => String(item.resourceItemId) === resourceItemId);
    // The input has no contract for an auxiliary's zone-sharing/attention capacity.
    // A concrete identity must not silently turn that capacity into exclusivity.
    const auxiliaryCapacityMissing = matches.length === 1 && (matches[0].typeCode === "auxiliar" || matches[0].category === "auxiliar");
    if (quantity !== 1 || matches.length !== 1 || !isPositiveInteger(matches[0].id) || auxiliaryCapacityMissing) {
      issues.push({resourceItemId, quantity, dailyResourceIds: matches.map(item=>item.id).sort((a,b)=>a-b),
        reason: quantity !== 1 ? "UNREPRESENTABLE_QUANTITY" : matches.length > 1 ? "AMBIGUOUS_DAILY_RESOURCE" : auxiliaryCapacityMissing ? "UNREPRESENTABLE_AUXILIARY_CAPACITY" : "MISSING_DAILY_RESOURCE"});
    } else resourceIds.push(matches[0].id);
  }
  return {resourceIds: normalizedIds(resourceIds), issues};
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
    if (task.status === "cancelled") continue;
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

    const byItemResourceIds = resolveConcreteTaskResourceRequirements(input, task).resourceIds;
    const directResourceIds = normalizedIds([...normalizedIds(task.assignedResourceIds), ...normalizedIds(task.declaredResourceIds), ...byItemResourceIds]);
    const ownResources = task.resourceInheritance === "OPERATION_ONLY";
    const spaceResourceIds = ownResources ? Object.freeze([] as number[]) : normalizedIds(mapValue(input.spaceResourceAssignments, spaceId));
    const zoneResourceIds = ownResources || zoneResolution === "CONFLICT" ? Object.freeze([] as number[]) : normalizedIds(mapValue(input.zoneResourceAssignments, effectiveZoneId));
    const teamResourceIds = ownResources && isPositiveInteger(task.itinerantTeamId)
      ? normalizedIds(input.itinerantTeamAvailability?.find(team => team.itinerantTeamId === task.itinerantTeamId)?.planResourceItemIds) : [];
    const effectiveResourceIds = normalizedIds([...directResourceIds, ...spaceResourceIds, ...zoneResourceIds, ...teamResourceIds]);
    assignments.push(Object.freeze({ taskId: task.id, status: task.status, spaceId, explicitZoneId, mappedZoneId, effectiveZoneId, zoneResolution, directResourceIds, ...(byItemResourceIds.length ? {byItemResourceIds} : {}), spaceResourceIds, zoneResourceIds, effectiveResourceIds }));
  }

  assignments.sort((left, right) => left.taskId - right.taskId);
  zoneConflicts.sort((left, right) => left.taskId - right.taskId);
  return Object.freeze({ assignments: Object.freeze(assignments), zoneConflicts: Object.freeze(zoneConflicts), readOnly: true });
}
