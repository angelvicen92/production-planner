import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  Users,
  MapPin,
  Video,
  Columns2,
  Maximize2,
  Minimize2,
  Rows2,
  Grid2X2,
  X,
  Filter,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PlanningFullscreenContext, usePlanningFullscreen } from "./planning-fullscreen";
import { FullscreenPlanningPanel } from "./fullscreen-planning-panel";
import { PlanningTimeline } from "../planning-timeline";
import {
  normalizedPlanningViews,
  planningViews,
  toggledPlanningViews,
  type PlanningView,
  type PlanningLayout,
} from "@/lib/planning-workspace-preferences";
import { assignedPlanningLocations, clampPanelRatio } from "@/lib/planning-workspace-geometry";
import type { ContestantLaneOrder } from "@/lib/contestant-lane-sort";

type TimelineProps = ComponentProps<typeof PlanningTimeline>;
const labels = {
  contestants: "Concursantes",
  spaces: "Platós y espacios",
  resources: "Recursos",
};
const icons = { contestants: Users, spaces: MapPin, resources: Video };
function readPreference<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
const SharedTimeline = memo(PlanningTimeline);

function ScopedPlanningWorkspaceLayout({
  planId,
  timelineProps,
  onPendingEditsChange,
}: {
  planId: number;
  timelineProps: TimelineProps;
  onPendingEditsChange?: (count:number)=>void;
}) {
  const { user } = useAuth();
  const preferenceKey = `optiplan:workspace:${user?.id ?? "session"}:${planId}`;
  const [visible, setVisible] = useState<PlanningView[]>(() =>
    normalizedPlanningViews(
      readPreference(preferenceKey, { visible: ["contestants"] }).visible,
    ),
  );
  const [layout, setLayout] = useState<PlanningLayout>(() => {
    const stored = readPreference(preferenceKey, { layout: "vertical" }).layout;
    return stored === "horizontal" || stored === "grid" ? stored : "vertical";
  });
  const [ratio, setRatio] = useState(() => clampPanelRatio(readPreference(preferenceKey, { ratio: 50 }).ratio));
  const [workspaceFullscreen, setWorkspaceFullscreen] = useState(false);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const exitFullscreen = useCallback(() => {
    if (activePanel) setActivePanel(null);
    else setWorkspaceFullscreen(false);
  }, [activePanel]);
  usePlanningFullscreen(workspaceFullscreen || activePanel !== null, exitFullscreen);
  const panesRef = useRef<HTMLDivElement>(null);
  const panelOrder = [...visible, ...planningViews.filter(view => !visible.includes(view))];
  const moveView = (view: PlanningView, direction: number) => setVisible(old => {
    const next = [...old], index = next.indexOf(view), target = index + direction;
    if (target < 0 || target >= next.length) return old;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const [manualEdits, setManualEdits] = useState<
    Record<number, { start: string; end: string }>
  >({});
  const [applying, setApplying] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const sharedProps = useMemo(
    () => ({
      ...timelineProps,
      readOnly:timelineProps.readOnly||applying,
      manualEdits,
      onManualEditsChange: setManualEdits,
    }),
    [timelineProps, manualEdits, applying],
  );
  useEffect(()=>onPendingEditsChange?.(Object.keys(manualEdits).length),[manualEdits,onPendingEditsChange]);
  const placementIdentity = timelineProps.plan.dailyTasks.map(task => [task.id, task.status, task.startPlanned, task.endPlanned, task.spaceId, task.zoneId].join(":")).join("|");
  useEffect(() => {
    setManualEdits({});
  }, [placementIdentity, timelineProps.readOnly]);
  useEffect(() => {
    const focus = () => {
      if (new URLSearchParams(window.location.search).has("resource"))
        setVisible((old) => normalizedPlanningViews([...old, "resources"]));
    };
    focus();
    window.addEventListener("optiplan:planning-focus", focus);
    return () => window.removeEventListener("optiplan:planning-focus", focus);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify({ visible, layout, ratio }));
    } catch {
      /* Visual preferences do not block production. */
    }
  }, [preferenceKey, visible, layout, ratio]);
  return (
    <PlanningFullscreenContext.Provider value={{ activePanel, setActivePanel }}>
    <section
      className={workspaceFullscreen ? "planning-workspace-fullscreen fixed inset-0 z-[90] flex min-h-0 flex-col gap-3 bg-background p-2 sm:p-4" : "space-y-3"}
      data-workspace-fullscreen={workspaceFullscreen}
      aria-label="Vistas de la planificación"
      data-testid="planning-multiview"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
        <div className="flex flex-wrap gap-1">
          <span className="mr-2 self-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Vistas
          </span>
          {planningViews.map((view) => {
            const Icon = icons[view];
            return (
              <Button
                key={view}
                size="sm"
                variant={visible.includes(view) ? "secondary" : "ghost"}
                aria-pressed={visible.includes(view)}
                aria-label={`Mostrar ${labels[view]}`}
                onClick={() =>
                  setVisible((old) => toggledPlanningViews(old, view))
                }
              >
                <Icon className="mr-2 h-4 w-4" />
                {labels[view]}
              </Button>
            );
          })}
        </div>
        <div
          className="flex flex-wrap items-center gap-1"
          aria-label="Distribución de paneles"
        >
          <Button size="sm" variant="outline" onClick={() => { setActivePanel(null); setWorkspaceFullscreen(old => !old); }}>
            {workspaceFullscreen ? <Minimize2 className="mr-1 h-4 w-4" /> : <Maximize2 className="mr-1 h-4 w-4" />}
            {workspaceFullscreen ? "Restaurar conjunto (Esc)" : "Maximizar conjunto"}
          </Button>
          {(
            [
              ["horizontal", Columns2, "Horizontal"],
              ["vertical", Rows2, "Vertical"],
              ["grid", Grid2X2, "Rejilla"],
            ] as const
          ).map(([value, Icon, label]) => (
            <Button
              key={value}
              size="sm"
              variant={layout === value ? "secondary" : "ghost"}
              aria-pressed={layout === value}
              aria-label={`Distribución ${label.toLowerCase()}`}
              onClick={() => setLayout(value)}
            >
              <Icon className="mr-1 h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Un mismo borrador en todas las vistas. Los filtros, el zoom y la
        distribución sólo cambian tu visualización.
      </p>
      {!timelineProps.readOnly ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <span className="text-sm">
            {Object.keys(manualEdits).length} movimientos pendientes en las
            vistas
          </span>
          <Button
            size="sm"
            disabled={applying || !Object.keys(manualEdits).length}
            onClick={async () => {
              if (!timelineProps.onApplyManualEdits || applying) return;
              setApplying(true);
              setEditError(null);
              try {
                await timelineProps.onApplyManualEdits(
                  Object.entries(manualEdits).map(([id, time]) => ({
                    taskId: Number(id),
                    ...time,
                  })),
                );
                setManualEdits({});
              } catch {
                setEditError(
                  "No se pudieron aplicar los movimientos. Revisa el borrador y vuelve a intentarlo.",
                );
              } finally {
                setApplying(false);
              }
            }}
          >
            Aplicar movimientos al borrador
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={applying || !Object.keys(manualEdits).length}
            onClick={() => setManualEdits({})}
          >
            Descartar movimientos
          </Button>
          {editError ? (
            <span role="alert" className="text-sm text-destructive">
              {editError}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        ref={panesRef}
        className="planning-panes"
        data-count={visible.length}
        style={{ "--planning-ratio": `${ratio}fr`, "--planning-remainder": `${100 - ratio}fr` } as React.CSSProperties}
        data-layout={layout}
      >
        {panelOrder.map((view) => (
          <RetainedView
            key={view}
            visible={visible.includes(view)}
            order={visible.indexOf(view) * 2}
            wide={
              layout === "grid" &&
              visible.length === 3 &&
              view === visible[0]
            }
          >
            <PlanningViewPanel
              view={view}
              preferenceKey={`${preferenceKey}:${view}`}
              timelineProps={sharedProps}
              hideDisabled={visible.length === 1}
              onMove={(direction) => moveView(view, direction)}
              moveBeforeDisabled={visible.indexOf(view) === 0}
              moveAfterDisabled={visible.indexOf(view) === visible.length - 1}
              onHide={() => {
                if (activePanel === `${preferenceKey}:${view}`) setActivePanel(null);
                setVisible((old) => toggledPlanningViews(old, view));
              }}
            />
          </RetainedView>
        ))}
        {layout === "horizontal" && visible.length === 2 ? <div
          className="planning-divider" role="separator" aria-label="Redimensionar paneles" aria-orientation="vertical"
          aria-valuemin={30} aria-valuemax={70} aria-valuenow={Math.round(ratio)} tabIndex={0}
          onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = panesRef.current?.getBoundingClientRect(); if (rect) setRatio(clampPanelRatio((event.clientX - rect.left) / rect.width * 100)); }}
          onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}
          onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); setRatio(old => event.key === "Home" ? 30 : event.key === "End" ? 70 : clampPanelRatio(old + (event.key === "ArrowLeft" ? -2 : 2))); }}
        ><span /></div> : null}
      </div>
    </section>
    </PlanningFullscreenContext.Provider>
  );
}

