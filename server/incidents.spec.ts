import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { actor, executionDatabase } from './fixtures/executionDatabase';
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

// The same real SQL predicate controls War Room queries, commands and RLS.

test('G0: editorial/revoked scope denies incident lifecycle and hides rows/events through RLS', async () => {
  const db = await executionDatabase({ incidents: true });
  try {
    await db.exec(`INSERT INTO user_entity_links VALUES('${actor(3)}','staff_person',5,true);
      INSERT INTO plan_staff_assignments VALUES(1,5,'space',NULL,10,'editorial');`);
    const command = async (action: string, fields: object, user=actor(3), id: string|null=null, version: number|null=null) =>
      (await db.query<any>('SELECT incident_command(1,$1,$2,$3,$4,$5) value',[user,action,JSON.stringify(fields),id,version])).rows[0].value;
    const create = () => ({ requestId: randomUUID(), type:'technical',severity:'warn',description:'Fallo local',taskId:1 });
    const material = async () => (await db.query(`SELECT
      (SELECT jsonb_agg(i ORDER BY id) FROM operational_incidents i) incidents,
      (SELECT jsonb_agg(e ORDER BY id) FROM operational_incident_events e) events,
      (SELECT jsonb_agg(t ORDER BY id) FROM daily_tasks t) tasks,
      (SELECT jsonb_agg(e ORDER BY id) FROM task_status_events e) execution`)).rows;
    const query = async (context=false, user=actor(3)) => (await db.query<any>('SELECT incident_query(1,$1,NULL,$2) value',[user,context])).rows[0].value;
    const context=await query(true);
    assert.equal(context.canCreate,false);assert.ok(context.tasks.every((t:any)=>!t.canReport));
    const before=await material();
    await assert.rejects(()=>command('create',create()),/INCIDENT_FORBIDDEN/);
    assert.deepEqual(await material(),before);
    const incident=await command('create',create(),actor(2));
    assert.deepEqual(await query(),[]);
    const denied=await material();
    for (const [action,fields] of [['update',{description:'No'}],['resolve',{note:'No'}],['reopen',{note:'No'}],['escalate',{note:'No'}]] as const) {
      await assert.rejects(()=>command(action,fields,actor(3),incident.id,1),/INCIDENT_FORBIDDEN/);
      assert.deepEqual(await material(),denied);
    }
    await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${actor(3)}'`);
    assert.deepEqual((await db.query('SELECT * FROM operational_incidents')).rows,[]);
    assert.deepEqual((await db.query('SELECT * FROM operational_incident_events')).rows,[]);
    await db.exec('RESET ROLE');
    // Promote the assignment, keeping the global aux role unchanged.
    await db.exec("UPDATE plan_staff_assignments SET staff_role='production'");
    assert.equal((await query(true)).canCreate,true);
    assert.equal((await query()).length,1);
    const made=await command('create',create());
    await command('update',{cause:'Cable'},actor(3),made.id,1);
    await command('escalate',{note:'Coordinar'},actor(3),made.id,2);
    await command('resolve',{note:'Resuelto'},actor(3),made.id,3);
    await command('reopen',{note:'Reaparece'},actor(3),made.id,4);
    const detail=(await db.query<any>('SELECT incident_query(1,$1,$2) value',[actor(3),made.id])).rows[0].value;
    assert.deepEqual(detail.events.map((e:any)=>e.action),['created','updated','escalated','resolved','reopened']);
    await db.exec('DELETE FROM plan_staff_assignments');
    const revoked=await material();
    await assert.rejects(()=>command('resolve',{note:'Revocado'},actor(3),made.id,5),/INCIDENT_FORBIDDEN/);
    assert.deepEqual(await material(),revoked);assert.deepEqual(await query(),[]);
    assert.equal((await query(true,actor(4))).canCreate,false);
    assert.ok((await query(false,actor(4))).length>0,'viewer keeps legitimate global read authority');
    await assert.rejects(()=>command('create',create(),actor(4)),/INCIDENT_FORBIDDEN/);
    // Compatible replacement is idempotent and keeps the functions service-only.
    await db.exec(readFileSync('supabase/migrations/096_production_execution_scope.sql','utf8'));
    await db.exec('SET ROLE authenticated');
    await assert.rejects(()=>db.query('SELECT execution_task_scope(1,$1)',[actor(2)]),/permission denied/);
    await db.exec('RESET ROLE');
  } finally { await db.close(); }
});
