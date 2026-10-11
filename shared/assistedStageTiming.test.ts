import assert from "node:assert/strict";
import test from "node:test";
import { stageTiming, type ProposalRunTimes } from "./assistedStageTiming";

const stage = { id: 12, ordinal: 2, acceptedAt: "2026-10-11T12:03:04.500Z" };
const run: ProposalRunTimes = { createdAt: "2026-10-11T12:00:00Z", startedAt: "2026-10-11T12:00:02.250Z", finishedAt: "2026-10-11T12:00:12.750Z" };
test("generation uses run execution; request to acceptance also includes application, validation and human wait", () => {
  const result = stageTiming(stage, run);
  assert.deepEqual(result.generation, { start: run.startedAt, end: run.finishedAt, durationMs: 10_500 });
  assert.deepEqual(result.requestToAcceptance, { start: run.createdAt, end: stage.acceptedAt, durationMs: 184_500 });
});
test("Stage zero and stages without a linked run never manufacture a duration", () => {
  assert.deepEqual(stageTiming({ ...stage, ordinal: 0 }, run), { stageId: 12, generation: null, requestToAcceptance: null });
  assert.deepEqual(stageTiming(stage), { stageId: 12, generation: null, requestToAcceptance: null });
});
test("missing timestamps disable only the interval that requires them", () => {
  for (const field of ["startedAt", "finishedAt"] as const) {
    const result = stageTiming(stage, { ...run, [field]: null });
    assert.equal(result.generation, null); assert.equal(result.requestToAcceptance?.durationMs, 184_500);
  }
  assert.equal(stageTiming(stage, { ...run, createdAt: null }).requestToAcceptance, null);
  assert.equal(stageTiming({ ...stage, acceptedAt: null }, run).requestToAcceptance, null);
  assert.equal(stageTiming({ ...stage, acceptedAt: null }, run).generation?.durationMs, 10_500);
});
test("invalid dates and inconsistent chronology yield no misleading duration", () => {
  for (const bad of ["invalid", "", "2026-10-11", "2026-10-11T12:00:00", "2026-02-30T12:00:00Z", "2026-10-11T24:00:00Z"]) {
    assert.equal(stageTiming(stage, { ...run, startedAt: bad }).generation, null, bad);
  }
  for (const changed of [
    { ...run, createdAt: "2026-10-11T12:00:03Z" },
    { ...run, finishedAt: "2026-10-11T12:00:01Z" },
    { ...run, finishedAt: "2026-10-11T12:04:00Z" },
  ]) assert.deepEqual(stageTiming(stage, changed), { stageId: 12, generation: null, requestToAcceptance: null });
  assert.equal(stageTiming({ ...stage, acceptedAt: "2026-10-11T11:00:00Z" }, run).requestToAcceptance, null);
});
test("timezone offsets and real zero-length intervals are retained without rounding", () => {
  const result = stageTiming({ ...stage, acceptedAt: "2026-10-11T14:00:02.251+02:00" }, { createdAt: run.createdAt, startedAt: run.startedAt, finishedAt: run.startedAt });
  assert.equal(result.generation?.durationMs, 0); assert.equal(result.requestToAcceptance?.durationMs, 2_251);
});
