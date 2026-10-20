import { assistedStageLabel } from "@shared/assistedHistory";
import React, { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
export function PlanningStageToolbar({
  stage,
  planned,
  total,
  modified,
  touched,
  validation,
  actions,
  editingTools,
}: {
  stage: number | null;
  planned: number;
  total: number;
  modified: boolean;
  touched: number;
  validation: string;
  actions: ReactNode;
  editingTools: ReactNode;
}) {
  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4 shadow-sm"
      aria-label="Etapa de planificación"
      data-testid="planning-stage-toolbar"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{assistedStageLabel(stage)}</span>
          <Badge variant="secondary">
            {planned}/{total} con horario
          </Badge>
          <Badge variant="outline">{total - planned} pendientes</Badge>
          {modified ? (
            <Badge variant="outline">{touched} tareas modificadas</Badge>
          ) : null}
        </div>
        <Badge variant="outline">{validation}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
      {editingTools}
    </section>
  );
}
