import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { Layout } from '@/components/layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, RefreshCw, Monitor, Star } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useControlRoomData } from '@/hooks/use-control-room-data';
import { useSetFavoritePlan, type MePreferences } from '@/hooks/use-preferences';
import type { ControlRoomSettings } from '@/hooks/use-control-room-settings';
import type { PlanningRun } from '@/hooks/use-planning-run';
import { apiRequest } from '@/lib/api';
import { pickDefaultPlan } from '@/lib/plan-default';
import { contestantsQueryKey } from '@/lib/plan-query-keys';
import { datedTime } from '@/components/control-room/presentation';
import { ProductionControlPanel } from '@/components/production-control-panel';
import { projectControlRoom, type LocationRead } from '@/lib/control-room-metrics';
import { useControlRoomRole } from '@/hooks/use-user-role';
import { allowedControlRoomModes, resolveControlRoomMode, modeLabels, modeStorageKey, type ControlRoomMode } from '@/lib/control-room-modes';
import { DirectorOverview } from '@/components/control-room/director-overview';
import { DataHealth } from '@/components/control-room/data-health';
import type { PlanSummary } from '@shared/schema';
import { api, buildUrl } from '@shared/routes';
import { cn } from '@/lib/utils';

export default function ControlRoomPage() {
  const { user } = useAuth();
  const roleQuery = useControlRoomRole();
  // Keep existing endpoint/cache prefixes and isolate responses by authenticated actor.
  const actor = user?.id;
  const plansQ = useQuery({ queryKey: [api.plans.list.path, 'control-room', actor], enabled: !!actor,
    queryFn: ({ signal }) => apiRequest<PlanSummary[]>('GET', api.plans.list.path, undefined, { signal }), retry: false });
  const preferencesQ = useQuery({ queryKey: ['/api/me/preferences', 'control-room', actor], enabled: !!actor,
    queryFn: ({ signal }) => apiRequest<MePreferences>('GET', '/api/me/preferences', undefined, { signal }) });
  const favorite = useSetFavoritePlan();
  const zonesQ = useQuery({ queryKey: [api.zones.list.path, 'control-room', actor], enabled: !!actor,
    queryFn: ({ signal }) => apiRequest<LocationRead[]>('GET', api.zones.list.path, undefined, { signal }), retry: false });
  const spacesQ = useQuery({ queryKey: [api.spaces.list.path, 'control-room', actor], enabled: !!actor,
    queryFn: ({ signal }) => apiRequest<LocationRead[]>('GET', api.spaces.list.path, undefined, { signal }), retry: false });
  const settingsQ = useQuery({ queryKey: [api.controlRoomSettings.get.path, 'control-room', actor], enabled: !!actor,
    queryFn: ({ signal }) => apiRequest<ControlRoomSettings>('GET', api.controlRoomSettings.get.path, undefined, { signal }), retry: false });
  const [legacy, params] = useRoute<{ planId: string }>('/plans/:planId/control-room');
  const routeId = legacy ? Number(params?.planId) : Number(new URLSearchParams(window.location.search).get('plan'));
  const [selection, setSelection] = useState<{ actor: string | undefined; id: number; routeId: number } | null>(null);
  const plans = plansQ.data ?? [];
  const validId = (value: number | null | undefined) => plans.some(plan => plan.id === value);
  const preferred = preferencesQ.data?.favoritePlanId;
  const defaultId = validId(routeId) ? routeId : validId(preferred) ? preferred! : Number(pickDefaultPlan(plans)?.id);
  const planId = selection && selection.actor === actor && selection.routeId === routeId && validId(selection.id) ? selection.id : validId(defaultId) ? defaultId : null;
  const room = useControlRoomData(planId);
  const peopleQ = useQuery({ queryKey: [...contestantsQueryKey(planId ?? 0), 'control-room', actor], enabled: !!actor && !!planId,
    queryFn: ({ signal }) => apiRequest<{ id: number; name: string }[]>('GET', `/api/plans/${planId}/contestants`, undefined, { signal }), retry: false });
  const runQ = useQuery({ queryKey: ['planning-run', planId, 'control-room', actor], enabled: !!actor && !!planId,
    queryFn: ({ signal }) => apiRequest<PlanningRun | null>('GET', buildUrl(api.planningRuns.latestByPlan.path, { id: planId! }), undefined, { signal }), refetchInterval: room.interval, retry: false });
  const execution = room.execution.isError ? null : room.execution.data;
  const allowedModes = allowedControlRoomModes(roleQuery.role, execution);
  const [perspective, setPerspective] = useState<{ actor: string | undefined; mode: string | null }>({ actor: undefined, mode: null });
  const savedMode = () => { try { return actor ? localStorage.getItem(modeStorageKey(actor)) : null; } catch { return null; } };
  const mode = resolveControlRoomMode(perspective.actor === actor ? perspective.mode : savedMode(), allowedModes);
  const setMode = (value: ControlRoomMode) => setPerspective({ actor, mode: resolveControlRoomMode(value, allowedModes) });
  useEffect(() => {
    if (!actor || roleQuery.isLoading || !planId || room.execution.isPending) return;
    // Clamp synchronously above; persist only the result permitted for the current account.
    setPerspective(previous => previous.actor === actor && previous.mode === mode ? previous : { actor, mode });
    try { if (mode) localStorage.setItem(modeStorageKey(actor), mode); else localStorage.removeItem(modeStorageKey(actor)); } catch { /* Private browser storage may be disabled. */ }
  }, [actor, mode, roleQuery.isLoading, planId, room.execution.isPending]);
  const [autoScroll, setAutoScroll] = useState(false);
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setTick(Date.now()), 1000); return () => window.clearInterval(timer); }, []);

  useEffect(() => {
    if (mode !== 'director' || !autoScroll || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 16) window.scrollTo({ top: 0, behavior: 'smooth' });
      else window.scrollBy({ top: window.innerHeight * 0.7, behavior: 'smooth' });
    }, 30000);
    return () => window.clearInterval(timer);
  }, [mode, autoScroll]);
  const clockMs = execution ? Date.parse(execution.clock.operationalAt) + Math.max(0, tick - room.execution.dataUpdatedAt) : NaN;
  const serverMs = execution ? Date.parse(execution.clock.serverAt) + Math.max(0, tick - room.execution.dataUpdatedAt) : tick;
  const errors = [roleQuery.isError && 'rol autenticado', room.plan.isError && 'planning y tareas', room.execution.isError && 'contexto de ejecución', room.incidents.isError && 'incidencias', zonesQ.isError && 'catálogo de platós', spacesQ.isError && 'catálogo de espacios', peopleQ.isError && 'personas', runQ.isError && 'estado de planificación', settingsQ.isError && 'configuración de alertas'].filter(Boolean);
  const stale = !room.sync.online || errors.length > 0 || (room.confirmedAt !== null && tick - room.confirmedAt > (Number(room.interval) || 30000) + 20000);
  const director = mode === 'director';
  const running = !!runQ.data && ['running', 'pending', 'queued', 'optimizing', 'cancelling'].includes(runQ.data.status);
  const metrics = useMemo(() => room.plan.data && room.plan.data.id === planId && execution && execution.role === roleQuery.role
    ? projectControlRoom({ plan: room.plan.data, execution, incidents: room.incidents.isError ? null : room.incidents.data ?? null,
      zones: zonesQ.isError ? [] : zonesQ.data ?? [], spaces: spacesQ.isError ? [] : spacesQ.data ?? [], contestants: peopleQ.isError ? [] : peopleQ.data ?? [],
      nowMs: clockMs, planningRunning: running, nextSoonMinutes: settingsQ.data?.nextSoonThresholdMin,
      delayThresholdMinutes: settingsQ.data?.delayThresholdMin, enableDelayAlert: settingsQ.data?.enableDelayAlert }) : null,
    [room.plan.data, planId, execution, roleQuery.role, room.incidents.isError, room.incidents.data, zonesQ.isError, zonesQ.data, spacesQ.isError, spacesQ.data, peopleQ.isError, peopleQ.data, clockMs, running, settingsQ.data]);
  const content = <div className={cn('space-y-5 pb-10 text-foreground', director && 'mx-auto max-w-[1920px] p-4 sm:p-8')}>
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">OptiPlan · Operaciones</p><h1 className={cn('mt-1 text-3xl font-bold tracking-tight', director && 'sm:text-4xl')}>Control Room <span className="text-primary">PRO</span></h1><p className="mt-2 text-sm text-foreground/75">Estado real de la jornada. Atención donde hace falta.</p></div><div className="flex items-center gap-2"><Monitor aria-hidden className="h-4 w-4 text-foreground/75" /><label className="text-sm" htmlFor="control-mode">Perspectiva</label><select id="control-mode" aria-label="Modo de Control Room" disabled={allowedModes.length < 2} value={mode ?? ''} onChange={e => setMode(e.target.value as ControlRoomMode)} className="min-h-11 rounded-lg border bg-background px-3 text-sm">{!mode && <option value="">Sin perspectiva autorizada</option>}{allowedModes.map(value => <option key={value} value={value}>{modeLabels[value]}</option>)}</select>{director && <Link href="/dashboard" className="rounded-lg border px-3 py-3 text-sm">Salir de dirección</Link>}</div></header>
    <div role="status" className="rounded-xl border bg-card px-4 py-3 text-sm"><p>Rol autenticado: <strong>{roleQuery.role ?? 'Sin confirmar'}</strong> · Perspectiva: <strong>{mode ? modeLabels[mode] : 'Sin confirmar'}</strong>.</p><p className="mt-1 text-foreground/75">{roleQuery.role === 'aux' ? 'Lectura parcial de tu ámbito operativo; no representa la totalidad del día.' : 'Lectura de los datos que autoriza el servidor.'} La perspectiva no cambia tu identidad ni tus permisos.</p></div>
    {!mode && <div role="alert" className="rounded-xl border p-4">{roleQuery.isLoading ? 'Comprobando rol autenticado…' : 'Rol o ámbito sin confirmar. Las perspectivas esperan una autorización coherente.'}<Button variant="outline" onClick={() => { void roleQuery.refetch(); void room.refresh(); }}>Comprobar acceso</Button></div>}
    <section aria-label="Seleccionar jornada" className="rounded-2xl border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 flex-wrap items-center gap-3"><label htmlFor="control-plan" className="text-sm font-medium">Jornada</label><select id="control-plan" value={planId ?? ''} onChange={e => setSelection({ actor, id: Number(e.target.value), routeId })} disabled={plansQ.isLoading || !plans.length} className="min-h-11 max-w-full rounded-lg border bg-background px-3 text-sm"><option value="" disabled>Selecciona una jornada</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.date}{plan.id === preferred ? ' · Favorita' : ''}</option>)}</select>{director && <div className="flex items-center gap-2"><label htmlFor="control-scroll" className="text-sm">Desplazamiento cada 30 s</label><Switch id="control-scroll" checked={autoScroll} onCheckedChange={setAutoScroll} /></div>}</div><div className="flex gap-2">{!director && <Button variant="outline" disabled={!planId || favorite.isPending || planId === preferred} onClick={() => planId && favorite.mutate(planId, { onSuccess: () => { void preferencesQ.refetch(); } })}><Star aria-hidden className="mr-2 h-4 w-4" />{planId === preferred ? 'Favorita' : 'Favorita del día'}</Button>}<Button variant="outline" disabled={!planId || room.plan.isFetching || room.execution.isFetching || room.incidents.isFetching} onClick={() => { void roleQuery.refetch(); void room.refresh(); void runQ.refetch(); void zonesQ.refetch(); void spacesQ.refetch(); void peopleQ.refetch(); void settingsQ.refetch(); }}><RefreshCw aria-hidden className="mr-2 h-4 w-4" />Actualizar</Button></div></div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs text-foreground/75" role="status"><Badge variant={stale ? 'destructive' : 'secondary'}>{!room.sync.online ? 'Sin conexión' : stale ? 'Datos posiblemente obsoletos' : room.confirmedAt === null ? 'Consulta sin confirmar' : 'Online'}</Badge><span>{room.sync.realtimeConnected ? 'Canal conectado; entrega no garantizada' : 'Canal no disponible'}</span><span>{room.interval ? `Reconciliación cada ${Number(room.interval) / 1000} s` : 'Consultas pausadas sin conexión'}</span><span>Última consulta confirmada: {datedTime(room.confirmedAt)}</span></div>
    </section>
    {errors.length > 0 && <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"><p className="font-semibold">No se pudo confirmar: {errors.join(', ')}.</p><p className="mt-1 text-foreground/75">Los datos previos pueden estar obsoletos. Actualiza para volver a consultar.</p></div>}
    {stale && planId && <div role="status" className="sticky top-0 z-20 rounded-xl border border-amber-500/50 bg-background p-4 text-base font-medium shadow-sm">Lectura sin confirmar{!room.sync.online ? ' · Sin conexión' : ' · Datos posiblemente obsoletos'}. Estado de actividades sin reconfirmar. Última consulta disponible: {datedTime(room.confirmedAt)}.</div>}
    {plansQ.isError && <div role="alert" className="rounded-xl border border-destructive/40 p-5">No se pudieron consultar las jornadas autorizadas. <Button variant="outline" onClick={() => void plansQ.refetch()}>Reintentar</Button></div>}
    {plansQ.isLoading || planId && room.plan.isLoading ? <div className="flex items-center gap-2 rounded-xl border p-6"><Loader2 aria-hidden className="h-4 w-4 animate-spin" />Consultando datos de la jornada…</div> : null}
    {!planId && !plansQ.isLoading && !plansQ.isError && <div className="rounded-xl border p-6 text-foreground/75">Sin planning disponible. Selecciona una jornada cuando exista.</div>}
    {metrics?.scoped && <p role="status" className="rounded-xl border border-amber-500/50 p-4 font-medium">Lectura parcial: {metrics.total} obligaciones de tu ámbito. No acredita el progreso ni la finalización global del día.</p>}
    {mode === 'production' && metrics && room.plan.data && <ProductionControlPanel key={`${actor}-${planId}`} metrics={metrics} plan={room.plan.data} realNowMs={serverMs} />}
    {mode === 'director' && metrics && room.plan.data && <DirectorOverview metrics={metrics} plan={room.plan.data} />}
    {mode && mode !== 'technical' && planId && !metrics && <div role="status" className="rounded-xl border p-6 text-foreground/75">El resumen espera el contexto de ejecución y su ámbito autorizado. No se presentan contadores globales sin esa autoridad.</div>}
    {mode === 'technical' && <DataHealth now={tick} interval={room.interval} online={room.sync.online} connected={room.sync.realtimeConnected} failed={room.sync.realtimeFailed} confirmedAt={room.confirmedAt} metrics={metrics}
      reads={[{ name: 'Planificación y tareas', query: room.plan }, { name: 'Ejecución y reloj', query: room.execution }, { name: 'Incidencias', query: room.incidents },
        { name: 'Catálogo de platós', query: zonesQ }, { name: 'Catálogo de espacios', query: spacesQ }, { name: 'Personas', query: peopleQ }, { name: 'Estado de planificación', query: runQ }, { name: 'Configuración de alertas', query: settingsQ }]} />}

  </div>;
  return director ? <main className="min-h-screen bg-background text-foreground">{content}</main> : <Layout>{content}</Layout>;
}
