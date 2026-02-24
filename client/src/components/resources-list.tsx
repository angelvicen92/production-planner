import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateResourceItem, CreateResourceType, ResourceTypeLite } from "@/components/create-resource-pool";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronsDown, ChevronsUp, Plus, Trash2 } from "lucide-react";
import { ResourceItemComponentsDialog } from "@/components/resource-item-components-dialog";
import { api, buildUrl } from "@shared/routes";
import { apiRequest } from "@/lib/api";
import { useTaskTemplates } from "@/hooks/use-tasks";
import { useSpaces, useZones } from "@/hooks/use-spaces";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ResourceItem = {
  id: number;
  name: string;
  isActive: boolean;
};

type ResourceType = {
  id: number;
  code: string;
  name: string;
  items: ResourceItem[];
};

export function ResourcesList() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [types, setTypes] = useState<ResourceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftNames, setDraftNames] = useState<Record<number, string>>({});
  const [showCreateType, setShowCreateType] = useState(false);
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [expandedTypeIds, setExpandedTypeIds] = useState<Record<number, boolean>>({});
  const [componentsOpen, setComponentsOpen] = useState(false);
  const [componentsParent, setComponentsParent] = useState<{ id: number; name: string } | null>(null);

  // -----------------------------
  // Vocal Coach Rules (GLOBAL)
  // -----------------------------
  type VocalCoachRuleDraft = {
    id?: number;
    vocalCoachResourceItemId: number;
    taskTemplateId: number;
    defaultSpaceId: number | null;
    sortOrder: number;
    isRequired: boolean;
  };

  const { data: templates = [], isLoading: templatesLoading } = useTaskTemplates();
  const { data: zones = [], isLoading: zonesLoading } = useZones();
  const { data: spaces = [], isLoading: spacesLoading } = useSpaces();

  const zonesById = useMemo(() => {
    const m = new Map<number, any>();
    for (const z of (zones as any[]) ?? []) m.set(Number(z.id), z);
    return m;
  }, [zones]);

  const [coachRules, setCoachRules] = useState<VocalCoachRuleDraft[]>([]);
  const [coachRulesLoading, setCoachRulesLoading] = useState(false);
  const [coachRulesError, setCoachRulesError] = useState<string | null>(null);
  const [coachRulesSaving, setCoachRulesSaving] = useState(false);

  async function loadCoachRules() {
    try {
      setCoachRulesLoading(true);
      setCoachRulesError(null);

      const json = await apiRequest<any[]>("GET", api.vocalCoachRules.list.path);

      const next: VocalCoachRuleDraft[] = (json ?? [])
        .map((r: any) => ({
          id: Number(r?.id),
          vocalCoachResourceItemId: Number(r?.vocalCoachResourceItemId),
          taskTemplateId: Number(r?.taskTemplateId),
          defaultSpaceId:
            r?.defaultSpaceId === null || r?.defaultSpaceId === undefined
              ? null
              : Number(r?.defaultSpaceId),
          sortOrder: Number(r?.sortOrder ?? 0),
          isRequired: r?.isRequired !== false,
        }))
        .filter(
          (r) =>
            Number.isFinite(r.vocalCoachResourceItemId) &&
            r.vocalCoachResourceItemId > 0 &&
            Number.isFinite(r.taskTemplateId) &&
            r.taskTemplateId > 0,
        );

      setCoachRules(next);
    } catch (e: any) {
      setCoachRulesError(e?.message || "Error cargando reglas de vocal coach");
    } finally {
      setCoachRulesLoading(false);
    }
  }

  async function saveCoachRules() {
    try {
      setCoachRulesSaving(true);
      setCoachRulesError(null);

      const clean = coachRules
        .map((r) => ({
          vocalCoachResourceItemId: Number(r.vocalCoachResourceItemId),
          taskTemplateId: Number(r.taskTemplateId),
          defaultSpaceId:
            r.defaultSpaceId === null || r.defaultSpaceId === undefined
              ? null
              : Number(r.defaultSpaceId),
          sortOrder: Number.isFinite(Number(r.sortOrder)) ? Number(r.sortOrder) : 0,
          isRequired: r.isRequired !== false,
        }))
        .filter(
          (r) =>
            Number.isFinite(r.vocalCoachResourceItemId) &&
            r.vocalCoachResourceItemId > 0 &&
            Number.isFinite(r.taskTemplateId) &&
            r.taskTemplateId > 0,
        );

      await apiRequest("PUT", api.vocalCoachRules.saveAll.path, { rules: clean });
      await loadCoachRules();
    } catch (e: any) {
      setCoachRulesError(e?.message || "No se pudieron guardar las reglas");
    } finally {
      setCoachRulesSaving(false);
    }
  }

  useEffect(() => {
    loadCoachRules();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const json = await apiRequest<ResourceType[]>("GET", "/api/resource-types-with-items");
      setTypes(json ?? []);
    } catch (e: any) {
      setError(e?.message || "Error cargando recursos");
    } finally {
      setLoading(false);
    }
  }

  async function saveItemName(itemId: number, newName: string) {
    const name = newName.trim();
    if (!name) return;

    try {
      await apiRequest("PATCH", `/api/resource-items/${itemId}`, { name });
    } catch (e: any) {
      alert(e?.message || "Error guardando nombre");
      return;
    }

    setTypes((prev) =>
      prev.map((t) => ({
        ...t,
        items: t.items.map((i) => (i.id === itemId ? { ...i, name } : i)),
      }))
    );

    setDraftNames((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
  }

  async function deleteItem(itemId: number) {
    const ok = await confirm({
      title: "Eliminar unidad",
      description: "¿Eliminar esta unidad? Esta acción no se puede deshacer",
      confirmText: "Eliminar",
    });
    if (!ok) return;

    try {
      await apiRequest("DELETE", `/api/resource-items/${itemId}`);
    } catch (e: any) {
      toast({
        title: "No se pudo eliminar",
        description: e?.message || "Error borrando unidad",
        variant: "destructive",
      });
      return;
    }

    setTypes((prev) =>
      prev.map((t) => ({
        ...t,
        items: t.items.filter((i) => i.id !== itemId),
      }))
    );
    toast({ title: "Eliminado" });
  }



  async function deleteType(typeId: number, typeName: string) {
    const ok = await confirm({
      title: "Eliminar tipo",
      description: `¿Eliminar ${typeName}? Esta acción no se puede deshacer`,
      confirmText: "Eliminar",
    });
    if (!ok) return;

    try {
      await apiRequest("DELETE", `/api/resource-types/${typeId}`);
    } catch (e: any) {
      toast({
        title: "No se pudo eliminar",
        description: e?.message || "Error borrando tipo",
        variant: "destructive",
      });
      return;
    }

    setTypes((prev) => prev.filter((t) => t.id !== typeId));
    toast({ title: "Eliminado" });
  }

  useEffect(() => {
    load();
  }, []);

  const typeOptions: ResourceTypeLite[] = types.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
  }));

  const allItemsFlat = useMemo(() => {
    const out: { id: number; name: string }[] = [];
    for (const t of types) {
      for (const i of t.items ?? []) {
        out.push({ id: i.id, name: i.name });
      }
    }
    return out;
  }, [types]);

  const itemsCountByTypeId = useMemo(() => {
    const map = new Map<number, number>();
    for (const t of types) map.set(t.id, t.items?.length ?? 0);
    return map;
  }, [types]);

  const toggleType = (typeId: number) => {
    setExpandedTypeIds((p) => ({ ...p, [typeId]: !p[typeId] }));
  };

  const expandAllTypes = () => {
    const next: Record<number, boolean> = {};
    for (const t of types) next[t.id] = true;
    setExpandedTypeIds(next);
  };

  const collapseAllTypes = () => {
    const next: Record<number, boolean> = {};
    for (const t of types) next[t.id] = false;
    setExpandedTypeIds(next);
  };

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Recursos</CardTitle>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showCreateType ? "secondary" : "outline"}
            onClick={() => setShowCreateType((v) => !v)}
            title={showCreateType ? "Cerrar" : "Añadir tipo"}
          >
            <Plus className="h-4 w-4 mr-2" />
            {showCreateType ? "Cerrar tipo" : "Añadir tipo"}
          </Button>

          <Button
            size="sm"
            variant={showCreateItem ? "secondary" : "outline"}
            onClick={() => setShowCreateItem((v) => !v)}
            title={showCreateItem ? "Cerrar" : "Añadir unidad"}
          >
            <Plus className="h-4 w-4 mr-2" />
            {showCreateItem ? "Cerrar unidad" : "Añadir unidad"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={types.length === 0}
            onClick={expandAllTypes}
            title="Expandir todos"
          >
            <ChevronsDown className="h-4 w-4 mr-2" />
            Expandir
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={types.length === 0}
            onClick={collapseAllTypes}
            title="Contraer todos"
          >
            <ChevronsUp className="h-4 w-4 mr-2" />
            Contraer
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && (
          <p className="text-sm text-muted-foreground">Cargando recursos…</p>
        )}

        {!loading && error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {!loading && !error && (
          <>
            {(showCreateType || showCreateItem) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {showCreateType ? (
                  <CreateResourceType
                    onCreated={() => {
                      load();
                      setShowCreateType(false);
                    }}
                  />
                ) : (
                  <div />
                )}

                {showCreateItem ? (
                  <CreateResourceItem
                    types={typeOptions}
                    onCreated={() => {
                      load();
                      setShowCreateItem(false);
                    }}
                  />
                ) : (
                  <div />
                )}
              </div>
            )}

            {types.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay tipos ni unidades configuradas.
              </p>
            )}

            <div className="space-y-3">
              {types.map((t) => {
                const open = !!expandedTypeIds[t.id];
                const count = itemsCountByTypeId.get(t.id) ?? 0;

                return (
                  <Card key={t.id}>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          className="flex items-center gap-3 text-left"
                          onClick={() => toggleType(t.id)}
                          title={open ? "Contraer" : "Expandir"}
                        >
                          <div className="font-semibold">{t.name}</div>
                          <div className="text-sm text-muted-foreground">{count}</div>
                        </button>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setExpandedTypeIds((p) => ({ ...p, [t.id]: true }))}
                            title="Expandir"
                          >
                            <ChevronsDown className="h-4 w-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setExpandedTypeIds((p) => ({ ...p, [t.id]: false }))}
                            title="Contraer"
                          >
                            <ChevronsUp className="h-4 w-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            title="Eliminar"
                            onClick={() => deleteType(t.id, t.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    {open && (
                      <CardContent className="pt-0 space-y-2">
                        {t.items.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Sin unidades en este tipo.
                          </p>
                        ) : (
                          t.items.map((i) => {
                            const value = draftNames[i.id] ?? i.name;

                            return (
                              <div key={i.id} className="flex items-center gap-2">
                                <Input
                                  value={value}
                                  onChange={(e) =>
                                    setDraftNames((prev) => ({ ...prev, [i.id]: e.target.value }))
                                  }
                                  onBlur={() => {
                                    const draft = draftNames[i.id];
                                    if (draft !== undefined && draft.trim() !== i.name) {
                                      saveItemName(i.id, draft);
                                    }
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setComponentsParent({ id: i.id, name: i.name });
                                    setComponentsOpen(true);
                                  }}
                                >
                                  Componentes
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title="Eliminar"
                                  onClick={() => deleteItem(i.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
      <ResourceItemComponentsDialog
        open={componentsOpen}
        onOpenChange={(v) => {
          setComponentsOpen(v);
          if (!v) setComponentsParent(null);
        }}
        parentItem={componentsParent}
        allItems={allItemsFlat}
        onSaved={load}
      />
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Vocal Coach → Auto-tareas (GLOBAL)</CardTitle>
          </CardHeader>

          <CardContent className="pt-0 space-y-3">
            <p className="text-sm text-muted-foreground">
              Configuración general del programa. Define qué tareas se crean automáticamente
              según el vocal coach (y en qué espacio por defecto).
            </p>

            {coachRulesError && (
              <p className="text-sm text-red-500">{coachRulesError}</p>
            )}

            {(coachRulesLoading || templatesLoading || zonesLoading || spacesLoading) && (
              <p className="text-sm text-muted-foreground">Cargando datos…</p>
            )}

            {(() => {
              // coaches = resource_items cuyo tipo parezca coach
              const coachTypes = types.filter((t) => {
                const code = String(t.code ?? "").toLowerCase();
                const name = String(t.name ?? "").toLowerCase();
                return code.includes("coach") || name.includes("coach");
              });

              const coaches = coachTypes
                .flatMap((t) => t.items ?? [])
                .map((i) => ({ id: Number(i.id), name: String(i.name ?? "").trim() }))
                .filter((x) => Number.isFinite(x.id) && x.id > 0 && x.name)
                .sort((a, b) => a.name.localeCompare(b.name));

              if (coaches.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground">
                    No se detectan coaches en Recursos. (Tipo debe contener “coach”).
                  </p>
                );
              }

              const templateOptions = (templates as any[])
                .map((t: any) => ({ id: Number(t.id), name: String(t.name ?? "").trim() }))
                .filter((x) => Number.isFinite(x.id) && x.id > 0 && x.name)
                .sort((a, b) => a.name.localeCompare(b.name));

              const spaceOptions = (spaces as any[])
                .map((s: any) => {
                  const sid = Number(s.id);
                  const zid = Number((s as any)?.zoneId ?? (s as any)?.zone_id);
                  const zoneName =
                    zonesById.get(zid)?.name ? String(zonesById.get(zid).name) : `Zona #${zid}`;
                  const sName = String(s?.name ?? "").trim();
                  return { id: sid, label: `${zoneName} · ${sName}` };
                })
                .filter((x) => Number.isFinite(x.id) && x.id > 0 && x.label.trim())
                .sort((a, b) => a.label.localeCompare(b.label));

              return (
                <div className="space-y-3">
                  {coaches.map((c) => {
                    const list = coachRules
                      .filter((r) => Number(r.vocalCoachResourceItemId) === c.id)
                      .slice()
                      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

                    return (
                      <div key={c.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{c.name}</div>
                            <div className="text-xs text-muted-foreground">Reglas: {list.length}</div>
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCoachRules((prev) => [
                                ...prev,
                                {
                                  vocalCoachResourceItemId: c.id,
                                  taskTemplateId: 0,
                                  defaultSpaceId: null,
                                  sortOrder: list.length,
                                  isRequired: true,
                                },
                              ]);
                            }}
                          >
                            Añadir regla
                          </Button>
                        </div>

                        {list.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Sin reglas. Añade “Prueba vocal” y “Ensayo” (o lo que toque).
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {list.map((r, idx) => {
                              const key = `${c.id}-${idx}-${r.taskTemplateId}-${r.defaultSpaceId ?? "none"}`;
                              return (
                                <div key={key} className="grid grid-cols-12 gap-2 items-center">
                                  <div className="col-span-5">
                                    <Label className="text-xs">Task template</Label>
                                    <Select
                                      value={r.taskTemplateId ? String(r.taskTemplateId) : ""}
                                      onValueChange={(v) => {
                                        const tid = Number(v);
                                        setCoachRules((prev) =>
                                          prev.map((x) =>
                                            x === r ? { ...x, taskTemplateId: Number.isFinite(tid) ? tid : 0 } : x,
                                          ),
                                        );
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Selecciona tarea…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {templateOptions.map((t) => (
                                          <SelectItem key={t.id} value={String(t.id)}>
                                            {t.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div className="col-span-5">
                                    <Label className="text-xs">Espacio por defecto</Label>
                                    <Select
                                      value={r.defaultSpaceId ? String(r.defaultSpaceId) : "none"}
                                      onValueChange={(v) => {
                                        const next = v === "none" ? null : Number(v);
                                        setCoachRules((prev) =>
                                          prev.map((x) =>
                                            x === r
                                              ? { ...x, defaultSpaceId: next !== null && Number.isFinite(next) ? next : null }
                                              : x,
                                          ),
                                        );
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="(opcional)" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">(sin espacio)</SelectItem>
                                        {spaceOptions.map((s) => (
                                          <SelectItem key={s.id} value={String(s.id)}>
                                            {s.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div className="col-span-1">
                                    <Label className="text-xs">Orden</Label>
                                    <Input
                                      value={String(r.sortOrder ?? 0)}
                                      onChange={(e) => {
                                        const n = Number(e.target.value);
                                        setCoachRules((prev) =>
                                          prev.map((x) => (x === r ? { ...x, sortOrder: Number.isFinite(n) ? n : 0 } : x)),
                                        );
                                      }}
                                    />
                                  </div>

                                  <div className="col-span-1 flex flex-col gap-1 items-center">
                                    <Label className="text-xs">Oblig.</Label>
                                    <Checkbox
                                      checked={r.isRequired !== false}
                                      onCheckedChange={(checked) => {
                                        setCoachRules((prev) =>
                                          prev.map((x) => (x === r ? { ...x, isRequired: checked !== false } : x)),
                                        );
                                      }}
                                    />
                                  </div>

                                  <div className="col-span-12 flex justify-end">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setCoachRules((prev) => prev.filter((x) => x !== r))}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Quitar
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

                  <div className="flex justify-end pt-2">
                    <Button onClick={saveCoachRules} disabled={coachRulesSaving}>
                      {coachRulesSaving ? "Guardando…" : "Guardar reglas globales"}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
      );
    }
