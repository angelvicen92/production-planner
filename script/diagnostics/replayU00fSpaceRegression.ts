/** Replay the exact same frozen UI authorities in base and candidate. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../../engine/planner-next/assistedPlanning';
import {validatePlan} from '../../engine/planner-next/validate';
process.env.SUPABASE_URL='http://127.0.0.1:1';
process.env.SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_ANON_KEY='offline-evidence-only';
globalThis.fetch=async()=>{throw Error('Network IO forbidden during frozen-authority replay');};
const {materializeAssistedSnapshotOccupations}=await import('../../server/assistedProposalService');
const [directory,destination]=process.argv.slice(2);
const read=(file:string)=>JSON.parse(readFileSync(resolve(directory,file),'utf8'));
const report=['setup','explicit'].map(label=>{
 const input=read(`${label}-input.json`),adapter=adaptEngineInputToPlannerNextProblem(input);
 assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('Unsupported frozen input');
 const scope=createPlanningScope({kind:'DAY',value:'replay'},{},adapter.problem.tasks.map(task=>task.id));
 const result=executeAssistedPlanning(buildAssistedProblem(adapter.problem,scope,[]));
 assert.equal(result.evidence.completeForScope,true);
 assert.equal(result.evidence.fingerprint,read(`${label}-replay.json`).a.evidence.fingerprint);
 assert.deepEqual(result.proposal,read(`${label}-replay.json`).a.proposal);
 const stage=read(`${label}-stage.json`);
 const occupations=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,stage.activeStage.snapshotJson);
 const validation=validatePlan(adapter.problem,occupations.protectedPlacements,occupations.protectedSetupPreparations);
 assert.equal(validation.hardValid,true);
 return {label,problem:adapter.problem,sourceFingerprint:adapter.sourceFingerprint,problemFingerprint:adapter.problemFingerprint,
  identityMapFingerprint:adapter.identityMapFingerprint,stage:stage.activeStage.snapshotJson,stageFingerprint:stage.activeStage.snapshotFingerprint,
  proposal:result.proposal,proposalFingerprint:result.evidence.fingerprint,work:result.evidence.work,
  preparations:result.evidence.selectedSetupPreparations,certificates:result.evidence.futureStructuralWitnesses,validation};
});
writeFileSync(destination,JSON.stringify({status:'PASS',frozenInputDirectory:directory,days:report},null,2));
console.log(JSON.stringify({status:'PASS',obligations:report.map(day=>day.proposal!.length)}));
