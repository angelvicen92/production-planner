import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Filter, History, MapPin, Plus, Radio, RefreshCw, Search, ShieldCheck, WifiOff } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { usePlans } from '@/hooks/use-plans';
import { useDefaultPlanId } from '@/hooks/use-default-plan-id';
import { incidentsKey, useWarRoom } from '@/hooks/use-war-room';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';
import { readLegacyIncidents } from '@/lib/war-room-store';
import { api, buildUrl } from '@shared/routes';
import { incidentFieldsSchema, incidentTypes, incidentSeverities, incidentStatuses, type Incident, type IncidentFields, type IncidentContext } from '@shared/incidents';

const freshDraft = (): IncidentFields => ({ type: 'other', severity: 'warn', description: '', taskId: null, contestantId: null, zoneId: null, spaceId: null, resourceId: null, responsibleId: null, cause: null, context: null });
const stamp = (value: string) => new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date(value));
function age(value: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000));
  return minutes < 1 ? 'Hace un momento' : minutes < 60 ? `Hace ${minutes} min` : minutes < 1440 ? `Hace ${Math.floor(minutes / 60)} h ${minutes % 60} min` : `Hace ${Math.floor(minutes / 1440)} días`;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1.5 text-sm font-medium"><span>{label}</span>{children}</label>;
}
function Choice({ label, value, onChange, options, blank = 'Sin especificar', disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; blank?: string; disabled?: boolean;
}) {
  return <Field label={label}><select aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
    <option value="">{blank}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select></Field>;
}
const choices = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const options = (rows: { id: number; name: string }[] = []) => rows.map(row => ({ value: String(row.id), label: row.name }));
function State({ incident }: { incident: Incident }) {
  return <div className="flex flex-wrap items-center gap-2"><Badge variant={incident.severity === 'critical' ? 'destructive' : 'secondary'}><AlertTriangle className="mr-1 h-3.5 w-3.5" />{incidentSeverities[incident.severity]}</Badge><Badge variant="outline">{incident.status === 'resolved' && <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}{incidentStatuses[incident.status]}</Badge></div>;
}