function RetainedView({
  visible,
  wide,
  order,
  children,
}: {
  visible: boolean;
  wide: boolean;
  order: number;
  children: React.ReactNode;
}) {
  const opened = useRef(visible);
  if (visible) opened.current = true;
  return (
    <div hidden={!visible} style={{ order }} className={`planning-retained min-w-0 ${wide ? "planning-wide" : ""}`}>
      {opened.current ? children : null}
    </div>
  );
}

function PlanningViewPanel({
  view,
  preferenceKey,
  timelineProps,
  onHide,
  hideDisabled,
  onMove,
  moveBeforeDisabled,
  moveAfterDisabled,
}: {
  view: PlanningView;
  preferenceKey: string;
  timelineProps: TimelineProps;
  onHide: () => void;
  hideDisabled: boolean;
  onMove: (direction: number) => void;
  moveBeforeDisabled: boolean;
  moveAfterDisabled: boolean;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<string[]>(() => {
    const value = readPreference<unknown>(`${preferenceKey}:filter`, []);
    return Array.isArray(value)
      ? value.filter((x) => typeof x === "string")
      : [];
  });
  const [spaceMode, setSpaceMode] = useState<"timeline" | "list">(()=>readPreference(`${preferenceKey}:options`,{spaceMode:"timeline"}).spaceMode==="list"?"list":"timeline");
  const [hideEmpty, setHideEmpty] = useState(()=>readPreference(`${preferenceKey}:options`,{hideEmpty:false}).hideEmpty===true);
  const [order, setOrder] = useState(()=>{const value=readPreference(`${preferenceKey}:options`,{order:"name"}).order;return ["name","arrival","first","last","task"].includes(value)?value:"name";});
  const [templateId, setTemplateId] = useState(()=>String(readPreference(`${preferenceKey}:options`,{templateId:""}).templateId));
  useEffect(()=>{try{localStorage.setItem(`${preferenceKey}:options`,JSON.stringify({spaceMode,hideEmpty,order,templateId}));}catch{}},[preferenceKey,spaceMode,hideEmpty,order,templateId]);
  useEffect(() => {
    if (view !== "resources") return;
    const focus = () => {
      const resource = new URLSearchParams(window.location.search).get(
        "resource",
      );
      if (resource) {
        setSelection([`resource_item:${resource}`]);
        setFiltersOpen(true);
      }
    };
    focus();
    window.addEventListener("optiplan:planning-focus", focus);
    return () => window.removeEventListener("optiplan:planning-focus", focus);
  }, [view]);
  useEffect(() => {
    try {
      localStorage.setItem(
        `${preferenceKey}:filter`,
        JSON.stringify(selection),
      );
    } catch {}
  }, [preferenceKey, selection]);
  const assigned = useMemo(() => assignedPlanningLocations(timelineProps.plan.dailyTasks, timelineProps.spaces ?? []), [timelineProps.plan.dailyTasks, timelineProps.spaces]);
  const options = useMemo(
    () =>
      view === "contestants"
        ? timelineProps.contestants.map((item) => ({
            id: String(item.id),
            name: item.name,
          }))
        : view === "spaces"
          ? [
              ...(timelineProps.zones ?? []).filter(item => !hideEmpty || assigned.zoneIds.has(Number(item.id))).map((item) => ({
                id: `z:${item.id}`,
                name: item.name,
              })),
              ...(timelineProps.spaces ?? []).filter(item => !hideEmpty || assigned.spaceIds.has(Number(item.id))).map((item) => ({
                id: `s:${item.id}`,
                name: `${timelineProps.zones?.find((z) => Number(z.id) === Number(item.zoneId))?.name ?? "Sin plató"} / ${item.name}`,
              })),
            ]
          : (timelineProps.resourceSelectables ?? []).map((item) => ({
              id: String(item.id),
              name: `${item.label}${item.meta?.typeName ? ` · ${item.meta.typeName}` : ""}`,
            })),
    [
      view,
      timelineProps.contestants,
      timelineProps.zones,
      timelineProps.spaces,
      timelineProps.resourceSelectables,
      hideEmpty, assigned,
    ],
  );
  const effectiveSelection = view === "spaces" && hideEmpty ? selection.filter(id => options.some(option => option.id === id)) : selection;
  useEffect(() => {
    if (view === "spaces" && hideEmpty) setSelection(old => { const next = old.filter(id => options.some(option => option.id === id)); return next.length === old.length ? old : next; });
  }, [view, hideEmpty, options]);
  const templates = useMemo(
    () =>
      [
        ...new Map(
          timelineProps.plan.dailyTasks.map((task) => [
            Number(task.templateId),
            {
              id: Number(task.templateId),
              name: task.template?.name ?? "Tarea sin plantilla",
            },
          ]),
        ).values(),
      ]
        .filter((item) => item.id > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [timelineProps.plan.dailyTasks],
  );
  const contestantOrder: ContestantLaneOrder = useMemo(
    () =>
      order === "task"
        ? { mode: "task", templateId: Number(templateId) }
        : {
            mode: order as "name" | "arrival" | "first" | "last",
            arrivals: Object.fromEntries(
              timelineProps.contestants.map((item) => [
                String(item.id),
                timelineProps.plan.dailyTasks.filter(task=>Number(task.contestantId)===Number(item.id)&&task.template?.name===timelineProps.plan.arrivalTaskTemplateName&&task.startPlanned).map(task=>task.startPlanned!).sort()[0]??null,
              ]),
            ),
          },
    [order, templateId, timelineProps.contestants, timelineProps.plan.dailyTasks, timelineProps.plan.arrivalTaskTemplateName],
  );
  const controls = (
    <div className="flex items-center gap-1">
      <Button size="icon" className="h-8 w-8" variant="ghost" aria-label={`Mover ${labels[view]} antes`} disabled={moveBeforeDisabled} onClick={() => onMove(-1)}><ArrowLeft className="h-3 w-3" /></Button>
      <Button size="icon" className="h-8 w-8" variant="ghost" aria-label={`Mover ${labels[view]} después`} disabled={moveAfterDisabled} onClick={() => onMove(1)}><ArrowRight className="h-3 w-3" /></Button>
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((old) => !old)}
      >
        <Filter className="mr-1 h-4 w-4" />
        Filtros{selection.length ? ` (${selection.length})` : ""}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Ocultar ${labels[view]}`}
        disabled={hideDisabled}
        title={hideDisabled ? "Debe quedar una vista visible" : "Ocultar vista"}
        onClick={onHide}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
  return (
    <div
      className="rounded-xl border bg-card p-2 shadow-sm"
      data-testid={`planning-panel-${view}`}
    >
      <FullscreenPlanningPanel
        title={labels[view]}
        viewKey={preferenceKey}
        supportsZoom
        toolbarRight={controls}
      >
        {filtersOpen ? (
          <div className="planning-filters absolute inset-x-0 top-0 z-40 space-y-3 rounded-lg border bg-card p-3 shadow-lg">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={`Buscar en ${labels[view]}`}
                placeholder="Buscar…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="max-w-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelection([]);
                  setSearch("");
                }}
              >
                Mostrar todos
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={hideEmpty}
                  onCheckedChange={(value) => setHideEmpty(value === true)}
                />
                Ocultar vacíos
              </label>
            </div>
            <div className="grid max-h-40 gap-2 overflow-auto sm:grid-cols-2">
              {options
                .filter((item) =>
                  item.name
                    .toLocaleLowerCase("es")
                    .includes(search.toLocaleLowerCase("es")),
                )
                .map((item) => (
                  <label
                    key={item.id}
                    className="flex items-start gap-2 text-sm"
                  >
                    <Checkbox
                      checked={selection.includes(item.id)}
                      onCheckedChange={(checked) =>
                        setSelection((old) =>
                          checked
                            ? [...old, item.id]
                            : old.filter((id) => id !== item.id),
                        )
                      }
                    />
                    {item.name}
                  </label>
                ))}
            </div>
            {selection.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sin selección: se muestran todos.
              </p>
            ) : null}
          </div>
        ) : null}
        {view === "contestants" ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <label>
              Ordenar{" "}
              <select
                className="ml-2 rounded-md border bg-background p-2"
                aria-label="Ordenar concursantes"
                value={order}
                onChange={(event) => setOrder(event.target.value)}
              >
                <option value="name">Nombre</option>
                <option value="arrival">Hora de llegada planificada</option>
                <option value="first">Primera tarea</option>
                <option value="last">Última tarea</option>
                <option value="task">Tipo de tarea</option>
              </select>
            </label>
            {order === "task" ? (
              <>
                <select
                  aria-label="Tipo de tarea para ordenar"
                  className="rounded-md border bg-background p-2"
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                >
                  <option value="">Selecciona una tarea</option>
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  Sin esa tarea u horario: al final.
                </span>
              </>
            ) : null}
          </div>
        ) : null}
        {view === "spaces" ? (
          <div className="mb-3 flex gap-1">
            <Button
              size="sm"
              variant={spaceMode === "timeline" ? "secondary" : "ghost"}
              onClick={() => setSpaceMode("timeline")}
            >
              Timeline
            </Button>
            <Button
              size="sm"
              variant={spaceMode === "list" ? "secondary" : "ghost"}
              onClick={() => setSpaceMode("list")}
            >
              Lista
            </Button>
          </div>
        ) : null}
        <SharedTimeline
          {...timelineProps}
          viewMode={view}
          spaceVerticalMode={spaceMode}
          contestantOrder={contestantOrder}
          contestantFilterIds={
            view === "contestants" ? effectiveSelection.map(Number) : []
          }
          stageFilterIds={
            view === "spaces"
              ? effectiveSelection
                  .filter((id) => id.startsWith("z:"))
                  .map((id) => Number(id.slice(2)))
              : []
          }
          spaceFilterIds={
            view === "spaces"
              ? effectiveSelection
                  .filter((id) => id.startsWith("s:"))
                  .map((id) => Number(id.slice(2)))
              : []
          }
          resourceFilterIds={view === "resources" ? effectiveSelection : []}
          hideEmptyLanes={hideEmpty}
        />
      </FullscreenPlanningPanel>
    </div>
  );
}

export function PlanningWorkspaceLayout(props: Parameters<typeof ScopedPlanningWorkspaceLayout>[0]) {
  const { user } = useAuth();
  return <ScopedPlanningWorkspaceLayout key={`${user?.id ?? "session"}:${props.planId}`} {...props} />;
}
