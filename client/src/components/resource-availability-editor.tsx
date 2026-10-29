import { useState } from "react";
import { resourceAvailabilityWindowSchema } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ResourceWindow = { availabilityStart: string | null; availabilityEnd: string | null };
export const fullResourceWorkday: ResourceWindow = { availabilityStart: null, availabilityEnd: null };

export function ResourceAvailabilityFields({ value, onChange, disabled = false }: {
  value: ResourceWindow; onChange: (value: ResourceWindow) => void; disabled?: boolean;
}) {
  const full = value.availabilityStart === null && value.availabilityEnd === null;
  return <fieldset disabled={disabled} className="space-y-2">
    <legend className="text-sm font-medium">Disponibilidad horaria</legend>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={full} onChange={e => onChange(e.target.checked ? fullResourceWorkday : { availabilityStart: "", availabilityEnd: "" })} />
      Jornada completa
    </label>
    {!full && <div className="flex flex-wrap gap-3">
      <label className="text-sm">Inicio de disponibilidad<Input type="time" required value={value.availabilityStart ?? ""} onChange={e => onChange({ ...value, availabilityStart: e.target.value })} /></label>
      <label className="text-sm">Fin de disponibilidad<Input type="time" required value={value.availabilityEnd ?? ""} onChange={e => onChange({ ...value, availabilityEnd: e.target.value })} /></label>
    </div>}
  </fieldset>;
}

export function ResourceAvailabilityEditor({ name, value, disabled, description, onSave }: {
  name: string; value: ResourceWindow; disabled?: boolean; description: string; onSave: (window: ResourceWindow) => Promise<void>;
}) {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const label = value.availabilityStart === null && value.availabilityEnd === null ? "Jornada completa" : `${value.availabilityStart}–${value.availabilityEnd}`;
  return <>
    <Button size="sm" variant="outline" disabled={disabled} aria-label={`Horario de ${name}: ${label}`} onClick={() => { setDraft(value); setError(null); setOpen(true); }}>{label}</Button>
    <Dialog open={open} onOpenChange={next => { if (!busy) setOpen(next); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Horario de {name}</DialogTitle><DialogDescription>{description} Jornada completa usa el horario de la jornada.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={async e => {
          e.preventDefault(); setError(null);
          const parsed = resourceAvailabilityWindowSchema.safeParse(draft);
          if (!parsed.success) { setError("Indica inicio y fin válidos, con inicio anterior al fin."); return; }
          setBusy(true);
          try { await onSave(draft); setOpen(false); } catch (e: any) { setError(/STALE_/.test(e?.message ?? "") ? "La configuración ha cambiado. Recarga antes de guardar." : /PROTECTED_DECISIONS/.test(e?.message ?? "") ? "El día contiene horarios protegidos, ejecución o locks. No se ha cambiado la disponibilidad." : e?.message || "No se pudo guardar. Reintenta o recarga para comprobar el horario guardado."); }
          finally { setBusy(false); }
        }}>
          <ResourceAvailabilityFields value={draft} onChange={setDraft} disabled={busy} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={busy} type="submit">Guardar horario</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
