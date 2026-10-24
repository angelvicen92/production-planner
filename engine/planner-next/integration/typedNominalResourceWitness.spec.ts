import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {fingerprint} from '../fingerprint';
process.env.SUPABASE_URL='http://127.0.0.1:1';process.env.SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_ANON_KEY='offline';
globalThis.fetch=async()=>{throw Error('Network forbidden during typed witness validation');};
const {assertNominalProposalWitness}=await import('../../../server/assistedProposalService');
const read=(name:string,gz=false)=>JSON.parse((gz?gunzipSync(readFileSync(`docs/evidence/p0-u00j/native/${name}.json.gz`)):readFileSync(`docs/evidence/p0-u00j/native/${name}.json`)).toString());
test('typed native persisted witness revalidates without searching',()=>{
 const input=read('A-input'),run=read('A-S1-run',true).assisted_result_json;
 assert.doesNotThrow(()=>assertNominalProposalWitness(input,read('A-S1-draft').draft,run));
});
for(const attack of ['type','domain','participant','selection','future','collision'])test(`typed witness rejects forged ${attack} with recalculated fingerprint`,()=>{
 const input=read('A-input'),result=read('A-S1-run',true).assisted_result_json,draft=read('A-S1-draft').draft;
 const proof=result.evidence.nominalPhysicalFutureWitness,flex=proof.tasks.find((t:any)=>t.nominalResourceChoice),critical=proof.tasks.find((t:any)=>!t.nominalResourceChoice);
 if(attack==='type')flex.nominalResourceChoice.requestedResourceTypeId='resource-type:2';
 if(attack==='domain')flex.nominalResourceChoice.resourceIds=[flex.nominalResourceChoice.selectedResourceId];
 if(attack==='participant')critical.participantId='participant:999';
 if(attack==='selection')flex.nominalResourceChoice.selectedResourceId=undefined;
 if(attack==='future')proof.tasks=proof.tasks.filter((t:any)=>t!==critical);
 if(attack==='collision'){
  flex.nominalResourceChoice.selectedResourceId=critical.requiredResourceIds[0];flex.requiredResourceIds=[...critical.requiredResourceIds];
  draft.tasks.find((t:any)=>`task:${t.taskId}`===flex.id).assignedResourceIds=critical.requiredResourceIds.map((id:string)=>Number(id.split(':')[1]));
 }
 proof.fingerprint=fingerprint(proof.tasks);assert.throws(()=>assertNominalProposalWitness(input,draft,result),/INVALID_NOMINAL_PHYSICAL_WITNESS/);
});
