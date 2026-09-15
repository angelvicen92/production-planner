import type {
  AssistedPlanningSnapshotV1,
  AssistedPlanningTaskSnapshotV1,
} from "../../../shared/assistedPlanningSnapshotContracts";

export type AssistedDraftEditKind = "MOVE" | "MULTI_SHIFT" | "CASCADE" | "REORDER" | "SWAP" | "RESET_SELECTION" | "RESET_DRAFT";
export interface AssistedDraftPatch {
  readonly kind: AssistedDraftEditKind;
  readonly changes: readonly AssistedPlanningTaskSnapshotV1[];
  readonly inverseChanges: readonly AssistedPlanningTaskSnapshotV1[];
  readonly touchedTaskIds: readonly number[];
}

const minutes = (value: string): number => {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) throw new Error("INVALID_ASSISTED_DRAFT_TIME");
  return Number(match[1]) * 60 + Number(match[2]);
};
const time = (value: number): string => {
  if (!Number.isInteger(value) || value < 0 || value >= 24 * 60) throw new Error("ASSISTED_DRAFT_OUTSIDE_DAY");
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
};
const duration = (task: AssistedPlanningTaskSnapshotV1): number => {
  if (!task.startPlanned || !task.endPlanned) throw new Error("ASSISTED_DRAFT_TASK_UNPLANNED");
  const result = minutes(task.endPlanned) - minutes(task.startPlanned);
  if (result <= 0) throw new Error("INVALID_ASSISTED_DRAFT_DURATION");
  return result;
};
const canonicalIds = (ids: readonly number[]) => [...new Set(ids)].sort((a, b) => a - b);
const taskMap = (snapshot: AssistedPlanningSnapshotV1) => new Map(snapshot.tasks.map((task) => [task.taskId, task]));

export function applyAssistedDraftChanges(snapshot: AssistedPlanningSnapshotV1, changes: readonly AssistedPlanningTaskSnapshotV1[]): AssistedPlanningSnapshotV1 {
  const byId = new Map(changes.map((task) => [task.taskId, task]));
  if (byId.size !== changes.length || [...byId.keys()].some((id) => !snapshot.tasks.some((task) => task.taskId === id)))
    throw new Error("ASSISTED_DRAFT_TASK_SET_MISMATCH");
  return { ...snapshot, tasks: snapshot.tasks.map((task) => structuredClone(byId.get(task.taskId) ?? task)) };
}

function patch(snapshot: AssistedPlanningSnapshotV1, kind: AssistedDraftEditKind, replacements: ReadonlyMap<number, AssistedPlanningTaskSnapshotV1>): AssistedDraftPatch {
  const current = taskMap(snapshot);
  const ids = canonicalIds([...replacements.keys()]);
  return Object.freeze({ kind, touchedTaskIds: Object.freeze(ids),
    changes: Object.freeze(ids.map((id) => structuredClone(replacements.get(id)!))),
    inverseChanges: Object.freeze(ids.map((id) => structuredClone(current.get(id)!))) });
}

export function shiftTasks(snapshot: AssistedPlanningSnapshotV1, taskIds: readonly number[], deltaMinutes: number, kind: "MOVE" | "MULTI_SHIFT" | "CASCADE" = "MULTI_SHIFT"): AssistedDraftPatch {
  if (!Number.isInteger(deltaMinutes)) throw new Error("INVALID_ASSISTED_DRAFT_DELTA");
  const current = taskMap(snapshot); const replacements = new Map<number, AssistedPlanningTaskSnapshotV1>();
  for (const id of canonicalIds(taskIds)) {
    const task = current.get(id); if (!task) throw new Error("ASSISTED_DRAFT_TASK_SET_MISMATCH");
    const taskDuration = duration(task); const start = minutes(task.startPlanned!) + deltaMinutes;
    replacements.set(id, { ...task, startPlanned: time(start), endPlanned: time(start + taskDuration) });
  }
  return patch(snapshot, kind, replacements);
}
export const moveTask = (snapshot: AssistedPlanningSnapshotV1, taskId: number, newStart: string) =>
  shiftTasks(snapshot, [taskId], minutes(newStart) - minutes(taskMap(snapshot).get(taskId)?.startPlanned ?? ""), "MOVE");
