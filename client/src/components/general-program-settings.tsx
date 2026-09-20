import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock3, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProductionClock } from "@/hooks/use-production-clock";

type ProgramSettings = {
  id: number;
  defaultWorkStart: string;
  defaultWorkEnd: string;
  mealStart: string;
  mealEnd: string;
  mealMode: "global_hard_break" | "flexible_meal_window";
  contestantMealDurationMinutes: number;
  contestantMealMaxSimultaneous: number;
  spaceMealBreakMinutes: number;
  mealTaskTemplateName: string;
  clockMode: "auto" | "manual";
  simulatedTime: string | null;
  simulatedSetAt?: string | null;
};

export function GeneralProgramSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { nowTime } = useProductionClock();

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
  const workdayInvalid = !draft?.defaultWorkStart || !draft?.defaultWorkEnd || draft.defaultWorkStart >= draft.defaultWorkEnd;

  const setSimulatedNow = () => {
    const hh = String(new Date().getHours()).padStart(2, "0");
    const mm = String(new Date().getMinutes()).padStart(2, "0");
    const now = `${hh}:${mm}`;

    setDraft((p) => (p ? { ...p, simulatedTime: now } : p));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajustes generales del programa (defaults)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <fieldset className="col-span-2 rounded-lg border p-3" aria-describedby="default-work-help default-work-error">
            <legend className="px-1 text-sm font-medium">Horario habitual de la jornada</legend>
            <p id="default-work-help" className="mb-3 text-xs text-muted-foreground">Estos valores serán el horario inicial de los días nuevos. Después podrás ajustar una excepción sólo para un día.</p>
            <div className="grid grid-cols-2 gap-4">
              <div><Label htmlFor="default-work-start">Inicio habitual</Label><Input id="default-work-start" type="time" aria-invalid={workdayInvalid} aria-describedby={workdayInvalid ? "default-work-help default-work-error" : "default-work-help"} value={draft?.defaultWorkStart ?? ""} onChange={(e) => setDraft((p) => p ? {...p, defaultWorkStart:e.target.value} : p)}/></div>
              <div><Label htmlFor="default-work-end">Fin habitual</Label><Input id="default-work-end" type="time" aria-invalid={workdayInvalid} aria-describedby={workdayInvalid ? "default-work-help default-work-error" : "default-work-help"} value={draft?.defaultWorkEnd ?? ""} onChange={(e) => setDraft((p) => p ? {...p, defaultWorkEnd:e.target.value} : p)}/></div>
            </div>
            {workdayInvalid ? <p id="default-work-error" role="alert" className="mt-2 text-xs text-destructive">La hora de inicio debe ser anterior a la hora de fin.</p> : null}
          </fieldset>
          <div>
            <Label htmlFor="default-meal-start">Inicio ventana global comida (default)</Label>
            <Input
              id="default-meal-start"
              type="time"
              value={draft?.mealStart ?? "13:00"}
              onChange={(e) =>
                setDraft((p) => (p ? { ...p, mealStart: e.target.value } : p))
              }
            />
          </div>

          <div>
            <Label htmlFor="default-meal-end">Fin ventana global comida (default)</Label>
            <Input
              id="default-meal-end"
              type="time"
              value={draft?.mealEnd ?? "16:00"}
              onChange={(e) =>
                setDraft((p) => (p ? { ...p, mealEnd: e.target.value } : p))
              }
            />
          </div>

          <div className="col-span-2">
            <Label htmlFor="default-meal-mode">Modo de comida</Label>
            <Select value={draft?.mealMode ?? "flexible_meal_window"} onValueChange={(value: "global_hard_break" | "flexible_meal_window") => setDraft((p) => p ? { ...p, mealMode: value } : p)}>
              <SelectTrigger id="default-meal-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="flexible_meal_window">Ventana flexible y comidas escalonadas</SelectItem>
                <SelectItem value="global_hard_break">Pausa global dura simultánea</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="contestant-meal-duration">Duración comida concursantes (min, default)</Label>
            <Input
              id="contestant-meal-duration"
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
            <Label htmlFor="contestant-meal-capacity">Máx. concursantes comiendo a la vez (default)</Label>
            <Input
              id="contestant-meal-capacity"
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

          <div>
            <Label htmlFor="space-meal-duration">Duración descanso comida platós/equipos (min, default)</Label>
            <Input
              id="space-meal-duration"
              type="number"
              min={1}
              max={240}
              value={draft?.spaceMealBreakMinutes ?? 75}
              onChange={(e) =>
                setDraft((p) =>
                  p
                    ? {
                        ...p,
                        spaceMealBreakMinutes: Number(e.target.value),
                      }
                    : p,
                )
              }
            />
          </div>
          <div className="col-span-2 space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label htmlFor="automatic-clock" className="text-sm font-medium">Hora automática</Label>
                <p id="automatic-clock-help" className="text-xs text-muted-foreground">Usa hora real Europe/Madrid para ejecución y atrasos.</p>
              </div>
              <Switch
                id="automatic-clock"
                aria-describedby="automatic-clock-help"
                checked={(draft?.clockMode ?? "auto") === "auto"}
                onCheckedChange={(checked) =>
                  setDraft((p) =>
                    p
                      ? {
                          ...p,
                          clockMode: checked ? "auto" : "manual",
                          simulatedTime: checked ? p.simulatedTime : (p.simulatedTime ?? "09:00"),
                        }
                      : p,
                  )
                }
              />
            </div>

            {(draft?.clockMode ?? "auto") === "manual" ? (
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <div>
                  <Label htmlFor="simulated-time">Hora simulada (manual)</Label>
                  <Input
                    id="simulated-time"
                    type="time"
                    value={draft?.simulatedTime ?? "09:00"}
                    onChange={(e) =>
                      setDraft((p) => (p ? { ...p, simulatedTime: e.target.value || null } : p))
                    }
                  />
                </div>
                <Button type="button" variant="secondary" onClick={setSimulatedNow} className="gap-2">
                  <Clock3 className="h-4 w-4" />
                  Poner ahora
                </Button>
              </div>
            ) : null}
          </div>


            {(draft?.clockMode ?? "auto") === "manual" ? (
              <div className="col-span-2 text-xs text-muted-foreground">
                Hora simulada actual: {nowTime} · Hora real: {new Date().toTimeString().slice(0, 5)}
              </div>
            ) : null}

          <div className="col-span-2">
            <Label htmlFor="meal-task-template">Nombre de la tarea que representa “comida” (default)</Label>
            <Select
              value={draft?.mealTaskTemplateName ?? ""}
              onValueChange={(value) =>
                setDraft((p) => (p ? { ...p, mealTaskTemplateName: value } : p))
              }
            >
              <SelectTrigger id="meal-task-template" aria-describedby="meal-template-help">
                <SelectValue placeholder="Selecciona plantilla" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t: any) => (
                  <SelectItem key={t.id} value={String(t.name)}>
                    {String(t.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="meal-template-help" className="text-xs text-muted-foreground mt-1">
              Se guarda por nombre por compatibilidad.
            </p>
            {mealName.length > 0 && templatesQ.isLoading ? (
              <p className="text-xs text-muted-foreground mt-1">
                Comprobando si existe el Task Template…
              </p>
            ) : mealName.length > 0 && !mealTemplateExists ? (
              <p className="text-xs text-destructive mt-1">
                ⚠️ No existe ninguna Plantilla de Tarea llamada “{mealName}”.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={workdayInvalid || update.isPending}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => {
              if (!draft) return;
              update.mutate({
                defaultWorkStart: draft.defaultWorkStart,
                defaultWorkEnd: draft.defaultWorkEnd,
                mealStart: draft.mealStart,
                mealEnd: draft.mealEnd,
                mealMode: draft.mealMode,
                contestantMealDurationMinutes:
                  draft.contestantMealDurationMinutes,
                contestantMealMaxSimultaneous:
                  draft.contestantMealMaxSimultaneous,
                spaceMealBreakMinutes: draft.spaceMealBreakMinutes,
                mealTaskTemplateName: draft.mealTaskTemplateName,
                clockMode: draft.clockMode,
                simulatedTime: draft.clockMode === "manual" ? (draft.simulatedTime ?? "09:00") : null,
              });
            }}
          >
            {(draft?.clockMode ?? "auto") === "manual" ? "Guardar y fijar hora" : "Guardar"}
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
