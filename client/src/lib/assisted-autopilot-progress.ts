import { assistedStageLabel, type projectAssistedStageCycle } from "@shared/assistedHistory";
import type { AutopilotPhase, AutopilotProgress } from "@shared/assistedAutopilot";

type Task = {
  id: number; spaceId?: number | null;
  template?: { name?: string | null } | null;
};
type Space = { id: number; name?: string | null };

const phases: Record<AutopilotPhase, string> = {
  READING: "Comprobando la jornada", SELECTING: "Seleccionando las siguientes tareas",
  GENERATING: "Generando propuesta", APPLYING: "Preparando propuesta",
  VALIDATING: "Validando propuesta", ACCEPTING: "Aceptando etapa",
  VERIFYING: "Comprobando la etapa aceptada", STOPPED: "Ejecución detenida",
  FAILED: "Requiere revisión", COMPLETE: "Planificación completada",
};

function failure(code = "") {
  if (code === "RUN_NO_PROPOSAL") return {
    title: "Planificación detenida: sin propuesta para este ámbito",
    guidance: "Revisa las tareas y su disponibilidad antes de volver a intentarlo.",
  };
  if (/VALIDATION|ALERT|EXCEPTION/.test(code)) return {
    title: "Planificación detenida: requiere revisión de validación",
    guidance: "Revisa los conflictos y avisos del borrador antes de continuar.",
  };
  if (code === "PLANNING_CONFIGURATION_CONFLICT") return {
    title: "Planificación detenida: revisa la configuración del día",
    guidance: "Revisa la configuración de esta jornada antes de continuar.",
  };
  if (code === "UNAUTHORIZED") return {
    title: "Planificación detenida: revisa tus permisos",
    guidance: "Necesitas permisos vigentes para aceptar etapas y continuar.",
  };
  return {
    title: "Planificación detenida: requiere revisión",
    guidance: "Revisa el último ámbito y el estado del borrador antes de continuar.",
  };
}

/** Presentation only. Counts come from the controller's verified, accepted
 * checkpoint, never the live draft or a generated proposal. Task types are the
 * configured template names; no classification by name, fixture or engine ID. */
export function projectAutopilotProgress(progress: AutopilotProgress, tasks: readonly Task[] = [], spaces: readonly Space[] = [], cycle: Pick<ReturnType<typeof projectAssistedStageCycle>, "localNumber" | "lineageError"> | null = null) {
  const total = Math.max(0, Math.trunc(progress.total) || 0);
  const completed = Math.min(total, Math.max(0, Math.trunc(progress.completed) || 0));
  const percent = total ? completed / total * 100 : 0;
  // Never round up to 100% while tasks remain unconfirmed.
  const displayedPercent = completed < total ? Math.min(99.9, Math.round(percent * 10) / 10) : percent;
  const percentLabel = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(displayedPercent);
  const scopeIds = new Set(progress.scopeTaskIds);
  const taskById = new Map(tasks.map(task => [Number(task.id), task]));
  const spaceById = new Map(spaces.map(space => [Number(space.id), space.name?.trim()]));
  const scopedTasks = [...scopeIds].map(id => taskById.get(id));
  const selectedSpaces = progress.scope?.kind === "SPACE" ? [progress.scope.spaceId]
    : [...new Set(scopedTasks.map(task => task?.spaceId).filter((id): id is number => id != null))].sort((a, b) => a - b);
  const names = [...new Set(selectedSpaces.map(id => spaceById.get(Number(id)) || "Espacio sin nombre"))];
  const hasUnknownLocation = progress.scope?.kind !== "SPACE" && scopedTasks.some(task => task?.spaceId == null);
  if (hasUnknownLocation && names.length) names.push("tareas sin espacio");
  const scopeLabel = names.length
    ? `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` y ${names.length - 3} espacios más` : ""}`
    : "Selección de tareas";
  const types = new Map<string, number>();
  for (const task of scopedTasks) {
    const label = task?.template?.name?.trim() || "Sin tipo disponible";
    types.set(label, (types.get(label) ?? 0) + 1);
  }
  const groups = [...types].sort(([a], [b]) => a.localeCompare(b, "es"));
  const breakdown = groups.slice(0, 3).map(([label, count]) => `${count} de ${label}`);
  const other = groups.slice(3).reduce((sum, [, count]) => sum + count, 0);
  if (other) breakdown.push(`${other} de otros tipos`);
  const terminal = ["COMPLETE", "STOPPED", "FAILED"].includes(progress.phase);
  const issue = failure(progress.code);
  const title = progress.phase === "COMPLETE" ? "Planificación completada"
    : progress.phase === "STOPPED" ? "Planificación detenida"
    : progress.phase === "FAILED" ? issue.title
    : progress.phase === "GENERATING" && names.length ? `Planificando ${scopeLabel}` : "Planificando jornada…";
  return {
    title, terminal, percent, percentLabel, completed, total, remaining: total - completed,
    countsKnown: total > 0 || progress.phase === "COMPLETE",
    tone: progress.phase === "COMPLETE" ? "success" : progress.phase === "FAILED" ? "warning" : progress.phase === "STOPPED" ? "stopped" : "running",
    phaseLabel: phases[progress.phase], stageLabel: `Última etapa aceptada: ${assistedStageLabel(cycle?.localNumber ?? null)}`,
    checkpointLabel: assistedStageLabel(cycle?.localNumber ?? null),
    lineageError: cycle?.lineageError ?? (cycle?.localNumber == null ? "El recorrido del checkpoint aceptado todavía no está disponible." : null),
    scopeLabel: scopeIds.size ? scopeLabel : null,
    scopeCaption: terminal || progress.phase === "READING" || progress.phase === "SELECTING" ? "Último ámbito procesado" : "Ámbito actual",
    scopeCount: scopeIds.size, scopeCountLabel: `${scopeIds.size} ${scopeIds.size === 1 ? "tarea" : "tareas"} en este bloque`, breakdown: breakdown.join(" · "),
    guidance: progress.phase === "FAILED" ? issue.guidance
      : progress.phase === "STOPPED" ? "Puedes continuar desde la última etapa aceptada."
      : progress.phase === "COMPLETE" ? "La jornada está planificada. Puedes revisar el planning aceptado."
      : progress.stopRequested ? "Se detendrá al terminar la etapa en curso." : null,
  };
}

export type AutopilotProgressView = ReturnType<typeof projectAutopilotProgress>;
