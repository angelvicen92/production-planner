/** Preserve the exact unsatisfied native B criterion rather than calling S0 a proposal. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {resolveAssistedScope} from '../../../server/assistedScopeResolver';
import {buildAssistedProblem,executeAssistedPlanning as execute} from '../../../engine/planner-next/assistedPlanning';
import {createManualDeltaValidationHarness} from '../../../server/assistedProposalService';
const r=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u00r/checks/literal-b-blocker.json.gz')).toString());
const input=r['B-native-input.json'],created=r['B-created.json'],a=adapt(input);
assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('unsupported');
test('root-only native scope is still unsupported and is not misrepresented as a successful first proposal',()=>{
 const result=execute(buildAssistedProblem(a.problem,resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:[created.tasks[0].id]}).scope,[]));
 assert.equal(result.proposal,null);assert.ok(result.evidence.reasonCodes.some(c=>c.includes('UNSUPPORTED_STANDALONE_TASK_KIND')));assert.equal(result.evidence.work.branchesExplored,0);
});
test('native manual trim response remains reproducible without changing validation or revision',()=>{
 const row=r['B-human-prefix-edit.json'];const draft=row.draft;
 assert.equal(draft.tasks.filter((t:any)=>t.startPlanned).length,1);
 const result=createManualDeltaValidationHarness(a.problem,a.identityMap)(input,draft,created.tasks.slice(0,3).map((t:any)=>t.id));
 assert.equal(result.completeForScope,false);assert.equal(result.hardValid,false);assert.ok(result.validationSummary.reasonCodes.includes('TECHNICAL_CHAIN_VIOLATION'));
 assert.equal(r['validation-http-response'].status,422);assert.equal(r['validation-http-response'].body.code,'ASSISTED_DELTA_VALIDATION_UNSUPPORTED');
});
