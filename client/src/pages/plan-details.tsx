import { Layout } from "@/components/layout";
import { useGeneratePlan, useUpdatePlan } from "@/hooks/use-plans";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { useParams, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlanningTimeline } from "@/components/planning-timeline";
import { FullscreenPlanningPanel } from "@/components/planning/fullscreen-planning-panel";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Video,
  Play,
  Loader2,
  AlertTriangle,
  LayoutList,
  GanttChartSquare,
  ChevronDown,
  ChevronUp,
  Trash2,
  Users,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest } from "@/lib/api";

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
import { useEffect, useMemo, useState } from "react";
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
  useUpdateTaskStatus,
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
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
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

type ResourceSelectable = {
  id: string | number;
  label: string;
  kind: "resource_item" | "production" | "editorial" | "itinerant_team";
  meta?: { typeName?: string; color?: string };
};

function PlanStaffRolesTab({
  planId,
  zones,
  spaces,
}: {
  planId: number;
  zones: any[];
  spaces: any[];
}) {
  const { data: staffPeople = [], isLoading: staffLoading } = useStaffPeople();
  const { data: itinerantTeams = [] } = useItinerantTeams();

  const { data: modes = [], isLoading: modesLoading } =
    usePlanZoneStaffModes(planId);
  const saveModes = useSavePlanZoneStaffModes(planId);

  const { data: assignments = [], isLoading: asgLoading } =
    usePlanStaffAssignments(planId);
  const saveAssignments = useSavePlanStaffAssignments(planId);

  const [localModes, setLocalModes] = useState<Map<number, ZoneStaffMode>>(
    new Map(),
  );
  const [localAssignments, setLocalAssignments] = useState<any[]>([]);

  // Init from server
  useEffect(() => {
    const m = new Map<number, ZoneStaffMode>();
    for (const r of modes as any[]) {
      const zid = Number(r?.zoneId);
      if (!Number.isFinite(zid)) continue;
      m.set(zid, (r?.mode ?? "zone") as ZoneStaffMode);
    }
    setLocalModes(m);
  }, [JSON.stringify(modes ?? [])]);

  useEffect(() => {
    setLocalAssignments((assignments ?? []) as any[]);
  }, [JSON.stringify(assignments ?? [])]);

  const activePeople = (staffPeople ?? []).filter((p: any) => !!p?.isActive);

  const spacesByZone = new Map<number, any[]>();
  for (const s of spaces as any[]) {
    const zid = Number(s?.zoneId ?? s?.zone_id);
    if (!Number.isFinite(zid)) continue;
    const list = spacesByZone.get(zid) ?? [];
    list.push(s);
    spacesByZone.set(zid, list);
  }

  const getMode = (zoneId: number): ZoneStaffMode =>
    localModes.get(zoneId) ?? "zone";

  const setMode = (zoneId: number, mode: ZoneStaffMode) => {
    setLocalModes((prev) => {
      const next = new Map(prev);
      next.set(zoneId, mode);
      return next;
    });
  };

  const listFor = (args: {
    staffRole: StaffRoleType;
    scopeType: StaffScopeType;
    zoneId?: number | null;
    spaceId?: number | null;
    realityTeamCode?: string | null;
    itinerantTeamId?: number | null;
  }) => {
    return (localAssignments ?? []).filter((a: any) => {
      if (a?.staffRole !== args.staffRole) return false;
      if (a?.scopeType !== args.scopeType) return false;

      const zid = a?.zoneId ?? a?.zone_id ?? null;
      const sid = a?.spaceId ?? a?.space_id ?? null;
      const rtc = a?.realityTeamCode ?? a?.reality_team_code ?? null;
      const itid = a?.itinerantTeamId ?? a?.itinerant_team_id ?? null;

      if ((args.zoneId ?? null) !== (zid ?? null)) return false;
      if ((args.spaceId ?? null) !== (sid ?? null)) return false;
      if ((args.realityTeamCode ?? null) !== (rtc ?? null)) return false;
      if ((args.itinerantTeamId ?? null) !== (itid ?? null)) return false;
      return true;
    });
  };

  const addAssignment = (args: {
    staffRole: StaffRoleType;
    scopeType: StaffScopeType;
    staffPersonId: number;
    zoneId?: number | null;
    spaceId?: number | null;
    realityTeamCode?: string | null;
    itinerantTeamId?: number | null;
  }) => {
    const pid = Number(args.staffPersonId);
    if (!Number.isFinite(pid) || pid <= 0) return;

    setLocalAssignments((prev) => {
      const exists = prev.some((a: any) => {
        if (a?.staffRole !== args.staffRole) return false;
        if (a?.scopeType !== args.scopeType) return false;
        if (Number(a?.staffPersonId ?? a?.staff_person_id) !== pid)
          return false;

        const zid = a?.zoneId ?? a?.zone_id ?? null;
        const sid = a?.spaceId ?? a?.space_id ?? null;
        const rtc = a?.realityTeamCode ?? a?.reality_team_code ?? null;
        const itid = a?.itinerantTeamId ?? a?.itinerant_team_id ?? null;

        if ((args.zoneId ?? null) !== (zid ?? null)) return false;
        if ((args.spaceId ?? null) !== (sid ?? null)) return false;
        if ((args.realityTeamCode ?? null) !== (rtc ?? null)) return false;
        if ((args.itinerantTeamId ?? null) !== (itid ?? null)) return false;
        return true;
      });
      if (exists) return prev;

      return [
        ...prev,
        {
          staffRole: args.staffRole,
          staffPersonId: pid,
          staffPersonName:
            activePeople.find((p: any) => Number(p.id) === pid)?.name ?? "",
          scopeType: args.scopeType,
          zoneId: args.scopeType === "zone" ? Number(args.zoneId) : null,
          spaceId: args.scopeType === "space" ? Number(args.spaceId) : null,
          realityTeamCode:
            args.scopeType === "reality_team"
              ? (args.realityTeamCode ?? null)
              : null,
          itinerantTeamId:
            args.scopeType === "itinerant_team"
              ? (args.itinerantTeamId ?? null)
              : null,
        },
      ];
    });
  };
  
  const removeAssignment = (idx: number) => {
    setLocalAssignments((prev) =>
      prev.filter((_: any, i: number) => i !== idx),
    );
  };

    const AssignmentPicker = ({
      title,
      staffRole,
      scopeType,
      zoneId,
      spaceId,
      realityTeamCode,
      itinerantTeamId,
    }: {
      title: string;
      staffRole: StaffRoleType;
      scopeType: StaffScopeType;
      zoneId?: number | null;
      spaceId?: number | null;
      realityTeamCode?: string | null;
      itinerantTeamId?: number | null;
    }) => {
      const list = listFor({
        staffRole,
        scopeType,
        zoneId,
        spaceId,
        realityTeamCode,
        itinerantTeamId,
      });
      const [open, setOpen] = useState(false);
      const [draft, setDraft] = useState<number[]>([]);
      const selectedLabel =
        list.length === 0
          ? "—"
          : list.map((a: any) => String(a?.staffPersonName ?? `#${a?.staffPersonId}`)).join(", ");
      const rolePeople = activePeople.filter((p: any) => p.roleType === staffRole);

      return (
        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{title}</div>
            <div className="truncate text-sm">{selectedLabel}</div>
          </div>
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (next) {
                setDraft(list.map((a: any) => Number(a?.staffPersonId ?? a?.staff_person_id)).filter((n: number) => Number.isFinite(n)));
              }
            }}
          >
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">Editar</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 max-h-72 overflow-auto">
                {rolePeople.map((p: any) => {
                  const pid = Number(p.id);
                  const active = draft.includes(pid);
                  return (
                    <label key={pid} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => {
                          setDraft((prev) =>
                            e.target.checked ? [...prev, pid] : prev.filter((x) => x !== pid),
                          );
                        }}
                      />
                      {p.name}
                    </label>
                  );
                })}
              </div>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button
                  type="button"
                  onClick={() => {
                    setLocalAssignments((prev) => prev.filter((a: any) => {
                      if (a?.staffRole !== staffRole || a?.scopeType !== scopeType) return true;
                      const zid = a?.zoneId ?? a?.zone_id ?? null;
                      const sid = a?.spaceId ?? a?.space_id ?? null;
                      const rtc = a?.realityTeamCode ?? a?.reality_team_code ?? null;
                      const itid = a?.itinerantTeamId ?? a?.itinerant_team_id ?? null;
                      return (zoneId ?? null) !== (zid ?? null) || (spaceId ?? null) !== (sid ?? null) || (realityTeamCode ?? null) !== (rtc ?? null) || (itinerantTeamId ?? null) !== (itid ?? null);
                    }));
                    for (const pid of draft) {
                      addAssignment({ staffRole, scopeType, staffPersonId: pid, zoneId, spaceId, realityTeamCode, itinerantTeamId });
                    }
                    setOpen(false);
                  }}
                >Guardar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      );
    };

  const handleSave = async () => {
    const modesPayload = zones.map((z: any) => ({
      zoneId: Number(z?.id),
      mode: getMode(Number(z?.id)),
    }));

    const assignmentsPayload = (localAssignments ?? []).map((a: any) => ({
      staffRole: a.staffRole as StaffRoleType,
      staffPersonId: Number(a.staffPersonId),
      scopeType: a.scopeType as StaffScopeType,
      zoneId: a.zoneId ?? null,
      spaceId: a.spaceId ?? null,
      realityTeamCode: a.realityTeamCode ?? null,
      itinerantTeamId: a.itinerantTeamId ?? null,
    }));

    await saveModes.mutateAsync(modesPayload);
    await saveAssignments.mutateAsync(assignmentsPayload);
  };

  const busy =
    modesLoading ||
    asgLoading ||
    staffLoading ||
    saveModes.isPending ||
    saveAssignments.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Roles por plató / espacio</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              Regla: por cada plató decides si asignas por <b>Plató</b> o por{" "}
              <b>Espacios</b>. En modo espacios no hay herencia.
            </div>
          </div>

          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Guardar
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {zones.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No hay platós/zones.
            </div>
          ) : (
            <>
              {zones.map((z: any) => {
                const zid = Number(z?.id);
                const zoneName = String(z?.name ?? `Plató ${zid}`);
                const mode = getMode(zid);

                const zoneSpaces = (spacesByZone.get(zid) ?? [])
                  .slice()
                  .sort((a, b) => {
                    const an = String(a?.name ?? "");
                    const bn = String(b?.name ?? "");
                    return an.localeCompare(bn);
                  });

                return (
                  <Card key={String(zid)} className="border-muted">
                    <CardHeader className="pb-3">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="font-semibold">{zoneName}</div>

                        <div className="flex items-center gap-2">
                          <Label className="text-sm text-muted-foreground">
                            Asignar por
                          </Label>
                          <Select
                            value={mode}
                            onValueChange={(v) =>
                              setMode(zid, v as ZoneStaffMode)
                            }
                          >
                            <SelectTrigger className="w-[220px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="zone">Plató</SelectItem>
                              <SelectItem value="space">Espacios</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-6">
                      {mode === "zone" ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <AssignmentPicker
                            title="Producción"
                            staffRole="production"
                            scopeType="zone"
                            zoneId={zid}
                          />
                          <AssignmentPicker
                            title="Redacción"
                            staffRole="editorial"
                            scopeType="zone"
                            zoneId={zid}
                          />
                        </div>
                      ) : mode === "space" ? (
                        zoneSpaces.length === 0 ? (
                          <div className="text-sm text-muted-foreground">
                            Este plató no tiene espacios.
                          </div>
                        ) : (
                          <div className="space-y-6">
                            {zoneSpaces.map((s: any) => {
                              const sid = Number(s?.id);
                              const spaceName = String(
                                s?.name ?? `Espacio ${sid}`,
                              );
                              return (
                                <Card
                                  key={String(sid)}
                                  className="border-border/60"
                                >
                                  <CardHeader className="pb-3">
                                    <div className="font-medium">
                                      {spaceName}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      En modo espacios, si aquí no asignas →
                                      queda vacío.
                                    </div>
                                  </CardHeader>
                                  <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <AssignmentPicker
                                      title="Producción"
                                      staffRole="production"
                                      scopeType="space"
                                      spaceId={sid}
                                    />
                                    <AssignmentPicker
                                      title="Redacción"
                                      staffRole="editorial"
                                      scopeType="space"
                                      spaceId={sid}
                                    />
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        )
                      ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <AssignmentPicker
                            title="Producción"
                            staffRole="production"
                            scopeType="zone"
                            zoneId={zid}
                          />
                          <AssignmentPicker
                            title="Redacción"
                            staffRole="editorial"
                            scopeType="zone"
                            zoneId={zid}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
          {/* ✅ Reality: equipos itinerantes (siempre aparte, NO es modo del plató) */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="font-semibold">Reality (equipos itinerantes)</div>
              <div className="text-sm text-muted-foreground">
                Aparecen en “Por espacios” como columnas lógicas, pero hacen
                tareas en otros sitios.
              </div>
            </CardHeader>

            <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {(itinerantTeams as any[]).filter((t: any) => !!t?.isActive).length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No hay equipos itinerantes activos.
                </div>
              ) : (
                (itinerantTeams as any[])
                  .filter((t: any) => !!t?.isActive)
                  .slice()
                  .sort((a: any, b: any) => {
                    const ao = Number(a?.orderIndex ?? a?.order_index ?? 0);
                    const bo = Number(b?.orderIndex ?? b?.order_index ?? 0);
                    return ao - bo;
                  })
                  .map((t: any) => {
                    const tid = Number(t?.id);
                    const teamName = String(t?.name ?? t?.code ?? `Equipo ${tid}`);

                    return (
                      <Card key={String(tid)} className="border-border/60">
                        <CardHeader className="pb-3">
                          <div className="font-medium">{teamName}</div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <AssignmentPicker
                            title="Producción"
                            staffRole="production"
                            scopeType="itinerant_team"
                            itinerantTeamId={tid}
                          />
                          <AssignmentPicker
                            title="Redacción"
                            staffRole="editorial"
                            scopeType="itinerant_team"
                            itinerantTeamId={tid}
                          />
                        </CardContent>
                      </Card>
                    );
                  })
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <Alert>
        <AlertTitle>Importante</AlertTitle>
        <AlertDescription>
          Este tab define quién opera (Producción) y quién está asignado
          (Redacción). En el siguiente lote, estos nombres se mostrarán en
          cabeceras del planning por plató/espacio.
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default function PlanDetailsPage() {
  const params = useParams();
  const id = parseInt(params.id || "0");
  const [, setLocation] = useLocation();

  const [plan, setPlan] = useState<any | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPlanDetails() {
      try {
        setPlanLoading(true);
        setPlanError(null);

        const response = await apiRequest<any>(
          "GET",
          buildUrl(api.plans.get.path, { id }),
        );

        if (!cancelled) {
          setPlan(response ?? null);
        }
      } catch (error: any) {
        if (cancelled) return;

        const isPermissionDenied =
          error?.type === "permission_denied" ||
          error?.status === 401 ||
          error?.status === 403;

        setPlan(null);
        setPlanError(
          isPermissionDenied
            ? "No tienes permisos para ver este plan."
            : (error?.message ?? "No se pudo cargar el plan."),
        );
      } finally {
        if (!cancelled) {
          setPlanLoading(false);
        }
      }
    }

    if (!Number.isFinite(id) || id <= 0) {
      setPlan(null);
      setPlanError("ID de plan inválido.");
      setPlanLoading(false);
      return;
    }

    loadPlanDetails();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const generatePlan = useGeneratePlan();

  const updatePlan = useUpdatePlan();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: contestants = [] } = useContestants(id);
  const { data: zones = [], isLoading: zonesLoading } = useZones();
  const { data: staffPeople = [] } = useStaffPeople();
  const { data: planZoneStaffModes = [] } = usePlanZoneStaffModes(id);
  const { data: planStaffAssignments = [] } = usePlanStaffAssignments(id);
  const { data: itinerantTeams = [] } = useItinerantTeams();
  const { data: spaces = [], isLoading: spacesLoading } = useSpaces();
  const { data: taskTemplates = [] } = useTaskTemplates();

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
  const updateTaskStatus = useUpdateTaskStatus();

  const [newName, setNewName] = useState("");
  const [newInstrument, setNewInstrument] = useState(false);
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

  const [showAdminTasks, setShowAdminTasks] = useState(false);
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

  const [activeTab, setActiveTab] = useState<
    "tasks" | "planning" | "resources" | "execution"
  >("tasks");

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
      } catch {
        // Silencioso: esto es "nice to have" para tooltip, no debe romper nada
      }
    })();
  }, [id]);

  // NEW: para tooltip de planning (explicabilidad)
  const [zoneAssignmentsForTooltip, setZoneAssignmentsForTooltip] = useState<
    Record<number, number[]>
  >({});
  const [planResourceItemNameById, setPlanResourceItemNameById] = useState<
    Record<number, string>
  >({});

  const [coachOptions, setCoachOptions] = useState<
    { id: number; name: string }[]
  >([]);
  const handlePlanningTaskStatusChange = async (
    task: any,
    status: "in_progress" | "done" | "interrupted" | "cancelled",
  ) => {
    const payload: any = {
      taskId: Number(task?.id),
      status,
    };

    await updateTaskStatus.mutateAsync(payload);
  };

  function handleCreateContestant() {
    if (!newName.trim()) return;

    const vocalCoachPlanResourceItemId =
      newCoachPriId !== "none" ? Number(newCoachPriId) : null;

    createContestant.mutate(
      {
        name: newName,
        instrument: newInstrument,
        song: newSong.trim() || null,
        vocalCoachPlanResourceItemId,
      },
      {
        onSuccess: () => {
          setNewName("");
          setNewInstrument(false);
          setNewSong("");
          setNewCoachPriId("none");
          void apiRequest<any>("GET", buildUrl(api.plans.get.path, { id }))
            .then((response) => setPlan(response ?? null))
            .catch(() => undefined);
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
    contestantMealDurationMinutes: 75,
    contestantMealMaxSimultaneous: 10,
    camerasAvailable: 0,
  });

  const [configDialog, setConfigDialog] = useState<{
    open: boolean;
    reasons: any[];
  }>({
    open: false,
    reasons: [],
  });

  // Infeasible (no se puede planificar)
  const [errorDialog, setErrorDialog] = useState<{
    open: boolean;
    reasons: any[];
  }>({
    open: false,
    reasons: [],
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

  function coachLabelFor(vocalCoachPlanResourceItemId: any) {
    const idNum = Number(vocalCoachPlanResourceItemId);
    if (!Number.isFinite(idNum) || idNum <= 0) return "Sin coach";

    const found = coachOptions.find((x) => Number(x.id) === idNum);
    return found?.name ? `Coach: ${found.name}` : `Coach #${idNum}`;
  }

  function isMissingSpace(t: any) {
    const zoneId = t?.zoneId ?? t?.zone_id ?? null;

    const mealName = String(plan?.mealTaskTemplateName ?? "Comer")
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

  const resourceOptionById = useMemo(
    () => new Map(resourceFilterOptions.map((opt) => [String(opt.id), opt])),
    [resourceFilterOptions],
  );

  const [resourceSelectorOpen, setResourceSelectorOpen] = useState(false);

  const selectedResourceOptions = resourceFilterIds
    .map((id) => resourceOptionById.get(String(id)))
    .filter((v): v is ResourceSelectable => Boolean(v));

  if (planLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (planError) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh] px-4">
          <Alert variant="destructive" className="max-w-xl w-full">
            <AlertTitle>No se pudo cargar el plan</AlertTitle>
            <AlertDescription>{planError}</AlertDescription>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => setLocation("/plans")}>
                Volver
              </Button>
              <Button onClick={() => window.location.reload()}>Reintentar</Button>
            </div>
          </Alert>
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
      contestantMealDurationMinutes: plan.contestantMealDurationMinutes ?? 75,
      contestantMealMaxSimultaneous: plan.contestantMealMaxSimultaneous ?? 10,
      camerasAvailable: plan.camerasAvailable ?? 0,
    });
    setEditOpen(true);
  };

  const handleGenerate = () => {
    generatePlan.mutate(id, {
      onSuccess: (data: any) => {
        const warnings = data?.warnings ?? [];
        if (Array.isArray(warnings) && warnings.length > 0) {
          setConfigDialog({ open: true, reasons: warnings });
        }
      },
      onError: (err: any) => {
        if (err.reasons) {
          setErrorDialog({ open: true, reasons: err.reasons });
        }
      },
    });
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

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/plans")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">Plan #{plan.id}</h1>
                <Badge
                  variant={plan.status === "draft" ? "secondary" : "default"}
                >
                  {plan.status}
                </Badge>
              </div>
              <p className="text-muted-foreground flex items-center mt-1">
                <Calendar className="h-4 w-4 mr-1" />
                {format(new Date(plan.date), "EEEE, MMMM d, yyyy")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20"
              onClick={handleGenerate}
              disabled={generatePlan.isPending}
            >
              {generatePlan.isPending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Play className="mr-2 h-5 w-5" />
              )}
              {generatePlan.isPending
                ? "Planificando..."
                : "Generar Planificación"}
            </Button>
            <Button variant="outline" onClick={openEdit}>
              Editar día
            </Button>
          </div>
        </div>

        {/* Metadata Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card p-4 rounded-xl border border-border flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Horario del día
              </p>
              <p className="text-lg font-semibold">
                {" "}
                {plan?.workStart && plan?.workEnd
                  ? `${plan.workStart} – ${plan.workEnd}`
                  : "—"}
              </p>
            </div>
          </div>
          <div className="bg-card p-4 rounded-xl border border-border flex items-center gap-3">
            <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <Utensils className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Horario de comida
              </p>
              <p className="text-lg font-semibold">
                {plan?.mealStart && plan?.mealEnd
                  ? `${plan.mealStart} – ${plan.mealEnd}`
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
          className="space-y-6"
        >
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <LayoutList className="h-4 w-4" />
              Concursantes
            </TabsTrigger>
            <TabsTrigger value="planning" className="flex items-center gap-2">
              <GanttChartSquare className="h-4 w-4" />
              Planning
            </TabsTrigger>
            <TabsTrigger value="resources" className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              Recursos
            </TabsTrigger>
            <TabsTrigger value="staff" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Roles
            </TabsTrigger>

            <TabsTrigger value="execution" className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              Ejecución
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="space-y-6 mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Concursantes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {contestants.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No hay concursantes creados todavía.
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {contestants.map((c: any) => {
                    const coachName = c.vocalCoachPlanResourceItemId
                      ? (coachOptions.find(
                          (x) =>
                            x.id === Number(c.vocalCoachPlanResourceItemId),
                        )?.name ?? null)
                      : null;

                    const coachLabel = coachLabelFor(
                      c.vocalCoachPlanResourceItemId,
                    );

                    const contestantTasks = (plan.dailyTasks ?? []).filter(
                      (t: any) => Number(t.contestantId) === Number(c.id),
                    );

                    const totalCount = contestantTasks.length;
                    const missingSpaceCount =
                      contestantTasks.filter(isMissingSpace).length;

                    const inProgressCount = contestantTasks.filter(
                      (t: any) => t.status === "in_progress",
                    ).length;

                    const doneCount = contestantTasks.filter(
                      (t: any) => t.status === "done",
                    ).length;

                    const interruptedCount = contestantTasks.filter(
                      (t: any) => t.status === "interrupted",
                    ).length;

                    const cancelledCount = contestantTasks.filter(
                      (t: any) => t.status === "cancelled",
                    ).length;

                    const hasInProgress = inProgressCount > 0;

                    const badgeParts = [
                      String(totalCount),
                      ...(missingSpaceCount > 0
                        ? [`${missingSpaceCount}⚠`]
                        : []),
                      ...(inProgressCount > 0 ? [`${inProgressCount}▶`] : []),
                      ...(doneCount > 0 ? [`${doneCount}✓`] : []),
                      ...(interruptedCount > 0
                        ? [`${interruptedCount}⏸`]
                        : []),
                      ...(cancelledCount > 0 ? [`${cancelledCount}✖`] : []),
                    ];

                    const badgeText = badgeParts.join(" · ");

                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left bg-card rounded-lg border border-border p-3 hover:bg-muted/40 transition h-full min-h-[96px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setSelectedContestant(c)}
                      >
                        {/* Fila 1: instrumento + nombre (misma línea) + globo nº tareas */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="text-base leading-none">
                              {c.instrument ? "🎸" : "🎤"}
                            </span>
                            <div className="font-medium truncate">{c.name}</div>
                          </div>

                          <span
                            className={[
                              "shrink-0 rounded-full border px-2 py-0.5 text-xs",
                              hasInProgress
                                ? "border-blue-200 bg-blue-50 text-blue-700"
                                : "border-border text-muted-foreground",
                            ].join(" ")}
                            title="Total · ⚠ sin espacio · in_progress ▶ · done ✓ · interrupted ⏸ · cancelled ✖"
                          >
                            {badgeText}
                          </span>
                        </div>

                        {/* Fila 2: canción */}
                        <div className="mt-2 text-xs text-muted-foreground truncate">
                          {c.song ? `🎵 ${c.song}` : "🎵 (sin canción)"}
                        </div>

                        {/* Fila 3: coach */}
                        <div className="mt-1 text-xs text-muted-foreground truncate">
                          {coachLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
                  <Input
                    className="md:col-span-1"
                    placeholder="Nombre"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />

                  <Input
                    className="md:col-span-1"
                    placeholder="Canción"
                    value={newSong}
                    onChange={(e) => setNewSong(e.target.value)}
                  />

                  <Select
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

                  <div className="md:col-span-1 flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={newInstrument}
                        onCheckedChange={(v) => setNewInstrument(!!v)}
                      />
                      <span className="text-sm">Instrumento</span>
                    </div>

                    <Button
                      className="ml-auto"
                      onClick={handleCreateContestant}
                      disabled={createContestant.isPending}
                    >
                      Añadir
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Dialog
              open={!!selectedContestant}
              onOpenChange={(open) => {
                if (!open) setSelectedContestant(null);
              }}
            >
              <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle>
                    Ficha: {selectedContestant?.name ?? "Concursante"}
                  </DialogTitle>
                  <DialogDescription>
                    Gestiona tareas del día para este concursante.
                  </DialogDescription>
                </DialogHeader>

                <div className="max-h-[75vh] overflow-y-auto pr-2 space-y-4">
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
                        disabled={updateContestant.isPending}
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
                        disabled={updateContestant.isPending}
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
                            placeholder="HH:MM"
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
                            disabled={updateContestant.isPending}
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
                            placeholder="HH:MM"
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
                            disabled={updateContestant.isPending}
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
                        <Checkbox
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
                            disabled={updateContestant.isPending}
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
                        disabled={updateContestant.isPending}
                        className="min-h-[90px]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      Daily Tasks asignadas
                    </h3>

                    <div className="flex items-center gap-2">
                      <AddTaskDialog
                        planId={id}
                        contestantId={selectedContestant?.id ?? null}
                        // Nota: si AddTaskDialog NO acepta contestantId, lo dejamos como está en este lote
                      />
                    </div>
                  </div>

                  {/* Tareas del concursante */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">
                        Daily Tasks asignadas
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {plan.dailyTasks?.filter(
                          (t: any) => t.contestantId === selectedContestant?.id,
                        ).length ?? 0}{" "}
                        tareas
                      </span>
                    </div>

                    <div className="rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Task</TableHead>
                            <TableHead className="w-[160px]">Estado</TableHead>
                            <TableHead className="w-[200px]">Plató</TableHead>
                            <TableHead className="w-[220px]">Espacio</TableHead>
                            <TableHead className="w-[120px]">Acción</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(plan.dailyTasks ?? [])
                            .filter(
                              (t: any) =>
                                t.contestantId === selectedContestant?.id,
                            )
                            // Daily tasks asignadas
                            .map((t: any) => (
                              <TableRow key={t.id} data-ta={t.id}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    {isMissingSpace(t) && (
                                      <span
                                        className="text-destructive"
                                        title="Requiere configuración: falta espacio"
                                      >
                                        ⚠
                                      </span>
                                    )}
                                    <span>
                                      {t.template?.name ||
                                        `Template #${t.templateId}`}
                                    </span>
                                  </div>
                                </TableCell>

                                <TableCell className="text-xs">
                                  {t.status || "pending"}
                                </TableCell>

                                {(() => {
                                  const zoneRaw = t.zoneId ?? t.zone_id ?? null;
                                  const spaceRaw =
                                    t.spaceId ?? t.space_id ?? null;

                                  const zoneId =
                                    zoneRaw === null || zoneRaw === undefined
                                      ? null
                                      : Number(zoneRaw);
                                  const spaceId =
                                    spaceRaw === null || spaceRaw === undefined
                                      ? null
                                      : Number(spaceRaw);

                                  const locationLabel =
                                    t.locationLabel ?? t.location_label ?? null;

                                  const locked =
                                    t.status === "in_progress" ||
                                    t.status === "done";

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
                                          <Select
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
                                                  { id: t.id },
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
                                              {(zones as any[]).map(
                                                (z: any) => (
                                                  <SelectItem
                                                    key={z.id}
                                                    value={String(z.id)}
                                                  >
                                                    {z.name}
                                                  </SelectItem>
                                                ),
                                              )}
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
                                                  { id: t.id },
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
                                            disabled={zoneId === null}
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
                                                (spacesByZone.get(
                                                  zoneId ?? -1,
                                                ) ?? []) as any[]
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
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive"
                                    onClick={async () => {
                                      if (
                                        t.status === "in_progress" ||
                                        t.status === "done"
                                      ) {
                                        toast({
                                          title: "No se puede cambiar",
                                          description:
                                            "Tareas in_progress/done son inamovibles.",
                                          variant: "destructive",
                                        });
                                        return;
                                      }

                                      try {
                                        await apiRequest(
                                          "DELETE",
                                          buildUrl(api.dailyTasks.delete.path, {
                                            id: t.id,
                                          }),
                                        );

                                        queryClient.invalidateQueries({
                                          queryKey: [
                                            buildUrl(api.plans.get.path, {
                                              id,
                                            }),
                                          ],
                                        });

                                        toast({ title: "Tarea eliminada" });
                                      } catch (e: any) {
                                        toast({
                                          title: "Error eliminando",
                                          description:
                                            e?.message ||
                                            e?.response?.message ||
                                            "Error desconocido",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                    aria-label="Eliminar tarea"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}

                          {(plan.dailyTasks ?? []).filter(
                            (t: any) =>
                              t.contestantId === selectedContestant?.id,
                          ).length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={5}
                                className="h-20 text-center text-muted-foreground"
                              >
                                No hay tareas asignadas todavía.
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedContestant(null)}
                    >
                      Cerrar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Tasks Section */}
            <Collapsible open={showAdminTasks} onOpenChange={setShowAdminTasks}>
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">
                      Daily Tasks (administración)
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Recomendado: asigna y gestiona tareas desde la ficha de
                      cada concursante.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        {showAdminTasks ? "Ocultar tabla" : "Mostrar tabla"}
                        {showAdminTasks ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>

                <CollapsibleContent className="pt-2">
                  <div className="flex items-center justify-between gap-3 pb-2">
                    <p className="text-sm text-muted-foreground">
                      (Opcional) Crear una tarea global sin pasar por la ficha.
                    </p>
                    <AddTaskDialog planId={id} />
                  </div>

                  <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[300px]">
                            Task Template
                          </TableHead>
                          <TableHead>Contestant</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Planned Start</TableHead>
                          <TableHead>Planned End</TableHead>
                          <TableHead className="w-[140px]">Duration</TableHead>
                          <TableHead className="w-[140px]">Cameras</TableHead>
                          <TableHead className="w-[200px]">Plató</TableHead>
                          <TableHead className="w-[220px]">Espacio</TableHead>
                          <TableHead className="w-[90px]">Actions</TableHead>
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
                          plan.dailyTasks?.map((task: any) => (
                            <TableRow key={task.id}>
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
                                <Select
                                  value={task.status || "pending"}
                                  onValueChange={(next) => {
                                    updateTaskStatus.mutate({
                                      taskId: task.id,
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
                                  <Input
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
                                  <Input
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
                                        <Select
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
                                          disabled={zoneId === null}
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
                                {task.status !== "in_progress" &&
                                task.status !== "done" ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={async () => {
                                      if (!confirm("Delete this task?")) return;

                                      await apiRequest(
                                        "DELETE",
                                        buildUrl(api.dailyTasks.delete.path, {
                                          id: task.id,
                                        }),
                                      );

                                      // refrescar plan (tareas incluidas)
                                      queryClient.invalidateQueries({
                                        queryKey: [
                                          buildUrl(api.plans.get.path, { id }),
                                        ],
                                      });

                                      toast({ title: "Task deleted" });
                                    }}
                                  >
                                    Delete
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    Locked
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          </TabsContent>

          <TabsContent value="planning" className="mt-0">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold">Visual Timeline</h2>

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
                    {plan.dailyTasks?.filter((t: any) => t.startPlanned).length}
                  </Badge>
                </div>
              </div>

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
                            : "Selecciona recursos"}
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
                    <p className="text-xs text-muted-foreground">Selecciona recursos</p>
                  )}

                  {resourceFilterOptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay recursos para filtrar.</p>
                  ) : null}
                </Card>
              )}

              <FullscreenPlanningPanel
                title="Planning"
                viewKey={`plan-${id}-${timelineView}-${spaceVerticalMode}`}
                supportsZoom
              >
                <PlanningTimeline
                  plan={plan as any}
                  contestants={contestants as any}
                  viewMode={timelineView}
                  spaceVerticalMode={spaceVerticalMode}
                  stageFilterIds={stageFilterIds}
                  resourceFilterIds={resourceFilterIds}
                  resourceSelectables={resourceFilterOptions as any}
                  zones={zones as any}
                  spaces={spaces as any}
                  zoneResourceAssignments={zoneAssignmentsForTooltip}
                  planResourceItemNameById={planResourceItemNameById}
                  zoneStaffModes={planZoneStaffModes as any}
                  itinerantTeams={itinerantTeams as any}
                  staffAssignments={planStaffAssignments as any}
                  onTaskStatusChange={handlePlanningTaskStatusChange}
                  taskStatusPending={updateTaskStatus.isPending}
                />
              </FullscreenPlanningPanel>
            </div>
          </TabsContent>

          <TabsContent value="resources" className="mt-0">
            <PlanResourcesTab planId={id} />
          </TabsContent>
          <TabsContent value="staff" className="space-y-6 mt-0">
            <PlanStaffRolesTab
              planId={id}
              zones={zones as any[]}
              spaces={spaces as any[]}
            />
          </TabsContent>
          <TabsContent value="execution" className="mt-0 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ejecución del día</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Aquí los ayudantes declaran inicio/fin en tiempo real. Todos
                  los cambios se verán al instante.
                </p>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[90px]">Plan</TableHead>
                        <TableHead className="w-[90px]">Real</TableHead>
                        <TableHead>Tarea</TableHead>
                        <TableHead className="w-[220px]">Ubicación</TableHead>
                        <TableHead className="w-[140px]">Estado</TableHead>
                        <TableHead className="w-[260px] text-right">
                          Acciones
                        </TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {((plan?.dailyTasks ?? []) as any[])
                        .slice()
                        .sort((a, b) => {
                          const am =
                            parseHHMMToMinutes(a?.startPlanned ?? "") ?? 99999;
                          const bm =
                            parseHHMMToMinutes(b?.startPlanned ?? "") ?? 99999;
                          return am - bm;
                        })
                        .map((t: any) => {
                          const status = String(t?.status ?? "pending");
                          const taskTitle = String(
                            t?.template?.name ??
                              t?.name ??
                              t?.templateName ??
                              t?.taskTemplateName ??
                              `Tarea #${t?.id}`,
                          ).trim();

                          const zoneId =
                            Number(t?.zoneId ?? t?.zone_id ?? 0) || null;
                          const spaceId =
                            Number(t?.spaceId ?? t?.space_id ?? 0) || null;

                          const zoneName = zoneId
                            ? String(
                                zonesById.get(zoneId)?.name ??
                                  `Zona #${zoneId}`,
                              )
                            : null;
                          const spaceName = spaceId
                            ? String(
                                (spaces as any[]).find(
                                  (s: any) => Number(s?.id) === spaceId,
                                )?.name ?? `Espacio #${spaceId}`,
                              )
                            : null;

                          const location = t?.locationLabel
                            ? String(t.locationLabel)
                            : spaceName
                              ? `${zoneName ?? "Zona"} · ${spaceName}`
                              : (zoneName ?? "Sin asignar");


                          const canStart =
                            status === "pending" || status === "interrupted";
                          const canFinish = status === "in_progress";
                          const canInterrupt = status === "in_progress";

                          return (
                            <TableRow
                              key={t.id}
                              className={
                                isMissingSpace(t) ? "bg-yellow-50/50" : ""
                              }
                            >
                              <TableCell className="font-mono text-xs">
                                {t?.startPlanned && t?.endPlanned
                                  ? `${t.startPlanned}–${t.endPlanned}`
                                  : "—"}
                              </TableCell>

                              <TableCell className="font-mono text-xs">
                                {t?.startReal || t?.endReal
                                  ? `${t.startReal ?? "—"}–${t.endReal ?? "—"}`
                                  : "—"}
                              </TableCell>

                              <TableCell className="font-medium">
                                {taskTitle}
                                {isMissingSpace(t) && (
                                  <span className="ml-2 text-xs text-amber-700">
                                    ⚠ Sin espacio
                                  </span>
                                )}
                              </TableCell>

                              <TableCell className="text-sm text-muted-foreground">
                                {location}
                              </TableCell>

                              <TableCell>
                                <Badge
                                  variant={
                                    status === "done"
                                      ? "default"
                                      : status === "in_progress"
                                        ? "secondary"
                                        : status === "interrupted"
                                          ? "outline"
                                          : status === "cancelled"
                                            ? "destructive"
                                            : "outline"
                                  }
                                >
                                  {status}
                                </Badge>
                              </TableCell>

                              <TableCell className="text-right">
                                <div className="inline-flex gap-2">
                                  <Button
                                    size="sm"
                                    disabled={
                                      !canStart || updateTaskStatus.isPending
                                    }
                                    onClick={() =>
                                      updateTaskStatus.mutate({
                                        taskId: Number(t.id),
                                        status: "in_progress",
                                      } as any)
                                    }
                                  >
                                    Start
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                      !canFinish || updateTaskStatus.isPending
                                    }
                                    onClick={() =>
                                      updateTaskStatus.mutate({
                                        taskId: Number(t.id),
                                        status: "done",
                                      } as any)
                                    }
                                  >
                                    Finish
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                      !canInterrupt ||
                                      updateTaskStatus.isPending
                                    }
                                    onClick={() =>
                                      updateTaskStatus.mutate({
                                        taskId: Number(t.id),
                                        status: "interrupted",
                                      } as any)
                                    }
                                  >
                                    Interrupt
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}

                      {(plan?.dailyTasks ?? []).length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-sm text-muted-foreground"
                          >
                            Aún no hay tareas en este plan.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

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
                  placeholder="09:00"
                />
              </div>
              <div className="space-y-2">
                <Label>Work End</Label>
                <Input
                  value={edit.workEnd}
                  onChange={(e) =>
                    setEdit((p) => ({ ...p, workEnd: e.target.value }))
                  }
                  placeholder="21:00"
                />
              </div>

              <div className="space-y-2">
                <Label>Meal Start</Label>
                <Input
                  value={edit.mealStart}
                  onChange={(e) =>
                    setEdit((p) => ({ ...p, mealStart: e.target.value }))
                  }
                  placeholder="14:00"
                />
              </div>
              <div className="space-y-2">
                <Label>Meal End</Label>
                <Input
                  value={edit.mealEnd}
                  onChange={(e) =>
                    setEdit((p) => ({ ...p, mealEnd: e.target.value }))
                  }
                  placeholder="15:00"
                />
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
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  updatePlan.mutate(
                    { id, patch: edit },
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
          onOpenChange={(open) => setErrorDialog((prev) => ({ ...prev, open }))}
        >
          <DialogContent className="sm:max-w-lg">
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
              {errorDialog.reasons.map((reason, idx) => (
                <div
                  key={idx}
                  className="border border-destructive/30 bg-destructive/5 rounded-lg p-3"
                >
                  <div className="text-sm text-destructive">
                    {formatInfeasibleReason(reason)}
                  </div>
                </div>
              ))}
            </div>
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
                      setErrorDialog({ open: false, reasons: [] });
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
                onClick={() => setErrorDialog({ open: false, reasons: [] })}
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
                        const direct = reason?.taskId ?? null;
                        if (direct) return goToTask(direct);

                        const msg = String(reason?.message ?? "");
                        const m = msg.match(/\btarea\s+(\d+)\b/i);
                        const extracted = m ? Number(m[1]) : null;

                        goToTask(extracted);
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
      </div>
    </Layout>
  );
}
type PlanResourceItemRow = {
  id: number;
  planId: number;
  typeId: number;
  resourceItemId: number | null;
  name: string;
  isAvailable: boolean;
  source: "default" | "adhoc" | string;
  type: { id: number; code: string; name: string };
};

function PlanResourcesTab({ planId }: { planId: number }) {
  const [rows, setRows] = useState<PlanResourceItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addTypeId, setAddTypeId] = useState<string>("");
  const [addName, setAddName] = useState("");

  // Zonas/Espacios (para mostrar el árbol en el plan)
  const { data: zones = [], isLoading: zonesLoading } = useZones();
  const { data: spaces = [], isLoading: spacesLoading } = useSpaces();

  const zonesById = new Map<number, any>();
  for (const z of zones as any[]) zonesById.set(Number(z.id), z);

  const spacesByZone = new Map<number, any[]>();
  for (const s of spaces as any[]) {
    const zoneId = Number((s as any).zoneId ?? (s as any).zone_id);
    if (!Number.isFinite(zoneId)) continue;
    const list = spacesByZone.get(zoneId) ?? [];
    list.push(s);
    spacesByZone.set(zoneId, list);
  }
  for (const [zid, list] of spacesByZone.entries()) {
    list.sort((a, b) =>
      String(a?.name ?? "").localeCompare(String(b?.name ?? "")),
    );
    spacesByZone.set(zid, list);
  }

  // Override por plan: asignación de plan_resource_items por ZONA (PLATÓ)
  const [zoneAssignments, setZoneAssignments] = useState<
    Record<number, number[]>
  >({});
  // ✅ Requisitos genéricos por tipo (override por plan): zoneId -> { typeId -> qty }
  const [zoneTypeReqs, setZoneTypeReqs] = useState<
    Record<number, Record<number, number>>
  >({});
  const [zoneTypeLoading, setZoneTypeLoading] = useState(false);
  const [zoneTypeError, setZoneTypeError] = useState<string | null>(null);

  const [zoneTypeZoneId, setZoneTypeZoneId] = useState<number | null>(null);
  const [zoneTypeDraft, setZoneTypeDraft] = useState<Record<number, number>>(
    {},
  );
  const [zoneTypeSaving, setZoneTypeSaving] = useState(false);

  const [zoneAssignLoading, setZoneAssignLoading] = useState(false);
  const [zoneAssignError, setZoneAssignError] = useState<string | null>(null);

  const [zoneResourcesZoneId, setZoneResourcesZoneId] = useState<number | null>(
    null,
  );
  const [zoneResourcesDraftPriIds, setZoneResourcesDraftPriIds] = useState<
    number[]
  >([]);
  const [zoneResourcesSaving, setZoneResourcesSaving] = useState(false);

  // Override por plan: asignación de plan_resource_items por ESPACIO
  const [spaceAssignments, setSpaceAssignments] = useState<
    Record<number, number[]>
  >({});
  // ✅ Requisitos genéricos por tipo (override por plan): spaceId -> { typeId -> qty }
  const [spaceTypeReqs, setSpaceTypeReqs] = useState<
    Record<number, Record<number, number>>
  >({});
  const [spaceTypeLoading, setSpaceTypeLoading] = useState(false);
  const [spaceTypeError, setSpaceTypeError] = useState<string | null>(null);

  const [spaceTypeSpaceId, setSpaceTypeSpaceId] = useState<number | null>(null);
  const [spaceTypeDraft, setSpaceTypeDraft] = useState<Record<number, number>>(
    {},
  );
  const [spaceTypeSaving, setSpaceTypeSaving] = useState(false);

  const [spaceAssignLoading, setSpaceAssignLoading] = useState(false);
  const [spaceAssignError, setSpaceAssignError] = useState<string | null>(null);

  const [spaceResourcesSpaceId, setSpaceResourcesSpaceId] = useState<
    number | null
  >(null);
  const [spaceResourcesDraftPriIds, setSpaceResourcesDraftPriIds] = useState<
    number[]
  >([]);
  const [spaceResourcesSaving, setSpaceResourcesSaving] = useState(false);

  async function loadSpaceAssignments() {
    try {
      setSpaceAssignLoading(true);
      setSpaceAssignError(null);

      const json = await apiRequest<any[]>(
        "GET",
        buildUrl(api.plans.spaceResourceAssignments.list.path, { id: planId }),
      );

      const next: Record<number, number[]> = {};
      for (const r of json ?? []) {
        const spaceId = Number(r?.spaceId);
        const ids = Array.isArray(r?.planResourceItemIds)
          ? r.planResourceItemIds
          : [];
        const clean = ids
          .map((n: any) => Number(n))
          .filter((n: number) => Number.isFinite(n) && n > 0);

        if (Number.isFinite(spaceId)) next[spaceId] = clean;
      }

      setSpaceAssignments(next);
    } catch (e: any) {
      setSpaceAssignError(
        e?.message || "Error cargando recursos por espacio (plan)",
      );
    } finally {
      setSpaceAssignLoading(false);
    }
  }

  async function loadSpaceTypeRequirements() {
    try {
      setSpaceTypeLoading(true);
      setSpaceTypeError(null);

      const json = await apiRequest<any[]>(
        "GET",
        buildUrl(api.plans.spaceResourceTypeRequirements.list.path, {
          id: planId,
        }),
      );

      const next: Record<number, Record<number, number>> = {};
      for (const r of json ?? []) {
        const spaceId = Number((r as any)?.spaceId);
        if (!Number.isFinite(spaceId)) continue;

        const reqsArr = Array.isArray((r as any)?.requirements)
          ? (r as any).requirements
          : [];
        const map: Record<number, number> = {};
        for (const q of reqsArr) {
          const tid = Number((q as any)?.resourceTypeId);
          const qty = Number((q as any)?.quantity ?? 0);
          if (!Number.isFinite(tid) || tid <= 0) continue;
          map[tid] = Number.isFinite(qty) && qty >= 0 ? qty : 0;
        }
        next[spaceId] = map;
      }

      setSpaceTypeReqs(next);
    } catch (e: any) {
      setSpaceTypeError(
        e?.message || "Error cargando requisitos genéricos por espacio (plan)",
      );
    } finally {
      setSpaceTypeLoading(false);
    }
  }

  useEffect(() => {
    if (spaceTypeSpaceId === null) return;
    setSpaceTypeDraft(spaceTypeReqs[spaceTypeSpaceId] ?? {});
  }, [spaceTypeSpaceId, spaceTypeReqs]);

  useEffect(() => {
    if (spaceResourcesSpaceId === null) return;
    setSpaceResourcesDraftPriIds(spaceAssignments[spaceResourcesSpaceId] ?? []);
  }, [spaceResourcesSpaceId, spaceAssignments]);

  async function loadZoneAssignments() {
    try {
      setZoneAssignLoading(true);
      setZoneAssignError(null);

      const json = await apiRequest<any[]>(
        "GET",
        buildUrl(api.plans.zoneResourceAssignments.list.path, { id: planId }),
      );

      const next: Record<number, number[]> = {};
      for (const r of json ?? []) {
        const zoneId = Number(r?.zoneId);
        const ids = Array.isArray(r?.planResourceItemIds)
          ? r.planResourceItemIds
          : [];
        const clean = ids
          .map((n: any) => Number(n))
          .filter((n: number) => Number.isFinite(n) && n > 0);

        if (Number.isFinite(zoneId)) next[zoneId] = clean;
      }

      setZoneAssignments(next);
    } catch (e: any) {
      setZoneAssignError(
        e?.message || "Error cargando recursos por plató (plan)",
      );
    } finally {
      setZoneAssignLoading(false);
    }
  }

  async function loadZoneTypeRequirements() {
    try {
      setZoneTypeLoading(true);
      setZoneTypeError(null);

      const json = await apiRequest<any[]>(
        "GET",
        buildUrl(api.plans.zoneResourceTypeRequirements.list.path, {
          id: planId,
        }),
      );

      const next: Record<number, Record<number, number>> = {};
      for (const r of json ?? []) {
        const zoneId = Number((r as any)?.zoneId);
        if (!Number.isFinite(zoneId)) continue;

        const reqsArr = Array.isArray((r as any)?.requirements)
          ? (r as any).requirements
          : [];
        const map: Record<number, number> = {};
        for (const q of reqsArr) {
          const tid = Number((q as any)?.resourceTypeId);
          const qty = Number((q as any)?.quantity ?? 0);
          if (!Number.isFinite(tid) || tid <= 0) continue;
          map[tid] = Number.isFinite(qty) && qty >= 0 ? qty : 0;
        }
        next[zoneId] = map;
      }

      setZoneTypeReqs(next);
    } catch (e: any) {
      setZoneTypeError(
        e?.message || "Error cargando requisitos genéricos por plató (plan)",
      );
    } finally {
      setZoneTypeLoading(false);
    }
  }

  useEffect(() => {
    if (zoneTypeZoneId === null) return;
    setZoneTypeDraft(zoneTypeReqs[zoneTypeZoneId] ?? {});
  }, [zoneTypeZoneId, zoneTypeReqs]);

  useEffect(() => {
    if (zoneResourcesZoneId === null) return;
    setZoneResourcesDraftPriIds(zoneAssignments[zoneResourcesZoneId] ?? []);
  }, [zoneResourcesZoneId, zoneAssignments]);

  function friendlyError(e: any) {
    const status = e?.status;
    if (status === 401) {
      return "No autorizado (401). Inicia sesión y recarga la página.";
    }
    return e?.message || "Error cargando recursos del plan";
  }

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const json = await apiRequest<PlanResourceItemRow[]>(
        "GET",
        buildUrl(api.plans.resourceItems.list.path, { id: planId }),
      );

      setRows(json ?? []);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  async function initIfEmpty() {
    try {
      setLoading(true);
      setError(null);

      await apiRequest(
        "POST",
        buildUrl(api.plans.resourceItems.init.path, { id: planId }),
      );

      await load();
    } catch (e: any) {
      setError(friendlyError(e));
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadZoneAssignments();
    loadZoneTypeRequirements();

    loadSpaceAssignments();
    loadSpaceTypeRequirements();
  }, [planId]);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">
        Cargando recursos del plan…
      </p>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error cargando recursos del plan</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={load}>
            Reintentar
          </Button>
        </div>
      </Alert>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Este plan no tiene recursos inicializados (probablemente es un plan
          antiguo).
        </p>
        <Button onClick={initIfEmpty}>Inicializar recursos del plan</Button>
      </div>
    );
  }

  const types = Array.from(
    new Map(rows.map((r) => [r.typeId, r.type])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

  const grouped = new Map<number, PlanResourceItemRow[]>();
  for (const r of rows) {
    const list = grouped.get(r.typeId) ?? [];
    list.push(r);
    grouped.set(r.typeId, list);
  }
  for (const [k, list] of grouped.entries()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
    grouped.set(k, list);
  }

  return (
    <div className="space-y-4">
      {/* Añadir recurso adhoc */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">
            Añadir recurso solo para este plan
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={addTypeId} onValueChange={setAddTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona tipo…" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Ej: Cámara extra / Micro 4 / Coach invitado…"
              />
            </div>
          </div>

          <Button
            onClick={async () => {
              const typeId = Number(addTypeId);
              const name = addName.trim();
              if (!Number.isFinite(typeId) || !name) return;

              try {
                await apiRequest(
                  "POST",
                  buildUrl(api.plans.resourceItems.create.path, { id: planId }),
                  { typeId, name },
                );
                setAddName("");
                await load();
              } catch (e: any) {
                alert(friendlyError(e) || "No se pudo añadir");
              }
            }}
            disabled={!addTypeId || !addName.trim()}
          >
            Añadir
          </Button>
        </CardContent>
      </Card>

      {/* Recursos por plató (override dentro del plan) */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">
            Recursos por plató (este plan)
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-0 space-y-3">
          {(zonesLoading || spacesLoading) && (
            <p className="text-sm text-muted-foreground">
              Cargando zonas/espacios…
            </p>
          )}

          {zoneAssignError && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{zoneAssignError}</AlertDescription>
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadZoneAssignments}
                >
                  Reintentar
                </Button>
              </div>
            </Alert>
          )}

          {!zonesLoading && !spacesLoading && (zones as any[]).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay zonas creadas todavía.
            </p>
          )}

          {!zonesLoading && !spacesLoading && (zones as any[]).length > 0 && (
            <div className="space-y-3">
              {(zones as any[])
                .slice()
                .sort((a, b) =>
                  String(a?.name ?? "").localeCompare(String(b?.name ?? "")),
                )
                .map((z: any) => {
                  const zid = Number(z.id);
                  const assigned = zoneAssignments[zid]?.length ?? 0;
                  const list = spacesByZone.get(zid) ?? [];

                  return (
                    <div key={zid} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{z?.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Asignados: {assigned} · Espacios: {list.length}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={zoneAssignLoading}
                            onClick={() => setZoneResourcesZoneId(zid)}
                          >
                            Recursos
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={zoneTypeLoading}
                            onClick={() => setZoneTypeZoneId(zid)}
                            title="Requisitos genéricos por tipo (este plan)"
                          >
                            Requisitos
                          </Button>
                        </div>
                      </div>

                      {list.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {spaceAssignError && (
                            <Alert variant="destructive">
                              <AlertTitle>Error</AlertTitle>
                              <AlertDescription>
                                {spaceAssignError}
                              </AlertDescription>
                              <div className="mt-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={loadSpaceAssignments}
                                >
                                  Reintentar
                                </Button>
                              </div>
                            </Alert>
                          )}

                          {spaceTypeError && (
                            <Alert variant="destructive">
                              <AlertTitle>Error</AlertTitle>
                              <AlertDescription>
                                {spaceTypeError}
                              </AlertDescription>
                              <div className="mt-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={loadSpaceTypeRequirements}
                                >
                                  Reintentar
                                </Button>
                              </div>
                            </Alert>
                          )}

                          {list.map((s: any) => {
                            const sid = Number(s?.id);
                            const nm = String(s?.name ?? "");
                            if (!Number.isFinite(sid)) return null;

                            const assignedS =
                              spaceAssignments[sid]?.length ?? 0;

                            return (
                              <div
                                key={sid}
                                className="flex items-center justify-between gap-3 border rounded-md px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {nm || `#${sid}`}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Asignados: {assignedS}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={spaceAssignLoading}
                                    onClick={() =>
                                      setSpaceResourcesSpaceId(sid)
                                    }
                                  >
                                    Recursos
                                  </Button>

                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={spaceTypeLoading}
                                    onClick={() => setSpaceTypeSpaceId(sid)}
                                    title="Requisitos genéricos por tipo (este plan)"
                                  >
                                    Requisitos
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: editar recursos del PLATÓ dentro del plan */}
      <Dialog
        open={zoneResourcesZoneId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setZoneResourcesZoneId(null);
            setZoneResourcesDraftPriIds([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Recursos del plató (este plan):{" "}
              {zoneResourcesZoneId !== null
                ? ((zones ?? []) as any[]).find(
                    (x) => Number(x?.id) === Number(zoneResourcesZoneId),
                  )?.name || `#${zoneResourcesZoneId}`
                : ""}
            </DialogTitle>
            <DialogDescription>
              Estos recursos quedan anclados al plató para este plan (override
              del snapshot).
            </DialogDescription>
          </DialogHeader>

          <div className="text-sm text-muted-foreground">
            Seleccionados: {zoneResourcesDraftPriIds.length}
            {zoneResourcesSaving ? " · Guardando…" : ""}
          </div>

          {/* Tipos agrupados (NO hardcodea: permite anclar cualquier tipo si Admin lo quiere) */}
          <div className="space-y-3 max-h-[55vh] overflow-auto pr-1">
            {types.map((t) => {
              const all = grouped.get(t.id) ?? [];
              const activeItems = all.filter((x) => x.isAvailable);

              if (activeItems.length === 0) return null;

              const typeName = String(t?.name ?? "Tipo");

              return (
                <div key={t.id} className="border rounded-lg p-3">
                  <div className="font-medium mb-2">{typeName}</div>

                  <div className="grid grid-cols-2 gap-2">
                    {[...activeItems]
                      .sort((a: any, b: any) =>
                        String(a?.name ?? "").localeCompare(
                          String(b?.name ?? ""),
                        ),
                      )
                      .map((it: any) => {
                        const priId = Number(it.id);
                        const checked =
                          zoneResourcesDraftPriIds.includes(priId);

                        return (
                          <label
                            key={priId}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                const nextChecked = Boolean(v);
                                setZoneResourcesDraftPriIds((prev) => {
                                  const set = new Set(prev);
                                  if (nextChecked) set.add(priId);
                                  else set.delete(priId);
                                  return Array.from(set);
                                });
                              }}
                            />
                            <span className="truncate">
                              {String(it?.name ?? "")}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              disabled={zoneResourcesSaving}
              onClick={() => {
                setZoneResourcesZoneId(null);
                setZoneResourcesDraftPriIds([]);
              }}
            >
              Cancelar
            </Button>

            <Button
              disabled={zoneResourcesZoneId === null || zoneResourcesSaving}
              onClick={async () => {
                if (zoneResourcesZoneId === null) return;

                const unique = Array.from(
                  new Set(
                    (zoneResourcesDraftPriIds ?? [])
                      .map((n) => Number(n))
                      .filter((n) => Number.isFinite(n) && n > 0),
                  ),
                );

                try {
                  setZoneResourcesSaving(true);

                  await apiRequest(
                    "PATCH",
                    buildUrl(api.plans.zoneResourceAssignments.update.path, {
                      id: planId,
                      zoneId: zoneResourcesZoneId,
                    }),
                    { planResourceItemIds: unique },
                  );

                  // refresca desde backend para quedar 100% sincronizado
                  await loadZoneAssignments();

                  setZoneResourcesZoneId(null);
                  setZoneResourcesDraftPriIds([]);
                } catch (e: any) {
                  toast({
                    title: "No se pudo guardar",
                    description:
                      e?.message ||
                      "Revisa conexión/permisos y prueba de nuevo.",
                    variant: "destructive",
                  });
                } finally {
                  setZoneResourcesSaving(false);
                }
              }}
            >
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: requisitos genéricos por tipo del PLATÓ dentro del plan */}
      <Dialog
        open={zoneTypeZoneId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setZoneTypeZoneId(null);
            setZoneTypeDraft({});
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Requisitos genéricos del plató (este plan):{" "}
              {zoneTypeZoneId !== null
                ? ((zones ?? []) as any[]).find(
                    (x) => Number(x?.id) === Number(zoneTypeZoneId),
                  )?.name || `#${zoneTypeZoneId}`
                : ""}
            </DialogTitle>
            <DialogDescription>
              Define cuántos recursos de cada tipo necesita el plató (sin fijar
              unidad concreta). Esto es un override del snapshot del plan.
            </DialogDescription>
          </DialogHeader>

          {zoneTypeError && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{zoneTypeError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2 max-h-[50vh] overflow-auto pr-1">
            {types.map((t) => {
              const typeId = Number(t.id);
              const qty = Number(zoneTypeDraft[typeId] ?? 0);

              return (
                <div
                  key={typeId}
                  className="flex items-center justify-between gap-3 border rounded px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Disponible en plan:{" "}
                      {
                        (grouped.get(typeId) ?? []).filter((x) => x.isAvailable)
                          .length
                      }
                    </div>
                  </div>

                  <Input
                    className="w-28"
                    type="number"
                    min={0}
                    max={99}
                    value={qty}
                    onChange={(e) => {
                      const next = Number(e.target.value ?? 0);
                      setZoneTypeDraft((prev) => ({
                        ...prev,
                        [typeId]: Number.isFinite(next) && next >= 0 ? next : 0,
                      }));
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              disabled={zoneTypeSaving}
              onClick={() => {
                setZoneTypeZoneId(null);
                setZoneTypeDraft({});
              }}
            >
              Cancelar
            </Button>

            <Button
              disabled={zoneTypeZoneId === null || zoneTypeSaving}
              onClick={async () => {
                if (zoneTypeZoneId === null) return;

                const requirements = Object.entries(zoneTypeDraft ?? {})
                  .map(([k, v]) => ({
                    resourceTypeId: Number(k),
                    quantity: Number(v ?? 0),
                  }))
                  .filter(
                    (r) =>
                      Number.isFinite(r.resourceTypeId) &&
                      r.resourceTypeId > 0 &&
                      Number.isFinite(r.quantity) &&
                      r.quantity >= 0,
                  );

                try {
                  setZoneTypeSaving(true);

                  await apiRequest(
                    "PATCH",
                    buildUrl(
                      api.plans.zoneResourceTypeRequirements.update.path,
                      {
                        id: planId,
                        zoneId: zoneTypeZoneId,
                      },
                    ),
                    { requirements },
                  );

                  await loadZoneTypeRequirements();

                  setZoneTypeZoneId(null);
                  setZoneTypeDraft({});
                } catch (e: any) {
                  toast({
                    title: "No se pudo guardar",
                    description:
                      e?.message ||
                      "Revisa conexión/permisos y prueba de nuevo.",
                    variant: "destructive",
                  });
                } finally {
                  setZoneTypeSaving(false);
                }
              }}
            >
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: editar recursos del ESPACIO dentro del plan */}
      <Dialog
        open={spaceResourcesSpaceId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSpaceResourcesSpaceId(null);
            setSpaceResourcesDraftPriIds([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Recursos del espacio (este plan):{" "}
              {spaceResourcesSpaceId !== null
                ? ((spaces ?? []) as any[]).find(
                    (x) => Number(x?.id) === Number(spaceResourcesSpaceId),
                  )?.name || `#${spaceResourcesSpaceId}`
                : ""}
            </DialogTitle>
            <DialogDescription>
              Estos recursos quedan anclados al espacio para este plan (override
              del snapshot).
            </DialogDescription>
          </DialogHeader>

          <div className="text-sm text-muted-foreground">
            Seleccionados: {spaceResourcesDraftPriIds.length}
            {spaceResourcesSaving ? " · Guardando…" : ""}
          </div>

          <div className="space-y-3 max-h-[55vh] overflow-auto pr-1">
            {types.map((t) => {
              const all = grouped.get(t.id) ?? [];
              const activeItems = all.filter((x) => x.isAvailable);

              if (activeItems.length === 0) return null;

              const typeName = String(t?.name ?? "Tipo");

              return (
                <div key={t.id} className="border rounded-lg p-3">
                  <div className="font-medium mb-2">{typeName}</div>

                  <div className="grid grid-cols-2 gap-2">
                    {[...activeItems]
                      .sort((a: any, b: any) =>
                        String(a?.name ?? "").localeCompare(
                          String(b?.name ?? ""),
                        ),
                      )
                      .map((it: any) => {
                        const priId = Number(it.id);
                        const checked =
                          spaceResourcesDraftPriIds.includes(priId);

                        return (
                          <label
                            key={priId}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                const nextChecked = Boolean(v);
                                setSpaceResourcesDraftPriIds((prev) => {
                                  const set = new Set(prev);
                                  if (nextChecked) set.add(priId);
                                  else set.delete(priId);
                                  return Array.from(set);
                                });
                              }}
                            />
                            <span className="truncate">
                              {String(it?.name ?? "")}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              disabled={spaceResourcesSaving}
              onClick={() => {
                setSpaceResourcesSpaceId(null);
                setSpaceResourcesDraftPriIds([]);
              }}
            >
              Cancelar
            </Button>

            <Button
              disabled={spaceResourcesSpaceId === null || spaceResourcesSaving}
              onClick={async () => {
                if (spaceResourcesSpaceId === null) return;

                const unique = Array.from(
                  new Set(
                    (spaceResourcesDraftPriIds ?? [])
                      .map((n) => Number(n))
                      .filter((n) => Number.isFinite(n) && n > 0),
                  ),
                );

                try {
                  setSpaceResourcesSaving(true);

                  await apiRequest(
                    "PATCH",
                    buildUrl(api.plans.spaceResourceAssignments.update.path, {
                      id: planId,
                      spaceId: spaceResourcesSpaceId,
                    }),
                    { planResourceItemIds: unique },
                  );

                  await loadSpaceAssignments();

                  setSpaceResourcesSpaceId(null);
                  setSpaceResourcesDraftPriIds([]);
                } catch (e: any) {
                  toast({
                    title: "No se pudo guardar",
                    description:
                      e?.message ||
                      "Revisa conexión/permisos y prueba de nuevo.",
                    variant: "destructive",
                  });
                } finally {
                  setSpaceResourcesSaving(false);
                }
              }}
            >
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: requisitos genéricos por tipo del ESPACIO dentro del plan */}
      <Dialog
        open={spaceTypeSpaceId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSpaceTypeSpaceId(null);
            setSpaceTypeDraft({});
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Requisitos genéricos del espacio (este plan):{" "}
              {spaceTypeSpaceId !== null
                ? ((spaces ?? []) as any[]).find(
                    (x) => Number(x?.id) === Number(spaceTypeSpaceId),
                  )?.name || `#${spaceTypeSpaceId}`
                : ""}
            </DialogTitle>
            <DialogDescription>
              Define cuántos recursos de cada tipo necesita el espacio (sin
              fijar unidad concreta). Esto es un override del snapshot del plan.
            </DialogDescription>
          </DialogHeader>

          {spaceTypeError && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{spaceTypeError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2 max-h-[50vh] overflow-auto pr-1">
            {types.map((t) => {
              const typeId = Number(t.id);
              const qty = Number(spaceTypeDraft[typeId] ?? 0);

              return (
                <div
                  key={typeId}
                  className="flex items-center justify-between gap-3 border rounded px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Disponible en plan:{" "}
                      {
                        (grouped.get(typeId) ?? []).filter((x) => x.isAvailable)
                          .length
                      }
                    </div>
                  </div>

                  <Input
                    className="w-28"
                    type="number"
                    min={0}
                    max={99}
                    value={qty}
                    onChange={(e) => {
                      const next = Number(e.target.value ?? 0);
                      setSpaceTypeDraft((prev) => ({
                        ...prev,
                        [typeId]: Number.isFinite(next) && next >= 0 ? next : 0,
                      }));
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              disabled={spaceTypeSaving}
              onClick={() => {
                setSpaceTypeSpaceId(null);
                setSpaceTypeDraft({});
              }}
            >
              Cancelar
            </Button>

            <Button
              disabled={spaceTypeSpaceId === null || spaceTypeSaving}
              onClick={async () => {
                if (spaceTypeSpaceId === null) return;

                const requirements = Object.entries(spaceTypeDraft ?? {})
                  .map(([k, v]) => ({
                    resourceTypeId: Number(k),
                    quantity: Number(v ?? 0),
                  }))
                  .filter(
                    (r) =>
                      Number.isFinite(r.resourceTypeId) &&
                      r.resourceTypeId > 0 &&
                      Number.isFinite(r.quantity) &&
                      r.quantity >= 0,
                  );

                try {
                  setSpaceTypeSaving(true);

                  await apiRequest(
                    "PATCH",
                    buildUrl(
                      api.plans.spaceResourceTypeRequirements.update.path,
                      {
                        id: planId,
                        spaceId: spaceTypeSpaceId,
                      },
                    ),
                    { requirements },
                  );

                  await loadSpaceTypeRequirements();

                  setSpaceTypeSpaceId(null);
                  setSpaceTypeDraft({});
                } catch (e: any) {
                  toast({
                    title: "No se pudo guardar",
                    description:
                      e?.message ||
                      "Revisa conexión/permisos y prueba de nuevo.",
                    variant: "destructive",
                  });
                } finally {
                  setSpaceTypeSaving(false);
                }
              }}
            >
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Listado agrupado */}
      {types.map((t) => {
        const list = grouped.get(t.id) ?? [];
        const available = list.filter((x) => x.isAvailable).length;

        return (
          <Card key={t.id}>
            <CardHeader className="py-3">
              <CardTitle className="text-base flex justify-between items-center">
                <span>{t.name}</span>
                <span className="text-sm text-muted-foreground">
                  {available}/{list.length}
                </span>
              </CardTitle>
            </CardHeader>

            <CardContent className="pt-0 space-y-2">
              {list.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={r.isAvailable}
                    onCheckedChange={async (v) => {
                      const next = !!v;

                      // Optimistic UI
                      setRows((prev) =>
                        prev.map((x) =>
                          x.id === r.id ? { ...x, isAvailable: next } : x,
                        ),
                      );

                      try {
                        await apiRequest(
                          "PATCH",
                          buildUrl(api.plans.resourceItems.update.path, {
                            id: planId,
                            itemId: r.id,
                          }),
                          { isAvailable: next },
                        );
                      } catch (e: any) {
                        alert(friendlyError(e) || "No se pudo guardar");
                        await load();
                      }
                    }}
                  />

                  {r.source === "adhoc" ? (
                    <Input
                      defaultValue={r.name}
                      onBlur={async (e) => {
                        const name = e.currentTarget.value.trim();
                        if (!name || name === r.name) return;

                        try {
                          await apiRequest(
                            "PATCH",
                            buildUrl(api.plans.resourceItems.update.path, {
                              id: planId,
                              itemId: r.id,
                            }),
                            { name },
                          );

                          setRows((prev) =>
                            prev.map((x) =>
                              x.id === r.id ? { ...x, name } : x,
                            ),
                          );
                        } catch (err: any) {
                          alert(friendlyError(err) || "No se pudo renombrar");
                          await load();
                        }
                      }}
                    />
                  ) : (
                    <span
                      className={
                        r.isAvailable
                          ? ""
                          : "line-through text-muted-foreground"
                      }
                    >
                      {r.name}
                    </span>
                  )}

                  {r.source === "adhoc" ? (
                    <button
                      className="text-sm text-red-600 hover:underline ml-auto"
                      onClick={async () => {
                        if (!confirm("¿Eliminar este recurso adhoc del plan?"))
                          return;

                        try {
                          await apiRequest(
                            "DELETE",
                            buildUrl(api.plans.resourceItems.delete.path, {
                              id: planId,
                              itemId: r.id,
                            }),
                          );
                          await load();
                        } catch (e: any) {
                          alert(friendlyError(e) || "No se pudo borrar");
                        }
                      }}
                    >
                      Eliminar
                    </button>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
