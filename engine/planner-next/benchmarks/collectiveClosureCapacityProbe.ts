import type { PlannerNextProblem, ScheduledParticipantMeal, ScheduledTask, Task } from "../contracts";
import { canPlaceTask, exactTaskStartDomain } from "../placement";
import { participantMealCandidates } from "../participantMeals";
import { materializeTerminalTransportDetailed, type DetailedTransportMaterialization } from "../transportGrouping";

export type CollectiveClosureCapacityStatus=
  |"COLLECTIVE_CLOSURE_CAPACITY_PASS"
  |"COLLECTIVE_CLOSURE_CAPACITY_INFEASIBLE"
  |"INCONCLUSIVE";

export interface CollectiveClosureCapacityEvidence {
  candidateEdgesBeforeOutFiltering:number;
  candidateEdgesAfterOutFiltering:number;
  domainSizeByPrerequisite:Record<string,number>;
  lastOutCompatibleStartByParticipant:Record<string,number|null>;
  maximumMatchingCardinality:number;
  unmatchedPrerequisiteIds:string[];
  unmatchedParticipantIds:string[];
  geometry:"BIPARTITE_UNIT_SLOTS"|"NOT_CERTIFIED_UNIT_SLOTS";
  terminalTransportStatus:DetailedTransportMaterialization["status"]|null;
}

export interface CollectiveClosureCapacityResult {
  status:CollectiveClosureCapacityStatus;
  scheduledPrerequisites:ScheduledTask[];
  evidence:CollectiveClosureCapacityEvidence;
  transport:DetailedTransportMaterialization|null;
}

const semanticOrder=(problem:PlannerNextProblem,tasks:readonly Task[])=>[...tasks].sort((a,b)=>{
  const end=(task:Task)=>problem.participants.find(person=>person.id===task.participantId)?.availability.reduce((n,w)=>Math.max(n,w.end),-Infinity)??Infinity;
  return end(a)-end(b)||a.duration-b.duration||(a.participantId??"").localeCompare(b.participantId??"","en")||a.id.localeCompare(b.id,"en");
});

function maximumMatching(tasks:readonly Task[],domains:ReadonlyMap<string,readonly number[]>) {
  const owner=new Map<number,string>(),assigned=new Map<string,number>();
  const augment=(taskId:string,seen:Set<number>):boolean=>{
    for(const start of domains.get(taskId)??[]){if(seen.has(start))continue;seen.add(start);
      const incumbent=owner.get(start);
      if(incumbent===undefined||augment(incumbent,seen)){owner.set(start,taskId);assigned.set(taskId,start);return true;}
    }
    return false;
  };
  for(const task of tasks)augment(task.id,new Set());
  return assigned;
}

function canonicalEarliestPerfectMatching(tasks:readonly Task[],domains:ReadonlyMap<string,readonly number[]>) {
  const selected=new Map<string,number>(),occupied=new Set<number>();
  for(let index=0;index<tasks.length;index++){
    const task=tasks[index]!,remaining=tasks.slice(index+1);let chosen:number|undefined;
    for(const start of domains.get(task.id)??[]){if(occupied.has(start))continue;
      const blocked=new Set([...occupied,start]);
      const residual=new Map(remaining.map(item=>[item.id,(domains.get(item.id)??[]).filter(candidate=>!blocked.has(candidate))]));
      if(maximumMatching(remaining,residual).size===remaining.length){chosen=start;break;}
    }
    if(chosen===undefined)return null;selected.set(task.id,chosen);occupied.add(chosen);
  }
  return selected;
}

function certifiedUnitSlots(tasks:readonly Task[],domains:ReadonlyMap<string,readonly number[]>):boolean {
  if(tasks.length===0)return true;
  const duration=tasks[0]!.duration,spaceId=tasks[0]!.spaceId;
  if(!spaceId||tasks.some(task=>task.duration!==duration||task.spaceId!==spaceId))return false;
  const starts=[...new Set(tasks.flatMap(task=>[...(domains.get(task.id)??[])]))].sort((a,b)=>a-b);
  return starts.every((start,index)=>index===0||start-starts[index-1]!>=duration);
}

