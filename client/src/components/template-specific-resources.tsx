import { useState } from "react";
import { Button } from "@/components/ui/button";
import { canEditTemplateByItem, setTemplateResourceItem, templateByItem, templateResourceOptions,
  type TemplateResourceType } from "@/lib/template-resource-requirements";

export function TemplateSpecificResources({ requirements, types, coachIds, onChange, disabled, loading, error }: {
  requirements: unknown; types: TemplateResourceType[]; coachIds: ReadonlySet<number>;
  onChange: (requirements: Record<string, unknown>) => void; disabled?: boolean; loading?: boolean; error?: boolean;
}) {
  const [selected, setSelected] = useState("");
  const options = templateResourceOptions(types, coachIds);
  const items = templateByItem(requirements);
  const entries = Object.entries(items).filter(([id]) => !coachIds.has(Number(id)));
  const readOnly = disabled || loading || error || !canEditTemplateByItem(requirements);
  return <fieldset className="space-y-2 rounded-md border p-3" disabled={readOnly} data-testid="template-specific-resources">
    <legend className="px-1 text-sm font-medium">Recursos físicos específicos</legend>
    <p className="text-xs text-muted-foreground">Una unidad de cada recurso. El coach se configura por separado. La disponibilidad de cada jornada se comprueba al planificar.</p>
    {loading && <p role="status" className="text-xs">Cargando recursos…</p>}
    {error && <p role="alert" className="text-xs text-destructive">No se pudo cargar el catálogo. Los requisitos guardados se conservan.</p>}
    {!canEditTemplateByItem(requirements) && <p role="alert" className="text-xs">Formato existente conservado; este editor no puede modificarlo.</p>}
    <div className="flex gap-2">
      <select aria-label="Recurso físico específico" className="min-w-0 flex-1 rounded border bg-background p-2 text-sm" value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">Selecciona un recurso</option>
        {options.filter(option => !Object.hasOwn(items, String(option.id))).map(option =>
          <option key={option.id} value={option.id} disabled={!option.available}>{option.label}{option.reason ? ` · ${option.reason}` : ""}</option>)}
      </select>
      <Button type="button" size="sm" variant="outline" disabled={readOnly || !options.some(option => String(option.id) === selected && option.available) || Object.hasOwn(items, selected)} onClick={() => {
        onChange(setTemplateResourceItem(requirements, Number(selected), true, options)); setSelected("");
      }}>Añadir recurso</Button>
    </div>
    {entries.length === 0 && <p className="text-xs text-muted-foreground">Sin recursos específicos adicionales.</p>}
    <ul className="space-y-1 text-sm">
      {entries.map(([id, quantity]) => {
        const option = options.find(option => String(option.id) === id);
        return <li key={id} className="flex items-center justify-between gap-2">
          <span>{option?.label ?? `Recurso #${id} · No disponible en el catálogo`} · cantidad {String(quantity)}
            {option && !option.available ? ` · ${option.reason}` : ""}{quantity !== 1 ? " · requisito existente conservado" : ""}</span>
          <Button type="button" size="sm" variant="ghost" aria-label={`Retirar recurso #${id}`} disabled={readOnly || !Number.isSafeInteger(Number(id)) || Number(id) <= 0} onClick={() => onChange(setTemplateResourceItem(requirements, Number(id), false, options))}>Retirar</Button>
        </li>;
      })}
    </ul>
  </fieldset>;
}
