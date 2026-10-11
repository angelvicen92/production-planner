import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync,readFileSync,existsSync } from 'node:fs';
import { runA2Assist8Evidence } from '../../server/benchmarks/runA2Assist8Evidence';
import { buildCanonicalA2AssistedStage1Fixture } from '../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture';
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1, type AssistedPlanningSnapshotV1 } from '../../server/assistedPlanningSnapshot';
import { revalidateJointCompletionWitness } from '../../engine/planner-next/jointCompletionWitness';
import { validatePlan } from '../../engine/planner-next/validate';
import { materializeScheduledItinerantUnitMeals } from '../../engine/planner-next/itinerantUnitMeals';
import { PreparedFutureCollectiveParticipantClosure } from '../../engine/planner-next/futureCollectiveParticipantClosure';
import type { FutureJointCompletionWitnessV1 } from '../../engine/planner-next/anonymousPipelineWitness';

const directory=process.argv[2]??'work/a2-demo'; mkdirSync(directory,{recursive:true});
const fixture=buildCanonicalA2AssistedStage1Fixture(100_000,711);
const {input,adapter,canonical}=fixture;
const blank=buildAssistedPlanningSnapshotV1(input.tasks.map(t=>({id:t.id,startPlanned:null,endPlanned:null,zoneId:t.zoneId??null,spaceId:t.spaceId??null})));
const digest=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const headPointer=readFileSync('.git/HEAD','utf8').trim();
const ref=headPointer.startsWith('ref: ')?headPointer.slice(5):null;
const head=ref?(existsSync(`.git/${ref}`)?readFileSync(`.git/${ref}`,'utf8').trim():readFileSync('.git/packed-refs','utf8').split('\n').find(line=>line.endsWith(` ${ref}`))?.split(' ')[0]):headPointer;
assert.ok(head,'cannot identify checkout HEAD');
writeFileSync(`${directory}/dataset.json`,JSON.stringify({kind:'CANONICAL_DATASET_NO_SOLUTION',source:'A2-FULL-EXEC-001',input,identityMap:adapter.identityMap,emptySnapshot:blank},null,2));
const runs=[]; let stages:AssistedPlanningSnapshotV1[]=[]; let finalWitness:FutureJointCompletionWitnessV1|undefined;
for(let run=1;run<=2;run++){
 let snapshots:AssistedPlanningSnapshotV1[]=[];
 const start=performance.now();
 const result=process.argv.includes('--reuse')?JSON.parse(readFileSync(`${directory}/run${run}.json`,'utf8')):await runA2Assist8Evidence({reportIterationDurations:true,onAcceptedStage:s=>{snapshots.push(s);writeFileSync(`${directory}/snapshots${run}.json`,JSON.stringify(snapshots));}});
 if(process.argv.includes('--reuse'))snapshots=existsSync(`${directory}/snapshots${run}.json`)?JSON.parse(readFileSync(`${directory}/snapshots${run}.json`,'utf8')):result.iterations.map((r:any,i:number)=>{
  const rows=new Map(r.acceptedSnapshotAfter.map((t:any)=>[t.taskId,t]));
  const next=result.iterations[i+1];
  return buildAssistedPlanningSnapshotV1(blank.tasks.map(t=>({id:t.taskId,...t,...(rows.get(t.taskId) as object??{})})),undefined,r.proposedSnapshotOperationalMeals,
   next?.baseSnapshotSetupPreparations??r.baseSnapshotSetupPreparations,next?.baseSnapshotRoundPreparations??r.baseSnapshotRoundPreparations);
 });
 assert.equal(result.status,'PASS');assert.equal(result.stageCount,10);assert.equal(result.completedObligationCount,266);
 assert.ok(result.iterations[0].durationMs<=120_000,'S1 reference gate');
 const audit=result.iterations.map((r:any,i:number)=>{
  const witness=r.futureStructuralWitnesses.find((w:any)=>w.kind==='JOINT_COMPLETION') as FutureJointCompletionWitnessV1;
  assert.ok(witness,'complete canonical witness must be recorded');
  let charges=0; const consume=()=>charges<100_000?(charges++,true):false;
  const previous=i===0?blank:snapshots[i-1]!;
  const protectedIds=new Set(previous.tasks.filter(t=>t.startPlanned&&t.endPlanned).map(t=>`task:${t.taskId}`));
  const protectedTasks=witness.tasks.filter(t=>protectedIds.has(t.id));
  assert.equal(revalidateJointCompletionWitness(adapter.problem,witness,protectedTasks,consume),'PASS');
  const validation=validatePlan(adapter.problem,[...witness.tasks],[...witness.preparations],[...witness.spaceMeals],
   [...witness.participantMeals],[],materializeScheduledItinerantUnitMeals(adapter.problem),[...witness.roundPreparations],[...witness.operationalMeals]);
  assert.equal(validation.hardValid,true);assert.deepEqual(validation.violations,[]);
  const closure=new PreparedFutureCollectiveParticipantClosure(adapter.problem).evaluate([...witness.tasks],[...witness.participantMeals],consume,'CERTIFY');
  assert.equal(closure.certified,true);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(snapshots[i]!),r.acceptedStageFingerprint);
  assert.ok(r.acceptedStageProposalRunId!=null,'persisted proposalRunId');
  if(i===9)finalWitness=witness;
  return {stage:i+1,completed:r.completedObligationCount,newObligations:r.newObligationCount,scope:r.scopeSelector,
   durationMs:r.durationMs,branches:r.branchesExplored,configuredLedgerLimit:input.plannerNext?.searchBudget?.maxBranchExpansions,
   proposalRunId:r.acceptedStageProposalRunId,fingerprint:r.acceptedStageFingerprint,witnessFingerprint:witness.fingerprint,
   validation:'PASS',replay:'PASS',closure:'CERTIFIED',auditCharges:charges,protectedLiteral:true,supportingAccepted:r.acceptedSupportingPlacements.length};
 });
 const material={snapshots,scopes:audit.map((r:any)=>r.scope),fingerprint:result.deterministicFingerprint};
 runs.push({run,wallMs:result.iterations.reduce((n:number,r:any)=>n+r.durationMs,0),stages:audit,materialDigest:digest(material),finalFingerprint:result.deterministicFingerprint});
 writeFileSync(`${directory}/run${run}.json`,JSON.stringify(result));
 if(run===1)stages=[blank,...snapshots];
 else assert.equal(digest({snapshots,scopes:audit.map((r:any)=>r.scope),fingerprint:result.deterministicFingerprint}),runs[0]!.materialDigest);
}
assert.ok(finalWitness);
const merge=(rows:{start:number;end:number}[])=>{
 const out:{start:number;end:number}[]=[];for(const r of [...rows].sort((a,b)=>a.start-b.start)){
  const last=out.at(-1);if(last&&r.start<=last.end)last.end=Math.max(last.end,r.end);else out.push({start:r.start,end:r.end});
 }return out;
};
const occupancy=(rows:{start:number;end:number}[],windows:{start:number;end:number}[])=>{
 const intervals=merge(rows);const busy=intervals.reduce((n,r)=>n+r.end-r.start,0);
 const available=merge(windows).reduce((n,r)=>n+r.end-r.start,0);
 return {busyMinutes:busy,availableMinutes:available,utilization:available?busy/available:null,blocks:intervals.length,
  internalGapMinutes:intervals.length?intervals.at(-1)!.end-intervals[0]!.start-busy:0};
};
const resources=adapter.problem.resources.map(r=>({id:r.id,...occupancy(finalWitness!.tasks.filter(t=>t.requiredResourceIds?.includes(r.id)||t.coachId===r.id),r.availability)}));
const coaches=adapter.problem.coaches.map(c=>({id:c.id,...occupancy(finalWitness!.tasks.filter(t=>t.coachId===c.id),c.availability)}));
const spaces=adapter.problem.spaces.map(s=>({id:s.id,...occupancy(finalWitness!.tasks.filter(t=>t.spaceId===s.id),s.availability)}));
const participants=adapter.problem.participants.map(p=>({id:p.id,...occupancy([
 ...finalWitness!.tasks.filter(t=>t.participantId===p.id),...finalWitness!.participantMeals.filter(m=>m.participantId===p.id)],p.availability)}));
