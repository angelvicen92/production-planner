import type { AssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";
import type { StageViolation } from "../shared/assistedStageValidation";

type StageLike={id:number;parentStageId:number|null;archivedAt?:string|Date|null;snapshotJson:unknown;validationSummaryJson?:Record<string,unknown>};

export function resolveActiveStageLineage(stages:readonly StageLike[],stageId:number):StageLike[]{
  const byId=new Map(stages.map(stage=>[stage.id,stage])),lineage:StageLike[]=[];let cursor=byId.get(stageId);const seen=new Set<number>();
  while(cursor){if(seen.has(cursor.id))throw new Error("CORRUPT_STAGE_LINEAGE");seen.add(cursor.id);lineage.push(cursor);cursor=cursor.parentStageId==null?undefined:byId.get(cursor.parentStageId);}
  if(lineage[0]?.id!==stageId)throw new Error("STALE_BASE_STAGE");return lineage;
}

const taskById=(snapshot:unknown)=>new Map(((snapshot as AssistedPlanningSnapshotV1)?.tasks??[]).map(task=>[task.taskId,task]));
export function affectedTasksUnchanged(originSnapshot:unknown,currentSnapshot:unknown,taskIds:readonly number[]):boolean{
  const origin=taskById(originSnapshot),current=taskById(currentSnapshot);
  return taskIds.every(id=>JSON.stringify(origin.get(id))===JSON.stringify(current.get(id)));
}

export function acceptedRequiredViolations(lineage:readonly StageLike[],currentSnapshot:unknown):StageViolation[]{
  return lineage.flatMap(stage=>{const report=(stage.validationSummaryJson as any)?.report;const violations=Array.isArray(report?.violations)?report.violations:[];
    return violations.filter((item:StageViolation)=>item.severity==="REQUIRED"&&affectedTasksUnchanged(stage.snapshotJson,currentSnapshot,item.affectedTaskIds));});
}
