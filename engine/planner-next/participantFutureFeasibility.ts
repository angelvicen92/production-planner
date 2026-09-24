import type { ParticipantMealObligation, PlannerNextProblem, ScheduledParticipantMeal, ScheduledTask, Task } from "./contracts";
import { exactTaskStartDomain, type ExactTaskStartDomain } from "./placement";
import { analyticParticipantMealDomain, participantMealCandidates, type AnalyticParticipantMealStartDomain } from "./participantMeals";

export type ParticipantFutureReservationStatus = "PASS" | "PRUNE" | "ABSTAIN";
export interface ParticipantFutureReservationProbe {
  readonly status: ParticipantFutureReservationStatus;
  readonly affectedParticipants: readonly string[];
  readonly affectedFutureTasksChecked: number;
  readonly affectedMealsChecked: number;
  readonly individualDomainChecks: number;
  readonly individualZeroDomainPrunes: number;
  readonly jointTaskMealChecks: number;
  readonly jointTaskMealPrunes: number;
  readonly collectiveChecks: number;
  readonly collectivePasses: number;
  readonly collectivePrunes: number;
  readonly collectiveObligationIds: readonly string[];
  readonly collectiveDomainSizes: Readonly<Record<string,number>>;
  readonly collectiveWitnessFound: boolean;
  readonly compatiblePairChecks: number;
  readonly analyticChecks: number;
  readonly branchesConsumed: number;
  readonly abstainCause: "BUDGET_EXHAUSTED" | "INCONCLUSIVE_SHAPE" | null;
  readonly reasonCode: "FUTURE_PARTICIPANT_TASK_ZERO_DOMAIN" | "FUTURE_PARTICIPANT_TASK_MEAL_INCOMPATIBLE" | "FUTURE_PARTICIPANT_COLLECTIVE_INFEASIBLE" | "FUTURE_PARTICIPANT_RESERVATION_INCONCLUSIVE" | null;
  readonly futureTaskId: string | null;
  readonly mealTaskId: string | null;
  readonly participantId: string | null;
  readonly futureTaskCandidateCount: number;
  readonly mealCandidateCount: number;
  readonly compatiblePairCount: 0 | 1;
}

export interface ParticipantFutureReservationBudget { consume:()=>boolean }
export type ParticipantFutureReservationMode = "EXACT" | "ANALYTIC_ONLY";

const affectedBy=(task:Task,added:readonly ScheduledTask[])=>task.participantId!==undefined&&added.some(current=>
  current.participantId===task.participantId||current.id===task.id||current.dependencies.includes(task.id)||task.dependencies.includes(current.id));
const firstStart=(problem:PlannerNextProblem,domain:ExactTaskStartDomain)=>{const start=domain.intervals[0]?.start;return start===undefined?null:problem.day.start+Math.max(0,Math.ceil((start-problem.day.start)/5))*5;};
const lastStart=(problem:PlannerNextProblem,domain:ExactTaskStartDomain)=>{const end=domain.intervals.at(-1)?.end;return end===undefined?null:problem.day.start+Math.floor((end-problem.day.start)/5)*5;};
const firstMeal=(domain:AnalyticParticipantMealStartDomain)=>domain.ranges[0]?.first??null;
const lastMeal=(domain:AnalyticParticipantMealStartDomain)=>domain.ranges.at(-1)?.last??null;
const remainingMeal=(meal:ParticipantMealObligation)=>meal.status==="pending"||meal.status==="interrupted";

/** A placement context is a set of task placements, not a multiset. */
export function normalizeParticipantFuturePlacements(placed:readonly ScheduledTask[]):ScheduledTask[]{
  const seen=new Set<string>();const normalized:ScheduledTask[]=[];
  for(const task of placed){
    const key=JSON.stringify([task.id,task.start,task.end,task.spaceId]);
    if(seen.has(key))continue;
    seen.add(key);normalized.push(task);
  }
  return normalized;
}

type CollectiveResult={status:"PASS"|"PRUNE"|"ABSTAIN";branches:number;domainSizes:Record<string,number>;witness:boolean;
  abstainCause:"BUDGET_EXHAUSTED"|"INCONCLUSIVE_SHAPE"|null};

