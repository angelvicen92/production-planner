import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { PlannerNextProblem, ScheduledOperationalMeal, ScheduledParticipantMeal, ScheduledRoundPreparation,
  ScheduledSetupPreparation, ScheduledTask, Task, ValidationSummary } from "../../engine/planner-next/contracts";
import { exactTaskStartDomain } from "../../engine/planner-next/placement";
import { participantMealCandidates, participantMealWitnessFingerprint } from "../../engine/planner-next/participantMeals";
import { materializeTerminalTransportDetailed, type DetailedTransportMaterialization } from "../../engine/planner-next/transportGrouping";
import { validatePlan } from "../../engine/planner-next/validate";
import { engineTimeToMinute } from "../../engine/planner-next/integration/engineTime";
import { runA2Assist8Evidence } from "./runA2Assist8Evidence";
import { buildCanonicalA2AssistedStage1Fixture } from "../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture";
import { buildAssistedPlanningSnapshotV1 } from "../assistedPlanningSnapshot";

export type ClosureProbeStatus="PASS"|"INFEASIBLE"|"BUDGET_EXHAUSTED"|"REJECT_MEAL_WITNESS";
type Edge={taskId:string;start:number};
export interface ClosureProbeEvidence {candidateEdges:number;matchingChecks:number;matchingTraversals:number;
  perfectMatchingsTried:number;rejectedMatchingsByOut:number;transportStates:number}
export interface ClosureProbeResult {status:ClosureProbeStatus;scheduledPrerequisites:ScheduledTask[];scheduledOut:ScheduledTask[];
  evidence:ClosureProbeEvidence;transport:DetailedTransportMaterialization|null;validation:ValidationSummary|null}

const edgeKey=({taskId,start}:Edge)=>`${taskId}\u0000${start}`;
const semanticTaskOrder=(problem:PlannerNextProblem,tasks:readonly Task[])=>[...tasks].sort((a,b)=>{
  const end=(task:Task)=>problem.participants.find(person=>person.id===task.participantId)?.availability.reduce((x,w)=>Math.max(x,w.end),-Infinity)??Infinity;
  return end(a)-end(b)||a.duration-b.duration||(a.participantId??"").localeCompare(b.participantId??"", "en");
});

/** Exact augmenting-path matching. Candidate order is chronological; IDs are only opaque edge keys. */
function perfectMatching(tasks:readonly Task[],domains:ReadonlyMap<string,readonly number[]>,forbidden:ReadonlySet<string>,
  evidence:ClosureProbeEvidence):ReadonlyMap<string,number>|null {
  const owner=new Map<number,string>(),assigned=new Map<string,number>();
  const augment=(taskId:string,seen:Set<number>):boolean=>{for(const start of domains.get(taskId)??[]){evidence.matchingChecks++;
    if(forbidden.has(edgeKey({taskId,start}))||seen.has(start))continue;seen.add(start);evidence.matchingTraversals++;
    const incumbent=owner.get(start);if(incumbent===undefined||augment(incumbent,seen)){owner.set(start,taskId);assigned.set(taskId,start);
      if(incumbent!==undefined)assigned.delete(incumbent);return true;}}return false;};
  for(const task of tasks)if(!augment(task.id,new Set()))return null;return assigned;
}

