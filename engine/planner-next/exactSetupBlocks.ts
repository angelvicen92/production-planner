import type { PlannerNextProblem, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import type { ExactSearchLedger } from "./exactMainAndFeederCore";
import { canPlaceTask } from "./placement";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { eligibleSetupTasksForPolicy, setupFamilySequence } from "./setupGrouping";
import { createSetupPreparation, preparationAvoidsOccupations, preparationWithinAvailability,
  preparationWithinDay, setupPreparationDuration, spaceOccupations } from "./setupPreparation";
import { occupationAvoidsProtectedMeal } from "./spaceMeals";
import { findCanonicalPerfectMatching } from "./macroScheduling";

export interface ExactSetupBlockCandidate { tasks: ScheduledTask[]; preparations: ScheduledSetupPreparation[]; cost: number; }
export interface ExactSetupBlockGenerationEvidence { branchesExplored:number; startsExplored:number; maximumDepth:number;
  completeCandidateCount:number; familyOrderCandidateCounts:Record<string,number>; matchingAttempts:number;
  matchingSuccesses:number; permutationBranchesAvoided:number; compactCandidates:number; gappedCandidates:number; }
export interface ExactSetupBlockGenerationResult { outcome:"COMPLETE"|"BUDGET_EXHAUSTED"; candidates:ExactSetupBlockCandidate[]; evidence:ExactSetupBlockGenerationEvidence; }
export interface ExactSetupMacroDomain { domainSize:number; structuralCandidateCount:number; matchingFeasibleCandidateCount:number; domainExact:boolean; }
export type ExactSetupCandidateOutcome="CONTINUE"|"FOUND";
const byId=<T extends {id:string}>(a:T,b:T)=>a.id.localeCompare(b.id);
const signature=(candidate:ExactSetupBlockCandidate)=>candidate.tasks.slice().sort(byId).map(t=>`${t.id}@${t.start}-${t.end}`)
  .concat(candidate.preparations.slice().sort(byId).map(t=>`${t.id}@${t.start}-${t.end}`)).join("|");

/** Enumerates non-negative grid compositions with a fixed sum without materializing them. */
function* gapCompositions(count:number,total:number,prefix:number[]=[]):Generator<number[]> {
  if(count===0){if(total===0)yield prefix;return;}
  for(let value=0;value<=total;value+=5)yield* gapCompositions(count-1,total-value,[...prefix,value]);
}

/**
 * Gap-complete, compact-first setup exploration.  A candidate is handed to its
 * descendant immediately; no cross-product of setup geometries is retained.
 */
export function exploreExactSetupBlockCandidates(problem:PlannerNextProblem,tasks:Task[],placed:ScheduledTask[],
  preparations:ScheduledSetupPreparation[],meals:ScheduledSpaceMeal[],ledger:ExactSearchLedger,
  onCandidate:(candidate:ExactSetupBlockCandidate)=>ExactSetupCandidateOutcome,
  options:{compactOnly?:boolean}={}):{outcome:"COMPLETE"|"FOUND"|"BUDGET_EXHAUSTED";evidence:ExactSetupBlockGenerationEvidence}{
  const ordered=[...tasks].sort(byId),spaceId=ordered[0]?.spaceId;
  const space=spaceId===undefined?undefined:problem.spaces.find(s=>s.id===spaceId),policy=space?.setupPolicy;
  const evidence:ExactSetupBlockGenerationEvidence={branchesExplored:0,startsExplored:0,maximumDepth:0,
    completeCandidateCount:0,familyOrderCandidateCounts:{},matchingAttempts:0,matchingSuccesses:0,
    permutationBranchesAvoided:0,compactCandidates:0,gappedCandidates:0};
  if(!spaceId||!space||!policy||ordered.length===0||ordered.some(t=>t.spaceId!==spaceId||t.setupFamilyId===undefined))
    return {outcome:"COMPLETE",evidence};
  const continuity=space.secondaryContinuity??"OFF";
  const maxIdle=options.compactOnly||continuity==="REQUIRED"?0:problem.day.end-problem.day.start;
  let stopped:"FOUND"|"BUDGET_EXHAUSTED"|null=null;

  const visit=(canonicalStart:number,remaining:Task[],partial:ScheduledTask[],partialPreparations:ScheduledSetupPreparation[],
    cost:number,depth:number,idleRemaining:number,repairPass:boolean,repairUsed=false):void=>{
    if(stopped)return;evidence.maximumDepth=Math.max(evidence.maximumDepth,depth);
    if(remaining.length===0){if(idleRemaining!==0||repairPass&&!repairUsed)return;
      const candidate={tasks:partial,preparations:partialPreparations,cost};
      const key=setupFamilySequence(partial).join(">");evidence.completeCandidateCount++;
      evidence.familyOrderCandidateCounts[key]=(evidence.familyOrderCandidateCounts[key]??0)+1;
      const occupations=spaceOccupations(partial,partialPreparations,spaceId,[]).sort((a,b)=>a.start-b.start||a.end-b.end);
      const idle=occupations.slice(1).reduce((sum,item,index)=>sum+Math.max(0,item.start-occupations[index]!.end),0);
      if(idle===0)evidence.compactCandidates++;else evidence.gappedCandidates++;
      if(onCandidate(candidate)==="FOUND")stopped="FOUND";return;
    }
    const eligible=eligibleSetupTasksForPolicy(remaining,partial,policy);
    const families=[...new Set(eligible.map(t=>t.setupFamilyId!))].sort();
    for(const familyId of families){
      const familyTasks=remaining.filter(t=>t.setupFamilyId===familyId).sort(byId);
      const durations=[...new Set(familyTasks.map(t=>t.duration))];if(durations.length!==1)continue;
      const first=!partial.some(t=>t.setupFamilyId===familyId),hasPrior=partial.some(t=>t.setupFamilyId!==undefined);
      const duration=first?setupPreparationDuration(policy,familyId,hasPrior):undefined;
      const cursor=partial.at(-1)?.end??canonicalStart;
      const preparation=duration===undefined?undefined:createSetupPreparation(spaceId,familyId,1,duration,cursor);
      const base=preparation?.end??cursor;
      const priorTasks=[...placed,...partial],priorPreparations=[...preparations,...partialPreparations];
      if(preparation&&(!preparationWithinDay(problem,preparation)||!preparationWithinAvailability(space.availability,preparation)
        ||!occupationAvoidsProtectedMeal(problem,spaceId,preparation.start,preparation.end)
        ||!preparationAvoidsOccupations(preparation,spaceOccupations(priorTasks,priorPreparations,spaceId,meals))))continue;
      // The first family is anchored at canonicalStart. Later families may wait after their required preparation.
      const gapCount=familyTasks.length-1+(hasPrior?1:0);
      for(let familyIdle=0;familyIdle<=idleRemaining;familyIdle+=5){for(const gaps of gapCompositions(gapCount,familyIdle)){
        if(!ledger.consume("STANDALONE")){stopped="BUDGET_EXHAUSTED";return;}evidence.branchesExplored++;
        const leading=hasPrior?gaps[0]??0:0,internal=hasPrior?gaps.slice(1):gaps;
        const starts:number[]=[];let next=base+leading;
        for(let i=0;i<familyTasks.length;i++){starts.push(next);next+=familyTasks[0]!.duration+(internal[i]??0);}
        if(next>problem.day.end)continue;
        const slotIds=starts.map((_,i)=>`${familyId}:${i}`);evidence.matchingAttempts++;
        const compatible=(taskId:string,slotId:string)=>{
          const task=familyTasks.find(t=>t.id===taskId)!;return canPlaceTask(problem,task,starts[Number(slotId.slice(slotId.lastIndexOf(":")+1))]!,priorTasks,meals);
        };
        const matching=findCanonicalPerfectMatching(slotIds,familyTasks.map(t=>t.id),compatible);
        if(!matching)continue;
        const witnesses=[matching];const seen=new Set([JSON.stringify([...matching].sort())]);
        // Repairs are lazy and material: forbid one canonical identity/slot edge,
        // collapse equivalent witnesses, and only enter them after the canonical
        // witness's entire descendant has failed.
        for(const [forbiddenSlot,forbiddenTask] of repairPass&&continuity!=="REQUIRED"?[...matching].sort():[]){
          const repaired=findCanonicalPerfectMatching(slotIds,familyTasks.map(t=>t.id),(taskId,slotId)=>
            !(taskId===forbiddenTask&&slotId===forbiddenSlot)&&compatible(taskId,slotId));
          if(!repaired)continue;const key=JSON.stringify([...repaired].sort());if(seen.has(key))continue;seen.add(key);witnesses.push(repaired);
        }
        for(let witnessIndex=0;witnessIndex<witnesses.length;witnessIndex++){
          if(witnessIndex>0&&(!ledger.consume("STANDALONE"))){stopped="BUDGET_EXHAUSTED";return;}
          if(witnessIndex>0)evidence.branchesExplored++;
          const witness=witnesses[witnessIndex]!;
          const scheduled=[...witness].map(([slotId,taskId])=>{const task=familyTasks.find(t=>t.id===taskId)!;
            return scoreAuxiliaryTask(problem,task,starts[Number(slotId.slice(slotId.lastIndexOf(":")+1))]!,priorTasks).scheduled;
          }).sort((a,b)=>a.start-b.start||byId(a,b));
          if(scheduled.some(task=>!canPlaceTask(problem,task,task.start,[...priorTasks,...scheduled.filter(t=>t.id!==task.id)],meals)))continue;
          evidence.matchingSuccesses++;evidence.permutationBranchesAvoided+=Math.max(0,familyTasks.length-1);
          visit(canonicalStart,remaining.filter(t=>t.setupFamilyId!==familyId),[...partial,...scheduled],
            preparation?[...partialPreparations,preparation]:partialPreparations,
            cost+scheduled.reduce((sum,item)=>sum+scoreAuxiliaryTask(problem,familyTasks.find(t=>t.id===item.id)!,item.start,priorTasks).cost,0),
            depth+scheduled.length,idleRemaining-familyIdle,repairPass,repairUsed||witnessIndex>0);
          if(stopped)return;
        }
      }}
    }
  };
  // Geometry class is the total avoidable idle. Within it, shorter spans arise first.
  for(const repairPass of options.compactOnly||continuity==="REQUIRED"?[false]:[false,true]){
    for(let idle=0;idle<=maxIdle&&!stopped;idle+=5){
      for(let start=problem.day.start;start<problem.day.end&&!stopped;start+=5){
        evidence.startsExplored++;visit(start,ordered,[],[],0,0,idle,repairPass);
      }
    }
  }
  return {outcome:stopped??"COMPLETE",evidence};
}

/** Compatibility collector. Production search uses the incremental explorer above. */
export function generateExactSetupBlockCandidates(problem:PlannerNextProblem,tasks:Task[],placed:ScheduledTask[],preparations:ScheduledSetupPreparation[],
  meals:ScheduledSpaceMeal[],ledger:ExactSearchLedger,countOnly=false):ExactSetupBlockGenerationResult{
  const candidates:ExactSetupBlockCandidate[]=[];
  const result=exploreExactSetupBlockCandidates(problem,tasks,placed,preparations,meals,ledger,c=>{if(!countOnly)candidates.push(c);return "CONTINUE";},
    {compactOnly:countOnly});
  candidates.sort((a,b)=>a.cost-b.cost||((a.tasks.at(-1)?.end??0)-(a.tasks[0]?.start??0))-((b.tasks.at(-1)?.end??0)-(b.tasks[0]?.start??0))||signature(a).localeCompare(signature(b)));
  return {outcome:result.outcome==="BUDGET_EXHAUSTED"?"BUDGET_EXHAUSTED":"COMPLETE",candidates,evidence:result.evidence};
}

/** Compact-only MRV probe. Its zero is deliberately inexact for PREFERRED/OFF setup units. */
export function probeExactSetupMacroDomain(problem:PlannerNextProblem,tasks:Task[],placed:ScheduledTask[],preparations:ScheduledSetupPreparation[],meals:ScheduledSpaceMeal[]):ExactSetupMacroDomain{
  const ledger:ExactSearchLedger={limit:Number.POSITIVE_INFINITY,branchesExplored:0,coreBranches:0,standaloneBranches:0,lastExhaustionPhase:null,consume:()=>true};
  const result=exploreExactSetupBlockCandidates(problem,tasks,placed,preparations,meals,ledger,()=>"CONTINUE",{compactOnly:true});
  const continuity=problem.spaces.find(s=>s.id===tasks[0]?.spaceId)?.secondaryContinuity??"OFF";
  return {domainSize:result.evidence.completeCandidateCount,structuralCandidateCount:result.evidence.startsExplored,
    matchingFeasibleCandidateCount:result.evidence.completeCandidateCount,domainExact:continuity==="REQUIRED"};
}