/** Exact participant-local witness. Candidate generation delegates to the canonical task and meal authorities. */
function collectiveWitness(problem:PlannerNextProblem,_participantId:string,tasks:readonly Task[],meals:readonly ParticipantMealObligation[],
  fixed:readonly ScheduledTask[],budget?:ParticipantFutureReservationBudget,mode:ParticipantFutureReservationMode="EXACT"):CollectiveResult {
  const taskIds=new Set(tasks.map(task=>task.id)),mealIds=new Set(meals.map(meal=>meal.sourceTaskId));
  const knownFixed=new Set(fixed.map(task=>task.id));
  const dependencies=[...tasks.flatMap(task=>task.dependencies),...meals.flatMap(meal=>meal.dependencies??[])];
  if(dependencies.some(id=>!taskIds.has(id)&&!mealIds.has(id)&&!knownFixed.has(id)))return {status:"ABSTAIN",branches:0,domainSizes:{},witness:false,abstainCause:"INCONCLUSIVE_SHAPE"};
  let branches=0,exhausted=false;const domainSizes:Record<string,number>={};
  const envelopes:{start:number;end:number;duration:number}[]=[];
  for(const task of tasks){const domain=exactTaskStartDomain(problem,task,[...fixed]);domainSizes[task.id]=domain.eligibleStartCount;
    if(domain.eligibleStartCount===0)return {status:"PRUNE",branches,domainSizes,witness:false,abstainCause:null};
    envelopes.push({start:firstStart(problem,domain)!,end:lastStart(problem,domain)!+task.duration,duration:task.duration});}
  for(const meal of meals){const domain=analyticParticipantMealDomain(problem,meal,fixed);domainSizes[meal.sourceTaskId]=domain.validStarts;
    if(domain.validStarts===0)return {status:"PRUNE",branches,domainSizes,witness:false,abstainCause:null};
    envelopes.push({start:firstMeal(domain)!,end:lastMeal(domain)!+meal.duration,duration:meal.duration});}
  const participant=problem.participants.find(({id})=>id===_participantId);
  const endpoints=[...new Set(envelopes.flatMap(item=>[item.start,item.end]))].sort((a,b)=>a-b);
  const fixedOwn=fixed.filter(task=>task.participantId===_participantId);
  for(let left=0;left<endpoints.length;left++)for(let right=left+1;right<endpoints.length;right++){
    const start=endpoints[left]!,end=endpoints[right]!,required=envelopes.filter(item=>item.start>=start&&item.end<=end)
      .reduce((sum,item)=>sum+item.duration,0);
    const available=(participant?.availability??[]).reduce((sum,window)=>sum+Math.max(0,Math.min(end,window.end)-Math.max(start,window.start)),0);
    const occupied=fixedOwn.reduce((sum,item)=>sum+Math.max(0,Math.min(end,item.end)-Math.max(start,item.start)),0);
    if(required>available-occupied)return {status:"PRUNE",branches,domainSizes,witness:false,abstainCause:null};
  }
  if(mode==="ANALYTIC_ONLY")return {status:"ABSTAIN",branches,domainSizes,witness:false,abstainCause:"INCONCLUSIVE_SHAPE"};
  const visit=(pendingTasks:readonly Task[],pendingMeals:readonly ParticipantMealObligation[],scheduledTasks:ScheduledTask[],scheduledMeals:ScheduledParticipantMeal[]):boolean=>{
    if(pendingTasks.length===0&&pendingMeals.length===0)return true;
    const placedIds=new Set(scheduledTasks.map(task=>task.id)),placedMealIds=new Set(scheduledMeals.map(meal=>meal.sourceTaskId));
    const readyTasks=pendingTasks.filter(task=>task.dependencies.every(id=>placedIds.has(id)||placedMealIds.has(id)));
    const readyMeals=pendingMeals.filter(meal=>(meal.dependencies??[]).every(id=>placedIds.has(id)||placedMealIds.has(id)));
    const choices:[string,"TASK"|"MEAL",Task|ParticipantMealObligation,readonly (number|ScheduledParticipantMeal)[]][]=[];
    for(const task of readyTasks){
      const afterMeals=Math.max(-Infinity,...task.dependencies.map(id=>scheduledMeals.find(meal=>meal.sourceTaskId===id)?.end??-Infinity));
      const starts=[...exactTaskStartDomain(problem,task,scheduledTasks).starts()].filter(start=>start>=afterMeals
        &&scheduledMeals.every(meal=>meal.participantId!==task.participantId||start+task.duration<=meal.start||meal.end<=start));
      domainSizes[task.id]=Math.max(domainSizes[task.id]??0,starts.length);choices.push([task.id,"TASK",task,starts]);
    }
    for(const meal of readyMeals){const candidates=participantMealCandidates(problem,meal,scheduledTasks,scheduledMeals);
      domainSizes[meal.sourceTaskId]=Math.max(domainSizes[meal.sourceTaskId]??0,candidates.length);choices.push([meal.sourceTaskId,"MEAL",meal,candidates]);}
    choices.sort((a,b)=>a[3].length-b[3].length||a[0].localeCompare(b[0]));
    const selected=choices[0];if(!selected)return false;
    for(const candidate of selected[3]){
      if(budget&&!budget.consume()){exhausted=true;return false;}branches++;
      if(selected[1]==="TASK"){
        const task=selected[2] as Task,start=candidate as number;
        const scheduled:ScheduledTask={...task,start,end:start+task.duration};
        if(visit(pendingTasks.filter(item=>item.id!==task.id),pendingMeals,[...scheduledTasks,scheduled],scheduledMeals))return true;
      }else{
        const meal=selected[2] as ParticipantMealObligation;
        if(visit(pendingTasks,pendingMeals.filter(item=>item.sourceTaskId!==meal.sourceTaskId),scheduledTasks,[...scheduledMeals,candidate as ScheduledParticipantMeal]))return true;
      }
    }
    return false;
  };
  const witness=visit(tasks,meals,[...fixed],[]);
  return {status:witness?"PASS":exhausted?"ABSTAIN":"PRUNE",branches,domainSizes,witness,
    abstainCause:exhausted?"BUDGET_EXHAUSTED":null};
}

