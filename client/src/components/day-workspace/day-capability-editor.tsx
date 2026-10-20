import { TransportPolicyFields } from "../transport-policy-fields";
import { transportBoundsSchema } from "@shared/transportPolicy";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dayConfigEditSchema, type DayConfigEdit } from "@shared/dayConfig";
import type { EffectiveConfigurationValue } from "@shared/effectiveConfigurationContracts";

export function DayCapabilityEditor({
  value,
  disabled,
  onSave,
}: {
  value: EffectiveConfigurationValue;
  disabled: boolean;
  onSave: (edit: DayConfigEdit) => void;
}) {
  const effective = value.value as Record<string, any>;
  const [draft, setDraft] = useState(effective);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(effective?.transport?{...effective,transport:{...effective.transport,...effective.effectiveTransport}}:effective);
    setError(null);
  }, [effective]);
  if (!draft || value.availability !== "AVAILABLE") return null;
  const update = (patch: Record<string, unknown>) =>
    setDraft((old) => ({ ...old, ...patch }));
  const save = () => {
    const payload =
      value.capabilityId === "WORKDAY_WINDOW"
        ? { workday: { start: draft.start, end: draft.end } }
        : value.capabilityId === "GLOBAL_MEAL_BREAK"
          ? {
              meal: {
                start: draft.window?.start ?? draft.start,
                end: draft.window?.end ?? draft.end,
                mode: draft.mode,
              },
            }
          : value.capabilityId === "TRANSITIONS"
            ? {
                participantTransitionMinutes: Number(
                  draft.participantTransitionMinutes,
                ),
              }
            : { optimizer: draft };
    if(value.capabilityId === "OPTIMIZATION" && draft.transport) {
      const bounds=transportBoundsSchema.safeParse({...effective.effectiveTransport,...draft.transport});
      if(!bounds.success){setError(bounds.error.issues[0].message);return;}
    }
    const parsed = dayConfigEditSchema.safeParse(payload);
    if (!parsed.success) {
      setError(
        "Revisa los valores: el inicio debe ser anterior al fin y los márgenes deben ser enteros no negativos.",
      );
      return;
    }
    setError(null);
    onSave(parsed.data);
  };
  return (
    <fieldset
      disabled={disabled}
      className="space-y-3 rounded-lg bg-muted/20 p-3"
      data-testid={`day-editor-${value.capabilityId}`}
    >
      <legend className="sr-only">Editar {value.label}</legend>
      {value.capabilityId === "WORKDAY_WINDOW" ||
      value.capabilityId === "GLOBAL_MEAL_BREAK" ? (
        <div className="flex flex-wrap gap-3">
          {(["start", "end"] as const).map((field) => (
            <label key={field} className="space-y-1 text-sm">
              <span className="block">
                {field === "start" ? "Inicio" : "Fin"}
              </span>
              <Input
                type="time"
                aria-label={`${field === "start" ? "Inicio" : "Fin"} de ${value.capabilityId === "WORKDAY_WINDOW" ? "jornada" : "comida"}`}
                value={draft.window?.[field] ?? draft[field] ?? ""}
                onChange={(event) =>
                  update(
                    value.capabilityId === "GLOBAL_MEAL_BREAK"
                      ? {
                          window: {
                            ...draft.window,
                            [field]: event.target.value,
                          },
                        }
                      : { [field]: event.target.value },
                  )
                }
              />
            </label>
          ))}
        </div>
      ) : null}
      {value.capabilityId === "GLOBAL_MEAL_BREAK" ? (
        <label className="block text-sm">
          Modo de comida
          <select
            aria-label="Modo de comida"
            className="mt-1 block rounded-md border bg-background p-2"
            value={draft.mode}
            onChange={(event) => update({ mode: event.target.value })}
          >
            <option value="global_hard_break">Pausa global</option>
            <option value="flexible_meal_window">Ventana flexible</option>
          </select>
        </label>
      ) : null}
      {value.capabilityId === "TRANSITIONS" ? (
        <label className="block text-sm">
          Margen entre actividades del participante (min)
          <Input
            className="mt-1 max-w-32"
            aria-label="Margen del participante para este día"
            type="number"
            min={0}
            step={1}
            value={draft.participantTransitionMinutes ?? ""}
            onChange={(event) =>
              update({
                participantTransitionMinutes:
                  event.target.value === ""
                    ? undefined
                    : Number(event.target.value),
              })
            }
          />
        </label>
      ) : null}
      {value.capabilityId === "OPTIMIZATION" ? (
        <>
          {draft.transport?<TransportPolicyFields disabled={disabled}
            value={{...effective.effectiveTransport,...draft.transport}}
            sources={effective.transportSources}
            onChange={patch=>update({transport:{...draft.transport,...patch}})}/>:null}
          <label className="block text-sm">
            Modo de optimización
            <select
              aria-label="Modo de optimización"
              className="ml-2 rounded-md border bg-background p-2"
              value={draft.editingMode}
              onChange={(event) => update({ editingMode: event.target.value })}
            >
              <option value="BASIC">Básico</option>
              <option value="ADVANCED">Avanzado</option>
            </select>
          </label>
          {(
            [
              [
                "MAIN_ZONE_FINISH_EARLY",
                "Terminar antes en el plató principal",
              ],
              ["CONTESTANT_COMPACT", "Compactar agenda del concursante"],
              ["CONTESTANT_TOTAL_SPAN", "Reducir permanencia del concursante"],
            ] as const
          ).map(([key, label]) =>
            draft.heuristics?.[key] ? (
              <label key={key} className="block text-sm">
                {label}
                <Input
                  className="mt-1 max-w-32"
                  aria-label={label}
                  type="number"
                  min={0}
                  max={draft.editingMode === "ADVANCED" ? 10 : 3}
                  step={1}
                  value={
                    draft.heuristics[key][
                      draft.editingMode === "ADVANCED"
                        ? "advancedValue"
                        : "basicLevel"
                    ]
                  }
                  onChange={(event) =>
                    update({
                      heuristics: {
                        ...draft.heuristics,
                        [key]: {
                          ...draft.heuristics[key],
                          [draft.editingMode === "ADVANCED"
                            ? "advancedValue"
                            : "basicLevel"]: Number(event.target.value),
                        },
                      },
                    })
                  }
                />
              </label>
            ) : null,
          )}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button size="sm" onClick={save}>
        Guardar{" "}
        {value.capabilityId === "WORKDAY_WINDOW"
          ? "horario"
          : value.capabilityId === "GLOBAL_MEAL_BREAK"
            ? "comida"
            : value.capabilityId === "TRANSITIONS"
              ? "margen"
              : "optimización"}
      </Button>
    </fieldset>
  );
}
