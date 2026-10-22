import React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { MainFlowPreference } from "@shared/mainFlowPreference";
import type {
  EffectiveConfigurationValue,
  EffectiveConfigurationView,
} from "@shared/effectiveConfigurationContracts";
export const sourceLabels = {
  INHERITED: "Heredado",
  DAY_OVERRIDE: "Modificado para este día",
  LEGACY_BACKFILL: "Migrado de configuración anterior",
  DAY_SNAPSHOT: "Valor materializado del día",
  MIXED: "Configuración diaria combinada",
  PROTECTED: "Protegido",
  UNKNOWN: "Origen desconocido",
} as const;
export function SourceBadge({
  source,
}: {
  source: EffectiveConfigurationValue["source"];
}) {
  return <Badge variant="outline">{sourceLabels[source]}</Badge>;
}
export function SeverityBadge({ severity }: { severity?: string }) {
  return severity ? (
    <Badge variant={severity === "REQUIRED" ? "destructive" : "secondary"}>
      {severity === "REQUIRED"
        ? "Obligatorio"
        : severity === "PREFERRED"
          ? "Preferente"
          : "Desactivado"}
    </Badge>
  ) : null;
}
export function CapabilityStatus({
  value,
}: {
  value: EffectiveConfigurationValue;
}) {
  const label =
    value.implementationStatus === "MISSING"
      ? "Aún no disponible"
      : value.implementationStatus === "BLOCKED"
        ? "Pendiente de integración segura"
        : value.implementationStatus === "NOT_APPLICABLE"
          ? "Regla del sistema"
          : value.implementationStatus === "PARTIAL"
            ? "Soporte parcial"
            : value.availability === "UNKNOWN"
              ? "Origen no disponible"
              : value.validationStatus === "UNSUPPORTED"
                ? "No compatible con este día"
                : value.validationStatus === "INCOMPATIBLE"
                  ? "Incompatible"
                  : value.validationStatus === "INCOMPLETE"
                    ? "Falta configurar hoy"
                    : "Disponible";
  return (
    <Badge
      variant={
        value.validationStatus === "INCOMPATIBLE" ? "destructive" : "secondary"
      }
    >
      {label}
    </Badge>
  );
}
function valueSummary(value: EffectiveConfigurationValue) {
  if (value.availability === "UNAVAILABLE")
    return "Esta capacidad aún no tiene un valor productivo.";
  if (value.availability === "UNKNOWN")
    return "La autoridad actual no permite determinar el valor sin inventarlo.";
  const v = value.value as any;
  if (value.capabilityId === "MAIN_FLOW")
    return `${v.spaceName} · continuidad obligatoria`;
  if (value.capabilityId === "BLOCK_COUNT_POLICY")
    return v.blockCountPolicy.mode === "SOFT_PREFER_N"
      ? `Preferir ${v.blockCountPolicy.count} bloques${v.mealSplitPreference.mode === "PREFERRED" ? ` · ${v.mealSplitPreference.beforeMealBlocks}+${v.mealSplitPreference.afterMealBlocks}` : ""}`
      : "AUTO · mínimo viable";
  if (value.capabilityId === "WORKDAY_WINDOW") return `${v.start}–${v.end}`;
  if (value.capabilityId === "GLOBAL_MEAL_BREAK")
    return `${v.window?.start ?? "—"}–${v.window?.end ?? "—"} · ${v.mode === "flexible_meal_window" ? "ventana flexible" : "pausa global"}`;
  if (value.capabilityId === "TRANSITIONS")
    return `${v.participantTransitionMinutes ?? "—"} min entre actividades del participante`;
  if (value.capabilityId === "PARTICIPANTS")
    return `${v.count} participantes · ${v.availabilityRules} excepciones de disponibilidad`;
  if (value.capabilityId === "TASKS_DEPENDENCIES")
    return `${v.tasks} tareas · ${v.dependencies} dependencias`;
  if (value.capabilityId === "SPATIAL_AVAILABILITY")
    return `${v.zones} platós · ${v.spaces} espacios`;
  if (value.capabilityId === "PLAN_RESOURCE_ASSIGNMENTS")
    return `${v.items} recursos · ${v.taskRequirements} tareas con necesidades`;
  if (value.capabilityId === "PROTECTED_STATE_LOCKS")
    return `${v.locks} locks · ${v.protectedTasks} tareas protegidas`;
  if (value.capabilityId === "OPTIMIZATION")
    return `${v.editingMode === "ADVANCED" ? "Modo avanzado" : "Modo básico"}`;
  return "Valor disponible en la autoridad productiva";
}
function formatDayValue(capabilityId: string, value: unknown) {
  if (capabilityId === "BLOCK_COUNT_POLICY" && value) {
    const v = value as MainFlowPreference;
    return v.blockCountPolicy.mode === "AUTO_MIN_FEASIBLE"
      ? "AUTO · mínimo viable"
      : `Preferir ${v.blockCountPolicy.count} bloques${v.mealSplitPreference.mode === "PREFERRED" ? ` · ${v.mealSplitPreference.beforeMealBlocks}+${v.mealSplitPreference.afterMealBlocks}` : ""}`;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return null;
  const item = value as {
    start?: string;
    end?: string;
    mode?: string;
    editingMode?: string;
    participantTransitionMinutes?: number;
    window?: { start?: string; end?: string };
  };
  if (capabilityId === "WORKDAY_WINDOW")
    return `${item.start ?? "—"}–${item.end ?? "—"}`;
  if (capabilityId === "GLOBAL_MEAL_BREAK") {
    const window = item.window ?? item;
    return `${window.start ?? "—"}–${window.end ?? "—"} · ${item.mode === "flexible_meal_window" ? "Ventana flexible" : "Parada global"}`;
  }
  if (capabilityId === "TRANSITIONS")
    return `${item.participantTransitionMinutes ?? "—"} min`;
  if (capabilityId === "OPTIMIZATION")
    return item.editingMode === "ADVANCED" ? "Modo avanzado" : "Modo básico";
  return null;
}
export function EffectiveValueField({
  value,
  onRestore,
  onRefreshMain,
  onEditParticipant,
  restoring,
}: {
  value: EffectiveConfigurationValue;
  onRestore?: () => void;
  onRefreshMain?: () => void;
  onEditParticipant?: (value: number) => void;
  restoring?: boolean;
}) {
  const current = (value.value as any)?.participantTransitionMinutes;
  const [draft, setDraft] = React.useState(
    current === undefined ? "" : String(current),
  );
  React.useEffect(
    () => setDraft(current === undefined ? "" : String(current)),
    [current],
  );
  const needsAttention =
    value.blockers.length > 0 || value.implementationStatus !== "PRODUCTIVE";
  const baseline = formatDayValue(value.capabilityId, value.baseline);
  const general = formatDayValue(value.capabilityId, value.defaultGeneral);
  return (
    <div
      className="rounded-lg border p-3 space-y-2"
      data-testid={`effective-${value.capabilityId}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-medium">{value.label}</h4>
        <CapabilityStatus value={value} />
        <SourceBadge source={value.source} />
        <SeverityBadge severity={value.severity} />
      </div>
      <p className="text-sm">{valueSummary(value)}</p>
      {value.capabilityId==='OPTIMIZATION'&&(value.value as any)?.effectiveTransport?<div className="space-y-1 text-sm">
        {(['arrival','departure'] as const).map(direction=>{
          const transport=(value.value as any).effectiveTransport;
          const sources=(value.value as any).transportSources;
          return <p key={direction}>{direction==='arrival'?'IN':'OUT'}: mínimo HARD {transport[`${direction}MinimumGroupSize`]}, objetivo {transport[`${direction}GroupingTarget`]||'no especificado'}, máximo HARD {transport[`${direction}MaximumGroupSize`]??'sin configurar'}, separación entre inicios {transport[`${direction}MinGapMinutes`]} min.
            <span className="block text-xs text-muted-foreground">Mínimo: {sources?.[`${direction}MinimumGroupSize`]}. Objetivo y separación: {sources?.[`${direction}GroupingTarget`]}. Máximo: {sources?.[`${direction}MaximumGroupSize`]}.</span></p>;
        })}
        <p className="text-xs text-muted-foreground">Capacidad de vehículo heredada: {(value.value as any).effectiveTransport.vanCapacity}. Los máximos explícitos por dirección prevalecen.</p>
      </div>:null}
      {baseline ? (
        <p className="text-xs text-muted-foreground">
          Heredado del día: {baseline}
        </p>
      ) : null}
      {general && general !== baseline ? (
        <p className="text-xs text-muted-foreground">
          Configuración habitual actual: {general}
        </p>
      ) : null}
      {value.capabilityId === "TRANSITIONS" && onEditParticipant ? (
        <div className="flex gap-2">
          <input
            aria-label="Margen del participante para este día"
            type="number"
            min={0}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="w-24 rounded border px-2"
          />
          <Button
            size="sm"
            disabled={
              draft === "" ||
              !Number.isInteger(Number(draft)) ||
              Number(draft) < 0
            }
            onClick={() => onEditParticipant?.(Number(draft))}
          >
            Aplicar override
          </Button>
        </div>
      ) : null}
      {value.capabilityId === "BLOCK_COUNT_POLICY" &&
      general &&
      general !== baseline &&
      onRefreshMain ? (
        <Button
          size="sm"
          variant="outline"
          disabled={restoring}
          onClick={onRefreshMain}
        >
          Actualizar herencia desde configuración general
        </Button>
      ) : null}
      {value.canRestoreInherited && onRestore ? (
        <Button
          size="sm"
          variant="outline"
          disabled={restoring}
          onClick={onRestore}
        >
          Restaurar heredado
        </Button>
      ) : null}
      {needsAttention ? (
        <p className="text-xs text-amber-700">
          Esta opción requiere revisión antes de poder aplicarse con seguridad.
        </p>
      ) : null}
      {value.fingerprint ? (
        <p className="text-xs text-muted-foreground">
          Revisión {value.effectiveRevision ?? "—"} · huella{" "}
          {value.fingerprint.slice(0, 8)}
        </p>
      ) : null}
    </div>
  );
}
export function ReadinessSummary({
  readiness,
}: {
  readiness: EffectiveConfigurationView["readiness"];
}) {
  const ready = readiness.status === "READY";
  return (
    <Card className={ready ? "border-emerald-300" : "border-amber-400"}>
      <CardContent className="pt-5 flex gap-3">
        {ready ? (
          <CheckCircle2 className="text-emerald-600" aria-hidden />
        ) : (
          <AlertTriangle className="text-amber-600" aria-hidden />
        )}
        <div>
          <strong>
            {ready
              ? "Planner Next: READY"
              : `Planner Next: ${readiness.status}`}
          </strong>
          <p className="text-sm text-muted-foreground">
            {ready
              ? "El preflight productivo admite esta jornada. La propuesta comprobará su factibilidad antes de aplicarla."
              : `${readiness.issues.length} categoría(s) requieren revisión.`}
          </p>
          {readiness.issues.map((i,index) => (
            <a
              key={`${i.capabilityId}:${index}`}
              className="block text-sm underline"
              href={i.navigationTarget.startsWith("/")||i.navigationTarget.startsWith("#")?i.navigationTarget:`#config-${i.capabilityId}`}
            >
              {i.category}: {i.message}
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
export const categorySlugs: Record<string, string> = {
  "Jornada y comidas": "jornada-comidas",
  Participantes: "participantes",
  Tareas: "tareas",
  "Platós y espacios": "platos-espacios",
  Recursos: "recursos",
  Transporte: "transporte",
  "Operaciones y coordinación": "operaciones-coordinacion",
  "Reglas de planificación": "reglas-planificacion",
  Avanzado: "avanzado",
};
const categoryOrder = [
  "Jornada y comidas",
  "Participantes",
  "Tareas",
  "Platós y espacios",
  "Recursos",
  "Transporte",
  "Operaciones y coordinación",
  "Reglas de planificación",
  "Avanzado",
] as const;
