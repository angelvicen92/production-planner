import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { projectControlRoom, plannedInstant, type PlanRead, type TaskRead } from './control-room-metrics';
import type { ExecutionContext } from '../../../shared/execution';
import type { Incident } from '../../../shared/incidents';

const at = Date.parse('2026-10-14T08:30:20Z'); // 10:30:20 Madrid
const execution: ExecutionContext = { role: 'production', planningReady: true, planningState: 'accepted', draftPending: false, hasScope: true,
  clock: { mode: 'auto', revision: null, operationalAt: new Date(at).toISOString(), serverAt: new Date(at).toISOString() }, tasks: [] };
const task = (id: number, patch: Partial<TaskRead> = {}): TaskRead => ({ id, planId: 1, status: 'pending', startPlanned: '10:00', endPlanned: '10:15', zoneId: 1, spaceId: 10, template: { name: `Actividad ${id}` }, ...patch });
const plan = (tasks: TaskRead[]): PlanRead => ({ id: 1, date: '2026-10-14', dailyTasks: tasks });
const project = (tasks: TaskRead[], patch: Partial<Parameters<typeof projectControlRoom>[0]> = {}) => projectControlRoom({ plan: plan(tasks), execution, nowMs: at, incidents: [], zones: [{ id: 1, name: 'Plató' }, { id: 2, name: 'Inactivo' }], spaces: [{ id: 10, zoneId: 1, name: 'Espacio' }, { id: 11, zoneId: 1, name: 'Simultáneo' }, { id: 20, zoneId: 2, name: 'Sin actividad' }], ...patch });
const incident = (patch: Partial<Incident> = {}): Incident => ({ id: '00000000-0000-4000-8000-000000000001', planId: 1, version: 1, status: 'open', type: 'technical', severity: 'critical', description: 'Señal interrumpida', authorId: '00000000-0000-4000-8000-000000000002', authorName: 'Producción', createdAt: new Date(at).toISOString(), updatedAt: new Date(at).toISOString(), resolvedAt: null, resolutionNote: null, canManage: true, taskId: 1, zoneId: 1, spaceId: 10, contestantId: null, resourceId: null, responsibleId: null, cause: null, context: null, taskName: 'Actividad', zoneName: 'Plató', spaceName: 'Espacio', contestantName: null, resourceName: null, responsibleName: null, ...patch });

test('accepted A2: all 266 obligations reconcile, unknown/unplanned/cancelled never disappear; no mutation', () => {
  const snapshot = JSON.parse(readFileSync('server/fixtures/assistedA2S10.json', 'utf8'));
  const states = ['pending', 'in_progress', 'done', 'interrupted', 'cancelled'];
  const tasks = snapshot.snapshot.tasks.map((t: { taskId: number }, index: number) => ({ ...t, id: t.taskId, planId: 1, status: states[index % states.length] }));
  assert.equal(tasks.length, 266);
  const input = { plan: { id: 1, date: '2026-10-14', dailyTasks: tasks }, execution, nowMs: at, incidents: [] };
  const before = JSON.stringify(input); const m = projectControlRoom(input);
  assert.equal(m.total, 266); assert.equal(Object.values(m.counts).reduce((sum, n) => sum + n, 0), 266);
  assert.equal(m.progressPct, m.counts.done / 266 * 100); assert.equal(m.estimate, null); assert.equal(JSON.stringify(input), before);
  const unplanned = project([task(1, { startPlanned: null, endPlanned: null }), task(2, { status: 'unknown' })]);
  assert.equal(unplanned.total, 2); assert.equal(unplanned.counts.unknown, 1); assert.equal(unplanned.plannedEnd, null);
});

test('before/during/after derives from confirmed statuses, never clock alone', () => {
  const before = project([task(1)]); assert.equal(before.phase, 'Planificación aceptada'); assert.equal(before.started, false); assert.equal(before.alerts.length, 0);
  const during = project([task(1, { status: 'in_progress' }), task(2)]); assert.equal(during.phase, 'Jornada en ejecución'); assert.ok(during.alerts.some(a => a.key === 'late-2'));
  const interrupted = project([task(1, { status: 'done' }), task(2, { status: 'interrupted' })]); assert.equal(interrupted.finished, false);
  const after = project([task(1, { status: 'done' }), task(2, { status: 'cancelled' })]); assert.equal(after.phase, 'Jornada terminada'); assert.equal(after.progressPct, 50);
  assert.equal(project([]).finished, false);
  assert.equal(project([task(1)], { execution: { ...execution, planningState: 'published' } }).phase, 'Planning publicado');
  const draft = project([task(1)], { execution: { ...execution, planningState: 'pending', planningReady: false, draftPending: true } }); assert.equal(draft.phase, 'Planificación en curso'); assert.equal(draft.plannedEnd, null);
  assert.equal(project([task(1, { startPlanned: null, endPlanned: null })], { execution: { ...execution, planningReady: false, planningState: 'pending' } }).phase, 'Sin planning');
});

