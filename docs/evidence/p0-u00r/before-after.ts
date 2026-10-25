/** Same native U00q input and protected placements, replayed against base/candidate. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,executeAssistedPlanning as execute} from '../../../engine/planner-next/assistedPlanning';
import {resolveAssistedScope} from '../../../server/assistedScopeResolver';
import {getTechnicalChains} from '../../../engine/planner-next/technicalChains';
const receipts=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u00q/native/receipts.json.gz')).toString());
const before=process.argv.includes('--before'),out:unknown[]=[];
for(const label of ['A','B'])for(const count of [1,2]){
 const input=receipts[label+'-native-input.json'],ids=receipts[label+'-created.json'].tasks.slice(count,3).map((t:any)=>t.id);
 const a=adapt(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('unsupported');
 const anchors=receipts[label+'-native-solver.json'].result.proposal.slice(0,count);
 const scoped=buildAssistedProblem(a.problem,resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:ids}).scope,anchors);
 const result=execute(scoped),pending=scoped.problem.tasks.filter(t=>!anchors.some((p:any)=>p.id===t.id));
 out.push({label,count,scoped,pendingOnlyChains:getTechnicalChains(pending).map(c=>c.map(t=>t.id)),effectiveChains:getTechnicalChains(scoped.problem.tasks).map(c=>c.map(t=>t.id)),result});
 if(before){assert.equal(result.proposal,null);assert.ok(result.evidence.reasonCodes.some(c=>c.includes('UNSUPPORTED_STANDALONE_TASK_KIND')));assert.equal(result.evidence.work?.branchesExplored??0,0);}
 else {assert.ok(result.proposal);assert.equal(result.evidence.hardValid,true);assert.equal(result.evidence.protectedPlacementsPreserved,true);}
}
writeFileSync(process.argv[2],JSON.stringify(out,null,2));
