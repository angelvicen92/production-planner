import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { buildUrl, api } from "@shared/routes";
import { QueryGuard } from "@/components/QueryGuard";
import { Layout } from "@/components/layout";
import { usePlans } from "@/hooks/use-plans";
import { usePlanOpsData } from "@/hooks/usePlanOpsData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getIncidents } from "@/lib/war-room-store";
import { formatRange, hhmmToMinutes, minutesToHHMM } from "@/lib/time";
import { pickDefaultPlan } from "@/lib/plan-default";
import { buildSpacesById, buildZonesById, getSpaceName, getTaskName, getZoneName } from "@/lib/lookups";
import { useMeLinks } from "@/hooks/useMeLinks";
import { useProductionClock } from "@/hooks/use-production-clock";

const roles = ["Realización", "Producción", "Redacción", "Técnico", "Coach/Contenido"];

const scopeLabels: Record<string, string> = {
  zone: "Plató",
  space: "Espacio",
  reality_team: "Equipo reality",
  itinerant_team: "Equipo itinerante",
};

export default function CallSheetPage() {
  const { data: plans = [], isLoading: plansLoading, error: plansError, refetch: refetchPlans } = usePlans();
  const [planId, setPlanId] = useState<string>("");
  const [role, setRole] = useState(roles[0]);
  const [compact, setCompact] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [pdfHelpOpen, setPdfHelpOpen] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);

  const queryClient = useQueryClient();

  const selected = useMemo(() => plans.find((plan) => String(plan.id) === planId) || pickDefaultPlan(plans), [plans, planId]);
  const { data, isLoading, error, refetch } = usePlanOpsData(selected?.id);
  const { links, staffPerson, resourceItem } = useMeLinks(true);
  const { nowTime } = useProductionClock();

  const zonesById = useMemo(() => buildZonesById(data.zones || []), [data.zones]);
  const spacesById = useMemo(() => buildSpacesById(data.spaces || []), [data.spaces]);

  const tasks = useMemo(
    () => [...(data.tasks || [])].sort((a: any, b: any) => (hhmmToMinutes(a?.startPlanned) ?? 9999) - (hhmmToMinutes(b?.startPlanned) ?? 9999)),
    [data.tasks],
  );

  useEffect(() => {
    if (!links?.staffPersonId) return;
    const linked = (data.staffAssignments || []).find((a: any) => Number(a.staffPersonId) === Number(links.staffPersonId));
    if (!linked) return;
    if (linked.staffRole === "production") setRole("Producción");
    if (linked.staffRole === "editorial") setRole("Redacción");
  }, [data.staffAssignments, links?.staffPersonId]);

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

  const tasksView = useMemo(() => {
    if (!onlyMine) return tasks;
    if (links?.staffPersonId && myScope.size > 0) {
      return tasks.filter((task: any) => myScope.has(`space:${task?.spaceId}`) || myScope.has(`zone:${task?.zoneId}`));
    }
    if (links?.resourceItemId && String(resourceItem?.typeName || "").toLowerCase().includes("cámara")) {
      return tasks.filter((task: any) => Number(task?.camerasOverride ?? task?.template?.defaultCameras ?? 0) > 0);
    }
    return tasks;
  }, [onlyMine, tasks, links, myScope, resourceItem]);

  const notesKey = `call-sheet-notes-${selected?.id || "none"}-${role}`;
  const [notes, setNotes] = useState("");
  useEffect(() => {
    try { setNotes(localStorage.getItem(notesKey) || ""); } catch { setNotes(""); }
  }, [notesKey]);
  useEffect(() => {
    try { localStorage.setItem(notesKey, notes); } catch {}
  }, [notesKey, notes]);

  const blocks = useMemo(() => ({
    Mañana: tasksView.filter((task: any) => (hhmmToMinutes(task?.startPlanned) ?? 0) < 12 * 60),
    Mediodía: tasksView.filter((task: any) => {
      const minute = hhmmToMinutes(task?.startPlanned) ?? 0;
      return minute >= 12 * 60 && minute < 16 * 60;
    }),
    Tarde: tasksView.filter((task: any) => (hhmmToMinutes(task?.startPlanned) ?? 0) >= 16 * 60),
  }), [tasksView]);

  const nowMinutes = hhmmToMinutes(nowTime) ?? 0;
  const nowTask = tasksView.find((task: any) => {
    const start = hhmmToMinutes(task?.startPlanned);
    const end = hhmmToMinutes(task?.endPlanned);
    return start !== null && end !== null && nowMinutes >= start && nowMinutes <= end;
  });
  const nextTask = tasksView.find((task: any) => (hhmmToMinutes(task?.startPlanned) ?? 9999) > nowMinutes);

  const critical = useMemo(() => {
    const output: string[] = [];
    if ((data.tasks || []).some((task: any) => !task?.zoneId && !task?.spaceId)) output.push("Hay tareas sin ubicación");
    if ((data.tasks || []).some((task: any) => !task?.startPlanned || !task?.endPlanned)) output.push("Hay tareas sin horario completo");
    if ((data.locks || []).length > 8) output.push("Nivel alto de bloqueos");
    return output.slice(0, 3);
  }, [data]);

  const endMinute = Math.max(...tasks.map((task: any) => hhmmToMinutes(task?.endPlanned) ?? 0), 0);

  const modeByZone = useMemo(() => {
    const map = new Map<number, "zone" | "space">();
    for (const mode of data.zoneStaffModes || []) {
      map.set(Number(mode.zoneId), mode.mode === "space" ? "space" : "zone");
    }
    return map;
  }, [data.zoneStaffModes]);

  const staffByRole = useMemo(() => {
    const byRole = {
      production: [] as any[],
      editorial: [] as any[],
    };

    for (const assignment of data.staffAssignments || []) {
      const zoneId = Number(assignment.zoneId || spacesById.get(Number(assignment.spaceId))?.zoneId || 0);
      const mode = modeByZone.get(zoneId) || "zone";
      const include = assignment.scopeType === "zone" || assignment.scopeType === "space" || assignment.scopeType === "reality_team" || assignment.scopeType === "itinerant_team";
      if (!include) continue;

      if (mode === "zone" && assignment.scopeType === "space") continue;
      if (mode === "space" && assignment.scopeType === "zone") continue;

      const bucket = assignment.staffRole === "editorial" ? byRole.editorial : byRole.production;
      bucket.push(assignment);
    }

    return byRole;
  }, [data.staffAssignments, modeByZone, spacesById]);

  const groupedStaff = (entries: any[]) => {
    const grouped = new Map<string, any[]>();
    for (const assignment of entries) {
      const key = assignment.scopeType === "zone"
        ? `${scopeLabels.zone} · ${getZoneName(assignment.zoneId, zonesById)}`
        : assignment.scopeType === "space"
          ? `${scopeLabels.space} · ${getSpaceName(assignment.spaceId, spacesById)}`
          : `${scopeLabels[assignment.scopeType] || assignment.scopeType}`;

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)?.push(assignment);
    }

    return [...grouped.entries()];
  };

  const incidents = getIncidents(selected?.id);

  const technicalTopCams = [...tasks]
    .sort((a: any, b: any) => Number(b?.camerasOverride ?? b?.template?.defaultCameras ?? 0) - Number(a?.camerasOverride ?? a?.template?.defaultCameras ?? 0))
    .slice(0, 5);

  const copySummary = async () => {
    const lines = [
      `Hoja del día · ${(selected as any)?.name || "Sin plan"}`,
      `Fecha: ${String(selected?.date || "").slice(0, 10)}`,
      `Rol: ${role}`,
      `Ahora: ${nowTask ? getTaskName(nowTask) : "Sin tarea"}`,
      `Siguiente: ${nextTask ? getTaskName(nextTask) : "Sin tarea"}`,
      `Riesgos: ${critical.length ? critical.join(", ") : "Sin alertas críticas"}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(lines);
    } catch {}
  };

  if (plansLoading || plansError) return <Layout><div className="p-8"><QueryGuard isLoading={plansLoading} isError={Boolean(plansError)} error={plansError} loadingText="Cargando planes..." onRetry={() => { queryClient.cancelQueries({ queryKey: [api.plans.list.path] }); refetchPlans(); }} /></div></Layout>;

  if (!plans.length) {
    return (
      <Layout>
        <div className="rounded-lg border bg-card p-6 text-sm">
          No hay planes disponibles. <Link className="text-primary underline" href="/plans">Ir a planes</Link>.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={printMode ? "print-mode" : ""}>
        <div className="no-print sticky top-0 z-10 mb-4 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap gap-2 items-center">
            <h1 className="mr-auto text-2xl font-bold">Hoja del Día</h1>
            <Select value={selected ? String(selected.id) : undefined} onValueChange={setPlanId}>
              <SelectTrigger className="w-[260px]"><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
              <SelectContent>{plans.map((plan) => <SelectItem key={plan.id} value={String(plan.id)}>{(plan as any).name || `Plan ${plan.id}`}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant={compact ? "default" : "outline"} onClick={() => setCompact((value) => !value)}>Compacto/Detallado</Button>
            <Button variant={printMode ? "default" : "outline"} onClick={() => setPrintMode((value) => !value)}>Modo impresión</Button>
            <Button onClick={() => window.print()}>Imprimir</Button>
            <Button variant="outline" onClick={() => {
              const dismissed = localStorage.getItem("callSheetPdfHelpDismissed") === "1";
              if (!dismissed) setPdfHelpOpen(true);
              else window.print();
            }}>Exportar PDF</Button>
            <Button variant="outline" onClick={copySummary}>Copiar resumen</Button>
            {(staffPerson || resourceItem) ? (
              <Badge variant="secondary">{staffPerson ? `Operador: ${staffPerson.name}` : `Recurso vinculado: ${resourceItem?.name || "-"}`}</Badge>
            ) : null}
            {(links?.staffPersonId || links?.resourceItemId) ? (
              <Button variant={onlyMine ? "default" : "outline"} onClick={() => setOnlyMine((v) => !v)}>Solo mis scopes</Button>
            ) : null}
          </div>
          <Tabs value={role} onValueChange={setRole} className="mt-3">
            <TabsList>{roles.map((item) => <TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}</TabsList>
          </Tabs>
        </div>

        {(isLoading || error) && (
          <section className="mb-4">
            <QueryGuard
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
          </section>
        )}

        <div className="print-only mb-3 border-b pb-2">
          <div className="text-lg font-semibold">Hoja del Día · {(selected as any)?.name || "Sin plan"}</div>
          <div className="text-xs">Fecha: {String(selected?.date || "").slice(0, 10)} · Generado: {minutesToHHMM(nowMinutes)}</div>
        </div>

        <section className="mb-4 rounded-lg border bg-card p-4 print-block">
          <h2 className="font-semibold">Cabecera de día</h2>
          <div className="text-sm text-muted-foreground">{String(selected?.date || "").slice(0, 10)} · {selected?.workStart || "--:--"}–{selected?.workEnd || "--:--"}</div>
          <div className="mt-2 text-sm">Hora prevista fin: <strong>{minutesToHHMM(endMinute)}</strong></div>
          <div className="mt-2 flex flex-wrap gap-1">{critical.length ? critical.map((item) => <Badge key={item} variant="destructive">{item}</Badge>) : <span className="text-sm text-muted-foreground">Sin alertas críticas</span>}</div>
        </section>

        <section className="mb-4 rounded-lg border bg-card p-4 print-block">
          <h3 className="font-semibold mb-2">Enfoque {role}</h3>
          {role === "Realización" && (
            <div className="text-sm space-y-1">
              <div>Ahora: <strong>{nowTask ? getTaskName(nowTask) : "Sin tarea en curso"}</strong></div>
              <div>Siguiente: <strong>{nextTask ? getTaskName(nextTask) : "Sin siguiente"}</strong></div>
              <div>Cambios en 60 min: {tasks.filter((task: any) => {
                const start = hhmmToMinutes(task?.startPlanned);
                return start !== null && start >= nowMinutes && start <= nowMinutes + 60;
              }).length}</div>
            </div>
          )}
          {role === "Producción" && (
            <ul className="list-disc pl-5 text-sm">
              <li>Locks activos: {data.locks.length}</li>
              <li>Tareas sin ubicación: {tasks.filter((task: any) => !task?.zoneId && !task?.spaceId).length}</li>
              <li>Incidencias abiertas (War Room): {incidents.filter((incident) => !incident.resolved).length}</li>
            </ul>
          )}
          {role === "Técnico" && (
            <div className="space-y-1 text-sm">
              <div>Pico cámaras identificado en dashboard operativo.</div>
              {technicalTopCams.map((task) => (
                <div key={task.id}>• {getTaskName(task)} · {Number(task?.camerasOverride ?? task?.template?.defaultCameras ?? 0)} cam · {formatRange(task?.startPlanned, task?.endPlanned)}</div>
              ))}
            </div>
          )}
          {role === "Redacción" && (
            <div className="space-y-1 text-sm">
              {tasks.map((task: any) => (
                <div key={task.id} className="flex items-center gap-2">
                  <Badge variant="outline">Hit</Badge>
                  <span>{formatRange(task?.startPlanned, task?.endPlanned)} · {getTaskName(task)} · {task?.spaceId ? getSpaceName(task.spaceId, spacesById) : getZoneName(task.zoneId, zonesById)}</span>
                </div>
              ))}
            </div>
          )}
          {role === "Coach/Contenido" && <div className="text-sm">Revisar tiempos de bloques, incidencias y notas para briefing de equipo.</div>}
        </section>

        {Object.entries(blocks).map(([label, items]) => (
          <section key={label} className={`mb-4 rounded-lg border bg-card p-4 print-block ${compact ? "text-sm" : ""}`}>
            <h3 className="mb-2 font-semibold">{label}</h3>
            {(items as any[]).length === 0 ? <div className="text-sm text-muted-foreground">Sin tareas</div> : (items as any[]).map((task: any) => (
              <div key={task.id} className="mb-2 rounded border p-2">
                <div className="font-medium">{getTaskName(task)}</div>
                <div className="text-muted-foreground">{formatRange(task?.startPlanned, task?.endPlanned)} · {task?.spaceId ? getSpaceName(task.spaceId, spacesById) : task?.zoneId ? getZoneName(task.zoneId, zonesById) : "Ubicación por definir"}</div>
                <div className="mt-1 flex gap-1 flex-wrap">
                  <Badge variant="secondary">{Number(task?.camerasOverride ?? task?.template?.defaultCameras ?? 0)} cam</Badge>
                  {(!task?.zoneId && !task?.spaceId) && <Badge variant="outline">Sin ubicación</Badge>}
                </div>
              </div>
            ))}
          </section>
        ))}

        <section className="mb-4 rounded-lg border bg-card p-4 print-block">
          <h3 className="font-semibold mb-2">Personal y Asignaciones</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 font-medium">Producción</div>
              {groupedStaff(staffByRole.production).length === 0 ? <div className="text-sm text-muted-foreground">Sin asignaciones</div> : groupedStaff(staffByRole.production).map(([group, entries]) => (
                <div key={group} className="mb-2 text-sm">
                  <div className="font-medium">{group}</div>
                  <div>{(entries as any[]).map((entry) => entry.staffPersonName || "Sin nombre").join(", ")}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 font-medium">Redacción</div>
              {groupedStaff(staffByRole.editorial).length === 0 ? <div className="text-sm text-muted-foreground">Sin asignaciones</div> : groupedStaff(staffByRole.editorial).map(([group, entries]) => (
                <div key={group} className="mb-2 text-sm">
                  <div className="font-medium">{group}</div>
                  <div>{(entries as any[]).map((entry) => entry.staffPersonName || "Sin nombre").join(", ")}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4 print-block">
          <h3 className="font-semibold mb-2">Riesgos y notas operativas</h3>
          <ul className="list-disc pl-5 text-sm mb-3">
            {critical.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <Textarea className="no-print" placeholder="Notas por rol (autosave local)..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="print-only text-sm whitespace-pre-wrap">{notes}</div>
        </section>

        <Dialog open={pdfHelpOpen} onOpenChange={setPdfHelpOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Exportar a PDF</DialogTitle>
              <DialogDescription>
                En el diálogo de impresión selecciona “Guardar como PDF”. Activa gráficos de fondo si quieres mantener chips y colores. Tamaño A4 y escala ajustar.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPdfHelpOpen(false)}>Cerrar</Button>
              <Button onClick={() => { localStorage.setItem("callSheetPdfHelpDismissed", "1"); setPdfHelpOpen(false); window.print(); }}>No volver a mostrar e imprimir</Button>
              <Button onClick={() => { setPdfHelpOpen(false); window.print(); }}>Continuar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
