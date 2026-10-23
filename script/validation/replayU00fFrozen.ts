/** Current-code replay of frozen U00f inputs; historical native receipts stay untouched. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../../engine/planner-next/assistedPlanning';
import {validatePlan} from '../../engine/planner-next/validate';
import {analyticalFutureEligibleTaskIds} from '../../server/assistedScopeResolver';
process.env.SUPABASE_URL='http://127.0.0.1:1';
process.env.SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_ANON_KEY='offline-only';
globalThis.fetch=async()=>{throw Error('Network forbidden during frozen replay');};
const {materializeAssistedSnapshotOccupations}=await import('../../server/assistedProposalService');
const directory='docs/evidence/p0-u00f/implementation/native';
const read=(name:string)=>JSON.parse(readFileSync(resolve(directory,name),'utf8'));
const prior=JSON.parse(readFileSync('docs/evidence/p0-u00f/implementation/product-verification.json','utf8'));
const days=['first','second'].map((label,index)=>{
 const adapter=adaptEngineInputToPlannerNextProblem(read(`${label}-input.json`));
 assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('unsupported');
 const result=executeAssistedPlanning(buildAssistedProblem(adapter.problem,createPlanningScope({kind:'DAY',value:'frozen replay'},{},adapter.problem.tasks.map(t=>t.id)),[]));
 assert.equal(result.evidence.completeForScope,true);assert.equal(result.evidence.fingerprint,prior.days[index].proposalFingerprint);
 assert.deepEqual(result.evidence.work,prior.days[index].work);
 assert.equal(validatePlan(adapter.problem,[...result.proposal!]).hardValid,true);
 return {label,obligations:result.proposal!.length,fingerprint:result.evidence.fingerprint,work:result.evidence.work};
});
const input=read('first-input.json'),adapter=adaptEngineInputToPlannerNextProblem(input);
if(adapter.status!=='SUPPORTED')throw Error('unsupported');
const base=read('protected-base-stage.json');
const fixed=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,base.activeStage.snapshotJson).protectedPlacements;
const pending=adapter.problem.tasks.filter(t=>!fixed.some(p=>p.id===t.id)).map(t=>t.id);
const replays=[false,true].map((warm,index)=>{
 const run=()=>executeAssistedPlanning(buildAssistedProblem(adapter.problem,createPlanningScope({kind:'TASK_IDS',value:'protected replay'},{},pending),fixed,
  analyticalFutureEligibleTaskIds(input,adapter.identityMap),[],[],[],[],warm?read('protected-base-run.json').assisted_result_json.evidence.futureStructuralWitnesses:[]));
 const a=run(),b=run();assert.equal(a.evidence.completeForScope,true);assert.deepEqual(a.proposal,b.proposal);
 assert.equal(a.evidence.fingerprint,b.evidence.fingerprint);assert.equal(a.evidence.fingerprint,prior.protectedReplays[index].fingerprint);
 assert.deepEqual(a.evidence.work,prior.protectedReplays[index].work);assert.deepEqual(a.proposal,prior.protectedReplays[index].proposal);
 assert.equal(validatePlan(adapter.problem,[...fixed,...a.proposal!]).hardValid,true);
 return {warm,protected:fixed.length,fingerprint:a.evidence.fingerprint,work:a.evidence.work};
});
const report={status:'PASS',mode:'CURRENT_CODE_FROZEN_INPUT_REPLAY_NOT_NATIVE_ACCEPTANCE',days,replays,
 historicalReceiptSha256:createHash('sha256').update(readFileSync('docs/evidence/p0-u00f/implementation/product-verification.json')).digest('hex')};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2));console.log(JSON.stringify(report));
