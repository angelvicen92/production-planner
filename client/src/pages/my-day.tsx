import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Camera, CheckCircle2, Clock, MapPin, Play, Square, UserCheck, XCircle } from "lucide-react";
import { buildUrl, api } from "@shared/routes";
import { Layout } from "@/components/layout";
import { QueryGuard } from "@/components/QueryGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useDefaultPlanId } from "@/hooks/use-default-plan-id";
import { useMeLinks } from "@/hooks/useMeLinks";
import { usePlanOpsData } from "@/hooks/usePlanOpsData";
import { usePlans } from "@/hooks/use-plans";
import { useProductionClock } from "@/hooks/use-production-clock";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { buildSpacesById, buildZonesById, getSpaceName, getTaskName, getZoneName } from "@/lib/lookups";
import { formatRange, hhmmToMinutes } from "@/lib/time";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  done: "Completada",
  interrupted: "Interrumpida",
  cancelled: "Cancelada",
};

const statusVariant = (status?: string) => {
  if (status === "done") return "secondary" as const;
  if (status === "cancelled" || status === "interrupted") return "destructive" as const;
  return "outline" as const;
};

function taskStatus(task: any) {
  return String(task?.status || "pending");
}

function camerasFor(task: any) {
  return Number(task?.camerasOverride ?? task?.template?.defaultCameras ?? 0) || 0;
}

function talentFor(task: any) {
  return task?.contestant?.name || task?.contestantName || task?.talent?.name || task?.talentName || "";
}

function locationFor(task: any, zonesById: Map<number, any>, spacesById: Map<number, any>) {
  if (task?.spaceId) return getSpaceName(task.spaceId, spacesById);
  if (task?.zoneId) return getZoneName(task.zoneId, zonesById);
  return "Ubicación por definir";
}

function plannedLabel(task: any) {
  return task?.startPlanned || task?.endPlanned ? formatRange(task?.startPlanned, task?.endPlanned) : "Horario por definir";
}

function isDelayed(task: any, nowMinutes: number) {
  const start = hhmmToMinutes(task?.startPlanned);
  return taskStatus(task) === "pending" && start !== null && nowMinutes > start;
}

function isExceeded(task: any, nowMinutes: number) {
  const end = hhmmToMinutes(task?.endPlanned);
  return taskStatus(task) === "in_progress" && end !== null && nowMinutes > end;
}

function lockTaskId(lock: any) {
  return Number(lock?.task_id ?? lock?.taskId ?? lock?.dailyTaskId ?? lock?.daily_task_id);
}

function taskWarnings(task: any, nowMinutes: number, locksByTask: Map<number, any[]>) {
  const warnings: string[] = [];
  if (!task?.spaceId && !task?.zoneId) warnings.push("Sin ubicación");
  if (!task?.startPlanned || !task?.endPlanned) warnings.push("Sin horario");
  if (isDelayed(task, nowMinutes)) warnings.push("Retrasada");
  if (isExceeded(task, nowMinutes)) warnings.push("Excedida");
  if ((locksByTask.get(Number(task?.id)) || []).length) warnings.push("Bloqueada");
  return warnings;
}

function TaskMiniCard({ task, zonesById, spacesById, nowMinutes, locksByTask }: any) {
  const warnings = taskWarnings(task, nowMinutes, locksByTask);
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{plannedLabel(task)}</p>
          <p className="truncate font-semibold">{getTaskName(task)}</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{locationFor(task, zonesById, spacesById)}</p>
        </div>
        <Badge variant={statusVariant(taskStatus(task))}>{STATUS_LABELS[taskStatus(task)] || taskStatus(task)}</Badge>
      </div>
      {warnings.length ? <div className="mt-2 flex flex-wrap gap-1">{warnings.map((item) => <Badge key={item} variant="destructive" className="text-[10px]">{item}</Badge>)}</div> : null}
    </div>
  );
}

