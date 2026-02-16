import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

type HeuristicSetting = { basicLevel: number; advancedValue: number };

type OptimizerSettings = {
  id: number;
  mainZoneId: number | null;
  optimizationMode: "basic" | "advanced";
  heuristics: {
    mainZoneFinishEarly: HeuristicSetting;
    mainZoneKeepBusy: HeuristicSetting;
    contestantCompact: HeuristicSetting;
    groupBySpaceTemplateMatch: HeuristicSetting;
    groupBySpaceActive: HeuristicSetting;
    contestantStayInZone: HeuristicSetting;
  };

  prioritizeMainZone: boolean;
  groupBySpaceAndTemplate: boolean;
  mainZonePriorityLevel: number;
  groupingLevel: number;
  mainZoneOptFinishEarly: boolean;
  mainZoneOptKeepBusy: boolean;
  contestantCompactLevel: number;
  contestantStayInZoneLevel: number;
};

const clampBasic = (v: number) => Math.max(0, Math.min(3, Math.round(v)));
const clampAdvanced = (v: number) => Math.max(0, Math.min(10, Math.round(v)));
const basicToAdvanced = (basic: number) => [0, 3, 6, 9][clampBasic(basic)] ?? 0;
const advancedToBasic = (value: number) => {
  const n = clampAdvanced(value);
  const anchors = [0, 3, 6, 9];
  let best = 0;
  let dist = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const d = Math.abs(n - anchors[i]);
    if (d < dist || (d === dist && anchors[i] < anchors[best])) {
      dist = d;
      best = i;
    }
  }
  return best;
};

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

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const update = useMutation({
    mutationFn: (patch: Partial<OptimizerSettings>) =>
      apiRequest("PATCH", api.optimizerSettings.update.path, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.optimizerSettings.get.path] });
      toast({ title: "Ajustes de optimización guardados" });
    },
    onError: (err: any) => {
      toast({
        title: "No se pudieron guardar",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    },
  });

  const mode = draft?.optimizationMode ?? "basic";

  const mainZoneBasic = useMemo(() => Math.max(draft?.heuristics.mainZoneFinishEarly.basicLevel ?? 0, draft?.heuristics.mainZoneKeepBusy.basicLevel ?? 0), [draft]);
  const groupingBasic = useMemo(() => Math.max(draft?.heuristics.groupBySpaceTemplateMatch.basicLevel ?? 0, draft?.heuristics.groupBySpaceActive.basicLevel ?? 0), [draft]);

  const setHeuristic = (key: keyof OptimizerSettings["heuristics"], next: Partial<HeuristicSetting>) => {
    if (!draft) return;
    const current = draft.heuristics[key];
    const merged = {
      basicLevel: clampBasic(next.basicLevel ?? current.basicLevel ?? 0),
      advancedValue: clampAdvanced(next.advancedValue ?? current.advancedValue ?? basicToAdvanced(current.basicLevel ?? 0)),
    };
    const heuristics = { ...draft.heuristics, [key]: merged };
    const nextDraft = { ...draft, heuristics };
    setDraft(nextDraft);
    update.mutate({ heuristics } as any);
  };

  const setMainZoneLevel = (level: number) => {
    const basicLevel = clampBasic(level);
    setHeuristic("mainZoneFinishEarly", { basicLevel });
    setHeuristic("mainZoneKeepBusy", { basicLevel });
    update.mutate({ mainZonePriorityLevel: basicLevel } as any);
  };

  const setGroupingLevel = (level: number) => {
    const basicLevel = clampBasic(level);
    setHeuristic("groupBySpaceTemplateMatch", { basicLevel });
    setHeuristic("groupBySpaceActive", { basicLevel });
    update.mutate({ groupingLevel: basicLevel } as any);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !draft) {
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
        <CardTitle>Optimización (global)</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Modo</Label>
          <Select
            value={mode}
            onValueChange={(v) => {
              const optimizationMode = v === "advanced" ? "advanced" : "basic";
              setDraft((p) => (p ? { ...p, optimizationMode } : p));
              update.mutate({ optimizationMode } as any);
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="basic">Básico</SelectItem>
              <SelectItem value="advanced">Avanzado</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">Básico: niveles predefinidos. Avanzado: escala 0–10 (0=off, 9≈fuerte, 10=más que fuerte).</div>
        </div>

        <div className="space-y-2">
          <Label>Plató principal (opcional)</Label>
          <Select value={draft.mainZoneId ? String(draft.mainZoneId) : "none"} onValueChange={(v) => {
            const mainZoneId = v === "none" ? null : Number(v);
            setDraft((p) => (p ? { ...p, mainZoneId } : p));
            update.mutate({ mainZoneId });
          }}>
            <SelectTrigger><SelectValue placeholder="Selecciona un plató principal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin plató principal</SelectItem>
              {zones.map((z: any) => <SelectItem key={z.id} value={String(z.id)}>{String(z.name ?? `Zona ${z.id}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <Checkbox checked={draft.mainZoneOptFinishEarly !== false} onCheckedChange={(v) => update.mutate({ mainZoneOptFinishEarly: v !== false } as any)} />
          <div className="text-sm">Terminar cuanto antes</div>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox checked={draft.mainZoneOptKeepBusy !== false} onCheckedChange={(v) => update.mutate({ mainZoneOptKeepBusy: v !== false } as any)} />
          <div className="text-sm">Sin huecos entre tareas</div>
        </div>

        <div className="space-y-2">
          <Label>Prioridad del plató principal</Label>
          {mode === "basic" ? (
            <Select value={String(mainZoneBasic)} onValueChange={(v) => setMainZoneLevel(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Apagado</SelectItem><SelectItem value="1">Suave</SelectItem><SelectItem value="2">Medio</SelectItem><SelectItem value="3">Fuerte</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="space-y-1"><Slider min={0} max={10} step={1} value={[draft.heuristics.mainZoneFinishEarly.advancedValue]} onValueChange={(arr)=>{ const advancedValue=clampAdvanced(arr?.[0] ?? 0); setHeuristic("mainZoneFinishEarly",{advancedValue}); setHeuristic("mainZoneKeepBusy",{advancedValue}); }} /><div className="text-xs">Valor: {draft.heuristics.mainZoneFinishEarly.advancedValue}</div></div>
          )}
          <div className="text-xs text-muted-foreground">Básico fuerte ≈ 9 (Avanzado).</div>
        </div>

        <div className="space-y-2">
          <Label>Agrupar tareas iguales en el mismo espacio</Label>
          {mode === "basic" ? (
            <Select value={String(groupingBasic)} onValueChange={(v) => setGroupingLevel(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Apagado</SelectItem><SelectItem value="1">Suave</SelectItem><SelectItem value="2">Medio</SelectItem><SelectItem value="3">Fuerte</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="space-y-1"><Slider min={0} max={10} step={1} value={[draft.heuristics.groupBySpaceTemplateMatch.advancedValue]} onValueChange={(arr)=>{ const advancedValue=clampAdvanced(arr?.[0] ?? 0); setHeuristic("groupBySpaceTemplateMatch",{advancedValue}); setHeuristic("groupBySpaceActive",{advancedValue}); }} /><div className="text-xs">Valor: {draft.heuristics.groupBySpaceTemplateMatch.advancedValue}</div></div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Compactar concursantes (reducir huecos)</Label>
          {mode === "basic" ? (
            <Select value={String(draft.heuristics.contestantCompact.basicLevel)} onValueChange={(v) => setHeuristic("contestantCompact", { basicLevel: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="0">Apagado</SelectItem><SelectItem value="1">Suave</SelectItem><SelectItem value="2">Medio</SelectItem><SelectItem value="3">Fuerte</SelectItem></SelectContent>
            </Select>
          ) : (
            <div className="space-y-1"><Slider min={0} max={10} step={1} value={[draft.heuristics.contestantCompact.advancedValue]} onValueChange={(arr)=>setHeuristic("contestantCompact",{advancedValue: arr?.[0] ?? 0})} /><div className="text-xs">Valor: {draft.heuristics.contestantCompact.advancedValue}</div></div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Mantener concursante en el mismo plató</Label>
          {mode === "basic" ? (
            <Select value={String(draft.heuristics.contestantStayInZone.basicLevel)} onValueChange={(v) => setHeuristic("contestantStayInZone", { basicLevel: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="0">Apagado</SelectItem><SelectItem value="1">Suave</SelectItem><SelectItem value="2">Medio</SelectItem><SelectItem value="3">Fuerte</SelectItem></SelectContent>
            </Select>
          ) : (
            <div className="space-y-1"><Slider min={0} max={10} step={1} value={[draft.heuristics.contestantStayInZone.advancedValue]} onValueChange={(arr)=>setHeuristic("contestantStayInZone",{advancedValue: arr?.[0] ?? 0})} /><div className="text-xs">Valor: {draft.heuristics.contestantStayInZone.advancedValue}</div></div>
          )}
          <div className="text-xs text-muted-foreground">Bonus suave por permanecer en la misma zona; no bloquea cambios de plató.</div>
        </div>
      </CardContent>
    </Card>
  );
}
