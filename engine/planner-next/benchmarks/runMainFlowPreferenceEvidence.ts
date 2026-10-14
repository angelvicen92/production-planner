/** Cold A2 replay through the typed product input. In-memory tables only;
 * native SQL/Auth/HTTP/UI is certified separately by smokeA2Integration.
 * Usage: node --import tsx engine/planner-next/benchmarks/runMainFlowPreferenceEvidence.ts 4:2 work/main-preference
 * Modes: AUTO, N (SOFT count), N:B (SOFT count with B before, N-B after).
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {mainFlowPreferenceSchema,mainFlowPreferenceColumns,autoMainFlowPreference} from '../../../shared/mainFlowPreference';

process.env.SUPABASE_URL='http://127.0.0.1:1';
process.env.SUPABASE_ANON_KEY='local-fixture-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY='local-fixture-service';
const label=process.argv[2]??'AUTO',directory=resolve(process.argv[3]??'work/main-flow-preference');
if(!/^(AUTO|[1-9]\d*(?::\d+)?)$/.test(label))throw Error('Use AUTO, N or N:B');
const [count,before]=label.split(':').map(Number);
const preference=label==='AUTO'?autoMainFlowPreference:mainFlowPreferenceSchema.parse({
 blockCountPolicy:{mode:'SOFT_PREFER_N',count},mealSplitPreference:before===undefined?{mode:'OFF'}
  :{mode:'PREFERRED',beforeMealBlocks:before,afterMealBlocks:count!-before},
});
const [{buildEngineInput},{buildA2ImportRows},{a2HistoricalCatalog},{a2ImportStorageFixture},
 {adaptEngineInputToPlannerNextProblem},{resolveAssistedScope,analyticalFutureEligibleTaskIds},
 {buildAssistedProblem,executeAssistedPlanning},{validatePlan},{materializeScheduledItinerantUnitMeals},
 {effectiveMainBlockCount}]=await Promise.all([
 import('../../buildInput'),import('../../../script/demo/a2ImportRows'),import('../../../script/demo/a2HistoricalCatalog'),
 import('../../../script/demo/a2ImportStorageFixture'),import('../integration/engineInputAdapter'),
 import('../../../server/assistedScopeResolver'),import('../assistedPlanning'),import('../validate'),
 import('../itinerantUnitMeals'),import('../exactItinerantPlan'),
]);
const dataset=buildA2ImportRows('2026-10-30',100000,{historicalCatalog:a2HistoricalCatalog,planId:27002});
const fixture=a2ImportStorageFixture(dataset);
Object.assign(fixture.tables.plans[0],mainFlowPreferenceColumns(preference));
const input=await buildEngineInput(dataset.input.planId,fixture.storage);
const adapter=adaptEngineInputToPlannerNextProblem(input);assert.equal(adapter.status,'SUPPORTED');
if(adapter.status!=='SUPPORTED')throw Error('Unsupported A2 input');
if(preference.blockCountPolicy.mode==='SOFT_PREFER_N')assert.equal(adapter.problem.mainFlow.preferredBlockCount,preference.blockCountPolicy.count);
const scope=resolveAssistedScope(input,adapter,{kind:'SPACE',spaceId:input.plannerNext!.mainFlow.spaceId});
const assisted=buildAssistedProblem(adapter.problem,scope.scope,[],analyticalFutureEligibleTaskIds(input,adapter.identityMap),[],[],[],[],[]);
const immutable=JSON.stringify(assisted),started=performance.now(),result=executeAssistedPlanning(assisted),elapsedMs=performance.now()-started;
assert.equal(JSON.stringify(assisted),immutable);
const witness=result.evidence.futureStructuralWitnesses?.find(w=>w.kind==='JOINT_COMPLETION');
const validation=witness?.kind==='JOINT_COMPLETION'?validatePlan(adapter.problem,[...witness.tasks],[...witness.preparations],
 [...witness.spaceMeals],[...witness.participantMeals],[],materializeScheduledItinerantUnitMeals(adapter.problem),[...witness.roundPreparations],[...witness.operationalMeals]):null;
const summary={mode:'COLD_TYPED_PRODUCT_INPUT_FIXTURE',remoteWrites:0,preference,elapsedMs,
 inputFingerprint:createHash('sha256').update(JSON.stringify(input)).digest('hex'),budgets:assisted.problem.budget,
 blocks:witness?effectiveMainBlockCount(witness.tasks):null,completedObligations:witness?witness.tasks.length+witness.participantMeals.length:0,
 validation,witnessFingerprint:witness?.fingerprint??null,work:result.evidence.work,mainFlowSoftPreference:result.evidence.mainFlowSoftPreference??null};
mkdirSync(directory,{recursive:true});
const safeLabel=label.replace(':','-');
// Persist the observed outcome before gate assertions, including exhaustion.
writeFileSync(`${directory}/a2-${safeLabel}-result.json`,JSON.stringify(result,null,2));
writeFileSync(`${directory}/a2-${safeLabel}-summary.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
assert.equal(summary.completedObligations,266);assert.equal(validation?.hardValid,true);assert.deepEqual(validation?.violations,[]);
assert.equal(summary.blocks,label==='AUTO'?2:count);
if(preference.mealSplitPreference.mode==='PREFERRED')assert.equal(summary.mainFlowSoftPreference?.mealSplitPreferenceAchieved,true);
