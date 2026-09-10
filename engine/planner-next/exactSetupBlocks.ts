import type { PlannerNextProblem, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import type { ExactSearchLedger } from "./exactMainAndFeederCore";
import { prepareTaskPlacementAuthority } from "./placement";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { eligibleSetupTasksForPolicy, setupFamilySequence } from "./setupGrouping";
import { createSetupPreparation, preparationAvoidsOccupations, preparationWithinAvailability, preparationWithinDay, setupPreparationDuration, spaceOccupations } from "./setupPreparation";
import { occupationAvoidsProtectedMeal } from "./spaceMeals";
import { findCanonicalPerfectMatching } from "./macroScheduling";

export interface ExactSetupBlockCandidate { tasks: ScheduledTask[]; preparations: ScheduledSetupPreparation[]; cost: number; }
export interface ExactSetupBlockGenerationEvidence {
  branchesExplored: number; startsExplored: number; maximumDepth: number; completeCandidateCount: number;
  familyOrderCandidateCounts: Record<string, number>; matchingAttempts: number; matchingSuccesses: number;
  matchingRepairs: number; permutationBranchesAvoided: number; minimumIdleMinutes: number | null; maximumIdleMinutes: number | null;
}
export interface ExactSetupBlockGenerationResult { outcome: "COMPLETE" | "BUDGET_EXHAUSTED"; candidates: ExactSetupBlockCandidate[]; evidence: ExactSetupBlockGenerationEvidence; }
export interface ExactSetupMacroDomain { domainSize: number; structuralCandidateCount: number; matchingFeasibleCandidateCount: number; domainExact: false; }
export interface ExactSetupBlockExplorer { nextCandidate(): ExactSetupBlockCandidate | null; readonly exhausted: boolean; readonly evidence: ExactSetupBlockGenerationEvidence; }

const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);
const signature = (c: ExactSetupBlockCandidate) => [...c.tasks.slice().sort(byId).map(t=>`${t.id}@${t.start}-${t.end}`),...c.preparations.slice().sort(byId).map(t=>`${t.id}@${t.start}-${t.end}`)].join("|");

function* slotGeometries(start: number, duration: number, count: number, dayEnd: number): Generator<number[]> {
  // Iterative deepening by span makes the compact geometry the first witness,
  // then exposes internal idle monotonically without pre-building combinations.
  const compactSpan=count*duration;
  for(let span=compactSpan;start+span<=dayEnd;span+=5){
    const last=start+span-duration;
    function* choose(prefix:number[]):Generator<number[]>{
      if(prefix.length===count-1){yield [...prefix,last];return;}
      const floor=prefix.at(-1)!+duration;
      const remaining=count-1-prefix.length;
      for(let next=floor;next+remaining*duration<=last;next+=5)yield* choose([...prefix,next]);
    }
    if(count===1)yield[start]; else yield* choose([start]);
  }
}

function* allMatchings(slotIds:string[], taskIds:string[], compatible:(task:string,slot:string)=>boolean):Generator<ReadonlyMap<string,string>>{
  const canonical=findCanonicalPerfectMatching(slotIds,taskIds,compatible);
  if(!canonical)return;
  yield canonical;
  const canonicalKey=[...canonical].map(([s,t])=>`${s}:${t}`).join("|");
  const orderedSlots=[...slotIds].sort(); const orderedTasks=[...taskIds].sort();
  function* assign(index:number,remaining:string[],pairs:[string,string][]):Generator<ReadonlyMap<string,string>>{
    if(index===orderedSlots.length){const result=new Map(pairs);const key=[...result].map(([s,t])=>`${s}:${t}`).join("|");if(key!==canonicalKey)yield result;return;}
    const slot=orderedSlots[index]!;
    for(const task of remaining)if(compatible(task,slot))yield* assign(index+1,remaining.filter(id=>id!==task),[...pairs,[slot,task]]);
  }
  yield* assign(0,orderedTasks,[]);
}

