import { executionClockCurrent, executionDuration, madridClockBase, type ExecutionContext } from '../../../shared/execution';
import type { Incident } from '../../../shared/incidents';

export const taskStateLabels = { pending: 'Pendientes', in_progress: 'En curso', done: 'Completadas', interrupted: 'Interrumpidas', cancelled: 'Canceladas' } as const;
export type TaskState = keyof typeof taskStateLabels;
export type TaskRead = {
  id: number; planId?: number; status?: string | null; templateId?: number | null;
  contestantId?: number | null; zoneId?: number | null; spaceId?: number | null;
  startPlanned?: string | null; endPlanned?: string | null; startRealAt?: string | null;
  endRealAt?: string | null; pausedAt?: string | null; pausedTotalSeconds?: number | null;
  executionClockMode?: string | null; executionClockRevision?: string | null;
  manualTitle?: string | null; template?: { name?: string | null } | null;
};
export type LocationRead = { id: number; name: string; zoneId?: number | null; parentSpaceId?: number | null };
export type PlanRead = { id: number; date: string; workStart?: string | null; workEnd?: string | null; mealStart?: string | null; mealEnd?: string | null; dailyTasks?: TaskRead[]; plannerNextConfiguration?: { plannerNext?: { mainFlow?: { spaceId?: number } }; mainFlow?: { spaceId?: number } } | null };
export type TaskMetric = {
  id: number; name: string; person: string; state: TaskState | 'unknown';
  zoneId: number | null; spaceId: number | null; location: string; locationKnown: boolean; locationIssue: boolean;
  plannedStart: number | null; plannedEnd: number | null; realStart: number | null; realEnd: number | null;
  activeSeconds: number | null; startDeltaSeconds: number | null; endDeltaSeconds: number | null;
  durationDeltaSeconds: number | null; lateSeconds: number | null; excessSeconds: number | null;
  resources: string[]; mainFlow: boolean; href: string;
};
export type AlertMetric = { key: string; severity: 'critical' | 'warn' | 'info'; title: string; evidence: string; href: string; since: number | null; zoneId: number | null };
export type SpaceMetric = { key: string; id: number | null; name: string; parentId: number | null; tasks: TaskMetric[]; current: TaskMetric[]; next: TaskMetric | null; pending: number; incidents: Incident[]; blocked: boolean; problems: boolean };
export type ZoneMetric = { key: string; id: number | null; name: string; spaces: SpaceMetric[]; current: number; pending: number; critical: number; problems: boolean };
export type ControlRoomProjection = {
  phase: string; phaseDetail: string; scoped: boolean; started: boolean; finished: boolean;
  total: number; counts: Record<TaskState | 'unknown', number>; progressPct: number | null;
  plannedCount: number; acceptedCoverage: number | null; plannedStart: number | null; plannedEnd: number | null;
  actualEnd: number | null; estimate: null; estimateReason: string;
  temporalApplicable: boolean; clock: ExecutionContext['clock'] | null; operationalNow: number | null;
  incidents: { available: boolean; open: number | null; critical: number | null; escalated: number | null; recent: Incident[] };
  tasks: TaskMetric[]; upcoming: TaskMetric[]; alerts: AlertMetric[]; zones: ZoneMetric[];
};

