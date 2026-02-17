import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { timeToMinutes } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useProductionClock } from "@/hooks/use-production-clock";

interface Task {
  id: number;
  templateId: number;
  contestantId: number | null;
  status: string;
  startPlanned: string | null;
  endPlanned: string | null;
  startReal?: string | null;
  endReal?: string | null;
  template?: {
    name: string;
    uiColor?: string | null;
    uiColorSecondary?: string | null;
  };
  camerasOverride?: number;

  // Location (already used below)
  zoneId?: number | null;
  spaceId?: number | null;
  locationLabel?: string | null;
  assignedResources?: number[] | null;
  assigned_resource_ids?: number[] | null;
}

interface Contestant {
  id: number;
  name: string;
}

type ResourceSelectable = {
  id: string | number;
  label: string;
  kind: "resource_item" | "production" | "editorial" | "itinerant_team";
  meta?: { typeName?: string; color?: string };
};

interface PlanningTimelineProps {
  // Vista vertical para "Por plató y espacio"
  spaceVerticalMode?: "timeline" | "list";

  plan: {
    workStart: string | null;
    workEnd: string | null;
    mealStart: string | null;
    mealEnd: string | null;
    dailyTasks: Task[];
  };
  contestants: Contestant[];

  // New: view mode + optional location catalogs
  viewMode?: "contestants" | "spaces" | "resources";
  stageFilterIds?: number[];
  resourceFilterIds?: string[];
  resourceSelectables?: ResourceSelectable[];
  zones?: { id: number; name: string; uiColor?: string | null }[];
  spaces?: {
    id: number;
    name: string;
    zoneId: number | null;
    parentSpaceId?: number | null;
  }[];

  // NEW: recursos fijos por plató (zona) dentro del plan
  zoneResourceAssignments?: Record<number, number[]>;
  // NEW: nombre por plan_resource_items.id
  planResourceItemNameById?: Record<number, string>;

  // NEW: roles por plan (para pintar cabeceras)
  zoneStaffModes?: { zoneId: number; mode: "zone" | "space" }[];
  itinerantTeams?: {
    id: number;
    code?: string | null;
    name: string;
    isActive?: boolean;
    orderIndex?: number | null;
  }[];
  staffAssignments?: {
    staffRole: "production" | "editorial";
    staffPersonName: string;
    scopeType: "zone" | "space" | "reality_team" | "itinerant_team";
    zoneId: number | null;
    spaceId: number | null;
    realityTeamCode: string | null;
    itinerantTeamId: number | null;
  }[];

  onTaskStatusChange?: (
    task: Task,
    status: "in_progress" | "done" | "interrupted" | "cancelled",
  ) => Promise<void>;
  taskStatusPending?: boolean;
}

function taskActionsForStatus(status: string) {
  if (status === "pending") return ["in_progress", "cancelled"] as const;
  if (status === "in_progress") {
    return ["done", "interrupted", "cancelled"] as const;
  }
  if (status === "interrupted") return ["in_progress"] as const;
  return [] as const;
}

function actionLabel(status: "in_progress" | "done" | "interrupted" | "cancelled") {
  if (status === "in_progress") return "Start";
  if (status === "done") return "Finish";
  if (status === "interrupted") return "Interrupt";
  return "Cancel";
}

