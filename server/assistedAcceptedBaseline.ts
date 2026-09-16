import type { AssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";
type StageLike={id:number;parentStageId:number|null;archivedAt?:string|Date|null;snapshotJson:unknown;validationSummaryJson?:Record<string,unknown>};

export function resolveActiveStageLineage(stages:readonly StageLike[],stageId:number):StageLike[]{
  const byId=new Map(stages.map(stage=>[stage.id,stage])),lineage:StageLike[]=[];let cursor=byId.get(stageId);const seen=new Set<number>();
  while(cursor){if(seen.has(cursor.id))throw new Error("CORRUPT_STAGE_LINEAGE");seen.add(cursor.id);lineage.push(cursor);if(cursor.parentStageId==null)break;cursor=byId.get(cursor.parentStageId);if(!cursor)throw new Error("CORRUPT_STAGE_LINEAGE");}
  if(lineage[0]?.id!==stageId)throw new Error("STALE_BASE_STAGE");return lineage;
}

const taskById=(snapshot:unknown)=>new Map(((snapshot as AssistedPlanningSnapshotV1)?.tasks??[]).map(task=>[task.taskId,task]));
export function affectedTasksUnchanged(originSnapshot:unknown,currentSnapshot:unknown,taskIds:readonly number[]):boolean{
  const origin=taskById(originSnapshot),current=taskById(currentSnapshot);
  return taskIds.every(id=>JSON.stringify(origin.get(id))===JSON.stringify(current.get(id)));
}
