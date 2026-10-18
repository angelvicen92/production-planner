import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectControlRoom, type TaskRead } from '../../lib/control-room-metrics';
import type { ExecutionContext } from '../../../../shared/execution';
import type { Incident } from '../../../../shared/incidents';
import { activitySections, allActivities, selectActivities } from './temporal-navigation';
import { signedDuration } from './presentation';

const nowMs = Date.parse('2026-10-14T08:30:20Z');
const execution: ExecutionContext = { role: 'production', planningReady: true, planningState: 'accepted', draftPending: false, hasScope: true,
  clock: { mode: 'auto', revision: null, operationalAt: new Date(nowMs).toISOString(), serverAt: new Date(nowMs).toISOString() }, tasks: [] };
const task = (id: number, patch: Partial<TaskRead> = {}): TaskRead => ({ id, planId: 1, status: 'pending', zoneId: 1, spaceId: 10, startPlanned: '10:00', endPlanned: '10:15', ...patch });
const project = (tasks: TaskRead[], context = execution, incidents: Incident[] | null = []) => projectControlRoom({
  plan: { id: 1, date: '2026-10-14', dailyTasks: tasks }, execution: context, nowMs, incidents,
  zones: [{ id: 1, name: 'Plató A' }, { id: 2, name: 'Plató B' }],
  spaces: [{ id: 10, zoneId: 1, name: 'Espacio A' }, { id: 11, zoneId: 1, name: 'Espacio paralelo' }, { id: 20, zoneId: 2, name: 'Sin actividad' }],
});
const selected = (m: ReturnType<typeof project>, filters = allActivities) => selectActivities(m, filters).flatMap(zone => zone.spaces.flatMap(space => space.tasks));

test('A2: all 266 identities survive selection and temporal sections, exactly once; input stays literal', () => {
  const fixture = JSON.parse(readFileSync('server/fixtures/assistedA2S10.json', 'utf8'));
  const states = ['done', 'in_progress', 'pending', 'interrupted', 'cancelled', 'unknown'];
  const tasks = fixture.snapshot.tasks.map((t: { taskId: number }, i: number) => ({ ...t, id: t.taskId, planId: 1, status: states[i % states.length] }));
  const input = JSON.stringify(tasks);
  const m = project(tasks), before = JSON.stringify(m);
  const visible = selectActivities(m, allActivities);
  const rows = visible.flatMap(zone => zone.spaces.flatMap(space => Object.values(activitySections(space.tasks)).flat()));
  assert.equal(rows.length, 266);
  assert.deepEqual(rows.map(task => task.id).sort(), tasks.map((t: TaskRead) => t.id).sort());
  assert.equal(new Set(rows.map(task => task.id)).size, 266);
  assert.ok(rows.every(task => m.tasks.includes(task)), 'reuse projected objects');
  for (const state of states) assert.equal(selected(m, { ...allActivities, state: state as any }).length, m.counts[state as keyof typeof m.counts]);
  assert.equal(JSON.stringify(tasks), input); assert.equal(JSON.stringify(m), before);
});

test('combined zone, space and state filters intersect without changing global summary', () => {
  const m = project([task(1, { status: 'done' }), task(2, { spaceId: 11 }), task(3, { zoneId: 2, spaceId: 20 })]);
  const before = JSON.stringify(m);
  assert.deepEqual(selected(m, { ...allActivities, zone: 'zone-1', space: 'zone-1-space-11', state: 'pending' }).map(t => t.id), [2]);
  assert.equal(selected(m, { ...allActivities, zone: 'zone-2', space: 'zone-1-space-11' }).length, 0);
  assert.equal(selected(m, { ...allActivities, state: 'in_progress' }).length, 0);
  assert.equal(m.total, 3); assert.equal(m.counts.done, 1); assert.equal(JSON.stringify(m), before);
});

test('empty spaces remain visible; active and confirmed problems select individual spaces', () => {
  const m = project([task(1, { status: 'in_progress' }), task(2, { spaceId: 11, status: 'in_progress' }), task(3, { status: 'interrupted' })]);
  assert.equal(selectActivities(m, allActivities).flatMap(z => z.spaces).length, 3);
  assert.equal(selected(m, { ...allActivities, activity: 'active', state: 'in_progress' }).length, 2);
  assert.deepEqual(selectActivities(m, { ...allActivities, activity: 'problems' }).flatMap(z => z.spaces.map(s => s.unit.id)), [10]);
});

test('completed history follows real finish, simultaneous and unplanned work remain available', () => {
  const m = project([task(1, { status: 'done', endRealAt: '2026-10-14T08:10:00Z' }), task(2, { status: 'done', endRealAt: '2026-10-14T08:20:01Z' }),
    task(3, { status: 'done' }), task(4, { startPlanned: null, endPlanned: null }), task(5), task(6, { status: 'in_progress' }), task(7, { status: 'in_progress' })]);
  const sections = activitySections(m.tasks);
  assert.deepEqual(sections.completed.map(t => t.id), [2, 1, 3]);
  assert.deepEqual(sections.pending.map(t => t.id), [5, 4]);
  assert.equal(sections.current.length, 2);
});

test('missing locations, unknown states and null metrics never disappear or become calculated', () => {
  const m = project([task(1, { status: 'unknown', spaceId: null, zoneId: null }), task(2, { status: 'done', startRealAt: '10:00' })]);
  assert.equal(selected(m).length, 2); assert.ok(selectActivities(m, allActivities).some(z => z.zone.id === null));
  assert.equal(selected(m, { ...allActivities, state: 'done' })[0].durationDeltaSeconds, null);
  assert.equal(signedDuration(null), 'No calculable'); assert.equal(signedDuration(20), '+00:20'); assert.equal(signedDuration(-20), '−00:20'); assert.equal(signedDuration(0), '00:00');
});

test('viewer and production retain global read; aux selection cannot broaden the projected scope', () => {
  const tasks = [task(1), task(2, { spaceId: 20, zoneId: 2 })];
  for (const role of ['viewer', 'production'] as const) {
    const m = project(tasks, { ...execution, role }); assert.equal(selected(m).length, 2);
  }
  const m = project(tasks, { ...execution, role: 'aux', tasks: [{ taskId: 1, inScope: true, hasAuthority: false, canExecute: false, resources: [] }] });
  assert.deepEqual(selected(m).map(t => t.id), [1]); assert.equal(selectActivities(m, { ...allActivities, zone: 'zone-2' }).length, 0);
});

test('selection preserves shared incident references and unavailable register', () => {
  const open = { id: 'incident', planId: 1, status: 'open', type: 'space_blocked', severity: 'critical', spaceId: 10, zoneId: 1, taskId: 1, createdAt: new Date(nowMs).toISOString(), updatedAt: new Date(nowMs).toISOString() } as Incident;
  const resolved = { ...open, id: 'resolved', status: 'resolved' } as Incident;
  const m = project([task(1)], execution, [open, resolved]);
  const unit = selectActivities(m, { ...allActivities, space: 'zone-1-space-10' })[0].spaces[0].unit;
  assert.equal(unit.incidents[0], open); assert.equal(unit.incidents.length, 1); assert.equal(unit.blocked, true);
  assert.equal(m.incidents.recent.length, 2); assert.equal(project([], execution, null).incidents.open, null);
});
