import { PersistedDaySection } from "./day-collapsible-section";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { api } from "@shared/routes";
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
import { useExecutionContext } from "@/hooks/use-execution-context";
import { executionClockCurrent, executionDuration, formatExecutionDuration } from "@shared/execution";
import { useUpdateTaskStatus, useResetTask, useResetPlanExecution } from "@/hooks/use-tasks";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  emptyExecutionFilters,
  filterExecutionRows,
  projectExecutionRows,
  type ExecutionFilters,
  type ExecutionTask,
  type ExecutionSort,
} from "@/lib/day-execution-view";

function ExecutionDurationCell({task,clock,updatedAt}:{task:ExecutionTask;clock?:import("@shared/execution").ExecutionContext["clock"];updatedAt:number}) {
  const [tick,setTick]=useState(Date.now());
  useEffect(()=>{if(task.status!=="in_progress")return;const interval=window.setInterval(()=>setTick(Date.now()),1000);return()=>window.clearInterval(interval);},[task.status]);
  if(!task.startRealAt)return null;
  const instant=clock?Date.parse(clock.operationalAt)+Math.max(0,tick-updatedAt):NaN;
  return <span>{formatExecutionDuration(executionDuration(task,instant,clock))}{!executionClockCurrent(task,clock)?" · reloj modificado":" activos"}</span>;
}

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
export const DayExecutionWorkspace = memo(function DayExecutionWorkspace({
  planId,
  planDate,
  online,
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
  planDate: string;
  online: boolean;
  tasks: ExecutionTask[];
  contestants: Array<{ id: number; name: string }>;
  zones: Array<{ id: number; name: string }>;
  spaces: Array<{ id: number; name: string; zoneId: number | null }>;
  resourceNames: Record<number, string>;
  spaceAssignments: Record<number, number[]>;
  zoneAssignments: Record<number, number[]>;
  onOpenContestant?: (id: number) => void;
}) {
  const contextQ = useExecutionContext(planId);
  const context = contextQ.data;
  const nowMs = context ? Date.parse(context.clock.operationalAt) + Math.max(0, Date.now() - contextQ.dataUpdatedAt) : NaN;
  const operationalDay = Number.isFinite(nowMs) ? new Intl.DateTimeFormat("en-CA", { timeZone:"Europe/Madrid",year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date(nowMs)) : "";
  const nowTime = operationalDay === String(planDate).slice(0,10) ? new Intl.DateTimeFormat("en-GB", { timeZone:"Europe/Madrid", hour:"2-digit",minute:"2-digit",hour12:false }).format(new Date(nowMs)) : "";
  const permissions = new Map(context?.tasks.map(task => [task.taskId, task]) ?? []);
  const canOperate = (task:ExecutionTask) => Boolean(online && !contextQ.error && permissions.get(task.id)?.canExecute && executionClockCurrent(task,context?.clock));
  const canReset = Boolean(online && !contextQ.error && (context?.role === "admin" || context?.role === "production"));
  const statusMutation = useUpdateTaskStatus();
  const reset = useResetTask();
  const resetAll = useResetPlanExecution();
  const mutating = useIsMutating() > 0;
  const [confirmingReset, setConfirmingReset] = useState(false);
  const confirm = useConfirm();
  const busy = mutating || statusMutation.isPending || reset.isPending || resetAll.isPending || confirmingReset;
  const resetSnapshot = useMemo(() => api.plans.resetExecution.input.safeParse({
    expectedTasks: tasks.map(({ id, status, executionVersion }) => ({ id, status, executionVersion })),
  }), [tasks]);
  const resetCount = tasks.filter(task => task.status !== "pending").length;
  const resetAuthority = Boolean(online && !contextQ.error && context?.role === "admin");
  const latestReset = useRef({ allowed: resetAuthority && !mutating, planId });
  latestReset.current = { allowed: resetAuthority && !mutating, planId };
  const resetWholeDay = async () => {
    if (!resetAuthority || busy || !resetSnapshot.success || resetCount === 0) return;
    // Capture the complete day before opening confirmation, including pending tasks.
    const expectedTasks = resetSnapshot.data.expectedTasks;
    setConfirmingReset(true);
    try {
      const accepted = await confirm({
        title: "Resetear toda la ejecución",
        description: `Se restablecerá la ejecución de ${resetCount} actividades de toda la jornada. Es una corrección administrativa excepcional. El planning y el historial se conservarán.`,
        confirmText: "Resetear todas",
        cancelText: "Cancelar",
      });
      if (accepted && navigator.onLine && latestReset.current.allowed && latestReset.current.planId === planId) {
        resetAll.mutate({ planId, expectedTasks });
      }
    } finally { setConfirmingReset(false); }
  };
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
    if (canOperate(task) && !busy)
      statusMutation.mutate({
        taskId: Number(task.id),
        planId,
        status,
        expectedStatus: task.status,
        expectedVersion: task.executionVersion ?? undefined,
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
        <PersistedDaySection planId={planId} section="execution-filters" title="Filtros avanzados de ejecución">
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
        </PersistedDaySection>
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
          {context?.role === "admin" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={resetWholeDay}
              disabled={!resetAuthority || busy || !resetSnapshot.success || resetCount === 0}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Resetear toda la ejecución
            </Button>
          )}
        </div>
      </div>
      <p className="rounded-lg border p-3 text-sm text-muted-foreground" role="status">
        {!online ? "Sin conexión. Los registros se conservan; espera a recuperar la conexión para actuar." : contextQ.error ? "No se pudo verificar la autoridad de ejecución. Actualiza la jornada antes de actuar." : !context ? "Comprobando autoridad de ejecución…" : context.role === "viewer" ? "Tu perfil permite consultar la ejecución." : !context.planningReady ? "Es necesario aceptar el planning completo antes de iniciar tareas pendientes. Las actividades en curso conservan sus acciones autorizadas." : "Las acciones disponibles corresponden a tu autoridad sobre cada tarea. El servidor confirma cada registro."}
      </p>
      <PersistedDaySection planId={planId} section="execution-tasks" title={`Tareas de ejecución · ${visible.length} de ${tasks.length}`}>
      <div className="overflow-x-auto">
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
                <TableRow key={task.id} data-testid={`day-execution-task-${task.id}`}>
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
                      {task.startReal ?? "—"}–{task.endReal ?? "—"}<div><ExecutionDurationCell task={task} clock={context?.clock} updatedAt={contextQ.dataUpdatedAt}/></div>
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
                      {permissions.get(task.id)?.hasAuthority && (task.status === "pending" ||
                      task.status === "interrupted") ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canOperate(task) || busy}
                          onClick={() => update(task, "in_progress")}
                        >
                          <Play className="mr-1 h-3 w-3" />
                          {task.status === "interrupted"
                            ? "Reanudar"
                            : "Iniciar"}
                        </Button>
                      ) : null}
                      {running && permissions.get(task.id)?.hasAuthority ? (
                        <>
                          <Button
                            size="sm"
                            disabled={!canOperate(task) || busy}
                            onClick={() => update(task, "done")}
                          >
                            <Check className="mr-1 h-3 w-3" />
                            Finalizar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canOperate(task) || busy}
                            onClick={() => update(task, "interrupted")}
                          >
                            <Pause className="mr-1 h-3 w-3" />
                            Interrumpir
                          </Button>
                        </>
                      ) : null}
                      {canReset && task.status !== "pending" ? (
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
                                  "Se retirarán el inicio y el fin reales y la tarea volverá a pendiente. El histórico de ejecución se conserva. ¿Continuar?",
                                confirmText: "Resetear",
                              })
                            )
                              reset.mutate({
                                taskId: task.id,
                                planId,
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
      </PersistedDaySection>
    </section>
  );
});
