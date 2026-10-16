import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveHeaderNotesSchema, type HeaderLine, type HeaderNotes, type HeaderScope } from "@shared/planningHeaderNotes";
import type { PlanningHeader } from "@/lib/planning-header";

export function OperationalHeader({ scope, title, header, status, notes, notesStatus, canEdit, onEdit }: {
  scope: HeaderScope; title: string; header: PlanningHeader; status: "ready" | "loading" | "error";
  notes?: HeaderNotes; notesStatus: "ready" | "loading" | "error"; canEdit: boolean; onEdit: (scope: HeaderScope, title: string) => void;
}) {
  return <div className="operational-header space-y-1 text-xs font-normal leading-4" data-header-scope={`${scope.scopeType}:${scope.scopeId}`}>
    {status !== "ready" ? <p role="status">{status === "error" ? "Asignaciones no disponibles. Reintenta la carga." : "Cargando asignaciones…"}</p> : <>
      <div><strong>Prod ({header.staffScope}):</strong> {header.production.join(" · ") || "—"}</div>
      <div><strong>Red ({header.staffScope}):</strong> {header.editorial.join(" · ") || "—"}</div>
      <div><strong>Recursos:</strong> {header.resources.length === 0 ? "Sin asignaciones registradas" : <ul className="grid gap-x-3 gap-y-1" style={{gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 140px), 1fr))"}}>{header.resources.map(item => <li key={item.id} data-header-resource-id={item.id}>
        <span className="font-medium">{item.name}</span><span className="block opacity-80">{item.scopes.join(" · ")}{item.taskIds.length > 0 ? ` (${item.taskIds.length} tarea${item.taskIds.length === 1 ? "" : "s"})` : ""}</span>
      </li>)}</ul>}</div>
      {header.teams.map(team => <div key={team.id} data-header-team-id={team.id}><strong>Equipo itinerante:</strong> {team.name} · {team.scope}</div>)}
    </>}
    {notesStatus !== "ready" ? <p role="status">{notesStatus === "error" ? "Indicaciones no disponibles. Reintenta la carga." : "Cargando indicaciones…"}</p> : notes?.lines.map((line, index) => <div key={index} className="whitespace-pre-wrap" data-header-note>{line.label && <strong>{line.label}: </strong>}{line.text}</div>)}
    {canEdit && notesStatus === "ready" && <button type="button" className="underline text-xs font-medium py-1" onClick={() => onEdit(scope, title)} aria-label={`Editar cabecera: ${title}`}>Editar cabecera</button>}
  </div>;
}

export function HeaderNotesEditor({ title, notes, saving, onSave, onClose }: { title: string; notes?: HeaderNotes; saving: boolean; onSave: (lines: HeaderLine[], version: number) => Promise<unknown>; onClose: () => void }) {
  const [lines, setLines] = useState<HeaderLine[]>(() => notes?.lines.map(line => ({ ...line })) ?? []);
  const [error, setError] = useState("");
  const fieldId = useId();
  // Capture the version at opening; background refresh must not permit lost updates.
  const [version] = useState(notes?.version ?? 0);
  const patch = (index: number, value: Partial<HeaderLine>) => setLines(old => old.map((line, i) => i === index ? { ...line, ...value } : line));
  const move = (index: number, delta: number) => setLines(old => { const next = [...old]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; });
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className="max-w-2xl max-h-[90dvh] flex flex-col" data-testid="header-notes-editor">
    <DialogHeader><DialogTitle>Cabecera · {title}</DialogTitle><DialogDescription>Indicaciones informativas de esta jornada. No crean recursos, tareas ni restricciones. Hasta 20 líneas, 80 caracteres de etiqueta y 4000 de texto; 16000 en total.</DialogDescription></DialogHeader>
    <div className="overflow-y-auto space-y-3 pr-2">{lines.map((line, index) => <fieldset key={index} disabled={saving} className="border rounded p-3 space-y-2"><legend className="text-xs">Línea {index + 1}</legend>
      <label className="block text-sm" htmlFor={`${fieldId}-label-${index}`}>Etiqueta opcional</label><Input id={`${fieldId}-label-${index}`} value={line.label} maxLength={80} onChange={event => patch(index, { label: event.target.value })} />
      <label className="block text-sm" htmlFor={`${fieldId}-text-${index}`}>Texto</label><Textarea id={`${fieldId}-text-${index}`} value={line.text} maxLength={4000} rows={3} onChange={event => patch(index, { text: event.target.value })} />
      <div className="flex gap-2"><Button size="sm" variant="outline" disabled={index === 0} aria-label={`Subir línea ${index + 1}`} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button><Button size="sm" variant="outline" disabled={index === lines.length - 1} aria-label={`Bajar línea ${index + 1}`} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button><Button size="sm" variant="outline" aria-label={`Eliminar línea ${index + 1}`} onClick={() => setLines(old => old.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button></div>
    </fieldset>)}<Button variant="outline" disabled={saving || lines.length >= 20} onClick={() => setLines(old => [...old, { label: "", text: "" }])}><Plus className="h-4 w-4 mr-2" />Añadir línea</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button><Button disabled={saving} onClick={async () => {
      const parsed = saveHeaderNotesSchema.safeParse({ expectedVersion: version, lines });
      if (!parsed.success) { setError("Revisa las líneas vacías y los límites de longitud."); return; }
      try { setError(""); await onSave(parsed.data.lines, version); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar. Reintenta la operación."); }
    }}>{saving ? "Guardando…" : "Guardar indicaciones"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
