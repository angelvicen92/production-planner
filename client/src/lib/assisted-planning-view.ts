import type { AssistedPlanningSnapshotV1, AssistedPlanningTaskSnapshotV1 } from "@shared/assistedPlanningSnapshotContracts";

export type AssistedVisualState = "ACCEPTED" | "DRAFT_CHANGED" | "PROPOSAL_PREVIEW" | "SCOPE_SELECTED" | "UNPLANNED";
const placementKeys = ["startPlanned", "endPlanned", "zoneId", "spaceId", "locationLabel", "durationOverride", "camerasOverride"] as const;

export function sameAssistedPlacement(a?: AssistedPlanningTaskSnapshotV1, b?: AssistedPlanningTaskSnapshotV1) {
  return Boolean(a && b && placementKeys.every(key => a[key] === b[key]));
}

const canonicalJson = (value: unknown): unknown => Array.isArray(value) ? value.map(canonicalJson) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalJson(item)]))
  : value;

export function sameAssistedPlanningBlocks(left: AssistedPlanningSnapshotV1, right: AssistedPlanningSnapshotV1) {
  const canonicalBlocks = (snapshot: AssistedPlanningSnapshotV1) => (snapshot.planningBlocks ?? [])
    .map(block => canonicalJson(block))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(canonicalBlocks(left)) === JSON.stringify(canonicalBlocks(right));
}

export function assistedDraftTouchedTaskIds(draft: AssistedPlanningSnapshotV1, base: AssistedPlanningSnapshotV1 | null) {
  if (!base) return draft.tasks.map(task => task.taskId).sort((a, b) => a - b);
  const baseById = new Map(base.tasks.map(task => [task.taskId, task]));
  const touched = new Set(draft.tasks.filter(task => !sameAssistedPlacement(task, baseById.get(task.taskId))).map(task => task.taskId));
  if (!sameAssistedPlanningBlocks(draft, base)) {
    for (const block of [...(draft.planningBlocks ?? []), ...(base.planningBlocks ?? [])])
      block.memberTaskIds.forEach(id => touched.add(id));
  }
  return [...touched].sort((a, b) => a - b);
}

/** Placement dirtiness is independent from selection and preview presentation. */
export function isAssistedDraftModified(draft: AssistedPlanningSnapshotV1, base: AssistedPlanningSnapshotV1 | null) {
  if (!base || draft.tasks.length !== base.tasks.length) return true;
  const baseById = new Map(base.tasks.map(task => [task.taskId, task]));
  return draft.tasks.some(task => !sameAssistedPlacement(task, baseById.get(task.taskId))) || !sameAssistedPlanningBlocks(draft, base);
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
