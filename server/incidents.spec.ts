import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncidentSchema, updateIncidentSchema, transitionIncidentSchema, legacyIncidentType } from '../shared/incidents';
import { incidentError } from './incidentErrors';
import { apiRequiredRoles } from './apiAuthorization';

const base = { requestId: '2bec64b8-306e-4a91-a5dc-1f33aac981b3', type: 'technical', severity: 'critical', description: '  Fallo de sonido  ' };
test('incident contract trims mandatory facts, leaves unknown links/notes null and rejects forged authority', () => {
  const value = createIncidentSchema.parse(base);
  assert.equal(value.description, 'Fallo de sonido');
  for (const key of ['taskId', 'spaceId', 'zoneId', 'contestantId', 'resourceId', 'responsibleId', 'cause', 'context'] as const) assert.equal(value[key], null);
  for (const extra of [{ authorId: 'forged' }, { planId: 2 }, { version: 99 }, { createdAt: new Date().toISOString() }, { resolvedAt: null }, { status: 'resolved' }]) assert.equal(createIncidentSchema.safeParse({ ...base, ...extra }).success, false);
  for (const extra of [{ description: ' ' }, { description: 'x'.repeat(4001) }, { type: 'Nota' }, { resourceId: -1 }, { taskId: '10' }, { responsibleId: 1.5 }, { taskId: Number.MAX_SAFE_INTEGER + 1 }]) assert.equal(createIncidentSchema.safeParse({ ...base, ...extra }).success, false);
});
test('partial updates preserve omitted fields and require observed version; transitions require a decision', () => {
  assert.deepEqual(updateIncidentSchema.parse({ expectedVersion: 1, severity: 'warn' }), { expectedVersion: 1, severity: 'warn' });
  for (const input of [{ expectedVersion: 1 }, { description: 'Cambio sin versión' }, { expectedVersion: 0, description: 'Cambio' }, { expectedVersion: 1, authorId: 'forged' }]) assert.equal(updateIncidentSchema.safeParse(input).success, false);
  assert.equal(transitionIncidentSchema.safeParse({ expectedVersion: 1, note: ' ' }).success, false);
  assert.equal(transitionIncidentSchema.safeParse({ expectedVersion: 1, note: 'Decisión', status: 'resolved' }).success, false);
  assert.equal(transitionIncidentSchema.parse({ expectedVersion: 3, note: ' Cable cambiado ' }).note, 'Cable cambiado');
  assert.equal(legacyIncidentType.Interrupción, 'task_interrupted');
});
test('incident HTTP policy admits aux only to the database scope check, viewer only to queries', () => {
  for (const path of ['/plans/12/incidents', '/plans/12/incidents/context', '/plans/12/incidents/abc/resolve']) {
    assert.deepEqual(apiRequiredRoles('GET', path), ['admin', 'production', 'aux', 'viewer']);
    for (const method of ['POST', 'PATCH', 'DELETE']) assert.deepEqual(apiRequiredRoles(method, path), ['admin', 'production', 'aux']);
  }
});
test('incident failures return actionable HTTP codes and never expose database internals', () => {
  for (const [message, status] of [['INCIDENT_FORBIDDEN', 403], ['INCIDENT_NOT_FOUND', 404], ['INCIDENT_STALE', 409], ['INCIDENT_REQUEST_CONFLICT', 409], ['INCIDENT_TRANSITION', 409], ['INCIDENT_INVALID_LINK', 400], ['database password secret; failure at server', 503]] as const) {
    const failure = incidentError({ message }); assert.equal(failure.status, status); assert.ok(!failure.message.includes(message));
  }
  for (const code of ['23503', '23514', '22P02', '23502']) assert.equal(incidentError({ code, message: 'internal' }).status, 400);
});
