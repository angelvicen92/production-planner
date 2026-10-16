import { usesItinerantAgenda, type TaskOperationScope } from "../../../shared/taskOperationScope";
import type { HeaderScope } from "@shared/planningHeaderNotes";
import { effectivePlanningResourceIds } from "./planning-view-policy";

export type HeaderTask = TaskOperationScope & { id: number; spaceId?: number | null; zoneId?: number | null; itinerantTeamId?: number | null; assignedResources?: number[] | null; assigned_resource_ids?: number[] | null; isManualBlock?: boolean; breakKind?: string };
export type HeaderStaff = { staffRole: "production" | "editorial"; staffPersonId?: number; staffPersonName: string; scopeType: string; zoneId: number | null; spaceId: number | null; itinerantTeamId: number | null };
export type HeaderData = {
  tasks: readonly HeaderTask[];
  spaces: readonly { id: number; name: string; zoneId: number | null }[];
  zoneAssignments: Record<number, number[]>;
  spaceAssignments: Record<number, number[]>;
  resourceNames: Record<number, string>;
  staff: readonly HeaderStaff[];
  staffModes: readonly { zoneId: number; mode: "zone" | "space" }[];
  teams: readonly { id: number; name: string }[];
  teamMemberships?: readonly { itinerantTeamId: number; planResourceItemIds?: readonly number[] }[];
};
export type PlanningHeader = {
  resources: { id: number; name: string; scopes: string[]; taskIds: number[] }[];
  production: string[]; editorial: string[];
  staffScope: string;
  teams: { id: number; name: string; scope: string }[];
};
const positiveIds = (value: unknown): number[] => Array.isArray(value) ? [...new Set(value.filter(id => Number.isSafeInteger(id) && id > 0))] : [];

/** Presentation only. Identity and explicit scopes, never catalog/name inference. */
export function projectPlanningHeader(scope: HeaderScope, data: HeaderData): PlanningHeader {
  const spaces = new Map(data.spaces.map(s => [s.id, s]));
  const zoneId = scope.scopeType === "zone" ? scope.scopeId : scope.scopeType === "space" ? spaces.get(scope.scopeId)?.zoneId ?? null : null;
  const tasks = data.tasks.filter(t => !t.isManualBlock && !t.breakKind && (scope.scopeType === "itinerant_team" || !usesItinerantAgenda(t)) && (scope.scopeType === "space" ? t.spaceId === scope.scopeId : scope.scopeType === "itinerant_team" ? t.itinerantTeamId === scope.scopeId :
    t.spaceId != null ? spaces.get(t.spaceId)?.zoneId === zoneId && (t.zoneId == null || t.zoneId === zoneId) : t.zoneId === zoneId));
  const resources = new Map<number, PlanningHeader["resources"][number]>();
  const add = (ids: unknown, label: string, taskId?: number) => {
    for (const id of positiveIds(ids)) {
      const item = resources.get(id) ?? { id, name: data.resourceNames[id] || "Recurso con nombre no disponible", scopes: [], taskIds: [] };
      if (!item.scopes.includes(label)) item.scopes.push(label);
      if (taskId != null && !item.taskIds.includes(taskId)) item.taskIds.push(taskId);
      resources.set(id, item);
    }
  };
  if (scope.scopeType === "itinerant_team") {
    for (const membership of data.teamMemberships ?? []) if (membership.itinerantTeamId === scope.scopeId) add(membership.planResourceItemIds, "Miembro del equipo");
  } else {
    if (zoneId != null) add(data.zoneAssignments[zoneId], "Zona");
    if (scope.scopeType === "space") add(data.spaceAssignments[scope.scopeId], "Espacio");
    else for (const space of data.spaces) if (space.zoneId === zoneId) add(data.spaceAssignments[space.id], `Espacio: ${space.name}`);
  }
  for (const task of tasks) {
    // Reuse the existing effective union, keeping direct task participation distinct.
    const effective = effectivePlanningResourceIds(task, spaces, data.spaceAssignments, data.zoneAssignments, data.teamMemberships);
    const direct = positiveIds(task.assignedResources ?? task.assigned_resource_ids);
    add(scope.scopeType === "itinerant_team" ? effective : effective.filter(id => direct.includes(id)), "Por tarea", task.id);
  }
  const mode = data.staffModes.find(m => m.zoneId === zoneId)?.mode ?? "zone";
  const aggregateSpaceStaff = scope.scopeType === "zone" && mode === "space";
  const staffType = scope.scopeType === "space" && mode === "zone" ? "zone" : scope.scopeType;
  const staffId = staffType === "zone" ? zoneId : scope.scopeId;
  const staff = data.staff.filter(a => aggregateSpaceStaff ? a.scopeType === "space" && a.spaceId != null && spaces.get(a.spaceId)?.zoneId === zoneId : a.scopeType === staffType && (staffType === "zone" ? a.zoneId : staffType === "space" ? a.spaceId : a.itinerantTeamId) === staffId);
  const names = (role: HeaderStaff["staffRole"]) => {
    const people = new Map<number | string, { name: string; scopes: Set<string> }>();
    staff.filter(a => a.staffRole === role).forEach((a, index) => {
      const key = a.staffPersonId ?? `unresolved:${index}`;
      const person = people.get(key) ?? { name: a.staffPersonName, scopes: new Set<string>() };
      const space = a.spaceId == null ? undefined : spaces.get(a.spaceId);
      if (aggregateSpaceStaff && space) person.scopes.add(space.name);
      people.set(key, person);
    });
    return [...people.values()].filter(p => p.name).map(p => p.scopes.size ? `${p.name} (${[...p.scopes].join(" · ")})` : p.name);
  };
  const teams = scope.scopeType === "itinerant_team" ? [] : data.teams.flatMap(team => {
    const taskMember = tasks.some(t => t.itinerantTeamId === team.id);
    return taskMember ? [{ id: team.id, name: team.name, scope: "Por tarea" }] : [];
  });
  return { resources: [...resources.values()].sort((a,b) => a.name.localeCompare(b.name) || a.id-b.id), production: names("production"), editorial: names("editorial"), staffScope: aggregateSpaceStaff ? "espacios" : staffType === "zone" ? "zona" : staffType === "space" ? "espacio" : "equipo", teams };
}
