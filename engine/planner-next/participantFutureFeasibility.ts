import type { ParticipantMealObligation, PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { exactTaskStartDomain, type ExactTaskStartDomain } from "./placement";
import { analyticParticipantMealDomain, type AnalyticParticipantMealStartDomain } from "./participantMeals";

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
  readonly collectivePrunes: number;
  readonly compatiblePairChecks: number;
  readonly analyticChecks: number;
  readonly branchesConsumed: 0;
  readonly reasonCode: "FUTURE_PARTICIPANT_TASK_ZERO_DOMAIN" | "FUTURE_PARTICIPANT_TASK_MEAL_INCOMPATIBLE" | "FUTURE_PARTICIPANT_RESERVATION_INCONCLUSIVE" | null;
  readonly futureTaskId: string | null;
  readonly mealTaskId: string | null;
  readonly participantId: string | null;
  readonly futureTaskCandidateCount: number;
  readonly mealCandidateCount: number;
  readonly compatiblePairCount: 0 | 1;
}

const affectedBy=(task:Task,added:readonly ScheduledTask[])=>task.participantId!==undefined&&added.some(current=>
  current.participantId===task.participantId||current.id===task.id||current.dependencies.includes(task.id)||task.dependencies.includes(current.id));
const unresolvedDependencies=(task:Task,placed:readonly ScheduledTask[],futureIds:Set<string>)=>task.dependencies.some(id=>
  !placed.some(candidate=>candidate.id===id)&&!futureIds.has(id));
const firstStart=(problem:PlannerNextProblem,domain:ExactTaskStartDomain)=>{
  const start=domain.intervals[0]?.start;if(start===undefined)return null;
  return problem.day.start+Math.max(0,Math.ceil((start-problem.day.start)/5))*5;
};
const lastStart=(problem:PlannerNextProblem,domain:ExactTaskStartDomain)=>{
  const end=domain.intervals.at(-1)?.end;if(end===undefined)return null;
  return problem.day.start+Math.floor((end-problem.day.start)/5)*5;
};
const firstMeal=(domain:AnalyticParticipantMealStartDomain)=>domain.ranges[0]?.first??null;
const lastMeal=(domain:AnalyticParticipantMealStartDomain)=>domain.ranges.at(-1)?.last??null;
const shareHardAuthority=(left:Task,right:Task)=>left.participantId!==undefined&&left.participantId===right.participantId
  ||left.spaceId===right.spaceId
  ||left.coachId!==undefined&&left.coachId===right.coachId
  ||left.itinerantUnitId!==undefined&&left.itinerantUnitId===right.itinerantUnitId
  ||left.dependencies.includes(right.id)||right.dependencies.includes(left.id)
  ||left.jointGroupId!==undefined&&left.jointGroupId===right.jointGroupId
  ||(left.requiredResourceIds??[]).some(id=>(right.requiredResourceIds??[]).includes(id));

/**
 * Sound read-only reservation for out-of-scope participant work. It uses the
 * canonical task-domain authority and meal interval authority, and proves only
 * zero domains or absence of every non-overlapping task/meal pair. Unknown
 * dependency geometry abstains rather than pruning.
 */
