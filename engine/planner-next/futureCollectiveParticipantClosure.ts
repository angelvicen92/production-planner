import type {PlannerNextProblem,ScheduledParticipantMeal,ScheduledTask,Task} from "./contracts";
import {canPlaceTask,exactTaskStartDomain} from "./placement";

export type FutureCollectiveClosureResult={status:"PASS"|"INFEASIBLE"|"ABSTAIN";matching:ReadonlyMap<string,number>;
  prerequisiteIds:readonly string[];blockingParticipantIds?:readonly string[];branchesConsumed:number;reason:"UNCERTIFIED_GEOMETRY"|"NO_PERFECT_MATCH"|"BUDGET_EXHAUSTED"|null};

/** Exact only for equal-duration work on one exclusive space whose starts are disjoint unit slots. */
export function certifyFutureCollectiveParticipantClosure(problem:PlannerNextProblem,fixed:readonly ScheduledTask[],
  meals:readonly ScheduledParticipantMeal[],consume:()=>boolean=()=>true):FutureCollectiveClosureResult{
  const departures=problem.analyticalFutureTransportDepartures??[];
  if(!departures.length)return {status:"PASS",matching:new Map(),prerequisiteIds:[],branchesConsumed:0,reason:null};
  const future=new Map((problem.analyticalFutureParticipantTasks??[]).map(task=>[task.id,task]));
  const fixedIds=new Set(fixed.map(task=>task.id));
  // Every executable meal obligation must be present at a successful leaf, so
  // its prerequisite chain is already discharged for this future-closure test.
  // This also makes partial meal checks monotone: later meals only add occupancy.
  const mealDependencyIds=new Set((problem.participantMeals??[]).flatMap(obligation=>obligation.dependencies??[]));
  const pairs:{prerequisite:Task;departure:Task}[]=[];
  for(const departure of departures)for(const id of departure.dependencies){const prerequisite=future.get(id);
    if(prerequisite&&prerequisite.participantId===departure.participantId&&!fixedIds.has(id)&&!mealDependencyIds.has(id))pairs.push({prerequisite,departure});}
  const unique=[...new Map(pairs.map(pair=>[pair.prerequisite.id,pair])).values()].sort((a,b)=>a.prerequisite.id.localeCompare(b.prerequisite.id));
  if(!unique.length)return {status:"PASS",matching:new Map(),prerequisiteIds:[],branchesConsumed:0,reason:null};
  const duration=unique[0]!.prerequisite.duration,spaceId=unique[0]!.prerequisite.spaceId;
  if(!spaceId||unique.some(({prerequisite})=>prerequisite.duration!==duration||prerequisite.spaceId!==spaceId))
    return {status:"ABSTAIN",matching:new Map(),prerequisiteIds:unique.map(x=>x.prerequisite.id),branchesConsumed:0,reason:"UNCERTIFIED_GEOMETRY"};
  const mealTasks=meals.flatMap(meal=>{const source=future.get(meal.sourceTaskId)??problem.tasks.find(task=>task.id===meal.sourceTaskId);
    return source?[{...source,start:meal.start,end:meal.end}]:[];});
  const occupied=[...fixed,...mealTasks];const domains=new Map<string,number[]>();
  for(const {prerequisite,departure} of unique){const starts=[...exactTaskStartDomain(problem,prerequisite,occupied).starts()].filter(start=>{
      if(!canPlaceTask(problem,prerequisite,start,occupied))return false;const scheduled={...prerequisite,start,end:start+duration};
      return [...exactTaskStartDomain(problem,departure,[...occupied,scheduled]).starts()].some(outStart=>canPlaceTask(problem,departure,outStart,[...occupied,scheduled]));
    });domains.set(prerequisite.id,starts);}
  const slots=[...new Set([...domains.values()].flat())].sort((a,b)=>a-b);
  if(slots.some((start,index)=>index>0&&start-slots[index-1]!<duration))return {status:"ABSTAIN",matching:new Map(),
    prerequisiteIds:unique.map(x=>x.prerequisite.id),branchesConsumed:0,reason:"UNCERTIFIED_GEOMETRY"};
  if(!consume())return {status:"ABSTAIN",matching:new Map(),prerequisiteIds:unique.map(x=>x.prerequisite.id),branchesConsumed:0,reason:"BUDGET_EXHAUSTED"};
  let branches=1;const owner=new Map<number,string>(),matching=new Map<string,number>();
  const augment=(id:string,seen:Set<number>):boolean=>{for(const slot of domains.get(id)??[]){if(seen.has(slot))continue;
      seen.add(slot);const displaced=owner.get(slot);
      if(displaced===undefined||augment(displaced,seen)){owner.set(slot,id);matching.set(id,slot);return true;}}return false;};
  for(const {prerequisite} of unique)if(!augment(prerequisite.id,new Set()))return {status:"INFEASIBLE",matching:new Map(),
    prerequisiteIds:unique.map(x=>x.prerequisite.id),blockingParticipantIds:prerequisite.participantId?[prerequisite.participantId]:[],branchesConsumed:branches,reason:"NO_PERFECT_MATCH"};
  return {status:"PASS",matching,prerequisiteIds:unique.map(x=>x.prerequisite.id),branchesConsumed:branches,reason:null};
}
