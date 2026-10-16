import type { AssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";
import { resolveActiveStageLineage as resolveStageLineage } from "../shared/assistedStageLineage";
type StageLike = { id: number; parentStageId: number | null; archivedAt?: string | Date | null; snapshotJson: unknown; validationSummaryJson?: Record<string, unknown> };
export function resolveActiveStageLineage(stages: readonly StageLike[], stageId: number): StageLike[] {
  return resolveStageLineage(stages, stageId);
}

const taskById=(snapshot:unknown)=>new Map(((snapshot as AssistedPlanningSnapshotV1)?.tasks??[]).map(task=>[task.taskId,task]));
export function affectedTasksUnchanged(originSnapshot:unknown,currentSnapshot:unknown,taskIds:readonly number[]):boolean{
  const origin=taskById(originSnapshot),current=taskById(currentSnapshot);
  return taskIds.every(id=>JSON.stringify(origin.get(id))===JSON.stringify(current.get(id)));
}
