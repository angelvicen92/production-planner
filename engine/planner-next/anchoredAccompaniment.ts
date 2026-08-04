import type { AnchoredAccompaniment, PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { canPlaceTask } from "./placement";

export interface AnchoredOperation { contract: AnchoredAccompaniment; tasks: ScheduledTask[]; anchor: ScheduledTask; start: number; end: number }

export function anchoredOperationAvoidsItinerantUnitMeals(problem:PlannerNextProblem,contract:AnchoredAccompaniment,start:number,end:number):boolean{
  return !contract.itinerantUnitId||(problem.itinerantUnitMeals??[]).every(meal=>meal.itinerantUnitId!==contract.itinerantUnitId||end<=meal.interval.start||start>=meal.interval.end);
}

export function anchoredAccompanimentIndex(problem: PlannerNextProblem): Map<string, AnchoredAccompaniment> {
  return new Map([...(problem.anchoredAccompaniments ?? [])].sort((a,b)=>a.id.localeCompare(b.id)).map(c=>[c.anchorTaskId,c]));
}
export function anchoredTaskIds(problem: PlannerNextProblem): Set<string> {
  return new Set((problem.anchoredAccompaniments ?? []).flatMap(c=>[...c.beforeTaskIds,...c.afterTaskIds]));
}
export function anchoredSequence(contract: AnchoredAccompaniment): string[] { return [...contract.beforeTaskIds,contract.anchorTaskId,...contract.afterTaskIds]; }
export function firstParticipantObligation(main: ScheduledTask, structural: ScheduledTask[], index: Map<string, AnchoredAccompaniment>): number {
  const contract=index.get(main.id); const first=contract?.beforeTaskIds[0];
  return first ? structural.find(t=>t.id===first)?.start ?? main.start : main.start;
}

/** Builds and validates the complete operation. Internal phases are deliberately
 * omitted from each other's canonical placement check: INCLUDED applies only to
 * this contract, while every external occupation retains the canonical margins. */
export function materializeAnchoredOperation(problem: PlannerNextProblem, anchor: Task, anchorStart: number, external: ScheduledTask[], meals: ScheduledSpaceMeal[]=[]): AnchoredOperation | null {
  const contract=anchoredAccompanimentIndex(problem).get(anchor.id);
  const scheduledAnchor={...anchor,start:anchorStart,end:anchorStart+anchor.duration};
  if(!contract) return canPlaceTask(problem,anchor,anchorStart,external,meals)?{contract:null as never,tasks:[scheduledAnchor],anchor:scheduledAnchor,start:anchorStart,end:scheduledAnchor.end}:null;
  const byId=new Map(problem.tasks.map(t=>[t.id,t]));
  const before=contract.beforeTaskIds.map(id=>byId.get(id)); const after=contract.afterTaskIds.map(id=>byId.get(id));
  if(before.some(x=>!x)||after.some(x=>!x))return null;
  let cursor=anchorStart; const scheduledBefore:ScheduledTask[]=[];
  for(let i=before.length-1;i>=0;i--){const task=before[i]!;cursor-=task.duration;scheduledBefore.unshift({...task,start:cursor,end:cursor+task.duration});}
  cursor=scheduledAnchor.end;const scheduledAfter:ScheduledTask[]=[];
  for(const task of after as Task[]){scheduledAfter.push({...task,start:cursor,end:cursor+task.duration});cursor+=task.duration;}
  const tasks=[...scheduledBefore,scheduledAnchor,...scheduledAfter];
  if(!anchoredOperationAvoidsItinerantUnitMeals(problem,contract,tasks[0]!.start,tasks.at(-1)!.end))return null;
  if(tasks.some(t=>!canPlaceTask(problem,t,t.start,external,meals)))return null;
  if(tasks.slice(1).some((t,i)=>tasks[i]!.end!==t.start))return null;
  if(tasks.some(t=>t.participantId!==scheduledAnchor.participantId))return null;
  return {contract,tasks,anchor:scheduledAnchor,start:tasks[0]!.start,end:tasks.at(-1)!.end};
}

export function isInternalAnchoredPair(problem:PlannerNextProblem,a:ScheduledTask,b:ScheduledTask):boolean{
  return (problem.anchoredAccompaniments??[]).some(c=>{const ids=anchoredSequence(c);const ai=ids.indexOf(a.id);return ai>=0&&ids[ai+1]===b.id&&a.end===b.start;});
}

export function anchoredAccompanimentPreflight(problem: PlannerNextProblem): string[] {
  const raw = problem.anchoredAccompaniments;
  if (raw === undefined) return Object.prototype.hasOwnProperty.call(problem,"anchoredClosures") ? ["INVALID_ANCHORED_ACCOMPANIMENT_CONTRACT"] : [];
  if (!Array.isArray(raw)) return ["INVALID_ANCHORED_ACCOMPANIMENT_CONTRACT"];
  const reasons = new Set<string>(); const tasks=new Map(problem.tasks.map(t=>[t.id,t]));const resources=new Set(problem.resources.map(r=>r.id));const spaces=new Set(problem.spaces.map(s=>s.id));
  const ids=new Set<string>(),used=new Set<string>();
  for(const value of raw){const c=value as Partial<AnchoredAccompaniment>;const id=typeof c.id==="string"?c.id:"";let invalid=!id||ids.has(id)||!Array.isArray(c.beforeTaskIds)||!Array.isArray(c.afterTaskIds)||c.adjacency!=="REQUIRED"||c.internalTransition!=="INCLUDED"||c.resourceContinuity!=="REQUIRED";ids.add(id);
    const anchor=tasks.get(c.anchorTaskId??"");const segments=[...(Array.isArray(c.beforeTaskIds)?c.beforeTaskIds:[]),...(Array.isArray(c.afterTaskIds)?c.afterTaskIds:[])];if(!segments.length)invalid=true;
    if(!anchor)reasons.add(`ANCHORED_ACCOMPANIMENT_UNKNOWN_ANCHOR:${id}:${c.anchorTaskId??""}`);else if(anchor.kind!=="main")reasons.add(`ANCHORED_ACCOMPANIMENT_UNSUPPORTED_ANCHOR_KIND:${id}:${anchor.kind}`);
    const local=new Set<string>();for(const taskId of [c.anchorTaskId??"",...segments]){if(local.has(taskId))reasons.add(taskId===c.anchorTaskId?`ANCHORED_ACCOMPANIMENT_NESTING_NOT_SUPPORTED:${id}`:`ANCHORED_ACCOMPANIMENT_DUPLICATE_TASK:${id}:${taskId}`);local.add(taskId);if(used.has(taskId))reasons.add(`ANCHORED_ACCOMPANIMENT_TASK_REUSED:${taskId}`);used.add(taskId);}
    for(const taskId of segments){const task=tasks.get(taskId);if(!task)reasons.add(`ANCHORED_ACCOMPANIMENT_UNKNOWN_SEGMENT:${id}:${taskId}`);else{if(task.kind!=="auxiliary")reasons.add(`ANCHORED_ACCOMPANIMENT_INVALID_SEGMENT_KIND:${id}:${taskId}`);if(anchor&&task.participantId!==anchor.participantId)reasons.add(`ANCHORED_ACCOMPANIMENT_PARTICIPANT_MISMATCH:${id}:${taskId}`);invalid||=!validTaskReferences(task,resources,spaces);}}
    const taskUnits=[c.anchorTaskId??"",...segments].map(taskId=>tasks.get(taskId)?.itinerantUnitId).filter((x):x is string=>x!==undefined);
    if(new Set(taskUnits).size>1||((c.itinerantUnitId!==undefined)&&taskUnits.some(unit=>unit!==c.itinerantUnitId)))reasons.add(`ANCHORED_ACCOMPANIMENT_ITINERANT_UNIT_MISMATCH:${id}`);
    if(c.itinerantUnitId!==undefined&&(!taskUnits.length||taskUnits.some(unit=>unit!==c.itinerantUnitId)))invalid=true;
    if(anchor)invalid||=!validTaskReferences(anchor,resources,spaces);if(invalid)reasons.add(`ANCHORED_ACCOMPANIMENT_INVALID_CONTRACT:${id}`);
  }return [...reasons].sort();
}
function validTaskReferences(task:Task,resources:Set<string>,spaces:Set<string>):boolean{const ids=task.requiredResourceIds??[];return task.duration>0&&spaces.has(task.spaceId)&&new Set(ids).size===ids.length&&ids.every(id=>resources.has(id));}
