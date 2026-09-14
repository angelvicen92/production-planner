import { createHash } from "node:crypto";
import {
  ASSISTED_PLANNING_SNAPSHOT_CONTRACT_VERSION,
  type AssistedPlanningSnapshotV1,
} from "../shared/assistedPlanningSnapshotContracts";

export {
  ASSISTED_PLANNING_SNAPSHOT_CONTRACT_VERSION,
  type AssistedPlanningSnapshotV1,
  type AssistedPlanningTaskSnapshotV1,
} from "../shared/assistedPlanningSnapshotContracts";

export type AssistedPlanningTaskSource = Readonly<{
  id: number;
  startPlanned?: string | null;
  endPlanned?: string | null;
  zoneId?: number | null;
  spaceId?: number | null;
  locationLabel?: string | null;
  durationOverride?: number | null;
  camerasOverride?: number | null;
}> & Readonly<Record<string, unknown>>;

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export function buildAssistedPlanningSnapshotV1(
  rows: readonly AssistedPlanningTaskSource[],
): AssistedPlanningSnapshotV1 {
  const tasks = rows.map((row) => {
    if (!Number.isInteger(row.id) || row.id <= 0) throw new Error("task id must be a positive integer");
    return {
      taskId: row.id,
      startPlanned: row.startPlanned ?? null,
      endPlanned: row.endPlanned ?? null,
      zoneId: row.zoneId ?? null,
      spaceId: row.spaceId ?? null,
      locationLabel: row.locationLabel ?? null,
      durationOverride: row.durationOverride ?? null,
      camerasOverride: row.camerasOverride ?? null,
    };
  }).sort((a, b) => a.taskId - b.taskId);
  if (tasks.some((task, index) => index > 0 && tasks[index - 1].taskId === task.taskId)) {
    throw new Error("snapshot cannot contain duplicate task ids");
  }
  return freeze({ contractVersion: ASSISTED_PLANNING_SNAPSHOT_CONTRACT_VERSION, tasks });
}

export function fingerprintAssistedPlanningSnapshotV1(snapshot: AssistedPlanningSnapshotV1): string {
  const canonical = buildAssistedPlanningSnapshotV1(snapshot.tasks.map((task) => ({ id: task.taskId, ...task })));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
