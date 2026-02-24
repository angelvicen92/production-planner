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
import { Input } from "@/components/ui/input";

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
  mainZoneOptFinishEarly: boolean;
  mainZoneOptKeepBusy: boolean;
  contestantCompactLevel: number;
  contestantStayInZoneLevel: number;
  contestantTotalSpanLevel: number;
  arrivalTaskTemplateName: string;
  departureTaskTemplateName: string;
  arrivalGroupingTarget: number;
  departureGroupingTarget: number;
  vanCapacity: number;
  weightArrivalDepartureGrouping: number;
};

const heuristicKeys: OptimizerHeuristicKey[] = [
  "mainZoneFinishEarly",
  "mainZoneKeepBusy",
  "contestantCompact",
  "groupBySpaceTemplateMatch",
  "groupBySpaceActive",
  "contestantStayInZone",
  "contestantTotalSpan",
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
    setDraft({ ...data, heuristics: normalizedHeuristics });
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

  const mainZoneBasic = useMemo(
    () =>
      Math.max(
        localHeuristics?.mainZoneFinishEarly.basicLevel ?? 0,
        localHeuristics?.mainZoneKeepBusy.basicLevel ?? 0,
      ),
    [localHeuristics],
  );

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
          <Label>Plató principal (opcional)</Label>
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

        <div className="flex items-center gap-3">
          <Checkbox
            checked={draft.mainZoneOptFinishEarly !== false}
            disabled={isSaving}
            onCheckedChange={async (v) => {
              const mainZoneOptFinishEarly = v !== false;
              const nextDraft = { ...draft, mainZoneOptFinishEarly };
              await saveSimpleField({ mainZoneOptFinishEarly }, nextDraft);
            }}
          />
          <div className="text-sm">Plató principal: terminar cuanto antes</div>
        </div>

        <div className="flex items-center gap-3">
          <Checkbox
            checked={draft.mainZoneOptKeepBusy !== false}
            disabled={isSaving}
            onCheckedChange={async (v) => {
              const mainZoneOptKeepBusy = v !== false;
              const nextDraft = { ...draft, mainZoneOptKeepBusy };
              await saveSimpleField({ mainZoneOptKeepBusy }, nextDraft);
            }}
          />
          <div
            className="text-sm"
            title="Modo dirección intenta que el plató principal funcione en bloque continuo; puede retrasar el inicio para evitar huecos."
          >
            Plató principal: sin tiempos muertos (modo dirección)
          </div>
        </div>

        <div className="space-y-2">
          <Label>Plató principal: prioridad operativa</Label>
          {localMode === "basic" ? (
            <Select
              value={String(mainZoneBasic)}
              disabled={isSaving}
              onValueChange={async (v) => {
                const basicLevel = clampBasicLevel(Number(v));
                await setBasicHeuristic({
                  mainZoneFinishEarly: { basicLevel },
                  mainZoneKeepBusy: { basicLevel },
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
                value={[localHeuristics.mainZoneFinishEarly.advancedValue]}
                onValueChange={(arr) => {
                  const advancedValue = clampAdvancedValue(arr?.[0] ?? 0);
                  setAdvancedHeuristicLocal({
                    mainZoneFinishEarly: { advancedValue },
                    mainZoneKeepBusy: { advancedValue },
                  });
                }}
                onValueCommit={async (arr) => {
                  const advancedValue = clampAdvancedValue(arr?.[0] ?? 0);
                  await commitAdvancedHeuristic({
                    mainZoneFinishEarly: { advancedValue },
                    mainZoneKeepBusy: { advancedValue },
                  });
                }}
              />
              <div className="text-xs">Valor: {localHeuristics.mainZoneFinishEarly.advancedValue}</div>
            </div>
          )}
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

        <div className="space-y-2">
          <Label>Tiempo total concursante en grabación</Label>
          {localMode === "basic" ? (
            <Select
              value={String(localHeuristics.contestantTotalSpan.basicLevel)}
              disabled={isSaving}
              onValueChange={async (v) => {
                const basicLevel = clampBasicLevel(Number(v));
                await setBasicHeuristic({ contestantTotalSpan: { basicLevel } });
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
                value={[localHeuristics.contestantTotalSpan.advancedValue]}
                onValueChange={(arr) => {
                  const advancedValue = clampAdvancedValue(arr?.[0] ?? 0);
                  setAdvancedHeuristicLocal({ contestantTotalSpan: { advancedValue } });
                }}
                onValueCommit={async (arr) => {
                  const advancedValue = clampAdvancedValue(arr?.[0] ?? 0);
                  await commitAdvancedHeuristic({ contestantTotalSpan: { advancedValue } });
                }}
              />
              <div className="text-xs">Valor: {localHeuristics.contestantTotalSpan.advancedValue}</div>
            </div>
          )}
        </div>


        <div className="space-y-3 rounded-md border p-3">
          <div className="text-sm font-medium">Transporte (Llegada/Salida)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Plantilla Llegada</Label><Input value={draft.arrivalTaskTemplateName ?? ""} disabled={isSaving} onChange={async (e) => { const v=e.target.value; const next={...draft,arrivalTaskTemplateName:v}; setDraft(next); await patchSettings({arrivalTaskTemplateName:v}); }} /></div>
            <div className="space-y-1"><Label>Plantilla Salida</Label><Input value={draft.departureTaskTemplateName ?? ""} disabled={isSaving} onChange={async (e) => { const v=e.target.value; const next={...draft,departureTaskTemplateName:v}; setDraft(next); await patchSettings({departureTaskTemplateName:v}); }} /></div>
            <div className="space-y-1"><Label>Objetivo agrupación llegada</Label><Input type="number" value={draft.arrivalGroupingTarget ?? 0} disabled={isSaving} onChange={async (e)=>{ const v=Math.max(0,Number(e.target.value)||0); const next={...draft,arrivalGroupingTarget:v}; setDraft(next); await patchSettings({arrivalGroupingTarget:v}); }} /></div>
            <div className="space-y-1"><Label>Objetivo agrupación salida</Label><Input type="number" value={draft.departureGroupingTarget ?? 0} disabled={isSaving} onChange={async (e)=>{ const v=Math.max(0,Number(e.target.value)||0); const next={...draft,departureGroupingTarget:v}; setDraft(next); await patchSettings({departureGroupingTarget:v}); }} /></div>
            <div className="space-y-1"><Label>Capacidad furgoneta</Label><Input type="number" value={draft.vanCapacity ?? 0} disabled={isSaving} onChange={async (e)=>{ const v=Math.max(0,Number(e.target.value)||0); const next={...draft,vanCapacity:v}; setDraft(next); await patchSettings({vanCapacity:v}); }} /></div>
            <div className="space-y-1"><Label>Peso agrupación (0-10)</Label><Input type="number" value={draft.weightArrivalDepartureGrouping ?? 0} disabled={isSaving} onChange={async (e)=>{ const v=Math.max(0,Math.min(10,Number(e.target.value)||0)); const next={...draft,weightArrivalDepartureGrouping:v}; setDraft(next); await patchSettings({weightArrivalDepartureGrouping:v}); }} /></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
