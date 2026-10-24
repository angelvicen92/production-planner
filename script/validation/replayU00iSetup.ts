/** Same captured UI authorities, replayed in archived base and candidate. No ID normalization. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../../engine/planner-next/assistedPlanning';
import {validatePlan} from '../../engine/planner-next/validate';
process.env.SUPABASE_URL='http://127.0.0.1:1';
process.env.SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_ANON_KEY='offline-only';
globalThis.fetch=async()=>{throw Error('Network forbidden during frozen replay');};
const [directory,destination]=process.argv.slice(2);
const read=(name:string)=>JSON.parse(readFileSync(resolve(directory,name),'utf8'));
const days=['setup','explicit'].map(label=>{
  const adapter=adaptEngineInputToPlannerNextProblem(read(`${label}-input.json`));
  assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('unsupported');
  const original=read(`${label}-preflight.json`);
  assert.deepEqual(adapter.problem,original.problem);assert.deepEqual(adapter.identityMap,original.identityMap);
  const run=(ids=adapter.problem.tasks.map(t=>t.id),fixed:Parameters<typeof buildAssistedProblem>[2]=[])=>
    executeAssistedPlanning(buildAssistedProblem(adapter.problem,createPlanningScope({kind:'DAY',value:'frozen setup'},{},ids),fixed));
  const result=run(),prior=read(`${label}-replay.json`).a;
  assert.equal(result.evidence.completeForScope,true);assert.deepEqual(result.proposal,prior.proposal);
  assert.equal(result.evidence.fingerprint,prior.evidence.fingerprint);assert.deepEqual(result.evidence.work,prior.evidence.work);
  assert.equal(validatePlan(adapter.problem,[...result.proposal!],[...(result.evidence.selectedSetupPreparations??[])]).hardValid,true);
  const firstFamily=adapter.problem.spaces.find(space=>space.setupPolicy)!.setupPolicy!.familyOrder![0];
  const fixed=result.proposal!.filter(task=>task.setupFamilyId===firstFamily);
  const pending=adapter.problem.tasks.filter(task=>task.setupFamilyId!==firstFamily).map(task=>task.id);
  const continuation=run(pending,fixed);
  assert.equal(continuation.evidence.completeForScope,true);assert.equal(continuation.evidence.protectedPlacementsPreserved,true);
  return {label,problemFingerprint:adapter.problemFingerprint,identityMapFingerprint:adapter.identityMapFingerprint,
    proposal:result.proposal,proposalFingerprint:result.evidence.fingerprint,work:result.evidence.work,
    preparations:result.evidence.selectedSetupPreparations,continuation};
});
writeFileSync(destination,JSON.stringify({status:'PASS',days},null,2));
