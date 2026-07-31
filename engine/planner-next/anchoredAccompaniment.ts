import type { AnchoredAccompaniment, PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { canPlaceTask } from "./placement";
import { contains, overlaps } from "./time";
import { taskFitsAvailability } from "./taskAvailability";
import { occupationAvoidsProtectedMeal } from "./spaceMeals";

export const anchoredFailureReasonCodes = [
  "UNKNOWN_CONTRACT_TASK", "TASK_WINDOW", "PARTICIPANT_AVAILABILITY", "SPACE_AVAILABILITY",
  "RESOURCE_AVAILABILITY", "PROTECTED_MEAL", "SCHEDULED_SPACE_MEAL", "PARTICIPANT_CONFLICT",
  "SPACE_CONFLICT", "RESOURCE_CONFLICT", "EXTERNAL_PARTICIPANT_TRANSITION",
  "EXTERNAL_RESOURCE_TRANSITION", "INVALID_INTERNAL_ADJACENCY", "INVALID_PARTICIPANT_CONTINUITY",
  "INVALID_RESOURCE_CONTINUITY", "NO_CONTINUOUS_RESOURCE", "CONTINUOUS_RESOURCE_MISSING_FROM_PHASE",
  "UNKNOWN_RESOURCE", "DEPENDENCY_CONFLICT",
] as const;
export type AnchoredFailureReasonCode = typeof anchoredFailureReasonCodes[number];
export interface AnchoredOperation { contract?: AnchoredAccompaniment; tasks: ScheduledTask[]; anchor: ScheduledTask; start: number; end: number; continuousResourceIds: string[] }
export type AnchoredMaterializationResult = { success: true; operation: AnchoredOperation } | { success: false; reasonCodes: AnchoredFailureReasonCode[] };

export interface AnchoredExecutionContext {
  contractByAnchorTaskId: ReadonlyMap<string, AnchoredAccompaniment>;
  taskById: ReadonlyMap<string, Task>;
}
export function buildAnchoredExecutionContext(problem: PlannerNextProblem): AnchoredExecutionContext {
  return { contractByAnchorTaskId: anchoredAccompanimentIndex(problem), taskById: new Map(problem.tasks.map(task => [task.id, task])) };
}
export function anchoredAccompanimentIndex(problem: PlannerNextProblem): Map<string, AnchoredAccompaniment> {
  return new Map([...(problem.anchoredAccompaniments ?? [])].sort((a,b)=>a.id.localeCompare(b.id)).map(c=>[c.anchorTaskId,c]));
}
export function anchoredTaskIds(problem: PlannerNextProblem): Set<string> {
  return new Set((problem.anchoredAccompaniments ?? []).flatMap(c=>[...c.beforeTaskIds,...c.afterTaskIds]));
}
export function anchoredSequence(contract: AnchoredAccompaniment): string[] { return [...contract.beforeTaskIds,contract.anchorTaskId,...contract.afterTaskIds]; }
export function continuousResourceIds(tasks: readonly Task[]): string[] {
  if (!tasks.length) return [];
  return [...new Set(tasks[0]!.requiredResourceIds ?? [])].filter(id => tasks.every(task => task.requiredResourceIds?.includes(id))).sort();
}
export function firstParticipantObligation(main: ScheduledTask, structural: ScheduledTask[], index: ReadonlyMap<string, AnchoredAccompaniment>): number {
  const first=index.get(main.id)?.beforeTaskIds[0];
  return first ? structural.find(t=>t.id===first)?.start ?? main.start : main.start;
}

function classifyPlacement(problem: PlannerNextProblem, task: Task, start: number, external: ScheduledTask[], meals: ScheduledSpaceMeal[]): AnchoredFailureReasonCode[] {
  const end=start+task.duration, reasons=new Set<AnchoredFailureReasonCode>();
  const participant=problem.participants.find(p=>p.id===task.participantId), space=problem.spaces.find(s=>s.id===task.spaceId);
  const resources=(task.requiredResourceIds??[]).map(id=>problem.resources.find(r=>r.id===id));
  if(!taskFitsAvailability(task,start,end)||start<problem.day.start||end>problem.day.end)reasons.add("TASK_WINDOW");
  if(participant&&!contains(participant.availability,start,end))reasons.add("PARTICIPANT_AVAILABILITY");
  if(space&&!contains(space.availability,start,end))reasons.add("SPACE_AVAILABILITY");
  if(resources.some(r=>!r))reasons.add("UNKNOWN_RESOURCE");
  if(resources.some(r=>r&&!contains(r.availability,start,end)))reasons.add("RESOURCE_AVAILABILITY");
  if(!occupationAvoidsProtectedMeal(problem,task.spaceId,start,end))reasons.add("PROTECTED_MEAL");
  if(meals.some(m=>m.spaceId===task.spaceId&&overlaps(m,{start,end})))reasons.add("SCHEDULED_SPACE_MEAL");
  for(const other of external){
    const sharedParticipant=other.participantId!==undefined&&other.participantId===task.participantId;
    const sharedResources=(task.requiredResourceIds??[]).filter(id=>other.requiredResourceIds?.includes(id));
    if(overlaps(other,{start,end})){
      if(sharedParticipant)reasons.add("PARTICIPANT_CONFLICT");
      if(other.spaceId===task.spaceId)reasons.add("SPACE_CONFLICT");
      if(sharedResources.length)reasons.add("RESOURCE_CONFLICT");
    }else if(other.spaceId!==task.spaceId){
      if(sharedParticipant&&Math.min(Math.abs(start-other.end),Math.abs(other.start-end))<problem.participantTransitionMinutes)reasons.add("EXTERNAL_PARTICIPANT_TRANSITION");
      if(sharedResources.length&&Math.min(Math.abs(start-other.end),Math.abs(other.start-end))<problem.resourceTransitionMinutes)reasons.add("EXTERNAL_RESOURCE_TRANSITION");
    }
  }
  if(task.dependencies.some(id=>{const dep=external.find(t=>t.id===id);return dep!==undefined&&dep.end>start;}))reasons.add("DEPENDENCY_CONFLICT");
  return [...reasons].sort();
}

/** Atomically builds the whole before -> anchor -> after operation. */
export function materializeAnchoredOperation(problem: PlannerNextProblem, anchor: Task, anchorStart: number, external: ScheduledTask[], meals: ScheduledSpaceMeal[]=[], context: AnchoredExecutionContext=buildAnchoredExecutionContext(problem)): AnchoredMaterializationResult {
  const contract=context.contractByAnchorTaskId.get(anchor.id), scheduledAnchor={...anchor,start:anchorStart,end:anchorStart+anchor.duration};
  if(!contract){
    const reasons=classifyPlacement(problem,anchor,anchorStart,external,meals);
    return reasons.length||!canPlaceTask(problem,anchor,anchorStart,external,meals)?{success:false,reasonCodes:reasons.length?reasons:["DEPENDENCY_CONFLICT"]}:{success:true,operation:{tasks:[scheduledAnchor],anchor:scheduledAnchor,start:anchorStart,end:scheduledAnchor.end,continuousResourceIds:[]}};
  }
  const source=anchoredSequence(contract).map(id=>context.taskById.get(id));
  if(source.some(task=>!task))return {success:false,reasonCodes:["UNKNOWN_CONTRACT_TASK"]};
  const originals=source as Task[], shared=continuousResourceIds(originals);
  if(!shared.length)return {success:false,reasonCodes:["NO_CONTINUOUS_RESOURCE"]};
  if(originals.some(task=>!shared.every(id=>task.requiredResourceIds?.includes(id))))return {success:false,reasonCodes:["CONTINUOUS_RESOURCE_MISSING_FROM_PHASE"]};
  let cursor=anchorStart-contract.beforeTaskIds.reduce((n,id)=>n+context.taskById.get(id)!.duration,0);
  const tasks=originals.map(task=>{const scheduled={...task,start:cursor,end:cursor+task.duration};cursor=scheduled.end;return scheduled;});
  const reasons=new Set<AnchoredFailureReasonCode>();
  if(tasks.slice(1).some((task,index)=>tasks[index]!.end!==task.start))reasons.add("INVALID_INTERNAL_ADJACENCY");
  if(tasks.some(task=>task.participantId!==anchor.participantId))reasons.add("INVALID_PARTICIPANT_CONTINUITY");
  for(const task of tasks)for(const reason of classifyPlacement(problem,task,task.start,external,meals))reasons.add(reason);
  if(reasons.size)return {success:false,reasonCodes:[...reasons].sort()};
  const scheduledAnchorTask=tasks[contract.beforeTaskIds.length]!;
  return {success:true,operation:{contract,tasks,anchor:scheduledAnchorTask,start:tasks[0]!.start,end:tasks.at(-1)!.end,continuousResourceIds:shared}};
}

export function isInternalAnchoredPair(problem:PlannerNextProblem,a:ScheduledTask,b:ScheduledTask):boolean{
  return (problem.anchoredAccompaniments??[]).some(c=>{const ids=anchoredSequence(c);const ai=ids.indexOf(a.id);return ai>=0&&ids[ai+1]===b.id&&a.end===b.start;});
}

export interface AnchoredContractEvaluation { contractId:string; complete:boolean; reasonCodes:AnchoredFailureReasonCode[]; continuousResourceIds:string[]; tasks:ScheduledTask[]; adjacencySatisfied:boolean; participantSatisfied:boolean; resourcesSatisfied:boolean; taskWindowsSatisfied:boolean }
export function evaluateAnchoredAccompaniments(problem:PlannerNextProblem, scheduled:readonly ScheduledTask[]):AnchoredContractEvaluation[]{
  const expected=new Map(problem.tasks.map(t=>[t.id,t])), occurrences=new Map<string,ScheduledTask[]>();
  for(const task of scheduled)occurrences.set(task.id,[...(occurrences.get(task.id)??[]),task]);
  return [...(problem.anchoredAccompaniments??[])].sort((a,b)=>a.id.localeCompare(b.id)).map(contract=>{
    const ids=anchoredSequence(contract), tasks=ids.flatMap(id=>occurrences.get(id)??[]), originals=ids.map(id=>expected.get(id)).filter((x):x is Task=>Boolean(x));
    const shared=continuousResourceIds(originals), reasons=new Set<AnchoredFailureReasonCode>();
    if(tasks.length!==ids.length||ids.some(id=>(occurrences.get(id)?.length??0)!==1))reasons.add("UNKNOWN_CONTRACT_TASK");
    const adjacency=tasks.length===ids.length&&tasks.every((t,i)=>t.id===ids[i])&&tasks.slice(1).every((t,i)=>tasks[i]!.end===t.start);
    const participant=tasks.length===ids.length&&tasks.every(t=>t.participantId===originals[0]?.participantId);
    const windows=tasks.length===ids.length&&tasks.every((t,i)=>t.end-t.start===originals[i]?.duration&&taskFitsAvailability(originals[i]!,t.start,t.end));
    const resources=shared.length>0&&tasks.length===ids.length&&tasks.every((t,i)=>shared.every(id=>t.requiredResourceIds?.includes(id))&&(t.requiredResourceIds??[]).every(id=>problem.resources.some(r=>r.id===id&&contains(r.availability,t.start,t.end))));
    if(!adjacency)reasons.add("INVALID_INTERNAL_ADJACENCY");if(!participant)reasons.add("INVALID_PARTICIPANT_CONTINUITY");if(!windows)reasons.add("TASK_WINDOW");if(!resources)reasons.add("INVALID_RESOURCE_CONTINUITY");
    return {contractId:contract.id,complete:reasons.size===0,reasonCodes:[...reasons].sort(),continuousResourceIds:shared,tasks,adjacencySatisfied:adjacency,participantSatisfied:participant,resourcesSatisfied:resources,taskWindowsSatisfied:windows};
  });
}

export function anchoredAccompanimentPreflight(problem: PlannerNextProblem): string[] {
  const raw=problem.anchoredAccompaniments;if(raw===undefined)return Object.prototype.hasOwnProperty.call(problem,"anchoredClosures")?["INVALID_ANCHORED_ACCOMPANIMENT_CONTRACT"]:[];
  if(!Array.isArray(raw))return ["INVALID_ANCHORED_ACCOMPANIMENT_CONTRACT"];
  const reasons=new Set<string>(), tasks=new Map(problem.tasks.map(t=>[t.id,t])), resources=new Set(problem.resources.map(r=>r.id)), spaces=new Set(problem.spaces.map(s=>s.id));
  const contractIds=new Set<string>(), anchors=new Set(raw.map(c=>c?.anchorTaskId)), segments=new Set(raw.flatMap(c=>[...(Array.isArray(c?.beforeTaskIds)?c.beforeTaskIds:[]),...(Array.isArray(c?.afterTaskIds)?c.afterTaskIds:[])])), used=new Set<string>();
  for(const value of raw){const c=value as Partial<AnchoredAccompaniment>, id=typeof c.id==="string"?c.id:"";let invalid=!id||contractIds.has(id)||!Array.isArray(c.beforeTaskIds)||!Array.isArray(c.afterTaskIds)||c.adjacency!=="REQUIRED"||c.internalTransition!=="INCLUDED"||c.resourceContinuity!=="REQUIRED";contractIds.add(id);
    const anchor=tasks.get(c.anchorTaskId??""), side=[...(Array.isArray(c.beforeTaskIds)?c.beforeTaskIds:[]),...(Array.isArray(c.afterTaskIds)?c.afterTaskIds:[])];if(!side.length)invalid=true;
    if(!anchor)reasons.add(`ANCHORED_ACCOMPANIMENT_UNKNOWN_ANCHOR:${id}:${c.anchorTaskId??""}`);else if(anchor.kind!=="main")reasons.add(`ANCHORED_ACCOMPANIMENT_UNSUPPORTED_ANCHOR_KIND:${id}:${anchor.kind}`);
    const local=new Set<string>();for(const taskId of [c.anchorTaskId??"",...side]){if(local.has(taskId))reasons.add(`ANCHORED_ACCOMPANIMENT_DUPLICATE_TASK:${id}:${taskId}`);local.add(taskId);if(used.has(taskId))reasons.add(`ANCHORED_ACCOMPANIMENT_TASK_REUSED:${taskId}`);used.add(taskId);}
    if(segments.has(c.anchorTaskId??"")||side.some(taskId=>anchors.has(taskId)))reasons.add(`ANCHORED_ACCOMPANIMENT_NESTING_NOT_SUPPORTED:${id}`);
    const originals=[anchor,...side.map(taskId=>tasks.get(taskId))].filter((x):x is Task=>Boolean(x));
    for(const taskId of side){const task=tasks.get(taskId);if(!task)reasons.add(`ANCHORED_ACCOMPANIMENT_UNKNOWN_SEGMENT:${id}:${taskId}`);else{if(task.kind!=="auxiliary")reasons.add(`ANCHORED_ACCOMPANIMENT_INVALID_SEGMENT_KIND:${id}:${taskId}`);if(anchor&&task.participantId!==anchor.participantId)reasons.add(`ANCHORED_ACCOMPANIMENT_PARTICIPANT_MISMATCH:${id}:${taskId}`);invalid||=!validTaskReferences(task,resources,spaces);}}
    if(anchor)invalid||=!validTaskReferences(anchor,resources,spaces);if(originals.length&&continuousResourceIds(originals).length===0)reasons.add(`ANCHORED_ACCOMPANIMENT_NO_CONTINUOUS_RESOURCE:${id}`);if(invalid)reasons.add(`ANCHORED_ACCOMPANIMENT_INVALID_CONTRACT:${id}`);
  }return [...reasons].sort();
}
function validTaskReferences(task:Task,resources:Set<string>,spaces:Set<string>):boolean{const ids=task.requiredResourceIds??[];return task.duration>0&&spaces.has(task.spaceId)&&new Set(ids).size===ids.length&&ids.every(id=>resources.has(id));}
