import {readFileSync,writeFileSync} from 'node:fs';
import {buildCanonicalA2AssistedStage1Fixture} from '../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture';
import {engineTimeToMinute} from '../../engine/planner-next/integration/engineTime';
import {analyticParticipantMealDomain} from '../../engine/planner-next/participantMeals';
import {materializeItinerantUnitAssignment} from '../../engine/planner-next/itinerantUnitAssignment';
import {buildAssistedProblem} from '../../engine/planner-next/assistedPlanning';
import {resolveAssistedScope} from '../assistedScopeResolver';
import {exactTaskStartDomain,diagnoseTaskPlacement} from '../../engine/planner-next/placement';
export function diagnoseA2FutureWitnessSetClosure(){
const evidence=JSON.parse(readFileSync('docs/evidence/A2-ASSIST-8-assisted-completion.json','utf8'));
const {adapter,input}=buildCanonicalA2AssistedStage1Fixture();const problem=adapter.problem;
const last=evidence.iterations.at(-2),sourceById=new Map(problem.tasks.map(t=>[t.id,t]));
const state:import('../../engine/planner-next/contracts').ScheduledTask[]=last.acceptedSnapshotAfter.flatMap((row:any)=>{const source=sourceById.get(`task:${row.taskId}`);if(!source)return[];
 const task=row.itinerantTeamId?materializeItinerantUnitAssignment(problem,source,`itinerant-team:${row.itinerantTeamId}`)!:source;
 return[{...task,start:engineTimeToMinute(row.startPlanned),end:engineTimeToMinute(row.endPlanned)}];});
const blocked=evidence.iterations.at(-1);
const protectedMeals=blocked.baseSnapshotOperationalMeals.map((row:any)=>{const policy=problem.operationalMealPolicies!.find(p=>p.id===row.policyId)!;
 const start=engineTimeToMinute(row.startPlanned),end=engineTimeToMinute(row.endPlanned);return{id:policy.id,start,end,duration:end-start,resourceIds:policy.resourceIds,spaceIds:policy.spaceIds};});
const resolution=resolveAssistedScope(input,adapter,blocked.scopeSelector);
const assisted=buildAssistedProblem(problem,resolution.scope,state,new Set(input.tasks.filter(t=>t.status==='pending'||t.status==='interrupted').map(t=>`task:${t.id}`)),protectedMeals,blocked.searchProtectedSetupPreparations,[],blocked.searchProtectedRoundPreparations);
const causing=assisted.problem.tasks.find(t=>t.id===evidence.firstBlocker.participantMealPrune.causingTaskId)!;
const meal=problem.participantMeals!.find(m=>m.sourceTaskId===evidence.firstBlocker.participantMealPrune.blockingMealTaskId)!;
const domain=exactTaskStartDomain(assisted.problem,causing,state);
const out=assisted.problem.tasks.find(t=>assisted.problem.transportPolicy?.departure.taskIds.includes(t.id)&&t.participantId===causing.participantId)!;
const outDomain=exactTaskStartDomain(assisted.problem,out,state);
const outLatest=[...outDomain.starts()].at(-1);
const values=[...domain.starts()].map(start=>({start,mealDomain:analyticParticipantMealDomain(problem,meal,[...state,{...causing,start,end:start+causing.duration}])}));
const terminalIds=blocked.standaloneDiagnostic.terminalDeparturePrerequisiteTaskIds;
const closureDomains:Array<{id:string;duration:number;spaceId:string;starts:number[];rejectionBefore:unknown;predecessor:unknown}>=terminalIds.map((id:string)=>{const task=assisted.problem.tasks.find(t=>t.id===id)!;
 const ownMeal=problem.participantMeals!.find(m=>m.participantId===task.participantId)!;
 const starts=[...exactTaskStartDomain(assisted.problem,task,state).starts()].filter(start=>analyticParticipantMealDomain(problem,ownMeal,[...state,{...task,start,end:start+task.duration}]).validStarts>0);
 const earliest=starts[0];
 const rejectionBefore=earliest===undefined?null:diagnoseTaskPlacement(assisted.problem,task,earliest-5,state);
 const predecessor=rejectionBefore?.blockingPlacedTaskId?state.find((t:any)=>t.id===rejectionBefore.blockingPlacedTaskId):null;
 return {id,duration:task.duration,spaceId:task.spaceId,starts,rejectionBefore,predecessor};});
const slots=[...new Set(closureDomains.flatMap((row:any)=>row.starts))].sort((a,b)=>a-b);
const masks=closureDomains.map((row:any)=>row.starts.reduce((mask:bigint,start:number)=>mask|(BigInt(1)<<BigInt(slots.indexOf(start))),BigInt(0)));
const count=(mask:bigint)=>{let value=0;while(mask){mask&=mask-BigInt(1);value++;}return value;};
// Read-only Hall certificate over the measured equal-duration, one-space closure.
if(closureDomains.some((row:any)=>row.duration!==5||row.spaceId!==closureDomains[0].spaceId)||closureDomains.length>20)
 throw new Error('This fixture diagnosis requires one grid slot per closure task');
const unions:bigint[]=Array(1<<closureDomains.length).fill(BigInt(0));let best=0;
for(let subset=1;subset<unions.length;subset++){const low=subset&-subset,index=31-Math.clz32(low);
 unions[subset]=unions[subset^low]!|masks[index]!;
 if(count(unions[subset]!)<count(BigInt(subset))&&(!best||count(BigInt(subset))<count(BigInt(best))))best=subset;
}
const hallCertificate=best?{taskIds:closureDomains.filter((_:any,index:number)=>best&(1<<index)).map((row:any)=>row.id),
 taskCount:count(BigInt(best)),slotCount:count(unions[best]!),availableStarts:slots.filter((_:any,index:number)=>unions[best]!&(BigInt(1)<<BigInt(index)))}:null;
const result={hallCertificate,closureDomains,benchmark:'A2-FUTURE-WITNESS-SET-next-blocker',completed:evidence.completedObligationCount,branches:evidence.iterations.at(-1).branchesExplored,
 futureWitnessSetInvocations:evidence.iterations.at(-1).futureWitnessSet.futureWitnessSetSearchInvocations,
 terminalCompleteLeaves:evidence.iterations.at(-1).standaloneDiagnostic.standaloneCompleteLeafCount,
 out,outStarts:[...outDomain.starts()],outLatest,causingTask:causing,sourceTask:input.tasks.find(t=>`task:${t.id}`===causing.id),meal,
 protectedParticipantTasks:state.filter((t:any)=>t.participantId===causing.participantId),
 priorMealDomain:analyticParticipantMealDomain(problem,meal,state),candidateDomains:values};
return result;
}
if(import.meta.url===`file://${process.argv[1]}`){const result=diagnoseA2FutureWitnessSetClosure();
writeFileSync('docs/evidence/A2-FUTURE-WITNESS-SET-next-blocker.json',`${JSON.stringify(result,null,2)}\n`);
console.log(JSON.stringify(result.hallCertificate,null,2));}
