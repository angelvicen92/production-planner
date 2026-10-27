import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {inspect} from '../p0-u00y/consumer';
import {withDailyOperationalMeals} from '../../../server/operationalMealPolicy';
const receipts=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u00y/native/receipts.json.gz')).toString());
const input=structuredClone(receipts['B-ordinary-input.json']);input.tasks=input.tasks.filter((t:any)=>['main','vocal'].includes(t.plannerNextKind));
input.contestantAvailabilityById[3]={start:'10:00',end:'10:30'};input.contestantAvailabilityById[4]={start:'11:00',end:'12:30'};
input.coachResourceIds=[4,6];input.vocalCoachPlanResourceItemIdByContestantId[3]=4;for(const task of input.tasks)if(task.contestantId===3)task.declaredResourceIds=[4];
const next=withDailyOperationalMeals(input,{contractVersion:1,policies:[{id:'main-availability',window:{start:'10:20',end:'11:15'},durationMinutes:45,planResourceItemIds:[],spaceIds:[8]}]});
const results={full:inspect(next),partial:inspect(next,[9],[],true)};
writeFileSync(process.argv[2],JSON.stringify({input:next,results},null,2));
for(const result of Object.values(results)){assert.ok(result.result?.proposal,result.result?.evidence.reasonCodes.join(','));assert.ok(result.result.evidence.hardValid);}
console.log('PASS Main/Vocal: a flexible operational pause bridges required Main continuity; partial scope retains the global witness');
