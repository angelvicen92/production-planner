import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callSheetFixture } from './call-sheet-test-fixture';
import { callSheetSummary, canPreviewSheet, effectiveSheetAssignments, projectCallSheet, sheetSimultaneous, type SheetData, type SheetTarget } from './call-sheet-projection';

const ids = (data: SheetData, target: SheetTarget, planId = 1) => projectCallSheet(data, planId, target).entries.map(e => e.task.id);
test('production by zone; two people retain the same simultaneous activities', () => {
  const data = callSheetFixture();
  for (const id of [1, 2]) assert.deepEqual(ids(data, { kind: 'person', id }), [11, 12]);
  const result = projectCallSheet(data, 1, { kind: 'person', id: 1 });
  assert.deepEqual(result.entries.map(e => e.assignmentIds), [[31], [31]]);
  assert.equal(sheetSimultaneous(result.entries[0].task, result.entries.map(e => e.task)).length, 1);
});
test('space mode suppresses zone assignments without inheritance; zone mode suppresses space assignments', () => {
  const data = callSheetFixture();
  data.assignments.push({ ...data.assignments[0], id: 40, scopeType: 'space', zoneId: null, spaceId: 101 });
  data.modes[0].mode = 'space';
  assert.deepEqual(ids(data, { kind: 'person', id: 1 }), [11]);
  assert.deepEqual(ids(data, { kind: 'person', id: 2 }), []);
  data.modes[0].mode = 'zone';
  assert.deepEqual(effectiveSheetAssignments(data, 1).filter(a => a.staffPersonId === 1).map(a => a.id), [31]);
});
test('missing mode preserves explicit space/zone assignments, matching 096 defaults', () => {
  const data = callSheetFixture(); data.modes = [];
  assert.deepEqual(ids(data, { kind: 'person', id: 1 }), [11, 12]);
  assert.deepEqual(ids(data, { kind: 'person', id: 4 }), [13]);
});
test('one person with multiple areas gets their union once', () => {
  const data = callSheetFixture(); data.assignments[3].staffPersonId = 1;
  data.assignments.push({ ...data.assignments[0], id: 90 });
  assert.deepEqual(ids(data, { kind: 'person', id: 1 }), [11, 12, 13]);
});
test('editorial uses its own assignments; role aggregation and authority are independent', () => {
  const data = callSheetFixture();
  assert.deepEqual(ids(data, { kind: 'role', role: 'editorial' }), [13]);
  assert.deepEqual(ids(data, { kind: 'role', role: 'production' }), [11, 12, 13]);
  assert.deepEqual(ids(data, { kind: 'person', id: 3 }), [13]);
  assert.equal(canPreviewSheet('aux'), false); assert.equal(canPreviewSheet('viewer'), false);
  assert.equal(canPreviewSheet('admin'), true); assert.equal(canPreviewSheet('production'), true);
});
test('nominal resource uses day IDs mapped to global identity, never generic camera requirements', () => {
  const data = callSheetFixture();
  assert.deepEqual(ids(data, { kind: 'mine', resourceItemId: 91 }), [11, 12]);
  assert.deepEqual(ids(data, { kind: 'mine', resourceItemId: 92 }), [13]);
  assert.deepEqual(ids(data, { kind: 'mine', resourceItemId: 501 }), []);
  data.tasks[3].assignedResources = [502];
  assert.deepEqual(ids(data, { kind: 'mine', resourceItemId: 92 }), [14, 13]);
  assert.deepEqual(ids(data, { kind: 'resource-type', id: 8 }), [13]);
});
test('own staff and nominal resource paths remain independent', () => {
  assert.deepEqual(ids(callSheetFixture(), { kind: 'mine', staffPersonId: 1, resourceItemId: 92 }), [11, 12, 13]);
});
test('itinerant/reality assignments are explicitly unverifiable without effective task-team contract', () => {
  const data = callSheetFixture();
  data.assignments[0] = { ...data.assignments[0], scopeType: 'itinerant_team', itinerantTeamId: 64, zoneId: null };
  const result = projectCallSheet(data, 1, { kind: 'person', id: 1 });
  assert.deepEqual(result.entries, []); assert.match(result.warnings.join(' '), /Asignación no verificable/);
  data.assignments[0] = { ...data.assignments[0], scopeType: 'reality_team', realityTeamCode: 'R' };
  assert.deepEqual(ids(data, { kind: 'person', id: 1 }), []);
});
test('unassigned, unknown, inactive and unlinked recipients never fall back to general', () => {
  const data = callSheetFixture();
  for (const target of [{ kind: 'person', id: 5 }, { kind: 'person', id: 999 }, { kind: 'mine' }] as SheetTarget[]) assert.deepEqual(ids(data, target), []);
  data.people[0].isActive = false; assert.deepEqual(ids(data, { kind: 'person', id: 1 }), []);
});
test('changing day excludes previous assignments, resources and tasks', () => {
  const data = callSheetFixture();
  assert.deepEqual(ids(data, { kind: 'person', id: 1 }, 2), []);
  assert.deepEqual(ids(data, { kind: 'general' }, 2), [15]);
});
test('missing location, incomplete resources and unknown schedule remain visible with warnings', () => {
  const data = callSheetFixture(); data.tasks[3].assignedResources = [501, 999]; data.tasks[3].startPlanned = null;
  const result = projectCallSheet(data, 1, { kind: 'mine', resourceItemId: 91 });
  assert.deepEqual(result.entries.map(e => e.task.id), [11, 12, 14]);
  assert.match(result.warnings.join(' '), /sin ubicación/); assert.match(result.warnings.join(' '), /sin horario/); assert.match(result.warnings.join(' '), /Recursos incompletos/);
});
test('zone is resolved from day snapshot; conflicting zone does not invent zone assignment', () => {
  const data = callSheetFixture(); data.tasks[0].zoneId = null;
  assert.deepEqual(ids(data, { kind: 'person', id: 1 }), [11, 12]);
  data.tasks[0].zoneId = 20;
  assert.deepEqual(ids(data, { kind: 'person', id: 1 }), [12]);
  assert.deepEqual(ids(data, { kind: 'mine', resourceItemId: 91 }), [12]);
});
test('general, zone, space and resource preview are distinct and pure', () => {
  const data = callSheetFixture(), before = JSON.stringify(data);
  assert.deepEqual(ids(data, { kind: 'general' }), [11, 12, 14, 13]);
  assert.deepEqual(ids(data, { kind: 'zone', id: 10 }), [11, 12]);
  assert.deepEqual(ids(data, { kind: 'space', id: 101 }), [11]);
  assert.deepEqual(ids(data, { kind: 'resource', id: 502 }), [13]);
  assert.deepEqual(ids(data, { kind: 'role', role: 'realization' }), []);
  assert.equal(JSON.stringify(data), before);
});
test('summary contains only selected activities, participant, location and nominal resources', () => {
  const data = callSheetFixture();
  const summary = callSheetSummary('Celia', '2026-10-19', projectCallSheet(data, 1, { kind: 'person', id: 3 }), data);
  assert.match(summary, /Celia/); assert.match(summary, /2026-10-19/); assert.match(summary, /Actividad 13/);
  assert.match(summary, /Sala Sur/); assert.match(summary, /Cámara nominal B/); assert.doesNotMatch(summary, /Actividad 11|Actividad 12|Cámara nominal A/);
});
