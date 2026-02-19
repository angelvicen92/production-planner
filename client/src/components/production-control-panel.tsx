import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, ArrowDown, Pause, Play, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

type TaskLike = any;

type ZoneSummary = {
  zoneId: number | null;
  zoneName: string;
  currentTasks: TaskLike[];
  lastDone: TaskLike | null;
  nextPlanned: TaskLike | null;
  workedMin: number;
  plannedWorkMin: number;
  windowMin: number;
  idleMin: number;
  deviationAvgMin: number;
  alerts: string[];
  statusLevel: "ok" | "active" | "warning" | "danger";
  hasUnexpectedIdle: boolean;
  delayedInProgress: boolean;
  nextStartsSoon: boolean;
};

function parseHHMMToMinutes(value?: string | null): number | null {
  if (!value || typeof value !== "string") return null;
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function minutesToHHMM(minutes?: number | null): string {
  if (!Number.isFinite(minutes as number)) return "—";
  const safe = Math.max(0, Math.floor(minutes as number));
  const hh = String(Math.floor(safe / 60) % 24).padStart(2, "0");
  const mm = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function toHHMMSS(hhmm?: string | null, sec?: number | null): string {
  if (!hhmm) return "—";
  const safeSec = Number.isFinite(sec as number) ? Math.max(0, Math.min(59, Number(sec))) : 0;
  return `${hhmm}:${String(safeSec).padStart(2, "0")}`;
}

function durationPlannedMin(task: TaskLike, templatesById: Map<number, any>): number {
  const templateId = Number(task?.templateId ?? task?.template_id ?? task?.template?.id);
  const tpl = Number.isFinite(templateId) ? templatesById.get(templateId) : null;
  const tplDuration = Number(tpl?.duration_min ?? tpl?.defaultDuration ?? tpl?.default_duration ?? task?.template?.defaultDuration ?? task?.template?.default_duration);
  if (Number.isFinite(tplDuration) && tplDuration > 0) return tplDuration;
  const startMin = parseHHMMToMinutes(task?.startPlanned ?? task?.start_planned);
  const endMin = parseHHMMToMinutes(task?.endPlanned ?? task?.end_planned);
  if (startMin == null || endMin == null || endMin <= startMin) return 0;
  return endMin - startMin;
}

function durationRealSeconds(task: TaskLike): number {
  const startMin = parseHHMMToMinutes(task?.startReal ?? task?.start_real);
  const endMin = parseHHMMToMinutes(task?.endReal ?? task?.end_real);
  if (startMin == null || endMin == null || endMin < startMin) return 0;
  const startSec = Number.isFinite(Number(task?.startRealSeconds ?? task?.start_real_seconds)) ? Number(task?.startRealSeconds ?? task?.start_real_seconds) : 0;
  const endSec = Number.isFinite(Number(task?.endRealSeconds ?? task?.end_real_seconds)) ? Number(task?.endRealSeconds ?? task?.end_real_seconds) : 0;
  const raw = (endMin - startMin) * 60 + (endSec - startSec);
  return Math.max(0, raw);
}

function elapsedSeconds(nowTotalSec: number, startReal?: string | null, startRealSeconds?: number | null): number {
  const startMin = parseHHMMToMinutes(startReal);
  if (startMin == null) return 0;
  const startSec = Number.isFinite(startRealSeconds as number) ? Number(startRealSeconds) : 0;
  const startTotalSec = startMin * 60 + startSec;
  return Math.max(0, nowTotalSec - startTotalSec);
}

function formatMmSs(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function ProductionControlPanel({
  plan,
  tasks,
  zones,
  spaces,
  contestants,
  templates,
  nowTime,
  nowSeconds,
}: {
  plan: any;
  tasks: TaskLike[];
  zones: any[];
  spaces: any[];
  contestants: any[];
  templates: any[];
  nowTime: string;
  nowSeconds: number;
}) {
  const nowMin = parseHHMMToMinutes(nowTime) ?? 0;
  const nowTotalSec = nowMin * 60 + (Number.isFinite(nowSeconds) ? nowSeconds : 0);

  const zonesById = new Map((zones ?? []).map((z: any) => [Number(z?.id), z]));
  const spacesById = new Map((spaces ?? []).map((s: any) => [Number(s?.id), s]));
  const contestantsById = new Map((contestants ?? []).map((c: any) => [Number(c?.id), c]));
  const templatesById = new Map((templates ?? []).map((t: any) => [Number(t?.id), t]));

  const groups = new Map<string, { zoneId: number | null; zoneName: string; items: TaskLike[] }>();
  for (const task of tasks ?? []) {
    const zoneIdRaw = Number(task?.zoneId ?? task?.zone_id ?? NaN);
    const spaceId = Number(task?.spaceId ?? task?.space_id ?? NaN);
    const space = Number.isFinite(spaceId) ? spacesById.get(spaceId) : null;
    const inferredZoneId = Number(space?.zoneId ?? space?.zone_id ?? NaN);
    const zoneId = Number.isFinite(zoneIdRaw) ? zoneIdRaw : Number.isFinite(inferredZoneId) ? inferredZoneId : null;
    const zoneName = zoneId != null ? String(zonesById.get(zoneId)?.name ?? `Plató ${zoneId}`) : "Sin ubicación";
    const key = zoneId != null ? `z-${zoneId}` : "z-none";
    const current = groups.get(key) ?? { zoneId, zoneName, items: [] };
    current.items.push(task);
    groups.set(key, current);
  }

  const zoneSummaries: ZoneSummary[] = Array.from(groups.values()).map((group) => {
    const currentTasks = group.items.filter((t) => String(t?.status ?? "") === "in_progress");

    const doneTasks = group.items.filter((t) => String(t?.status ?? "") === "done");
    const lastDone = doneTasks
      .slice()
      .sort((a, b) => {
        const aEnd = parseHHMMToMinutes(a?.endReal ?? a?.end_real) ?? parseHHMMToMinutes(a?.endPlanned ?? a?.end_planned) ?? -1;
        const bEnd = parseHHMMToMinutes(b?.endReal ?? b?.end_real) ?? parseHHMMToMinutes(b?.endPlanned ?? b?.end_planned) ?? -1;
        return bEnd - aEnd;
      })[0] ?? null;

    const pending = group.items
      .filter((t) => String(t?.status ?? "") === "pending")
      .filter((t) => {
        const start = parseHHMMToMinutes(t?.startPlanned ?? t?.start_planned);
        return start != null && start >= nowMin;
      })
      .sort((a, b) => (parseHHMMToMinutes(a?.startPlanned ?? a?.start_planned) ?? 10e6) - (parseHHMMToMinutes(b?.startPlanned ?? b?.start_planned) ?? 10e6));
    const nextPlanned = pending[0] ?? null;

    const plannedStarts = group.items
      .map((t) => parseHHMMToMinutes(t?.startPlanned ?? t?.start_planned))
      .filter((n): n is number => n != null);
    const plannedEnds = group.items
      .map((t) => parseHHMMToMinutes(t?.endPlanned ?? t?.end_planned))
      .filter((n): n is number => n != null);
    const firstPlanned = plannedStarts.length ? Math.min(...plannedStarts) : null;
    const lastPlanned = plannedEnds.length ? Math.max(...plannedEnds) : null;

    const plannedWorkMin = group.items.reduce((acc, t) => acc + durationPlannedMin(t, templatesById), 0);
    const windowMin = firstPlanned != null && lastPlanned != null && lastPlanned > firstPlanned ? lastPlanned - firstPlanned : 0;
    const idleMin = Math.max(0, windowMin - plannedWorkMin);

    const workedDoneMin = doneTasks.reduce((acc, t) => acc + durationRealSeconds(t) / 60, 0);
    const workedLiveMin = currentTasks.reduce(
      (acc, t) => acc + elapsedSeconds(nowTotalSec, t?.startReal ?? t?.start_real, t?.startRealSeconds ?? t?.start_real_seconds) / 60,
      0,
    );
    const workedMin = workedDoneMin + workedLiveMin;

    const doneDeviations = doneTasks
      .map((t) => durationRealSeconds(t) / 60 - durationPlannedMin(t, templatesById))
      .filter((v) => Number.isFinite(v));
    const deviationAvgMin = doneDeviations.length
      ? doneDeviations.reduce((a, b) => a + b, 0) / doneDeviations.length
      : 0;

    const hasUnexpectedIdle = currentTasks.length === 0 && group.items.some((t) => String(t?.status ?? "") === "pending" && (parseHHMMToMinutes(t?.startPlanned ?? t?.start_planned) ?? 10e6) < nowMin);
    const delayedInProgress = currentTasks.some((t) => elapsedSeconds(nowTotalSec, t?.startReal ?? t?.start_real, t?.startRealSeconds ?? t?.start_real_seconds) / 60 > durationPlannedMin(t, templatesById) + 10);
    const nextStartsSoon = nextPlanned && ((parseHHMMToMinutes(nextPlanned?.startPlanned ?? nextPlanned?.start_planned) ?? 10e6) - nowMin) < 10;

    const alerts = [
      hasUnexpectedIdle ? "Idle inesperado" : null,
      delayedInProgress ? "Retraso" : null,
      nextStartsSoon ? "Próxima en breve" : null,
    ].filter((v): v is string => Boolean(v));

    const statusLevel: ZoneSummary["statusLevel"] = delayedInProgress
      ? "danger"
      : currentTasks.length > 0
        ? "active"
        : hasUnexpectedIdle
          ? "warning"
          : "ok";

    return {
      zoneId: group.zoneId,
      zoneName: group.zoneName,
      currentTasks,
      lastDone,
      nextPlanned,
      workedMin,
      plannedWorkMin,
      windowMin,
      idleMin,
      deviationAvgMin,
      alerts,
      statusLevel,
      hasUnexpectedIdle,
      delayedInProgress,
      nextStartsSoon,
    };
  });

  const activeZones = zoneSummaries.filter((z) => z.currentTasks.length > 0).length;
  const statusCounts = {
    done: (tasks ?? []).filter((t) => String(t?.status ?? "") === "done").length,
    inProgress: (tasks ?? []).filter((t) => String(t?.status ?? "") === "in_progress").length,
    pending: (tasks ?? []).filter((t) => String(t?.status ?? "") === "pending").length,
  };
  const doneGlobalDeviations = (tasks ?? [])
    .filter((t) => String(t?.status ?? "") === "done")
    .map((t) => durationRealSeconds(t) / 60 - durationPlannedMin(t, templatesById))
    .filter((v) => Number.isFinite(v));
  const globalDeviation = doneGlobalDeviations.length
    ? doneGlobalDeviations.reduce((a, b) => a + b, 0) / doneGlobalDeviations.length
    : 0;
  const etaEnd = (tasks ?? [])
    .map((t) => parseHHMMToMinutes(t?.endPlanned ?? t?.end_planned))
    .filter((n): n is number => n != null)
    .sort((a, b) => b - a)[0] ?? null;

  if (!tasks?.length) {
    return <div className="rounded-lg border p-6 text-sm text-muted-foreground">Sin tareas.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Plató activos</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{activeZones} / {zoneSummaries.length}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Done / In progress / Pending</CardTitle></CardHeader><CardContent className="text-sm font-semibold">{statusCounts.done} / {statusCounts.inProgress} / {statusCounts.pending}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Desviación media</CardTitle></CardHeader><CardContent className="text-lg font-semibold">{globalDeviation >= 0 ? "+" : ""}{globalDeviation.toFixed(1)} min</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">ETA fin</CardTitle></CardHeader><CardContent className="text-lg font-semibold">{minutesToHHMM(etaEnd)}</CardContent></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {zoneSummaries.map((zone) => {
          const firstCurrent = zone.currentTasks[0];
          const firstCurrentTemplate = templatesById.get(Number(firstCurrent?.templateId ?? firstCurrent?.template_id));
          const firstCurrentContestant = contestantsById.get(Number(firstCurrent?.contestantId ?? firstCurrent?.contestant_id));
          const firstSpace = spacesById.get(Number(firstCurrent?.spaceId ?? firstCurrent?.space_id));
          const elapsed = firstCurrent
            ? elapsedSeconds(nowTotalSec, firstCurrent?.startReal ?? firstCurrent?.start_real, firstCurrent?.startRealSeconds ?? firstCurrent?.start_real_seconds)
            : 0;

          return (
            <Card key={`${zone.zoneId ?? "none"}-${zone.zoneName}`} className={cn(
                zone.statusLevel === "active" && "border-green-500/40 bg-green-500/5",
                zone.statusLevel === "warning" && "border-amber-500/40 bg-amber-500/5",
                zone.statusLevel === "danger" && "border-red-500/40 bg-red-500/5",
              )}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{zone.zoneName}</CardTitle>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant={zone.currentTasks.length ? "default" : "secondary"} aria-label={zone.currentTasks.length ? "Plató activo" : "Plató parado"}>
                          {zone.currentTasks.length ? <Play className="mr-1 h-3 w-3 text-green-600" /> : <Pause className="mr-1 h-3 w-3 text-muted-foreground" />}
                          {zone.currentTasks.length ? "Activo" : "Parado"}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{zone.currentTasks.length ? "Hay tareas en ejecución" : "Sin tareas en ejecución"}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="font-semibold">AHORA</div>
                  {firstCurrent ? (
                    <div className="rounded border p-2 space-y-1">
                      <div className="font-medium">
                        {String(firstCurrentTemplate?.name ?? firstCurrent?.template?.name ?? "Tarea")}
                        {firstCurrentContestant?.name ? ` (${firstCurrentContestant.name})` : ""}
                        {zone.currentTasks.length > 1 ? <Badge className="ml-2" variant="outline">+{zone.currentTasks.length - 1}</Badge> : null}
                      </div>
                      <div>Ubicación: {String(firstSpace?.name ?? firstCurrent?.locationLabel ?? "—")}</div>
                      <div>Teórico: {String(firstCurrent?.startPlanned ?? firstCurrent?.start_planned ?? "—")} - {String(firstCurrent?.endPlanned ?? firstCurrent?.end_planned ?? "—")}</div>
                      <div>Inicio real: {toHHMMSS(firstCurrent?.startReal ?? firstCurrent?.start_real, firstCurrent?.startRealSeconds ?? firstCurrent?.start_real_seconds)}</div>
                      <div>Timer: <span className="font-mono">{formatMmSs(elapsed)}</span></div>
                      <div>Fin previsto: {String(firstCurrent?.endPlanned ?? firstCurrent?.end_planned ?? "—")}</div>
                    </div>
                  ) : <div className="text-muted-foreground">Sin tarea en curso.</div>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <div className="font-semibold">ÚLTIMA</div>
                    <div className="text-muted-foreground">{zone.lastDone ? String(templatesById.get(Number(zone.lastDone?.templateId ?? zone.lastDone?.template_id))?.name ?? zone.lastDone?.template?.name ?? "Tarea") : "—"}</div>
                  </div>
                  <div>
                    <div className="font-semibold">SIGUIENTE</div>
                    <div className="text-muted-foreground">{zone.nextPlanned ? `${String(templatesById.get(Number(zone.nextPlanned?.templateId ?? zone.nextPlanned?.template_id))?.name ?? zone.nextPlanned?.template?.name ?? "Tarea")} · ${String(zone.nextPlanned?.startPlanned ?? zone.nextPlanned?.start_planned ?? "—")}` : "—"}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                  <div><div className="text-muted-foreground">Trabajo planificado</div><div className="font-semibold">{zone.plannedWorkMin.toFixed(0)}m</div></div>
                  <div><div className="text-muted-foreground">Trabajado</div><div className="font-semibold">{zone.workedMin.toFixed(1)}m</div></div>
                  <div><div className="text-muted-foreground">Ventana</div><div className="font-semibold">{zone.windowMin.toFixed(0)}m</div></div>
                  <div><div className="text-muted-foreground">Idle</div><div className="font-semibold">{zone.idleMin.toFixed(0)}m</div></div>
                  <div><div className="text-muted-foreground">Desviación media</div><div className="font-semibold">{zone.deviationAvgMin >= 0 ? "+" : ""}{zone.deviationAvgMin.toFixed(1)}m</div></div>
                </div>

                {zone.alerts.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {zone.delayedInProgress ? (
                      <Badge variant="destructive" className="flex items-center gap-1" aria-label="Retraso detectado">
                        <TrendingDown className="h-3 w-3 text-red-200" />
                        <ArrowDown className="h-3 w-3 text-red-200" /> Retraso
                      </Badge>
                    ) : null}
                    {zone.hasUnexpectedIdle ? (
                      <Badge variant="outline" className="border-amber-500/40 text-amber-700" aria-label="Idle inesperado">
                        <AlertTriangle className="mr-1 h-3 w-3 text-amber-600" /> Idle inesperado
                      </Badge>
                    ) : null}
                    {zone.nextStartsSoon ? <Badge className="bg-blue-500 hover:bg-blue-500" aria-label="Próxima tarea en breve">Próxima en breve</Badge> : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
