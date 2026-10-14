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
  ChevronDown,
  ChevronUp,
  Users,
  Check,
  ChevronsUpDown,
  Lock,
  Pause,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useUserRole } from "@/hooks/use-user-role";

type StaffPickerScope = {staffRole:StaffRoleType;scopeType:StaffScopeType;zoneId?:number|null;spaceId?:number|null;realityTeamCode?:string|null;itinerantTeamId?:number|null};
const StaffPickerContext=createContext<{canEdit:boolean;activePeople:any[];listFor:(scope:StaffPickerScope)=>any[];addAssignment:(scope:StaffPickerScope&{staffPersonId:number})=>void;setLocalAssignments:Dispatch<SetStateAction<any[]>>}|null>(null);

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
    const {listFor,activePeople,setLocalAssignments,addAssignment,canEdit}=useContext(StaffPickerContext)!;
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
        : list
            .map((a: any) =>
              String(a?.staffPersonName ?? `#${a?.staffPersonId}`),
            )
            .join(", ");
    const rolePeople = activePeople.filter(
      (p: any) => p.roleType === staffRole,
    );

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
              setDraft(
                list
                  .map((a: any) =>
                    Number(a?.staffPersonId ?? a?.staff_person_id),
                  )
                  .filter((n: number) => Number.isFinite(n)),
              );
            }
          }}
        >
          <DialogTrigger asChild>
            <Button disabled={!canEdit} type="button" variant="outline" size="sm">
              Editar
            </Button>
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
                          e.target.checked
                            ? [...prev, pid]
                            : prev.filter((x) => x !== pid),
                        );
                      }}
                    />
                    {p.name}
                  </label>
                );
              })}
            </div>
            <DialogFooter>
              <Button disabled={!canEdit}
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button disabled={!canEdit}
                type="button"
                onClick={() => {
                  setLocalAssignments((prev) =>
                    prev.filter((a: any) => {
                      if (
                        a?.staffRole !== staffRole ||
                        a?.scopeType !== scopeType
                      )
                        return true;
                      const zid = a?.zoneId ?? a?.zone_id ?? null;
                      const sid = a?.spaceId ?? a?.space_id ?? null;
                      const rtc =
                        a?.realityTeamCode ?? a?.reality_team_code ?? null;
                      const itid =
                        a?.itinerantTeamId ?? a?.itinerant_team_id ?? null;
                      return (
                        (zoneId ?? null) !== (zid ?? null) ||
                        (spaceId ?? null) !== (sid ?? null) ||
                        (realityTeamCode ?? null) !== (rtc ?? null) ||
                        (itinerantTeamId ?? null) !== (itid ?? null)
                      );
                    }),
                  );
                  for (const pid of draft) {
                    addAssignment({
                      staffRole,
                      scopeType,
                      staffPersonId: pid,
                      zoneId,
                      spaceId,
                      realityTeamCode,
                      itinerantTeamId,
                    });
                  }
                  setOpen(false);
                }}
              >
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

export function PlanStaffRolesTab({
  planId,
  zones,
  spaces,
}: {
  planId: number;
  zones: any[];
  spaces: any[];
}) {
  const { role } = useUserRole();
  const canEdit = role === "admin" || role === "production";
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
    <StaffPickerContext.Provider value={{canEdit,activePeople,listFor,addAssignment,setLocalAssignments}}>
    <div className="space-y-6" data-testid="day-staff">
      <div>
        <h2 className="text-xl font-semibold">Responsables de la jornada</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Producción y Redacción por plató, espacio y equipo itinerante. Las
          asignaciones se reflejan en las cabeceras de Planning.
        </p>
        {!canEdit ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Tu perfil permite consultar las responsabilidades.
          </p>
        ) : null}
      </div>
      {saveModes.error || saveAssignments.error ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudieron guardar todas las asignaciones. Revisa y vuelve a
          cargar los datos antes de reintentar.
        </p>
      ) : null}
      <Card className="border-border">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Roles por plató / espacio</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              Regla: por cada plató decides si asignas por <b>Plató</b> o por{" "}
              <b>Espacios</b>. En modo espacios no hay herencia.
            </div>
          </div>

          <Button onClick={handleSave} disabled={busy || !canEdit}>
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
                          <Select disabled={!canEdit}
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
              {(itinerantTeams as any[]).filter((t: any) => !!t?.isActive)
                .length === 0 ? (
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
                    const teamName = String(
                      t?.name ?? t?.code ?? `Equipo ${tid}`,
                    );

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
    </StaffPickerContext.Provider>
  );
}
