/** Counterfactual only: overlays a joint declaration, preserving the native window
 * on the real UI-created input. It cannot create a Draft, run or SQL Stage. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {EngineInput} from '../../../engine/types';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {buildAssistedProblem,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
import {certifyDailyTechnicalChain} from '../../../server/technicalChainCertificate';
import {jointCombinationSupported} from '../../../server/jointGroupStructure';
const dir=process.argv[2],native=process.argv[3];assert.ok(dir&&native);
const read=(name:string)=>JSON.parse(readFileSync(`${native}/${name}.json`,'utf8'));
const original:EngineInput=read('native-input'),input=structuredClone(original);
const groups=read('native-sql-readonly-rejection').structure.groups;
const canonical=!process.argv.includes('--unrestricted-eva');
input.dailyJointGroupsVersion=1;input.dailyJointGroups=groups;
for(const group of groups)for(const id of group.taskIds)input.tasks.find(t=>t.id===id)!.jointGroupId=group.id;
const reference=input.tasks.find(t=>t.id===input.technicalChains![0].phases![0][0])!;
const eva=input.planResourceItems.find(r=>reference.declaredResourceIds!.includes(r.id))!;assert.equal(eva.name,'EVA');
assert.equal(eva.availabilityStart,'16:00');assert.equal(eva.availabilityEnd,'21:00');
if(!canonical){eva.availabilityStart=null;eva.availabilityEnd=null;}
mkdirSync(dir,{recursive:true});const save=(n:string,v:unknown)=>writeFileSync(`${dir}/${n}.json`,JSON.stringify(v,null,2)+'\n');
assert.equal(jointCombinationSupported(input),false);assert.equal(input.tasks.length,65);
const taskChanges=input.tasks.filter((t,i)=>JSON.stringify(t)!==JSON.stringify(original.tasks[i])).map(t=>({id:t.id,fields:['jointGroupId']}));
assert.deepEqual(taskChanges.map(t=>t.id),groups[0].taskIds);
save('counterfactual',{nativeInputSha256:createHash('sha256').update(JSON.stringify(original)).digest('hex'),authorityFields:['dailyJointGroupsVersion','dailyJointGroups'],taskChanges,
 resourceChanges:canonical?[]:[{id:eva.id,fields:['availabilityStart','availabilityEnd'],start:null,end:null}],canonical,admission:false,persisted:false,sqlStage:false});save('input',input);
const a=adapt(input);save('adapter',a);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('adapter');
const s=resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:[groups[0].taskIds[1]]}),eligible=analyticalFutureEligibleTaskIds(input,a.identityMap);
const b=buildAssistedProblem(a.problem,s.scope,[],eligible);save('scope',s);save('problem',b);
const run=executeAssistedPlanning(b);save('run',run);const proof=run.evidence.nominalPhysicalFutureWitness;assert.ok(run.proposal&&proof);
const unchanged=JSON.stringify(proof),cert=certifyDailyTechnicalChain(a.problem,[...run.proposal],0,proof);save('certificate',cert);assert.equal(JSON.stringify(proof),unchanged);
assert.equal(run.proposal.length,8);assert.equal(proof.tasks.length,46);assert.equal((proof.participantMeals as any[]).length,19);assert.equal(cert?.status,'WITNESS');assert.equal(cert?.consumed,0);assert.deepEqual(run.evidence.acceptedSupportingPlacements,[]);
const evaTasks=proof.tasks.filter(t=>t.requiredResourceIds?.includes(`plan-resource:${eva.id}`));assert.equal(evaTasks.length,5);
assert.ok(canonical?evaTasks.every(t=>t.start>=960):evaTasks.some(t=>t.start<960));
const pending=input.tasks.filter(t=>!run.proposal!.some(p=>p.id===`task:${t.id}`)).map(t=>t.id);
const rest=resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:pending});
const second=executeAssistedPlanning(buildAssistedProblem(a.problem,rest.scope,run.proposal,eligible));save('continuation',second);assert.ok(second.proposal);
assert.equal(second.evidence.protectedPlacementsPreserved,true);
for(const t of run.proposal)assert.deepEqual(second.evidence.nominalPhysicalFutureWitness!.tasks.find(p=>p.id===t.id),t);
const summary={status:'MEMORY_WITNESS_ONLY',canonical,obligations:65,productive:46,meals:19,visibleObligations:8,physicalOperations:7,
 problemFingerprint:a.problemFingerprint,branches:run.evidence.work.branchesExplored,certificate:cert?.status,certificateSearch:cert?.consumed,protectedContinuation:true,
 firstEvaStart:Math.min(...evaTasks.map(t=>t.start)),acceptedStages:0};save('summary',summary);console.log(JSON.stringify(summary));