function HeroTask({ title, task, empty, zonesById, spacesById, nowMinutes, locksByTask, children }: any) {
  if (!task) {
    return <Card className="border-dashed"><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">{empty}</p></CardContent></Card>;
  }
  const warnings = taskWarnings(task, nowMinutes, locksByTask);
  const talent = talentFor(task);
  const cameras = camerasFor(task);
  return (
    <Card className={title === "Ahora" ? "border-primary/40 bg-primary/5 shadow-md" : "shadow-sm"}>
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold">{getTaskName(task)}</h2><Badge variant={statusVariant(taskStatus(task))}>{STATUS_LABELS[taskStatus(task)] || taskStatus(task)}</Badge></div>
          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <p><strong className="text-foreground">Plan:</strong> {plannedLabel(task)}</p>
            <p><strong className="text-foreground">Real:</strong> {task?.startReal || "--:--"}–{task?.endReal || "--:--"}</p>
            <p className="flex items-center gap-1"><MapPin className="h-4 w-4" />{locationFor(task, zonesById, spacesById)}</p>
            {talent ? <p><strong className="text-foreground">Talent:</strong> {talent}</p> : null}
            {cameras > 0 ? <p className="flex items-center gap-1"><Camera className="h-4 w-4" />{cameras} cámara{cameras === 1 ? "" : "s"}</p> : null}
          </div>
        </div>
        {warnings.length ? <div className="flex flex-wrap gap-2">{warnings.map((item) => <Badge key={item} variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />{item}</Badge>)}</div> : null}
        {children}
      </CardContent>
    </Card>
  );
}

