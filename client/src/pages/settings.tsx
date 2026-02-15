import { Layout } from "@/components/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useTaskTemplates,
  useCreateTaskTemplate,
  useDeleteTaskTemplate,
  useUpdateTaskTemplate,
} from "@/hooks/use-tasks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Plus,
  Trash2,
  Settings as SettingsIcon,
  ClipboardList,
  Users,
  ChevronsDown,
  ChevronsUp,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import {
  useZones,
  useSpaces,
  useCreateZone,
  useUpdateZone,
  useCreateSpace,
  useUpdateSpace,
} from "@/hooks/use-spaces";
import {
  useStaffPeople,
  useCreateStaffPerson,
  useUpdateStaffPerson,
  type StaffRoleType,
} from "@/hooks/use-staff";
import { useItinerantTeams } from "@/hooks/use-itinerant-teams";
import { Badge } from "@/components/ui/badge";
import { ResourcesList } from "@/components/resources-list";
import { GeneralProgramSettings } from "@/components/general-program-settings";
import { GeneralOptimizerSettings } from "@/components/general-optimizer-settings";
import { useTranslation } from "react-i18next";

export default function SettingsPage() {
  const { t } = useTranslation();

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <SettingsIcon className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        </div>

        <Tabs defaultValue="templates" className="space-y-4">
          <TabsList>
            <TabsTrigger value="general" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              {t("settings.tabs.general")}
            </TabsTrigger>

            <TabsTrigger value="templates" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              {t("settings.tabs.templates")}
            </TabsTrigger>

            <TabsTrigger value="spaces" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              {t("settings.tabs.spaces")}
            </TabsTrigger>

            <TabsTrigger value="resources" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              {t("settings.tabs.resources")}
            </TabsTrigger>
            <TabsTrigger value="staff" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t("settings.tabs.staff")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="general" className="space-y-4">
            <GeneralProgramSettings />
            <GeneralOptimizerSettings />
          </TabsContent>
          <TabsContent value="templates" className="space-y-4">
            <TaskTemplatesSettings />
          </TabsContent>

          <TabsContent value="spaces" className="space-y-4">
            <ZonesSpacesSettings />
          </TabsContent>

          <TabsContent value="resources" className="space-y-4">
            <ResourcesList />
          </TabsContent>
          <TabsContent value="staff" className="space-y-4">
            <StaffPeopleSettings />
            <ItinerantTeamsSettings />
            <StaffDefaultsSettings />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function StaffPeopleSettings() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useStaffPeople();
  const create = useCreateStaffPerson();
  const update = useUpdateStaffPerson();

  const [newName, setNewName] = useState("");
  const [newRoleType, setNewRoleType] = useState<StaffRoleType>("production");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoleType, setEditRoleType] = useState<StaffRoleType>("production");
  const [editActive, setEditActive] = useState(true);

  const rows = (data ?? []) as any[];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.staffPeople.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>{t("common.name")}</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("settings.staffPeople.namePlaceholder")}
            />
          </div>

          <div className="space-y-1">
            <Label>{t("common.type")}</Label>
            <Select
              value={newRoleType}
              onValueChange={(v) => setNewRoleType(v as StaffRoleType)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("common.select")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="production">{t("common.production")}</SelectItem>
                <SelectItem value="editorial">{t("common.editorial")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              disabled={create.isPending || newName.trim().length === 0}
              onClick={() =>
                create.mutate(
                  {
                    name: newName.trim(),
                    roleType: newRoleType,
                    isActive: true,
                  },
                  {
                    onSuccess: () => {
                      setNewName("");
                      setNewRoleType("production");
                    },
                  },
                )
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("common.add")}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">
            {t("common.loadError")}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {t("settings.staffPeople.empty")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.type")}</TableHead>
                <TableHead>{t("common.active")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const isEditing = editingId === Number(p?.id);
                const roleLabel =
                  p?.roleType === "editorial" ? t("common.editorial") : t("common.production");

                return (
                  <TableRow key={String(p?.id)}>
                    <TableCell className="font-medium">
                      {isEditing ? (
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      ) : (
                        String(p?.name ?? "")
                      )}
                    </TableCell>

                    <TableCell>
                      {isEditing ? (
                        <Select
                          value={editRoleType}
                          onValueChange={(v) =>
                            setEditRoleType(v as StaffRoleType)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("common.select")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="production">
                              Producción
                            </SelectItem>
                            <SelectItem value="editorial">{t("common.editorial")}</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        roleLabel
                      )}
                    </TableCell>

                    <TableCell>
                      {isEditing ? (
                        <Checkbox
                          checked={!!editActive}
                          onCheckedChange={(v) => setEditActive(!!v)}
                        />
                      ) : (
                        <Checkbox checked={!!p?.isActive} disabled />
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingId(null)}
                          >
                            {t("common.cancel")}
                          </Button>
                          <Button
                            size="sm"
                            disabled={
                              update.isPending || editName.trim().length === 0
                            }
                            onClick={() => {
                              update.mutate({
                                id: Number(p.id),
                                patch: {
                                  name: editName.trim(),
                                  roleType: editRoleType,
                                  isActive: editActive,
                                },
                              });
                              setEditingId(null);
                            }}
                          >
                            {t("common.save")}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(Number(p.id));
                            setEditName(String(p?.name ?? ""));
                            setEditRoleType(
                              p?.roleType === "editorial"
                                ? "editorial"
                                : "production",
                            );
                            setEditActive(Boolean(p?.isActive));
                          }}
                        >
                          {t("common.edit")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ItinerantTeamsSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: teams = [], isLoading, error } = useItinerantTeams();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const createTeam = useMutation({
    mutationFn: async (payload: any) =>
      apiRequest("POST", api.itinerantTeams.create.path, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.itinerantTeams.list.path] });
      setCode("");
      setName("");
      toast({ title: t("settings.itinerantTeams.teamCreatedToast") });
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: err?.message || t("settings.itinerantTeams.createErrorToast"),
        variant: "destructive",
      });
    },
  });

  const rows = (teams ?? []) as any[];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.itinerantTeams.title")}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>{t("settings.itinerantTeams.codeLabel")}</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("settings.itinerantTeams.codePlaceholder")}
            />
          </div>

          <div className="space-y-1">
            <Label>{t("common.name")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("settings.itinerantTeams.namePlaceholder")}
            />
          </div>

          <div className="flex items-end">
            <Button
              disabled={!code.trim() || !name.trim() || createTeam.isPending}
              onClick={() =>
                createTeam.mutate({
                  code: code.trim(),
                  name: name.trim(),
                })
              }
            >
              {createTeam.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("common.creating")}
                </>
              ) : (
                t("common.add")
              )}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : error ? (
          <div className="text-sm text-red-600">{t("settings.itinerantTeams.loadError")}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {t("settings.itinerantTeams.empty")}
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((t: any) => (
              <div
                key={t.id}
                className="flex items-center justify-between border rounded-md px-3 py-2"
              >
                <div>
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.code}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StaffDefaultsSettings() {
  const qc = useQueryClient();

  const { data: zones = [] } = useZones();
  const { data: spaces = [] } = useSpaces();
  const { data: people = [] } = useStaffPeople();

  const activePeople = (people ?? []).filter((p: any) => !!p?.isActive);

  const { data: modes = [], isLoading: modesLoading } = useQuery({
    queryKey: [api.staffDefaults.zoneModes.list.path],
    queryFn: () => apiRequest("GET", api.staffDefaults.zoneModes.list.path),
  });

  const { data: asg = [], isLoading: asgLoading } = useQuery({
    queryKey: [api.staffDefaults.assignments.list.path],
    queryFn: () => apiRequest("GET", api.staffDefaults.assignments.list.path),
  });

  const { data: itinerantTeams = [] } = useItinerantTeams();

  const saveModes = useMutation({
    mutationFn: (payload: any) =>
      apiRequest("PUT", api.staffDefaults.zoneModes.saveAll.path, payload),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: [api.staffDefaults.zoneModes.list.path],
      }),
  });

  const saveAsg = useMutation({
    mutationFn: (payload: any) =>
      apiRequest("PUT", api.staffDefaults.assignments.saveAll.path, payload),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: [api.staffDefaults.assignments.list.path],
      }),
  });

  const [localModes, setLocalModes] = useState<Map<number, "zone" | "space">>(
    new Map(),
  );
  const [localAssignments, setLocalAssignments] = useState<any[]>([]);

  useEffect(() => {
    const m = new Map<number, "zone" | "space">();
    for (const r of modes as any[]) {
      const zid = Number(r?.zoneId);
      if (!Number.isFinite(zid)) continue;
      m.set(zid, r?.mode === "space" ? "space" : "zone");
    }
    setLocalModes(m);
  }, [JSON.stringify(modes ?? [])]);

  useEffect(() => {
    setLocalAssignments((asg ?? []) as any[]);
  }, [JSON.stringify(asg ?? [])]);

  const spacesByZone = new Map<number, any[]>();
  for (const s of spaces as any[]) {
    const zid = Number(s?.zoneId ?? s?.zone_id);
    if (!Number.isFinite(zid)) continue;
    const list = spacesByZone.get(zid) ?? [];
    list.push(s);
    spacesByZone.set(zid, list);
  }

  const listFor = (args: {
    staffRole: "production" | "editorial";
    scopeType: "zone" | "space" | "reality_team" | "itinerant_team";
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
    staffRole: "production" | "editorial";
    scopeType: "zone" | "space" | "reality_team" | "itinerant_team";
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
              ? Number(args.itinerantTeamId)
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
    staffRole: "production" | "editorial";
    scopeType: "zone" | "space" | "reality_team" | "itinerant_team";
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
    const [selected, setSelected] = useState<string>("");

    return (
      <div className="space-y-2">
        <div className="text-sm font-medium">{title}</div>

        <div className="flex flex-wrap gap-2">
          {list.length === 0 ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            list.map((a: any, i: number) => {
              const globalIndex = (localAssignments ?? []).findIndex(
                (x: any) => x === a,
              );
              return (
                <Badge
                  key={`${a.staffRole}-${a.staffPersonId}-${i}`}
                  variant="secondary"
                >
                  {String(a?.staffPersonName ?? "") || `#${a?.staffPersonId}`}
                  <button
                    type="button"
                    className="ml-2 text-xs opacity-70 hover:opacity-100"
                    onClick={() => removeAssignment(globalIndex)}
                    aria-label="Quitar"
                  >
                    ×
                  </button>
                </Badge>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={selected}
            onValueChange={setSelected}
            disabled={modesLoading || asgLoading}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Selecciona persona" />
            </SelectTrigger>
            <SelectContent>
              {activePeople
                .filter((p: any) => p.roleType === staffRole)
                .map((p: any) => (
                  <SelectItem key={String(p.id)} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!selected}
            onClick={() => {
              const pid = Number(selected);
              if (!Number.isFinite(pid)) return;
              addAssignment({
                staffRole,
                scopeType,
                staffPersonId: pid,
                zoneId,
                spaceId,
                realityTeamCode,
                itinerantTeamId,
              });
              setSelected("");
            }}
          >
            Añadir
          </Button>
        </div>
      </div>
    );
  };

  const getMode = (zoneId: number) => localModes.get(zoneId) ?? "zone";

  const setMode = (zoneId: number, mode: "zone" | "space") => {
    setLocalModes((prev) => {
      const next = new Map(prev);
      next.set(zoneId, mode);
      return next;
    });
  };

  const handleSave = async () => {
    const modesPayload = (zones as any[]).map((z: any) => ({
      zoneId: Number(z?.id),
      mode: getMode(Number(z?.id)),
    }));

    const assignmentsPayload = (localAssignments ?? []).map((a: any) => ({
      staffRole: a.staffRole,
      staffPersonId: Number(a.staffPersonId),
      scopeType: a.scopeType,
      zoneId: a.zoneId ?? null,
      spaceId: a.spaceId ?? null,
      realityTeamCode: a.realityTeamCode ?? null,
      itinerantTeamId: a.itinerantTeamId ?? null,
    }));

    await saveModes.mutateAsync({ modes: modesPayload });
    await saveAsg.mutateAsync({ assignments: assignmentsPayload });
  };

  const busy =
    modesLoading || asgLoading || saveModes.isPending || saveAsg.isPending;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Defaults (se heredan al crear un plan)</CardTitle>
          <div className="text-sm text-muted-foreground mt-1">
            Por plató decides: asignar por <b>Plató</b> o por <b>Espacios</b>.
            Reality 1/2 se asigna aparte.
          </div>
        </div>

        <Button onClick={handleSave} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Guardar defaults
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {(zones as any[]).length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No hay platós/zones.
          </div>
        ) : (
          (zones as any[]).map((z: any) => {
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
                        onValueChange={(v) => setMode(zid, v as any)}
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
                  ) : zoneSpaces.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Este plató no tiene espacios.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {zoneSpaces.map((s: any) => {
                        const sid = Number(s?.id);
                        const spaceName = String(s?.name ?? `Espacio ${sid}`);
                        return (
                          <Card key={String(sid)} className="border-border/60">
                            <CardHeader className="pb-3">
                              <div className="font-medium">{spaceName}</div>
                              <div className="text-xs text-muted-foreground">
                                En modo espacios, si aquí no asignas → queda
                                vacío (sin herencia).
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
                  )}
                </CardContent>
              </Card>
            );
          })
        )}

        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="font-semibold">Equipos itinerantes</div>
            <div className="text-sm text-muted-foreground">
              Columnas lógicas itinerantes (Reality 1, Reality Duo, etc.)
            </div>
          </CardHeader>

          <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(itinerantTeams ?? []).map((team: any) => (
              <Card key={team.id} className="border-border/60">
                <CardHeader className="pb-3">
                  <div className="font-medium">{team.name}</div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <AssignmentPicker
                    title="Producción"
                    staffRole="production"
                    scopeType="itinerant_team"
                    itinerantTeamId={Number(team.id)}
                  />
                  <AssignmentPicker
                    title="Redacción"
                    staffRole="editorial"
                    scopeType="itinerant_team"
                    itinerantTeamId={Number(team.id)}
                  />
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}

function ZonesSpacesSettings() {
  const { t } = useTranslation();
  const {
    data: zones,
    isLoading: zonesLoading,
    error: zonesError,
  } = useZones();
  const {
    data: spaces,
    isLoading: spacesLoading,
    error: spacesError,
  } = useSpaces();

  const createZone = useCreateZone();
  const updateZone = useUpdateZone();
  const createSpace = useCreateSpace();
  const updateSpace = useUpdateSpace();
  const qc = useQueryClient();
  const { toast } = useToast();

  // === Recursos por ZONA/PLATÓ (defaults globales) ===
  const [resourcesZoneId, setResourcesZoneId] = useState<number | null>(null);
  const [resourcesDraftIds, setResourcesDraftIds] = useState<number[]>([]);
  const [resourcesTypeDraft, setResourcesTypeDraft] = useState<
    Record<number, number>
  >({});
  const [resourcesSavingAll, setResourcesSavingAll] = useState(false);

  const resourcesZoneLabel =
    resourcesZoneId !== null
      ? ((zones ?? []) as any[]).find((z) => Number(z?.id) === resourcesZoneId)
          ?.name || `#${resourcesZoneId}`
      : "";

  const resourceTypesQ = useQuery({
    queryKey: ["/api/resource-types-with-items"],
    queryFn: () => apiRequest("GET", "/api/resource-types-with-items"),
  });

  const zoneDefaultsQ = useQuery({
    queryKey: resourcesZoneId
      ? [`/api/zones/${resourcesZoneId}/resource-defaults`]
      : ["zone-resource-defaults", "none"],
    queryFn: () =>
      apiRequest("GET", `/api/zones/${resourcesZoneId}/resource-defaults`),
    enabled: resourcesZoneId !== null,
  });

  const zoneTypeDefaultsQ = useQuery({
    queryKey: resourcesZoneId
      ? [`/api/zones/${resourcesZoneId}/resource-type-defaults`]
      : ["zone-resource-type-defaults", "none"],
    queryFn: () =>
      apiRequest("GET", `/api/zones/${resourcesZoneId}/resource-type-defaults`),
    enabled: resourcesZoneId !== null,
  });

  const saveZoneDefaults = useMutation({
    mutationFn: (args: { zoneId: number; resourceItemIds: number[] }) =>
      apiRequest("PATCH", `/api/zones/${args.zoneId}/resource-defaults`, {
        resourceItemIds: args.resourceItemIds,
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: [`/api/zones/${variables.zoneId}/resource-defaults`],
      });

      toast({ title: "Recursos del plató guardados" });
    },
    onError: (err: any) => {
      toast({
        title: err?.message || "No se pudieron guardar los recursos del plató",
        variant: "destructive",
      });
    },
  });

  const saveZoneTypeDefaults = useMutation({
    mutationFn: (args: {
      zoneId: number;
      requirements: { resourceTypeId: number; quantity: number }[];
    }) =>
      apiRequest("PATCH", `/api/zones/${args.zoneId}/resource-type-defaults`, {
        requirements: args.requirements,
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: [`/api/zones/${variables.zoneId}/resource-type-defaults`],
      });
      toast({ title: "Requisitos genéricos del plató guardados" });
    },
    onError: (err: any) => {
      toast({
        title:
          err?.message ||
          "No se pudieron guardar los requisitos genéricos del plató",
        variant: "destructive",
      });
    },
  });

  // Cuando abrimos el dialog y llegan defaults, copiamos a draft (SIN setState en render)
  useEffect(() => {
    if (resourcesZoneId === null) return;

    const raw = (zoneDefaultsQ.data as any)?.resourceItemIds;
    if (!Array.isArray(raw)) return;

    const ids = raw
      .map((n: any) => Number(n))
      .filter((n: number) => Number.isFinite(n) && n > 0);

    setResourcesDraftIds(ids);
  }, [resourcesZoneId, zoneDefaultsQ.data]);

  useEffect(() => {
    if (resourcesZoneId === null) return;

    const raw = (zoneTypeDefaultsQ.data as any)?.requirements;
    if (!Array.isArray(raw)) return;

    const next: Record<number, number> = {};
    for (const r of raw) {
      const tid = Number(
        (r as any)?.resourceTypeId ?? (r as any)?.resource_type_id,
      );
      const qty = Number((r as any)?.quantity ?? 0);
      if (!Number.isFinite(tid) || tid <= 0) continue;
      next[tid] = Number.isFinite(qty) && qty >= 0 ? qty : 0;
    }
    setResourcesTypeDraft(next);
  }, [resourcesZoneId, zoneTypeDefaultsQ.data]);

  // === Recursos por ESPACIO (defaults globales) ===
  const [resourcesSpaceId, setResourcesSpaceId] = useState<number | null>(null);
  const [spaceResourcesDraftIds, setSpaceResourcesDraftIds] = useState<
    number[]
  >([]);
  const [spaceResourcesTypeDraft, setSpaceResourcesTypeDraft] = useState<
    Record<number, number>
  >({});
  const [spaceResourcesSavingAll, setSpaceResourcesSavingAll] = useState(false);

  const resourcesSpaceLabel =
    resourcesSpaceId !== null
      ? ((spaces ?? []) as any[]).find(
          (s) => Number(s?.id) === resourcesSpaceId,
        )?.name || `#${resourcesSpaceId}`
      : "";

  const spaceDefaultsQ = useQuery({
    queryKey: resourcesSpaceId
      ? [`/api/spaces/${resourcesSpaceId}/resource-defaults`]
      : ["space-resource-defaults", "none"],
    queryFn: () =>
      apiRequest("GET", `/api/spaces/${resourcesSpaceId}/resource-defaults`),
    enabled: resourcesSpaceId !== null,
  });

  const spaceTypeDefaultsQ = useQuery({
    queryKey: resourcesSpaceId
      ? [`/api/spaces/${resourcesSpaceId}/resource-type-defaults`]
      : ["space-resource-type-defaults", "none"],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/spaces/${resourcesSpaceId}/resource-type-defaults`,
      ),
    enabled: resourcesSpaceId !== null,
  });

  const saveSpaceDefaults = useMutation({
    mutationFn: (args: { spaceId: number; resourceItemIds: number[] }) =>
      apiRequest("PATCH", `/api/spaces/${args.spaceId}/resource-defaults`, {
        resourceItemIds: args.resourceItemIds,
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: [`/api/spaces/${variables.spaceId}/resource-defaults`],
      });

      toast({ title: "Recursos del espacio guardados" });
    },
    onError: (err: any) => {
      toast({
        title:
          err?.message || "No se pudieron guardar los recursos del espacio",
        variant: "destructive",
      });
    },
  });

  const saveSpaceTypeDefaults = useMutation({
    mutationFn: (args: {
      spaceId: number;
      requirements: { resourceTypeId: number; quantity: number }[];
    }) =>
      apiRequest(
        "PATCH",
        `/api/spaces/${args.spaceId}/resource-type-defaults`,
        {
          requirements: args.requirements,
        },
      ),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: [`/api/spaces/${variables.spaceId}/resource-type-defaults`],
      });
      toast({ title: "Requisitos genéricos del espacio guardados" });
    },
    onError: (err: any) => {
      toast({
        title:
          err?.message ||
          "No se pudieron guardar los requisitos genéricos del espacio",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (resourcesSpaceId === null) return;

    const raw = (spaceDefaultsQ.data as any)?.resourceItemIds;
    if (!Array.isArray(raw)) return;

    const ids = raw
      .map((n: any) => Number(n))
      .filter((n: number) => Number.isFinite(n) && n > 0);

    setSpaceResourcesDraftIds(ids);
  }, [resourcesSpaceId, spaceDefaultsQ.data]);

  useEffect(() => {
    if (resourcesSpaceId === null) return;

    const raw = (spaceTypeDefaultsQ.data as any)?.requirements;
    if (!Array.isArray(raw)) return;

    const next: Record<number, number> = {};
    for (const r of raw) {
      const tid = Number(
        (r as any)?.resourceTypeId ?? (r as any)?.resource_type_id,
      );
      const qty = Number((r as any)?.quantity ?? 0);
      if (!Number.isFinite(tid) || tid <= 0) continue;
      next[tid] = Number.isFinite(qty) && qty >= 0 ? qty : 0;
    }
    setSpaceResourcesTypeDraft(next);
  }, [resourcesSpaceId, spaceTypeDefaultsQ.data]);

  const deleteZone = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", buildUrl(api.zones.delete.path, { id })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.zones.list.path] });
      qc.invalidateQueries({ queryKey: [api.spaces.list.path] });
      qc.invalidateQueries({ queryKey: [api.taskTemplates.list.path] }); // ✅ refrescar templates
      toast({ title: "Plató eliminado" });
    },
    onError: (err: any) => {
      toast({
        title: err?.message || "No se pudo eliminar el plató",
        variant: "destructive",
      });
    },
  });

  const deleteSpace = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", buildUrl(api.spaces.delete.path, { id })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.spaces.list.path] });
      qc.invalidateQueries({ queryKey: [api.taskTemplates.list.path] }); // ✅ refrescar templates
      toast({ title: "Espacio eliminado" });
    },
    onError: (err: any) => {
      toast({
        title: err?.message || "No se pudo eliminar el espacio",
        variant: "destructive",
      });
    },
  });

  const [expandedZoneIds, setExpandedZoneIds] = useState<
    Record<number, boolean>
  >({});
  const [newZoneName, setNewZoneName] = useState("");
  const [showCreateZone, setShowCreateZone] = useState(false);

  const [editingZoneId, setEditingZoneId] = useState<number | null>(null);
  const [editingZoneName, setEditingZoneName] = useState("");
  const [editingZoneColor, setEditingZoneColor] = useState<string>("");

  const [editingSpaceId, setEditingSpaceId] = useState<number | null>(null);
  const [editingSpace, setEditingSpace] = useState<{
    name: string;
    priorityLevel: number;
  } | null>(null);

  if (zonesLoading || spacesLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (zonesError || spacesError) {
    return (
      <div className="p-4 border rounded-lg text-sm">
        <div className="font-medium">Error cargando Platós / Espacios</div>
        <div className="text-muted-foreground mt-1">
          {(zonesError as any)?.message ||
            (spacesError as any)?.message ||
            "Error desconocido"}
        </div>
      </div>
    );
  }

  const allZones = (zones || []) as any[];
  const allSpaces = ((spaces || []) as any[])
    .map((s: any) => {
      const zoneRaw = s.zoneId ?? s.zone_id;
      const parentRaw = s.parentSpaceId ?? s.parent_space_id;

      const zoneId = Number(zoneRaw);
      const id = Number(s.id);

      const parentSpaceId =
        parentRaw === null || parentRaw === undefined || parentRaw === ""
          ? null
          : Number(parentRaw);

      const priorityLevel = Number(s.priorityLevel ?? s.priority_level ?? 1);

      return {
        ...s,
        id,
        zoneId,
        parentSpaceId,
        priorityLevel,
      };
    })
    // defensivo: si algo viene roto, mejor excluirlo que romper el árbol
    .filter((s: any) => Number.isFinite(s.id) && Number.isFinite(s.zoneId));

  const spacesByZone = new Map<number, any[]>();
  for (const s of allSpaces) {
    const list = spacesByZone.get(s.zoneId) ?? [];
    list.push(s);
    spacesByZone.set(s.zoneId, list);
  }

  const childrenByParent = (zoneId: number) => {
    const list = spacesByZone.get(zoneId) ?? [];
    const map = new Map<number | null, any[]>();
    for (const s of list) {
      const key = (s.parentSpaceId ?? null) as number | null; // ya viene normalizado arriba a number/null
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    // ordenar por prioridad y nombre
    for (const [k, arr] of map) {
      arr.sort(
        (a, b) =>
          (a.priorityLevel ?? 1) - (b.priorityLevel ?? 1) ||
          String(a.name).localeCompare(String(b.name)),
      );
      map.set(k, arr);
    }
    return map;
  };

  const toggleZone = (id: number) => {
    setExpandedZoneIds((p) => ({ ...p, [id]: !p[id] }));
  };

  const expandAllZones = () => {
    const next: Record<number, boolean> = {};
    for (const z of allZones) next[Number(z.id)] = true;
    setExpandedZoneIds(next);
  };

  const collapseAllZones = () => {
    const next: Record<number, boolean> = {};
    for (const z of allZones) next[Number(z.id)] = false;
    setExpandedZoneIds(next);
  };

  const renderSpaceNode = (
    node: any,
    map: Map<number | null, any[]>,
    level: number,
  ) => {
    const children = map.get(node.id) ?? [];
    const isEditing = editingSpaceId === node.id;

    return (
      <div key={node.id} className="space-y-2">
        <div
          className="flex items-center gap-2"
          style={{ marginLeft: level * 16 }}
        >
          <div className="text-muted-foreground">
            {children.length ? "▾" : "•"}
          </div>

          {isEditing ? (
            <>
              <Input
                className="w-64"
                value={editingSpace?.name ?? ""}
                onChange={(e) =>
                  setEditingSpace((p) =>
                    p ? { ...p, name: e.target.value } : p,
                  )
                }
              />
              <Input
                className="w-24"
                type="number"
                min={1}
                max={5}
                value={editingSpace?.priorityLevel ?? 1}
                onChange={(e) =>
                  setEditingSpace((p) =>
                    p ? { ...p, priorityLevel: Number(e.target.value) } : p,
                  )
                }
              />
              <Button
                size="sm"
                onClick={() => {
                  if (!editingSpaceId || !editingSpace) return;
                  updateSpace.mutate({
                    id: editingSpaceId,
                    patch: {
                      name: editingSpace.name,
                      priorityLevel: editingSpace.priorityLevel,
                    },
                  });
                  setEditingSpaceId(null);
                  setEditingSpace(null);
                }}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingSpaceId(null);
                  setEditingSpace(null);
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <div className="w-64 font-medium">{node.name}</div>
              <div className="w-24 text-sm text-muted-foreground">
                P{node.priorityLevel ?? 1}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingSpaceId(node.id);
                  setEditingSpace({
                    name: node.name ?? "",
                    priorityLevel: Number(node.priorityLevel ?? 1),
                  });
                }}
              >
                Edit
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={level >= 2 || createSpace.isPending}
                onClick={() => {
                  // level: 0=root, 1=child, 2=grandchild
                  // Si level >= 2, el siguiente sería nivel 4 => lo bloqueamos en UI
                  const name = prompt("Nombre del subespacio:");
                  if (!name?.trim()) return;

                  createSpace.mutate(
                    {
                      name: name.trim(),
                      zoneId: node.zoneId,
                      priorityLevel: 1,
                      parentSpaceId: node.id,
                    },
                    {
                      onSuccess: () => {
                        // expandir plató por si acaso
                        setExpandedZoneIds((p) => ({
                          ...p,
                          [node.zoneId]: true,
                        }));
                      },
                    },
                  );
                }}
              >
                + Subespacio
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSpaceResourcesDraftIds([]); // reset draft al abrir
                  setResourcesSpaceId(node.id);
                }}
              >
                {t("settings.tabs.resources")}
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={children.length > 0 || deleteSpace.isPending}
                onClick={() => {
                  if (children.length > 0) return;
                  if (!confirm("¿Eliminar este espacio?")) return;
                  deleteSpace.mutate(node.id);
                }}
                title={
                  children.length > 0
                    ? "Borra primero los subespacios"
                    : "Eliminar espacio"
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {children.length > 0 && level < 2 && (
          <div className="space-y-2">
            {children.map((c) => renderSpaceNode(c, map, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Platós & Espacios</CardTitle>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={showCreateZone ? "secondary" : "outline"}
              onClick={() => setShowCreateZone((v) => !v)}
              title={showCreateZone ? "Cerrar" : "Crear nuevo plató"}
            >
              <Plus className="h-4 w-4 mr-2" />
              {showCreateZone ? "Cerrar" : "Crear nuevo plató"}
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={allZones.length === 0}
              onClick={expandAllZones}
              title="Expandir todos"
            >
              <ChevronsDown className="h-4 w-4 mr-2" />
              Expandir
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={allZones.length === 0}
              onClick={collapseAllZones}
              title="Contraer todos"
            >
              <ChevronsUp className="h-4 w-4 mr-2" />
              Contraer
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {showCreateZone && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <div className="font-medium mb-2">Crear nuevo plató</div>

              <div className="flex items-end gap-2">
                <Input
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  placeholder="Ej. Plató 7"
                />

                <Button
                  onClick={() => {
                    if (!newZoneName.trim()) return;
                    createZone.mutate({ name: newZoneName.trim() });
                    setNewZoneName("");
                    setShowCreateZone(false);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Crear
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setNewZoneName("");
                    setShowCreateZone(false);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Árbol */}
          <div className="space-y-4">
            {allZones.length === 0 ? (
              <div className="text-muted-foreground">
                No hay platós. Crea uno para empezar.
              </div>
            ) : (
              allZones.map((z) => {
                const open = !!expandedZoneIds[z.id];
                const map = childrenByParent(z.id);
                const roots = map.get(null) ?? [];

                const zoneBorderColor =
                  String(
                    (z as any).uiColor ?? (z as any).ui_color ?? "",
                  ).trim() || null;

                // fondo muy suave: mismo color con alpha bajo
                const zoneBgColor = zoneBorderColor
                  ? `${zoneBorderColor}1A` // ~10% de opacidad en hex
                  : null;

                return (
                  <div
                    key={z.id}
                    className={`${zoneBorderColor ? "border-2" : "border"} rounded-lg p-3 space-y-3`}
                    style={
                      zoneBorderColor
                        ? {
                            borderColor: zoneBorderColor,
                            backgroundColor: zoneBgColor,
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleZone(z.id)}
                        >
                          {open ? "▾" : "▸"}
                        </Button>

                        {editingZoneId === z.id ? (
                          <>
                            <Input
                              className="w-64"
                              value={editingZoneName}
                              onChange={(e) =>
                                setEditingZoneName(e.target.value)
                              }
                            />
                            <Input
                              type="color"
                              value={editingZoneColor || "#999999"}
                              onChange={(e) =>
                                setEditingZoneColor(e.target.value)
                              }
                              className="h-10 w-14 p-1"
                            />

                            <Button
                              size="sm"
                              onClick={() => {
                                if (!editingZoneName.trim()) return;
                                updateZone.mutate({
                                  id: z.id,
                                  name: editingZoneName.trim(),
                                  uiColor: editingZoneColor || null,
                                });
                                setEditingZoneId(null);
                                setEditingZoneName("");
                              }}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingZoneId(null);
                                setEditingZoneName("");
                              }}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className="font-semibold">{z.name}</div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingZoneId(z.id);
                                setEditingZoneName(z.name ?? "");
                                setEditingZoneColor(
                                  (z as any).uiColor ??
                                    (z as any).ui_color ??
                                    "",
                                );
                              }}
                            >
                              Edit
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setResourcesDraftIds([]); // reset draft al abrir
                                setResourcesZoneId(z.id);
                              }}
                            >
                              {t("settings.tabs.resources")}
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                (spacesByZone.get(z.id)?.length ?? 0) > 0 ||
                                deleteZone.isPending
                              }
                              onClick={() => {
                                if ((spacesByZone.get(z.id)?.length ?? 0) > 0)
                                  return;
                                if (
                                  !confirm(
                                    "¿Eliminar este Plató? (Solo si no tiene espacios)",
                                  )
                                )
                                  return;
                                deleteZone.mutate(z.id);
                              }}
                              title={
                                (spacesByZone.get(z.id)?.length ?? 0) > 0
                                  ? "Borra antes los espacios del plató"
                                  : "Eliminar plató"
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const name = prompt("Nombre del espacio:");
                          if (!name?.trim()) return;
                          createSpace.mutate({
                            name: name.trim(),
                            zoneId: z.id,
                            priorityLevel: 1,
                            parentSpaceId: null,
                          });
                          setExpandedZoneIds((p) => ({ ...p, [z.id]: true }));
                        }}
                      >
                        + Espacio raíz
                      </Button>
                    </div>

                    {open && (
                      <div className="space-y-2">
                        {roots.length === 0 ? (
                          <div className="text-sm text-muted-foreground">
                            Sin espacios. Crea un espacio raíz.
                          </div>
                        ) : (
                          roots.map((r) => renderSpaceNode(r, map, 0))
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog Recursos del espacio (pegar aquí el bloque entero) */}
      <Dialog
        open={resourcesZoneId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResourcesZoneId(null);
            setResourcesDraftIds([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recursos del plató: {resourcesZoneLabel}</DialogTitle>
            <div className="text-sm text-muted-foreground">
              Seleccionados: {resourcesDraftIds.length} · Genéricos:{" "}
              {Object.values(resourcesTypeDraft ?? {}).reduce(
                (a, b) => a + (Number(b) || 0),
                0,
              )}
              {resourcesSavingAll ||
              saveZoneDefaults.isPending ||
              saveZoneTypeDefaults.isPending
                ? " · Guardando…"
                : ""}
            </div>
          </DialogHeader>

          {zoneDefaultsQ.isLoading || resourceTypesQ.isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : zoneDefaultsQ.error || resourceTypesQ.error ? (
            <div className="p-3 border rounded text-sm">
              <div className="font-medium">Error cargando recursos</div>
              <div className="text-muted-foreground mt-1">
                {(zoneDefaultsQ.error as any)?.message ||
                  (resourceTypesQ.error as any)?.message ||
                  "Error desconocido"}
              </div>
            </div>
          ) : (
            <>
              <div className="border rounded-lg p-3 bg-muted/20">
                <div className="font-medium mb-1">
                  Requisitos genéricos por tipo
                </div>
                <div className="text-xs text-muted-foreground mb-3">
                  Esto define cuántos recursos de cada tipo necesita el plató en
                  general (sin fijar unidad concreta).
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {((resourceTypesQ.data as any[]) ?? []).map((t: any) => {
                    const typeId = Number(t?.id);
                    const typeName = String(t?.name ?? "");
                    if (!Number.isFinite(typeId) || !typeName) return null;

                    const qty = Number(resourcesTypeDraft[typeId] ?? 0);

                    return (
                      <div
                        key={typeId}
                        className="flex items-center justify-between gap-2 border rounded px-2 py-1"
                      >
                        <div className="text-sm">{typeName}</div>
                        <Input
                          className="w-24"
                          type="number"
                          min={0}
                          max={99}
                          value={qty}
                          onChange={(e) => {
                            const next = Number(e.target.value ?? 0);
                            setResourcesTypeDraft((prev) => ({
                              ...prev,
                              [typeId]:
                                Number.isFinite(next) && next >= 0 ? next : 0,
                            }));
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {t("settings.tabs.resources")} específicos (ancla unidades concretas al plató):
              </div>

              <div className="space-y-4 max-h-[55vh] overflow-auto pr-2">
                {((resourceTypesQ.data as any[]) ?? []).map((t: any) => {
                  const typeName = String(t?.name ?? "");
                  const items = (t?.items ?? []) as any[];
                  const activeItems = items.filter(
                    (i) => i?.isActive !== false,
                  );

                  if (activeItems.length === 0) return null;

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
                            const id = Number(it.id);
                            const checked = resourcesDraftIds.includes(id);

                            return (
                              <label
                                key={id}
                                className="flex items-center gap-2 text-sm"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => {
                                    const nextChecked = Boolean(v);
                                    setResourcesDraftIds((prev) => {
                                      const set = new Set(prev);
                                      if (nextChecked) set.add(id);
                                      else set.delete(id);
                                      return Array.from(set);
                                    });
                                  }}
                                />
                                <span>{String(it?.name ?? "")}</span>
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
                  disabled={saveZoneDefaults.isPending}
                  onClick={() => {
                    setResourcesZoneId(null);
                    setResourcesDraftIds([]);
                  }}
                >
                  Cancelar
                </Button>

                <Button
                  disabled={
                    !resourcesZoneId ||
                    resourcesSavingAll ||
                    saveZoneDefaults.isPending ||
                    saveZoneTypeDefaults.isPending
                  }
                  onClick={async () => {
                    if (!resourcesZoneId) return;

                    const uniqueItems = Array.from(
                      new Set(resourcesDraftIds.map((n) => Number(n))),
                    ).filter((n) => Number.isFinite(n) && n > 0);

                    const requirements = Object.entries(
                      resourcesTypeDraft ?? {},
                    )
                      .map(([k, v]) => ({
                        resourceTypeId: Number(k),
                        quantity: Number(v ?? 0),
                      }))
                      .filter(
                        (r) =>
                          Number.isFinite(r.resourceTypeId) &&
                          r.resourceTypeId > 0 &&
                          Number.isFinite(r.quantity) &&
                          r.quantity > 0,
                      );

                    try {
                      setResourcesSavingAll(true);

                      await saveZoneTypeDefaults.mutateAsync({
                        zoneId: resourcesZoneId,
                        requirements,
                      });

                      await saveZoneDefaults.mutateAsync({
                        zoneId: resourcesZoneId,
                        resourceItemIds: uniqueItems,
                      });

                      // cerrar cuando TODO guardó ok
                      setResourcesZoneId(null);
                      setResourcesDraftIds([]);
                      setResourcesTypeDraft({});
                    } finally {
                      setResourcesSavingAll(false);
                    }
                  }}
                >
                  Guardar
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {/* Dialog Recursos del ESPACIO */}
      <Dialog
        open={resourcesSpaceId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResourcesSpaceId(null);
            setSpaceResourcesDraftIds([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("settings.tabs.resources")} del espacio: {resourcesSpaceLabel}
            </DialogTitle>
            <div className="text-sm text-muted-foreground">
              Seleccionados: {spaceResourcesDraftIds.length} · Genéricos:{" "}
              {Object.values(spaceResourcesTypeDraft ?? {}).reduce(
                (a, b) => a + (Number(b) || 0),
                0,
              )}
              {spaceResourcesSavingAll ||
              saveSpaceDefaults.isPending ||
              saveSpaceTypeDefaults.isPending
                ? " · Guardando…"
                : ""}
            </div>
          </DialogHeader>

          {spaceDefaultsQ.isLoading ||
          spaceTypeDefaultsQ.isLoading ||
          resourceTypesQ.isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : spaceDefaultsQ.error ||
            spaceTypeDefaultsQ.error ||
            resourceTypesQ.error ? (
            <div className="p-3 border rounded text-sm">
              <div className="font-medium">Error cargando recursos</div>
              <div className="text-muted-foreground mt-1">
                {(spaceDefaultsQ.error as any)?.message ||
                  (spaceTypeDefaultsQ.error as any)?.message ||
                  (resourceTypesQ.error as any)?.message ||
                  "Error desconocido"}
              </div>
            </div>
          ) : (
            <>
              <div className="border rounded-lg p-3 bg-muted/20">
                <div className="font-medium mb-1">
                  Requisitos genéricos por tipo
                </div>
                <div className="text-xs text-muted-foreground mb-3">
                  Esto define cuántos recursos de cada tipo necesita el espacio
                  en general (sin fijar unidad concreta).
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {((resourceTypesQ.data as any[]) ?? []).map((t: any) => {
                    const typeId = Number(t?.id);
                    const typeName = String(t?.name ?? "");
                    if (!Number.isFinite(typeId) || !typeName) return null;

                    const qty = Number(spaceResourcesTypeDraft[typeId] ?? 0);

                    return (
                      <div
                        key={typeId}
                        className="flex items-center justify-between gap-2 border rounded px-2 py-1"
                      >
                        <div className="text-sm">{typeName}</div>
                        <Input
                          className="w-24"
                          type="number"
                          min={0}
                          max={99}
                          value={qty}
                          onChange={(e) => {
                            const next = Number(e.target.value ?? 0);
                            setSpaceResourcesTypeDraft((prev) => ({
                              ...prev,
                              [typeId]:
                                Number.isFinite(next) && next >= 0 ? next : 0,
                            }));
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {t("settings.tabs.resources")} específicos (ancla unidades concretas al espacio):
              </div>

              <div className="space-y-4 max-h-[55vh] overflow-auto pr-2">
                {((resourceTypesQ.data as any[]) ?? []).map((t: any) => {
                  const typeName = String(t?.name ?? "");
                  const items = (t?.items ?? []) as any[];
                  const activeItems = items.filter(
                    (i) => i?.isActive !== false,
                  );

                  if (activeItems.length === 0) return null;

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
                            const id = Number(it.id);
                            const checked = spaceResourcesDraftIds.includes(id);

                            return (
                              <label
                                key={id}
                                className="flex items-center gap-2 text-sm"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => {
                                    const nextChecked = Boolean(v);
                                    setSpaceResourcesDraftIds((prev) => {
                                      const set = new Set(prev);
                                      if (nextChecked) set.add(id);
                                      else set.delete(id);
                                      return Array.from(set);
                                    });
                                  }}
                                />
                                <span>{String(it?.name ?? "")}</span>
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
                  disabled={spaceResourcesSavingAll}
                  onClick={() => {
                    setResourcesSpaceId(null);
                    setSpaceResourcesDraftIds([]);
                  }}
                >
                  Cancelar
                </Button>

                <Button
                  disabled={
                    resourcesSpaceId === null || spaceResourcesSavingAll
                  }
                  onClick={async () => {
                    if (resourcesSpaceId === null) return;

                    const uniqueItemIds = Array.from(
                      new Set(
                        (spaceResourcesDraftIds ?? [])
                          .map((n) => Number(n))
                          .filter((n) => Number.isFinite(n) && n > 0),
                      ),
                    );

                    const requirements = Object.entries(
                      spaceResourcesTypeDraft ?? {},
                    )
                      .map(([tid, qty]) => ({
                        resourceTypeId: Number(tid),
                        quantity: Number(qty) || 0,
                      }))
                      .filter(
                        (r) =>
                          Number.isFinite(r.resourceTypeId) &&
                          r.resourceTypeId > 0,
                      );

                    try {
                      setSpaceResourcesSavingAll(true);

                      await saveSpaceDefaults.mutateAsync({
                        spaceId: resourcesSpaceId,
                        resourceItemIds: uniqueItemIds,
                      });

                      await saveSpaceTypeDefaults.mutateAsync({
                        spaceId: resourcesSpaceId,
                        requirements,
                      });

                      setResourcesSpaceId(null);
                      setSpaceResourcesDraftIds([]);
                    } finally {
                      setSpaceResourcesSavingAll(false);
                    }
                  }}
                >
                  Guardar
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TaskTemplatesSettings() {
  const { t } = useTranslation();
  const { data: templates, isLoading } = useTaskTemplates();
  const { data: itinerantTeams = [] } = useItinerantTeams();
  const createTask = useCreateTaskTemplate();
  const deleteTask = useDeleteTaskTemplate();
  const updateTask = useUpdateTaskTemplate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const resourceTypesQ = useQuery({
    queryKey: ["/api/resource-types-with-items"],
    queryFn: () => apiRequest("GET", "/api/resource-types-with-items"),
  });

  const {
    data: zones,
    isLoading: zonesLoading,
    error: zonesError,
  } = useZones();
  const {
    data: spaces,
    isLoading: spacesLoading,
    error: spacesError,
  } = useSpaces();

  const allZones = (zones || []) as any[];
  const allSpaces = (spaces || []) as any[];

  const zonesById = new Map<number, any>();
  for (const z of allZones) zonesById.set(Number(z.id), z);

  const spacesByZone = new Map<number, any[]>();
  for (const s of allSpaces) {
    const zoneId = Number(s.zoneId ?? s.zone_id);
    if (!Number.isFinite(zoneId)) continue;
    const list = spacesByZone.get(zoneId) ?? [];
    list.push(s);
    spacesByZone.set(zoneId, list);
  }

  const [editingId, setEditingId] = useState<number | null>(null);

  // ✅ Ficha (Dialog) de task template
  const [templateDialogId, setTemplateDialogId] = useState<number | null>(null);
  const [templateDialogDraft, setTemplateDialogDraft] = useState<any | null>(
    null,
  );

  function openTemplateDialog(t: any) {
    const zoneRaw = t.zoneId ?? t.zone_id ?? null;
    const spaceRaw = t.spaceId ?? t.space_id ?? null;

    setTemplateDialogDraft({
      id: Number(t.id),
      name: String(t.name ?? ""),
      defaultDuration: Number(t.defaultDuration ?? t.default_duration ?? 30),
      defaultCameras: Number(t.defaultCameras ?? t.default_cameras ?? 0),

      requiresAuxiliar: Boolean(
        t.requiresAuxiliar ?? t.requires_auxiliar ?? false,
      ),
      requiresCoach: Boolean(t.requiresCoach ?? t.requires_coach ?? false),
      requiresPresenter: Boolean(
        t.requiresPresenter ?? t.requires_presenter ?? false,
      ),
      exclusiveAuxiliar: Boolean(
        t.exclusiveAuxiliar ?? t.exclusive_auxiliar ?? false,
      ),

      setupId: (t.setupId ?? t.setup_id ?? null) as number | null,
      rulesJson: t.rulesJson ?? t.rules_json ?? null,
      rulesText:
        (t.rulesJson ?? t.rules_json)
          ? JSON.stringify(t.rulesJson ?? t.rules_json, null, 2)
          : "",

      resourceRequirements:
        t.resourceRequirements ?? t.resource_requirements ?? null,
      resourceReqText:
        (t.resourceRequirements ?? t.resource_requirements)
          ? JSON.stringify(
              t.resourceRequirements ?? t.resource_requirements,
              null,
              2,
            )
          : "",

      uiColor: (t.uiColor ?? t.ui_color ?? null) as string | null,
      uiColorSecondary: (t.uiColorSecondary ?? t.ui_color_secondary ?? null) as
        | string
        | null,

      hasDependency: Boolean(t.hasDependency ?? t.has_dependency ?? false),
      dependsOnTemplateIds: Array.isArray(t.dependsOnTemplateIds)
        ? t.dependsOnTemplateIds
        : Array.isArray(t.depends_on_template_ids)
          ? t.depends_on_template_ids
          : [],

      itinerantTeamRequirement:
        (t as any).itinerantTeamRequirement ??
        (t as any).itinerant_team_requirement ??
        "none",
      itinerantTeamId:
        (t as any).itinerantTeamId ?? (t as any).itinerant_team_id ?? null,

      zoneId: zoneRaw == null ? null : Number(zoneRaw),
      spaceId: spaceRaw == null ? null : Number(spaceRaw),
    });
    setTemplateDialogId(Number(t.id));
    // ✅ Cargar pantalla de "Recursos" dentro de la ficha (drafts)
    const rr = normalizeRR(
      t.resourceRequirements ?? t.resource_requirements ?? null,
    );

    setReqByTypeDraft(rr.byType);
    setReqByItemDraft(rr.byItem);
    setReqAnyOfQty(rr.anyQty);
    setReqAnyOfItemIds(rr.anyIds);

    // UI del picker
    setReqAnyOfPickerOpen(false);
    setReqShowAdvanced(false);
    setReqText("");
  }

  function closeTemplateDialog() {
    setTemplateDialogId(null);
    setTemplateDialogDraft(null);
  }

  // ✅ Dialog: requisitos de recursos por task template (UI + modo avanzado JSON)
  const [reqDialogId, setReqDialogId] = useState<number | null>(null);
  const [reqSaving, setReqSaving] = useState(false);

  // UI drafts
  const [reqByTypeDraft, setReqByTypeDraft] = useState<Record<number, number>>(
    {},
  );
  const [reqByItemDraft, setReqByItemDraft] = useState<Record<number, number>>(
    {},
  );
  const [reqAnyOfQty, setReqAnyOfQty] = useState<number>(1);
  const [reqAnyOfItemIds, setReqAnyOfItemIds] = useState<number[]>([]);
  const [reqAnyOfPickerOpen, setReqAnyOfPickerOpen] = useState(false);

  // Advanced JSON
  const [reqShowAdvanced, setReqShowAdvanced] = useState(false);
  const [reqText, setReqText] = useState<string>("");

  function normalizeRR(raw: any) {
    const rr = raw && typeof raw === "object" ? raw : null;

    const byType: Record<number, number> = {};
    const byItem: Record<number, number> = {};

    const bt = Array.isArray(rr?.byType) ? rr.byType : [];
    for (const r of bt) {
      const tid = Number((r as any)?.resourceTypeId);
      const qty = Number((r as any)?.quantity ?? 0);
      if (!Number.isFinite(tid) || tid <= 0) continue;
      if (!Number.isFinite(qty) || qty <= 0) continue;
      byType[tid] = Math.min(99, Math.max(0, Math.floor(qty)));
    }

    const bi = Array.isArray(rr?.byItem) ? rr.byItem : [];
    for (const r of bi) {
      const iid = Number((r as any)?.resourceItemId);
      const qty = Number((r as any)?.quantity ?? 0);
      if (!Number.isFinite(iid) || iid <= 0) continue;
      if (!Number.isFinite(qty) || qty <= 0) continue;
      byItem[iid] = Math.min(99, Math.max(0, Math.floor(qty)));
    }

    let anyQty = 1;
    let anyIds: number[] = [];
    const ao = Array.isArray(rr?.anyOf) ? rr.anyOf : [];
    if (ao.length > 0) {
      const first = ao[0] ?? {};
      const q = Number((first as any)?.quantity ?? 1);
      const ids = Array.isArray((first as any)?.resourceItemIds)
        ? (first as any).resourceItemIds
        : [];
      anyQty = Number.isFinite(q) && q > 0 ? Math.min(99, Math.floor(q)) : 1;
      anyIds = ids
        .map((n: any) => Number(n))
        .filter((n: number) => Number.isFinite(n) && n > 0);
    }

    return { byType, byItem, anyQty, anyIds };
  }

  function buildRRFromDrafts() {
    const byType = Object.entries(reqByTypeDraft ?? {})
      .map(([k, v]) => ({
        resourceTypeId: Number(k),
        quantity: Number(v ?? 0),
      }))
      .filter(
        (r) =>
          Number.isFinite(r.resourceTypeId) &&
          r.resourceTypeId > 0 &&
          Number.isFinite(r.quantity) &&
          r.quantity > 0,
      );

    const byItem = Object.entries(reqByItemDraft ?? {})
      .map(([k, v]) => ({
        resourceItemId: Number(k),
        quantity: Number(v ?? 0),
      }))
      .filter(
        (r) =>
          Number.isFinite(r.resourceItemId) &&
          r.resourceItemId > 0 &&
          Number.isFinite(r.quantity) &&
          r.quantity > 0,
      );

    const anyOf =
      (reqAnyOfItemIds ?? []).length > 0
        ? [
            {
              quantity: Math.max(1, Number(reqAnyOfQty ?? 1)),
              resourceItemIds: Array.from(
                new Set(
                  (reqAnyOfItemIds ?? [])
                    .map((n) => Number(n))
                    .filter((n) => Number.isFinite(n) && n > 0),
                ),
              ),
            },
          ]
        : [];

    const out: any = {};
    if (byType.length > 0) out.byType = byType;
    if (byItem.length > 0) out.byItem = byItem;
    if (anyOf.length > 0) out.anyOf = anyOf;

    return Object.keys(out).length > 0 ? out : null;
  }

  function openReqDialog(t: any) {
    const raw =
      (t as any).resourceRequirements ??
      (t as any).resource_requirements ??
      null;
    const norm = normalizeRR(raw);

    setReqDialogId(Number(t.id));
    setReqByTypeDraft(norm.byType);
    setReqByItemDraft(norm.byItem);
    setReqAnyOfQty(norm.anyQty);
    setReqAnyOfItemIds(norm.anyIds);
    setReqAnyOfPickerOpen(false);

    const pretty = raw ? JSON.stringify(raw, null, 2) : "";
    setReqText(pretty);
    setReqShowAdvanced(false);
  }

  type EditTemplateData = {
    name: string;
    defaultDuration: number;
    zoneId: number | null;
    spaceId: number | null;
    locationLabel: string | null;

    uiColor: string | null;
    uiColorSecondary: string | null;

    hasDependency: boolean;

    // ✅ N dependencias
    dependsOnTemplateIds: number[];

    // legacy (compat UI/DB vieja)
    dependsOnTemplateId: number | null;
  };

  const [editData, setEditData] = useState<EditTemplateData | null>(null);

  // ✅ Bulk edit (editar todas)
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkDraft, setBulkDraft] = useState<Record<number, any>>({});
  const [bulkOriginal, setBulkOriginal] = useState<Record<number, any>>({});

  const [isAddOpen, setIsAddOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    defaultDuration: 30,
    zoneId: null as number | null,
    spaceId: null as number | null,

    // ✅ nuevo (por defecto un color neutro; el user puede “limpiarlo”)
    uiColor: "#94a3b8" as string | null,
    uiColorSecondary: "#94a3b8" as string | null,

    hasDependency: false,
    dependsOnTemplateIds: [] as number[],
    dependsOnTemplateId: null as number | null,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (
      formData.hasDependency &&
      (formData.dependsOnTemplateIds?.length ?? 0) === 0
    ) {
      toast({
        title: "Selecciona al menos 1 dependencia.",
        variant: "destructive",
      });
      return;
    }

    createTask.mutate(formData as any, {
      onSuccess: () => {
        setIsAddOpen(false);
        setFormData({
          name: "",
          defaultDuration: 30,
          zoneId: null,
          spaceId: null,
          uiColor: "#94a3b8",
          uiColorSecondary: "#94a3b8",
          hasDependency: false,
          dependsOnTemplateIds: [],
          dependsOnTemplateId: null,
        });
      },
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this template?")) {
      deleteTask.mutate(id);
    }
  };
  const startEdit = (t: any) => {
    const zoneRaw = t.zoneId ?? t.zone_id ?? null;
    const spaceRaw = t.spaceId ?? t.space_id ?? null;

    setEditingId(t.id);
    const locationLabel = t.locationLabel ?? t.location_label ?? null;

    setEditData({
      name: t.name ?? "",
      defaultDuration: Number(t.defaultDuration ?? 30),
      zoneId:
        zoneRaw === null || zoneRaw === undefined ? null : Number(zoneRaw),
      spaceId:
        spaceRaw === null || spaceRaw === undefined ? null : Number(spaceRaw),
      locationLabel,

      // ✅ nuevo
      uiColor: (t.uiColor ?? t.ui_color ?? null) as string | null,
      uiColorSecondary: (t.uiColorSecondary ?? t.ui_color_secondary ?? null) as
        | string
        | null,

      // ✅ Dependencias (multi) + compat legacy
      hasDependency: Boolean((t as any).hasDependency ?? false),

      dependsOnTemplateIds: Array.isArray((t as any).dependsOnTemplateIds)
        ? ((t as any).dependsOnTemplateIds as number[])
        : Array.isArray((t as any).depends_on_template_ids)
          ? ((t as any).depends_on_template_ids as number[])
          : [],

      dependsOnTemplateId: ((t as any).dependsOnTemplateId ?? null) as
        | number
        | null,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData(null);
  };

  const saveEdit = () => {
    if (!editingId || !editData) return;
    if (!editData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    if (
      editData.hasDependency &&
      (editData.dependsOnTemplateIds?.length ?? 0) === 0
    ) {
      toast({
        title: "Selecciona al menos 1 dependencia.",
        variant: "destructive",
      });
      return;
    }

    updateTask.mutate(
      {
        id: editingId,
        patch: {
          name: editData.name.trim(),
          defaultDuration: Number(editData.defaultDuration),
          zoneId: editData.zoneId,
          spaceId: editData.spaceId,

          // ✅ nuevo
          uiColor: editData.uiColor,
          uiColorSecondary: editData.uiColorSecondary,

          hasDependency: editData.hasDependency,

          // ✅ nuevo
          dependsOnTemplateIds: editData.hasDependency
            ? (editData.dependsOnTemplateIds ?? [])
            : [],

          // legacy compat (primer elemento)
          dependsOnTemplateId: editData.hasDependency
            ? (editData.dependsOnTemplateIds?.[0] ?? null)
            : null,
        },
      },
      { onSuccess: () => cancelEdit() },
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Global Task Templates</CardTitle>
        <div className="flex items-center gap-2">
          {!bulkEditing ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const draft: Record<number, any> = {};
                (templates ?? []).forEach((t: any) => {
                  draft[Number(t.id)] = {
                    id: Number(t.id),
                    name: t.name ?? "",
                    defaultDuration: Number(
                      t.defaultDuration ?? t.default_duration ?? 30,
                    ),

                    // ✅ importante: si no lo guardamos, luego normalize() manda NaN y rompe el PATCH
                    defaultCameras: Number(
                      t.defaultCameras ?? t.default_cameras ?? 0,
                    ),

                    zoneId: (t.zoneId ?? t.zone_id ?? null) as number | null,
                    spaceId: (t.spaceId ?? t.space_id ?? null) as number | null,
                    uiColor: (t.uiColor ?? t.ui_color ?? "#94a3b8") as string,
                    uiColorSecondary: (t.uiColorSecondary ??
                      t.ui_color_secondary ??
                      "#94a3b8") as string,
                    hasDependency: Boolean(
                      t.hasDependency ?? t.has_dependency ?? false,
                    ),
                    dependsOnTemplateIds: Array.isArray(t.dependsOnTemplateIds)
                      ? t.dependsOnTemplateIds
                      : Array.isArray(t.depends_on_template_ids)
                        ? t.depends_on_template_ids
                        : [],

                    itinerantTeamRequirement:
                      (t as any).itinerantTeamRequirement ??
                      (t as any).itinerant_team_requirement ??
                      "none",
                    itinerantTeamId:
                      (t as any).itinerantTeamId ??
                      (t as any).itinerant_team_id ??
                      null,
                  };
                });

                setBulkDraft(draft);
                setBulkOriginal(draft);
                setBulkEditing(true);

                // salir de edición por fila si estaba activa
                setEditingId(null);
                setEditData(null);
              }}
            >
              Editar todas
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    const items = Object.values(bulkDraft ?? {});
                    if (items.length === 0) {
                      setBulkEditing(false);
                      setBulkDraft({});
                      return;
                    }

                    // Validaciones mínimas
                    for (const it of items as any[]) {
                      const id = Number(it?.id);

                      // auto-dependencia
                      if ((it?.dependsOnTemplateIds ?? []).includes(id)) {
                        toast({
                          title: "Auto-dependencia detectada",
                          description: `Una tarea no puede depender de sí misma: ${it?.name ?? `#${id}`}`,
                          variant: "destructive",
                        });
                        return;
                      }

                      // si hasDependency=true, al menos 1 dependencia
                      if (
                        it?.hasDependency &&
                        (it?.dependsOnTemplateIds?.length ?? 0) === 0
                      ) {
                        toast({
                          title: "Dependencias incompletas",
                          description: `Selecciona al menos 1 dependencia para: ${it?.name ?? `#${id}`}`,
                          variant: "destructive",
                        });
                        return;
                      }

                      // ✅ Equipo itinerante: si es específico, hay que elegir uno
                      const req = String(
                        it?.itinerantTeamRequirement ?? "none",
                      );
                      if (
                        req === "specific" &&
                        (it?.itinerantTeamId ?? null) == null
                      ) {
                        toast({
                          title: "Equipo itinerante incompleto",
                          description: `Selecciona un equipo para: ${it?.name ?? `#${id}`}`,
                          variant: "destructive",
                        });
                        return;
                      }
                    }

                    const normalize = (it: any) => ({
                      name: (it?.name ?? "").trim(),
                      defaultDuration: Number(it?.defaultDuration),
                      defaultCameras: Number.isFinite(
                        Number(it?.defaultCameras),
                      )
                        ? Number(it?.defaultCameras)
                        : 0,
                      zoneId: it?.zoneId ?? null,
                      spaceId: it?.spaceId ?? null,
                      uiColor: it?.uiColor ?? null,
                      uiColorSecondary: it?.uiColorSecondary ?? null,
                      hasDependency: Boolean(it?.hasDependency),
                      dependsOnTemplateIds: Boolean(it?.hasDependency)
                        ? (it?.dependsOnTemplateIds ?? [])
                        : [],
                      dependsOnTemplateId: Boolean(it?.hasDependency)
                        ? (it?.dependsOnTemplateIds?.[0] ?? null)
                        : null,

                      itinerantTeamRequirement:
                        it?.itinerantTeamRequirement ?? "none",
                      itinerantTeamId:
                        (it?.itinerantTeamRequirement ?? "none") === "specific"
                          ? (it?.itinerantTeamId ?? null)
                          : null,
                    });

                    const sameArray = (a: any[], b: any[]) => {
                      const aa = Array.isArray(a) ? a : [];
                      const bb = Array.isArray(b) ? b : [];
                      if (aa.length !== bb.length) return false;
                      for (let i = 0; i < aa.length; i++)
                        if (aa[i] !== bb[i]) return false;
                      return true;
                    };

                    const isSame = (a: any, b: any) => {
                      const A = normalize(a);
                      const B = normalize(b);
                      return (
                        A.name === B.name &&
                        A.defaultDuration === B.defaultDuration &&
                        A.defaultCameras === B.defaultCameras &&
                        A.zoneId === B.zoneId &&
                        A.spaceId === B.spaceId &&
                        A.uiColor === B.uiColor &&
                        A.uiColorSecondary === B.uiColorSecondary &&
                        A.hasDependency === B.hasDependency &&
                        A.dependsOnTemplateId === B.dependsOnTemplateId &&
                        A.itinerantTeamRequirement ===
                          B.itinerantTeamRequirement &&
                        (A.itinerantTeamId ?? null) ===
                          (B.itinerantTeamId ?? null) &&
                        sameArray(
                          A.dependsOnTemplateIds,
                          B.dependsOnTemplateIds,
                        )
                      );
                    };

                    // ✅ Guardar solo cambios
                    const changed = (items as any[]).filter((it) => {
                      const id = Number(it?.id);
                      const orig = bulkOriginal?.[id];
                      return !isSame(it, orig);
                    });

                    if (changed.length === 0) {
                      toast({
                        title: "Sin cambios",
                        description: "No había nada que guardar.",
                      });
                      setBulkEditing(false);
                      setBulkDraft({});
                      setBulkOriginal({});
                      return;
                    }

                    // ✅ Paralelo limitado (sin saturar)
                    const CONCURRENCY = 4;
                    let idx = 0;

                    async function worker() {
                      while (true) {
                        const current = idx++;
                        if (current >= changed.length) return;

                        const it = changed[current];
                        const id = Number(it.id);
                        const payload = normalize(it);

                        await apiRequest(
                          "PATCH",
                          buildUrl(api.taskTemplates.update.path, { id }),
                          payload,
                        );
                      }
                    }

                    const workers = Array.from(
                      { length: Math.min(CONCURRENCY, changed.length) },
                      () => worker(),
                    );
                    await Promise.all(workers);

                    toast({
                      title: "Guardado",
                      description: "Task templates actualizadas.",
                    });

                    // refrescar lista
                    qc.invalidateQueries({
                      queryKey: [api.taskTemplates.list.path],
                    });

                    setBulkEditing(false);
                    setBulkDraft({});
                  } catch (e: any) {
                    toast({
                      title: "Error guardando en bloque",
                      description: e?.message ?? "Revisa consola",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Guardar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setBulkEditing(false);
                  setBulkDraft({});
                }}
              >
                Cancelar
              </Button>
            </>
          )}

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Task Template</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="e.g. Sound Check"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Default Duration (min)</Label>
                    <Input
                      type="number"
                      required
                      value={formData.defaultDuration}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          defaultDuration: parseInt(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>

                {/* ✅ Color UI */}
                <div className="space-y-2">
                  <Label>Color (opcional)</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="color"
                      value={(formData.uiColor ?? "#94a3b8") as string}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, uiColor: e.target.value }))
                      }
                      className="h-10 w-16 p-1"
                    />
                    <Input
                      value={(formData.uiColor ?? "") as string}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          uiColor: e.target.value || null,
                        }))
                      }
                      placeholder="#RRGGBB"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setFormData((p) => ({ ...p, uiColor: null }))
                      }
                    >
                      Sin color
                    </Button>
                  </div>
                </div>
                {/* ✅ Color UI (Plató) */}
                <div className="space-y-2">
                  <Label>Color (Plató) (opcional)</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="color"
                      value={(formData.uiColorSecondary ?? "#94a3b8") as string}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          uiColorSecondary: e.target.value,
                        }))
                      }
                      className="h-10 w-16 p-1"
                    />
                    <Input
                      value={(formData.uiColorSecondary ?? "") as string}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          uiColorSecondary: e.target.value || null,
                        }))
                      }
                      placeholder="#RRGGBB"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setFormData((p) => ({ ...p, uiColorSecondary: null }))
                      }
                    >
                      Sin color
                    </Button>
                  </div>
                </div>
                {/* ✅ Dependencias (multi) */}
                <div className="space-y-2">
                  <Label>Dependencias</Label>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={formData.hasDependency}
                      onCheckedChange={(v) => {
                        const checked = v === true;
                        setFormData((p) => ({
                          ...p,
                          hasDependency: checked,
                          dependsOnTemplateIds: checked
                            ? (p.dependsOnTemplateIds ?? [])
                            : [],
                          // legacy compat (primer elemento)
                          dependsOnTemplateId: checked
                            ? (p.dependsOnTemplateIds?.[0] ?? null)
                            : null,
                        }));
                      }}
                    />
                    <span className="text-sm">Tiene dependencias</span>
                  </div>

                  {formData.hasDependency ? (
                    <div className="border rounded-md p-2 max-h-40 overflow-auto space-y-1">
                      {(templates ?? []).map((tt: any) => {
                        const id = Number(tt.id);
                        const checked = (
                          formData.dependsOnTemplateIds ?? []
                        ).includes(id);
                        return (
                          <label
                            key={tt.id}
                            className="flex items-center gap-2 text-sm cursor-pointer"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                const next = v === true;
                                setFormData((p) => {
                                  const current = p.dependsOnTemplateIds ?? [];
                                  const updated = next
                                    ? Array.from(new Set([...current, id]))
                                    : current.filter((x) => x !== id);

                                  return {
                                    ...p,
                                    dependsOnTemplateIds: updated,
                                    // legacy compat (primer elemento)
                                    dependsOnTemplateId: updated.length
                                      ? updated[0]
                                      : null,
                                  };
                                });
                              }}
                            />
                            <span>{tt.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">—</div>
                  )}

                  {formData.hasDependency &&
                    (formData.dependsOnTemplateIds?.length ?? 0) === 0 && (
                      <p className="text-xs text-red-500">
                        Selecciona al menos 1 dependencia.
                      </p>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Plató (opcional)</Label>
                    <Select
                      value={
                        formData.zoneId === null
                          ? "none"
                          : String(formData.zoneId)
                      }
                      onValueChange={(v) => {
                        const nextZoneId = v === "none" ? null : Number(v);
                        setFormData((p) => ({
                          ...p,
                          zoneId: nextZoneId,
                          spaceId: null, // si cambias plató, resetea espacio
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin plató" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin plató</SelectItem>
                        {zonesLoading ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            Cargando…
                          </div>
                        ) : zonesError ? (
                          <div className="p-2 text-sm text-destructive">
                            Error cargando platós
                          </div>
                        ) : (
                          allZones.map((z: any) => (
                            <SelectItem key={z.id} value={String(z.id)}>
                              {z.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Espacio (opcional)</Label>
                    <Select
                      value={
                        formData.spaceId === null
                          ? "none"
                          : String(formData.spaceId)
                      }
                      onValueChange={(v) => {
                        const nextSpaceId = v === "none" ? null : Number(v);
                        setFormData((p) => ({ ...p, spaceId: nextSpaceId }));
                      }}
                      disabled={formData.zoneId === null}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            formData.zoneId === null
                              ? "Elige plató primero"
                              : "Sin espacio"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin espacio</SelectItem>
                        {spacesLoading ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            Cargando…
                          </div>
                        ) : spacesError ? (
                          <div className="p-2 text-sm text-destructive">
                            Error cargando espacios
                          </div>
                        ) : (
                          (spacesByZone.get(formData.zoneId ?? -1) ?? []).map(
                            (s: any) => {
                              const parent =
                                s.parentSpaceId ?? s.parent_space_id ?? null;
                              const label = parent ? `↳ ${s.name}` : s.name;
                              return (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  {label}
                                </SelectItem>
                              );
                            },
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createTask.isPending}
                >
                  {createTask.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Create Template"
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {/* ✅ Ficha Task Template */}
        <Dialog
          open={templateDialogId != null}
          onOpenChange={(open) => {
            if (!open) closeTemplateDialog();
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                Task Template:{" "}
                {templateDialogDraft?.name?.trim() ||
                  `#${templateDialogId ?? ""}`}
              </DialogTitle>
            </DialogHeader>

            {!templateDialogDraft ? (
              <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("common.name")}</Label>
                    <Input
                      value={templateDialogDraft.name ?? ""}
                      onChange={(e) =>
                        setTemplateDialogDraft((p: any) => ({
                          ...(p ?? {}),
                          name: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Duración (min)</Label>
                    <Input
                      type="number"
                      value={templateDialogDraft.defaultDuration ?? 30}
                      onChange={(e) =>
                        setTemplateDialogDraft((p: any) => ({
                          ...(p ?? {}),
                          defaultDuration: Number(e.target.value),
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Plató</Label>
                    <Select
                      value={String(templateDialogDraft.zoneId ?? "none")}
                      onValueChange={(v) => {
                        const zid = v === "none" ? null : Number(v);
                        setTemplateDialogDraft((p: any) => ({
                          ...(p ?? {}),
                          zoneId: zid,
                          spaceId: null,
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin plató" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin plató</SelectItem>
                        {(zones ?? []).map((z: any) => (
                          <SelectItem key={z.id} value={String(z.id)}>
                            {z.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Espacio</Label>
                    <Select
                      value={String(templateDialogDraft.spaceId ?? "none")}
                      onValueChange={(v) => {
                        const sid = v === "none" ? null : Number(v);
                        setTemplateDialogDraft((p: any) => ({
                          ...(p ?? {}),
                          spaceId: sid,
                        }));
                      }}
                      disabled={!templateDialogDraft.zoneId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin espacio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin espacio</SelectItem>
                        {(
                          spacesByZone.get(templateDialogDraft.zoneId ?? -1) ??
                          []
                        ).map((s: any) => {
                          const parent =
                            s.parentSpaceId ?? s.parent_space_id ?? null;
                          const label = parent ? `↳ ${s.name}` : s.name;
                          return (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Equipo itinerante</Label>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <Checkbox
                          checked={
                            String(
                              templateDialogDraft.itinerantTeamRequirement ??
                                "none",
                            ) !== "none"
                          }
                          onCheckedChange={(v) => {
                            const enabled = v === true;
                            setTemplateDialogDraft((p: any) => ({
                              ...(p ?? {}),
                              itinerantTeamRequirement: enabled
                                ? "any"
                                : "none",
                              itinerantTeamId: null,
                            }));
                          }}
                        />
                        <span>Usa equipo itinerante</span>
                      </label>

                      <div className="flex-1" />

                      <div className="w-64">
                        <Select
                          disabled={
                            String(
                              templateDialogDraft.itinerantTeamRequirement ??
                                "none",
                            ) === "none"
                          }
                          value={String(
                            (templateDialogDraft.itinerantTeamRequirement ??
                              "none") === "none"
                              ? "any"
                              : (templateDialogDraft.itinerantTeamRequirement ??
                                  "any"),
                          )}
                          onValueChange={(v) => {
                            setTemplateDialogDraft((p: any) => ({
                              ...(p ?? {}),
                              itinerantTeamRequirement: v,
                              itinerantTeamId:
                                v === "specific"
                                  ? (p?.itinerantTeamId ?? null)
                                  : null,
                            }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Modo..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">
                              Cualquiera (motor decide)
                            </SelectItem>
                            <SelectItem value="specific">
                              Uno concreto
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {String(
                      templateDialogDraft.itinerantTeamRequirement ?? "none",
                    ) === "specific" ? (
                      <div className="pt-2">
                        <Select
                          value={String(
                            templateDialogDraft.itinerantTeamId ?? "none",
                          )}
                          onValueChange={(v) => {
                            setTemplateDialogDraft((p: any) => ({
                              ...(p ?? {}),
                              itinerantTeamId: v === "none" ? null : Number(v),
                            }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Equipo..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              Selecciona equipo
                            </SelectItem>
                            {(itinerantTeams as any[])
                              .slice()
                              .sort((a: any, b: any) => {
                                const ao = Number(
                                  a?.orderIndex ?? a?.order_index ?? 0,
                                );
                                const bo = Number(
                                  b?.orderIndex ?? b?.order_index ?? 0,
                                );
                                return ao - bo;
                              })
                              .map((team: any) => (
                                <SelectItem
                                  key={String(team.id)}
                                  value={String(team.id)}
                                >
                                  {team.name ??
                                    team.code ??
                                    `Equipo #${team.id}`}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label>Color (tarea)</Label>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-9 w-9 rounded border"
                        style={{
                          background:
                            String(templateDialogDraft.uiColor ?? "").trim() ||
                            "transparent",
                        }}
                        title={String(templateDialogDraft.uiColor ?? "")}
                      />
                      <Input
                        value={String(templateDialogDraft.uiColor ?? "")}
                        onChange={(e) =>
                          setTemplateDialogDraft((p: any) => ({
                            ...(p ?? {}),
                            uiColor: e.target.value || null,
                          }))
                        }
                        placeholder="#RRGGBB"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Color (plató)</Label>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-9 w-9 rounded border"
                        style={{
                          background:
                            String(
                              templateDialogDraft.uiColorSecondary ?? "",
                            ).trim() || "transparent",
                        }}
                        title={String(
                          templateDialogDraft.uiColorSecondary ?? "",
                        )}
                      />
                      <Input
                        value={String(
                          templateDialogDraft.uiColorSecondary ?? "",
                        )}
                        onChange={(e) =>
                          setTemplateDialogDraft((p: any) => ({
                            ...(p ?? {}),
                            uiColorSecondary: e.target.value || null,
                          }))
                        }
                        placeholder="#RRGGBB"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => closeTemplateDialog()}
                  >
                    Cerrar
                  </Button>

                  <Button
                    type="button"
                    onClick={() => {
                      const d = templateDialogDraft;

                      // Validación equipo específico
                      if (
                        String(d?.itinerantTeamRequirement ?? "none") ===
                          "specific" &&
                        (d?.itinerantTeamId ?? null) == null
                      ) {
                        toast({
                          title: "Equipo itinerante incompleto",
                          description:
                            "Selecciona un equipo o cambia a “Cualquiera/No necesita”.",
                          variant: "destructive",
                        });
                        return;
                      }

                      // ✅ Recursos (desde pantalla, no JSON)
                      const rrObj = buildRRFromDrafts();
                      const rrEmpty =
                        (rrObj?.byType?.length ?? 0) === 0 &&
                        (rrObj?.byItem?.length ?? 0) === 0 &&
                        (rrObj?.anyOf?.length ?? 0) === 0;

                      const rr = rrEmpty ? null : rrObj;

                      updateTask.mutate(
                        {
                          id: Number(d.id),
                          patch: {
                            name: String(d.name ?? "").trim(),
                            defaultDuration: Number(d.defaultDuration ?? 30),
                            defaultCameras: Number(d.defaultCameras ?? 0),
                            setupId: d.setupId ?? null,

                            resourceRequirements: rr,

                            uiColor: d.uiColor ?? null,
                            uiColorSecondary: d.uiColorSecondary ?? null,

                            hasDependency: Boolean(d.hasDependency),
                            dependsOnTemplateIds: Boolean(d.hasDependency)
                              ? (d.dependsOnTemplateIds ?? [])
                              : [],

                            itinerantTeamRequirement:
                              d.itinerantTeamRequirement ?? "none",
                            itinerantTeamId:
                              (d.itinerantTeamRequirement ?? "none") ===
                              "specific"
                                ? (d.itinerantTeamId ?? null)
                                : null,

                            zoneId: d.zoneId ?? null,
                            spaceId: d.spaceId ?? null,
                          },
                        },
                        {
                          onSuccess: () => {
                            toast({ title: "Guardado" });
                            qc.invalidateQueries({
                              queryKey: [api.taskTemplates.list.path],
                            });
                            closeTemplateDialog();
                          },
                        },
                      );
                    }}
                    disabled={updateTask.isPending}
                  >
                    Guardar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Duration</TableHead>

              {/* ✅ nuevo */}
              <TableHead>Color</TableHead>
              <TableHead>Color (Plató)</TableHead>
              <TableHead>Plató</TableHead>
              <TableHead>Espacio</TableHead>
              <TableHead>Equipo itinerante</TableHead>
              <TableHead>Depende de</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-8 text-muted-foreground"
                >
                  No templates found. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              templates?.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">
                    {editingId === template.id ? (
                      <Input
                        value={editData?.name ?? ""}
                        onChange={(e) =>
                          setEditData((p) =>
                            p ? { ...p, name: e.target.value } : p,
                          )
                        }
                      />
                    ) : (
                      <button
                        type="button"
                        className="text-left underline-offset-2 hover:underline"
                        onClick={() => openTemplateDialog(template)}
                      >
                        {template.name}
                      </button>
                    )}
                  </TableCell>

                  <TableCell>
                    {bulkEditing ? (
                      <Input
                        type="number"
                        className="h-8 w-28"
                        value={
                          bulkDraft[Number(template.id)]?.defaultDuration ??
                          template.defaultDuration ??
                          30
                        }
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setBulkDraft((p) => ({
                            ...p,
                            [Number(template.id)]: {
                              ...(p[Number(template.id)] ?? {}),
                              id: Number(template.id),
                              name: p[Number(template.id)]?.name ?? template.name ?? "",
                              defaultDuration: Number.isFinite(v) ? v : 30,
                            },
                          }));
                        }}
                      />
                    ) : editingId === template.id ? (
                      <Input
                        type="number"
                        value={editData?.defaultDuration ?? 30}
                        onChange={(e) =>
                          setEditData((p) =>
                            p
                              ? {
                                  ...p,
                                  defaultDuration: Number(e.target.value),
                                }
                              : p,
                          )
                        }
                      />
                    ) : (
                      `${template.defaultDuration} min`
                    )}
                  </TableCell>

                  {/* ✅ Color */}
                  <TableCell>
                    {bulkEditing ? (
                      (() => {
                        const raw =
                          bulkDraft[Number(template.id)]?.uiColor ??
                          (template as any).uiColor ??
                          (template as any).ui_color ??
                          null;

                        const textValue = (raw ?? "") as string;
                        const isHex =
                          typeof textValue === "string" &&
                          /^#([0-9a-fA-F]{6})$/.test(textValue);
                        const pickerValue = isHex ? textValue : "#94a3b8";

                        return (
                          <div className="flex items-center gap-2">
                            <Input
                              type="color"
                              value={pickerValue}
                              onChange={(e) =>
                                setBulkDraft((p) => ({
                                  ...p,
                                  [Number(template.id)]: {
                                    ...(p[Number(template.id)] ?? {}),
                                    id: Number(template.id),
                                    name: p[Number(template.id)]?.name ?? template.name ?? "",
                                    uiColor: e.target.value,
                                  },
                                }))
                              }
                              className="h-8 w-12 p-1"
                            />

                            <Input
                              value={textValue}
                              onChange={(e) =>
                                setBulkDraft((p) => ({
                                  ...p,
                                  [Number(template.id)]: {
                                    ...(p[Number(template.id)] ?? {}),
                                    id: Number(template.id),
                                    name: p[Number(template.id)]?.name ?? template.name ?? "",
                                    uiColor: e.target.value || null,
                                  },
                                }))
                              }
                              placeholder="#RRGGBB"
                              className="h-8 w-28"
                            />
                          </div>
                        );
                      })()
                    ) : editingId === template.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="color"
                          value={(editData?.uiColor ?? "#94a3b8") as string}
                          onChange={(e) =>
                            setEditData((p) =>
                              p ? { ...p, uiColor: e.target.value } : p,
                            )
                          }
                          className="h-8 w-12 p-1"
                        />
                        <Input
                          value={(editData?.uiColor ?? "") as string}
                          onChange={(e) =>
                            setEditData((p) =>
                              p ? { ...p, uiColor: e.target.value || null } : p,
                            )
                          }
                          placeholder="#RRGGBB"
                          className="h-8 w-28"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setEditData((p) =>
                              p ? { ...p, uiColor: null } : p,
                            )
                          }
                        >
                          limpiar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 rounded border"
                          style={{
                            backgroundColor:
                              (template as any).uiColor ??
                              (template as any).ui_color ??
                              "transparent",
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {(template as any).uiColor ?? (template as any).ui_color ?? "—"}
                        </span>
                      </div>
                    )}
                  </TableCell>

                  {/* ✅ Color (Plató) */}
                  <TableCell>
                    {bulkEditing ? (
                      (() => {
                        const raw =
                          bulkDraft[Number(template.id)]?.uiColorSecondary ??
                          (template as any).uiColorSecondary ??
                          (template as any).ui_color_secondary ??
                          null;

                        const textValue = (raw ?? "") as string;
                        const isHex =
                          typeof textValue === "string" &&
                          /^#([0-9a-fA-F]{6})$/.test(textValue);
                        const pickerValue = isHex ? textValue : "#94a3b8";

                        return (
                          <div className="flex items-center gap-2">
                            <Input
                              type="color"
                              value={pickerValue}
                              onChange={(e) =>
                                setBulkDraft((p) => ({
                                  ...p,
                                  [Number(template.id)]: {
                                    ...(p[Number(template.id)] ?? {}),
                                    id: Number(template.id),
                                    name: p[Number(template.id)]?.name ?? template.name ?? "",
                                    uiColorSecondary: e.target.value,
                                  },
                                }))
                              }
                              className="h-8 w-12 p-1"
                            />

                            <Input
                              value={textValue}
                              onChange={(e) =>
                                setBulkDraft((p) => ({
                                  ...p,
                                  [Number(template.id)]: {
                                    ...(p[Number(template.id)] ?? {}),
                                    id: Number(template.id),
                                    name: p[Number(template.id)]?.name ?? template.name ?? "",
                                    uiColorSecondary: e.target.value || null,
                                  },
                                }))
                              }
                              placeholder="#RRGGBB"
                              className="h-8 w-28"
                            />
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 rounded border"
                          style={{
                            backgroundColor:
                              (template as any).uiColorSecondary ??
                              (template as any).ui_color_secondary ??
                              "transparent",
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {(template as any).uiColorSecondary ??
                            (template as any).ui_color_secondary ??
                            "—"}
                        </span>
                      </div>
                    )}
                  </TableCell>

                  {/* ✅ Plató */}
                  <TableCell>
                    {bulkEditing ? (
                      <Select
                        value={
                          bulkDraft[Number(template.id)]?.zoneId === null ||
                          bulkDraft[Number(template.id)]?.zoneId === undefined
                            ? String(
                                (template as any).zoneId ??
                                  (template as any).zone_id ??
                                  "none",
                              )
                            : String(bulkDraft[Number(template.id)]?.zoneId)
                        }
                        onValueChange={(v) => {
                          const nextZoneId = v === "none" ? null : Number(v);
                          setBulkDraft((p) => ({
                            ...p,
                            [Number(template.id)]: {
                              ...(p[Number(template.id)] ?? {}),
                              id: Number(template.id),
                              name: p[Number(template.id)]?.name ?? template.name ?? "",
                              zoneId: nextZoneId,
                              spaceId: null, // si cambias plató, resetea espacio
                            },
                          }));
                        }}
                      >
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue placeholder="Sin plató" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin plató</SelectItem>
                          {allZones.map((z: any) => (
                            <SelectItem key={z.id} value={String(z.id)}>
                              {z.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm">
                        {(() => {
                          const zid = Number(
                            (template as any).zoneId ?? (template as any).zone_id,
                          );
                          if (!Number.isFinite(zid)) return "—";
                          return zonesById.get(zid)?.name ?? `#${zid}`;
                        })()}
                      </span>
                    )}
                  </TableCell>

                  {/* ✅ Espacio */}
                  <TableCell>
                    {bulkEditing ? (
                      <Select
                        value={
                          bulkDraft[Number(template.id)]?.spaceId === null ||
                          bulkDraft[Number(template.id)]?.spaceId === undefined
                            ? String(
                                (template as any).spaceId ??
                                  (template as any).space_id ??
                                  "none",
                              )
                            : String(bulkDraft[Number(template.id)]?.spaceId)
                        }
                        onValueChange={(v) => {
                          const nextSpaceId = v === "none" ? null : Number(v);
                          setBulkDraft((p) => ({
                            ...p,
                            [Number(template.id)]: {
                              ...(p[Number(template.id)] ?? {}),
                              id: Number(template.id),
                              name: p[Number(template.id)]?.name ?? template.name ?? "",
                              spaceId: nextSpaceId,
                            },
                          }));
                        }}
                      >
                        <SelectTrigger className="h-8 w-44">
                          <SelectValue placeholder="Sin espacio" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin espacio</SelectItem>
                          {(() => {
                            const zid =
                              bulkDraft[Number(template.id)]?.zoneId ??
                              (template as any).zoneId ??
                              (template as any).zone_id ??
                              null;

                            if (zid === null || zid === undefined)
                              return (
                                <div className="p-2 text-sm text-muted-foreground">
                                  Selecciona un plató
                                </div>
                              );

                            const list = spacesByZone.get(Number(zid)) ?? [];
                            return list.map((s: any) => (
                              <SelectItem key={s.id} value={String(s.id)}>
                                {s.name}
                              </SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm">
                        {(() => {
                          const sid = Number(
                            (template as any).spaceId ?? (template as any).space_id,
                          );
                          if (!Number.isFinite(sid)) return "—";
                          return (
                            (allSpaces ?? []).find(
                              (s: any) => Number(s.id) === sid,
                            )?.name ?? `#${sid}`
                          );
                        })()}
                      </span>
                    )}
                  </TableCell>
                  {templateDialogDraft ? (
                    <>
                      {/* ✅ Depende de (multi) */}
                      <div className="space-y-2">
                        <Label>Depende de</Label>

                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={!!templateDialogDraft?.hasDependency}
                            onCheckedChange={(v) => {
                              const checked = v === true;
                              setTemplateDialogDraft((p: any) => ({
                                ...(p ?? {}),
                                hasDependency: checked,
                                dependsOnTemplateIds: checked
                                  ? (p?.dependsOnTemplateIds ?? [])
                                  : [],
                              }));
                            }}
                          />
                          <span className="text-sm">Tiene dependencias</span>
                        </div>

                        {templateDialogDraft?.hasDependency ? (
                          <div className="border rounded-md p-2 max-h-40 overflow-auto space-y-1">
                            {(templates ?? []).map((tt: any) => {
                              const id = Number(tt.id);
                              if (id === Number(templateDialogDraft?.id))
                                return null;

                              const checked = (
                                templateDialogDraft?.dependsOnTemplateIds ?? []
                              ).includes(id);

                              return (
                                <label
                                  key={tt.id}
                                  className="flex items-center gap-2 text-sm cursor-pointer"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) => {
                                      const next = v === true;
                                      setTemplateDialogDraft((p: any) => {
                                        const current =
                                          p?.dependsOnTemplateIds ?? [];
                                        const updated = next
                                          ? Array.from(
                                              new Set([...current, id]),
                                            )
                                          : current.filter(
                                              (x: number) => x !== id,
                                            );

                                        return {
                                          ...(p ?? {}),
                                          dependsOnTemplateIds: updated,
                                        };
                                      });
                                    }}
                                  />
                                  <span>{tt.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">—</div>
                        )}
                      </div>

                      {/* ✅ Recursos requeridos (pantalla completa) */}
                      <div className="space-y-3">
                        <Label>Recursos</Label>

                        {resourceTypesQ.isLoading ? (
                          <div className="flex items-center justify-center h-24">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        ) : resourceTypesQ.error ? (
                          <div className="p-3 border rounded text-sm">
                            <div className="font-medium">
                              Error cargando tipos de recurso
                            </div>
                            <div className="text-muted-foreground mt-1">
                              {(resourceTypesQ.error as any)?.message ||
                                "Error desconocido"}
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* 1) Genéricos por tipo */}
                            <div className="border rounded-lg p-3 bg-muted/20">
                              <div className="font-medium mb-1">
                                Genérico por tipo
                              </div>
                              <div className="text-xs text-muted-foreground mb-3">
                                Ej: “1 cámara” (sin fijar unidad concreta).
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                {((resourceTypesQ.data as any[]) ?? []).map(
                                  (t: any) => {
                                    const typeId = Number(t?.id);
                                    const typeName = String(t?.name ?? "");
                                    if (!Number.isFinite(typeId) || !typeName)
                                      return null;

                                    const qty = Number(
                                      reqByTypeDraft?.[typeId] ?? 0,
                                    );

                                    return (
                                      <div
                                        key={typeId}
                                        className="flex items-center justify-between gap-2 border rounded px-2 py-1"
                                      >
                                        <div className="text-sm">
                                          {typeName}
                                        </div>
                                        <Input
                                          className="w-24"
                                          type="number"
                                          min={0}
                                          max={99}
                                          value={qty}
                                          onChange={(e) => {
                                            const next = Number(
                                              e.target.value ?? 0,
                                            );
                                            setReqByTypeDraft((prev: any) => ({
                                              ...(prev ?? {}),
                                              [typeId]:
                                                Number.isFinite(next) &&
                                                next >= 0
                                                  ? next
                                                  : 0,
                                            }));
                                          }}
                                        />
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            </div>

                            {/* 2) Específico por unidad */}
                            <div className="border rounded-lg p-3">
                              <div className="font-medium mb-1">
                                Específico por unidad
                              </div>
                              <div className="text-xs text-muted-foreground mb-3">
                                Ej: “CAM 2” (unidad concreta).
                              </div>

                              <div className="space-y-3 max-h-[35vh] overflow-auto pr-1">
                                {((resourceTypesQ.data as any[]) ?? []).map(
                                  (t: any) => {
                                    const items = (t?.items ?? []) as any[];
                                    const activeItems = items.filter(
                                      (i) => i?.isActive !== false,
                                    );
                                    if (activeItems.length === 0) return null;

                                    return (
                                      <div
                                        key={template.id}
                                        className="border rounded-md p-2"
                                      >
                                        <div className="text-sm font-medium mb-2">
                                          {String(t?.name ?? "Tipo")}
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                          {[...activeItems]
                                            .sort((a: any, b: any) =>
                                              String(
                                                a?.name ?? "",
                                              ).localeCompare(
                                                String(b?.name ?? ""),
                                              ),
                                            )
                                            .map((it: any) => {
                                              const itemId = Number(it?.id);
                                              const itemName = String(
                                                it?.name ?? "",
                                              );
                                              if (
                                                !Number.isFinite(itemId) ||
                                                !itemName
                                              )
                                                return null;

                                              const qty = Number(
                                                reqByItemDraft?.[itemId] ?? 0,
                                              );

                                              return (
                                                <div
                                                  key={itemId}
                                                  className="flex items-center justify-between gap-2 border rounded px-2 py-1"
                                                >
                                                  <div className="text-sm truncate">
                                                    {itemName}
                                                  </div>
                                                  <Input
                                                    className="w-24"
                                                    type="number"
                                                    min={0}
                                                    max={99}
                                                    value={qty}
                                                    onChange={(e) => {
                                                      const next = Number(
                                                        e.target.value ?? 0,
                                                      );
                                                      setReqByItemDraft(
                                                        (prev: any) => ({
                                                          ...(prev ?? {}),
                                                          [itemId]:
                                                            Number.isFinite(
                                                              next,
                                                            ) && next >= 0
                                                              ? next
                                                              : 0,
                                                        }),
                                                      );
                                                    }}
                                                  />
                                                </div>
                                              );
                                            })}
                                        </div>
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            </div>

                            {/* 3) Alternativas (anyOf) */}
                            <div className="border rounded-lg p-3">
                              <div className="font-medium mb-1">
                                Alternativas (1 de varios)
                              </div>
                              <div className="text-xs text-muted-foreground mb-3">
                                Ej: “Reality single” = 1 de [Reality 1, Reality
                                2].
                              </div>

                              <div className="flex items-center gap-2 mb-3">
                                <div className="text-sm">Cantidad</div>
                                <Input
                                  className="w-24"
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={reqAnyOfQty ?? 1}
                                  onChange={(e) => {
                                    const next = Number(e.target.value ?? 1);
                                    setReqAnyOfQty(
                                      Number.isFinite(next) && next > 0
                                        ? next
                                        : 1,
                                    );
                                  }}
                                />
                                <div className="text-xs text-muted-foreground">
                                  Seleccionados:{" "}
                                  {(reqAnyOfItemIds ?? []).length}
                                </div>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setReqAnyOfPickerOpen((v: any) => !v)
                                  }
                                >
                                  {reqAnyOfPickerOpen
                                    ? "Ocultar"
                                    : "Elegir items"}
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setReqAnyOfItemIds([]);
                                    setReqAnyOfQty(1);
                                  }}
                                >
                                  Limpiar
                                </Button>
                              </div>

                              {reqAnyOfPickerOpen ? (
                                <div className="space-y-3 max-h-[30vh] overflow-auto pr-1">
                                  {((resourceTypesQ.data as any[]) ?? []).map(
                                    (t: any) => {
                                      const items = (t?.items ?? []) as any[];
                                      const activeItems = items.filter(
                                        (i) => i?.isActive !== false,
                                      );
                                      if (activeItems.length === 0) return null;

                                      return (
                                        <div
                                          key={template.id}
                                          className="border rounded-md p-2"
                                        >
                                          <div className="text-sm font-medium mb-2">
                                            {String(t?.name ?? "Tipo")}
                                          </div>

                                          <div className="grid grid-cols-2 gap-2">
                                            {[...activeItems]
                                              .sort((a: any, b: any) =>
                                                String(
                                                  a?.name ?? "",
                                                ).localeCompare(
                                                  String(b?.name ?? ""),
                                                ),
                                              )
                                              .map((it: any) => {
                                                const itemId = Number(it?.id);
                                                const checked = (
                                                  reqAnyOfItemIds ?? []
                                                ).includes(itemId);

                                                return (
                                                  <label
                                                    key={itemId}
                                                    className="flex items-center gap-2 text-sm"
                                                  >
                                                    <Checkbox
                                                      checked={checked}
                                                      onCheckedChange={(v) => {
                                                        const nextChecked =
                                                          Boolean(v);
                                                        setReqAnyOfItemIds(
                                                          (prev: any) => {
                                                            const set = new Set(
                                                              prev ?? [],
                                                            );
                                                            if (nextChecked)
                                                              set.add(itemId);
                                                            else
                                                              set.delete(
                                                                itemId,
                                                              );
                                                            return Array.from(
                                                              set,
                                                            );
                                                          },
                                                        );
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
                                    },
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  ) : null}
                  {/* ✅ Equipo itinerante requerido */}
                  <TableCell>
                    {bulkEditing ? (
                      <div className="flex flex-col gap-2">
                        <Select
                          value={String(
                            bulkDraft[Number(template.id)]?.itinerantTeamRequirement ??
                              (template as any).itinerantTeamRequirement ??
                              (template as any).itinerant_team_requirement ??
                              "none",
                          )}
                          onValueChange={(v) => {
                            setBulkDraft((p) => ({
                              ...p,
                              [Number(template.id)]: {
                                ...(p[Number(template.id)] ?? {}),
                                id: Number(template.id),
                                name: p[Number(template.id)]?.name ?? template.name ?? "",
                                itinerantTeamRequirement: v,
                                itinerantTeamId:
                                  v === "specific"
                                    ? (p[Number(template.id)]?.itinerantTeamId ??
                                      (template as any).itinerantTeamId ??
                                      (template as any).itinerant_team_id ??
                                      null)
                                    : null,
                              },
                            }));
                          }}
                        >
                          <SelectTrigger className="h-8 w-44">
                            <SelectValue placeholder="Selecciona..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No necesita</SelectItem>
                            <SelectItem value="any">
                              Cualquiera (motor decide)
                            </SelectItem>
                            <SelectItem value="specific">Específico</SelectItem>
                          </SelectContent>
                        </Select>

                        {(bulkDraft[Number(template.id)]?.itinerantTeamRequirement ??
                          (template as any).itinerantTeamRequirement ??
                          (template as any).itinerant_team_requirement ??
                          "none") === "specific" ? (
                          <Select
                            value={String(
                              bulkDraft[Number(template.id)]?.itinerantTeamId ??
                                (template as any).itinerantTeamId ??
                                (template as any).itinerant_team_id ??
                                "none",
                            )}
                            onValueChange={(v) => {
                              const nextId = v === "none" ? null : Number(v);
                              setBulkDraft((p) => ({
                                ...p,
                                [Number(template.id)]: {
                                  ...(p[Number(template.id)] ?? {}),
                                  id: Number(template.id),
                                  name: p[Number(template.id)]?.name ?? template.name ?? "",
                                  itinerantTeamId: nextId,
                                },
                              }));
                            }}
                          >
                            <SelectTrigger className="h-8 w-44">
                              <SelectValue placeholder="Equipo..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                Selecciona equipo
                              </SelectItem>
                              {(itinerantTeams as any[])
                                .filter(
                                  (x: any) =>
                                    !!(x?.isActive ?? x?.is_active ?? true),
                                )
                                .slice()
                                .sort((a: any, b: any) => {
                                  const ao = Number(
                                    a?.orderIndex ?? a?.order_index ?? 0,
                                  );
                                  const bo = Number(
                                    b?.orderIndex ?? b?.order_index ?? 0,
                                  );
                                  return ao - bo;
                                })
                                .map((team: any) => (
                                  <SelectItem
                                    key={String(team.id)}
                                    value={String(team.id)}
                                  >
                                    {team.name ??
                                      team.code ??
                                      `Equipo #${team.id}`}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-sm">
                        {(() => {
                          const req =
                            (template as any).itinerantTeamRequirement ??
                            (template as any).itinerant_team_requirement ??
                            "none";
                          const id =
                            (template as any).itinerantTeamId ??
                            (template as any).itinerant_team_id ??
                            null;

                          if (req === "any") return "Cualquiera (motor decide)";
                          if (req === "specific") {
                            const tid = Number(id);
                            const name =
                              (itinerantTeams as any[]).find(
                                (x: any) => Number(x.id) === tid,
                              )?.name ?? `#${tid}`;
                            return `Específico: ${name}`;
                          }
                          return "—";
                        })()}
                      </span>
                    )}
                  </TableCell>
                  {/* ✅ Dependencias (compacto en bulk) */}
                  <TableCell>
                    {bulkEditing ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8">
                            {(() => {
                              const deps =
                                bulkDraft[Number(template.id)]?.dependsOnTemplateIds ??
                                (template as any).dependsOnTemplateIds ??
                                (template as any).depends_on_template_ids ??
                                [];

                              const ids = Array.isArray(deps)
                                ? deps
                                    .map((x: any) => Number(x))
                                    .filter((x) => Number.isFinite(x))
                                : [];
                              if (ids.length === 0) return "—";

                              const nameOf = (id: number) =>
                                (templates ?? []).find(
                                  (x: any) => Number(x.id) === Number(id),
                                )?.name ?? `#${id}`;

                              if (ids.length === 1) return nameOf(ids[0]);
                              if (ids.length === 2)
                                return `${nameOf(ids[0])}, ${nameOf(ids[1])}`;

                              return `+${ids.length} deps`;
                            })()}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Dependencias — {template.name}</DialogTitle>
                          </DialogHeader>

                          <div className="flex items-center gap-2 pb-2">
                            <Checkbox
                              checked={Boolean(
                                bulkDraft[Number(template.id)]?.hasDependency ??
                                  (template as any).hasDependency ??
                                  (template as any).has_dependency ??
                                  false,
                              )}
                              onCheckedChange={(v) => {
                                const checked = v === true;
                                setBulkDraft((p) => {
                                  const current = p[Number(template.id)] ?? {};
                                  const existingDeps =
                                    current.dependsOnTemplateIds ??
                                    (template as any).dependsOnTemplateIds ??
                                    (template as any).depends_on_template_ids ??
                                    [];
                                  const deps = checked
                                    ? Array.isArray(existingDeps)
                                      ? existingDeps
                                      : []
                                    : [];
                                  return {
                                    ...p,
                                    [Number(template.id)]: {
                                      ...current,
                                      id: Number(template.id),
                                      name: current.name ?? template.name ?? "",
                                      hasDependency: checked,
                                      dependsOnTemplateIds: deps,
                                    },
                                  };
                                });
                              }}
                            />
                            <span className="text-sm">Tiene dependencias</span>
                          </div>

                          <div className="border rounded-md p-2 max-h-72 overflow-auto space-y-1">
                            {(templates ?? []).map((tt: any) => {
                              const depId = Number(tt.id);
                              const selfId = Number(template.id);

                              const draft = bulkDraft[Number(template.id)] ?? {};
                              const enabled = Boolean(
                                draft.hasDependency ??
                                  (template as any).hasDependency ??
                                  (template as any).has_dependency ??
                                  false,
                              );
                              const deps = (draft.dependsOnTemplateIds ??
                                (template as any).dependsOnTemplateIds ??
                                (template as any).depends_on_template_ids ??
                                []) as number[];

                              const checked = Array.isArray(deps)
                                ? deps.includes(depId)
                                : false;

                              return (
                                <label
                                  key={tt.id}
                                  className={`flex items-center gap-2 text-sm ${!enabled ? "opacity-50" : ""}`}
                                >
                                  <Checkbox
                                    disabled={!enabled || depId === selfId}
                                    checked={checked}
                                    onCheckedChange={(v) => {
                                      const next = v === true;
                                      setBulkDraft((p) => {
                                        const current = p[Number(template.id)] ?? {};
                                        const curDeps =
                                          (current.dependsOnTemplateIds ??
                                            (template as any).dependsOnTemplateIds ??
                                            (template as any)
                                              .depends_on_template_ids ??
                                            []) as number[];

                                        const base = Array.isArray(curDeps)
                                          ? curDeps
                                          : [];
                                        const updated = next
                                          ? Array.from(
                                              new Set([...base, depId]),
                                            )
                                          : base.filter((x) => x !== depId);

                                        return {
                                          ...p,
                                          [Number(template.id)]: {
                                            ...current,
                                            id: Number(template.id),
                                            name: current.name ?? template.name ?? "",
                                            hasDependency: Boolean(
                                              current.hasDependency ??
                                                (template as any).hasDependency ??
                                                (template as any).has_dependency ??
                                                false,
                                            ),
                                            dependsOnTemplateIds: updated,
                                          },
                                        };
                                      });
                                    }}
                                  />
                                  <span>
                                    {tt.name}
                                    {depId === selfId ? " (esta misma)" : ""}
                                  </span>
                                </label>
                              );
                            })}
                          </div>

                          {Boolean(
                            bulkDraft[Number(template.id)]?.hasDependency ??
                              (template as any).hasDependency ??
                              (template as any).has_dependency ??
                              false,
                          ) &&
                            (
                              (bulkDraft[Number(template.id)]?.dependsOnTemplateIds ??
                                (template as any).dependsOnTemplateIds ??
                                (template as any).depends_on_template_ids ??
                                []) as any[]
                            )?.length === 0 && (
                              <p className="text-xs text-red-500 pt-2">
                                Selecciona al menos 1 dependencia.
                              </p>
                            )}
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {(() => {
                          const deps = Array.isArray(
                            (template as any).dependsOnTemplateIds,
                          )
                            ? (template as any).dependsOnTemplateIds
                            : Array.isArray((template as any).depends_on_template_ids)
                              ? (template as any).depends_on_template_ids
                              : [];
                          if (!deps.length) return "—";
                          const names = deps
                            .map(
                              (id: number) =>
                                (templates ?? []).find(
                                  (x: any) => Number(x.id) === Number(id),
                                )?.name ?? `#${id}`,
                            )
                            .join(", ");
                          return names;
                        })()}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-right flex justify-end gap-2">
                    {bulkEditing ? (
                      <span className="text-muted-foreground">—</span>
                    ) : editingId === template.id ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={saveEdit}
                          disabled={updateTask.isPending}
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEdit}
                          disabled={updateTask.isPending}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openReqDialog(template);
                          }}
                          disabled={deleteTask.isPending}
                          title="Requisitos de recursos (genérico/específico/alternativas)"
                        >
                          {t("settings.tabs.resources")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(template)}
                          disabled={deleteTask.isPending}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(template.id)}
                          disabled={deleteTask.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Dialog
          open={reqDialogId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setReqDialogId(null);

              setReqByTypeDraft({});
              setReqByItemDraft({});
              setReqAnyOfQty(1);
              setReqAnyOfItemIds([]);
              setReqAnyOfPickerOpen(false);

              setReqShowAdvanced(false);
              setReqText("");
            }
          }}
        >
          <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Requisitos de recursos (Task Template)</DialogTitle>
              <DialogDescription>
                Formato libre en JSON. Lo conectaremos al motor después. Si lo
                dejas vacío, se guarda como <b>null</b>.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto pr-1">
              {resourceTypesQ.isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : resourceTypesQ.error ? (
                <div className="p-3 border rounded text-sm">
                  <div className="font-medium">
                    Error cargando tipos de recurso
                  </div>
                  <div className="text-muted-foreground mt-1">
                    {(resourceTypesQ.error as any)?.message ||
                      "Error desconocido"}
                  </div>
                </div>
              ) : (
                <>
                  {/* 1) Genéricos por tipo */}
                  <div className="border rounded-lg p-3 bg-muted/20">
                    <div className="font-medium mb-1">Genérico por tipo</div>
                    <div className="text-xs text-muted-foreground mb-3">
                      Ej: “1 cámara” (sin fijar unidad concreta).
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {((resourceTypesQ.data as any[]) ?? []).map((t: any) => {
                        const typeId = Number(t?.id);
                        const typeName = String(t?.name ?? "");
                        if (!Number.isFinite(typeId) || !typeName) return null;

                        const qty = Number(reqByTypeDraft[typeId] ?? 0);

                        return (
                          <div
                            key={typeId}
                            className="flex items-center justify-between gap-2 border rounded px-2 py-1"
                          >
                            <div className="text-sm">{typeName}</div>
                            <Input
                              className="w-24"
                              type="number"
                              min={0}
                              max={99}
                              value={qty}
                              onChange={(e) => {
                                const next = Number(e.target.value ?? 0);
                                setReqByTypeDraft((prev) => ({
                                  ...prev,
                                  [typeId]:
                                    Number.isFinite(next) && next >= 0
                                      ? next
                                      : 0,
                                }));
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2) Específico por item */}
                  <div className="border rounded-lg p-3">
                    <div className="font-medium mb-1">
                      Específico por unidad
                    </div>
                    <div className="text-xs text-muted-foreground mb-3">
                      Ej: “CAM 2” (unidad concreta).
                    </div>

                    <div className="space-y-3 max-h-[35vh] overflow-auto pr-1">
                      {((resourceTypesQ.data as any[]) ?? []).map((t: any) => {
                        const items = (t?.items ?? []) as any[];
                        const activeItems = items.filter(
                          (i) => i?.isActive !== false,
                        );
                        if (activeItems.length === 0) return null;

                        return (
                          <div key={t.id} className="border rounded-md p-2">
                            <div className="text-sm font-medium mb-2">
                              {String(t?.name ?? "Tipo")}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              {[...activeItems]
                                .sort((a: any, b: any) =>
                                  String(a?.name ?? "").localeCompare(
                                    String(b?.name ?? ""),
                                  ),
                                )
                                .map((it: any) => {
                                  const itemId = Number(it?.id);
                                  const checked =
                                    Number(reqByItemDraft[itemId] ?? 0) > 0;

                                  return (
                                    <label
                                      key={itemId}
                                      className="flex items-center gap-2 text-sm"
                                    >
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={(v) => {
                                          const nextChecked = Boolean(v);
                                          setReqByItemDraft((prev) => {
                                            const copy = { ...(prev ?? {}) };
                                            if (nextChecked) copy[itemId] = 1;
                                            else delete copy[itemId];
                                            return copy;
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
                  </div>

                  {/* 3) Alternativas (anyOf) */}
                  <div className="border rounded-lg p-3">
                    <div className="font-medium mb-1">
                      Alternativas (1 de varios)
                    </div>
                    <div className="text-xs text-muted-foreground mb-3">
                      Ej: “Reality single” = 1 de [Reality 1, Reality 2]. (De
                      momento soportamos 1 grupo anyOf).
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <div className="text-sm">Cantidad</div>
                      <Input
                        className="w-24"
                        type="number"
                        min={1}
                        max={99}
                        value={reqAnyOfQty}
                        onChange={(e) => {
                          const next = Number(e.target.value ?? 1);
                          setReqAnyOfQty(
                            Number.isFinite(next) && next > 0 ? next : 1,
                          );
                        }}
                      />
                      <div className="text-xs text-muted-foreground">
                        Seleccionados: {reqAnyOfItemIds.length}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReqAnyOfPickerOpen((v) => !v)}
                      >
                        {reqAnyOfPickerOpen ? "Ocultar" : "Elegir items"}
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReqAnyOfItemIds([]);
                          setReqAnyOfQty(1);
                        }}
                      >
                        Limpiar
                      </Button>
                    </div>

                    {reqAnyOfPickerOpen && (
                      <div className="space-y-3 max-h-[30vh] overflow-auto pr-1">
                        {((resourceTypesQ.data as any[]) ?? []).map(
                          (t: any) => {
                            const items = (t?.items ?? []) as any[];
                            const activeItems = items.filter(
                              (i) => i?.isActive !== false,
                            );
                            if (activeItems.length === 0) return null;

                            return (
                              <div key={t.id} className="border rounded-md p-2">
                                <div className="text-sm font-medium mb-2">
                                  {String(t?.name ?? "Tipo")}
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  {[...activeItems]
                                    .sort((a: any, b: any) =>
                                      String(a?.name ?? "").localeCompare(
                                        String(b?.name ?? ""),
                                      ),
                                    )
                                    .map((it: any) => {
                                      const itemId = Number(it?.id);
                                      const checked =
                                        reqAnyOfItemIds.includes(itemId);

                                      return (
                                        <label
                                          key={itemId}
                                          className="flex items-center gap-2 text-sm"
                                        >
                                          <Checkbox
                                            checked={checked}
                                            onCheckedChange={(v) => {
                                              const nextChecked = Boolean(v);
                                              setReqAnyOfItemIds((prev) => {
                                                const set = new Set(prev ?? []);
                                                if (nextChecked)
                                                  set.add(itemId);
                                                else set.delete(itemId);
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
                          },
                        )}
                      </div>
                    )}
                  </div>

                  {/* Modo avanzado (opcional) */}
                  <div className="border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">Modo avanzado (JSON)</div>
                        <div className="text-xs text-muted-foreground">
                          No es necesario para el uso normal. Solo si quieres
                          editar a mano.
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const built = buildRRFromDrafts();
                          setReqText(
                            built ? JSON.stringify(built, null, 2) : "",
                          );
                          setReqShowAdvanced((v) => !v);
                        }}
                      >
                        {reqShowAdvanced ? "Ocultar" : "Mostrar"}
                      </Button>
                    </div>

                    {reqShowAdvanced && (
                      <div className="mt-3 space-y-2">
                        <Label>resourceRequirements (JSON)</Label>
                        <textarea
                          className="w-full min-h-[180px] rounded-md border bg-background p-3 font-mono text-xs"
                          value={reqText}
                          onChange={(e) => setReqText(e.target.value)}
                          placeholder={`Ejemplo:
            {
            "byType": [{ "resourceTypeId": 1, "quantity": 1 }],
            "byItem": [{ "resourceItemId": 12, "quantity": 1 }],
            "anyOf": [{ "quantity": 1, "resourceItemIds": [21, 22] }]
            }`}
                        />
                        <div className="text-xs text-muted-foreground">
                          Si editas aquí, al guardar se validará el JSON.
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                disabled={reqSaving}
                onClick={() => {
                  setReqDialogId(null);

                  setReqByTypeDraft({});
                  setReqByItemDraft({});
                  setReqAnyOfQty(1);
                  setReqAnyOfItemIds([]);
                  setReqAnyOfPickerOpen(false);

                  setReqShowAdvanced(false);
                  setReqText("");
                }}
              >
                Cerrar
              </Button>

              <Button
                disabled={reqSaving || reqDialogId === null}
                onClick={async () => {
                  if (reqDialogId === null) return;

                  const trimmed = (reqText ?? "").trim();
                  let parsed: any = null;

                  // Por defecto: construimos desde el editor visual
                  if (!reqShowAdvanced) {
                    parsed = buildRRFromDrafts();
                  } else {
                    // Modo avanzado: validar JSON
                    const trimmed = (reqText ?? "").trim();
                    if (trimmed.length > 0) {
                      try {
                        parsed = JSON.parse(trimmed);
                      } catch (e: any) {
                        toast({
                          title: "JSON inválido",
                          description: "Revisa comas, llaves y comillas.",
                          variant: "destructive",
                        });
                        return;
                      }
                    } else {
                      parsed = null;
                    }
                  }

                  try {
                    setReqSaving(true);

                    await apiRequest(
                      "PATCH",
                      buildUrl(api.taskTemplates.update.path, {
                        id: reqDialogId,
                      }),
                      { resourceRequirements: parsed },
                    );

                    toast({
                      title: "Guardado",
                      description: "Requisitos actualizados.",
                    });
                    qc.invalidateQueries({
                      queryKey: [api.taskTemplates.list.path],
                    });

                    setReqDialogId(null);
                    setReqText("");
                  } catch (e: any) {
                    toast({
                      title: "No se pudo guardar",
                      description: e?.message ?? "Revisa conexión/permisos",
                      variant: "destructive",
                    });
                  } finally {
                    setReqSaving(false);
                  }
                }}
              >
                Guardar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
