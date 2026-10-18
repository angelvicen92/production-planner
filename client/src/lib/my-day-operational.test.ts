import test from 'node:test';
import assert from 'node:assert/strict';
import type { ExecutionContext } from '../../../shared/execution';
import type { ExecutionTask } from './day-execution-view';
import { dayGroups, lastOperationalTasks, myDayNeighbours, myDayScopeChoices, myDayTasks, taskZone } from './my-day-operational';

const task = (id: number, patch: Partial<ExecutionTask> = {}): ExecutionTask => ({ id, contestantId: 7, status: 'pending', startPlanned: '10:00', endPlanned: '10:15', ...patch });
const context = (ids: number[], role: ExecutionContext['role'] = 'aux'): ExecutionContext => ({ role, hasScope: ids.length > 0, planningReady: true, planningState: 'accepted', draftPending: false, clock: { operationalAt: '2026-10-30T10:00:00Z', serverAt: '2026-10-30T10:00:00Z', mode: 'auto', revision: null }, tasks: [1, 2, 3, 4].map(taskId => ({ taskId, inScope: ids.includes(taskId), hasAuthority: role === 'aux' && ids.includes(taskId), canExecute: role === 'aux' && ids.includes(taskId), resources: [] })) });
const spaces = [{ spaceId: 10, zoneId: 20 }, { spaceId: 11, zoneId: 20 }, { spaceId: 12, zoneId: 21 }];
const tasks = [task(1, { spaceId: 10 }), task(2, { spaceId: 11 }), task(3, { spaceId: 12 }), task(4, { zoneId: 22 })];

test('multiple zones/spaces and overlapping helpers narrow only the effective server scope', () => {
  assert.deepEqual(myDayTasks(tasks, context([1, 2, 3]), true, 'all', spaces).map(t => t.id), [1, 2, 3]);
  assert.deepEqual(myDayTasks(tasks, context([1, 2, 3]), true, 'zone:20', spaces).map(t => t.id), [1, 2]);
  assert.deepEqual(myDayTasks(tasks, context([1, 3]), true, 'zone:20', spaces).map(t => t.id), [1]);
  assert.deepEqual(myDayTasks(tasks, context([1, 2, 3]), true, 'space:12', spaces).map(t => t.id), [3]);
  assert.deepEqual(myDayTasks(tasks, context([1]), true, 'space:12', spaces), []);
  assert.deepEqual(myDayTasks(tasks, context([1, 3]), true, 'all', spaces).map(t => t.id), [1, 3]);
  assert.equal(taskZone(task(5, { spaceId: 10, zoneId: 21 }), spaces), 21);
  assert.equal(taskZone(task(5, { spaceId: 99 }), spaces), null);
});

test('no identity, editorial-only and viewer contexts do not manufacture execution permissions', () => {
  assert.deepEqual(myDayTasks(tasks, undefined, true, 'all', spaces), []);
  for (const role of ['aux', 'viewer'] as const) {
    const c = context([], role), before = structuredClone(c);
    assert.equal(myDayTasks(tasks, c, true, 'all', spaces).length, 4, 'existing read-only whole-day consultation');
    assert.deepEqual(myDayScopeChoices(tasks, c, spaces, new Map(), new Map()), []);
    assert.deepEqual(c, before);
    assert.ok(c.tasks.every(t => !t.canExecute));
  }
});

test('focus options deduplicate scope locations, preserve partial scopes and daily zone identity', () => {
  const options = myDayScopeChoices(tasks, context([1, 2, 3]), spaces, new Map([[20, { name: 'Plató 14' }], [21, { name: 'Plató 15' }]]), new Map([[10, { name: 'Ensayo' }], [11, { name: 'Reality' }], [12, { name: 'Vocal' }]]));
  assert.deepEqual(options.map(o => o.value).sort(), ['space:10', 'space:11', 'space:12', 'zone:20', 'zone:21']);
  assert.ok(!options.some(o => o.value === 'zone:22'));
});

