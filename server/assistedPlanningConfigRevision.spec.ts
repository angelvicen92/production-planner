import assert from "node:assert/strict";
import test from "node:test";
import { buildEffectivePlanConfigReplaySnapshotV1 } from "./assistedPlanningConfigRevision";

test("replay snapshot owns canonical semantic data independent from mutable catalogs", () => {
  const catalog = [{ id: 2, duration: 20 }, { id: 1, duration: 10 }];
  const replay = buildEffectivePlanConfigReplaySnapshotV1({ taskTemplateSnapshots: catalog, optimizerSnapshot: { mode: "basic" }, authorities: { plan_workday: [{ end: "18:00", start: "09:00" }] } });
  catalog[0].duration = 99;
  assert.equal((replay.taskTemplateSnapshots[0] as { duration: number }).duration, 20);
  assert.equal(replay.contractVersion, 1);
});
