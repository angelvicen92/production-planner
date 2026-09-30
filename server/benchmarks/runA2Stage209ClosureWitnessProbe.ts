import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { PlannerNextProblem, ScheduledOperationalMeal, ScheduledParticipantMeal, ScheduledRoundPreparation,
  ScheduledSetupPreparation, ScheduledTask, Task, ValidationSummary } from "../../engine/planner-next/contracts";
import { canPlaceTask, exactTaskStartDomain } from "../../engine/planner-next/placement";
import { participantMealCandidates, participantMealWitnessFingerprint } from "../../engine/planner-next/participantMeals";
import { materializeTerminalTransportDetailed, type DetailedTransportMaterialization } from "../../engine/planner-next/transportGrouping";
import { validatePlan } from "../../engine/planner-next/validate";
import { engineTimeToMinute } from "../../engine/planner-next/integration/engineTime";
import { runA2Assist8Evidence } from "./runA2Assist8Evidence";
import { buildCanonicalA2AssistedStage1Fixture } from "../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture";
import { buildAssistedPlanningSnapshotV1 } from "../assistedPlanningSnapshot";

export type ClosureProbeStatus="PASS"|"INFEASIBLE"|"BUDGET_EXHAUSTED";
type Edge={taskId:string;start:number};
export interface ClosureProbeEvidence {candidateEdges:number;matchingChecks:number;matchingTraversals:number;
  perfectMatchingsTried:number;rejectedMatchingsByOut:number;transportStates:number;
  matchingAlgorithm:"BIPARTITE_UNIT_SLOTS"|"CONFLICT_AWARE_DFS";closureStates:number;
  futureOutChecks:number;futureOutPrunes:number;budgetLimit:number;budgetExhausted:boolean}
export interface ClosureProbeResult {status:ClosureProbeStatus;scheduledPrerequisites:ScheduledTask[];scheduledOut:ScheduledTask[];
  evidence:ClosureProbeEvidence;transport:DetailedTransportMaterialization|null;validation:ValidationSummary|null}

const edgeKey=({taskId,start}:Edge)=>`${taskId}\u0000${start}`;
const semanticTaskOrder=(problem:PlannerNextProblem,tasks:readonly Task[])=>[...tasks].sort((a,b)=>{
  const end=(task:Task)=>problem.participants.find(person=>person.id===task.participantId)?.availability.reduce((x,w)=>Math.max(x,w.end),-Infinity)??Infinity;
  return end(a)-end(b)||a.duration-b.duration||(a.participantId??"").localeCompare(b.participantId??"", "en");
});

/** Exact only for proven indivisible slots on one exclusive capacity. */
function perfectMatching(tasks:readonly Task[],domains:ReadonlyMap<string,readonly number[]>,forbidden:ReadonlySet<string>,
  evidence:ClosureProbeEvidence):ReadonlyMap<string,number>|null {
  const owner=new Map<number,string>(),assigned=new Map<string,number>();
  const augment=(taskId:string,seen:Set<number>):boolean=>{for(const start of domains.get(taskId)??[]){evidence.matchingChecks++;
    if(forbidden.has(edgeKey({taskId,start}))||seen.has(start))continue;seen.add(start);evidence.matchingTraversals++;
    const incumbent=owner.get(start);if(incumbent===undefined||augment(incumbent,seen)){owner.set(start,taskId);assigned.set(taskId,start);
      return true;}}return false;};
  // Insert least-urgent tasks first so later augmentations preserve the
  // earliest slots for the participant deadlines in semantic task order.
  for(const task of [...tasks].reverse())if(!augment(task.id,new Set()))return null;return assigned;
}

