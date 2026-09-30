import type { OperationalMealPolicy, PlannerNextProblem, ScheduledOperationalMeal, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { incrementallyRepairMatchingWitness, type ExactSearchLedger } from "./exactMainAndFeederCore";
import { generateExactSetupBlockCandidates, type ExactSetupBlockCandidate } from "./exactSetupBlocks";
import type { FutureCollectiveClosureResult } from "./futureCollectiveParticipantClosure";
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
  /** Complete assignment rejected by the exact collective future-closure authority. */
  collectiveClosurePrune?:boolean;
  collectiveClosureParticipantIds?:readonly string[];
  terminalFutureResult?:"PASS"|"PRUNE"|"ABSTAIN"|"NOT_CHECKED";
}
export type PreferredUnitCollectivePrecheck = (candidate: ExactPreferredResourceUnitCandidate) => FutureCollectiveClosureResult;
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
  setupMatchingAttempts:number;setupMatchingTraversals:number;setupIncrementalRepairs:number;
  mealFreeClosureChecks:number;mealFreeClosurePrunes:number;mealFreeClosureCacheHits:number;
  releaseDefiningCausalEdges:Array<{taskId:string;familyId:string|null;slotStart:number}>;
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
  collectivePrecheck?:PreferredUnitCollectivePrecheck;
  authorities?:ExactPreferredResourceUnitAuthorities;
}):{outcome:ExactPreferredResourceUnitOutcome;evidence:ExactPreferredResourceUnitEvidence}{
  const {problem,resourceId,resourceTasks,setupTasks,placed,preparations,meals,ledger,continuation}=args;
  const participantFutureProbe=args.authorities?.participantFutureProbe??probeParticipantFutureReservations;
  const participantMealProbe=args.authorities?.participantMealProbe??probeParticipantMealFutureFeasibility;
  const evidence:ExactPreferredResourceUnitEvidence={geometryCount:0,matchingSuccesses:0,rawCompatibleEdges:0,
    futureEdgeChecks:0,analyticPrunedEdges:0,matchingAttempts:0,matchingTraversals:0,causalForbiddenEdges:0,
    mealEdgeChecks:0,mealPrunedEdges:0,mealAwareGeometries:0,mealReservationVariants:0,selectedOperationalMealReservations:[],firstMealPrunedEdge:null,blockingMealTaskId:null,
    incrementalRepairs:0,geometriesRescuedByRematching:0,firstMatchingWitness:null,selectedMatchingWitness:null,
    terminalFutureResult:"NOT_CHECKED",setupMatchingAttempts:0,setupMatchingTraversals:0,setupIncrementalRepairs:0,
    mealFreeClosureChecks:0,mealFreeClosurePrunes:0,mealFreeClosureCacheHits:0,releaseDefiningCausalEdges:[]};
  const mutableMeals=[...meals];
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
  const setupTaskById=new Map(setupTasks.map(task=>[task.id,task]));
  const setupRepairState=new WeakMap<ExactSetupBlockCandidate,Map<string,Set<string>>>();
  const repairSetupEdge=(structural:ExactSetupBlockCandidate,taskId:string):ExactSetupBlockCandidate|null=>{
    const selected=structural.tasks.find(task=>task.id===taskId),familyId=selected?.setupFamilyId;
    if(!selected||!familyId)return null;
    const family=structural.tasks.filter(task=>task.setupFamilyId===familyId).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
    const ids=family.map(task=>task.id).sort(),starts=family.map(task=>task.start).sort((a,b)=>a-b);
    const familyBase=[...placed,...structural.tasks.filter(task=>task.setupFamilyId!==familyId)];
    const domains=new Map<string,number[]>();
    for(const id of ids){const task=setupTaskById.get(id)!;domains.set(id,starts.flatMap((start,index)=>
      canPlaceTask(problem,task,start,familyBase,mutableMeals)?[index]:[]));}
    const prior=new Map(family.map(task=>[task.id,starts.indexOf(task.start)]));
    const inherited=setupRepairState.get(structural)??new Map<string,Set<string>>();
    const previousForbidden=inherited.get(familyId)??new Set<string>();
    const position=starts.indexOf(selected.start),forbidden=new Set(previousForbidden).add(`${taskId}@${position}`);
    evidence.setupMatchingAttempts+=1;
    const repaired=incrementallyRepairMatchingWitness(ids,domains,forbidden,previousForbidden,prior,()=>ledger.consume("STANDALONE"));
    evidence.setupMatchingTraversals+=repaired.traversals;
    if(repaired.outcome!=="PERFECT"||!repaired.matching)return null;
    const scheduled=[...repaired.matching].map(([id,index])=>scoreAuxiliaryTask(problem,setupTaskById.get(id)!,starts[index]!,familyBase).scheduled);
    if(scheduled.some(task=>!canPlaceTask(problem,setupTaskById.get(task.id)!,task.start,
      [...familyBase,...scheduled.filter(item=>item.id!==task.id)],mutableMeals)))return null;
    const next={...structural,tasks:[...structural.tasks.filter(task=>task.setupFamilyId!==familyId),...scheduled]
      .sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id))};
    const nextState=new Map([...inherited].map(([id,edges])=>[id,new Set(edges)]));nextState.set(familyId,forbidden);
    setupRepairState.set(next,nextState);evidence.setupIncrementalRepairs+=1;return next;
  };
  let acceptedOutcome:ExactPreferredResourceUnitOutcome|null=null;
  const processStructural=(structural:ExactSetupBlockCandidate):boolean=>{
    const occupations=[...structural.tasks,...structural.preparations];
    const first=Math.min(...occupations.map(item=>item.start)),last=Math.max(...occupations.map(item=>item.end));
    type Geometry={start:number;reservations:ScheduledOperationalMeal[];offsets:number[]};
    function* geometries():Generator<Geometry>{const seen=new Set<string>();
      // Compound Phase A is event-driven: arbitrary grid starts are dominated
      // until every compact setup geometry has had a chance to preserve the
      // future participant domains.
      for(const tier of [0,1,2] as const)for(const orientation of ["BEFORE","AFTER"] as const){
      const naturalBoundary=orientation==="BEFORE"?resourceTasks.length:0;
      const assignments=function* (index=0,current:number[]=[]):Generator<number[]>{if(index===operationalPolicies.length){yield current;return;}
        const boundaries=tier===0?[naturalBoundary]:[naturalBoundary,...Array.from({length:resourceTasks.length+1},(_,i)=>i)]
          .filter((value,index,array)=>array.indexOf(value)===index);
        for(const boundary of boundaries)yield* assignments(index+1,[...current,boundary]);};
      for(const boundaries of assignments()){
        const mealMinutes=operationalPolicies.reduce((sum,policy)=>sum+policy.duration,0);
        const anchoredStart=orientation==="BEFORE"?first-duration-mealMinutes:last;
        const structuralBoundaries=[...new Set(occupations.flatMap(item=>[item.start,item.end]))].sort((a,b)=>a-b);
        const taskBoundaries=[...new Set([...placed].flatMap(item=>[item.start,item.end]))].sort((a,b)=>a-b);
        const candidateStarts=tier===0?[anchoredStart,...structuralBoundaries.flatMap(boundary=>[boundary,boundary-duration-mealMinutes])]
          :tier===1?taskBoundaries.flatMap(boundary=>[boundary,boundary-duration-mealMinutes])
          :Array.from({length:Math.max(0,Math.floor((problem.day.end-problem.day.start)/5)+1)},(_,i)=>problem.day.start+i*5);
        for(const start of candidateStarts){let cursor=start;const offsets:number[]=[];const reservations:ScheduledOperationalMeal[]=[];let valid=true;
          for(let boundary=0;boundary<=resourceTasks.length;boundary+=1){
            for(const [policyIndex,policy] of operationalPolicies.map((policy,index)=>[index,policy] as const).filter(([i])=>boundaries[i]===boundary)){
              const candidate=operationalMealCandidates(problem,policy,[...placed,...structural.tasks],reservations).find(item=>item.start===cursor);
              if(!candidate){valid=false;break;}reservations.push(candidate);cursor=candidate.end;
            }
            if(!valid)break;if(boundary<resourceTasks.length){offsets.push(cursor-start);cursor+=resourceTasks[boundary]!.duration;}
          }
          if(!valid)continue;
          // Preserve the original structural adjacency for the first class of candidates.
          if(start===anchoredStart&&((orientation==="BEFORE"&&cursor!==first)||(orientation==="AFTER"&&start!==last)))continue;
          const key=`${start}|${offsets.join(",")}|${reservations.map(x=>`${x.id}@${x.start}`).join(",")}`;
          if(!seen.has(key)){seen.add(key);yield{start,reservations,offsets};}
        }
      }
    }}
    for(const geometry of geometries()){const {start,reservations}=geometry;
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
      const collectiveNogoods:Array<{forbidden:Set<string>;previousForbidden:Set<string>;previous:Map<string,number>}>=[];
      let repaired=false;
      while(true){
        evidence.matchingAttempts+=1;
        const result=incrementallyRepairMatchingWitness(taskIds,validPositions,forbidden,previousForbidden,previous,
          ()=>ledger.consume("STANDALONE"));
        evidence.matchingTraversals+=result.traversals;
        if(result.outcome==="BUDGET_EXHAUSTED"){acceptedOutcome="BUDGET_EXHAUSTED";return true;}
        if(result.outcome!=="PERFECT"||!result.matching){const alternative=collectiveNogoods.shift();if(alternative){
          forbidden=alternative.forbidden;previousForbidden=alternative.previousForbidden;previous=alternative.previous;continue;}break;}
        const matching=result.matching;
        const witness=Object.fromEntries([...matching].sort(([a],[b])=>a.localeCompare(b)).map(([taskId,position])=>[taskId,slots[position]!]));
        evidence.firstMatchingWitness??=witness;
        const scheduled=[...matching].map(([taskId,position])=>scoreAuxiliaryTask(problem,taskById.get(taskId)!,spotStart(position),base).scheduled);
        const all=[...structural.tasks,...scheduled];
        if(scheduled.some(task=>!canPlaceTask(problem,task,task.start,[...placed,...all.filter(item=>item.id!==task.id)],mutableMeals)))break;
        evidence.matchingSuccesses+=1;
        const resource=problem.resources.find(item=>item.id===resourceId)!;
        evidence.mealAwareGeometries+=Number(reservations.length>0);
        const candidate={tasks:all,preparations:structural.preparations,operationalMealReservations:reservations,
          presence:evaluateResourcePresence(resource,all,[],[],reservations).preferredLexicographicTuple} as const;
        const precheck=args.collectivePrecheck?.(candidate);
        if(precheck){evidence.mealFreeClosureChecks+=Number(!precheck.cacheHit);evidence.mealFreeClosureCacheHits+=Number(precheck.cacheHit);}
        if(precheck?.reason==="BUDGET_EXHAUSTED"){acceptedOutcome="BUDGET_EXHAUSTED";return true;}
        const decision=precheck?.status==="INFEASIBLE"
          ?{outcome:"DEAD_END" as const,collectiveClosurePrune:true,collectiveClosureParticipantIds:precheck.hall?.participantIds}
          :continuation(candidate);
        evidence.mealFreeClosurePrunes+=Number(precheck?.status==="INFEASIBLE");
        evidence.terminalFutureResult=decision.terminalFutureResult??evidence.terminalFutureResult;
        if(decision.outcome!=="DEAD_END"){
          evidence.selectedMatchingWitness=witness;
          evidence.selectedOperationalMealReservations=[...reservations];
          if(repaired)evidence.geometriesRescuedByRematching+=1;
          acceptedOutcome=decision.outcome;return true;
        }
        if(!decision.participantFutureExactPrune&&!decision.participantMealPrune&&!decision.collectiveClosurePrune)break;
        const newlyForbidden:string[]=[];
        if(decision.collectiveClosurePrune){
          // A complete-assignment nogood is a disjunction.  Exclude one selected
          // edge per repair, never their conjunction and never only unmatched ids.
          const blockers=new Set(decision.collectiveClosureParticipantIds??[]);
          const allSelected=[...matching].sort(([a],[b])=>a.localeCompare(b));
          const dependencyTasks=new Map([...problem.tasks,...(problem.analyticalFutureParticipantTasks??[]),
            ...(problem.analyticalFutureTransportDepartures??[])].map(task=>[task.id,task]));
          const releaseAncestorIds=new Set<string>();
          const visitDependency=(id:string):void=>{if(releaseAncestorIds.has(id))return;releaseAncestorIds.add(id);
            for(const dependency of dependencyTasks.get(id)?.dependencies??[])visitDependency(dependency);};
          for(const id of precheck?.hall?.prerequisiteIds??[])visitDependency(id);
          const ancestral=[...all].filter(task=>blockers.has(task.participantId??"")&&releaseAncestorIds.has(task.id));
          const ancestralFamilies=new Set(ancestral.flatMap(task=>task.setupFamilyId?[task.setupFamilyId]:[]));
          const releasePool=ancestral.length?[...all].filter(task=>blockers.has(task.participantId??"")&&
            (releaseAncestorIds.has(task.id)||(task.setupFamilyId!==undefined&&ancestralFamilies.has(task.setupFamilyId))))
            :[...all].filter(task=>blockers.has(task.participantId??""));
          const releaseDefining=releasePool.filter(task=>!releasePool.some(other=>other.id!==task.id&&
            other.participantId===task.participantId&&other.end>task.end));
          for(const task of releaseDefining){const edge={taskId:task.id,familyId:task.setupFamilyId??null,slotStart:task.start};
            if(!evidence.releaseDefiningCausalEdges.some(item=>item.taskId===edge.taskId&&item.slotStart===edge.slotStart))evidence.releaseDefiningCausalEdges.push(edge);}
          const setupCausal=releaseDefining.filter(task=>task.setupFamilyId!==undefined).sort((a,b)=>a.id.localeCompare(b.id));
          for(const task of setupCausal){const repairedSetup=repairSetupEdge(structural,task.id);
            if(repairedSetup&&processStructural(repairedSetup))return true;}
          // Only a selected resource edge which actually defines the participant
          // release can alter this Hall. If causality cannot be certified, keep
          // the exact complete-assignment fallback.
          const causalIds=new Set(releaseDefining.filter(task=>task.setupFamilyId===undefined).map(task=>task.id));
          const causal=allSelected.filter(([taskId])=>causalIds.has(taskId));
          const selected=(causal.length||setupCausal.length)?causal:allSelected;
          // When every release-defining edge belonged to setup and all of its
          // incremental alternatives failed, changing the earlier resource
          // block cannot alter this Hall. Reject only this setup geometry.
          if(!selected.length)return false;
          for(const [taskId,position] of [...selected].reverse()){const edge=`${taskId}@${position}`,branch=new Set(forbidden).add(edge);
            collectiveNogoods.unshift({forbidden:branch,previousForbidden:new Set(forbidden),previous:new Map(matching)});}
          evidence.causalForbiddenEdges+=selected.length;evidence.incrementalRepairs+=1;repaired=true;
          const alternative=collectiveNogoods.shift();if(!alternative)break;
          forbidden=alternative.forbidden;previousForbidden=alternative.previousForbidden;previous=alternative.previous;continue;
        }
        for(const [taskId,position] of matching){const task=taskById.get(taskId)!;
          const edge=scoreAuxiliaryTask(problem,task,spotStart(position),base).scheduled;
          let prune=false;
          if(decision.participantFutureExactPrune){const exact=participantFutureProbe(problem,[...base,edge],[edge],{consume:()=>ledger.consume("STANDALONE")},"EXACT");
            if(exact.status==="ABSTAIN"&&exact.abstainCause==="BUDGET_EXHAUSTED"){acceptedOutcome="BUDGET_EXHAUSTED";return true;}
            prune=exact.status==="PRUNE";}
          if(decision.participantMealPrune&&!decision.collectiveClosurePrune){const meal=participantMealProbe(problem,[...base,edge],[edge]);
            prune=prune||!meal.feasible;}
          if(prune)newlyForbidden.push(`${taskId}@${position}`);
        }
        if(!newlyForbidden.length)break;
        previousForbidden=forbidden;previous=new Map(matching);forbidden=new Set([...forbidden,...newlyForbidden]);
        evidence.causalForbiddenEdges+=newlyForbidden.filter(edge=>!previousForbidden.has(edge)).length;
        evidence.incrementalRepairs+=1;repaired=true;
      }
    }
    return false;
  };
  const grid=Array.from({length:Math.max(0,Math.ceil((problem.day.end-problem.day.start)/5))},(_,index)=>problem.day.start+index*5);
  const mealMinutes=operationalPolicies.reduce((sum,policy)=>sum+policy.duration,0);
  const compactBoundaries=[...new Set(resourceTasks.flatMap(task=>(task.availability??[problem.day]).flatMap(interval=>
    [interval.start+duration+mealMinutes,interval.end-duration-mealMinutes])))].filter(start=>start>=problem.day.start&&start<problem.day.end);
  const canonicalStarts=[...grid].sort((a,b)=>{
    const distance=(value:number)=>compactBoundaries.length?Math.min(...compactBoundaries.map(boundary=>Math.abs(boundary-value))):0;
    return distance(a)-distance(b)||a-b;
  });
  const setup=generateExactSetupBlockCandidates(problem,[...setupTasks],[...placed],[...preparations],mutableMeals,ledger,false,
    {acceptCandidate:processStructural,canonicalStarts});
  return{outcome:acceptedOutcome??(setup.outcome==="BUDGET_EXHAUSTED"?"BUDGET_EXHAUSTED":"DEAD_END"),evidence};
}