const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
// Bounded memoization of deterministic day/wall-time conversion, never operational data.
const instantCache = new Map<string, number | null>();
export function madridDate(at: number): string | null {
  if (!Number.isFinite(at)) return null;
  const parts = dateFormatter.formatToParts(at);
  const part = (key: string) => parts.find(p => p.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
const wallTime = (at: number) => timeFormatter.format(at);
/** A day is mandatory. Reject non-existent and ambiguous DST wall times. */
export function plannedInstant(day: string, hhmm?: string | null): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !hhmm || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  const key = `${day}/${hhmm}`;
  if (instantCache.has(key)) return instantCache.get(key)!;
  const anchor = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(anchor.getTime()) || anchor.toISOString().slice(0, 10) !== day) return null;
  const at = madridClockBase(hhmm, anchor).getTime();
  if (madridDate(at) !== day || wallTime(at) !== hhmm) return null;
  if ([at - 3600000, at + 3600000].some(other => madridDate(other) === day && wallTime(other) === hhmm)) return null;
  if (instantCache.size >= 2048) instantCache.clear();
  instantCache.set(key, at);
  return at;
}
// Legacy HH:mm and timezone-free timestamps cannot establish a real instant.
const timestamp = (value?: string | null): number | null => value && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const reference = (value?: number | null) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
const max = (values: (number | null)[]) => { const valid = values.filter((n): n is number => n !== null); return valid.length ? Math.max(...valid) : null; };
const min = (values: (number | null)[]) => { const valid = values.filter((n): n is number => n !== null); return valid.length ? Math.min(...valid) : null; };
const orderTask = (a: TaskMetric, b: TaskMetric) => (a.plannedStart ?? Infinity) - (b.plannedStart ?? Infinity) || a.id - b.id;
export const warRoomHref = (planId: number, incidentId?: string) => `/war-room?plan=${planId}${incidentId ? `&incident=${encodeURIComponent(incidentId)}` : ''}`;

