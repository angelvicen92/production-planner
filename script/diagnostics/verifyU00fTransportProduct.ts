import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {createPlanningScope,buildAssistedProblem,executeAssistedPlanning} from '../../engine/planner-next/assistedPlanning';
import {validatePlan} from '../../engine/planner-next/validate';
import {analyticalFutureEligibleTaskIds} from '../../server/assistedScopeResolver';
import type {EngineInput} from '../../engine/types';
process.env.SUPABASE_URL='http://127.0.0.1:1';
process.env.SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_ANON_KEY='offline-evidence-only';
globalThis.fetch=async()=>{throw Error('Network IO forbidden in the U00f artifact verifier');};
const {materializeAssistedSnapshotOccupations}=await import('../../server/assistedProposalService');
const directory=resolve(process.argv[2]),destination=resolve(process.argv[3]);
const read=(name:string)=>JSON.parse(readFileSync(resolve(directory,name),'utf8'));
const integration=read('integration.json');assert.equal(integration.status,'PASS');
assert.equal(integration.journey.diagnosticOnly,false);assert.equal(integration.journey.intervention,null);
const days=['first','second'].map((label,index)=>{
 const input:EngineInput=read(`${label}-input.json`),adapter=adaptEngineInputToPlannerNextProblem(input);
 assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('Unsupported native input');
 const stage=read(`${label}-stage.json`),run=read(`${label}-run.json`).assisted_result_json;
 const occupations=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,stage.activeStage.snapshotJson);
 const validation=validatePlan(adapter.problem,occupations.protectedPlacements);
 assert.equal(validation.hardValid,true);assert.equal(stage.validation,null);
 assert.equal(occupations.protectedPlacements.length,index?9:8);
 assert.equal(run.evidence.completeForScope,true);assert.equal(run.evidence.hardValid,true);assert.equal(run.evidence.requiredValid,true);
 assert.equal(run.evidence.work.branchesExplored,run.evidence.work.coreBranches+run.evidence.work.standaloneBranches);
 const revision=read(`${label}-config-revisions.json`).find((row:any)=>Number(row.id)===Number(stage.currentConfigRevisionId));assert.ok(revision);
 const transport=revision.replay_snapshot_json.optimizerSnapshot.transport;
 for(const direction of ['arrival','departure'] as const)for(const field of ['MinimumGroupSize','MaximumGroupSize','GroupingTarget','MinGapMinutes'] as const)
  assert.equal(transport[`${direction}${field}`],input[`${direction}${field}`]);
 const scope=createPlanningScope({kind:'DAY',value:'native replay'},{},adapter.problem.tasks.map(task=>task.id));
 const a=executeAssistedPlanning(buildAssistedProblem(adapter.problem,scope,[])),b=executeAssistedPlanning(buildAssistedProblem(adapter.problem,scope,[]));
 assert.deepEqual(a.proposal,b.proposal);assert.equal(a.evidence.fingerprint,b.evidence.fingerprint);
 assert.equal(a.evidence.completeForScope,true);assert.equal(validatePlan(adapter.problem,[...a.proposal!]).hardValid,true);
 return {label,obligations:occupations.protectedPlacements.length,stageFingerprint:stage.activeStage.snapshotFingerprint,
  problemFingerprint:adapter.problemFingerprint,proposalFingerprint:a.evidence.fingerprint,work:a.evidence.work,validation,transport,replayDeterministic:true};
});
const input:EngineInput=read('first-input.json'),adapter=adaptEngineInputToPlannerNextProblem(input);
if(adapter.status!=='SUPPORTED')throw Error('Unsupported protected day');
const base=read('protected-base-stage.json'),complete=read('protected-complete-stage.json');
const fixed=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,base.activeStage.snapshotJson).protectedPlacements;
for(const row of base.activeStage.snapshotJson.tasks.filter((row:any)=>row.startPlanned))assert.deepEqual(complete.activeStage.snapshotJson.tasks.find((item:any)=>item.taskId===row.taskId),row);
const ids=new Set(fixed.map(task=>task.id)),pending=adapter.problem.tasks.filter(task=>!ids.has(task.id)).map(task=>task.id);
const scope=createPlanningScope({kind:'TASK_IDS',value:'protected replay'},{},pending);
const prior=read('protected-base-run.json').assisted_result_json.evidence.futureStructuralWitnesses;
const replays=[false,true].map(warm=>{
 const execute=()=>executeAssistedPlanning(buildAssistedProblem(adapter.problem,scope,fixed,
  analyticalFutureEligibleTaskIds(input,adapter.identityMap),[],[],[],[],warm?prior:[]));
 const a=execute(),b=execute();assert.equal(a.evidence.completeForScope,true);assert.equal(a.evidence.protectedPlacementsPreserved,true);
 assert.deepEqual(a.proposal,b.proposal);assert.equal(a.evidence.fingerprint,b.evidence.fingerprint);
 assert.equal(validatePlan(adapter.problem,[...fixed,...a.proposal!]).hardValid,true);
 return {warm,protected:fixed.length,proposal:a.proposal,fingerprint:a.evidence.fingerprint,work:a.evidence.work,deterministic:true};
});
assert.equal(read('first-after-general-change-preflight.json').problemFingerprint,days[0].problemFingerprint);
for(const [file,hash] of Object.entries(integration.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),hash,`Source changed: ${file}`);
const report={status:'PASS',remoteWrites:0,days,protectedReplays:replays,sourceHashes:integration.sourceHashes,
 negativeChecks:integration.journey.checks.filter((text:string)=>text.includes('rejects')),nativeStartedAt:integration.startedAt,nativeFinishedAt:integration.finishedAt};
writeFileSync(destination,JSON.stringify(report,null,2));console.log(JSON.stringify({status:'PASS',days:days.map(day=>day.obligations),protected:fixed.length,coldAndWarm:true}));
