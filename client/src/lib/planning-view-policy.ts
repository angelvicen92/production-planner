import type { TaskOperationScope } from "../../../shared/taskOperationScope";
/** Display ordering is not an operational eligibility rule in Assisted. */
export function planningGroupOrder(value: unknown, assisted: boolean): number | null {
  return value != null && Number.isInteger(Number(value)) ? Number(value) : assisted ? Number.MAX_SAFE_INTEGER : null;
}

export function planningFilterIds<T extends string | number>(selected: readonly T[], available: readonly T[], assisted: boolean, defaultAll = false): T[] {
  if (!assisted) return [...selected];
  const valid = selected.filter(id => available.includes(id));
  return valid.length || !defaultAll ? valid : [...available];
}

/** Same direct + space + zone union as effective EngineInput assignments.
 * Snapshot placements supply the location; no template/name fallback. */
export function effectivePlanningResourceIds(task: TaskOperationScope & { assignedResources?: number[] | null; assigned_resource_ids?: number[] | null; spaceId?: number | null; zoneId?: number | null; itinerantTeamId?: number | null },
  spaceZones: ReadonlyMap<number, { zoneId: number | null }>, spaceAssignments: Record<number, number[]>, zoneAssignments: Record<number, number[]>, teams: readonly {itinerantTeamId:number;planResourceItemIds?:readonly number[]}[] = []) {
  const positive = (id: unknown): id is number => typeof id === "number" && Number.isInteger(id) && id > 0;
  const ids = (value: unknown): number[] => Array.isArray(value) ? value.filter(positive) : [];
  const spaceId = positive(task.spaceId) ? task.spaceId : null;
  const explicitZone = positive(task.zoneId) ? task.zoneId : null;
  const mappedZone = spaceId == null ? null : spaceZones.get(spaceId)?.zoneId ?? null;
  // Missing/conflicting hierarchy never authorizes an inferred zone assignment.
  const zoneId = spaceId == null ? explicitZone : !positive(mappedZone) || (explicitZone != null && explicitZone !== mappedZone) ? null : mappedZone;
  return [...new Set([...ids(task.assignedResources ?? task.assigned_resource_ids), ...ids(task.declaredResourceIds),
    ...ids(task.resourceInheritance === "OPERATION_ONLY" && positive(task.itinerantTeamId) ? teams.find(team=>team.itinerantTeamId===task.itinerantTeamId)?.planResourceItemIds : []),
    ...ids(task.resourceInheritance === "OPERATION_ONLY" || spaceId == null ? [] : spaceAssignments[spaceId]),
    ...ids(task.resourceInheritance === "OPERATION_ONLY" || zoneId == null ? [] : zoneAssignments[zoneId])])].sort((a,b)=>a-b);
}
