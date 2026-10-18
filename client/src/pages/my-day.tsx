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
import { dayGroups, myDayTasks, myDayScopeChoices, taskZone, type DaySpace } from '@/lib/my-day-operational';
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
import { hhmmToMinutes } from '@/lib/time';
import { planQueryKey, planTasksQueryKey, planLocksQueryKey } from '@/lib/plan-query-keys';
import { executionClockCurrent, madridClockBase } from '@shared/execution';

const states = {
  pending: { label: 'Pendiente', Icon: Circle, style: 'text-muted-foreground bg-muted' },
  in_progress: { label: 'En curso', Icon: Play, style: 'text-emerald-800 bg-emerald-100 dark:text-emerald-200 dark:bg-emerald-950' },
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
function madridDay(value: string | number) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}

export default function MyDayPage() {
  const plansQ = usePlans();
  const plans = plansQ.data ?? [];
  const [planId, setPlanId] = useState(() => new URLSearchParams(window.location.search).get('plan') ?? '');
  const [onlyMine, setOnlyMine] = useState(true);
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState('all');
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
  useEffect(() => { const timer = window.setInterval(() => setTick(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { setActionError(''); setSearch(''); setFocus('all'); }, [selected?.id]);
  const nowMs = context ? Date.parse(context.clock.operationalAt) + Math.max(0, tick - contextQ.dataUpdatedAt) : NaN;
  const clockLabel = Number.isFinite(nowMs) ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(nowMs)) : '—';
  const selectedDate = String(selected?.date ?? '').slice(0, 10);
  const sameOperationalDay = madridDay(nowMs) === selectedDate;
  const nowMinute = sameOperationalDay ? hhmmToMinutes(clockLabel.slice(0, 5)) : null;
  const zones = useMemo(() => buildZonesById(ops.data.zones), [ops.data.zones]);
  const spaces = useMemo(() => buildSpacesById(ops.data.spaces), [ops.data.spaces]);
  const permissions = new Map(context?.tasks.map(task => [task.taskId, task]) ?? []);
  const tasks = useMemo(() => {
    const day = new Date(`${selectedDate}T12:00:00Z`);
    const moment = (task: any) => {
      const actual = Date.parse(task.startRealAt ?? '');
      if (Number.isFinite(actual)) return actual;
      if (!Number.isFinite(day.getTime()) || hhmmToMinutes(task.startPlanned) === null) return Infinity;
      return madridClockBase(task.startPlanned, day).getTime();
    };
    return ops.data.tasks.map(task => ({ task, at: moment(task) })).sort((a, b) => a.at - b.at || a.task.id - b.task.id).map(row => row.task);
  }, [ops.data.tasks, selectedDate]);
  const scopeChoices = myDayScopeChoices(tasks, context, daySpaces, zones, spaces);
  const effectiveFocus = onlyMine && scopeChoices.some(choice => choice.value === focus) ? focus : 'all';
  const visible = myDayTasks(tasks, context, onlyMine, effectiveFocus, daySpaces);
  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (!/^agenda-task-\d+$/.test(target)) return;
    const frame = requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(frame);
  }, [tasks, onlyMine, effectiveFocus]);
  const running = visible.filter(task => task.status === 'in_progress');
  const waiting = visible.filter(task => task.status === 'pending');
  const next = waiting.find(task => permissions.get(task.id)?.canExecute) ?? waiting[0];
  const contestants = new Map((peopleQ.data ?? []).map((person: any) => [Number(person.id), person.name]));
  const location = (task: any) => {
    const zoneId = taskZone(task, daySpaces);
    return task.locationLabel || [zoneId ? getZoneName(zoneId, zones) : '', task.spaceId ? getSpaceName(task.spaceId, spaces) : ''].filter(Boolean).join(' · ') || 'Ubicación por confirmar';
  };
  const talent = (task: any) => task.contestant?.name ?? contestants.get(Number(task.contestantId)) ?? (task.contestantId ? 'Persona por confirmar' : 'Actividad de equipo');
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
  const actions = (task: any, large = false) => canAct(task) ? <Button className={`bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 ${large ? 'h-16 w-full rounded-2xl text-lg font-semibold shadow-sm' : 'min-h-11 rounded-xl'}`} disabled={mutation.isPending} onClick={() => act(task)} aria-label={`${task.status === 'pending' ? 'Iniciar' : 'Finalizar'} ${getTaskName(task)}`}>
    {task.status === 'pending' ? <Play className="mr-2 h-5 w-5" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}{mutation.isPending && mutation.variables?.id === task.id ? 'Guardando…' : task.status === 'pending' ? 'INICIAR ACTIVIDAD' : 'FINALIZAR ACTIVIDAD'}
  </Button> : ['pending', 'in_progress'].includes(task.status) ? <p className="flex items-start gap-2 rounded-xl border p-3 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" />{!executionClockCurrent(task, context?.clock) ? 'El reloj cambió durante la actividad. Producción debe revisar el registro.' : !sync.online ? 'Sin conexión. Espera para registrar la actividad.' : !context?.planningReady && task.status === 'pending' ? 'Pendiente de aceptación del planning completo.' : context?.role === 'viewer' ? 'Tu acceso permite consultar la agenda.' : 'Sin autoridad operativa demostrada para esta actividad.'}</p> : null;
  const information = (task: any) => <ActivityInformation task={task} allTasks={tasks} nowMs={nowMs} clock={context?.clock} resources={permissions.get(task.id)?.resources ?? []} location={location} />;
  const hero = (task: any, heading: string) => {
    const start = hhmmToMinutes(task.startPlanned);
    const late = task.status === 'pending' && start !== null && nowMinute !== null && nowMinute > start;
    const realStart = hhmmToMinutes(task.startReal);
    const deviation = realStart !== null && start !== null && task.startRealAt && madridDay(task.startRealAt) === selectedDate ? realStart - start : null;
    return <article key={task.id} data-testid={`execution-task-${task.id}`} className="overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-sm">
      <div className="h-1.5 bg-primary" /><div className="space-y-4 p-4 sm:space-y-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{heading}</p><Status status={task.status} /></div>
        <div><h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{getTaskName(task)}</h2><p className="mt-2 flex items-center gap-2 text-lg text-muted-foreground"><User className="h-5 w-5" />{talent(task)}</p></div>
        <p className="flex items-center gap-2 text-lg font-medium"><MapPin className="h-5 w-5 text-primary" />{location(task)}</p>
        {information(task)}
        {late ? <p className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="h-4 w-4" />Pendiente desde hace {nowMinute! - start!} min</p> : null}
        {deviation !== null ? <p className="text-sm text-muted-foreground">Inicio {deviation > 0 ? `${deviation} min después` : deviation < 0 ? `${-deviation} min antes` : 'a la hora prevista'} del planning.</p> : null}
        {actions(task, true)}
      </div>
    </article>;
  };
  if (plansQ.isLoading || plansQ.error) return <Layout><QueryGuard isLoading={plansQ.isLoading} isError={Boolean(plansQ.error)} error={plansQ.error} loadingText="Preparando tu jornada…" onRetry={plansQ.refetch} /></Layout>;
  if (!selected) return <Layout><div className="rounded-3xl border bg-card p-8"><Clock className="mb-4 h-8 w-8 text-primary" /><h1 className="text-2xl font-semibold">Tu próxima jornada empieza aquí</h1><p className="mt-2 text-muted-foreground">Todavía no hay planning disponible.</p><Link className="mt-5 inline-block text-primary underline" href="/plans">Ver jornadas</Link></div></Layout>;
  const loading = ops.isLoading || contextQ.isLoading || peopleQ.isLoading || daySpacesQ.isLoading;
  const error = ops.error ?? contextQ.error ?? peopleQ.error ?? daySpacesQ.error;
  return <Layout><div className="mx-auto max-w-5xl space-y-7 pb-12 text-foreground" data-testid="my-day-execution">
    <header className="space-y-3 rounded-3xl border bg-card p-4 sm:space-y-5 sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-700 dark:text-blue-300 sm:text-xs">OPTIPLAN · EN PLATÓ</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Mi Día</h1>{plans.length === 1 ? <p className="mt-2 text-sm capitalize text-muted-foreground">{dayLabel(selected.date)}</p> : null}</div><div className="text-right"><p className="font-mono text-2xl font-semibold tabular-nums sm:text-3xl">{clockLabel}</p><p className="text-xs text-muted-foreground">{context?.clock.mode === 'manual' ? 'Reloj simulado autorizado' : 'Hora operativa · Madrid'}</p></div></div>
      {plans.length > 1 ? <Select value={String(selected.id)} onValueChange={setPlanId}><SelectTrigger className="min-h-11 rounded-xl" aria-label="Seleccionar jornada"><SelectValue /></SelectTrigger><SelectContent>{plans.map(plan => <SelectItem key={plan.id} value={String(plan.id)}>{dayLabel(plan.date)}</SelectItem>)}</SelectContent></Select> : null}
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline"><User className="mr-1 h-3 w-3" />{staffPerson?.name ?? resourceItem?.name ?? (context?.role === 'production' || context?.role === 'admin' ? 'Producción · ámbito global' : 'Agenda de consulta')}</Badge><Badge variant="secondary">{context?.planningState === 'published' ? 'Planning publicado' : context?.planningReady ? 'Planning aceptado' : 'Planning pendiente'}</Badge>{context?.draftPending ? <Badge variant="outline">Borrador con cambios pendientes</Badge> : null}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">{sync.online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{!sync.online ? 'Sin conexión · datos conservados' : error ? 'Actualización no disponible' : ops.isFetching || contextQ.isFetching ? 'Actualizando…' : sync.realtimeConnected ? 'Realtime conectado · comprobación cada 30 s' : 'Consulta cada 5 s · Realtime no disponible'}</p><Button variant="ghost" className="min-h-11" disabled={!sync.online || ops.isFetching} onClick={() => { void ops.refetch(); void contextQ.refetch(); void daySpacesQ.refetch(); }}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button></div>
      {context?.hasScope ? <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={onlyMine} onCheckedChange={setOnlyMine} />Solo mi ámbito asignado</label> : null}
      {context?.hasScope && onlyMine ? <div className="space-y-2"><label htmlFor="my-day-focus" className="text-sm font-medium">Concentrar vista</label><Select value={effectiveFocus} onValueChange={setFocus}><SelectTrigger id="my-day-focus" className="min-h-11 w-full min-w-0 [&>span]:truncate" aria-label="Concentrar vista"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todo mi ámbito</SelectItem>{scopeChoices.map(choice => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Incluye solo tus actividades del plató o espacio elegido.</p></div> : null}
      {context && (!onlyMine || !context.hasScope) ? <p className="text-sm text-muted-foreground">{['admin', 'production'].includes(context.role ?? '') ? 'Ámbito global de Producción · toda la jornada.' : `Agenda de consulta de toda la jornada${!context.hasScope ? ' · sin ámbito operativo asignado' : ''}.`}</p> : null}
      {context && !sameOperationalDay ? <p className="text-sm text-amber-800 dark:text-amber-300">La hora operativa corresponde a otra fecha. Confirma la jornada con Producción; no se calcula retraso sobre este planning.</p> : null}
    </header>
    {loading || error ? <QueryGuard isLoading={loading} isError={Boolean(error)} error={error} loadingText="Preparando tu agenda…" onRetry={() => { void ops.refetch(); void contextQ.refetch(); void daySpacesQ.refetch(); void peopleQ.refetch(); }} /> : null}
    {actionError ? <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{actionError}</div> : null}
    {!loading && context && !context.hasScope && !['admin', 'production'].includes(context.role ?? '') ? <p className="rounded-2xl border bg-muted/50 p-4 text-sm text-muted-foreground">Sin ámbito operativo de Producción en esta jornada. Las asignaciones de Redacción son informativas. Revisa Plan &gt; Roles con Producción si necesitas registrar actividades.</p> : null}
    {!loading && !error ? <>
      {running.length > 1 ? <p className="flex items-center gap-2 text-sm font-medium"><Play className="h-4 w-4 text-primary" />{running.length} actividades en curso en este ámbito</p> : null}
      <nav aria-label="Estados de la jornada" className="grid grid-cols-2 gap-2 sm:grid-cols-4">{dayGroups.map(group => <Button key={group.key} variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={() => document.getElementById(`day-group-${group.key}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>{group.label} ({visible.filter(task => group.statuses.some(status => status === task.status)).length})</Button>)}</nav>
      <div className="grid gap-5">{running.length ? running.map(task => hero(task, 'ACTIVIDAD EN CURSO')) : next ? hero(next, 'PRÓXIMA ACTIVIDAD PENDIENTE') : <div className="rounded-3xl border border-dashed p-8 text-center"><CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-primary" /><h2 className="text-xl font-semibold">{visible.length ? 'Sin actividades pendientes' : 'Sin obligaciones en este ámbito'}</h2><p className="mt-2 text-sm text-muted-foreground">{visible.length ? 'Puedes consultar los registros en tu agenda.' : 'La agenda se actualizará cuando Producción confirme asignaciones.'}</p></div>}</div>
      <section className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-semibold tracking-tight">Agenda de la jornada</h2><p className="mt-1 text-sm text-muted-foreground">{visible.filter(task => task.status === 'done').length} completadas · {visible.length} actividades</p></div><input className="min-h-11 w-full rounded-xl border bg-background px-4 text-sm sm:w-64" aria-label="Buscar actividad" placeholder="Buscar actividad o persona" value={search} onChange={event => setSearch(event.target.value)} /></div>
        <div className="space-y-6">{dayGroups.map(group => {
          const matching = visible.filter(task => group.statuses.some(status => status === task.status) && `${getTaskName(task)} ${talent(task)} ${location(task)}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));
          return <section key={group.key} aria-labelledby={`day-group-${group.key}`} data-testid={`day-group-${group.key}`} className="space-y-3">
            <h3 id={`day-group-${group.key}`} className="text-lg font-semibold">{group.label} <span className="text-muted-foreground">({matching.length})</span></h3>
            {matching.length ? matching.map(task => <article id={`agenda-task-${task.id}`} key={task.id} className="min-w-0 space-y-3 break-words rounded-2xl border bg-card p-4 sm:p-5" data-testid={`agenda-task-${task.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h4 className="text-lg font-semibold">{getTaskName(task)}</h4><p className="mt-1 text-sm text-muted-foreground">{talent(task)}</p><p className="mt-2 flex items-center gap-1.5 text-sm"><MapPin className="h-4 w-4 shrink-0" />{location(task)}</p></div><Status status={task.status as keyof typeof states} /></div>
              {information(task)}
              {['pending', 'in_progress'].includes(task.status) ? actions(task) : null}
            </article>) : <p className="text-sm text-muted-foreground">{search.trim() ? 'Sin coincidencias en este estado.' : 'Sin actividades en este estado.'}</p>}
          </section>;
        })}</div>
      </section>
    </> : null}
  </div></Layout>;
}
