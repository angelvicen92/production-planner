import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { catalogScopeGroups, toggleScopeSpaces, type ScopeSpace, type ScopeZone, type ScopeTask } from "@/lib/assisted-scope-selection";

export function AssistedLocationScope({ zones, spaces, tasks, selected, disabled, onChange }: {
  zones: readonly ScopeZone[]; spaces: readonly ScopeSpace[]; tasks: readonly ScopeTask[];
  selected: readonly number[]; disabled: boolean; onChange: (ids: number[]) => void;
}) {
  const groups = catalogScopeGroups(zones, spaces);
  const counts = new Map<number, number>();
  for (const task of tasks) if (task.spaceId !== null) counts.set(task.spaceId, (counts.get(task.spaceId) ?? 0) + 1);
  const spaceRow = (space: ScopeSpace) => <label key={space.id} className="flex items-center gap-2 rounded border p-2 text-sm">
    <Checkbox data-testid={`scope-space-${space.id}`} aria-label={`Seleccionar espacio ${space.name}`} disabled={disabled} checked={selected.includes(space.id)}
      onCheckedChange={value => onChange(toggleScopeSpaces(selected, [space.id], value === true))}/>
    <span>{space.name} <small className="text-muted-foreground">· {counts.get(space.id) ?? 0} pendientes</small></span>
  </label>;
  return <div className="space-y-2" data-testid="assisted-location-scope">
    <div className="flex items-center gap-2 text-sm"><span>{selected.length} espacio(s) seleccionado(s)</span>
      <Button size="sm" variant="ghost" disabled={disabled || selected.length === 0} onClick={() => onChange([])}>Retirar selección de ubicaciones</Button></div>
    <div className="max-h-64 overflow-auto space-y-2">
      {groups.zones.map(zone => {
        const ids = zone.spaces.map(space => space.id), checkedCount = ids.filter(id => selected.includes(id)).length;
        return <div key={zone.id} className="rounded border p-2" data-testid={`scope-zone-${zone.id}`}>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox aria-label={`Seleccionar zona ${zone.name}`} disabled={disabled || ids.length === 0}
              checked={checkedCount === 0 ? false : checkedCount === ids.length ? true : "indeterminate"}
              onCheckedChange={value => onChange(toggleScopeSpaces(selected, ids, value === true))}/>
            <span>{zone.name} · {ids.length} espacio(s) · {ids.reduce((count, id) => count + (counts.get(id) ?? 0), 0)} pendientes</span>
          </label>
          <details open className="mt-2"><summary className="cursor-pointer text-xs text-muted-foreground">Espacios de {zone.name}</summary>
            <div className="mt-1 ml-4 grid gap-1 md:grid-cols-2">{zone.spaces.map(spaceRow)}</div></details>
        </div>;
      })}
      {groups.ungrouped.length ? <div className="space-y-1"><p className="text-xs text-muted-foreground">Espacios sin zona disponible en el catálogo</p>{groups.ungrouped.map(spaceRow)}</div> : null}
    </div>
  </div>;
}
