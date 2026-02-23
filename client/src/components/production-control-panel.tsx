import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock3, Pause, Play } from "lucide-react";
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
  itinerantTeams,
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
  itinerantTeams?: any[];
  nowTime: string;
  nowSeconds: number;
  settings?: ControlRoomSettings;
  directorMode?: boolean;
}) {
  const nowMin = parseHHMMToMinutes(nowTime) ?? 0;
  const nowTotalSec = nowMin * 60 + (Number.isFinite(nowSeconds) ? nowSeconds : 0);
  const nextSoonThreshold = settings?.nextSoonThresholdMin ?? 10;
  const recentDoneWindowMin = Math.max(nextSoonThreshold, 20);

  const zonesById = new Map((zones ?? []).map((z: any) => [Number(z?.id), z]));
  const spacesById = new Map((spaces ?? []).map((s: any) => [Number(s?.id), s]));
  const contestantsById = new Map((contestants ?? []).map((c: any) => [Number(c?.id), c]));
  const templatesById = new Map((templates ?? []).map((t: any) => [Number(t?.id), t]));
  const itinerantsById = new Map((itinerantTeams ?? []).map((x: any) => [Number(x?.id), x]));

  const groups = new Map<string, { zoneId: number | null; zoneName: string; lanes: Map<string, { name: string; items: TaskLike[] }> }>();

  for (const task of tasks ?? []) {
    const spaceId = Number(task?.spaceId ?? task?.space_id ?? NaN);
    const itinerantTeamId = Number(task?.itinerantTeamId ?? task?.itinerant_team_id ?? NaN);
    const zoneIdRaw = Number(task?.zoneId ?? task?.zone_id ?? NaN);
    const space = Number.isFinite(spaceId) ? spacesById.get(spaceId) : null;
    const inferredZoneId = Number(space?.zoneId ?? space?.zone_id ?? NaN);
    const zoneId = Number.isFinite(zoneIdRaw) ? zoneIdRaw : Number.isFinite(inferredZoneId) ? inferredZoneId : null;
    const zoneName = zoneId != null ? String(zonesById.get(zoneId)?.name ?? `Plató ${zoneId}`) : "Sin ubicación";
    const zoneKey = zoneId != null ? `z-${zoneId}` : "z-none";
    const group = groups.get(zoneKey) ?? { zoneId, zoneName, lanes: new Map() };

    const isItinerantLane = Number.isFinite(itinerantTeamId) && itinerantTeamId > 0;
    const laneKey = isItinerantLane ? `it-${itinerantTeamId}` : Number.isFinite(spaceId) && spaceId > 0 ? `sp-${spaceId}` : "sp-none";
    const laneName = isItinerantLane
      ? String(itinerantsById.get(itinerantTeamId)?.name ?? `Itinerante #${itinerantTeamId}`)
      : Number.isFinite(spaceId) && spaceId > 0
        ? String(space?.name ?? `Espacio #${spaceId}`)
        : "Sin espacio";

    const lane = group.lanes.get(laneKey) ?? { name: laneName, items: [] };
    lane.items.push(task);
    group.lanes.set(laneKey, lane);
    groups.set(zoneKey, group);
  }

  const zoneSummaries = Array.from(groups.values()).map((group) => {
    const laneSummaries = Array.from(group.lanes.entries()).map(([laneKey, lane]) => {
      const current = lane.items.find((t) => String(t?.status ?? "") === "in_progress") ?? null;
      const done = lane.items
        .filter((t) => String(t?.status ?? "") === "done")
        .sort((a, b) => (parseHHMMToMinutes(a?.endReal ?? a?.end_real ?? a?.endPlanned ?? a?.end_planned) ?? -1) - (parseHHMMToMinutes(b?.endReal ?? b?.end_real ?? b?.endPlanned ?? b?.end_planned) ?? -1));
      const lastDone = done[done.length - 1] ?? null;
      const next = lane.items
        .filter((t) => ["pending", "interrupted"].includes(String(t?.status ?? "")))
        .sort((a, b) => (parseHHMMToMinutes(a?.startPlanned ?? a?.start_planned) ?? 10e6) - (parseHHMMToMinutes(b?.startPlanned ?? b?.start_planned) ?? 10e6))[0] ?? null;

      const currentStartMin = parseHHMMToMinutes(current?.startReal ?? current?.start_real ?? current?.startPlanned ?? current?.start_planned);
      const nextStartMin = parseHHMMToMinutes(next?.startPlanned ?? next?.start_planned);
      const lastDoneEndMin = parseHHMMToMinutes(lastDone?.endReal ?? lastDone?.end_real ?? lastDone?.endPlanned ?? lastDone?.end_planned);
      const hasActivity = Boolean(
        current ||
        (nextStartMin != null && nextStartMin - nowMin <= nextSoonThreshold) ||
        (lastDoneEndMin != null && nowMin - lastDoneEndMin <= recentDoneWindowMin),
      );

      return { laneKey, lane, current, lastDone, next, hasActivity, currentStartMin };
    }).filter((x) => x.hasActivity);

    return { group, lanes: laneSummaries };
  }).filter((x) => x.lanes.length > 0);

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
        {zoneSummaries.map((zone) => (
          <Card key={`${zone.group.zoneId ?? "none"}-${zone.group.zoneName}`}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className={cn(directorMode && "text-2xl")}>{zone.group.zoneName}</CardTitle>
                <Badge variant={zone.lanes.some((lane) => lane.current) ? "default" : "secondary"}>
                  {zone.lanes.some((lane) => lane.current) ? <Play className="mr-1 h-3 w-3 text-green-200" /> : <Pause className="mr-1 h-3 w-3" />} {zone.lanes.some((lane) => lane.current) ? "Activo" : "Parcial"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className={cn("space-y-3", directorMode ? "text-base" : "text-sm")}>
              {zone.lanes.map(({ laneKey, lane, lastDone, current, next }) => {
                const currentTpl = templatesById.get(Number(current?.templateId ?? current?.template_id));
                const currentContestant = contestantsById.get(Number(current?.contestantId ?? current?.contestant_id));
                const elapsed = current ? elapsedSeconds(nowTotalSec, current?.startReal ?? current?.start_real, current?.startRealSeconds ?? current?.start_real_seconds) : 0;
                const lastStart = lastDone?.startReal ?? lastDone?.start_real ?? lastDone?.startPlanned ?? lastDone?.start_planned;
                const lastEnd = lastDone?.endReal ?? lastDone?.end_real ?? lastDone?.endPlanned ?? lastDone?.end_planned;
                const nextStart = next?.startPlanned ?? next?.start_planned;
                return (
                  <div key={laneKey} className="rounded border p-3 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr_1fr] gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Última</div>
                      <div className="font-medium truncate">{String(lastDone?.template?.name ?? "—")}</div>
                      <div className="text-xs text-muted-foreground">{lastDone ? `${lastStart ?? "—"}–${lastEnd ?? "—"}` : "—"}</div>
                    </div>
                    <div className="rounded border bg-muted/20 p-2">
                      <div className="text-xs text-muted-foreground">{lane.name}</div>
                      <div className="font-semibold truncate">{current ? String(currentTpl?.name ?? current?.template?.name ?? "Tarea") : "Sin tarea en curso"}</div>
                      {current ? <div className="text-xs">{currentContestant?.name ? `(${currentContestant.name})` : ""}</div> : null}
                      {current ? <div className="text-xs">Inicio real: {String(current?.startReal ?? current?.start_real ?? current?.startPlanned ?? current?.start_planned ?? "—")}</div> : null}
                      {current ? <div className="text-xs font-mono">Timer: {formatMmSs(elapsed)} / {Math.max(0, durationPlannedMin(current, templatesById))}m</div> : null}
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Próxima</div>
                      <div className="font-medium truncate">{String(next?.template?.name ?? "—")}</div>
                      <div className="text-xs text-muted-foreground">{nextStart ? `Inicio planificado ${nextStart}` : "—"}</div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
