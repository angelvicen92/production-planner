import { DayCollapsibleSection } from "@/components/day-workspace/day-collapsible-section";
import { useDaySection } from "@/hooks/use-day-section";
import { usePlanRealtime } from "@/hooks/use-plan-realtime";
import { useExecutionContext } from "@/hooks/use-execution-context";
import { executionClockCurrent, executionNextStates } from "@shared/execution";
import { ContestantIdentity } from "@/components/day-workspace/contestant-identity";
import { ContestantDayRoster, UnassignedDayTasks } from "@/components/day-workspace/contestant-day-roster";
import { DayHeader, DayTabNavigation, useDayTabNavigation } from "@/components/day-workspace/day-workspace-shell";
import { DayExecutionWorkspace } from "@/components/day-workspace/day-execution-workspace";
import { useUserRole } from "@/hooks/use-user-role";
import { PlanStaffRolesTab } from '@/components/day-workspace/day-staff-workspace';
import { PlanResourcesTab } from '@/components/day-workspace/day-resources-workspace';
import { V4StrategicDiagnosis } from '@/components/day-workspace/legacy-planning-diagnosis';
import { Layout } from "@/components/layout";
import { QueryGuard } from "@/components/QueryGuard";
import { useGeneratePlan, usePlan, useUpdatePlan } from "@/hooks/use-plans";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { useParams, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlanningTimeline } from "@/components/planning-timeline";
import { FullscreenPlanningPanel } from "@/components/planning/fullscreen-planning-panel";
import { AssistedPlanningWorkspace } from "@/components/planning/assisted-planning-workspace";
import { PlanningWarningsPanel } from "@/components/planning-warnings-panel";
import { PlanEngineDiagnostics } from "@/components/plan-engine-diagnostics";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Video,
  Play,
  Loader2,
  AlertTriangle,
  AlertCircle,
  LayoutList,
  GanttChartSquare,
  Users,
  Check,
  ChevronsUpDown,
  Lock,
  Pause,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest } from "@/lib/api";
import { patchManualBlock } from "@/lib/api-hooks";
import { planQueryKey } from "@/lib/plan-query-keys";
import { engineDiagnosticsQueryKey, engineResultQueryKey } from "@/hooks/use-engine-diagnostics";
import { countRenderedPlanningTasks, derivePlanningReadinessExpectation, evaluatePlanningReadyGate } from "@/lib/planning-ready-gate";
import {
  hasActivePlanningContext,
  isAbortLikeError,
  markPlanningReconnectContext,
  persistActivePlanningRunId,
  persistCancelledPlanningRunId,
  readActivePlanningRunId,
  readCancelledPlanningRunId,
  shouldShowFinalPlanLoadError,
} from "@/lib/planning-recovery";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useContestants,
  useCreateContestant,
  useCreateDailyTask,
  useUpdateContestant,
  useDeleteContestant,
  useUpdateTaskStatus,
  useResetTask,
  useTaskTemplates,
} from "@/hooks/use-tasks";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useZones, useSpaces } from "@/hooks/use-spaces";
import { useStaffPeople } from "@/hooks/use-staff";
import { useItinerantTeams } from "@/hooks/use-itinerant-teams";
import {
  usePlanZoneStaffModes,
  useSavePlanZoneStaffModes,
  usePlanStaffAssignments,
  useSavePlanStaffAssignments,
  type ZoneStaffMode,
  type StaffRoleType,
  type StaffScopeType,
} from "@/hooks/use-plan-staff";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ColorSwatchPicker, normalizeHexColor } from "@/components/color-swatch-picker";
import {
  ContestantDailyTaskEditor,
  type DraftTask,
} from "@/components/contestant-daily-task-editor";
import { useElapsedSince } from "@/hooks/use-elapsed-since";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { estimatedPlanningProgress, planningPhaseSteps } from "@shared/planning-progress";
import { usePlanningRun } from "@/hooks/use-planning-run";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { getPlanningRunUiState } from "@shared/planning-run-state";
import { DayConfiguration } from "@/components/effective-configuration";

function getRunProgress(args: {
  plannedCount: number;
  totalPending: number;
  status?: string | null;
  phaseProgressPct?: number | null;
  phase?: string | null;
  phaseStartedAt?: string | null;
}) {
  const countPct = args.totalPending > 0
    ? Math.floor((args.plannedCount / args.totalPending) * 100)
    : 0;
  const phasePct = estimatedPlanningProgress({
    phase: args.phase,
    persistedPercent: args.phaseProgressPct,
    status: args.status,
    phaseStartedAt: args.phaseStartedAt,
  });
  const pct = Math.max(countPct, phasePct);

  return {
    plannedCount: args.plannedCount,
    totalCount: args.totalPending,
    percentage: args.status === "running" ? Math.min(99, pct) : Math.min(100, pct),
  };
}

const PLANNING_PHASE_LABELS: Record<string, string> = {
  queued: "En cola",
  loading_input: "Cargando datos",
  phase_a_base_solution: "Construyendo solución base",
  hard_validation: "Validando restricciones",
  backtracking: "Explorando alternativas",
  operational_neighborhoods: "Mejorando calidad operativa",
  segment_solver: "Resolviendo segmento crítico",
  coach_compaction: "Compactando jornadas de coaches",
  coach_wave_ordering: "Ordenando olas de coaches",
  pipeline_builder: "Construyendo pipelines",
  pipeline_repair: "Reparando pipelines",
  lane_only_repair: "Reparando carriles exclusivos",
  meal_scheduling: "Programando comidas",
  scoring_candidates: "Comparando candidatos",
  persisting_result: "Guardando resultado",
  success: "Completado",
};


type ResourceSelectable = {
  id: string | number;
  label: string;
  kind: "resource_item" | "production" | "editorial" | "itinerant_team";
  meta?: { typeName?: string; color?: string };
};

