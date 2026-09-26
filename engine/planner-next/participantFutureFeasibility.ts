import type { ParticipantMealObligation, PlannerNextProblem, ScheduledParticipantMeal, ScheduledTask, Task } from "./contracts";
import { exactTaskStartDomain, type ExactTaskStartDomain } from "./placement";
import { analyticParticipantMealDomain, participantMealCandidates, type AnalyticParticipantMealStartDomain } from "./participantMeals";

export type ParticipantFutureReservationStatus = "PASS" | "PRUNE" | "ABSTAIN";
export interface ParticipantFutureCollectiveDiagnostic {
  readonly participantId:string;readonly futureTaskCount:number;readonly mealCount:number;
  readonly obligationIds:readonly string[];readonly dependencyEdges:readonly {from:string;to:string}[];
  readonly initialDomainSizes:Readonly<Record<string,number>>;readonly branchesConsumed:number;
  readonly fixedPlacements:readonly {id:string;start:number;end:number;spaceId:string}[];
  readonly statesVisited:number;readonly uniqueStates:number;readonly repeatedStates:number;readonly maximumDepth:number;
  readonly backtracks:number;readonly firstRepeatedState:string|null;readonly result:ParticipantFutureReservationStatus;
}
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
  readonly unresolvedDependencyIds: readonly string[];
  readonly abstainCause: "BUDGET_EXHAUSTED" | "INCONCLUSIVE_SHAPE" | null;
  readonly reasonCode: "FUTURE_PARTICIPANT_TASK_ZERO_DOMAIN" | "FUTURE_PARTICIPANT_TASK_MEAL_INCOMPATIBLE" | "FUTURE_PARTICIPANT_COLLECTIVE_INFEASIBLE" | "FUTURE_PARTICIPANT_RESERVATION_INCONCLUSIVE" | null;
  readonly futureTaskId: string | null;
  readonly mealTaskId: string | null;
  readonly participantId: string | null;
  readonly futureTaskCandidateCount: number;
  readonly mealCandidateCount: number;
  readonly compatiblePairCount: 0 | 1;
  readonly participantDiagnostics:readonly ParticipantFutureCollectiveDiagnostic[];
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
  abstainCause:"BUDGET_EXHAUSTED"|"INCONCLUSIVE_SHAPE"|null;statesVisited:number;uniqueStates:number;repeatedStates:number;
  maximumDepth:number;backtracks:number;firstRepeatedState:string|null};

const emptyCollective=(status:"PRUNE"|"ABSTAIN",domainSizes:Record<string,number>,abstainCause:"INCONCLUSIVE_SHAPE"|null):CollectiveResult=>
  ({status,branches:0,domainSizes,witness:false,abstainCause,statesVisited:0,uniqueStates:0,repeatedStates:0,maximumDepth:0,backtracks:0,firstRepeatedState:null});

