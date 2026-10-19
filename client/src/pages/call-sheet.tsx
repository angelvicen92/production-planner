import { useState } from 'react';
import { Link } from 'wouter';
import { Layout } from '@/components/layout';
import { QueryGuard } from '@/components/QueryGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { pickDefaultPlan } from '@/lib/plan-default';
import { useCallSheetData, useCallSheetIdentity, useCallSheetPlans, type SheetIdentity, type SheetPlan } from '@/hooks/use-call-sheet-data';
import { assignmentLabel, callSheetSummary, canPreviewSheet, projectCallSheet, sheetLocation, sheetSimultaneous, sheetTaskName, staffRoleLabel, type SheetData, type SheetTarget } from '@/lib/call-sheet-projection';
import { formatRange, hhmmToMinutes } from '@/lib/time';
import './call-sheet.css';

const legacyRoles = ['Realización', 'Producción', 'Redacción', 'Técnico', 'Coach/Contenido'];
const roleLabels = { admin: 'Administración', production: 'Producción', aux: 'Auxiliar', viewer: 'Consulta' };
const statusLabels: Record<string, string> = { pending: 'Pendiente', in_progress: 'En curso', done: 'Completada', interrupted: 'Interrumpida', cancelled: 'Cancelada' };
const selectClass = 'min-h-10 w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm';
function readLocal(key: string) { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } }

export default function CallSheetPage() {
  const { user } = useAuth();
  // Account changes remount selection/notes; queries are also user-keyed.
  return <Layout>{user ? <CallSheetWorkspace key={user.id} userId={user.id} /> : <p>Inicia sesión para consultar tu hoja.</p>}</Layout>;
}

function CallSheetWorkspace({ userId }: { userId: string }) {
  const identity = useCallSheetIdentity(userId);
  const plansQ = useCallSheetPlans(userId);
  const [planId, setPlanId] = useState('');
  const plans = plansQ.data ?? [];
  // Keep selection local: the shared default-plan hook can POST a preference
  // cleanup, which is outside this read-only document's contract.
  const plan = plans.find(p => p.id === Number(planId)) ?? pickDefaultPlan(plans);
  const ops = useCallSheetData(userId, plan?.id ?? null);
  const loading = identity.isLoading || plansQ.isLoading || (!!plan && ops.isLoading);
  const error = identity.error || plansQ.error || ops.error;
  if (loading || error) return <QueryGuard isLoading={loading} isError={!!error} error={error} loadingText="Verificando destinatario y asignaciones de la jornada…" onRetry={() => { identity.refetch(); plansQ.refetch(); ops.refetch(); }} />;
  if (!plan || !identity.data) return <p>No hay jornadas disponibles. <Link href="/plans" className="underline">Ir a planes</Link></p>;
  return <CallSheetDocument key={`${userId}:${plan.id}`} userId={userId} identity={identity.data} plan={plan} plans={plans} data={ops.data} updatedAt={ops.updatedAt} onPlanChange={setPlanId} onRefresh={() => { identity.refetch(); plansQ.refetch(); ops.refetch(); }} />;
}