export function solveStageClosure(problem:PlannerNextProblem,protectedTasks:readonly ScheduledTask[],meals:readonly ScheduledParticipantMeal[],
  options:Readonly<{transport?:(problem:PlannerNextProblem,substantive:readonly ScheduledTask[],meals:readonly ScheduledParticipantMeal[])=>DetailedTransportMaterialization;
    setupPreparations?:readonly ScheduledSetupPreparation[];roundPreparations?:readonly ScheduledRoundPreparation[];
    operationalMeals?:readonly ScheduledOperationalMeal[];validate?:(tasks:ScheduledTask[])=>ValidationSummary}>={}):ClosureProbeResult {
  const outIds=new Set(problem.transportPolicy?.departure.taskIds??[]),protectedIds=new Set(protectedTasks.map(task=>task.id));
  const prerequisites=semanticTaskOrder(problem,problem.tasks.filter(task=>!protectedIds.has(task.id)&&!outIds.has(task.id)
    && (problem.transportPolicy?.departure.taskIds??[]).some(id=>problem.tasks.find(out=>out.id===id)?.dependencies.includes(task.id))));
  const mealBySource=new Map(meals.map(meal=>[meal.sourceTaskId,meal]));
  const domains=new Map<string,readonly number[]>();let candidateEdges=0;
  for(const task of prerequisites){const starts=[...exactTaskStartDomain(problem,task,[...protectedTasks],[]).starts()]
    .filter(start=>{const meal=mealBySource.get(task.dependencies.find(id=>mealBySource.has(id))??"");
      return (!meal||start>=meal.end)&&!meals.some(item=>item.participantId===task.participantId&&start<item.end&&item.start<start+task.duration);})
    .sort((a,b)=>a-b);domains.set(task.id,starts);candidateEdges+=starts.length;}
  const evidence:ClosureProbeEvidence={candidateEdges,matchingChecks:0,matchingTraversals:0,perfectMatchingsTried:0,rejectedMatchingsByOut:0,transportStates:0};
  const queue:ReadonlySet<string>[]=[new Set()],seen=new Set<string>();const transportFn=options.transport??materializeTerminalTransportDetailed;
  while(queue.length){const forbidden=queue.shift()!,forbiddenFingerprint=[...forbidden].sort().join("|");if(seen.has(forbiddenFingerprint))continue;seen.add(forbiddenFingerprint);
    const matching=perfectMatching(prerequisites,domains,forbidden,evidence);if(!matching)continue;
    evidence.perfectMatchingsTried++;const scheduled=prerequisites.map(task=>({...task,start:matching.get(task.id)!,end:matching.get(task.id)!+task.duration}));
    const transport=transportFn(problem,[...protectedTasks,...scheduled],meals);evidence.transportStates+=transport.evidence.directions.reduce((n,item)=>n+(item.statesExplored??0),0);
    if(transport.status==="BUDGET_EXHAUSTED")return {status:"BUDGET_EXHAUSTED",scheduledPrerequisites:scheduled,scheduledOut:[],evidence,transport,validation:null};
    if(transport.status==="FEASIBLE"){
      const all=[...protectedTasks,...scheduled,...transport.scheduled!];const validation=options.validate?.(all)
        ??validatePlan(problem,all,[...(options.setupPreparations??[])],[],[...meals],[],[],[...(options.roundPreparations??[])],[...(options.operationalMeals??[])]);
      if(validation.hardValid)return {status:"PASS",scheduledPrerequisites:scheduled,scheduledOut:transport.scheduled!,evidence,transport,validation};
    }
    evidence.rejectedMatchingsByOut++;for(const [taskId,start] of [...matching])queue.push(new Set([...forbidden,edgeKey({taskId,start})]));
  }
  return {status:"INFEASIBLE",scheduledPrerequisites:[],scheduledOut:[],evidence,transport:null,validation:null};
}

