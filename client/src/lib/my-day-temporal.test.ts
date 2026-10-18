import test from 'node:test';
import assert from 'node:assert/strict';
import type { ExecutionContext } from '../../../shared/execution';
import type { ExecutionTask } from './day-execution-view';
import { myDayTemporal } from './my-day-temporal';

const date = '2026-10-18';
const at = (time: string) => Date.parse(`${date}T${time}+02:00`);
const context: ExecutionContext = { role: 'production', planningReady: true, planningState: 'accepted', draftPending: false, hasScope: true,
  clock: { operationalAt: `${date}T08:05:00Z`, serverAt: '2026-10-18T13:00:00Z', mode: 'auto', revision: null }, tasks: [] };
const task: ExecutionTask = { id: 1, status: 'in_progress', startPlanned: '10:00', endPlanned: '10:10', startRealAt: `${date}T08:00:00Z`, executionClockMode: 'auto', executionClockRevision: null };
const project = (now: string, changes: Partial<ExecutionTask> = {}, ctx = context, day = date, online = true) => myDayTemporal({ ...task, ...changes }, day, at(now), ctx, online);

test('ten minute placement turns orange exactly two minutes before its end and red only after the end', () => {
  assert.deepEqual(project('10:00:00'), { kind: 'normal', seconds: 600 });
  assert.deepEqual(project('10:07:59'), { kind: 'normal', seconds: 121 });
  assert.deepEqual(project('10:08:00'), { kind: 'ending', seconds: 120 });
  assert.deepEqual(project('10:09:59'), { kind: 'ending', seconds: 1 });
  assert.deepEqual(project('10:10:00'), { kind: 'ending', seconds: 0 });
  assert.deepEqual(project('10:10:01'), { kind: 'overrun', seconds: 1 });
  assert.deepEqual(project('10:12:30'), { kind: 'overrun', seconds: 150 });
  assert.deepEqual(myDayTemporal(task, date, at('10:10:00') + 1, context), { kind: 'overrun', seconds: 1 });
});

test('late start and pauses never postpone the accepted finish; simultaneous tasks use their own placements', () => {
  const late = { startRealAt: `${date}T08:07:00Z`, pausedTotalSeconds: 30 };
  assert.deepEqual(project('10:08:00', late), { kind: 'ending', seconds: 120 });
  assert.deepEqual(project('10:10:01', late), { kind: 'overrun', seconds: 1 });
  assert.deepEqual(project('10:08:00', { id: 2, endPlanned: '10:20' }), { kind: 'normal', seconds: 720 });
  assert.deepEqual(project('10:08:00', { id: 3, endPlanned: '10:05' }), { kind: 'overrun', seconds: 180 });
  assert.deepEqual(project('10:00:48', { endPlanned: '10:01' }), { kind: 'ending', seconds: 12 });
});

test('finished activities show recorded start, end and active-duration deviations, independent of current time and connectivity', () => {
  const completed = { status: 'done', startRealAt: `${date}T08:02:00Z`, endRealAt: `${date}T08:09:00Z`, pausedTotalSeconds: 60 };
  const expected = { kind: 'completed', startDelta: 120, endDelta: -60, durationDelta: -240 };
  assert.deepEqual(project('10:20:00', completed), expected);
  assert.deepEqual(project('10:20:00', completed, context, date, false), expected);
  assert.deepEqual(project('10:20:00', { ...completed, endRealAt: `${date}T08:12:00Z`, pausedTotalSeconds: 0 }), { kind: 'completed', startDelta: 120, endDelta: 120, durationDelta: 0 });
  assert.deepEqual(project('10:20:00', { status: 'done', endRealAt: `${date}T08:10:00Z` }), { kind: 'completed', startDelta: 0, endDelta: 0, durationDelta: 0 });
});

