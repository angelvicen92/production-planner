import React from "react";
import { Check, Pause, Play, X } from "lucide-react";

export const planningExecutionLabels = {
  pending: "Pendiente",
  in_progress: "En curso",
  done: "Completada",
  interrupted: "Interrumpida",
  cancelled: "Cancelada",
} as const;
export type PlanningExecutionStatus = keyof typeof planningExecutionLabels;

/** Only live daily-task rows in the accepted view own execution status. */
export function planningExecutionStatus(task: {
  status?: string | null;
  isManualBlock?: boolean;
  breakKind?: string;
  operationalMealPolicyId?: string;
}, mode: "accepted" | "assisted-draft"): PlanningExecutionStatus | null {
  if (mode !== "accepted" || task.isManualBlock || task.breakKind || task.operationalMealPolicyId) return null;
  return task.status && Object.hasOwn(planningExecutionLabels, task.status)
    ? task.status as PlanningExecutionStatus : null;
}

export function PlanningExecutionMarker({ status }: { status: PlanningExecutionStatus | null }) {
  if (!status || status === "pending") return null;
  const Icon = { in_progress: Play, done: Check, interrupted: Pause, cancelled: X }[status];
  return <span className="planning-execution-marker" data-execution-marker={status} aria-hidden="true">
    <Icon strokeWidth={3} />
  </span>;
}

export function PlanningExecutionLegend() {
  return <div className="planning-execution-legend" role="group" aria-label="Estados de ejecución">
    <span className="font-medium">Ejecución</span>
    {Object.entries(planningExecutionLabels).map(([status, label]) => <span key={status} className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="planning-execution-sample" data-execution-status={status} aria-hidden="true">
        <PlanningExecutionMarker status={status as PlanningExecutionStatus} />
      </span>{label}
    </span>)}
  </div>;
}
