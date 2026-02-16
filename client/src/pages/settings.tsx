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
                <SelectItem value="production">
                  {t("common.production")}
                </SelectItem>
                <SelectItem value="editorial">
                  {t("common.editorial")}
                </SelectItem>
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
                <TableHead className="text-right">
                  {t("common.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const isEditing = editingId === Number(p?.id);
                const roleLabel =
                  p?.roleType === "editorial"
                    ? t("common.editorial")
                    : t("common.production");

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
                            <SelectItem value="editorial">
                              {t("common.editorial")}
                            </SelectItem>
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
        description:
          err?.message || t("settings.itinerantTeams.createErrorToast"),
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
          <div className="text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : error ? (
          <div className="text-sm text-red-600">
            {t("settings.itinerantTeams.loadError")}
          </div>
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
                {t("settings.tabs.resources")} específicos (ancla unidades
                concretas al plató):
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
                {t("settings.tabs.resources")} específicos (ancla unidades
                concretas al espacio):
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
  const { data: zones = [] } = useZones();
  const { data: spaces = [] } = useSpaces();
  const { data: itinerantTeams = [] } = useItinerantTeams();
  const createTask = useCreateTaskTemplate();
  const updateTask = useUpdateTaskTemplate();
  const deleteTask = useDeleteTaskTemplate();
  const { toast } = useToast();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState<any>({
    name: "",
    defaultDuration: 30,
    defaultCameras: 0,
    zoneId: null,
    spaceId: null,
    uiColor: "#94a3b8",
    uiColorSecondary: null,
    hasDependency: false,
    dependsOnTemplateIds: [],
    itinerantTeamRequirement: "none",
    itinerantTeamId: null,
  });

  const [editData, setEditData] = useState<any | null>(null);

  const spacesByZone = new Map<number, any[]>();
  (spaces as any[]).forEach((s: any) => {
    const zid = Number(s.zoneId ?? s.zone_id);
    if (!Number.isFinite(zid)) return;
    spacesByZone.set(zid, [...(spacesByZone.get(zid) ?? []), s]);
  });

  const zoneById = new Map<number, any>();
  (zones as any[]).forEach((z: any) => {
    const zid = Number(z?.id);
    if (!Number.isFinite(zid) || zid <= 0) return;
    zoneById.set(zid, z);
  });

  const spaceById = new Map<number, any>();
  (spaces as any[]).forEach((s: any) => {
    const sid = Number(s?.id);
    if (!Number.isFinite(sid) || sid <= 0) return;
    spaceById.set(sid, s);
  });

  const getTemplateDependencyIds = (rawTemplate: any): number[] => {
    const parsed = Array.isArray(rawTemplate?.dependsOnTemplateIds)
      ? rawTemplate.dependsOnTemplateIds
      : Array.isArray(rawTemplate?.depends_on_template_ids)
        ? rawTemplate.depends_on_template_ids
        : rawTemplate?.depends_on_template_ids != null
          ? (() => {
              if (typeof rawTemplate.depends_on_template_ids === "string") {
                try {
                  return JSON.parse(rawTemplate.depends_on_template_ids);
                } catch {
                  return [];
                }
              }
              return rawTemplate.depends_on_template_ids;
            })()
          : [];

    const normalized = Array.isArray(parsed)
      ? parsed
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isFinite(value) && value > 0)
      : [];

    if (normalized.length > 0) return normalized;

    const fallback = Number(
      rawTemplate?.dependsOnTemplateId ?? rawTemplate?.depends_on_template_id,
    );
    return Number.isFinite(fallback) && fallback > 0 ? [fallback] : [];
  };

  const dependentsByTemplateId = new Map<number, any[]>();
  (templates ?? []).forEach((rawTemplate: any) => {
    const rawTemplateId = Number(rawTemplate?.id);
    if (!Number.isFinite(rawTemplateId) || rawTemplateId <= 0) return;
    getTemplateDependencyIds(rawTemplate).forEach((dependencyId) => {
      const bucket = dependentsByTemplateId.get(dependencyId) ?? [];
      bucket.push(rawTemplate);
      dependentsByTemplateId.set(dependencyId, bucket);
    });
  });

  const hexToRgba = (hex: string, alpha: number): string => {
    const a = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0;
    const v = String(hex ?? "").trim();
    if (!v) return `rgba(148, 163, 184, ${a})`;
    const s = v.match(/^#([\da-fA-F]{3})$/);
    if (s) {
      const [r, g, b] = s[1].split("").map((x) => parseInt(x + x, 16));
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    const f = v.match(/^#([\da-fA-F]{6})$/);
    if (f) {
      const raw = f[1];
      return `rgba(${parseInt(raw.slice(0, 2), 16)}, ${parseInt(raw.slice(2, 4), 16)}, ${parseInt(raw.slice(4, 6), 16)}, ${a})`;
    }
    return `rgba(148, 163, 184, ${a})`;
  };

  const normalizeColorToHex = (value: unknown): string | null => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;

    const shortHex = raw.match(/^#([\da-fA-F]{3})$/);
    if (shortHex) {
      return `#${shortHex[1]
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
        .toUpperCase()}`;
    }

    const fullHex = raw.match(/^#([\da-fA-F]{6})$/);
    if (fullHex) {
      return `#${fullHex[1].toUpperCase()}`;
    }

    const rgb = raw.match(
      /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i,
    );
    if (!rgb) return null;

    const channels = rgb.slice(1, 4).map((channel) => Number(channel));
    if (
      channels.some(
        (channel) => !Number.isFinite(channel) || channel < 0 || channel > 255,
      )
    ) {
      return null;
    }

    return `#${channels.map((channel) => channel.toString(16).padStart(2, "0").toUpperCase()).join("")}`;
  };

  const getColorPickerValue = (value: unknown): string =>
    normalizeColorToHex(value) ?? "#94A3B8";

  const startEdit = (tpl: any) => {
    setEditingId(Number(tpl.id));
    setEditData({
      id: Number(tpl.id),
      name: String(tpl.name ?? ""),
      defaultDuration: Number(
        tpl.defaultDuration ?? tpl.default_duration ?? 30,
      ),
      defaultCameras: Number(tpl.defaultCameras ?? tpl.default_cameras ?? 0),
      zoneId: tpl.zoneId ?? tpl.zone_id ?? null,
      spaceId: tpl.spaceId ?? tpl.space_id ?? null,
      uiColorInput: String(tpl.uiColor ?? tpl.ui_color ?? ""),
      uiColor: normalizeColorToHex(tpl.uiColor ?? tpl.ui_color ?? null),
      uiColorError: null,
      uiColorSecondaryInput: String(
        tpl.uiColorSecondary ?? tpl.ui_color_secondary ?? "",
      ),
      uiColorSecondary: tpl.uiColorSecondary ?? tpl.ui_color_secondary ?? null,
      uiColorSecondaryError: null,
      requiresAuxiliar: Boolean(
        tpl.requiresAuxiliar ?? tpl.requires_auxiliar ?? false,
      ),
      requiresCoach: Boolean(tpl.requiresCoach ?? tpl.requires_coach ?? false),
      requiresPresenter: Boolean(
        tpl.requiresPresenter ?? tpl.requires_presenter ?? false,
      ),
      exclusiveAuxiliar: Boolean(
        tpl.exclusiveAuxiliar ?? tpl.exclusive_auxiliar ?? false,
      ),
      hasDependency: Boolean(tpl.hasDependency ?? tpl.has_dependency ?? false),
      dependsOnTemplateIds: Array.isArray(tpl.dependsOnTemplateIds)
        ? tpl.dependsOnTemplateIds
        : Array.isArray(tpl.depends_on_template_ids)
          ? tpl.depends_on_template_ids
          : [],
      itinerantTeamRequirement:
        tpl.itinerantTeamRequirement ??
        tpl.itinerant_team_requirement ??
        "none",
      itinerantTeamId: tpl.itinerantTeamId ?? tpl.itinerant_team_id ?? null,
      requiresItinerantTeam:
        String(
          tpl.itinerantTeamRequirement ?? tpl.itinerant_team_requirement ?? "none",
        ) !== "none",
      allowedItinerantTeamIds: (() => {
        const rawRules = tpl.rulesJson ?? tpl.rules_json;
        const fromRules = Array.isArray(rawRules?.itinerantTeamAllowedIds)
          ? rawRules.itinerantTeamAllowedIds
              .map((id: unknown) => Number(id))
              .filter((id: number) => Number.isFinite(id) && id > 0)
          : [];
        if (fromRules.length > 0) return fromRules;

        const currentRequirement = String(
          tpl.itinerantTeamRequirement ?? tpl.itinerant_team_requirement ?? "none",
        );
        const currentSpecificId = Number(
          tpl.itinerantTeamId ?? tpl.itinerant_team_id ?? NaN,
        );
        if (currentRequirement === "specific" && Number.isFinite(currentSpecificId)) {
          return [currentSpecificId];
        }
        if (currentRequirement === "any") {
          return (itinerantTeams as any[])
            .map((team: any) => Number(team?.id))
            .filter((id: number) => Number.isFinite(id) && id > 0);
        }
        return [];
      })(),
      rulesJsonData: tpl.rulesJson ?? tpl.rules_json ?? null,
      resourceRequirementsData:
        tpl.resourceRequirements ?? tpl.resource_requirements ?? null,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData(null);
  };

  const validateDraft = (d: any) => {
    if (!String(d?.name ?? "").trim()) return "Name is required";
    if (
      Boolean(d?.hasDependency) &&
      (d?.dependsOnTemplateIds?.length ?? 0) === 0
    )
      return "Selecciona al menos 1 dependencia.";
    if ((d?.dependsOnTemplateIds ?? []).includes(Number(d?.id)))
      return "Auto-dependencia detectada";
    return null;
  };

  const saveEdit = () => {
    if (!editData || editingId == null) return;
    const err = validateDraft(editData);
    if (err) return toast({ title: err, variant: "destructive" });

    const rawColorInput = String(editData.uiColorInput ?? "").trim();
    const rawSecondaryColorInput = String(
      editData.uiColorSecondaryInput ?? "",
    ).trim();
    const normalizedUiColor = normalizeColorToHex(rawColorInput);
    const normalizedSecondaryColor = normalizeColorToHex(rawSecondaryColorInput);
    if (rawColorInput && !normalizedUiColor) {
      return toast({
        title: "Color inválido",
        description: "Usa HEX (#RRGGBB o #RGB) o rgb(r,g,b).",
        variant: "destructive",
      });
    }
    if (rawSecondaryColorInput && !normalizedSecondaryColor) {
      return toast({
        title: "Color inválido",
        description: "Usa HEX (#RRGGBB o #RGB) o rgb(r,g,b).",
        variant: "destructive",
      });
    }

    const normalizedAllowedTeamIds = Boolean(editData.requiresItinerantTeam)
      ? Array.from(
          new Set(
            (editData.allowedItinerantTeamIds ?? [])
              .map((id: unknown) => Number(id))
              .filter((id: number) => Number.isFinite(id) && id > 0),
          ),
        )
      : [];

    const itinerantTeamRequirement =
      normalizedAllowedTeamIds.length === 0
        ? "none"
        : normalizedAllowedTeamIds.length === 1
          ? "specific"
          : "any";
    const itinerantTeamId =
      normalizedAllowedTeamIds.length === 1 ? normalizedAllowedTeamIds[0] : null;

    if (normalizedAllowedTeamIds.length > 1) {
      toast({
        title: "Restricción parcial en espera",
        description:
          "El motor aún no restringe por subconjunto; se guardará para futura compatibilidad.",
      });
    }

    const previousRules =
      editData.rulesJsonData && typeof editData.rulesJsonData === "object"
        ? editData.rulesJsonData
        : {};

    updateTask.mutate(
      {
        id: editingId,
        patch: {
          name: String(editData.name ?? "").trim(),
          defaultDuration: Number(editData.defaultDuration ?? 30),
          defaultCameras: Number(editData.defaultCameras ?? 0),
          zoneId: editData.zoneId ?? null,
          spaceId: editData.spaceId ?? null,
          uiColor: normalizedUiColor,
          uiColorSecondary: normalizedSecondaryColor,
          requiresAuxiliar: Boolean(editData.requiresAuxiliar),
          requiresCoach: Boolean(editData.requiresCoach),
          requiresPresenter: Boolean(editData.requiresPresenter),
          exclusiveAuxiliar: Boolean(editData.exclusiveAuxiliar),
          hasDependency: Boolean(editData.hasDependency),
          dependsOnTemplateIds: editData.hasDependency
            ? (editData.dependsOnTemplateIds ?? [])
            : [],
          dependsOnTemplateId: editData.hasDependency
            ? (editData.dependsOnTemplateIds?.[0] ?? null)
            : null,
          itinerantTeamRequirement,
          itinerantTeamId,
          rulesJson: {
            ...previousRules,
            itinerantTeamAllowedIds: normalizedAllowedTeamIds,
          },
          resourceRequirements: editData.resourceRequirementsData ?? null,
        },
      } as any,
      { onSuccess: cancelEdit },
    );
  };

  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    deleteTask.mutate(id);
  };

  if (isLoading)
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Global Task Templates</CardTitle>
        <div className="flex gap-2">
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Create
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Template</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="Name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((p: any) => ({ ...p, name: e.target.value }))
                  }
                />
                <Input
                  type="number"
                  value={formData.defaultDuration}
                  onChange={(e) =>
                    setFormData((p: any) => ({
                      ...p,
                      defaultDuration: Number(e.target.value),
                    }))
                  }
                />
                <Button
                  onClick={() =>
                    createTask.mutate(formData as any, {
                      onSuccess: () => setIsAddOpen(false),
                    })
                  }
                >
                  Guardar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {(templates ?? []).map((tpl: any) => {
          const isEditing = editingId === Number(tpl.id) && !!editData;
          const curr = isEditing ? editData : tpl;
          const tplZoneId = Number(curr?.zoneId ?? curr?.zone_id ?? NaN);
          const tplSpaceId = Number(curr?.spaceId ?? curr?.space_id ?? NaN);
          const zone = Number.isFinite(tplZoneId) ? zoneById.get(tplZoneId) : null;
          const space = Number.isFinite(tplSpaceId)
            ? spaceById.get(tplSpaceId)
            : null;
          const zoneName = String(zone?.name ?? "").trim() || "Sin asignar";
          const spaceName = String(space?.name ?? "").trim() || "—";
          const zoneColor =
            String(zone?.uiColor ?? zone?.ui_color ?? "").trim() || "#e2e8f0";
          const durationMin = Number(
            curr?.defaultDuration ?? curr?.default_duration ?? NaN,
          );
          const primary =
            String(curr?.uiColor ?? curr?.ui_color ?? "").trim() || "#94a3b8";
          const secondary = String(
            curr?.uiColorSecondary ?? curr?.ui_color_secondary ?? "",
          ).trim();
          const dependents = dependentsByTemplateId.get(Number(tpl?.id)) ?? [];
          return (
            <Card key={tpl.id}>
              <CardHeader className="py-2 px-3 sm:px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 flex items-stretch gap-2">
                    <div
                      className="w-1.5 rounded-sm"
                      style={{ backgroundColor: primary }}
                      aria-hidden="true"
                    />
                    <div
                      className="w-1.5 rounded-sm"
                      style={{ backgroundColor: zoneColor }}
                      aria-hidden="true"
                    />
                    <div
                      className="flex-1 rounded-md px-2.5 py-1.5"
                      style={{
                        backgroundColor: secondary
                          ? hexToRgba(secondary, 0.18)
                          : "transparent",
                      }}
                    >
                      {isEditing ? (
                        <Input
                          value={editData?.name ?? ""}
                          onChange={(e) =>
                            setEditData((p: any) =>
                              p ? { ...p, name: e.target.value } : p,
                            )
                          }
                        />
                      ) : (
                        <div className="space-y-0.5">
                          <p className="font-medium truncate leading-5">
                            {tpl.name ?? `#${tpl.id}`}
                          </p>
                          <p className="text-xs text-muted-foreground leading-4">
                            Duración: {Number.isFinite(durationMin) ? durationMin : "—"} min · Plató: {zoneName} · Espacio: {spaceName}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {isEditing ? (
                      <>
                        <Button size="sm" onClick={saveEdit}>
                          Guardar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(tpl)}
                      >
                        Editar
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDelete(Number(tpl.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {isEditing && (
                <CardContent className="space-y-4">
                  <section className="space-y-3">
                    <p className="text-sm font-medium">Básico</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label>Duración (min)</Label>
                        <Input
                          type="number"
                          value={editData?.defaultDuration ?? 30}
                          onChange={(e) =>
                            setEditData((p: any) => ({
                              ...p,
                              defaultDuration: Number(e.target.value),
                            }))
                          }
                          placeholder="30"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Plató</Label>
                        <Select
                          value={String(editData?.zoneId ?? "none")}
                          onValueChange={(v) =>
                            setEditData((p: any) => ({
                              ...p,
                              zoneId: v === "none" ? null : Number(v),
                              spaceId: null,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sin plató" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin plató</SelectItem>
                            {(zones as any[]).map((z: any) => (
                              <SelectItem key={z.id} value={String(z.id)}>
                                {z?.name ?? `Plató #${z?.id ?? "—"}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Espacio</Label>
                        <Select
                          value={String(editData?.spaceId ?? "none")}
                          onValueChange={(v) =>
                            setEditData((p: any) => ({
                              ...p,
                              spaceId: v === "none" ? null : Number(v),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sin espacio" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin espacio</SelectItem>
                            {(
                              spacesByZone.get(
                                Number(editData?.zoneId ?? -1),
                              ) ?? []
                            ).map((s: any) => (
                              <SelectItem key={s.id} value={String(s.id)}>
                                {s?.name ?? `Espacio #${s?.id ?? "—"}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-3">
                    <p className="text-sm font-medium">Recursos</p>
                    <div className="grid grid-cols-2 md:grid-cols-2 gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <Checkbox
                          checked={!!editData?.requiresCoach}
                          onCheckedChange={(v) =>
                            setEditData((p: any) => ({
                              ...p,
                              requiresCoach: Boolean(v),
                            }))
                          }
                        />
                        Coach
                      </label>
                      <label className="flex items-center gap-2">
                        <Checkbox
                          checked={!!editData?.requiresPresenter}
                          onCheckedChange={(v) =>
                            setEditData((p: any) => ({
                              ...p,
                              requiresPresenter: Boolean(v),
                            }))
                          }
                        />
                        Presenter
                      </label>
                    </div>
                    <div className="space-y-2 text-sm">
                      <label className="flex items-center gap-2">
                        <Checkbox
                          checked={!!editData?.requiresItinerantTeam}
                          onCheckedChange={(v) =>
                            setEditData((p: any) => ({
                              ...p,
                              requiresItinerantTeam: Boolean(v),
                              allowedItinerantTeamIds: Boolean(v)
                                ? (p?.allowedItinerantTeamIds ?? [])
                                : [],
                            }))
                          }
                        />
                        Requiere equipo itinerante
                      </label>
                      {!!editData?.requiresItinerantTeam && (
                        <div className="space-y-2 rounded-md border p-3">
                          <p className="text-xs text-muted-foreground">
                            Selecciona 1 para fijar equipo específico; selecciona varios para permitir alternativas.
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {(itinerantTeams as any[]).map((team: any) => {
                              const teamId = Number(team?.id);
                              const checked = (
                                editData?.allowedItinerantTeamIds ?? []
                              ).includes(teamId);
                              return (
                                <label
                                  key={team?.id}
                                  className="flex items-center gap-2"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) =>
                                      setEditData((p: any) => {
                                        const set = new Set<number>(
                                          (p?.allowedItinerantTeamIds ?? []).map((id: unknown) => Number(id)),
                                        );
                                        if (v === true) set.add(teamId);
                                        else set.delete(teamId);
                                        return {
                                          ...p,
                                          allowedItinerantTeamIds: Array.from(set).filter(
                                            (id: number) => Number.isFinite(id) && id > 0,
                                          ),
                                        };
                                      })
                                    }
                                  />
                                  {team?.name ?? team?.code ?? `Equipo #${team?.id ?? "—"}`}
                                </label>
                              );
                            })}
                          </div>
                          {(editData?.allowedItinerantTeamIds?.length ?? 0) === 0 && (
                            <p className="text-xs text-amber-600">
                              Selecciona al menos uno o desactiva este requisito.
                            </p>
                          )}
                          {(editData?.allowedItinerantTeamIds?.length ?? 0) > 1 && (
                            <p className="text-xs text-amber-600">
                              El motor aún no restringe por subconjunto; guardaremos esta selección para futura compatibilidad.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <p className="text-sm font-medium">Dependencias</p>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={!!editData?.hasDependency}
                        onCheckedChange={(v) =>
                          setEditData((p: any) => ({
                            ...p,
                            hasDependency: Boolean(v),
                            dependsOnTemplateIds: Boolean(v)
                              ? (p?.dependsOnTemplateIds ?? [])
                              : [],
                          }))
                        }
                      />
                      Esta plantilla depende de otras
                    </label>
                    {!!editData?.hasDependency && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {(templates ?? [])
                          .filter(
                            (x: any) => Number(x?.id) !== Number(editData?.id),
                          )
                          .map((x: any, idx: number) => {
                            const checked = (
                              editData?.dependsOnTemplateIds ?? []
                            ).includes(Number(x?.id));
                            return (
                              <label
                                className="flex items-center gap-2 text-sm"
                                key={x?.id ?? `dep-${idx}`}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) =>
                                    setEditData((p: any) => {
                                      const set = new Set(
                                        p?.dependsOnTemplateIds ?? [],
                                      );
                                      if (v === true) set.add(Number(x?.id));
                                      else set.delete(Number(x?.id));
                                      return {
                                        ...p,
                                        dependsOnTemplateIds: Array.from(set),
                                      };
                                    })
                                  }
                                />
                                {x?.name ?? `Template #${x?.id ?? "—"}`}
                              </label>
                            );
                          })}
                      </div>
                    )}

                    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                      <p className="text-sm font-medium">Dependen de esta plantilla</p>
                      {dependents.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Ninguna plantilla depende de esta.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {dependents.map((dependent: any) => {
                            const dependentId = Number(dependent?.id);
                            const dependentName =
                              String(dependent?.name ?? "").trim() ||
                              `Template #${dependentId || "—"}`;
                            return (
                              <div
                                key={`dependent-${dependentId}`}
                                className="flex items-center justify-between gap-2 rounded border border-border/50 bg-background px-2 py-1.5"
                              >
                                <span className="text-sm truncate">{dependentName}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  onClick={() => startEdit(dependent)}
                                >
                                  Abrir
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <p className="text-sm font-medium">Color</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Color de tarea</Label>
                        <div className="grid grid-cols-[auto,1fr] gap-2 items-end">
                          <Input
                            type="color"
                            value={getColorPickerValue(editData?.uiColorInput)}
                            onChange={(e) =>
                              setEditData((p: any) => ({
                                ...p,
                                uiColor: e.target.value,
                                uiColorInput: e.target.value,
                                uiColorError: null,
                              }))
                            }
                            className="h-10 w-16 p-1"
                          />
                          <Input
                            value={String(editData?.uiColorInput ?? "")}
                            onChange={(e) =>
                              setEditData((p: any) => {
                                const raw = e.target.value;
                                const normalized = normalizeColorToHex(raw);
                                return {
                                  ...p,
                                  uiColorInput: raw,
                                  uiColor: normalized,
                                  uiColorError:
                                    raw.trim() && !normalized
                                      ? "Color inválido"
                                      : null,
                                };
                              })
                            }
                            placeholder="Sin color · #RRGGBB o rgb(r,g,b)"
                          />
                        </div>
                        {editData?.uiColorError && (
                          <p className="text-xs text-destructive">{editData.uiColorError}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Color de plató</Label>
                        <div className="grid grid-cols-[auto,1fr] gap-2 items-end">
                          <Input
                            type="color"
                            value={getColorPickerValue(editData?.uiColorSecondaryInput)}
                            onChange={(e) =>
                              setEditData((p: any) => ({
                                ...p,
                                uiColorSecondary: e.target.value,
                                uiColorSecondaryInput: e.target.value,
                                uiColorSecondaryError: null,
                              }))
                            }
                            className="h-10 w-16 p-1"
                          />
                          <Input
                            value={String(editData?.uiColorSecondaryInput ?? "")}
                            onChange={(e) =>
                              setEditData((p: any) => {
                                const raw = e.target.value;
                                const normalized = normalizeColorToHex(raw);
                                return {
                                  ...p,
                                  uiColorSecondaryInput: raw,
                                  uiColorSecondary: normalized,
                                  uiColorSecondaryError:
                                    raw.trim() && !normalized
                                      ? "Color inválido"
                                      : null,
                                };
                              })
                            }
                            placeholder="Sin color · #RRGGBB o rgb(r,g,b)"
                          />
                        </div>
                        {editData?.uiColorSecondaryError && (
                          <p className="text-xs text-destructive">
                            {editData.uiColorSecondaryError}
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                </CardContent>
              )}
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
}