/** Exact participant-local witness. Candidate generation delegates to the canonical task and meal authorities. */
function collectiveWitness(problem:PlannerNextProblem,_participantId:string,tasks:readonly Task[],meals:readonly ParticipantMealObligation[],
  fixed:readonly ScheduledTask[],budget?:ParticipantFutureReservationBudget,mode:ParticipantFutureReservationMode="EXACT"):CollectiveResult {
  const taskIds=new Set(tasks.map(task=>task.id)),mealIds=new Set(meals.map(meal=>meal.sourceTaskId));
  const knownFixed=new Set(fixed.map(task=>task.id));
  const participant=problem.participants.find(({id})=>id===_participantId);
  const fixedOwn=fixed.filter(task=>task.participantId===_participantId);
  const dependencies=[...tasks.flatMap(task=>task.dependencies),...meals.flatMap(meal=>meal.dependencies??[])];
  if(dependencies.some(id=>!taskIds.has(id)&&!mealIds.has(id)&&!knownFixed.has(id)))return emptyCollective("ABSTAIN",{},"INCONCLUSIVE_SHAPE");
  let branches=0,exhausted=false,statesVisited=0,repeatedStates=0,maximumDepth=0,backtracks=0,firstRepeatedState:string|null=null;
  const domainSizes:Record<string,number>={},deadStates=new Set<string>(),seenStates=new Set<string>();
  const earliest=new Map<string,number>(),latest=new Map<string,number>(),duration=new Map<string,number>();
  const envelopes:{start:number;end:number;duration:number}[]=[];
  for(const task of tasks){const domain=exactTaskStartDomain(problem,task,[...fixed]);domainSizes[task.id]=domain.eligibleStartCount;
    if(domain.eligibleStartCount===0)return emptyCollective("PRUNE",domainSizes,null);
    earliest.set(task.id,firstStart(problem,domain)!);latest.set(task.id,lastStart(problem,domain)!);duration.set(task.id,task.duration);
    envelopes.push({start:firstStart(problem,domain)!,end:lastStart(problem,domain)!+task.duration,duration:task.duration});}
  for(const meal of meals){const domain=analyticParticipantMealDomain(problem,meal,fixed);domainSizes[meal.sourceTaskId]=domain.validStarts;
    if(domain.validStarts===0)return emptyCollective("PRUNE",domainSizes,null);
    earliest.set(meal.sourceTaskId,firstMeal(domain)!);latest.set(meal.sourceTaskId,lastMeal(domain)!);duration.set(meal.sourceTaskId,meal.duration);
    envelopes.push({start:firstMeal(domain)!,end:lastMeal(domain)!+meal.duration,duration:meal.duration});}
  const endpoints=[...new Set(envelopes.flatMap(item=>[item.start,item.end]))].sort((a,b)=>a-b);
  for(let left=0;left<endpoints.length;left++)for(let right=left+1;right<endpoints.length;right++){
    const start=endpoints[left]!,end=endpoints[right]!,required=envelopes.filter(item=>item.start>=start&&item.end<=end)
      .reduce((sum,item)=>sum+item.duration,0);
    const available=(participant?.availability??[]).reduce((sum,window)=>sum+Math.max(0,Math.min(end,window.end)-Math.max(start,window.start)),0);
    const occupied=fixedOwn.reduce((sum,item)=>sum+Math.max(0,Math.min(end,item.end)-Math.max(start,item.start)),0);
    if(required>available-occupied)return emptyCollective("PRUNE",domainSizes,null);
  }
  if(mode==="ANALYTIC_ONLY")return emptyCollective("ABSTAIN",domainSizes,"INCONCLUSIVE_SHAPE");
  const localDependencies=[...tasks.map(task=>[task.id,task.dependencies] as const),...meals.map(meal=>[meal.sourceTaskId,meal.dependencies??[]] as const)];
  const localTasks=new Map(tasks.map(task=>[task.id,task]));
  const precedenceLag=(dependencyId:string,dependentId:string)=>duration.get(dependencyId)!+
    (localTasks.has(dependencyId)&&localTasks.has(dependentId)&&localTasks.get(dependencyId)!.spaceId!==localTasks.get(dependentId)!.spaceId
      ?problem.participantTransitionMinutes:0);
  let boundsChanged=true,boundsRounds=0;
  while(boundsChanged&&boundsRounds++<=localDependencies.length){boundsChanged=false;for(const [dependentId,dependencyIds] of localDependencies)for(const dependencyId of dependencyIds){
    if(!earliest.has(dependencyId))continue;
    const lag=precedenceLag(dependencyId,dependentId);
    const dependentEarliest=Math.max(earliest.get(dependentId)!,earliest.get(dependencyId)!+lag);
    const dependencyLatest=Math.min(latest.get(dependencyId)!,latest.get(dependentId)!-lag);
    if(dependentEarliest!==earliest.get(dependentId)){earliest.set(dependentId,dependentEarliest);boundsChanged=true;}
    if(dependencyLatest!==latest.get(dependencyId)){latest.set(dependencyId,dependencyLatest);boundsChanged=true;}
  }}
  if(boundsChanged||[...earliest].some(([id,start])=>start>latest.get(id)!))return emptyCollective("PRUNE",domainSizes,null);
  const propagatedEnvelopes=[...earliest].map(([id,start])=>({start,end:latest.get(id)!+duration.get(id)!,duration:duration.get(id)!}));
  const propagatedEndpoints=[...new Set(propagatedEnvelopes.flatMap(item=>[item.start,item.end]))].sort((a,b)=>a-b);
  for(let left=0;left<propagatedEndpoints.length;left++)for(let right=left+1;right<propagatedEndpoints.length;right++){
    const start=propagatedEndpoints[left]!,end=propagatedEndpoints[right]!;
    const required=propagatedEnvelopes.filter(item=>item.start>=start&&item.end<=end).reduce((sum,item)=>sum+item.duration,0);
    const available=(participant?.availability??[]).reduce((sum,window)=>sum+Math.max(0,Math.min(end,window.end)-Math.max(start,window.start)),0);
    const occupied=fixedOwn.reduce((sum,item)=>sum+Math.max(0,Math.min(end,item.end)-Math.max(start,item.start)),0);
    if(required>available-occupied)return emptyCollective("PRUNE",domainSizes,null);
  }
  const enterState=(key:string,depth:number):"ENTER"|"CACHED"|"EXHAUSTED"=>{
    if(seenStates.has(key)){repeatedStates++;firstRepeatedState??=key;if(deadStates.has(key))return "CACHED";}
    else seenStates.add(key);
    if(depth>0){if(budget&&!budget.consume()){exhausted=true;return "EXHAUSTED";}branches++;}
    return "ENTER";
  };
  const visit=(pendingTasks:readonly Task[],pendingMeals:readonly ParticipantMealObligation[],scheduledTasks:ScheduledTask[],scheduledMeals:ScheduledParticipantMeal[]):boolean=>{
    statesVisited++;const depth=tasks.length+meals.length-pendingTasks.length-pendingMeals.length;maximumDepth=Math.max(maximumDepth,depth);
    if(pendingTasks.length===0&&pendingMeals.length===0)return enterState("COMPLETE",depth)==="ENTER";
    const placedIds=new Set(scheduledTasks.map(task=>task.id)),placedMealIds=new Set(scheduledMeals.map(meal=>meal.sourceTaskId));
    const taskStarts=new Map<string,number[]>(),mealStarts=new Map<string,ScheduledParticipantMeal[]>();
    const pendingIds=new Set([...pendingTasks.map(item=>item.id),...pendingMeals.map(item=>item.sourceTaskId)]);
    const dynamicEarliest=new Map([...earliest].filter(([id])=>pendingIds.has(id))),dynamicLatest=new Map([...latest].filter(([id])=>pendingIds.has(id)));
    for(const task of pendingTasks){const starts=[...exactTaskStartDomain(problem,task,scheduledTasks).starts()].filter(start=>
      scheduledMeals.every(meal=>meal.participantId!==task.participantId||start+task.duration<=meal.start||meal.end<=start));
      if(starts.length===0){const zeroKey=JSON.stringify([pendingTasks.map(item=>item.id).sort(),pendingMeals.map(item=>item.sourceTaskId).sort(),"ZERO_TASK",task.id]);
        const entered=enterState(zeroKey,depth);if(entered==="ENTER")deadStates.add(zeroKey);return false;}taskStarts.set(task.id,starts);
      dynamicEarliest.set(task.id,Math.max(dynamicEarliest.get(task.id)!,starts[0]!));dynamicLatest.set(task.id,Math.min(dynamicLatest.get(task.id)!,starts.at(-1)!));}
    for(const meal of pendingMeals){const candidates=participantMealCandidates(problem,meal,scheduledTasks,scheduledMeals);
      if(candidates.length===0){const zeroKey=JSON.stringify([pendingTasks.map(item=>item.id).sort(),pendingMeals.map(item=>item.sourceTaskId).sort(),"ZERO_MEAL",meal.sourceTaskId]);
        const entered=enterState(zeroKey,depth);if(entered==="ENTER")deadStates.add(zeroKey);return false;}mealStarts.set(meal.sourceTaskId,candidates);
      dynamicEarliest.set(meal.sourceTaskId,Math.max(dynamicEarliest.get(meal.sourceTaskId)!,candidates[0]!.start));
      dynamicLatest.set(meal.sourceTaskId,Math.min(dynamicLatest.get(meal.sourceTaskId)!,candidates.at(-1)!.start));}
    let dynamicChanged=true,dynamicRounds=0;
    while(dynamicChanged&&dynamicRounds++<=pendingTasks.length+pendingMeals.length){dynamicChanged=false;
      for(const [dependentId,dependencyIds] of localDependencies)if(dynamicEarliest.has(dependentId))for(const dependencyId of dependencyIds){
        if(!dynamicEarliest.has(dependencyId)||placedIds.has(dependencyId)||placedMealIds.has(dependencyId))continue;
        const lag=precedenceLag(dependencyId,dependentId);
        const dependentEarliest=Math.max(dynamicEarliest.get(dependentId)!,dynamicEarliest.get(dependencyId)!+lag);
        const dependencyLatest=Math.min(dynamicLatest.get(dependencyId)!,dynamicLatest.get(dependentId)!-lag);
        if(dependentEarliest!==dynamicEarliest.get(dependentId)){dynamicEarliest.set(dependentId,dependentEarliest);dynamicChanged=true;}
        if(dependencyLatest!==dynamicLatest.get(dependencyId)){dynamicLatest.set(dependencyId,dependencyLatest);dynamicChanged=true;}
      }}
    if(dynamicChanged||[...dynamicEarliest].some(([id,start])=>start>dynamicLatest.get(id)!)){
      const zeroKey=JSON.stringify([pendingTasks.map(item=>item.id).sort(),pendingMeals.map(item=>item.sourceTaskId).sort(),"DAG_BOUNDS"]);
      const entered=enterState(zeroKey,depth);if(entered==="ENTER")deadStates.add(zeroKey);return false;}
    // Completed history is irrelevant once it induces the same exact canonical domains for every
    // remaining obligation.  Pending ids retain dependency state; domains retain all interval,
    // transition, resource, meal and fixed-placement effects.
    const key=JSON.stringify([pendingTasks.map(item=>item.id).sort(),pendingMeals.map(item=>item.sourceTaskId).sort(),
      [...taskStarts].map(([id,starts])=>[id,starts]).sort(),
      [...mealStarts].map(([id,candidates])=>[id,candidates.map(item=>[item.start,item.end])]).sort()]);
    const entered=enterState(key,depth);if(entered!=="ENTER")return false;
    const readyTasks=pendingTasks.filter(task=>task.dependencies.every(id=>placedIds.has(id)||placedMealIds.has(id)));
    const readyMeals=pendingMeals.filter(meal=>(meal.dependencies??[]).every(id=>placedIds.has(id)||placedMealIds.has(id)));
    const cursor=Math.max(-Infinity,...scheduledTasks.filter(item=>taskIds.has(item.id)).map(item=>item.end),...scheduledMeals.map(item=>item.end));
    const choices:[string,"TASK"|"MEAL",Task|ParticipantMealObligation,number|ScheduledParticipantMeal][]=[];
    for(const task of readyTasks){
      const afterMeals=Math.max(-Infinity,...task.dependencies.map(id=>scheduledMeals.find(meal=>meal.sourceTaskId===id)?.end??-Infinity));
      const starts=taskStarts.get(task.id)!.filter(start=>start>=afterMeals
        &&start>=cursor&&start>=dynamicEarliest.get(task.id)!&&start<=dynamicLatest.get(task.id)!);
      domainSizes[task.id]=Math.max(domainSizes[task.id]??0,starts.length);for(const start of starts)choices.push([task.id,"TASK",task,start]);
    }
    for(const meal of readyMeals){const candidates=mealStarts.get(meal.sourceTaskId)!
      .filter(candidate=>candidate.start>=cursor&&candidate.start>=dynamicEarliest.get(meal.sourceTaskId)!&&candidate.start<=dynamicLatest.get(meal.sourceTaskId)!);
      domainSizes[meal.sourceTaskId]=Math.max(domainSizes[meal.sourceTaskId]??0,candidates.length);for(const candidate of candidates)choices.push([meal.sourceTaskId,"MEAL",meal,candidate]);}
    choices.sort((a,b)=>{const aStart=typeof a[3]==="number"?a[3]:a[3].start,bStart=typeof b[3]==="number"?b[3]:b[3].start;
      return dynamicLatest.get(a[0])!-dynamicLatest.get(b[0])!||aStart-bStart||a[0].localeCompare(b[0]);});
    if(choices.length===0){deadStates.add(key);return false;}
    for(const selected of choices){const candidate=selected[3];
      if(selected[1]==="TASK"){
        const task=selected[2] as Task,start=candidate as number;
        const scheduled:ScheduledTask={...task,start,end:start+task.duration};
        if(visit(pendingTasks.filter(item=>item.id!==task.id),pendingMeals,[...scheduledTasks,scheduled],scheduledMeals))return true;
      }else{
        const meal=selected[2] as ParticipantMealObligation;
        if(visit(pendingTasks,pendingMeals.filter(item=>item.sourceTaskId!==meal.sourceTaskId),scheduledTasks,[...scheduledMeals,candidate as ScheduledParticipantMeal]))return true;
      }
      backtracks++;
    }
    if(!exhausted)deadStates.add(key);
    return false;
  };
  const witness=visit(tasks,meals,[...fixed],[]);
  return {status:witness?"PASS":exhausted?"ABSTAIN":"PRUNE",branches,domainSizes,witness,
    abstainCause:exhausted?"BUDGET_EXHAUSTED":null,statesVisited,uniqueStates:seenStates.size,repeatedStates,maximumDepth,backtracks,firstRepeatedState};
}

