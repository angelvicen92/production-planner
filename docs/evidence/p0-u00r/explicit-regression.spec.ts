/** Existing explicit REQUIRED contracts replayed literally from U00q. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {executeAssistedPlanning as execute} from '../../../engine/planner-next/assistedPlanning';
const receipts=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u00q/native/receipts.json.gz')).toString());
const timings=new Set(['futureItinerantOperationalMealsMs','futureItinerantParticipantFutureMs','futureItinerantParticipantMealsMs','futureItinerantPrerequisiteSearchMs','futureItinerantPriorRevalidationMs','futureItinerantStructuralSearchMs','futureItinerantTechnicalFutureMs']);
const semantic=(v:unknown)=>JSON.parse(JSON.stringify(v,(key,value)=>timings.has(key)?undefined:value));
for(const label of ['A','B'])for(const mode of ['explicit-solver','relaxed-solver','explicit-protected-prefix'])test(`${label} ${mode}: unchanged policy, placements, branch counters and fingerprint`,()=>{
 const c=receipts[`${label}-${mode}.json`];assert.deepEqual(semantic(execute(c.problem)),semantic(c.result));
});
