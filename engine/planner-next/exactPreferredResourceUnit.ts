import type { OperationalMealPolicy, PlannerNextProblem, ScheduledOperationalMeal, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { incrementallyRepairMatchingWitness, type ExactSearchLedger } from "./exactMainAndFeederCore";
import { generateExactSetupBlockCandidates } from "./exactSetupBlocks";
import { probeParticipantFutureReservations } from "./participantFutureFeasibility";
import { probeParticipantMealFutureFeasibility } from "./participantMeals";
import { canPlaceTask } from "./placement";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { evaluateResourcePresence } from "./resourcePresence";
import { operationalMealCandidates } from "./operationalMeals";
import { overlaps } from "./time";

export interface ExactPreferredResourceUnitCandidate {
  readonly tasks: readonly ScheduledTask[];
  readonly preparations: readonly ScheduledSetupPreparation[];
  readonly presence: readonly [blocks:number, span:number, idle:number];
  readonly operationalMealReservations: readonly ScheduledOperationalMeal[];
}

export type ExactPreferredResourceUnitOutcome="FOUND"|"DEAD_END"|"BUDGET_EXHAUSTED";
export interface ExactPreferredResourceUnitContinuationResult {
  outcome:ExactPreferredResourceUnitOutcome;
  /** True only when the complete candidate reached participant Future EXACT and it pruned. */
  participantFutureExactPrune?:boolean;
  /** True only when the continuation was pruned by participant-meal future feasibility. */
  participantMealPrune?:boolean;
  terminalFutureResult?:"PASS"|"PRUNE"|"ABSTAIN"|"NOT_CHECKED";
}
export interface ExactPreferredResourceUnitEvidence {
  geometryCount:number;matchingSuccesses:number;rawCompatibleEdges:number;futureEdgeChecks:number;
  analyticPrunedEdges:number;matchingAttempts:number;matchingTraversals:number;causalForbiddenEdges:number;
  mealEdgeChecks:number;mealPrunedEdges:number;
  mealAwareGeometries:number;mealReservationVariants:number;selectedOperationalMealReservations:ScheduledOperationalMeal[];
  firstMealPrunedEdge:{taskId:string;spotId:string;start:number;blockingMealTaskId:string|null}|null;
  blockingMealTaskId:string|null;
  incrementalRepairs:number;geometriesRescuedByRematching:number;
  firstMatchingWitness:Record<string,string>|null;selectedMatchingWitness:Record<string,string>|null;
  terminalFutureResult:"PASS"|"PRUNE"|"ABSTAIN"|"NOT_CHECKED";
}
export interface ExactPreferredResourceUnitAuthorities {
  /** Test seam; production always uses the canonical participant-future authority. */
  participantFutureProbe?:typeof probeParticipantFutureReservations;
  participantMealProbe?:typeof probeParticipantMealFutureFeasibility;
}

/** Builds each setup geometry once, then incrementally repairs only matching edges
 * that participant Future Feasibility proves individually infeasible. */
export function exploreExactPreferredResourceUnit(args:{
  problem:PlannerNextProblem;resourceId:string;resourceTasks:readonly Task[];setupTasks:readonly Task[];
  placed:readonly ScheduledTask[];preparations:readonly ScheduledSetupPreparation[];
  meals:readonly ScheduledSpaceMeal[];ledger:ExactSearchLedger;
  continuation:(candidate:ExactPreferredResourceUnitCandidate)=>ExactPreferredResourceUnitContinuationResult;
  authorities?:ExactPreferredResourceUnitAuthorities;
}):{outcome:ExactPreferredResourceUnitOutcome;evidence:ExactPreferredResourceUnitEvidence}{
  const {problem,resourceId,resourceTasks,setupTasks,placed,preparations,meals,ledger,continuation}=args;
  const participantFutureProbe=args.authorities?.participantFutureProbe??probeParticipantFutureReservations;
  const participantMealProbe=args.authorities?.participantMealProbe??probeParticipantMealFutureFeasibility;
  const evidence:ExactPreferredResourceUnitEvidence={geometryCount:0,matchingSuccesses:0,rawCompatibleEdges:0,
    futureEdgeChecks:0,analyticPrunedEdges:0,matchingAttempts:0,matchingTraversals:0,causalForbiddenEdges:0,
    mealEdgeChecks:0,mealPrunedEdges:0,mealAwareGeometries:0,mealReservationVariants:0,selectedOperationalMealReservations:[],firstMealPrunedEdge:null,blockingMealTaskId:null,
    incrementalRepairs:0,geometriesRescuedByRematching:0,firstMatchingWitness:null,selectedMatchingWitness:null,
    terminalFutureResult:"NOT_CHECKED"};
  const mutableMeals=[...meals];
  const setup=generateExactSetupBlockCandidates(problem,[...setupTasks],[...placed],[...preparations],mutableMeals,ledger);
  const duration=resourceTasks.reduce((sum,task)=>sum+task.duration,0);
  const taskById=new Map(resourceTasks.map(task=>[task.id,task]));
  const taskIds=[...taskById.keys()].sort();
  const mealApplicable=(problem.participantMeals?.length??0)>0;
  const analyticEdgeCache=new Map<string,"PASS"|"PRUNE"|"ABSTAIN">();
  const mealEdgeCache=new Map<string,{feasible:boolean;blockingMealTaskId:string|null}>();
  const effectiveResourceIds=(task:Task):string[]=>task.coachId===undefined?[...(task.requiredResourceIds??[])]:[...(task.requiredResourceIds??[]),task.coachId];
  const unitTasks=[...resourceTasks,...setupTasks];
  const operationalPolicies=[...(problem.operationalMealPolicies??[])].filter(policy=>unitTasks.some(task=>
    policy.spaceIds.includes(task.spaceId)||effectiveResourceIds(task).some(id=>policy.resourceIds.includes(id)))).sort((a,b)=>a.id.localeCompare(b.id));
  const conflicts=(task:ScheduledTask,policy:OperationalMealPolicy,meal:ScheduledOperationalMeal)=>
    (policy.spaceIds.includes(task.spaceId)||effectiveResourceIds(task).some(id=>policy.resourceIds.includes(id)))&&overlaps(task,meal);
  for(const structural of setup.candidates){
    const occupations=[...structural.tasks,...structural.preparations];
    const first=Math.min(...occupations.map(item=>item.start)),last=Math.max(...occupations.map(item=>item.end));
    type Geometry={start:number;reservations:ScheduledOperationalMeal[];offsets:number[]};
    const geometries:Geometry[]=[];
    for(const orientation of ["BEFORE","AFTER"] as const){
      const naturalBoundary=orientation==="BEFORE"?resourceTasks.length:0;
      const assignments:number[][]=[];
      const visit=(index:number,current:number[])=>{if(index===operationalPolicies.length){assignments.push([...current]);return;}
        const boundaries=[naturalBoundary,...Array.from({length:Math.max(0,resourceTasks.length-1)},(_,i)=>i+1),
          ...Array.from({length:resourceTasks.length+1},(_,i)=>i)].filter((value,i,array)=>array.indexOf(value)===i);
        for(const boundary of boundaries)visit(index+1,[...current,boundary]);};
      visit(0,[]);
      for(const boundaries of assignments){
        const mealMinutes=operationalPolicies.reduce((sum,policy)=>sum+policy.duration,0);
        const anchoredStart=orientation==="BEFORE"?first-duration-mealMinutes:last;
        const candidateStarts=[anchoredStart,...Array.from({length:Math.max(0,Math.floor((problem.day.end-problem.day.start)/5)+1)},(_,i)=>problem.day.start+i*5)]
          .filter((value,i,array)=>array.indexOf(value)===i);
        for(const start of candidateStarts){let cursor=start;const offsets:number[]=[];const reservations:ScheduledOperationalMeal[]=[];let valid=true;
          for(let boundary=0;boundary<=resourceTasks.length;boundary+=1){
            for(const [policyIndex,policy] of operationalPolicies.entries().filter(([i])=>boundaries[i]===boundary)){
              const candidate=operationalMealCandidates(problem,policy,[...placed,...structural.tasks],reservations).find(item=>item.start===cursor);
              if(!candidate){valid=false;break;}reservations.push(candidate);cursor=candidate.end;
            }
            if(!valid)break;if(boundary<resourceTasks.length){offsets.push(cursor-start);cursor+=resourceTasks[boundary]!.duration;}
          }
          if(!valid)continue;
          // Preserve the original structural adjacency for the first class of candidates.
          if(start===anchoredStart&&((orientation==="BEFORE"&&cursor!==first)||(orientation==="AFTER"&&start!==last)))continue;
          geometries.push({start,reservations,offsets});
        }
      }
    }
    if(!operationalPolicies.length)geometries.push({start:first-duration,reservations:[],offsets:resourceTasks.map((_,i)=>resourceTasks.slice(0,i).reduce((s,t)=>s+t.duration,0))},
      {start:last,reservations:[],offsets:resourceTasks.map((_,i)=>resourceTasks.slice(0,i).reduce((s,t)=>s+t.duration,0))});
    const uniqueGeometries=[...new Map(geometries.map(item=>[`${item.start}|${item.offsets.join(",")}|${item.reservations.map(x=>`${x.id}@${x.start}`).join(",")}`,item])).values()];
    for(const geometry of uniqueGeometries){const {start,reservations}=geometry;
      evidence.geometryCount+=1;
      evidence.mealReservationVariants+=reservations.length>0?1:0;
      const slots=resourceTasks.map((_,index)=>`spot:${index}`);
      const spotStart=(position:number)=>start+geometry.offsets[position]!;
      const validPositions=new Map<string,number[]>();
      const base=[...placed,...structural.tasks];
      const baseKey=base.map(task=>`${task.id}@${task.start}-${task.end}`).sort().join("|");
      for(const taskId of taskIds){const task=taskById.get(taskId)!,positions:number[]=[];
        for(let position=0;position<slots.length;position+=1){const at=spotStart(position);
          if(!canPlaceTask(problem,task,at,base,mutableMeals))continue;
          evidence.rawCompatibleEdges+=1;evidence.futureEdgeChecks+=1;
          const scheduled=scoreAuxiliaryTask(problem,task,at,base).scheduled;
          if(reservations.some(meal=>{const policy=operationalPolicies.find(item=>item.id===meal.id);return policy?conflicts(scheduled,policy,meal):false;}))continue;
          const edgeKey=`${task.id}@${task.spaceId}:${at}`;
          const futureKey=`${baseKey}|${edgeKey}`;
          let futureStatus=analyticEdgeCache.get(futureKey);
          if(futureStatus===undefined){futureStatus=participantFutureProbe(problem,[...base,scheduled],[scheduled],undefined,"ANALYTIC_ONLY").status;
            analyticEdgeCache.set(futureKey,futureStatus);}
          let mealResult={feasible:true,blockingMealTaskId:null as string|null};
          if(mealApplicable){evidence.mealEdgeChecks+=1;
            const mealKey=`${baseKey}|${edgeKey}`,cached=mealEdgeCache.get(mealKey);
            if(cached)mealResult=cached;else{const probe=participantMealProbe(problem,[...base,scheduled],[scheduled]);
              mealResult={feasible:probe.feasible,blockingMealTaskId:probe.blockingMealTaskIds[0]??null};mealEdgeCache.set(mealKey,mealResult);}}
          if(!mealResult.feasible){evidence.mealPrunedEdges+=1;evidence.blockingMealTaskId??=mealResult.blockingMealTaskId;
            evidence.firstMealPrunedEdge??={taskId:task.id,spotId:slots[position]!,start:at,blockingMealTaskId:mealResult.blockingMealTaskId};}
          if(futureStatus==="PRUNE"){evidence.analyticPrunedEdges+=1;continue;}
          if(!mealResult.feasible)continue;
          positions.push(position);
        }
        validPositions.set(taskId,positions);
      }
      let forbidden=new Set<string>(),previousForbidden=new Set<string>(),previous=new Map<string,number>();
      let repaired=false;
      while(true){
        evidence.matchingAttempts+=1;
        const result=incrementallyRepairMatchingWitness(taskIds,validPositions,forbidden,previousForbidden,previous,
          ()=>ledger.consume("STANDALONE"));
        evidence.matchingTraversals+=result.traversals;
        if(result.outcome==="BUDGET_EXHAUSTED")return{outcome:"BUDGET_EXHAUSTED",evidence};
        if(result.outcome!=="PERFECT"||!result.matching)break;
        const matching=result.matching;
        const witness=Object.fromEntries([...matching].sort(([a],[b])=>a.localeCompare(b)).map(([taskId,position])=>[taskId,slots[position]!]));
        evidence.firstMatchingWitness??=witness;
        const scheduled=[...matching].map(([taskId,position])=>scoreAuxiliaryTask(problem,taskById.get(taskId)!,spotStart(position),base).scheduled);
        const all=[...structural.tasks,...scheduled];
        if(scheduled.some(task=>!canPlaceTask(problem,task,task.start,[...placed,...all.filter(item=>item.id!==task.id)],mutableMeals)))break;
        evidence.matchingSuccesses+=1;
        const resource=problem.resources.find(item=>item.id===resourceId)!;
        evidence.mealAwareGeometries+=Number(reservations.length>0);
        const decision=continuation({tasks:all,preparations:structural.preparations,operationalMealReservations:reservations,
          presence:evaluateResourcePresence(resource,all).preferredLexicographicTuple});
        evidence.terminalFutureResult=decision.terminalFutureResult??evidence.terminalFutureResult;
        if(decision.outcome!=="DEAD_END"){
          evidence.selectedMatchingWitness=witness;
          evidence.selectedOperationalMealReservations=[...reservations];
          if(repaired)evidence.geometriesRescuedByRematching+=1;
          return{outcome:decision.outcome,evidence};
        }
        if(!decision.participantFutureExactPrune&&!decision.participantMealPrune)break;
        const newlyForbidden:string[]=[];
        for(const [taskId,position] of matching){const task=taskById.get(taskId)!;
          const edge=scoreAuxiliaryTask(problem,task,spotStart(position),base).scheduled;
          let prune=false;
          if(decision.participantFutureExactPrune){const exact=participantFutureProbe(problem,[...base,edge],[edge],{consume:()=>ledger.consume("STANDALONE")},"EXACT");
            if(exact.status==="ABSTAIN"&&exact.abstainCause==="BUDGET_EXHAUSTED")return{outcome:"BUDGET_EXHAUSTED",evidence};
            prune=exact.status==="PRUNE";}
          if(decision.participantMealPrune){const meal=participantMealProbe(problem,[...base,edge],[edge]);
            prune=prune||!meal.feasible;}
          if(prune)newlyForbidden.push(`${taskId}@${position}`);
        }
        if(!newlyForbidden.length)break;
        previousForbidden=forbidden;previous=new Map(matching);forbidden=new Set([...forbidden,...newlyForbidden]);
        evidence.causalForbiddenEdges+=newlyForbidden.filter(edge=>!previousForbidden.has(edge)).length;
        evidence.incrementalRepairs+=1;repaired=true;
      }
    }
  }
  return{outcome:setup.outcome==="BUDGET_EXHAUSTED"?"BUDGET_EXHAUSTED":"DEAD_END",evidence};
}