/** Sound read-only reservation for out-of-scope participant work. */
export function probeParticipantFutureReservations(problem:PlannerNextProblem,placed:readonly ScheduledTask[],added:readonly ScheduledTask[],budget?:ParticipantFutureReservationBudget,
  mode:ParticipantFutureReservationMode="EXACT"):ParticipantFutureReservationProbe {
  placed=normalizeParticipantFuturePlacements(placed);
  const affectedParticipants=[...new Set(added.flatMap(task=>task.participantId?[task.participantId]:[]))].sort();
  const analytical=[...(problem.analyticalFutureParticipantTasks??[])];
  const analyticalIds=new Set(analytical.map(task=>task.id));
  for(const dependencyId of problem.analyticalFutureParticipantSupportingTaskIds??[]){
    const dependency=problem.tasks.find(task=>task.id===dependencyId);
    if(dependency&&!analyticalIds.has(dependencyId)){analytical.push(dependency);analyticalIds.add(dependencyId);}
  }
  const futureIds=new Set(analytical.filter(task=>affectedBy(task,added)).map(task=>task.id));
  let closureChanged=true;
  while(closureChanged){closureChanged=false;for(const task of analytical)if(!futureIds.has(task.id)
    &&analytical.some(dependent=>futureIds.has(dependent.id)&&dependent.dependencies.includes(task.id))){
    futureIds.add(task.id);closureChanged=true;
  }}
  const placedIdsAtEntry=new Set(placed.map(task=>task.id));
  const future=analytical.filter(task=>futureIds.has(task.id)&&!placedIdsAtEntry.has(task.id)).sort((a,b)=>a.id.localeCompare(b.id));
  const meals=[...(problem.participantMeals??[])].filter(meal=>remainingMeal(meal)&&affectedParticipants.includes(meal.participantId)).sort((a,b)=>a.sourceTaskId.localeCompare(b.sourceTaskId));
  const base={affectedParticipants,affectedFutureTasksChecked:future.length,affectedMealsChecked:meals.length,individualDomainChecks:0,
    individualZeroDomainPrunes:0,jointTaskMealChecks:0,jointTaskMealPrunes:0,collectiveChecks:0,collectivePasses:0,collectivePrunes:0,
    collectiveObligationIds:[] as string[],collectiveDomainSizes:{} as Record<string,number>,collectiveWitnessFound:false,
    compatiblePairChecks:0,analyticChecks:0,branchesConsumed:0,unresolvedDependencyIds:[] as string[],abstainCause:null,reasonCode:null,futureTaskId:null,mealTaskId:null,participantId:null,
    futureTaskCandidateCount:0,mealCandidateCount:0,compatiblePairCount:0 as const,participantDiagnostics:[] as ParticipantFutureCollectiveDiagnostic[]};
  if(future.length===0)return {...base,status:"PASS" as const};
  const remainingFutureIds=new Set(future.map(task=>task.id)),mealIds=new Set(meals.map(meal=>meal.sourceTaskId)),placedIds=new Set(placed.map(task=>task.id));
  const unresolvedDependencyIds=[...new Set(future.flatMap(task=>task.dependencies)
    .filter(id=>!placedIds.has(id)&&!remainingFutureIds.has(id)&&!mealIds.has(id)))].sort();
  const unresolved=future.filter(task=>task.dependencies.some(id=>unresolvedDependencyIds.includes(id)));
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
    unresolvedDependencyIds,abstainCause:"INCONCLUSIVE_SHAPE" as const,
    reasonCode:"FUTURE_PARTICIPANT_RESERVATION_INCONCLUSIVE" as const,futureTaskId:unresolved[0]!.id,participantId:unresolved[0]!.participantId??null};
  let collectiveChecks=0,collectivePasses=0,branchesConsumed=0;const collectiveObligationIds:string[]=[];
  const collectiveDomainSizes:Record<string,number>={};
  const participantDiagnostics:ParticipantFutureCollectiveDiagnostic[]=[];
  for(const participantId of affectedParticipants){
    const participantTasks=future.filter(task=>task.participantId===participantId),participantMeals=meals.filter(meal=>meal.participantId===participantId);
    if(participantTasks.length+participantMeals.length<2)continue;
    const result=collectiveWitness(problem,participantId,participantTasks,participantMeals,placed,budget,mode);collectiveChecks++;branchesConsumed+=result.branches;
    const obligationIds=[...participantTasks.map(task=>task.id),...participantMeals.map(meal=>meal.sourceTaskId)].sort();
    collectiveObligationIds.push(...obligationIds);Object.assign(collectiveDomainSizes,result.domainSizes);
    participantDiagnostics.push({participantId,futureTaskCount:participantTasks.length,mealCount:participantMeals.length,obligationIds,
      dependencyEdges:[...participantTasks.flatMap(task=>task.dependencies.map(from=>({from,to:task.id}))),
        ...participantMeals.flatMap(meal=>(meal.dependencies??[]).map(from=>({from,to:meal.sourceTaskId})))].sort((a,b)=>a.to.localeCompare(b.to)||a.from.localeCompare(b.from)),
      initialDomainSizes:{...result.domainSizes},fixedPlacements:placed.filter(item=>item.participantId===participantId)
        .map(({id,start,end,spaceId})=>({id,start,end,spaceId})).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id)),
      branchesConsumed:result.branches,statesVisited:result.statesVisited,uniqueStates:result.uniqueStates,
      repeatedStates:result.repeatedStates,maximumDepth:result.maximumDepth,backtracks:result.backtracks,firstRepeatedState:result.firstRepeatedState,result:result.status});
    const common={...base,individualDomainChecks:individual,jointTaskMealChecks:joint,compatiblePairChecks:pairChecks,analyticChecks:analytic,
      compatiblePairCount:(pairChecks>0?1:0) as 0|1,collectiveChecks,collectivePasses,
      collectivePrunes:Number(result.status==="PRUNE"),collectiveObligationIds:[...collectiveObligationIds].sort(),collectiveDomainSizes,
      collectiveWitnessFound:result.witness,branchesConsumed,participantId,abstainCause:result.abstainCause,participantDiagnostics:[...participantDiagnostics]};
    if(result.status==="PRUNE")return {...common,status:"PRUNE" as const,reasonCode:"FUTURE_PARTICIPANT_COLLECTIVE_INFEASIBLE" as const};
    if(result.status==="ABSTAIN")return {...common,status:"ABSTAIN" as const,reasonCode:"FUTURE_PARTICIPANT_RESERVATION_INCONCLUSIVE" as const};
    collectivePasses++;
  }
  return {...base,status:"PASS" as const,individualDomainChecks:individual,jointTaskMealChecks:joint,compatiblePairChecks:pairChecks,
    analyticChecks:analytic,compatiblePairCount:pairChecks>0?1:0,collectiveChecks,collectivePasses,collectivePrunes:0,
    collectiveObligationIds:[...collectiveObligationIds].sort(),collectiveDomainSizes,collectiveWitnessFound:collectiveChecks>0,branchesConsumed,participantDiagnostics};
}
