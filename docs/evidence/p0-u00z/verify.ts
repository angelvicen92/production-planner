/** Cold replay uses each day's own opaque policy identities and exact revision. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
for(const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[key];
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_ANON_KEY:'isolated-evidence',SUPABASE_SERVICE_ROLE_KEY:'isolated-evidence'});
const {adaptEngineInputToPlannerNextProblem:adapt}=await import('../../../engine/planner-next/integration/engineInputAdapter');
const {materializeAssistedSnapshotOccupations,assertNominalProposalWitness}=await import('../../../server/assistedProposalService');
const {resolveAssistedScope,expandVisiblePrerequisites,analyticalFutureEligibleTaskIds}=await import('../../../server/assistedScopeResolver');
const {buildAssistedProblem,executeAssistedPlanning}=await import('../../../engine/planner-next/assistedPlanning');
const {validatePlan}=await import('../../../engine/planner-next/validate');
const {applyDailyOperationalMeals}=await import('../../../server/operationalMealPolicy');
const {projectEffectiveAuthoritiesFromEngineInputV1,buildEffectivePlanConfigRevisionV1}=await import('../../../server/effectivePlanConfigRevision');
const {buildEffectivePlanConfigReplaySnapshotV1}=await import('../../../server/assistedPlanningConfigRevision');
const {fingerprintAssistedPlanningSnapshotV1}=await import('../../../server/assistedPlanningSnapshot');
const directories=process.argv.slice(2,4).map(d=>resolve(d)),output=resolve(process.argv[4]);
const read=(d:string,n:string)=>JSON.parse(readFileSync(join(d,'native',n+'.json'),'utf8'));
const results:any[]=[];
for(const label of ['A','B','D','C'])for(let ordinal=1;ordinal<=(label==='B'?2:1);ordinal++){
 const snapshots:any[]=[];
 for(const directory of directories){
  assert.equal(read(directory,'integration').status,'PASS');
  const input=read(directory,label+'-input'),ordinary=read(directory,label+'-ordinary-input'),row=read(directory,label+'-authority-row'),revision=read(directory,label+'-revision');
  const cold=applyDailyOperationalMeals(ordinary,row,revision.replay_snapshot_json);assert.deepEqual(JSON.parse(JSON.stringify(cold)),input);
  const identityInput={planId:input.planId,taskTemplateSnapshots:revision.replay_snapshot_json.taskTemplateSnapshots,optimizerSnapshot:revision.replay_snapshot_json.optimizerSnapshot,
   taskTemplateProvenance:revision.identity_json.components.find((c:any)=>c.authority==='task_templates').provenance,
   optimizerProvenance:revision.identity_json.components.find((c:any)=>c.authority==='optimizer').provenance,authorities:projectEffectiveAuthoritiesFromEngineInputV1(cold)};
  assert.deepEqual(buildEffectivePlanConfigReplaySnapshotV1(identityInput),revision.replay_snapshot_json);assert.deepEqual(buildEffectivePlanConfigRevisionV1(identityInput),revision.identity_json);
  const adapter=adapt(cold);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error();
  const run=read(directory,`${label}-S${ordinal}-run`),original=run.assisted_result_json,base=read(directory,ordinal===1?`${label}-S0`:`${label}-S${ordinal-1}-accepted`).activeStage.snapshotJson;
  const occupations=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,base);
  const initial=resolveAssistedScope(input,adapter,run.scope_json.selector),resolution=run.include_prerequisites?expandVisiblePrerequisites(input,initial,adapter):initial;
  const replay=executeAssistedPlanning(buildAssistedProblem(adapter.problem,resolution.scope,occupations.protectedPlacements,analyticalFutureEligibleTaskIds(input,adapter.identityMap),occupations.protectedOperationalMeals,occupations.protectedSetupPreparations,occupations.protectedParticipantMeals,occupations.protectedRoundPreparations));
  assert.equal(replay.evidence.fingerprint,original.evidence.fingerprint);assert.deepEqual(replay.evidence.work,original.evidence.work);
  const proof=replay.evidence.nominalPhysicalFutureWitness!;assert.deepEqual(JSON.parse(JSON.stringify(proof)),original.evidence.nominalPhysicalFutureWitness);
  assert.ok(validatePlan(adapter.problem,proof.tasks,proof.setupPreparations as any,proof.spaceMeals as any,proof.participantMeals as any,proof.resourceMeals as any,proof.itinerantUnitMeals as any,proof.roundPreparations as any,proof.operationalMeals as any).hardValid);
  const accepted=read(directory,`${label}-S${ordinal}-accepted`).activeStage;assertNominalProposalWitness(input,accepted.snapshotJson,original);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(accepted.snapshotJson),accepted.snapshotFingerprint);
  // Independent authorship generates different opaque IDs. Compare scope
  // identities by their explicit members/window/duration, never by names.
  const canonical=(policyId:string)=>{const p=input.operationalMealPolicies.find((p:any)=>'break:'+p.id===policyId);assert.ok(p);const {id,...scope}=p;return JSON.stringify(scope);};
  snapshots.push({...accepted.snapshotJson,...(accepted.snapshotJson.operationalMeals?{operationalMeals:accepted.snapshotJson.operationalMeals.map((m:any)=>({...m,policyId:canonical(m.policyId)})).sort((a:any,b:any)=>a.policyId.localeCompare(b.policyId))}:{})});
  results.push({label,ordinal,directory,exactColdRevision:true,exactColdWitness:true,work:replay.evidence.work,stageFingerprint:accepted.snapshotFingerprint});
 }
 assert.deepEqual(snapshots[0],snapshots[1],'same physical realization under independently authored policy identities');
}
writeFileSync(output,JSON.stringify({status:'PASS',coldReplays:results.length,twoDatabases:true,exactWithinEachAuthority:true,betweenDatabases:'Opaque policy IDs mapped bijectively by explicit physical scope; no other normalization',results},null,2));
console.log('PASS exact cold authorities, identity/replay, witness, work and Stage; independent databases preserve the same physical realization');
