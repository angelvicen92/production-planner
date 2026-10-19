import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, MapPin, Play, RefreshCw, ShieldCheck, User, Wifi, WifiOff, PauseCircle, XCircle, Circle } from 'lucide-react';
import { Layout } from '@/components/layout';
import { QueryGuard } from '@/components/QueryGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ActivityInformation } from '@/components/my-day/activity-information';
import { TimeCorrectionDialog } from '@/components/my-day/time-correction-dialog';
import { canCorrectExecutionTime } from '@/lib/execution-time-correction';
import { dayGroups, myDayTasks, myDayScopeChoices, myDayPlanningOrder, myDayStatusTasks, myDayPanel, taskZone, type MyDayStatus, type DaySpace } from '@/lib/my-day-operational';
import { Switch } from '@/components/ui/switch';
import { useDefaultPlanId } from '@/hooks/use-default-plan-id';
import { useMeLinks } from '@/hooks/useMeLinks';
import { usePlanOpsData } from '@/hooks/usePlanOpsData';
import { usePlans } from '@/hooks/use-plans';
import { useContestants } from '@/hooks/use-tasks';
import { usePlanRealtime } from '@/hooks/use-plan-realtime';
import { useExecutionContext } from '@/hooks/use-execution-context';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';
import { buildSpacesById, buildZonesById, getSpaceName, getTaskName, getZoneName } from '@/lib/lookups';
import { madridDate } from '@/lib/control-room-metrics';
import { myDayTemporal } from '@/lib/my-day-temporal';
import { TemporalSignal } from '@/components/my-day/temporal-signal';
import { planQueryKey, planTasksQueryKey, planLocksQueryKey } from '@/lib/plan-query-keys';
import { executionClockCurrent, executionDuration, formatExecutionDuration } from '@shared/execution';

