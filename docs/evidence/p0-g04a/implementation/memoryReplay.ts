/** Diagnostic replay only: no DB writes, no placements fed into a product run. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../../engine/planner-next/integration/engineInputAdapter';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../../server/assistedScopeResolver';
import {buildAssistedProblem,executeAssistedPlanning} from '../../../../engine/planner-next/assistedPlanning';
process.env.SUPABASE_URL='http://127.0.0.1:1';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-evidence';process.env.SUPABASE_ANON_KEY='isolated-evidence';
const {materializeAssistedSnapshotOccupations}=await import('../../../../server/assistedProposalService');
const native=process.argv[2],out=process.argv[3];mkdirSync(out,{recursive:true});
const old=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-g04a/probe/receipts.json.gz')).toString());
const read=(name:string)=>JSON.parse(readFileSync(`${native}/${name}.json`,'utf8'));
const save=(name:string,v:any)=>writeFileSync(`${out}/${name}.json`,JSON.stringify(v,null,2));
const persisted=(v:any)=>JSON.parse(JSON.stringify(v));
const a=adapt(old['input.json']);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('adapter');
const eligible=analyticalFutureEligibleTaskIds(old['input.json'],a.identityMap);
const first=executeAssistedPlanning(buildAssistedProblem(a.problem,old['scope.json'].scope,[],eligible));
assert.equal(first.evidence.work.branchesExplored,3420);assert.deepEqual(persisted(first.proposal),old['run.json'].proposal);
assert.deepEqual(persisted(first.evidence.nominalPhysicalFutureWitness),old['run.json'].evidence.nominalPhysicalFutureWitness);
const second=executeAssistedPlanning(buildAssistedProblem(a.problem,old['continuation.json'].scope.scope,first.proposal!,eligible));
assert.equal(second.evidence.work.branchesExplored,1377);assert.deepEqual(persisted(second.proposal),old['continuation.json'].result.proposal);
save('original-first',first);save('original-continuation',second);
const input=read('macro-input'),b=adapt(input);assert.equal(b.status,'SUPPORTED');if(b.status!=='SUPPORTED')throw Error('adapter');
const stage=read('macro-S1-sql').snapshot_json,run=read('macro-S1-run').assisted_result_json,expected=read('macro-S2-run').assisted_result_json;
const fixed=materializeAssistedSnapshotOccupations(b.problem,b.identityMap,stage);
const scope=resolveAssistedScope(input,b,{kind:'TASK_IDS',taskIds:stage.tasks.filter((t:any)=>!t.startPlanned).map((t:any)=>t.taskId)});
const future=analyticalFutureEligibleTaskIds(input,b.identityMap),rows=[];
for(const lineage of [false,true]){
 const problem=buildAssistedProblem(b.problem,scope.scope,fixed.protectedPlacements,future,fixed.protectedOperationalMeals,fixed.protectedSetupPreparations,fixed.protectedParticipantMeals,fixed.protectedRoundPreparations,lineage?run.evidence.futureStructuralWitnesses:[]);
 const result=executeAssistedPlanning(problem);save(lineage?'native-with-lineage':'native-without-lineage',{problem,result});
 if(lineage){assert.equal(result.evidence.work.branchesExplored,expected.evidence.work.branchesExplored);assert.deepEqual(persisted(result.evidence.nominalPhysicalFutureWitness),expected.evidence.nominalPhysicalFutureWitness);}
 rows.push({lineage,branches:result.evidence.work.branchesExplored,complete:!!result.proposal,priorWitnessKinds:problem.priorFutureStructuralWitnesses?.map(w=>w.kind)});
}
save('comparison',{status:'PASS',originalInputsAndProposalsExact:true,originalBranches:[3420,1377],nativeContinuation:rows,existingServiceLineageReused:true,productWrites:0});
