import type { PlannerNextProblem, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { incrementallyRepairMatchingWitness, type ExactSearchLedger } from "./exactMainAndFeederCore";
import { generateExactSetupBlockCandidates } from "./exactSetupBlocks";
import { probeParticipantFutureReservations } from "./participantFutureFeasibility";
import { canPlaceTask } from "./placement";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { evaluateResourcePresence } from "./resourcePresence";

export interface ExactPreferredResourceUnitCandidate {
  readonly tasks: readonly ScheduledTask[];
  readonly preparations: readonly ScheduledSetupPreparation[];
  readonly presence: readonly [blocks:number, span:number, idle:number];
}

export type ExactPreferredResourceUnitOutcome="FOUND"|"DEAD_END"|"BUDGET_EXHAUSTED";
export interface ExactPreferredResourceUnitContinuationResult {
  outcome:ExactPreferredResourceUnitOutcome;
  /** True only when the complete candidate reached participant Future EXACT and it pruned. */
  participantFutureExactPrune?:boolean;
  terminalFutureResult?:"PASS"|"PRUNE"|"ABSTAIN"|"NOT_CHECKED";
}
export interface ExactPreferredResourceUnitEvidence {
  geometryCount:number;matchingSuccesses:number;rawCompatibleEdges:number;futureEdgeChecks:number;
  analyticPrunedEdges:number;matchingAttempts:number;matchingTraversals:number;causalForbiddenEdges:number;
  incrementalRepairs:number;geometriesRescuedByRematching:number;
  firstMatchingWitness:Record<string,string>|null;selectedMatchingWitness:Record<string,string>|null;
  terminalFutureResult:"PASS"|"PRUNE"|"ABSTAIN"|"NOT_CHECKED";
}
export interface ExactPreferredResourceUnitAuthorities {
  /** Test seam; production always uses the canonical participant-future authority. */
  participantFutureProbe?:typeof probeParticipantFutureReservations;
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
  const evidence:ExactPreferredResourceUnitEvidence={geometryCount:0,matchingSuccesses:0,rawCompatibleEdges:0,
    futureEdgeChecks:0,analyticPrunedEdges:0,matchingAttempts:0,matchingTraversals:0,causalForbiddenEdges:0,
    incrementalRepairs:0,geometriesRescuedByRematching:0,firstMatchingWitness:null,selectedMatchingWitness:null,
    terminalFutureResult:"NOT_CHECKED"};
  const mutableMeals=[...meals];
  const setup=generateExactSetupBlockCandidates(problem,[...setupTasks],[...placed],[...preparations],mutableMeals,ledger);
  const duration=resourceTasks.reduce((sum,task)=>sum+task.duration,0);
  const taskById=new Map(resourceTasks.map(task=>[task.id,task]));
  const taskIds=[...taskById.keys()].sort();
  const analyticEdgeCache=new Map<string,"PASS"|"PRUNE"|"ABSTAIN">();
  for(const structural of setup.candidates){
    const occupations=[...structural.tasks,...structural.preparations];
    const first=Math.min(...occupations.map(item=>item.start)),last=Math.max(...occupations.map(item=>item.end));
    for(const start of [first-duration,last]){
      evidence.geometryCount+=1;
      const slots=resourceTasks.map((_,index)=>`spot:${index}`);
      const spotStart=(position:number)=>start+resourceTasks.slice(0,position).reduce((sum,item)=>sum+item.duration,0);
      const validPositions=new Map<string,number[]>();
      const base=[...placed,...structural.tasks];
      for(const taskId of taskIds){const task=taskById.get(taskId)!,positions:number[]=[];
        for(let position=0;position<slots.length;position+=1){const at=spotStart(position);
          if(!canPlaceTask(problem,task,at,base,mutableMeals))continue;
          evidence.rawCompatibleEdges+=1;evidence.futureEdgeChecks+=1;
          const scheduled=scoreAuxiliaryTask(problem,task,at,base).scheduled;
          const cacheKey=`${task.id}@${task.spaceId}:${at}`;
          let futureStatus=analyticEdgeCache.get(cacheKey);
          if(futureStatus===undefined){futureStatus=participantFutureProbe(problem,[...base,scheduled],[scheduled],undefined,"ANALYTIC_ONLY").status;
            analyticEdgeCache.set(cacheKey,futureStatus);}
          if(futureStatus==="PRUNE"){evidence.analyticPrunedEdges+=1;continue;}
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
        const decision=continuation({tasks:all,preparations:structural.preparations,
          presence:evaluateResourcePresence(resource,all).preferredLexicographicTuple});
        evidence.terminalFutureResult=decision.terminalFutureResult??evidence.terminalFutureResult;
        if(decision.outcome!=="DEAD_END"){
          evidence.selectedMatchingWitness=witness;
          if(repaired)evidence.geometriesRescuedByRematching+=1;
          return{outcome:decision.outcome,evidence};
        }
        if(!decision.participantFutureExactPrune)break;
        const newlyForbidden:string[]=[];
        for(const [taskId,position] of matching){const task=taskById.get(taskId)!;
          const edge=scoreAuxiliaryTask(problem,task,spotStart(position),base).scheduled;
          const exact=participantFutureProbe(problem,[...base,edge],[edge],{consume:()=>ledger.consume("STANDALONE")},"EXACT");
          if(exact.status==="ABSTAIN"&&exact.abstainCause==="BUDGET_EXHAUSTED")return{outcome:"BUDGET_EXHAUSTED",evidence};
          if(exact.status==="PRUNE")newlyForbidden.push(`${taskId}@${position}`);
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
