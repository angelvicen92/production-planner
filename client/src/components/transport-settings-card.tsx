import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type TransportSettings = {
  arrivalTaskTemplateName: string;
  departureTaskTemplateName: string;
  arrivalGroupingTarget: number;
  departureGroupingTarget: number;
  vanCapacity: number;
  weightArrivalDepartureGrouping: number;
};

export function TransportSettingsCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState<TransportSettings | null>(null);

  const settingsQ = useQuery<any>({
    queryKey: [api.optimizerSettings.get.path],
    queryFn: () => apiRequest("GET", api.optimizerSettings.get.path),
  });
  const templatesQ = useQuery<any[]>({
    queryKey: [api.taskTemplates.list.path],
    queryFn: () => apiRequest("GET", api.taskTemplates.list.path),
  });

  useEffect(() => {
    if (!settingsQ.data) return;
    setDraft({
      arrivalTaskTemplateName: String(settingsQ.data.arrivalTaskTemplateName ?? ""),
      departureTaskTemplateName: String(settingsQ.data.departureTaskTemplateName ?? ""),
      arrivalGroupingTarget: Number(settingsQ.data.arrivalGroupingTarget ?? 0),
      departureGroupingTarget: Number(settingsQ.data.departureGroupingTarget ?? 0),
      vanCapacity: Number(settingsQ.data.vanCapacity ?? 0),
      weightArrivalDepartureGrouping: Number(settingsQ.data.weightArrivalDepartureGrouping ?? 0),
    });
  }, [settingsQ.data]);

  const patch = async (payload: Partial<TransportSettings>, next: TransportSettings) => {
    setDraft(next);
    setIsSaving(true);
    try {
      await apiRequest("PATCH", api.optimizerSettings.update.path, payload);
      qc.invalidateQueries({ queryKey: [api.optimizerSettings.get.path] });
      toast({ title: "Transporte guardado" });
    } catch (err: any) {
      toast({ title: "No se pudo guardar", description: err?.message || "Error desconocido", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (settingsQ.isLoading || !draft) {
    return <div className="flex items-center justify-center h-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (settingsQ.error) {
    return <div className="text-sm text-destructive">Error cargando transporte</div>;
  }

  const templates = (templatesQ.data ?? []) as any[];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transporte</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Plantilla Llegada</Label>
          <Select
            value={draft.arrivalTaskTemplateName || "none"}
            disabled={isSaving}
            onValueChange={async (value) => {
              const arrivalTaskTemplateName = value === "none" ? "" : value;
              const next = { ...draft, arrivalTaskTemplateName };
              await patch({ arrivalTaskTemplateName }, next);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Selecciona plantilla" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin plantilla</SelectItem>
              {templates.map((t: any) => <SelectItem key={t.id} value={String(t.name)}>{String(t.name)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Plantilla Salida</Label>
          <Select
            value={draft.departureTaskTemplateName || "none"}
            disabled={isSaving}
            onValueChange={async (value) => {
              const departureTaskTemplateName = value === "none" ? "" : value;
              const next = { ...draft, departureTaskTemplateName };
              await patch({ departureTaskTemplateName }, next);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Selecciona plantilla" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin plantilla</SelectItem>
              {templates.map((t: any) => <SelectItem key={t.id} value={String(t.name)}>{String(t.name)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1"><Label>Objetivo agrupación llegada</Label><Input type="number" value={draft.arrivalGroupingTarget} disabled={isSaving} onChange={async (e)=>{ const arrivalGroupingTarget=Math.max(0,Number(e.target.value)||0); const next={...draft,arrivalGroupingTarget}; await patch({arrivalGroupingTarget}, next); }} /></div>
        <div className="space-y-1"><Label>Objetivo agrupación salida</Label><Input type="number" value={draft.departureGroupingTarget} disabled={isSaving} onChange={async (e)=>{ const departureGroupingTarget=Math.max(0,Number(e.target.value)||0); const next={...draft,departureGroupingTarget}; await patch({departureGroupingTarget}, next); }} /></div>
        <div className="space-y-1"><Label>Capacidad furgoneta</Label><Input type="number" value={draft.vanCapacity} disabled={isSaving} onChange={async (e)=>{ const vanCapacity=Math.max(0,Number(e.target.value)||0); const next={...draft,vanCapacity}; await patch({vanCapacity}, next); }} /></div>
        <div className="space-y-1"><Label>Peso agrupación (0-10)</Label><Input type="number" value={draft.weightArrivalDepartureGrouping} disabled={isSaving} onChange={async (e)=>{ const weightArrivalDepartureGrouping=Math.max(0,Math.min(10,Number(e.target.value)||0)); const next={...draft,weightArrivalDepartureGrouping}; await patch({weightArrivalDepartureGrouping}, next); }} /></div>
      </CardContent>
    </Card>
  );
}
