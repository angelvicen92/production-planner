import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";
import {
  clampAdvancedValue,
  clampBasicLevel,
  mapAdvancedToBasic,
  mapBasicToAdvanced,
  type OptimizerHeuristicKey,
} from "@shared/optimizer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

type HeuristicSetting = { basicLevel: number; advancedValue: number };
type OptimizerHeuristics = Record<OptimizerHeuristicKey, HeuristicSetting>;

type OptimizerSettings = {
  id: number;
  mainZoneId: number | null;
  optimizationMode: "basic" | "advanced";
  heuristics: OptimizerHeuristics;
  prioritizeMainZone: boolean;
  groupBySpaceAndTemplate: boolean;
  mainZonePriorityLevel: number;
  groupingLevel: number;
  contestantCompactLevel: number;
  contestantStayInZoneLevel: number;
  groupingZoneIds: number[];
};

const heuristicKeys: OptimizerHeuristicKey[] = [
  "mainZoneFinishEarly",
  "mainZoneKeepBusy",
  "contestantCompact",
  "groupBySpaceTemplateMatch",
  "groupBySpaceActive",
  "contestantStayInZone",
];

const strongLabelValue = mapBasicToAdvanced(3);

const normalizeHeuristics = (heuristics: OptimizerHeuristics): OptimizerHeuristics => {
  const next = { ...heuristics };
  for (const key of heuristicKeys) {
    const current = heuristics[key];
    const basicLevel = clampBasicLevel(current?.basicLevel ?? 0);
    const advancedValue = clampAdvancedValue(current?.advancedValue ?? mapBasicToAdvanced(basicLevel));
    next[key] = { basicLevel, advancedValue };
  }
  return next;
};

const applyHeuristicUpdates = (
  heuristics: OptimizerHeuristics,
  updates: Partial<Record<OptimizerHeuristicKey, Partial<HeuristicSetting>>>,
): OptimizerHeuristics => {
  const next = { ...heuristics };
  for (const [key, update] of Object.entries(updates) as Array<[OptimizerHeuristicKey, Partial<HeuristicSetting>]>) {
    const current = heuristics[key];
    const basicLevel = clampBasicLevel(update.basicLevel ?? current.basicLevel ?? 0);
    const advancedValue = clampAdvancedValue(update.advancedValue ?? current.advancedValue ?? mapBasicToAdvanced(basicLevel));
    next[key] = { basicLevel, advancedValue };
  }
  return normalizeHeuristics(next);
};

const syncAllToAdvanced = (heuristics: OptimizerHeuristics): OptimizerHeuristics => {
  const next = { ...heuristics };
  for (const key of heuristicKeys) {
    const basicLevel = clampBasicLevel(heuristics[key].basicLevel);
    next[key] = {
      basicLevel,
      advancedValue: mapBasicToAdvanced(basicLevel),
    };
  }
  return next;
};

const syncAllToBasic = (heuristics: OptimizerHeuristics): OptimizerHeuristics => {
  const next = { ...heuristics };
  for (const key of heuristicKeys) {
    const advancedValue = clampAdvancedValue(heuristics[key].advancedValue);
    next[key] = {
      basicLevel: mapAdvancedToBasic(advancedValue),
      advancedValue,
    };
  }
  return next;
};

const createOptimizerSnapshot = (mode: "basic" | "advanced", heuristics: OptimizerHeuristics) =>
  JSON.stringify({ optimizationMode: mode, heuristics });