export const cascadeTasks = (snapshot: AssistedPlanningSnapshotV1, taskIds: readonly number[], deltaMinutes: number) =>
  shiftTasks(snapshot, taskIds, deltaMinutes, "CASCADE");

const sameLane = (left: AssistedPlanningTaskSnapshotV1, right: AssistedPlanningTaskSnapshotV1) =>
  left.zoneId === right.zoneId && left.spaceId === right.spaceId;
export function swapTasks(snapshot: AssistedPlanningSnapshotV1, leftId: number, rightId: number): AssistedDraftPatch {
  const current = taskMap(snapshot), left = current.get(leftId), right = current.get(rightId);
  if (!left || !right) throw new Error("ASSISTED_DRAFT_TASK_SET_MISMATCH");
  if (!sameLane(left, right) || duration(left) !== duration(right)) throw new Error("INCOMPATIBLE_ASSISTED_DRAFT_SWAP");
  return patch(snapshot, "SWAP", new Map([
    [leftId, { ...left, startPlanned: right.startPlanned, endPlanned: right.endPlanned }],
    [rightId, { ...right, startPlanned: left.startPlanned, endPlanned: left.endPlanned }],
  ]));
}
export function reorderTasks(snapshot: AssistedPlanningSnapshotV1, orderedTaskIds: readonly number[]): AssistedDraftPatch {
  if (new Set(orderedTaskIds).size !== orderedTaskIds.length || orderedTaskIds.length < 2) throw new Error("INVALID_ASSISTED_DRAFT_REORDER");
  const current = taskMap(snapshot), tasks = orderedTaskIds.map((id) => current.get(id));
  if (tasks.some((task) => !task)) throw new Error("ASSISTED_DRAFT_TASK_SET_MISMATCH");
  if (!tasks.every((task) => sameLane(tasks[0]!, task!))) throw new Error("INCOMPATIBLE_ASSISTED_DRAFT_REORDER");
  let cursor = Math.min(...tasks.map((task) => minutes(task!.startPlanned!)));
  const replacements = new Map<number, AssistedPlanningTaskSnapshotV1>();
  for (const task of tasks as AssistedPlanningTaskSnapshotV1[]) {
    const end = cursor + duration(task); replacements.set(task.taskId, { ...task, startPlanned: time(cursor), endPlanned: time(end) }); cursor = end;
  }
  return patch(snapshot, "REORDER", replacements);
}
export function resetTasksToBase(snapshot: AssistedPlanningSnapshotV1, base: AssistedPlanningSnapshotV1, taskIds: readonly number[]): AssistedDraftPatch {
  const baseTasks = taskMap(base), replacements = new Map<number, AssistedPlanningTaskSnapshotV1>();
  for (const id of canonicalIds(taskIds)) { const task = baseTasks.get(id); if (!task) throw new Error("ASSISTED_DRAFT_TASK_SET_MISMATCH"); replacements.set(id, task); }
  return patch(snapshot, taskIds.length === snapshot.tasks.length ? "RESET_DRAFT" : "RESET_SELECTION", replacements);
}

export interface AssistedDraftHistory { readonly undo: readonly AssistedDraftPatch[]; readonly redo: readonly AssistedDraftPatch[]; }
export const emptyAssistedDraftHistory = (): AssistedDraftHistory => ({ undo: [], redo: [] });
export const recordAssistedDraftEdit = (history: AssistedDraftHistory, operation: AssistedDraftPatch): AssistedDraftHistory =>
  ({ undo: [...history.undo, operation], redo: [] });
export function undoAssistedDraft(snapshot: AssistedPlanningSnapshotV1, history: AssistedDraftHistory) {
  const operation = history.undo.at(-1); if (!operation) throw new Error("NO_ASSISTED_DRAFT_UNDO");
  return { snapshot: applyAssistedDraftChanges(snapshot, operation.inverseChanges), history: { undo: history.undo.slice(0, -1), redo: [...history.redo, operation] } };
}
export function redoAssistedDraft(snapshot: AssistedPlanningSnapshotV1, history: AssistedDraftHistory) {
  const operation = history.redo.at(-1); if (!operation) throw new Error("NO_ASSISTED_DRAFT_REDO");
  return { snapshot: applyAssistedDraftChanges(snapshot, operation.changes), history: { undo: [...history.undo, operation], redo: history.redo.slice(0, -1) } };
}
