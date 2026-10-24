import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fingerprint} from '../fingerprint';
// Pure service revalidation still imports the server clients. Keep this test
// self-contained and forbid every network request, even outside the full suite.
process.env.SUPABASE_URL='http://127.0.0.1:1';
process.env.SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_ANON_KEY='offline-only';
globalThis.fetch=async()=>{throw Error('Network forbidden during witness validation test');};
const {assertNominalProposalWitness}=await import('../../../server/assistedProposalService');
const read=(name:string)=>JSON.parse(readFileSync(`docs/evidence/p0-u00i/implementation/causal-sql-boundary/${name}.json`,'utf8'));
test('canonical validation rechecks a stored physical witness without another search',()=>{
  const input=read('A-input'),result=read('A-S1-run').assisted_result_json,draft=read('A-S1-draft').draft;
  assert.doesNotThrow(()=>assertNominalProposalWitness(input,draft,result));
});
for(const guard of ['omitted choice','future resource omitted','invented alternative','future identity omitted','collision with critical future'])test(`persisted witness rejects ${guard}, even with recalculated certificate hash`,()=>{
  const input=read('A-input'),result=read('A-S1-run').assisted_result_json,draft=read('A-S1-draft').draft;
  const proof=result.evidence.nominalPhysicalFutureWitness,flex=proof.tasks.find((task:any)=>task.nominalResourceChoice),critical=proof.tasks.find((task:any)=>!task.nominalResourceChoice);
  if(guard==='omitted choice')flex.requiredResourceIds=[];
  if(guard==='future resource omitted')critical.requiredResourceIds=[];
  if(guard==='invented alternative')flex.nominalResourceChoice.selectedResourceId='plan-resource:999';
  if(guard==='future identity omitted')proof.tasks=proof.tasks.filter((task:any)=>task!==critical);
  if(guard==='collision with critical future'){
    flex.requiredResourceIds=[...critical.requiredResourceIds];flex.nominalResourceChoice.selectedResourceId=critical.requiredResourceIds[0];
    draft.tasks.find((row:any)=>`task:${row.taskId}`===flex.id).assignedResourceIds=[Number(critical.requiredResourceIds[0].split(':')[1])];
  }
  proof.fingerprint=fingerprint(proof.tasks);
  assert.throws(()=>assertNominalProposalWitness(input,draft,result),/INVALID_NOMINAL_PHYSICAL_WITNESS/);
});