export default function WarRoomPage() {
  const plansQ = usePlans();
  const [planId, setPlanId] = useState(() => new URLSearchParams(window.location.search).get('plan') ?? '');
  const { defaultPlanId } = useDefaultPlanId(plansQ.data ?? [], planId);
  const selected = plansQ.data?.find(plan => Number(plan.id) === Number(defaultPlanId));
  const [detailId, setDetailId] = useState<string | null>(null);
  const room = useWarRoom(selected?.id ?? null, detailId);
  const context = room.context.data;
  const incidents = room.list.data ?? [];
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [now, setNow] = useState(Date.now());
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('priority');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [form, setForm] = useState<{ planId: number; id: string | null; version?: number; requestId: string } | null>(null);
  const [draft, setDraft] = useState<IncidentFields>(freshDraft);
  const [action, setAction] = useState<{ incident: Incident; type: 'resolve' | 'reopen' | 'escalate' } | null>(null);
  const [decision, setDecision] = useState('');
  const [saveError, setSaveError] = useState('');
  const suggestionConsumed = useRef(false);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { setFilters({}); setSearch(''); setDetailId(null); setForm(null); setAction(null); setSaveError(''); }, [selected?.id]);
  const legacy = useMemo(() => readLegacyIncidents(selected?.id), [selected?.id]);
  const begin = (incident?: Incident) => {
    if (!selected) return;
    setSaveError(''); setDraft(incident ? incidentFieldsSchema.parse(incident) : freshDraft());
    setForm({ planId: selected.id, id: incident?.id ?? null, version: incident?.version, requestId: crypto.randomUUID() });
  };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!selected || !context || suggestionConsumed.current || params.get('new') !== '1' || params.get('plan') !== String(selected.id)) return;
    suggestionConsumed.current = true;
    if (!context.canCreate) return;
    const task = context.tasks.find(task => String(task.id) === params.get('taskId') && task.canReport);
    const zone = context.zones.find(zone => String(zone.id) === params.get('zoneId'));
    const space = context.spaces.find(space => String(space.id) === params.get('spaceId') && (!zone || space.zoneId === zone.id));
    setDraft({ ...freshDraft(), type: params.get('type') === 'delay' ? 'delay' : 'other', description: (params.get('description') ?? '').slice(0, 4000),
      taskId: task?.id ?? null, contestantId: task?.contestantId ?? null, zoneId: task?.zoneId ?? zone?.id ?? null, spaceId: task?.spaceId ?? space?.id ?? null });
    setForm({ planId: selected.id, id: null, requestId: crypto.randomUUID() });
  }, [selected?.id, context]);
  const save = useMutation({
    mutationFn: async (command: { planId: number; path: string; method: string; body: unknown }) => {
      if (!navigator.onLine) throw new Error('Sin conexión. Tu borrador se conserva; vuelve a intentarlo al recuperar la red.');
      const result = api.incidents.create.responses[201].parse(await apiRequest(command.method, command.path, command.body));
      await queryClient.invalidateQueries({ queryKey: incidentsKey(command.planId) });
      return result;
    },
    onSuccess: result => { setForm(null); setAction(null); setSaveError(''); setDetailId(result.id); toast({ title: 'Guardado en el registro compartido', description: 'Cambio confirmado por el servidor.' }); },
    onError: error => { setSaveError(error instanceof Error ? error.message : 'Guardado no confirmado. Actualiza antes de reintentar.'); if (selected) queryClient.invalidateQueries({ queryKey: incidentsKey(selected.id) }); },
  });
  const submit = () => {
    if (!form) return;
    const parsed = incidentFieldsSchema.safeParse(draft);
    if (!parsed.success) { setSaveError('Escribe una descripción y revisa los campos.'); return; }
    const path = buildUrl(form.id ? api.incidents.update.path : api.incidents.create.path, { planId: form.planId, incidentId: form.id ?? '' });
    save.mutate({ planId: form.planId, path, method: form.id ? 'PATCH' : 'POST', body: form.id ? { ...parsed.data, expectedVersion: form.version } : { ...parsed.data, requestId: form.requestId } });
  };
  const transition = () => {
    if (!action || !decision.trim()) return;
    save.mutate({ planId: action.incident.planId, path: buildUrl(api.incidents[action.type].path, { planId: action.incident.planId, incidentId: action.incident.id }), method: 'POST', body: { expectedVersion: action.incident.version, note: decision.trim() } });
  };
  const startAction = (incident: Incident, type: 'resolve' | 'reopen' | 'escalate') => { setSaveError(''); setDecision(''); setAction({ incident, type }); };
  const visible = incidents.filter(incident => {
    if (search && ![incident.description, incident.authorName, incident.cause, incident.context, incident.resolutionNote, incident.taskName, incident.contestantName, incident.resourceName, incident.responsibleName, incident.zoneName, incident.spaceName].some(value => value?.toLocaleLowerCase().includes(search.toLocaleLowerCase()))) return false;
    return Object.entries(filters).every(([key, value]) => !value || String(incident[key as keyof Incident]) === value);
  }).sort((a, b) => {
    if (sort === 'priority') {
      const rank = (i: Incident) => i.status === 'resolved' ? 3 : i.severity === 'critical' ? 0 : i.status === 'escalated' ? 1 : 2;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
    }
    return (Date.parse(b.createdAt) - Date.parse(a.createdAt)) * (sort === 'oldest' ? -1 : 1) || a.id.localeCompare(b.id);
  });
  const counts = { open: incidents.filter(i => i.status !== 'resolved').length, critical: incidents.filter(i => i.status !== 'resolved' && i.severity === 'critical').length, resolved: incidents.filter(i => i.status === 'resolved').length };
  const confirmed = room.list.isSuccess && !room.list.error;
  const detail = room.detail.data?.incident;
  const refresh = () => { room.list.refetch(); room.context.refetch(); if (detailId) room.detail.refetch(); };
  const refField = (label: string, key: 'zoneId' | 'spaceId' | 'taskId' | 'contestantId' | 'resourceId' | 'responsibleId', rows: { id: number; name: string }[], disabled = false) =>
    <Choice label={label} value={draft[key] === null ? '' : String(draft[key])} options={options(rows)} disabled={disabled} onChange={value => {
      const id = Number(value) || null;
      setDraft(current => {
        if (key === 'taskId') { const task = context?.tasks.find(task => task.id === id); return { ...current, taskId: id, zoneId: task?.zoneId ?? null, spaceId: task?.spaceId ?? null, contestantId: task?.contestantId ?? null, resourceId: null }; }
        if (key === 'zoneId') return { ...current, zoneId: id, spaceId: null };
        if (key === 'spaceId') return { ...current, spaceId: id, zoneId: context?.spaces.find(space => space.id === id)?.zoneId ?? current.zoneId };
        return { ...current, [key]: id };
      });
    }} />;
  const taskLinked = draft.taskId !== null;
  const filterDefinitions = [
    ['status', 'Estado', choices(incidentStatuses)], ['severity', 'Severidad', choices(incidentSeverities)], ['type', 'Tipo', choices(incidentTypes)],
    ['zoneId', 'Plató / zona', options(context?.zones)], ['spaceId', 'Espacio', options(context?.spaces)], ['taskId', 'Tarea', options(context?.tasks)],
    ['contestantId', 'Concursante', options(context?.contestants)], ['resourceId', 'Recurso', options(context?.resources)], ['responsibleId', 'Responsable', options(context?.responsibles)],
  ] as const;

  return <Layout><main className="mx-auto max-w-7xl space-y-5 pb-12 text-foreground" data-testid="war-room">
    <header className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="h-1.5 bg-gradient-to-r from-rose-600 via-orange-400 to-amber-300" />
      <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground"><Radio className="h-4 w-4" />Operación de jornada</div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">War Room</h1><p className="mt-2 text-sm text-muted-foreground">Hechos, decisiones y seguimiento compartidos.</p></div>
        <div className="grid gap-3 sm:grid-cols-[minmax(180px,280px)_auto] sm:items-end">
          <Choice label="Jornada" disabled={save.isPending} value={selected ? String(selected.id) : ''} options={options((plansQ.data ?? []).map(plan => ({ id: plan.id, name: `Jornada ${String(plan.date).slice(0, 10)}` })))} blank="Seleccionar jornada" onChange={value => { setPlanId(value); window.history.replaceState(null, '', `/war-room?plan=${value}`); }} />
          <Button className="h-11 gap-2" onClick={() => begin()} disabled={!context?.canCreate || !room.sync.online || !!room.context.error}><Plus className="h-4 w-4" />Registrar incidencia</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-muted/30 px-5 py-3 text-xs text-muted-foreground sm:px-7" role="status">
        {room.sync.online ? <ShieldCheck className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
        <span>{!room.sync.online ? 'Sin conexión · mostrando la última consulta; no se puede guardar' : room.list.error ? 'No se pudo confirmar la actualización' : room.sync.realtimeConnected ? 'Canal conectado · consulta de respaldo cada 30 s' : 'Realtime no disponible · consulta cada 5 s'}</span>
        <span>Última consulta: {room.list.dataUpdatedAt ? stamp(new Date(room.list.dataUpdatedAt).toISOString()) : 'Pendiente'}</span>
        <Button variant="ghost" size="sm" className="ml-auto h-9 gap-2" onClick={refresh} disabled={!selected || room.list.isFetching || !room.sync.online}><RefreshCw className={`h-4 w-4 ${room.list.isFetching ? 'animate-spin' : ''}`} />Actualizar</Button>
      </div>
    </header>
    {plansQ.error && <ErrorBox message="No se pudieron cargar las jornadas." retry={() => plansQ.refetch()} />}
    {plansQ.isLoading && <p role="status">Cargando jornadas…</p>}
    {!plansQ.isLoading && !selected && <div className="rounded-xl border p-8 text-center">Selecciona una jornada para consultar sus incidencias.</div>}
    {selected && <>
      <div className="grid grid-cols-3 gap-3">{[['Abiertas', counts.open, 'text-foreground'], ['Críticas abiertas', counts.critical, 'text-rose-700 dark:text-rose-300'], ['Resueltas', counts.resolved, 'text-emerald-700 dark:text-emerald-300']].map(([label, value, style]) => <div key={label} className="rounded-xl border bg-card p-4 sm:p-5"><div className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</div><div className={`mt-2 text-3xl font-bold tabular-nums ${style}`}>{confirmed ? value : '—'}</div></div>)}</div>
      {legacy.length > 0 && <aside className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><strong>{legacy.length} anotaciones antiguas en este navegador.</strong> No forman parte del registro compartido ni de sus indicadores. Se conservan sin importar ni borrar.<details className="mt-2"><summary className="cursor-pointer py-2">Consultar archivo local</summary>{legacy.map((item, index) => <p key={index} className="my-2 whitespace-pre-wrap border-t border-amber-400/30 pt-2">{typeof item.text === 'string' ? item.text : 'Anotación sin detalle'}</p>)}</details></aside>}
      {context?.role === 'aux' && <p className="text-sm text-muted-foreground">Tu ámbito: incidencias vinculadas a tareas con asignación nominal vigente. Los cambios de responsable corresponden a Producción.</p>}
      {context?.role === 'viewer' && <p className="text-sm text-muted-foreground">Vista de consulta · la gestión corresponde a los operadores autorizados.</p>}
      {(room.list.error || room.context.error) && <ErrorBox message="No se pudo consultar el registro compartido. Los datos visibles pueden estar desactualizados." retry={refresh} />}
      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-label="Filtros de incidencias">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="relative flex-1"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar incidencias" placeholder="Buscar por descripción, persona o decisión…" className="h-11 pl-9" value={search} onChange={event => setSearch(event.target.value)} /></div><Button variant="outline" className="h-11 gap-2" onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen}><Filter className="h-4 w-4" />Filtros {Object.values(filters).filter(Boolean).length || ''}</Button><Choice label="Orden" value={sort} options={[{ value: 'priority', label: 'Prioridad operativa' }, { value: 'newest', label: 'Más recientes' }, { value: 'oldest', label: 'Más antiguas' }]} onChange={setSort} blank="Elegir orden" /></div>
        {filtersOpen && <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">{filterDefinitions.map(([key, label, rows]) => <Choice key={key} label={label} value={filters[key] ?? ''} options={[...rows]} blank="Todas" onChange={value => setFilters(current => ({ ...current, [key]: value }))} />)}<Button variant="ghost" className="h-11 self-end" onClick={() => { setFilters({}); setSearch(''); }}>Limpiar filtros</Button></div>}
      </section>
      <section aria-label="Registro de incidencias" aria-busy={room.list.isLoading} className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Registro compartido</h2><span className="text-sm text-muted-foreground">{visible.length} de {incidents.length}</span></div>
        {room.list.isLoading && <div role="status" className="rounded-xl border bg-card p-10 text-center">Consultando incidencias confirmadas…</div>}
        {confirmed && visible.length === 0 && <div className="rounded-xl border border-dashed bg-card p-10 text-center"><CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><h3 className="font-semibold">{incidents.length ? 'Sin coincidencias' : 'Sin incidencias registradas'}</h3><p className="mt-2 text-sm text-muted-foreground">{incidents.length ? 'Prueba otros filtros o una búsqueda más amplia.' : 'Las incidencias que registres aquí estarán disponibles para el equipo autorizado.'}</p></div>}
        {visible.map(incident => <article key={incident.id} data-testid={`incident-${incident.id}`} className={`rounded-xl border bg-card p-5 shadow-sm ${incident.status !== 'resolved' && incident.severity === 'critical' ? 'border-l-4 border-l-rose-600' : incident.status === 'resolved' ? 'border-l-4 border-l-emerald-600' : ''}`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{incidentTypes[incident.type]}</div><State incident={incident} /></div><span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={stamp(incident.createdAt)}><Clock3 className="h-3.5 w-3.5" />{age(incident.createdAt, now)}</span></div>
          <h3 className="mt-4 whitespace-pre-wrap break-words text-base font-semibold leading-relaxed">{incident.description}</h3>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground"><span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{[incident.zoneName, incident.spaceName].filter(Boolean).join(' · ') || 'Lugar sin especificar'}</span>{incident.taskName && <span>{incident.taskName}</span>}{incident.contestantName && <span>{incident.contestantName}</span>}{incident.resourceName && <span>Recurso: {incident.resourceName}</span>}</div>
          <div className="mt-3 text-xs text-muted-foreground">Registrada por {incident.authorName}{incident.responsibleName ? ` · Responsable: ${incident.responsibleName}` : ''}</div>
          {incident.resolutionNote && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100"><strong>Decisión:</strong> {incident.resolutionNote}</p>}
          <div className="mt-4 flex flex-wrap gap-2 border-t pt-4"><Button variant="outline" className="min-h-11" onClick={() => setDetailId(incident.id)}>Ver detalle</Button>{incident.canManage && <Button variant={incident.status === 'resolved' ? 'outline' : 'default'} className="min-h-11" disabled={!room.sync.online || !confirmed} onClick={() => startAction(incident, incident.status === 'resolved' ? 'reopen' : 'resolve')}>{incident.status === 'resolved' ? 'Reabrir' : 'Resolver'}</Button>}{incident.taskId && <Button variant="ghost" asChild className="min-h-11"><Link href={`/my-day?plan=${incident.planId}#agenda-task-${incident.taskId}`}>Ir a tarea<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>}</div>
        </article>)}
      </section>
    </>}

    <Sheet open={!!detailId} onOpenChange={open => { if (!open) setDetailId(null); }}><SheetContent className="w-full overflow-y-auto text-foreground sm:max-w-xl">
      <SheetHeader><SheetTitle>Detalle de incidencia</SheetTitle><SheetDescription>Registro confirmado y decisiones conservadas · horas de Madrid.</SheetDescription></SheetHeader>
      {room.detail.isLoading && <p className="py-8" role="status">Cargando histórico…</p>}
      {room.detail.error && <ErrorBox message="No se pudo actualizar el detalle." retry={() => room.detail.refetch()} />}
      {detail && <div className="mt-6 space-y-6"><State incident={detail} /><div><p className="text-sm text-muted-foreground">{incidentTypes[detail.type]}</p><h2 className="mt-2 whitespace-pre-wrap break-words text-xl font-semibold">{detail.description}</h2></div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">{[['Apertura', stamp(detail.createdAt)], ['Último cambio', stamp(detail.updatedAt)], ['Autor', detail.authorName], ['Responsable', detail.responsibleName], ['Plató / zona', detail.zoneName], ['Espacio', detail.spaceName], ['Tarea', detail.taskName], ['Concursante', detail.contestantName], ['Recurso', detail.resourceName], ['Resolución', detail.resolvedAt ? stamp(detail.resolvedAt) : null]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value || 'Sin información'}</dd></div>)}</dl>
        <section className="space-y-3 rounded-xl border bg-muted/30 p-4"><h3 className="font-semibold">Notas operativas</h3><p className="whitespace-pre-wrap text-sm"><strong>Causa comunicada:</strong> {detail.cause || 'Sin información'}</p><p className="whitespace-pre-wrap text-sm"><strong>Contexto:</strong> {detail.context || 'Sin información'}</p><p className="text-xs text-muted-foreground">Aportaciones de los operadores; no son mediciones automáticas de impacto.</p></section>
        {detail.resolutionNote && <section className="rounded-xl border border-emerald-300 p-4"><h3 className="font-semibold">Decisión de resolución</h3><p className="mt-2 whitespace-pre-wrap text-sm">{detail.resolutionNote}</p></section>}
        {detail.canManage && <div className="flex flex-wrap gap-2"><Button disabled={!room.sync.online || !!room.detail.error} onClick={() => startAction(detail, detail.status === 'resolved' ? 'reopen' : 'resolve')}>{detail.status === 'resolved' ? 'Reabrir' : 'Resolver'}</Button>{detail.status !== 'resolved' && <Button variant="outline" disabled={!room.sync.online || !!room.detail.error} onClick={() => begin(detail)}>Editar incidencia</Button>}{detail.status === 'open' && <Button variant="outline" disabled={!room.sync.online || !!room.detail.error} onClick={() => startAction(detail, 'escalate')}>Escalar</Button>}</div>}
        <section><h3 className="mb-4 flex items-center gap-2 font-semibold"><History className="h-4 w-4" />Histórico de cambios</h3><ol className="ml-2 space-y-5 border-l pl-5">{room.detail.data?.events.map((event, index, events) => {
          const labels = { created: 'Apertura', updated: 'Edición', resolved: 'Resolución', reopened: 'Reapertura', escalated: 'Escalada' };
          const previous = events[index - 1]?.snapshot;
          const changes: string[] = [];
          const fields = { description: 'Descripción', type: 'Tipo', severity: 'Severidad', taskName: 'Tarea', contestantName: 'Concursante', zoneName: 'Zona', spaceName: 'Espacio', resourceName: 'Recurso', responsibleName: 'Responsable', cause: 'Causa comunicada', context: 'Contexto' } as const;
          if (previous) for (const [key, label] of Object.entries(fields)) { const field = key as keyof typeof fields; if (previous[field] !== event.snapshot[field]) { const value = event.snapshot[field]; changes.push(`${label}: ${field === 'type' ? incidentTypes[event.snapshot.type] : field === 'severity' ? incidentSeverities[event.snapshot.severity] : value || 'Sin información'}`); } }
          return <li key={event.id} className="text-sm"><p className="font-semibold">{labels[event.action]}</p><p className="mt-1 text-xs text-muted-foreground">{event.actorName} · {stamp(event.createdAt)}</p>{event.note && <p className="mt-2 whitespace-pre-wrap break-words">{event.note}</p>}{event.action === 'created' && <p className="mt-2 whitespace-pre-wrap break-words">{event.snapshot.description}</p>}{changes.map((text, i) => <p key={i} className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{text}</p>)}</li>;
        })}</ol></section>
      </div>}
    </SheetContent></Sheet>

    <Dialog open={!!form} onOpenChange={open => { if (!open && !save.isPending) { setForm(null); setSaveError(''); } }}><DialogContent className="max-h-[92dvh] overflow-y-auto text-foreground sm:max-w-2xl"><DialogHeader><DialogTitle>{form?.id ? 'Editar incidencia' : 'Registrar incidencia'}</DialogTitle><DialogDescription>Revisa los datos antes de guardar en {String(selected?.date ?? "").slice(0, 10)}. Los campos sin información pueden quedar vacíos.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); submit(); }}>
        <div className="grid gap-3 sm:grid-cols-2"><Choice label="Tipo" value={draft.type} options={choices(incidentTypes)} onChange={value => setDraft(current => ({ ...current, type: value as IncidentFields['type'] }))} /><Choice label="Severidad" value={draft.severity} options={choices(incidentSeverities)} onChange={value => setDraft(current => ({ ...current, severity: value as IncidentFields['severity'] }))} /></div>
        <Field label="Descripción del problema"><Textarea aria-label="Descripción del problema" required maxLength={4000} className="min-h-28" autoFocus value={draft.description} placeholder="Qué ocurre y qué necesita el equipo…" onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} /></Field>
        {refField('Tarea vinculada', 'taskId', context?.tasks.filter(task => task.canReport) ?? [])}
        <div className="grid gap-3 sm:grid-cols-2">{refField('Plató / zona', 'zoneId', context?.zones ?? [], taskLinked)}{refField('Espacio', 'spaceId', (context?.spaces ?? []).filter(space => !draft.zoneId || space.zoneId === draft.zoneId), taskLinked)}</div>
        <details className="rounded-lg border p-3"><summary className="cursor-pointer py-1 text-sm font-medium">Persona, recurso y notas opcionales</summary><div className="mt-4 grid gap-3 sm:grid-cols-2">{refField('Concursante', 'contestantId', context?.contestants ?? [], taskLinked)}{refField('Recurso', 'resourceId', context?.resources ?? [])}{context?.role !== 'aux' && refField('Responsable', 'responsibleId', context?.responsibles ?? [])}<Field label="Causa comunicada"><Textarea maxLength={4000} value={draft.cause ?? ''} onChange={event => setDraft(current => ({ ...current, cause: event.target.value || null }))} /></Field><Field label="Contexto adicional"><Textarea maxLength={4000} value={draft.context ?? ''} onChange={event => setDraft(current => ({ ...current, context: event.target.value || null }))} /></Field></div></details>
        {context?.role === 'aux' && !draft.taskId && <p className="text-sm text-amber-800 dark:text-amber-200">Selecciona una tarea de tu ámbito nominal para registrar la incidencia.</p>}
        {saveError && <div role="alert" className="rounded-lg border border-destructive p-3 text-sm">{saveError}</div>}
        {!room.sync.online && <p role="status" className="text-sm">Sin conexión. El borrador permanece abierto hasta recuperar la red.</p>}
        <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" className="min-h-11" disabled={save.isPending} onClick={() => setForm(null)}>Cancelar</Button><Button type="submit" className="min-h-11" disabled={save.isPending || !room.sync.online || !draft.description.trim() || (context?.role === 'aux' && !draft.taskId)}>{save.isPending ? 'Confirmando guardado…' : 'Guardar incidencia'}</Button></div>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!action} onOpenChange={open => { if (!open && !save.isPending) { setAction(null); setSaveError(''); } }}><DialogContent className="text-foreground"><DialogHeader><DialogTitle>{action?.type === 'resolve' ? 'Resolver incidencia' : action?.type === 'reopen' ? 'Reabrir incidencia' : 'Escalar incidencia'}</DialogTitle><DialogDescription>La decisión quedará registrada con tu autoría y hora real. El histórico se conserva.</DialogDescription></DialogHeader><p className="whitespace-pre-wrap text-sm">{action?.incident.description}</p><Field label="Decisión u observación"><Textarea aria-label="Decisión u observación" value={decision} maxLength={4000} onChange={event => setDecision(event.target.value)} placeholder="Explica la decisión tomada…" /></Field>{saveError && <div role="alert" className="rounded-lg border border-destructive p-3 text-sm">{saveError}</div>}<div className="flex justify-end gap-2"><Button variant="outline" className="min-h-11" disabled={save.isPending} onClick={() => setAction(null)}>Cancelar</Button><Button className="min-h-11" disabled={!decision.trim() || save.isPending || !room.sync.online} onClick={transition}>{save.isPending ? 'Confirmando…' : 'Confirmar decisión'}</Button></div></DialogContent></Dialog>
  </main></Layout>;
}
function ErrorBox({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive bg-card p-4 text-sm"><AlertTriangle className="h-5 w-5 shrink-0" /><p className="flex-1">{message}</p><Button variant="outline" className="min-h-11" onClick={retry}>Reintentar consulta</Button></div>;
}