export default function PlanDetailsPage() {
  const params = useParams();
  const id = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const {role} = useUserRole();
  const canEditDay = role === "admin" || role === "production";
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [resourceVersion, setResourceVersion] = useState(0);

  // Single source of truth for Planning UI: every task/day refresh comes from this plan bundle query.
  const {
    data: plan,
    isLoading: planLoading,
    error: planQueryError,
    refetch: refetchPlan,
  } = usePlan(id);

  const hasRecoverablePlanningContext = typeof window !== "undefined" && hasActivePlanningContext(id, window.localStorage);
  const planError = planQueryError && shouldShowFinalPlanLoadError(planQueryError, hasRecoverablePlanningContext)
    ? ((planQueryError as any)?.message ?? "No se pudo cargar el plan.")
    : null;
  const planReconnecting = Boolean(planQueryError) && !planError;

  const generatePlan = useGeneratePlan();
  const planningRunQ = usePlanningRun(id);
  const [selectedPlanningEngine, setSelectedPlanningEngine] = useState<"v3" | "v4">("v3");
  const [v4ResultState, setV4ResultState] = useState<"idle" | "loading" | "pending_diagnostics" | "success" | "error">("idle");
  const v4ResultQ = useQuery({
    queryKey: engineResultQueryKey(id, "v4"),
    queryFn: () => apiRequest("GET", buildUrl(api.planningRuns.latestEngineResult.path, { id, engineVersion: "v4" })),
    enabled: showMaintenance && role === "admin" && Number.isFinite(id) && id > 0,
    retry: false,
    refetchInterval: v4ResultState === "loading" || v4ResultState === "pending_diagnostics" ? 1500 : false,
  });

  const updatePlan = useUpdatePlan();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const queryClient = useQueryClient();

  const { data: contestants = [] } = useContestants(id);
  const { data: zones = [], isLoading: zonesLoading } = useZones();
  const { data: staffPeople = [] } = useStaffPeople();
  const { data: planZoneStaffModes = [] } = usePlanZoneStaffModes(id);
  const { data: planStaffAssignments = [] } = usePlanStaffAssignments(id);
  const { data: itinerantTeams = [] } = useItinerantTeams();
  const { data: spaces = [], isLoading: spacesLoading } = useSpaces();
  const { data: taskTemplates = [] } = useTaskTemplates();
  const { data: programSettings } = useQuery({
    queryKey: [api.programSettings.get.path],
    queryFn: () => apiRequest("GET", api.programSettings.get.path),
  });

  const assistedDayPlan = useMemo(() => plan ? ({ ...plan, arrivalTaskTemplateName: (programSettings as any)?.arrivalTaskTemplateName ?? null }) : plan, [plan, programSettings]);

  const parseHHMMToMinutes = (v: string) => {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const m = s.match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23) return null;
    if (mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  };

  const minutesToHHMM = (minutes: number) => {
    const normalized = ((minutes % 1440) + 1440) % 1440;
    const hh = Math.floor(normalized / 60);
    const mm = normalized % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  const zonesById = new Map<number, any>();
  for (const z of zones as any[]) zonesById.set(Number(z.id), z);

  const spacesByZone = new Map<number, any[]>();
  for (const s of spaces as any[]) {
    const zoneId = Number(s.zoneId ?? s.zone_id);
    if (!Number.isFinite(zoneId)) continue;
    const list = spacesByZone.get(zoneId) ?? [];
    list.push(s);
    spacesByZone.set(zoneId, list);
  }

  // ✅ Para mostrar nombres en errores de inviabilidad (en vez de IDs)
  const taskNameById = new Map<number, string>();
  for (const t of (plan?.dailyTasks ?? []) as any[]) {
    const tid = Number(t?.id);
    if (!Number.isFinite(tid) || tid <= 0) continue;
    const name = String(
      t?.template?.name ??
        t?.name ??
        t?.templateName ??
        t?.taskTemplateName ??
        `Tarea ${tid}`,
    ).trim();
    taskNameById.set(tid, name || `Tarea ${tid}`);
  }

  const contestantNameById = new Map<number, string>();
  for (const c of contestants as any[]) {
    const cid = Number(c?.id);
    if (!Number.isFinite(cid) || cid <= 0) continue;
    contestantNameById.set(cid, String(c?.name ?? `Concursante ${cid}`).trim());
  }

  const templateNameById = new Map<number, string>();
  for (const tt of taskTemplates as any[]) {
    const tid = Number(tt?.id);
    if (!Number.isFinite(tid) || tid <= 0) continue;
    templateNameById.set(tid, String(tt?.name ?? `Template ${tid}`).trim());
  }

  const formatInfeasibleReason = (reason: any) => {
    // ✅ Caso especial: prerequisitos (para no enseñar IDs)
    if (reason?.code === "DEPENDENCY_MISSING") {
      const missingTemplateId = Number(reason?.missingTemplateId);
      const contestantId = Number(reason?.contestantId);
      const taskId = Number(reason?.taskId);

      const missingName =
        (Number.isFinite(missingTemplateId) &&
          templateNameById.get(missingTemplateId)) ||
        (Number.isFinite(missingTemplateId)
          ? `Prerequisito #${missingTemplateId}`
          : "Prerequisito");

      const who =
        (Number.isFinite(contestantId) &&
          contestantNameById.get(contestantId)) ||
        (Number.isFinite(contestantId)
          ? `Concursante #${contestantId}`
          : "Concursante");

      const blockedTaskName =
        (Number.isFinite(taskId) && taskNameById.get(taskId)) ||
        (Number.isFinite(taskId) ? `Tarea #${taskId}` : null);

      return blockedTaskName
        ? `Falta prerequisito "${missingName}" para ${who}. Es necesario antes de "${blockedTaskName}".`
        : `Falta prerequisito "${missingName}" para ${who}.`;
    }

    const raw = reason?.message ? String(reason.message) : String(reason);

    // 1) Reemplaza "tarea 123" por nombre
    let replaced = raw.replace(/tarea\s+(\d+)/gi, (_m, idStr) => {
      const tid = Number(idStr);
      const nm = taskNameById.get(tid);
      return nm ? `tarea "${nm}"` : `tarea ${idStr}`;
    });

    // 2) Reemplaza "template 45" / "prerequisito 45" si aparece en textos
    replaced = replaced.replace(
      /(template|prerequisito)\s+#?\s*(\d+)/gi,
      (_m, label, idStr) => {
        const id = Number(idStr);
        const nm = templateNameById.get(id);
        return nm ? `${label} "${nm}"` : `${label} ${idStr}`;
      },
    );

    // 3) Si viene taskId, añadimos el nombre al final si no está ya incluido
    const tid = Number(reason?.taskId);
    const nm = Number.isFinite(tid) ? taskNameById.get(tid) : null;
    if (nm && !replaced.toLowerCase().includes(nm.toLowerCase())) {
      return `${replaced} (Tarea: "${nm}")`;
    }

    return replaced;
  };

  const createContestant = useCreateContestant(id);
  const createDailyTask = useCreateDailyTask();
  const updateContestant = useUpdateContestant(id);
  const deleteContestant = useDeleteContestant(id);
  const updateTaskStatus = useUpdateTaskStatus();
  const executionSync = usePlanRealtime({planId:id});
  const executionQ = useExecutionContext(id, executionSync.online ? (executionSync.realtimeConnected ? 30000 : 5000) : false);
  useEffect(() => {
    if (!id || executionSync.realtimeConnected || !executionSync.online) return;
    const timer=window.setInterval(()=>queryClient.invalidateQueries({queryKey:[buildUrl(api.plans.get.path,{id})]}),5000);
    return()=>window.clearInterval(timer);
  },[id,queryClient,executionSync.realtimeConnected,executionSync.online]);
  const executionPermissionIdentity = JSON.stringify([executionQ.error ? "unavailable" : "ready",executionQ.data?.clock.mode,executionQ.data?.clock.revision,executionQ.data?.tasks]);
  const canChangeExecution = useCallback((task: any) => Boolean(executionSync.online && !executionQ.error && executionQ.data?.tasks.find(t => t.taskId === Number(task.id))?.hasAuthority && executionClockCurrent(task, executionQ.data.clock)), [executionSync.online,executionPermissionIdentity]);
  const canOperateTask = useCallback((task: any) => canChangeExecution(task) && ((task.status ?? 'pending') !== 'pending' || executionQ.data?.planningReady === true), [canChangeExecution,executionQ.data?.planningReady]);
  const canResetExecution = ['admin', 'production'].includes(executionQ.data?.role ?? '');
  const allowedExecutionStates = (task: any) => (executionNextStates[task.status] ?? []).filter(next => next !== 'in_progress' || task.status !== 'pending' || executionQ.data?.planningReady === true);
  const resetTask = useResetTask();

  const [newName, setNewName] = useState("");
  const [newInstrument, setNewInstrument] = useState(false);
  const [newInstrumentName, setNewInstrumentName] = useState("");
  const [newAvailabilityEnabled, setNewAvailabilityEnabled] = useState(false);
  const [newAvailabilityStart, setNewAvailabilityStart] = useState("");
  const [newAvailabilityEnd, setNewAvailabilityEnd] = useState("");
  const [refreshingTasksFromTemplates, setRefreshingTasksFromTemplates] = useState(false);
  const [showInfeasibleDetails, setShowInfeasibleDetails] = useState(false);
  const [selectedContestant, setSelectedContestant] = useState<any | null>(
    null,
  );

  const [editSongLocal, setEditSongLocal] = useState("");
  const [editNotesLocal, setEditNotesLocal] = useState("");
  const [editAvailStartLocal, setEditAvailStartLocal] = useState("");
  const [editAvailEndLocal, setEditAvailEndLocal] = useState("");
  const [editInstrumentLocal, setEditInstrumentLocal] = useState(false);
  const [editInstrumentNameLocal, setEditInstrumentNameLocal] = useState("");
  const [editCoachLocal, setEditCoachLocal] = useState<string>("none");

  useEffect(() => {
    if (!selectedContestant?.id) return;

    setEditSongLocal(String(selectedContestant?.song ?? ""));

    const v = selectedContestant?.vocalCoachPlanResourceItemId;
    setEditCoachLocal(v ? String(v) : "none");

    setEditNotesLocal(String(selectedContestant?.notes ?? ""));

    // Si no hay override, vendrá del backend (default al crear)
    setEditAvailStartLocal(String(selectedContestant?.availabilityStart ?? ""));
    setEditAvailEndLocal(String(selectedContestant?.availabilityEnd ?? ""));

    setEditInstrumentLocal(!!selectedContestant?.instrument);
    setEditInstrumentNameLocal(
      String(selectedContestant?.instrumentName ?? ""),
    );
  }, [selectedContestant?.id]);

  const [newSong, setNewSong] = useState("");
  const [newCoachPriId, setNewCoachPriId] = useState<string>("none");

  const [showAdminTasks, setShowAdminTasks] = useDaySection(id, "task-administration");
  const [contestantsOpen, setContestantsOpen] = useDaySection(id, "task-contestants");
  const [planningMode, setPlanningMode] = useState<"assisted" | "legacy">("assisted");
  const [timelineView, setTimelineView] = useState<"contestants" | "spaces" | "resources">(
    "contestants",
  );
  const [spaceVerticalMode, setSpaceVerticalMode] = useState<
    "timeline" | "list"
  >("timeline");
  const [stageFilterIds, setStageFilterIds] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("timeline.stageFilterIds");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
        : [];
    } catch {
      return [];
    }
  });
  const [resourceFilterIds, setResourceFilterIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("timeline.resourceFilterIds");
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((v) => String(v ?? "").trim())
        .filter((v) => v.length > 0);
    } catch {
      return [];
    }
  });

  const {activeTab, setActiveTab, planningVisited} = useDayTabNavigation(id);
  const [tasksShowUnplannedOnly, setTasksShowUnplannedOnly] = useState(false);
  const [unplannedDialogOpen, setUnplannedDialogOpen] = useState(false);
  const [unplannedFocusTaskId, setUnplannedFocusTaskId] = useState<number | null>(null);
  const [highlightTaskId, setHighlightTaskId] = useState<number | null>(null);
  const [planningInProgress, setPlanningInProgress] = useState(false);
  type PlanningStatus = "generating" | "applying" | "refetching_tasks" | "rendering_schedule" | "generating_diagnostics" | "ready" | "failed";
  const [planningStatus, setPlanningStatus] = useState<PlanningStatus>("ready");
  const [hydratingPlanningRunId, setHydratingPlanningRunId] = useState<number | null>(null);
  const [planningDatasetVersion, setPlanningDatasetVersion] = useState("");
  const [expectedTransportOutCount, setExpectedTransportOutCount] = useState(0);
  const [waitingForTransportOutTasks, setWaitingForTransportOutTasks] = useState(false);
  const [expectedPlanningRunId, setExpectedPlanningRunId] = useState<number | null>(() => (
    typeof window === "undefined" ? null : readActivePlanningRunId(id, window.localStorage)
  ));
  const [dismissedPlanningRunId, setDismissedPlanningRunId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const value = Number(window.sessionStorage.getItem(`dismissed-planning-run:${id}`));
    return Number.isFinite(value) && value > 0 ? value : null;
  });
  const [planningIssue, setPlanningIssue] = useState<{ kind: "stale" | "failed" | "reconnecting"; message: string } | null>(null);
  const generationAbortControllerRef = useRef<AbortController | null>(null);
  const cancelledByUserRef = useRef(false);
  const [planningProgress, setPlanningProgress] = useState({ plannedCount: 0, totalCount: 0, percentage: 0 });
  const [planningTimeLimitSec, setPlanningTimeLimitSec] = useState<number>(30);
  const [showLockedOnly, setShowLockedOnly] = useState(false);
  const [clearTimeLocksDialogOpen, setClearTimeLocksDialogOpen] = useState(false);
  const [locksDialogOpen, setLocksDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [manualBlockSaving, setManualBlockSaving] = useState(false);
  const [replanPending, setReplanPending] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [contestantTasksMode, setContestantTasksMode] = useState<"list" | "cards">("cards");
  const [contestantDetailTask, setContestantDetailTask] = useState<any | null>(null);
  const [timeLockDialog, setTimeLockDialog] = useState<{
    open: boolean;
    task: any | null;
    start: string;
    end: string;
  }>({ open: false, task: null, start: "10:00", end: "10:30" });
  const [manualBlockDialog, setManualBlockDialog] = useState<{
    open: boolean;
    scopeType: "space" | "contestant";
    scopeId: string;
    start: string;
    end: string;
    title: string;
    color: string;
  }>({
    open: false,
    scopeType: "contestant",
    scopeId: "",
    start: "10:00",
    end: "10:30",
    title: "Bloqueo manual",
    color: "#FCD34D",
  });
  const [manualDraftBlockIds, setManualDraftBlockIds] = useState<number[]>([]);
  const [manualEditsSnapshot, setManualEditsSnapshot] = useState<
    Record<number, { startPlanned: string; endPlanned: string; hadTimeLock: boolean; lockStart: string | null; lockEnd: string | null }>
  >({});


  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("timeline.stageFilterIds", JSON.stringify(stageFilterIds));
  }, [stageFilterIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("timeline.resourceFilterIds", JSON.stringify(resourceFilterIds));
  }, [resourceFilterIds]);

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) return;

    (async () => {
      try {
        setPlanningStatus("generating");
        // 1) nombres de plan_resource_items (id -> name)
        const items = await apiRequest<any[]>(
          "GET",
          buildUrl(api.plans.resourceItems.list.path, { id }),
        );

        const nameMap: Record<number, string> = {};
        for (const r of items ?? []) {
          const priId = Number(r?.id);
          const nm = String(r?.name ?? "").trim();
          if (Number.isFinite(priId) && nm) nameMap[priId] = nm;
        }
        setPlanResourceItemNameById(nameMap);

        // 2) asignaciones por zona (zoneId -> planResourceItemIds)
        const zRows = await apiRequest<any[]>(
          "GET",
          buildUrl(api.plans.zoneResourceAssignments.list.path, { id }),
        );

        const zMap: Record<number, number[]> = {};
        for (const r of zRows ?? []) {
          const zid = Number(r?.zoneId);
          const ids = Array.isArray(r?.planResourceItemIds)
            ? r.planResourceItemIds
            : [];
          const clean = ids
            .map((n: any) => Number(n))
            .filter((n: number) => Number.isFinite(n) && n > 0);

          if (Number.isFinite(zid)) zMap[zid] = clean;
        }
        setZoneAssignmentsForTooltip(zMap);
        const spaceRows = await apiRequest<any[]>("GET", buildUrl(api.plans.spaceResourceAssignments.list.path, { id }));
        setSpaceAssignmentsForPlanning(Object.fromEntries((spaceRows ?? []).map(row => [Number(row.spaceId), row.planResourceItemIds ?? []])));
      } catch {
        // Silencioso: esto es "nice to have" para tooltip, no debe romper nada
      }
    })();
  }, [id, resourceVersion]);

  // NEW: para tooltip de planning (explicabilidad)
  const [zoneAssignmentsForTooltip, setZoneAssignmentsForTooltip] = useState<
    Record<number, number[]>
  >({});
  const [spaceAssignmentsForPlanning, setSpaceAssignmentsForPlanning] = useState<Record<number, number[]>>({});
  const [planResourceItemNameById, setPlanResourceItemNameById] = useState<
    Record<number, string>
  >({});

  const [coachOptions, setCoachOptions] = useState<
    { id: number; name: string }[]
  >([]);

  const [draftById, setDraftById] = useState<Record<number, DraftTask>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const contestantTasks = useMemo(
    () =>
      (plan?.dailyTasks ?? []).filter(
        (t: any) => t.contestantId === selectedContestant?.id,
      ),
    [plan?.dailyTasks, selectedContestant?.id],
  );

  const closeContestantPanel = () => {
    setContestantDetailTask(null);
    setSelectedContestant(null);
  };

  const buildTaskDraft = (task: any): DraftTask => ({
    id: Number(task.id),
    startPlanned: String(task.startPlanned ?? task.start_planned ?? ""),
    endPlanned: String(task.endPlanned ?? task.end_planned ?? ""),
    durationOverride: String(
      task.durationOverride ?? task.duration_override ?? task.template?.defaultDuration ?? "",
    ),
    participantMarginBeforeMinutes: String(task.participantMarginBeforeMinutes ?? task.participant_margin_before_minutes ?? ""),
    participantMarginAfterMinutes: String(task.participantMarginAfterMinutes ?? task.participant_margin_after_minutes ?? ""),
    comment1Text: String(task.comment1Text ?? task.comment_1 ?? task.comment1_text ?? ""),
    comment1Color: String(task.comment1Color ?? task.comment_color_1 ?? task.comment1_color ?? ""),
    comment2Text: String(task.comment2Text ?? task.comment_2 ?? task.comment2_text ?? ""),
    comment2Color: String(task.comment2Color ?? task.comment_color_2 ?? task.comment2_color ?? ""),
    zoneId: Number.isFinite(Number(task.zoneId ?? task.zone_id)) ? Number(task.zoneId ?? task.zone_id) : null,
    spaceId: Number.isFinite(Number(task.spaceId ?? task.space_id)) ? Number(task.spaceId ?? task.space_id) : null,
  });

  useEffect(() => {
    if (!selectedContestant?.id) {
      setDraftById({});
      setIsDirty(false);
      setSaveError(null);
      return;
    }

    if (!isDirty) {
      const nextDraftById: Record<number, DraftTask> = {};
      for (const task of contestantTasks) {
        nextDraftById[Number(task.id)] = buildTaskDraft(task);
      }
      setDraftById(nextDraftById);
      setSaveError(null);
    }
  }, [contestantTasks, isDirty, selectedContestant?.id]);

  const updateDraftTask = (
    task: any,
    updater: (current: DraftTask) => DraftTask,
  ) => {
    const taskId = Number(task.id);
    setDraftById((prev) => {
      const base = prev[taskId] ?? buildTaskDraft(task);
      return {
        ...prev,
        [taskId]: updater(base),
      };
    });
    setIsDirty(true);
    setSaveError(null);
  };

  const handleCancelContestantTasks = () => {
    const resetDraftById: Record<number, DraftTask> = {};
    for (const task of contestantTasks) {
      resetDraftById[Number(task.id)] = buildTaskDraft(task);
    }
    setDraftById(resetDraftById);
    setIsDirty(false);
    setSaveError(null);
    closeContestantPanel();
  };

  const handleSaveContestantTasks = async () => {
    const changedTasks: Array<{ task: any; draft: DraftTask }> = [];
    for (const task of contestantTasks) {
      const taskId = Number(task.id);
      const draft = draftById[taskId] ?? buildTaskDraft(task);
      const original = buildTaskDraft(task);
      if (
        draft.startPlanned !== original.startPlanned
        || draft.endPlanned !== original.endPlanned
        || draft.durationOverride !== original.durationOverride
        || draft.participantMarginBeforeMinutes !== original.participantMarginBeforeMinutes
        || draft.participantMarginAfterMinutes !== original.participantMarginAfterMinutes
        || draft.comment1Text !== original.comment1Text
        || draft.comment1Color !== original.comment1Color
        || draft.comment2Text !== original.comment2Text
        || draft.comment2Color !== original.comment2Color
        || draft.zoneId !== original.zoneId
        || draft.spaceId !== original.spaceId
      ) {
        changedTasks.push({ task, draft });
      }
    }

    try {
      setIsSaving(true);
      setSaveError(null);

      for (const { task, draft } of changedTasks) {
        const durationValue = draft.durationOverride.trim();
        if (durationValue !== "") {
          const parsedDuration = Number(durationValue);
          if (!Number.isFinite(parsedDuration) || parsedDuration < 1) {
            throw new Error(`Duración inválida en tarea #${task.id}.`);
          }
        }
        const start = draft.startPlanned.trim();
        const end = draft.endPlanned.trim();
        if (start || end) {
          const startMin = parseHHMMToMinutes(start);
          const endMin = parseHHMMToMinutes(end);
          if (startMin === null || endMin === null || endMin <= startMin) {
            throw new Error(`Horario inválido en tarea #${task.id}. Usa HH:MM y fin > inicio.`);
          }
        }
      }

      await Promise.all(
        changedTasks.map(async ({ task, draft }) => {
          await apiRequest(
            "PATCH",
            buildUrl(api.dailyTasks.update.path, { id: task.id }),
            {
              plannedStart: draft.startPlanned.trim() || null,
              plannedEnd: draft.endPlanned.trim() || null,
              durationMinutes: draft.durationOverride.trim() === "" ? null : Number(draft.durationOverride),
              participantMarginBeforeMinutes: draft.participantMarginBeforeMinutes.trim() === "" ? null : Number(draft.participantMarginBeforeMinutes),
              participantMarginAfterMinutes: draft.participantMarginAfterMinutes.trim() === "" ? null : Number(draft.participantMarginAfterMinutes),
              comment1Text: draft.comment1Text.trim() || null,
              comment1Color: normalizeHexColor(draft.comment1Color),
              comment2Text: draft.comment2Text.trim() || null,
              comment2Color: normalizeHexColor(draft.comment2Color),
            },
          );

          await apiRequest(
            "PATCH",
            buildUrl(api.dailyTasks.updateLocation.path, { id: task.id }),
            {
              zoneId: draft.zoneId,
              spaceId: draft.spaceId,
            },
          );
        }),
      );

      await queryClient.invalidateQueries({ queryKey: [buildUrl(api.plans.get.path, { id })] });
      setIsDirty(false);
      closeContestantPanel();
      toast({ title: "Cambios guardados" });
    } catch (err: any) {
      const message = String(err?.message || "No se pudieron guardar los cambios.");
      setSaveError(message);
      toast({ title: "Error al guardar", description: message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const timeLockedTaskIds = useMemo(() => {
    const set = new Set<number>();
    for (const l of ((plan as any)?.locks ?? []) as any[]) {
      const tid = Number(l?.task_id ?? l?.taskId);
      const type = String(l?.lock_type ?? l?.lockType ?? "");
      const ls = l?.locked_start ?? l?.lockedStart ?? null;
      const le = l?.locked_end ?? l?.lockedEnd ?? null;
      if (!Number.isFinite(tid) || tid <= 0) continue;
      if (type === "time" && ls && le) set.add(tid);
    }
    return set;
  }, [plan]);

  const fullLockedTaskIds = useMemo(() => {
    const set = new Set<number>();
    for (const l of ((plan as any)?.locks ?? []) as any[]) {
      const tid = Number(l?.task_id ?? l?.taskId);
      const type = String(l?.lock_type ?? l?.lockType ?? "");
      const ls = l?.locked_start ?? l?.lockedStart ?? null;
      const le = l?.locked_end ?? l?.lockedEnd ?? null;
      if (!Number.isFinite(tid) || tid <= 0) continue;
      if (type === "full" && ls && le) set.add(tid);
    }
    return set;
  }, [plan]);

  const showActionError = (title: string, err: any) => {
    const message = String(err?.message || "Inténtalo de nuevo.");
    const reasons = Array.isArray(err?.reasons) ? err.reasons : [];
    const reasonMessage = reasons.length > 0
      ? reasons
          .slice(0, 3)
          .map((reason: any) => String(reason?.message || reason?.reason || reason))
          .join(" · ")
      : null;
    toast({
      title,
      description: reasonMessage ? `${message} · ${reasonMessage}` : message,
      variant: "destructive",
    });
    setActionErrorDialog({
      open: true,
      title,
      message: reasonMessage ? `${message}

${reasonMessage}` : message,
    });
  };

  const handlePlanningTaskStatusChange = useCallback(async (
    task: any,
    status: "in_progress" | "done" | "interrupted" | "cancelled",
  ) => {
    const payload: any = {
      taskId: Number(task?.id),
      planId: id,
      expectedStatus: task?.status ?? "pending",
      status,
    };

    try {
      await updateTaskStatus.mutateAsync(payload);
    } catch (err: any) {
      if (status === "in_progress" && String(err?.message || "").includes("espacio ya tiene otra tarea en curso")) {
        showActionError("No se puede iniciar: este espacio ya tiene otra tarea en curso", err);
      } else {
        showActionError("No se pudo actualizar la tarea", err);
      }
      throw err;
    }
  }, [id,updateTaskStatus.mutateAsync]);

  async function handleRefreshTasksFromTemplates() {
    if (!await confirmDialog({title: "Actualizar tareas del día", description: "Se actualizarán las tareas materializadas con los valores de sus plantillas. Las tareas protegidas se conservarán según el contrato vigente. Revisa el resultado y vuelve a validar el borrador.", confirmText: "Actualizar tareas"})) return;
    const loadingToast = toast({
      title: "Actualizando tareas desde templates...",
      description: "Esto puede tardar hasta 2 minutos.",
    });

    try {
      setRefreshingTasksFromTemplates(true);
      const result = await apiRequest<{
        updatedCount: number;
        skippedExecutedCount: number;
        skippedManualCount: number;
        skippedNoTemplateCount: number;
      }>("POST", buildUrl(api.plans.tasks.refreshFromTemplates.path, { id }));

      await queryClient.invalidateQueries({ queryKey: planQueryKey(id) });

      loadingToast.dismiss();

      const successMessages = [
        result.skippedManualCount > 0
          ? `${result.skippedManualCount} manuales no actualizadas.`
          : null,
        result.skippedNoTemplateCount > 0
          ? `${result.skippedNoTemplateCount} sin plantilla no actualizadas.`
          : null,
      ].filter(Boolean);

      toast({
        title: `Actualizadas ${result.updatedCount} tareas.`,
        description: successMessages.length > 0 ? successMessages.join(" ") : undefined,
      });

      if (result.skippedExecutedCount > 0) {
        toast({
          title: `No se actualizaron ${result.skippedExecutedCount} tareas en ejecución/finalizadas.`,
        });
      }
    } catch (err: any) {
      loadingToast.dismiss();
      toast({
        title: "No se pudieron actualizar las tareas",
        description: err?.message || "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setRefreshingTasksFromTemplates(false);
    }
  }

  function handleCreateContestant() {
    if (!newName.trim()) return;

    if (newInstrument && !newInstrumentName.trim()) {
      toast({
        title: "Falta instrumento",
        description: "Debes indicar el instrumento.",
        variant: "destructive",
      });
      return;
    }

    if (newAvailabilityEnabled) {
      if (!newAvailabilityStart || !newAvailabilityEnd) {
        toast({
          title: "Falta disponibilidad",
          description: "Debes indicar hora inicio y hora fin.",
          variant: "destructive",
        });
        return;
      }

      if (newAvailabilityStart >= newAvailabilityEnd) {
        toast({
          title: "Rango de disponibilidad inválido",
          description: "La hora inicio debe ser menor que la hora fin.",
          variant: "destructive",
        });
        return;
      }
    }

    const vocalCoachPlanResourceItemId =
      newCoachPriId !== "none" ? Number(newCoachPriId) : null;

    createContestant.mutate(
      {
        name: newName,
        instrument: newInstrument,
        instrumentName: newInstrument ? newInstrumentName.trim() : null,
        song: newSong.trim() || null,
        vocalCoachPlanResourceItemId,
        availabilityStart: newAvailabilityEnabled ? newAvailabilityStart : null,
        availabilityEnd: newAvailabilityEnabled ? newAvailabilityEnd : null,
      },
      {
        onSuccess: () => {
          setNewName("");
          setNewInstrument(false);
          setNewInstrumentName("");
          setNewSong("");
          setNewCoachPriId("none");
          setNewAvailabilityEnabled(false);
          setNewAvailabilityStart("");
          setNewAvailabilityEnd("");
        },
      },
    );
  }
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({
    workStart: "",
    workEnd: "",
    mealStart: "",
    mealEnd: "",
    mealMode: "flexible_meal_window" as "flexible_meal_window" | "global_hard_break",
    contestantMealDurationMinutes: 75,
    contestantMealMaxSimultaneous: 10,
    spaceMealBreakMinutes: "",
    camerasAvailable: 0,
  });

  const [configDialog, setConfigDialog] = useState<{
    open: boolean;
    reasons: any[];
  }>({
    open: false,
    reasons: [],
  });

  const [actionErrorDialog, setActionErrorDialog] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: "No se pudo completar la acción",
    message: "",
  });

  useEffect(() => {
    if (!editOpen || !plan) return;
    setEdit({
      workStart: plan.workStart || "",
      workEnd: plan.workEnd || "",
      mealStart: plan.mealStart || "",
      mealEnd: plan.mealEnd || "",
      mealMode: plan.mealMode === "global_hard_break" ? "global_hard_break" : "flexible_meal_window",
      contestantMealDurationMinutes: plan.contestantMealDurationMinutes ?? 75,
      contestantMealMaxSimultaneous: plan.contestantMealMaxSimultaneous ?? 10,
      spaceMealBreakMinutes: plan.spaceMealBreakMinutes == null ? "" : String(plan.spaceMealBreakMinutes),
      camerasAvailable: plan.camerasAvailable ?? 0,
    });
  }, [editOpen, plan]);

  // Infeasible (no se puede planificar)
  const [errorDialog, setErrorDialog] = useState<{
    open: boolean;
    reasons: any[];
    diagnostic: {
      code: string | null;
      warnings: any[];
      insights: any[];
      unplanned: any[];
      report?: any;
    } | null;
  }>({
    open: false,
    reasons: [],
    diagnostic: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadCoaches() {
      try {
        const rows = await apiRequest<any[]>(
          "GET",
          buildUrl(api.plans.resourceItems.list.path, { id }),
        );

        const list = (rows ?? [])
          .filter((r) => r?.isAvailable !== false)
          .filter((r) => {
            const code = String(r?.type?.code ?? "").toLowerCase();
            const name = String(r?.type?.name ?? "").toLowerCase();
            return code.includes("coach") || name.includes("coach");
          })
          .map((r) => ({ id: Number(r.id), name: String(r.name) }))
          .filter((x) => Number.isFinite(x.id) && x.name);

        if (!cancelled) setCoachOptions(list);
      } catch {
        if (!cancelled) setCoachOptions([]);
      }
    }

    loadCoaches();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const run = planningRunQ.data;
    if (!run) return;

    const runId = Number(run.id);
    const uiState = getPlanningRunUiState(run);
    if (dismissedPlanningRunId === runId) {
      if (uiState !== "active" && uiState !== "stale") {
        window.sessionStorage.removeItem(`dismissed-planning-run:${id}`);
        setDismissedPlanningRunId(null);
      }
      return;
    }

    if (uiState === "active") {
      persistActivePlanningRunId(id, runId, window.localStorage);
      setPlanningIssue(null);
      setPlanningInProgress(true);
      if (expectedPlanningRunId == null) setExpectedPlanningRunId(runId);
    }

    if (expectedPlanningRunId == null && uiState !== "active" && uiState !== "stale") return;
    const isExpectedRun = runId === Number(expectedPlanningRunId);
    if (!isExpectedRun) return;

    if (Number.isFinite(run.plannedCount) && Number.isFinite(run.totalPending)) {
      setPlanningProgress(getRunProgress({ plannedCount: Number(run.plannedCount), totalPending: Number(run.totalPending), status: run.status, phaseProgressPct: run.progressPct, phase: run.phase, phaseStartedAt: run.phaseStartedAt }));
    }

    if (uiState === "stale") {
      setPlanningIssue({ kind: "stale", message: run.message || "La generación parece haberse quedado bloqueada." });
      setPlanningInProgress(true);
      if (expectedPlanningRunId == null) setExpectedPlanningRunId(runId);
      return;
    }
    if (uiState === "active") return;

    persistActivePlanningRunId(id, null, window.localStorage);
    setPlanningInProgress(false);
    setExpectedPlanningRunId(null);
    setPlanningIssue(null);
    void queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
    void queryClient.invalidateQueries({ queryKey: engineDiagnosticsQueryKey(id) });
    void queryClient.invalidateQueries({ queryKey: ["planning-run", id] });

    if (uiState === "no_work") {
      toast({ title: "No hay tareas pendientes que planificar" });
      return;
    }
    if (uiState === "cancelled") {
      toast({ title: "Planificación cancelada. No se han aplicado cambios." });
      return;
    }
    if (uiState === "failed") {
      setPlanningIssue({ kind: "failed", message: run.message || "La generación no pudo completarse." });
      setPlanningInProgress(true);
      if (run.status === "infeasible") {
        setErrorDialog({ open: true, reasons: Array.isArray(run.lastReasons) ? run.lastReasons : [], diagnostic: null });
      }
      return;
    }

    if (run.status === "success") {
      void (async () => {
        await queryClient.invalidateQueries({ queryKey: engineDiagnosticsQueryKey(id, runId) });
        await queryClient.refetchQueries({ queryKey: engineDiagnosticsQueryKey(id, runId), type: "all" });
      })();
    }

    const finalProgress = getRunProgress({ plannedCount: Number(run.plannedCount ?? 0), totalPending: Number(run.totalPending ?? 0), status: run.status, phaseProgressPct: run.progressPct, phase: run.phase, phaseStartedAt: run.phaseStartedAt });
    const unplannedCount = Math.max(0, finalProgress.totalCount - finalProgress.plannedCount);
    toast({
      title: finalProgress.percentage === 100 ? "Planificación completa (100%)" : `Planificación parcial (${finalProgress.percentage}%)`,
      description: finalProgress.percentage === 100
        ? `${finalProgress.plannedCount}/${finalProgress.totalCount} tareas planificadas.`
        : `${finalProgress.plannedCount}/${finalProgress.totalCount} tareas planificadas · ${unplannedCount} sin planificar.`,
    });
  }, [planningRunQ.data, expectedPlanningRunId, dismissedPlanningRunId, id, queryClient, toast]);

  const unplannedTasks = useMemo(() => {
    return (plan?.dailyTasks ?? []).filter(
      (t: any) => String(t?.status ?? "pending") === "pending" && t?.isManualBlock !== true && t?.is_manual_block !== true && (!t?.startPlanned || !t?.endPlanned),
    );
  }, [plan?.dailyTasks]);

  useEffect(() => {
    if (v4ResultState !== "loading" && v4ResultState !== "pending_diagnostics") return;
    if ((v4ResultQ.data as any)?.id && (v4ResultQ.data as any)?.diagnostics) {
      setV4ResultState("success");
    }
  }, [v4ResultQ.data, v4ResultState]);

  const planningViewPlan = useMemo(() => {
    if (selectedPlanningEngine !== "v4" || !Array.isArray((v4ResultQ.data as any)?.plannedTasks)) return plan;
    const plannedByTaskId = new Map<number, any>(
      ((v4ResultQ.data as any)?.plannedTasks ?? [])
        .map((item: any) => [Number(item?.taskId), item])
        .filter(([taskId]: [number, any]) => Number.isFinite(taskId) && taskId > 0),
    );
    return {
      ...(plan as any),
      dailyTasks: ((plan?.dailyTasks ?? []) as any[]).map((task: any) => {
        const planned = plannedByTaskId.get(Number(task?.id));
        if (!planned) return task;
        return {
          ...task,
          startPlanned: planned.startPlanned,
          endPlanned: planned.endPlanned,
          assignedResourceIds: planned.assignedResources ?? task.assignedResourceIds,
        };
      }),
    };
  }, [plan, selectedPlanningEngine, v4ResultQ.data]);

  const reasonsByTaskId = useMemo(() => {
    const map = new Map<number, any>();
    const reasons = Array.isArray(planningRunQ.data?.lastReasons) ? planningRunQ.data?.lastReasons : [];
    for (const reason of reasons) {
      const taskId = Number(reason?.taskId ?? reason?.task_id);
      if (!Number.isFinite(taskId) || map.has(taskId)) continue;
      map.set(taskId, {
        message: formatInfeasibleReason(reason),
        details: reason?.details,
      });
    }
    return map;
  }, [planningRunQ.data?.lastReasons, formatInfeasibleReason]);

  const onResetPlan = async (mode: "partial" | "total" | "v4" | "complete") => {
    setResetPending(true);
    try {
      const apiMode = mode === "complete" ? "total" : mode;
      const result = await apiRequest<any>("POST", `/api/plans/${id}/reset`, { mode: apiMode });
      await queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: engineResultQueryKey(id, "v4") });
      await queryClient.refetchQueries({ queryKey: planQueryKey(id) });
      if (mode === "total" || mode === "complete") {
        setManualDraftBlockIds([]);
        setManualEditsSnapshot({});
      }
      setResetDialogOpen(false);
      toast({
        title: mode === "v4" ? "Resultado V4 eliminado" : mode === "partial" ? "Reset V3 completado" : "Reset completo completado",
        description: mode === "v4" ? `Resultados V4 eliminados: ${Number(result?.deletedV4ResultsCount ?? 0)}` : (mode === "total" || mode === "complete")
          ? `Tareas limpiadas: ${Number(result?.clearedTasksCount ?? 0)} · Locks limpiados: ${Number(result?.clearedLocksCount ?? 0)} · Bloqueos manuales: ${Number(result?.clearedManualBlocks ?? 0)} · Locks de bloqueos: ${Number(result?.clearedManualBlockLocks ?? 0)}`
          : `Tareas limpiadas: ${Number(result?.clearedTasksCount ?? 0)} · Locks limpiados: ${Number(result?.clearedLocksCount ?? 0)}`,
      });
    } catch (err: any) {
      toast({
        title: "No se pudo resetear el planning",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setResetPending(false);
    }
  };

  const openTaskFromUnplanned = (task: any) => {
    const tid = Number(task?.id);
    const contestantId = Number(task?.contestantId ?? task?.contestant_id);
    setUnplannedFocusTaskId(Number.isFinite(tid) ? tid : null);
    setUnplannedDialogOpen(false);
    setActiveTab("tasks");
    setTasksShowUnplannedOnly(false);

    const contestant = (contestants ?? []).find((c: any) => Number(c?.id) === contestantId);
    if (!contestant) return;
    setSelectedContestant(contestant);
    setHighlightTaskId(tid);

    window.setTimeout(() => {
      const el = document.querySelector(`[data-task-id="${tid}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 280);
  };

  function coachLabelFor(vocalCoachPlanResourceItemId: any) {
    const idNum = Number(vocalCoachPlanResourceItemId);
    if (!Number.isFinite(idNum) || idNum <= 0) return "Sin coach";

    const found = coachOptions.find((x) => Number(x.id) === idNum);
    return found?.name ? `Coach: ${found.name}` : `Coach #${idNum}`;
  }

  function isMissingSpace(t: any) {
    const zoneId = t?.zoneId ?? t?.zone_id ?? null;

    const mealName = String((plan as any)?.mealTaskTemplateName ?? "Comer")
      .trim()
      .toLowerCase();

    const taskName = String(t?.template?.name ?? "")
      .trim()
      .toLowerCase();
    const isMealTask = mealName.length > 0 && taskName === mealName;

    if (isMealTask) return false;

    return (
      zoneId === null ||
      zoneId === undefined ||
      !Number.isFinite(Number(zoneId))
    );
  }

  const resourceFilterOptions = useMemo<ResourceSelectable[]>(() => {
    if (!plan) return [];

    const options: ResourceSelectable[] = [];
    const planItems = planResourceItemNameById ?? {};
    const staffList = Array.isArray(staffPeople) ? staffPeople : [];
    const itinerantTeamList = Array.isArray(itinerantTeams) ? itinerantTeams : [];

    for (const [idStr, name] of Object.entries(planItems)) {
      const id = Number(idStr);
      if (!Number.isFinite(id) || id <= 0) continue;
      options.push({
        id: `resource_item:${id}`,
        label: String(name ?? `Recurso #${id}`),
        kind: "resource_item",
      });
    }

    for (const person of staffList) {
      const personId = Number((person as any)?.id);
      if (!Number.isFinite(personId) || personId <= 0) continue;
      const roleType = String((person as any)?.roleType ?? "");
      const isActive = Boolean((person as any)?.isActive ?? true);
      if (!isActive) continue;
      if (roleType !== "production" && roleType !== "editorial") continue;

      options.push({
        id: `${roleType}:${personId}`,
        label: `${roleType === "production" ? "Producción" : "Redacción"} · ${String((person as any)?.name ?? `Persona #${personId}`)}`,
        kind: roleType,
      });
    }

    for (const team of itinerantTeamList) {
      const teamId = Number((team as any)?.id);
      if (!Number.isFinite(teamId) || teamId <= 0) continue;
      const isActive = Boolean((team as any)?.isActive ?? (team as any)?.is_active ?? true);
      if (!isActive) continue;
      options.push({
        id: `itinerant_team:${teamId}`,
        label: `Itinerante · ${String((team as any)?.name ?? (team as any)?.code ?? `Equipo #${teamId}`)}`,
        kind: "itinerant_team",
      });
    }

    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [plan, planResourceItemNameById, staffPeople, itinerantTeams]);

  const openExecution = useCallback(() => setActiveTab("execution"), [setActiveTab]);
  const openContestantFromExecution = useCallback((contestantId:number) => {setSelectedContestant(contestants.find(contestant=>Number(contestant.id)===contestantId));setActiveTab("tasks");}, [contestants,setActiveTab]);
  const assistedTimelineProps = useMemo(() => ({contestants,onTaskStatusChange:handlePlanningTaskStatusChange,canExecuteTask:canOperateTask,taskStatusPending:updateTaskStatus.isPending,viewMode:timelineView,spaceVerticalMode,stageFilterIds,resourceFilterIds,resourceSelectables:resourceFilterOptions,zones,spaces,zoneResourceAssignments:zoneAssignmentsForTooltip,spaceResourceAssignments:spaceAssignmentsForPlanning,planResourceItemNameById,zoneStaffModes:planZoneStaffModes,itinerantTeams,staffAssignments:planStaffAssignments,uiItinerantGroupOrderIndex:(programSettings as any)?.uiItinerantGroupOrderIndex??(programSettings as any)?.ui_itinerant_group_order_index??null,uiUnlocatedGroupOrderIndex:(programSettings as any)?.uiUnlocatedGroupOrderIndex??(programSettings as any)?.ui_unlocated_group_order_index??null}),[contestants,handlePlanningTaskStatusChange,canOperateTask,updateTaskStatus.isPending,timelineView,spaceVerticalMode,stageFilterIds,resourceFilterIds,resourceFilterOptions,zones,spaces,zoneAssignmentsForTooltip,spaceAssignmentsForPlanning,planResourceItemNameById,planZoneStaffModes,itinerantTeams,planStaffAssignments,programSettings]);

  const resourceOptionById = useMemo(
    () => new Map(resourceFilterOptions.map((opt) => [String(opt.id), opt])),
    [resourceFilterOptions],
  );

  const [resourceSelectorOpen, setResourceSelectorOpen] = useState(false);

  const selectedResourceOptions = resourceFilterIds
    .map((id) => resourceOptionById.get(String(id)))
    .filter((v): v is ResourceSelectable => Boolean(v));

  const openTimeLockDialog = (task: any) => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, "0");
    const suggestedStart = `${hh}:${mm}`;

    const tpl = (taskTemplates as any[]).find((t: any) => Number(t?.id) === Number(task?.templateId ?? task?.template_id));
    const duration = Math.max(5, Number(task?.durationOverride ?? task?.duration_override ?? tpl?.defaultDuration ?? 30));
    const start = String(task?.startPlanned ?? task?.start_planned ?? suggestedStart);
    const startMin = parseHHMMToMinutes(start) ?? parseHHMMToMinutes(suggestedStart) ?? 600;
    const endMin = Math.min(23 * 60 + 59, startMin + duration);
    const endSuggested = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
    const end = String(task?.endPlanned ?? task?.end_planned ?? endSuggested);

    setTimeLockDialog({ open: true, task, start, end });
  };

  if (planLoading || planError || planReconnecting) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh] px-4">
          <div className="w-full max-w-xl space-y-3">
            <QueryGuard
              isLoading={planLoading || planReconnecting}
              isError={Boolean(planError)}
              error={planQueryError}
              loadingText={planReconnecting ? "Planificación en curso. Reconectando..." : "Cargando plan..."}
              errorTitle="No se pudo cargar el plan."
              onRetry={() => {
                queryClient.cancelQueries({ queryKey: planQueryKey(id) });
                refetchPlan();
              }}
            />
            <Button variant="outline" onClick={() => setLocation("/plans")}>Volver</Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (!plan) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <h2 className="text-2xl font-bold">Plan Not Found</h2>
          <Button onClick={() => setLocation("/plans")}>Back to Plans</Button>
        </div>
      </Layout>
    );
  }

  // Precarga del modal con datos del plan (cuando ya están disponibles)
  const openEdit = () => {
    setEdit({
      workStart: plan.workStart || "",
      workEnd: plan.workEnd || "",
      mealStart: plan.mealStart || "",
      mealEnd: plan.mealEnd || "",
      mealMode: plan.mealMode === "global_hard_break" ? "global_hard_break" : "flexible_meal_window",
      contestantMealDurationMinutes: plan.contestantMealDurationMinutes ?? 75,
      contestantMealMaxSimultaneous: plan.contestantMealMaxSimultaneous ?? 10,
      spaceMealBreakMinutes: plan.spaceMealBreakMinutes == null ? "" : String(plan.spaceMealBreakMinutes),
      camerasAvailable: plan.camerasAvailable ?? 0,
    });
    setEditOpen(true);
  };


  const openDiagnosticDialog = (source: any) => {
    const payload = source?.payload ?? source ?? {};
    const warnings = Array.isArray(source?.warnings) ? source.warnings : (Array.isArray(payload?.warnings) ? payload.warnings : []);
    const insights = Array.isArray(source?.insights) ? source.insights : (Array.isArray(payload?.insights) ? payload.insights : []);
    const unplanned = Array.isArray(source?.unplanned) ? source.unplanned : (Array.isArray(payload?.unplanned) ? payload.unplanned : []);
    const reasons = Array.isArray(source?.reasons) ? source.reasons : (Array.isArray(payload?.reasons) ? payload.reasons : []);
    const report = source?.report ?? payload?.report ?? null;
    const codeRaw = source?.code ?? payload?.code ?? payload?.message ?? source?.message ?? null;
    const code = codeRaw == null ? null : String(codeRaw);

    const hasDiagnostics = warnings.length > 0 || insights.length > 0 || unplanned.length > 0 || Boolean(report);
    if (!hasDiagnostics && reasons.length === 0) return false;

    setErrorDialog({
      open: true,
      reasons,
      diagnostic: { code, warnings, insights, unplanned, report },
    });
    return true;
  };

  const refreshPlanningState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: planQueryKey(id) }),
      queryClient.invalidateQueries({ queryKey: engineDiagnosticsQueryKey(id) }),
      queryClient.invalidateQueries({ queryKey: ["planning-run", id] }),
    ]);
  };

  const unlockPlanningModal = (runId?: number | null) => {
    const safeRunId = Number(runId);
    if (Number.isFinite(safeRunId) && safeRunId > 0) {
      window.sessionStorage.setItem(`dismissed-planning-run:${id}`, String(safeRunId));
      setDismissedPlanningRunId(safeRunId);
    }
    setPlanningInProgress(false);
    setExpectedPlanningRunId(null);
    setPlanningIssue(null);
    setPlanningProgress({ plannedCount: 0, totalCount: 0, percentage: 0 });
  };

  const cancelPlanningGeneration = async () => {
    const run = planningRunQ.data;
    const runId = run?.id ?? expectedPlanningRunId;
    const uiState = getPlanningRunUiState(run);
    const hasActiveGeneration = uiState === "active" || uiState === "stale" || planningInProgress || generatePlan.isPending;
    cancelledByUserRef.current = true;
    generationAbortControllerRef.current?.abort("cancelled_by_user");
    persistActivePlanningRunId(id, null, window.localStorage);
    persistCancelledPlanningRunId(id, runId ?? null, window.sessionStorage);
    setExpectedPlanningRunId(null);
    await queryClient.cancelQueries({ queryKey: ["planning-run", id] });
    unlockPlanningModal(runId);

    let backendCancelFailed = false;
    if (hasActiveGeneration) {
      queryClient.setQueryData(["planning-run", id], (current: any) => current ? { ...current, status: "cancelled", phase: "cancelled" } : current);
      try {
        const cancellation: any = await apiRequest("POST", buildUrl(api.planningRuns.cancel.path, { id }), runId ? { runId: Number(runId) } : {});
        if (cancellation?.rollbackGuaranteed === false) {
          backendCancelFailed = true;
        }
      } catch {
        backendCancelFailed = true;
        // The modal still closes, but the UI must not claim transactional safety without backend confirmation.
      }
      toast(backendCancelFailed
        ? { title: "No se pudo garantizar la restauración", description: "Recarga el plan y revisa sus tareas antes de reintentar.", variant: "destructive" }
        : { title: "Planificación cancelada. No se han aplicado cambios." });
    }
    await refreshPlanningState();
    if (backendCancelFailed) {
      queryClient.setQueryData(["planning-run", id], (current: any) => current && Number(current.id) === Number(runId)
        ? { ...current, status: "cancelled", phase: "cancelled", message: "Cancelado localmente" }
        : current);
    }
  };

  const handleGenerate = async () => {
    cancelledByUserRef.current = false;
    persistCancelledPlanningRunId(id, null, window.sessionStorage);
    generationAbortControllerRef.current = new AbortController();
    setDismissedPlanningRunId(null);
    window.sessionStorage.removeItem(`dismissed-planning-run:${id}`);
    setPlanningIssue(null);
    setPlanningInProgress(true);
    setExpectedPlanningRunId(null);
    markPlanningReconnectContext(id, window.localStorage);
    const totalToPlan = ((plan?.dailyTasks ?? []) as any[]).filter((task: any) => {
      const taskId = Number(task?.id);
      if (String(task?.status ?? "pending") !== "pending") return false;
      if (task?.isManualBlock === true || task?.is_manual_block === true) return false;
      if (!Number.isFinite(taskId) || taskId <= 0) return false;
      return !timeLockedTaskIds.has(taskId) && !fullLockedTaskIds.has(taskId);
    }).length;
    setPlanningProgress({ plannedCount: 0, totalCount: totalToPlan, percentage: 1 });
    let reconnectAfterAbort = false;
    let awaitingScheduleRender = false;

      try {
        // ✅ El botón verde siempre fuerza motor v3 para este plan
        if (String((plan as any)?.optimizerEngine ?? "") !== "v3") {
          await updatePlan.mutateAsync({ id, patch: { optimizerEngine: "v3" } });
        }

        await queryClient.invalidateQueries({ queryKey: ["planning-run", id] });
        await queryClient.refetchQueries({ queryKey: ["planning-run", id] });

        const data: any = await generatePlan.mutateAsync({
          id,
          mode: "generate_planning",
          timeLimitMs: planningTimeLimitSec * 1000,
          signal: generationAbortControllerRef.current.signal,
        });
      const completedRunId = Number.isFinite(Number(data?.runId)) ? Number(data.runId) : null;
      const lastCancelledRunId = readCancelledPlanningRunId(id, window.sessionStorage);
      if (cancelledByUserRef.current || (completedRunId && completedRunId === lastCancelledRunId)) return;
      setExpectedPlanningRunId(completedRunId);
      setHydratingPlanningRunId(completedRunId);
      setPlanningStatus("applying");
      persistActivePlanningRunId(id, completedRunId, window.localStorage);
      setPlanningStatus("refetching_tasks");
      let refreshedTasks: any[] = [];
      await queryClient.invalidateQueries({ queryKey: ["planning-run", id] });
      await queryClient.refetchQueries({ queryKey: ["planning-run", id] });
      if (completedRunId !== null) {
        setPlanningStatus("generating_diagnostics");
        try {
          await queryClient.invalidateQueries({ queryKey: engineDiagnosticsQueryKey(id, completedRunId) });
          await queryClient.refetchQueries({ queryKey: engineDiagnosticsQueryKey(id, completedRunId), type: "all" });
          const diagnostics: any = queryClient.getQueryData(engineDiagnosticsQueryKey(id, completedRunId));
          if (Number(diagnostics?.id) !== completedRunId) throw new Error("STALE_PLANNING_DIAGNOSTICS");
          setExpectedTransportOutCount(derivePlanningReadinessExpectation(diagnostics, completedRunId).transportOutTasks);
        } catch (diagnosticsError: any) {
          console.warn("post-success diagnostics refetch failed", {
            planningRunId: completedRunId,
            latestSuccessRunId: completedRunId,
            diagnosticsRunId: null,
            lastProgressStatus: "success",
            postSuccessRefetchError: diagnosticsError?.message ?? String(diagnosticsError),
          });
          toast({ title: "Plan aplicado, diagnóstico pendiente.", description: "Reintentar desde el panel de diagnóstico." });
        }
      }
      const hydrationStartedAt = Date.now();
      let hydrated = false;
      while (!hydrated && Date.now() - hydrationStartedAt < 10_000) {
        await queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
        await queryClient.refetchQueries({ queryKey: planQueryKey(id) });
        const refreshedPlan = await refetchPlan();
        refreshedTasks = ((refreshedPlan.data as any)?.dailyTasks ?? []) as any[];
        const diagnostics: any = completedRunId === null ? null : queryClient.getQueryData(engineDiagnosticsQueryKey(id, completedRunId));
        const expectation = derivePlanningReadinessExpectation(diagnostics, completedRunId);
        const counts = countRenderedPlanningTasks(refreshedTasks);
        hydrated = expectation.diagnosticsReady
          && counts.pendingUnplannedCount === (expectation.unplannedTasks ?? 0)
          && counts.visibleScheduledTasksCount >= (expectation.scheduledVisibleTasks ?? expectation.plannedTasks ?? Number.MAX_SAFE_INTEGER)
          && counts.visibleTransportOutCount >= expectation.transportOutTasks;
        setWaitingForTransportOutTasks(counts.visibleTransportOutCount < expectation.transportOutTasks || counts.pendingUnplannedCount > (expectation.unplannedTasks ?? 0));
        if (!hydrated) await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
      if (!hydrated) throw new Error("PLANNING_VIEW_NOT_READY_HYDRATION_TIMEOUT");
      setPlanningDatasetVersion(`${completedRunId}:${refreshedTasks.length}:${refreshedTasks.map((task) => `${task.id}:${task.startPlanned}:${task.endPlanned}`).join("|")}`);
      setPlanningStatus("rendering_schedule");
      awaitingScheduleRender = completedRunId !== null;
      const reasons = Array.isArray(data?.reasons) ? data.reasons : [];
      if (reasons.length > 0) {
        openDiagnosticDialog(data);
      }
      const warnings = data?.warnings ?? [];
      if (reasons.length === 0 && Array.isArray(warnings) && warnings.length > 0) {
        setConfigDialog({ open: true, reasons: warnings });
      }
    } catch (err: any) {
      if (cancelledByUserRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["planning-run", id] });
      await queryClient.refetchQueries({ queryKey: ["planning-run", id] });
      if (isAbortLikeError(err)) {
        reconnectAfterAbort = true;
        const recoveredRun: any = queryClient.getQueryData(["planning-run", id]);
        const recoveredRunId = Number.isFinite(Number(recoveredRun?.id)) ? Number(recoveredRun.id) : expectedPlanningRunId;
        persistActivePlanningRunId(id, recoveredRunId, window.localStorage);
        setExpectedPlanningRunId(recoveredRunId);
        setPlanningIssue({
          kind: "reconnecting",
          message: "La planificación sigue ejecutándose. Puedes esperar o volver a intentar cargar.",
        });
        setPlanningInProgress(true);
        toast({ title: "Reconectando con la planificación..." });
        await queryClient.refetchQueries({ queryKey: planQueryKey(id) });
      } else if (err?.reasons) {
        setErrorDialog({ open: true, reasons: err.reasons, diagnostic: null });
      } else {
        const detail = err?.payload?.detail ?? err?.detail ?? err?.message ?? "Error desconocido";
        if (String(detail).startsWith("PLANNING_VIEW_NOT_READY")) {
          setPlanningIssue({ kind: "failed", message: "Plan aplicado, pero no se pudo refrescar la vista. Reintentar." });
          setPlanningStatus("failed");
          setPlanningInProgress(true);
          return;
        }
        toast({
          title: "Error al planificar",
          description: detail,
          variant: "destructive",
        });

        if (import.meta.env.DEV) {
          console.error("[plan-details] generate failed", err);
        }
      }
    } finally {
      generationAbortControllerRef.current = null;
      if (!cancelledByUserRef.current && !reconnectAfterAbort && !awaitingScheduleRender) {
        const activeRun = queryClient.getQueryData<any>(["planning-run", id]);
        if ((!activeRun || !["running", "pending", "queued", "optimizing"].includes(String(activeRun.status))) && !hydratingPlanningRunId) {
          setPlanningInProgress(false);
          setExpectedPlanningRunId(null);
        }
      }
    }
  };

  function goToTask(taskId?: number | null) {
    // 1) Cierra el diálogo de warnings (si no, parece que no hace nada)
    setConfigDialog({ open: false, reasons: [] });

    // 2) Ve a pestaña Tasks
    setActiveTab("tasks");

    const tid = Number(taskId);
    if (!Number.isFinite(tid) || tid <= 0) return;

    // 3) Localiza la tarea dentro del plan
    const task = (plan?.dailyTasks ?? []).find(
      (t: any) => Number(t?.id) === tid,
    );
    if (!task) {
      toast({
        title: "No encontrada",
        description: `No encuentro la tarea ${tid} dentro del plan.`,
        variant: "destructive",
      });
      return;
    }

    // 4) La tarea debe pertenecer a un concursante para abrir su ficha
    const cid = Number(task?.contestantId);
    if (!Number.isFinite(cid) || cid <= 0) {
      toast({
        title: "Requiere configuración",
        description: `La tarea ${tid} no tiene concursante asignado. Asigna un concursante y vuelve a intentarlo.`,
        variant: "destructive",
      });
      return;
    }

    const contestant = (contestants ?? []).find(
      (c: any) => Number(c?.id) === cid,
    );
    if (!contestant) {
      toast({
        title: "Concursante no encontrado",
        description: `No encuentro el concursante ${cid} para abrir su ficha.`,
        variant: "destructive",
      });
      return;
    }

    // 5) Abre la ficha (modal) del concursante
    setSelectedContestant(contestant);
    setHighlightTaskId(tid);

    // 6) Espera a que el modal renderice y resalta la fila de la tarea
    setTimeout(() => {
      const el =
        (document.querySelector(`[data-ta="${tid}"]`) as HTMLElement | null) ||
        (document.querySelector(
          `[data-task-id="${tid}"]`,
        ) as HTMLElement | null);

      el?.scrollIntoView({ behavior: "smooth", block: "center" });

      if (el) {
        el.classList.add("ring-2", "ring-primary");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1200);
      }
    }, 250);
  }

  const toggleStageFilter = (zoneId: number) => {
    setStageFilterIds((prev) =>
      prev.includes(zoneId)
        ? prev.filter((id) => id !== zoneId)
        : [...prev, zoneId],
    );
  };

  const toggleResourceFilter = (resourceId: string) => {
    setResourceFilterIds((prev) =>
      prev.includes(resourceId)
        ? prev.filter((id) => id !== resourceId)
        : [...prev, resourceId],
    );
  };

  // The same visual controls serve Legacy and Assisted; only local view state changes.
  const planningViewSelector = (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={
          timelineView === "contestants" ? "default" : "outline"
        }
        size="sm"
        onClick={() => setTimelineView("contestants")}
      >
        Por concursante
      </Button>
      <Button
        type="button"
        variant={
          timelineView === "spaces" ? "default" : "outline"
        }
        size="sm"
        onClick={() => setTimelineView("spaces")}
      >
        Por plató y espacio
      </Button>
      <Button
        type="button"
        variant={
          timelineView === "resources" ? "default" : "outline"
        }
        size="sm"
        onClick={() => setTimelineView("resources")}
      >
        Recursos
      </Button>
      {timelineView === "spaces" && (
        <div className="flex items-center gap-2 ml-3">
          <Button
            type="button"
            variant={
              spaceVerticalMode === "timeline"
                ? "default"
                : "outline"
            }
            size="sm"
            onClick={() => setSpaceVerticalMode("timeline")}
          >
            Timeline
          </Button>
          <Button
            type="button"
            variant={
              spaceVerticalMode === "list" ? "default" : "outline"
            }
            size="sm"
            onClick={() => setSpaceVerticalMode("list")}
          >
            Lista
          </Button>
        </div>
      )}
    </div>
  );
  const planningViewFilters = (<>
    {timelineView === "spaces" && (
      <Card className="p-3">
        {zonesLoading ? (
          <p className="text-sm text-muted-foreground">Cargando platós...</p>
        ) : !Array.isArray(zones) || zones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay platós</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(zones as any[]).map((zone: any) => {
                const zoneId = Number(zone?.id);
                if (!Number.isFinite(zoneId)) return null;
                const checked = stageFilterIds.includes(zoneId);
                return (
                  <Button
                    key={zoneId}
                    type="button"
                    size="sm"
                    variant={checked ? "default" : "outline"}
                    onClick={() => toggleStageFilter(zoneId)}
                  >
                    {zone?.name ?? `Plató #${zoneId}`}
                  </Button>
                );
              })}
            </div>
            <div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setStageFilterIds([])}
                disabled={stageFilterIds.length === 0}
              >
                Limpiar filtro
              </Button>
            </div>
          </div>
        )}
      </Card>
    )}

    {timelineView === "resources" && (
      <Card className="p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={resourceSelectorOpen} onOpenChange={setResourceSelectorOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={resourceSelectorOpen}
                className="w-full justify-between md:w-[360px]"
              >
                {selectedResourceOptions.length > 0
                  ? `${selectedResourceOptions.length} seleccionado(s)`
                  : planningMode === "assisted" ? "Todos los recursos" : "Selecciona recursos"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar recurso/persona/equipo..." />
                <CommandList>
                  <CommandEmpty>Sin resultados.</CommandEmpty>
                  <CommandGroup>
                    {resourceFilterOptions.map((resource) => {
                      const id = String(resource.id);
                      const checked = resourceFilterIds.includes(id);
                      const kindLabel =
                        resource.kind === "production"
                          ? "Producción"
                          : resource.kind === "editorial"
                            ? "Redacción"
                            : resource.kind === "itinerant_team"
                              ? "Itinerante"
                              : "Recurso";

                      return (
                        <CommandItem
                          key={id}
                          value={`${resource.label} ${kindLabel}`}
                          onSelect={() => toggleResourceFilter(id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              checked ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="truncate">{resource.label}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setResourceFilterIds([])}
            disabled={resourceFilterIds.length === 0}
          >
            Limpiar
          </Button>
        </div>

        {selectedResourceOptions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedResourceOptions.map((option) => (
              <Badge key={String(option.id)} variant="secondary" className="gap-2">
                <span>{option.label}</span>
                <button
                  type="button"
                  className="text-xs opacity-80 hover:opacity-100"
                  onClick={() => toggleResourceFilter(String(option.id))}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{planningMode === "assisted" ? "Mostrando todos los recursos. Selecciona para filtrar." : "Selecciona recursos"}</p>
        )}

        {resourceFilterOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay recursos para filtrar.</p>
        ) : null}
      </Card>
    )}
  </>);

  return (
    <Layout>
      <div className="w-full">
        <div className="mx-auto w-full max-w-[1800px] space-y-5">
        <DayHeader plan={plan as any} onNavigate={setActiveTab} onBack={() => setLocation("/plans")} />
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
          className="space-y-6"
        >
          <DayTabNavigation />

          <TabsContent forceMount hidden={activeTab !== "tasks"} value="tasks" className="space-y-6 mt-0">
            <DayCollapsibleSection title="Concursantes" open={contestantsOpen} onOpenChange={setContestantsOpen} testId="section-task-contestants" actions={
                <Button
                  variant="ghost"
                  size="sm"
                  title="Actualizar tareas con datos por defecto"
                  onClick={handleRefreshTasksFromTemplates}
                  disabled={!canEditDay || (refreshingTasksFromTemplates)}
                  className="gap-2"
                >
                  {refreshingTasksFromTemplates ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4" />
                      Actualizar tareas desde plantillas
                    </>
                  )}
                </Button>
              }>
              <div className="space-y-4">
                {contestants.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No hay concursantes creados todavía.
                  </p>
                )}

                <ContestantDayRoster contestants={contestants as any[]} tasks={plan.dailyTasks as any[]} coaches={coachOptions} onOpen={setSelectedContestant} canEdit={role === "admin" || role === "production"} deletePending={deleteContestant.isPending} onDelete={async contestant => {if(!await confirmDialog({title:"Eliminar concursante",description:`Se retirará a ${contestant.name} y sus tareas permitidas. Las tareas en curso o completadas permanecen protegidas.`,confirmText:"Eliminar"}))return; await deleteContestant.mutateAsync(contestant.id);if(selectedContestant?.id===contestant.id)setSelectedContestant(null);}} />

                <div className="grid grid-cols-1 gap-3 border-t pt-4 md:grid-cols-3">
                  <Input disabled={!canEditDay}
                    className="md:col-span-1"
                    placeholder="Nombre" aria-label="Nombre del nuevo concursante"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />

                  <Input disabled={!canEditDay}
                    className="md:col-span-1"
                    placeholder="Canción" aria-label="Canción del nuevo concursante"
                    value={newSong}
                    onChange={(e) => setNewSong(e.target.value)}
                  />

                  <Select disabled={!canEditDay}
                    value={newCoachPriId}
                    onValueChange={setNewCoachPriId}
                  >
                    <SelectTrigger className="md:col-span-1">
                      <SelectValue placeholder="Vocal Coach (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sin coach —</SelectItem>
                      {coachOptions.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="md:col-span-3 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Checkbox disabled={!canEditDay}
                        checked={newInstrument}
                        onCheckedChange={(v) => setNewInstrument(!!v)}
                      />
                      <span className="text-sm">Instrumento</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox disabled={!canEditDay}
                        checked={newAvailabilityEnabled}
                        onCheckedChange={(v) => {
                          const enabled = !!v;
                          setNewAvailabilityEnabled(enabled);
                          if (enabled && !newAvailabilityStart && !newAvailabilityEnd) {
                            setNewAvailabilityStart(String(plan?.workStart ?? ""));
                            setNewAvailabilityEnd(String(plan?.workEnd ?? ""));
                          }
                        }}
                      />
                      <span className="text-sm">Disponibilidad</span>
                    </div>

                    <Button
                      className="ml-auto"
                      onClick={handleCreateContestant}
                      disabled={!canEditDay || (createContestant.isPending)}
                    >
                      Añadir
                    </Button>
                  </div>

                  {newInstrument && (
                    <Input disabled={!canEditDay}
                      className="md:col-span-1"
                      placeholder="Instrumento"
                      value={newInstrumentName}
                      onChange={(e) => setNewInstrumentName(e.target.value)}
                    />
                  )}

                  {newAvailabilityEnabled && (
                    <>
                      <Input disabled={!canEditDay}
                        className="md:col-span-1"
                        type="time"
                        value={newAvailabilityStart}
                        onChange={(e) => setNewAvailabilityStart(e.target.value)}
                        title="Hora inicio"
                      />
                      <Input disabled={!canEditDay}
                        className="md:col-span-1"
                        type="time"
                        value={newAvailabilityEnd}
                        onChange={(e) => setNewAvailabilityEnd(e.target.value)}
                        title="Hora fin"
                      />
                    </>
                  )}
                </div>
              </div>
            </DayCollapsibleSection>

            <Dialog
              open={!!selectedContestant}
              onOpenChange={(open) => {
                if (!open) setSelectedContestant(null);
              }}
            >
              <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
                <DialogHeader>
                  <DialogTitle>
                    Ficha: {selectedContestant?.name ?? "Concursante"}
                  </DialogTitle>
                  <DialogDescription>
                    Gestiona tareas del día para este concursante.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {selectedContestant?<ContestantIdentity name={selectedContestant.name}/>:null}
                  {/* Info básica (editable) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-muted/30 rounded-lg p-3 border border-border">
                      <div className="text-xs text-muted-foreground mb-2">
                        Canción
                      </div>

                      <Input
                        value={editSongLocal}
                        onChange={(e) => setEditSongLocal(e.target.value)}
                        placeholder="(sin canción)"
                        onBlur={() => {
                          if (!selectedContestant?.id) return;

                          const next = editSongLocal.trim() || null;
                          const prev = selectedContestant?.song ?? null;

                          if (next === prev) return;

                          // Actualiza la ficha al instante (lo que tú acabas de escribir)
                          setSelectedContestant((cur: any) =>
                            cur?.id === selectedContestant.id
                              ? { ...cur, song: next }
                              : cur,
                          );

                          // Guarda en backend (sin depender de respuesta)
                          updateContestant.mutate({
                            contestantId: selectedContestant.id,
                            patch: { song: next },
                          });
                        }}
                        disabled={!canEditDay || (updateContestant.isPending)}
                      />
                    </div>

                    <div className="bg-muted/30 rounded-lg p-3 border border-border">
                      <div className="text-xs text-muted-foreground mb-2">
                        Vocal Coach
                      </div>

                      <Select
                        value={editCoachLocal}
                        onValueChange={(v) => {
                          setEditCoachLocal(v);

                          if (!selectedContestant?.id) return;

                          const next = v !== "none" ? Number(v) : null;
                          const prev =
                            selectedContestant?.vocalCoachPlanResourceItemId ??
                            null;

                          if (next === prev) return;

                          // Actualiza la ficha al instante
                          setSelectedContestant((cur: any) =>
                            cur?.id === selectedContestant.id
                              ? { ...cur, vocalCoachPlanResourceItemId: next }
                              : cur,
                          );

                          // Guarda en backend (sin depender de respuesta)
                          updateContestant.mutate({
                            contestantId: selectedContestant.id,
                            patch: { vocalCoachPlanResourceItemId: next },
                          });
                        }}
                        disabled={!canEditDay || (updateContestant.isPending)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="— Sin coach —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Sin coach —</SelectItem>
                          {coachOptions.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="mt-2 text-xs text-muted-foreground">
                        {selectedContestant?.vocalCoachPlanResourceItemId
                          ? coachLabelFor(
                              selectedContestant.vocalCoachPlanResourceItemId,
                            )
                          : "Sin coach"}
                      </div>
                    </div>
                  </div>

                  {/* Disponibilidad + Instrumento + Observaciones */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-muted/30 rounded-lg p-3 border border-border">
                      <div className="text-xs text-muted-foreground mb-2">
                        Disponibilidad del concursante
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-1">
                            Inicio
                          </div>
                          <Input
                            value={editAvailStartLocal}
                            onChange={(e) =>
                              setEditAvailStartLocal(e.target.value)
                            }
                            type="time"
                            step={60}
                            onBlur={() => {
                              if (!selectedContestant?.id) return;

                              const prev =
                                selectedContestant?.availabilityStart ?? null;
                              const nextStr = editAvailStartLocal.trim();
                              const next = nextStr || null;

                              // ✅ Formato HH:MM
                              if (next && parseHHMMToMinutes(next) === null) {
                                toast({
                                  title: "Hora inválida",
                                  description:
                                    'Usa formato "HH:MM" (ej. 09:30).',
                                  variant: "destructive",
                                });
                                setEditAvailStartLocal(String(prev ?? ""));
                                return;
                              }

                              // ✅ Fin debe ser > inicio (si ambos existen)
                              const endStr = String(
                                editAvailEndLocal ?? "",
                              ).trim();
                              if (next && endStr) {
                                const sMin = parseHHMMToMinutes(next);
                                const eMin = parseHHMMToMinutes(endStr);
                                if (
                                  sMin !== null &&
                                  eMin !== null &&
                                  eMin <= sMin
                                ) {
                                  toast({
                                    title: "Ventana inválida",
                                    description:
                                      "La hora de fin debe ser posterior a la de inicio.",
                                    variant: "destructive",
                                  });
                                  setEditAvailStartLocal(String(prev ?? ""));
                                  return;
                                }
                              }

                              if (next === prev) return;

                              setSelectedContestant((cur: any) =>
                                cur?.id === selectedContestant.id
                                  ? { ...cur, availabilityStart: next }
                                  : cur,
                              );

                              updateContestant.mutate({
                                contestantId: selectedContestant.id,
                                patch: { availabilityStart: next },
                              });
                            }}
                            disabled={!canEditDay || (updateContestant.isPending)}
                          />
                        </div>

                        <div>
                          <div className="text-[11px] text-muted-foreground mb-1">
                            Fin
                          </div>
                          <Input
                            value={editAvailEndLocal}
                            onChange={(e) =>
                              setEditAvailEndLocal(e.target.value)
                            }
                            type="time"
                            step={60}
                            onBlur={() => {
                              if (!selectedContestant?.id) return;

                              const prev =
                                selectedContestant?.availabilityEnd ?? null;
                              const nextStr = editAvailEndLocal.trim();
                              const next = nextStr || null;

                              // ✅ Formato HH:MM
                              if (next && parseHHMMToMinutes(next) === null) {
                                toast({
                                  title: "Hora inválida",
                                  description:
                                    'Usa formato "HH:MM" (ej. 18:15).',
                                  variant: "destructive",
                                });
                                setEditAvailEndLocal(String(prev ?? ""));
                                return;
                              }

                              // ✅ Fin debe ser > inicio (si ambos existen)
                              const startStr = String(
                                editAvailStartLocal ?? "",
                              ).trim();
                              if (next && startStr) {
                                const sMin = parseHHMMToMinutes(startStr);
                                const eMin = parseHHMMToMinutes(next);
                                if (
                                  sMin !== null &&
                                  eMin !== null &&
                                  eMin <= sMin
                                ) {
                                  toast({
                                    title: "Ventana inválida",
                                    description:
                                      "La hora de fin debe ser posterior a la de inicio.",
                                    variant: "destructive",
                                  });
                                  setEditAvailEndLocal(String(prev ?? ""));
                                  return;
                                }
                              }

                              if (next === prev) return;

                              setSelectedContestant((cur: any) =>
                                cur?.id === selectedContestant.id
                                  ? { ...cur, availabilityEnd: next }
                                  : cur,
                              );

                              updateContestant.mutate({
                                contestantId: selectedContestant.id,
                                patch: { availabilityEnd: next },
                              });
                            }}
                            disabled={!canEditDay || (updateContestant.isPending)}
                          />
                        </div>
                      </div>

                      <div className="mt-2 text-[11px] text-muted-foreground">
                        (El motor usará el más restrictivo entre Plan y
                        Concursante en el siguiente lote)
                      </div>
                    </div>

                    <div className="bg-muted/30 rounded-lg p-3 border border-border">
                      <div className="text-xs text-muted-foreground mb-2">
                        Instrumento
                      </div>

                      <div className="flex items-center gap-2">
                        <Checkbox disabled={!canEditDay}
                          checked={editInstrumentLocal}
                          onCheckedChange={(v) => {
                            const next = !!v;
                            setEditInstrumentLocal(next);

                            if (!selectedContestant?.id) return;

                            const prev = !!selectedContestant?.instrument;
                            if (next === prev) return;

                            setSelectedContestant((cur: any) =>
                              cur?.id === selectedContestant.id
                                ? { ...cur, instrument: next }
                                : cur,
                            );

                            updateContestant.mutate({
                              contestantId: selectedContestant.id,
                              patch: { instrument: next },
                            });
                          }}
                        />
                        <span className="text-sm">Tiene instrumento</span>
                      </div>

                      {editInstrumentLocal ? (
                        <div className="mt-2">
                          <div className="text-[11px] text-muted-foreground mb-1">
                            ¿Qué instrumento?
                          </div>
                          <Input
                            value={editInstrumentNameLocal}
                            onChange={(e) =>
                              setEditInstrumentNameLocal(e.target.value)
                            }
                            placeholder="guitarra, teclado, batería..."
                            onBlur={() => {
                              if (!selectedContestant?.id) return;

                              const next =
                                editInstrumentNameLocal.trim() || null;
                              const prev =
                                selectedContestant?.instrumentName ?? null;
                              if (next === prev) return;

                              setSelectedContestant((cur: any) =>
                                cur?.id === selectedContestant.id
                                  ? { ...cur, instrumentName: next }
                                  : cur,
                              );

                              updateContestant.mutate({
                                contestantId: selectedContestant.id,
                                patch: { instrumentName: next },
                              });
                            }}
                            disabled={!canEditDay || (updateContestant.isPending)}
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="md:col-span-2 bg-muted/30 rounded-lg p-3 border border-border">
                      <div className="text-xs text-muted-foreground mb-2">
                        Observaciones
                      </div>

                      <Textarea
                        value={editNotesLocal}
                        onChange={(e) => setEditNotesLocal(e.target.value)}
                        placeholder="Escribe aquí cualquier cosa..."
                        onBlur={() => {
                          if (!selectedContestant?.id) return;

                          const next = editNotesLocal.trim() || null;
                          const prev = selectedContestant?.notes ?? null;
                          if (next === prev) return;

                          setSelectedContestant((cur: any) =>
                            cur?.id === selectedContestant.id
                              ? { ...cur, notes: next }
                              : cur,
                          );

                          updateContestant.mutate({
                            contestantId: selectedContestant.id,
                            patch: { notes: next },
                          });
                        }}
                        disabled={!canEditDay || (updateContestant.isPending)}
                        className="min-h-[90px]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      Tareas asignadas
                    </h3>

                    <div className="flex items-center gap-2">
                      <AddTaskDialog disabled={!canEditDay}
                        planId={id}
                        contestantId={selectedContestant?.id ?? null}
                      />
                    </div>
                  </div>

                  {/* Tareas del concursante */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Tareas asignadas</h3>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {contestantTasks.length} tareas
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setContestantTasksMode((m) => (m === "list" ? "cards" : "list"))}
                        >
                          {contestantTasksMode === "list" ? "Modo tarjetas" : "Modo lista"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleCancelContestantTasks} disabled={isSaving}>
                          Cancelar
                        </Button>
                        <Button size="sm" onClick={() => void handleSaveContestantTasks()} disabled={!canEditDay || (!isDirty || isSaving)}>
                          {isSaving ? "Guardando..." : "Guardar"}
                        </Button>
                      </div>
                    </div>

                    {saveError ? (
                      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                        {saveError}
                      </div>
                    ) : null}

                    {contestantTasksMode === "list" ? (
                      <div className="rounded-lg border border-border p-3">
                        <div className="grid grid-cols-11 gap-2 px-2 pb-2 text-muted-foreground text-[10px] uppercase tracking-wide">
                          <div>Tarea</div><div>Inicio</div><div>Fin</div><div>Duración</div><div>Plató</div><div>Espacio</div><div>Comentario 1</div><div>Color C1</div><div>Comentario 2</div><div>Color C2</div><div>Estado/Acciones</div>
                        </div>
                        <div className="space-y-2">
                          {contestantTasks.map((t: any) => {
                            const draft = draftById[Number(t.id)] ?? buildTaskDraft(t);
                            const locked = t.status === "in_progress" || t.status === "done";

                            return (
                              <ContestantDailyTaskEditor
                                key={t.id}
                                task={t}
                                variant="list"
                                draft={draft}
                                locked={!canEditDay || (locked)}
                                zones={zones}
                                spaces={spaces}
                                onChangeDraft={(fn) => updateDraftTask(t, fn)}
                                allowedStatuses={allowedExecutionStates(t)}
                                onChangeStatus={canChangeExecution(t) ? (next) => updateTaskStatus.mutate({ taskId: t.id, planId: id, expectedStatus: t.status, status: next as any }) : undefined}
                                onDelete={async () => {
                                  await apiRequest("DELETE", buildUrl(api.dailyTasks.delete.path, { id: t.id }));
                                  await queryClient.invalidateQueries({ queryKey: [buildUrl(api.plans.get.path, { id })] });
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
                        {contestantTasks.map((t: any) => {
                          const draft = draftById[Number(t.id)] ?? buildTaskDraft(t);
                          return (
                          <button
                            key={t.id}
                            type="button"
                            className="rounded-lg p-2 border border-border border-l-4 text-left hover:bg-muted/30 transition min-h-[76px]"
                            style={{ borderLeftColor: t?.template?.uiColor ?? '#e5e7eb' }}
                            onClick={() => setContestantDetailTask(t)}
                          >
                            <div className="text-sm font-medium truncate">{t.template?.name || `Template #${t.templateId}`}</div>
                            <div className="mt-1 text-xs text-muted-foreground truncate">{draft.startPlanned || '—'} - {draft.endPlanned || '—'} · {draft.durationOverride || '—'} min</div>
                            <div className="text-xs mt-1">{t.status || 'pending'}</div>
                            {(draft.comment1Text || draft.comment2Text) ? (
                              <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                                {[draft.comment1Text, draft.comment2Text].filter(Boolean).join(' · ')}
                              </div>
                            ) : null}
                          </button>
                          );
                        })}
                      </div>
                    )}

                    {contestantTasks.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No hay tareas asignadas todavía.</div>
                    ) : null}

                    <Dialog open={!!contestantDetailTask} onOpenChange={(open) => { if (!open) setContestantDetailTask(null); }}>
                      <DialogContent className="sm:max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>{contestantDetailTask?.template?.name || `Tarea #${contestantDetailTask?.id ?? ''}`}</DialogTitle>
                          <DialogDescription>Detalle de la tarea del concursante</DialogDescription>
                        </DialogHeader>
                        {contestantDetailTask ? (
                          <ContestantDailyTaskEditor
                            task={contestantDetailTask}
                            variant="detail"
                            draft={draftById[Number(contestantDetailTask.id)] ?? buildTaskDraft(contestantDetailTask)}
                            locked={!canEditDay || (contestantDetailTask.status === "in_progress" || contestantDetailTask.status === "done")}
                            zones={zones}
                            spaces={spaces}
                            onChangeDraft={(fn) => updateDraftTask(contestantDetailTask, fn)}
                            allowedStatuses={allowedExecutionStates(contestantDetailTask)}
                            onChangeStatus={canChangeExecution(contestantDetailTask) ? (next) => updateTaskStatus.mutate({ taskId: contestantDetailTask.id, planId: id, expectedStatus: contestantDetailTask.status, status: next as any }) : undefined}
                            onDelete={async () => {
                              await apiRequest("DELETE", buildUrl(api.dailyTasks.delete.path, { id: contestantDetailTask.id }));
                              await queryClient.invalidateQueries({ queryKey: [buildUrl(api.plans.get.path, { id })] });
                            }}
                          />
                        ) : null}
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={handleCancelContestantTasks}
                    >
                      Cerrar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <UnassignedDayTasks planId={id} tasks={plan.dailyTasks as any[]} spaces={spaces as any[]} zones={zones as any[]} canEdit={role==="admin"||role==="production"} onPlanning={()=>setActiveTab("planning")} onEdit={task=>{setShowAdminTasks(true);setUnplannedFocusTaskId(Number(task.id));setTimeout(()=>document.querySelector(`[data-day-task="${task.id}"]`)?.scrollIntoView({block:"center",behavior:"smooth"}),50);}} />
            {/* Tasks Section */}
            <DayCollapsibleSection title="Detalle de todas las tareas" open={showAdminTasks} onOpenChange={setShowAdminTasks} testId="section-task-administration">
                  <p className="pb-2 text-sm text-muted-foreground">Recomendado: asigna y gestiona tareas desde la ficha de cada concursante.</p>
                  <div className="flex items-center justify-between gap-3 pb-2">
                    <p className="text-sm text-muted-foreground">
                      (Opcional) Crear una tarea global sin pasar por la ficha.
                    </p>
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button disabled={!canEditDay} variant="ghost" size="sm" className="h-auto px-2 py-1" onClick={() => setLocksDialogOpen(true)}>
                            <Badge variant="secondary">Locks (time): {timeLockedTaskIds.size}</Badge>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Ver detalle de locks guardados en el plan.
                        </TooltipContent>
                      </Tooltip>
                      <Button
                        variant={showLockedOnly ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowLockedOnly((v) => !v)}
                      >
                        {showLockedOnly ? "Mostrar todas" : "Mostrar solo fijadas"}
                      </Button>
                      {tasksShowUnplannedOnly ? (
                        <Button variant="outline" size="sm" onClick={() => setTasksShowUnplannedOnly(false)}>
                          Ver todas
                        </Button>
                      ) : null}
                      <Button disabled={!canEditDay} variant="destructive" size="sm" onClick={() => setClearTimeLocksDialogOpen(true)}>
                        Liberar todas
                      </Button>
                      <AddTaskDialog disabled={!canEditDay} planId={id} />
                    </div>
                  </div>

                  <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[300px]">
                            Plantilla de tarea
                          </TableHead>
                          <TableHead>Concursante</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Inicio previsto</TableHead>
                          <TableHead>Fin previsto</TableHead>
                          <TableHead className="w-[140px]">Duración</TableHead>
                          <TableHead className="w-[140px]">Cámaras</TableHead>
                          <TableHead className="w-[200px]">Plató</TableHead>
                          <TableHead className="w-[220px]">Espacio</TableHead>
                          <TableHead className="w-[180px]">Comment 1</TableHead>
                          <TableHead className="w-[140px]">Color C1</TableHead>
                          <TableHead className="w-[180px]">Comment 2</TableHead>
                          <TableHead className="w-[140px]">Color C2</TableHead>
                          <TableHead className="w-[90px]">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {plan.dailyTasks?.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="h-32 text-center text-muted-foreground"
                            >
                              No tasks added yet. Add tasks to generate a
                              schedule.
                            </TableCell>
                          </TableRow>
                        ) : (
                          (plan.dailyTasks ?? [])
                            .filter((task: any) =>
                              tasksShowUnplannedOnly
                                ? String(task?.status ?? "pending") === "pending" && task?.isManualBlock !== true && task?.is_manual_block !== true && (!task?.startPlanned || !task?.endPlanned)
                                : true,
                            )
                            .filter((task: any) =>
                              showLockedOnly
                                ? timeLockedTaskIds.has(Number(task?.id)) || Boolean(task?.isManualBlock ?? task?.is_manual_block)
                                : true,
                            )
                            .map((task: any) => (
                            <TableRow key={task.id} data-day-task={task.id}>
                              <TableCell className="font-medium">
                                {task.template?.name ||
                                  `Template #${task.templateId}`}
                              </TableCell>
                              <TableCell>
                                {task.contestantId
                                  ? (contestants.find(
                                      (c) => c.id === task.contestantId,
                                    )?.name ?? `#${task.contestantId}`)
                                  : "—"}
                              </TableCell>
                              <TableCell>
                                <Select disabled={!canEditDay}
                                  value={task.status || "pending"}
                                  onValueChange={(next) => {
                                    updateTaskStatus.mutate({
                                      taskId: task.id,
                                      planId: id,
                                      status: next as "pending" | "in_progress" | "done" | "interrupted" | "cancelled",
                                    });
                                  }}
                                >
                                  <SelectTrigger className="w-[160px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending">
                                      pending
                                    </SelectItem>
                                    <SelectItem value="in_progress">
                                      in_progress
                                    </SelectItem>
                                    <SelectItem value="done">done</SelectItem>
                                    <SelectItem value="interrupted">
                                      interrupted
                                    </SelectItem>
                                    <SelectItem value="cancelled">
                                      cancelled
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {task.startPlanned || "-"}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {task.endPlanned || "-"}
                              </TableCell>

                              <TableCell>
                                {task.status !== "in_progress" &&
                                task.status !== "done" ? (
                                  <Input disabled={!canEditDay}
                                    type="number"
                                    className="h-8"
                                    defaultValue={task.durationOverride ?? ""}
                                    placeholder="min"
                                    onBlur={async (e) => {
                                      const v = e.currentTarget.value.trim();
                                      await apiRequest(
                                        "PATCH",
                                        buildUrl(api.dailyTasks.update.path, {
                                          id: task.id,
                                        }),
                                        {
                                          durationOverride:
                                            v === "" ? undefined : Number(v),
                                        },
                                      );
                                      queryClient.invalidateQueries({
                                        queryKey: [
                                          buildUrl(api.plans.get.path, { id }),
                                        ],
                                      });
                                      toast({ title: "Duration updated" });
                                    }}
                                  />
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    Locked
                                  </span>
                                )}
                              </TableCell>

                              <TableCell>
                                {task.status !== "in_progress" &&
                                task.status !== "done" ? (
                                  <Input disabled={!canEditDay}
                                    type="number"
                                    className="h-8"
                                    defaultValue={task.camerasOverride ?? ""}
                                    placeholder="0.."
                                    onBlur={async (e) => {
                                      const v = e.currentTarget.value.trim();
                                      await apiRequest(
                                        "PATCH",
                                        buildUrl(api.dailyTasks.update.path, {
                                          id: task.id,
                                        }),
                                        {
                                          camerasOverride:
                                            v === "" ? undefined : Number(v),
                                        },
                                      );
                                      queryClient.invalidateQueries({
                                        queryKey: [
                                          buildUrl(api.plans.get.path, { id }),
                                        ],
                                      });
                                      toast({ title: "Cameras updated" });
                                    }}
                                  />
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    Locked
                                  </span>
                                )}
                              </TableCell>

                              {(() => {
                                const zoneRaw =
                                  task.zoneId ?? task.zone_id ?? null;
                                const spaceRaw =
                                  task.spaceId ?? task.space_id ?? null;
                                const zoneId =
                                  zoneRaw === null || zoneRaw === undefined
                                    ? null
                                    : Number(zoneRaw);
                                const spaceId =
                                  spaceRaw === null || spaceRaw === undefined
                                    ? null
                                    : Number(spaceRaw);
                                const locationLabel =
                                  task.locationLabel ??
                                  task.location_label ??
                                  null;

                                const locked =
                                  task.status === "in_progress" ||
                                  task.status === "done";

                                return (
                                  <>
                                    <TableCell>
                                      {zonesLoading ? (
                                        <span className="text-xs text-muted-foreground">
                                          Cargando…
                                        </span>
                                      ) : locked ? (
                                        zoneId ? (
                                          (zonesById.get(zoneId)?.name ?? "—")
                                        ) : (
                                          (locationLabel ?? "—")
                                        )
                                      ) : (
                                        <Select disabled={!canEditDay}
                                          value={
                                            zoneId === null
                                              ? locationLabel
                                                ? "deleted"
                                                : "none"
                                              : String(zoneId)
                                          }
                                          onValueChange={async (v) => {
                                            const nextZoneId =
                                              v === "none" || v === "deleted"
                                                ? null
                                                : Number(v);
                                            await apiRequest(
                                              "PATCH",
                                              buildUrl(
                                                api.dailyTasks.update.path,
                                                {
                                                  id: task.id,
                                                },
                                              ),
                                              {
                                                zoneId: nextZoneId,
                                                spaceId: null, // al cambiar plató, resetea espacio
                                              },
                                            );
                                            queryClient.invalidateQueries({
                                              queryKey: [
                                                buildUrl(api.plans.get.path, {
                                                  id,
                                                }),
                                              ],
                                            });
                                            toast({
                                              title: "Plató actualizado",
                                            });
                                          }}
                                        >
                                          <SelectTrigger className="h-8">
                                            <SelectValue placeholder="—" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {locationLabel ? (
                                              <SelectItem
                                                value="deleted"
                                                disabled
                                              >
                                                {locationLabel}
                                              </SelectItem>
                                            ) : null}
                                            <SelectItem value="none">
                                              —
                                            </SelectItem>
                                            {(zones as any[]).map((z: any) => (
                                              <SelectItem
                                                key={z.id}
                                                value={String(z.id)}
                                              >
                                                {z.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    </TableCell>

                                    <TableCell>
                                      {spacesLoading ? (
                                        <span className="text-xs text-muted-foreground">
                                          Cargando…
                                        </span>
                                      ) : locked ? (
                                        spaceId ? (
                                          ((spaces as any[]).find(
                                            (s: any) =>
                                              Number(s.id) === spaceId,
                                          )?.name ?? "—")
                                        ) : (
                                          (locationLabel ?? "—")
                                        )
                                      ) : (
                                        <Select
                                          value={
                                            spaceId === null
                                              ? locationLabel
                                                ? "deleted"
                                                : "none"
                                              : String(spaceId)
                                          }
                                          onValueChange={async (v) => {
                                            const nextSpaceId =
                                              v === "none" || v === "deleted"
                                                ? null
                                                : Number(v);
                                            await apiRequest(
                                              "PATCH",
                                              buildUrl(
                                                api.dailyTasks.update.path,
                                                {
                                                  id: task.id,
                                                },
                                              ),
                                              {
                                                zoneId,
                                                spaceId: nextSpaceId,
                                              },
                                            );
                                            queryClient.invalidateQueries({
                                              queryKey: [
                                                buildUrl(api.plans.get.path, {
                                                  id,
                                                }),
                                              ],
                                            });
                                            toast({
                                              title: "Espacio actualizado",
                                            });
                                          }}
                                          disabled={!canEditDay || (zoneId === null)}
                                        >
                                          <SelectTrigger className="h-8">
                                            <SelectValue
                                              placeholder={
                                                zoneId === null
                                                  ? "Plató primero"
                                                  : "—"
                                              }
                                            />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {locationLabel ? (
                                              <SelectItem
                                                value="deleted"
                                                disabled
                                              >
                                                {locationLabel}
                                              </SelectItem>
                                            ) : null}

                                            <SelectItem value="none">
                                              —
                                            </SelectItem>

                                            {(
                                              (spacesByZone.get(zoneId ?? -1) ??
                                                []) as any[]
                                            ).map((s: any) => {
                                              const parent =
                                                s.parentSpaceId ??
                                                s.parent_space_id ??
                                                null;
                                              const label = parent
                                                ? `↳ ${s.name}`
                                                : s.name;
                                              return (
                                                <SelectItem
                                                  key={s.id}
                                                  value={String(s.id)}
                                                >
                                                  {label}
                                                </SelectItem>
                                              );
                                            })}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    </TableCell>
                                  </>
                                );
                              })()}

                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      openTimeLockDialog(task);
                                    }}
                                  >
                                    <Lock className="h-4 w-4 mr-1" /> Fijar
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={async () => {
                                      await apiRequest("DELETE", `/api/daily-tasks/${task.id}/lock`);
                                      queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                                      toast({ title: "Fijación eliminada" });
                                    }}
                                  >
                                    Quitar
                                  </Button>
                                  {task.status !== "in_progress" && task.status !== "done" ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={async () => {
                                        const ok = await confirmDialog({
                                          title: "Eliminar tarea",
                                          description: "¿Eliminar esta tarea?",
                                          confirmText: "Eliminar",
                                        });
                                        if (!ok) return;
                                        await apiRequest("DELETE", buildUrl(api.dailyTasks.delete.path, { id: task.id }));
                                        queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                                        toast({ title: "Task deleted" });
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
            </DayCollapsibleSection>

            <Dialog open={locksDialogOpen} onOpenChange={setLocksDialogOpen}>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Locks del plan</DialogTitle>
                  <DialogDescription>Detalle de fijaciones registradas en el plan actual.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {(((plan as any)?.locks ?? []) as any[]).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay locks guardados.</p>
                  ) : (
                    (((plan as any)?.locks ?? []) as any[]).map((lock: any, idx: number) => {
                      const taskId = Number(lock?.taskId ?? lock?.task_id);
                      const task = ((plan?.dailyTasks ?? []) as any[]).find((t: any) => Number(t?.id) === taskId) as any;
                      const contestantId = Number(task?.contestantId ?? task?.contestant_id);
                      const contestant = (contestants ?? []).find((c: any) => Number(c?.id) === contestantId);
                      const lockType = String(lock?.type ?? lock?.lockType ?? lock?.lock_type ?? "time");
                      const lockReason = String(lock?.reason ?? "");
                      const isExecutionLock = lockType === "full" && lockReason.toLowerCase().includes("execution lock");
                      const lockTypeLabel = isExecutionLock ? "execution" : lockType;
                      const hasExecution =
                        task?.status === "in_progress" ||
                        task?.status === "done" ||
                        Boolean(task?.startReal) ||
                        Boolean(task?.endReal);
                      return (
                        <div key={`${taskId}-${idx}`} className="rounded-md border p-2 text-sm">
                          <div><span className="font-medium">Task:</span> #{Number.isFinite(taskId) ? taskId : "—"} · {task?.template?.name ?? "(sin nombre)"}</div>
                          <div><span className="font-medium">Concursante:</span> {contestant?.name ?? (Number.isFinite(contestantId) ? `#${contestantId}` : "—")}</div>
                          <div>
                            <span className="font-medium">Tipo lock:</span> {lockTypeLabel}
                            {isExecutionLock ? (
                              <span className="ml-2 text-xs text-muted-foreground" title="Bloqueo automático por ejecución (in_progress/done). Se elimina al resetear ejecución.">
                                ℹ️
                              </span>
                            ) : null}
                          </div>
                          <div><span className="font-medium">Inicio/fin lock:</span> {String(lock?.locked_start ?? lock?.lockedStart ?? "—")} → {String(lock?.locked_end ?? lock?.lockedEnd ?? "—")}</div>
                          {hasExecution ? (
                            <div><span className="font-medium">Ejecución real:</span> sí ({task?.status ?? "—"})</div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
                <DialogFooter>
                  <Button disabled={!canEditDay} variant="outline" onClick={() => setLocksDialogOpen(false)}>Cerrar</Button>
                  {timeLockedTaskIds.size > 0 ? (
                    <Button disabled={!canEditDay} variant="destructive" onClick={() => {
                      setLocksDialogOpen(false);
                      setClearTimeLocksDialogOpen(true);
                    }}>
                      Limpiar locks de tiempo
                    </Button>
                  ) : null}
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={clearTimeLocksDialogOpen} onOpenChange={setClearTimeLocksDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Liberar todas las fijaciones horarias</DialogTitle>
                  <DialogDescription>
                    Esto liberará fijaciones horarias (time locks) de tareas pendientes. No toca in_progress/done ni manual_blocks.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button disabled={!canEditDay} variant="outline" onClick={() => setClearTimeLocksDialogOpen(false)}>Cancelar</Button>
                  <Button disabled={!canEditDay}
                    variant="destructive"
                    onClick={async () => {
                      await apiRequest("DELETE", buildUrl(api.plans.clearTimeLocks.path, { id }));
                      queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                      setClearTimeLocksDialogOpen(false);
                      toast({ title: "Fijaciones horarias liberadas" });
                    }}
                  >
                    Liberar todas
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset del planning</DialogTitle>
                  <DialogDescription>
                    Reset parcial limpia solo tareas no ejecutadas y sin lock fijo. Reset total limpia todo lo no ejecutado y elimina locks de esas tareas.
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-md border p-3 text-sm text-muted-foreground">
                  Las tareas en estado in_progress o done no se tocan.
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setResetDialogOpen(false)} disabled={resetPending}>Cancelar</Button>
                  <Button variant="secondary" onClick={() => void onResetPlan("partial")} disabled={resetPending}>{resetPending ? "Procesando..." : "Reset V3"}</Button>
                  <Button variant="secondary" onClick={() => void onResetPlan("v4")} disabled={resetPending}>{resetPending ? "Procesando..." : "Eliminar resultado V4"}</Button>
                  <Button variant="destructive" onClick={() => void onResetPlan("complete")} disabled={resetPending}>{resetPending ? "Procesando..." : "Reset completo"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent forceMount hidden={activeTab !== "planning"} value="planning" className="mt-0">
            <div className="space-y-4">
              {role === "admin" ? <details className="rounded-lg border bg-muted/10 p-3" onToggle={event => setShowMaintenance(event.currentTarget.open)}><summary className="cursor-pointer text-sm text-muted-foreground">Herramientas históricas y mantenimiento</summary><p className="my-3 text-sm text-muted-foreground">Operaciones de generaciones anteriores. La planificación habitual se realiza con Assisted.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20"
              onClick={() => { void handleGenerate(); }}
              disabled={generatePlan.isPending}
            >
              {generatePlan.isPending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Play className="mr-2 h-5 w-5" />
              )}
              {generatePlan.isPending
                ? "Planificando..."
                : "Generar V3"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={async () => {
                setSelectedPlanningEngine("v4");
                setV4ResultState("loading");
                try {
                  const response = await generatePlan.mutateAsync({ id, mode: "generate_planning", timeLimitMs: planningTimeLimitSec * 1000, engineVersion: "v4" }) as any;
                  const expectedRunId = Number(response?.runId ?? NaN);
                  setV4ResultState("pending_diagnostics");
                  await queryClient.invalidateQueries({ queryKey: ["engine-result", id, "v4"] });
                  let found = false;
                  for (let attempt = 0; attempt < 12; attempt += 1) {
                    const result = await v4ResultQ.refetch();
                    const row = result.data as any;
                    if (row?.id && (!Number.isFinite(expectedRunId) || Number(row?.planningRunId) === expectedRunId)) {
                      found = true;
                      break;
                    }
                    await new Promise((resolve) => window.setTimeout(resolve, 1000));
                  }
                  setV4ResultState(found ? "success" : "idle");
                  toast({ title: "Planificación V4 generada", description: found ? "Resultado V4/ORC disponible sin recargar la página." : "Guardada separada de V3; esperando diagnóstico persistido." });
                } catch (err: any) {
                  setV4ResultState("error");
                  toast({ title: "No se pudo generar V4", description: err?.message || "Error desconocido", variant: "destructive" });
                }
              }}
              disabled={generatePlan.isPending || v4ResultState === "loading"}
            >
              {generatePlan.isPending || v4ResultState === "loading" ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
              {v4ResultState === "loading" ? "Generando V4/ORC..." : "Generar V4"}
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Límite</span>
              <Select value={String(planningTimeLimitSec)} onValueChange={(v) => setPlanningTimeLimitSec(Number(v))}>
                <SelectTrigger className="w-[110px] h-10">
                  <SelectValue placeholder="Tiempo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10s</SelectItem>
                  <SelectItem value="30">30s</SelectItem>
                  <SelectItem value="60">60s</SelectItem>
                  <SelectItem value="180">180s</SelectItem>
                  <SelectItem value="300">300s</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                setPlanningInProgress(true);
                setExpectedPlanningRunId(null);
                void (async () => {
                  try {
                    await generatePlan.mutateAsync({ id, mode: "plan_pending", timeLimitMs: planningTimeLimitSec * 1000 });
                    await queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                    await queryClient.refetchQueries({ queryKey: planQueryKey(id) });
                  } catch (err: any) {
                    if (isAbortLikeError(err)) {
                      toast({ title: "La optimización tardó más de lo esperado, comprobando estado..." });
                      await queryClient.refetchQueries({ queryKey: planQueryKey(id) });
                    }
                  } finally {
                    setPlanningInProgress(false);
                  }
                })();
              }}
              disabled={generatePlan.isPending}
            >
              Planificar pendientes
            </Button>
            <Button variant="outline" onClick={openEdit}>
              Editar día
            </Button>
          </div>
                <Button className="mt-3" size="sm" variant="outline" onClick={() => setPlanningMode(planningMode === "assisted" ? "legacy" : "assisted")}>{planningMode === "assisted" ? "Abrir planificación histórica" : "Volver a Assisted"}</Button>
              </details> : null}
              {planningMode === "legacy" ? <Button variant="outline" onClick={() => setPlanningMode("assisted")}>Volver al Workspace Assisted</Button> : null}
              {planningMode === "assisted" ? planningVisited ? <AssistedPlanningWorkspace key={id}
                planId={id}
                plan={assistedDayPlan as any}
                spaces={spaces as any[]}
                onOpenExecution={openExecution}
                timelineProps={assistedTimelineProps}
              /> : null : <>
              <Card className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Planificación consultada</div>
                    <div className="text-xs text-muted-foreground">V3 escribe en el plan actual; V4 se guarda como resultado paralelo separado.</div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant={selectedPlanningEngine === "v3" ? "default" : "outline"} onClick={() => setSelectedPlanningEngine("v3")}>
                      Ver planificación V3
                    </Button>
                    <Button type="button" size="sm" variant={selectedPlanningEngine === "v4" ? "default" : "outline"} onClick={() => setSelectedPlanningEngine("v4")}>
                      Ver planificación V4
                    </Button>
                  </div>
                </div>
              </Card>
              <PlanEngineDiagnostics
                planId={id}
                tasks={plan?.dailyTasks as unknown[] | undefined}
                contestants={contestants as unknown[]}
                resourceNamesById={planResourceItemNameById}
                planningActive={planningInProgress || getPlanningRunUiState(planningRunQ.data) === "active"}
                latestSuccessRunId={planningRunQ.data?.status === "success" ? Number(planningRunQ.data.id) : null}
                currentResult={selectedPlanningEngine}
                v4ResultState={v4ResultState}
              />
              {selectedPlanningEngine === "v4" ? (
                <Card className="p-4">
                  <CardHeader className="p-0 pb-3">
                    <CardTitle className="text-base">Diagnosis Motor V4</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 text-sm">
                    <V4StrategicDiagnosis result={v4ResultQ.data} isLoading={v4ResultQ.isLoading} error={v4ResultQ.error} state={v4ResultState} />
                  </CardContent>
                </Card>
              ) : null}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold">Visual Timeline</h2>

                  {planningViewSelector}
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-50/50">
                    Vista:{" "}
                    {timelineView === "contestants"
                      ? "Concursantes"
                      : timelineView === "spaces"
                        ? "Espacios"
                        : "Recursos"}
                  </Badge>
                  <Badge variant="outline" className="bg-emerald-50/50">
                    Tasks:{" "}
                    {(planningViewPlan as any)?.dailyTasks?.filter((t: any) => t.startPlanned).length}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLocksDialogOpen(true)}
                  >
                    Locks: {((plan as any)?.locks ?? []).length}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-amber-50/60"
                    title="Tareas pending sin inicio/fin planificado"
                    onClick={() => setUnplannedDialogOpen(true)}
                  >
                    Pendientes sin planificar: {unplannedTasks.length}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setResetDialogOpen(true)}
                  >
                    Reset
                  </Button>
                </div>
              </div>

              <Dialog open={locksDialogOpen} onOpenChange={setLocksDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Locks del plan</DialogTitle>
                    <DialogDescription>Detalle de fijaciones registradas en el plan actual.</DialogDescription>
                  </DialogHeader>
                  <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {(((plan as any)?.locks ?? []) as any[]).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No hay locks guardados.</p>
                    ) : (
                      (((plan as any)?.locks ?? []) as any[]).map((lock: any, idx: number) => {
                        const taskId = Number(lock?.taskId ?? lock?.task_id);
                        const task = ((plan?.dailyTasks ?? []) as any[]).find((t: any) => Number(t?.id) === taskId) as any;
                        const contestantId = Number(task?.contestantId ?? task?.contestant_id);
                        const contestant = (contestants ?? []).find((c: any) => Number(c?.id) === contestantId);
                        const lockType = String(lock?.type ?? lock?.lockType ?? lock?.lock_type ?? "time");
                        const lockReason = String(lock?.reason ?? "");
                        const isExecutionLock = lockType === "full" && lockReason.toLowerCase().includes("execution lock");
                        const lockTypeLabel = isExecutionLock ? "execution" : lockType;
                        const hasExecution =
                          task?.status === "in_progress" ||
                          task?.status === "done" ||
                          Boolean(task?.startReal) ||
                          Boolean(task?.endReal);
                        return (
                          <div key={`${taskId}-${idx}`} className="rounded-md border p-2 text-sm">
                            <div><span className="font-medium">Task:</span> #{Number.isFinite(taskId) ? taskId : "—"} · {task?.template?.name ?? "(sin nombre)"}</div>
                            <div><span className="font-medium">Concursante:</span> {contestant?.name ?? (Number.isFinite(contestantId) ? `#${contestantId}` : "—")}</div>
                            <div>
                              <span className="font-medium">Tipo lock:</span> {lockTypeLabel}
                              {isExecutionLock ? (
                                <span className="ml-2 text-xs text-muted-foreground" title="Bloqueo automático por ejecución (in_progress/done). Se elimina al resetear ejecución.">
                                  ℹ️
                                </span>
                              ) : null}
                            </div>
                            <div><span className="font-medium">Origen:</span> {String(lock?.source ?? "(sin source)")}</div>
                            <div><span className="font-medium">Inicio/fin lock:</span> {String(lock?.locked_start ?? lock?.lockedStart ?? "—")} → {String(lock?.locked_end ?? lock?.lockedEnd ?? "—")}</div>
                            {hasExecution ? (
                              <div><span className="font-medium">Ejecución real:</span> sí ({task?.status ?? "—"})</div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setLocksDialogOpen(false)}>Cerrar</Button>
                    {timeLockedTaskIds.size > 0 ? (
                      <Button variant="destructive" onClick={() => {
                        setLocksDialogOpen(false);
                        setClearTimeLocksDialogOpen(true);
                      }}>
                        Limpiar locks de tiempo
                      </Button>
                    ) : null}
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={clearTimeLocksDialogOpen} onOpenChange={setClearTimeLocksDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Liberar todas las fijaciones horarias</DialogTitle>
                    <DialogDescription>
                      Esto liberará fijaciones horarias (time locks) de tareas pendientes. No toca in_progress/done ni manual_blocks.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setClearTimeLocksDialogOpen(false)}>Cancelar</Button>
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        await apiRequest("DELETE", buildUrl(api.plans.clearTimeLocks.path, { id }));
                        queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                        setClearTimeLocksDialogOpen(false);
                        toast({ title: "Fijaciones horarias liberadas" });
                      }}
                    >
                      Liberar todas
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Reset del planning</DialogTitle>
                    <DialogDescription>
                      Reset parcial limpia solo tareas no ejecutadas y sin lock fijo. Reset total limpia todo lo no ejecutado y elimina locks de esas tareas.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="rounded-md border p-3 text-sm text-muted-foreground">
                    Las tareas en estado in_progress o done no se tocan.
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setResetDialogOpen(false)} disabled={resetPending}>Cancelar</Button>
                    <Button variant="secondary" onClick={() => void onResetPlan("partial")} disabled={resetPending}>{resetPending ? "Procesando..." : "Reset V3"}</Button>
                    <Button variant="secondary" onClick={() => void onResetPlan("v4")} disabled={resetPending}>{resetPending ? "Procesando..." : "Eliminar resultado V4"}</Button>
                    <Button variant="destructive" onClick={() => void onResetPlan("complete")} disabled={resetPending}>{resetPending ? "Procesando..." : "Reset completo"}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {planningViewFilters}

              <FullscreenPlanningPanel
                title="Planning"
                viewKey={`plan-${id}-${timelineView}-${spaceVerticalMode}`}
                supportsZoom
                hydrationBlocked={planningInProgress}
              >
                <div className="relative flex min-h-0 flex-1 flex-col">
                {(planningInProgress || generatePlan.isPending) ? (<div data-testid="planning-hydration-overlay" className="absolute inset-0 z-30 bg-background/60 backdrop-blur-[1px] pointer-events-auto flex items-start justify-end p-3"><span className="text-xs rounded bg-background border px-2 py-1">{waitingForTransportOutTasks ? "Actualizando salidas OUT…" : planningStatus === "generating_diagnostics" ? "Generando JSON…" : planningStatus === "rendering_schedule" || planningStatus === "refetching_tasks" ? "Pintando tiras…" : "Aplicando planificación…"}</span></div>) : null}
                <PlanningTimeline
                  isHydratingPlanningResult={planningInProgress && hydratingPlanningRunId !== null}
                  planningRunId={hydratingPlanningRunId}
                  taskDatasetVersion={planningDatasetVersion}
                  onScheduleRendered={(runId, datasetVersion, renderedCounts) => {
                    if (runId !== hydratingPlanningRunId || datasetVersion !== planningDatasetVersion) return;
                    const diagnostics: any = queryClient.getQueryData(engineDiagnosticsQueryKey(id, runId));
                    const expectation = derivePlanningReadinessExpectation(diagnostics, runId);
                    const gate = evaluatePlanningReadyGate({
                      currentRunId: runId,
                      latestSuccessRunId: planningRunQ.data?.status === "success" ? Number(planningRunQ.data.id) : null,
                      diagnosticsRunId: Number.isFinite(Number(diagnostics?.id)) ? Number(diagnostics.id) : null,
                      expectedPlannedTasks: expectation.scheduledVisibleTasks ?? expectation.plannedTasks,
                      expectedUnplannedTasks: expectation.unplannedTasks,
                      expectedTransportOutCount: expectation.transportOutTasks,
                      ...renderedCounts,
                      taskDatasetVersion: datasetVersion,
                      renderedTaskDatasetVersion: datasetVersion,
                      exportReady: Number(diagnostics?.id) === runId,
                    });
                    setWaitingForTransportOutTasks(gate.isWaitingForTransportOutTasks);
                    if (!gate.planningReady) {
                      setPlanningStatus(Number(diagnostics?.id) === runId ? "rendering_schedule" : "generating_diagnostics");
                      return;
                    }
                    setPlanningStatus("ready");
                    setPlanningInProgress(false);
                    setWaitingForTransportOutTasks(false);
                    setHydratingPlanningRunId(null);
                    setExpectedPlanningRunId(null);
                    toast({ title: "Planificación lista" });
                  }}
                  plan={planningViewPlan as any}
                  contestants={contestants as any}
                  viewMode={timelineView}
                  spaceVerticalMode={spaceVerticalMode}
                  stageFilterIds={stageFilterIds}
                  resourceFilterIds={resourceFilterIds}
                  resourceSelectables={resourceFilterOptions as any}
                  zones={zones as any}
                  spaces={spaces as any}
                  zoneResourceAssignments={zoneAssignmentsForTooltip}
                  spaceResourceAssignments={spaceAssignmentsForPlanning}
                  planResourceItemNameById={planResourceItemNameById}
                  zoneStaffModes={planZoneStaffModes as any}
                  itinerantTeams={itinerantTeams as any}
                  staffAssignments={planStaffAssignments as any}
                  uiItinerantGroupOrderIndex={(programSettings as any)?.uiItinerantGroupOrderIndex ?? (programSettings as any)?.ui_itinerant_group_order_index ?? null}
                  uiUnlocatedGroupOrderIndex={(programSettings as any)?.uiUnlocatedGroupOrderIndex ?? (programSettings as any)?.ui_unlocated_group_order_index ?? null}
                  onTaskStatusChange={handlePlanningTaskStatusChange}
                  canExecuteTask={canOperateTask}
                  taskStatusPending={updateTaskStatus.isPending}
                  timeLockedTaskIds={Array.from(timeLockedTaskIds)}
                  fullLockedTaskIds={Array.from(fullLockedTaskIds)}
                  onPinTask={async (task) => {
                    if (!task?.startPlanned || !task?.endPlanned || task?.isManualBlock) return;
                    await apiRequest("PATCH", `/api/daily-tasks/${task.id}/time-lock`, {
                      start: task.startPlanned,
                      end: task.endPlanned,
                    });
                    await queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                    toast({ title: "Tarea fijada" });
                  }}
                  onUnpinTask={async (task) => {
                    await apiRequest("DELETE", `/api/daily-tasks/${task.id}/lock`);
                    await queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                    toast({ title: "Fijación eliminada" });
                  }}
                  onApplyManualEdits={async (edits) => {
                    const taskById = new Map<number, any>(
                      ((plan?.dailyTasks ?? []) as any[]).map((task) => [Number(task?.id), task]),
                    );

                    const changedEdits = edits.filter((edit) => {
                      const current = taskById.get(Number(edit.taskId));
                      if (!current) return true;

                      const currentStart =
                        current?.lockedStart ?? current?.startPlanned ?? current?.start_planned ?? null;
                      const currentEnd =
                        current?.lockedEnd ?? current?.endPlanned ?? current?.end_planned ?? null;

                      return currentStart !== edit.start || currentEnd !== edit.end;
                    });

                    for (const edit of changedEdits) {
                      await apiRequest("PATCH", `/api/daily-tasks/${edit.taskId}/time-lock`, {
                        start: edit.start,
                        end: edit.end,
                      });
                    }
                    queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                    toast({
                      title:
                        changedEdits.length > 0
                          ? "Cambios manuales aplicados"
                          : "Sin cambios manuales para aplicar",
                    });
                  }}
                  onPersistManualEdits={async ({ edits, primaryTaskId, shiftedTaskIds }) => {
                    const locksByTaskId = new Map<number, any>();
                    for (const l of ((plan as any)?.locks ?? []) as any[]) {
                      const tid = Number(l?.task_id ?? l?.taskId);
                      const type = String(l?.lock_type ?? l?.lockType ?? "");
                      const ls = l?.locked_start ?? l?.lockedStart ?? null;
                      const le = l?.locked_end ?? l?.lockedEnd ?? null;
                      if (!Number.isFinite(tid) || tid <= 0) continue;
                      if (type === "time" && ls && le) {
                        locksByTaskId.set(tid, { lockStart: String(ls), lockEnd: String(le) });
                      }
                    }
                    setManualEditsSnapshot((prev) => {
                      const next = { ...prev };
                      for (const edit of edits) {
                        const taskId = Number(edit.taskId);
                        if (next[taskId]) continue;
                        const task = ((plan?.dailyTasks ?? []) as any[]).find((t) => Number(t?.id) === taskId);
                        const startPlanned = String(task?.startPlanned ?? task?.start_planned ?? edit.start);
                        const endPlanned = String(task?.endPlanned ?? task?.end_planned ?? edit.end);
                        const lock = locksByTaskId.get(taskId) ?? null;
                        next[taskId] = {
                          startPlanned,
                          endPlanned,
                          hadTimeLock: Boolean(lock?.lockStart && lock?.lockEnd),
                          lockStart: lock?.lockStart ?? null,
                          lockEnd: lock?.lockEnd ?? null,
                        };
                      }
                      return next;
                    });
                    const shifted = new Set((shiftedTaskIds ?? []).map((taskId) => Number(taskId)));
                    for (const edit of edits) {
                      const isPrimary = Number(primaryTaskId) === Number(edit.taskId);
                      if (isPrimary) {
                        await apiRequest("PATCH", `/api/daily-tasks/${edit.taskId}/time-lock`, {
                          start: edit.start,
                          end: edit.end,
                        });
                        continue;
                      }
                      if (shifted.has(Number(edit.taskId))) {
                        await apiRequest("PATCH", `/api/daily-tasks/${edit.taskId}/planned-time`, {
                          startPlanned: edit.start,
                          endPlanned: edit.end,
                        });
                      }
                    }
                    await queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                    toast({ title: "Cambios manuales guardados" });
                  }}
                  onValidatePlan={async () => {
                    const validation = await apiRequest<{ feasible: boolean; reasons?: Array<{ message?: string; [k: string]: any }> }>("POST", `/api/plans/${id}/validate`, { mode: "as_is" });
                    if (validation?.feasible) {
                      setManualDraftBlockIds([]);
                      setManualEditsSnapshot({});
                    }
                    return validation;
                  }}
                  onGeneratePlan={async (mode: "full" | "only_unplanned" | "replan_pending_respecting_locks" | "generate_planning" | "plan_pending" = "generate_planning") => {
                    try {
                      await apiRequest("POST", buildUrl(api.plans.generate.path, { id }), { mode, timeLimitMs: planningTimeLimitSec * 1000 });
                      await queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                      await queryClient.refetchQueries({ queryKey: planQueryKey(id) });
                      setManualDraftBlockIds([]);
                      setManualEditsSnapshot({});
                      toast({ title: (mode === "full" || mode === "generate_planning") ? "Replanificación lanzada" : "Replanificación parcial lanzada" });
                    } catch (err: any) {
                      if (isAbortLikeError(err)) {
                        toast({ title: "La optimización tardó más de lo esperado, comprobando estado..." });
                        await queryClient.refetchQueries({ queryKey: planQueryKey(id) });
                        const refreshed: any = queryClient.getQueryData(planQueryKey(id));
                        const hasPlanned = Array.isArray(refreshed?.dailyTasks) && refreshed.dailyTasks.some((t: any) => t?.startPlanned && t?.endPlanned);
                        if (hasPlanned) {
                          toast({ title: "Replanificación completada", description: "Se recuperó el estado tras refrescar." });
                          return;
                        }
                      }
                      throw err;
                    }
                  }}
                  onReloadPlanTasks={async () => {
                    await queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                  }}
                  onCancelManualEdits={async () => {
                    queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                  }}
                  onDiscardManualEditsAndReload={async () => {
                    for (const [taskIdRaw, snap] of Object.entries(manualEditsSnapshot)) {
                      const taskId = Number(taskIdRaw);
                      if (!Number.isFinite(taskId) || taskId <= 0) continue;
                      await apiRequest("PATCH", `/api/daily-tasks/${taskId}/planned-time`, {
                        startPlanned: snap.startPlanned,
                        endPlanned: snap.endPlanned,
                      });
                      if (snap.hadTimeLock && snap.lockStart && snap.lockEnd) {
                        await apiRequest("PATCH", `/api/daily-tasks/${taskId}/time-lock`, {
                          start: snap.lockStart,
                          end: snap.lockEnd,
                        });
                      } else {
                        await apiRequest("DELETE", `/api/daily-tasks/${taskId}/lock`);
                      }
                    }
                    for (const blockId of manualDraftBlockIds) {
                      await apiRequest("DELETE", buildUrl(api.dailyTasks.delete.path, { id: blockId }));
                    }
                    setManualDraftBlockIds([]);
                    setManualEditsSnapshot({});
                    await queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                  }}
                  pendingManualBlocksCount={manualDraftBlockIds.length}
                  onDeleteManualBlock={async (task) => {
                    await apiRequest("DELETE", buildUrl(api.dailyTasks.delete.path, { id: Number(task.id) }));
                    setManualDraftBlockIds((prev) => prev.filter((x) => x !== Number(task.id)));
                    await queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                    await queryClient.refetchQueries({ queryKey: planQueryKey(id) });
                    toast({ title: "Bloqueo eliminado" });
                  }}
                  onPatchManualBlock={async (taskId: number, patch: { title?: string | null; color?: string | null }) => {
                    await patchManualBlock(taskId, patch);
                    await queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                    toast({ title: "Bloqueo actualizado" });
                  }}
                  onSetManualBlockDuration={async (task: any, durationMinutes: number) => {
                    const start = String(task?.startPlanned ?? task?.start_planned ?? "");
                    const startMin = parseHHMMToMinutes(start);
                    if (startMin == null) throw new Error("Bloqueo manual sin hora de inicio");
                    const end = minutesToHHMM(startMin + Math.max(5, Math.round(durationMinutes)));
                    await apiRequest("PATCH", `/api/daily-tasks/${Number(task.id)}/time-lock`, { start, end });
                    await queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                    toast({ title: "Duración actualizada" });
                  }}
                  onCreateManualBlock={() => setManualBlockDialog((prev) => ({ ...prev, open: true, scopeType: "contestant", scopeId: "" }))}
                />
              </div>
              </FullscreenPlanningPanel>
              </>}
            </div>
          </TabsContent>

          <TabsContent forceMount hidden={activeTab !== "resources"} value="resources" className="mt-0">
            <PlanResourcesTab planId={id} onChanged={() => setResourceVersion(version => version + 1)} onOpenAgenda={resourceId=>{const params=new URLSearchParams(window.location.search);params.set("resource",String(resourceId));window.history.replaceState(null,"",`${window.location.pathname}?${params}`);setActiveTab("planning");window.dispatchEvent(new Event("optiplan:planning-focus"));}} />
          </TabsContent>
          <TabsContent forceMount hidden={activeTab !== "configuration"} value="configuration" className="mt-0">
            <DayConfiguration planId={id} onNavigate={setActiveTab} />
          </TabsContent>
          <TabsContent forceMount hidden={activeTab !== "staff"} value="staff" className="space-y-6 mt-0">
            <PlanStaffRolesTab
              planId={id}
              zones={zones as any[]}
              spaces={spaces as any[]}
            />
          </TabsContent>
          <TabsContent forceMount hidden={activeTab !== "execution"} value="execution" className="mt-0 space-y-4">
            <DayExecutionWorkspace key={id} planId={id} planDate={plan.date} online={executionSync.online} tasks={plan.dailyTasks as any[]} contestants={contestants as any[]} zones={zones as any[]} spaces={spaces as any[]} resourceNames={planResourceItemNameById} spaceAssignments={spaceAssignmentsForPlanning} zoneAssignments={zoneAssignmentsForTooltip} onOpenContestant={openContestantFromExecution} />
          </TabsContent>
        </Tabs>

        <Dialog open={unplannedDialogOpen} onOpenChange={setUnplannedDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Pendientes sin planificar</DialogTitle>
              <DialogDescription>
                Tareas pendientes sin franja horaria planificada.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {unplannedTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay tareas pendientes sin planificar.</p>
              ) : (
                unplannedTasks.map((task: any) => {
                  const contestantId = Number(task?.contestantId ?? task?.contestant_id);
                  const contestant = (contestants ?? []).find((c: any) => Number(c?.id) === contestantId);
                  const taskId = Number(task?.id);
                  const reason = reasonsByTaskId.get(taskId) ?? null;
                  const reasonMessage = reason?.message || "Sin detalle (replanifica para ver motivos).";
                  const missingDependencies = Array.isArray(reason?.details?.missingDependencies)
                    ? reason.details.missingDependencies
                    : [];
                  const tags: string[] = [];
                  if (task?.isManualBlock || task?.is_manual_block) tags.push("manual_block");
                  if (task?.lockType === "time" || task?.lock_type === "time") tags.push("time_lock");
                  if (task?.lockType === "full" || task?.lock_type === "full") tags.push("full_lock");
                  tags.push(`status:${String(task?.status ?? "pending")}`);
                  return (
                    <div key={taskId} className={cn("rounded-md border p-3", unplannedFocusTaskId === taskId ? "border-red-300" : "") }>
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="font-medium">{task?.template?.name || `Template #${task?.templateId}`}</div>
                          <div className="text-sm text-muted-foreground">{contestant?.name || (Number.isFinite(contestantId) ? `Concursante #${contestantId}` : "(sin concursante)")}</div>
                          <div className="text-xs text-muted-foreground">Motivo: {reasonMessage}</div>
                          {missingDependencies.length > 0 && (
                            <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
                              {missingDependencies.map((dep: any, index: number) => {
                                const depTaskId = Number(dep?.taskId);
                                const depName = String(dep?.name ?? `Tarea ${depTaskId}`);
                                const depContestantId = Number(dep?.contestantId);
                                const depContestantName = Number.isFinite(depContestantId)
                                  ? contestantNameById.get(depContestantId)
                                  : null;
                                const contestantLabel = Number.isFinite(depContestantId)
                                  ? ` · concursante ${depContestantName ?? depContestantId}`
                                  : "";
                                return (
                                  <li key={`${taskId}-missing-${depTaskId}-${index}`}>
                                    {`${depName} (ID ${depTaskId})${contestantLabel}`}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          <div className="flex flex-wrap gap-1 pt-1">
                            {tags.map((tag) => (
                              <Badge key={`${taskId}-${tag}`} variant="outline" className="text-[10px]">{tag}</Badge>
                            ))}
                          </div>
                        </div>
                        <Button type="button" size="sm" onClick={() => openTaskFromUnplanned(task)}>
                          Ir
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={planningInProgress} onOpenChange={(open) => { if (!open) void cancelPlanningGeneration(); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {planningIssue ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                {planningIssue
                  ? planningIssue.kind === "stale" ? "Generación bloqueada" : planningIssue.kind === "reconnecting" ? "Reconectando con la planificación..." : "No se pudo completar la generación"
                  : waitingForTransportOutTasks ? "Actualizando salidas OUT…" : planningStatus === "generating_diagnostics" ? "Generando JSON…" : planningStatus === "rendering_schedule" || planningStatus === "refetching_tasks" ? "Pintando tiras…" : planningStatus === "applying" ? "Aplicando planificación…" : `Planificando… ${planningProgress.percentage}%`}
              </DialogTitle>
              <DialogDescription>
                {planningIssue ? planningIssue.message : <>
                  {Math.min(planningProgress.plannedCount, planningProgress.totalCount)} / {planningProgress.totalCount} pendientes en este run
                  <br />
                  Total tareas del plan: {plan?.dailyTasks?.length ?? 0}
                </>}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {!planningIssue && <>
                <Progress value={planningProgress.percentage} className="h-2" />
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2" data-testid="planning-phase-stepper">
                  {planningPhaseSteps(planningRunQ.data?.phase, planningRunQ.data?.status).map((step) => (
                    <div key={step.id} className="flex items-center gap-2 text-xs">
                      <span className={step.status === "completed" ? "text-emerald-600" : step.status === "active" ? "text-primary" : step.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                        {step.status === "completed" ? "✓" : step.status === "active" ? "●" : step.status === "failed" ? "×" : "○"}
                      </span>
                      <span className={step.status === "active" ? "font-medium" : ""}>{step.label}</span>
                      {step.status === "active" && (Number(planningRunQ.data?.candidatesEvaluated ?? 0) > 0 || Number(planningRunQ.data?.candidatesGenerated ?? 0) > 0) && (
                        <span className="ml-auto text-muted-foreground">{Number(planningRunQ.data?.candidatesEvaluated ?? 0)}/{Number(planningRunQ.data?.candidatesGenerated ?? 0)}</span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {PLANNING_PHASE_LABELS[String(planningRunQ.data?.phase ?? "")] ?? planningRunQ.data?.phase ?? "Procesando"}
                  {planningRunQ.data?.lastTaskName ? ` · Última: ${planningRunQ.data.lastTaskName}` : ""}
                </p>
                {planningRunQ.data?.progressMessage && (
                  <p className="text-sm">{planningRunQ.data.progressMessage}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Última actualización hace {Math.max(0, Math.floor((Date.now() - Date.parse(planningRunQ.data?.updatedAt ?? new Date().toISOString())) / 1000))} s
                </p>
                {planningRunQ.data && Date.now() - Date.parse(planningRunQ.data.updatedAt) > 60_000 ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300">La planificación está tardando más de lo normal, sigo reconectando...</p>
                ) : planningRunQ.data && Date.now() - Date.parse(planningRunQ.data.updatedAt) > 15_000 ? (
                  <p className="text-sm text-muted-foreground">Sigue calculando…</p>
                ) : null}
                {(Number(planningRunQ.data?.candidatesEvaluated ?? 0) > 0 || Number(planningRunQ.data?.candidatesGenerated ?? 0) > 0) && (
                  <p className="text-xs text-muted-foreground">
                    Candidatos evaluados: {Number(planningRunQ.data?.candidatesEvaluated ?? 0)} · generados: {Number(planningRunQ.data?.candidatesGenerated ?? 0)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Puedes cancelar sin borrar una planificación válida ya completada.</p>
              </>}
              {planningIssue?.kind === "stale" && <p className="text-sm">Puedes cancelar y reintentar.</p>}
              {planningIssue?.kind === "reconnecting" && <p className="text-sm">Planificación en curso. Reconectando...</p>}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              {planningIssue && <Button variant="outline" onClick={() => unlockPlanningModal(planningRunQ.data?.id)}>Cerrar</Button>}
              <Button variant={planningIssue ? "outline" : "destructive"} onClick={() => void cancelPlanningGeneration()}>
                Cancelar generación
              </Button>
              {planningIssue && <Button onClick={() => { void planningRunQ.refetch(); void refetchPlan(); }} disabled={planningRunQ.isFetching}>
                Reintentar cargar
              </Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Day</DialogTitle>
              <DialogDescription>
                Define el horario del día y recursos globales. Formato hora:
                HH:MM (ej. 09:00).
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Work Start</Label>
                <Input
                  value={edit.workStart}
                  onChange={(e) =>
                    setEdit((p) => ({ ...p, workStart: e.target.value }))
                  }
                  type="time"
                  step={60}
                />
              </div>
              <div className="space-y-2">
                <Label>Work End</Label>
                <Input
                  value={edit.workEnd}
                  onChange={(e) =>
                    setEdit((p) => ({ ...p, workEnd: e.target.value }))
                  }
                  type="time"
                  step={60}
                />
              </div>

              <div className="space-y-2">
                <Label>Meal Start</Label>
                <Input
                  value={edit.mealStart}
                  onChange={(e) =>
                    setEdit((p) => ({ ...p, mealStart: e.target.value }))
                  }
                  type="time"
                  step={60}
                />
              </div>
              <div className="space-y-2">
                <Label>Meal End</Label>
                <Input
                  value={edit.mealEnd}
                  onChange={(e) =>
                    setEdit((p) => ({ ...p, mealEnd: e.target.value }))
                  }
                  type="time"
                  step={60}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="day-meal-mode">Modo de comida</Label>
                <select id="day-meal-mode" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={edit.mealMode} onChange={(event) => setEdit((previous) => ({ ...previous, mealMode: event.target.value as typeof previous.mealMode }))}>
                  <option value="flexible_meal_window">Ventana flexible de comida</option>
                  <option value="global_hard_break">Parada global de comida</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Duración comida concursantes (min)</Label>
                <Input
                  type="number"
                  min={1}
                  max={240}
                  value={edit.contestantMealDurationMinutes}
                  onChange={(e) =>
                    setEdit((p) => ({
                      ...p,
                      contestantMealDurationMinutes: Number(e.target.value),
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Máx. concursantes comiendo a la vez</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={edit.contestantMealMaxSimultaneous}
                  onChange={(e) =>
                    setEdit((p) => ({
                      ...p,
                      contestantMealMaxSimultaneous: Number(e.target.value),
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Duración descanso comida platós/equipos (min)</Label>
                <Input
                  type="number"
                  min={1}
                  max={240}
                  placeholder="(usa default)"
                  value={edit.spaceMealBreakMinutes}
                  onChange={(e) =>
                    setEdit((p) => ({
                      ...p,
                      spaceMealBreakMinutes: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  updatePlan.mutate(
                    { id, patch: {
                      ...edit,
                      spaceMealBreakMinutes: String(edit.spaceMealBreakMinutes).trim() === "" ? null : Number(edit.spaceMealBreakMinutes),
                    } },
                    {
                      onSuccess: () => {
                        toast({ title: "Plan updated" });
                        setEditOpen(false);
                      },
                      onError: (err: any) => {
                        toast({
                          title: "No se pudo guardar",
                          description: err?.message || "Error desconocido",
                          variant: "destructive",
                        });
                      },
                    },
                  );
                }}
                disabled={updatePlan.isPending}
              >
                {updatePlan.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Infeasible Error Dialog */}
        <Dialog
          open={errorDialog.open}
          onOpenChange={(open) => {
            setErrorDialog((prev) => ({ ...prev, open }));
            if (!open) setShowInfeasibleDetails(false);
          }}
        >
          <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center text-destructive">
                <AlertTriangle className="w-5 h-5 mr-2" />
                No se puede planificar
              </DialogTitle>
              <DialogDescription>
                El motor no ha encontrado una planificación viable. Motivos
                detectados:
              </DialogDescription>
            </DialogHeader>
            <div className="mt-3 space-y-2">
              {errorDialog.reasons.map((reason, idx) => {
                const d = reason?.diagnostic;
                const isMealDiag = reason?.code === "MEAL_CONTESTANT_NO_FIT" && d;
                const restrictive = Array.isArray(d?.restrictiveContestants)
                  ? d.restrictiveContestants
                  : [];

                return (
                  <div
                    key={idx}
                    className="border border-destructive/30 bg-destructive/5 rounded-lg p-3 space-y-2"
                  >
                    <div className="text-sm text-destructive">
                      {formatInfeasibleReason(reason)}
                    </div>

                    {isMealDiag && (
                      <div className="rounded-md border border-border bg-background/70 p-3 text-xs space-y-1">
                        <div className="font-semibold">Diagnóstico de comidas</div>
                        <div>Ventana: {String(d.windowStart)}–{String(d.windowEnd)}</div>
                        <div>Duración: {Number(d.duration)} min</div>
                        <div>Máximo simultáneo: {Number(d.maxSim)}</div>
                        <div>Capacidad teórica: {Number(d.capacityTheoretical)}</div>
                        <div>Comidas necesarias: {Number(d.mealsNeeded)}</div>

                        {d.isCapacityImpossible ? (
                          <div className="font-medium text-destructive">
                            Config imposible: faltan plazas de capacidad.
                          </div>
                        ) : (
                          <div className="font-medium text-amber-700 dark:text-amber-300">
                            Revisar disponibilidad/orden, ver concursantes restrictivos.
                          </div>
                        )}

                        {!d.isCapacityImpossible && restrictive.length > 0 && (
                          <div className="pt-1">
                            <div className="font-medium">Top concursantes restrictivos:</div>
                            <ul className="list-disc pl-4">
                              {restrictive.slice(0, 3).map((c: any, ridx: number) => (
                                <li key={ridx}>
                                  {String(c.contestantName)}: {String(c.windowStart)}–{String(c.windowEnd)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {(errorDialog.diagnostic?.report || errorDialog.diagnostic?.warnings.length || errorDialog.diagnostic?.insights.length || errorDialog.diagnostic?.unplanned.length) ? (
              <div className="mt-4 rounded-lg border p-3 space-y-4">
                <div className="text-sm font-semibold">Diagnóstico motor v3</div>

                {errorDialog.diagnostic?.code === "V3_PHASEA_EMPTY_RESULT" && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>El motor v3 no pudo planificar ninguna tarea. Ver diagnóstico abajo.</AlertTitle>
                  </Alert>
                )}

                {errorDialog.diagnostic?.report ? (
                  <div className="space-y-2 rounded-md border border-border bg-background/70 p-3 text-xs">
                    <div className="font-semibold">Repair loop v3</div>
                    <div>Intentos: {Array.isArray(errorDialog.diagnostic.report?.attemptsSummary) ? errorDialog.diagnostic.report.attemptsSummary.length : 0}</div>
                    <div>Abortado por presupuesto: {errorDialog.diagnostic.report?.abortedByBudget ? "Sí" : "No"}</div>
                    {Array.isArray(errorDialog.diagnostic.report?.degradations) && errorDialog.diagnostic.report.degradations.length > 0 ? (
                      <div>Degradaciones aplicadas: {errorDialog.diagnostic.report.degradations.join(", ")}.</div>
                    ) : (
                      <div>Degradaciones aplicadas: ninguna.</div>
                    )}
                    {Array.isArray(errorDialog.diagnostic.report?.attemptsSummary) && errorDialog.diagnostic.report.attemptsSummary.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-[11px]">
                          <thead>
                            <tr className="border-b border-border/80">
                              <th className="py-1 pr-2 font-medium">level</th>
                              <th className="py-1 pr-2 font-medium">ok</th>
                              <th className="py-1 pr-2 font-medium">ms</th>
                              <th className="py-1 pr-2 font-medium">topReasons</th>
                            </tr>
                          </thead>
                          <tbody>
                            {errorDialog.diagnostic.report.attemptsSummary.map((attempt: any, idx: number) => (
                              <tr key={`attempt-summary-${idx}`} className="border-b border-border/40 align-top">
                                <td className="py-1 pr-2">{Number(attempt?.level ?? idx)}</td>
                                <td className="py-1 pr-2">{attempt?.ok ? "true" : "false"}</td>
                                <td className="py-1 pr-2">{Number.isFinite(Number(attempt?.ms)) ? `${Number(attempt.ms)}ms` : "-"}</td>
                                <td className="py-1 pr-2">{Array.isArray(attempt?.topReasons) && attempt.topReasons.length > 0 ? attempt.topReasons.join(", ") : "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {errorDialog.diagnostic?.warnings.length ? (
                  <div className="space-y-1">
                    <div className="text-xs font-medium uppercase text-muted-foreground">Warnings</div>
                    <ul className="list-disc pl-4 text-sm space-y-1">
                      {errorDialog.diagnostic.warnings.map((warning: any, idx: number) => (
                        <li key={`warning-${idx}`}>{String(warning?.message ?? warning?.code ?? warning)}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {errorDialog.diagnostic?.insights.length ? (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto p-0 text-xs"
                      onClick={() => setShowInfeasibleDetails((prev) => !prev)}
                    >
                      {showInfeasibleDetails ? "Ocultar detalle" : "Detalle"}
                    </Button>

                    {showInfeasibleDetails ? (
                      <div className="space-y-1">
                        <div className="text-xs font-medium uppercase text-muted-foreground">Insights</div>
                        <ul className="space-y-2 text-sm">
                          {errorDialog.diagnostic.insights.map((insight: any, idx: number) => (
                            <li key={`insight-${idx}`} className="rounded border p-2">
                              <div className="font-medium">{String(insight?.code ?? insight?.title ?? `Insight ${idx + 1}`)}</div>
                              {insight?.message ? <div className="text-xs text-muted-foreground mt-0.5">{String(insight.message)}</div> : null}
                              {insight?.details ? (
                                <pre className="mt-2 text-xs whitespace-pre-wrap break-words rounded bg-muted/40 p-2">{JSON.stringify(insight.details, null, 2)}</pre>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {errorDialog.diagnostic?.unplanned.length ? (
                  <div className="space-y-1">
                    <div className="text-xs font-medium uppercase text-muted-foreground">Top 20 unplanned</div>
                    <ul className="list-disc pl-4 text-sm space-y-2">
                      {errorDialog.diagnostic.unplanned.slice(0, 20).map((item: any, idx: number) => {
                        const taskId = Number(item?.taskId ?? item?.task_id);
                        const taskLabel = Number.isFinite(taskId) && taskNameById.get(taskId)
                          ? taskNameById.get(taskId)
                          : (Number.isFinite(taskId) ? `Tarea #${taskId}` : `Tarea ${idx + 1}`);
                        const reasonObj = item?.reason;
                        const reasonMessage = typeof reasonObj === "object" && reasonObj !== null
                          ? (reasonObj?.message ?? item?.message ?? item?.code ?? "Sin motivo informado")
                          : (reasonObj ?? item?.message ?? item?.code ?? "Sin motivo informado");
                        const reasonDiagnostic = typeof reasonObj === "object" && reasonObj !== null
                          ? reasonObj?.diagnostic
                          : null;
                        return (
                          <li key={`unplanned-${idx}`} className="space-y-1">
                            <div>
                              <span className="font-medium">{taskLabel}</span>: {String(reasonMessage)}
                            </div>
                            {reasonDiagnostic ? (
                              <pre className="text-xs whitespace-pre-wrap break-words rounded bg-muted/40 p-2">{JSON.stringify(reasonDiagnostic, null, 2)}</pre>
                            ) : null}
                            {typeof item === "object" && item !== null ? (
                              <pre className="text-xs whitespace-pre-wrap break-words rounded bg-muted/40 p-2">{JSON.stringify(item, null, 2)}</pre>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-4">
              {errorDialog.reasons.some(
                (r: any) => r?.code === "DEPENDENCY_MISSING",
              ) && (
                <Button
                  variant="default"
                  onClick={async () => {
                    try {
                      // 1) Sacar faltantes del popup
                      const depReasons = errorDialog.reasons.filter(
                        (r: any) => r?.code === "DEPENDENCY_MISSING",
                      );

                      // 2) Construir lista única (contestantId + templateId)
                      const toCreateKey = new Set<string>();
                      const toCreate: Array<{
                        contestantId: number;
                        templateId: number;
                      }> = [];

                      for (const r of depReasons as any[]) {
                        const contestantId = Number(r?.contestantId);
                        const templateId = Number(r?.missingTemplateId);
                        if (!Number.isFinite(contestantId) || contestantId <= 0)
                          continue;
                        if (!Number.isFinite(templateId) || templateId <= 0)
                          continue;

                        const k = `${contestantId}:${templateId}`;
                        if (toCreateKey.has(k)) continue;
                        toCreateKey.add(k);
                        toCreate.push({ contestantId, templateId });
                      }

                      // 3) Evitar duplicados ya existentes en el plan
                      const existingKey = new Set<string>();
                      for (const t of (plan?.dailyTasks ?? []) as any[]) {
                        const cid = Number(t?.contestantId ?? t?.contestant_id);
                        const tid = Number(t?.templateId ?? t?.template_id);
                        if (!Number.isFinite(cid) || cid <= 0) continue;
                        if (!Number.isFinite(tid) || tid <= 0) continue;
                        existingKey.add(`${cid}:${tid}`);
                      }

                      const finalToCreate = toCreate.filter(
                        (x) =>
                          !existingKey.has(`${x.contestantId}:${x.templateId}`),
                      );

                      if (!finalToCreate.length) {
                        toast({
                          title: "Nada que crear",
                          description:
                            "Los prerequisitos ya existen en el plan.",
                        });
                        return;
                      }

                      // 4) Crear todas las tareas (una por prerequisito faltante)
                      for (const x of finalToCreate) {
                        await createDailyTask.mutateAsync({
                          planId: id,
                          templateId: x.templateId,
                          contestantId: x.contestantId,
                          status: "pending",
                        } as any);
                      }

                      toast({
                        title: "Prerequisitos creados",
                        description: `Se han creado ${finalToCreate.length} tareas prerequisito.`,
                      });

                      // 5) Cerrar popup (opcional) para que el usuario regenere
                      setErrorDialog({ open: false, reasons: [], diagnostic: null });
                      setShowInfeasibleDetails(false);
                    } catch (err: any) {
                      toast({
                        title: "No se pudieron crear prerequisitos",
                        description: err?.message || "Error desconocido",
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={createDailyTask.isPending}
                >
                  {createDailyTask.isPending
                    ? "Creando..."
                    : "Crear prerequisitos"}
                </Button>
              )}

              <Button
                onClick={() => {
                  setErrorDialog({ open: false, reasons: [], diagnostic: null });
                  setShowInfeasibleDetails(false);
                }}
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {/* Requiere configuración (no bloquea la planificación) */}
        <Dialog
          open={configDialog.open}
          onOpenChange={(open) =>
            setConfigDialog((prev) => ({ ...prev, open }))
          }
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2" />
                Requiere configuración
              </DialogTitle>
              <DialogDescription>
                Se ha generado la planificación, pero algunas tareas se han
                excluido porque no están configuradas:
              </DialogDescription>
            </DialogHeader>
            <div className="mt-3 space-y-2">
              {configDialog.reasons.map((reason, idx) => (
                <div key={idx} className="border rounded-lg p-3">
                  <div className="text-sm">
                    {reason?.message || String(reason)}
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        goToTask(reason?.taskId ?? null);
                      }}
                    >
                      Ir a configurar
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setConfigDialog({ open: false, reasons: [] });
                        setLocation("/settings");
                      }}
                    >
                      Settings
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-4">
              <Button
                onClick={() => setConfigDialog({ open: false, reasons: [] })}
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={actionErrorDialog.open} onOpenChange={(open) => setActionErrorDialog((prev) => ({ ...prev, open }))}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{actionErrorDialog.title}</DialogTitle>
              <DialogDescription className="whitespace-pre-wrap">{actionErrorDialog.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setActionErrorDialog((prev) => ({ ...prev, open: false }))}>Cerrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={manualBlockDialog.open}
          onOpenChange={(open) => setManualBlockDialog((prev) => ({ ...prev, open }))}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Añadir comentario/bloqueo</DialogTitle>
              <DialogDescription>
                Crea una tira fija manual para bloquear un carril por horario.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Ámbito</Label>
                <Select
                  value={manualBlockDialog.scopeType}
                  onValueChange={(v: any) => setManualBlockDialog((prev) => ({ ...prev, scopeType: v, scopeId: "" }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="space">Espacio</SelectItem>
                    <SelectItem value="contestant">Concursante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{manualBlockDialog.scopeType === "space" ? "Espacio" : "Concursante"}</Label>
                <Select value={manualBlockDialog.scopeId || ""} onValueChange={(v) => setManualBlockDialog((prev) => ({ ...prev, scopeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>
                    {(manualBlockDialog.scopeType === "space" ? (spaces as any[]) : (contestants as any[])).map((row: any) => (
                      <SelectItem key={String(row.id)} value={String(row.id)}>{String(row.name ?? `#${row.id}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2"><Label>Inicio</Label><Input type="time" step={60} value={manualBlockDialog.start} onChange={(e) => setManualBlockDialog((prev) => ({ ...prev, start: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Fin</Label><Input type="time" step={60} value={manualBlockDialog.end} onChange={(e) => setManualBlockDialog((prev) => ({ ...prev, end: e.target.value }))} /></div>
              </div>
              <div className="space-y-2"><Label>Título</Label><Input value={manualBlockDialog.title} onChange={(e) => setManualBlockDialog((prev) => ({ ...prev, title: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Color</Label><ColorSwatchPicker value={manualBlockDialog.color} onChange={(v) => setManualBlockDialog((prev) => ({ ...prev, color: normalizeHexColor(v) ?? prev.color }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setManualBlockDialog((prev) => ({ ...prev, open: false }))} disabled={manualBlockSaving}>Cancelar</Button>
              <Button disabled={manualBlockSaving} onClick={async () => {
                const scopeId = Number(manualBlockDialog.scopeId);
                const startMin = parseHHMMToMinutes(manualBlockDialog.start);
                const endMin = parseHHMMToMinutes(manualBlockDialog.end);
                if (!Number.isFinite(scopeId) || scopeId <= 0 || startMin === null || endMin === null || endMin <= startMin) {
                  toast({ title: "Datos inválidos", variant: "destructive" });
                  return;
                }
                setManualBlockSaving(true);
                try {
                const selectedColor = normalizeHexColor(manualBlockDialog.color);
                if (!selectedColor) {
                  toast({ title: "Color inválido (#RRGGBB)", variant: "destructive" });
                  return;
                }
                const created = await apiRequest<any>("POST", `/api/plans/${id}/manual-block`, {
                  scopeType: manualBlockDialog.scopeType,
                  scopeId,
                  start: manualBlockDialog.start,
                  end: manualBlockDialog.end,
                  title: manualBlockDialog.title,
                  color: selectedColor,
                });
                const createdTask = created?.task ?? null;
                const blockId = Number(created?.task?.id ?? NaN);
                const serverManualColor = normalizeHexColor(createdTask?.manualColor ?? createdTask?.manual_color ?? null);
                if (Number.isFinite(blockId) && blockId > 0) {
                  setManualDraftBlockIds((prev) => (prev.includes(blockId) ? prev : [...prev, blockId]));
                  if (createdTask && serverManualColor) {
                    queryClient.setQueryData<any>(planQueryKey(id), (prev: any) => {
                      if (!prev || !Array.isArray(prev.dailyTasks)) return prev;
                      const prevTasks = prev.dailyTasks as any[];
                      const exists = prevTasks.some((t) => Number(t?.id) === blockId);
                      const nextTask = {
                        ...createdTask,
                        manualColor: serverManualColor,
                        manual_color: serverManualColor,
                      };
                      return {
                        ...prev,
                        dailyTasks: exists
                          ? prevTasks.map((t) => (Number(t?.id) === blockId ? { ...t, ...nextTask } : t))
                          : [...prevTasks, nextTask],
                      };
                    });
                  }
                }
                queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                toast({ title: "Bloqueo creado" });
                setManualBlockDialog((prev) => ({ ...prev, open: false }));
                } catch (err: any) {
                  showActionError("No se pudo crear el bloqueo", err);
                } finally {
                  setManualBlockSaving(false);
                }
              }}>{manualBlockSaving ? "Guardando…" : "Guardar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={timeLockDialog.open}
          onOpenChange={(open) =>
            setTimeLockDialog((prev) => ({ ...prev, open }))
          }
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Fijar horario manual</DialogTitle>
              <DialogDescription>
                Define inicio y fin (HH:MM) para bloquear esta tarea.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Inicio</Label>
                <Input
                  type="time"
                  step={60}
                  value={timeLockDialog.start}
                  onChange={(e) =>
                    setTimeLockDialog((prev) => ({ ...prev, start: e.target.value }))
                  }
                  placeholder="HH:MM"
                />
              </div>
              <div className="space-y-2">
                <Label>Fin</Label>
                <Input
                  type="time"
                  step={60}
                  value={timeLockDialog.end}
                  onChange={(e) =>
                    setTimeLockDialog((prev) => ({ ...prev, end: e.target.value }))
                  }
                  placeholder="HH:MM"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setTimeLockDialog({ open: false, task: null, start: "10:00", end: "10:30" })}
              >
                Cancelar
              </Button>
              <Button
                onClick={async () => {
                  const startMin = parseHHMMToMinutes(timeLockDialog.start);
                  const endMin = parseHHMMToMinutes(timeLockDialog.end);
                  if (startMin === null || endMin === null || endMin <= startMin) {
                    toast({ title: "Horas inválidas", description: "Revisa inicio/fin HH:MM", variant: "destructive" });
                    return;
                  }

                  const taskId = Number(timeLockDialog.task?.id ?? 0);
                  if (!Number.isFinite(taskId) || taskId <= 0) return;

                  await apiRequest("PATCH", `/api/daily-tasks/${taskId}/time-lock`, {
                    start: timeLockDialog.start,
                    end: timeLockDialog.end,
                  });
                  queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
                  toast({ title: "Tarea fijada" });
                  setTimeLockDialog({ open: false, task: null, start: "10:00", end: "10:30" });
                }}
              >
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        </div>
      </div>
    </Layout>
  );
}
