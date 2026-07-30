import type { AnchoredClosure, PlannerNextProblem, ScheduledTask, Task } from "./contracts";

export interface CanonicalAnchoredClosure extends AnchoredClosure {
  anchor: Task; before: Task[]; after: Task[];
  beforeDuration: number; afterDuration: number; operationalDuration: number;
}
const resources=(task:Task)=>[...(task.requiredResourceIds??[])].sort();
export function anchoredClosurePreflight(problem:PlannerNextProblem):string[]{
  const reasons=new Set<string>(), tasks=new Map((Array.isArray(problem.tasks)?problem.tasks:[]).map(t=>[t.id,t]));
  const closures=Array.isArray(problem.anchoredClosures)?problem.anchoredClosures:[];
  const closureIds=new Set<string>(), usedSegments=new Set<string>(), usedAnchors=new Set<string>();
  for(const raw of closures){
    const c=raw as Partial<AnchoredClosure>; const id=typeof c.id==="string"?c.id:"";
    if(!id||closureIds.has(id)||!Array.isArray(c.beforeTaskIds)||!Array.isArray(c.afterTaskIds)||c.beforeTaskIds.length+c.afterTaskIds.length===0||c.adjacency!=="REQUIRED"||c.spaceSource!=="ANCHOR_SPACE"||c.participantSource!=="ANCHOR_PARTICIPANT") reasons.add(`ANCHORED_CLOSURE_INVALID_CONTRACT:${id}`);
    closureIds.add(id); const anchor=tasks.get(c.anchorTaskId??"");
    if(!anchor){reasons.add(`ANCHORED_CLOSURE_UNKNOWN_ANCHOR:${id}:${c.anchorTaskId??""}`);continue}
    if(anchor.kind!=="main") reasons.add(`ANCHORED_CLOSURE_UNSUPPORTED_ANCHOR_KIND:${id}:${anchor.kind}`);
    if(usedAnchors.has(anchor.id)) reasons.add(`ANCHORED_CLOSURE_TASK_REUSED:${anchor.id}`); usedAnchors.add(anchor.id);
    const ids=[...(c.beforeTaskIds??[]),...(c.afterTaskIds??[])], local=new Set<string>();
    for(const taskId of ids){
      if(local.has(taskId)) reasons.add(`ANCHORED_CLOSURE_DUPLICATE_TASK:${id}:${taskId}`); local.add(taskId);
      if(usedSegments.has(taskId)) reasons.add(`ANCHORED_CLOSURE_TASK_REUSED:${taskId}`); usedSegments.add(taskId);
      if(taskId===anchor.id) reasons.add(`ANCHORED_CLOSURE_NESTING_NOT_SUPPORTED:${id}`);
      const task=tasks.get(taskId); if(!task){reasons.add(`ANCHORED_CLOSURE_UNKNOWN_SEGMENT:${id}:${taskId}`);continue}
      if(task.kind!=="auxiliary") reasons.add(`ANCHORED_CLOSURE_INVALID_CONTRACT:${id}`);
      if(task.participantId!==anchor.participantId) reasons.add(`ANCHORED_CLOSURE_PARTICIPANT_MISMATCH:${id}:${taskId}`);
      if(task.spaceId!==anchor.spaceId) reasons.add(`ANCHORED_CLOSURE_SPACE_MISMATCH:${id}:${taskId}`);
      const segmentResources=resources(task);if(segmentResources.some(resourceId=>!resources(anchor).includes(resourceId))) reasons.add(`ANCHORED_CLOSURE_INVALID_RESOURCE_SET:${id}:${taskId}`);
    }
  }
  for(const c of closures) if(usedSegments.has(c.anchorTaskId)) reasons.add(`ANCHORED_CLOSURE_NESTING_NOT_SUPPORTED:${c.id}`);
  return [...reasons].sort();
}
export function canonicalAnchoredClosures(problem:PlannerNextProblem):CanonicalAnchoredClosure[]{
  const byId=new Map(problem.tasks.map(t=>[t.id,t]));
  return [...(problem.anchoredClosures??[])].sort((a,b)=>a.id.localeCompare(b.id)).map(c=>{const anchor=byId.get(c.anchorTaskId)!;const before=c.beforeTaskIds.map(id=>byId.get(id)!);const after=c.afterTaskIds.map(id=>byId.get(id)!);const beforeDuration=before.reduce((s,t)=>s+t.duration,0),afterDuration=after.reduce((s,t)=>s+t.duration,0);return {...c,anchor,before,after,beforeDuration,afterDuration,operationalDuration:beforeDuration+anchor.duration+afterDuration}});
}
export const closureByAnchor=(problem:PlannerNextProblem)=>new Map(canonicalAnchoredClosures(problem).map(c=>[c.anchorTaskId,c]));
export function materializeAnchoredWorkItem(c:CanonicalAnchoredClosure,start:number):ScheduledTask[]{let cursor=start;return [...c.before,c.anchor,...c.after].map(task=>{const x={...task,start:cursor,end:cursor+task.duration};cursor=x.end;return x})}
export const feederDeadlineBase=(problem:PlannerNextProblem,main:ScheduledTask)=>{const c=closureByAnchor(problem).get(main.id);return c?main.start-c.beforeDuration:main.start};
export function anchoredClosureMetrics(problem:PlannerNextProblem,scheduled:ScheduledTask[]){const closures=canonicalAnchoredClosures(problem),byId=new Map<string,ScheduledTask[]>();for(const t of scheduled)byId.set(t.id,[...(byId.get(t.id)??[]),t]);const entries=closures.map(c=>{const members=[...c.before,c.anchor,...c.after].flatMap(t=>byId.get(t.id)??[]).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));const ok=members.length===c.before.length+c.after.length+1&&members.slice(1).every((t,i)=>members[i]!.end===t.start);return [c,members,ok] as const});return {anchoredClosureCount:closures.length,anchoredClosurePlannedCount:entries.filter(([,m,o])=>m.length&&o).length,anchoredSegmentCount:closures.reduce((s,c)=>s+c.before.length+c.after.length,0),anchoredSegmentPlannedCount:closures.flatMap(c=>[...c.before,...c.after]).filter(t=>(byId.get(t.id)?.length??0)===1).length,anchoredClosureCandidateCount:closures.length,anchoredClosureStartById:Object.fromEntries(entries.map(([c,m])=>[c.id,m[0]?.start??null])),anchoredClosureEndById:Object.fromEntries(entries.map(([c,m])=>[c.id,m.at(-1)?.end??null])),anchoredClosureAnchorTaskIdById:Object.fromEntries(closures.map(c=>[c.id,c.anchorTaskId])),anchoredClosureBeforeTaskIdsById:Object.fromEntries(closures.map(c=>[c.id,c.beforeTaskIds])),anchoredClosureAfterTaskIdsById:Object.fromEntries(closures.map(c=>[c.id,c.afterTaskIds])),anchoredClosureResourceIdsById:Object.fromEntries(closures.map(c=>[c.id,resources(c.anchor).filter(id=>[...c.before,...c.after].every(t=>resources(t).includes(id)))])),anchoredClosureAdjacencySatisfiedById:Object.fromEntries(entries.map(([c,,o])=>[c.id,o]))}}