async function run(){const prior=JSON.parse(readFileSync("docs/evidence/A2-ASSIST-8-assisted-completion.json","utf8"));
  const prefix=prior.iterations?.find((item:any)=>item.ordinal===6);assert.equal(prefix?.acceptedSnapshotBefore?.length,75);
  const fixture=buildCanonicalA2AssistedStage1Fixture(6_000,711),acceptedPrefix=new Map(prefix.acceptedSnapshotBefore.map((row:any)=>[row.taskId,row]));
  const initialSnapshot=buildAssistedPlanningSnapshotV1(fixture.input.tasks.map(task=>({id:task.id,startPlanned:null,endPlanned:null,
    zoneId:task.zoneId??null,spaceId:task.spaceId??null,...(acceptedPrefix.get(task.id)??{})})),undefined,prefix.baseSnapshotOperationalMeals,
    prefix.baseSnapshotSetupPreparations,prefix.baseSnapshotRoundPreparations);
  let captured:any=null;const stop=Symbol("stage-209-captured");try{await runA2Assist8Evidence({branchBudget:6_000,initialSnapshot,onAcceptedStage:stage=>{
    if(stage.completedObligationCount===209){captured=stage;throw stop;}}});}catch(error){if(error!==stop)throw error;}assert.ok(captured,"real Assisted flow did not accept Stage 209");
  const problem=captured.problem as PlannerNextProblem,identityMap=captured.identityMap as any[];
  const canonical=(namespace:string,id:number|string)=>identityMap.find(item=>item.namespace===namespace&&String(item.sourceId)===String(id))?.canonicalId;
  const protectedTasks:ScheduledTask[]=captured.snapshot.tasks.flatMap((row:any)=>{if(!row.startPlanned||!row.endPlanned)return[];
    const id=canonical("task",row.taskId),task=problem.tasks.find(item=>item.id===id);if(!task)return[];
    const required=(row.assignedResourceIds??[]).map((value:number)=>canonical("plan-resource",value)).filter(Boolean);
    return [{...task,...(required.length?{requiredResourceIds:required}:{}),start:engineTimeToMinute(row.startPlanned),end:engineTimeToMinute(row.endPlanned)}];});
  const meals=[...(captured.evidence.selectedMealWitnesses?.participant?.scheduled??[])] as ScheduledParticipantMeal[];
  const pendingMealSources=new Set((problem.participantMeals??[]).filter(meal=>!protectedTasks.some(task=>task.id===meal.sourceTaskId)).map(meal=>meal.sourceTaskId));
  const witness=meals.filter(meal=>pendingMealSources.has(meal.sourceTaskId));
  let accepted:ScheduledParticipantMeal[]=[];for(const meal of witness){const obligation=problem.participantMeals?.find(item=>item.sourceTaskId===meal.sourceTaskId);
    const exact=obligation&&participantMealCandidates(problem,obligation,protectedTasks,accepted).find(item=>item.start===meal.start&&item.end===meal.end);
    if(!exact){console.log(JSON.stringify({status:"REJECT_MEAL_WITNESS",sourceTaskId:meal.sourceTaskId,cause:"CANONICAL_PARTICIPANT_MEAL_CANDIDATE_REJECTED"}));return;}accepted=[...accepted,meal];}
  if(witness.length!==pendingMealSources.size){console.log(JSON.stringify({status:"REJECT_MEAL_WITNESS",cause:"WITNESS_CARDINALITY",expected:pendingMealSources.size,actual:witness.length}));return;}
  const result=solveStageClosure(problem,protectedTasks,witness);
  if(result.status==="PASS")assert.equal(witness.length+result.scheduledPrerequisites.length+result.scheduledOut.length,57,"closure must contain exactly 57 obligations");
  const rows=result.status==="PASS"?result.scheduledPrerequisites.map(prerequisite=>{const participantId=prerequisite.participantId!;
    const last=[...protectedTasks].filter(task=>task.participantId===participantId).sort((a,b)=>b.end-a.end)[0]!;
    const meal=witness.find(item=>item.participantId===participantId)!;const out=result.scheduledOut.find(item=>item.participantId===participantId)!;
    const direction=result.transport!.evidence.directions.find(item=>item.direction==="departure")!;const group=direction.packetMembers.find(items=>items.includes(out.id))!;
    return {participantId,lastProtectedTaskId:last.id,start:last.start,end:last.end,mealSourceTaskId:meal.sourceTaskId,mealStart:meal.start,mealEnd:meal.end,
      departurePrerequisiteId:prerequisite.id,prerequisiteStart:prerequisite.start,prerequisiteEnd:prerequisite.end,OUTId:out.id,OUTStart:out.start,OUTEnd:out.end,
      OUTGroupStart:out.start,OUTGroupMembers:group};}):[];
  console.log(JSON.stringify({status:result.status,rows,summary:{mealWitnessFingerprint:participantMealWitnessFingerprint(witness),prerequisiteTaskCount:result.scheduledPrerequisites.length,
    ...result.evidence,transportAlgorithm:result.transport?.evidence.directions.map(item=>item.algorithm),transportGroupCount:result.transport?.evidence.directions.find(item=>item.direction==="departure")?.packetSizes.length,
    transportGroupSizes:result.transport?.evidence.directions.find(item=>item.direction==="departure")?.packetSizes,transportGroupStarts:result.transport?.evidence.directions.find(item=>item.direction==="departure")?.starts,
    finalValidationReasonCodes:result.validation?.reasonCodes??[]}},null,2));
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await run();
