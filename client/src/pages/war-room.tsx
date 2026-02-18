import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { usePlans } from "@/hooks/use-plans";
import { usePlanOpsData } from "@/hooks/usePlanOpsData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { pickDefaultPlan } from "@/lib/plan-default";
import { addIncident, getIncidents, toggleResolved } from "@/lib/war-room-store";
import { buildSpacesById, buildZonesById, getSpaceName, getTaskName, getZoneName } from "@/lib/lookups";
import { formatRange, hhmmToMinutes } from "@/lib/time";
import { buildUrl, api } from "@shared/routes";
import { QueryState } from "@/components/query-state";

export default function WarRoomPage() {
  const { data: plans = [], isLoading: plansLoading, error: plansError, refetch: refetchPlans } = usePlans();
  const [planId, setPlanId] = useState<string>("");
  const selected = useMemo(() => plans.find((plan) => String(plan.id) === planId) || pickDefaultPlan(plans), [plans, planId]);
  const { data, isLoading, error, refetch } = usePlanOpsData(selected?.id);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [mode, setMode] = useState<"live" | "summary">("live");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<any>({ type: "Nota", severity: "info", text: "", zoneId: "", spaceId: "", taskId: "" });
  const [locationDialogTask, setLocationDialogTask] = useState<any | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>("");
  const [storeVersion, setStoreVersion] = useState(0);

  const zonesById = useMemo(() => buildZonesById(data.zones || []), [data.zones]);
  const spacesById = useMemo(() => buildSpacesById(data.spaces || []), [data.spaces]);
  const incidents = useMemo(() => getIncidents(selected?.id), [selected?.id, open, mode, storeVersion]);

  const invalidateOpsData = async (id?: number) => {
    if (!id) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [`/api/plans/${id}/tasks`] }),
      queryClient.invalidateQueries({ queryKey: [`/api/plans/${id}/locks`] }),
      queryClient.invalidateQueries({ queryKey: [buildUrl(api.plans.get.path, { id })] }),
    ]);
  };

  const assignLocation = useMutation({
    mutationFn: async ({ taskId, zoneId, spaceId }: any) =>
      apiRequest("PATCH", `/api/daily-tasks/${taskId}`, { zoneId: Number(zoneId), spaceId: Number(spaceId) }),
    onSuccess: async () => {
      setLocationDialogTask(null);
      setSelectedZoneId("");
      setSelectedSpaceId("");
      await invalidateOpsData(selected?.id);
    },
    onError: () => toast({ title: "No se pudo actualizar", description: "No fue posible asignar la ubicación.", variant: "destructive" }),
  });

  const add = () => {
    if (!selected?.id || !draft.text?.trim()) return;
    addIncident(selected.id, {
      type: draft.type,
      severity: draft.severity,
      text: draft.text,
      zoneId: Number(draft.zoneId) || null,
      spaceId: Number(draft.spaceId) || null,
      taskId: Number(draft.taskId) || null,
    });
    setDraft({ type: "Nota", severity: "info", text: "", zoneId: "", spaceId: "", taskId: "" });
    setOpen(false);
    setStoreVersion((value) => value + 1);
  };

  const counters = {
    open: incidents.filter((incident) => !incident.resolved).length,
    critical: incidents.filter((incident) => incident.severity === "critical" && !incident.resolved).length,
    resolved: incidents.filter((incident) => incident.resolved).length,
  };

  const upcomingNoLocation = useMemo(() => {
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    return (data.tasks || []).filter((task: any) => {
      const start = hhmmToMinutes(task?.startPlanned);
      if (start === null) return false;
      return !task?.zoneId && !task?.spaceId && start >= now && start <= now + 60;
    });
  }, [data.tasks]);

  const locksUpcoming = useMemo(() => {
    const soonTaskIds = new Set(
      (data.tasks || [])
        .filter((task: any) => {
          const start = hhmmToMinutes(task?.startPlanned);
          if (start === null) return false;
          const now = new Date().getHours() * 60 + new Date().getMinutes();
          return start >= now && start <= now + 90;
        })
        .map((task: any) => Number(task.id)),
    );
    return (data.locks || []).filter((lock: any) => soonTaskIds.has(Number(lock.task_id)));
  }, [data.locks, data.tasks]);

  const summary = [
    `War Room · ${(selected as any)?.name || "Sin plan"}`,
    `Abiertas: ${counters.open} · Críticas: ${counters.critical} · Resueltas: ${counters.resolved}`,
    ...incidents.map((incident) => {
      const zone = incident.zoneId ? getZoneName(incident.zoneId, zonesById) : "-";
      const space = incident.spaceId ? getSpaceName(incident.spaceId, spacesById) : "-";
      const task = incident.taskId ? getTaskName((data.tasks || []).find((item: any) => Number(item.id) === Number(incident.taskId))) : "-";
      return `[${new Date(incident.timestamp).toLocaleTimeString()}] ${incident.severity.toUpperCase()} ${incident.text} · zona:${zone} · espacio:${space} · tarea:${task}`;
    }),
  ].join("\n");

  const spacesByZone = (zoneId: string) => (data.spaces || []).filter((space: any) => String(space.zoneId) === String(zoneId));

  if (plansLoading || plansError) return <Layout><div className="p-8"><QueryState isLoading={plansLoading} isError={Boolean(plansError)} error={plansError} loadingText="Cargando planes..." onRetry={() => { queryClient.cancelQueries({ queryKey: [api.plans.list.path] }); refetchPlans(); }} /></div></Layout>;

  return (
    <Layout>
      <div className="space-y-4">
        <div className="no-print rounded-lg border bg-card p-4">
          <div className="flex flex-wrap gap-2 items-center">
            <h1 className="mr-auto text-2xl font-bold">War Room</h1>
            <Select value={selected ? String(selected.id) : undefined} onValueChange={setPlanId}>
              <SelectTrigger className="w-[260px]"><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
              <SelectContent>{plans.map((plan) => <SelectItem key={plan.id} value={String(plan.id)}>{(plan as any).name || `Plan ${plan.id}`}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant={mode === "live" ? "default" : "outline"} onClick={() => setMode("live")}>En vivo</Button>
            <Button variant={mode === "summary" ? "default" : "outline"} onClick={() => setMode("summary")}>Resumen</Button>
            <Button onClick={() => setOpen(true)}>Añadir incidencia</Button>
            <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(summary); } catch {} }}>Copiar resumen</Button>
            <Button onClick={() => window.print()}>Exportar PDF</Button>
          </div>
        </div>

        {(isLoading || error) && (
          <QueryState
            isLoading={isLoading}
            isError={Boolean(error)}
            error={error}
            loadingText="Cargando datos operativos..."
            onRetry={() => {
              if (selected?.id) {
                queryClient.cancelQueries({ queryKey: [buildUrl(api.plans.get.path, { id: selected.id })] });
                queryClient.cancelQueries({ queryKey: [`/api/plans/${selected.id}/tasks`] });
                queryClient.cancelQueries({ queryKey: [`/api/plans/${selected.id}/locks`] });
              }
              refetch();
            }}
          />
        )}

        {!selected && <div className="rounded-lg border bg-card p-4 text-sm">Selecciona un plan para operar.</div>}

        <div className="print-only print-footer">{(selected as any)?.name || "Sin plan"} · {String(selected?.date || "").slice(0, 10)}</div>

        <div className="grid gap-3 md:grid-cols-3 print-block">
          <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Abiertas</div><div className="text-xl font-bold">{counters.open}</div></div>
          <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Críticas</div><div className="text-xl font-bold">{counters.critical}</div></div>
          <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Resueltas</div><div className="text-xl font-bold">{counters.resolved}</div></div>
        </div>

        <section className="rounded-lg border bg-card p-4 print-block">
          <h2 className="mb-2 font-semibold">Timeline</h2>
          {incidents.length === 0 ? <div className="text-sm text-muted-foreground">Sin incidencias registradas.</div> : incidents.map((incident) => {
            const task = (data.tasks || []).find((item: any) => Number(item.id) === Number(incident.taskId));
            return (
              <div key={incident.id} className="mb-2 rounded border p-2 text-sm">
                <div className="flex items-center gap-2"><Badge variant={incident.severity === "critical" ? "destructive" : "secondary"}>{incident.type}</Badge><Badge variant="outline">{incident.severity}</Badge><span className="text-muted-foreground">{new Date(incident.timestamp).toLocaleTimeString()}</span></div>
                <div className="my-1">{incident.text}</div>
                <div className="text-xs text-muted-foreground">{incident.resolved ? "Resuelta" : "Abierta"} · Zona: {incident.zoneId ? getZoneName(incident.zoneId, zonesById) : "-"} · Espacio: {incident.spaceId ? getSpaceName(incident.spaceId, spacesById) : "-"} · Tarea: {task ? getTaskName(task) : "-"}</div>
                <div className="mt-1 flex flex-wrap gap-2 no-print">
                  <Button size="sm" variant="outline" onClick={() => { toggleResolved(selected?.id || "none", incident.id); setStoreVersion((value) => value + 1); }}>Marcar resuelto</Button>
                  {task && <Button asChild size="sm" variant="outline"><Link href={`/plans/${selected?.id}`}>Abrir tarea en plan</Link></Button>}
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-lg border bg-card p-4 print-block">
          <h2 className="mb-2 font-semibold">Señales del sistema</h2>
          <div className="text-sm">Locks totales: {data.locks.length}</div>
          <div className="text-sm">Locks en tareas próximas: {locksUpcoming.length}</div>
          <div className="text-sm mb-2">Tareas próximas sin ubicación: {upcomingNoLocation.length}</div>
          <div className="space-y-2">
            {upcomingNoLocation.map((task: any) => (
              <div key={task.id} className="rounded border p-2 text-sm">
                <div>{getTaskName(task)} · {formatRange(task?.startPlanned, task?.endPlanned)}</div>
                <div className="mt-1 flex gap-2">
                  <Button size="sm" onClick={() => { setLocationDialogTask(task); setSelectedZoneId(""); setSelectedSpaceId(""); }}>Asignar ubicación</Button>
                  <Button asChild size="sm" variant="outline"><Link href={`/plans/${selected?.id}`}>Abrir tarea en plan</Link></Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Añadir incidencia</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Select value={draft.type} onValueChange={(value) => setDraft((current: any) => ({ ...current, type: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["Interrupción", "Decisión", "Cambio", "Riesgo", "Nota"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={draft.severity} onValueChange={(value) => setDraft((current: any) => ({ ...current, severity: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["info", "warn", "critical"].map((severity) => <SelectItem key={severity} value={severity}>{severity}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={draft.zoneId} onValueChange={(value) => setDraft((current: any) => ({ ...current, zoneId: value, spaceId: "" }))}>
                <SelectTrigger><SelectValue placeholder="Zona (opcional)" /></SelectTrigger>
                <SelectContent>{(data.zones || []).map((zone: any) => <SelectItem key={zone.id} value={String(zone.id)}>{zone.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={draft.spaceId} onValueChange={(value) => setDraft((current: any) => ({ ...current, spaceId: value }))} disabled={!draft.zoneId}>
                <SelectTrigger><SelectValue placeholder="Espacio (opcional)" /></SelectTrigger>
                <SelectContent>{spacesByZone(draft.zoneId).map((space: any) => <SelectItem key={space.id} value={String(space.id)}>{space.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={draft.taskId} onValueChange={(value) => setDraft((current: any) => ({ ...current, taskId: value }))}>
                <SelectTrigger><SelectValue placeholder="Tarea (opcional)" /></SelectTrigger>
                <SelectContent>{(data.tasks || []).map((task: any) => <SelectItem key={task.id} value={String(task.id)}>{formatRange(task?.startPlanned, task?.endPlanned)} · {getTaskName(task)}</SelectItem>)}</SelectContent>
              </Select>
              <Textarea placeholder="Detalle de incidencia" value={draft.text || ""} onChange={(event) => setDraft((current: any) => ({ ...current, text: event.target.value }))} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={add}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!locationDialogTask} onOpenChange={(isOpen) => !isOpen && setLocationDialogTask(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Asignar ubicación</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">{locationDialogTask ? getTaskName(locationDialogTask) : ""}</div>
              <Select value={selectedZoneId} onValueChange={(value) => { setSelectedZoneId(value); setSelectedSpaceId(""); }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar zona" /></SelectTrigger>
                <SelectContent>{(data.zones || []).map((zone: any) => <SelectItem key={zone.id} value={String(zone.id)}>{zone.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={selectedSpaceId} onValueChange={setSelectedSpaceId} disabled={!selectedZoneId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar espacio" /></SelectTrigger>
                <SelectContent>{spacesByZone(selectedZoneId).map((space: any) => <SelectItem key={space.id} value={String(space.id)}>{space.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLocationDialogTask(null)}>Cancelar</Button>
              <Button disabled={!locationDialogTask || !selectedZoneId || !selectedSpaceId || assignLocation.isPending} onClick={() => assignLocation.mutate({ taskId: locationDialogTask.id, zoneId: selectedZoneId, spaceId: selectedSpaceId })}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
