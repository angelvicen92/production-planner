import type { AssistedPlanningSnapshotV1, AssistedPlanningTaskSnapshotV1 } from "@shared/assistedPlanningSnapshotContracts";

export type AssistedVisualState = "ACCEPTED" | "DRAFT_CHANGED" | "PROPOSAL_PREVIEW" | "SCOPE_SELECTED" | "UNPLANNED";
const placementKeys = ["startPlanned", "endPlanned", "zoneId", "spaceId", "locationLabel", "durationOverride", "camerasOverride"] as const;

export function sameAssistedPlacement(a?: AssistedPlanningTaskSnapshotV1, b?: AssistedPlanningTaskSnapshotV1) {
  return Boolean(a && b && placementKeys.every(key => a[key] === b[key]));
}

/** Live rows own execution/display metadata; the immutable draft owns placement only. */
export function buildAssistedPlanningView<T extends Record<string, any>>(liveTasks: readonly T[], draft: AssistedPlanningSnapshotV1) {
  const placement = new Map(draft.tasks.map(task => [task.taskId, task]));
  return liveTasks.map(task => {
    const row = placement.get(Number(task.id));
    if (!row) return { ...task, startPlanned: null, endPlanned: null, zoneId: null, spaceId: null, locationLabel: null, durationOverride: null, camerasOverride: null };
    return { ...task, startPlanned: row.startPlanned, endPlanned: row.endPlanned, zoneId: row.zoneId,
      spaceId: row.spaceId, locationLabel: row.locationLabel, durationOverride: row.durationOverride,
      durationOverrideMin: row.durationOverride, camerasOverride: row.camerasOverride };
  });
}

export function classifyAssistedTasks(draft: AssistedPlanningSnapshotV1, base: AssistedPlanningSnapshotV1 | null,
  selectedTaskIds: readonly number[], previewTaskIds: readonly number[]) {
  const baseById = new Map((base?.tasks ?? []).map(task => [task.taskId, task]));
  const selected = new Set(selectedTaskIds); const preview = new Set(previewTaskIds);
  return Object.fromEntries(draft.tasks.map(task => [task.taskId,
    preview.has(task.taskId) ? "PROPOSAL_PREVIEW" : selected.has(task.taskId) ? "SCOPE_SELECTED"
      : !task.startPlanned || !task.endPlanned ? "UNPLANNED"
      : sameAssistedPlacement(task, baseById.get(task.taskId)) ? "ACCEPTED" : "DRAFT_CHANGED"] as const)) as Record<number, AssistedVisualState>;
}