test('real timestamps, second precision, pauses and placement duration (not template defaults)', () => {
  const m = project([task(1, { status: 'done', startRealAt: '2026-10-14T08:00:10Z', endRealAt: '2026-10-14T08:17:35Z', pausedTotalSeconds: 125, executionClockMode: 'auto' })]);
  const t = m.tasks[0]; assert.equal(t.activeSeconds, 920); assert.equal(t.startDeltaSeconds, 10); assert.equal(t.endDeltaSeconds, 155); assert.equal(t.durationDeltaSeconds, 20);
  assert.equal(m.actualEnd, Date.parse('2026-10-14T08:17:35Z'));
  const active = project([task(1, { status: 'in_progress', startRealAt: '2026-10-14T08:00:00Z', pausedTotalSeconds: 600, executionClockMode: 'auto' })]); assert.equal(active.tasks[0].excessSeconds, 320);
  const paused = project([task(1, { status: 'interrupted', startRealAt: '2026-10-14T08:00:00Z', pausedAt: '2026-10-14T08:05:05Z', executionClockMode: 'auto' })]); assert.equal(paused.tasks[0].activeSeconds, 305);
});

test('legacy/incomplete timestamps, changed clocks and unavailable execution cannot assert deviations', () => {
  for (const startRealAt of [null, '08:00', '2026-10-14T08:00:00', 'invalid']) {
    const m = project([task(1, { status: 'in_progress', startRealAt })]); assert.equal(m.tasks[0].activeSeconds, null); assert.equal(m.tasks[0].excessSeconds, null); assert.equal(m.estimate, null);
  }
  const incompleteDone = project([task(1, { status: 'done', startRealAt: '2026-10-14T08:00:00Z', pausedAt: '2026-10-14T08:05:00Z', executionClockMode: 'auto' })]); assert.equal(incompleteDone.tasks[0].activeSeconds, null); assert.equal(incompleteDone.tasks[0].durationDeltaSeconds, null);
  const changed = project([task(1, { status: 'in_progress', startRealAt: '2026-10-14T08:00:00Z', executionClockMode: 'manual', executionClockRevision: '2026-10-14T07:00:00Z' })]); assert.equal(changed.tasks[0].activeSeconds, null);
  const failed = project([task(1, { status: 'in_progress' }), task(2)], { execution: null }); assert.equal(failed.temporalApplicable, false); assert.equal(failed.plannedEnd, null); assert.equal(failed.tasks[1].lateSeconds, null);
});

test('Madrid day, winter/summer and DST ambiguity: no unrelated-date delay', () => {
  assert.equal(plannedInstant('2026-10-14', '09:00'), Date.parse('2026-10-14T07:00:00Z'));
  assert.equal(plannedInstant('2026-10-30', '09:00'), Date.parse('2026-10-30T08:00:00Z'));
  assert.equal(plannedInstant('2026-03-29', '02:30'), null); assert.equal(plannedInstant('2026-10-25', '02:30'), null);
  assert.equal(plannedInstant('2026-02-30', '09:00'), null);
  const m = project([task(1, { status: 'in_progress' }), task(2)], { plan: { ...plan([task(1, { status: 'in_progress' }), task(2)]), date: '2026-10-30' } }); assert.equal(m.temporalApplicable, false); assert.ok(!m.alerts.some(a => a.key === 'late-2'));
  const manual = project([task(1, { status: 'in_progress', startRealAt: '2026-10-14T08:00:00Z', executionClockMode: 'manual', executionClockRevision: '2026-10-14T07:00:00Z' }), task(2)], { execution: { ...execution, clock: { ...execution.clock, mode: 'manual', revision: '2026-10-14T07:00:00Z' } } }); assert.ok(manual.tasks[0].excessSeconds! > 0);
});