function earliestPerfectMatching(tasks:readonly Task[],domains:ReadonlyMap<string,readonly number[]>,forbidden:ReadonlySet<string>,
  evidence:ClosureProbeEvidence):ReadonlyMap<string,number>|null {
  let fixed=new Set(forbidden);
  for(const task of tasks){let selected:number|undefined;
    for(const start of domains.get(task.id)??[]){if(fixed.has(edgeKey({taskId:task.id,start})))continue;
      const rejectOther=(domains.get(task.id)??[]).filter(candidate=>candidate!==start).map(candidate=>edgeKey({taskId:task.id,start:candidate}));
      if(perfectMatching(tasks,domains,new Set([...fixed,...rejectOther]),evidence)){selected=start;fixed=new Set([...fixed,...rejectOther]);break;}
    }
    if(selected===undefined)return null;
  }
  return perfectMatching(tasks,domains,fixed,evidence);
}

const hasUnitSlotGeometry=(tasks:readonly Task[],domains:ReadonlyMap<string,readonly number[]>):boolean=>{
  if(tasks.length===0)return true;
  const duration=tasks[0]!.duration,spaceId=tasks[0]!.spaceId;
  if(!spaceId||tasks.some(task=>task.duration!==duration||task.spaceId!==spaceId))return false;
  const starts=[...new Set(tasks.flatMap(task=>[...(domains.get(task.id)??[])]))].sort((a,b)=>a-b);
  // A distinct slot must be incapable of overlapping another distinct slot.
  return starts.every((start,index)=>index===0||start-starts[index-1]!>=duration);
};

