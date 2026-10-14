import { useMemo, useState } from "react";
import { Search, Music2, Trash2, ArrowUpRight, Clock3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddTaskDialog } from "@/components/add-task-dialog";
import type { ExecutionTask } from "@/lib/day-execution-view";

type Contestant = {
  id: number;
  name: string;
  instrument?: boolean;
  instrumentName?: string | null;
  song?: string | null;
  vocalCoachPlanResourceItemId?: number | null;
  availabilityStart?: string | null;
  availabilityEnd?: string | null;
};
export function ContestantDayRoster({
  contestants,
  tasks,
  coaches,
  onOpen,
  onDelete,
  canEdit,
  deletePending,
}: {
  contestants: Contestant[];
  tasks: ExecutionTask[];
  coaches: Array<{ id: number; name: string }>;
  onOpen: (contestant: Contestant) => void;
  onDelete: (contestant: Contestant) => void;
  canEdit: boolean;
  deletePending: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const taskGroups = useMemo(() => {
    const groups = new Map<number, ExecutionTask[]>();
    for (const task of tasks) {
      if (task.contestantId == null) continue;
      const id = Number(task.contestantId);
      groups.set(id, [...(groups.get(id) ?? []), task]);
    }
    return groups;
  }, [tasks]);
  const unplanned = tasks.filter(
    (task) => !task.startPlanned || !task.endPlanned,
  ).length;
  const unassigned = tasks.filter((task) => task.contestantId == null).length;
  const visible = contestants.filter((person) => {
    const own = taskGroups.get(Number(person.id)) ?? [];
    return (
      `${person.name} ${person.song ?? ""} ${person.instrumentName ?? ""}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es")) &&
      (filter === "all" ||
        (filter === "pending" &&
          own.some((task) => !task.startPlanned || !task.endPlanned)) ||
        (filter === "attention" &&
          (own.length === 0 ||
            own.some(
              (task) => !task.spaceId && !task.zoneId && !task.locationLabel,
            ))))
    );
  });
  return (
    <section className="space-y-4" aria-label="Preparación de concursantes">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [contestants.length, "Concursantes incluidos"],
          [tasks.length, "Tareas del día"],
          [unplanned, "Sin planificar"],
          [unassigned, "Sin concursante"],
        ].map(([value, label]) => (
          <div key={label} className="rounded-lg border bg-muted/10 p-3">
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Buscar concursantes"
            className="pl-9"
            placeholder="Buscar por nombre, canción o instrumento…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar preparación de concursantes"
          className="rounded-md border bg-background p-2 text-sm"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">Todos los concursantes</option>
          <option value="pending">Con tareas sin planificar</option>
          <option value="attention">Preparación por revisar</option>
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {visible.map((person) => {
          const own = taskGroups.get(Number(person.id)) ?? [];
          const pending = own.filter(
            (task) => !task.startPlanned || !task.endPlanned,
          ).length;
          const protectedTask = own.some(
            (task) => task.status === "done" || task.status === "in_progress",
          );
          const missing = own.filter(
            (task) => !task.spaceId && !task.zoneId && !task.locationLabel,
          ).length;
          const coach = coaches.find(
            (coach) =>
              Number(coach.id) === Number(person.vocalCoachPlanResourceItemId),
          );
          return (
            <article
              className="relative rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
              key={person.id}
            >
              <button
                className="w-full space-y-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onOpen(person)}
              >
                <div className="flex items-start justify-between gap-2 pr-5">
                  <h3 className="font-semibold leading-snug">{person.name}</h3>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                {person.instrument ? (
                  <p className="flex items-center gap-1 text-xs">
                    <Music2 className="h-3 w-3" />
                    {person.instrumentName || "Con instrumento"}
                  </p>
                ) : null}
                {person.song ? (
                  <p className="text-sm text-muted-foreground">{person.song}</p>
                ) : null}
                <div className="border-t pt-2 text-xs text-muted-foreground">
                  <p>
                    Vocal Coach:{" "}
                    <span className="text-foreground">
                      {coach?.name ?? "Sin asignar"}
                    </span>
                  </p>
                  <p className="mt-1 flex items-center gap-1">
                    <Clock3 className="h-3 w-3" />
                    {person.availabilityStart && person.availabilityEnd
                      ? `${person.availabilityStart}–${person.availabilityEnd}`
                      : "Sin disponibilidad particular informada"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">{own.length} tareas</Badge>
                  <Badge variant="outline">{pending} sin planificar</Badge>
                  {missing || !own.length ? (
                    <Badge variant="outline">
                      Preparación por revisar
                      {missing ? ` · ${missing} sin ubicación` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Obligaciones preparadas</Badge>
                  )}
                </div>
              </button>
              {canEdit ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:text-destructive"
                  aria-label={`Eliminar concursante ${person.name}`}
                  disabled={protectedTask || deletePending}
                  title={
                    protectedTask
                      ? "Tiene tareas en curso o completadas"
                      : "Retirar concursante y tareas permitidas"
                  }
                  onClick={() => onDelete(person)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              ) : null}
            </article>
          );
        })}
      </div>
      {!visible.length ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {contestants.length
            ? "Ningún concursante coincide con los filtros."
            : "Añade el primer concursante para preparar sus obligaciones."}
        </p>
      ) : null}
    </section>
  );
}

export function UnassignedDayTasks({
  planId,
  tasks,
  spaces,
  zones,
  canEdit,
  onPlanning,
  onEdit,
}: {
  planId: number;
  tasks: ExecutionTask[];
  spaces: Array<{ id: number; name: string }>;
  zones: Array<{ id: number; name: string }>;
  canEdit: boolean;
  onPlanning: () => void;
  onEdit: (task: ExecutionTask) => void;
}) {
  const [search, setSearch] = useState("");
  const [unplannedOnly, setUnplannedOnly] = useState(false);
  const own = useMemo(
    () => tasks.filter((task) => task.contestantId == null),
    [tasks],
  );
  const visible = own.filter(
    (task) =>
      (!unplannedOnly || !task.startPlanned || !task.endPlanned) &&
      `${task.template?.name ?? task.name ?? ""} ${spaces.find((space) => Number(space.id) === Number(task.spaceId))?.name ?? ""}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es")),
  );
  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-5"
      aria-label="Tareas sin concursante"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            Tareas sin concursante{" "}
            <Badge variant="secondary">{own.length}</Badge>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Obligaciones técnicas del día con identidad propia.
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit ? (
            <AddTaskDialog planId={planId} contestantId={null} />
          ) : null}
          <Button variant="outline" size="sm" onClick={onPlanning}>
            Ver en Planning
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-sm"
          aria-label="Buscar tareas sin concursante"
          placeholder="Buscar tarea o espacio…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button
          variant={unplannedOnly ? "secondary" : "outline"}
          size="sm"
          aria-pressed={unplannedOnly}
          onClick={() => setUnplannedOnly((old) => !old)}
        >
          Sin planificar
        </Button>
      </div>
      <ul className="divide-y">
        {visible.map((task) => (
          <li
            key={task.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <p className="text-sm font-medium">
                {task.template?.name ?? task.name ?? "Tarea sin nombre"}
              </p>
              <p className="text-xs text-muted-foreground">
                {[
                  zones.find((zone) => Number(zone.id) === Number(task.zoneId))
                    ?.name,
                  spaces.find(
                    (space) => Number(space.id) === Number(task.spaceId),
                  )?.name,
                ]
                  .filter(Boolean)
                  .join(" · ") ||
                  task.locationLabel ||
                  "Sin ubicación"}{" "}
                ·{" "}
                {task.durationOverride ?? task.template?.defaultDuration ?? "—"}{" "}
                min ·{" "}
                {task.startPlanned && task.endPlanned
                  ? `${task.startPlanned}–${task.endPlanned}`
                  : "Sin planificar"}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onEdit(task)}>
              Revisar tarea
            </Button>
          </li>
        ))}
      </ul>
      {!visible.length ? (
        <p className="py-4 text-sm text-muted-foreground">
          {own.length
            ? "Ninguna tarea coincide con los filtros."
            : "Esta jornada no contiene tareas sin concursante."}
        </p>
      ) : null}
    </section>
  );
}
