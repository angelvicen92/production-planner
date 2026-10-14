import { ExecutionElapsedTimer } from "./execution-elapsed-timer";
import { useMemo, useState } from "react";
import { Check, Pause, Play, RotateCcw, Search, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUserRole } from "@/hooks/use-user-role";
import { useProductionClock } from "@/hooks/use-production-clock";
import { useUpdateTaskStatus, useResetTask } from "@/hooks/use-tasks";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  emptyExecutionFilters,
  filterExecutionRows,
  projectExecutionRows,
  type ExecutionFilters,
  type ExecutionTask,
  type ExecutionSort,
} from "@/lib/day-execution-view";

export const executionStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  done: "Completada",
  interrupted: "Interrumpida",
  cancelled: "Cancelada",
};
const columnLabels = {
  planned: "Hora prevista",
  actual: "Hora real",
  duration: "Duración",
  resources: "Recursos",
};
export function DayExecutionWorkspace({
  planId,
  tasks,
  contestants,
  zones,
  spaces,
  resourceNames,
  spaceAssignments,
  zoneAssignments,
  onOpenContestant,
}: {
  planId: number;
  tasks: ExecutionTask[];
  contestants: Array<{ id: number; name: string }>;
  zones: Array<{ id: number; name: string }>;
  spaces: Array<{ id: number; name: string; zoneId: number | null }>;
  resourceNames: Record<number, string>;
  spaceAssignments: Record<number, number[]>;
  zoneAssignments: Record<number, number[]>;
  onOpenContestant?: (id: number) => void;
}) {
  const { role } = useUserRole();
  const canOperate = role === "admin" || role === "production";
  const { nowTime, nowSeconds } = useProductionClock();
  const statusMutation = useUpdateTaskStatus();
  const reset = useResetTask();
  const confirm = useConfirm();
  const busy = statusMutation.isPending || reset.isPending;
  const [filters, setFilters] = useState<ExecutionFilters>(
    emptyExecutionFilters,
  );
  const [sort, setSort] = useState<ExecutionSort>("startPlanned");
  const [descending, setDescending] = useState(false);
  const [columns, setColumns] = useState({
    planned: true,
    actual: true,
    duration: true,
    resources: false,
  });
  const rows = useMemo(
    () =>
      projectExecutionRows(
        tasks,
        contestants,
        zones,
        spaces,
        resourceNames,
        spaceAssignments,
        zoneAssignments,
        nowTime,
      ),
    [
      tasks,
      contestants,
      zones,
      spaces,
      resourceNames,
      spaceAssignments,
      zoneAssignments,
      nowTime,
    ],
  );
  const visible = useMemo(
    () => filterExecutionRows(rows, filters, sort, descending),
    [rows, filters, sort, descending],
  );
  const templates = useMemo(
    () =>
      [
        ...new Map(
          tasks.map((task) => [
            Number(task.templateId),
            {
              id: Number(task.templateId),
              name: task.template?.name ?? "Sin plantilla",
            },
          ]),
        ).values(),
      ].filter((item) => item.id > 0),
    [tasks],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(executionStatusLabels).map((status) => [
          status,
          tasks.filter((task) => task.status === status).length,
        ]),
      ),
    [tasks],
  );
  const change = (key: keyof ExecutionFilters, value: string | boolean) =>
    setFilters((old) => ({ ...old, [key]: value }));
  const selector = (
    key: "status" | "contestant" | "template" | "zone" | "space" | "resource",
    label: string,
    options: Array<{ id: string | number; name: string }>,
  ) => (
    <label className="text-xs text-muted-foreground">
      {label}
      <select
        className="mt-1 block w-full rounded-md border bg-background p-2 text-sm text-foreground"
        aria-label={`Filtrar ejecución por ${label.toLowerCase()}`}
        value={String(filters[key])}
        onChange={(event) => change(key, event.target.value)}
      >
        <option value="">Todos</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
  const update = (
    task: ExecutionTask,
    status: "in_progress" | "done" | "interrupted",
  ) => {
    if (canOperate && !busy)
      statusMutation.mutate({
        taskId: Number(task.id),
        planId,
        status,
        effectiveTimeHHMM: nowTime,
        effectiveSeconds: nowSeconds,
      });
  };
  return (
    <section
      className="space-y-4"
      aria-labelledby="execution-title"
      data-testid="day-execution"
    >
      <div>
        <h2 className="text-xl font-semibold" id="execution-title">
          Ejecución del día
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Seguimiento de las tareas reales. Los cambios usan el servicio de
          ejecución vigente.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Object.entries(executionStatusLabels).map(([status, label]) => (
          <button
            key={status}
            onClick={() =>
              change("status", filters.status === status ? "" : status)
            }
            aria-pressed={filters.status === status}
            className={`rounded-lg border bg-card p-3 text-left ${filters.status === status ? "ring-2 ring-primary" : ""}`}
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {counts[status]}
            </p>
          </button>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Buscar tareas de ejecución"
              className="pl-9"
              placeholder="Buscar tarea, persona, ubicación o recurso…"
              value={filters.search}
              onChange={(event) => change("search", event.target.value)}
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setFilters(emptyExecutionFilters)}
          >
            Limpiar filtros
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {selector("contestant", "Concursante", contestants)}
          {selector("template", "Tipo de tarea", templates)}
          {selector("zone", "Plató", zones)}
          {selector("space", "Espacio", spaces)}
          {selector(
            "resource",
            "Recurso",
            Object.entries(resourceNames).map(([id, name]) => ({ id, name })),
          )}
          {selector(
            "status",
            "Estado",
            Object.entries(executionStatusLabels).map(([id, name]) => ({
              id,
              name,
            })),
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {(
            [
              ["late", "Con retraso"],
              ["unscheduled", "Sin horario"],
              ["unlocated", "Sin ubicación"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <Checkbox
                checked={filters[key]}
                onCheckedChange={(checked) => change(key, checked === true)}
              />
              {label}
            </label>
          ))}
          <label className="flex items-center gap-2">
            Desde
            <Input
              type="time"
              aria-label="Ejecución desde"
              className="w-32"
              value={filters.from}
              onChange={(event) => change("from", event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2">
            Hasta
            <Input
              type="time"
              aria-label="Ejecución hasta"
              className="w-32"
              value={filters.to}
              onChange={(event) => change("to", event.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {visible.length} de {tasks.length} tareas
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">
            Ordenar{" "}
            <select
              aria-label="Ordenar ejecución"
              className="ml-2 rounded-md border bg-background p-2"
              value={sort}
              onChange={(event) => setSort(event.target.value as ExecutionSort)}
            >
              {(
                [
                  ["startPlanned", "Inicio previsto"],
                  ["endPlanned", "Fin previsto"],
                  ["startReal", "Inicio real"],
                  ["endReal", "Fin real"],
                  ["duration", "Duración"],
                  ["contestant", "Concursante"],
                  ["zone", "Plató"],
                  ["space", "Espacio"],
                  ["title", "Tipo de tarea"],
                  ["status", "Estado"],
                ] as const
              ).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={descending}
            onClick={() => setDescending((old) => !old)}
          >
            {descending ? "Descendente" : "Ascendente"}
          </Button>
          <details className="relative">
            <summary className="cursor-pointer rounded-md border p-2 text-sm">
              Columnas
            </summary>
            <div className="absolute right-0 z-30 mt-1 min-w-48 space-y-2 rounded-md border bg-popover p-3 shadow-md">
              {Object.entries(columnLabels).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={columns[key as keyof typeof columns]}
                    onCheckedChange={(value) =>
                      setColumns((old) => ({ ...old, [key]: value === true }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </details>
        </div>
      </div>
      {!canOperate ? (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">
          Consulta de ejecución. El contrato actual autoriza las acciones
          globales a Producción y Administración.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tarea / concursante</TableHead>
              <TableHead>Ubicación</TableHead>
              {columns.planned ? <TableHead>Hora prevista</TableHead> : null}
              {columns.actual ? <TableHead>Hora real</TableHead> : null}
              {columns.duration ? <TableHead>Duración</TableHead> : null}
              {columns.resources ? (
                <TableHead>Recursos efectivos</TableHead>
              ) : null}
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const task = row.task;
              const running = task.status === "in_progress";
              return (
                <TableRow key={task.id}>
                  <TableCell>
                    <p className="font-medium">{row.title}</p>
                    {task.contestantId && onOpenContestant ? (
                      <button
                        className="text-sm text-primary hover:underline"
                        onClick={() =>
                          onOpenContestant(Number(task.contestantId))
                        }
                      >
                        {row.contestant}
                      </button>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {row.contestant}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{row.location}</TableCell>
                  {columns.planned ? (
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {task.startPlanned ?? "—"}–{task.endPlanned ?? "—"}
                    </TableCell>
                  ) : null}
                  {columns.actual ? (
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {task.startReal ?? "—"}–{task.endReal ?? "—"}<div><ExecutionElapsedTimer status={task.status} startReal={task.startReal} startRealSeconds={task.startRealSeconds} pausedTotalSeconds={task.pausedTotalSeconds} pausedAtSeconds={task.pausedAtSeconds}/></div>
                    </TableCell>
                  ) : null}
                  {columns.duration ? (
                    <TableCell className="whitespace-nowrap text-sm">
                      {row.duration ? `${row.duration} min` : "Sin duración"}
                    </TableCell>
                  ) : null}
                  {columns.resources ? (
                    <TableCell className="text-sm">
                      {row.resourceNames || "Sin asignación nominal"}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Badge
                      variant={task.status === "done" ? "default" : "secondary"}
                    >
                      {executionStatusLabels[task.status] ??
                        "Estado desconocido"}
                    </Badge>
                    {row.late ? (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        Con retraso
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {task.status === "pending" ||
                      task.status === "interrupted" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canOperate || busy}
                          onClick={() => update(task, "in_progress")}
                        >
                          <Play className="mr-1 h-3 w-3" />
                          {task.status === "interrupted"
                            ? "Reanudar"
                            : "Iniciar"}
                        </Button>
                      ) : null}
                      {running ? (
                        <>
                          <Button
                            size="sm"
                            disabled={!canOperate || busy}
                            onClick={() => update(task, "done")}
                          >
                            <Check className="mr-1 h-3 w-3" />
                            Finalizar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canOperate || busy}
                            onClick={() => update(task, "interrupted")}
                          >
                            <Pause className="mr-1 h-3 w-3" />
                            Interrumpir
                          </Button>
                        </>
                      ) : null}
                      {canOperate && task.status !== "pending" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Resetear tarea",
                                description:
                                  "Se retirarán el inicio y el fin reales. La tarea volverá a pendiente mediante el contrato de ejecución vigente. ¿Continuar?",
                                confirmText: "Resetear",
                              })
                            )
                              reset.mutate({
                                taskId: task.id,
                                planId,
                                effectiveTimeHHMM: nowTime,
                              });
                          }}
                        >
                          Resetear
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!visible.length ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-32 text-center text-muted-foreground"
                >
                  {tasks.length
                    ? "Ninguna tarea coincide con los filtros. Limpia los filtros para recuperar el listado."
                    : "Todavía no hay tareas en esta jornada."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
