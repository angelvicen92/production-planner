import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActivityInformation } from './activity-information';
import type { ExecutionTask } from '../../lib/day-execution-view';

const pending: ExecutionTask = { id: 1, contestantId: 9, status: 'pending', startPlanned: '10:00', endPlanned: '10:15' };
const render = (task: ExecutionTask, allTasks: ExecutionTask[] = [task]) => renderToStaticMarkup(<ActivityInformation task={task} allTasks={allTasks} nowMs={Date.parse('2026-10-30T10:00:00Z')} resources={['CAM 2', 'Sonido']} location={t => t.locationLabel ?? 'Sin ubicación'} />);

test('each activity exposes planned and persisted actual endpoints, active duration and effective resources', () => {
  const done = { ...pending, status: 'done', startReal: '10:01', endReal: '10:12', startRealAt: '2026-10-30T09:01:00Z', endRealAt: '2026-10-30T09:12:00Z' };
  const html = render(done);
  for (const value of ['Inicio previsto', 'Fin previsto', 'Inicio real', 'Fin real', '10:01', '10:12', '11:00', 'CAM 2', 'Sonido']) assert.ok(html.includes(value), value);
  const interrupted = render({ ...done, status: 'interrupted', endReal: null, endRealAt: null, pausedAt: '2026-10-30T09:10:00Z' });
  assert.match(interrupted, /09:00/);
  assert.doesNotMatch(interrupted, /en curso/);
});

test('incoming previous status remains visible for running, done and pending; location never confirms physical presence', () => {
  for (const [status, label] of [['in_progress', 'En curso'], ['done', 'Completada'], ['pending', 'Pendiente']]) {
    const before = { ...pending, id: 2, name: 'Anterior', startPlanned: '09:00', endPlanned: '09:30', locationLabel: 'Plató 14', status };
    const html = render(pending, [before, pending]);
    assert.match(html, /Actividad anterior del concursante/);
    assert.ok(html.includes(label));
    assert.match(html, /Ubicación física actual: no confirmada/);
    assert.match(html, /Sin registro de ejecución disponible/);
  }
});

test('unknown neighbours and no contestant have explicit readable fallbacks', () => {
  assert.match(render(pending), /Sin actividad anterior identificable/);
  assert.match(render({ ...pending, status: 'in_progress' }), /Sin siguiente destino conocido/);
  const team = render({ ...pending, contestantId: null });
  assert.match(team, /Actividad sin concursante/);
  assert.doesNotMatch(team, /Última ubicación/);
});
