import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePlans, useGeneratePlan } from "@/hooks/use-plans";
import { useDefaultPlanId } from "@/hooks/use-default-plan-id";
import { usePlanOpsData } from "@/hooks/usePlanOpsData";
import { useMeLinks } from "@/hooks/useMeLinks";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { apiRequest } from "@/lib/api";
import { buildSpacesById, buildZonesById, getSpaceName, getTaskName, getZoneName } from "@/lib/lookups";
import { addIncident } from "@/lib/war-room-store";
import { QueryState } from "@/components/query-state";
import { contains, formatRange, hhmmToMinutes, minutesToHHMM, sampleEveryFiveMinutes } from "@/lib/time";
import { buildUrl, api } from "@shared/routes";
import { useProductionClock } from "@/hooks/use-production-clock";
import { useElapsedSince } from "@/hooks/use-elapsed-since";

function TaskRealTimeMeta({ task }: { task: any }) {
  const elapsed = useElapsedSince(task?.startReal ?? null);

  const parseHHMM = (value?: string | null) => {
    const m = String(value ?? "").match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };

  const toHHMM = (minutes: number) => {
    const safe = ((minutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  };

  const etaReal = (() => {
    if (String(task?.status ?? "") === "done" && task?.endReal) return task.endReal;
    if (String(task?.status ?? "") !== "in_progress" || !task?.startReal) return "—";
    const startMin = parseHHMM(task.startReal);
    const duration = Number(task?.durationOverride ?? task?.template?.defaultDuration ?? 0);
    if (startMin === null || !Number.isFinite(duration) || duration <= 0) return "—";
    return toHHMM(startMin + duration);
  })();

  return (
    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      <div>Inicio teórico: {task?.startPlanned ?? "—"}</div>
      <div>Inicio real: {task?.startReal ?? "—"}</div>
      <div>Fin teórico: {task?.endPlanned ?? "—"}</div>
      <div>Fin previsto: {etaReal}</div>
      {String(task?.status ?? "") === "in_progress" && elapsed ? (
        <div className="col-span-2 text-emerald-700">Tiempo en marcha: {elapsed}</div>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  const { data: plans = [], isLoading: plansLoading, error: plansError, refetch: refetchPlans } = usePlans();
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [locationDialogTask, setLocationDialogTask] = useState<any | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>("");
  const generate = useGeneratePlan();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();

  const { defaultPlanId } = useDefaultPlanId(plans, selectedPlanId);

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === defaultPlanId) || null, [plans, defaultPlanId]);

  const planId = selectedPlan?.id as number | undefined;
  const { data, isLoading, error, refetch } = usePlanOpsData(planId);
  const { links, staffPerson, resourceItem } = useMeLinks(true);
  const [onlyMine, setOnlyMine] = useState(false);
  const { effectiveNow, nowTime, mode } = useProductionClock();

  const zonesById = useMemo(() => buildZonesById(data.zones || []), [data.zones]);
  const spacesById = useMemo(() => buildSpacesById(data.spaces || []), [data.spaces]);

  const locksByTask = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const lock of data.locks || []) {
      const taskId = Number(lock?.task_id);
      if (!map.has(taskId)) map.set(taskId, []);
      map.get(taskId)?.push(lock);
    }
    return map;
  }, [data.locks]);

  const invalidateOpsData = async (id?: number) => {
    if (!id) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [`/api/plans/${id}/tasks`] }),
      queryClient.invalidateQueries({ queryKey: [`/api/plans/${id}/locks`] }),
      queryClient.invalidateQueries({ queryKey: [buildUrl(api.plans.get.path, { id })] }),
    ]);
  };

  const updateStatus = useMutation({
    mutationFn: async ({ taskId, status }: any) =>
      apiRequest("PATCH", `/api/tasks/${taskId}/status`, { status, effectiveTimeHHMM: nowTime }),
    onSettled: async () => invalidateOpsData(planId),
    onError: () => {
      toast({ title: "No se pudo actualizar", description: "La tarea no cambió de estado.", variant: "destructive" });
    },
  });


  const resetTask = useMutation({
    mutationFn: async ({ taskId, effectiveTimeHHMM }: { taskId: number; effectiveTimeHHMM?: string }) => apiRequest("POST", `/api/tasks/${taskId}/reset`, effectiveTimeHHMM ? { effectiveTimeHHMM } : {}),
    onSettled: async () => invalidateOpsData(planId),
    onError: () => {
      toast({ title: "No se pudo resetear", description: "La tarea no volvió a pendiente.", variant: "destructive" });
    },
  });

  const assignLocation = useMutation({
    mutationFn: async ({ taskId, zoneId, spaceId }: any) =>
      apiRequest("PATCH", `/api/daily-tasks/${taskId}`, { zoneId: Number(zoneId), spaceId: Number(spaceId) }),
    onSuccess: async () => {
      setLocationDialogTask(null);
      setSelectedZoneId("");
      setSelectedSpaceId("");
      await invalidateOpsData(planId);
    },
    onError: () => {
      toast({ title: "No se pudo actualizar", description: "No fue posible asignar la ubicación.", variant: "destructive" });
    },
  });

  const runQuickAction = async (taskId: number, action: "start" | "interrupt" | "done") => {
    if (action === "interrupt") {
      const ok = await confirm({
        title: "Interrumpir tarea",
        description: "La tarea pasará a estado interrumpido.",
        confirmText: "Interrumpir",
      });
      if (!ok) return;
    }

    const payloadByAction = {
      start: { status: "in_progress" },
      interrupt: { status: "interrupted" },
      done: { status: "done" },
    } as const;

    updateStatus.mutate({ taskId, ...payloadByAction[action] });
  };


  const runResetAction = async (task: any) => {
    const status = String(task?.status ?? "pending");
    if (status === "pending") return;

    const confirmMessage = status === "in_progress"
      ? "¿Resetear? Se borrará inicio real."
      : `Esta tarea está en estado ${status.toUpperCase()}. Al resetear se borrarán inicio/fin reales. ¿Continuar?`;

    const ok = await confirm({
      title: "Resetear tarea",
      description: confirmMessage,
      confirmText: "Resetear",
    });
    if (!ok) return;
    resetTask.mutate({ taskId: Number(task.id), effectiveTimeHHMM: nowTime });
  };

  const today = new Date().toISOString().slice(0, 10);
  const nowMinutes = hhmmToMinutes(nowTime) ?? effectiveNow.getHours() * 60 + effectiveNow.getMinutes();
  const nowTimeLabel = nowTime ?? "--:--";
  const isTodayPlan = String(selectedPlan?.date || "").slice(0, 10) === today;

  const tasksWithTime = useMemo(
    () => (data.tasks || []).filter((task: any) => hhmmToMinutes(task?.startPlanned) !== null && hhmmToMinutes(task?.endPlanned) !== null),
    [data.tasks],
  );

  const inProgress = useMemo(
    () =>
      (data.tasks || []).filter((task: any) => {
        if (task?.status === "in_progress") return true;
        const start = hhmmToMinutes(task?.startPlanned);
        const end = hhmmToMinutes(task?.endPlanned);
        if (!isTodayPlan || start === null || end === null) return false;
        return contains(start, end, nowMinutes);
      }),
    [data.tasks, isTodayPlan, nowMinutes],
  );

  const myScope = useMemo(() => {
    const set = new Set<string>();
    if (!links?.staffPersonId) return set;
    for (const assignment of data.staffAssignments || []) {
      if (Number(assignment.staffPersonId) !== Number(links.staffPersonId)) continue;
      if (assignment.scopeType === "zone" && assignment.zoneId) set.add(`zone:${assignment.zoneId}`);
      if (assignment.scopeType === "space" && assignment.spaceId) set.add(`space:${assignment.spaceId}`);
    }
    return set;
  }, [data.staffAssignments, links?.staffPersonId]);

  const filterMine = (items: any[]) => {
    if (!onlyMine) return items;
    if (links?.staffPersonId && myScope.size > 0) {
      return items.filter((task) => myScope.has(`space:${task?.spaceId}`) || myScope.has(`zone:${task?.zoneId}`));
    }
    if (links?.resourceItemId && String(resourceItem?.typeName || "").toLowerCase().includes("cámara")) {
      return items.filter((task) => Number(task?.camerasOverride ?? task?.template?.defaultCameras ?? 0) > 0);
    }
    return items;
  };

  const next60 = useMemo(
    () =>
      (data.tasks || []).filter((task: any) => {
        const start = hhmmToMinutes(task?.startPlanned);
        if (start === null) return false;
        return start >= nowMinutes && start <= nowMinutes + 60 && task?.status !== "done";
      }),
    [data.tasks, nowMinutes],
  );

  const upcomingNoLocation = next60.filter((task: any) => !task?.zoneId && !task?.spaceId);
  const inProgressView = useMemo(() => filterMine(inProgress), [inProgress, onlyMine, links, myScope, resourceItem]);
  const next60View = useMemo(() => filterMine(next60), [next60, onlyMine, links, myScope, resourceItem]);

  const peak = useMemo(() => {
    const start = hhmmToMinutes(selectedPlan?.workStart) ?? Math.min(...tasksWithTime.map((task: any) => hhmmToMinutes(task.startPlanned) ?? 1440), 540);
    const end = hhmmToMinutes(selectedPlan?.workEnd) ?? Math.max(...tasksWithTime.map((task: any) => hhmmToMinutes(task.endPlanned) ?? 0), 1080);
    const samples = sampleEveryFiveMinutes(start, end);

    let max = 0;
    let at = start;
    for (const sample of samples) {
      const camerasAtMinute = (data.tasks || []).reduce((total: number, task: any) => {
        const taskStart = hhmmToMinutes(task?.startPlanned);
        const taskEnd = hhmmToMinutes(task?.endPlanned);
        if (taskStart === null || taskEnd === null) return total;
        const cams = Number(task?.camerasOverride ?? task?.template?.defaultCameras ?? 0);
        return contains(taskStart, taskEnd, sample) ? total + cams : total;
      }, 0);
      if (camerasAtMinute > max) {
        max = camerasAtMinute;
        at = sample;
      }
    }

    return { max, start: at, end: at + 5 };
  }, [data.tasks, selectedPlan?.workStart, selectedPlan?.workEnd, tasksWithTime]);

  const zoneModeByZoneId = useMemo(() => {
    const map = new Map<number, "zone" | "space">();
    for (const mode of data.zoneStaffModes || []) {
      map.set(Number(mode.zoneId), mode.mode === "space" ? "space" : "zone");
    }
    return map;
  }, [data.zoneStaffModes]);

  const operationalMap = useMemo(() => {
    const grouped = new Map<number, { zone: any; spaces: Map<number, any> }>();

    for (const task of tasksWithTime) {
      const zoneId = Number(task?.zoneId || spacesById.get(Number(task?.spaceId))?.zoneId || 0);
      const spaceId = Number(task?.spaceId || 0);
      if (!zoneId || !spaceId) continue;
      if (!grouped.has(zoneId)) {
        grouped.set(zoneId, { zone: zonesById.get(zoneId), spaces: new Map() });
      }

      const zoneNode = grouped.get(zoneId)!;
      if (!zoneNode.spaces.has(spaceId)) {
        zoneNode.spaces.set(spaceId, { space: spacesById.get(spaceId), tasks: [] as any[] });
      }
      zoneNode.spaces.get(spaceId).tasks.push(task);
    }

    return [...grouped.entries()].map(([zoneId, node]) => {
      const mode = zoneModeByZoneId.get(zoneId) || "zone";
      const zoneStaff = (data.staffAssignments || []).filter(
        (assignment: any) => assignment.staffRole === "production" && assignment.scopeType === "zone" && Number(assignment.zoneId) === zoneId,
      );

      const spaces = [...node.spaces.entries()].map(([spaceId, spaceNode]) => {
        const nowTask = spaceNode.tasks.find((task: any) => {
          const start = hhmmToMinutes(task?.startPlanned);
          const end = hhmmToMinutes(task?.endPlanned);
          return start !== null && end !== null && contains(start, end, nowMinutes);
        });

        const nextTask = [...spaceNode.tasks]
          .filter((task: any) => (hhmmToMinutes(task?.startPlanned) ?? 9999) > nowMinutes)
          .sort((a: any, b: any) => (hhmmToMinutes(a?.startPlanned) ?? 9999) - (hhmmToMinutes(b?.startPlanned) ?? 9999))[0];

        const spaceStaff = (data.staffAssignments || []).filter(
          (assignment: any) => assignment.staffRole === "production" && assignment.scopeType === "space" && Number(assignment.spaceId) === spaceId,
        );

        return {
          space: spaceNode.space,
          nowTask,
          nextTask,
          staffNames: (mode === "space" ? spaceStaff : zoneStaff).map((staff: any) => staff.staffPersonName).filter(Boolean),
        };
      });

      return {
        zone: node.zone,
        spaces,
      };
    });
  }, [data.staffAssignments, nowMinutes, spacesById, tasksWithTime, zoneModeByZoneId, zonesById]);

  const createIncidentAndGo = (task?: any, title?: string) => {
    if (!selectedPlan?.id) return;
    addIncident(selectedPlan.id!, {
      type: "Riesgo",
      severity: "warn",
      text: title || `Incidencia detectada: ${task ? getTaskName(task) : "sin detalle"}`,
      taskId: Number(task?.id) || null,
      zoneId: Number(task?.zoneId) || null,
      spaceId: Number(task?.spaceId) || null,
    });
    window.location.assign("/war-room");
  };

  const liveAlerts = [
    ...inProgressView
      .filter((task: any) => (hhmmToMinutes(task?.endPlanned) ?? 9999) < nowMinutes)
      .map((task: any) => ({
        id: `delay-${task.id}`,
        severity: "critical" as const,
        title: `Retraso: ${getTaskName(task)}`,
        impact: "Puede comprometer la siguiente cadena de tareas.",
        primary: { label: "Abrir plan", href: `/plans/${selectedPlan?.id}` },
        secondary: { label: "Crear incidencia", onClick: () => createIncidentAndGo(task, `Retraso en ${getTaskName(task)}`) },
      })),
    ...(peak.max > Number(selectedPlan?.camerasAvailable ?? 0)
      ? [{
          id: "cams-peak",
          severity: "warn" as const,
          title: "Conflicto de cámaras",
          impact: `Pico ${peak.max}/${selectedPlan?.camerasAvailable ?? 0} supera disponibilidad`,
          primary: { label: "Abrir war-room", href: "/war-room" },
          secondary: { label: "Crear incidencia", onClick: () => createIncidentAndGo(undefined, "Pico de cámaras excedido") },
        }]
      : []),
    ...upcomingNoLocation.map((task: any) => ({
      id: `noloc-${task.id}`,
      severity: "critical" as const,
      title: `Sin ubicación: ${getTaskName(task)}`,
      impact: "Riesgo de retraso inmediato.",
      primary: { label: "Asignar ubicación", onClick: () => setLocationDialogTask(task) },
      secondary: { label: "Crear incidencia", onClick: () => createIncidentAndGo(task, `Sin ubicación en ${getTaskName(task)}`) },
    })),
    ...((data.locks?.length || 0) > 5
      ? [{
          id: "high-locks",
          severity: "info" as const,
          title: "Nivel alto de locks",
          impact: "Posibles bloqueos operativos.",
          primary: { label: "Abrir war-room", href: "/war-room" },
          secondary: { label: "Ver plan", href: `/plans/${selectedPlan?.id}` },
        }]
      : []),
  ];


  const renderAlertAction = (action: { label: string; href?: string; onClick?: () => void }, variant: "default" | "outline" = "default") => {
    if (action.href) {
      return <Button asChild size="sm" variant={variant}><Link href={action.href}>{action.label}</Link></Button>;
    }
    return <Button size="sm" variant={variant} onClick={action.onClick}>{action.label}</Button>;
  };
  const availableSpacesByZone = useMemo(
    () => (data.spaces || []).filter((space: any) => Number(space.zoneId) === Number(selectedZoneId)),
    [data.spaces, selectedZoneId],
  );

  if (plansLoading || plansError) {
    return (
      <Layout>
        <div className="w-full">
          <div className="mx-auto w-full max-w-[1500px] p-8">
          <QueryState
            isLoading={plansLoading}
            isError={Boolean(plansError)}
            error={plansError}
            loadingText="Cargando planes..."
            onRetry={() => {
              queryClient.cancelQueries({ queryKey: [api.plans.list.path] });
              refetchPlans();
            }}
          />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="w-full">
        <div className="mx-auto w-full max-w-[1500px] space-y-4">
        <div className="sticky top-0 z-10 rounded-lg border bg-card/95 p-4 backdrop-blur no-print">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-auto text-2xl font-bold">Centro de Control</h1>
            <Select value={selectedPlan ? String(selectedPlan.id) : undefined} onValueChange={setSelectedPlanId}>
              <SelectTrigger className="w-[280px]"><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={String(plan.id)}>{(plan as any).name || `Plan ${plan.id}`} · {String(plan.date || "").slice(0, 10)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild variant="outline"><Link href={`/plans/${selectedPlan?.id || ""}`}>Abrir plan</Link></Button>
            <Button onClick={() => selectedPlan?.id && generate.mutate({ id: selectedPlan.id, mode: "full" })} disabled={!selectedPlan?.id || generate.isPending}>
              <Sparkles className="mr-2 h-4 w-4" /> Generar/Recalcular
            </Button>
            <Button variant="outline" onClick={() => refetch()} disabled={!selectedPlan?.id}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refrescar
            </Button>
            {(staffPerson || resourceItem) ? (
              <Badge variant="secondary">{staffPerson ? `Operador: ${staffPerson.name}` : `Recurso vinculado: ${resourceItem?.name || "-"}`}</Badge>
            ) : null}
            {(links?.staffPersonId || links?.resourceItemId) ? (
              <Button variant={onlyMine ? "default" : "outline"} onClick={() => setOnlyMine((v) => !v)}>Ir a mis asignaciones</Button>
            ) : null}
          </div>
          {!plans.length && <div className="mt-3 text-sm">No hay planes. <Link href="/plans" className="text-primary underline">Ir a planes</Link></div>}
        </div>

        <QueryState
          isError={Boolean(error)}
          error={error}
          errorTitle="No se pudo cargar el dashboard."
          onRetry={() => {
            if (planId) {
              queryClient.cancelQueries({ queryKey: [buildUrl(api.plans.get.path, { id: planId })] });
              queryClient.cancelQueries({ queryKey: [`/api/plans/${planId}/tasks`] });
              queryClient.cancelQueries({ queryKey: [`/api/plans/${planId}/locks`] });
            }
            refetch();
          }}
        />

        {!selectedPlan ? null : (
          <>
          <div className="mb-3 flex items-center gap-2">
        <Badge variant="outline">Clock: {nowTimeLabel}</Badge>
        <Badge variant="secondary">Modo: {mode === "manual" ? "manual" : "auto"}</Badge>
      </div>

      <Tabs defaultValue="live" className="space-y-3">
            <TabsList>
              <TabsTrigger value="live">EN VIVO (Realización)</TabsTrigger>
              <TabsTrigger value="exec">EJECUTIVO (Producción)</TabsTrigger>
            </TabsList>

            <TabsContent value="live" className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Modo</div><div className="font-semibold">{isTodayPlan ? "EN DIRECTO" : "MODO PREPARACIÓN"}</div></div>
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Hora</div><div className="font-semibold">{minutesToHHMM(nowMinutes)}</div></div>
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">En curso</div><div className="font-semibold">{inProgressView.length}</div></div>
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Próximos 60 min</div><div className="font-semibold">{next60View.length}</div></div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {[{ title: "EN CURSO", items: inProgressView }, { title: "PRÓXIMOS 60 MIN", items: next60View }].map((panel) => (
                  <div key={panel.title} className="rounded-lg border bg-card p-4">
                    <h3 className="mb-3 font-semibold">{panel.title}</h3>
                    <div className="space-y-2">
                      {(panel.items || []).length === 0 ? <div className="text-sm text-muted-foreground">Sin tareas.</div> : panel.items.map((task: any) => (
                        <div key={task.id} className="rounded border p-2 text-sm">
                          <div className="font-medium">{getTaskName(task)}</div>
                          <div className="text-muted-foreground">{formatRange(task?.startPlanned, task?.endPlanned)} · {task?.spaceId ? getSpaceName(task.spaceId, spacesById) : getZoneName(task.zoneId, zonesById)}</div>
                          <TaskRealTimeMeta task={task} />
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge variant="secondary">{Number(task?.camerasOverride ?? task?.template?.defaultCameras ?? 0)} cámaras</Badge>
                            <Badge variant="outline">{task?.status || "pending"}</Badge>
                            {(locksByTask.get(Number(task?.id))?.length || 0) > 0 && <Badge variant="destructive">lock</Badge>}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <Button size="sm" variant="outline" onClick={() => runQuickAction(task.id, "start")}>Iniciar</Button>
                            <Button size="sm" variant="outline" onClick={() => runQuickAction(task.id, "interrupt")}>Pausar/Interrumpir</Button>
                            <Button size="sm" variant="outline" onClick={() => runQuickAction(task.id, "done")}>Finalizar</Button>
                            <Button size="sm" variant="destructive" disabled={task?.status === "pending" || resetTask.isPending} onClick={() => runResetAction(task)}>Reset a pendiente</Button>
                            {!task?.zoneId && !task?.spaceId && <Button size="sm" onClick={() => setLocationDialogTask(task)}>Asignar ubicación</Button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border bg-card p-4">
                <h3 className="mb-2 font-semibold">MAPA OPERATIVO</h3>
                {operationalMap.length === 0 ? <div className="text-sm text-muted-foreground">Sin tareas con zona y espacio para mapear.</div> : (
                  <div className="space-y-3">
                    {operationalMap.map((zoneBlock: any) => (
                      <div key={zoneBlock.zone?.id || zoneBlock.zone?.name} className="rounded border p-2">
                        <div className="mb-2 font-medium">{zoneBlock.zone?.name || "Zona"}</div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {zoneBlock.spaces.map((spaceBlock: any) => (
                            <div key={spaceBlock.space?.id || spaceBlock.space?.name} className="rounded border p-2 text-sm">
                              <div className="font-semibold">{spaceBlock.space?.name || "Espacio"}</div>
                              <div className="text-xs text-muted-foreground">AHORA: {spaceBlock.nowTask ? `${getTaskName(spaceBlock.nowTask)} (${formatRange(spaceBlock.nowTask?.startPlanned, spaceBlock.nowTask?.endPlanned)})` : "Sin tarea"}</div>
                              <div className="text-xs text-muted-foreground">SIGUIENTE: {spaceBlock.nextTask ? `${getTaskName(spaceBlock.nextTask)} (${formatRange(spaceBlock.nextTask?.startPlanned, spaceBlock.nextTask?.endPlanned)})` : "Sin siguiente"}</div>
                              {spaceBlock.nowTask ? <TaskRealTimeMeta task={spaceBlock.nowTask} /> : null}
                              <div className="mt-1 flex flex-wrap gap-1">
                                <Badge variant="secondary">{Number(spaceBlock.nowTask?.camerasOverride ?? spaceBlock.nowTask?.template?.defaultCameras ?? 0)} cámaras</Badge>
                                <Badge variant="outline">{spaceBlock.nowTask?.status || "pending"}</Badge>
                                {(locksByTask.get(Number(spaceBlock.nowTask?.id))?.length || 0) > 0 && <Badge variant="destructive">lock</Badge>}
                              </div>
                              <div className="mt-1 text-xs">Staff: {spaceBlock.staffNames.length ? spaceBlock.staffNames.join(", ") : "Sin asignar"}</div>
                              {spaceBlock.nowTask && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <Button size="sm" variant="outline" onClick={() => runQuickAction(spaceBlock.nowTask.id, "start")}>Iniciar</Button>
                                  <Button size="sm" variant="outline" onClick={() => runQuickAction(spaceBlock.nowTask.id, "interrupt")}>Interrumpir</Button>
                                  <Button size="sm" variant="outline" onClick={() => runQuickAction(spaceBlock.nowTask.id, "done")}>Finalizar</Button>
                                  <Button size="sm" variant="destructive" disabled={spaceBlock.nowTask?.status === "pending" || resetTask.isPending} onClick={() => runResetAction(spaceBlock.nowTask)}>Reset a pendiente</Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border bg-card p-4">
                <h3 className="mb-2 font-semibold">ALERTAS EN VIVO</h3>
                {liveAlerts.length === 0 ? <div className="text-sm text-muted-foreground">Sin alertas críticas.</div> : liveAlerts.map((alert) => (
                  <div key={alert.id} className={`mb-2 rounded border p-3 text-sm ${alert.severity === "critical" ? "border-red-300 bg-red-50" : alert.severity === "warn" ? "border-amber-300 bg-amber-50" : "border-slate-300 bg-slate-50"}`}>
                    <div className="font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{alert.title}</div>
                    <div>Impacto: {alert.impact}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {renderAlertAction(alert.primary)}
                      {renderAlertAction(alert.secondary, "outline")}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="exec" className="space-y-4">
              <div className="grid gap-3 md:grid-cols-5">
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Total tareas</div><div className="font-semibold">{data.tasks.length}</div></div>
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Fin previsto</div><div className="font-semibold">{minutesToHHMM(Math.max(...tasksWithTime.map((task: any) => hhmmToMinutes(task.endPlanned) ?? 0), 0))}</div></div>
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Locks</div><div className="font-semibold">{data.locks.length}</div></div>
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Peak cámaras</div><div className="font-semibold">{peak.max}</div></div>
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Ventana peak</div><div className="font-semibold">{formatRange(minutesToHHMM(peak.start), minutesToHHMM(peak.end))}</div></div>
              </div>
            </TabsContent>
          </Tabs>
          </>
        )}

        {isLoading && <QueryState isLoading loadingText="Cargando datos operativos..." />}
        </div>
      </div>

      <Dialog open={!!locationDialogTask} onOpenChange={(open) => !open && setLocationDialogTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar ubicación</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">{locationDialogTask ? getTaskName(locationDialogTask) : ""}</div>
            <Select value={selectedZoneId} onValueChange={(value) => { setSelectedZoneId(value); setSelectedSpaceId(""); }}>
              <SelectTrigger><SelectValue placeholder="Seleccionar zona" /></SelectTrigger>
              <SelectContent>{(data.zones || []).map((zone: any) => <SelectItem key={zone.id} value={String(zone.id)}>{zone.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={selectedSpaceId} onValueChange={setSelectedSpaceId} disabled={!selectedZoneId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar espacio" /></SelectTrigger>
              <SelectContent>{availableSpacesByZone.map((space: any) => <SelectItem key={space.id} value={String(space.id)}>{space.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocationDialogTask(null)}>Cancelar</Button>
            <Button disabled={!locationDialogTask || !selectedZoneId || !selectedSpaceId || assignLocation.isPending} onClick={() => assignLocation.mutate({ taskId: locationDialogTask.id, zoneId: selectedZoneId, spaceId: selectedSpaceId })}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