function TaskStatusMenuTrigger({
  task,
  contestantName,
  locationLabel,
  onTaskStatusChange,
  taskStatusPending = false,
  className,
  style,
  children,
}: {
  task: Task;
  contestantName: string;
  locationLabel: string;
  onTaskStatusChange?: (
    task: Task,
    status: "in_progress" | "done" | "interrupted" | "cancelled",
  ) => Promise<void>;
  taskStatusPending?: boolean;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const actions = taskActionsForStatus(task.status ?? "pending");

  const summaryTime =
    task.startReal || task.endReal
      ? `${task.startReal ?? "—"}–${task.endReal ?? "—"}`
      : `${task.startPlanned ?? "—"}–${task.endPlanned ?? "—"}`;

  const handleSelect = async (
    status: "in_progress" | "done" | "interrupted" | "cancelled",
  ) => {
    if (!onTaskStatusChange) return;
    await onTaskStatusChange(task, status);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(className, "text-left")}
          style={style}
          disabled={!onTaskStatusChange}
        >
          {children}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="space-y-1">
          <p className="truncate">{task.template?.name || "Tarea"}</p>
          <p className="text-[11px] font-normal text-muted-foreground truncate">
            {contestantName || "—"} · {summaryTime}
          </p>
          <p className="text-[11px] font-normal text-muted-foreground truncate">
            {locationLabel || "—"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.length === 0 ? (
          <DropdownMenuItem disabled>Sin acciones</DropdownMenuItem>
        ) : (
          actions.map((action) => (
            <DropdownMenuItem
              key={action}
              disabled={taskStatusPending}
              onSelect={(event) => {
                event.preventDefault();
                void handleSelect(action);
              }}
            >
              {actionLabel(action)}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

  export function PlanningTimeline({
    plan,
    contestants,
    viewMode = "contestants",
    spaceVerticalMode = "timeline",
    stageFilterIds = [],
    resourceFilterIds = [],
    resourceSelectables = [],
    zones = [],
    spaces = [],
    zoneResourceAssignments = {},
    planResourceItemNameById = {},
    zoneStaffModes = [],
    itinerantTeams = [],
    staffAssignments = [],
    onTaskStatusChange,
    taskStatusPending = false,
    }: PlanningTimelineProps) {
  const { workStart, workEnd, mealStart, mealEnd, dailyTasks } = plan;
  const { nowTime } = useProductionClock();

  // =========================
  // 🎨 Helpers for UI colors
  // =========================
  const hexToRgb = (hex?: string | null) => {
    if (!hex) return null;
    const v = String(hex).trim();
    const m = v.match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  const hexToRgba = (hex?: string | null, alpha = 0.15) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return undefined;
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
  };

  const textColorForBg = (hex?: string | null) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return undefined;
    const lum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return lum > 0.6 ? "#0b1220" : "#ffffff";
  };

  const taskBaseColor = (task: Task) => {
    // En "Por plató y espacio" usamos el color secundario
    const primary = task.template?.uiColor ?? null;
    const secondary = task.template?.uiColorSecondary ?? null;
    return viewMode === "spaces"
      ? (secondary ?? primary ?? undefined)
      : (primary ?? undefined);
  };

  const taskTextColor = (task: Task) => {
    const base = taskBaseColor(task);
    return base ? textColorForBg(base) : undefined;
  };

  const getTaskLocationLabel = (task: Task) => {
    if (task.locationLabel) return String(task.locationLabel);

    const sp = task.spaceId
      ? (spaces ?? []).find((s) => Number(s.id) === Number(task.spaceId))
      : null;
    if (sp) {
      const zn =
        sp.zoneId !== null && sp.zoneId !== undefined
          ? (zones ?? []).find((z) => Number(z.id) === Number(sp.zoneId))
          : null;

      return zn ? `${zn.name} · ${sp.name}` : sp.name;
    }

    const zn = task.zoneId
      ? (zones ?? []).find((z) => Number(z.id) === Number(task.zoneId))
      : null;
    if (zn) return zn.name;

    return "—";
  };

  const startMin = useMemo(
    () => (workStart ? timeToMinutes(workStart) : 480),
    [workStart],
  );
  const endMin = useMemo(
    () => (workEnd ? timeToMinutes(workEnd) : 1260),
    [workEnd],
  );
  const duration = endMin - startMin;
  const nowMin = useMemo(() => (nowTime ? timeToMinutes(nowTime) : null), [nowTime]);
  const clampedNowMin = useMemo(() => {
    if (nowMin === null) return null;
    if (nowMin < startMin || nowMin > endMin) return null;
    return nowMin;
  }, [nowMin, startMin, endMin]);

  const isOverdueTask = (task: Task) => {
    if (clampedNowMin === null || !task?.startPlanned) return false;
    const start = timeToMinutes(task.startPlanned);
    return task.status === "pending" && start <= clampedNowMin;
  };

  const isRunningLateTask = (task: Task) => {
    if (clampedNowMin === null || !task?.endPlanned) return false;
    const end = timeToMinutes(task.endPlanned);
    return task.status === "in_progress" && end <= clampedNowMin;
  };

  const mealStartMin = useMemo(
    () => (mealStart ? timeToMinutes(mealStart) : null),
    [mealStart],
  );
  const mealEndMin = useMemo(
    () => (mealEnd ? timeToMinutes(mealEnd) : null),
    [mealEnd],
  );

  const contestantNameById = useMemo(() => {
    const mapped: Record<number, string> = {};
    for (const contestant of contestants ?? []) {
      const id = Number(contestant?.id);
      if (!Number.isFinite(id)) continue;
      mapped[id] = String(contestant?.name ?? "—");
    }
    return mapped;
  }, [contestants]);

  const selectedStageIdsSet = useMemo(
    () => new Set((stageFilterIds ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id))),
    [stageFilterIds],
  );

  const filteredZones = useMemo(() => {
    if (selectedStageIdsSet.size === 0) return zones ?? [];
    return (zones ?? []).filter((zone) => selectedStageIdsSet.has(Number(zone?.id)));
  }, [zones, selectedStageIdsSet]);

  const filteredSpaces = useMemo(() => {
    if (selectedStageIdsSet.size === 0) return spaces ?? [];
    return (spaces ?? []).filter((space) => {
      const zoneId = Number(space?.zoneId);
      return Number.isFinite(zoneId) && selectedStageIdsSet.has(zoneId);
    });
  }, [spaces, selectedStageIdsSet]);

  const filteredDailyTasksByStage = useMemo(() => {
    if (selectedStageIdsSet.size === 0) return dailyTasks ?? [];
    return (dailyTasks ?? []).filter((task) => {
      const taskZoneId = Number(task?.zoneId);
      if (Number.isFinite(taskZoneId) && selectedStageIdsSet.has(taskZoneId)) return true;

      const taskSpaceId = Number(task?.spaceId);
      if (!Number.isFinite(taskSpaceId)) return false;

      const space = (spaces ?? []).find((s) => Number(s?.id) === taskSpaceId);
      const spaceZoneId = Number(space?.zoneId);
      return Number.isFinite(spaceZoneId) && selectedStageIdsSet.has(spaceZoneId);
    });
  }, [dailyTasks, spaces, selectedStageIdsSet]);

  const selectedResourceKeys = useMemo(
    () => (resourceFilterIds ?? []).map((id) => String(id ?? "")).filter((id) => id.length > 0),
    [resourceFilterIds],
  );

  const resourceSelectableById = useMemo(() => {
    const mapped = new Map<string, ResourceSelectable>();
    for (const opt of resourceSelectables ?? []) {
      const key = String(opt.id ?? "");
      if (!key) continue;
      mapped.set(key, opt);
    }
    return mapped;
  }, [resourceSelectables]);

  const zoneById = useMemo(() => {
    const mapped = new Map<number, { id: number; name: string }>();
    for (const zone of zones ?? []) {
      const id = Number(zone?.id);
      if (!Number.isFinite(id)) continue;
      mapped.set(id, { id, name: String(zone?.name ?? `Plató #${id}`) });
    }
    return mapped;
  }, [zones]);

  const spaceById = useMemo(() => {
    const mapped = new Map<number, { id: number; name: string; zoneId: number | null }>();
    for (const space of spaces ?? []) {
      const id = Number(space?.id);
      if (!Number.isFinite(id)) continue;
      const zoneIdRaw = space?.zoneId;
      const zoneId = zoneIdRaw == null ? null : Number(zoneIdRaw);
      mapped.set(id, {
        id,
        name: String(space?.name ?? `Espacio #${id}`),
        zoneId: Number.isFinite(zoneId as any) ? Number(zoneId) : null,
      });
    }
    return mapped;
  }, [spaces]);

  const sortTasks = (list: Task[]) => {
    list.sort((a, b) => {
      const aStart = a.startPlanned ? timeToMinutes(a.startPlanned) : 0;
      const bStart = b.startPlanned ? timeToMinutes(b.startPlanned) : 0;
      return aStart - bStart || a.id - b.id;
    });
  };

  const resourceTaskMap = useMemo(() => {
    const mapped = new Map<string, Task[]>();

    const zoneModeByZoneId = new Map<number, "zone" | "space">();
    for (const zm of zoneStaffModes ?? []) {
      const zoneId = Number(zm?.zoneId);
      if (!Number.isFinite(zoneId)) continue;
      zoneModeByZoneId.set(zoneId, zm?.mode === "space" ? "space" : "zone");
    }

    const zoneTasksMap = new Map<number, Task[]>();
    const spaceTasksMap = new Map<number, Task[]>();

    for (const task of filteredDailyTasksByStage ?? []) {
      const taskZoneIdRaw = task?.zoneId;
      const taskSpaceIdRaw = task?.spaceId;
      const taskZoneId = taskZoneIdRaw == null ? null : Number(taskZoneIdRaw);
      const taskSpaceId = taskSpaceIdRaw == null ? null : Number(taskSpaceIdRaw);

      if (Number.isFinite(taskSpaceId as any)) {
        const spaceId = Number(taskSpaceId);
        const spaceList = spaceTasksMap.get(spaceId) ?? [];
        spaceList.push(task);
        spaceTasksMap.set(spaceId, spaceList);

        const zoneFromSpace = spaceById.get(spaceId)?.zoneId;
        if (Number.isFinite(zoneFromSpace as any)) {
          const zoneList = zoneTasksMap.get(Number(zoneFromSpace)) ?? [];
          zoneList.push(task);
          zoneTasksMap.set(Number(zoneFromSpace), zoneList);
        }
      } else if (Number.isFinite(taskZoneId as any)) {
        const zoneId = Number(taskZoneId);
        const zoneList = zoneTasksMap.get(zoneId) ?? [];
        zoneList.push(task);
        zoneTasksMap.set(zoneId, zoneList);
      }

      const assignedRaw = task?.assignedResources ?? task?.assigned_resource_ids ?? [];
      const ids = Array.isArray(assignedRaw)
        ? assignedRaw.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
        : [];

      for (const id of ids) {
        const key = `resource_item:${id}`;
        const list = mapped.get(key) ?? [];
        list.push(task);
        mapped.set(key, list);
      }
    }

    for (const assignment of staffAssignments ?? []) {
      const role = assignment?.staffRole;
      const roleKind = role === "production" ? "production" : role === "editorial" ? "editorial" : null;
      if (!roleKind) continue;
      const personId = Number((assignment as any)?.staffPersonId);
      if (!Number.isFinite(personId) || personId <= 0) continue;

      const key = `${roleKind}:${personId}`;
      const bucket = mapped.get(key) ?? [];

      if (assignment.scopeType === "zone") {
        const zoneId = Number(assignment.zoneId);
        if (Number.isFinite(zoneId)) {
          bucket.push(...(zoneTasksMap.get(zoneId) ?? []));
        }
      } else if (assignment.scopeType === "space") {
        const spaceId = Number(assignment.spaceId);
        if (Number.isFinite(spaceId)) {
          bucket.push(...(spaceTasksMap.get(spaceId) ?? []));
        }
      }

      mapped.set(key, bucket);
    }

    for (const team of itinerantTeams ?? []) {
      const teamId = Number((team as any)?.id);
      if (!Number.isFinite(teamId) || teamId <= 0) continue;
      const key = `itinerant_team:${teamId}`;
      const bucket = mapped.get(key) ?? [];

      const teamAssignments = (staffAssignments ?? []).filter(
        (a) => a.scopeType === "itinerant_team" && Number((a as any)?.itinerantTeamId) === teamId,
      );

      for (const assignment of teamAssignments) {
        const zoneId = Number(assignment.zoneId);
        if (Number.isFinite(zoneId)) {
          const zoneMode = zoneModeByZoneId.get(zoneId) ?? "zone";
          if (zoneMode === "zone") {
            bucket.push(...(zoneTasksMap.get(zoneId) ?? []));
          } else {
            const spaceRows = (spaces ?? []).filter((s: any) => Number(s?.zoneId) === zoneId);
            for (const space of spaceRows) {
              const sid = Number(space?.id);
              if (!Number.isFinite(sid)) continue;
              bucket.push(...(spaceTasksMap.get(sid) ?? []));
            }
          }
        }

        const spaceId = Number(assignment.spaceId);
        if (Number.isFinite(spaceId)) {
          bucket.push(...(spaceTasksMap.get(spaceId) ?? []));
        }
      }

      mapped.set(key, bucket);
    }

    for (const [key, list] of mapped.entries()) {
      const dedup = new Map<number, Task>();
      for (const task of list) dedup.set(Number(task.id), task);
      const normalized = Array.from(dedup.values());
      sortTasks(normalized);
      mapped.set(key, normalized);
    }

    return mapped;
  }, [filteredDailyTasksByStage, staffAssignments, itinerantTeams, zoneStaffModes, spaces, spaceById]);

  const lanes = useMemo(() => {
    const grouped: Record<string, { name: string; tasks: Task[] }> = {};

    const zonesById = new Map<number, { id: number; name: string }>();
    for (const z of filteredZones as any[])
      zonesById.set(Number(z.id), { id: Number(z.id), name: String(z.name) });

    const spacesById = new Map<
      number,
      { id: number; name: string; zoneId: number | null }
    >();
    for (const s of filteredSpaces as any[]) {
      const sid = Number(s.id);
      const zid =
        s.zoneId === null || s.zoneId === undefined ? null : Number(s.zoneId);
      spacesById.set(sid, {
        id: sid,
        name: String(s.name),
        zoneId: Number.isFinite(zid as any) ? (zid as any) : null,
      });
    }

    const locationName = (task: Task) => {
      // Prefer space name; fallback to zone name; fallback to stored label; fallback to "Sin ubicación"
      if (task.spaceId) {
        const sp = spacesById.get(Number(task.spaceId));
        if (sp) {
          const zn = sp.zoneId ? zonesById.get(Number(sp.zoneId))?.name : null;
          return zn ? `${zn} · ${sp.name}` : sp.name;
        }
      }
      if (task.zoneId) {
        const zn = zonesById.get(Number(task.zoneId))?.name;
        if (zn) return zn;
      }
      if (task.locationLabel) return String(task.locationLabel);
      return "Sin ubicación";
    };

    if (viewMode === "spaces") {
      // Initialize lanes for all spaces (so the view is stable)
      for (const s of filteredSpaces as any[]) {
        grouped[`space-${s.id}`] = { name: String(s.name), tasks: [] };
      }
      // ✅ Equipos itinerantes (columnas lógicas dinámicas)
      (itinerantTeams ?? [])
        .filter((t: any) => !!(t?.isActive ?? t?.is_active ?? true))
        .slice()
        .sort((a: any, b: any) => {
          const ao = Number(a?.orderIndex ?? a?.order_index ?? 0);
          const bo = Number(b?.orderIndex ?? b?.order_index ?? 0);
          return ao - bo;
        })
        .forEach((t: any) => {
          const tid = Number(t?.id);
          if (!Number.isFinite(tid)) return;
          const name = String(t?.name ?? t?.code ?? `Equipo ${tid}`);
          grouped[`it-team-${tid}`] = { name, tasks: [] };
        });
      // Special lanes
      grouped["zone-only"] = { name: "Solo zona (sin espacio)", tasks: [] };
      grouped["unlocated"] = { name: "Sin ubicación", tasks: [] };

      (filteredDailyTasksByStage ?? []).forEach((task) => {
        if (task.spaceId) {
          const key = `space-${Number(task.spaceId)}`;
          if (!grouped[key]) {
            grouped[key] = { name: locationName(task), tasks: [] };
          }
          grouped[key].tasks.push(task);
          return;
        }

        if (task.zoneId || task.locationLabel) {
          grouped["zone-only"].tasks.push(task);
          return;
        }

        grouped["unlocated"].tasks.push(task);
      });

      // Sort tasks within lanes
      Object.values(grouped).forEach((lane) => {
        lane.tasks.sort((a, b) => {
          const aStart = a.startPlanned ? timeToMinutes(a.startPlanned) : 0;
          const bStart = b.startPlanned ? timeToMinutes(b.startPlanned) : 0;
          return aStart - bStart || a.id - b.id;
        });
      });

      // Keep lanes that have tasks, plus special lanes (to avoid empty wall)
      const entries = Object.entries(grouped).filter(([key, lane]) => {
        if (key.startsWith("it-team-")) return true;
        if (key === "zone-only" || key === "unlocated") return lane.tasks.length > 0;
        return lane.tasks.length > 0;
      });

      // Sort by name
      return entries.sort((a, b) => {
        const aKey = a[0];
        const bKey = b[0];
        const aIsIt = aKey.startsWith("it-team-");
        const bIsIt = bKey.startsWith("it-team-");
        if (aIsIt && !bIsIt) return -1;
        if (!aIsIt && bIsIt) return 1;
        return a[1].name.localeCompare(b[1].name);
      });
    }

    // Default: contestants
    contestants.forEach((c) => {
      grouped[String(c.id)] = { name: c.name, tasks: [] };
    });
    grouped["none"] = { name: "Sin concursante", tasks: [] };

    (filteredDailyTasksByStage ?? []).forEach((task) => {
      const key = task.contestantId ? String(task.contestantId) : "none";
      if (grouped[key]) {
        grouped[key].tasks.push(task);
      } else {
        if (!grouped[`extra-${task.contestantId}`]) {
          grouped[`extra-${task.contestantId}`] = {
            name: `Contestant #${task.contestantId}`,
            tasks: [],
          };
        }
        grouped[`extra-${task.contestantId}`].tasks.push(task);
      }
    });

    Object.values(grouped).forEach((lane) => {
      lane.tasks.sort((a, b) => {
        const aStart = a.startPlanned ? timeToMinutes(a.startPlanned) : 0;
        const bStart = b.startPlanned ? timeToMinutes(b.startPlanned) : 0;
        return aStart - bStart || a.id - b.id;
      });
    });

    return Object.entries(grouped)
      .filter(([key, lane]) => lane.tasks.length > 0 || key !== "none")
      .sort((a, b) => {
        if (a[0] === "none") return 1;
        if (b[0] === "none") return -1;
        return a[1].name.localeCompare(b[1].name);
      });
  }, [filteredDailyTasksByStage, contestants, viewMode, filteredZones, filteredSpaces]);

  if (!workStart || !workEnd) {
    return (
      <Card className="p-8 text-center bg-muted/50">
        <p className="text-muted-foreground">
          Falta configurar el horario de trabajo (Work Start/End).
        </p>
      </Card>
    );
  }

  const hasPlanning = (dailyTasks ?? []).some(
    (t) => t.startPlanned && t.endPlanned,
  );

  if (!hasPlanning && dailyTasks.length > 0) {
    return (
      <Card className="p-8 text-center bg-muted/50">
        <p className="text-muted-foreground">
          Aún no hay planificación. Pulsa "Generate Planning" para calcular los
          horarios.
        </p>
      </Card>
    );
  }

  if (dailyTasks.length === 0) {
    return (
      <Card className="p-8 text-center bg-muted/50">
        <p className="text-muted-foreground">No hay tareas creadas todavía.</p>
      </Card>
    );
  }

  const timeLabels = [];
  for (let m = startMin; m <= endMin; m += 60) {
    const hour = Math.floor(m / 60);
    timeLabels.push({
      min: m,
      label: `${hour.toString().padStart(2, "0")}:00`,
    });
  }

  // =========================
  // ✅ Vista vertical por plató y espacio (2 modos)
  // =========================
  if (viewMode === "spaces") {
    const mealName = String((plan as any)?.mealTaskTemplateName ?? "")
      .trim()
      .toLowerCase();

    const isMeal = (t: Task) => {
      const n = String(t?.template?.name ?? "")
        .trim()
        .toLowerCase();
      return mealName.length > 0 && n === mealName;
    };

    // Agrupar por zona -> espacio, orden cronológico
    const zonesById = new Map<number, string>();
    (filteredZones ?? []).forEach((z: any) =>
      zonesById.set(Number(z.id), String(z.name)),
    );

    const spacesByZone = new Map<number, { id: number; name: string }[]>();
    (filteredSpaces ?? []).forEach((s: any) => {
      const zid =
        s.zoneId === null || s.zoneId === undefined ? null : Number(s.zoneId);
      if (!Number.isFinite(zid as any)) return;
      if (!spacesByZone.get(zid as any)) spacesByZone.set(zid as any, []);
      spacesByZone
        .get(zid as any)!
        .push({ id: Number(s.id), name: String(s.name) });
    });
    for (const [zid, arr] of spacesByZone.entries()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
      spacesByZone.set(zid, arr);
    }

    // tasks filtradas:
    // - excluimos comida de concursante (no es un espacio)
    // - PERO mostramos comida “sin concursante” (bloque de plató/zona)
    const tasks = (filteredDailyTasksByStage ?? []).filter((t: any) => {
      if (!t?.startPlanned || !t?.endPlanned) return false;
      if (!isMeal(t)) return true;
      const cid = t?.contestantId ?? t?.contestant_id ?? null;
      return cid === null || cid === undefined; // ✅ solo comidas sin concursante
    });

    // helper: min->px (2px por minuto)
    const pxPerMin = 2;
    const totalHeightPx = Math.max(200, duration * pxPerMin);

    // construir lanes (por espacio real), y también "Solo zona" si procede
    const lanesForVertical: {
      key: string;
      title: string;
      zoneId: number | null;
      tasks: Task[];
    }[] = [];

    // espacios conocidos
    for (const [zid, list] of spacesByZone.entries()) {
      const zName = zonesById.get(zid) ?? `Zona #${zid}`;
      for (const sp of list) {
        lanesForVertical.push({
          key: `z${zid}-s${sp.id}`,
          title: `${zName} · ${sp.name}`,
          zoneId: zid,
          tasks: [],
        });
      }
    }

    // meter tasks en su lane
    const laneBySpaceId = new Map<number, number>(); // spaceId -> index
    lanesForVertical.forEach((ln, idx) => {
      const m = ln.key.match(/-s(\d+)$/);
      if (m) laneBySpaceId.set(Number(m[1]), idx);
    });

    const zoneOnly: { [zid: number]: Task[] } = {};
    const unlocated: Task[] = [];

    tasks.forEach((t) => {
      const sid = (t as any).spaceId ?? (t as any).space_id ?? null;
      const zid = (t as any).zoneId ?? (t as any).zone_id ?? null;

      if (sid !== null && sid !== undefined && Number.isFinite(Number(sid))) {
        const idx = laneBySpaceId.get(Number(sid));
        if (idx !== undefined) {
          lanesForVertical[idx].tasks.push(t);
          return;
        }
      }

      if (zid !== null && zid !== undefined && Number.isFinite(Number(zid))) {
        const nz = Number(zid);
        if (!zoneOnly[nz]) zoneOnly[nz] = [];
        zoneOnly[nz].push(t);
        return;
      }

      unlocated.push(t);
    });

    // añadir lanes de "solo zona" si hay tasks
    Object.entries(zoneOnly).forEach(([zidStr, arr]) => {
      const zid = Number(zidStr);
      const zName = zonesById.get(zid) ?? `Zona #${zid}`;
      lanesForVertical.push({
        key: `zone-only-${zid}`,
        title: `${zName} · (sin espacio)`,
        zoneId: zid,
        tasks: arr,
      });
    });

    if (unlocated.length > 0) {
      lanesForVertical.push({
        key: `unlocated`,
        title: `Sin ubicación`,
        zoneId: null,
        tasks: unlocated,
      });
    }

    // ordenar tasks dentro de cada lane
    lanesForVertical.forEach((ln) => {
      ln.tasks.sort((a, b) => {
        const aStart = a.startPlanned ? timeToMinutes(a.startPlanned) : 0;
        const bStart = b.startPlanned ? timeToMinutes(b.startPlanned) : 0;
        return aStart - bStart || a.id - b.id;
      });
    });

    // eliminar lanes vacías para no ver “pared de espacios”
    const lanesToShow = lanesForVertical.filter((ln) => ln.tasks.length > 0);

    return (
              <TooltipProvider>
                <div className="border rounded-xl bg-card shadow-sm">
                      <div className="h-[650px] w-full overflow-auto">
                        <div className="p-4 space-y-6" data-planning-zoom-target>
              {lanesToShow.length === 0 ? (
                <Card className="p-8 text-center bg-muted/50">
                  <p className="text-muted-foreground">
                    No hay tareas planificadas para mostrar en “Por plató y
                    espacio”.
                  </p>
                </Card>
              ) : (
                (() => {
                  // Construir estructura: plató -> columnas(espacios) -> tasks
                  type SpaceCol = {
                    id: number | null;
                    name: string;
                    tasks: Task[];
                  };
                  type ZoneCol = {
                    zoneId: number;
                    zoneName: string;
                    zoneColor?: string | null;
                    spaces: SpaceCol[];
                  };

                  const zonesById2 = new Map<number, string>();
                  (filteredZones ?? []).forEach((z: any) =>
                    zonesById2.set(Number(z.id), String(z.name)),
                  );

                  // Construir platós desde `zones` (no desde spacesByZone), para que NO desaparezcan platós
                  const zoneCols: ZoneCol[] = (filteredZones as any[]).map((z: any) => {
                    const zid = Number(z.id);
                    const zoneName = String(
                      z.name ?? zonesById2.get(zid) ?? `Zona #${zid}`,
                    );
                    const spList = (spacesByZone.get(zid) ?? []) as any[];
                    const zoneColor =
                      (z as any).uiColor ?? (z as any).ui_color ?? null;

                    return {
                      zoneId: zid,
                      zoneName,
                      zoneColor,
                      spaces: spList.map((sp: any) => ({
                        id: Number(sp.id),
                        name: String(sp.name),
                        tasks: [],
                      })),
                    };
                  });

                  // Índice rápido: spaceId -> { zoneId, colIndex }
                  const spaceIndex = new Map<
                    number,
                    { zoneId: number; idx: number }
                  >();
                  for (const zc of zoneCols) {
                    zc.spaces.forEach((sp, idx) => {
                      if (sp.id !== null)
                        spaceIndex.set(Number(sp.id), {
                          zoneId: zc.zoneId,
                          idx,
                        });
                    });
                  }

                  // Añadir columna "(sin espacio)" dentro del plató si hace falta
                  const zoneOnlyCols: Record<number, SpaceCol> = {};

                  // Columna global "Sin ubicación"
                  const unlocatedCol: SpaceCol = {
                    id: null,
                    name: "Sin ubicación",
                    tasks: [],
                  };

                  // Repartir tasks (ya filtradas y sin comida)
                  tasks.forEach((t) => {
                    const sid =
                      (t as any).spaceId ?? (t as any).space_id ?? null;
                    const zid = (t as any).zoneId ?? (t as any).zone_id ?? null;

                    if (
                      sid !== null &&
                      sid !== undefined &&
                      Number.isFinite(Number(sid))
                    ) {
                      const hit = spaceIndex.get(Number(sid));
                      if (hit) {
                        const zc = zoneCols.find(
                          (z) => z.zoneId === hit.zoneId,
                        );
                        if (zc) zc.spaces[hit.idx].tasks.push(t);
                        return;
                      }
                    }

                    if (
                      zid !== null &&
                      zid !== undefined &&
                      Number.isFinite(Number(zid))
                    ) {
                      const nz = Number(zid);
                      if (!zoneOnlyCols[nz])
                        zoneOnlyCols[nz] = {
                          id: null,
                          name: "(sin espacio)",
                          tasks: [],
                        };
                      zoneOnlyCols[nz].tasks.push(t);
                      return;
                    }

                    unlocatedCol.tasks.push(t);
                  });

                  // Insertar "(sin espacio)" al final de cada plató si hay tasks
                  zoneCols.forEach((zc) => {
                    const extra = zoneOnlyCols[zc.zoneId];
                    if (extra && extra.tasks.length > 0) zc.spaces.push(extra);
                  });

                  // Ordenar tasks por tiempo dentro de cada columna
                  const sortTasks = (arr: Task[]) =>
                    arr.sort((a, b) => {
                      const aStart = a.startPlanned
                        ? timeToMinutes(a.startPlanned)
                        : 0;
                      const bStart = b.startPlanned
                        ? timeToMinutes(b.startPlanned)
                        : 0;
                      return aStart - bStart || a.id - b.id;
                    });

                  zoneCols.forEach((zc) =>
                    zc.spaces.forEach((sp) => sortTasks(sp.tasks)),
                  );
                  sortTasks(unlocatedCol.tasks);

                  // Filtrar platós vacíos (no mostrar bloques sin tareas)
                  const zoneColsToShow = zoneCols
                    .map((zc) => ({
                      ...zc,
                      spaces: zc.spaces.filter((sp) => sp.tasks.length > 0),
                    }))
                    .filter((zc) => zc.spaces.length > 0);

                  const showUnlocated = unlocatedCol.tasks.length > 0;

                  // Render
                  return (
                    <div className="space-y-6">
                      {spaceVerticalMode === "timeline" ? (
                        // ✅ TIMELINE vertical: columna horas + bloques por plató con espacios en columnas
                        <div className="flex gap-4">
                          {/* columna horas (una sola vez) */}
                          <div className="w-16 text-[10px] text-muted-foreground pt-10">
                            {timeLabels.map((tl) => (
                              <div
                                key={tl.min}
                                className="relative"
                                style={{ height: 60 * pxPerMin }}
                              >
                                <div
                                  className="absolute left-0"
                                  style={{ top: 0 }}
                                >
                                  {tl.label}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* platós en horizontal */}
                          <div className="flex-1 overflow-x-auto">
                            <div className="flex gap-2 min-w-max pr-4">
                              {zoneColsToShow.map((zc) => (
                                <div key={zc.zoneId} className="shrink-0 w-max">
                                  <div
                                    className="font-semibold mb-2 px-2 py-1 rounded-md border"
                                    style={{
                                      backgroundColor: hexToRgba(zc.zoneColor, 0.22) ?? undefined,
                                      borderColor: zc.zoneColor ?? undefined,
                                      color: textColorForBg(zc.zoneColor),
                                    }}
                                  >
                                    <div className="leading-5">{zc.zoneName}</div>

                                    {/* Prod/Red del PLATÓ (scope zone) */}
                                    <div className="mt-1 space-y-0.5">
                                      {(() => {
                                        const getNames = (role: "production" | "editorial") =>
                                          (staffAssignments ?? [])
                                            .filter(
                                              (a) =>
                                                a.scopeType === "zone" &&
                                                Number(a.zoneId) === Number(zc.zoneId) &&
                                                a.staffRole === role,
                                            )
                                            .map((a) => a.staffPersonName)
                                            .filter(Boolean);

                                        const prod = getNames("production");
                                        const edit = getNames("editorial");

                                        return (
                                          <>
                                            <div className="text-[10px] opacity-80 truncate">
                                              <span className="font-semibold">Prod:</span>{" "}
                                              {prod.length ? prod.join(" · ") : "—"}
                                            </div>
                                            <div className="text-[10px] opacity-80 truncate">
                                              <span className="font-semibold">Red:</span>{" "}
                                              {edit.length ? edit.join(" · ") : "—"}
                                            </div>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </div>

                                  <div className="flex gap-2">
                                    {zc.spaces.map((sp) => (
                                      <div
                                        key={`${zc.zoneId}-${sp.name}`}
                                        className="w-[200px]"
                                      >
                                        <div
                                          className="text-xs font-medium mb-2 truncate px-2 py-1 rounded-md border"
                                          style={{
                                            backgroundColor: hexToRgba(zc.zoneColor, 0.12) ?? undefined,
                                            borderColor: zc.zoneColor ?? undefined,
                                            color: zc.zoneColor ? textColorForBg(zc.zoneColor) : undefined,
                                          }}
                                        >
                                          <div className="leading-4">{sp.name}</div>

                                          {/* Prod/Red según modo del plató: zone o space (sin herencia) */}
                                          <div className="mt-1 space-y-0.5">
                                            {(() => {
                                              const zoneMode =
                                                (zoneStaffModes ?? []).find(
                                                  (zm) => Number(zm.zoneId) === Number(zc.zoneId),
                                                )?.mode ?? "zone";

                                              const getNames = (role: "production" | "editorial") => {
                                                if (zoneMode === "zone") {
                                                  return (staffAssignments ?? [])
                                                    .filter(
                                                      (a) =>
                                                        a.scopeType === "zone" &&
                                                        Number(a.zoneId) === Number(zc.zoneId) &&
                                                        a.staffRole === role,
                                                    )
                                                    .map((a) => a.staffPersonName)
                                                    .filter(Boolean);
                                                }

                                                // mode === "space" (sin herencia)
                                                const spaceId = (filteredSpaces ?? []).find(
                                                  (s: any) =>
                                                    Number(s.zoneId) === Number(zc.zoneId) && String(s.name) === String(sp.name),
                                                )?.id;

                                                return (staffAssignments ?? [])
                                                  .filter(
                                                    (a) =>
                                                      a.scopeType === "space" &&
                                                      Number(a.spaceId) === Number(spaceId) &&
                                                      a.staffRole === role,
                                                  )
                                                  .map((a) => a.staffPersonName)
                                                  .filter(Boolean);
                                              };

                                              const prod = getNames("production");
                                              const edit = getNames("editorial");

                                              return (
                                                <>
                                                  <div className="text-[10px] opacity-75 truncate">
                                                    <span className="font-semibold">Prod:</span>{" "}
                                                    {prod.length ? prod.join(" · ") : "—"}
                                                  </div>
                                                  <div className="text-[10px] opacity-75 truncate">
                                                    <span className="font-semibold">Red:</span>{" "}
                                                    {edit.length ? edit.join(" · ") : "—"}
                                                  </div>
                                                </>
                                              );
                                            })()}
                                          </div>
                                        </div>

                                        <div
                                          className="relative border rounded-lg bg-muted/5 overflow-hidden"
                                          style={{ height: totalHeightPx }}
                                        >
                                          {/* líneas cada 5 min */}
                                          <div className="absolute inset-0 pointer-events-none">
                                            {Array.from({
                                              length:
                                                Math.floor(duration / 5) + 1,
                                            }).map((_, i) => {
                                              const m = i * 5;
                                              const isHour = m % 60 === 0;
                                              const isHalf = m % 30 === 0;
                                              return (
                                                <div
                                                  key={i}
                                                  className={cn(
                                                    "absolute left-0 right-0 border-t",
                                                    isHour
                                                      ? "border-border/60"
                                                      : isHalf
                                                        ? "border-border/25"
                                                        : "border-border/10",
                                                  )}
                                                  style={{ top: m * pxPerMin }}
                                                />
                                              );
                                            })}
                                          </div>

                                          {/* sombreado comida (referencia visual del día) */}
                                          {mealStartMin !== null &&
                                            mealEndMin !== null && (
                                              <div
                                                className="absolute left-0 right-0 bg-orange-100/30 dark:bg-orange-900/10 border-y border-orange-200/20"
                                                style={{
                                                  top:
                                                    (mealStartMin - startMin) *
                                                    pxPerMin,
                                                  height:
                                                    (mealEndMin -
                                                      mealStartMin) *
                                                    pxPerMin,
                                                }}
                                              />
                                            )}

                                          {sp.tasks.map((task) => {
                                            const tStart = task.startPlanned
                                              ? timeToMinutes(task.startPlanned)
                                              : startMin;
                                            const tEnd = task.endPlanned
                                              ? timeToMinutes(task.endPlanned)
                                              : tStart;
                                            const top =
                                              (tStart - startMin) * pxPerMin;
                                            const height = Math.max(
                                              18,
                                              (tEnd - tStart) * pxPerMin,
                                            );

                                            return (
                                              <TaskStatusMenuTrigger
                                                key={task.id}
                                                task={task}
                                                contestantName={
                                                  contestantNameById[
                                                    Number(task.contestantId)
                                                  ] ?? "—"
                                                }
                                                locationLabel={getTaskLocationLabel(task)}
                                                onTaskStatusChange={onTaskStatusChange}
                                                taskStatusPending={taskStatusPending}
                                                className={cn(
                                                  "absolute left-2 right-2 rounded-lg border shadow-sm px-2 py-1 cursor-pointer z-10",
                                                  task.status === "in_progress"
                                                    ? "ring-2 ring-green-500"
                                                    : "",
                                                  task.status === "done"
                                                    ? "opacity-80"
                                                    : "",
                                                )}
                                                style={{
                                                  top,
                                                  height,
                                                  backgroundColor:
                                                    taskBaseColor(task),
                                                  borderColor:
                                                    task.status === "in_progress"
                                                      ? "rgb(34 197 94)"
                                                      : taskBaseColor(task),
                                                }}
                                              >
                                                <div className="text-[12px] font-bold truncate">
                                                  {task.template?.name || "Tarea"}
                                                </div>
                                                <div className="text-[10px] opacity-70">
                                                  {task.startPlanned}-{task.endPlanned}
                                                </div>
                                              </TaskStatusMenuTrigger>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}

                              {showUnlocated ? (
                                <div className="min-w-[260px] shrink-0">
                                  <div className="font-semibold mb-2">
                                    Sin ubicación
                                  </div>
                                  <div className="w-[220px]">
                                    <div className="text-xs font-medium mb-2 truncate">
                                      Sin ubicación
                                    </div>
                                    <div
                                      className="relative border rounded-lg bg-muted/5 overflow-hidden"
                                      style={{ height: totalHeightPx }}
                                    >
                                      {clampedNowMin !== null ? (
                                        <div
                                          className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                                          style={{ top: `${(clampedNowMin - startMin) * pxPerMin}px` }}
                                        />
                                      ) : null}

                                      {unlocatedCol.tasks.map((task) => {
                                        const tStart = task.startPlanned
                                          ? timeToMinutes(task.startPlanned)
                                          : startMin;
                                        const tEnd = task.endPlanned
                                          ? timeToMinutes(task.endPlanned)
                                          : tStart;
                                        const top =
                                          (tStart - startMin) * pxPerMin;
                                        const height = Math.max(
                                          18,
                                          (tEnd - tStart) * pxPerMin,
                                        );

                                        return (
                                          <TaskStatusMenuTrigger
                                            key={task.id}
                                            task={task}
                                            contestantName={
                                              contestantNameById[
                                                Number(task.contestantId)
                                              ] ?? "—"
                                            }
                                            locationLabel={getTaskLocationLabel(task)}
                                            onTaskStatusChange={onTaskStatusChange}
                                            taskStatusPending={taskStatusPending}
                                            className={cn(
                                              "absolute left-2 right-2 rounded-lg border shadow-sm px-2 py-1 cursor-pointer z-10",
                                              task.status === "in_progress"
                                                ? "ring-2 ring-green-500"
                                                : "",
                                              isOverdueTask(task) ? "ring-2 ring-red-500/80" : "",
                                              isRunningLateTask(task) ? "border-red-500" : "",
                                            )}
                                            style={{
                                              top,
                                              height,
                                              backgroundColor:
                                                taskBaseColor(task),
                                              borderColor:
                                                task.status === "in_progress"
                                                  ? "rgb(34 197 94)"
                                                  : taskBaseColor(task),
                                            }}
                                          >
                                            <div className="text-[12px] font-bold truncate">
                                              {task.template?.name || "Tarea"}
                                            </div>
                                            <div className="text-[10px] opacity-70">
                                              {task.startPlanned}-
                                              {task.endPlanned}
                                            </div>
                                          </TaskStatusMenuTrigger>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : (
                        // ✅ LISTA: platós en horizontal, espacios como columnas, tareas sin huecos
                        <div className="overflow-x-auto">
                          <div className="flex gap-2 min-w-max pr-4">
                            {zoneColsToShow.map((zc) => (
                              <div key={zc.zoneId} className="shrink-0 w-max">
                                <div
                                  className="font-semibold mb-2 px-2 py-1 rounded-md border"
                                  style={{
                                    backgroundColor: hexToRgba(zc.zoneColor, 0.22) ?? undefined,
                                    borderColor: zc.zoneColor ?? undefined,
                                    color: textColorForBg(zc.zoneColor),
                                  }}
                                >
                                  <div className="leading-5">{zc.zoneName}</div>

                                  {/* Prod/Red del PLATÓ (scope zone) */}
                                  <div className="mt-1 space-y-0.5">
                                    {(() => {
                                      const getNames = (role: "production" | "editorial") =>
                                        (staffAssignments ?? [])
                                          .filter(
                                            (a) =>
                                              a.scopeType === "zone" &&
                                              Number(a.zoneId) === Number(zc.zoneId) &&
                                              a.staffRole === role,
                                          )
                                          .map((a) => a.staffPersonName)
                                          .filter(Boolean);

                                      const prod = getNames("production");
                                      const edit = getNames("editorial");

                                      return (
                                        <>
                                          <div className="text-[10px] opacity-80 truncate">
                                            <span className="font-semibold">Prod:</span>{" "}
                                            {prod.length ? prod.join(" · ") : "—"}
                                          </div>
                                          <div className="text-[10px] opacity-80 truncate">
                                            <span className="font-semibold">Red:</span>{" "}
                                            {edit.length ? edit.join(" · ") : "—"}
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  {zc.spaces.map((sp) => (
                                    <div
                                      key={`${zc.zoneId}-${sp.name}`}
                                      className="w-[200px]"
                                    >
                                      <div
                                        className="text-xs font-medium mb-2 truncate px-2 py-1 rounded-md border"
                                        style={{
                                          backgroundColor: hexToRgba(zc.zoneColor, 0.12) ?? undefined,
                                          borderColor: zc.zoneColor ?? undefined,
                                          color: zc.zoneColor ? textColorForBg(zc.zoneColor) : undefined,
                                        }}
                                      >
                                        <div className="leading-4">{sp.name}</div>

                                        {/* Prod/Red según modo del plató: zone o space (sin herencia) */}
                                        <div className="mt-1 space-y-0.5">
                                          {(() => {
                                            const zoneMode =
                                              (zoneStaffModes ?? []).find(
                                                (zm) => Number(zm.zoneId) === Number(zc.zoneId),
                                              )?.mode ?? "zone";

                                            const getNames = (role: "production" | "editorial") => {
                                              if (zoneMode === "zone") {
                                                return (staffAssignments ?? [])
                                                  .filter(
                                                    (a) =>
                                                      a.scopeType === "zone" &&
                                                      Number(a.zoneId) === Number(zc.zoneId) &&
                                                      a.staffRole === role,
                                                  )
                                                  .map((a) => a.staffPersonName)
                                                  .filter(Boolean);
                                              }

                                              // mode === "space" (sin herencia)
                                              const spaceId = (filteredSpaces ?? []).find(
                                                (s: any) =>
                                                  Number(s.zoneId) === Number(zc.zoneId) && String(s.name) === String(sp.name),
                                              )?.id;

                                              return (staffAssignments ?? [])
                                                .filter(
                                                  (a) =>
                                                    a.scopeType === "space" &&
                                                    Number(a.spaceId) === Number(spaceId) &&
                                                    a.staffRole === role,
                                                )
                                                .map((a) => a.staffPersonName)
                                                .filter(Boolean);
                                            };

                                            const prod = getNames("production");
                                            const edit = getNames("editorial");

                                            return (
                                              <>
                                                <div className="text-[10px] opacity-75 truncate">
                                                  <span className="font-semibold">Prod:</span>{" "}
                                                  {prod.length ? prod.join(" · ") : "—"}
                                                </div>
                                                <div className="text-[10px] opacity-75 truncate">
                                                  <span className="font-semibold">Red:</span>{" "}
                                                  {edit.length ? edit.join(" · ") : "—"}
                                                </div>
                                              </>
                                            );
                                          })()}
                                        </div>
                                      </div>

                                      <div className="space-y-2">
                                        {sp.tasks.map((task) => (
                                          <TaskStatusMenuTrigger
                                            key={task.id}
                                            task={task}
                                            contestantName={
                                              contestantNameById[
                                                Number(task.contestantId)
                                              ] ?? "—"
                                            }
                                            locationLabel={getTaskLocationLabel(task)}
                                            onTaskStatusChange={onTaskStatusChange}
                                            taskStatusPending={taskStatusPending}
                                            className={cn(
                                              "rounded-lg border shadow-sm px-3 py-2 cursor-pointer",
                                              task.status === "in_progress"
                                                ? "ring-2 ring-green-500"
                                                : "",
                                              isOverdueTask(task) ? "ring-2 ring-red-500/80" : "",
                                              isRunningLateTask(task) ? "border-red-500" : "",
                                              task.status === "done"
                                                ? "opacity-80"
                                                : "",
                                            )}
                                            style={{
                                              backgroundColor: taskBaseColor(task),
                                              borderColor:
                                                task.status === "in_progress"
                                                  ? "rgb(34 197 94)"
                                                  : taskBaseColor(task),
                                            }}
                                          >
                                                <div className="flex items-start justify-between gap-3">
                                                  <div className="min-w-0">
                                                    <div className="text-sm font-bold truncate">
                                                      {task.template?.name ||
                                                        "Tarea"}
                                                    </div>
                                                    <div className="text-xs opacity-70">
                                                      {task.startPlanned}-
                                                      {task.endPlanned}
                                                    </div>
                                                  </div>
                                                  <Badge
                                                    variant="outline"
                                                    className="text-[10px]"
                                                  >
                                                    {task.status}
                                                  </Badge>
                                                </div>
                                          </TaskStatusMenuTrigger>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}

                            {showUnlocated ? (
                              <div className="min-w-[260px]">
                                <div className="font-semibold mb-2">
                                  Sin ubicación
                                </div>
                                <div className="w-[280px] space-y-2">
                                  {unlocatedCol.tasks.map((task) => (
                                    <TaskStatusMenuTrigger
                                      key={task.id}
                                      task={task}
                                      contestantName={
                                        contestantNameById[
                                          Number(task.contestantId)
                                        ] ?? "—"
                                      }
                                      locationLabel={getTaskLocationLabel(task)}
                                      onTaskStatusChange={onTaskStatusChange}
                                      taskStatusPending={taskStatusPending}
                                      className={cn(
                                        "rounded-lg border shadow-sm px-3 py-2 cursor-pointer",
                                        task.status === "in_progress"
                                          ? "ring-2 ring-green-500"
                                          : "",
                                      )}
                                      style={{
                                        backgroundColor: taskBaseColor(task),
                                        borderColor:
                                          task.status === "in_progress"
                                            ? "rgb(34 197 94)"
                                            : taskBaseColor(task),
                                      }}
                                    >
                                      <div className="text-sm font-bold truncate">
                                        {task.template?.name || "Tarea"}
                                      </div>
                                      <div className="text-xs opacity-70">
                                        {task.startPlanned}-{task.endPlanned}
                                      </div>
                                    </TaskStatusMenuTrigger>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  if (viewMode === "resources") {
    if (selectedResourceKeys.length === 0) {
      return (
        <Card className="p-8 text-center bg-muted/50">
          <p className="text-muted-foreground">Selecciona recursos para ver sus tareas.</p>
        </Card>
      );
    }

    const kindLabel = (kind: ResourceSelectable["kind"]) => {
      if (kind === "production") return "Producción";
      if (kind === "editorial") return "Redacción";
      if (kind === "itinerant_team") return "Itinerante";
      return "Recurso";
    };

    const scopeText = (resourceKey: string, kind: ResourceSelectable["kind"]) => {
      if (kind === "resource_item") return null;

      if (kind === "itinerant_team") {
        const teamId = Number(resourceKey.split(":")[1]);
        const related = (staffAssignments ?? []).filter(
          (a) => a.scopeType === "itinerant_team" && Number((a as any)?.itinerantTeamId) === teamId,
        );
        if (related.length === 0) return "Sin ámbito asignado";
        return related
          .map((a) => {
            if (a.scopeType === "space" && Number.isFinite(Number(a.spaceId))) {
              const sp = spaceById.get(Number(a.spaceId));
              return sp ? `Espacio: ${sp.name}` : null;
            }
            if (Number.isFinite(Number(a.zoneId))) {
              const zone = zoneById.get(Number(a.zoneId));
              return zone ? `Plató: ${zone.name}` : null;
            }
            return null;
          })
          .filter(Boolean)
          .join(" · ");
      }

      const personId = Number(resourceKey.split(":")[1]);
      const related = (staffAssignments ?? []).filter(
        (a) => a.staffRole === kind && Number((a as any)?.staffPersonId) === personId,
      );
      if (related.length === 0) return "Sin ámbito asignado";
      return related
        .map((a) => {
          if (a.scopeType === "space" && Number.isFinite(Number(a.spaceId))) {
            const sp = spaceById.get(Number(a.spaceId));
            if (!sp) return null;
            const zone = sp.zoneId == null ? null : zoneById.get(Number(sp.zoneId));
            return zone ? `Espacio: ${zone.name} · ${sp.name}` : `Espacio: ${sp.name}`;
          }
          if (a.scopeType === "zone" && Number.isFinite(Number(a.zoneId))) {
            const zone = zoneById.get(Number(a.zoneId));
            return zone ? `Plató: ${zone.name}` : null;
          }
          if (a.scopeType === "itinerant_team" && Number.isFinite(Number((a as any)?.itinerantTeamId))) {
            const tId = Number((a as any).itinerantTeamId);
            const team = (itinerantTeams ?? []).find((t: any) => Number(t?.id) === tId);
            return `Equipo itinerante: ${String(team?.name ?? team?.code ?? `#${tId}`)}`;
          }
          return null;
        })
        .filter(Boolean)
        .join(" · ");
    };

    return (
      <TooltipProvider>
        <div className="border rounded-xl bg-card shadow-sm">
          <ScrollArea className="h-[600px] w-full">
            <div className="p-4 space-y-4" data-planning-zoom-target>
              {selectedResourceKeys.map((resourceKey) => {
                const option = resourceSelectableById.get(resourceKey);
                const resourceName = option?.label ?? resourceKey;
                const tasksForResource = resourceTaskMap.get(resourceKey) ?? [];

                return (
                  <Card key={resourceKey} className="p-4">
                    <div className="mb-3 border-b pb-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{resourceName}</h3>
                        <Badge variant="outline" className="text-[10px]">{kindLabel(option?.kind ?? "resource_item")}</Badge>
                      </div>
                      {option ? (
                        <p className="text-xs text-muted-foreground">{scopeText(resourceKey, option.kind) || "Sin ámbito asignado"}</p>
                      ) : null}
                    </div>

                    {tasksForResource.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin tareas asociadas.</p>
                    ) : (
                      <div className="space-y-2">
                        {tasksForResource.map((task) => (
                          <TaskStatusMenuTrigger
                            key={`${resourceKey}-${task.id}`}
                            task={task}
                            contestantName={
                              contestantNameById[Number(task.contestantId)] ?? "—"
                            }
                            locationLabel={getTaskLocationLabel(task)}
                            onTaskStatusChange={onTaskStatusChange}
                            taskStatusPending={taskStatusPending}
                            className={cn(
                              "w-full rounded-lg border shadow-sm px-3 py-2 cursor-pointer",
                              task.status === "in_progress" ? "ring-2 ring-green-500" : "",
                              task.status === "done" ? "opacity-80" : "",
                            )}
                            style={{
                              backgroundColor: taskBaseColor(task),
                              borderColor:
                                task.status === "in_progress"
                                  ? "rgb(34 197 94)"
                                  : taskBaseColor(task),
                              color: taskTextColor(task),
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-bold truncate">
                                  {task.template?.name || "Tarea"}
                                </div>
                                <div className="text-xs opacity-70">
                                  {task.startPlanned ?? "—"}-{task.endPlanned ?? "—"}
                                </div>
                                <div className="text-xs opacity-70 truncate">
                                  {getTaskLocationLabel(task)} · {contestantNameById[Number(task.contestantId)] ?? "Sin concursante"}
                                </div>
                              </div>
                              <Badge variant="outline" className="text-[10px]">
                                {task.status}
                              </Badge>
                            </div>
                          </TaskStatusMenuTrigger>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="border rounded-xl bg-card shadow-sm">
        <ScrollArea className="h-[600px] w-full">
          <div className="overflow-x-auto">
            <div className="min-w-[800px] relative pb-4" data-planning-zoom-target>
              {/* Timeline Header */}
              <div className="flex border-b sticky top-0 bg-card z-20">
                <div className="w-48 p-3 border-r font-semibold text-sm bg-muted/30 planning-density-row">
                  Recurso
                </div>
                <div className="flex-1 relative h-10">
                  {timeLabels.map((tl) => (
                    <div
                      key={tl.min}
                      className="absolute top-0 bottom-0 border-l text-[10px] text-muted-foreground pl-1 pt-2"
                      style={{
                        left: `${((tl.min - startMin) / duration) * 100}%`,
                      }}
                    >
                      {tl.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Lanes */}
              {lanes.map(([id, lane]) => (
                <div
                  key={id}
                  className={cn("flex border-b group hover:bg-muted/5 transition-colors", viewMode === "contestants" ? "min-h-0" : "")}
                >
                  <div className={cn("w-48 border-r bg-muted/10 planning-density-row", viewMode === "contestants" ? "p-1.5" : "p-3")}>
                    <div className="font-medium text-sm leading-5 truncate">{lane.name}</div>

                    {(() => {
                  // Determine scope for this lane
                  const itMatch = String(id).match(/^it-team-(\d+)$/);
                  const itinerantTeamId = itMatch ? Number(itMatch[1]) : null;
                  const isItinerant = Number.isFinite(itinerantTeamId as any);

                  const getNames = (role: "production" | "editorial") => {
                    // Itinerant team lanes
                    if (isItinerant && itinerantTeamId !== null) {
                      return (staffAssignments ?? [])
                        .filter(a =>
                          a.scopeType === "itinerant_team" &&
                          Number((a as any).itinerantTeamId) === Number(itinerantTeamId) &&
                          a.staffRole === role
                        )
                        .map(a => a.staffPersonName)
                        .filter(Boolean);
                    }

                    // Space lanes (space-123)
                    const m = String(id).match(/^space-(\d+)$/);
                    if (!m) return [];

                    const spaceId = Number(m[1]);
                    const sp = (spaces ?? []).find(s => Number(s.id) === spaceId);
                    const zoneId = sp?.zoneId ?? null;

                    const zoneMode =
                      (zoneStaffModes ?? []).find(zm => Number(zm.zoneId) === Number(zoneId))?.mode ?? "zone";

                    if (zoneMode === "zone") {
                      return (staffAssignments ?? [])
                        .filter(a => a.scopeType === "zone" && Number(a.zoneId) === Number(zoneId) && a.staffRole === role)
                        .map(a => a.staffPersonName)
                        .filter(Boolean);
                    }

                    // mode === "space" (sin herencia)
                    return (staffAssignments ?? [])
                      .filter(a => a.scopeType === "space" && Number(a.spaceId) === Number(spaceId) && a.staffRole === role)
                      .map(a => a.staffPersonName)
                      .filter(Boolean);
                  };

                  const prod = getNames("production");
                  const edit = getNames("editorial");

                  const prodText = prod.length ? prod.join(" · ") : "—";
                  const editText = edit.length ? edit.join(" · ") : "—";

                  // Only show block for space + itinerant lanes (avoid noise on special lanes)
                  const show =
                    String(id).startsWith("space-") || isItinerant;

                      if (!show) return null;

                      return (
                        <div className="mt-1 space-y-0.5">
                          <div className="text-[10px] text-muted-foreground truncate">
                            <span className="font-semibold">Prod:</span> {prodText}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            <span className="font-semibold">Red:</span> {editText}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className={cn("flex-1 relative", viewMode === "contestants" ? "h-12" : "h-20")}>
                    {/* Grid 5 min (like PDF) */}
                    <div className="absolute inset-0 pointer-events-none z-0">
                      {Array.from({ length: Math.floor(duration / 5) + 1 }).map(
                        (_, i) => {
                          const m = i * 5;
                          const isHour = m % 60 === 0;
                          const isHalf = m % 30 === 0;

                          return (
                            <div
                              key={i}
                              className={cn(
                                "absolute top-0 bottom-0 border-l",
                                isHour
                                  ? "border-border/60"
                                  : isHalf
                                    ? "border-border/25"
                                    : "border-border/10",
                              )}
                              style={{ left: `${(m / duration) * 100}%` }}
                            />
                          );
                        },
                      )}
                    </div>

                    {/* Meal shading */}
                    {mealStartMin !== null && mealEndMin !== null && (
                      <div
                        className="absolute top-0 bottom-0 bg-orange-100/30 dark:bg-orange-900/10 z-0 border-x border-orange-200/20"
                        style={{
                          left: `${((mealStartMin - startMin) / duration) * 100}%`,
                          width: `${((mealEndMin - mealStartMin) / duration) * 100}%`,
                        }}
                      />
                    )}

                    {clampedNowMin !== null ? (
                      <div
                        className="absolute top-0 bottom-0 border-l-2 border-red-500 z-20 pointer-events-none"
                        style={{ left: `${((clampedNowMin - startMin) / duration) * 100}%` }}
                      />
                    ) : null}

                    {/* Tasks */}
                    {lane.tasks.map((task) => {
                      if (!task.startPlanned || !task.endPlanned) return null;
                      const tStart = timeToMinutes(task.startPlanned);
                      const tEnd = timeToMinutes(task.endPlanned);
                      const tDur = tEnd - tStart;

                      return (
                        <Tooltip key={task.id}>
                          <TaskStatusMenuTrigger
                            task={task}
                            contestantName={
                              contestantNameById[Number(task.contestantId)] ?? "—"
                            }
                            locationLabel={getTaskLocationLabel(task)}
                            onTaskStatusChange={onTaskStatusChange}
                            taskStatusPending={taskStatusPending}
                            className={cn(
                              "absolute border shadow-sm flex flex-col justify-center px-2 overflow-hidden cursor-pointer transition-all hover:scale-[1.02] z-10",
                              viewMode === "contestants" ? "top-0.5 h-11 rounded-md" : "top-4 h-12 rounded-lg",
                              task.status === "in_progress"
                                ? "ring-2 ring-green-500"
                                : "",
                              task.status === "done" ? "opacity-80" : "",
                              isOverdueTask(task) ? "ring-2 ring-red-500/80" : "",
                              isRunningLateTask(task) ? "border-red-500" : "",
                            )}
                            style={{
                              left: `${((tStart - startMin) / duration) * 100}%`,
                              width: `${(tDur / duration) * 100}%`,

                              backgroundColor: taskBaseColor(task),
                              borderColor:
                                task.status === "in_progress"
                                  ? "rgb(34 197 94)"
                                  : taskBaseColor(task),
                              color: taskTextColor(task),
                            }}
                          >
                            <span className="text-xs font-bold truncate">
                              {task.template?.name || "Tarea"}
                            </span>
                            <span className="text-[10px] opacity-70">
                              {task.startPlanned}-{task.endPlanned}
                            </span>
                          </TaskStatusMenuTrigger>
                          <TooltipContent>
                            <div className="space-y-1 p-1">
                              <p className="font-bold">
                                {task.template?.name || "Tarea"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Ubicación: {getTaskLocationLabel(task)}
                              </p>
                              {/* ✅ Recursos asignados por el planificador (motor) */}
                              {(() => {
                                const assignedRaw =
                                  (task as any)?.assignedResources ??
                                  (task as any)?.assigned_resource_ids ??
                                  null;

                                const assigned = Array.isArray(assignedRaw)
                                  ? (assignedRaw as any[])
                                  : [];

                                const assignedIds = assigned
                                  .map((id) => Number(id))
                                  .filter((n) => Number.isFinite(n) && n > 0);

                                const names = assignedIds
                                  .map(
                                    (id) =>
                                      planResourceItemNameById[Number(id)],
                                  )
                                  .filter(Boolean);

                                const planificadorText =
                                  names.length > 0
                                    ? names.join(" · ")
                                    : assignedIds.length > 0
                                      ? `IDs: ${assignedIds.join(", ")}`
                                      : "—";

                                // Fallback informativo: recursos del plató (zona) (NO es lo asignado por el motor)
                                const zidRaw = (task as any)?.zoneId;
                                const zid = Number(zidRaw);
                                const priIds =
                                  Number.isFinite(zid) && zid > 0
                                    ? (zoneResourceAssignments[zid] ?? [])
                                    : [];

                                const zoneNames = (priIds ?? [])
                                  .map(
                                    (id) =>
                                      planResourceItemNameById[Number(id)],
                                  )
                                  .filter(Boolean);

                                return (
                                  <>
                                    <p className="text-xs text-muted-foreground">
                                      Recursos (planificador):{" "}
                                      {planificadorText}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Recursos (plató):{" "}
                                      {zoneNames.length
                                        ? zoneNames.join(" · ")
                                        : "—"}
                                    </p>
                                  </>
                                );
                              })()}
                              <div className="flex items-center gap-2 mt-2">
                                <Badge
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  {task.status}
                                </Badge>
                                {isOverdueTask(task) ? (
                                  <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
                                ) : null}
                                {isRunningLateTask(task) ? (
                                  <Badge variant="destructive" className="text-[10px]">Running late</Badge>
                                ) : null}
                                {task.camerasOverride && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    🎥 {task.camerasOverride}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[10px] mt-1 font-mono">
                                Planned: {task.startPlanned} - {task.endPlanned}
                              </p>
                              {(task.startReal || task.endReal) && (
                                <p className="text-[10px] font-mono">
                                  Real: {task.startReal || "—"} -{" "}
                                  {task.endReal || "—"}
                                </p>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