function CallSheetDocument({ userId, identity, plan, plans, data, updatedAt, onPlanChange, onRefresh }: {
  userId: string; identity: SheetIdentity; plan: SheetPlan; plans: SheetPlan[]; data: SheetData;
  updatedAt: number; onPlanChange: (id: string) => void; onRefresh: () => void;
}) {
  const linked = !!(identity.staffPersonId || identity.resourceItemId);
  const [selection, setSelection] = useState(linked ? 'mine' : 'general');
  const [compact, setCompact] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [pdfHelpOpen, setPdfHelpOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const canPreview = canPreviewSheet(identity.role);
  // A visual selection neither grants permissions nor survives their loss.
  const effectiveSelection = canPreview || ['mine', 'general'].includes(selection) ? selection : linked ? 'mine' : 'general';
  const [kind, rawId] = effectiveSelection.split(':');
  const id = Number(rawId);
  const target: SheetTarget = kind === 'mine' ? { kind: 'mine', ...identity } :
    kind === 'role' ? { kind: 'role', role: rawId as 'production' | 'editorial' | 'realization' } :
    ['person', 'resource', 'resource-type', 'zone', 'space'].includes(kind) ? { kind: kind as 'person' | 'resource' | 'resource-type' | 'zone' | 'space', id } : { kind: 'general' };
  const projection = projectCallSheet(data, plan.id, target);
  const personId = target.kind === 'person' ? target.id : target.kind === 'mine' ? identity.staffPersonId : null;
  const personName = data.people.find(p => p.id === personId)?.name ?? data.assignments.find(a => a.staffPersonId === personId)?.staffPersonName;
  const resourceName = projection.recipientResources.map(r => r.name).join(', ');
  const title = target.kind === 'mine' ? `Mi hoja · ${personName || resourceName || 'Vínculo sin nombre disponible'}` :
    target.kind === 'person' ? `Por persona · ${personName || 'Nombre no disponible'}` :
    target.kind === 'resource' ? `Por recurso · ${resourceName || 'Recurso no disponible'}` :
    target.kind === 'resource-type' ? `Por función · ${data.resources.find(r => r.typeId === id)?.type.name || 'Tipo de recurso no disponible'}` :
    target.kind === 'role' ? `Por rol · ${rawId === 'realization' ? 'Realización' : staffRoleLabel(rawId)}` :
    target.kind === 'zone' ? `Por plató · ${data.zones.find(z => z.id === id)?.name || 'Nombre no disponible'}` :
    target.kind === 'space' ? `Por espacio · ${data.spaces.find(s => s.id === id)?.name || 'Nombre no disponible'}` : 'Vista general';
  const preview = canPreview && !['mine', 'general'].includes(target.kind);
  const tasks = projection.entries.map(e => e.task);
  const next = tasks.find(t => t.status === 'pending');
  const date = String(plan.date).slice(0, 10);
  const functions = [...new Set(projection.assignments.map(a => staffRoleLabel(a.staffRole)))];
  const assignments = [...new Map(projection.assignments.map(a => [`${a.staffPersonId}:${a.staffRole}:${a.scopeType}:${a.zoneId}:${a.spaceId}:${a.itinerantTeamId}:${a.realityTeamCode}`, a])).values()];
  const people = new Map(data.people.map(p => [p.id, p.name]));
  data.assignments.filter(a => a.planId === plan.id).forEach(a => { if (!people.has(a.staffPersonId)) people.set(a.staffPersonId, a.staffPersonName || 'Nombre no disponible'); });
  const resourceTypes = [...new Map(data.resources.map(r => [r.typeId, r.type.name])).entries()];
  const sections = ['Mañana', 'Mediodía', 'Tarde', 'Sin horario confirmado'].map(label => ({ label, entries: projection.entries.filter(({ task }) => {
    const minute = hhmmToMinutes(task.startPlanned);
    return label === 'Sin horario confirmado' ? minute === null : minute !== null && (label === 'Mañana' ? minute < 720 : label === 'Mediodía' ? minute >= 720 && minute < 960 : minute >= 960);
  }) })).filter(section => section.entries.length);
  const copySummary = async () => {
    try { await navigator.clipboard.writeText(callSheetSummary(title, date, projection, data)); setCopyMessage('Resumen de esta hoja copiado.'); }
    catch { setCopyMessage('No se pudo copiar. Usa la impresión de esta hoja.'); }
  };
  const print = () => { document.title = `Hoja del día · ${date} · ${title}`; window.print(); };

  return <div className={`call-sheet mx-auto max-w-5xl space-y-4 pb-8 ${printMode ? 'print-mode' : ''}`} data-testid="call-sheet">
    <div className="no-print rounded-xl border bg-card p-4 space-y-4">
      <h1 className="text-2xl font-bold">Hoja del día</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Jornada<select aria-label="Jornada" className={selectClass} value={String(plan.id)} onChange={e => onPlanChange(e.target.value)}>{plans.map(p => <option key={p.id} value={p.id}>{String(p.date).slice(0, 10)} · {p.name || 'Jornada'}</option>)}</select></label>
        <label className="space-y-1 text-sm">Destinatario<select aria-label="Destinatario" className={selectClass} value={effectiveSelection} onChange={e => { setSelection(e.target.value); setCopyMessage(''); }}>
          <option value="mine">Mi hoja</option><option value="general">Vista general</option>
          {canPreview && <>
            <optgroup label="Por rol operativo"><option value="role:production">Producción / ayudante</option><option value="role:editorial">Redacción / Reality</option><option value="role:realization">Realización · relación no disponible</option></optgroup>
            {resourceTypes.length > 0 && <optgroup label="Por función de recurso">{resourceTypes.map(([typeId, name]) => <option key={typeId} value={`resource-type:${typeId}`}>{name}</option>)}</optgroup>}
            <optgroup label="Por persona">{[...people].sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([personId, name]) => <option key={personId} value={`person:${personId}`}>{name}</option>)}</optgroup>
            <optgroup label="Por recurso nominal">{data.resources.filter(r => r.planId === plan.id).map(r => <option key={r.id} value={`resource:${r.id}`}>{r.name} · {r.type.name}</option>)}</optgroup>
            <optgroup label="Por plató">{data.zones.map(z => <option key={z.id} value={`zone:${z.id}`}>{z.name}</option>)}</optgroup>
            <optgroup label="Por espacio">{data.daySpaces.map(s => <option key={s.spaceId} value={`space:${s.spaceId}`}>{data.spaces.find(c => c.id === s.spaceId)?.name || 'Nombre no disponible'}</option>)}</optgroup>
          </>}
        </select></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" aria-pressed={compact} onClick={() => setCompact(v => !v)}>{compact ? 'Ver detallado' : 'Ver compacto'}</Button>
        <Button variant="outline" aria-pressed={printMode} onClick={() => setPrintMode(v => !v)}>Modo impresión</Button>
        <Button onClick={print}>Imprimir</Button>
        <Button variant="outline" onClick={() => readLocal('callSheetPdfHelpDismissed') === '1' ? print() : setPdfHelpOpen(true)}>Exportar PDF</Button>
        <Button variant="outline" onClick={copySummary}>Copiar resumen</Button>
        <Button variant="ghost" onClick={onRefresh}>Actualizar datos</Button>
      </div>
      <p role="status" className="text-sm">{copyMessage}</p>
      <p className="text-xs text-muted-foreground">Acceso de la cuenta: {roleLabels[identity.role]}. Las perspectivas de lectura no modifican tus permisos.</p>
    </div>

    <header className="rounded-xl border bg-card p-4 space-y-2" data-testid="sheet-header">
      <p className="text-sm text-muted-foreground">Hoja del día · {date} · {plan.name || 'Jornada'}</p>
      <h2 className="text-xl font-semibold break-words">{title}</h2>
      <Badge variant="secondary">{preview ? 'Vista previa de Producción · solo lectura' : 'Solo lectura'}</Badge>
      <p className="text-sm">Horario global previsto: {formatRange(plan.workStart, plan.workEnd)} · {tasks.length} {tasks.length === 1 ? 'actividad' : 'actividades'} de esta hoja</p>
      <p className="text-sm">Función operativa verificada: {[...functions, ...projection.recipientResources.map(r => r.type.name)].join(', ') || 'Sin función confirmada para este destinatario'}</p>
      <p className="text-xs text-muted-foreground">Planning guardado y asignaciones de la jornada · consulta {new Date(updatedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} (Madrid). Los nombres proceden del catálogo.</p>
      <p className="text-xs text-muted-foreground">Las ubicaciones y el orden son previstos; no acreditan presencia física, traslados ni retrasos.</p>
    </header>

    <section className="rounded-xl border bg-card p-4 space-y-2" aria-label="Briefing">
      <h3 className="font-semibold">Briefing y asignaciones de esta hoja</h3>
      {!linked && target.kind === 'general' && <p className="text-sm">Sin vínculo personal o de recurso confirmado. Estás consultando la vista general autorizada.</p>}
      {projection.warnings.map(warning => <p className="text-sm text-amber-800 dark:text-amber-300" key={warning}>{warning}</p>)}
      {assignments.length > 0 && <details><summary className="cursor-pointer text-sm">Ámbitos y funciones efectivos ({assignments.length})</summary><ul className="mt-2 space-y-1 text-sm">{assignments.map(a => <li key={a.id}>{a.staffPersonName || people.get(a.staffPersonId)} · {staffRoleLabel(a.staffRole)} · {assignmentLabel(a, data)}{['itinerant_team', 'reality_team'].includes(a.scopeType) ? ' · Asignación no verificable' : ''}</li>)}</ul></details>}
      {next && <p className="text-sm">Próxima pendiente en orden previsto: {formatRange(next.startPlanned, next.endPlanned)} · {sheetTaskName(next)}.</p>}
      {!tasks.length && <p className="text-sm" data-testid="sheet-empty">No hay actividades verificables para esta selección en esta jornada.</p>}
    </section>

    {sections.map(({ label, entries }) => <section key={label} className="sheet-agenda space-y-2" aria-label={label}>
      <h3 className="font-semibold">{label}</h3>
      {entries.map(({ task, reasons, resources }) => <article key={task.id} data-testid={`sheet-task-${task.id}`} className={`rounded-lg border bg-card p-3 break-words ${compact ? 'text-sm' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-medium">{sheetTaskName(task)}</h4><span className="font-mono text-sm">{formatRange(task.startPlanned, task.endPlanned)}</span></div>
        <p className="text-sm">Ubicación prevista: {sheetLocation(task, data)}{task.locationLabel && (task.spaceId || task.zoneId) ? ` · ${task.locationLabel}` : ''}</p>
        <p className="text-sm">Participante: {data.contestants.find(c => c.id === task.contestantId)?.name || 'Sin participante confirmado'}</p>
        <div className="my-2 flex flex-wrap gap-1"><Badge variant="outline">{statusLabels[task.status || ''] || 'Estado no disponible'}</Badge>{sheetSimultaneous(task, tasks).length > 0 && <Badge variant="secondary">Coincide con {sheetSimultaneous(task, tasks).length} {sheetSimultaneous(task, tasks).length === 1 ? 'actividad' : 'actividades'} de esta hoja</Badge>}</div>
        <p className="text-sm">Recursos nominales efectivos: {resources.map(r => r.name).join(', ') || 'Sin recurso nominal confirmado'}</p>
        {(task.startReal || task.endReal) && <p className="text-sm">Ejecución registrada: {formatRange(task.startReal, task.endReal)}</p>}
        {!compact && <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {reasons.length > 0 && <p>Incluida por: {reasons.join(' · ')}</p>}
          {(task.camerasOverride ?? task.template?.defaultCameras) != null && <p>Necesidad de cámaras declarada: {task.camerasOverride ?? task.template?.defaultCameras} (no identifica operador).</p>}
          {[task.comment1Text, task.comment2Text].filter(Boolean).map((text, index) => <p key={index}>Nota compartida de actividad: {text}</p>)}
        </div>}
      </article>)}
    </section>)}

    <LocalSheetNotes key={`${userId}:${plan.id}:${effectiveSelection}`} noteKey={`call-sheet-notes-v2:${userId}:${plan.id}:${effectiveSelection}`} planId={plan.id} />
    <Dialog open={pdfHelpOpen} onOpenChange={setPdfHelpOpen}><DialogContent className="no-print"><DialogHeader><DialogTitle>Exportar esta hoja a PDF</DialogTitle><DialogDescription>Se imprimirá {title}, con fecha {date}. Selecciona “Guardar como PDF”, tamaño A4 y escala ajustar en el diálogo de impresión.</DialogDescription></DialogHeader><DialogFooter>
      <Button variant="outline" onClick={() => setPdfHelpOpen(false)}>Cerrar</Button>
      <Button variant="outline" onClick={() => { try { localStorage.setItem('callSheetPdfHelpDismissed', '1'); } catch {} setPdfHelpOpen(false); print(); }}>No volver a mostrar e imprimir</Button>
      <Button onClick={() => { setPdfHelpOpen(false); print(); }}>Continuar</Button>
    </DialogFooter></DialogContent></Dialog>
  </div>;
}

function LocalSheetNotes({ noteKey, planId }: { noteKey: string; planId: number }) {
  const [notes, setNotes] = useState(() => readLocal(noteKey));
  const [saveError, setSaveError] = useState(false);
  const legacy = legacyRoles.map(role => ({ role, text: readLocal(`call-sheet-notes-${planId}-${role}`) })).filter(note => note.text);
  return <section className="rounded-xl border bg-card p-4 space-y-2">
    <h3 className="font-semibold">Notas locales de esta cuenta sobre esta hoja</h3>
    <p className="text-xs text-muted-foreground">Solo en este navegador. No son compartidas ni se escriben como el destinatario de la vista previa.</p>
    <Textarea aria-label="Notas locales de esta hoja" className="no-print" value={notes} onChange={event => {
      const value = event.target.value; setNotes(value);
      try { localStorage.setItem(noteKey, value); setSaveError(false); } catch { setSaveError(true); }
    }} />
    {saveError && <p role="alert" className="text-sm">No se han podido guardar las notas en este navegador.</p>}
    <p className="print-only whitespace-pre-wrap break-words text-sm">{notes || 'Sin notas locales para esta hoja.'}</p>
    {legacy.length > 0 && <details className="no-print text-sm"><summary>Notas locales anteriores por enfoque (conservadas, sin cuenta ni destinatario confirmados)</summary>{legacy.map(note => <div key={note.role} className="mt-2"><strong>{note.role}</strong><p className="whitespace-pre-wrap break-words">{note.text}</p></div>)}</details>}
  </section>;
}
