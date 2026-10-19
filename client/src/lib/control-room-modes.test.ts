import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedControlRoomModes, resolveControlRoomMode, modeStorageKey, readHealth } from './control-room-modes';
import type { ExecutionContext } from '../../../shared/execution';

const context = (role: ExecutionContext['role']): ExecutionContext => ({ role, hasScope: false, planningReady: true, planningState: 'accepted', draftPending: false,
  tasks: [], clock: { mode: 'auto', revision: null, operationalAt: '2026-10-19T08:00:00Z', serverAt: '2026-10-19T08:00:00Z' } });

test('perspectives follow verified role and execution authority, never localStorage', () => {
  assert.deepEqual(allowedControlRoomModes('admin', context('admin')), ['production', 'director', 'technical']);
  assert.deepEqual(allowedControlRoomModes('production', context('production')), ['production', 'director']);
  assert.deepEqual(allowedControlRoomModes('viewer', context('viewer')), ['director']);
  assert.deepEqual(allowedControlRoomModes('aux', context('aux')), ['production']);
  assert.deepEqual(allowedControlRoomModes(null, context('admin')), []);
  assert.deepEqual(allowedControlRoomModes('viewer', context('admin')), []);
  assert.deepEqual(allowedControlRoomModes('admin', null), ['technical'], 'diagnostics survives failed execution read');
  assert.deepEqual(allowedControlRoomModes('production', null), ['production'], 'global preview requires confirmed authority');
});

test('account switch, revoked role and saved forbidden perspectives clamp on every render', () => {
  for (const saved of ['technical', 'director', 'production', 'bogus', null]) {
    assert.equal(resolveControlRoomMode(saved, allowedControlRoomModes('viewer')), 'director');
    assert.equal(resolveControlRoomMode(saved, allowedControlRoomModes('aux')), 'production');
    assert.equal(resolveControlRoomMode(saved, allowedControlRoomModes(null)), null);
  }
  assert.notEqual(modeStorageKey('first'), modeStorageKey('second'));
  assert.equal(resolveControlRoomMode('technical', allowedControlRoomModes('production', context('production'))), 'production');
});

test('health retains last success but distinguishes errors, offline, stale and unconfirmed reads', () => {
  const query = { dataUpdatedAt: 10000, isError: false, isFetching: false, error: null };
  assert.equal(readHealth(query, 11000, 5000, true).label, 'Lectura HTTP confirmada');
  assert.equal(readHealth({ ...query, isError: true }, 11000, 5000, true).label, 'Error de consulta');
  assert.equal(readHealth(query, 11000, false, false).label, 'Sin reconfirmar · offline');
  assert.deepEqual(readHealth(query, 36000, 5000, true), { ageSeconds: 26, stale: true, label: 'Dato obsoleto' });
  assert.equal(readHealth({ ...query, dataUpdatedAt: 0 }, 36000, 5000, true).label, 'Sin confirmar');
});
