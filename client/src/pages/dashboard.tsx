import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePlans, useGeneratePlan } from "@/hooks/use-plans";
import { usePlanOpsData } from "@/hooks/usePlanOpsData";
import { contains, formatRange, hhmmToMinutes, minutesToHHMM, sampleEveryFiveMinutes } from "@/lib/time";

const taskName = (t: any) => t?.template?.name || t?.name || "Tarea sin nombre";

function pickDefaultPlan(plans: any[]) {
  if (!plans.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const exact = plans.find((p) => String(p?.date || "").slice(0, 10) === today);
  if (exact) return exact;
  const now = new Date(today).getTime();
  const sorted = [...plans].sort((a, b) => new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime());
  const future = sorted.find((p) => new Date(p?.date || 0).getTime() >= now);
  return future || sorted.at(-1) || null;
}

export default function DashboardPage() {
  const { data: plans = [], isLoading: plansLoading } = usePlans();
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const generate = useGeneratePlan();

  const selectedPlan = useMemo(() => {
    if (!plans.length) return null;
    const fromUi = plans.find((p) => String(p.id) === selectedPlanId);
    return fromUi || pickDefaultPlan(plans);
  }, [plans, selectedPlanId]);

  const planId = selectedPlan?.id as number | undefined;
  const { data, isLoading, error, refetch } = usePlanOpsData(planId);

  const zonesById = useMemo(() => new Map((data.zones || []).map((z: any) => [Number(z.id), z])), [data.zones]);
  const spacesById = useMemo(() => new Map((data.spaces || []).map((s: any) => [Number(s.id), s])), [data.spaces]);
  const locksByTask = useMemo(() => {
    const m = new Map<number, any[]>();
    for (const l of data.locks || []) {
      const id = Number(l?.task_id);
      if (!m.has(id)) m.set(id, []);
      m.get(id)?.push(l);
    }
    return m;
  }, [data.locks]);

  const today = new Date().toISOString().slice(0, 10);
  const isTodayPlan = String(selectedPlan?.date || "").slice(0, 10) === today;
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  const tasksWithTime = useMemo(
    () => (data.tasks || []).filter((t: any) => hhmmToMinutes(t?.startPlanned) !== null && hhmmToMinutes(t?.endPlanned) !== null),
    [data.tasks],
  );

  const peak = useMemo(() => {
    const start = hhmmToMinutes(selectedPlan?.workStart) ?? Math.min(...tasksWithTime.map((t: any) => hhmmToMinutes(t.startPlanned) ?? 1440), 540);
    const end = hhmmToMinutes(selectedPlan?.workEnd) ?? Math.max(...tasksWithTime.map((t: any) => hhmmToMinutes(t.endPlanned) ?? 0), 1080);
    const samples = sampleEveryFiveMinutes(start, end);
    let max = 0;
    let at = start;
    for (const s of samples) {
      const count = (data.tasks || []).reduce((sum: number, t: any) => {
        const ts = hhmmToMinutes(t?.startPlanned);
        const te = hhmmToMinutes(t?.endPlanned);
        if (ts === null || te === null) return sum;
        const cams = Number(t?.camerasOverride ?? t?.template?.defaultCameras ?? 0);
        return contains(ts, te, s) ? sum + cams : sum;
      }, 0);
      if (count > max) {
        max = count;
        at = s;
      }
    }
    return { max, start: at, end: at + 5 };
  }, [data.tasks, selectedPlan?.workStart, selectedPlan?.workEnd, tasksWithTime]);

  const inProgress = useMemo(
    () =>
      (data.tasks || []).filter((t: any) => {
        if (t?.status === "in_progress") return true;
        const s = hhmmToMinutes(t?.startPlanned);
        const e = hhmmToMinutes(t?.endPlanned);
        if (!isTodayPlan || s === null || e === null) return false;
        return contains(s, e, nowMinutes);
      }),
    [data.tasks, isTodayPlan, nowMinutes],
  );

  const next60 = useMemo(
    () =>
      (data.tasks || []).filter((t: any) => {
        const s = hhmmToMinutes(t?.startPlanned);
        if (s === null) return false;
        return s >= nowMinutes && s <= nowMinutes + 60 && t?.status !== "done";
      }),
    [data.tasks, nowMinutes],
  );

  const upcomingNoLocation = next60.filter((t: any) => !t?.zoneId && !t?.spaceId);

  const liveAlerts = [
    ...(inProgress.filter((t: any) => (hhmmToMinutes(t?.endPlanned) ?? 9999) < nowMinutes).map((t: any) => ({
      title: `Retraso: ${taskName(t)}`,
      impact: "Puede comprometer la siguiente cadena de tareas.",
      action: `/plans/${selectedPlan?.id}`,
    })) || []),
    ...(peak.max > Number(selectedPlan?.camerasAvailable ?? 0)
      ? [{ title: "Conflicto de cámaras", impact: `Pico ${peak.max} supera disponible`, action: `/plans/${selectedPlan?.id}` }]
      : []),
    ...upcomingNoLocation.map((t: any) => ({
      title: `Sin ubicación: ${taskName(t)}`,
      impact: "Riesgo de retraso inmediato.",
      action: `/plans/${selectedPlan?.id}`,
    })),
    ...((data.locks?.length || 0) > 5 ? [{ title: "Nivel alto de locks", impact: "Posibles bloqueos operativos.", action: `/plans/${selectedPlan?.id}` }] : []),
  ];

  if (plansLoading) return <Layout><div className="p-8 text-sm text-muted-foreground">Cargando planes...</div></Layout>;

  return (
    <Layout>
      <div className="space-y-4">
        <div className="sticky top-0 z-10 rounded-lg border bg-card/95 p-4 backdrop-blur no-print">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-auto text-2xl font-bold">Centro de Control</h1>
            <Select value={selectedPlan ? String(selectedPlan.id) : undefined} onValueChange={setSelectedPlanId}>
              <SelectTrigger className="w-[280px]"><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
              <SelectContent>
                {plans.map((p) => <SelectItem key={p.id} value={String(p.id)}>{(p as any).name || `Plan ${p.id}`} · {String(p.date || "").slice(0, 10)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button asChild variant="outline"><Link href={`/plans/${selectedPlan?.id || ""}`}>Abrir plan</Link></Button>
            <Button onClick={() => generate.mutate(selectedPlan?.id)} disabled={!selectedPlan?.id || generate.isPending}>
              <Sparkles className="mr-2 h-4 w-4" /> Generar/Recalcular
            </Button>
            <Button variant="outline" onClick={() => refetch()} disabled={!selectedPlan?.id}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refrescar
            </Button>
          </div>
          {!plans.length && <div className="mt-3 text-sm">No hay planes. <Link href="/plans" className="text-primary underline">Ir a planes</Link></div>}
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
            {(error as any)?.status === 401 || (error as any)?.status === 403 ? "No tienes permisos" : "No se pudo cargar el dashboard"}
            <Button className="ml-3" size="sm" variant="outline" onClick={() => refetch()}>Reintentar</Button>
          </div>
        ) : null}

        {!selectedPlan ? null : (
          <Tabs defaultValue="live" className="space-y-3">
            <TabsList>
              <TabsTrigger value="live">EN VIVO (Realización)</TabsTrigger>
              <TabsTrigger value="exec">EJECUTIVO (Producción)</TabsTrigger>
            </TabsList>

            <TabsContent value="live" className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Modo</div><div className="font-semibold">{isTodayPlan ? "EN DIRECTO" : "MODO PREPARACIÓN"}</div></div>
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Hora</div><div className="font-semibold">{minutesToHHMM(nowMinutes)}</div></div>
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">En curso</div><div className="font-semibold">{inProgress.length}</div></div>
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Próximos 60 min</div><div className="font-semibold">{next60.length}</div></div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {[{ title: "EN CURSO", items: inProgress }, { title: "PRÓXIMOS 60 MIN", items: next60 }].map((panel) => (
                  <div key={panel.title} className="rounded-lg border bg-card p-4">
                    <h3 className="mb-3 font-semibold">{panel.title}</h3>
                    <div className="space-y-2">
                      {(panel.items || []).length === 0 ? <div className="text-sm text-muted-foreground">Sin tareas.</div> : panel.items.map((t: any) => {
                        const z = zonesById.get(Number(t?.zoneId));
                        const s = spacesById.get(Number(t?.spaceId));
                        return <div key={t.id} className="rounded border p-2 text-sm">
                          <div className="font-medium">{taskName(t)}</div>
                          <div className="text-muted-foreground">{formatRange(t?.startPlanned, t?.endPlanned)} · {s?.name || z?.name || "Sin ubicación"}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge variant="secondary">{Number(t?.camerasOverride ?? t?.template?.defaultCameras ?? 0)} cámaras</Badge>
                            <Badge variant="outline">{t?.status || "pending"}</Badge>
                            {(locksByTask.get(Number(t?.id))?.length || 0) > 0 && <Badge variant="destructive">lock</Badge>}
                          </div>
                        </div>;
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border bg-card p-4">
                <h3 className="mb-2 font-semibold">ALERTAS EN VIVO</h3>
                {liveAlerts.length === 0 ? <div className="text-sm text-muted-foreground">Sin alertas críticas.</div> : liveAlerts.map((a, i) => (
                  <div key={i} className="mb-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
                    <div className="font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{a.title}</div>
                    <div>Impacto: {a.impact}</div>
                    <Link href={a.action} className="text-primary underline">Acción sugerida</Link>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="exec" className="space-y-4">
              <div className="grid gap-3 md:grid-cols-5">
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Total tareas</div><div className="font-semibold">{data.tasks.length}</div></div>
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Fin previsto</div><div className="font-semibold">{minutesToHHMM(Math.max(...tasksWithTime.map((t: any) => hhmmToMinutes(t.endPlanned) ?? 0), 0))}</div></div>
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Locks</div><div className="font-semibold">{data.locks.length}</div></div>
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Peak cámaras</div><div className="font-semibold">{peak.max}</div></div>
                <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Ventana peak</div><div className="font-semibold">{formatRange(minutesToHHMM(peak.start), minutesToHHMM(peak.end))}</div></div>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-2">RIESGOS ACCIONABLES</h3>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {(data.tasks || []).some((t: any) => !t?.startPlanned || !t?.endPlanned) && <li>Tareas sin horario completo.</li>}
                  {(data.tasks || []).some((t: any) => !t?.zoneId && !t?.spaceId) && <li>Tareas sin ubicación.</li>}
                  {peak.max > Number(selectedPlan?.camerasAvailable ?? 0) && <li>Peak de cámaras excedido ({peak.max}/{selectedPlan?.camerasAvailable ?? 0}).</li>}
                  {data.locks.length > 8 && <li>Exceso de locks.</li>}
                </ul>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-2">CALIDAD / ESTABILIDAD DEL PLAN</h3>
                <div className="text-sm">Ubicación completa: {Math.round(((data.tasks.filter((t: any) => t?.zoneId || t?.spaceId).length || 0) / Math.max(data.tasks.length, 1)) * 100)}%</div>
                <div className="text-sm">Horario completo: {Math.round(((tasksWithTime.length || 0) / Math.max(data.tasks.length, 1)) * 100)}%</div>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {isLoading && <div className="text-sm text-muted-foreground">Cargando datos operativos…</div>}
      </div>
    </Layout>
  );
}