/** Sound read-only reservation for out-of-scope participant work. */
export function probeParticipantFutureReservations(problem:PlannerNextProblem,placed:readonly ScheduledTask[],added:readonly ScheduledTask[],budget?:ParticipantFutureReservationBudget,
  mode:ParticipantFutureReservationMode="EXACT"):ParticipantFutureReservationProbe {
  placed=normalizeParticipantFuturePlacements(placed);
  const affectedParticipants=[...new Set(added.flatMap(task=>task.participantId?[task.participantId]:[]))].sort();
  const future=[...(problem.analyticalFutureParticipantTasks??[])].filter(task=>affectedBy(task,added)).sort((a,b)=>a.id.localeCompare(b.id));
  const meals=[...(problem.participantMeals??[])].filter(meal=>remainingMeal(meal)&&affectedParticipants.includes(meal.participantId)).sort((a,b)=>a.sourceTaskId.localeCompare(b.sourceTaskId));
  const base={affectedParticipants,affectedFutureTasksChecked:future.length,affectedMealsChecked:meals.length,individualDomainChecks:0,
    individualZeroDomainPrunes:0,jointTaskMealChecks:0,jointTaskMealPrunes:0,collectiveChecks:0,collectivePasses:0,collectivePrunes:0,
    collectiveObligationIds:[] as string[],collectiveDomainSizes:{} as Record<string,number>,collectiveWitnessFound:false,
    compatiblePairChecks:0,analyticChecks:0,branchesConsumed:0,abstainCause:null,reasonCode:null,futureTaskId:null,mealTaskId:null,participantId:null,
    futureTaskCandidateCount:0,mealCandidateCount:0,compatiblePairCount:0 as const};
  if(future.length===0)return {...base,status:"PASS" as const};
  const futureIds=new Set(future.map(task=>task.id)),mealIds=new Set(meals.map(meal=>meal.sourceTaskId)),placedIds=new Set(placed.map(task=>task.id));
  const unresolved=future.filter(task=>task.dependencies.some(id=>!placedIds.has(id)&&!futureIds.has(id)&&!mealIds.has(id)));
  const unresolvedIds=new Set(unresolved.map(task=>task.id));let individual=0,joint=0,pairChecks=0,analytic=0;
  for(const task of future){
    if(unresolvedIds.has(task.id)){individual++;analytic++;continue;}
    const taskDomain=exactTaskStartDomain(problem,task,[...placed]);individual++;analytic++;
    if(taskDomain.eligibleStartCount===0)return {...base,status:"PRUNE" as const,individualDomainChecks:individual,individualZeroDomainPrunes:1,
      analyticChecks:analytic,reasonCode:"FUTURE_PARTICIPANT_TASK_ZERO_DOMAIN" as const,futureTaskId:task.id,participantId:task.participantId??null};
    for(const meal of meals.filter(candidate=>candidate.participantId===task.participantId)){
      const mealDomain=analyticParticipantMealDomain(problem,meal,placed);individual++;joint++;pairChecks++;analytic+=2;if(mealDomain.validStarts===0)continue;
      const taskBeforeMeal=firstStart(problem,taskDomain)!+task.duration<=lastMeal(mealDomain)!;
      const mealBeforeTask=firstMeal(mealDomain)!+meal.duration<=lastStart(problem,taskDomain)!;
      const compatible=(meal.dependencies??[]).includes(task.id)?taskBeforeMeal:task.dependencies.includes(meal.sourceTaskId)?mealBeforeTask:(taskBeforeMeal||mealBeforeTask);
      if(!compatible)return {...base,status:"PRUNE" as const,individualDomainChecks:individual,jointTaskMealChecks:joint,jointTaskMealPrunes:1,
        compatiblePairChecks:pairChecks,analyticChecks:analytic,reasonCode:"FUTURE_PARTICIPANT_TASK_MEAL_INCOMPATIBLE" as const,
        futureTaskId:task.id,mealTaskId:meal.sourceTaskId,participantId:task.participantId??null,
        futureTaskCandidateCount:taskDomain.eligibleStartCount,mealCandidateCount:mealDomain.validStarts,compatiblePairCount:0};
    }
  }
  if(unresolved.length)return {...base,status:"ABSTAIN" as const,individualDomainChecks:individual,jointTaskMealChecks:joint,
    compatiblePairChecks:pairChecks,analyticChecks:analytic,compatiblePairCount:pairChecks>0?1:0,
    abstainCause:"INCONCLUSIVE_SHAPE" as const,reasonCode:"FUTURE_PARTICIPANT_RESERVATION_INCONCLUSIVE" as const,futureTaskId:unresolved[0]!.id,participantId:unresolved[0]!.participantId??null};
  let collectiveChecks=0,collectivePasses=0,branchesConsumed=0;const collectiveObligationIds:string[]=[];
  const collectiveDomainSizes:Record<string,number>={};
  for(const participantId of affectedParticipants){
    const participantTasks=future.filter(task=>task.participantId===participantId),participantMeals=meals.filter(meal=>meal.participantId===participantId);
    if(participantTasks.length+participantMeals.length<2)continue;
    const result=collectiveWitness(problem,participantId,participantTasks,participantMeals,placed,budget,mode);collectiveChecks++;branchesConsumed+=result.branches;
    const obligationIds=[...participantTasks.map(task=>task.id),...participantMeals.map(meal=>meal.sourceTaskId)].sort();
    collectiveObligationIds.push(...obligationIds);Object.assign(collectiveDomainSizes,result.domainSizes);
    const common={...base,individualDomainChecks:individual,jointTaskMealChecks:joint,compatiblePairChecks:pairChecks,analyticChecks:analytic,
      compatiblePairCount:(pairChecks>0?1:0) as 0|1,collectiveChecks,collectivePasses,
      collectivePrunes:Number(result.status==="PRUNE"),collectiveObligationIds:[...collectiveObligationIds].sort(),collectiveDomainSizes,
      collectiveWitnessFound:result.witness,branchesConsumed,participantId,abstainCause:result.abstainCause};
    if(result.status==="PRUNE")return {...common,status:"PRUNE" as const,reasonCode:"FUTURE_PARTICIPANT_COLLECTIVE_INFEASIBLE" as const};
    if(result.status==="ABSTAIN")return {...common,status:"ABSTAIN" as const,reasonCode:"FUTURE_PARTICIPANT_RESERVATION_INCONCLUSIVE" as const};
    collectivePasses++;
  }
  return {...base,status:"PASS" as const,individualDomainChecks:individual,jointTaskMealChecks:joint,compatiblePairChecks:pairChecks,
    analyticChecks:analytic,compatiblePairCount:pairChecks>0?1:0,collectiveChecks,collectivePasses,collectivePrunes:0,
    collectiveObligationIds:[...collectiveObligationIds].sort(),collectiveDomainSizes,collectiveWitnessFound:collectiveChecks>0,branchesConsumed};
}