export function solveStageClosure(problem:PlannerNextProblem,protectedTasks:readonly ScheduledTask[],meals:readonly ScheduledParticipantMeal[],
  options:Readonly<{transport?:(problem:PlannerNextProblem,substantive:readonly ScheduledTask[],meals:readonly ScheduledParticipantMeal[])=>DetailedTransportMaterialization;
    setupPreparations?:readonly ScheduledSetupPreparation[];roundPreparations?:readonly ScheduledRoundPreparation[];
    operationalMeals?:readonly ScheduledOperationalMeal[];validate?:(tasks:ScheduledTask[])=>ValidationSummary;
    maxClosureStates?:number}>={}):ClosureProbeResult {
  const outIds=new Set(problem.transportPolicy?.departure.taskIds??[]),protectedIds=new Set(protectedTasks.map(task=>task.id));
  const mealSourceIds=new Set(meals.map(meal=>meal.sourceTaskId));
  const prerequisites=semanticTaskOrder(problem,problem.tasks.filter(task=>!protectedIds.has(task.id)&&!outIds.has(task.id)
    &&!mealSourceIds.has(task.id)
    && (problem.transportPolicy?.departure.taskIds??[]).some(id=>problem.tasks.find(out=>out.id===id)?.dependencies.includes(task.id))));
  const mealBySource=new Map(meals.map(meal=>[meal.sourceTaskId,meal]));
  const domains=new Map<string,readonly number[]>();let candidateEdges=0;
  for(const task of prerequisites){const starts=[...exactTaskStartDomain(problem,task,[...protectedTasks],[]).starts()]
    .filter(start=>{const meal=mealBySource.get(task.dependencies.find(id=>mealBySource.has(id))??"");
      return (!meal||start>=meal.end)&&!meals.some(item=>item.participantId===task.participantId&&start<item.end&&item.start<start+task.duration);})
    .sort((a,b)=>a-b);domains.set(task.id,starts);candidateEdges+=starts.length;}
  const unitSlots=hasUnitSlotGeometry(prerequisites,domains);
  const evidence:ClosureProbeEvidence={candidateEdges,matchingChecks:0,matchingTraversals:0,perfectMatchingsTried:0,rejectedMatchingsByOut:0,transportStates:0,
    matchingAlgorithm:unitSlots?"BIPARTITE_UNIT_SLOTS":"CONFLICT_AWARE_DFS",closureStates:0,futureOutChecks:0,futureOutPrunes:0,
    budgetLimit:options.maxClosureStates??50_000,budgetExhausted:false};
  const transportFn=options.transport??materializeTerminalTransportDetailed;
  const scheduledMealSources=meals.flatMap(meal=>{const source=problem.tasks.find(task=>task.id===meal.sourceTaskId);
    return source?[{...source,start:meal.start,end:meal.end}]:[];});
  const departureTasks=(problem.transportPolicy?.departure.taskIds??[]).map(id=>problem.tasks.find(task=>task.id===id)!).filter(Boolean);
  const relaxedDepartureDomains=new Map(departureTasks.map(task=>[task.id,new Set([...exactTaskStartDomain(problem,task,
    [...protectedTasks,...scheduledMealSources],[]).starts()])]));
  const earliestReady=new Map(departureTasks.map(out=>{const prerequisite=prerequisites.find(task=>task.participantId===out.participantId);
    const prerequisiteStart=prerequisite?domains.get(prerequisite.id)?.[0]:undefined;
    const priorEnds=[...protectedTasks,...scheduledMealSources].filter(task=>task.participantId===out.participantId).map(task=>task.end);
    return [out.id,Math.max(...priorEnds,prerequisiteStart===undefined?-Infinity:prerequisiteStart+prerequisite!.duration)] as const;}));
  const minimumDepartureGroup=problem.transportPolicy?.departure.minimumGroupSize??1;
  const futureOutFeasible=(scheduled:readonly ScheduledTask[]):boolean=>{evidence.futureOutChecks++;
    const placedByParticipant=new Map(scheduled.map(task=>[task.participantId!,task]));
    const ready=(out:Task)=>placedByParticipant.get(out.participantId!)?.end??earliestReady.get(out.id)??-Infinity;
    const possible=(out:Task,start:number)=>start>=ready(out)&&Boolean(relaxedDepartureDomains.get(out.id)?.has(start));
    const feasible=departureTasks.every(out=>[...(relaxedDepartureDomains.get(out.id)??[])].some(start=>possible(out,start)
      &&departureTasks.filter(partner=>possible(partner,start)).length>=minimumDepartureGroup));
    if(!feasible)evidence.futureOutPrunes++;return feasible;};
  const relaxedGroupImpossible=!futureOutFeasible([]);
  const tryScheduled=(scheduled:ScheduledTask[]):ClosureProbeResult|null=>{
    evidence.perfectMatchingsTried++;
    const transport=transportFn(problem,[...protectedTasks,...scheduledMealSources,...scheduled],meals);evidence.transportStates+=transport.evidence.directions.reduce((n,item)=>n+(item.statesExplored??0),0);
    if(transport.status==="BUDGET_EXHAUSTED")return {status:"BUDGET_EXHAUSTED",scheduledPrerequisites:scheduled,scheduledOut:[],evidence,transport,validation:null};
    if(transport.status==="INFEASIBLE"&&relaxedGroupImpossible)return {status:"INFEASIBLE",scheduledPrerequisites:scheduled,scheduledOut:[],evidence,transport,validation:null};
    if(transport.status==="FEASIBLE"){
      const all=[...protectedTasks,...scheduled,...transport.scheduled!];const validation=options.validate?.(all)
        ??validatePlan(problem,all,[...(options.setupPreparations??[])],[],[...meals],[],[],[...(options.roundPreparations??[])],[...(options.operationalMeals??[])]);
      if(validation.hardValid)return {status:"PASS",scheduledPrerequisites:scheduled,scheduledOut:transport.scheduled!,evidence,transport,validation};
    }
    evidence.rejectedMatchingsByOut++;return null;
  };
  if(unitSlots){
    const queue:ReadonlySet<string>[]=[new Set()],seen=new Set<string>();
    while(queue.length){if(++evidence.closureStates>evidence.budgetLimit){evidence.budgetExhausted=true;
        return {status:"BUDGET_EXHAUSTED",scheduledPrerequisites:[],scheduledOut:[],evidence,transport:null,validation:null};}
      const forbidden=queue.shift()!,fingerprint=[...forbidden].sort().join("|");if(seen.has(fingerprint))continue;seen.add(fingerprint);
      const matching=earliestPerfectMatching(prerequisites,domains,forbidden,evidence);if(!matching)continue;
      const scheduled=prerequisites.map(task=>({...task,start:matching.get(task.id)!,end:matching.get(task.id)!+task.duration}));
      if(!futureOutFeasible(scheduled)){for(const [taskId,start] of matching)queue.push(new Set([...forbidden,edgeKey({taskId,start})]));continue;}
      const result=tryScheduled(scheduled);if(result)return result;
      // Explore a genuinely different geometry before the exhaustive
      // single-edge exclusions (which often produce near-duplicates).
      queue.push(new Set([...forbidden,...[...matching].map(([taskId,start])=>edgeKey({taskId,start}))]));
      for(const [taskId,start] of matching)queue.push(new Set([...forbidden,edgeKey({taskId,start})]));
    }
  }else{
    const placed:ScheduledTask[]=[];
    const search=(index:number):ClosureProbeResult|null=>{
      if(++evidence.closureStates>evidence.budgetLimit){evidence.budgetExhausted=true;return null;}
      if(!futureOutFeasible(placed))return null;
      if(index===prerequisites.length)return tryScheduled([...placed]);
      const task=prerequisites[index]!;
      for(const start of domains.get(task.id)??[]){evidence.matchingChecks++;evidence.matchingTraversals++;
        const end=start+task.duration;
        if(meals.some(meal=>meal.participantId===task.participantId&&start<meal.end&&meal.start<end))continue;
        if(!canPlaceTask(problem,task,start,[...protectedTasks,...placed],[]))continue;
        placed.push({...task,start,end});const result=search(index+1);placed.pop();if(result||evidence.budgetExhausted)return result;
      }
      return null;
    };
    const result=search(0);if(result)return result;
  }
  if(evidence.budgetExhausted)return {status:"BUDGET_EXHAUSTED",scheduledPrerequisites:[],scheduledOut:[],evidence,transport:null,validation:null};
  return {status:"INFEASIBLE",scheduledPrerequisites:[],scheduledOut:[],evidence,transport:null,validation:null};
}

