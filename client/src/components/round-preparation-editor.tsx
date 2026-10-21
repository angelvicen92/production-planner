import React from "react";
import type { EffectiveConfigurationView } from "@shared/effectiveConfigurationContracts";
import type { RoundPreparationValue } from "@shared/roundPreparation";
import { roundPreparationEditSchema } from "@shared/roundPreparation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = { configuration: NonNullable<EffectiveConfigurationView["roundPreparations"]>; canEdit: boolean; pending: boolean;
  onSave: (lane: RoundPreparationValue, minutes: number) => void; onRestore: (lane: RoundPreparationValue) => void };

function LaneEditor({ lane, grid, canEdit, pending, onSave, onRestore }: Omit<Props, "configuration"> & { lane: RoundPreparationValue; grid: number }) {
  const [text, setText] = React.useState(String(lane.preparationMinutesBetweenRounds));
  const id = React.useId();
  React.useEffect(() => setText(String(lane.preparationMinutesBetweenRounds)), [lane.preparationMinutesBetweenRounds]);
  const minutes = Number(text);
  const valid = text.trim() !== "" && roundPreparationEditSchema.safeParse({ policyId: lane.policyId, spaceId: lane.spaceId, preparationMinutesBetweenRounds: minutes }).success && minutes % grid === 0;
  return <div className="space-y-3 rounded-lg border p-4" data-testid="round-preparation-lane" data-space-id={lane.spaceId}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium">{lane.spaceName}</h4><Badge variant="outline">{lane.source === "DAY_OVERRIDE" ? "Modificado para este día" : "Original del día"}</Badge></div>
    <p className="text-sm">Preparación efectiva: <strong>{lane.preparationMinutesBetweenRounds} min</strong> · Original: {lane.baselineMinutes} min · {lane.taskCount} tareas elegibles</p>
    {lane.overrideMetadata ? <details className="text-xs text-muted-foreground"><summary>Procedencia de la modificación</summary><p>Fecha: {new Date(lane.overrideMetadata.createdAt).toLocaleString()}</p><p>Autor: {lane.overrideMetadata.createdBy}</p></details> : null}
    {canEdit ? <form onSubmit={event => { event.preventDefault(); if (valid && !pending && minutes !== lane.preparationMinutesBetweenRounds) onSave(lane, minutes); }} className="space-y-2">
      <Label htmlFor={id}>Preparación entre rondas en {lane.spaceName} (minutos)</Label>
      <Input id={id} type="number" min={0} step={grid} value={text} disabled={pending} onChange={event => setText(event.target.value)} aria-describedby={`${id}-help`} aria-invalid={!valid} />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">Entero no negativo en múltiplos de {grid}. Cero elimina la preparación entre rondas de este carril.</p>
      {!valid ? <p role="alert" className="text-sm text-destructive">Introduce un entero no negativo compatible con la rejilla de {grid} minutos.</p> : null}
      <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={pending || !valid || minutes === lane.preparationMinutesBetweenRounds}>Guardar preparación</Button>{lane.source === "DAY_OVERRIDE" ? <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onRestore(lane)}>Restaurar original del día</Button> : null}</div>
    </form> : null}
  </div>;
}

export function RoundPreparationEditor({ configuration, ...props }: Props) {
  const policies = [...new Set(configuration.lanes.map(lane => lane.policyId))];
  return <div className="space-y-4" data-testid="round-preparation-editor">
    <p className="text-sm text-muted-foreground">La preparación ocupa el espacio antes de la siguiente ronda. Guardar crea una revisión del día; las propuestas anteriores quedan obsoletas y el borrador requiere nueva validación.</p>
    <p className="text-sm">Revisión consultada: {configuration.revisionId ?? "sin revisión inicial"}</p>
    {policies.length ? policies.map(policyId => <div key={policyId} className="space-y-3"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">Política de rondas: {policyId}</h3><Badge variant="secondary">Sincronización obligatoria</Badge></div><div className="grid gap-3 lg:grid-cols-2">{configuration.lanes.filter(lane => lane.policyId === policyId).map(lane => <LaneEditor key={lane.spaceId} lane={lane} grid={configuration.timeGridMinutes} {...props} />)}</div></div>) : <p className="text-sm text-muted-foreground">Esta jornada no tiene políticas de rondas configuradas.</p>}
  </div>;
}