export function GeneralOptimizerSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const zonesQ = useQuery<any[]>({
    queryKey: [api.zones.list.path],
    queryFn: () => apiRequest("GET", api.zones.list.path),
  });

  const { data, isLoading, error } = useQuery<OptimizerSettings>({
    queryKey: [api.optimizerSettings.get.path],
    queryFn: () => apiRequest("GET", api.optimizerSettings.get.path),
  });

  const [draft, setDraft] = useState<OptimizerSettings | null>(null);
  const [localMode, setLocalMode] = useState<"basic" | "advanced">("basic");
  const [localHeuristics, setLocalHeuristics] = useState<OptimizerHeuristics | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);

  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const latestOptimizerRef = useRef<{ mode: "basic" | "advanced"; heuristics: OptimizerHeuristics } | null>(null);
  const lastSavedSnapshotRef = useRef<string>("");

  useEffect(() => {
    if (!data) return;
    const normalizedHeuristics = normalizeHeuristics(data.heuristics);
    setDraft({ ...data, heuristics: normalizedHeuristics, groupingZoneIds: data.groupingZoneIds ?? [] });
    setLocalMode(data.optimizationMode);
    setLocalHeuristics(normalizedHeuristics);
    latestOptimizerRef.current = { mode: data.optimizationMode, heuristics: normalizedHeuristics };
    lastSavedSnapshotRef.current = createOptimizerSnapshot(data.optimizationMode, normalizedHeuristics);
  }, [data]);

  useEffect(() => {
    if (!localHeuristics) return;
    latestOptimizerRef.current = { mode: localMode, heuristics: localHeuristics };
  }, [localMode, localHeuristics]);

  const patchSettings = async (patch: Partial<OptimizerSettings>) => {
    setIsSaving(true);
    isSavingRef.current = true;
    try {
      await apiRequest("PATCH", api.optimizerSettings.update.path, patch);
      qc.invalidateQueries({ queryKey: [api.optimizerSettings.get.path] });
      toast({ title: "Ajustes de optimización guardados" });
      return true;
    } catch (err: any) {
      toast({
        title: "No se pudieron guardar",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  const saveOptimizer = async (nextMode: "basic" | "advanced", nextHeuristics: OptimizerHeuristics) => {
    const normalizedHeuristics = normalizeHeuristics(nextHeuristics);
    const snapshot = createOptimizerSnapshot(nextMode, normalizedHeuristics);

    if (snapshot === lastSavedSnapshotRef.current) return;

    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      setPendingSave(true);
      return;
    }

    const payload: Partial<OptimizerSettings> = {
      optimizationMode: nextMode,
      heuristics: normalizedHeuristics,
    };

    const success = await patchSettings(payload);
    if (success) lastSavedSnapshotRef.current = snapshot;

    if (pendingSaveRef.current) {
      pendingSaveRef.current = false;
      setPendingSave(false);
      const latest = latestOptimizerRef.current;
      if (latest) {
        await saveOptimizer(latest.mode, latest.heuristics);
      }
    }
  };

  const saveSimpleField = async (patch: Partial<OptimizerSettings>, nextDraft: OptimizerSettings) => {
    if (isSavingRef.current) return;
    setDraft(nextDraft);
    await patchSettings(patch);
  };

  const updateLocalHeuristics = (nextHeuristics: OptimizerHeuristics) => {
    setLocalHeuristics(nextHeuristics);
    setDraft((prev) => (prev ? { ...prev, heuristics: nextHeuristics } : prev));
  };

  const saveWithHeuristics = async (nextHeuristics: OptimizerHeuristics, nextMode = localMode) => {
    updateLocalHeuristics(nextHeuristics);
    await saveOptimizer(nextMode, nextHeuristics);
  };

  const handleModeChange = async (value: string) => {
    if (!localHeuristics || isSavingRef.current) return;

    const nextMode: "basic" | "advanced" = value === "advanced" ? "advanced" : "basic";
    if (nextMode === localMode) return;

    const nextHeuristics = nextMode === "advanced" ? syncAllToAdvanced(localHeuristics) : syncAllToBasic(localHeuristics);

    setLocalMode(nextMode);
    updateLocalHeuristics(nextHeuristics);
    setDraft((prev) => (prev ? { ...prev, optimizationMode: nextMode } : prev));

    await saveOptimizer(nextMode, nextHeuristics);
  };

  const setBasicHeuristic = async (
    updates: Partial<Record<OptimizerHeuristicKey, Partial<HeuristicSetting>>>,
  ) => {
    if (!localHeuristics || isSavingRef.current) return;
    const nextHeuristics = applyHeuristicUpdates(localHeuristics, updates);
    await saveWithHeuristics(nextHeuristics);
  };

  const setAdvancedHeuristicLocal = (
    updates: Partial<Record<OptimizerHeuristicKey, Partial<HeuristicSetting>>>,
  ) => {
    if (!localHeuristics || isSavingRef.current) return;
    const nextHeuristics = applyHeuristicUpdates(localHeuristics, updates);
    updateLocalHeuristics(nextHeuristics);
  };

  const commitAdvancedHeuristic = async (
    updates: Partial<Record<OptimizerHeuristicKey, Partial<HeuristicSetting>>>,
  ) => {
    if (!localHeuristics || isSavingRef.current) return;
    const nextHeuristics = applyHeuristicUpdates(localHeuristics, updates);
    await saveWithHeuristics(nextHeuristics);
  };

  const groupingBasic = useMemo(
    () =>
      Math.max(
        localHeuristics?.groupBySpaceTemplateMatch.basicLevel ?? 0,
        localHeuristics?.groupBySpaceActive.basicLevel ?? 0,
      ),
    [localHeuristics],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !draft || !localHeuristics) {
    return (
      <div className="p-4 border rounded-lg text-sm">
        <div className="font-medium">Error cargando ajustes de optimización</div>
        <div className="text-muted-foreground mt-1">{(error as any)?.message || "Error desconocido"}</div>
      </div>
    );
  }

  const zones = zonesQ.data ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Optimización (global)</CardTitle>
          {(isSaving || pendingSave) && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Guardando…
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Modo</Label>
          <Select value={localMode} onValueChange={handleModeChange} disabled={isSaving}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="basic">Básico</SelectItem>
              <SelectItem value="advanced">Avanzado</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">
            Al cambiar de modo, los valores se convierten automáticamente (0–3 ↔ 0–10).
          </div>
          <div className="text-xs text-muted-foreground">
            Básico: niveles predefinidos. Avanzado: escala 0–10 (0=off, 9≈fuerte, 10=más que fuerte).
          </div>
        </div>

        <div className="space-y-2">
          <Label>Zona principal (plato)</Label>
          <Select
            value={draft.mainZoneId ? String(draft.mainZoneId) : "none"}
            disabled={isSaving}
            onValueChange={async (v) => {
              const mainZoneId = v === "none" ? null : Number(v);
              const nextDraft = { ...draft, mainZoneId };
              await saveSimpleField({ mainZoneId }, nextDraft);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un plató principal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin plató principal</SelectItem>
              {zones.map((z: any) => (
                <SelectItem key={z.id} value={String(z.id)}>
                  {String(z.name ?? `Zona ${z.id}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>


        <div className="space-y-2">
          <Label>Zona principal: terminar cuanto antes</Label>
          <div className="space-y-1">
            <Slider
              min={0}
              max={10}
              step={1}
              disabled={isSaving}
              value={[localMode === "basic" ? mapBasicToAdvanced(localHeuristics.mainZoneFinishEarly.basicLevel) : localHeuristics.mainZoneFinishEarly.advancedValue]}
              onValueChange={(arr) => {
                const advancedValue = clampAdvancedValue(arr?.[0] ?? 0);
                setAdvancedHeuristicLocal({ mainZoneFinishEarly: { advancedValue } });
              }}
              onValueCommit={async (arr) => {
                const advancedValue = clampAdvancedValue(arr?.[0] ?? 0);
                await commitAdvancedHeuristic({ mainZoneFinishEarly: { advancedValue } });
              }}
            />
            <div className="text-xs">Valor: {localMode === "basic" ? mapBasicToAdvanced(localHeuristics.mainZoneFinishEarly.basicLevel) : localHeuristics.mainZoneFinishEarly.advancedValue}</div>
          </div>
        </div>

        <div className="space-y-2">
          <Label title="Modo dirección intenta que el plató principal funcione en bloque continuo; puede retrasar el inicio para evitar huecos.">
            Zona principal: sin tiempos muertos (modo dirección)
          </Label>
          <div className="space-y-1">
            <Slider
              min={0}
              max={10}
              step={1}
              disabled={isSaving}
              value={[localMode === "basic" ? mapBasicToAdvanced(localHeuristics.mainZoneKeepBusy.basicLevel) : localHeuristics.mainZoneKeepBusy.advancedValue]}
              onValueChange={(arr) => {
                const advancedValue = clampAdvancedValue(arr?.[0] ?? 0);
                setAdvancedHeuristicLocal({ mainZoneKeepBusy: { advancedValue } });
              }}
              onValueCommit={async (arr) => {
                const advancedValue = clampAdvancedValue(arr?.[0] ?? 0);
                await commitAdvancedHeuristic({ mainZoneKeepBusy: { advancedValue } });
              }}
            />
            <div className="text-xs">Valor: {localMode === "basic" ? mapBasicToAdvanced(localHeuristics.mainZoneKeepBusy.basicLevel) : localHeuristics.mainZoneKeepBusy.advancedValue}</div>
          </div>
          <div className="text-xs text-muted-foreground">En Básico, Fuerte = {strongLabelValue}.</div>
        </div>

        <div className="space-y-2">
          <Label title="Agrupa tareas iguales consecutivas. No garantiza eliminación de huecos.">Agrupar por actividad (menos cambios)</Label>
          {localMode === "basic" ? (
            <Select
              value={String(groupingBasic)}
              disabled={isSaving}
              onValueChange={async (v) => {
                const basicLevel = clampBasicLevel(Number(v));
                await setBasicHeuristic({
                  groupBySpaceTemplateMatch: { basicLevel },
                  groupBySpaceActive: { basicLevel },
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Apagado</SelectItem>
                <SelectItem value="1">Suave</SelectItem>
                <SelectItem value="2">Medio</SelectItem>
                <SelectItem value="3">Fuerte</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="space-y-1">
              <Slider
                min={0}
                max={10}
                step={1}
                disabled={isSaving}
                value={[localHeuristics.groupBySpaceTemplateMatch.advancedValue]}
                onValueChange={(arr) => {
                  const advancedValue = clampAdvancedValue(arr?.[0] ?? 0);
                  setAdvancedHeuristicLocal({
                    groupBySpaceTemplateMatch: { advancedValue },
                    groupBySpaceActive: { advancedValue },
                  });
                }}
                onValueCommit={async (arr) => {
                  const advancedValue = clampAdvancedValue(arr?.[0] ?? 0);
                  await commitAdvancedHeuristic({
                    groupBySpaceTemplateMatch: { advancedValue },
                    groupBySpaceActive: { advancedValue },
                  });
                }}
              />
              <div className="text-xs">Valor: {localHeuristics.groupBySpaceTemplateMatch.advancedValue}</div>
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <Label>Aplicar “Agrupar por actividad” en zonas</Label>
          {Number(localHeuristics.groupBySpaceTemplateMatch.advancedValue) <= 0 ? (
            <div className="text-xs text-muted-foreground">Sin efecto con 0</div>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {zones.map((z: any) => {
              const zoneId = Number(z.id);
              const checked = draft.groupingZoneIds.includes(zoneId);
              return (
                <label key={zoneId} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    disabled={isSaving || Number(localHeuristics.groupBySpaceTemplateMatch.advancedValue) <= 0}
                    onCheckedChange={async (v) => {
                      const nextZoneIds = v
                        ? Array.from(new Set([...draft.groupingZoneIds, zoneId]))
                        : draft.groupingZoneIds.filter((id) => id !== zoneId);
                      const nextDraft = { ...draft, groupingZoneIds: nextZoneIds };
                      await saveSimpleField({ groupingZoneIds: nextZoneIds }, nextDraft);
                    }}
                  />
                  <span>{String(z.name ?? `Zona ${zoneId}`)}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Compactar concursantes (reducir huecos)</Label>
          {localMode === "basic" ? (
            <Select
              value={String(localHeuristics.contestantCompact.basicLevel)}
              disabled={isSaving}
              onValueChange={async (v) => {
                const basicLevel = clampBasicLevel(Number(v));
                await setBasicHeuristic({ contestantCompact: { basicLevel } });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Apagado</SelectItem>
                <SelectItem value="1">Suave</SelectItem>
                <SelectItem value="2">Medio</SelectItem>
                <SelectItem value="3">Fuerte</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="space-y-1">
              <Slider
                min={0}
                max={10}
                step={1}
                disabled={isSaving}
                value={[localHeuristics.contestantCompact.advancedValue]}
                onValueChange={(arr) => {
                  const advancedValue = clampAdvancedValue(arr?.[0] ?? 0);
                  setAdvancedHeuristicLocal({ contestantCompact: { advancedValue } });
                }}
                onValueCommit={async (arr) => {
                  const advancedValue = clampAdvancedValue(arr?.[0] ?? 0);
                  await commitAdvancedHeuristic({ contestantCompact: { advancedValue } });
                }}
              />
              <div className="text-xs">Valor: {localHeuristics.contestantCompact.advancedValue}</div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Mantener concursante en el mismo plató</Label>
          {localMode === "basic" ? (
            <Select
              value={String(localHeuristics.contestantStayInZone.basicLevel)}
              disabled={isSaving}
              onValueChange={async (v) => {
                const basicLevel = clampBasicLevel(Number(v));
                await setBasicHeuristic({ contestantStayInZone: { basicLevel } });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Apagado</SelectItem>
                <SelectItem value="1">Suave</SelectItem>
                <SelectItem value="2">Medio</SelectItem>
                <SelectItem value="3">Fuerte</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="space-y-1">
              <Slider
                min={0}
                max={10}
                step={1}
                disabled={isSaving}
                value={[localHeuristics.contestantStayInZone.advancedValue]}
                onValueChange={(arr) => {
                  const advancedValue = clampAdvancedValue(arr?.[0] ?? 0);
                  setAdvancedHeuristicLocal({ contestantStayInZone: { advancedValue } });
                }}
                onValueCommit={async (arr) => {
                  const advancedValue = clampAdvancedValue(arr?.[0] ?? 0);
                  await commitAdvancedHeuristic({ contestantStayInZone: { advancedValue } });
                }}
              />
              <div className="text-xs">Valor: {localHeuristics.contestantStayInZone.advancedValue}</div>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Bonus suave por permanecer en la misma zona; no bloquea cambios de plató.
          </div>
        </div>





      </CardContent>
    </Card>
  );
}