export default function MyDayPage() {
  const { data: plans = [], isLoading: plansLoading, error: plansError, refetch: refetchPlans } = usePlans();
  const [planId, setPlanId] = useState("");
  const [onlyMine, setOnlyMine] = useState(true);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { toast } = useToast();
  const { defaultPlanId } = useDefaultPlanId(plans, planId);
  const selected = useMemo(() => plans.find((plan) => Number(plan.id) === Number(defaultPlanId)) || null, [plans, defaultPlanId]);
  const { data, isLoading, error, refetch } = usePlanOpsData(selected?.id);
  const { links, staffPerson, resourceItem } = useMeLinks(true);
  const { nowTime, effectiveNow } = useProductionClock();

  useEffect(() => { if (!planId && defaultPlanId) setPlanId(String(defaultPlanId)); }, [defaultPlanId, planId]);

  const zonesById = useMemo(() => buildZonesById(data.zones || []), [data.zones]);
  const spacesById = useMemo(() => buildSpacesById(data.spaces || []), [data.spaces]);
  const nowMinutes = hhmmToMinutes(nowTime) ?? effectiveNow.getHours() * 60 + effectiveNow.getMinutes();

  const locksByTask = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const lock of data.locks || []) {
      const id = lockTaskId(lock);
      if (!Number.isFinite(id)) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id)?.push(lock);
    }
    return map;
  }, [data.locks]);

  const myScope = useMemo(() => {
    const set = new Set<string>();
    if (!links?.staffPersonId) return set;
    for (const assignment of data.staffAssignments || []) {
      if (Number(assignment?.staffPersonId) !== Number(links.staffPersonId)) continue;
      if (assignment?.scopeType === "zone" && assignment?.zoneId) set.add(`zone:${assignment.zoneId}`);
      if (assignment?.scopeType === "space" && assignment?.spaceId) set.add(`space:${assignment.spaceId}`);
    }
    return set;
  }, [data.staffAssignments, links?.staffPersonId]);

  const resourceKind = String(resourceItem?.typeName || resourceItem?.typeCode || "").toLowerCase();
  const isCameraResource = Boolean(links?.resourceItemId && (resourceKind.includes("cámara") || resourceKind.includes("camara") || resourceKind.includes("camera")));
  const hasOperationalLink = Boolean((links?.staffPersonId && myScope.size > 0) || isCameraResource);
  const tasks = useMemo(() => [...(data.tasks || [])].sort((a: any, b: any) => (hhmmToMinutes(a?.startPlanned) ?? 9999) - (hhmmToMinutes(b?.startPlanned) ?? 9999)), [data.tasks]);
  const visibleTasks = useMemo(() => {
    if (!onlyMine || !hasOperationalLink) return tasks;
    if (links?.staffPersonId && myScope.size > 0) return tasks.filter((task: any) => myScope.has(`space:${task?.spaceId}`) || myScope.has(`zone:${task?.zoneId}`));
    if (isCameraResource) return tasks.filter((task: any) => camerasFor(task) > 0);
    return tasks;
  }, [hasOperationalLink, isCameraResource, links?.staffPersonId, myScope, onlyMine, tasks]);

  const nowTask = useMemo(() => visibleTasks.find((task: any) => taskStatus(task) === "in_progress") || visibleTasks.find((task: any) => {
    const start = hhmmToMinutes(task?.startPlanned); const end = hhmmToMinutes(task?.endPlanned);
    return start !== null && end !== null && nowMinutes >= start && nowMinutes <= end;
  }) || null, [visibleTasks, nowMinutes]);
  const nextTask = useMemo(() => visibleTasks.find((task: any) => taskStatus(task) === "pending" && (hhmmToMinutes(task?.startPlanned) ?? 9999) > nowMinutes) || null, [visibleTasks, nowMinutes]);

  const invalidateOpsData = async () => {
    const id = Number(selected?.id);
    if (!id) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [`/api/plans/${id}/tasks`] }),
      queryClient.invalidateQueries({ queryKey: [`/api/plans/${id}/locks`] }),
      queryClient.invalidateQueries({ queryKey: [buildUrl(api.plans.get.path, { id })] }),
    ]);
  };

  const updateStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: string }) => apiRequest("PATCH", `/api/tasks/${taskId}/status`, { status, effectiveTimeHHMM: nowTime }),
    onSuccess: () => toast({ title: "Tarea actualizada", description: "El estado se ha sincronizado." }),
    onSettled: invalidateOpsData,
    onError: (err: any) => toast({ title: err?.type === "permission_denied" ? "No tienes permisos para realizar esta acción." : "No se pudo actualizar la tarea.", variant: "destructive" }),
  });

  const runAction = async (task: any, status: "in_progress" | "done" | "interrupted" | "cancelled") => {
    if (!task?.id) return;
    if (status === "cancelled" || status === "interrupted") {
      const ok = await confirm({ title: status === "cancelled" ? "Cancelar tarea" : "Interrumpir tarea", description: status === "cancelled" ? "La tarea pasará a cancelada." : "La tarea pasará a interrumpida.", confirmText: status === "cancelled" ? "Cancelar tarea" : "Interrumpir" });
      if (!ok) return;
    }
    updateStatus.mutate({ taskId: Number(task.id), status });
  };

  const alerts = useMemo(() => {
    const output: string[] = [];
    if (!hasOperationalLink) output.push("Tu usuario todavía no está vinculado a una persona/recurso operativo. Mostrando vista general del plan.");
    for (const task of visibleTasks) {
      if (!task?.spaceId && !task?.zoneId) output.push(`${getTaskName(task)}: sin ubicación`);
      if (!task?.startPlanned || !task?.endPlanned) output.push(`${getTaskName(task)}: sin horario`);
      if ((locksByTask.get(Number(task?.id)) || []).length) output.push(`${getTaskName(task)}: bloqueo activo`);
      if (isDelayed(task, nowMinutes)) output.push(`${getTaskName(task)}: pendiente con inicio superado`);
      if (isExceeded(task, nowMinutes)) output.push(`${getTaskName(task)}: en curso excedida`);
      if (output.length >= 5) break;
    }
    return output.slice(0, 5);
  }, [hasOperationalLink, locksByTask, nowMinutes, visibleTasks]);

  const groups = {
    "Pendientes próximas": visibleTasks.filter((t: any) => taskStatus(t) === "pending"),
    "En curso": visibleTasks.filter((t: any) => taskStatus(t) === "in_progress"),
    "Completadas": visibleTasks.filter((t: any) => taskStatus(t) === "done"),
    "Interrumpidas/canceladas": visibleTasks.filter((t: any) => ["interrupted", "cancelled"].includes(taskStatus(t))),
  };

  if (plansLoading || plansError) return <Layout><QueryGuard isLoading={plansLoading} isError={Boolean(plansError)} error={plansError} loadingText="Cargando planes..." onRetry={refetchPlans} /></Layout>;
  if (!plans.length) return <Layout><Card><CardContent className="p-6">No hay planes disponibles. <Link className="text-primary underline" href="/plans">Ir a planes</Link>.</CardContent></Card></Layout>;

  return <Layout><div className="mx-auto max-w-5xl space-y-4 pb-10">
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card to-primary/5">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-sm text-muted-foreground">Mi Día operativo</p><h1 className="text-3xl font-bold">{(selected as any)?.name || "Plan sin nombre"}</h1><p className="text-sm text-muted-foreground">{String(selected?.date || "Fecha por definir").slice(0, 10)} · Hora operativa {nowTime}</p></div>
          {plans.length > 1 ? <Select value={selected ? String(selected.id) : undefined} onValueChange={setPlanId}><SelectTrigger className="w-full sm:w-[280px]"><SelectValue placeholder="Seleccionar plan" /></SelectTrigger><SelectContent>{plans.map((plan) => <SelectItem key={plan.id} value={String(plan.id)}>{(plan as any).name || "Plan sin nombre"}</SelectItem>)}</SelectContent></Select> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={hasOperationalLink ? "default" : "secondary"}><UserCheck className="mr-1 h-3 w-3" />{staffPerson ? `Operador: ${staffPerson.name}` : resourceItem ? `Recurso: ${resourceItem.name}` : "Vista general"}</Badge>
          {hasOperationalLink ? <label className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm"><Switch checked={onlyMine} onCheckedChange={setOnlyMine} />Solo mi ámbito</label> : null}
        </div>
      </CardContent>
    </Card>

    {(isLoading || error) ? <QueryGuard isLoading={isLoading} isError={Boolean(error)} error={error} loadingText="Cargando datos operativos..." onRetry={refetch} /> : null}
    {!hasOperationalLink ? <Card className="border-amber-300 bg-amber-50 text-amber-950"><CardContent className="p-4">Tu usuario todavía no está vinculado a una persona/recurso operativo. Mostrando vista general del plan.</CardContent></Card> : null}
    {!visibleTasks.length && !isLoading ? <Card><CardContent className="p-6 text-center text-muted-foreground">{hasOperationalLink ? "No hay tareas en tu ámbito" : "Este plan no tiene tareas todavía"}</CardContent></Card> : null}

    <HeroTask title="Ahora" task={nowTask} empty="Sin tarea activa" zonesById={zonesById} spacesById={spacesById} nowMinutes={nowMinutes} locksByTask={locksByTask}>
      <div className="grid gap-2 sm:grid-cols-2">
        {taskStatus(nowTask) === "pending" ? <><Button size="lg" disabled={updateStatus.isPending} onClick={() => runAction(nowTask, "in_progress")}><Play className="mr-2 h-4 w-4" />Start</Button><Button size="lg" variant="destructive" disabled={updateStatus.isPending} onClick={() => runAction(nowTask, "cancelled")}><XCircle className="mr-2 h-4 w-4" />Cancel</Button></> : null}
        {taskStatus(nowTask) === "in_progress" ? <><Button size="lg" disabled={updateStatus.isPending} onClick={() => runAction(nowTask, "done")}><CheckCircle2 className="mr-2 h-4 w-4" />Finish</Button><Button size="lg" variant="destructive" disabled={updateStatus.isPending} onClick={() => runAction(nowTask, "interrupted")}><Square className="mr-2 h-4 w-4" />Interrupt</Button></> : null}
      </div>
    </HeroTask>

    <HeroTask title="Siguiente" task={nextTask} empty="Sin próxima tarea" zonesById={zonesById} spacesById={spacesById} nowMinutes={nowMinutes} locksByTask={locksByTask}>
      <Badge variant="secondary">{hhmmToMinutes(nextTask?.startPlanned) !== null ? `Empieza en ${Math.max(0, (hhmmToMinutes(nextTask?.startPlanned) || 0) - nowMinutes)} min` : "Ya debería haber empezado"}</Badge>
    </HeroTask>

    <Card><CardHeader><CardTitle>Agenda del día</CardTitle></CardHeader><CardContent className="space-y-4">{Object.entries(groups).map(([name, items]) => <section key={name}><h3 className="mb-2 font-semibold">{name}</h3><div className="grid gap-2">{items.length ? items.map((task: any) => <TaskMiniCard key={task.id} task={task} zonesById={zonesById} spacesById={spacesById} nowMinutes={nowMinutes} locksByTask={locksByTask} />) : <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Sin tareas</p>}</div></section>)}</CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Avisos operativos</CardTitle></CardHeader><CardContent>{alerts.length ? <ul className="space-y-2">{alerts.map((alert) => <li key={alert} className="rounded-lg border bg-muted/40 p-3 text-sm">{alert}</li>)}</ul> : <p className="text-sm text-muted-foreground">Sin avisos relevantes.</p>}</CardContent></Card>
  </div></Layout>;
}
