import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  Clapperboard,
  Settings2,
  Users,
  Video,
  Play,
  ListTodo,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useExecutionContext } from "@/hooks/use-execution-context";
import { buildAssistedPlanningView } from "@/lib/assisted-planning-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dayTabs = [
  { id: "tasks", label: "Concursantes", icon: Users },
  { id: "planning", label: "Planning", icon: Clapperboard },
  { id: "configuration", label: "Configuración", icon: Settings2 },
  { id: "resources", label: "Recursos", icon: Video },
  { id: "staff", label: "Roles", icon: ListTodo },
  { id: "execution", label: "Ejecución", icon: Play },
] as const;
export type DayTab = (typeof dayTabs)[number]["id"];
export const readDayTab = (search: string): DayTab => {
  const tab = new URLSearchParams(search).get("tab");
  return dayTabs.some((item) => item.id === tab) ? (tab as DayTab) : "tasks";
};

export function useDayTabNavigation(planId: number) {
  const [activeTab, setActive] = useState<DayTab>(() =>
    readDayTab(window.location.search),
  );
  const [planningVisit, setPlanningVisit] = useState({planId,visited:activeTab === "planning"});
  const planningVisited = planningVisit.planId === planId ? planningVisit.visited : readDayTab(window.location.search) === "planning";
  useEffect(() => {
    const sync = () => {
      const tab = readDayTab(window.location.search);
      setActive(tab);
      if (tab === "planning") setPlanningVisit({planId,visited:true});
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [planId]);
  const setActiveTab = useCallback((tab: DayTab) => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}?${params}${window.location.hash}`,
    );
    setActive(tab);
    if (tab === "planning") setPlanningVisit({planId,visited:true});
  }, [planId]);
  return { activeTab, setActiveTab, planningVisited };
}

export function DayTabNavigation() {
  return (
    <div
      className="max-w-full overflow-x-auto border-b"
      aria-label="Secciones de la jornada"
    >
      <TabsList className="grid h-auto w-full grid-cols-3 justify-start gap-1 rounded-none bg-transparent p-0 sm:inline-flex sm:w-auto sm:min-w-max">
        {dayTabs.map(({ id, label, icon: Icon }) => (
          <TabsTrigger
            key={id}
            value={id}
            className="gap-2 rounded-none border-b-2 border-transparent px-2 py-3 text-xs sm:px-4 sm:text-sm data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none"
          >
            <Icon className="hidden h-4 w-4 sm:block" aria-hidden />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}

type HeaderPlan = {
  id: number;
  name?: string;
  title?: string;
  date: string;
  workStart?: string | null;
  workEnd?: string | null;
  status: string;
  currentConfigRevisionId?: number | null;
  dailyTasks?: Array<{
    id: number;
    status: string;
    startPlanned?: string | null;
    endPlanned?: string | null;
  }>;
};
export function DayHeader({
  plan,
  onNavigate,
  onBack,
}: {
  plan: HeaderPlan;
  onNavigate: (tab: DayTab) => void;
  onBack: () => void;
}) {
  // Same cache and authority as the editor; this read never bootstraps a session.
  const { data: assisted } = useQuery<any>({
    queryKey: ["assisted-planning", plan.id],
    queryFn: () => apiRequest("GET", `/api/plans/${plan.id}/assisted`),
    retry: false,
    staleTime: 10_000,
  });
  const executionQ = useExecutionContext(plan.id);
  const tasks = plan.dailyTasks ?? [];
  const draftTasks = assisted?.draft?.tasks;
  const accepted = assisted?.activeStage;
  const obligations = draftTasks ? buildAssistedPlanningView(tasks as any,assisted.draft) : tasks;
  const draftIds = new Set((draftTasks ?? []).map((task:any)=>Number(task.taskId)));
  const taskSetCurrent = !draftTasks || (tasks.length===draftTasks.length && tasks.every(task=>draftIds.has(Number(task.id))));
  const placed = obligations.filter(
    (task: any) => task.startPlanned && task.endPlanned,
  ).length;
  const running = tasks.filter((task) => task.status === "in_progress").length;
  const done = tasks.filter((task) => task.status === "done").length;
  const execution = executionQ.data?.planningReady === true || running > 0 || done > 0;
  const validation = assisted?.validation;
  const currentValidation = Boolean(
    taskSetCurrent && validation &&
    validation.draftFingerprint === assisted.draftFingerprint &&
    Number(validation.baseStageId) === Number(assisted.draftBaseStageId) &&
    Number(validation.configRevisionId) ===
      Number(assisted.currentConfigRevisionId),
  );
  const conflicts = currentValidation
    ? Number(validation.hardCount ?? 0) + Number(validation.requiredCount ?? 0)
    : 0;
  const date = new Date(`${String(plan.date).slice(0, 10)}T12:00:00`);
  const humanDate = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date)
    : "Fecha sin configurar";
  const status =
    (
      {
        draft: "Borrador del día",
        planned: "Planificado",
        in_progress: "En ejecución",
        completed: "Finalizado",
      } as Record<string, string>
    )[plan.status] ?? "Estado por revisar";
  return (
    <header
      className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:space-y-5 sm:p-6"
      data-testid="day-header"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Volver a jornadas"
            onClick={onBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Workspace de producción
            </p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-3xl">
              {plan.name?.trim() ||
                plan.title?.trim() ||
                "Jornada de producción"}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5 capitalize">
                <CalendarDays className="h-4 w-4" aria-hidden />
                {humanDate}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock3 className="h-4 w-4" aria-hidden />
                {plan.workStart && plan.workEnd
                  ? `${plan.workStart}–${plan.workEnd}`
                  : "Horario por configurar"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{status}</Badge>
          <Button
            onClick={() => onNavigate(execution ? "execution" : "planning")}
          >
            {execution
              ? "Abrir ejecución"
              : accepted
                ? "Continuar planificación"
                : "Abrir Planning"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm sm:gap-4 sm:pt-4 sm:text-base lg:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">
            {draftTasks ? "Borrador actual" : "Plan de trabajo"}
          </p>
          <p className="mt-1 font-semibold tabular-nums">
            {placed} / {obligations.length} <span className="hidden sm:inline">obligaciones </span>con horario
          </p>
          <button
            className="text-xs text-primary underline-offset-4 hover:underline"
            onClick={() => onNavigate("planning")}
          >
            {obligations.length - placed} pendientes de planificar
          </button>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Última etapa aceptada</p>
          <p className="mt-1 font-semibold">
            {accepted ? `Etapa ${accepted.ordinal}` : "Sin etapa aceptada"}
          </p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Checkpoint del plan de trabajo
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            Configuración y validación
          </p>
          <p className="mt-1 font-semibold">
            {currentValidation
              ? conflicts
                ? `${conflicts} incidencias por revisar`
                : "Borrador validado"
              : "Requiere validación"}
          </p>
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => onNavigate("configuration")}
          >
            Revisión{" "}
            {assisted?.currentConfigRevisionId ??
              plan.currentConfigRevisionId ??
              "no disponible"}
          </button>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Ejecución real</p>
          <p className="mt-1 font-semibold tabular-nums">
            {running} en curso · {done} completadas
          </p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            La aceptación de una etapa no publica el día
          </p>
        </div>
      </div>
    </header>
  );
}