/** Read-only exact classifier for the A2 equal-duration, single-exclusive-space closure geometry. */
export function classifyCollectiveClosureCapacity(problem:PlannerNextProblem,protectedTasks:readonly ScheduledTask[],meals:readonly ScheduledParticipantMeal[],
  transport:(problem:PlannerNextProblem,substantive:readonly ScheduledTask[],meals:readonly ScheduledParticipantMeal[])=>DetailedTransportMaterialization=materializeTerminalTransportDetailed
):CollectiveClosureCapacityResult {
  const departureIds=new Set(problem.transportPolicy?.departure.taskIds??[]),protectedIds=new Set(protectedTasks.map(task=>task.id));
  const mealSources=meals.flatMap(meal=>{const source=problem.tasks.find(task=>task.id===meal.sourceTaskId);return source?[{...source,start:meal.start,end:meal.end}]:[];});
  const fixed=[...protectedTasks,...mealSources];
  // A materialized Sodexo witness discharges its own prerequisite chain for this
  // closure question.  Do not count that earlier chain member a second time merely
  // because OUT also names it directly; the remaining direct dependency is the
  // terminal departure prerequisite whose shared-space capacity is being certified.
  const materializedMealDependencies=new Set((problem.participantMeals??[])
    .filter(obligation=>meals.some(meal=>meal.sourceTaskId===obligation.sourceTaskId))
    .flatMap(obligation=>obligation.dependencies??[]));
  const departures=(problem.transportPolicy?.departure.taskIds??[]).flatMap(id=>{const task=problem.tasks.find(item=>item.id===id);return task?[task]:[];});
  const pairs=departures.flatMap(out=>out.dependencies.flatMap(id=>{const prerequisite=problem.tasks.find(task=>task.id===id&&task.participantId===out.participantId);
    return prerequisite&&!protectedIds.has(prerequisite.id)&&!departureIds.has(prerequisite.id)&&!materializedMealDependencies.has(prerequisite.id)
      ?[{prerequisite,out}]:[];}));
  const prerequisites=semanticOrder(problem,pairs.map(pair=>pair.prerequisite));
  const outByPrerequisite=new Map(pairs.map(pair=>[pair.prerequisite.id,pair.out]));
  const domains=new Map<string,number[]>();let before=0,after=0;
  const lastByParticipant:Record<string,number|null>={};
  for(const prerequisite of prerequisites){
    const raw=[...exactTaskStartDomain(problem,prerequisite,fixed).starts()].filter(start=>canPlaceTask(problem,prerequisite,start,fixed));
    before+=raw.length;const out=outByPrerequisite.get(prerequisite.id)!;
    const aware=raw.filter(start=>{const scheduled={...prerequisite,start,end:start+prerequisite.duration};
      return [...exactTaskStartDomain(problem,out,[...fixed,scheduled]).starts()].some(outStart=>canPlaceTask(problem,out,outStart,[...fixed,scheduled]));
    }).sort((a,b)=>a-b);
    domains.set(prerequisite.id,aware);after+=aware.length;
    if(prerequisite.participantId)lastByParticipant[prerequisite.participantId]=aware.at(-1)??null;
  }
  const unit=certifiedUnitSlots(prerequisites,domains);
  const matching=unit?maximumMatching(prerequisites,domains):new Map<string,number>();
  const unmatched=prerequisites.filter(task=>!matching.has(task.id));
  const evidence:CollectiveClosureCapacityEvidence={candidateEdgesBeforeOutFiltering:before,candidateEdgesAfterOutFiltering:after,
    domainSizeByPrerequisite:Object.fromEntries(prerequisites.map(task=>[task.id,domains.get(task.id)?.length??0])),
    lastOutCompatibleStartByParticipant:lastByParticipant,maximumMatchingCardinality:matching.size,
    unmatchedPrerequisiteIds:unmatched.map(task=>task.id),unmatchedParticipantIds:unmatched.flatMap(task=>task.participantId?[task.participantId]:[]),
    geometry:unit?"BIPARTITE_UNIT_SLOTS":"NOT_CERTIFIED_UNIT_SLOTS",terminalTransportStatus:null};
  if(!unit)return {status:"INCONCLUSIVE",scheduledPrerequisites:[],evidence,transport:null};
  if(matching.size!==prerequisites.length)return {status:"COLLECTIVE_CLOSURE_CAPACITY_INFEASIBLE",scheduledPrerequisites:[],evidence,transport:null};
  const canonical=canonicalEarliestPerfectMatching(prerequisites,domains)!;
  const scheduled=prerequisites.map(task=>({...task,start:canonical.get(task.id)!,end:canonical.get(task.id)!+task.duration}));
  const terminal=transport(problem,[...fixed,...scheduled],meals);evidence.terminalTransportStatus=terminal.status;
  return {status:"COLLECTIVE_CLOSURE_CAPACITY_PASS",scheduledPrerequisites:scheduled,evidence,transport:terminal};
}

// Compatibility name retained for the focused diagnostic tests and callers.
export const solveStageClosure=classifyCollectiveClosureCapacity;