test('previous and next use received planning even outside visible scope and regardless of execution order', () => {
  const before = task(90, { startPlanned: '09:30', endPlanned: '09:45', startRealAt: '2026-10-30T15:00:00Z' });
  const current = task(1);
  const after = task(2, { startPlanned: '11:00', endPlanned: '11:15' });
  for (const status of ['pending', 'in_progress', 'done']) {
    const all = [after, current, { ...before, status }], snapshot = structuredClone(all);
    const neighbours = myDayNeighbours(current, all);
    assert.deepEqual(neighbours.previous.map(t => [t.id, t.status]), [[90, status]]);
    assert.deepEqual(neighbours.next.map(t => t.id), [2]);
    assert.deepEqual(all, snapshot);
  }
});

test('simultaneous and tied activities are explicit plural relations, never an ID-derived route', () => {
  const current = task(5);
  const peers = [task(2, { startPlanned: '09:00', endPlanned: '09:45' }), task(3, { startPlanned: '09:20', endPlanned: '09:45' }), current, task(6), task(7, { startPlanned: '10:15', endPlanned: '10:45' }), task(8, { startPlanned: '10:15', endPlanned: '10:30' })];
  const result = myDayNeighbours(current, peers);
  assert.deepEqual(result.previous.map(t => t.id), [2, 3]);
  assert.deepEqual(result.simultaneous.map(t => t.id), [6]);
  assert.deepEqual(result.next.map(t => t.id), [7, 8]);
});

test('missing contestants, absent neighbours, invalid/incomplete schedules do not imply a journey', () => {
  for (const patch of [{ contestantId: null }, { startPlanned: null }, { endPlanned: '09:00' }]) {
    assert.deepEqual(myDayNeighbours(task(1, patch), tasks), { previous: [], next: [], simultaneous: [] });
  }
  assert.deepEqual(myDayNeighbours(task(1), [task(1), task(2, { contestantId: 8 }), task(3, { startPlanned: null })]), { previous: [], next: [], simultaneous: [] });
});

test('last known operational location requires actual execution and does not use scheduled/cancelled/future records', () => {
  const now = Date.parse('2026-10-30T10:00:00Z');
  const all = [task(1, { status: 'done', startRealAt: '2026-10-30T08:00:00Z', endRealAt: '2026-10-30T08:30:00Z' }), task(2, { status: 'pending', startRealAt: '2026-10-30T09:00:00Z' }), task(3, { status: 'done' }), task(4, { status: 'in_progress', startRealAt: '2026-10-30T11:00:00Z' }), task(5, { status: 'cancelled', endRealAt: '2026-10-30T09:30:00Z' })];
  assert.deepEqual(lastOperationalTasks(task(7), all, now).map(t => t.id), [1]);
  assert.deepEqual(lastOperationalTasks(task(7, { contestantId: null }), all, now), []);
  assert.deepEqual(lastOperationalTasks(task(7), [], now), []);
  const pause = task(6, { status: 'interrupted', startRealAt: '2026-10-30T08:40:00Z', pausedAt: '2026-10-30T09:00:00Z' });
  assert.deepEqual(lastOperationalTasks(task(7), [...all, pause], now).map(t => t.id), [6]);
});

test('every existing activity state belongs to exactly one operational group', () => {
  assert.deepEqual(dayGroups.flatMap(g => [...g.statuses]).sort(), ['cancelled', 'done', 'in_progress', 'interrupted', 'pending']);
});


test('cancelled work is visible as a prior state but is not a next destination', () => {
  const current = task(1);
  const cancelled = task(2, { status: 'cancelled', startPlanned: '10:15', endPlanned: '10:30' });
  const next = task(3, { startPlanned: '11:00', endPlanned: '11:15' });
  assert.deepEqual(myDayNeighbours(current, [current, cancelled, next]).next.map(t => t.id), [3]);
});


test('same-name spaces in different zones have distinguishable focus labels', () => {
  const options = myDayScopeChoices([task(1, { spaceId: 10 }), task(3, { spaceId: 12 })], context([1, 3]), spaces, new Map([[20, { name: 'Plató 14' }], [21, { name: 'Plató 15' }]]), new Map([[10, { name: 'Ensayo' }], [12, { name: 'Ensayo' }]]));
  const labels = options.filter(o => o.value.startsWith('space:')).map(o => o.label);
  assert.equal(new Set(labels).size, 2);
  assert.ok(labels.some(label => label.includes('Ensayo') && label.includes('Plató 14')));
  assert.ok(labels.some(label => label.includes('Ensayo') && label.includes('Plató 15')));
});