/** Read-only projection: every count reconciles to received obligations; no solver or writes. */
export function projectControlRoom(input: {
  plan: PlanRead; execution?: ExecutionContext | null; nowMs: number; incidents?: Incident[] | null;
  zones?: LocationRead[]; spaces?: LocationRead[]; contestants?: { id: number; name: string }[];
  planningRunning?: boolean; nextSoonMinutes?: number; delayThresholdMinutes?: number; enableDelayAlert?: boolean;
}): ControlRoomProjection {
  const { plan, execution } = input;
  const clock = execution?.clock ?? null;
  const clockValid = !!clock && timestamp(clock.operationalAt) !== null && timestamp(clock.serverAt) !== null && Number.isFinite(input.nowMs);
  const now = clockValid ? input.nowMs : null;
  const scoped = execution?.role === 'aux';
  const authorities = new Map((execution?.tasks ?? []).map(task => [task.taskId, task]));
  const source = (plan.dailyTasks ?? []).filter(task => (task.planId == null || task.planId === plan.id) && (!scoped || authorities.get(task.id)?.inScope));
  const zones = new Map((input.zones ?? []).map(zone => [zone.id, zone]));
  const spaces = new Map((input.spaces ?? []).map(space => [space.id, space]));
  const mainSpaceId = reference(plan.plannerNextConfiguration?.plannerNext?.mainFlow?.spaceId ?? plan.plannerNextConfiguration?.mainFlow?.spaceId);
  const people = new Map((input.contestants ?? []).map(person => [person.id, person.name]));
  const counts: ControlRoomProjection['counts'] = { pending: 0, in_progress: 0, done: 0, interrupted: 0, cancelled: 0, unknown: 0 };
  const started = source.some(task => ['in_progress', 'done', 'interrupted'].includes(task.status ?? ''));
  const temporalApplicable = now !== null && madridDate(now) === plan.date;
  // The execution authority proves the live placements match the effective accepted/published plan.
  // A pending Draft or incomplete planning never supplies a definitive closing time.
  const accepted = !!execution?.planningReady && !execution.draftPending && !input.planningRunning;
  const tasks = source.map((task): TaskMetric => {
    const state: TaskMetric['state'] = Object.hasOwn(taskStateLabels, task.status ?? '') ? task.status as TaskState : 'unknown';
    counts[state]++;
    const spaceId = reference(task.spaceId), space = spaceId === null ? undefined : spaces.get(spaceId);
    const zoneId = reference(task.zoneId) ?? reference(space?.zoneId);
    const zone = zoneId === null ? undefined : zones.get(zoneId);
    const locationKnown = !!space && !!zone && space.zoneId === zoneId;
    // Missing location can describe a non-physical obligation. Only a broken
    // explicit relationship in a received catalogue establishes an issue.
    const locationIssue = spaceId !== null && spaces.size > 0 && zones.size > 0 && !locationKnown;
    const start = plannedInstant(plan.date, task.startPlanned), end = plannedInstant(plan.date, task.endPlanned);
    const placed = start !== null && end !== null && end > start;
    const realStart = timestamp(task.startRealAt), realEnd = timestamp(task.endRealAt);
    const paused = task.pausedTotalSeconds ?? 0;
    const durationStateValid = state === 'in_progress' ? realEnd === null && task.pausedAt == null
      : state === 'interrupted' ? timestamp(task.pausedAt) !== null : (state === 'done' || state === 'cancelled') && realEnd !== null;
    const activeSeconds = durationStateValid && realStart !== null && (state !== 'in_progress' || now !== null) && Number.isFinite(paused) && paused >= 0
      ? executionDuration(task, now ?? NaN, clock ?? undefined) : null;
    const comparable = accepted && realStart !== null && madridDate(realStart) === plan.date && !!clock && task.executionClockMode === clock.mode && executionClockCurrent(task, clock);
    const startDeltaSeconds = comparable && placed ? (realStart - start) / 1000 : null;
    const endDeltaSeconds = comparable && placed && realEnd !== null && madridDate(realEnd) === plan.date ? (realEnd - end) / 1000 : null;
    const durationDeltaSeconds = comparable && placed && activeSeconds !== null ? activeSeconds - (end - start) / 1000 : null;
    return {
      id: task.id, name: task.manualTitle ?? task.template?.name ?? 'Actividad sin nombre',
      person: task.contestantId ? people.get(task.contestantId) ?? 'Persona por confirmar' : 'Actividad de equipo', state,
      zoneId, spaceId, locationKnown, locationIssue, location: [zone?.name, space?.name].filter(Boolean).join(' · ') || 'Ubicación por confirmar',
      plannedStart: placed ? start : null, plannedEnd: placed ? end : null, realStart, realEnd, activeSeconds,
      startDeltaSeconds, endDeltaSeconds, durationDeltaSeconds,
      lateSeconds: accepted && temporalApplicable && started && state === 'pending' && placed && now > start ? (now - start) / 1000 : null,
      excessSeconds: temporalApplicable && state === 'in_progress' && durationDeltaSeconds !== null && durationDeltaSeconds > 0 ? durationDeltaSeconds : null,
      resources: authorities.get(task.id)?.resources ?? [], mainFlow: mainSpaceId !== null && spaceId === mainSpaceId, href: `/my-day?plan=${plan.id}#agenda-task-${task.id}`,
    };
  }).sort(orderTask);
  const total = tasks.length;
  const finished = !scoped && total > 0 && counts.done + counts.cancelled === total;
  const phase = finished ? 'Jornada terminada' : started ? 'Jornada en ejecución' : input.planningRunning ? 'Planificación en curso'
    : execution?.planningState === 'published' ? 'Planning publicado'
      : accepted ? 'Planificación aceptada' : tasks.some(t => t.plannedStart !== null) || execution?.draftPending ? 'Planificación en curso'
        : total === 0 || tasks.every(t => t.plannedStart === null) ? 'Sin planning' : 'Estado por confirmar';
  const phaseDetail = scoped ? 'Lectura de tu ámbito autorizado; no demuestra el estado global de la jornada.'
    : execution == null ? 'La autoridad de ejecución no está disponible. El estado del planning queda por confirmar.'
      : execution.draftPending ? 'Hay un borrador pendiente. Sus horarios no se presentan como planning aceptado.'
        : finished ? 'Todas las obligaciones recibidas están completadas o canceladas por decisión registrada.'
          : started ? 'Estados de ejecución confirmados. Las canceladas se mantienen separadas del progreso.'
            : accepted ? 'Preparación del rodaje. El avance cero no indica una incidencia.' : 'Aún no se ha confirmado un planning completo aceptado.';
  const visibleIncidents = input.incidents == null ? null : input.incidents.filter(incident => incident.planId === plan.id);
  const open = visibleIncidents?.filter(incident => incident.status !== 'resolved') ?? [];
  const incidentMetrics: ControlRoomProjection['incidents'] = {
    available: visibleIncidents !== null, open: visibleIncidents === null ? null : open.length,
    critical: visibleIncidents === null ? null : open.filter(i => i.severity === 'critical').length,
    escalated: visibleIncidents === null ? null : open.filter(i => i.status === 'escalated').length,
    recent: [...(visibleIncidents ?? [])].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
  };
  const alerts: AlertMetric[] = open.filter(i => i.severity === 'critical' || i.status === 'escalated').map(i => ({
    key: `incident-${i.id}`, severity: i.severity === 'critical' ? 'critical' : 'warn', title: i.description,
    evidence: `${i.spaceName ?? i.zoneName ?? 'Jornada'} · ${i.status === 'escalated' ? 'Escalada' : 'Crítica abierta'} en el registro compartido`,
    href: warRoomHref(plan.id, i.id), since: timestamp(i.createdAt), zoneId: i.zoneId,
  }));
  const delayThreshold = Math.max(0, input.delayThresholdMinutes ?? 0) * 60;
  for (const task of tasks) {
    if (input.enableDelayAlert !== false && task.excessSeconds !== null && task.excessSeconds > delayThreshold) alerts.push({ key: `excess-${task.id}`, severity: 'warn', title: `${task.name}: duración excedida`, evidence: `${task.location} · ${Math.floor(task.excessSeconds / 60)} min ${Math.floor(task.excessSeconds % 60)} s sobre la duración planificada, descontando pausas`, href: task.href, since: task.realStart, zoneId: task.zoneId });
    if (input.enableDelayAlert !== false && task.lateSeconds !== null && task.lateSeconds > delayThreshold) alerts.push({ key: `late-${task.id}`, severity: 'warn', title: `${task.name}: comienzo previsto pasado`, evidence: `${task.location} · sigue pendiente ${Math.floor(task.lateSeconds / 60)} min ${Math.floor(task.lateSeconds % 60)} s después del inicio planificado`, href: task.href, since: task.plannedStart, zoneId: task.zoneId });
    if (task.state === 'interrupted') alerts.push({ key: `interrupted-${task.id}`, severity: 'warn', title: `${task.name}: actividad interrumpida`, evidence: `${task.location} · estado confirmado; la causa debe consultarse en War Room`, href: task.href, since: timestamp(source.find(t => t.id === task.id)?.pausedAt), zoneId: task.zoneId });
    if (task.locationIssue && task.state === 'pending' && task.plannedStart !== null && now !== null && temporalApplicable && task.plannedStart >= now && task.plannedStart - now <= (input.nextSoonMinutes ?? 10) * 60000) alerts.push({ key: `location-${task.id}`, severity: 'info', title: `${task.name}: ubicación por confirmar`, evidence: 'No se ha podido verificar una relación efectiva entre espacio y plató; revisa la tarea.', href: task.href, since: null, zoneId: task.zoneId });
  }
  const rank = { critical: 0, warn: 1, info: 2 };
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.since ?? Infinity) - (b.since ?? Infinity) || a.key.localeCompare(b.key));
  const groups = new Map<string, ZoneMetric>();
  const ensureZone = (id: number | null): ZoneMetric => {
    const key = id === null ? 'unlocated' : `zone-${id}`;
    if (!groups.has(key)) groups.set(key, { key, id, name: id === null ? 'Sin ubicación confirmada' : zones.get(id)?.name ?? 'Plató por confirmar', spaces: [], current: 0, pending: 0, critical: 0, problems: false });
    return groups.get(key)!;
  };
  const ensureSpace = (zone: ZoneMetric, id: number | null): SpaceMetric => {
    const key = `${zone.key}-space-${id ?? 'none'}`;
    let unit = zone.spaces.find(unit => unit.key === key);
    if (!unit) { unit = { key, id, name: id === null ? 'Sin espacio confirmado' : spaces.get(id)?.name ?? 'Espacio por confirmar', parentId: reference(id === null ? null : spaces.get(id)?.parentSpaceId), tasks: [], current: [], next: null, pending: 0, incidents: [], blocked: false, problems: false }; zone.spaces.push(unit); }
    return unit;
  };
  if (!scoped) {
    for (const zone of zones.values()) ensureZone(zone.id);
    for (const space of spaces.values()) ensureSpace(ensureZone(reference(space.zoneId)), space.id);
  }
  for (const task of tasks) ensureSpace(ensureZone(task.zoneId), task.spaceId).tasks.push(task);
  for (const incident of open) {
    const task = tasks.find(task => task.id === incident.taskId);
    const zoneId = reference(incident.zoneId) ?? task?.zoneId ?? reference(incident.spaceId === null ? null : spaces.get(incident.spaceId)?.zoneId);
    const group = ensureZone(zoneId);
    if (incident.spaceId !== null || task?.spaceId != null) ensureSpace(group, incident.spaceId ?? task!.spaceId).incidents.push(incident);
    else for (const unit of group.spaces) unit.incidents.push(incident);
    // A zone-level incident remains visible even for a zone without catalogued spaces.
    if (!group.spaces.length) ensureSpace(group, null).incidents.push(incident);
  }
  for (const group of groups.values()) {
    for (const unit of group.spaces) {
      unit.current = unit.tasks.filter(t => t.state === 'in_progress');
      unit.next = unit.tasks.filter(t => t.state === 'pending' || t.state === 'interrupted').sort(orderTask)[0] ?? null;
      unit.pending = unit.tasks.filter(t => t.state === 'pending' || t.state === 'interrupted').length;
      unit.blocked = unit.incidents.some(i => i.type === 'space_blocked');
      unit.problems = unit.incidents.length > 0 || unit.tasks.some(t => t.state === 'interrupted' || t.lateSeconds !== null || t.excessSeconds !== null || t.locationIssue);
    }
    group.current = group.spaces.reduce((sum, unit) => sum + unit.current.length, 0);
    group.pending = group.spaces.reduce((sum, unit) => sum + unit.pending, 0);
    group.critical = new Set(group.spaces.flatMap(unit => unit.incidents.filter(i => i.severity === 'critical').map(i => i.id))).size;
    group.problems = group.spaces.some(unit => unit.problems);
  }
  const plannedCount = tasks.filter(task => task.plannedStart !== null).length;
  const completePlacement = total > 0 && plannedCount === total && counts.unknown === 0;
  return {
    phase, phaseDetail, scoped, started, finished, total, counts, progressPct: total ? counts.done / total * 100 : null,
    plannedCount, acceptedCoverage: accepted ? plannedCount : null,
    plannedStart: accepted && completePlacement ? min(tasks.map(t => t.plannedStart)) : null,
    plannedEnd: accepted && completePlacement ? max(tasks.map(t => t.plannedEnd)) : null,
    actualEnd: finished && counts.done > 0 && tasks.filter(t => t.state === 'done').every(t => t.realEnd !== null) ? max(tasks.filter(t => t.state === 'done').map(t => t.realEnd)) : null,
    estimate: null, estimateReason: 'Estimación aún no disponible: no existe un modelo validado de dependencias y recursos.',
    temporalApplicable, clock, operationalNow: now, incidents: incidentMetrics, tasks,
    upcoming: tasks.filter(t => t.state === 'pending' && t.plannedStart !== null && (!temporalApplicable || now === null || t.plannedStart >= now)).sort((a, b) => Number(alerts.some(alert => alert.href === b.href)) - Number(alerts.some(alert => alert.href === a.href)) || Number(b.mainFlow) - Number(a.mainFlow) || orderTask(a, b)),
    alerts, zones: [...groups.values()].sort((a, b) => Number(b.spaces.some(unit => unit.id === mainSpaceId && mainSpaceId !== null)) - Number(a.spaces.some(unit => unit.id === mainSpaceId && mainSpaceId !== null)) || b.critical - a.critical || Number(b.problems) - Number(a.problems) || b.current - a.current || a.name.localeCompare(b.name)),
  };
}
