import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { api, buildUrl } from "@shared/routes";
import { apiRequest } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useUserRole } from "@/hooks/use-user-role";
import { Badge } from "@/components/ui/badge";
import { effectivePlanningResourceIds } from "@/lib/planning-view-policy";
import { useQuery } from "@tanstack/react-query";

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

export function PlanResourcesTab({
  planId,
  onChanged,
  onOpenAgenda,
}: {
  planId: number;
  onChanged?: () => void;
  onOpenAgenda?: (resourceId: number) => void;
}) {
  const { role } = useUserRole();
  const canEdit = role === "admin" || role === "production";
  const { data: catalogTypes = [] } = useQuery<
    Array<{ id: number; name: string; code: string }>
  >({
    queryKey: ["/api/resource-types"],
    queryFn: () => apiRequest("GET", "/api/resource-types"),
  });
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();
  const confirmDialog = useConfirm();
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
      onChanged?.();
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
        <Button disabled={!canEdit} onClick={initIfEmpty}>
          Inicializar recursos del plan
        </Button>
      </div>
    );
  }

  const types = Array.from(
    new Map([
      ...catalogTypes.map((type) => [type.id, type] as const),
      ...rows.map((r) => [r.typeId, r.type] as const),
    ]).values(),
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
    <div className="space-y-4" data-testid="day-resources">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Recursos del día</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Inventario nominal, asignaciones y necesidades por tipo. Los
            recursos creados aquí pertenecen sólo a esta jornada.
          </p>
        </div>
        <Badge variant="secondary">
          {rows.length} recursos ·{" "}
          {rows.filter((row) => row.isAvailable).length} disponibles
        </Badge>
      </div>
      {!canEdit ? (
        <p className="text-sm text-muted-foreground">
          Consulta de recursos. Producción y Administración pueden modificar las
          asignaciones.
        </p>
      ) : null}
      {/* Añadir recurso adhoc */}
      <Card className="border-border">
        <CardHeader className="py-3">
          <CardTitle className="text-base">
            Añadir recurso solo para este plan
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select
                disabled={!canEdit || creating}
                value={addTypeId}
                onValueChange={setAddTypeId}
              >
                <SelectTrigger aria-label="Tipo de recurso del día">
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
                disabled={!canEdit || creating}
                aria-label="Nombre del recurso del día"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Ej: Cámara extra / Micro 4 / Coach invitado…"
              />
            </div>
          </div>

          <Button
            disabled={!canEdit || creating || !addName.trim() || !addTypeId}
            onClick={async () => {
              if (!canEdit || creating) return;
              const typeId = Number(addTypeId);
              const name = addName.trim();
              if (!Number.isFinite(typeId) || !name) return;

              setCreating(true);
              try {
                await apiRequest(
                  "POST",
                  buildUrl(api.plans.resourceItems.create.path, { id: planId }),
                  { typeId, name },
                );
                setAddName("");
                await load();
                onChanged?.();
              } catch (e: any) {
                alert(friendlyError(e) || "No se pudo añadir");
              } finally {
                setCreating(false);
              }
            }}
          >
            Añadir
          </Button>
        </CardContent>
      </Card>

      {/* Recursos por plató (override dentro del plan) */}
      <Card className="border-border">
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
                            disabled={!canEdit || (zoneAssignLoading)}
                            onClick={() => setZoneResourcesZoneId(zid)}
                          >
                            Recursos
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canEdit || (zoneTypeLoading)}
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
                                  <div className="mt-2 flex flex-wrap gap-1 text-xs">
                                    <span>Directos del espacio:</span>
                                    {(spaceAssignments[sid] ?? []).map((id) => (
                                      <Badge key={id} variant="outline">
                                        {rows.find((row) => row.id === id)
                                          ?.name ?? "Recurso sin nombre"}
                                      </Badge>
                                    ))}
                                    <span>Heredados del plató:</span>
                                    {effectivePlanningResourceIds(
                                      { spaceId: sid, zoneId: s.zoneId },
                                      new Map(
                                        (spaces as any[]).map((space) => [
                                          Number(space.id),
                                          { zoneId: space.zoneId },
                                        ]),
                                      ),
                                      spaceAssignments,
                                      zoneAssignments,
                                    )
                                      .filter(
                                        (id) =>
                                          !(
                                            spaceAssignments[sid] ?? []
                                          ).includes(id),
                                      )
                                      .map((id) => (
                                        <Badge key={id} variant="secondary">
                                          {rows.find((row) => row.id === id)
                                            ?.name ?? "Recurso sin nombre"}
                                        </Badge>
                                      ))}
                                    <span>
                                      Efectivos:{" "}
                                      {
                                        effectivePlanningResourceIds(
                                          { spaceId: sid, zoneId: s.zoneId },
                                          new Map(
                                            (spaces as any[]).map((space) => [
                                              Number(space.id),
                                              { zoneId: space.zoneId },
                                            ]),
                                          ),
                                          spaceAssignments,
                                          zoneAssignments,
                                        ).length
                                      }
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!canEdit || (spaceAssignLoading)}
                                    onClick={() =>
                                      setSpaceResourcesSpaceId(sid)
                                    }
                                  >
                                    Recursos
                                  </Button>

                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!canEdit || (spaceTypeLoading)}
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
                            <Checkbox disabled={!canEdit}
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
              disabled={!canEdit || (zoneResourcesSaving)}
              onClick={() => {
                setZoneResourcesZoneId(null);
                setZoneResourcesDraftPriIds([]);
              }}
            >
              Cancelar
            </Button>

            <Button
              disabled={!canEdit || (zoneResourcesZoneId === null || zoneResourcesSaving)}
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
                  onChanged?.();

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

                  <Input disabled={!canEdit}
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
              disabled={!canEdit || (zoneTypeSaving)}
              onClick={() => {
                setZoneTypeZoneId(null);
                setZoneTypeDraft({});
              }}
            >
              Cancelar
            </Button>

            <Button
              disabled={!canEdit || (zoneTypeZoneId === null || zoneTypeSaving)}
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
                  onChanged?.();

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
                            <Checkbox disabled={!canEdit}
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
              disabled={!canEdit || (spaceResourcesSaving)}
              onClick={() => {
                setSpaceResourcesSpaceId(null);
                setSpaceResourcesDraftPriIds([]);
              }}
            >
              Cancelar
            </Button>

            <Button
              disabled={!canEdit || (spaceResourcesSpaceId === null || spaceResourcesSaving)}
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
                  onChanged?.();

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

                  <Input disabled={!canEdit}
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
              disabled={!canEdit || (spaceTypeSaving)}
              onClick={() => {
                setSpaceTypeSpaceId(null);
                setSpaceTypeDraft({});
              }}
            >
              Cancelar
            </Button>

            <Button
              disabled={!canEdit || (spaceTypeSpaceId === null || spaceTypeSaving)}
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
                  onChanged?.();

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
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
                >
                  <Badge variant="outline">
                    {r.source === "adhoc"
                      ? "Creado para el día"
                      : "Heredado del catálogo"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onOpenAgenda?.(r.id)}
                  >
                    Ver agenda
                  </Button>
                  <Checkbox disabled={!canEdit}
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
                        onChanged?.();
                      }
                    }}
                  />

                  {r.source === "adhoc" ? (
                    <Input disabled={!canEdit}
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
                          onChanged?.();
                        } catch (err: any) {
                          alert(friendlyError(err) || "No se pudo renombrar");
                          await load();
                          onChanged?.();
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
                    <button disabled={!canEdit}
                      className="text-sm text-red-600 hover:underline ml-auto"
                      onClick={async () => {
                        const ok = await confirmDialog({
                          title: "Eliminar recurso",
                          description: "¿Eliminar este recurso adhoc del plan?",
                          confirmText: "Eliminar",
                        });
                        if (!ok) return;

                        try {
                          await apiRequest(
                            "DELETE",
                            buildUrl(api.plans.resourceItems.delete.path, {
                              id: planId,
                              itemId: r.id,
                            }),
                          );
                          await load();
                          onChanged?.();
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
