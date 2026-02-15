import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ProgramSettings = {
  id: number;
  mealStart: string;
  mealEnd: string;
  contestantMealDurationMinutes: number;
  contestantMealMaxSimultaneous: number;
  mealTaskTemplateName: string;
};

export function GeneralProgramSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<ProgramSettings>({
    queryKey: [api.programSettings.get.path],
    queryFn: () => apiRequest("GET", api.programSettings.get.path),
  });
  const templatesQ = useQuery<any[]>({
    queryKey: [api.taskTemplates.list.path],
    queryFn: () => apiRequest("GET", api.taskTemplates.list.path),
  });

  const [draft, setDraft] = useState<ProgramSettings | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const update = useMutation({
    mutationFn: (patch: Partial<ProgramSettings>) =>
      apiRequest("PATCH", api.programSettings.update.path, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.programSettings.get.path] });
      toast({ title: "Ajustes guardados" });
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
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 border rounded-lg text-sm">
        <div className="font-medium">Error cargando ajustes generales</div>
        <div className="text-muted-foreground mt-1">
          {(error as any)?.message || "Error desconocido"}
        </div>
      </div>
    );
  }

  const mealName = String(
    (draft as any)?.mealTaskTemplateName ?? "Comer",
  ).trim();
  const templates = templatesQ.data ?? [];
  const mealTemplateExists =
    mealName.length > 0 &&
    templates.some(
      (t: any) =>
        String(t?.name ?? "")
          .trim()
          .toLowerCase() === mealName.toLowerCase(),
    );


  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajustes generales del programa (defaults)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Inicio ventana global comida (default)</Label>
            <Input
              type="time"
              value={draft?.mealStart ?? "13:00"}
              onChange={(e) =>
                setDraft((p) => (p ? { ...p, mealStart: e.target.value } : p))
              }
            />
          </div>

          <div>
            <Label>Fin ventana global comida (default)</Label>
            <Input
              type="time"
              value={draft?.mealEnd ?? "16:00"}
              onChange={(e) =>
                setDraft((p) => (p ? { ...p, mealEnd: e.target.value } : p))
              }
            />
          </div>

          <div>
            <Label>Duración comida concursantes (min, default)</Label>
            <Input
              type="number"
              min={1}
              max={240}
              value={draft?.contestantMealDurationMinutes ?? 75}
              onChange={(e) =>
                setDraft((p) =>
                  p
                    ? {
                        ...p,
                        contestantMealDurationMinutes: Number(e.target.value),
                      }
                    : p,
                )
              }
            />
          </div>

          <div>
            <Label>Máx. concursantes comiendo a la vez (default)</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={draft?.contestantMealMaxSimultaneous ?? 10}
              onChange={(e) =>
                setDraft((p) =>
                  p
                    ? {
                        ...p,
                        contestantMealMaxSimultaneous: Number(e.target.value),
                      }
                    : p,
                )
              }
            />
          </div>
          <div className="col-span-2">
            <Label>Nombre de la tarea que representa “comida” (default)</Label>
            <Input
              type="text"
              value={draft?.mealTaskTemplateName ?? "Comer"}
              onChange={(e) =>
                setDraft((p) =>
                  p ? { ...p, mealTaskTemplateName: e.target.value } : p,
                )
              }
              placeholder="Comer"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Debe coincidir con el nombre de un Task Template (ej: “Sodexo”).
              Se usa para auto-crear la tarea al crear concursantes.
            </p>
            {
              mealName.length > 0 && templatesQ.isLoading ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Comprobando si existe el Task Template…
                </p>
              ) : mealName.length > 0 && !mealTemplateExists ? (
                <p className="text-xs text-destructive mt-1">
                  ⚠️ No existe ninguna Plantilla de Tarea llamada “{mealName}”. Si creas
                  concursantes, no se auto-creará la tarea de comida “{mealName}”. Debes crear una Plantilla de Tarea con este nombre.
                </p>
              ) : null}
          </div>
        </div>
        <div className="flex justify-end">
          <button
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => {
              if (!draft) return;
              update.mutate({
                mealStart: draft.mealStart,
                mealEnd: draft.mealEnd,
                contestantMealDurationMinutes:
                  draft.contestantMealDurationMinutes,
                contestantMealMaxSimultaneous:
                  draft.contestantMealMaxSimultaneous,
                mealTaskTemplateName: draft.mealTaskTemplateName,
              });
            }}
          >
            Guardar
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Estos valores se aplican por defecto al crear planes nuevos. En cada
          plan puedes ajustar sus valores en “Edit plan”.
        </p>
      </CardContent>
    </Card>
  );
}