test('missing accepted placement, invalid geometry, records or non-comparable dates remain neutral', () => {
  for (const changes of [
    { startPlanned: null }, { endPlanned: null }, { endPlanned: '10:00' }, { endPlanned: '09:59' }, { endPlanned: '24:00' },
    { startRealAt: null }, { startRealAt: `${date}T10:00:00` }, { startRealAt: '2026-10-17T08:00:00Z' },
    { startRealAt: `${date}T08:06:00Z` }, { endRealAt: `${date}T08:04:00Z` }, { pausedAt: `${date}T08:04:00Z` },
    { pausedTotalSeconds: -1 }, { pausedTotalSeconds: NaN }, { pausedTotalSeconds: 301 },
    { executionClockMode: null }, { executionClockRevision: '2026-10-18T07:00:00Z' },
  ]) assert.equal(project('10:05:00', changes)?.kind, 'neutral', JSON.stringify(changes));
  assert.equal(project('10:05:00', {}, { ...context, planningReady: false })?.kind, 'neutral');
  assert.equal(project('10:05:00', {}, { ...context, draftPending: true })?.kind, 'neutral');
  assert.equal(myDayTemporal(task, date, at('10:05:00'))?.kind, 'neutral');
  assert.equal(myDayTemporal(task, date, NaN, context)?.kind, 'neutral');
  assert.equal(project('10:05:00', {}, context, '2026-10-17')?.kind, 'neutral');
  assert.equal(project('10:05:00', {}, context, '2026-02-30')?.kind, 'neutral');
  assert.equal(project('10:05:00', {}, context, date, false)?.kind, 'neutral');
  assert.equal(project('10:05:00', { status: 'done', endRealAt: null })?.kind, 'neutral');
  assert.equal(project('10:05:00', { status: 'done', endRealAt: '2026-10-19T08:10:00Z' })?.kind, 'neutral');
  assert.equal(project('10:05:00', { status: 'done', endRealAt: `${date}T07:59:00Z` })?.kind, 'neutral');
  assert.equal(project('09:59:00', { startRealAt: `${date}T07:58:00Z` })?.kind, 'neutral');
});

test('authorized simulation uses operational time and revision, never server wall time or browser timezone', () => {
  const revision = '2026-10-18T12:00:00Z';
  const simulated = { ...context, clock: { ...context.clock, mode: 'manual' as const, revision } };
  assert.deepEqual(project('10:08:00', { executionClockMode: 'manual', executionClockRevision: '2026-10-18T14:00:00+02:00' }, simulated), { kind: 'ending', seconds: 120 });
  assert.equal(project('10:08:00', {}, simulated)?.kind, 'neutral');
  assert.equal(project('10:08:00', { executionClockMode: 'manual', executionClockRevision: '2026-10-18T11:00:00Z' }, simulated)?.kind, 'neutral');
  assert.equal(project('10:08:00', {}, { ...context, clock: { ...context.clock, operationalAt: 'invalid' } })?.kind, 'neutral');
  assert.equal(project('10:08:00', {}, { ...context, clock: { ...context.clock, serverAt: 'invalid' } })?.kind, 'neutral');
});

test('DST gaps and repeated Madrid wall times are not comparable', () => {
  for (const [day, start, end] of [['2026-03-29', '02:10', '03:10'], ['2026-10-25', '02:10', '02:20']]) {
    const now = Date.parse(`${day}T01:15:00Z`);
    assert.equal(myDayTemporal({ ...task, startPlanned: start, endPlanned: end, startRealAt: `${day}T00:00:00Z` }, day, now, context)?.kind, 'neutral');
  }
});

test('pending, interrupted and cancelled do not acquire running signals; projection never mutates inputs or permissions', () => {
  const frozen = Object.freeze({ ...task });
  const before = JSON.stringify({ task: frozen, context });
  for (const status of ['pending', 'interrupted', 'cancelled', 'unknown']) assert.equal(project('10:12:00', { status }), null);
  for (const now of ['10:05:00', '10:08:00', '10:12:00']) myDayTemporal(frozen, date, at(now), context);
  assert.equal(JSON.stringify({ task: frozen, context }), before);
});