export function createExactSetupBlockExplorer(problem:PlannerNextProblem,tasks:Task[],placed:ScheduledTask[],preparations:ScheduledSetupPreparation[],meals:ScheduledSpaceMeal[],ledger:ExactSearchLedger):ExactSetupBlockExplorer{
  const ordered=[...tasks].sort(byId); const spaceId=ordered[0]?.spaceId; const space=problem.spaces.find(s=>s.id===spaceId); const policy=space?.setupPolicy;
  const evidence:ExactSetupBlockGenerationEvidence={branchesExplored:0,startsExplored:0,maximumDepth:0,completeCandidateCount:0,familyOrderCandidateCounts:{},matchingAttempts:0,matchingSuccesses:0,matchingRepairs:0,permutationBranchesAvoided:0,minimumIdleMinutes:null,maximumIdleMinutes:null};
  let budgetExhausted=false;
  function* candidates():Generator<ExactSetupBlockCandidate>{
    if(!spaceId||!space||!policy||!ordered.length||ordered.some(t=>t.spaceId!==spaceId||t.setupFamilyId===undefined))return;
    function* visit(canonicalStart:number,remaining:Task[],partial:ScheduledTask[],partialPreparations:ScheduledSetupPreparation[],cost:number,repairPhase:boolean,repaired:boolean):Generator<ExactSetupBlockCandidate>{
      evidence.maximumDepth=Math.max(evidence.maximumDepth,partial.length);
      if(!remaining.length){if(repairPhase&&!repaired)return;const candidate={tasks:partial,preparations:partialPreparations,cost};const key=setupFamilySequence(partial).join(">");evidence.familyOrderCandidateCounts[key]=(evidence.familyOrderCandidateCounts[key]??0)+1;evidence.completeCandidateCount+=1;const idle=partial.reduce((sum,t,i,a)=>i&&a[i-1]!.setupFamilyId===t.setupFamilyId?sum+t.start-a[i-1]!.end:sum,0);evidence.minimumIdleMinutes=Math.min(evidence.minimumIdleMinutes??idle,idle);evidence.maximumIdleMinutes=Math.max(evidence.maximumIdleMinutes??idle,idle);yield candidate;return;}
      const families=[...new Set(eligibleSetupTasksForPolicy(remaining,partial,policy).map(t=>t.setupFamilyId!))].sort();
      for(const familyId of families){
        const familyTasks=remaining.filter(t=>t.setupFamilyId===familyId).sort(byId); const durations=[...new Set(familyTasks.map(t=>t.duration))];if(durations.length!==1)continue;
        const cursor=partial.at(-1)?.end??canonicalStart; const prepDuration=setupPreparationDuration(policy,familyId,partial.length>0);
        const preparation=prepDuration===undefined?undefined:createSetupPreparation(spaceId,familyId,1,prepDuration,cursor);
        const earliest=preparation?.end??cursor; const priorTasks=[...placed,...partial];const priorPreparations=[...preparations,...partialPreparations];
        if(preparation&&(!preparationWithinDay(problem,preparation)||!preparationWithinAvailability(space.availability,preparation)||!occupationAvoidsProtectedMeal(problem,spaceId,preparation.start,preparation.end)||!preparationAvoidsOccupations(preparation,spaceOccupations(priorTasks,priorPreparations,spaceId,meals))))continue;
        const authorities=new Map(familyTasks.map(t=>[t.id,prepareTaskPlacementAuthority(problem,t,priorTasks,meals)]));
        for(const starts of slotGeometries(earliest,durations[0]!,familyTasks.length,problem.day.end)){
          if(!ledger.consume("STANDALONE")){budgetExhausted=true;return;} evidence.branchesExplored+=1;
          const slotIds=starts.map((_,i)=>`${familyId}:${i}`); evidence.matchingAttempts+=1;
          let witness=0;
          for(const matching of allMatchings(slotIds,familyTasks.map(t=>t.id),(taskId,slotId)=>authorities.get(taskId)!.accepts(starts[Number(slotId.slice(slotId.lastIndexOf(":")+1))]!,authorities.get(taskId)!.baseDomain))){
            if(!repairPhase&&witness>0)break;
            if(witness>0){if(!ledger.consume("STANDALONE")){budgetExhausted=true;return;}evidence.branchesExplored+=1;evidence.matchingRepairs+=1;}witness+=1;evidence.matchingSuccesses+=1;
            const scheduled=[...matching].map(([slotId,taskId])=>{const task=familyTasks.find(t=>t.id===taskId)!;return scoreAuxiliaryTask(problem,task,starts[Number(slotId.slice(slotId.lastIndexOf(":")+1))]!,priorTasks).scheduled;}).sort((a,b)=>a.start-b.start||byId(a,b));
            if(scheduled.some(task=>!authorities.get(task.id)!.accepts(task.start,authorities.get(task.id)!.domain(scheduled.filter(peer=>peer.id!==task.id)))))continue;
            evidence.permutationBranchesAvoided+=Math.max(0,familyTasks.length-1);
            yield* visit(canonicalStart,remaining.filter(t=>t.setupFamilyId!==familyId),[...partial,...scheduled],preparation?[...partialPreparations,preparation]:partialPreparations,cost+scheduled.reduce((sum,t)=>sum+scoreAuxiliaryTask(problem,familyTasks.find(x=>x.id===t.id)!,t.start,priorTasks).cost,0),repairPhase,repaired||witness>1);
            if(budgetExhausted)return;
          }
        }
      }
    }
    for(const repairPhase of [false,true])for(let start=problem.day.start;start<problem.day.end;start+=5){evidence.startsExplored+=1;yield* visit(start,ordered,[],[],0,repairPhase,false);if(budgetExhausted)return;}
  }
  const iterator=candidates(); let done=false;
  return {get exhausted(){return budgetExhausted;},evidence,nextCandidate(){if(done)return null;const next=iterator.next();done=Boolean(next.done);return next.done?null:next.value;}};
}

