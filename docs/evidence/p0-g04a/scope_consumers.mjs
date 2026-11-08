/** Post-hoc read-only check of both peer selectors and the existing certificate. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter.ts';
import {resolveAssistedScope} from '../../../server/assistedScopeResolver.ts';
import {certifyDailyTechnicalChain} from '../../../server/technicalChainCertificate.ts';
for(const directory of process.argv.slice(2)){
 const input=JSON.parse(readFileSync(directory+'/input.json','utf8')),run=JSON.parse(readFileSync(directory+'/run.json','utf8'));
 const a=adapt(input);assert.equal(a.status,'SUPPORTED');
 const scopes=input.dailyJointGroups[0].taskIds.map(id=>resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:[id]}));
 assert.deepEqual(scopes[0],scopes[1]);
 const certificate=certifyDailyTechnicalChain(a.problem,run.proposal,0,run.evidence.nominalPhysicalFutureWitness);
 assert.equal(certificate.status,'WITNESS');assert.equal(certificate.consumed,0);
 assert.equal(certificate.tasks.length,8);
 writeFileSync(directory+'/scope-consumers.json',JSON.stringify({status:'PASS',bothPeersLiteral:true,scopes,certificate,memoryOnly:true,stages:0},null,2));
}
