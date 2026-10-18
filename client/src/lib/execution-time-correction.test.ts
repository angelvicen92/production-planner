import test from 'node:test';
import assert from 'node:assert/strict';
import { canCorrectExecutionTime, completeExecutionInstant, madridWallTime, resolveMadridCorrection } from './execution-time-correction';
import type { ExecutionContext } from '../../../shared/execution';

test('Madrid seconds round-trip, summer/winter, invalid dates and DST gap/fold fail closed', () => {
  assert.equal(resolveMadridCorrection('2026-07-10', '12:03:47').realAt, '2026-07-10T10:03:47.000Z');
  assert.equal(resolveMadridCorrection('2026-12-10', '12:03:47').realAt, '2026-12-10T11:03:47.000Z');
  assert.equal(resolveMadridCorrection('2026-12-10', '12:03').realAt, '2026-12-10T11:03:00.000Z');
  assert.match(resolveMadridCorrection('2026-03-29', '02:30:00').error!, /no existe/);
  assert.match(resolveMadridCorrection('2026-10-25', '02:30:00').error!, /dos veces/);
  for (const day of ['', '2026-02-30', '2026-13-01']) assert.ok(resolveMadridCorrection(day, '12:00:00').error);
  for (const time of ['', '24:00:00', '12:60:00', '12:00:60']) assert.ok(resolveMadridCorrection('2026-10-18', time).error);
  for (const day of ['2026-03-29', '2026-10-25']) for (const time of ['00:01:09', '01:59:59', '03:00:00', '23:59:59']) {
    const { realAt } = resolveMadridCorrection(day, time);
    assert.ok(realAt); assert.equal(madridWallTime(realAt!), `${day}T${time}`);
  }
  assert.equal(madridWallTime('2026-10-25T00:30:00Z'), '2026-10-25T02:30:00');
  assert.equal(madridWallTime('2026-10-25T01:30:00Z'), '2026-10-25T02:30:00');
});

test('conversion does not depend on device timezone; incomplete legacy times never become instants', () => {
  const previous = process.env.TZ;
  try {
    for (const tz of ['America/New_York', 'Asia/Tokyo', 'UTC']) {
      process.env.TZ = tz;
      assert.equal(resolveMadridCorrection('2026-10-18', '10:07:19').realAt, '2026-10-18T08:07:19.000Z');
      assert.equal(madridWallTime('2026-10-18T08:07:19Z'), '2026-10-18T10:07:19');
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  for (const time of [null, undefined, '10:00', '2026-10-18T10:00:00', 'bad']) assert.equal(completeExecutionInstant(time), false);
});

test('nominal authority permits terminal corrections independently of canExecute and rejects incomplete records', () => {
  const context = { role: 'aux', tasks: [{ taskId: 1, hasAuthority: true, canExecute: false }] } as ExecutionContext;
  const task = { id: 1, status: 'done', executionVersion: 3, startRealAt: '2026-10-18T08:00:00Z', endRealAt: '2026-10-18T08:10:00Z' };
  assert.equal(canCorrectExecutionTime(task, context), true);
  for (const role of ['viewer', null]) assert.equal(canCorrectExecutionTime(task, { ...context, role: role as ExecutionContext['role'] }), false);
  assert.equal(canCorrectExecutionTime(task, { ...context, tasks: [{ ...context.tasks[0], hasAuthority: false, canExecute: true }] }), false);
  assert.equal(canCorrectExecutionTime(task), false);
  for (const change of [{ startRealAt: null }, { startRealAt: '10:00' }, { endRealAt: null }, { executionVersion: undefined }, { executionVersion: -1 }, { status: 'pending' }]) assert.equal(canCorrectExecutionTime({ ...task, ...change }, context), false);
  assert.equal(canCorrectExecutionTime({ ...task, status: 'in_progress', endRealAt: null }, context), true);
  assert.equal(canCorrectExecutionTime({ ...task, status: 'interrupted', endRealAt: null }, context), true);
});
