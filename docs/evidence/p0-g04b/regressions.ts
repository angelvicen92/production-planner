/** Replay frozen, authentically authored controls on the candidate runtime. No new SQL Stages claimed. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {analyticalFutureEligibleTaskIds,resolveAssistedScope} from '../../../server/assistedScopeResolver';
import {buildAssistedProblem,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
process.env.SUPABASE_URL='http://127.0.0.1:1';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-evidence';process.env.SUPABASE_ANON_KEY='isolated-evidence';
const {materializeAssistedSnapshotOccupations}=await import('../../../server/assistedProposalService');
const out=process.argv[2];mkdirSync(out,{recursive:true});const rows=[];
const json=(v:any)=>JSON.parse(JSON.stringify(v));
for(const [name,file] of [['g04a','docs/evidence/p0-g04a/implementation/native-a/receipts.json.gz'],['g03e','docs/evidence/p0-g03e/native/receipts.json.gz']]){
 const frozen=JSON.parse(gunzipSync(readFileSync(file)).toString());
 for(const label of ['macro','generic']){
  const input=frozen[label+'-input.json'],adapter=adapt(input);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('adapter');
  const scope=frozen[label+'-peer-scopes.json'][0],eligible=analyticalFutureEligibleTaskIds(input,adapter.identityMap);
  const canonicalProposal=(expected:any)=>{const placed=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,expected.proposedDraftSnapshot).protectedPlacements;return expected.proposal.map((row:any)=>placed.find(t=>t.id==='task:'+row.taskId)!);};
  const first=executeAssistedPlanning(buildAssistedProblem(adapter.problem,scope.scope,[],eligible));
  const expected=frozen[label+'-S1-run.json'].assisted_result_json;
  assert.ok(first.proposal&&first.evidence.completeForScope);assert.deepEqual(json(first.proposal),json(canonicalProposal(expected)));assert.deepEqual(json(first.evidence.nominalPhysicalFutureWitness),expected.evidence.nominalPhysicalFutureWitness);
  assert.equal(first.evidence.work.branchesExplored,expected.evidence.work.branchesExplored);
  const stage=frozen[label+'-S1-sql.json'].snapshot_json,occupations=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,stage);
  const nextScope=resolveAssistedScope(input,adapter,{kind:'TASK_IDS',taskIds:stage.tasks.filter((t:any)=>!t.startPlanned).map((t:any)=>t.taskId)});
  const second=executeAssistedPlanning(buildAssistedProblem(adapter.problem,nextScope.scope,occupations.protectedPlacements,eligible,occupations.protectedOperationalMeals,occupations.protectedSetupPreparations,occupations.protectedParticipantMeals,occupations.protectedRoundPreparations,expected.evidence.futureStructuralWitnesses));
  const expectedSecond=frozen[label+'-S2-run.json'].assisted_result_json;
  assert.ok(second.proposal&&second.evidence.completeForScope);assert.deepEqual(json(second.proposal),json(canonicalProposal(expectedSecond)));assert.deepEqual(json(second.evidence.nominalPhysicalFutureWitness),expectedSecond.evidence.nominalPhysicalFutureWitness);assert.equal(second.evidence.work.branchesExplored,expectedSecond.evidence.work.branchesExplored);
  rows.push({name,label,obligations:input.tasks.length,proposalsExact:true,physicalWitnessesExact:true,branches:[first.evidence.work.branchesExplored,second.evidence.work.branchesExplored],protectedContinuationExact:true,newSQLStages:0});
 }
}
writeFileSync(out+'/comparison.json',JSON.stringify({status:'PASS_FROZEN_INPUT_REPLAY',rows,remoteWrites:0},null,2));console.log(JSON.stringify(rows));