test('incidents: open includes escalated, critical excludes resolved, failed query is unknown, day isolation', () => {
  const m = project([task(1)], { incidents: [incident(), incident({ id: 'escalated', status: 'escalated', severity: 'warn' }), incident({ id: 'resolved', status: 'resolved' }), incident({ id: 'other-day', planId: 2 })] });
  assert.equal(m.incidents.open, 2); assert.equal(m.incidents.critical, 1); assert.equal(m.incidents.escalated, 1); assert.equal(m.alerts.length, 2);
  assert.ok(m.alerts[0].href.includes('incident=')); assert.equal(m.incidents.recent.length, 3);
  const failed = project([task(1)], { incidents: null }); assert.equal(failed.incidents.open, null); assert.equal(failed.incidents.available, false);
});

test('all studios stay visible; simultaneous spaces and an incident do not invent a stop cause', () => {
  const m = project([task(1, { status: 'in_progress' }), task(2, { status: 'in_progress', spaceId: 11 })], { incidents: [incident()] });
  assert.equal(m.zones.find(z => z.id === 1)?.current, 2); assert.ok(m.zones.some(z => z.id === 2)); assert.equal(m.zones.find(z => z.id === 2)?.spaces.length, 1);
  assert.equal(m.zones.find(z => z.id === 1)?.spaces[0].blocked, false);
  const blocked = project([], { incidents: [incident({ type: 'space_blocked' })] }); assert.equal(blocked.zones.find(z => z.id === 1)?.spaces[0].blocked, true);
});

test('scope: aux gets scoped obligations/spaces; completing the scope cannot finish the global day', () => {
  const m = project([task(1, { status: 'done' }), task(2, { zoneId: 2, spaceId: 20 })], { execution: { ...execution, role: 'aux', tasks: [{ taskId: 1, inScope: true, hasAuthority: true, canExecute: true, resources: ['CAM nominal'] }, { taskId: 2, inScope: false, hasAuthority: false, canExecute: false, resources: [] }] } });
  assert.equal(m.total, 1); assert.equal(m.scoped, true); assert.equal(m.finished, false); assert.equal(m.zones.length, 1); assert.deepEqual(m.tasks[0].resources, ['CAM nominal']);
  for (const role of ['admin', 'production', 'viewer'] as const) assert.equal(project([task(1)], { execution: { ...execution, role } }).total, 1);
});

test('unknown relationships and unplanned obligations remain explicit, never synthetic saturation', () => {
  const m = project([task(1, { spaceId: null, zoneId: null, startPlanned: null, endPlanned: null })]); assert.equal(m.total, 1); assert.equal(m.tasks[0].locationKnown, false); assert.equal(m.tasks[0].lateSeconds, null); assert.equal(m.zones.find(z => z.id === null)?.pending, 1);
  assert.equal(m.plannedEnd, null); assert.equal(m.estimate, null);
  const virtual = project([task(1, { spaceId: null, zoneId: null, startPlanned: '10:35', endPlanned: '10:45' })]); assert.equal(virtual.tasks[0].locationIssue, false); assert.ok(!virtual.alerts.some(a => a.key === 'location-1'));
  const broken = project([task(1, { spaceId: 99, startPlanned: '10:35', endPlanned: '10:45' })]); assert.ok(broken.alerts.some(a => a.key === 'location-1'));
  const main = project([task(1), task(2, { spaceId: 20, zoneId: 2 })], { plan: { ...plan([task(1),task(2, { spaceId: 20, zoneId: 2 })]), plannerNextConfiguration: { plannerNext: { mainFlow: { spaceId: 20 } } } } }); assert.equal(main.zones[0].id, 2);
});

test('configured alert threshold is a reproducible attention threshold, no critical label for delay', () => {
  const m = project([task(1, { status: 'in_progress' }), task(2)], { delayThresholdMinutes: 31 }); assert.equal(m.alerts.length, 0);
  const n = project([task(1, { status: 'in_progress' }), task(2)], { delayThresholdMinutes: 10 }); assert.equal(n.alerts[0].severity, 'warn');
});

test('representative read projection performance, no solver call', () => {
  const tasks = Array.from({ length: 266 }, (_, index) => task(index + 1));
  const began = performance.now(); for (let i = 0; i < 10; i++) project(tasks);
  const meanMs = (performance.now() - began) / 10;
  assert.ok(meanMs < 100, `projection mean ${meanMs}ms`);
  console.log(JSON.stringify({ benchmark: 'control-room-266', iterations: 10, meanMs }));
});