const states = {
  pending: { label: 'Pendiente', Icon: Circle, style: 'text-muted-foreground bg-muted' },
  in_progress: { label: 'En curso', Icon: Play, style: 'text-primary bg-primary/10' },
  done: { label: 'Completada', Icon: CheckCircle2, style: 'text-blue-800 bg-blue-100 dark:text-blue-200 dark:bg-blue-950' },
  interrupted: { label: 'Interrumpida', Icon: PauseCircle, style: 'text-amber-800 bg-amber-100 dark:text-amber-200 dark:bg-amber-950' },
  cancelled: { label: 'Cancelada', Icon: XCircle, style: 'text-rose-800 bg-rose-100 dark:text-rose-200 dark:bg-rose-950' },
};
function Status({ status }: { status: keyof typeof states }) {
  const { label, Icon, style } = states[status] ?? states.pending;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${style}`}><Icon className="h-3.5 w-3.5" />{label}</span>;
}
function dayLabel(value: unknown) {
  const date = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeZone: 'Europe/Madrid' }).format(new Date(`${date}T12:00:00Z`)) : 'Fecha por definir';
}

export default function MyDayPage() {
  const plansQ = usePlans();
  const plans = plansQ.data ?? [];
  const [planId, setPlanId] = useState(() => new URLSearchParams(window.location.search).get('plan') ?? '');
  const [onlyMine, setOnlyMine] = useState(true);
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState('all');
  const [status, setStatus] = useState<MyDayStatus>('all');
  const [lateLimit, setLateLimit] = useState(12);
  const { defaultPlanId } = useDefaultPlanId(plans, planId);
  const selected = plans.find(plan => Number(plan.id) === Number(defaultPlanId));
  const sync = usePlanRealtime({ planId: selected?.id ?? null });
  const poll = sync.online ? (sync.realtimeConnected ? 30000 : 5000) : false;
  const ops = usePlanOpsData(selected?.id, poll);
  const contextQ = useExecutionContext(selected?.id, poll);
  const context = contextQ.data;
  const daySpacesQ = useQuery<DaySpace[]>({
    queryKey: [`/api/plans/${selected?.id}/space-availability`],
    enabled: Boolean(selected?.id),
    queryFn: () => apiRequest('GET', `/api/plans/${selected!.id}/space-availability`),
    refetchInterval: poll,
  });
  const daySpaces = daySpacesQ.data ?? [];
  const peopleQ = useContestants(selected?.id ?? 0);
  const { staffPerson, resourceItem } = useMeLinks();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tick, setTick] = useState(Date.now());
  const pressing = useRef(false);
  const [actionError, setActionError] = useState('');
  const [correctionTaskId, setCorrectionTaskId] = useState<number | null>(null);
  useEffect(() => { const timer = window.setInterval(() => setTick(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { setActionError(''); setSearch(''); setFocus('all'); setStatus('all'); setLateLimit(12); setOnlyMine(true); setCorrectionTaskId(null); }, [selected?.id]);
  const nowMs = context ? Date.parse(context.clock.operationalAt) + Math.max(0, tick - contextQ.dataUpdatedAt) : NaN;
  const clockLabel = Number.isFinite(nowMs) ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(nowMs)) : '—';
  const selectedDate = String(selected?.date ?? '').slice(0, 10);
  const sameOperationalDay = madridDate(nowMs) === selectedDate;
  const zones = useMemo(() => buildZonesById(ops.data.zones), [ops.data.zones]);
  const spaces = useMemo(() => buildSpacesById(ops.data.spaces), [ops.data.spaces]);
  const permissions = new Map(context?.tasks.map(task => [task.taskId, task]) ?? []);
  const tasks = useMemo(() => myDayPlanningOrder(ops.data.tasks, selectedDate), [ops.data.tasks, selectedDate]);
  const scopeChoices = myDayScopeChoices(tasks, context, daySpaces, zones, spaces, onlyMine);
  const effectiveFocus = scopeChoices.some(choice => choice.value === focus) ? focus : 'all';
  const scoped = myDayTasks(tasks, context, onlyMine, effectiveFocus, daySpaces);
  const contestants = new Map((peopleQ.data ?? []).map((person: any) => [Number(person.id), person.name]));
  const location = (task: any) => {
    const zoneId = taskZone(task, daySpaces);
    return task.locationLabel || [zoneId ? getZoneName(zoneId, zones) : '', task.spaceId ? getSpaceName(task.spaceId, spaces) : ''].filter(Boolean).join(' · ') || 'Ubicación por confirmar';
  };
  const talent = (task: any) => task.contestant?.name ?? contestants.get(Number(task.contestantId)) ?? (task.contestantId ? 'Persona por confirmar' : 'Actividad de equipo');
  const searched = scoped.filter(task => `${getTaskName(task)} ${talent(task)} ${location(task)}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));
  const visible = myDayStatusTasks(searched, status);
  const panel = myDayPanel(visible, selectedDate, nowMs, context, sync.online);
  const lateCount = panel.late.reduce((count, slot) => count + slot.tasks.length, 0);
  const shownLate = new Set(panel.late.flatMap(slot => slot.tasks).slice(0, lateLimit).map(task => task.id));
  useEffect(() => { setLateLimit(12); }, [status, search, onlyMine, effectiveFocus]);
  const invalidate = async () => {
    if (!selected) return;
    await Promise.all([planQueryKey(selected.id), planTasksQueryKey(selected.id), planLocksQueryKey(selected.id), [`/api/plans/${selected.id}/execution`]].map(queryKey => queryClient.invalidateQueries({ queryKey })));
  };
  const mutation = useMutation({
    mutationFn: (task: any) => apiRequest('PATCH', `/api/tasks/${task.id}/status`, { status: task.status === 'pending' ? 'in_progress' : 'done', expectedStatus: task.status, expectedVersion: task.executionVersion }),
    onSuccess: (_result, task) => { setActionError(''); toast({ title: task.status === 'pending' ? 'Actividad iniciada' : 'Actividad finalizada', description: 'Registro guardado por el servidor.' }); },
    onError: (error: any) => { const message = error?.status ? error.message : 'No se recibió confirmación. Actualiza la agenda antes de reintentar.'; setActionError(message); toast({ title: 'No se confirmó la acción', description: message, variant: 'destructive' }); },
    onSettled: async () => { await invalidate(); pressing.current = false; },
  });
  const canAct = (task: any) => Boolean(executionClockCurrent(task, context?.clock) && sync.online && !ops.error && !contextQ.error && permissions.get(task.id)?.canExecute && ['pending', 'in_progress'].includes(task.status));
  const act = (task: any) => { if (pressing.current || mutation.isPending || !canAct(task)) return; pressing.current = true; mutation.mutate(task); };
  const actions = (task: any, compact = false) => canAct(task) ? <Button className={`bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 min-h-11 h-auto whitespace-normal rounded-xl ${compact ? 'w-full' : ''}`} disabled={mutation.isPending} onClick={() => act(task)} aria-label={`${task.status === 'pending' ? 'Iniciar' : 'Finalizar'} ${getTaskName(task)}`}>
    {task.status === 'pending' ? <Play className="mr-2 h-5 w-5" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}{mutation.isPending && mutation.variables?.id === task.id ? 'Guardando…' : task.status === 'pending' ? 'INICIAR ACTIVIDAD' : 'FINALIZAR ACTIVIDAD'}
  </Button> : ['pending', 'in_progress'].includes(task.status) ? <p className="flex items-start gap-2 rounded-xl border p-3 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" />{!executionClockCurrent(task, context?.clock) ? 'El reloj cambió durante la actividad. Producción debe revisar el registro.' : !sync.online ? 'Sin conexión. Espera para registrar la actividad.' : !context?.planningReady && task.status === 'pending' ? 'Pendiente de aceptación del planning completo.' : context?.role === 'viewer' ? 'Tu acceso permite consultar la agenda.' : 'Sin autoridad operativa demostrada para esta actividad.'}</p> : null;
  const information = (task: any) => <ActivityInformation task={task} allTasks={tasks} nowMs={nowMs} clock={context?.clock} resources={permissions.get(task.id)?.resources ?? []} location={location} temporal={{ planDate: selectedDate, context, online: sync.online }} />;
  const correctionAction = (task: any) => canCorrectExecutionTime(task, context) ? <Button variant="ghost" className="min-h-11" disabled={!sync.online || Boolean(ops.error || contextQ.error) || mutation.isPending} onClick={() => setCorrectionTaskId(task.id)}>Corregir hora</Button> : null;
  const correctionTask = tasks.find(task => task.id === correctionTaskId);
  const loading = ops.isLoading || contextQ.isLoading || peopleQ.isLoading || daySpacesQ.isLoading;
  const error = ops.error ?? contextQ.error ?? peopleQ.error ?? daySpacesQ.error;
  const linkedDay = useRef<number | undefined>();
  useEffect(() => {
    if (!selected || loading || error || linkedDay.current === selected.id) return;
    linkedDay.current = selected.id;
    const target = window.location.hash.slice(1);
    if (!/^agenda-task-\d+$/.test(target)) return;
    const frame = requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(frame);
  }, [selected?.id, loading, error]);
  const compactCard = (task: any, delaySeconds?: number) => {
    const temporal = myDayTemporal(task, selectedDate, nowMs, context, sync.online);
    const duration = temporal && ['normal', 'ending', 'overrun'].includes(temporal.kind) ? executionDuration(task, nowMs, context?.clock) : null;
    return <article key={task.id} data-testid={`execution-task-${task.id}`} className="min-w-0 space-y-3 break-words rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-sm font-semibold">{task.startPlanned ?? 'Sin horario'}–{task.endPlanned ?? '—'}</p><Status status={task.status} /></div>
      <div><h3 className="text-lg font-semibold">{getTaskName(task)}</h3><p className="mt-1 text-sm text-muted-foreground">{talent(task)}</p></div>
      <p className="flex items-start gap-2 text-sm"><MapPin className="h-4 w-4 shrink-0" />{location(task)}</p>
      {task.status === 'in_progress' ? <><p className="text-sm">Tiempo activo: <span className="font-mono font-semibold" data-testid="execution-timer">{formatExecutionDuration(duration)}</span></p><TemporalSignal signal={temporal} /></> : null}
      {delaySeconds !== undefined ? <p className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" />Retraso: {formatExecutionDuration(delaySeconds)}</p> : null}
      {actions(task, true)}
      {correctionAction(task)}
      <details><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary">Ver detalle de la actividad</summary>{information(task)}</details>
    </article>;
  };
  if (plansQ.isLoading || plansQ.error) return <Layout><QueryGuard isLoading={plansQ.isLoading} isError={Boolean(plansQ.error)} error={plansQ.error} loadingText="Preparando tu jornada…" onRetry={plansQ.refetch} /></Layout>;
  if (!selected) return <Layout><div className="rounded-3xl border bg-card p-8"><Clock className="mb-4 h-8 w-8 text-primary" /><h1 className="text-2xl font-semibold">Tu próxima jornada empieza aquí</h1><p className="mt-2 text-muted-foreground">Todavía no hay planning disponible.</p><Link className="mt-5 inline-block text-primary underline" href="/plans">Ver jornadas</Link></div></Layout>;
  return <Layout><div className="mx-auto max-w-5xl space-y-7 pb-12 text-foreground" data-testid="my-day-execution">
    <header className="space-y-3 rounded-3xl border bg-card p-4 sm:space-y-5 sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-700 dark:text-blue-300 sm:text-xs">OPTIPLAN · EN PLATÓ</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Mi Día</h1>{plans.length === 1 ? <p className="mt-2 text-sm capitalize text-muted-foreground">{dayLabel(selected.date)}</p> : null}</div><div className="text-right"><p className="font-mono text-2xl font-semibold tabular-nums sm:text-3xl">{clockLabel}</p><p className="text-xs text-muted-foreground">{context?.clock.mode === 'manual' ? 'Reloj simulado autorizado' : 'Hora operativa · Madrid'}</p></div></div>
      {plans.length > 1 ? <Select value={String(selected.id)} onValueChange={setPlanId}><SelectTrigger className="min-h-11 rounded-xl" aria-label="Seleccionar jornada"><SelectValue /></SelectTrigger><SelectContent>{plans.map(plan => <SelectItem key={plan.id} value={String(plan.id)}>{dayLabel(plan.date)}</SelectItem>)}</SelectContent></Select> : null}
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline"><User className="mr-1 h-3 w-3" />{staffPerson?.name ?? resourceItem?.name ?? (context?.role === 'production' || context?.role === 'admin' ? 'Producción · ámbito global' : 'Agenda de consulta')}</Badge><Badge variant="secondary">{context?.planningState === 'published' ? 'Planning publicado' : context?.planningReady ? 'Planning aceptado' : 'Planning pendiente'}</Badge>{context?.draftPending ? <Badge variant="outline">Borrador con cambios pendientes</Badge> : null}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">{sync.online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{!sync.online ? 'Sin conexión · datos conservados' : error ? 'Actualización no disponible' : ops.isFetching || contextQ.isFetching ? 'Actualizando…' : sync.realtimeConnected ? 'Realtime conectado · comprobación cada 30 s' : 'Consulta cada 5 s · Realtime no disponible'}</p><Button variant="ghost" className="min-h-11" disabled={!sync.online || ops.isFetching} onClick={() => { void ops.refetch(); void contextQ.refetch(); void daySpacesQ.refetch(); }}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button></div>
      {context?.hasScope ? <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={onlyMine} onCheckedChange={setOnlyMine} />Solo mi ámbito asignado</label> : null}
      {context && (context.hasScope || ['production', 'admin'].includes(context.role ?? '')) ? <div className="space-y-2"><label htmlFor="my-day-focus" className="text-sm font-medium">Concentrar vista</label><Select value={effectiveFocus} onValueChange={setFocus}><SelectTrigger id="my-day-focus" className="min-h-11 w-full min-w-0 [&>span]:truncate" aria-label="Concentrar vista"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{context.hasScope && onlyMine ? 'Todo mi ámbito' : 'Toda la jornada'}</SelectItem>{scopeChoices.map(choice => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Filtra las actividades del plató o espacio elegido dentro del ámbito visual. Los permisos de ejecución se conservan.</p></div> : null}
      {context && (!onlyMine || !context.hasScope) ? <p className="text-sm text-muted-foreground">{['admin', 'production'].includes(context.role ?? '') ? 'Ámbito global de Producción · filtro visual de jornada.' : `Agenda de consulta de toda la jornada${!context.hasScope ? ' · sin ámbito operativo asignado' : ''}.`}</p> : null}
      {context && !sameOperationalDay ? <p className="text-sm text-amber-800 dark:text-amber-300">La hora operativa corresponde a otra fecha. Confirma la jornada con Producción; no se calcula retraso sobre este planning.</p> : null}
    </header>
    {loading || error ? <QueryGuard isLoading={loading} isError={Boolean(error)} error={error} loadingText="Preparando tu agenda…" onRetry={() => { void ops.refetch(); void contextQ.refetch(); void daySpacesQ.refetch(); void peopleQ.refetch(); }} /> : null}
    {actionError ? <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{actionError}</div> : null}
    {!loading && context && !context.hasScope && !['admin', 'production'].includes(context.role ?? '') ? <p className="rounded-2xl border bg-muted/50 p-4 text-sm text-muted-foreground">Sin ámbito operativo de Producción en esta jornada. Las asignaciones de Redacción son informativas. Revisa Plan &gt; Roles con Producción si necesitas registrar actividades.</p> : null}
    {!loading && !error ? <>
      <div className="space-y-3">
        <input className="min-h-11 w-full rounded-xl border bg-background px-4 text-sm" aria-label="Buscar actividad" placeholder="Buscar actividad, persona o ubicación" value={search} onChange={event => setSearch(event.target.value)} />
        <nav aria-label="Estados de la jornada" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Button variant={status === 'all' ? 'default' : 'outline'} aria-pressed={status === 'all'} className="min-h-11 h-auto whitespace-normal" onClick={() => setStatus('all')}>Todas ({searched.length})</Button>
          {dayGroups.map(group => <Button key={group.key} variant={status === group.key ? 'default' : 'outline'} aria-pressed={status === group.key} className="min-h-11 h-auto whitespace-normal" onClick={() => setStatus(group.key)}>{group.label} ({myDayStatusTasks(searched, group.key).length})</Button>)}
        </nav>
      </div>
      <div className="space-y-6" data-testid="operational-panel">
        {panel.running.length ? <section aria-labelledby="operational-running" className="space-y-3"><h2 id="operational-running" className="text-xl font-semibold">En curso ({panel.running.length})</h2><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{panel.running.map(task => compactCard(task))}</div></section> : null}
        {lateCount ? <section aria-labelledby="operational-late" className="space-y-3" data-testid="operational-late">
          <h2 id="operational-late" className="text-xl font-semibold text-amber-800 dark:text-amber-300">Retrasadas ({lateCount})</h2>
          {panel.late.map(slot => {
            const shown = slot.tasks.filter(task => shownLate.has(task.id));
            return shown.length ? <div key={slot.at} className="space-y-2"><h3 className="text-sm font-semibold">Inicio previsto {slot.tasks[0].startPlanned} · {slot.tasks.length} actividades{shown.length < slot.tasks.length ? ` · ${shown.length} visibles` : ''}</h3><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{shown.map(task => compactCard(task, slot.delaySeconds))}</div></div> : null;
          })}
          {lateCount > shownLate.size ? <Button variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={() => setLateLimit(limit => limit + 12)}>Mostrar más retrasadas ({lateCount - shownLate.size} restantes)</Button> : null}
        </section> : null}
        {panel.upcoming ? <section aria-labelledby="operational-upcoming" className="space-y-3" data-testid="operational-upcoming"><h2 id="operational-upcoming" className="text-xl font-semibold">Próximas · {panel.upcoming.tasks[0].startPlanned} ({panel.upcoming.tasks.length})</h2><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{panel.upcoming.tasks.map(task => compactCard(task))}</div></section> : null}
        {panel.uncomparable ? <p className="rounded-xl border p-3 text-sm text-muted-foreground">{panel.uncomparable} pendientes sin comparación temporal fiable. Consulta sus horarios en la agenda; no se calcula retraso sin fecha, horario, planning y reloj comparables y conexión.</p> : null}
        {!visible.length ? <div role="status" className="rounded-2xl border border-dashed p-6 text-center"><p>Sin actividades para los filtros seleccionados.</p><Button variant="outline" className="mt-3 min-h-11" onClick={() => { setStatus('all'); setSearch(''); }}>Ver todas las actividades del ámbito</Button></div> : null}
      </div>
      <section className="space-y-4"><div><h2 className="text-2xl font-semibold tracking-tight">Agenda de la jornada</h2><p className="mt-1 text-sm text-muted-foreground">{myDayStatusTasks(searched, 'done').length} completadas · {visible.length} actividades visibles de {searched.length}</p></div>
        <div className="space-y-6">{dayGroups.filter(group => status === 'all' || status === group.key).map(group => {
          const matching = myDayStatusTasks(visible, group.key);
          return <section key={group.key} aria-labelledby={`day-group-${group.key}`} data-testid={`day-group-${group.key}`} className="space-y-3">
            <h3 id={`day-group-${group.key}`} className="text-lg font-semibold">{group.label} <span className="text-muted-foreground">({matching.length})</span></h3>
            {matching.length ? matching.map(task => <article id={`agenda-task-${task.id}`} key={task.id} className="min-w-0 space-y-3 break-words rounded-2xl border bg-card p-4 sm:p-5" data-testid={`agenda-task-${task.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h4 className="text-lg font-semibold">{getTaskName(task)}</h4><p className="mt-1 text-sm text-muted-foreground">{talent(task)}</p><p className="mt-2 flex items-center gap-1.5 text-sm"><MapPin className="h-4 w-4 shrink-0" />{location(task)}</p></div><Status status={task.status as keyof typeof states} /></div>
              {information(task)}
              {['pending', 'in_progress'].includes(task.status) ? actions(task) : null}
              {correctionAction(task)}
            </article>) : <p className="text-sm text-muted-foreground">{search.trim() ? 'Sin coincidencias en este estado.' : 'Sin actividades en este estado.'}</p>}
          </section>;
        })}</div>
      </section>
    </> : null}
    {correctionTask ? <TimeCorrectionDialog key={`${selected.id}-${correctionTask.id}`} task={correctionTask} planDate={selectedDate} contestant={talent(correctionTask)} context={context} online={sync.online} dataCurrent={!ops.error && !contextQ.error} refresh={invalidate} onClose={() => setCorrectionTaskId(null)} onSaved={() => { setCorrectionTaskId(null); toast({ title: 'Hora rectificada', description: 'Corrección y motivo guardados por el servidor.' }); }} /> : null}
  </div></Layout>;
}
