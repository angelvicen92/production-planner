import { useEffect, useRef, useState } from "react";
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

const DEBOUNCE_MS = 500;

export function TransportSettingsCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState<TransportSettings | null>(null);

  const debounceTimerRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef<Partial<TransportSettings> | null>(null);

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
      arrivalGroupingTarget: Math.max(0, Number(settingsQ.data.arrivalGroupingTarget ?? 0) || 0),
      departureGroupingTarget: Math.max(0, Number(settingsQ.data.departureGroupingTarget ?? 0) || 0),
      vanCapacity: Math.max(0, Number(settingsQ.data.vanCapacity ?? 0) || 0),
      weightArrivalDepartureGrouping: Math.max(0, Math.min(10, Number(settingsQ.data.weightArrivalDepartureGrouping ?? 0) || 0)),
    });
  }, [settingsQ.data]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const patchNow = async (payload: Partial<TransportSettings>) => {
    if (Object.keys(payload).length === 0) return;

    if (isSavingRef.current) {
      pendingSaveRef.current = { ...(pendingSaveRef.current ?? {}), ...payload };
      return;
    }

    setIsSaving(true);
    isSavingRef.current = true;

    try {
      await apiRequest("PATCH", api.optimizerSettings.update.path, payload);
      qc.invalidateQueries({ queryKey: [api.optimizerSettings.get.path] });
      toast({ title: "Transporte guardado" });
    } catch (err: any) {
      toast({ title: "No se pudo guardar", description: err?.message || "Error desconocido", variant: "destructive" });
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;

      if (pendingSaveRef.current) {
        const queued = pendingSaveRef.current;
        pendingSaveRef.current = null;
        await patchNow(queued);
      }
    }
  };

  const scheduleSave = (payload: Partial<TransportSettings>) => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void patchNow(payload);
    }, DEBOUNCE_MS);
  };

  const flushDebouncedSave = () => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
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
        {isSaving ? <p className="text-xs text-muted-foreground">Guardando…</p> : null}
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Plantilla Llegada</Label>
          <Select
            value={draft.arrivalTaskTemplateName || "none"}
            disabled={isSaving}
            onValueChange={(value) => {
              const arrivalTaskTemplateName = value === "none" ? "" : value;
              setDraft((prev) => (prev ? { ...prev, arrivalTaskTemplateName } : prev));
              scheduleSave({ arrivalTaskTemplateName });
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
            onValueChange={(value) => {
              const departureTaskTemplateName = value === "none" ? "" : value;
              setDraft((prev) => (prev ? { ...prev, departureTaskTemplateName } : prev));
              scheduleSave({ departureTaskTemplateName });
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
          <Label>Objetivo agrupación llegada</Label>
          <Input
            type="number"
            value={draft.arrivalGroupingTarget}
            disabled={isSaving}
            onChange={(e) => {
              const arrivalGroupingTarget = Math.max(0, Number(e.target.value) || 0);
              setDraft((prev) => (prev ? { ...prev, arrivalGroupingTarget } : prev));
            }}
            onBlur={() => {
              flushDebouncedSave();
              void patchNow({ arrivalGroupingTarget: draft.arrivalGroupingTarget });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label>Objetivo agrupación salida</Label>
          <Input
            type="number"
            value={draft.departureGroupingTarget}
            disabled={isSaving}
            onChange={(e) => {
              const departureGroupingTarget = Math.max(0, Number(e.target.value) || 0);
              setDraft((prev) => (prev ? { ...prev, departureGroupingTarget } : prev));
            }}
            onBlur={() => {
              flushDebouncedSave();
              void patchNow({ departureGroupingTarget: draft.departureGroupingTarget });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label>Capacidad furgoneta</Label>
          <Input
            type="number"
            value={draft.vanCapacity}
            disabled={isSaving}
            onChange={(e) => {
              const vanCapacity = Math.max(0, Number(e.target.value) || 0);
              setDraft((prev) => (prev ? { ...prev, vanCapacity } : prev));
            }}
            onBlur={() => {
              flushDebouncedSave();
              void patchNow({ vanCapacity: draft.vanCapacity });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label>Peso agrupación (0-10)</Label>
          <Input
            type="number"
            value={draft.weightArrivalDepartureGrouping}
            disabled={isSaving}
            onChange={(e) => {
              const weightArrivalDepartureGrouping = Math.max(0, Math.min(10, Number(e.target.value) || 0));
              setDraft((prev) => (prev ? { ...prev, weightArrivalDepartureGrouping } : prev));
            }}
            onBlur={() => {
              flushDebouncedSave();
              void patchNow({ weightArrivalDepartureGrouping: draft.weightArrivalDepartureGrouping });
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
