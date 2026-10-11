import type { AssistedScopeSelector } from "@shared/assistedProposalContracts";
import type { AssistedPlanningSnapshotV1 } from "@shared/assistedPlanningSnapshotContracts";

export type ScopeSpace = { id: number; name: string; zoneId: number | null };
export type ScopeZone = { id: number; name: string };
export type ScopeTask = { id: number; spaceId: number | null; status: string };
const canonicalIds = (ids: readonly number[]) => [...new Set(ids)].sort((a, b) => a - b);

/** Live product status and the accepted base own eligibility, never the preview. */
export function pendingScopeTasks<T extends ScopeTask>(tasks: readonly T[], base: AssistedPlanningSnapshotV1 | null): T[] {
  const accepted = new Set((base?.tasks ?? []).filter(task => task.startPlanned && task.endPlanned).map(task => task.taskId));
  return tasks.filter(task => (task.status === "pending" || task.status === "interrupted") && !accepted.has(task.id));
}

/** A zone is only its catalog members. Names and task zone labels carry no membership. */
export function catalogScopeGroups(zones: readonly ScopeZone[], spaces: readonly ScopeSpace[]) {
  const knownZones = new Set(zones.map(zone => zone.id));
  return {
    zones: zones.map(zone => ({ ...zone, spaces: spaces.filter(space => space.zoneId === zone.id) })),
    ungrouped: spaces.filter(space => space.zoneId === null || !knownZones.has(space.zoneId)),
  };
}

export function toggleScopeSpaces(selected: readonly number[], members: readonly number[], checked: boolean): number[] {
  const removing = new Set(members);
  return canonicalIds(checked ? [...selected, ...members] : selected.filter(id => !removing.has(id)));
}

/** Even one space uses TASK_IDS so accepted pending rows cannot enter the editable scope. */
export function locationScopeTaskIds(tasks: readonly ScopeTask[], spaces: readonly ScopeSpace[], selected: readonly number[]): number[] {
  const known = new Set(spaces.map(space => space.id));
  const wanted = new Set(selected.filter(id => known.has(id)));
  return canonicalIds(tasks.filter(task => task.spaceId !== null && wanted.has(task.spaceId)).map(task => task.id));
}

export function taskIdsScopeSelector(ids: readonly number[]): AssistedScopeSelector | null {
  const taskIds = canonicalIds(ids);
  return taskIds.length ? { kind: "TASK_IDS", taskIds } : null;
}
