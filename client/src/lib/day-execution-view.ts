import { effectivePlanningResourceIds } from "./planning-view-policy";
export type ExecutionTask = {
  id: number;
  templateId?: number;
  contestantId?: number | null;
  zoneId?: number | null;
  spaceId?: number | null;
  name?: string | null;
  template?: { name: string; defaultDuration?: number };
  contestant?: { name: string } | null;
  locationLabel?: string | null;
  status: string;
  startPlanned?: string | null;
  endPlanned?: string | null;
  startReal?: string | null;
  startRealAt?: string | null;
  endRealAt?: string | null;
  pausedAt?: string | null;
  executionClockMode?: string | null;
  executionClockRevision?: string | null;
  endReal?: string | null;
  durationOverride?: number | null;
  startRealSeconds?: number | null;
  endRealSeconds?: number | null;
  pausedTotalSeconds?: number | null;
  pausedAtSeconds?: number | null;
  assignedResources?: number[] | null;
  assigned_resource_ids?: number[] | null;
};
export type ExecutionFilters = {
  search: string;
  status: string;
  contestant: string;
  template: string;
  zone: string;
  space: string;
  resource: string;
  late: boolean;
  unscheduled: boolean;
  unlocated: boolean;
  from: string;
  to: string;
};
export const emptyExecutionFilters: ExecutionFilters = {
  search: "",
  status: "",
  contestant: "",
  template: "",
  zone: "",
  space: "",
  resource: "",
  late: false,
  unscheduled: false,
  unlocated: false,
  from: "",
  to: "",
};
export type ExecutionRow = {
  task: ExecutionTask;
  contestant: string;
  title: string;
  zone: string;
  zoneId: number | null;
  space: string;
  location: string;
  resources: number[];
  resourceNames: string;
  duration: number;
  late: boolean;
};
export type ExecutionSort =
  | "startPlanned"
  | "endPlanned"
  | "startReal"
  | "endReal"
  | "duration"
  | "contestant"
  | "zone"
  | "space"
  | "title"
  | "status";
export function projectExecutionRows(
  tasks: readonly ExecutionTask[],
  contestants: readonly { id: number; name: string }[],
  zones: readonly { id: number; name: string }[],
  spaces: readonly { id: number; name: string; zoneId: number | null }[],
  resources: Record<number, string>,
  spaceAssignments: Record<number, number[]>,
  zoneAssignments: Record<number, number[]>,
  now: string,
): ExecutionRow[] {
  const spaceMap = new Map(spaces.map((space) => [Number(space.id), space]));
  return tasks.map((task) => {
    const effectiveSpace = spaceMap.get(Number(task.spaceId));
    const ids = effectivePlanningResourceIds(
      task,
      spaceMap,
      spaceAssignments,
      zoneAssignments,
    );
    const contestant =
      task.contestant?.name ??
      contestants.find(
        (person) => Number(person.id) === Number(task.contestantId),
      )?.name ??
      "Sin concursante";
    const zone =
      zones.find(
        (zone) =>
          Number(zone.id) === Number(task.zoneId ?? effectiveSpace?.zoneId),
      )?.name ?? "";
    const space = effectiveSpace?.name ?? "";
    return {
      task,
      contestant,
      title: task.template?.name ?? task.name ?? "Tarea sin nombre",
      zone,
      zoneId: task.zoneId ?? effectiveSpace?.zoneId ?? null,
      space,
      location:
        task.locationLabel ||
        [zone, space].filter(Boolean).join(" · ") ||
        "Sin ubicación",
      resources: ids,
      resourceNames: ids
        .map((id) => resources[id] ?? "Recurso sin nombre")
        .join(" · "),
      duration: Number(
        task.durationOverride ?? task.template?.defaultDuration ?? 0,
      ),
      late:
        (task.status === "pending" &&
          !!task.startPlanned &&
          task.startPlanned < now) ||
        (task.status === "in_progress" &&
          !!task.endPlanned &&
          task.endPlanned < now),
    };
  });
}
export function filterExecutionRows(
  rows: readonly ExecutionRow[],
  filters: ExecutionFilters,
  sort: ExecutionSort,
  descending = false,
) {
  const search = filters.search.trim().toLocaleLowerCase("es");
  return rows
    .filter((row) => {
      const t = row.task;
      return (
        (!search ||
          `${row.title} ${row.contestant} ${row.location} ${row.resourceNames}`
            .toLocaleLowerCase("es")
            .includes(search)) &&
        (!filters.status || t.status === filters.status) &&
        (!filters.contestant ||
          Number(t.contestantId) === Number(filters.contestant)) &&
        (!filters.template ||
          Number(t.templateId) === Number(filters.template)) &&
      (!filters.zone || Number(row.zoneId) === Number(filters.zone)) &&
        (!filters.space || Number(t.spaceId) === Number(filters.space)) &&
        (!filters.resource ||
          row.resources.includes(Number(filters.resource))) &&
        (!filters.late || row.late) &&
        (!filters.unscheduled || !t.startPlanned || !t.endPlanned) &&
        (!filters.unlocated || (!t.spaceId && !t.zoneId && !t.locationLabel)) &&
        (!filters.from || (!!t.endPlanned && t.endPlanned >= filters.from)) &&
        (!filters.to || (!!t.startPlanned && t.startPlanned <= filters.to))
      );
    })
    .sort((a, b) => {
      const av =
        sort in a
          ? a[sort as keyof ExecutionRow]
          : a.task[sort as keyof ExecutionTask];
      const bv =
        sort in b
          ? b[sort as keyof ExecutionRow]
          : b.task[sort as keyof ExecutionTask];
      // Missing times always remain last, in either direction.
      if (av == null || av === "")
        return bv == null || bv === "" ? a.task.id - b.task.id : 1;
      if (bv == null || bv === "") return -1;
      return (
        (typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "es", { numeric: true })) *
          (descending ? -1 : 1) || a.task.id - b.task.id
      );
    });
}
