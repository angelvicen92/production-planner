/** Fresh-process replay of captured product inputs and immutable Stage contexts. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
for(const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[key];
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_ANON_KEY:'isolated-evidence',SUPABASE_SERVICE_ROLE_KEY:'isolated-evidence'});
const {adaptEngineInputToPlannerNextProblem:adapt}=await import('../../../engine/planner-next/integration/engineInputAdapter');
const {materializeAssistedSnapshotOccupations}=await import('../../../server/assistedProposalService');
const {resolveAssistedScope,expandVisiblePrerequisites,analyticalFutureEligibleTaskIds}=await import('../../../server/assistedScopeResolver');
const {buildAssistedProblem,executeAssistedPlanning:execute}=await import('../../../engine/planner-next/assistedPlanning');
const {validatePlan}=await import('../../../engine/planner-next/validate');
const {fingerprint}=await import('../../../engine/planner-next/fingerprint');
const directories=process.argv.slice(2,4).map(d=>resolve(d)),output=resolve(process.argv[4]);
const read=(directory:string,name:string)=>JSON.parse(readFileSync(join(directory,'native',name+'.json'),'utf8'));
const results:any[]=[];
for(const label of ['choice','multi'])for(let stage=1;stage<=(label==='multi'?2:1);stage++){
 const snapshots:any[]=[],runs:any[]=[];
 for(const directory of directories){
  assert.equal(read(directory,'integration').status,'PASS');
  const input=read(directory,`${label}-input`),adapter=adapt(input);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('unsupported');
  const run=read(directory,`${label}-S${stage}-run`),original=run.assisted_result_json;
  const base=read(directory,stage===1?`${label}-S0`:`${label}-S${stage-1}-accepted`).activeStage.snapshotJson;
  const occupations=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,base);
  const resolution=expandVisiblePrerequisites(input,resolveAssistedScope(input,adapter,run.scope_json.selector),adapter);
  const replay=execute(buildAssistedProblem(adapter.problem,resolution.scope,occupations.protectedPlacements,
   analyticalFutureEligibleTaskIds(input,adapter.identityMap),occupations.protectedOperationalMeals,
   occupations.protectedSetupPreparations,occupations.protectedParticipantMeals,occupations.protectedRoundPreparations));
  assert.equal(replay.evidence.fingerprint,original.evidence.fingerprint);
  assert.deepEqual(replay.evidence.work,original.evidence.work);
  const witness=replay.evidence.nominalPhysicalFutureWitness!;
  const proof=original.evidence.nominalPhysicalFutureWitness;
  assert.deepEqual(JSON.parse(JSON.stringify(witness.tasks)),proof.tasks);
  for(const channel of ['setupPreparations','spaceMeals','participantMeals','resourceMeals','itinerantUnitMeals','roundPreparations','operationalMeals'] as const){assert.ok(Array.isArray(proof[channel]));assert.deepEqual(witness[channel],proof[channel]);}
  assert.equal(fingerprint([...witness.tasks]),original.evidence.nominalPhysicalFutureWitness.fingerprint);
  assert.equal(validatePlan(adapter.problem,[...witness.tasks],proof.setupPreparations,proof.spaceMeals,
   proof.participantMeals,proof.resourceMeals,proof.itinerantUnitMeals,proof.roundPreparations,proof.operationalMeals).hardValid,true);
  const accepted=read(directory,`${label}-S${stage}-accepted`).activeStage;
  snapshots.push(accepted.snapshotJson);runs.push({fingerprint:replay.evidence.fingerprint,work:replay.evidence.work,witness:witness.fingerprint,stageFingerprint:accepted.snapshotFingerprint});
 }
 assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(runs[0],runs[1]);results.push({label,stage,...runs[0]});
}
for(const directory of directories){
 const fixed=read(directory,'choice-native-fixed-B').run.assisted_result_json.proposal,automatic=read(directory,'choice-S1-run').assisted_result_json.proposal;
 const placements=(rows:any[])=>rows.map(t=>({id:t.taskId,start:t.startPlanned,end:t.endPlanned,unit:t.itinerantTeamId,resources:t.assignedResourceIds??[]}));
 assert.deepEqual(placements(fixed),placements(automatic));
}
writeFileSync(output,JSON.stringify({status:'PASS',remoteWrites:0,coldReplays:6,twoDatabases:true,stageSnapshotsExact:true,fixedBEqualsAutomatic:true,results},null,2));
console.log('PASS two databases, three exact Stages, six cold replays and physical witnesses');
