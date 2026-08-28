import { createHash } from "node:crypto";
import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { canPlaceTask, exactTaskStartDomain } from "./placement";
import { tasksCanAffectEachOther } from "./exactItinerantPlan";

export interface MacroPendingPrerequisiteForwardCheckResult {
  feasible: boolean;
  tasksChecked: number;
  individualDomainChecks: number;
  jointChecks: number;
  witnesses: number;
  blockingTaskId: string | null;
  deadline: number | null;
  failure: "INDIVIDUAL_ZERO_DOMAIN" | "JOINT_INFEASIBLE" | null;
  cacheHit: boolean;
}

export type MacroPendingPrerequisiteForwardCache = Map<string, Omit<MacroPendingPrerequisiteForwardCheckResult,"cacheHit">>;
// Joint proof is deliberately limited to small connected sets. Larger sets are
// left to the real search: declining to prune is safe, while an unbounded
// feasibility search here would amount to running a second planner per macro.
const MAX_EXACT_JOINT_PREREQUISITES = 6;
const byId=<T extends{id:string}>(a:T,b:T)=>a.id.localeCompare(b.id);

/** Exact, read-only existence proof for pending ancestors affected by one provisional macro placement. */
export function checkMacroPendingPrerequisites(problem:PlannerNextProblem,pending:readonly Task[],previouslyPlaced:readonly ScheduledTask[],
  candidate:readonly ScheduledTask[],meals:readonly ScheduledSpaceMeal[]=[],cache?:MacroPendingPrerequisiteForwardCache):MacroPendingPrerequisiteForwardCheckResult{
  const provisional=[...previouslyPlaced,...candidate].sort(byId),pendingById=new Map(pending.map(task=>[task.id,task]));
  const successors=new Map<string,string[]>();for(const task of problem.tasks)for(const dependency of task.dependencies)successors.set(dependency,[...(successors.get(dependency)??[]),task.id]);
  const placedById=new Map(provisional.map(task=>[task.id,task]));
  const deadlineMemo=new Map<string,number>();
  const deadline=(id:string,visiting=new Set<string>()):number=>{const hit=deadlineMemo.get(id);if(hit!==undefined)return hit;if(visiting.has(id))return problem.day.end;
    const next=new Set(visiting).add(id),values=(successors.get(id)??[]).flatMap(successorId=>{const placed=placedById.get(successorId);if(placed)return [placed.start];const successor=pendingById.get(successorId);return successor?[deadline(successorId,next)-successor.duration]:[];});
    const value=Math.min(problem.day.end,...values);deadlineMemo.set(id,value);return value;};
  const candidateIds=new Set(candidate.map(task=>task.id)),ancestors=new Set<string>();
  const visitAncestors=(id:string)=>{const task=problem.tasks.find(item=>item.id===id);for(const dependency of task?.dependencies??[])if(pendingById.has(dependency)&&!ancestors.has(dependency)){ancestors.add(dependency);visitAncestors(dependency);}};
  for(const id of candidateIds)visitAncestors(id);
  const allRequired=[...pending].filter(task=>deadline(task.id)<problem.day.end);
  const affected=new Set([...ancestors,...allRequired.filter(task=>candidate.some(item=>tasksCanAffectEachOther(task,item))).map(task=>task.id)]);
  const relevant=allRequired.filter(task=>affected.has(task.id)).sort(byId);
  if(!relevant.length)return{feasible:true,tasksChecked:0,individualDomainChecks:0,jointChecks:0,witnesses:0,blockingTaskId:null,deadline:null,failure:null,cacheHit:false};
  const key=createHash("sha256").update(JSON.stringify({tasks:relevant.map(task=>({id:task.id,deadline:deadline(task.id)})),placed:provisional.map(task=>({id:task.id,start:task.start,end:task.end,spaceId:task.spaceId,participantId:task.participantId??null,coachId:task.coachId??null,resources:[...(task.requiredResourceIds??[])].sort()})),meals:[...meals].sort(byId)})).digest("hex");
  const cached=cache?.get(key);if(cached)return{...cached,cacheHit:true};
  let individualDomainChecks=0,jointChecks=0,witnesses=0;
  const domains=new Map<string,number[]>();
  for(const task of relevant){individualDomainChecks+=1;const starts=[...exactTaskStartDomain(problem,task,provisional,[...meals]).starts()].filter(start=>start+task.duration<=deadline(task.id));domains.set(task.id,starts);
    if(!starts.length){const result={feasible:false,tasksChecked:relevant.length,individualDomainChecks,jointChecks,witnesses,blockingTaskId:task.id,deadline:deadline(task.id),failure:"INDIVIDUAL_ZERO_DOMAIN" as const};cache?.set(key,result);return{...result,cacheHit:false};}}
  const remaining=new Set(relevant.map(task=>task.id));const components:Task[][]=[];
  while(remaining.size){const seed=[...remaining].sort()[0]!,component=new Set([seed]),queue=[seed];remaining.delete(seed);while(queue.length){const id=queue.shift()!,task=pendingById.get(id)!;for(const otherId of [...remaining]){const other=pendingById.get(otherId)!;if(tasksCanAffectEachOther(task,other)){remaining.delete(otherId);component.add(otherId);queue.push(otherId);}}}components.push([...component].map(id=>pendingById.get(id)!).sort(byId));}
  for(const component of components){if(component.length<2){witnesses+=1;continue;}
    if(component.length>MAX_EXACT_JOINT_PREREQUISITES)continue;
    jointChecks+=1;const ids=new Set(component.map(task=>task.id));
    const search=(left:Task[],placed:ScheduledTask[]):boolean=>{if(!left.length)return true;const ready=left.filter(task=>task.dependencies.filter(id=>ids.has(id)).every(id=>placed.some(item=>item.id===id)));
      const choices=(ready.length?ready:left).map(task=>({task,starts:[...exactTaskStartDomain(problem,task,[...provisional,...placed],[...meals]).starts()].filter(start=>start+task.duration<=deadline(task.id)&&canPlaceTask(problem,task,start,[...provisional,...placed],[...meals]))})).sort((a,b)=>a.starts.length-b.starts.length||a.task.id.localeCompare(b.task.id));
      const choice=choices[0];if(!choice||!choice.starts.length)return false;for(const start of choice.starts)if(search(left.filter(task=>task.id!==choice.task.id),[...placed,{...choice.task,start,end:start+choice.task.duration}]))return true;return false;};
    if(!search(component,[])){const blocker=component[0]!;const result={feasible:false,tasksChecked:relevant.length,individualDomainChecks,jointChecks,witnesses,blockingTaskId:blocker.id,deadline:deadline(blocker.id),failure:"JOINT_INFEASIBLE" as const};cache?.set(key,result);return{...result,cacheHit:false};}witnesses+=1;}
  const result={feasible:true,tasksChecked:relevant.length,individualDomainChecks,jointChecks,witnesses,blockingTaskId:null,deadline:null,failure:null};cache?.set(key,result);return{...result,cacheHit:false};
}