const mainTasks=finalWitness.tasks.filter(t=>t.kind==='main').sort((a,b)=>a.start-b.start);
const mainBreaks=finalWitness.operationalMeals.filter(m=>m.spaceIds.includes(adapter.problem.mainFlow.spaceId));
const main=occupancy([...mainTasks,...mainBreaks],adapter.problem.spaces.find(s=>s.id===adapter.problem.mainFlow.spaceId)!.availability);
const transport=Object.fromEntries(['arrival','departure'].map(direction=>{
 const policy=adapter.problem.transportPolicy![direction as 'arrival'|'departure'];
 const groups=new Map<number,string[]>();for(const id of policy.taskIds){const task=finalWitness!.tasks.find(t=>t.id===id)!;groups.set(task.start,[...(groups.get(task.start)??[]),id]);}
 return [direction,[...groups].sort(([a],[b])=>a-b).map(([start,ids])=>({start,count:ids.length,taskIds:ids}))];
}));
const cam1=input.planResourceItems.find(r=>r.name==='cam-1')!;const camRows=finalWitness.tasks.filter(t=>t.requiredResourceIds?.includes(`plan-resource:${cam1.id}`)).sort((a,b)=>a.start-b.start);
assert.equal(camRows.length,51);assert.ok(camRows.slice(1).every((t,i)=>camRows[i]!.end<=t.start));
const taskById=new Map([...canonical.taskId].map(([id,n])=>[n,canonical.expansion.tasks.find(t=>t.id===id)!]));
const uiTasks=input.tasks.map(t=>{const actual=finalWitness!.tasks.find(w=>w.id===`task:${t.id}`);return {...t,assignedResources:[...(actual?.requiredResourceIds??[]),...(actual?.coachId?[actual.coachId]:[])].map(id=>Number(id.split(':').at(-1))),startPlanned:null,endPlanned:null,template:{name:t.templateName,abbrev:t.templateName?.slice(0,5)}};});
const uiSpaces=adapter.problem.spaces.map((s,i)=>({id:Number(s.id.split(':').at(-1)),name:canonical.expansion.spaces[i]?.id??s.id,zoneId:input.planSpaceSettings?.[i]?.zoneId??null}));
const bundle={version:1,kind:'VERIFIED_SERVICE_REPLAY',database:'IN_MEMORY_NOT_SUPABASE',generatedAt:new Date().toISOString(),
 head,source:'canonicalFullA2EngineInput / A2-FULL-EXEC-001',
 input,sourceProblem:adapter.problem,finalWitness,stages,runs,
 plan:{workStart:input.workDay.start,workEnd:input.workDay.end,mealStart:input.meal?.start??null,mealEnd:input.meal?.end??null,mealMode:input.mealMode,dailyTasks:uiTasks},
 contestants:[...new Set(input.tasks.flatMap(t=>t.contestantId==null?[]:[t.contestantId]))].map(id=>({id,name:taskById.get(input.tasks.find(t=>t.contestantId===id)!.id)?.participantId??`Participante ${id}`})),
 spaces:uiSpaces,resources:input.planResourceItems.map(r=>({id:r.id,label:r.name,kind:'resource_item'})),
 metrics:{coverage:266,tasks:247,participantMeals:19,hardViolations:0,requiredViolations:0,cam1Tasks:51,cam1Overlaps:0,
  main,spaces,resources,coaches,participants,transport,operationalMeals:finalWitness.operationalMeals,
  definitions:{occupancy:'Union of occupied task intervals; denominator is configured availability, without deducting breaks.',
   internalGap:'Span from first start to last end minus union of intervals. Participant meals count as occupied. Includes transitions and authorized breaks; not avoidable waiting.',
   main:'Main tasks plus authorized Main meal. Zero internal gap means continuity across the authorized break.',
   coachFragmentation:'Union blocks separated by any positive gap. Coach internal gaps include lunch and transitions.'},humanComparison:'NOT_COMPUTED_NO_ALIGNED_REFERENCE'}};
writeFileSync(`${directory}/bundle.json`,JSON.stringify(bundle));
writeFileSync(`${directory}/summary.json`,JSON.stringify({kind:bundle.kind,database:bundle.database,head:bundle.head,runs,metrics:bundle.metrics,bundleSha256:digest(bundle)},null,2));
console.log(JSON.stringify({directory,runs:runs.map(r=>({run:r.run,wallMs:r.wallMs,s1Ms:r.stages[0]!.durationMs,digest:r.materialDigest})),finalFingerprint:runs[0]!.finalFingerprint}));
