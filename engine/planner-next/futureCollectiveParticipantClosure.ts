import type {PlannerNextProblem,ScheduledParticipantMeal,ScheduledTask,Task} from "./contracts";
import {canPlaceTask,exactTaskStartDomain} from "./placement";

export interface FutureCollectiveClosureHallCertificate {
  readonly prerequisiteIds:readonly string[];readonly participantIds:readonly string[];
  readonly neighbourSlots:readonly number[];readonly prerequisiteCardinality:number;readonly neighbourCardinality:number;
}
export type FutureCollectiveClosureResult={status:"PASS"|"INFEASIBLE"|"ABSTAIN";matching:ReadonlyMap<string,number>;
  prerequisiteIds:readonly string[];hall:FutureCollectiveClosureHallCertificate|null;branchesConsumed:number;matchingTraversals:number;
  reason:"UNCERTIFIED_GEOMETRY"|"NO_PERFECT_MATCH"|"BUDGET_EXHAUSTED"|null;cacheHit:boolean};
export interface FutureCollectiveClosureStats {checks:number;cacheHits:number;matchingTraversals:number}

const canonicalPlacements=(rows:readonly {id:string;start:number;end:number}[])=>rows.map(({id,start,end})=>[id,start,end] as const)
  .sort((a,b)=>a[0].localeCompare(b[0])||a[1]-b[1]||a[2]-b[2]);

/** Prepared exact authority. Cached answers consume no search branches. */
export function createFutureCollectiveParticipantClosureAuthority(problem:PlannerNextProblem){
  const cache=new Map<string,FutureCollectiveClosureResult>();
  const stats:FutureCollectiveClosureStats={checks:0,cacheHits:0,matchingTraversals:0};
  const evaluate=(fixed:readonly ScheduledTask[],meals:readonly ScheduledParticipantMeal[],consume:()=>boolean=()=>true):FutureCollectiveClosureResult=>{
    const key=JSON.stringify([canonicalPlacements(fixed),canonicalPlacements(meals)]),cached=cache.get(key);
    if(cached){stats.cacheHits++;return {...cached,cacheHit:true,branchesConsumed:0,matchingTraversals:0};}
    stats.checks++;
    const result=certifyUncached(problem,fixed,meals,consume);stats.matchingTraversals+=result.matchingTraversals;
    if(result.reason!=="BUDGET_EXHAUSTED")cache.set(key,result);
    return result;
  };
  return {evaluate,stats};
}

const empty=(status:"PASS"|"ABSTAIN",reason:FutureCollectiveClosureResult["reason"]=null):FutureCollectiveClosureResult=>
  ({status,matching:new Map(),prerequisiteIds:[],hall:null,branchesConsumed:0,matchingTraversals:0,reason,cacheHit:false});

function certifyUncached(problem:PlannerNextProblem,fixed:readonly ScheduledTask[],meals:readonly ScheduledParticipantMeal[],consume:()=>boolean):FutureCollectiveClosureResult{
  const departures=problem.analyticalFutureTransportDepartures??[];
  if(!departures.length)return empty("PASS");
  const future=new Map((problem.analyticalFutureParticipantTasks??[]).map(task=>[task.id,task]));
  const fixedIds=new Set(fixed.map(task=>task.id));
  const mealDependencyIds=new Set((problem.participantMeals??[]).flatMap(obligation=>obligation.dependencies??[]));
  const pairs:{prerequisite:Task;departure:Task}[]=[];
  for(const departure of departures)for(const id of departure.dependencies){const prerequisite=future.get(id);
    if(prerequisite&&prerequisite.participantId===departure.participantId&&!fixedIds.has(id)&&!mealDependencyIds.has(id))pairs.push({prerequisite,departure});}
  const unique=[...new Map(pairs.map(pair=>[pair.prerequisite.id,pair])).values()].sort((a,b)=>a.prerequisite.id.localeCompare(b.prerequisite.id));
  const prerequisiteIds=unique.map(x=>x.prerequisite.id);
  if(!unique.length)return empty("PASS");
  const duration=unique[0]!.prerequisite.duration,spaceId=unique[0]!.prerequisite.spaceId;
  const abstain=():FutureCollectiveClosureResult=>({...empty("ABSTAIN","UNCERTIFIED_GEOMETRY"),prerequisiteIds});
  if(!spaceId||unique.some(({prerequisite})=>prerequisite.duration!==duration||prerequisite.spaceId!==spaceId))return abstain();
  const mealTasks=meals.flatMap(meal=>{const source=future.get(meal.sourceTaskId)??problem.tasks.find(task=>task.id===meal.sourceTaskId);
    return source?[{...source,start:meal.start,end:meal.end}]:[];});
  const occupied=[...fixed,...mealTasks],domains=new Map<string,number[]>();
  for(const {prerequisite,departure} of unique){const starts=[...exactTaskStartDomain(problem,prerequisite,occupied).starts()].filter(start=>{
      if(!canPlaceTask(problem,prerequisite,start,occupied))return false;const scheduled={...prerequisite,start,end:start+duration};
      return [...exactTaskStartDomain(problem,departure,[...occupied,scheduled]).starts()].some(outStart=>canPlaceTask(problem,departure,outStart,[...occupied,scheduled]));
    });domains.set(prerequisite.id,starts);}
  const slots=[...new Set([...domains.values()].flat())].sort((a,b)=>a-b);
  if(slots.some((start,index)=>index>0&&start-slots[index-1]!<duration))return abstain();
  if(!consume())return {status:"ABSTAIN",matching:new Map(),prerequisiteIds,hall:null,branchesConsumed:0,matchingTraversals:0,reason:"BUDGET_EXHAUSTED",cacheHit:false};
  let traversals=0;const owner=new Map<number,string>(),matching=new Map<string,number>();
  const augment=(id:string,seenSlots:Set<number>,seenTasks:Set<string>):boolean=>{seenTasks.add(id);for(const slot of domains.get(id)??[]){
      if(seenSlots.has(slot))continue;seenSlots.add(slot);traversals++;const displaced=owner.get(slot);
      if(displaced===undefined||augment(displaced,seenSlots,seenTasks)){owner.set(slot,id);matching.set(id,slot);return true;}}return false;};
  for(const {prerequisite} of unique){const seenSlots=new Set<number>(),seenTasks=new Set<string>();
    if(!augment(prerequisite.id,seenSlots,seenTasks)){const hallTasks=[...seenTasks].sort(),participantIds=[...new Set(hallTasks.flatMap(id=>{
        const participant=future.get(id)?.participantId;return participant?[participant]:[];}))].sort(),neighbourSlots=[...seenSlots].sort((a,b)=>a-b);
      const hall={prerequisiteIds:hallTasks,participantIds,neighbourSlots,prerequisiteCardinality:hallTasks.length,neighbourCardinality:neighbourSlots.length};
      return {status:"INFEASIBLE",matching:new Map(),prerequisiteIds,hall,branchesConsumed:1,matchingTraversals:traversals,reason:"NO_PERFECT_MATCH",cacheHit:false};}}
  return {status:"PASS",matching,prerequisiteIds,hall:null,branchesConsumed:1,matchingTraversals:traversals,reason:null,cacheHit:false};
}

/** Stateless compatibility entry point. Prefer the prepared authority in production search. */
export function certifyFutureCollectiveParticipantClosure(problem:PlannerNextProblem,fixed:readonly ScheduledTask[],meals:readonly ScheduledParticipantMeal[],consume:()=>boolean=()=>true){
  return createFutureCollectiveParticipantClosureAuthority(problem).evaluate(fixed,meals,consume);
}
