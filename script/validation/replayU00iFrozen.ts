/** Fresh-process replay of persisted native inputs and accepted snapshots. No IO to services. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../../engine/planner-next/assistedPlanning';
import {analyticalFutureEligibleTaskIds} from '../../server/assistedScopeResolver';
process.env.SUPABASE_URL='http://127.0.0.1:1';process.env.SUPABASE_ANON_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY='offline';
globalThis.fetch=async()=>{throw Error('Network forbidden in nominal replay');};
const {materializeAssistedSnapshotOccupations,assertNominalProposalWitness}=await import('../../server/assistedProposalService');
const directory=resolve(process.argv[2]),read=(name:string)=>JSON.parse(readFileSync(resolve(directory,name+'.json'),'utf8'));
const cases=[];
for(const label of ['A','B']){
  const input=read(`${label}-input`),adapter=adaptEngineInputToPlannerNextProblem(input);assert.equal(adapter.status,'SUPPORTED');
  if(adapter.status!=='SUPPORTED')throw Error('unsupported');
  for(let stage=1;stage<=(label==='A'?1:2);stage++){
    const prior=read(`${label}-S${stage}-run`).assisted_result_json;
    const base=read(`${label}-S${stage}-draft`).activeStage.snapshotJson;
    const fixed=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,base).protectedPlacements;
    const ids=prior.scopeTaskIds.map((id:number)=>adapter.identityMap.find(item=>item.namespace==='task'&&Number(item.sourceId)===id)!.canonicalId);
    const result=executeAssistedPlanning(buildAssistedProblem(adapter.problem,createPlanningScope({kind:'TASK_IDS',value:'cold persisted replay'},{},ids),fixed,
      analyticalFutureEligibleTaskIds(input,adapter.identityMap)));
    assert.equal(result.evidence.completeForScope,true);assert.equal(result.evidence.fingerprint,prior.evidence.fingerprint);
    assert.deepEqual(result.evidence.work,prior.evidence.work);
    assert.deepEqual(result.evidence.nominalPhysicalFutureWitness,prior.evidence.nominalPhysicalFutureWitness);
    assertNominalProposalWitness(input,prior.proposedDraftSnapshot,prior);
    cases.push({label,stage,fingerprint:result.evidence.fingerprint,work:result.evidence.work,protected:fixed.length,physicalWitnessIdentical:true});
  }
}
const report={status:'PASS',mode:'COLD_PERSISTED_REPLAY_NO_NETWORK',cases};
if(process.argv[3])writeFileSync(resolve(process.argv[3]),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