export function probeParticipantFutureReservations(problem:PlannerNextProblem,placed:readonly ScheduledTask[],added:readonly ScheduledTask[]):ParticipantFutureReservationProbe {
  const affectedParticipants=[...new Set(added.flatMap(task=>task.participantId?[task.participantId]:[]))].sort();
  const future=[...(problem.analyticalFutureParticipantTasks??[])].filter(task=>affectedBy(task,added))
    .sort((a,b)=>a.id.localeCompare(b.id));
  const meals=[...(problem.participantMeals??[])].filter(meal=>affectedParticipants.includes(meal.participantId))
    .sort((a,b)=>a.sourceTaskId.localeCompare(b.sourceTaskId));
  const base={affectedParticipants,affectedFutureTasksChecked:future.length,affectedMealsChecked:meals.length,
    individualDomainChecks:0,individualZeroDomainPrunes:0,jointTaskMealChecks:0,jointTaskMealPrunes:0,
    collectiveChecks:0,collectivePrunes:0,compatiblePairChecks:0,analyticChecks:0,branchesConsumed:0 as const,
    reasonCode:null,futureTaskId:null,mealTaskId:null,participantId:null,futureTaskCandidateCount:0,mealCandidateCount:0,compatiblePairCount:0 as const};
  if(future.length===0)return {...base,status:"PASS" as const};
  const futureIds=new Set(future.map(task=>task.id));
  const unresolved=future.filter(task=>unresolvedDependencies(task,placed,futureIds));
  const unresolvedIds=new Set(unresolved.map(task=>task.id));
  let individual=0,joint=0,pairChecks=0,analytic=0;
  for(const task of future){
    if(unresolvedIds.has(task.id)){individual++;analytic++;continue;}
    const taskDomain=exactTaskStartDomain(problem,task,[...placed]); individual++; analytic++;
    if(taskDomain.eligibleStartCount===0)return {...base,status:"PRUNE" as const,individualDomainChecks:individual,
      individualZeroDomainPrunes:1,analyticChecks:analytic,reasonCode:"FUTURE_PARTICIPANT_TASK_ZERO_DOMAIN" as const,
      futureTaskId:task.id,participantId:task.participantId??null};
    for(const meal of meals.filter(candidate=>candidate.participantId===task.participantId)){
      const mealDomain=analyticParticipantMealDomain(problem,meal,placed); individual++; joint++; pairChecks++; analytic+=2;
      if(mealDomain.validStarts===0)continue; // Existing meal probe owns individual meal zero-domain evidence.
      const taskFirst=firstStart(problem,taskDomain)!,taskLast=lastStart(problem,taskDomain)!;
      const mealFirst=firstMeal(mealDomain)!,mealLast=lastMeal(mealDomain)!;
      const taskBeforeMeal=taskFirst+task.duration<=mealLast;
      const mealBeforeTask=mealFirst+meal.duration<=taskLast;
      const dependencyRequiresTaskFirst=(meal.dependencies??[]).includes(task.id);
      const dependencyRequiresMealFirst=task.dependencies.includes(meal.sourceTaskId);
      const compatible=dependencyRequiresTaskFirst?taskBeforeMeal:dependencyRequiresMealFirst?mealBeforeTask:(taskBeforeMeal||mealBeforeTask);
      if(!compatible)return {...base,status:"PRUNE" as const,individualDomainChecks:individual,jointTaskMealChecks:joint,
        jointTaskMealPrunes:1,compatiblePairChecks:pairChecks,analyticChecks:analytic,
        reasonCode:"FUTURE_PARTICIPANT_TASK_MEAL_INCOMPATIBLE" as const,futureTaskId:task.id,mealTaskId:meal.sourceTaskId,
        participantId:task.participantId??null,futureTaskCandidateCount:taskDomain.eligibleStartCount,
        mealCandidateCount:mealDomain.validStarts,compatiblePairCount:0};
    }
  }
  const interactingPair=future.flatMap((task,index)=>future.slice(index+1).map(other=>[task,other] as const))
    .find(([left,right])=>shareHardAuthority(left,right));
  const inconclusive=unresolved[0]??interactingPair?.[0];
  return {...base,status:inconclusive?"ABSTAIN" as const:"PASS" as const,individualDomainChecks:individual,jointTaskMealChecks:joint,
    compatiblePairChecks:pairChecks,analyticChecks:analytic,compatiblePairCount:pairChecks>0?1:0,
    ...(inconclusive?{reasonCode:"FUTURE_PARTICIPANT_RESERVATION_INCONCLUSIVE" as const,futureTaskId:inconclusive.id,
      participantId:inconclusive.participantId??null}:{})};
}
