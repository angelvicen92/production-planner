import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ExecutionContext } from '@shared/execution';
import { executionClockCurrent } from '@shared/execution';
import type { ExecutionTask } from '@/lib/day-execution-view';
import { apiRequest } from '@/lib/api';
import { canCorrectExecutionTime, completeExecutionInstant, formatCorrectionInstant, madridWallTime, resolveMadridCorrection, type ExecutionHistory } from '@/lib/execution-time-correction';
import { getTaskName } from '@/lib/lookups';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const states: Record<string, string> = { in_progress: 'En curso', interrupted: 'Interrumpida', done: 'Completada', cancelled: 'Cancelada' };

export function TimeCorrectionDialog({ task, planDate, contestant, context, online, dataCurrent, refresh, onClose, onSaved }: {
  task: ExecutionTask; planDate: string; contestant: string; context?: ExecutionContext; online: boolean; dataCurrent: boolean;
  refresh: () => Promise<unknown>; onClose: () => void; onSaved: () => void;
}) {
  // This snapshot came from the task displayed in Mi Día, never from history or
  // a just-in-time version query. Polls must not replace a form's precondition.
  const [observed, setObserved] = useState(() => ({ ...task }));
  const [field, setField] = useState<'start' | 'end'>('start');
  const [time, setTime] = useState(() => madridWallTime(observed.startRealAt ?? '').slice(11));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const pressing = useRef(false);
  const history = useQuery<ExecutionHistory>({
    queryKey: [`/api/tasks/${task.id}/execution-history`],
    queryFn: ({ signal }) => apiRequest('GET', `/api/tasks/${task.id}/execution-history`, undefined, { signal }),
    enabled: showHistory && online, retry: false, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const original = field === 'start' ? observed.startRealAt : observed.endRealAt;
  const resolved = resolveMadridCorrection(planDate, time);
  // The control edits whole seconds. Merely typing a reason must not round a
  // server timestamp's fractional seconds into a seemingly unchanged correction.
  const unchanged = Boolean(resolved.realAt && madridWallTime(resolved.realAt) === madridWallTime(original ?? ''));
  const allowed = canCorrectExecutionTime(task, context) && executionClockCurrent(task, context?.clock);
  const blocked = !online ? 'Sin conexión. Espera para guardar la rectificación.' : !dataCurrent ? 'No se han podido actualizar los datos. Actualiza la agenda antes de guardar.' : !allowed ? 'No se puede corregir con la autoridad o el reloj actuales. Consulta con Producción.' : '';
  const validation = resolved.error || (unchanged ? 'La nueva hora es igual a la registrada.' : '');
  const selectField = (value: 'start' | 'end') => {
    setField(value); setTime(madridWallTime((value === 'start' ? observed.startRealAt : observed.endRealAt) ?? '').slice(11)); setError('');
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pressing.current || pending || needsReview || blocked || validation || !reason.trim() || reason.trim().length > 240 || !resolved.realAt) return;
    pressing.current = true; setPending(true); setError('');
    try {
      const result = await apiRequest<ExecutionTask>('PATCH', `/api/tasks/${observed.id}/real-time`, { field, realAt: resolved.realAt, reason: reason.trim(), expectedVersion: observed.executionVersion });
      if (result.id !== observed.id || result.executionVersion !== observed.executionVersion! + 1 || Date.parse((field === 'start' ? result.startRealAt : result.endRealAt) ?? '') !== Date.parse(resolved.realAt)) throw new Error('Unconfirmed response');
      // Success is only reported after a confirmed server response. No
      // optimistic timestamps or synthetic audit entries are ever installed.
      await refresh(); onSaved();
    } catch (failure: any) {
      const status = failure?.status;
      setError(status === 409 ? `El registro ha cambiado o la hora no es compatible. ${failure.message} Revisa los datos actuales antes de volver a confirmar.`
        : status === 403 || status === 401 ? 'Ya no tienes permiso para corregir esta actividad. No se confirmó ningún cambio.'
        : status === 400 ? 'No se pudo guardar. Revisa la hora y el motivo (1–240 caracteres).'
        : 'No se recibió confirmación del servidor. Actualiza los datos y consulta el historial antes de reintentar.');
      setNeedsReview(status !== 400);
      await refresh();
      if (showHistory) await history.refetch();
    } finally { pressing.current = false; setPending(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !pressing.current) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl p-4 sm:p-6" onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onPointerDownOutside={event => { if (pending) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>Corregir hora</DialogTitle><DialogDescription>Rectificación auditada de una hora real. El motivo quedará en el historial.</DialogDescription></DialogHeader>
      <div className="space-y-1"><p className="text-lg font-semibold">{getTaskName(observed)}</p><p className="text-sm text-muted-foreground">{contestant} · {states[observed.status] ?? observed.status}</p></div>
      <form className="space-y-4" onSubmit={save}>
        <div><label htmlFor="correction-field" className="text-sm font-medium">Hora que quieres corregir</label><select id="correction-field" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" value={field} disabled={pending || needsReview} onChange={event => selectField(event.target.value as 'start' | 'end')}><option value="start">Inicio real</option>{completeExecutionInstant(observed.endRealAt) ? <option value="end">Fin real</option> : null}</select></div>
        <p className="rounded-xl bg-muted/50 p-3 text-sm">Hora registrada: <strong className="tabular-nums" data-testid="correction-current">{formatCorrectionInstant(original)}</strong></p>
        <div className="space-y-1"><label htmlFor="correction-time" className="text-sm font-medium">Nueva hora real (con segundos)</label><p className="text-xs text-muted-foreground">Jornada {planDate || 'sin fecha'} · Europe/Madrid</p><input id="correction-time" type="time" step="1" required value={time} onChange={event => setTime(event.target.value)} disabled={pending || needsReview} className="min-h-12 w-full min-w-0 rounded-xl border bg-background px-3 text-lg tabular-nums" aria-describedby="correction-validation" />{validation ? <p id="correction-validation" className="text-sm text-muted-foreground">{validation}</p> : null}</div>
        <div className="space-y-1"><label htmlFor="correction-reason" className="text-sm font-medium">Motivo obligatorio</label><textarea id="correction-reason" required maxLength={240} rows={2} value={reason} onChange={event => setReason(event.target.value)} disabled={pending || needsReview} className="w-full rounded-xl border bg-background p-3 text-base" placeholder="Ej.: registré el inicio dos minutos tarde" /><p className="text-right text-xs text-muted-foreground">{reason.length}/240</p></div>
        {blocked ? <p role="status" className="text-sm text-destructive">{blocked}</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {needsReview ? <div className="space-y-2 rounded-xl border p-3 text-sm"><p>Datos actuales: {states[task.status] ?? task.status}. Inicio: {formatCorrectionInstant(task.startRealAt)}. Fin: {formatCorrectionInstant(task.endRealAt)}.</p><Button type="button" variant="outline" className="min-h-11 w-full" disabled={pending || Boolean(blocked)} onClick={() => { setObserved({ ...task }); setField('start'); setTime(madridWallTime(task.startRealAt ?? '').slice(11)); setReason(''); setNeedsReview(false); setError(''); }}>Usar datos actuales</Button></div> : null}
        <div className="flex flex-col gap-2 sm:flex-row-reverse"><Button type="submit" className="min-h-12 sm:flex-1" disabled={pending || needsReview || Boolean(blocked || validation) || !reason.trim()}>{pending ? 'Guardando…' : 'Confirmar rectificación'}</Button><Button type="button" variant="outline" className="min-h-12 sm:flex-1" disabled={pending} onClick={onClose}>Cancelar</Button></div>
      </form>
      <div className="space-y-3 border-t pt-3"><Button type="button" variant="ghost" className="min-h-11" disabled={!online || history.isFetching} onClick={() => { if (showHistory) void history.refetch(); else setShowHistory(true); }}>Ver historial</Button>
        {showHistory ? <section aria-label="Historial de rectificaciones" className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">Horas operativas corregidas y momento del registro, expresados en Madrid. Las marcas iniciales Start/Finish se conservan.</p>
          {history.isFetching ? <p role="status">Consultando historial…</p> : history.isError ? <p role="alert">No se pudo consultar el historial. Vuelve a pulsar Ver historial.</p> : history.data ? <>
            {history.data.events.filter(event => event.event_kind === 'time_correction').sort((a, b) => a.id - b.id).map(event => <article key={event.id} className="space-y-2 break-words rounded-xl border p-3" data-testid={`time-correction-event-${event.id}`}>
              <p className="font-semibold">{event.corrected_field === 'start' ? 'Inicio real corregido' : 'Fin real corregido'}</p><p>Antes: {formatCorrectionInstant(event.old_value)}<br />Después: {formatCorrectionInstant(event.new_value)}</p><p>Motivo: {event.reason}</p><p className="break-all text-xs text-muted-foreground">{event.changed_by ? `Cuenta registrada: ${event.changed_by}` : 'Autor no identificado en el registro'}</p><p className="text-xs text-muted-foreground">Corrección registrada el {formatCorrectionInstant(event.created_at)}</p>
            </article>)}
            {!history.data.events.some(event => event.event_kind === 'time_correction') ? <p>Sin rectificaciones registradas.</p> : null}
          </> : null}
        </section> : null}
      </div>
    </DialogContent>
  </Dialog>;
}
