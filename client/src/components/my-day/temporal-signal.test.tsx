import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { TemporalSignal } from './temporal-signal';
import type { MyDayTemporal } from '../../lib/my-day-temporal';

const render = (signal: MyDayTemporal | null) => renderToStaticMarkup(<TemporalSignal signal={signal} />);
test('signals express state and time without color or hover, with soft light/dark appearances', () => {
  for (const [kind, label, color] of [['normal', 'Dentro del horario previsto', 'emerald'], ['ending', 'Se acerca el fin previsto', 'orange'], ['overrun', 'Fin previsto superado', 'red']] as const) {
    const html = render({ kind, seconds: 120 });
    assert.ok(html.includes(label)); assert.ok(html.includes('02:00'));
    assert.ok(html.includes(kind === 'overrun' ? 'Exceso sobre el fin previsto' : 'Tiempo hasta el fin previsto'));
    assert.ok(html.includes(`bg-${color}-50`)); assert.ok(html.includes(`dark:bg-${color}-950`));
    assert.doesNotMatch(html, /role="alert"|aria-live|<button/);
  }
  assert.equal(render(null), '');
});
test('completed record is neutral and describes real deviations rather than a running alarm', () => {
  const html = render({ kind: 'completed', startDelta: 120, endDelta: -60, durationDelta: -240 });
  for (const value of ['Desviación real', 'Inicio: 02:00 después', 'Fin: 01:00 antes', 'Duración activa: 04:00 menos']) assert.ok(html.includes(value), value);
  assert.doesNotMatch(html, /Fin previsto superado|bg-red-|bg-orange-|bg-emerald-/);
  assert.match(render({ kind: 'neutral', reason: 'Sin conexión' }), /Comparación temporal no disponible.*Sin conexión/);
});
