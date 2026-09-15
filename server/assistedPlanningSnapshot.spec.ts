import assert from "node:assert/strict";
import test from "node:test";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";

const base = [
  { id: 2, startPlanned: null, endPlanned: null, zoneId: null, spaceId: null, status: "pending", startReal: null },
  { id: 1, startPlanned: "09:00", endPlanned: "09:30", zoneId: 3, spaceId: 4, locationLabel: "A", durationOverride: 30, camerasOverride: 2, status: "done", startReal: "09:02" },
] as const;

test("complete planning snapshots are canonical, placement-sensitive and include unplaced tasks", () => {
  const first = buildAssistedPlanningSnapshotV1(base);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(first), "69008e0fca5764a24ecd176eea4a8770d69a0391b64ed834a8f36564e85065cb");
  assert.equal(Object.prototype.hasOwnProperty.call(first,"planningBlocks"),false);
  const reordered = buildAssistedPlanningSnapshotV1([...base].reverse());
  assert.deepEqual(first.tasks.map((task) => task.taskId), [1, 2]);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(first), fingerprintAssistedPlanningSnapshotV1(reordered));
  const moved = buildAssistedPlanningSnapshotV1(base.map((task) => task.id === 1 ? { ...task, startPlanned: "09:01" } : task));
  assert.notEqual(fingerprintAssistedPlanningSnapshotV1(first), fingerprintAssistedPlanningSnapshotV1(moved));
  assert.equal(first.tasks[1].startPlanned, null);
});

test("planning block fingerprints canonicalize block order while preserving member order",()=>{
  const tasks=buildAssistedPlanningSnapshotV1(base).tasks;
  const blocks=[{blockId:"block:a",memberTaskIds:[1,2],scopeProvenance:{kind:"TASK_IDS"},spaceId:4,activityTemplateId:8,order:0}] as const;
  const first=buildAssistedPlanningSnapshotV1(tasks.map(task=>({id:task.taskId,...task})),blocks);
  const replay=buildAssistedPlanningSnapshotV1([...tasks].reverse().map(task=>({id:task.taskId,...task})),blocks);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(first),fingerprintAssistedPlanningSnapshotV1(replay));
  const reorderedMetadata=buildAssistedPlanningSnapshotV1(tasks.map(task=>({id:task.taskId,...task})),[{...blocks[0],scopeProvenance:{z:1,a:{y:2,x:3}}}]);
  const canonicalMetadata=buildAssistedPlanningSnapshotV1(tasks.map(task=>({id:task.taskId,...task})),[{...blocks[0],scopeProvenance:{a:{x:3,y:2},z:1}}]);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(reorderedMetadata),fingerprintAssistedPlanningSnapshotV1(canonicalMetadata));
  const reversed=buildAssistedPlanningSnapshotV1(tasks.map(task=>({id:task.taskId,...task})),[{...blocks[0],memberTaskIds:[2,1]}]);
  assert.notEqual(fingerprintAssistedPlanningSnapshotV1(first),fingerprintAssistedPlanningSnapshotV1(reversed));
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