async function run(){const prior=JSON.parse(readFileSync("docs/evidence/A2-ASSIST-8-assisted-completion.json","utf8"));
  const prefix=prior.iterations?.find((item:any)=>item.ordinal===6);assert.equal(prefix?.acceptedSnapshotBefore?.length,75);
  const fixture=buildCanonicalA2AssistedStage1Fixture(6_000,711),acceptedPrefix=new Map(prefix.acceptedSnapshotBefore.map((row:any)=>[row.taskId,row]));
  const initialSnapshot=buildAssistedPlanningSnapshotV1(fixture.input.tasks.map(task=>({id:task.id,startPlanned:null,endPlanned:null,
    zoneId:task.zoneId??null,spaceId:task.spaceId??null,...(acceptedPrefix.get(task.id)??{})})),undefined,prefix.baseSnapshotOperationalMeals,
    prefix.baseSnapshotSetupPreparations,prefix.baseSnapshotRoundPreparations);
  const staged=await runA2Assist8Evidence({branchBudget:6_000,initialSnapshot,stopAfterIterationCount:4,reportIterationDurations:true});
  assert.deepEqual(staged.iterations.map((item:any)=>item.completedObligationCount),[111,169,207,209]);
  assert.deepEqual(staged.iterations.map((item:any)=>item.proposalOutcome),["PROPOSAL","PROPOSAL","PROPOSAL","PROPOSAL"]);
  const captured=staged.iterations[3]!;
  const problem=fixture.adapter.problem as PlannerNextProblem,identityMap=fixture.adapter.identityMap as any[];
  const canonical=(namespace:string,id:number|string)=>identityMap.find(item=>item.namespace===namespace&&String(item.sourceId)===String(id))?.canonicalId;
  const protectedTasks:ScheduledTask[]=captured.acceptedSnapshotAfter.flatMap((row:any)=>{if(!row.startPlanned||!row.endPlanned)return[];
    const id=canonical("task",row.taskId),task=problem.tasks.find(item=>item.id===id);if(!task)return[];
    const required=(row.assignedResourceIds??[]).map((value:number)=>canonical("plan-resource",value)).filter(Boolean);
    return [{...task,...(required.length?{requiredResourceIds:required}:{}),start:engineTimeToMinute(row.startPlanned),end:engineTimeToMinute(row.endPlanned)}];});
  const meals=[...(captured.acceptedMealWitnesses?.participant?.scheduled??[])] as ScheduledParticipantMeal[];
  const pendingMealSources=new Set((problem.participantMeals??[]).filter(meal=>!protectedTasks.some(task=>task.id===meal.sourceTaskId)).map(meal=>meal.sourceTaskId));
  const witness=meals.filter(meal=>pendingMealSources.has(meal.sourceTaskId));
  let accepted:ScheduledParticipantMeal[]=[];for(const meal of witness){const obligation=problem.participantMeals?.find(item=>item.sourceTaskId===meal.sourceTaskId);
    const exact=obligation&&participantMealCandidates(problem,obligation,protectedTasks,accepted).find(item=>item.start===meal.start&&item.end===meal.end);
    assert.ok(exact,`canonical participant-meal witness rejected for ${meal.sourceTaskId}`);accepted=[...accepted,meal];}
  assert.equal(witness.length,pendingMealSources.size,"participant-meal witness cardinality");
  const closureStartedAt=performance.now();
  const result=solveStageClosure(problem,protectedTasks,witness,{setupPreparations:[...captured.searchProtectedSetupPreparations,...captured.selectedSetupPreparations],
    roundPreparations:[...captured.searchProtectedRoundPreparations,...captured.selectedRoundPreparations],
    operationalMeals:captured.acceptedMealWitnesses?.operational?.scheduled??[]});
  const phaseDurationsMs={"75→111":staged.iterations[0]!.durationMs,"111→169":staged.iterations[1]!.durationMs,
    "169→207":staged.iterations[2]!.durationMs,"207→209":staged.iterations[3]!.durationMs,
    closureWitness:Math.round(performance.now()-closureStartedAt)};
  if(result.status==="PASS")assert.equal(witness.length+result.scheduledPrerequisites.length+result.scheduledOut.length,57,"closure must contain exactly 57 obligations");
  const rows=result.status==="PASS"?result.scheduledPrerequisites.map(prerequisite=>{const participantId=prerequisite.participantId!;
    const last=[...protectedTasks].filter(task=>task.participantId===participantId).sort((a,b)=>b.end-a.end)[0]!;
    const meal=witness.find(item=>item.participantId===participantId)!;const out=result.scheduledOut.find(item=>item.participantId===participantId)!;
    const direction=result.transport!.evidence.directions.find(item=>item.direction==="departure")!;const group=direction.packetMembers.find(items=>items.includes(out.id))!;
    const availabilityEnd=problem.participants.find(item=>item.id===participantId)!.availability.reduce((latest,item)=>Math.max(latest,item.end),-Infinity);
    return {participant:participantId,lastProtectedObligation:{id:last.id,start:last.start,end:last.end},Sodexo:{sourceTaskId:meal.sourceTaskId,start:meal.start,end:meal.end},
      departurePrerequisiteId:prerequisite.id,prerequisiteStart:prerequisite.start,prerequisiteEnd:prerequisite.end,OUTId:out.id,OUTStart:out.start,OUTEnd:out.end,
      OUTGroupStart:out.start,OUTGroupMembers:group,participantAvailabilityEnd:availabilityEnd};}):[];
  console.log(JSON.stringify({status:result.status,phaseDurationsMs,rows,summary:{mealWitnessFingerprint:participantMealWitnessFingerprint(witness),prerequisiteTaskCount:result.scheduledPrerequisites.length,
    ...result.evidence,transportAlgorithm:result.transport?.evidence.directions.map(item=>item.algorithm),transportGroupCount:result.transport?.evidence.directions.find(item=>item.direction==="departure")?.packetSizes.length,
    transportGroupSizes:result.transport?.evidence.directions.find(item=>item.direction==="departure")?.packetSizes,transportGroupStarts:result.transport?.evidence.directions.find(item=>item.direction==="departure")?.starts,
    finalValidationReasonCodes:result.validation?.reasonCodes??[]}},null,2));
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await run();
