import { createHash } from "node:crypto";
import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { canPlaceTask, exactStartDomainFromIntervals, exactTaskStartDomain, type ExactStartInterval } from "./placement";
import { tasksCanAffectEachOther } from "./exactItinerantPlan";

export interface MacroPendingPrerequisiteForwardCheckResult {
  feasible: boolean;
  tasksChecked: number;
  individualDomainChecks: number;
  collectiveCapacityChecks: number;
  obligationsChecked: number;
  collectiveCapacityPrunes: number;
  authorityId: string | null;
  demandMinutes: number | null;
  freeCapacityMinutes: number | null;
  /** Stable IDs of the obligations whose demand forms a collective-capacity certificate. */
  overloadTaskIds?: string[];
  jointChecks: number;
  witnesses: number;
  blockingTaskId: string | null;
  deadline: number | null;
  failure: "INDIVIDUAL_ZERO_DOMAIN" | "COLLECTIVE_CAPACITY" | "JOINT_INFEASIBLE" | null;
  cacheHit: boolean;
}

export type MacroPendingPrerequisiteForwardCheckMode = "FULL" | "ANALYTIC_CAPACITY_ONLY";

export type MacroPendingPrerequisiteForwardCache = Map<string, Omit<MacroPendingPrerequisiteForwardCheckResult,"cacheHit">>;
export interface TargetCollectiveCapacityCertificateEvaluation {
  evaluated:boolean;overloaded:boolean;authorityId:string;demandMinutes:number|null;freeCapacityMinutes:number|null;overloadTaskIds:string[];
}
// Joint proof is deliberately limited to small connected sets. Larger sets are
// left to the real search: declining to prune is safe, while an unbounded
// feasibility search here would amount to running a second planner per macro.
const MAX_EXACT_JOINT_PREREQUISITES = 6;
const byId=<T extends{id:string}>(a:T,b:T)=>a.id.localeCompare(b.id);
const mergeIntervals=(intervals:ExactStartInterval[]):ExactStartInterval[]=>{const merged:ExactStartInterval[]=[];for(const interval of [...intervals].sort((a,b)=>a.start-b.start||a.end-b.end)){const previous=merged.at(-1);if(previous&&interval.start<=previous.end)previous.end=Math.max(previous.end,interval.end);else merged.push({...interval});}return merged;};
const intervalMinutes=(intervals:ExactStartInterval[])=>mergeIntervals(intervals).reduce((sum,{start,end})=>sum+Math.max(0,end-start),0);
const exclusiveAuthorities=(task:Task)=>[{key:`space:${task.spaceId}`,id:task.spaceId},...(task.requiredResourceIds??[]).map(id=>({key:`resource:${id}`,id}))].sort((a,b)=>a.key.localeCompare(b.key));
const deadlineAuthority=(problem:PlannerNextProblem,pending:readonly Task[],provisional:readonly ScheduledTask[])=>{
  const pendingById=new Map(pending.map(task=>[task.id,task])),successors=new Map<string,string[]>();
  for(const task of problem.tasks)for(const dependency of task.dependencies)successors.set(dependency,[...(successors.get(dependency)??[]),task.id]);
  const placedById=new Map(provisional.map(task=>[task.id,task])),memo=new Map<string,number>();
  const deadline=(id:string,visiting=new Set<string>()):number=>{const hit=memo.get(id);if(hit!==undefined)return hit;if(visiting.has(id))return problem.day.end;
    const next=new Set(visiting).add(id),values=(successors.get(id)??[]).flatMap(successorId=>{const placed=placedById.get(successorId);if(placed)return[placed.start];const successor=pendingById.get(successorId);return successor?[deadline(successorId,next)-successor.duration]:[];});
    const value=Math.min(problem.day.end,...values);memo.set(id,value);return value;};
  return{pendingById,deadline};
};
const collectiveOccupation=(problem:PlannerNextProblem,task:Task,provisional:readonly ScheduledTask[],meals:readonly ScheduledSpaceMeal[],deadline:number,
  domain?:ReturnType<typeof exactTaskStartDomain>)=>mergeIntervals(domain?.intervals.map(interval=>({start:interval.start,end:interval.end+task.duration}))
    ??exactTaskStartDomain(problem,task,provisional,[...meals]).intervals.flatMap(interval=>{const end=Math.min(interval.end,deadline-task.duration);return interval.start<=end?[{start:interval.start,end:end+task.duration}]:[]}));