export function generateExactSetupBlockCandidates(problem:PlannerNextProblem,tasks:Task[],placed:ScheduledTask[],preparations:ScheduledSetupPreparation[],meals:ScheduledSpaceMeal[],ledger:ExactSearchLedger,countOnly=false):ExactSetupBlockGenerationResult{
  const explorer=createExactSetupBlockExplorer(problem,tasks,placed,preparations,meals,ledger);const candidates:ExactSetupBlockCandidate[]=[];for(let c=explorer.nextCandidate();c;c=explorer.nextCandidate())if(!countOnly)candidates.push(c);
  candidates.sort((a,b)=>a.cost-b.cost||(b.tasks[0]?.start??0)-(a.tasks[0]?.start??0)||signature(a).localeCompare(signature(b)));
  return {outcome:explorer.exhausted?"BUDGET_EXHAUSTED":"COMPLETE",candidates,evidence:explorer.evidence};
}
export function probeExactSetupMacroDomain(problem:PlannerNextProblem,tasks:Task[],placed:ScheduledTask[],preparations:ScheduledSetupPreparation[],meals:ScheduledSpaceMeal[]):ExactSetupMacroDomain{
  // Gapped geometries are combinatorial. MRV only needs a conservative class
  // measure here; exact enumeration belongs to the shared-ledger child explorer.
  const starts=Math.max(0,Math.floor((problem.day.end-problem.day.start)/5));
  const families=new Set(tasks.flatMap(t=>t.setupFamilyId?[t.setupFamilyId]:[])).size;
  const orders=problem.spaces.find(s=>s.id===tasks[0]?.spaceId)?.setupPolicy?.flexibleFamilyOrder?Math.max(1,families):1;
  return{domainSize:starts*orders,structuralCandidateCount:starts,matchingFeasibleCandidateCount:0,domainExact:false};
}
