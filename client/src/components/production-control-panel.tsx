import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, ArrowDown, Clock3, Pause, Play, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeAdjustedEta } from "@/lib/control-room-metrics";
import type { ControlRoomSettings } from "@/hooks/use-control-room-settings";

type TaskLike = any;

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

function elapsedSeconds(nowTotalSec: number, startReal?: string | null, startRealSeconds?: number | null): number {
  const startMin = parseHHMMToMinutes(startReal);
  if (startMin == null) return 0;
  const startSec = Number.isFinite(startRealSeconds as number) ? Number(startRealSeconds) : 0;
  return Math.max(0, nowTotalSec - (startMin * 60 + startSec));
}

function formatMmSs(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function ProductionControlPanel({
  tasks,
  zones,
  spaces,
  contestants,
  templates,
  nowTime,
  nowSeconds,
  settings,
  directorMode = false,
}: {
  plan: any;
  tasks: TaskLike[];
  zones: any[];
  spaces: any[];
  contestants: any[];
  templates: any[];
  nowTime: string;
  nowSeconds: number;
  settings?: ControlRoomSettings;
  directorMode?: boolean;
}) {
  const nowMin = parseHHMMToMinutes(nowTime) ?? 0;
  const nowTotalSec = nowMin * 60 + (Number.isFinite(nowSeconds) ? nowSeconds : 0);
  const idleThreshold = settings?.idleUnexpectedThresholdMin ?? 5;
  const delayThreshold = settings?.delayThresholdMin ?? 10;
  const nextSoonThreshold = settings?.nextSoonThresholdMin ?? 10;

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

  const zoneSummaries = Array.from(groups.values()).map((group) => {
    const currentTasks = group.items.filter((t) => String(t?.status ?? "") === "in_progress");
    const doneTasks = group.items.filter((t) => String(t?.status ?? "") === "done");
    const lastDone = doneTasks[doneTasks.length - 1] ?? null;
    const nextPlanned = group.items
      .filter((t) => ["pending", "interrupted"].includes(String(t?.status ?? "")))
      .sort((a, b) => (parseHHMMToMinutes(a?.startPlanned ?? a?.start_planned) ?? 10e6) - (parseHHMMToMinutes(b?.startPlanned ?? b?.start_planned) ?? 10e6))[0] ?? null;

    const hasUnexpectedIdle = Boolean(
      settings?.enableIdleAlert !== false &&
      currentTasks.length === 0 &&
      group.items.some((t) => String(t?.status ?? "") === "pending" && ((nowMin - (parseHHMMToMinutes(t?.startPlanned ?? t?.start_planned) ?? nowMin)) > idleThreshold)),
    );
    const delayedInProgress = Boolean(
      settings?.enableDelayAlert !== false &&
      currentTasks.some((t) => elapsedSeconds(nowTotalSec, t?.startReal ?? t?.start_real, t?.startRealSeconds ?? t?.start_real_seconds) / 60 > durationPlannedMin(t, templatesById) + delayThreshold),
    );
    const nextStartsSoon = Boolean(
      settings?.enableNextSoonAlert !== false &&
      nextPlanned && ((parseHHMMToMinutes(nextPlanned?.startPlanned ?? nextPlanned?.start_planned) ?? 10e6) - nowMin) <= nextSoonThreshold,
    );

    const statusLevel = delayedInProgress ? "danger" : currentTasks.length > 0 ? "active" : hasUnexpectedIdle ? "warning" : "ok";

    return { group, currentTasks, lastDone, nextPlanned, hasUnexpectedIdle, delayedInProgress, nextStartsSoon, statusLevel };
  });

  const statusCounts = {
    done: (tasks ?? []).filter((t) => String(t?.status ?? "") === "done").length,
    inProgress: (tasks ?? []).filter((t) => String(t?.status ?? "") === "in_progress").length,
    pending: (tasks ?? []).filter((t) => String(t?.status ?? "") === "pending").length,
  };

  const adjusted = computeAdjustedEta(tasks ?? [], templatesById);

  if (!tasks?.length) return <div className="rounded-lg border p-6 text-sm text-muted-foreground">Sin tareas.</div>;

  return (
    <div className={cn("space-y-4", directorMode && "space-y-6")}>
      <div className={cn("grid grid-cols-1 md:grid-cols-4 gap-3", directorMode && "text-lg") }>
        <Card><CardHeader className="pb-2"><CardTitle className={cn("text-sm", directorMode && "text-lg")}>Done / In progress / Pending</CardTitle></CardHeader><CardContent className={cn("font-semibold", directorMode ? "text-2xl" : "text-sm")}>{statusCounts.done} / {statusCounts.inProgress} / {statusCounts.pending}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className={cn("text-sm", directorMode && "text-lg")}>ETA ajustada fin</CardTitle></CardHeader><CardContent className={cn("font-semibold", directorMode ? "text-3xl" : "text-lg")}>{minutesToHHMM(adjusted.etaAdjustedMin)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className={cn("text-sm", directorMode && "text-lg")}>Confianza ETA</CardTitle></CardHeader><CardContent className={cn("font-semibold", directorMode ? "text-2xl" : "text-lg")}>{adjusted.confidence}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className={cn("text-sm", directorMode && "text-lg")}>Hora</CardTitle></CardHeader><CardContent className={cn("font-semibold flex items-center gap-2", directorMode ? "text-3xl" : "text-lg")}><Clock3 className="h-5 w-5" />{nowTime}:{String(nowSeconds).padStart(2, "0")}</CardContent></Card>
      </div>

      <div className={cn("grid grid-cols-1 xl:grid-cols-2 gap-4", directorMode && "xl:grid-cols-1") }>
        {zoneSummaries.map((zone) => {
          const firstCurrent = zone.currentTasks[0];
          const firstCurrentTemplate = templatesById.get(Number(firstCurrent?.templateId ?? firstCurrent?.template_id));
          const firstCurrentContestant = contestantsById.get(Number(firstCurrent?.contestantId ?? firstCurrent?.contestant_id));
          const firstSpace = spacesById.get(Number(firstCurrent?.spaceId ?? firstCurrent?.space_id));
          const elapsed = firstCurrent ? elapsedSeconds(nowTotalSec, firstCurrent?.startReal ?? firstCurrent?.start_real, firstCurrent?.startRealSeconds ?? firstCurrent?.start_real_seconds) : 0;

          return (
            <Card key={`${zone.group.zoneId ?? "none"}-${zone.group.zoneName}`} className={cn(
              zone.statusLevel === "active" && "border-green-600 bg-green-500/10",
              zone.statusLevel === "warning" && "border-amber-600 bg-amber-500/10",
              zone.statusLevel === "danger" && "border-red-600 bg-red-500/10",
            )}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className={cn(directorMode && "text-2xl")}>{zone.group.zoneName}</CardTitle>
                  <Badge variant={zone.currentTasks.length ? "default" : "secondary"}>
                    {zone.currentTasks.length ? <Play className="mr-1 h-3 w-3 text-green-200" /> : <Pause className="mr-1 h-3 w-3" />} {zone.currentTasks.length ? "Activo" : "Parado"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className={cn("space-y-3", directorMode ? "text-base" : "text-sm")}>
                {firstCurrent ? (
                  <div className="rounded border p-2 space-y-1">
                    <div className="font-medium">{String(firstCurrentTemplate?.name ?? firstCurrent?.template?.name ?? "Tarea")}{firstCurrentContestant?.name ? ` (${firstCurrentContestant.name})` : ""}</div>
                    <div>Ubicación: {String(firstSpace?.name ?? firstCurrent?.locationLabel ?? "—")}</div>
                    <div>Timer: <span className="font-mono">{formatMmSs(elapsed)}</span></div>
                  </div>
                ) : <div className="text-muted-foreground">Sin tarea en curso.</div>}

                <div className="flex flex-wrap gap-2">
                  {zone.delayedInProgress ? <Badge variant="destructive"><TrendingDown className="h-3 w-3 mr-1" /><ArrowDown className="h-3 w-3 mr-1" /> Retraso</Badge> : null}
                  {zone.hasUnexpectedIdle ? <Badge variant="outline" className="border-amber-500/50 text-amber-700"><AlertTriangle className="h-3 w-3 mr-1" /> Idle inesperado</Badge> : null}
                  {zone.nextStartsSoon ? (
                    <TooltipProvider><Tooltip><TooltipTrigger asChild><Badge className="bg-blue-600 hover:bg-blue-600">Próxima en breve</Badge></TooltipTrigger><TooltipContent>Arranca dentro del umbral configurado</TooltipContent></Tooltip></TooltipProvider>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