const evaluateCollectiveTasks=(problem:PlannerNextProblem,tasks:readonly Task[],provisional:readonly ScheduledTask[],meals:readonly ScheduledSpaceMeal[],
  deadline:(id:string)=>number,domains?:ReadonlyMap<string,ReturnType<typeof exactTaskStartDomain>>):Omit<TargetCollectiveCapacityCertificateEvaluation,"evaluated"|"authorityId">=>{
  const ordered=[...tasks].sort(byId),occupation=new Map(ordered.map(task=>[task.id,collectiveOccupation(problem,task,provisional,meals,deadline(task.id),domains?.get(task.id))]));
  const endpoints=[...new Set([...occupation.values()].flatMap(intervals=>intervals.flatMap(({start,end})=>[start,end])))].sort((a,b)=>a-b);
  for(let left=0;left<endpoints.length;left++)for(let right=left+1;right<endpoints.length;right++){const start=endpoints[left]!,end=endpoints[right]!;
    if(!ordered.every(task=>occupation.get(task.id)!.every(interval=>interval.start>=start&&interval.end<=end)))continue;
    const demand=ordered.reduce((sum,task)=>sum+task.duration,0),capacity=intervalMinutes(ordered.flatMap(task=>occupation.get(task.id)!));
    if(demand>capacity)return{overloaded:true,demandMinutes:demand,freeCapacityMinutes:capacity,overloadTaskIds:ordered.map(({id})=>id)};
  }
  return{overloaded:false,demandMinutes:ordered.reduce((sum,task)=>sum+task.duration,0),freeCapacityMinutes:intervalMinutes(ordered.flatMap(task=>occupation.get(task.id)!)),overloadTaskIds:ordered.map(({id})=>id)};
};

/** Diagnostic-only replay of one exact collective-capacity identity. It does not use a cache or a search ledger. */
export function evaluateTargetCollectiveCapacityCertificate(problem:PlannerNextProblem,pending:readonly Task[],previouslyPlaced:readonly ScheduledTask[],
  candidate:readonly ScheduledTask[],meals:readonly ScheduledSpaceMeal[],authorityId:string,overloadTaskIds:readonly string[]):TargetCollectiveCapacityCertificateEvaluation{
  const ids=[...overloadTaskIds].sort(),provisional=[...previouslyPlaced,...candidate].sort(byId),{pendingById,deadline}=deadlineAuthority(problem,pending,provisional);
  const tasks=ids.map(id=>pendingById.get(id));
  if(!ids.length||tasks.some(task=>!task))return{evaluated:false,overloaded:false,authorityId,demandMinutes:null,freeCapacityMinutes:null,overloadTaskIds:ids};
  const authorityKeys=[...new Set(exclusiveAuthorities(tasks[0]!).filter(authority=>authority.id===authorityId).map(authority=>authority.key))]
    .filter(key=>tasks.every(task=>exclusiveAuthorities(task!).some(authority=>authority.key===key)));
  if(authorityKeys.length!==1)return{evaluated:false,overloaded:false,authorityId,demandMinutes:null,freeCapacityMinutes:null,overloadTaskIds:ids};
  return{evaluated:true,authorityId,...evaluateCollectiveTasks(problem,tasks as Task[],provisional,meals,deadline)};
}

