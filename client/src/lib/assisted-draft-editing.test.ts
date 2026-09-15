import assert from "node:assert/strict";
import test from "node:test";
import type { AssistedPlanningSnapshotV1 } from "../../../shared/assistedPlanningSnapshotContracts";
import { applyAssistedDraftChanges, cascadeTasks, emptyAssistedDraftHistory, moveTask, recordAssistedDraftEdit, redoAssistedDraft, reorderTasks, resetTasksToBase, shiftTasks, swapTasks, undoAssistedDraft } from "./assisted-draft-editing";

const snapshot = (): AssistedPlanningSnapshotV1 => ({ contractVersion: 1, tasks: [
  { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", zoneId: 1, spaceId: 1, locationLabel: "A", durationOverride: null, camerasOverride: null },
  { taskId: 2, startPlanned: "09:40", endPlanned: "10:10", zoneId: 1, spaceId: 1, locationLabel: "A", durationOverride: null, camerasOverride: null },
  { taskId: 3, startPlanned: "10:20", endPlanned: "11:00", zoneId: 1, spaceId: 1, locationLabel: "A", durationOverride: null, camerasOverride: null },
] });

test("move and multi-shift are immutable, preserve duration, and are order independent", () => {
  const base = snapshot(), before = structuredClone(base);
  const moved = moveTask(base, 1, "09:15");
  assert.deepEqual(moved.touchedTaskIds, [1]);
  assert.equal(moved.changes[0].endPlanned, "09:45");
  const left = shiftTasks(base, [3, 1], 10), right = shiftTasks(base, [1, 3], 10);
  assert.deepEqual(left, right); assert.deepEqual(base, before);
  assert.equal(left.changes[0].startPlanned, "09:10"); assert.equal(left.changes[1].startPlanned, "10:30");
});

test("swap rejects incompatible placements and exchanges compatible equal-duration tasks", () => {
  const operation = swapTasks(snapshot(), 1, 2);
  assert.deepEqual(operation.changes.map((task) => [task.taskId, task.startPlanned]), [[1, "09:40"], [2, "09:00"]]);
  assert.throws(() => swapTasks(snapshot(), 1, 3), /INCOMPATIBLE/);
  const otherLane = snapshot(); (otherLane.tasks[1] as any).spaceId = 9;
  assert.throws(() => swapTasks(otherLane, 1, 2), /INCOMPATIBLE/);
});

test("reorder and cascade are deterministic, preserve IDs, and reset selected tasks to base", () => {
  const base = snapshot();
  const reordered = reorderTasks(base, [3, 1, 2]);
  assert.deepEqual(reordered.changes.map((task) => [task.taskId, task.startPlanned, task.endPlanned]), [
    [1, "09:40", "10:10"], [2, "10:10", "10:40"], [3, "09:00", "09:40"],
  ]);
  assert.equal(new Set(reordered.changes.map((task) => task.taskId)).size, 3);
  const changed = applyAssistedDraftChanges(base, cascadeTasks(base, [1, 2], 15).changes);
  const reset = resetTasksToBase(changed, base, [2]);
  assert.deepEqual(reset.changes, [base.tasks[1]]);
});

test("draft undo/redo uses inverse/forward patches and a divergent edit clears redo", () => {
  const base = snapshot(), operation = moveTask(base, 1, "09:15");
  const after = applyAssistedDraftChanges(base, operation.changes);
  const history = recordAssistedDraftEdit(emptyAssistedDraftHistory(), operation);
  const undone = undoAssistedDraft(after, history); assert.deepEqual(undone.snapshot, base);
  const redone = redoAssistedDraft(undone.snapshot, undone.history); assert.deepEqual(redone.snapshot, after);
  const divergent = recordAssistedDraftEdit(undone.history, moveTask(undone.snapshot, 2, "10:00"));
  assert.deepEqual(divergent.redo, []);
});
