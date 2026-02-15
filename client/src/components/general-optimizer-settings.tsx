import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type OptimizerSettings = {
  id: number;
  mainZoneId: number | null;

  // legacy (se mantienen)
  prioritizeMainZone: boolean;
  groupBySpaceAndTemplate: boolean;

  // ✅ niveles amigables
  mainZonePriorityLevel: number; // 0..3
  groupingLevel: number; // 0..3

  // ✅ modos del plató principal
  mainZoneOptFinishEarly: boolean;
  mainZoneOptKeepBusy: boolean;

  // ✅ compactar concursantes
  contestantCompactLevel: number; // 0..3
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
        <div className="text-muted-foreground mt-1">
          {(error as any)?.message || "Error desconocido"}
        </div>
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
          <Label>Plató principal (opcional)</Label>
          <Select
            value={draft.mainZoneId ? String(draft.mainZoneId) : "none"}
            onValueChange={(v) => {
              const mainZoneId = v === "none" ? null : Number(v);
              setDraft((p) => (p ? { ...p, mainZoneId } : p));
              update.mutate({ mainZoneId });
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

          <div className="text-xs text-muted-foreground">
            Si defines un plató principal, el motor intentará planificar primero lo que ocurra ahí.
          </div>
          <div className="mt-3 space-y-2">
            <Label>¿Qué significa “priorizar” el plató principal?</Label>

            <div className="flex items-center gap-3">
              <Checkbox
                checked={draft.mainZoneOptFinishEarly !== false}
                onCheckedChange={(v) => {
                  const mainZoneOptFinishEarly = v !== false;
                  setDraft((p) => (p ? { ...p, mainZoneOptFinishEarly } : p));
                  update.mutate({ mainZoneOptFinishEarly });
                }}
              />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Terminar cuanto antes</div>
                <div className="text-xs text-muted-foreground">
                  Intenta planificar ese plató lo antes posible para que pueda “cerrarse” antes.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                checked={draft.mainZoneOptKeepBusy !== false}
                onCheckedChange={(v) => {
                  const mainZoneOptKeepBusy = v !== false;
                  setDraft((p) => (p ? { ...p, mainZoneOptKeepBusy } : p));
                  update.mutate({ mainZoneOptKeepBusy });
                }}
              />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Sin huecos entre tareas</div>
                <div className="text-xs text-muted-foreground">
                  Intenta mantener ese plató ocupado, evitando parones si hay tareas posibles.
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Puedes activar uno, otro o ambos.
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Prioridad del plató principal</Label>
          <Select
            value={String(draft.mainZonePriorityLevel ?? (draft.prioritizeMainZone ? 2 : 0))}
            onValueChange={(v) => {
              const mainZonePriorityLevel = Number(v);
              setDraft((p) => (p ? { ...p, mainZonePriorityLevel } : p));
              update.mutate({ mainZonePriorityLevel });
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

          <div className="text-xs text-muted-foreground">
            Solo aplica si has seleccionado un plató principal arriba.
          </div>
        </div>

        <div className="space-y-2">
          <Label>Agrupar tareas iguales en el mismo espacio</Label>
          <Select
            value={String(draft.groupingLevel ?? (draft.groupBySpaceAndTemplate ? 2 : 0))}
            onValueChange={(v) => {
              const groupingLevel = Number(v);
              setDraft((p) => (p ? { ...p, groupingLevel } : p));
              update.mutate({ groupingLevel });
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

          <div className="text-xs text-muted-foreground">
            A mayor nivel, más insistencia en hacer “bloques” del mismo tipo para reducir cambios de montaje.
          </div>
          <div className="space-y-2">
            <Label>Compactar concursantes (reducir huecos)</Label>
            <Select
              value={String(draft.contestantCompactLevel ?? 0)}
              onValueChange={(v) => {
                const contestantCompactLevel = Number(v);
                setDraft((p) => (p ? { ...p, contestantCompactLevel } : p));
                update.mutate({ contestantCompactLevel });
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

            <div className="text-xs text-muted-foreground">
              A mayor nivel, más intenta que cada concursante haga sus tareas seguidas para poder irse antes.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