/** Exact, read-only existence proof for pending ancestors affected by one provisional macro placement. */
export function checkMacroPendingPrerequisites(problem:PlannerNextProblem,pending:readonly Task[],previouslyPlaced:readonly ScheduledTask[],
  candidate:readonly ScheduledTask[],meals:readonly ScheduledSpaceMeal[]=[],cache?:MacroPendingPrerequisiteForwardCache,
  scope:"AFFECTED_PREREQUISITES"|"ALL_PENDING"="AFFECTED_PREREQUISITES",mode:MacroPendingPrerequisiteForwardCheckMode="FULL"):MacroPendingPrerequisiteForwardCheckResult{
  const provisional=[...previouslyPlaced,...candidate].sort(byId),{pendingById,deadline}=deadlineAuthority(problem,pending,provisional);
  const candidateIds=new Set(candidate.map(task=>task.id)),ancestors=new Set<string>();
  const visitAncestors=(id:string)=>{const task=problem.tasks.find(item=>item.id===id);for(const dependency of task?.dependencies??[])if(pendingById.has(dependency)&&!ancestors.has(dependency)){ancestors.add(dependency);visitAncestors(dependency);}};
  for(const id of candidateIds)visitAncestors(id);
  const allRequired=scope==="ALL_PENDING"?[...pending]:[...pending].filter(task=>deadline(task.id)<problem.day.end);
  const affected=scope==="ALL_PENDING"?new Set(allRequired.map(task=>task.id)):new Set([...ancestors,...allRequired.filter(task=>candidate.some(item=>tasksCanAffectEachOther(task,item))).map(task=>task.id)]);
  const relevant=allRequired.filter(task=>affected.has(task.id)).sort(byId);
  if(!relevant.length)return{feasible:true,tasksChecked:0,individualDomainChecks:0,collectiveCapacityChecks:0,obligationsChecked:0,collectiveCapacityPrunes:0,authorityId:null,demandMinutes:null,freeCapacityMinutes:null,jointChecks:0,witnesses:0,blockingTaskId:null,deadline:null,failure:null,cacheHit:false};
  const affectedAuthorities=new Set(relevant.flatMap(exclusiveAuthorities).map(item=>item.key));
  const collectiveTasks=[...pending].filter(task=>exclusiveAuthorities(task).some(({key})=>affectedAuthorities.has(key))).sort(byId);
  const key=createHash("sha256").update(JSON.stringify({mode,tasks:relevant.map(task=>({id:task.id,deadline:deadline(task.id)})),collectiveTasks:collectiveTasks.map(task=>({id:task.id,deadline:deadline(task.id)})),placed:provisional.map(task=>({id:task.id,start:task.start,end:task.end,spaceId:task.spaceId,participantId:task.participantId??null,coachId:task.coachId??null,resources:[...(task.requiredResourceIds??[])].sort()})),meals:[...meals].sort(byId)})).digest("hex");
  const cached=cache?.get(key);if(cached)return{...cached,cacheHit:true};
  let individualDomainChecks=0,collectiveCapacityChecks=0,obligationsChecked=0,jointChecks=0,witnesses=0;
  const domains=new Map<string,ReturnType<typeof exactTaskStartDomain>>();
  for(const task of relevant){individualDomainChecks+=1;const limit=deadline(task.id)-task.duration;const domain=exactStartDomainFromIntervals(problem,exactTaskStartDomain(problem,task,provisional,[...meals]).intervals.flatMap(interval=>interval.start<=Math.min(interval.end,limit)?[{start:interval.start,end:Math.min(interval.end,limit)}]:[]));domains.set(task.id,domain);
    if(!domain.eligibleStartCount){const result={feasible:false,tasksChecked:relevant.length,individualDomainChecks,collectiveCapacityChecks,obligationsChecked,collectiveCapacityPrunes:0,authorityId:null,demandMinutes:null,freeCapacityMinutes:null,jointChecks,witnesses,blockingTaskId:task.id,deadline:deadline(task.id),failure:"INDIVIDUAL_ZERO_DOMAIN" as const};cache?.set(key,result);return{...result,cacheHit:false};}}
  // Necessary energetic certificate: every obligation whose complete dynamic domain is
  // inside a cut must consume its full duration from the shared exclusive authority.
  // Domain intervals are converted to possible occupation intervals without scanning starts.
  const authorityEntries=new Map<string,{id:string;tasks:Task[]}>();
  for(const task of collectiveTasks)for(const authority of exclusiveAuthorities(task))if(affectedAuthorities.has(authority.key)){const entry=authorityEntries.get(authority.key)??{id:authority.id,tasks:[]};entry.tasks.push(task);authorityEntries.set(authority.key,entry);}
  for(const [authorityKey,entry] of [...authorityEntries].sort(([a],[b])=>a.localeCompare(b))){if(entry.tasks.length<2)continue;collectiveCapacityChecks+=1;obligationsChecked+=entry.tasks.length;
    // Evaluate each deterministic confined subset through the same target authority used by diagnostics.
    const occupation=new Map(entry.tasks.map(task=>[task.id,collectiveOccupation(problem,task,provisional,meals,deadline(task.id),domains.get(task.id))]));
    const endpoints=[...new Set([...occupation.values()].flatMap(intervals=>intervals.flatMap(({start,end})=>[start,end])))].sort((a,b)=>a-b);
    for(let left=0;left<endpoints.length;left++)for(let right=left+1;right<endpoints.length;right++){const start=endpoints[left]!,end=endpoints[right]!;const confined=entry.tasks.filter(task=>occupation.get(task.id)!.every(interval=>interval.start>=start&&interval.end<=end));if(confined.length<2)continue;const target=evaluateCollectiveTasks(problem,confined,provisional,meals,deadline,domains);if(target.overloaded){const blocker=confined[0]!;const result={feasible:false,tasksChecked:relevant.length,individualDomainChecks,collectiveCapacityChecks,obligationsChecked,collectiveCapacityPrunes:1,authorityId:entry.id,demandMinutes:target.demandMinutes,freeCapacityMinutes:target.freeCapacityMinutes,overloadTaskIds:target.overloadTaskIds,jointChecks,witnesses,blockingTaskId:blocker.id,deadline:deadline(blocker.id),failure:"COLLECTIVE_CAPACITY" as const};cache?.set(key,result);return{...result,cacheHit:false};}}
  }
  if(mode==="ANALYTIC_CAPACITY_ONLY"){const result={feasible:true,tasksChecked:relevant.length,individualDomainChecks,collectiveCapacityChecks,obligationsChecked,collectiveCapacityPrunes:0,authorityId:null,demandMinutes:null,freeCapacityMinutes:null,jointChecks,witnesses,blockingTaskId:null,deadline:null,failure:null};cache?.set(key,result);return{...result,cacheHit:false};}
  const remaining=new Set(relevant.map(task=>task.id));const components:Task[][]=[];
  while(remaining.size){const seed=[...remaining].sort()[0]!,component=new Set([seed]),queue=[seed];remaining.delete(seed);while(queue.length){const id=queue.shift()!,task=pendingById.get(id)!;for(const otherId of [...remaining]){const other=pendingById.get(otherId)!;if(tasksCanAffectEachOther(task,other)){remaining.delete(otherId);component.add(otherId);queue.push(otherId);}}}components.push([...component].map(id=>pendingById.get(id)!).sort(byId));}
  for(const component of components){if(component.length<2){witnesses+=1;continue;}
    if(component.length>MAX_EXACT_JOINT_PREREQUISITES)continue;
    jointChecks+=1;const ids=new Set(component.map(task=>task.id));
    const search=(left:Task[],placed:ScheduledTask[]):boolean=>{if(!left.length)return true;const ready=left.filter(task=>task.dependencies.filter(id=>ids.has(id)).every(id=>placed.some(item=>item.id===id)));
      const choices=(ready.length?ready:left).map(task=>({task,starts:[...exactTaskStartDomain(problem,task,[...provisional,...placed],[...meals]).starts()].filter(start=>start+task.duration<=deadline(task.id)&&canPlaceTask(problem,task,start,[...provisional,...placed],[...meals]))})).sort((a,b)=>a.starts.length-b.starts.length||a.task.id.localeCompare(b.task.id));
      const choice=choices[0];if(!choice||!choice.starts.length)return false;for(const start of choice.starts)if(search(left.filter(task=>task.id!==choice.task.id),[...placed,{...choice.task,start,end:start+choice.task.duration}]))return true;return false;};
    if(!search(component,[])){const blocker=component[0]!;const result={feasible:false,tasksChecked:relevant.length,individualDomainChecks,collectiveCapacityChecks,obligationsChecked,collectiveCapacityPrunes:0,authorityId:null,demandMinutes:null,freeCapacityMinutes:null,jointChecks,witnesses,blockingTaskId:blocker.id,deadline:deadline(blocker.id),failure:"JOINT_INFEASIBLE" as const};cache?.set(key,result);return{...result,cacheHit:false};}witnesses+=1;}
  const result={feasible:true,tasksChecked:relevant.length,individualDomainChecks,collectiveCapacityChecks,obligationsChecked,collectiveCapacityPrunes:0,authorityId:null,demandMinutes:null,freeCapacityMinutes:null,jointChecks,witnesses,blockingTaskId:null,deadline:null,failure:null};cache?.set(key,result);return{...result,cacheHit:false};
}

/** Read-only necessary/exact feasibility certificate at a hard-valid CORE leaf. */
export function checkStandaloneCoreFrontier(problem:PlannerNextProblem,pending:readonly Task[],core:readonly ScheduledTask[],
  meals:readonly ScheduledSpaceMeal[]=[],mode:MacroPendingPrerequisiteForwardCheckMode="FULL"):MacroPendingPrerequisiteForwardCheckResult{
  return checkMacroPendingPrerequisites(problem,pending,core,[],meals,undefined,"ALL_PENDING",mode);
}
