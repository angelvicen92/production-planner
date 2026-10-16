import assert from "node:assert/strict";
import test from "node:test";
import { buildAssistedHistory, stageObligations, type HistoryStage } from "./assistedHistory";
import { stageTiming } from "./assistedStageTiming";

const stamp = (seconds: number) => new Date(Date.UTC(2026, 9, 16, 10, 0, seconds)).toISOString();
const stage = (id: number, parentStageId: number | null, ordinal: number, accepted = 0): HistoryStage => ({ id, parentStageId, ordinal, acceptedAt: stamp(accepted), snapshotJson: { tasks: [{ taskId: 1, startPlanned: "10:00", endPlanned: "10:10" }, { taskId: 2 }] } });
const s0 = stage(10, null, 0), s1 = stage(20, 10, 1, 30), s2 = stage(30, 20, 2, 100);
const times = [stageTiming({ ...s1, acceptedAt: s1.acceptedAt! }, { createdAt: stamp(1), startedAt: stamp(2), finishedAt: stamp(6) }), stageTiming({ ...s2, acceptedAt: s2.acceptedAt! }, { createdAt: stamp(60), startedAt: stamp(62), finishedAt: stamp(72) })];

test("parent IDs define S0 → S1 → S2 independent of history order, sibling ordinal and dates; input stays immutable", () => {
  const sibling = { ...stage(40, 10, 2, 300), archivedAt: stamp(400) };
  const input = [s2, sibling, s0, s1]; const before = JSON.stringify({ input, times });
  const model = buildAssistedHistory(input, s2, [...times, { ...times[1], stageId: 40 }]);
  assert.deepEqual(model.rows.map(row => row.stage.id), [10, 20, 30]);
  assert.deepEqual(model.otherStages, [sibling]); assert.equal(model.lineageError, null);
  assert.deepEqual(model.generationTotal, { durationMs: 14_000, knownStages: 2, totalStages: 2 });
  assert.deepEqual(model.processTotal, { durationMs: 69_000, knownStages: 2, totalStages: 2 });
  assert.equal(model.elapsed?.durationMs, 99_000); // includes 30s between stages
  assert.deepEqual(model.rows[1].processTotal, { durationMs: 29_000, knownStages: 1, totalStages: 1 });
  assert.equal(model.rows[0].processTotal.durationMs, null);
  assert.equal(JSON.stringify({ input, times }), before);
  assert.deepEqual(stageObligations(s2), { scheduled: 1, total: 2, percentage: 50 });
});

test("restart, new acceptance, restore and redo recalculate from active authority; archived rows persist", () => {
  const old = [s1, s2].map(s => ({ ...s, archivedAt: stamp(120) }));
  const history = [s0, ...old];
  const reset = buildAssistedHistory(history, s0, times);
  assert.deepEqual(reset.rows.map(row => row.stage.id), [10]); assert.equal(reset.elapsed, null); assert.equal(reset.processTotal.durationMs, null);
  const child = stage(50, 10, 3, 200), timing = stageTiming({ ...child, acceptedAt: child.acceptedAt! }, { createdAt: stamp(150), startedAt: stamp(152), finishedAt: stamp(160) });
  const branch = buildAssistedHistory([...history, child], child, [...times, timing]);
  assert.deepEqual(branch.rows.map(row => row.stage.id), [10, 50]); assert.equal(branch.processTotal.durationMs, 50_000);
  assert.equal(branch.generationTotal.durationMs, 8_000); assert.equal(branch.otherStages.length, 2);
  assert.deepEqual(buildAssistedHistory([s0, s1, s2], s1, times).rows.map(row => row.stage.id), [10, 20]);
  assert.equal(buildAssistedHistory([s0, s1, s2], s2, times).processTotal.durationMs, 69_000);
  // Active row may be supplied separately by state(), as on the server.
  assert.deepEqual(buildAssistedHistory([s0, s1], s2, times).rows.map(row => row.stage.id), [10, 20, 30]);
});

test("missing intervals retain explicit partial coverage; no run is not zero; genuine zero remains zero", () => {
  const partial = buildAssistedHistory([s0, s1, s2], s2, [times[1]]);
  assert.deepEqual(partial.generationTotal, { durationMs: 10_000, knownStages: 1, totalStages: 2 });
  assert.deepEqual(partial.processTotal, { durationMs: 40_000, knownStages: 1, totalStages: 2 }); assert.equal(partial.elapsed, null);
  const independent = buildAssistedHistory([s0, s1, s2], s2, [{ ...times[0], generation: null }, times[1]]);
  assert.equal(independent.processTotal.knownStages, 2); assert.equal(independent.generationTotal.knownStages, 1); assert.equal(independent.elapsed?.durationMs, 99_000);
  const unknown = buildAssistedHistory([s0, s1], s1);
  assert.equal(unknown.processTotal.durationMs, null); assert.equal(unknown.elapsed, null);
  const zero = buildAssistedHistory([s0, s1], s1, [{ ...times[0], generation: { start: stamp(2), end: stamp(2), durationMs: 0 } }]);
  assert.equal(zero.generationTotal.durationMs, 0); assert.equal(zero.generationTotal.knownStages, 1);
});

test("cycles, missing ancestors, root other than S0, duplicate IDs and archived ancestry fail closed", () => {
  for (const [history, active] of [
    [[s0, { ...s1, parentStageId: 999 }], s1],
    [[{ ...s0, parentStageId: 20 }, s1], s1],
    [[s1], s1], [[s0, s1, { ...s1 }], s1],
    [[{ ...s0, archivedAt: stamp(1) }, s1], s1],
    [[s0, { ...s1, ordinal: 0 }], s1],
    [[s0], null],
  ] as const) {
    const model = buildAssistedHistory(history, active, times);
    assert.ok(model.lineageError); assert.equal(model.rows.length, 0); assert.equal(model.processTotal.durationMs, null); assert.equal(model.elapsed, null);
  }
});

test("invalid timestamps, inconsistent interval lengths, duplicate timings and cross-stage chronology never masquerade as totals", () => {
  for (const bad of [
    { ...times[1], generation: { ...times[1].generation!, start: "invalid" } },
    { ...times[1], generation: { ...times[1].generation!, durationMs: -1 } },
    { ...times[1], requestToAcceptance: { start: stamp(20), end: stamp(100), durationMs: 80_000 } },
    { ...times[1], requestToAcceptance: { start: stamp(60), end: stamp(90), durationMs: 30_000 } },
  ]) {
    const model = buildAssistedHistory([s0, s1, s2], s2, [times[0], bad]);
    assert.deepEqual(model.timingIssues, [30]); assert.equal(model.processTotal.knownStages, 1); assert.equal(model.elapsed, null);
  }
  assert.deepEqual(buildAssistedHistory([s0, s1], s1, [times[0], times[0]]).timingIssues, [20]);
  assert.equal(stageObligations({ ...s0, snapshotJson: null }), null);
  assert.equal(stageObligations({ ...s0, snapshotJson: { tasks: [] } })?.percentage, null);
});
