import assert from "node:assert/strict";
import test from "node:test";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";

const base = [
  { id: 2, startPlanned: null, endPlanned: null, zoneId: null, spaceId: null, status: "pending", startReal: null },
  { id: 1, startPlanned: "09:00", endPlanned: "09:30", zoneId: 3, spaceId: 4, locationLabel: "A", durationOverride: 30, camerasOverride: 2, status: "done", startReal: "09:02" },
] as const;

test("complete planning snapshots are canonical, placement-sensitive and include unplaced tasks", () => {
  const first = buildAssistedPlanningSnapshotV1(base);
  const reordered = buildAssistedPlanningSnapshotV1([...base].reverse());
  assert.deepEqual(first.tasks.map((task) => task.taskId), [1, 2]);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(first), fingerprintAssistedPlanningSnapshotV1(reordered));
  const moved = buildAssistedPlanningSnapshotV1(base.map((task) => task.id === 1 ? { ...task, startPlanned: "09:01" } : task));
  assert.notEqual(fingerprintAssistedPlanningSnapshotV1(first), fingerprintAssistedPlanningSnapshotV1(moved));
  assert.equal(first.tasks[1].startPlanned, null);
});

test("execution changes are excluded and source input remains mutable/unmodified", () => {
  const rows: Array<Record<string, unknown> & { id: number; startReal: string | null; status: string }> = base.map((row) => ({ ...row }));
  const before = structuredClone(rows);
  const first = buildAssistedPlanningSnapshotV1(rows);
  rows[0].startReal = "12:00";
  rows[0].status = "in_progress";
  assert.equal(fingerprintAssistedPlanningSnapshotV1(first), fingerprintAssistedPlanningSnapshotV1(buildAssistedPlanningSnapshotV1(rows)));
  assert.deepEqual(before.map(({ startReal: _, status: __, ...row }) => row), rows.map(({ startReal: _, status: __, ...row }) => row));
  assert.equal(Object.isFrozen(first), true);
});
